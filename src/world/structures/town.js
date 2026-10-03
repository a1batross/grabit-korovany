// ZONE 1 — the neutral human town "Слобода": market square with stalls and a well, tavern, smithy (weapons),
// general store, healer & prosthetist, an onion-domed church, many houses (izbas & plastered), fences and gardens,
// plus farms with fields and a windmill around LOC.eastFarm.
import * as THREE from 'three';
import { game } from '../../core/game.js';
import { heightAt, slopeAt } from '../terrain.js';
import { LOC, ROADS, distToAnyRoad } from '../zones.js';
import { Frame, groundRange, torch, banner, lantern, drape, exclude, isExcluded, addGlow, rr, rng, rpick, ri } from './kit.js';

const WIN = '#2a3038';
const ROOFS = ['#7a4a2a', '#8a3a2a', '#5a4a3a', '#9a7a40', '#6a5a4a', '#a0522d', '#4a5a6a'];
const PLASTER = ['#e8dfc8', '#e6d4a8', '#dcd0bc', '#efe6d2', '#d8c4a0'];
const LOGC = ['#8a6238', '#7a5634', '#93693d'];
const TRIM = ['#f0f0e8', '#3a6a9a', '#2f6a5a', '#b8443a', '#e0c060'];

// Russian-style window with carved frame ("наличники") on a wall facing local +z at (x, y, z)
function window_(f, x, y, z, trim, o = {}) {
  const ry = o.ry ?? 0;
  const nx = Math.sin(ry), nz = Math.cos(ry);
  f.box(x, y, z, 1.0, 1.1, 0.12, WIN, { mat: 'glow', ry });
  f.box(x + nx * 0.04, y + 0.53, z + nz * 0.04, 0.06, 0.06, 0.13, trim, { ry: ry + Math.PI / 2, ao: 0 });
  f.box(x + nx * 0.06, y - 0.12, z + nz * 0.06, 1.3, 0.14, 0.12, trim, { ry, ao: 0 });
  f.box(x + nx * 0.06, y + 1.1, z + nz * 0.06, 1.3, 0.14, 0.12, trim, { ry, ao: 0 });
  f.prism(x + nx * 0.06, y + 1.22, z + nz * 0.06, 1.4, 0.4, 0.1, trim, { ry, ao: 0 });
  // shutters
  if (o.shutters !== false) for (const s of [-1, 1]) {
    const sx = Math.cos(ry) * s * 0.78, sz = -Math.sin(ry) * s * 0.78;
    f.box(x + sx + nx * 0.05, y, z + sz + nz * 0.05, 0.5, 1.1, 0.06, o.shutter ?? trim, { ry, ao: 0 });
  }
}

// A town house: izba (log) or plastered timber; front (door) faces local +z
export function townHouse(f, o = {}) {
  const type = o.type ?? (rng() < 0.55 ? 'izba' : 'plaster');
  const w = o.w ?? rr(6.5, 8.5), d = o.d ?? rr(6, 8), h = o.h ?? (o.storeys === 2 ? 5.6 : 3.2);
  const { lo, hi } = groundRange(f, 0, 0, w + 1, d + 1);
  const fy = hi - f.y + 0.3;
  const trim = o.trim ?? rpick(TRIM);
  const roofC = o.roof ?? rpick(ROOFS);
  // foundation
  f.box(0, lo - f.y - 0.5, 0, w + 0.3, fy - (lo - f.y) + 0.5, d + 0.3, '#8a857a', { ao: 0.3 });
  if (type === 'izba') {
    const lr = 0.2, rows = Math.round(h / (lr * 2)), col = rpick(LOGC);
    for (let r = 0; r < rows; r++) {
      const y = fy + lr + r * lr * 2, c = r % 2 ? col : '#6e4c2c';
      for (const s of [-1, 1]) {
        f.cyl(s * w / 2, y, 0, lr, lr, d + 0.6, c, { center: true, rx: Math.PI / 2, seg: 6, ao: 0 });
        f.cyl(0, y, s * d / 2, lr, lr, w + 0.6, c, { center: true, rz: Math.PI / 2, seg: 6, ao: 0 });
      }
    }
  } else {
    const wall = o.wall ?? rpick(PLASTER);
    f.box(0, fy, 0, w, h, d, wall, { ao: 0.12 });
    // timber framing
    const beam = '#4a3424';
    for (const s of [-1, 1]) {
      for (const sz of [-1, 1]) f.box(s * (w / 2 - 0.1), fy, sz * (d / 2 + 0.03), 0.25, h, 0.08, beam, { ao: 0 });
      f.box(0, fy + h - 0.15, s * (d / 2 + 0.03), w, 0.2, 0.08, beam, { ao: 0 });
      f.box(0, fy + 0.05, s * (d / 2 + 0.03), w, 0.2, 0.08, beam, { ao: 0 });
      f.box(s * (w / 2 + 0.03), fy + h - 0.15, 0, 0.08, 0.2, d, beam, { ao: 0 });
      if (o.storeys === 2) f.box(0, fy + h / 2, s * (d / 2 + 0.03), w, 0.18, 0.08, beam, { ao: 0 });
    }
    // diagonal braces on the side walls
    for (const s of [-1, 1]) f.box(s * (w / 2 + 0.04), fy + 0.2, 0, 0.08, h * 0.9, 0.18, beam, { rx: 0.6, ao: 0 });
  }
  const top = fy + h;
  // front door + porch
  f.box(0, fy, d / 2 + 0.02, 1.2, 2.2, 0.14, '#4a3020');
  f.box(0, fy + 2.2, d / 2 + 0.06, 1.5, 0.18, 0.14, trim, { ao: 0 });
  f.box(0, lo - f.y - 0.2, d / 2 + 0.7, 2.2, fy - (lo - f.y) + 0.1, 1.2, '#7a6a5a');
  // little porch roof
  f.box(0, fy + 2.75, d / 2 + 0.6, 2.4, 0.1, 1.3, roofC, { center: true, rx: 0.3, ao: 0 });
  // windows
  const wy = fy + 0.9;
  for (const s of [-1, 1]) window_(f, s * w * 0.3, wy, d / 2 + 0.22, trim);
  window_(f, w / 2 + 0.22, wy, 0, trim, { ry: Math.PI / 2 });
  window_(f, -w / 2 - 0.22, wy, 0, trim, { ry: -Math.PI / 2 });
  if (o.storeys === 2) for (const s of [-1, 0, 1]) window_(f, s * w * 0.32, wy + h / 2, d / 2 + 0.06, trim, { shutters: false });
  // roof: ridge along z (gable faces the street, Russian style), steep
  const roofH = o.roofH ?? Math.max(2.4, w * 0.42);
  f.gableRoof(0, top, 0, w + 0.2, d + 0.2, roofH, roofC, { overhang: 0.7, thick: 0.25, wallColor: type === 'izba' ? '#7a5634' : '#d8c8a8', ridge: '#3a2a1a' });
  // carved gable trim ("причелины") + attic window
  f.box(0, top + 0.6, d / 2 + 0.36, 0.7, 0.7, 0.1, WIN, { mat: 'glow' });
  f.box(0, top + roofH - 0.2, d / 2 + 0.85, 0.15, 1.0, 0.12, trim, { ao: 0 });
  for (const s of [-1, 1]) f.box(s * (w / 4 + 0.2), top + roofH / 2 - 0.05, d / 2 + 0.88, w / 2 + 1.1, 0.18, 0.08, trim, { rz: -s * Math.atan2(roofH, w / 2 + 0.1), center: true, ao: 0 });
  // chimney
  if (o.chimney !== false) {
    const cx = rr(-w / 4, w / 4), cz = rr(-d / 4, 0);
    f.box(cx, top + roofH * 0.3, cz, 0.7, roofH * 0.9 + 0.6, 0.7, '#8a5a4a');
    f.box(cx, top + roofH * 1.2 + 0.6, cz, 0.85, 0.15, 0.85, '#6a4a3a');
  }
  f.solid(0, 0, w + 0.4, d + 0.4, top + roofH);
  f.exclude(0, 0, Math.max(w, d) * 0.75 + 1.5);
  return { fy, top, roofH, w, d, door: f.place(0, d / 2 + 1.6, 0) };
}

