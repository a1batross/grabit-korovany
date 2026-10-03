// World population: fills the 4 zones with life at startGame and slowly reinforces them so the world never empties.
// Every spawned NPC belongs to a "group" (posts, patrols, villagers...) with a target size; dead members are replaced
// after a delay (spawned out of the player's sight where possible). Total alive actors are capped for performance.
import { game } from '../core/game.js';
import { spawn } from '../entities/spawn.js';
import { LOC, ROADS } from '../world/zones.js';
import { place, placeList, dryNear, playerDist, aliveCount, dist } from './gameplay/util.js';
import { formationSlot } from './gameplay/squad.js';
import { S } from './gameplay/state.js';
import { pick, rand } from '../core/rng.js';

export const name = 'population';
export const CAP = 150;           // max alive actors (raids/caravans/reinforcements respect it)
export const groups = [];

// spawn an NPC near (x,z) on dry land; `zone` tags its home zone (raids rally defenders by it)
export function spawnNPC(preset, x, z, extra = {}) {
  const p = extra.y != null ? { x, z } : dryNear(x, z, extra.spread ?? 0);
  const { spread, ...rest } = extra;
  const a = spawn(preset, p.x, p.z, rest);
  return a;
}

// group(key, { zone, target, make(group) -> actor, anchor:{x,z}, delay, minPlayerDist, once })
function group(key, o) {
  const g = { key, members: [], cd: 0, delay: 60, minPlayerDist: 60, ...o };
  groups.push(g);
  return g;
}
function fill(g, n = g.target) {
  for (let i = 0; i < n; i++) addMember(g);
}
function addMember(g) {
  const a = g.make(g);
  if (!a) return null;
  a.popGroup = g.key; a.zoneHome = g.zone;
  g.members.push(a);
  return a;
}

// ---- group factories ----
function postsGroup(key, zone, presetFn, posts, o = {}) {
  return group(key, {
    zone, target: posts.length, anchor: o.spawnAt ?? posts[0], ...o,
    make(g) {
      const used = new Set(g.members.filter(m => m.alive).map(m => m.postIdx));
      let idx = posts.findIndex((_, i) => !used.has(i));
      if (idx < 0) return null;
      const p = posts[idx];
      const initial = !g.started;
      const sp = initial ? p : (o.spawnAt ?? p);
      const a = spawnNPC(typeof presetFn === 'function' ? presetFn(idx) : presetFn, sp.x, sp.z,
        { ...(initial && p.y != null ? { y: p.y } : {}), yaw: p.yaw ?? 0, order: { type: 'guard', x: p.x, z: p.z, r: 1.5, yaw: p.yaw } });
      a.postIdx = idx;
      a.ai.leash = o.leash ?? 45;
      return a;
    },
  });
}
function wanderGroup(key, zone, presetFn, centers, r, target, o = {}) {
  return group(key, {
    zone, target, anchor: centers[0], ...o,
    make() {
      const c = pick(centers);
      const a = spawnNPC(typeof presetFn === 'function' ? presetFn() : presetFn, c.x + rand(-r, r) * 0.5, c.z + rand(-r, r) * 0.5,
        { spread: 3, order: { type: 'wander', x: c.x, z: c.z, r } });
      if (o.leash) a.ai.leash = o.leash;
      return a;
    },
  });
}
function bossGroup(key, zone, preset, pl, o = {}) {
  return group(key, {
    zone, target: 1, anchor: pl, delay: o.delay ?? 150, ...o,
    make(g) {
      if (o.skip?.()) return null;
      const a = spawnNPC(preset, pl.x, pl.z, { ...(pl.y != null ? { y: pl.y } : {}), yaw: pl.yaw ?? 0, order: { type: 'guard', x: pl.x, z: pl.z, r: 1.5, yaw: pl.yaw }, ...(o.extra ?? {}) });
      a.ai.leash = o.leash ?? 25;
      if (o.keepCorpse) a.keepCorpse = true;
      o.onSpawn?.(a);
      return a;
    },
  });
}
// patrol: a small squad walking waypoints in formation behind a leader
function patrolGroup(key, zone, presetFn, points, size, o = {}) {
  return group(key, {
    zone, target: size, anchor: { x: points[0][0], z: points[0][1] }, delay: 90, ...o,
    make(g) {
      const alive = g.members.filter(m => m.alive);
      let L = alive.find(m => m.ai?.order?.type === 'patrol');
      const sp = L ? { x: points[0][0], z: points[0][1] } : (g.started ? { x: points[0][0], z: points[0][1] } : { x: points[o.startIdx ?? 0][0], z: points[o.startIdx ?? 0][1] });
      const a = spawnNPC(typeof presetFn === 'function' ? presetFn(alive.length) : presetFn, sp.x, sp.z, { spread: 3 });
      if (!L) a.ai.setOrder({ type: 'patrol', points, i: o.startIdx && !g.started ? (o.startIdx + 1) % points.length : 0 });
      else { const f = formationSlot(alive.length, 2); a.ai.setOrder({ type: 'follow', leader: L, ox: f.ox, oz: f.oz }); }
      return a;
    },
    tick(g) {
      // promote a new leader if the old one died
      const alive = g.members.filter(m => m.alive && !m.squad);
      if (!alive.length || alive.some(m => m.ai?.order?.type === 'patrol')) return;
      const L = alive[0];
      let bi = 0, bd = Infinity;
      points.forEach((p, i) => { const d = (p[0] - L.pos.x) ** 2 + (p[1] - L.pos.z) ** 2; if (d < bd) { bd = d; bi = i; } });
      L.ai.setOrder({ type: 'patrol', points, i: bi });
      alive.slice(1).forEach((m, i) => { const f = formationSlot(i + 1, 2); m.ai.setOrder({ type: 'follow', leader: L, ox: f.ox, oz: f.oz }); });
    },
  });
}

