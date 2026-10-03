// "МОЖНО ГРАБИТЬ КОРОВАНЫ" — merchant caravans: procedural wagons pulled by oxen/horses travel along the roads
// between the town, the palace, the west exit and the fort, escorted by caravan guards and a merchant.
// Anyone can attack them; once the escort is dead or fled the player loots the wagon with E.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { game } from '../../core/game.js';
import { ROADS } from '../../world/zones.js';
import { groundAt } from '../../world/terrain.js';
import { floorAt } from '../../world/colliders.js';

// Height the wagon rolls on: terrain, or a walkable deck (bridges) reachable from the current height.
const surfaceAt = (x, z, y) => Math.max(groundAt(x, z), floorAt(x, z, y, 0.8));
import { addInteractable } from '../../entities/player.js';
import { spawn } from '../../entities/spawn.js';
import { loft } from '../../entities/model-geometry.js';
import { pick, rand, randInt } from '../../core/rng.js';
import { S, stats } from './state.js';
import { shout, say, banner, playerDist, aliveCount, dist, snapActor, applySnap } from './util.js';

export const caravans = [];

// ---------- routes ----------
const rev = a => [...a].reverse();
export const ROUTES = {
  'town>palace': { pts: ROADS.townPalace, from: 'Слободы', to: 'дворец', toPrep: 'во' },
  'palace>town': { pts: rev(ROADS.townPalace), from: 'дворца', to: 'Слободу' },
  'town>west': { pts: ROADS.townWest, from: 'Слободы', to: 'западную заставу (мимо эльфов!)', toPrep: 'на' },
  'west>town': { pts: rev(ROADS.townWest), from: 'западной заставы', fromPrep: 'с', to: 'Слободу (мимо эльфов!)' },
  'town>fort': { pts: ROADS.townFort, from: 'Слободы', to: 'старый форт' },
  'fort>town': { pts: rev(ROADS.townFort), from: 'старого форта', to: 'Слободу' },
  'palace>fort': { pts: ROADS.palaceFort, from: 'дворца', to: 'старый форт' },
  'fort>palace': { pts: rev(ROADS.palaceFort), from: 'старого форта', to: 'дворец', toPrep: 'во' },
};
const MERCHANTS = ['Купец Абрам', 'Купец Садко', 'Купчиха Акулина', 'Купец Афанасий', 'Торговец Ибрагим', 'Купец Елисей'];
export const GOODS = {
  bread: { name: 'Хлеб', price: 4 }, wine: { name: 'Вино', price: 12 }, cloth: { name: 'Ткань', price: 15 },
  bandage: { name: 'Бинты', price: 10 }, potion_heal: { name: 'Зелье лечения', price: 30 },
};