function picketFence(f, ax, az, bx, bz, o = {}) {
  const L = Math.hypot(bx - ax, bz - az), dir = Math.atan2(bx - ax, bz - az);
  const n = Math.floor(L / 0.4);
  const col = o.color ?? '#9a8058';
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const gy = f.ground(x, z) - f.y;
    f.box(x, gy - 0.1, z, 0.1, 1.15 + (i % 2) * 0.1, 0.07, col, { ry: dir + Math.PI / 2, ao: 0.1 });
  }
  const gy = f.ground((ax + bx) / 2, (az + bz) / 2) - f.y;
  f.box((ax + bx) / 2, gy + 0.75, (az + bz) / 2, 0.06, 0.08, L, '#7a6040', { ry: dir, ao: 0 });
  f.box((ax + bx) / 2, gy + 0.35, (az + bz) / 2, 0.06, 0.08, L, '#7a6040', { ry: dir, ao: 0 });
  f.solid((ax + bx) / 2, (az + bz) / 2, 0.2, L, gy + 1.2, { rot: dir });
}
function garden(f, x, z, w, d) {
  f.box(x, -0.12, z, w, 0.25, d, '#6a4a2c', { ao: 0 });
  const rows = Math.floor(d / 0.9);
  for (let r = 0; r < rows; r++) {
    const kind = rng();
    for (let k = 0; k < Math.floor(w / 0.8); k++) {
      const px = x - w / 2 + 0.4 + k * 0.8, pz = z - d / 2 + 0.45 + r * 0.9;
      if (kind < 0.5) f.sphere(px, 0.25, pz, 0.28, rpick(['#5a9a3a', '#6aaa44']), { sy: 0.8 });
      else f.cone(px, 0.1, pz, 0.12, 0.5, '#4a8a2a', { seg: 4 });
    }
  }
}

// Onion dome via lathe
function onion(f, x, y, z, r, h, color) {
  const prof = [[0.55, 0], [0.8, 0.08], [1.0, 0.28], [0.98, 0.45], [0.75, 0.66], [0.4, 0.83], [0.15, 0.94], [0.04, 1.0]];
  const pts = prof.map(([a, b]) => new THREE.Vector2(a * r, b * h));
  const g = new THREE.LatheGeometry(pts, 12);
  f.put(prepLathe(g), x, y, z, color, { ao: 0.05 });
  // Orthodox cross
  const cy = y + h;
  f.box(x, cy, z, 0.1, 1.6, 0.1, '#e8c040');
  f.box(x, cy + 1.15, z, 0.7, 0.08, 0.08, '#e8c040');
  f.box(x, cy + 1.4, z, 0.4, 0.07, 0.07, '#e8c040');
  f.box(x, cy + 0.55, z, 0.5, 0.07, 0.07, '#e8c040', { rz: -0.4, center: true });
}
function prepLathe(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.userData.aoY = null;
  return ng;
}