const roadPts = (road, a, b) => { const pts = road.slice(a, b + 1); return [...pts, ...pts.slice(1, -1).reverse()]; };

export function populate(faction) {
  groups.length = 0;
  const palacePosts = placeList('palace:posts');
  const fortPosts = placeList('fort:posts');
  const elfPosts = placeList('elves:posts');
  const villainPlayer = faction === 'villain';

  // ---------- Palace (zone of the emperor) ----------
  const throne = place('palace:throne');
  bossGroup('palace:emperor', 'palace', 'emperor', throne, { keepCorpse: true, leash: 14, skip: () => S.bossDead.emperor, delay: 1e9,
    onSpawn: a => { a.ai.courage = 1; game.emperor = a; } });
  bossGroup('palace:commander', 'palace', 'commander', place('palace:commander'), { leash: 35, delay: 150, onSpawn: a => { game.commander = a; } });
  const tg = [-1.2, 1.2].map((s, i) => ({ x: throne.x + Math.cos((throne.yaw ?? 0)) * 2.6 * s, z: throne.z - Math.sin((throne.yaw ?? 0)) * 2.6 * s, yaw: throne.yaw, y: throne.y }));
  if (villainPlayer) tg.push({ x: throne.x + Math.sin(throne.yaw ?? 0) * 6 + 2, z: throne.z + Math.cos(throne.yaw ?? 0) * 6, yaw: throne.yaw, y: throne.y },
    { x: throne.x + Math.sin(throne.yaw ?? 0) * 6 - 2, z: throne.z + Math.cos(throne.yaw ?? 0) * 6, yaw: throne.yaw, y: throne.y });
  postsGroup('palace:throneGuard', 'palace', 'guard', tg, { leash: 20, spawnAt: place('palace:barracks') });
  // archers on posts with height (walls/towers), soldiers elsewhere
  const pp = palacePosts.slice(0, villainPlayer ? 13 : 10);
  postsGroup('palace:posts', 'palace', i => (pp[i]?.y != null && pp[i].y > 3) || i % 4 === 3 ? 'guardArcher' : 'guard', pp, { spawnAt: place('palace:barracks'), delay: 50 });
  const yard = place('palace:yard');
  wanderGroup('palace:yard', 'palace', () => Math.random() < 0.25 ? 'guardArcher' : 'guard', [yard, place('palace:barracks')], 18, villainPlayer ? 7 : 5, { delay: 60 });
  patrolGroup('palace:patrol', 'palace', 'guard', roadPts(ROADS.townPalace, 1, 5), 3, { startIdx: 2 });

  // ---------- Fort (zone of the villain) ----------
  bossGroup('fort:villain', 'fort', 'villain', place('fort:throne'), { keepCorpse: true, leash: 30, skip: () => villainPlayer || S.bossDead.villain, delay: 1e9,
    onSpawn: a => { a.ai.courage = 1; game.villainBoss = a; } });
  const fp = fortPosts.slice(0, 9);
  postsGroup('fort:posts', 'fort', i => (fp[i]?.y != null && fp[i].y > 3) || i % 3 === 2 ? 'minionArcher' : 'minion', fp, { spawnAt: place('fort:yard'), delay: 55 });
  wanderGroup('fort:yard', 'fort', () => Math.random() < 0.3 ? 'minionArcher' : 'minion', [place('fort:yard')], 16, villainPlayer ? 4 : 7, { delay: 60 });
  patrolGroup('fort:patrol', 'fort', 'minion', roadPts(ROADS.palaceFort, 2, 4), 3, { startIdx: 1 });

  // ---------- Elf village & camps (dense forest) ----------
  bossGroup('elves:chief', 'elves', 'elfChief', place('elves:chief'), { leash: 30, delay: 150, onSpawn: a => { game.elfChief = a; } });
  postsGroup('elves:posts', 'elves', i => i % 2 ? 'elfArcher' : 'elf', elfPosts.slice(0, 7), { spawnAt: place('elves:square'), delay: 50 });
  wanderGroup('elves:village', 'elves', () => Math.random() < 0.3 ? 'elfArcher' : 'elf', [place('elves:square')], 30, 8, { delay: 50 });
  placeList('elves:camps').slice(0, 3).forEach((c, i) =>
    wanderGroup('elves:camp' + i, 'elves', () => Math.random() < 0.4 ? 'elfArcher' : 'elf', [c], 9, 3, { delay: 90 }));

  // ---------- Town & farms (neutral humans) ----------
  const houses = placeList('town:houses');
  wanderGroup('town:folk', 'town', 'peasant', [place('town:square'), ...houses.slice(0, 8)], 14, 10, { delay: 45 });
  wanderGroup('town:merchants', 'town', 'merchant', [place('town:square')], 18, 2, { delay: 90 });
  wanderGroup('town:tavern', 'town', 'peasant', [place('town:tavern')], 6, 2, { delay: 90 });
  wanderGroup('town:farm', 'town', 'peasant', [LOC.eastFarm], 25, 4, { delay: 90 });

  for (const g of groups) { fill(g); g.started = true; }
}

