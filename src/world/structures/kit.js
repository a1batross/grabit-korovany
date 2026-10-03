// Building kit: a tiny procedural "modelling" toolkit for the world builder.
// Everything static is accumulated into per-chunk / per-material batches and merged at the end,
// so the whole world costs a handful of draw calls per 64x64 chunk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { game } from '../../core/game.js';
import { mulberry32 } from '../../core/rng.js';
import { heightAt } from '../terrain.js';
import { addTreeExclusion } from '../trees.js';
import { addBox, addCircle } from '../colliders.js';

// debug info for automated tests (walk paths over stairs etc.)
export const debug = { paths: {} };

export const rng = mulberry32(20240607);
export const rr = (a = 0, b = 1) => a + rng() * (b - a);
export const ri = (a, b) => Math.floor(rr(a, b + 1));
export const rpick = arr => arr[Math.floor(rng() * arr.length)];

// ---------- tree / prop exclusions ----------
export const exclusions = [];
export function exclude(x, z, r) { exclusions.push({ x, z, r }); addTreeExclusion(x, z, r); }
export function isExcluded(x, z, pad = 0) {
  for (const e of exclusions) { const r = e.r + pad; if ((x - e.x) ** 2 + (z - e.z) ** 2 < r * r) return true; }
  return false;
}

// ---------- materials ----------
let MATS = null;
export function mats() {
  if (MATS) return MATS;
  MATS = {
    std: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    cloth: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    glow: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color('#ffb257'), emissiveIntensity: 0 }),
    fire: new THREE.MeshBasicMaterial({ vertexColors: true }),
    sign: new THREE.MeshLambertMaterial({ map: signAtlas().tex }),
  };
  return MATS;
}

// ---------- batches ----------
const CHUNK = 64;
const batches = new Map(); // key -> { mat, cx, cz, geos: [] }
const _c = new THREE.Color();
let stats = { prims: 0 };