function church(f) {
  const W = 9, L = 15, H = 7;
  const fy = 0.3;
  const white = '#f2eee4';
  f.box(0, -0.6, 0, W + 1, 0.9, L + 1, '#a8a294', { ao: 0 });
  f.box(0, fy, 0, W, H, L, white, { ao: 0.12 });
  f.gableRoof(0, fy + H, 0, W, L, 3.2, '#3f7a6a', { overhang: 0.5, wallColor: white });
  // apse (back, local -z)
  f.cyl(0, fy, -L / 2, 3.4, 3.4, H - 1, white, { seg: 12 });
  f.cone(0, fy + H - 1, -L / 2, 3.7, 2.4, '#3f7a6a', { seg: 12 });
  // central drum + big onion dome
  f.cyl(0, fy + H + 1.6, -1, 2.0, 2.0, 3.0, white, { seg: 12 });
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; f.box(Math.sin(a) * 2.02, fy + H + 2.4, -1 + Math.cos(a) * 2.02, 0.5, 1.4, 0.1, WIN, { ry: a, mat: 'glow' }); }
  onion(f, 0, fy + H + 4.6, -1, 2.5, 4.6, '#d9a520');
  // small domes at the corners of the nave
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    f.cyl(sx * 3, fy + H + 1.2, sz * 4.6 - 1, 0.8, 0.8, 1.4, white, { seg: 8 });
    onion(f, sx * 3, fy + H + 2.6, sz * 4.6 - 1, 1.0, 2.0, '#3a6ab0');
  }
  // bell tower at the front (local +z)
  const tz = L / 2 + 2.2;
  f.box(0, fy, tz, 4.4, H + 7, 4.4, white, { ao: 0.12 });
  f.box(0, fy + H + 3.2, tz, 4.7, 0.3, 4.7, '#d0c8b8');
  for (const s of [-1, 1]) {
    f.box(s * 2.21, fy + H + 3.8, tz, 0.08, 2.4, 1.6, '#2a2420', { ao: 0 });
    f.box(0, fy + H + 3.8, tz + s * 2.21, 1.6, 2.4, 0.08, '#2a2420', { ao: 0 });
  }
  f.cyl(0, fy + H + 4.0, tz, 0.5, 0.75, 1.0, '#c8a040', { seg: 8 });
  f.hipRoof(0, fy + H + 7, tz, 4.4, 4.4, 4.5, '#3f7a6a', { overhang: 0.35 });
  onion(f, 0, fy + H + 10.6, tz, 1.1, 2.2, '#d9a520');
  // portal
  f.box(0, fy, tz + 2.22, 1.8, 3.0, 0.12, '#5a3a24');
  f.cyl(0, fy + 3.0, tz + 2.22, 0.9, 0.9, 0.12, '#5a3a24', { center: true, rx: Math.PI / 2, seg: 10 });
  f.box(0, fy + 4.2, tz + 2.25, 1.1, 1.1, 0.06, '#d9a520', { center: true, rz: Math.PI / 4 });
  // nave windows
  for (let k = -1; k <= 1; k++) for (const s of [-1, 1]) {
    f.box(s * (W / 2 + 0.03), fy + 2.2, k * 4, 0.08, 2.4, 0.9, WIN, { mat: 'glow' });
    f.cyl(s * (W / 2 + 0.03), fy + 4.6, k * 4, 0.45, 0.45, 0.08, WIN, { center: true, rz: Math.PI / 2, seg: 8, mat: 'glow' });
  }
  f.solid(0, 0, W, L, H + 6);
  f.post(0, -L / 2, 3.4);
  f.solid(0, tz, 4.4, 4.4, H + 10);
  // churchyard fence & a few crosses
  const fx = 13, fz0 = -L / 2 - 6, fz1 = tz + 6;
  picketFence(f, -fx, fz0, fx, fz0, { color: '#e8e0d0' });
  picketFence(f, -fx, fz0, -fx, fz1, { color: '#e8e0d0' });
  picketFence(f, fx, fz0, fx, fz1, { color: '#e8e0d0' });
  picketFence(f, -fx, fz1, -2.5, fz1, { color: '#e8e0d0' });
  picketFence(f, 2.5, fz1, fx, fz1, { color: '#e8e0d0' });
  for (let k = 0; k < 6; k++) {
    const x = -10 + (k % 3) * 1.8, z = -4 + Math.floor(k / 3) * 3;
    f.box(x, 0, z, 0.1, 1.2, 0.1, '#6a5a4a'); f.box(x, 0.75, z, 0.6, 0.08, 0.08, '#6a5a4a');
    f.box(x, 0, z - 0.9, 0.6, 0.15, 1.6, '#5a6a3a', { ao: 0 });
  }
  f.exclude(0, 0, 18);
  return tz;
}

function stall(f, x, z, yaw, cloth, goods) {
  const s = f.sub(x, 0, z, yaw);
  s.box(0, 0, 0, 2.6, 0.95, 1.0, '#7a5a3a');
  s.box(0, 0.95, 0, 2.8, 0.08, 1.2, '#9a7a50');
  for (const k of [-1, 1]) { s.box(k * 1.3, 0, -0.55, 0.1, 2.7, 0.1, '#5a4028'); s.box(k * 1.3, 0, 0.55, 0.1, 2.3, 0.1, '#5a4028'); }
  // striped awning
  for (let i = 0; i < 6; i++) s.box(-1.25 + i * 0.5, 2.45, 0.05, 0.5, 0.06, 1.7, i % 2 ? cloth : '#f0e8d8', { center: true, rx: 0.22, mat: 'cloth', ao: 0 });
  for (let i = 0; i < 5; i++) {
    const g = goods[i % goods.length];
    if (g === 'apple') s.sphere(-1 + i * 0.5, 1.12, 0, 0.16, rpick(['#c83a2a', '#e0b030', '#8ac040']));
    else if (g === 'cabbage') s.sphere(-1 + i * 0.5, 1.15, 0, 0.2, '#8ac060', { sy: 0.8 });
    else if (g === 'jug') s.cyl(-1 + i * 0.5, 1.03, 0, 0.12, 0.16, 0.4, '#a0603a', { seg: 7 });
    else if (g === 'cloth') s.box(-1 + i * 0.5, 1.03, 0, 0.4, 0.15, 0.6, rpick(['#a03a3a', '#3a5a9a', '#e0c060', '#4a8a4a']));
    else if (g === 'fish') s.box(-1 + i * 0.5, 1.03, 0, 0.12, 0.08, 0.5, '#9aa8b0');
    else s.box(-1 + i * 0.5, 1.03, 0, 0.35, 0.3, 0.35, '#8a6a44');
  }
  s.box(1.8, 0, 0.3, 0.7, 0.7, 0.7, '#8a6a44', { ry: 0.3 });
  s.cyl(-1.8, 0, 0.2, 0.32, 0.32, 0.8, '#6a4a2c', { seg: 8 });
  s.solid(0, 0, 2.8, 1.1, 1.0);
}

