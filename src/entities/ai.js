// NPC brains. Orders (set by squads/commanders/raid director):
//   { type: 'wander', x, z, r }        - mill about an area (default)
//   { type: 'guard', x, z, r, yaw }     - stand at a post, engage hostiles that come close
//   { type: 'goto', x, z, then }        - walk somewhere, then switch to order `then` (or guard there)
//   { type: 'follow', leader, ox, oz }  - follow a leader keeping formation offset (relative to leader facing)
//   { type: 'patrol', points, i }       - loop through waypoints
//   { type: 'assault', x, z, r }        - march to an area and fight everything hostile there
//   { type: 'caravan' }                 - handled by caravan system (no own movement)
import { game } from '../core/game.js';
import { isHostile } from '../systems/factions.js';
import { treesNear } from '../world/trees.js';
import { segmentBlocked } from '../world/colliders.js';

const _near = [];

export class AI {
  constructor(actor, order = null) {
    this.actor = actor;
    this.order = order ?? { type: 'wander', x: actor.pos.x, z: actor.pos.z, r: 15 };
    this.target = null;
    this.think = Math.random() * 0.5;
    this.wanderPt = null; this.wanderWait = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.stuckT = 0; this.lastPos = actor.pos.clone(); this.avoid = 0;
    this.fleeing = false;
    this.courage = actor.role === 'civilian' || actor.role === 'merchant' ? 0 : 0.2 + Math.random() * 0.8;
    this.aggroRange = null; // override sight
    this.leash = 120;       // max chase distance from order anchor
    this.passive = false;   // never initiates fights (civilians)
    if (actor.role === 'civilian' || actor.role === 'merchant' || actor.role === 'healer') this.passive = true;
  }

  setOrder(o) { this.order = o; this.wanderPt = null; }

  perceive() {
    const a = this.actor;
    const range = this.aggroRange ?? a.sightRange;
    let best = null, bd = Infinity;
    for (const t of game.actors) {
      if (!t.alive || t === a) continue;
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
      const d = dx * dx + dz * dz;
      if (d > range * range) continue;
      if (!isHostile(a, t)) continue;
      // can't see things behind you unless very close or they hit you recently
      const f = a.forward;
      const dd = Math.sqrt(d);
      const facing = (dx * f.x + dz * f.z) / (dd || 1);
      if (facing < -0.2 && dd > 8 && a.lastHitBy !== t) continue;
      // stealth: crouching/crawling player in forest is harder to notice
      let eff = d;
      if (t.isPlayer && t.moveMode === 'crawl') eff *= 2.5;
      if (t.isPlayer && game.playerStealth) eff *= game.playerStealth;
      if (eff > range * range) continue;
      if (eff < bd) { bd = eff; best = t; }
    }
    return best;
  }

  update(dt) {
    const a = this.actor;
    const it = a.intent;
    it.mx = 0; it.mz = 0; it.run = false; it.block = false; it.yaw = null;
    if (!a.alive) return;
    this.dt = dt;

    this.think -= dt;
    if (this.think <= 0) {
      this.think = a.lod >= 2 ? 1.2 : 0.35 + Math.random() * 0.2;
      if (this.order.type !== 'caravan' || a.role !== 'cargo') {
        const seen = this.perceive();
        if (this.target && (!this.target.alive || this.target.removed)) this.target = null;
        if (!this.target || (seen && seen !== this.target && a.pos.distanceToSquared(seen.pos) < a.pos.distanceToSquared(this.target.pos) * 0.5)) this.target = seen;
        if (this.target && !isHostile(a, this.target)) this.target = null;
      }
      // morale
      const hurt = a.hp / a.maxHp;
      this.fleeing = (this.passive && (this.target || a.lastHitBy && game.time - a.lastHitTime < 10))
        || a.armsOk === 0 || (hurt < 0.25 && this.courage < 0.5) || (a.moveMode === 'crawl' && this.courage < 0.7);
      if (this.passive && !this.fleeing) this.target = null;
      if (this.passive && this.fleeing && !this.target && a.lastHitBy?.alive) this.target = a.lastHitBy;
    }

    if (a.moveMode === 'crawl' && this.fleeing) {
      // crawls away moaning
      if (this.target) this.moveAway(this.target.pos.x, this.target.pos.z);
      return;
    }
    if (this.target && this.fleeing) { this.moveAway(this.target.pos.x, this.target.pos.z); it.run = true; return; }

    if (this.target && !this.passive) {
      const anchor = this.anchor();
      if (anchor && Math.hypot(this.target.pos.x - anchor.x, this.target.pos.z - anchor.z) > this.leash) { this.target = null; }
      else { this.fight(dt); return; }
    }
    this.followOrder(dt);
  }

  anchor() {
    const o = this.order;
    if (o.type === 'follow') return o.leader?.alive ? o.leader.pos : null;
    if (o.x != null) return o;
    return null;
  }