function pushGeo(geo, matKey, color, jitter, ao) {
  // geo is already in world space, non-indexed, with a 'ao' hint in userData (local y 0..1 per vertex)
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  const s = 1 + (rng() - 0.5) * 2 * jitter;
  const aoY = geo.userData.aoY;
  for (let k = 0; k < n; k++) {
    const f = s * (aoY ? 1 - ao * (1 - aoY[k]) : 1);
    col[k * 3] = _c.r * f; col[k * 3 + 1] = _c.g * f; col[k * 3 + 2] = _c.b * f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (matKey !== 'sign') geo.deleteAttribute('uv');
  else if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  geo.userData = {};
  // chunk by bounding box centre
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = Math.floor((bb.min.x + bb.max.x) / 2 / CHUNK), cz = Math.floor((bb.min.z + bb.max.z) / 2 / CHUNK);
  const key = `${cx},${cz},${matKey}`;
  let b = batches.get(key);
  if (!b) { b = { mat: matKey, geos: [] }; batches.set(key, b); }
  b.geos.push(geo);
  stats.prims++;
}

// Prepare a primitive geometry (bottom at y=0 for 'bottom' pivot) and record per-vertex normalised height for fake AO.
function prep(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  geo !== g && geo.dispose();
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const h = max.y - min.y || 1;
  const pos = g.attributes.position;
  const aoY = new Float32Array(pos.count);
  for (let k = 0; k < pos.count; k++) aoY[k] = (pos.getY(k) - min.y) / h;
  g.userData.aoY = aoY;
  return g;
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// A local coordinate frame (position + yaw). Forward (+Z local) = (sin yaw, cos yaw) in world.
export class Frame {
  constructor(x = 0, y = 0, z = 0, yaw = 0) {
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.cos = Math.cos(yaw); this.sin = Math.sin(yaw);
    this.m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  }
  // local (x,z) -> world {x,z}
  w(lx, lz) { return { x: this.x + lx * this.cos + lz * this.sin, z: this.z - lx * this.sin + lz * this.cos }; }
  wy(ly) { return this.y + ly; }
  sub(lx, ly, lz, yaw = 0) { const p = this.w(lx, lz); return new Frame(p.x, this.y + ly, p.z, this.yaw + yaw); }
  // world yaw of a local direction yaw
  wyaw(ly = 0) { return this.yaw + ly; }
  // terrain height at local point
  ground(lx, lz) { const p = this.w(lx, lz); return heightAt(p.x, p.z); }

  // Place a prepared primitive. (x,y,z) = pivot in local space; o.rx/ry/rz rotations about the pivot.
  put(geo, x, y, z, color, o = {}) {
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.order ?? 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _m.compose(_p, _q, _s);
    _m2.multiplyMatrices(this.m, _m);
    geo.applyMatrix4(_m2);
    pushGeo(geo, o.mat ?? 'std', color, o.j ?? 0.05, o.ao ?? 0.18);
    return geo;
  }
  // box: w (x), h (y), d (z). Pivot at bottom centre unless o.center.
  box(x, y, z, w, h, d, color, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, o.center ? 0 : h / 2, 0);
    return this.put(prep(g), x, y, z, color, o);
  }
  cyl(x, y, z, rt, rb, h, color, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 8, 1, !!o.open);
    g.translate(0, o.center ? 0 : h / 2, 0);
    return this.put(prep(g), x, y, z, color, o);
  }
  cone(x, y, z, r, h, color, o = {}) {
    const g = new THREE.ConeGeometry(r, h, o.seg ?? 8);
    g.translate(0, h / 2, 0);
    if (o.ao == null) o = { ...o, ao: 0.05 };
    return this.put(prep(g), x, y, z, color, o);
  }
  sphere(x, y, z, r, color, o = {}) {
    const g = new THREE.IcosahedronGeometry(r, o.detail ?? 0);
    if (o.sy) g.scale(1, o.sy, 1);
    if (o.ao == null) o = { ...o, ao: 0.05 };
    return this.put(prep(g), x, y, z, color, o);
  }
  // triangular prism (gable): width w along x, height h (apex), depth d along z; pivot bottom centre
  prism(x, y, z, w, h, d, color, o = {}) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    if (o.ao == null) o = { ...o, ao: 0.08 };
    return this.put(prep(g), x, y, z, color, o);
  }
  // Gable roof made of two slabs over a box of size w (x) x d (z) whose wall tops are at y. Ridge along z.
  gableRoof(x, y, z, w, d, h, color, o = {}) {
    if (o.alongX) return this.sub(x, 0, z, Math.PI / 2).gableRoof(0, y, 0, d, w, h, color, { ...o, alongX: false });
    const ov = o.overhang ?? 0.6, t = o.thick ?? 0.25;
    const half = w / 2 + ov;
    const ang = Math.atan2(h, w / 2);
    const len = half / Math.cos(ang);
    for (const s of [-1, 1]) {
      const cx = x + s * (half / 2), cy = y + h - (half / 2) * Math.tan(ang) + t / 2;
      this.box(cx, cy, z, len + 0.1, t, d + ov * 2, color, { center: true, rz: -s * ang, ao: 0, j: o.j ?? 0.05, mat: o.mat });
    }
    // gable ends
    if (o.gable !== false) this.prism(x, y, z, w, h, d - 0.05, o.gableColor ?? o.wallColor ?? color, { mat: o.gableMat });
    if (o.ridge) this.box(x, y + h + t * 0.6, z, 0.35, 0.3, d + ov * 2 + 0.1, o.ridge, { center: true });
  }
  // Hip/pyramid roof (4-sided cone) over w x d footprint at height y
  hipRoof(x, y, z, w, d, h, color, o = {}) {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    g.translate(0, 0.5, 0);
    g.scale(w + (o.overhang ?? 0.8) * 2, h, d + (o.overhang ?? 0.8) * 2);
    return this.put(prep(g), x, y, z, color, { ao: 0.05, ...o });
  }
  // flat textured plane with sign text (uses the atlas). w x h, facing local +z (or o.ry)
  signPlane(x, y, z, w, h, cell, o = {}) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, cell.u0 + uv.getX(k) * (cell.u1 - cell.u0), cell.v0 + uv.getY(k) * (cell.v1 - cell.v0));
    const gg = prep(g);
    return this.put(gg, x, y, z, '#ffffff', { ...o, mat: 'sign', j: 0, ao: 0 });
  }
  // A wooden board sign with text on both faces
  sign(x, y, z, text, w = 2.2, h = 0.6, o = {}) {
    const cell = signCell(text, o.style);
    this.box(x, y, z, w + 0.12, h + 0.12, 0.1, o.board ?? '#5a3e24', { center: true, ry: o.ry ?? 0 });
    const ry = o.ry ?? 0;
    const dx = Math.sin(ry) * 0.056, dz = Math.cos(ry) * 0.056;
    this.signPlane(x + dx, y, z + dz, w, h, cell, { ry });
    if (o.back !== false) this.signPlane(x - dx, y, z - dz, w, h, cell, { ry: ry + Math.PI });
  }

  // ----- colliders (sizes are FULL sizes; top/bottom relative to frame y) -----
  solid(x, z, w, d, top, o = {}) {
    const p = this.w(x, z);
    return addBox(p.x, p.z, w / 2, d / 2, this.yaw + (o.rot ?? 0), this.y + top, !!o.walkable, o.bottom != null ? this.y + o.bottom : -1e9);
  }
  floor(x, z, w, d, top, o = {}) { return this.solid(x, z, w, d, top, { ...o, walkable: true }); }
  post(x, z, r, top = 1e9) { const p = this.w(x, z); return addCircle(p.x, p.z, r, top === 1e9 ? 1e9 : this.y + top); }
  exclude(x, z, r) { const p = this.w(x, z); exclude(p.x, p.z, r); }
  // world-space place descriptor at local point facing local yaw
  place(x, z, ly = 0, extra = {}) { const p = this.w(x, z); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +(this.yaw + ly).toFixed(3), ...extra }; }
}