function well(f, x, z) {
  f.cyl(x, 0, z, 1.25, 1.35, 0.95, '#8a857a', { seg: 12 });
  f.cyl(x, 0.9, z, 1.0, 1.0, 0.06, '#2a4a6a', { seg: 12, ao: 0 });
  for (const s of [-1, 1]) f.box(x + s * 1.1, 0.9, z, 0.18, 2.0, 0.18, '#5a4028');
  f.box(x, 2.85, z, 2.6, 0.12, 0.14, '#5a4028');
  f.gableRoof(x, 2.95, z, 2.6, 1.9, 0.9, '#7a4a2a', { overhang: 0.25, thick: 0.1, gable: false, alongX: true });
  f.cyl(x, 2.0, z, 0.18, 0.18, 2.1, '#6a4a2c', { center: true, rz: Math.PI / 2, seg: 6 });
  f.cyl(x + 0.3, 1.4, z, 0.2, 0.17, 0.35, '#6a5030', { seg: 7 });
  f.post(x, z, 1.35, 1.0);
}

function signOnPosts(f, x, z, yaw, text, style = 'wood', w = 3, h = 0.8) {
  const s = f.sub(x, f.ground(x, z) - f.y, z, yaw);
  for (const k of [-1, 1]) s.box(k * (w / 2 + 0.1), -0.3, 0, 0.16, 2.6, 0.16, '#5a4028');
  s.sign(0, 1.9, 0, text, w, h, { style });
  s.post(0, 0, 0.3, 2.5);
  return s;
}

