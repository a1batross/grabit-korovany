// Squads: a group of NPCs marching in formation behind a leader along a route, then assaulting a target.
// Used by raids, patrol-raids from the commander, and the player's army orders.
import { game } from '../../core/game.js';
import { hostilesNear, dist, shout } from './util.js';

export const squads = new Set();

// formation slot i (0 = leader) -> {ox, oz} relative to leader facing (AI 'follow' order)
export function formationSlot(i, cols = 3, spacing = 1.9, back = 2.6) {
  const k = i - 1;
  const row = Math.floor(k / cols), col = k % cols;
  return { ox: (col - (cols - 1) / 2) * spacing, oz: -back - row * spacing };
}

const CRIES = {
  guard: ['За императора!', 'Вперёд, братцы!', 'Строем, не отставать!'],
  villain: ['За Злого!', 'Жги! Грабь!', 'Хозяин будет доволен!'],
  elves: ['За лес!', 'Тихо... окружаем', 'Смерть захватчикам!'],
  humans: ['Держись!'],
};

let nextId = 1;
export class Squad {
  // o: { members, faction, name, route:[[x,z]], target:{x,z,r} | ()=>{x,z,r}, onEnd(result, squad), returnHome:{x,z}|null,
  //      speed (leader speedMul while marching), assaultTime (max), cols, kind }
  constructor(o) {
    this.id = nextId++;
    Object.assign(this, { route: [], cols: 3, speed: 0.85, assaultTime: 240, kind: 'raid' }, o);
    this.members = [...o.members];
    this.initial = this.members.length;
    this.wp = 0; this.state = 'march'; this.t = 0; this.stateT = 0; this.clearT = 0;
    this.leader = null;
    this.acc = Math.random() * 0.5;
    for (const m of this.members) { m.squad = this; m._baseSpeed = m._baseSpeed ?? m.speedMul; }
    squads.add(this);
  }
  get tgt() { return typeof this.target === 'function' ? this.target() : this.target; }
  alive() { return this.members.filter(m => m.alive && !m.removed); }