// ---------- procedural meshes ----------
const _c = new THREE.Color();
function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  g.deleteAttribute('uv'); // All caravan surfaces use vertex colors, including lofted shapes.
  if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  _c.set(color);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.index) return g.toNonIndexed();
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, s = 10, open = false, t0 = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(r1, r2, h, s, 1, open, t0, tl);
let MAT = null;
function mats() {
  if (!MAT) MAT = {
    v: new THREE.MeshLambertMaterial({ vertexColors: true }),
    vd: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };
  return MAT;
}
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const wood = '#7a5230', dark = '#4a3018', cover = '#e6d9b8';
  const wagon = [
    part(box(1.7, 0.18, 3.4), wood, 0, 0.85, 0),
    part(box(0.08, 0.42, 3.4), '#6a4526', 0.85, 1.15, 0), part(box(0.08, 0.42, 3.4), '#6a4526', -0.85, 1.15, 0),
    part(box(1.7, 0.42, 0.08), '#6a4526', 0, 1.15, 1.68), part(box(1.7, 0.42, 0.08), '#6a4526', 0, 1.15, -1.68),
    part(box(0.12, 0.12, 3.9), dark, 0, 0.72, 3.5),             // tongue/shaft
    part(box(1.9, 0.12, 0.16), dark, 0, 1.45, 5.35),            // yoke
    part(box(1.6, 0.1, 0.45), dark, 0, 1.42, 1.45),             // driver seat
    part(box(0.12, 0.6, 0.12), dark, 0.9, 1.0, 0.3), part(box(0.12, 0.6, 0.12), dark, -0.9, 1.0, 0.3),
    part(box(1.95, 0.08, 0.08), dark, 0, 0.55, 1.15), part(box(1.95, 0.08, 0.08), dark, 0, 0.55, -1.15), // axles
  ];
  // canvas cover: half cylinder along z + wooden hoops
  wagon.push(part(cyl(0.95, 0.95, 3.0, 14, true, -Math.PI / 2, Math.PI), cover, 0, 1.3, 0, -Math.PI / 2));
  for (const z of [-1.4, 0, 1.4]) wagon.push(part(new THREE.TorusGeometry(0.97, 0.035, 4, 14, Math.PI), dark, 0, 1.3, z));
  const cargo = [
    part(box(0.6, 0.5, 0.6), '#9a7040', 0.4, 1.2, -1.15), part(box(0.5, 0.45, 0.5), '#8a6030', -0.35, 1.18, -1.2),
    part(box(0.45, 0.4, 0.45), '#a07848', 0.05, 1.6, -1.15),
    part(cyl(0.26, 0.26, 0.6, 10), '#6a4020', -0.45, 1.25, -0.4), part(cyl(0.27, 0.27, 0.06, 10), '#333', -0.45, 1.4, -0.4),
    part(new THREE.SphereGeometry(0.3, 8, 6), '#c8b080', 0.4, 1.2, -0.3), // sack
  ];
  const wheel = [part(new THREE.TorusGeometry(0.52, 0.06, 5, 16), dark, 0, 0, 0, 0, Math.PI / 2),
    part(cyl(0.1, 0.1, 0.16, 8), '#333', 0, 0, 0, 0, 0, Math.PI / 2)];
  for (let i = 0; i < 6; i++) wheel.push(part(box(0.05, 1.0, 0.05), wood, 0, 0, 0, i * Math.PI / 6));
  // ox body (static) + leg
  const ox = [
    part(loft([[-0.4, 0.56, 1.5], [-0.12, 0.85, 1.8], [0.22, 0.8, 1.7], [0.4, 0.55, 1.45]]), '#6a4a32', 0, 1.15, 0),
    part(loft([[-0.25, 0.31, 0.44], [0.08, 0.5, 0.55], [0.25, 0.36, 0.43]]), '#5a3a26', 0, 1.3, 1.1),
    part(box(0.36, 0.2, 0.2), '#d8c8b0', 0, 1.2, 1.42), // muzzle
    part(cyl(0.04, 0.06, 0.45, 5), '#e8e0d0', 0.32, 1.6, 1.0, 0, 0, -1.1), part(cyl(0.04, 0.06, 0.45, 5), '#e8e0d0', -0.32, 1.6, 1.0, 0, 0, 1.1),
    part(box(0.08, 0.6, 0.08), '#4a3020', 0, 1.0, -0.95, 0.3),
    part(new THREE.TorusGeometry(0.43, 0.035, 4, 12), '#3c2a20', 0, 1.15, 0.35),
  ];
  const horse = [
    part(loft([[-0.35, 0.38, 1.35], [-0.1, 0.6, 1.7], [0.22, 0.56, 1.55], [0.35, 0.38, 1.4]]), '#8a5a32', 0, 1.35, 0),
    part(loft([[-0.4, 0.38, 0.48], [0.1, 0.28, 0.32], [0.4, 0.23, 0.3]]), '#8a5a32', 0, 1.85, 0.85, 0.6),
    part(loft([[-0.15, 0.2, 0.43], [0.04, 0.28, 0.6], [0.15, 0.23, 0.42]]), '#7a4a28', 0, 2.2, 1.25, 0.3),
    part(box(0.08, 0.5, 0.29), '#2a1a10', 0, 2.05, 0.75, 0.6),
    part(box(0.1, 0.7, 0.12), '#2a1a10', 0, 1.2, -0.95, 0.4),
    part(new THREE.TorusGeometry(0.33, 0.03, 4, 12), '#3c2a20', 0, 1.35, 0.4),
  ];
  for (const s of [-1, 1]) {
    ox.push(part(new THREE.ConeGeometry(0.08, 0.22, 4), '#5a3a26', s * 0.26, 1.51, 1.1, 0, 0, -s * 1.05),
      part(new THREE.IcosahedronGeometry(0.032, 0), '#16120d', s * 0.239, 1.42, 1.25));
    horse.push(part(new THREE.ConeGeometry(0.06, 0.23, 4), '#8a5a32', s * 0.09, 2.46, 1.13, -0.2),
      part(new THREE.IcosahedronGeometry(0.026, 0), '#16120d', s * 0.135, 2.25, 1.36));
  }
  const leg = [part(loft([[-0.75, 0.105, 0.11], [-0.38, 0.125, 0.14, -0.035], [0, 0.19, 0.2]]), '#4a3222'), part(box(0.19, 0.12, 0.19), '#222', 0, -0.78, 0)];
  const hleg = [part(loft([[-0.95, 0.075, 0.08], [-0.5, 0.12, 0.13, -0.04], [0, 0.18, 0.2]]), '#7a4a28'), part(box(0.15, 0.12, 0.15), '#222', 0, -0.98, 0)];
  GEO = {
    wagon: mergeGeometries(wagon), cargo: mergeGeometries(cargo), wheel: mergeGeometries(wheel),
    ox: mergeGeometries(ox), horse: mergeGeometries(horse), leg: mergeGeometries(leg), hleg: mergeGeometries(hleg),
  };
  return GEO;
}

