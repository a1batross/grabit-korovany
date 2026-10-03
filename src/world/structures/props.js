// Natural props: boulders and bushes (InstancedMesh, whole world, 1 draw call each) and grass tufts that are
// re-scattered around the camera (cheap instancing, like the tree LOD).
import * as THREE from 'three';
import { game } from '../../core/game.js';
import { mulberry32, fbm } from '../../core/rng.js';
import { heightAt, slopeAt, WATER_LEVEL } from '../terrain.js';
import { WORLD_HALF, zoneAt, distToAnyRoad, LOC } from '../zones.js';
import { addCircle } from '../colliders.js';
import { exclusions } from './kit.js';

// coarse bitmap of building footprints (4m cells) for fast "is this spot free" tests
const BC = 4, BN = Math.ceil((WORLD_HALF * 2) / BC);
let blocked = null;
function buildBlocked() {
  blocked = new Uint8Array(BN * BN);
  for (const e of exclusions) {
    const r = e.r;
    const i0 = Math.max(0, Math.floor((e.x - r + WORLD_HALF) / BC)), i1 = Math.min(BN - 1, Math.floor((e.x + r + WORLD_HALF) / BC));
    const j0 = Math.max(0, Math.floor((e.z - r + WORLD_HALF) / BC)), j1 = Math.min(BN - 1, Math.floor((e.z + r + WORLD_HALF) / BC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = -WORLD_HALF + (i + 0.5) * BC, cz = -WORLD_HALF + (j + 0.5) * BC;
      if ((cx - e.x) ** 2 + (cz - e.z) ** 2 < (r + 2) ** 2) blocked[j * BN + i] = 1;
    }
  }
}
export function isBlocked(x, z) {
  const i = Math.floor((x + WORLD_HALF) / BC), j = Math.floor((z + WORLD_HALF) / BC);
  if (i < 0 || j < 0 || i >= BN || j >= BN) return true;
  return blocked[j * BN + i] === 1;
}
// distance-to-road cache on the same grid (roads are polylines; computing per tuft is too slow)
let roadNear = null;
function buildRoadNear() {
  roadNear = new Uint8Array(BN * BN);
  for (let j = 0; j < BN; j++) for (let i = 0; i < BN; i++) {
    const x = -WORLD_HALF + (i + 0.5) * BC, z = -WORLD_HALF + (j + 0.5) * BC;
    roadNear[j * BN + i] = Math.min(255, distToAnyRoad(x, z));
  }
}
const roadDist = (x, z) => {
  const i = Math.floor((x + WORLD_HALF) / BC), j = Math.floor((z + WORLD_HALF) / BC);
  return roadNear[Math.max(0, Math.min(BN - 1, j)) * BN + Math.max(0, Math.min(BN - 1, i))];
};

function rockGeo(seed) {
  const r = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  // deterministic per-position jitter so shared vertices stay welded
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const n = 0.78 + 0.35 * Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453 % 1);
    p.setXYZ(k, x * n * 1.15, y * n * 0.7, z * n);
  }
  g.computeVertexNormals();
  void r;
  return g;
}
function bushGeo() {
  const parts = [];
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.scale(1, 0.75, 1); g.translate(0, 0.55, 0);
  parts.push(g);
  return g;
}
function tuftGeo() {
  const pos = [], col = [];
  const base = new THREE.Color('#5a8634'), tip = new THREE.Color('#b8d870');
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI + 0.3, lean = 0.25 + (b % 2) * 0.2, h = 0.45 + (b % 3) * 0.15, w = 0.07;
    const cx = Math.cos(a), sz = Math.sin(a);
    const ox = Math.cos(a + 1.3) * 0.08 * b, oz = Math.sin(a + 1.3) * 0.08 * b;
    const p0 = [ox - cx * w, 0, oz - sz * w], p1 = [ox + cx * w, 0, oz + sz * w], p2 = [ox + Math.cos(a + 1.57) * lean * h, h, oz + Math.sin(a + 1.57) * lean * h];
    pos.push(...p0, ...p1, ...p2);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // point normals up so blades light like the ground
  const n = g.attributes.normal; for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
  return g;
}