export function buildTown() {
  const C = LOC.town;
  const y0 = heightAt(C.x, C.z);
  const f = new Frame(C.x, y0, C.z, 0);
  const doors = [];
  const foot = []; // occupied circles (local)
  const occupied = (x, z, r) => foot.some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2);
  const occupy = (x, z, r) => foot.push({ x, z, r });

  // ---- market square ----
  f.cyl(0, -0.25, 0, 17, 17, 0.33, '#a59a86', { seg: 20, ao: 0 });
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; f.box(Math.cos(a) * 16.6, 0.06, Math.sin(a) * 16.6, 0.8, 0.06, 2.4, '#8a8070', { ry: -a, ao: 0 }); }
  occupy(0, 0, 15);
  well(f, -4, 5);
  const stallSpots = [[0.35, '#b83a2a', ['apple', 'cabbage']], [0.95, '#3a6ab0', ['cloth']], [2.2, '#e0a030', ['jug', 'box']], [2.8, '#4a8a3a', ['fish', 'box']], [-0.88, '#8a3a8a', ['cloth', 'jug']], [-2.2, '#b83a2a', ['apple', 'box']]];
  for (const [a, c, g] of stallSpots) stall(f, Math.cos(a) * 12, Math.sin(a) * 12, Math.atan2(-Math.cos(a), -Math.sin(a)), c, g);
  // notice board
  {
    const b = f.sub(6, 0, 7.5, -2.4);
    for (const k of [-1, 1]) b.box(k * 1.3, 0, 0, 0.16, 2.6, 0.16, '#5a4028');
    b.box(0, 0.9, 0, 2.8, 1.5, 0.1, '#7a5a38');
    b.signPlane(-0.6, 1.95, 0.07, 1.2, 0.7, signCellFor('РАЗЫСКИВАЕТСЯ\nграбитель корованов', 'stone'));
    b.signPlane(0.65, 1.95, 0.07, 1.2, 0.7, signCellFor('ПРОДАМ ПРОТЕЗ\nпочти новый', 'stone'));
    b.signPlane(0, 1.2, 0.07, 2.4, 0.55, signCellFor('Я джва года жду корован!', 'stone'));
    b.gableRoof(0, 2.6, 0, 3.0, 0.8, 0.5, '#6a4a2a', { overhang: 0.2, thick: 0.08, gable: false, alongX: true });
    b.post(0, 0, 1.0, 2.6);
  }
  // lamp posts around the square
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; lantern(f, Math.cos(a) * 17.5, Math.sin(a) * 17.5, 3.2, { pole: '#3a3a3a' }); }
  game.places.set('town:square', { ...f.place(2, 4, 0), name: 'Торговая площадь' });

  // ---- tavern (NW) ----
  {
    const a = -2.3, r = 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const t = f.sub(x, 0, z, Math.atan2(-x, -z));
    const res = townHouse(t, { type: 'plaster', w: 13, d: 9, storeys: 2, roof: '#6a3a24', wall: '#e8d8b0', trim: '#7a3a2a', roofH: 4.2 });
    // veranda with tables
    const vz = res.d / 2 + 2.6;
    t.box(0, res.fy - 0.25, vz, 12, 0.25, 4.4, '#7a5a38', { ao: 0 });
    t.floor(0, vz, 12, 4.4, res.fy);
    for (const s of [-1, 1]) for (const zz of [vz - 2, vz + 2]) t.box(s * 5.8, res.fy, zz, 0.2, 2.8, 0.2, '#5a4028');
    t.box(0, res.fy + 2.8, vz, 12.6, 0.12, 4.8, '#8a4a2a', { rx: 0.1, center: true });
    for (const s of [-1, 1]) {
      const tx = s * 3.2;
      t.box(tx, res.fy, vz, 1.6, 0.8, 0.9, '#6a4a2c');
      for (const k of [-1, 1]) t.box(tx, res.fy, vz + k * 0.9, 1.6, 0.45, 0.35, '#5a4028');
      t.cyl(tx - 0.3, res.fy + 0.8, vz, 0.1, 0.1, 0.25, '#c8b070', { seg: 6 });
      t.cyl(tx + 0.4, res.fy + 0.8, vz + 0.1, 0.1, 0.1, 0.25, '#c8b070', { seg: 6 });
      t.solid(tx, vz, 1.6, 2.5, res.fy + 0.8);
    }
    // bar counter at the side of the veranda
    t.box(0, res.fy, vz - 1.1, 3, 1.1, 0.7, '#5a3a22');
    t.solid(0, vz - 1.1, 3, 0.7, res.fy + 1.1);
    for (let k = 0; k < 3; k++) t.cyl(-1 + k, res.fy + 1.1, vz - 1.1, 0.1, 0.12, 0.3, '#a07040', { seg: 6 });
    for (let k = 0; k < 3; k++) t.cyl(-6.6 + k * 0.1, res.fy, res.d / 2 + 1 + k * 0.9, 0.42, 0.42, 1.0, '#6a4a2c', { seg: 8 });
    // hanging sign
    t.box(4.8, res.fy + 3.3, vz + 2.3, 0.1, 0.1, 1.6, '#3a2a1a');
    t.sign(4.8, res.fy + 2.75, vz + 2.9, 'КОРЧМА\n«Пьяный корован»', 2.4, 0.9, { ry: Math.PI / 2 });
    t.sign(0, res.fy + res.top - res.fy - 0.6, res.d / 2 + 0.2, 'КОРЧМА', 3, 0.7, { back: false });
    torch(t, -1.2, res.fy + 1.4, res.d / 2 + 0.2); torch(t, 1.2, res.fy + 1.4, res.d / 2 + 0.2);
    game.places.set('town:tavern', { ...t.place(0, vz + 3, 0), name: 'Корчма «Пьяный корован»' });
    game.places.set('shop:tavern', { ...t.place(0, vz - 1.9, 0), name: 'Корчмарь' });
    doors.push(res.door);
    occupy(x, z, 12);
  }

  // ---- smithy / weapons (NE) ----
  {
    const a = -0.85, r = 29;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = f.sub(x, 0, z, Math.atan2(-x, -z));
    const res = townHouse(s, { type: 'plaster', w: 8, d: 6, wall: '#c8bca8', roof: '#4a4a4a', trim: '#3a3a3a', chimney: false });
    // open forge shed in front
    const fz = res.d / 2 + 2.6;
    s.box(0, res.fy - 0.3, fz, 8, 0.3, 4.4, '#6a6258', { ao: 0 });
    for (const sx of [-1, 1]) for (const zz of [fz - 2, fz + 2]) s.box(sx * 3.8, res.fy - 0.3, zz, 0.25, 3.2, 0.25, '#4a3424');
    s.box(0, res.fy + 2.9, fz, 8.6, 0.14, 5, '#4a4a4a', { rx: 0.12, center: true });
    // forge with glowing coals + chimney
    s.box(-2.4, res.fy, fz - 1.3, 2.0, 1.0, 1.6, '#6a625a');
    s.box(-2.4, res.fy + 1.0, fz - 1.3, 1.5, 0.12, 1.1, '#ff6a1a', { mat: 'fire' });
    s.box(-2.4, res.fy + 1.0, fz - 1.9, 1.2, 4.0, 0.6, '#6a625a');
    const p = s.w(-2.4, fz - 1.3); addGlow(p.x, s.y + res.fy + 1.4, p.z, 5, '#ff7020');
    s.solid(-2.4, fz - 1.3, 2.0, 1.6, res.fy + 1.1);
    // anvil
    s.box(0.2, res.fy, fz - 0.4, 0.5, 0.6, 0.4, '#3a3a3a');
    s.box(0.2, res.fy + 0.6, fz - 0.4, 0.9, 0.3, 0.4, '#2a2a2e');
    s.cone(0.75, res.fy + 0.75, fz - 0.4, 0.15, 0.4, '#2a2a2e', { seg: 4, rz: -Math.PI / 2 });
    s.cyl(1.4, res.fy, fz - 1.2, 0.4, 0.4, 0.8, '#5a4028', { seg: 8 });
    // weapon rack with swords, axes, spears
    s.box(2.6, res.fy, fz - 1.6, 2.2, 0.12, 0.3, '#5a4028');
    s.box(2.6, res.fy + 1.6, fz - 1.6, 2.2, 0.12, 0.3, '#5a4028');
    for (let k = 0; k < 5; k++) {
      s.box(1.7 + k * 0.45, res.fy + 0.1, fz - 1.55, 0.06, 1.7, 0.03, '#c8ccd4');
      s.box(1.7 + k * 0.45, res.fy + 1.1, fz - 1.55, 0.3, 0.06, 0.06, '#8a6a2a');
    }
    s.solid(2.6, fz - 1.6, 2.2, 0.4, res.fy + 1.8);
    // counter
    s.box(0.5, res.fy, fz + 1.6, 3.4, 1.0, 0.7, '#6a4a2c');
    s.box(0.5, res.fy + 1.0, fz + 1.6, 3.6, 0.08, 0.9, '#7a5a3a');
    s.box(0, res.fy + 1.08, fz + 1.6, 0.9, 0.06, 0.12, '#c8ccd4', { ry: 0.3 });
    s.box(1.2, res.fy + 1.08, fz + 1.6, 0.6, 0.2, 0.3, '#a0a4ac');
    s.solid(0.5, fz + 1.6, 3.4, 0.7, res.fy + 1.0);
    s.sign(0, res.fy + 3.6, fz + 2.5, 'КУЗНИЦА · ОРУЖИЕ', 3.4, 0.7, { style: 'wood' });
    game.places.set('shop:weapons', { ...s.place(0.5, fz + 0.9, 0), name: 'Кузнец-оружейник' });
    doors.push(res.door);
    occupy(x, z, 10);
  }

  // ---- general store (E-SE) ----
  {
    const a = 0.45, r = 28;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = f.sub(x, 0, z, Math.atan2(-x, -z));
    const res = townHouse(s, { type: 'izba', w: 9, d: 7, roof: '#6a5a3a', trim: '#3a6a9a' });
    const cz = res.d / 2 + 1.9;
    s.box(0, res.fy, cz, 4, 1.0, 0.8, '#6a4a2c');
    s.box(0, res.fy + 1.0, cz, 4.2, 0.08, 1.0, '#8a6a44');
    for (const k of [-1, 1]) s.box(k * 2.1, res.fy - 0.3, cz + 0.6, 0.14, 3.0, 0.14, '#5a4028');
    for (let i = 0; i < 7; i++) s.box(-1.8 + i * 0.6, res.fy + 2.6, cz + 0.2, 0.6, 0.06, 2.0, i % 2 ? '#3a6a9a' : '#f0e8d8', { center: true, rx: 0.2, mat: 'cloth', ao: 0 });
    s.solid(0, cz, 4, 0.8, res.fy + 1.0);
    for (let k = 0; k < 3; k++) s.sphere(-3.2 + k * 0.6, res.fy + 0.3, cz - 0.6 + (k % 2) * 0.5, 0.35, '#c8b080', { sy: 1.2 });
    for (let k = 0; k < 2; k++) s.cyl(3.0 + k * 0.85, res.fy, cz - 0.6, 0.38, 0.38, 0.95, '#6a4a2c', { seg: 8 });
    s.box(3.2, res.fy, cz + 0.6, 0.8, 0.8, 0.8, '#8a6a44', { ry: 0.4 });
    s.sign(0, res.fy + 3.15, cz + 1.25, 'ЛАВКА · ВСЯКАЯ ВСЯЧИНА', 3.6, 0.6);
    game.places.set('shop:general', { ...s.place(0, cz - 0.8, 0), name: 'Лавочник' });
    doors.push(res.door);
    occupy(x, z, 10);
  }

  // ---- healer & prosthetist (W-SW) ----
  {
    const a = 2.6, r = 28;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = f.sub(x, 0, z, Math.atan2(-x, -z));
    const res = townHouse(s, { type: 'plaster', w: 9, d: 7, wall: '#eef0ea', roof: '#3a6a5a', trim: '#2f6a5a' });
    const cz = res.d / 2 + 1.9;
    s.box(0, res.fy, cz, 3.6, 1.0, 0.8, '#e8e4dc');
    s.box(0, res.fy + 1.0, cz, 3.8, 0.08, 1.0, '#b0a898');
    for (const k of [-1, 1]) s.box(k * 1.9, res.fy - 0.3, cz + 0.6, 0.14, 3.0, 0.14, '#5a4028');
    s.box(0, res.fy + 2.65, cz + 0.2, 4.2, 0.06, 2.0, '#2f6a5a', { center: true, rx: 0.2, mat: 'cloth', ao: 0 });
    s.solid(0, cz, 3.6, 0.8, res.fy + 1.0);
    // bottles & bandages on the counter
    for (let k = 0; k < 5; k++) s.cyl(-1.3 + k * 0.5, res.fy + 1.08, cz, 0.08, 0.1, 0.3, rpick(['#4a9a5a', '#9a3a3a', '#5a6ab0', '#c8a040']), { seg: 6 });
    // display: wooden prosthetic leg & arm hanging next to the door, a wheelchair out front
    const lx = res.w / 2 - 0.9, lz = res.d / 2 + 0.35;
    s.cyl(lx, res.fy + 1.0, lz, 0.1, 0.06, 0.9, '#a07a4a', { seg: 6 });
    s.cyl(lx, res.fy + 1.9, lz, 0.16, 0.12, 0.5, '#a07a4a', { seg: 6 });
    s.box(lx, res.fy + 0.92, lz + 0.08, 0.16, 0.1, 0.3, '#5a4028');
    s.cyl(lx - 0.8, res.fy + 1.6, lz, 0.06, 0.08, 0.8, '#a07a4a', { seg: 6, rz: 0.3 });
    s.box(lx - 0.95, res.fy + 1.4, lz, 0.1, 0.16, 0.08, '#8a8a8a');
    const wx = -3.2, wz = cz + 1.2;
    for (const k of [-1, 1]) s.cyl(wx + k * 0.35, res.fy + 0.42, wz, 0.42, 0.42, 0.05, '#4a3a2a', { center: true, rz: Math.PI / 2, seg: 10 });
    s.box(wx, res.fy + 0.45, wz, 0.6, 0.08, 0.55, '#6a4a2c'); s.box(wx, res.fy + 0.45, wz - 0.25, 0.6, 0.65, 0.08, '#6a4a2c');
    s.sign(0, res.fy + 3.2, cz + 1.25, 'ЛЕКАРЬ И ПРОТЕЗИСТ', 3.6, 0.6, { style: 'green' });
    s.sign(-res.w / 2 - 0.4, res.fy + 2.2, res.d / 2 + 0.3, 'Протезы\nрук, ног, глаз', 1.4, 0.7, { ry: Math.PI / 2 });
    game.places.set('shop:healer', { ...s.place(0, cz - 0.8, 0), name: 'Лекарь и протезист' });
    doors.push(res.door);
    occupy(x, z, 10);
  }

  // ---- church (south) ----
  {
    const s = f.sub(0, 0, 50, Math.PI);
    church(s);
    occupy(0, 50, 20);
    drape([[C.x, C.z + 16], [C.x, C.z + 32]], 3.5, '#8a7a60', { off: 0.07 });
    game.places.set('town:church', { ...s.place(0, 16, 0), name: 'Церковь' });
  }

  // ---- houses along the roads ----
  const roadsHere = [ROADS.townPalace, ROADS.townWest, ROADS.townFort];
  const closestOnRoad = (x, z) => {
    let best = null, bd = Infinity;
    for (const road of roadsHere) for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      const vx = bx - ax, vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = [px, pz]; }
    }
    return { p: best, d: bd };
  };
  let n = 0;
  for (const road of roadsHere) {
    const [ax, az] = road[0], [bx, bz] = road[1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let dist = 38; dist < 92; dist += 13) {
      for (const side of [-1, 1]) {
        const off = rr(12.5, 15);
        const wx = ax + ux * dist + -uz * side * off, wz = az + uz * dist + ux * side * off;
        const lx = wx - C.x, lz = wz - C.z;
        if (Math.hypot(lx, lz) > 92) continue;
        if (occupied(lx, lz, 7) || distToAnyRoad(wx, wz) < 10) continue;
        const cr = closestOnRoad(wx, wz);
        const yaw = Math.atan2(cr.p[0] - wx, cr.p[1] - wz);
        const h = f.sub(lx, 0, lz, yaw);
        const storeys = rng() < 0.25 ? 2 : 1;
        const res = townHouse(h, { storeys });
        doors.push(res.door);
        occupy(lx, lz, 7);
        n++;
        // back yard: fence + garden or woodpile
        if (rng() < 0.75) {
          const bz0 = -res.d / 2 - 0.5, bz1 = -res.d / 2 - 8, bw = res.w / 2 + 1.5;
          if (!occupied(lx - Math.sin(yaw) * 9, lz - Math.cos(yaw) * 9, 5)) {
            picketFence(h, -bw, bz1, bw, bz1);
            picketFence(h, -bw, bz0, -bw, bz1);
            picketFence(h, bw, bz0, bw, bz1);
            if (rng() < 0.6) garden(h, 0, (bz0 + bz1) / 2, res.w - 1, 4.5);
            else { for (let k = 0; k < 6; k++) h.cyl(-1.5 + (k % 3) * 0.5, 0.2 + Math.floor(k / 3) * 0.45, (bz0 + bz1) / 2, 0.22, 0.22, 2.0, '#8a6a44', { center: true, rx: Math.PI / 2, seg: 6 }); }
            occupy(lx - Math.sin(yaw) * 9, lz - Math.cos(yaw) * 9, 5);
            h.exclude(0, (bz0 + bz1) / 2, 6);
          }
        }
      }
    }
  }
  // ---- extra houses filling the south side (no roads) ----
  for (let k = 0; k < 14; k++) {
    const a = 0.55 + (k / 13) * 2.0 + rr(-0.05, 0.05), r = k % 2 ? 72 : 52;
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    if (occupied(lx, lz, 7.5) || distToAnyRoad(C.x + lx, C.z + lz) < 10) continue;
    const h = f.sub(lx, 0, lz, Math.atan2(-lx, -lz));
    const res = townHouse(h, { storeys: rng() < 0.2 ? 2 : 1 });
    doors.push(res.door);
    occupy(lx, lz, 7.5);
    if (rng() < 0.5) { garden(h, res.w / 2 + 3.5, 0, 3, 4); h.exclude(res.w / 2 + 3.5, 0, 3); }
    n++;
  }
  // southern lane
  drape([[C.x - 60, C.z + 62], [C.x - 30, C.z + 50], [C.x, C.z + 30], [C.x + 30, C.z + 50], [C.x + 62, C.z + 60]], 3.5, '#8a7a60', { off: 0.06 });

  // ---- welcome signs at the edge of town ----
  for (const road of roadsHere) {
    const [ax, az] = road[0], [bx, bz] = road[1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const d = 96;
    const sx = ax + ux * d - uz * 6, sz = az + uz * d + ux * 6;
    signOnPosts(f, sx - C.x, sz - C.z, Math.atan2(ux, uz), 'СЛОБОДА\nдобро пожаловать', 'wood', 2.8, 1.0);
  }
  game.places.set('town:houses', doors.map(d => ({ x: d.x, z: d.z })));
  console.log('[buildings] town houses:', n + 4);

  buildFarms();
}