function buildCaravanMesh(animal) {
  const G = geos(), M = mats();
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const wagon = new THREE.Mesh(G.wagon, M.vd); wagon.castShadow = true; wagon.receiveShadow = true;
  const cargo = new THREE.Mesh(G.cargo, M.v); cargo.castShadow = true;
  root.add(wagon, cargo);
  const wheels = [];
  for (const [x, z] of [[0.98, 1.15], [-0.98, 1.15], [0.98, -1.15], [-0.98, -1.15]]) {
    const w = new THREE.Mesh(G.wheel, M.v); w.position.set(x, 0.56, z); w.castShadow = true;
    root.add(w); wheels.push(w);
  }
  const legs = [];
  const horse = animal === 'horse';
  for (const side of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(side * 0.62, 0, horse ? 4.6 : 4.4);
    const body = new THREE.Mesh(horse ? G.horse : G.ox, M.v); body.castShadow = true; a.add(body);
    const ly = horse ? 1.05 : 0.8;
    for (const [lx, lz, ph] of [[0.25, 0.7, 0], [-0.25, 0.7, Math.PI], [0.25, -0.7, Math.PI], [-0.25, -0.7, 0]]) {
      const lg = new THREE.Group(); lg.position.set(lx * (horse ? 0.8 : 1), ly, lz);
      lg.add(new THREE.Mesh(horse ? G.hleg : G.leg, M.v));
      lg.userData.ph = ph + (side > 0 ? 0.6 : 0);
      a.add(lg); legs.push(lg);
    }
    root.add(a);
  }
  return { root, wagon, cargo, wheels, legs };
}

