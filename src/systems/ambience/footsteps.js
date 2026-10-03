// Footsteps (surface-aware), crawling drags, Kirill's squeaky wheelchair, peg-leg "tok",
// landing thuds and the low-HP heartbeat / heavy breathing.
import { game } from '../../core/game.js';
import { E, sound, rnd } from './engine.js';
import { heightAt, groundAt, WATER_LEVEL } from '../../world/terrain.js';
import { zoneAt, distToAnyRoad, LOC } from '../../world/zones.js';
import * as sfx from './sfx.js';
import { hup, grunt } from './voice.js';

const ARMORED = new Set(['guard', 'commander', 'minion', 'villain', 'caravaneer']);

export function surfaceAt(x, z, y) {
  if (heightAt(x, z) < WATER_LEVEL - 0.25) return 'water';
  const g = groundAt(x, z);
  const zn = zoneAt(x, z).id;
  if (y != null && y > g + 0.3) return zn === 'elves' ? 'wood' : 'stone'; // standing on a structure
  const dp = Math.hypot(x - LOC.palace.x, z - LOC.palace.z), df = Math.hypot(x - LOC.fort.x, z - LOC.fort.z);
  if (dp < LOC.palace.r * 0.85 || df < LOC.fort.r * 0.9) return 'stone';
  if (distToAnyRoad(x, z) < 4.5) return 'road';
  if (zn === 'elves') return 'forest';
  if (zn === 'villain') return 'gravel';
  return 'grass';
}

// One step. heavy 0..1 (running / big actor), side 'L'|'R'
export function step(pos, surface, heavy = 0.4, vol = 0.35, armored = false) {
  if (surface === 'water') return sfx.splash(pos, vol * 0.9);
  const s = sound({ pos, vol: vol * (0.7 + heavy * 0.5), dur: 0.25, prio: 0, verb: surface === 'stone' ? 0.18 : 0.04, ref: 2.5 });
  if (!s) return;
  const t = s.t;
  // low body thump common to all surfaces
  const th = s.osc('sine', 95 + heavy * 20, t, 0.1, s.env(t, 0.002, 0.07, 0.5 + heavy * 0.4, s.filter('lowpass', 300, 0.7)));
  th.frequency.exponentialRampToValueAtTime(50, t + 0.08);
  switch (surface) {
    case 'grass': {
      const bp = s.filter('bandpass', rnd(2200, 3200), 0.7);
      s.noise('pink', t, 0.14, s.env(t, 0.012, 0.1, 0.9, bp));
      break;
    }
    case 'forest': { // leaves + twig crackles
      const bp = s.filter('bandpass', rnd(1800, 2600), 0.6);
      s.noise('pink', t, 0.16, s.env(t, 0.01, 0.13, 1.0, bp));
      const hp = s.filter('highpass', 3000, 1);
      const n = 2 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) { const ti = t + rnd(0, 0.08); s.noise('white', ti, 0.015, s.env(ti, 0.0005, 0.008, rnd(0.4, 1), hp)); }
      if (Math.random() < 0.12) { // snapped twig
        const ti = t + 0.02;
        s.noise('white', ti, 0.03, s.env(ti, 0.0005, 0.02, 1.5, s.filter('bandpass', 1800, 3)));
      }
      break;
    }
    case 'road':
    case 'gravel': { // granular crunch
      const hp = s.filter('bandpass', surface === 'gravel' ? 2200 : 1600, 0.9);
      const n = 6 + (Math.random() * 5 | 0);
      for (let i = 0; i < n; i++) { const ti = t + rnd(0, 0.09); s.noise('white', ti, 0.02, s.env(ti, 0.001, 0.012, rnd(0.3, 0.9), hp)); }
      s.noise('pink', t, 0.1, s.env(t, 0.005, 0.08, 0.4, s.filter('lowpass', 1500, 0.7)));
      break;
    }
    case 'stone': { // hard heel click
      s.noise('white', t, 0.04, s.env(t, 0.0005, 0.03, 0.9, s.filter('bandpass', 3200, 2)));
      s.osc('triangle', rnd(220, 280), t, 0.05, s.env(t, 0.001, 0.035, 0.35));
      break;
    }
    case 'wood': { // hollow plank knock
      s.osc('sine', rnd(130, 160), t, 0.14, s.env(t, 0.002, 0.11, 0.8));
      s.noise('white', t, 0.06, s.env(t, 0.001, 0.05, 0.8, s.filter('bandpass', 620, 4)));
      if (Math.random() < 0.15) { // creak
        const ti = t + 0.05;
        const o = s.osc('sawtooth', 60, ti, 0.2, s.env(ti, 0.05, 0.14, 0.15, s.filter('bandpass', 1100, 8)));
        o.frequency.linearRampToValueAtTime(75, ti + 0.18);
      }
      break;
    }
  }
  if (armored && Math.random() < 0.6) { // chainmail jingle
    const hp = s.filter('highpass', 5000, 0.7);
    for (let i = 0; i < 4; i++) { const ti = t + rnd(0, 0.07); s.noise('white', ti, 0.02, s.env(ti, 0.001, 0.015, 0.35, hp)); }
  }
  s.done();
}