  setLeader(L) {
    this.leader = L;
    this.members.forEach((m, i) => { if (m !== L) m.speedMul = m._baseSpeed; });
    L.speedMul = L._baseSpeed * this.speed;
    if (L.ai) L.ai.courage = Math.max(L.ai.courage, 0.8);
    let slot = 1;
    for (const m of this.members) {
      if (m === L) continue;
      const f = formationSlot(slot++, this.cols);
      m.ai?.setOrder({ type: 'follow', leader: L, ox: f.ox, oz: f.oz });
    }
  }

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.5) return;
    const sdt = this.acc; this.acc = 0;
    this.t += sdt; this.stateT += sdt;
    this.members = this.alive();
    if (!this.members.length) return this.end('wiped');
    const tg = this.tgt;
    if (!tg) return this.end('lost');
    if (this.state === 'march') {
      let L = this.members.find(m => !m.ai?.fleeing && m.moveMode === 'walk') ?? this.members[0];
      // morale: a shattered column gives up
      if (this.members.length <= Math.max(1, Math.floor(this.initial * 0.25)) && this.initial >= 3
        && hostilesNear(this.faction, L.pos.x, L.pos.z, 30).length > this.members.length * 2) return this.end('repelled');
      if (L !== this.leader) this.setLeader(L);
      if (this.hold?.()) { if (L.ai && L.ai.order.type !== 'guard') L.ai.setOrder({ type: 'guard', x: L.pos.x, z: L.pos.z, r: 2 }); this.stateT = 0; return; }
      const dest = this.wp < this.route.length ? { x: this.route[this.wp][0], z: this.route[this.wp][1] } : tg;
      const o = L.ai?.order;
      if (o?.type !== 'goto' || o.x !== dest.x || o.z !== dest.z) L.ai?.setOrder({ type: 'goto', x: dest.x, z: dest.z, r: 3, run: false, then: { type: 'guard', x: dest.x, z: dest.z, r: 3 } });
      if (this.wp < this.route.length && dist(L.pos, dest) < 9) this.wp++;
      // no progress towards the waypoint for a while (stuck on a wall / in a brawl): skip it
      const dd = dist(L.pos, dest);
      if (this.bestD == null || dd < this.bestD - 2 || this.bestWp !== this.wp) { this.bestD = dd; this.bestWp = this.wp; this.stuckT = 0; }
      else if ((this.stuckT += sdt) > 20 && !L.ai?.target) { this.stuckT = 0; this.bestD = null; if (this.wp < this.route.length) this.wp++; else this.startAssault(); }
      if ((this.wp >= this.route.length && dist(L.pos, tg) < (tg.r ?? 30) + 25) || this.stateT > 600) this.startAssault();
    } else if (this.state === 'assault') {
      const enemies = this.enemies ? this.enemies() : hostilesNear(this.faction, tg.x, tg.z, (tg.r ?? 30) + 25);
      if (enemies.length === 0) this.clearT += sdt; else this.clearT = 0;
      if (this.clearT > (this.clearTime ?? 12)) return this.end('won');
      if (this.members.length <= Math.max(1, Math.floor(this.initial * 0.25)) && enemies.length > this.members.length * 2) return this.end('repelled');
      if (this.stateT > this.assaultTime) return this.end('timeout');
      // stragglers outside the walls go round through the gate instead of hugging the wall
      if (this.entry) {
        const [gate, inner] = this.entry, di = dist(inner, tg) + 8;
        for (const m of this.members) {
          const ao = m.ai?.order;
          if (ao?.type !== 'assault' || m.ai.target || dist(m.pos, tg) <= di) continue;
          const back = { type: 'assault', x: tg.x, z: tg.z, r: tg.r ?? 30 };
          const viaInner = { type: 'goto', x: inner.x, z: inner.z, r: 3, then: back };
          m.ai.setOrder(dist(m.pos, gate) < 6 ? viaInner : { type: 'goto', x: gate.x, z: gate.z, r: 3, then: viaInner });
        }
      }
      // keep the assault order anchored on a moving target (caravans)
      if (typeof this.target === 'function') for (const m of this.members) { const ao = m.ai?.order; if (ao?.type === 'assault') { ao.x = tg.x; ao.z = tg.z; } }
    } else if (this.state === 'return') {
      const h = this.returnHome;
      if (!h || this.members.every(m => dist(m.pos, h) < 25) || this.stateT > 400) return this.dissolve('home');
      const L = this.members.find(m => !m.ai?.fleeing && m.moveMode === 'walk') ?? this.members[0];
      if (L !== this.leader) this.setLeader(L);
      if (L.ai?.order?.type !== 'goto') L.ai?.setOrder({ type: 'goto', x: h.x, z: h.z, r: 6 });
    }
  }

  startAssault() {
    if (this.state === 'assault') return;
    this.state = 'assault'; this.stateT = 0;
    const tg = this.tgt;
    for (const m of this.members) { m.speedMul = m._baseSpeed; m.ai?.setOrder({ type: 'assault', x: tg.x, z: tg.z, r: tg.r ?? 30 }); }
    const L = this.members[0];
    const cries = CRIES[this.faction] ?? CRIES.humans;
    shout(L, this.cry ?? cries[Math.floor(Math.random() * cries.length)], { range: 90 });
    this.onAssault?.(this);
  }

  end(result) {
    if (this.ended) return;
    this.ended = true; this.result = result;
    try { this.onEnd?.(result, this); } catch (e) { console.error(e); }
    if (this.returnHome && this.members.length && result !== 'wiped') {
      this.state = 'return'; this.stateT = 0; this.leader = null;
      return;
    }
    this.dissolve(result);
  }

  // release members back to the world (transient members are cleaned up later by population)
  dissolve(why = '') {
    squads.delete(this);
    for (const m of this.members) {
      if (m.squad === this) m.squad = null;
      m.speedMul = m._baseSpeed ?? m.speedMul;
      if (m.alive && !this.keepOrders) m.ai?.setOrder(this.afterOrder ? this.afterOrder(m, why) : { type: 'wander', x: m.pos.x, z: m.pos.z, r: 20 });
    }
    this.dissolved = true;
    this.onDissolve?.(why, this);
  }

  // detach members without changing their orders (e.g. player re-orders his army)
  release(members) {
    for (const m of members) {
      const i = this.members.indexOf(m);
      if (i >= 0) this.members.splice(i, 1);
      if (m.squad === this) m.squad = null;
      m.speedMul = m._baseSpeed ?? m.speedMul;
      if (m === this.leader) this.leader = null;
    }
    if (!this.members.length) { squads.delete(this); this.dissolved = true; }
  }
}

export function updateSquads(dt) { for (const s of [...squads]) s.update(dt); }
export function clearSquads() { for (const s of [...squads]) s.dissolve('clear'); squads.clear(); }