export function buildProps() {
  buildBlocked();
  buildRoadNear();
  const rng = mulberry32(777);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  // ---- boulders ----
  const rocks = [];
  for (let k = 0; k < 9000 && rocks.length < 2600; k++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 20), z = (rng() * 2 - 1) * (WORLD_HALF - 20);
    const zn = zoneAt(x, z).id;
    const sl = slopeAt(x, z);
    const pr = zn === 'villain' ? 0.6 : zn === 'humans' ? 0.12 : 0.22;
    if (rng() > pr + sl * 0.5) continue;
    if (isBlocked(x, z) || roadDist(x, z) < 7) continue;
    const h = heightAt(x, z);
    if (h < WATER_LEVEL - 0.5 || h > 115) continue;
    const sc = (0.35 + rng() ** 3 * 2.6) * (zn === 'villain' ? 1.4 : 1);
    rocks.push({ x, z, y: h - sc * 0.25, s: sc, rot: rng() * 6.28, tilt: rng() * 0.4, zn });
  }
  const rockMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const rmesh = new THREE.InstancedMesh(rockGeo(3), rockMat, rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(r.tilt, r.rot, r.tilt * 0.5));
    s.set(r.s, r.s, r.s); p.set(r.x, r.y, r.z);
    rmesh.setMatrixAt(i, m.compose(p, q, s));
    c.set(r.zn === 'villain' ? '#6a6670' : '#8a8780').offsetHSL(0, 0, (rng() - 0.5) * 0.12);
    rmesh.setColorAt(i, c);
    if (r.s > 1.1) addCircle(r.x, r.z, r.s * 0.95, r.y + r.s * 0.75, true);
  });
  rmesh.castShadow = false; rmesh.receiveShadow = true; rmesh.name = 'props:rocks';
  rmesh.computeBoundingSphere();
  game.scene.add(rmesh);

  // ---- bushes ----
  const bushes = [];
  for (let k = 0; k < 16000 && bushes.length < 3200; k++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 30), z = (rng() * 2 - 1) * (WORLD_HALF - 30);
    const zn = zoneAt(x, z).id;
    if (zn === 'villain' && rng() > 0.15) continue;
    const n = fbm(x / 120, z / 120, 2, 55) * 0.5 + 0.5;
    const pr = zn === 'elves' ? 0.7 : 0.25 + n * 0.3;
    if (rng() > pr) continue;
    const h = heightAt(x, z);
    if (h < WATER_LEVEL + 0.8 || h > 140 || slopeAt(x, z) > 0.8) continue;
    if (isBlocked(x, z) || roadDist(x, z) < 6) continue;
    bushes.push({ x, z, y: h - 0.15, s: 0.6 + rng() * 0.9, rot: rng() * 6.28, zn });
  }
  const bmesh = new THREE.InstancedMesh(bushGeo(), new THREE.MeshLambertMaterial({ flatShading: true }), bushes.length);
  bushes.forEach((b, i) => {
    q.setFromAxisAngle(up, b.rot);
    s.set(b.s * (1 + rng() * 0.4), b.s, b.s * (1 + rng() * 0.3)); p.set(b.x, b.y, b.z);
    bmesh.setMatrixAt(i, m.compose(p, q, s));
    c.set(b.zn === 'elves' ? '#2f5e24' : b.zn === 'villain' ? '#4a5232' : '#4a7a2e').offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.1);
    bmesh.setColorAt(i, c);
  });
  bmesh.castShadow = false; bmesh.receiveShadow = true; bmesh.name = 'props:bushes';
  bmesh.computeBoundingSphere();
  game.scene.add(bmesh);

  // ---- grass tufts around the camera ----
  const MAXG = 2600, R = 42, STEP = 1.9;
  const gmat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const gmesh = new THREE.InstancedMesh(tuftGeo(), gmat, MAXG);
  gmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gmesh.count = 0; gmesh.frustumCulled = false; gmesh.receiveShadow = true; gmesh.name = 'props:grass';
  gmesh.setColorAt(0, c.set('#ffffff'));
  game.scene.add(gmesh);
  const last = new THREE.Vector3(1e9, 0, 0);
  const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const zc = { humans: new THREE.Color('#c8d890'), empire: new THREE.Color('#d0e090'), elves: new THREE.Color('#8ab070'), villain: new THREE.Color('#a8a080') };
  game.addSystem({
    name: 'grass', order: 91,
    update() {
      const cam = game.camera.position;
      if (last.distanceToSquared(cam) < 9) return;
      last.copy(cam);
      let n = 0;
      const i0 = Math.floor((cam.x - R) / STEP), i1 = Math.floor((cam.x + R) / STEP);
      const j0 = Math.floor((cam.z - R) / STEP), j1 = Math.floor((cam.z + R) / STEP);
      for (let j = j0; j <= j1 && n < MAXG; j++) for (let i = i0; i <= i1 && n < MAXG; i++) {
        const r1 = hash(i, j);
        if (r1 > 0.55) continue;
        const x = (i + hash(i + 7, j)) * STEP, z = (j + hash(i, j + 7)) * STEP;
        const d2 = (x - cam.x) ** 2 + (z - cam.z) ** 2;
        if (d2 > R * R) continue;
        if (isBlocked(x, z) || roadDist(x, z) < 4) continue;
        const h = heightAt(x, z);
        if (h < WATER_LEVEL + 0.6 || h > 120) continue;
        const zn = zoneAt(x, z).id;
        if (zn === 'villain' && r1 > 0.2) continue;
        const sc = 0.7 + hash(i + 3, j + 5) * 0.9;
        q.setFromAxisAngle(up, r1 * 40);
        s.set(sc, sc * (0.8 + r1), sc); p.set(x, h - 0.05, z);
        gmesh.setMatrixAt(n, m.compose(p, q, s));
        gmesh.setColorAt(n, c.copy(zc[zn]).offsetHSL(0, 0, (hash(i + 1, j + 1) - 0.5) * 0.15));
        n++;
      }
      gmesh.count = n;
      gmesh.instanceMatrix.needsUpdate = true;
      if (gmesh.instanceColor) gmesh.instanceColor.needsUpdate = true;
    },
  });
  console.log(`[buildings] props: ${rocks.length} rocks, ${bushes.length} bushes`);
  void LOC;
}