// Min / max terrain height under a local rectangle
export function groundRange(f, x, z, w, d) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const h = f.ground(x - w / 2 + (w * i) / 4, z - d / 2 + (d * j) / 4);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return { lo, hi };
}

// Stairs going from local (x,z) in local direction `dir` (yaw), rising from y0 to y1 (relative to frame).
// Every step is a walkable collider. Returns end point (local).
export function stairs(f, x, z, dir, width, y0, y1, color, o = {}) {
  const rise = o.rise ?? 0.3, run = o.run ?? 0.55;
  const n = Math.max(1, Math.ceil((y1 - y0) / rise));
  const r = (y1 - y0) / n;
  const sx = Math.sin(dir), sz = Math.cos(dir);
  for (let i = 0; i < n; i++) {
    const cx = x + sx * (i + 0.5) * run, cz = z + sz * (i + 0.5) * run;
    const top = y0 + r * (i + 1);
    const bottom = o.solidBelow === false ? top - 0.35 : (o.base ?? y0) - 1;
    f.box(cx, bottom, cz, width, top - bottom, run + 0.02, color, { ry: dir, ao: 0.1 });
    f.solid(cx, cz, width, run, top, { rot: dir, walkable: true });
  }
  return { x: x + sx * n * run, z: z + sz * n * run };
}

// ---------- sign atlas (CanvasTexture with Russian text) ----------
let ATLAS = null;
const CW = 512, CH = 128, COLS = 4, ROWS = 24;
function signAtlas() {
  if (ATLAS) return ATLAS;
  const canvas = document.createElement('canvas');
  canvas.width = CW * COLS; canvas.height = CH * ROWS;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  ATLAS = { canvas, ctx, tex, n: 0, cache: new Map() };
  return ATLAS;
}
export function signCell(text, style = 'wood') {
  const A = signAtlas();
  const key = style + '|' + text;
  if (A.cache.has(key)) return A.cache.get(key);
  const i = A.n++ % (COLS * ROWS);
  const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
  const ctx = A.ctx;
  const S = {
    wood: { bg: '#8a6238', bg2: '#6e4a28', fg: '#2a1608', edge: '#3a2412' },
    dark: { bg: '#2a2230', bg2: '#1a1420', fg: '#c79bff', edge: '#0a060c' },
    red: { bg: '#8e1f22', bg2: '#6a1416', fg: '#f5d36a', edge: '#3a0a0a' },
    green: { bg: '#3d6a32', bg2: '#2c5024', fg: '#f0f0c8', edge: '#1a3014' },
    stone: { bg: '#9a968c', bg2: '#83807a', fg: '#2a2a2a', edge: '#55524c' },
  }[style];
  ctx.fillStyle = S.bg; ctx.fillRect(cx, cy, CW, CH);
  // wood grain / planks
  ctx.fillStyle = S.bg2;
  for (let k = 0; k < 7; k++) ctx.fillRect(cx, cy + 6 + k * 18 + Math.random() * 6, CW, 2 + Math.random() * 2);
  ctx.strokeStyle = S.edge; ctx.lineWidth = 8; ctx.strokeRect(cx + 4, cy + 4, CW - 8, CH - 8);
  ctx.fillStyle = S.fg;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 64;
  const lines = text.split('\n');
  const font = s => `bold ${s}px "Georgia", "Times New Roman", "DejaVu Serif", serif`;
  ctx.font = font(size);
  while (size > 18 && (Math.max(...lines.map(l => ctx.measureText(l).width)) > CW - 40 || lines.length * size * 1.05 > CH - 20)) { size -= 2; ctx.font = font(size); }
  lines.forEach((l, k) => ctx.fillText(l, cx + CW / 2, cy + CH / 2 + (k - (lines.length - 1) / 2) * size * 1.05 + 2));
  A.tex.needsUpdate = true;
  const W = CW * COLS, H = CH * ROWS;
  const cell = { u0: (cx + 4) / W, u1: (cx + CW - 4) / W, v0: 1 - (cy + CH - 4) / H, v1: 1 - (cy + 4) / H };
  A.cache.set(key, cell);
  return cell;
}

