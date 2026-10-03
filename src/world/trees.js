// Dense forest with Kirill-approved LOD: far away the trees are literally pictures
// (billboards rendered from the 3D model at startup), when you come near they turn into 3D trees.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { game } from '../core/game.js';
import { mulberry32, fbm } from '../core/rng.js';
import { heightAt, slopeAt, WATER_LEVEL } from './terrain.js';
import { WORLD_HALF, LOC, zoneAt, distToAnyRoad } from './zones.js';

export const NEAR = 95;          // radius where trees become 3D
const GRID = 16;                 // spatial hash cell size
const GN = Math.ceil((WORLD_HALF * 2) / GRID);

export const trees = [];         // { x, y, z, s, rot, type, r }
const grid = new Map();          // cellIndex -> tree[]
let exclusions = [];             // { x, z, r } circles where no trees grow (buildings register here)

export function addTreeExclusion(x, z, r) { exclusions.push({ x, z, r }); }

function cellKey(x, z) {
  const i = Math.floor((x + WORLD_HALF) / GRID), j = Math.floor((z + WORLD_HALF) / GRID);
  return j * GN + i;
}

export function treesNear(x, z, r, out = []) {
  const i0 = Math.floor((x - r + WORLD_HALF) / GRID), i1 = Math.floor((x + r + WORLD_HALF) / GRID);
  const j0 = Math.floor((z - r + WORLD_HALF) / GRID), j1 = Math.floor((z + r + WORLD_HALF) / GRID);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = grid.get(j * GN + i);
    if (c) for (const t of c) out.push(t);
  }
  return out;
}

// Push a circle (pos.x,pos.z,radius) out of tree trunks. Returns true if collided.
const _tmp = [];
export function collideTrees(pos, radius) {
  _tmp.length = 0;
  treesNear(pos.x, pos.z, radius + 2, _tmp);
  let hit = false;
  for (const t of _tmp) {
    const dx = pos.x - t.x, dz = pos.z - t.z;
    const min = radius + t.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = t.x + (dx / d) * min; pos.z = t.z + (dz / d) * min;
      hit = true;
    }
  }
  return hit;
}

// ---------- tree models ----------
function colorize(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const shade = 0.85 + Math.random() * 0.3;
    arr[k * 3] = c.r * shade; arr[k * 3 + 1] = c.g * shade; arr[k * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const ng = g => (g.index ? g.toNonIndexed() : g);

function makePine() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.25, 0.45, 4, 6); trunk.translate(0, 2, 0);
  parts.push(colorize(ng(trunk), '#5a3d24'));
  for (let i = 0; i < 4; i++) {
    const r = 3.2 - i * 0.65, h = 4 - i * 0.5;
    const cone = new THREE.ConeGeometry(r, h, 8); cone.translate(0, 3 + i * 2.1 + h / 2, 0);
    parts.push(colorize(ng(cone), i % 2 ? '#1f4d2a' : '#245a30'));
  }
  return mergeGeometries(parts);
}
function makeOak() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.35, 0.6, 5, 7); trunk.translate(0, 2.5, 0);
  parts.push(colorize(ng(trunk), '#4e3622'));
  const blobs = [[0, 7, 0, 3.2], [1.8, 6.2, 0.6, 2.3], [-1.6, 6.4, -0.8, 2.4], [0.4, 6, -1.9, 2.1], [-0.5, 8.6, 0.6, 2.0]];
  for (const [x, y, z, r] of blobs) {
    const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z);
    parts.push(colorize(ng(s), '#3d7a2c'));
  }
  return mergeGeometries(parts);
}
function makeBirch() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 7, 6); trunk.translate(0, 3.5, 0);
  parts.push(colorize(ng(trunk), '#e8e4da'));
  const blobs = [[0, 7.5, 0, 2.0], [0.9, 6.3, 0.3, 1.5], [-0.8, 6.6, -0.4, 1.6]];
  for (const [x, y, z, r] of blobs) {
    const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z);
    parts.push(colorize(ng(s), '#6a9a3a'));
  }
  return mergeGeometries(parts);
}
function makeDeadTree() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.4, 6, 5); trunk.translate(0, 3, 0);
  parts.push(colorize(ng(trunk), '#3b3029'));
  for (let i = 0; i < 4; i++) {
    const b = new THREE.CylinderGeometry(0.06, 0.14, 2.4, 4);
    b.translate(0, 1.2, 0); b.rotateZ(0.9 * (i % 2 ? 1 : -1)); b.rotateY(i * 1.6); b.translate(0, 3 + i * 0.8, 0);
    parts.push(colorize(ng(b), '#3b3029'));
  }
  return mergeGeometries(parts);
}