// ---------- farms around LOC.eastFarm ----------
function field(x0, z0, w, d, yaw, crop) {
  const f = new Frame(x0, 0, z0, yaw);
  const rows = Math.floor(d / 1.6);
  for (let r = 0; r < rows; r++) {
    const lz = -d / 2 + 0.8 + r * 1.6;
    const A = f.w(-w / 2, lz), B = f.w(w / 2, lz);
    drape([[A.x, A.z], [B.x, B.z]], 1.0, crop === 'wheat' ? '#c9a94a' : crop === 'flax' ? '#7a9ac0' : '#5a8a32', { off: 0.1, step: 3, j: 0.06 });
    drape([[A.x, A.z], [B.x, B.z]], 0.6, '#6a5232', { off: 0.07, step: 3 });
  }
  // border furrow
  exclude(x0, z0, Math.hypot(w, d) / 2);
  return f;
}
function windmill(x, z, yaw) {
  const f = new Frame(x, heightAt(x, z), z, yaw);
  f.box(0, -1, 0, 4, 1.4, 4, '#7d7a72');
  f.cyl(0, 0.4, 0, 1.8, 2.4, 7, '#8a6a44', { seg: 8 });
  f.box(0, 7.2, 0.4, 3.4, 2.6, 3.8, '#7a5a38');
  f.gableRoof(0, 9.8, 0.4, 3.4, 3.8, 1.6, '#5a4a3a', { overhang: 0.3, wallColor: '#7a5a38' });
  f.cyl(0, 8.6, 2.6, 0.2, 0.2, 1.4, '#4a3424', { center: true, rx: Math.PI / 2, seg: 6 });
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.4;
    const s = f.sub(0, 8.6, 3.3, 0);
    s.box(Math.cos(a) * 3.6, 0, 0, 7.2, 0.18, 0.14, '#5a4028', { center: true, rz: a });
    s.box(Math.cos(a) * 4.0 + Math.cos(a + Math.PI / 2) * 0.55, Math.sin(a) * 4.0 + Math.sin(a + Math.PI / 2) * 0.55, 0.02, 5.6, 1.0, 0.04, '#e8e0cc', { center: true, rz: a, mat: 'cloth' });
    void s;
  }
  f.box(0, 0.4, 2.1, 1.1, 2, 0.2, '#4a3020');
  f.post(0, 0, 2.4);
  exclude(x, z, 7);
}
function farmstead(x, z, yaw) {
  const f = new Frame(x, heightAt(x, z), z, yaw);
  const res = townHouse(f, { type: 'izba', w: 8, d: 7, roof: '#a08850' });
  // barn
  const b = f.sub(12, 0, -3, -Math.PI / 2);
  const { lo, hi } = groundRange(b, 0, 0, 12, 8);
  b.box(0, lo - b.y - 0.5, 0, 12, hi - lo + 0.5 + 4.5, 8, '#8a3a2a');
  b.gableRoof(0, hi - b.y + 4.5, 0, 12, 8, 3.2, '#5a4a3a', { overhang: 0.5, wallColor: '#8a3a2a', alongX: true });
  b.box(0, hi - b.y, 4.03, 4, 3.6, 0.1, '#6a2a1a');
  b.box(0, hi - b.y, 4.06, 4, 0.2, 0.06, '#e8e0d0', { ao: 0 }); b.box(0, hi - b.y + 3.4, 4.06, 4, 0.2, 0.06, '#e8e0d0', { ao: 0 });
  b.box(0, hi - b.y + 1.8, 4.07, 4.5, 0.2, 0.06, '#e8e0d0', { rz: 0.72, center: true, ao: 0 });
  b.solid(0, 0, 12, 8, hi - b.y + 7.7);
  b.exclude(0, 0, 9);
  // haystacks
  for (let k = 0; k < 4; k++) {
    const hx = -6 + k * 3.2, hz = 10 + (k % 2) * 2;
    const gy = f.ground(hx, hz) - f.y;
    f.cyl(hx, gy - 0.2, hz, 1.2, 1.4, 1.5, '#d8b65a', { seg: 9 });
    f.cone(hx, gy + 1.3, hz, 1.25, 1.4, '#c8a64a', { seg: 9 });
    f.post(hx, hz, 1.3, gy + 2.4);
  }
  // cart
  const cg = f.ground(-7, 3) - f.y;
  f.box(-7, cg + 0.6, 3, 1.6, 0.5, 2.6, '#7a5a38', { ry: 0.4 });
  for (const s of [-1, 1]) f.cyl(-7 + Math.cos(0.4) * s * 0.9, cg + 0.55, 3 - Math.sin(0.4) * s * 0.9, 0.55, 0.55, 0.12, '#4a3424', { center: true, rz: Math.PI / 2, ry: 0.4, seg: 10 });
  f.solid(-7, 3, 1.8, 2.8, cg + 1.1, { rot: 0.4 });
  // paddock fence around everything
  const R = 24;
  for (let k = 0; k < 8; k++) {
    if (k === 2) continue; // gate gap
    const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
    const ax = Math.cos(a0) * R, az = Math.sin(a0) * R, bx = Math.cos(a1) * R, bz = Math.sin(a1) * R;
    const L = Math.hypot(bx - ax, bz - az), dir = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= 6; i++) { const t = i / 6, px = ax + (bx - ax) * t, pz = az + (bz - az) * t; f.box(px, f.ground(px, pz) - f.y - 0.2, pz, 0.14, 1.5, 0.14, '#6a5030'); }
    for (const yy of [0.6, 1.1]) {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      f.box(mx, f.ground(mx, mz) - f.y + yy, mz, 0.08, 0.1, L, '#7a6040', { ry: dir, ao: 0 });
    }
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    f.solid(mx, mz, 0.2, L, f.ground(mx, mz) - f.y + 1.3, { rot: dir });
  }
  f.exclude(0, 0, 18);
  return res.door;
}

