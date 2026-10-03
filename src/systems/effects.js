// Blood particles, blood pools, flying severed limbs (3D debris that stays on the ground), sparks.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { groundAt } from '../world/terrain.js';

const MAX_P = 3000;
let points, pPos, pCol, pVel, pLife, pCount = 0, pNext = 0;
const debris = [];  // { obj, vel, ang, rest, born, r }
const decals = [];
const MAX_DEBRIS = 140, MAX_DECALS = 220;
let decalGeo, decalMat;

export function initEffects() {
  const geo = new THREE.BufferGeometry();
  pPos = new Float32Array(MAX_P * 3); pCol = new Float32Array(MAX_P * 3);
  pVel = new Float32Array(MAX_P * 3); pLife = new Float32Array(MAX_P);
  geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, sizeAttenuation: true }));
  points.frustumCulled = false;
  game.scene.add(points);
  decalGeo = new THREE.CircleGeometry(1, 10); decalGeo.rotateX(-Math.PI / 2);
  decalMat = new THREE.MeshLambertMaterial({ color: 0x5a0606, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

  game.addSystem({ name: 'effects', order: 80, update: updateEffects });

  game.bus.on('actor:hit', ({ target, damage }) => {
    const p = target.pos;
    spray(p.x, p.y + target.currentHeight * 0.65, p.z, Math.min(40, 6 + damage * 1.2), 3.5);
  });
  game.bus.on('actor:dismember', ({ actor, part, object, dir }) => {
    const p = actor.pos;
    spray(p.x, p.y + (part.startsWith('leg') ? 0.6 : part === 'head' || part.startsWith('eye') ? 1.6 : 1.3) * actor.scale, p.z, 160, 5);
    bloodPool(p.x, p.z, 0.6 + Math.random() * 0.4);
    if (object) {
      const d = dir ? dir.clone() : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
      d.y = 0; d.normalize();
      addDebris(object, new THREE.Vector3(d.x * 3 + (Math.random() - 0.5) * 2, 3 + Math.random() * 3, d.z * 3 + (Math.random() - 0.5) * 2),
        part === 'head' ? 0.13 : part.startsWith('eye') ? 0.03 : 0.12);
    }
  });
  game.bus.on('actor:death', ({ actor }) => {
    setTimeout(() => { if (!actor.removed) bloodPool(actor.pos.x + (Math.random() - 0.5), actor.pos.z + (Math.random() - 0.5), 0.9 + Math.random() * 0.7); }, 700);
  });
  game.bus.on('block', ({ pos }) => sparks(pos.x, pos.y, pos.z));
}

export function spray(x, y, z, n, speed = 3, color = [0.55, 0.02, 0.02]) {
  for (let i = 0; i < n; i++) {
    const k = pNext; pNext = (pNext + 1) % MAX_P; pCount = Math.max(pCount, pNext === 0 ? MAX_P : pNext);
    pPos[k * 3] = x; pPos[k * 3 + 1] = y; pPos[k * 3 + 2] = z;
    pVel[k * 3] = (Math.random() - 0.5) * speed; pVel[k * 3 + 1] = Math.random() * speed * 0.9; pVel[k * 3 + 2] = (Math.random() - 0.5) * speed;
    const s = 0.7 + Math.random() * 0.5;
    pCol[k * 3] = color[0] * s; pCol[k * 3 + 1] = color[1] * s; pCol[k * 3 + 2] = color[2] * s;
    pLife[k] = 0.6 + Math.random() * 0.9;
  }
}
export function sparks(x, y, z) { spray(x, y, z, 25, 5, [1.0, 0.85, 0.3]); }

export function bloodPool(x, z, size = 0.7) {
  const m = new THREE.Mesh(decalGeo, decalMat);
  m.position.set(x, groundAt(x, z) + 0.04, z);
  m.scale.setScalar(0.1);
  m.userData.target = size;
  m.rotation.y = Math.random() * 6;
  game.scene.add(m);
  decals.push(m);
  if (decals.length > MAX_DECALS) game.scene.remove(decals.shift());
}

export function addDebris(obj, vel, r = 0.12) {
  obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
  debris.push({ obj, vel, ang: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12), rest: false, r, bleed: 2.5 });
  if (debris.length > MAX_DEBRIS) { const d = debris.shift(); d.obj.parent?.remove(d.obj); }
}

// Pick up / remove debris near a point (used by inventory to pick up severed limbs... why not)
export function debrisNear(x, z, r) { return debris.filter(d => (d.obj.position.x - x) ** 2 + (d.obj.position.z - z) ** 2 < r * r); }
export function removeDebris(d) { const i = debris.indexOf(d); if (i >= 0) debris.splice(i, 1); d.obj.parent?.remove(d.obj); }

const _v = new THREE.Vector3();
function updateEffects(dt) {
  // particles
  for (let k = 0; k < pCount; k++) {
    if (pLife[k] <= 0) continue;
    pLife[k] -= dt;
    if (pLife[k] <= 0) { pPos[k * 3 + 1] = -9999; continue; }
    pVel[k * 3 + 1] -= 12 * dt;
    pPos[k * 3] += pVel[k * 3] * dt; pPos[k * 3 + 1] += pVel[k * 3 + 1] * dt; pPos[k * 3 + 2] += pVel[k * 3 + 2] * dt;
    const g = groundAt(pPos[k * 3], pPos[k * 3 + 2]) + 0.02;
    if (pPos[k * 3 + 1] < g) { pPos[k * 3 + 1] = g; pVel[k * 3] *= 0.3; pVel[k * 3 + 1] = 0; pVel[k * 3 + 2] *= 0.3; }
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.color.needsUpdate = true;
  // decals grow
  for (const m of decals) { const t = m.userData.target; if (m.scale.x < t) m.scale.setScalar(Math.min(t, m.scale.x + dt * 0.6)); }
  // debris
  for (const d of debris) {
    if (d.rest) continue;
    d.vel.y -= 15 * dt;
    d.obj.position.addScaledVector(d.vel, dt);
    d.obj.rotation.x += d.ang.x * dt; d.obj.rotation.y += d.ang.y * dt; d.obj.rotation.z += d.ang.z * dt;
    if (d.bleed > 0) { d.bleed -= dt; if (Math.random() < 0.5) { d.obj.getWorldPosition(_v); spray(_v.x, _v.y, _v.z, 2, 1); } }
    const g = groundAt(d.obj.position.x, d.obj.position.z) + d.r;
    if (d.obj.position.y < g) {
      d.obj.position.y = g;
      if (Math.abs(d.vel.y) < 1.5) {
        d.vel.set(0, 0, 0); d.rest = true;
        // lie flat-ish
        d.obj.rotation.x = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.4;
        d.obj.rotation.z = (Math.random() - 0.5) * 0.4;
        bloodPool(d.obj.position.x, d.obj.position.z, 0.35);
      } else {
        d.vel.y = -d.vel.y * 0.35; d.vel.x *= 0.6; d.vel.z *= 0.6; d.ang.multiplyScalar(0.6);
      }
    }
  }
}