const TYPES = [
  { name: 'pine', make: makePine, h: 12, w: 7, r: 0.5 },
  { name: 'oak', make: makeOak, h: 11, w: 8.4, r: 0.65 },
  { name: 'birch', make: makeBirch, h: 10, w: 5, r: 0.35 },
  { name: 'dead', make: makeDeadTree, h: 8, w: 5, r: 0.45 },
];

// Renders the 3D model to a texture: this IS the "картинка" for far trees.
function renderImpostor(geo, type) {
  const size = 256;
  const rt = new THREE.WebGLRenderTarget(size, size * (type.h / type.w) | 0, { samples: 4 });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(3, 6, 8); scene.add(dl);
  const cam = new THREE.OrthographicCamera(-type.w / 2, type.w / 2, type.h, 0, 0.1, 100);
  cam.position.set(0, 0, 30); cam.lookAt(0, 0, 0);
  const r = game.renderer;
  const prevTarget = r.getRenderTarget();
  const prevClear = r.getClearAlpha();
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.clear();
  r.render(scene, cam);
  r.setRenderTarget(prevTarget);
  r.setClearAlpha(prevClear);
  return rt.texture;
}

const billboardVS = /* glsl */`
  attribute vec4 inst; // x,y,z,scale
  uniform vec3 camPos;
  uniform vec2 size;
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec3 base = inst.xyz;
    vec3 toCam = camPos - base; toCam.y = 0.0;
    vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
    vec3 wp = base + right * position.x * size.x * inst.w + vec3(0.0, position.y * size.y * inst.w, 0.0);
    vDist = length(camPos.xz - base.xz);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const billboardFS = /* glsl */`
  uniform sampler2D map;
  uniform float nearR;
  uniform vec3 fogColor;
  uniform float fogNear, fogFar, light;
  varying vec2 vUv;
  varying float vDist;
  void main() {
    if (vDist < nearR) discard;
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.5) discard;
    vec3 col = c.rgb * light;
    float f = smoothstep(fogNear, fogFar, gl_FragCoord.z / gl_FragCoord.w);
    gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
    #include <colorspace_fragment>
  }`;

const typeData = [];
let lastRefresh = new THREE.Vector3(1e9, 0, 0);

export function buildTrees(seed = 1337) {
  const rng = mulberry32(seed);
  // --- placement ---
  const step = 6.5;
  for (let z = -WORLD_HALF + 10; z < WORLD_HALF - 10; z += step) {
    for (let x = -WORLD_HALF + 10; x < WORLD_HALF - 10; x += step) {
      const px = x + (rng() - 0.5) * step * 0.9, pz = z + (rng() - 0.5) * step * 0.9;
      const zn = zoneAt(px, pz).id;
      const n = fbm(px / 160, pz / 160, 3, 99) * 0.5 + 0.5; // patchiness
      let density;
      if (zn === 'elves') density = 0.55 + n * 0.45;           // ГУСТОЙ лес
      else if (zn === 'humans') density = n > 0.62 ? 0.35 : 0.025;
      else if (zn === 'empire') density = n > 0.58 ? 0.3 : 0.03;
      else density = 0.12 * n;
      if (rng() > density) continue;
      const h = heightAt(px, pz);
      if (h < WATER_LEVEL + 1.5 || h > 150) continue;
      if (slopeAt(px, pz) > 0.9) continue;
      if (distToAnyRoad(px, pz) < 9) continue;
      let blocked = false;
      for (const e of exclusions) if ((px - e.x) ** 2 + (pz - e.z) ** 2 < e.r * e.r) { blocked = true; break; }
      if (blocked) continue;
      let type;
      if (zn === 'villain') type = rng() < 0.6 ? 0 : 3;
      else if (zn === 'elves') type = rng() < 0.45 ? 0 : rng() < 0.75 ? 1 : 2;
      else type = rng() < 0.3 ? 0 : rng() < 0.6 ? 1 : 2;
      const s = 0.75 + rng() * 0.6 + (zn === 'elves' ? 0.35 : 0);
      const t = { x: px, y: h - 0.2, z: pz, s, rot: rng() * Math.PI * 2, type, r: TYPES[type].r * s };
      trees.push(t);
      const k = cellKey(px, pz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    }
  }

  // --- render resources ---
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  TYPES.forEach((type, ti) => {
    const geo = type.make();
    geo.computeVertexNormals();
    const tex = renderImpostor(geo, type);
    const list = trees.filter(t => t.type === ti);
    // billboards (all trees of this type, shader hides near ones)
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = quad.index; ig.attributes.position = quad.attributes.position; ig.attributes.uv = quad.attributes.uv;
    const inst = new Float32Array(list.length * 4);
    list.forEach((t, k) => inst.set([t.x, t.y, t.z, t.s], k * 4));
    ig.setAttribute('inst', new THREE.InstancedBufferAttribute(inst, 4));
    ig.instanceCount = list.length;
    const bmat = new THREE.ShaderMaterial({
      vertexShader: billboardVS, fragmentShader: billboardFS,
      uniforms: {
        map: { value: tex }, camPos: { value: new THREE.Vector3() }, size: { value: new THREE.Vector2(type.w, type.h) },
        nearR: { value: NEAR }, fogColor: { value: new THREE.Color() }, fogNear: { value: 100 }, fogFar: { value: 900 },
        light: { value: 1 },
      },
    });
    const bb = new THREE.Mesh(ig, bmat);
    bb.frustumCulled = false;
    bb.name = 'tree-billboards-' + type.name;
    game.scene.add(bb);
    // 3D trees near the camera
    const mesh3d = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), 1500);
    mesh3d.castShadow = true; mesh3d.receiveShadow = true;
    mesh3d.count = 0; mesh3d.frustumCulled = false;
    game.scene.add(mesh3d);
    typeData.push({ bb, bmat, mesh3d });
  });

  game.addSystem({ name: 'trees', order: 90, update: updateTrees });
  console.log('trees placed:', trees.length);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _near = [];
function updateTrees() {
  const cam = game.camera.position;
  const fog = game.scene.fog;
  const light = game.ambientLevel ?? 1;
  for (const d of typeData) {
    d.bmat.uniforms.camPos.value.copy(cam);
    if (fog) { d.bmat.uniforms.fogColor.value.copy(fog.color); d.bmat.uniforms.fogNear.value = fog.near; d.bmat.uniforms.fogFar.value = fog.far; }
    d.bmat.uniforms.light.value = light;
  }
  if (lastRefresh.distanceToSquared(cam) < 16) return;
  lastRefresh.copy(cam);
  _near.length = 0;
  treesNear(cam.x, cam.z, NEAR + 8, _near);
  const counts = typeData.map(() => 0);
  const R2 = (NEAR + 6) ** 2;
  for (const t of _near) {
    if ((t.x - cam.x) ** 2 + (t.z - cam.z) ** 2 > R2) continue;
    const d = typeData[t.type];
    if (counts[t.type] >= 1500) continue;
    _q.setFromAxisAngle(_up, t.rot); _s.setScalar(t.s); _p.set(t.x, t.y, t.z);
    _m.compose(_p, _q, _s);
    d.mesh3d.setMatrixAt(counts[t.type]++, _m);
  }
  typeData.forEach((d, i) => { d.mesh3d.count = counts[i]; d.mesh3d.instanceMatrix.needsUpdate = true; });
}