// ---------- caravan ----------
let nextId = 1;
export class Caravan {
  constructor(routeKey, startFrac = 0, opt = {}) {
    this.id = nextId++;
    this.routeKey = routeKey;
    const R = ROUTES[routeKey];
    this.R = R;
    this.pts = R.pts;
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]));
    this.total = this.cum[this.cum.length - 1];
    this.s = this.total * startFrac;
    this.speed = 2.4 + Math.random() * 0.5;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.alive = true; this.state = 'travel'; this.alarmT = 0; this.calmT = 0; this.age = 0;
    this.merchantName = opt.merchantName ?? pick(MERCHANTS);
    this.name = `Корован (${this.merchantName})`;
    this.gold = opt.gold ?? randInt(90, 200);
    this.goods = {};
    for (const id of Object.keys(GOODS)) if (Math.random() < 0.6) this.goods[id] = randInt(1, id === 'potion_heal' ? 2 : 4);
    if (!Object.keys(this.goods).length) this.goods.bread = 3;
    if (opt.goods) this.goods = { ...opt.goods };
    this.animal = opt.animal ?? (Math.random() < 0.5 ? 'ox' : 'horse');
    this.mesh = buildCaravanMesh(this.animal);
    game.scene.add(this.mesh.root);
    this.place(0);
    // escort
    this.escorts = [];
    const nEsc = opt.nEsc ?? (2 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0));
    const slots = [[-2.3, 1.5], [2.3, -0.5], [0, -4.8], [2.3, 4.0]];
    for (let i = 0; i < nEsc; i++) {
      const p = this.slotWorld(slots[i][0], slots[i][1]);
      const e = spawn('caravaneer', p.x, p.z, { yaw: this.yaw, order: { type: 'follow', leader: this, ox: slots[i][0], oz: slots[i][1] } });
      e.ai.leash = 45; e.caravan = this; e.transient = true;
      this.escorts.push(e);
    }
    const mp = this.slotWorld(-1.9, 4.2);
    this.merchant = spawn('merchant', mp.x, mp.z, { name: this.merchantName, yaw: this.yaw, gold: 40 + randInt(0, 60), order: { type: 'follow', leader: this, ox: -1.9, oz: 4.2 } });
    this.merchant.caravan = this; this.merchant.transient = true;
    this.unreg = addInteractable({
      pos: () => ({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }),
      r: 4.2,
      enabled: () => this.alive && this.state !== 'robbed',
      label: () => this.guarded() ? 'Грабить корован (охрана рядом!)' : 'ГРАБИТЬ КОРОВАН!',
      use: () => this.tryRob(game.player),
    });
  }

  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  slotWorld(ox, oz) {
    const f = this.forward, rx = -f.z, rz = f.x;
    return { x: this.pos.x + rx * ox + f.x * oz, z: this.pos.z + rz * ox + f.z * oz };
  }
  pointAt(s) {
    s = Math.max(0, Math.min(this.total, s));
    let i = 1; while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const t = (s - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1);
    const a = this.pts[i - 1], b = this.pts[i];
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
  }
  place(dt) {
    const p = this.pointAt(this.s);
    // look ahead for smooth turning
    const q = this.pointAt(this.s + 6);
    const targetYaw = Math.atan2(q.x - p.x, q.z - p.z);
    if (dt === 0) this.yaw = targetYaw;
    else { let d = targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 1.5); }
    const nx = p.x, nz = p.z;
    if (dt > 0) this.vel.set((nx - this.pos.x) / dt, 0, (nz - this.pos.z) / dt); else this.vel.set(0, 0, 0);
    // first placement (spawn / load): look a little above the terrain so a wagon spawned on a bridge lands on the deck
    const y0 = this._placed ? this.pos.y : groundAt(nx, nz) + 3; this._placed = true;
    this.pos.set(nx, surfaceAt(nx, nz, y0), nz);
    const f = this.forward;
    const hf = surfaceAt(nx + f.x * 2.5, nz + f.z * 2.5, this.pos.y), hb = surfaceAt(nx - f.x * 2, nz - f.z * 2, this.pos.y);
    const r = this.mesh.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    r.rotation.x = -Math.atan2(hf - hb, 4.5);
  }

  escortsActive() { return this.escorts.filter(e => e.alive && !e.ai?.fleeing && dist(e.pos, this.pos) < 30); }
  guarded() { return this.escortsActive().length > 0; }

  // someone attacks the caravan: the whole escort turns on them
  alarm(attacker) {
    if (!attacker || attacker.caravan === this) return;
    this.alarmT = 12;
    let first = this.state === 'travel';
    for (const e of this.escorts) if (e.alive) { e.grudges.add(attacker); if (e.ai && !e.ai.target) e.ai.target = attacker; }
    if (this.merchant?.alive) this.merchant.grudges.add(attacker);
    if (first) {
      this.state = 'halt';
      const shouter = this.escorts.find(e => e.alive) ?? this.merchant;
      shout(shouter, pick(['Грабят! Корован грабят!', 'Охрана, к бою!', 'Разбойники! Защищай товар!']), { range: 80 });
    }
  }

  tryRob(robber) {
    if (!robber || this.state === 'robbed') return;
    if (this.guarded()) {
      say('Охрана не даст ограбить корован — сначала разберитесь с ней!', 'bad');
      this.alarm(robber);
      return;
    }
    this.rob(robber);
  }

  rob(robber) {
    this.state = 'robbed';
    this.mesh.cargo.visible = false;
    const isPlayer = robber === game.player;
    if (isPlayer) {
      const goodsTxt = [];
      let extraGold = 0;
      for (const [id, n] of Object.entries(this.goods)) {
        if (game.inventory?.add) { try { game.inventory.add(id, n); } catch (e) { extraGold += GOODS[id].price * n; } }
        else extraGold += GOODS[id].price * n;
        goodsTxt.push(`${GOODS[id].name} ×${n}`);
      }
      const gold = this.gold + extraGold;
      game.addGold(gold, 'caravan');
      S.caravansRobbed = (S.caravansRobbed ?? 0) + 1;
      banner('КОРОВАН ОГРАБЛЕН!', `+${gold} зол.${goodsTxt.length ? ' • ' + goodsTxt.join(', ') : ''}`);
      say(`КОРОВАН ОГРАБЛЕН! +${gold} зол. ${goodsTxt.join(', ')}`, 'good');
      game.journal.add(`Ограблен корован (${this.merchantName}). Маршрут: ${this.R.fromPrep ?? 'из'} ${this.R.from} ${this.R.toPrep ?? 'в'} ${this.R.to}. Добыча: ${gold} зол.${goodsTxt.length ? ', ' + goodsTxt.join(', ') + '.' : ''}`);
      if (this.merchant?.alive) shout(this.merchant, pick(['Караул! Ограбили!', 'Всё пропало! Товар пропал!', 'Джва года копить — и всё пропало!']), { range: 40 });
    }
    game.bus.emit('caravan:robbed', { caravan: this, robber });
    if (isPlayer) { const st = stats(); st.caravansRobbed = Math.max(st.caravansRobbed ?? 0, S.caravansRobbed); }
    this.robbedAt = S.t;
    for (const e of this.escorts) if (e.alive) e.ai?.setOrder({ type: 'wander', x: e.pos.x, z: e.pos.z, r: 15 });
    if (this.merchant?.alive) this.merchant.ai?.setOrder({ type: 'wander', x: this.pos.x, z: this.pos.z, r: 10 });
  }

  update(dt) {
    this.age += dt;
    const pd = playerDist(this.pos);
    const near = pd < 120;
    this.alarmT -= dt;
    if (this.state === 'travel' || this.state === 'halt') {
      // halt while the escort fights
      const fighting = this.escorts.some(e => e.alive && e.ai?.target?.alive && dist(e.ai.target.pos, this.pos) < 35);
      const anyEscort = this.escorts.some(e => e.alive);
      if (fighting || this.alarmT > 0 || (!anyEscort && this.state === 'halt')) { this.state = 'halt'; this.calmT = 0; }
      else if (this.state === 'halt') { this.calmT += dt; if (this.calmT > 5 && anyEscort) this.state = 'travel'; }
      // wait for stragglers
      let wait = false;
      if (this.state === 'travel') for (const e of this.escorts) if (e.alive && dist(e.pos, this.pos) > 14) { wait = true; break; }
      this.waitT = wait ? (this.waitT ?? 0) + dt : 0;
      if (this.waitT > 15) wait = false;
      if (this.state === 'travel' && !wait) {
        this.s += this.speed * dt;
        if (this.s >= this.total) return this.arrive();
      }
    }
    const before = this.pos.clone();
    this.place(this.state === 'travel' ? dt : 0);
    if (this.state !== 'travel') this.vel.set(0, 0, 0);
    // render & animate only when relevant
    const vis = pd < 430;
    this.mesh.root.visible = vis;
    if (near) {
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      for (const w of this.mesh.wheels) w.rotation.x += moved / 0.55;
      this.legT = (this.legT ?? 0) + moved * 2.2;
      const amp = moved > 0.001 ? 0.45 : 0;
      for (const l of this.mesh.legs) l.rotation.x += ((Math.sin(this.legT + l.userData.ph) * amp) - l.rotation.x) * Math.min(1, dt * 8);
      this.pushActors();
    }
  }

  // keep actors out of the wagon & animals (oriented box in wagon space)
  pushActors() {
    const f = this.forward, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (const a of game.actors) {
      if (!a.alive || a.lod > 0) continue;
      const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z;
      if (dx * dx + dz * dz > 64) continue;
      // local: lz along forward, lx along right
      const lz = dx * f.x + dz * f.z, lx = dx * c - dz * s;
      const hw = 1.05 + a.radius, z0 = -1.85 - a.radius, z1 = 5.6 + a.radius;
      if (Math.abs(lx) < hw && lz > z0 && lz < z1 && a.pos.y < this.pos.y + 2.2) {
        const px = hw - Math.abs(lx), pzb = lz - z0, pzf = z1 - lz;
        if (px < Math.min(pzb, pzf)) { const sx = Math.sign(lx) || 1, push = px * sx; a.pos.x += c * push; a.pos.z -= s * push; }
        else if (pzb < pzf) { a.pos.x -= f.x * pzb; a.pos.z -= f.z * pzb; }
        else { a.pos.x += f.x * pzf; a.pos.z += f.z * pzf; }
      }
    }
  }

  arrive() {
    if (playerDist(this.pos) < 60) say(`${this.name} благополучно прибыл ${this.R.toPrep ?? 'в'} ${this.R.to.replace(/ \(.*\)/, '')}.`);
    this.dispose();
  }

  dispose() {
    this.alive = false;
    this.unreg?.();
    game.scene.remove(this.mesh.root);
    game.compassPois.delete('caravan' + this.id);
    for (const e of [...this.escorts, this.merchant]) {
      if (!e) continue;
      e.caravan = null;
      if (e.alive) { e.transient = true; e.ai?.setOrder({ type: 'wander', x: e.pos.x, z: e.pos.z, r: 15 }); if (playerDist(e.pos) > 150) e.remove(); }
    }
    const i = caravans.indexOf(this);
    if (i >= 0) caravans.splice(i, 1);
  }
}