// wooden peg-leg / prosthetic "ТОК"
export function tok(pos, vol = 0.45) {
  const s = sound({ pos, vol, dur: 0.2, prio: 1, verb: 0.12 });
  if (!s) return;
  const t = s.t;
  s.osc('sine', 880, t, 0.08, s.env(t, 0.0005, 0.06, 0.8));
  s.osc('sine', 1730, t, 0.05, s.env(t, 0.0005, 0.03, 0.35));
  s.osc('triangle', 420, t, 0.1, s.env(t, 0.001, 0.07, 0.5));
  s.noise('white', t, 0.02, s.env(t, 0.0005, 0.012, 1, s.filter('bandpass', 2500, 2)));
  s.done();
}

// crawling: a dragging body pull
export function drag(pos, surface, vol = 0.4) {
  const s = sound({ pos, vol, dur: 0.6, prio: 1 });
  if (!s) return;
  const t = s.t;
  const f = surface === 'stone' ? 2200 : surface === 'road' || surface === 'gravel' ? 1500 : 1000;
  const bp = s.filter('bandpass', f, 0.8);
  const g = s.n(E.ctx.createGain());
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.18); g.gain.linearRampToValueAtTime(0.0001, t + 0.55);
  g.connect(bp);
  s.noise('pink', t, 0.55, g);
  if (surface === 'road' || surface === 'gravel' || surface === 'forest') {
    const hp = s.filter('highpass', 2500, 1);
    for (let i = 0; i < 6; i++) { const ti = t + rnd(0.05, 0.5); s.noise('white', ti, 0.02, s.env(ti, 0.001, 0.012, 0.5, hp)); }
  }
  s.done();
}

// wheelchair squeak ("скрип!") — once per wheel turn
export function squeak(pos, vol = 0.22) {
  const s = sound({ pos, vol, dur: 0.25, prio: 1, verb: 0.08 });
  if (!s) return;
  const t = s.t, c = E.ctx;
  const d = rnd(0.1, 0.18);
  const bp = s.filter('bandpass', 2000, 6);
  const o = s.osc('sawtooth', rnd(780, 950), t, d + 0.02, s.env(t, 0.02, d, 1, bp));
  o.frequency.linearRampToValueAtTime(o.frequency.value * rnd(1.15, 1.35), t + d);
  const l = c.createOscillator(); l.frequency.value = rnd(28, 40);
  const lg = s.n(c.createGain()); lg.gain.value = 60; l.connect(lg); lg.connect(o.frequency); s.src(l, t, t + d + 0.02);
  s.done();
}

// ---------- per-frame driver ----------
const st = new WeakMap();
let rumble = null; // wheelchair rolling rumble loop
let nextBeat = 0, nextBreath = 0, breathIn = true, lastNpcScan = 0;
const npcList = [];

function stateOf(a) {
  let s = st.get(a);
  if (!s) { s = { acc: rnd(0, 0.7), side: 0, air: 0, wheel: 0, wasGround: true }; st.set(a, s); }
  return s;
}