// ---------- lights (torch glow sprites, additive, one draw call) ----------
export const glowPoints = []; // [x,y,z,size,r,g,b]
export function addGlow(x, y, z, size = 3, color = '#ffb050') { _c.set(color); glowPoints.push(x, y, z, size, _c.r, _c.g, _c.b); }

// Torch on a wall/post at local point: bracket + flame + glow
export function torch(f, x, y, z, o = {}) {
  f.cyl(x, y, z, 0.07, 0.05, 0.7, '#3a2a1a', { seg: 5 });
  f.cyl(x, y + 0.6, z, 0.13, 0.08, 0.16, '#2a2a2a', { seg: 6 });
  f.cone(x, y + 0.72, z, 0.12, 0.38, '#ffb238', { mat: 'fire', seg: 5 });
  f.cone(x, y + 0.74, z, 0.06, 0.22, '#fff0b0', { mat: 'fire', seg: 4 });
  const p = f.w(x, z);
  addGlow(p.x, f.y + y + 0.85, p.z, o.size ?? 3.2, o.color ?? '#ffa040');
}
// Lantern on a pole
export function lantern(f, x, z, h = 2.6, o = {}) {
  const y = o.y ?? 0;
  f.cyl(x, y, z, 0.07, 0.09, h, o.pole ?? '#4a3420', { seg: 5 });
  f.box(x + 0.25, y + h - 0.12, z, 0.6, 0.08, 0.08, o.pole ?? '#4a3420');
  f.box(x + 0.5, y + h - 0.65, z, 0.26, 0.36, 0.26, o.light ?? '#ffd27a', { mat: 'fire' });
  f.cone(x + 0.5, y + h - 0.3, z, 0.24, 0.2, '#2a2a2a', { seg: 4 });
  const p = f.w(x + 0.5, z);
  addGlow(p.x, f.y + y + h - 0.45, p.z, o.size ?? 3, o.glow ?? '#ffc060');
  f.post(x, z, 0.15, y + h);
}

// Campfire: stone ring, logs, flames
export function campfire(f, x, z, o = {}) {
  const y = o.y ?? f.ground(x, z) - f.y;
  const r = o.r ?? 0.9;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    f.sphere(x + Math.cos(a) * r, y + 0.05, z + Math.sin(a) * r, 0.26, o.stone ?? '#6d6a66', { sy: 0.7 });
  }
  for (let i = 0; i < 4; i++) f.cyl(x, y + 0.15, z, 0.09, 0.09, 1.3, '#3a2616', { center: true, rz: Math.PI / 2 - 0.35, ry: (i / 4) * Math.PI, seg: 5 });
  f.cone(x, y + 0.1, z, 0.55, 1.1, o.flame ?? '#ff8a2a', { mat: 'fire', seg: 6 });
  f.cone(x + 0.15, y + 0.1, z - 0.1, 0.3, 0.8, '#ffd060', { mat: 'fire', seg: 5 });
  const p = f.w(x, z);
  addGlow(p.x, f.y + y + 0.9, p.z, o.size ?? 7, o.glow ?? '#ff9a40');
  fireSpots.push({ x: p.x, y: f.y + y, z: p.z });
  f.post(x, z, r * 0.8, y + 0.6);
}
export const fireSpots = [];