function buildFarms() {
  const F = LOC.eastFarm;
  const doors = [];
  doors.push(farmstead(F.x, F.z, -2.2));
  windmill(F.x - 34, F.z + 18, -1.0);
  field(F.x + 40, F.z - 6, 34, 22, 0.35, 'wheat');
  field(F.x + 40, F.z + 30, 30, 18, 0.35, 'cabbage');
  field(F.x - 4, F.z + 44, 30, 20, -0.1, 'wheat');
  field(F.x + 70, F.z + 60, 26, 18, 0.5, 'flax');
  // a second small farm north-west of the town
  doors.push(farmstead(-120, 340, 0.6));
  field(-150, 380, 30, 20, 0.6, 'wheat');
  field(-95, 385, 24, 18, 0.3, 'cabbage');
  // scarecrow
  for (const [x, z] of [[F.x + 40, F.z - 6], [-150, 380]]) {
    const f = new Frame(x, heightAt(x, z), z, 0.3);
    f.box(0, -0.3, 0, 0.12, 2.6, 0.12, '#6a5030'); f.box(0, 1.6, 0, 1.6, 0.1, 0.1, '#6a5030');
    f.box(0, 1.1, 0, 0.6, 0.8, 0.3, '#8a5a3a'); f.sphere(0, 2.1, 0, 0.25, '#d8c890');
    f.cone(0, 2.25, 0, 0.45, 0.35, '#c8a64a', { seg: 8 });
    f.post(0, 0, 0.3, 2.4);
  }
  const prev = game.places.get('town:houses') ?? [];
  game.places.set('town:houses', [...prev, ...doors.map(d => ({ x: d.x, z: d.z }))]);
  game.places.set('farm', { x: F.x, z: F.z, yaw: 0, name: 'Хутор' });
}

import { signCell } from './kit.js';
function signCellFor(text, style) { return signCell(text, style); }
void slopeAt; void isExcluded; void ri; void banner;