// ---- reinforcement & cleanup ----
let acc = 0, gi = 0;
export function updatePopulation(dt) {
  acc += dt;
  if (acc < 1) return;
  const sdt = acc; acc = 0;
  for (const g of groups) {
    g.members = g.members.filter(m => !m.removed && (m.alive || m.keepCorpse));
    g.cd -= sdt;
    g.tick?.(g);
  }
  // one group per second gets a chance to reinforce
  if (groups.length) {
    const g = groups[gi++ % groups.length];
    const alive = g.members.filter(m => m.alive).length;
    if (alive < g.target) {
      if (g.cd <= 0 && aliveCount() < CAP - 10 && playerDist(g.anchor) > g.minPlayerDist && !g.paused) {
        const a = addMember(g);
        g.cd = a ? g.delay : 10;
      }
    } else g.cd = Math.max(g.cd, g.delay);
  }
  // transient actors (raiders, caravan escorts, freed squads) vanish once far from the player
  for (const a of [...game.actors]) {
    if (a.isPlayer || !a.transient || a.squad || a.armyGroup || a.caravan?.alive) continue;
    if (playerDist(a.pos) > 230) a.remove();
  }
}

export function startGame(opts) {
  populate(opts.faction);
  game.population = { groups, CAP, spawnNPC, aliveCount };
}

export function init() {
  game.addSystem({ name: 'population', order: 30, update: updatePopulation });
}