// Banner hanging from a pole/wall: cloth with a simple emblem stripe
export function banner(f, x, y, z, w, h, color, trim, o = {}) {
  const ry = o.ry ?? 0;
  f.box(x, y, z, w + 0.3, 0.12, 0.12, '#5a3e24', { center: true, ry });
  f.box(x, y - h / 2 - 0.06, z, w, h, 0.04, color, { center: true, ry, mat: 'cloth', ao: 0 });
  // trim and emblem
  const off = 0.035, dx = Math.sin(ry) * off, dz = Math.cos(ry) * off;
  for (const s of [1, -1]) {
    f.box(x + dx * s, y - h + 0.15, z + dz * s, w, 0.18, 0.02, trim, { center: true, ry, mat: 'cloth', ao: 0 });
    if (o.emblem !== false) f.box(x + dx * s, y - h * 0.45, z + dz * s, w * 0.38, w * 0.38, 0.02, trim, { center: true, ry, rz: Math.PI / 4, mat: 'cloth', ao: 0 });
  }
  // swallow-tail point
  f.prism(x, y - h - 0.06, z, w, -0.6, 0.04, color, { ry, mat: 'cloth' });
}
// Flag on a tall pole
export function flagPole(f, x, z, h, color, trim, o = {}) {
  const y = o.y ?? 0;
  f.cyl(x, y, z, 0.08, 0.12, h, '#4a3a2a', { seg: 6 });
  f.sphere(x, y + h, z, 0.18, trim, { detail: 0 });
  f.box(x + 1.2, y + h - 1.1, z, 2.3, 1.4, 0.04, color, { center: true, mat: 'cloth', ao: 0, ry: o.ry ?? 0 });
  f.box(x + 1.2, y + h - 1.1, z, 0.6, 0.6, 0.06, trim, { center: true, mat: 'cloth', ao: 0, rz: Math.PI / 4 });
  f.post(x, z, 0.15, y + h);
}

// ---------- finalize ----------
export function finalizeBatches() {
  const M = mats();
  let meshes = 0, tris = 0;
  for (const [key, b] of batches) {
    if (!b.geos.length) continue;
    const geo = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!geo) { console.warn('merge failed', key); continue; }
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, M[b.mat]);
    mesh.name = 'struct:' + key;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    mesh.castShadow = b.mat === 'std' || b.mat === 'cloth';
    game.scene.add(mesh);
    meshes++; tris += geo.attributes.position.count / 3;
  }
  batches.clear();

  // glow sprites
  if (glowPoints.length) {
    const n = glowPoints.length / 7;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set(glowPoints.slice(i * 7, i * 7 + 3), i * 3);
      size[i] = glowPoints[i * 7 + 3];
      col.set(glowPoints.slice(i * 7 + 4, i * 7 + 7), i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { night: { value: 1 }, scale: { value: 600 }, time: { value: 0 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; varying float vF; uniform float scale; uniform float time;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          float fl = 0.88 + 0.12 * sin(time * 9.0 + position.x * 3.1 + position.z * 1.7);
          gl_PointSize = size * fl * scale / -mv.z; vF = smoothstep(500.0, 120.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float night; varying vec3 vC; varying float vF;
        void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); a = a * a;
          gl_FragColor = vec4(vC * a * (0.25 + 0.75 * night) * vF, 1.0); }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false; pts.name = 'struct:glows'; pts.renderOrder = 5;
    game.scene.add(pts);
    MATS.glowPts = mat;
  }
  console.log(`[buildings] ${stats.prims} primitives -> ${meshes} meshes, ${Math.round(tris)} tris, ${glowPoints.length / 7} glow sprites (1 Points draw call, NOT PointLights)`);
  return { meshes, tris };
}

// Day/night: lit windows and stronger torch glow at night
export function nightSystem() {
  const M = mats();
  game.addSystem({
    name: 'buildings-night', order: 96, alwaysRun: true,
    update() {
      const amb = game.ambientLevel ?? 1;
      const night = Math.min(1, Math.max(0, (0.75 - amb) / 0.45));
      M.glow.emissiveIntensity = 0.05 + night * 1.1;
      if (M.glowPts) {
        M.glowPts.uniforms.night.value = night;
        M.glowPts.uniforms.time.value = game.time;
        M.glowPts.uniforms.scale.value = game.renderer.domElement.height * 0.8;
      }
    },
  });
}

// Terrain-draped ribbon (paths, paving, field strips). points: world [[x,z],...]
export function drape(points, width, color, o = {}) {
  const step = o.step ?? 2, off = o.off ?? 0.06;
  const pts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let s = 0; s < n; s++) pts.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n]);
  }
  pts.push(points[points.length - 1]);
  const pos = [];
  const hy = (x, z) => (o.flatY != null ? o.flatY : heightAt(x, z)) + off;
  let prevL = null, prevR = null;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)], [px, pz] = pts[Math.max(i - 1, 0)];
    let dx = nx - px, dz = nz - pz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const hw = width / 2;
    const L = [x - dz * hw, z + dx * hw], R = [x + dz * hw, z - dx * hw];
    const Ly = hy(L[0], L[1]), Ry = hy(R[0], R[1]);
    const cur = [[L[0], Ly, L[1]], [R[0], Ry, R[1]]];
    if (prevL) {
      const a = prevL, b = prevR, c = cur[0], d = cur[1];
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    prevL = cur[0]; prevR = cur[1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // fix winding: ensure normals point up
  if (g.attributes.normal.getY(0) < 0) {
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k += 3) { for (let c = 0; c < 3; c++) { const t = p.getComponent(k + 1, c); p.setComponent(k + 1, c, p.getComponent(k + 2, c)); p.setComponent(k + 2, c, t); } }
    g.computeVertexNormals();
  }
  pushGeo(g, o.mat ?? 'std', color, o.j ?? 0.03, 0);
}