// ---------- director ----------
let spawnT = 20, wantCount = 3;
export function spawnCaravan(routeKey, frac = 0) {
  const c = new Caravan(routeKey, frac);
  caravans.push(c);
  game.bus.emit('caravan:spawn', { caravan: c });
  return c;
}

export function initialCaravans(faction) {
  // one close-ish caravan for the player's zone, plus a couple elsewhere
  const first = { elves: ['town>west', 0.35], guard: ['town>palace', 0.45], villain: ['fort>palace', 0.12] }[faction] ?? ['town>west', 0.3];
  spawnCaravan(first[0], first[1]);
  const others = Object.keys(ROUTES).filter(k => k !== first[0]);
  for (let i = 0; i < 2; i++) spawnCaravan(others.splice(randInt(0, others.length - 1), 1)[0], rand(0.1, 0.6));
}

export function updateCaravans(dt) {
  for (const c of [...caravans]) {
    c.update(dt);
    // robbed/abandoned wagons are removed once the player leaves
    if (c.alive && c.state === 'robbed' && S.t - c.robbedAt > 60 && playerDist(c.pos) > 120) c.dispose();
    else if (c.alive && c.age > 1500 && playerDist(c.pos) > 200) c.dispose();
    else if (c.alive && c.state !== 'robbed' && !c.escorts.some(e => e.alive) && !c.merchant?.alive && c.age > 30 && playerDist(c.pos) > 250) c.dispose();
  }
  // compass markers for caravans within 350 m
  for (const c of caravans) {
    const key = 'caravan' + c.id;
    if (c.state !== 'robbed' && playerDist(c.pos) < 350) game.compassPois.set(key, { x: c.pos.x, z: c.pos.z, label: '🐂', color: '#e8c060' });
    else game.compassPois.delete(key);
  }
  spawnT -= dt;
  const active = caravans.filter(c => c.state !== 'robbed').length;
  if (spawnT <= 0) {
    spawnT = rand(40, 80);
    if (active < wantCount && aliveCount() < 150 - 6) {
      const keys = Object.keys(ROUTES).filter(k => playerDist({ x: ROUTES[k].pts[0][0], z: ROUTES[k].pts[0][1] }) > 110);
      if (keys.length) {
        const k = pick(keys);
        const c = spawnCaravan(k, 0);
        if (game.playerFaction !== 'guard' || Math.random() < 0.5)
          say(`Слух: ${c.name} вышел ${ROUTES[k].fromPrep ?? 'из'} ${ROUTES[k].from} ${ROUTES[k].toPrep ?? 'в'} ${ROUTES[k].to}. Можно грабить корованы!`);
      }
      wantCount = randInt(2, 4);
    }
  }
}