function actorSteps(a, dt, isPlayer, vol) {
  const s = stateOf(a);
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const mode = a.moveMode;
  const pos = { x: a.pos.x, y: a.pos.y + 0.1, z: a.pos.z };
  // landing
  if (!a.onGround) s.air += dt;
  else {
    if (!s.wasGround && s.air > 0.3) { sfx.land(pos, vol * (0.8 + Math.min(1, s.air) * 0.4)); s.acc = 0; }
    s.air = 0;
  }
  s.wasGround = a.onGround;
  if (!a.onGround || speed < 0.35) {
    if (isPlayer && rumble) rumble.set(0);
    return;
  }
  if (mode === 'wheelchair') {
    s.wheel += speed * dt;
    if (s.wheel > 1.9) { s.wheel = 0; squeak(pos, vol * 0.75); }
    if (isPlayer) rumble?.set(Math.min(1, speed / 4.6));
    return;
  }
  if (isPlayer && rumble) rumble.set(0);
  if (mode === 'crawl') {
    s.acc += speed * dt;
    if (s.acc > 0.65) {
      s.acc = 0;
      const surf = surfaceAt(a.pos.x, a.pos.z, a.pos.y);
      drag(pos, surf, vol * 1.1);
      if (isPlayer && Math.random() < 0.25) grunt(a, pos, 0.2);
    }
    return;
  }
  const running = speed > 5;
  const stride = running ? 1.25 : 0.8;
  s.acc += speed * dt;
  if (s.acc >= stride) {
    s.acc -= stride;
    s.side ^= 1;
    const leg = s.side ? 'legR' : 'legL';
    const surf = surfaceAt(a.pos.x, a.pos.z, a.pos.y);
    if (a.limbs[leg] === 'prosthetic') tok(pos, vol * 1.2);
    else step(pos, surf, (running ? 0.8 : 0.3) * Math.min(1.4, a.scale ?? 1), vol, ARMORED.has(a.kind));
  }
}

function makeRumble() {
  const c = E.ctx;
  const src = c.createBufferSource(); src.buffer = E.noise.brown; src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const g = c.createGain(); g.gain.value = 0;
  src.connect(lp); lp.connect(g); g.connect(E.sfx);
  src.start();
  return { ctx: c, set: v => g.gain.setTargetAtTime(v * 0.35, c.currentTime, 0.1) };
}

export function updateFootsteps(dt) {
  if (!E.ctx) return;
  const p = game.player;
  if (!p) return;
  if (!rumble || rumble.ctx !== E.ctx) rumble = makeRumble();
  if (p.alive) actorSteps(p, dt, true, 0.32);
  else rumble.set(0);

  // nearby NPCs (throttled list refresh)
  if (game.time - lastNpcScan > 0.5) {
    lastNpcScan = game.time;
    npcList.length = 0;
    const lx = E.lx, lz = E.lz;
    for (const a of game.actors) {
      if (a === p || !a.alive) continue;
      const d2 = (a.pos.x - lx) ** 2 + (a.pos.z - lz) ** 2;
      if (d2 < 22 * 22) npcList.push([d2, a]);
    }
    npcList.sort((x, y) => x[0] - y[0]);
    npcList.length = Math.min(npcList.length, 6);
  }
  for (const [, a] of npcList) if (a.alive && !a.removed) actorSteps(a, dt, false, 0.22);

  // low HP: heartbeat + heavy breathing
  if (p.alive) {
    const hpf = p.hp / p.maxHp;
    const danger = Math.max(0, Math.min(1, (0.4 - hpf) / 0.3)) + Math.min(0.6, p.bleed * 0.25);
    const t = game.time;
    if (danger > 0.05) {
      if (t >= nextBeat) {
        sfx.heartbeat(0.25 + Math.min(1, danger) * 0.45);
        nextBeat = t + 60 / (70 + Math.min(1, danger) * 70);
      }
      if (danger > 0.3 && t >= nextBreath) {
        sfx.breath(breathIn, 0.1 + Math.min(1, danger) * 0.12);
        nextBreath = t + (breathIn ? 0.8 : 0.65) * (1.3 - Math.min(1, danger) * 0.4);
        breathIn = !breathIn;
      }
    }
    // muffle the world when close to death
    const target = danger > 0.6 ? 20000 - Math.min(1, (danger - 0.6) / 0.6) * 17500 : 20000;
    E.muffle.frequency.setTargetAtTime(target, E.ctx.currentTime, 0.3);
  } else {
    E.muffle.frequency.setTargetAtTime(20000, E.ctx.currentTime, 0.5);
  }
}

export function playerJump() {
  const p = game.player;
  if (!p) return;
  const pos = { x: p.pos.x, y: p.pos.y + 1.4, z: p.pos.z };
  hup(p, pos);
  sfx.whoosh(pos, 'thrust', 0.2, 0.12);
}