// Wall parapet (merlons) along local line a->b at height y (frame-relative); collider strip.
export function parapet(f, ax, az, bx, bz, y, o = {}) {
  const L = Math.hypot(bx - ax, bz - az);
  const dir = Math.atan2(bx - ax, bz - az);
  const mh = o.h ?? 1.3, mw = o.mw ?? 1.0, sp = o.sp ?? 2.0, t = o.t ?? 0.6;
  const color = o.color ?? '#b9b2a2';
  // low continuous base
  const cx = (ax + bx) / 2, cz = (az + bz) / 2;
  f.box(cx, y, cz, t, o.base ?? 0.6, L, color, { ry: dir, ao: 0.1 });
  const n = Math.max(1, Math.floor(L / sp));
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.5) / n;
    if (o.broken && rng() < o.broken) continue;
    const hh = mh * (o.ragged ? rr(0.5, 1.2) : 1);
    f.box(ax + (bx - ax) * t0, y, az + (bz - az) * t0, t + 0.04, hh, mw, color, { ry: dir, ao: 0.15 });
  }
  if (o.collide !== false) f.solid(cx, cz, t, L, y + 1.0, { rot: dir, bottom: y - 0.3 }); // only blocks at wall-walk level (gate passages stay open)
}

// Thick stone wall segment between local points with a walkable top and outer parapet.
// o.out = +1/-1 (which side, relative to direction a->b, is "outside": +1 = right-hand side)
export function wallSeg(f, ax, az, bx, bz, o = {}) {
  const h = o.h ?? 7, t = o.t ?? 3, base = o.base ?? -3;
  const L = Math.hypot(bx - ax, bz - az);
  const dir = Math.atan2(bx - ax, bz - az);
  const cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const col = o.color ?? '#c2baa8';
  f.box(cx, base, cz, t, h - base, L, col, { ry: dir, ao: 0.25 });
  // plinth & cornice
  f.box(cx, base, cz, t + 0.5, -base + 1.0, L, o.plinth ?? '#8f8878', { ry: dir, ao: 0.2 });
  f.box(cx, h - 0.4, cz, t + 0.35, 0.4, L + 0.01, o.cornice ?? '#a59e8e', { ry: dir, ao: 0 });
  // walk surface
  f.box(cx, h - 0.02, cz, t - 0.1, 0.06, L, o.walkColor ?? '#9a8c72', { ry: dir, ao: 0 });
  f.solid(cx, cz, t, L, h, { rot: dir, walkable: o.walk !== false });
  if (o.parapet !== false) {
    // right-hand perpendicular of direction (sin,cos) in frame-local = (cos, -sin)
    const px = Math.cos(dir) * (o.out ?? 1), pz = -Math.sin(dir) * (o.out ?? 1);
    const off = t / 2 - 0.3;
    parapet(f, ax + px * off, az + pz * off, bx + px * off, bz + pz * off, h, { color: o.merlon ?? col, ...o.parapetOpts });
  }
}