export function clearCaravans() { for (const c of [...caravans]) c.dispose(); spawnT = 20; }

export function initCaravans() {
  // any hit on an escort/merchant alarms the whole caravan
  game.bus.on('actor:hit', ({ target, attacker }) => {
    const c = target?.caravan;
    if (c && c.alive && attacker && attacker.caravan !== c) c.alarm(attacker);
  });
}


// ---------- save / load ----------
export function saveCaravans() {
  return {
    spawnIn: spawnT, wantCount,
    list: caravans.filter(c => c.alive).map(c => ({
      route: c.routeKey, s: c.s, state: c.state, gold: c.gold, goods: c.goods, merchantName: c.merchantName, animal: c.animal,
      age: c.age, robbedAgo: c.state === 'robbed' ? S.t - (c.robbedAt ?? S.t) : null,
      escorts: c.escorts.map(e => e.alive && !e.removed ? snapActor(e) : null),
      merchant: c.merchant?.alive && !c.merchant.removed ? snapActor(c.merchant) : null,
    })),
  };
}
export function loadCaravans(d) {
  clearCaravans();
  if (!d) return;
  spawnT = d.spawnIn ?? 30; wantCount = d.wantCount ?? 3;
  for (const sc of d.list ?? []) {
    if (!ROUTES[sc.route]) continue;
    const R = ROUTES[sc.route];
    let total = 0; for (let i = 1; i < R.pts.length; i++) total += Math.hypot(R.pts[i][0] - R.pts[i - 1][0], R.pts[i][1] - R.pts[i - 1][1]);
    const c = new Caravan(sc.route, Math.min(1, sc.s / total), { nEsc: sc.escorts.length, merchantName: sc.merchantName, gold: sc.gold, goods: sc.goods, animal: sc.animal });
    caravans.push(c);
    c.age = sc.age ?? 0;
    c.escorts.forEach((e, i) => { const se = sc.escorts[i]; if (!se) e.remove(); else { applySnap(e, se); e.equipWeapon(se.weapon); } });
    c.escorts = c.escorts.filter(e => !e.removed);
    if (!sc.merchant) { c.merchant.remove(); c.merchant = null; } else applySnap(c.merchant, sc.merchant);
    if (sc.state === 'robbed') {
      c.state = 'robbed'; c.mesh.cargo.visible = false; c.robbedAt = S.t - (sc.robbedAgo ?? 0);
      for (const e of [...c.escorts, c.merchant]) if (e?.alive) e.ai.setOrder({ type: 'wander', x: e.pos.x, z: e.pos.z, r: 15 });
    } else if (sc.state === 'halt') c.state = 'halt';
  }
}