  fight(dt) {
    const a = this.actor, t = this.target, it = a.intent;
    const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const w = a.activeWeapon;
    it.yaw = Math.atan2(dx, dz);
    if (w.ranged) {
      const ideal = 16;
      const blocked = d > 3 && segmentBlocked(a.pos.x, a.pos.y + 1.5, a.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z);
      if (d > 45 || blocked) this.steer(dx / d, dz / d, true);
      else if (d < 7) this.steer(-dx / d, -dz / d, true);
      else if (Math.abs(d - ideal) > 4) this.steer(Math.sign(d - ideal) * dx / d * 0.6, Math.sign(d - ideal) * dz / d * 0.6, false);
      if (d < 55 && !blocked && a.attackT < 0 && Math.random() < dt * 1.4) it.attack = true;
      return;
    }
    const reach = w.reach + t.radius;
    if (d > reach * 0.9) {
      this.steer(dx / d, dz / d, d > 6);
    } else {
      // circle/strafe a bit, attack when ready
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 1 + Math.random() * 2; this.strafe = -this.strafe; }
      const px = -dz / d * this.strafe * 0.4, pz = dx / d * this.strafe * 0.4;
      it.mx = px - (d < reach * 0.5 ? dx / d * 0.5 : 0); it.mz = pz - (d < reach * 0.5 ? dz / d * 0.5 : 0);
      if (a.attackT < 0 && a.attackCooldown <= 0 && Math.random() < dt * (1.6 + (a.aggression ?? 0))) it.attack = true;
    }
    // block when the target swings at us
    if (t.attackT >= 0 && t.attackT < 0.5 && d < reach + 1 && a.canBlock && Math.random() < (a.shield ? 0.75 : 0.35)) it.block = true;
  }

  followOrder(dt) {
    const a = this.actor, it = a.intent, o = this.order;
    switch (o.type) {
      case 'caravan': return;
      case 'goto': case 'assault': {
        const d = Math.hypot(o.x - a.pos.x, o.z - a.pos.z);
        if (d > (o.r ?? 3) * (o.type === 'assault' ? 0.5 : 1)) { this.steer((o.x - a.pos.x) / d, (o.z - a.pos.z) / d, o.run ?? d > 30); return; }
        if (o.type === 'assault') { this.aggroRange = 60; this.wander(o.x, o.z, o.r ?? 30); return; }
        if (o.then) { this.setOrder(o.then); return; }
        this.setOrder({ type: 'guard', x: o.x, z: o.z, r: 4 });
        return;
      }
      case 'follow': {
        const L = o.leader;
        if (!L || !L.alive) { this.setOrder({ type: 'wander', x: a.pos.x, z: a.pos.z, r: 10 }); return; }
        const f = L.forward, rx = -f.z, rz = f.x;
        const tx = L.pos.x + rx * (o.ox ?? 0) + f.x * (o.oz ?? -3), tz = L.pos.z + rz * (o.ox ?? 0) + f.z * (o.oz ?? -3);
        const d = Math.hypot(tx - a.pos.x, tz - a.pos.z);
        if (d > 1.2) this.steer((tx - a.pos.x) / d, (tz - a.pos.z) / d, d > 5 || Math.hypot(L.vel.x, L.vel.z) > 5, Math.min(1, d / 2));
        else it.yaw = L.yaw;
        return;
      }
      case 'patrol': {
        const p = o.points[o.i ?? 0];
        const d = Math.hypot(p[0] - a.pos.x, p[1] - a.pos.z);
        if (d < 2.5) { o.i = ((o.i ?? 0) + 1) % o.points.length; return; }
        this.steer((p[0] - a.pos.x) / d, (p[1] - a.pos.z) / d, false, 0.6);
        return;
      }
      case 'guard': {
        const d = Math.hypot(o.x - a.pos.x, o.z - a.pos.z);
        if (d > (o.r ?? 2)) this.steer((o.x - a.pos.x) / d, (o.z - a.pos.z) / d, d > 15);
        else if (o.yaw != null) it.yaw = o.yaw;
        return;
      }
      case 'wander': default:
        this.wander(o.x ?? a.home.x, o.z ?? a.home.z, o.r ?? 15);
    }
  }

  wander(cx, cz, r) {
    const a = this.actor;
    if (this.wanderWait > 0) { this.wanderWait -= this.dt ?? 1 / 60; return; }
    if (!this.wanderPt) {
      const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
      this.wanderPt = { x: cx + Math.cos(ang) * rr, z: cz + Math.sin(ang) * rr };
    }
    const dx = this.wanderPt.x - a.pos.x, dz = this.wanderPt.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.5) { this.wanderPt = null; this.wanderWait = 2 + Math.random() * 6; return; }
    this.steer(dx / d, dz / d, false, 0.5);
  }

  moveAway(x, z) {
    const a = this.actor;
    const dx = a.pos.x - x, dz = a.pos.z - z, d = Math.hypot(dx, dz) || 1;
    this.steer(dx / d, dz / d, true);
  }

  // Steering with simple tree avoidance and unsticking.
  steer(dx, dz, run = false, speed = 1) {
    const a = this.actor, it = a.intent;
    if (a.lod < 2) {
      _near.length = 0;
      treesNear(a.pos.x + dx * 2, a.pos.z + dz * 2, 2.5, _near);
      let ax = 0, az = 0;
      for (const t of _near) {
        const ox = t.x - a.pos.x, oz = t.z - a.pos.z;
        const ahead = ox * dx + oz * dz;
        if (ahead <= 0 || ahead > 3.5) continue;
        const side = ox * -dz + oz * dx; // lateral offset
        if (Math.abs(side) < t.r + a.radius + 0.4) { const s = side >= 0 ? -1 : 1; ax += -dz * s; az += dx * s; }
      }
      dx += ax * 0.8; dz += az * 0.8;
    }
    // stuck detection
    this.stuckT += this.dt ?? 1 / 60;
    if (this.stuckT > 1) {
      if (a.pos.distanceToSquared(this.lastPos) < 0.3) this.avoid = 1.2;
      this.lastPos.copy(a.pos); this.stuckT = 0;
    }
    if (this.avoid > 0) { this.avoid -= this.dt ?? 1 / 60; const t = dx; dx = dx * 0.3 - dz * this.strafe; dz = dz * 0.3 + t * this.strafe; }
    const l = Math.hypot(dx, dz) || 1;
    it.mx = dx / l * speed; it.mz = dz / l * speed; it.run = run;
  }
}
