// Melee + ranged combat. Hit location picks a body part; cutting weapons can sever limbs,
// piercing weapons can gouge eyes. Blocking (RMB / shield) negates most damage from the front.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { makeArrowMesh } from '../entities/weapons.js';
import { groundAt } from '../world/terrain.js';
import { treesNear } from '../world/trees.js';
import { segmentBlocked } from '../world/colliders.js';

const arrows = [];
const stuck = [];

export const combat = {
  resolveAttack(attacker, w) {
    if (w.ranged) return fireArrow(attacker, w);
    const f = attacker.forward;
    let best = null, bestScore = Infinity;
    for (const t of game.actors) {
      if (t === attacker || !t.alive) continue;
      const dx = t.pos.x - attacker.pos.x, dz = t.pos.z - attacker.pos.z;
      const dy = (t.pos.y + t.currentHeight * 0.5) - (attacker.pos.y + attacker.currentHeight * 0.5);
      const d = Math.hypot(dx, dz);
      if (d > w.reach + t.radius || Math.abs(dy) > 1.8) continue;
      const cos = d > 0.01 ? (dx * f.x + dz * f.z) / d : 1;
      if (cos < 0.45) continue;
      // AI only hits its intended target or hostiles (avoid chopping allies all the time)
      if (!attacker.isPlayer && attacker.ai?.target !== t && !attacker.grudges.has(t) && t.faction === attacker.faction) continue;
      const score = d * (2 - cos);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (!best) { game.bus.emit('attack:miss', { attacker }); return; }
    hitActor(attacker, best, w, pickPart(attacker, best));
  },
  update(dt) { updateArrows(dt); },
};

function pickPart(attacker, target) {
  // Player aims with camera pitch: look up = head, look down = legs.
  const pitch = attacker.isPlayer ? (attacker.aimPitch ?? 0) : (Math.random() - 0.5) * 0.6;
  const w = {
    head: 14 + Math.max(0, pitch) * 70,
    torso: 40 - Math.abs(pitch) * 30,
    armL: 13, armR: 13,
    legL: 10 + Math.max(0, -pitch) * 55,
    legR: 10 + Math.max(0, -pitch) * 55,
  };
  if (attacker.aimPart) { w[attacker.aimPart] = (w[attacker.aimPart] ?? 0) + 60; }
  if (target.moveMode === 'crawl') { w.legL *= 0.4; w.legR *= 0.4; w.head *= 1.6; }
  if (target.moveMode === 'wheelchair') { w.legL *= 0.3; w.legR *= 0.3; }
  for (const p of ['armL', 'armR', 'legL', 'legR']) if (target.limbs[p] === 'lost') w[p] = 0;
  if (target.headless) w.head = 0;
  let sum = 0; for (const k in w) sum += Math.max(0, w[k]);
  let r = Math.random() * sum;
  for (const k in w) { r -= Math.max(0, w[k]); if (r <= 0) return k; }
  return 'torso';
}

function hitActor(attacker, target, w, part, projectile = false) {
  const dir = new THREE.Vector3(target.pos.x - attacker.pos.x, 0, target.pos.z - attacker.pos.z).normalize();
  // Blocking: works if target faces the attacker
  if (target.blocking) {
    const tf = target.forward;
    if (-(dir.x * tf.x + dir.z * tf.z) > 0.35) {
      target.stamina -= projectile ? 6 : 16;
      const pos = target.pos.clone(); pos.y += target.currentHeight * 0.7; pos.addScaledVector(dir, -0.4);
      game.bus.emit('block', { target, attacker, pos, shield: target.shield });
      if (!projectile) attacker.stagger = 0.35;
      if (target.stamina > 0 && (target.shield || Math.random() < 0.75)) {
        if (attacker !== target && !target.isPlayer) target.grudges.add(attacker);
        return;
      }
    }
  }
  let dmg = w.dmg * (0.8 + Math.random() * 0.4) * (attacker.dmgMul ?? 1);
  // backstab / unaware bonus
  const tf = target.forward;
  if (dir.x * tf.x + dir.z * tf.z > 0.5 && !projectile) dmg *= 1.5;
  if (attacker.isPlayer) dmg *= game.playerDmgMul ?? 1;
  target.takeHit(dmg, part, { cut: w.cut, pierce: w.pierce, attacker, weapon: w, dir });
  if (!projectile) { target.vel.x += dir.x * 2.5; target.vel.z += dir.z * 2.5; }
}

// ---- arrows ----
function fireArrow(a, w) {
  const origin = a.pos.clone(); origin.y += a.currentHeight * 0.85;
  let dir;
  if (a.isPlayer && a.aimDir) dir = a.aimDir.clone();
  else if (a.ai?.target) {
    const t = a.ai.target;
    const tp = t.pos.clone(); tp.y += t.currentHeight * 0.6;
    const dist = origin.distanceTo(tp);
    const tof = dist / w.arrowSpeed;
    tp.addScaledVector(t.vel, tof * 0.8);
    tp.y += 0.5 * 9.8 * tof * tof; // gravity compensation
    dir = tp.sub(origin).normalize();
    const spread = 0.035 * (a.eyesOk === 2 ? 1 : 2.5);
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
  } else dir = a.forward;
  origin.addScaledVector(dir, 0.6);
  const mesh = makeArrowMesh();
  mesh.position.copy(origin);
  game.scene.add(mesh);
  arrows.push({ mesh, pos: origin, vel: dir.multiplyScalar(w.arrowSpeed), owner: a, w, life: 6 });
  game.bus.emit('arrow:fire', { actor: a });
}

const _seg = new THREE.Vector3(), _near = [];
function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const ar = arrows[i];
    ar.life -= dt;
    const prev = ar.pos.clone();
    ar.vel.y -= 9.8 * dt;
    ar.pos.addScaledVector(ar.vel, dt);
    ar.mesh.position.copy(ar.pos);
    ar.mesh.lookAt(_seg.copy(ar.pos).add(ar.vel));
    let done = false;
    // actors: closest approach of segment prev->pos to actor vertical axis
    for (const t of game.actors) {
      if (t === ar.owner || !t.alive) continue;
      const cx = t.pos.x, cz = t.pos.z;
      const sx = ar.pos.x - prev.x, sz = ar.pos.z - prev.z;
      const L2 = sx * sx + sz * sz || 1e-6;
      let u = ((cx - prev.x) * sx + (cz - prev.z) * sz) / L2; u = Math.max(0, Math.min(1, u));
      const px = prev.x + sx * u, pz = prev.z + sz * u, py = prev.y + (ar.pos.y - prev.y) * u;
      const d = Math.hypot(px - cx, pz - cz);
      const h = t.currentHeight;
      if (d < t.radius + 0.12 && py > t.pos.y && py < t.pos.y + h) {
        // part by height and lateral offset
        const rel = (py - t.pos.y) / h;
        const f = t.forward; const right = { x: -f.z, z: f.x };
        const lat = (px - cx) * right.x + (pz - cz) * right.z; // >0 = actor's left? (model left is +X local)
        let part;
        if (t.moveMode === 'crawl') part = Math.random() < 0.3 ? 'head' : 'torso';
        else if (rel > 0.84) part = 'head';
        else if (rel > 0.5) part = Math.abs(lat) > t.radius * 0.55 ? (lat > 0 ? 'armR' : 'armL') : 'torso';
        else part = lat > 0 ? 'legR' : 'legL';
        if (t.limbs[part] === 'lost') part = 'torso';
        hitActor(ar.owner, t, ar.w, part, true);
        game.scene.remove(ar.mesh);
        done = true; break;
      }
    }
    if (!done) {
      const g = groundAt(ar.pos.x, ar.pos.z);
      let stick = ar.pos.y < g;
      if (!stick) {
        _near.length = 0; treesNear(ar.pos.x, ar.pos.z, 2, _near);
        for (const t of _near) if ((t.x - ar.pos.x) ** 2 + (t.z - ar.pos.z) ** 2 < (t.r + 0.1) ** 2 && ar.pos.y < t.y + 5 * t.s) { stick = true; break; }
      }
      if (!stick && segmentBlocked(prev.x, prev.y, prev.z, ar.pos.x, ar.pos.y, ar.pos.z)) stick = true;
      if (stick || ar.life <= 0) {
        stuck.push({ mesh: ar.mesh, t: 25 });
        done = true;
      }
    }
    if (done) arrows.splice(i, 1);
  }
  for (let i = stuck.length - 1; i >= 0; i--) {
    stuck[i].t -= dt;
    if (stuck[i].t <= 0) { game.scene.remove(stuck[i].mesh); stuck.splice(i, 1); }
  }
}

export function initCombat() {
  game.combat = combat;
  game.addSystem({ name: 'combat', order: 20, update: dt => combat.update(dt) });
}
