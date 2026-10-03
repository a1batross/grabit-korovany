// Zone ambience, crossfaded by listener position and time of day.
// Continuous beds (looping filtered noise / oscillators) + randomly scheduled events
// (birds, cuckoo, owls, rooster, church bell, dogs, drill shouts, crows, thunder, water, campfire crackle).
import { game } from '../../core/game.js';
import { E, sound, rnd, pick, farPan, mtof } from './engine.js';
import { ZONES, LOC } from '../../world/zones.js';
import { heightAt, WATER_LEVEL } from '../../world/terrain.js';
import * as sfx from './sfx.js';
import { shout } from './voice.js';

export const W = { humans: 0, empire: 0, elves: 0, villain: 0, day: 1, night: 0, water: 0, town: 0, palace: 0, fort: 0, fire: 0, combat: 0 };
let beds = null;
const timers = {};
let lastBellHour = -1, lastWaterProbe = -10, lastSlow = -10, fires = [], lastFireScan = -100;

function loopNoise(kind, rate = 1) {
  const s = E.ctx.createBufferSource(); s.buffer = E.noise[kind]; s.loop = true; s.playbackRate.value = rate;
  s.start(0, Math.random() * 2);
  return s;
}
function biq(type, f, Q = 1) { const b = E.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
function gainNode(v = 0) { const g = E.ctx.createGain(); g.gain.value = v; return g; }
function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }

function buildBeds() {
  const c = E.ctx, amb = E.amb;
  const b = {};
  // leaves rustle (forest wind)
  b.leavesF = biq('highpass', 1800, 0.5); b.leaves = gainNode();
  chain(loopNoise('pink'), b.leavesF, biq('lowpass', 7000, 0.5), b.leaves, amb);
  // general low breeze
  b.breeze = gainNode();
  chain(loopNoise('brown'), biq('lowpass', 420, 0.7), b.breeze, amb);
  // howling mountain wind: two resonant bands drifting
  b.howlF1 = biq('bandpass', 500, 9); b.howlF2 = biq('bandpass', 780, 12); b.howl = gainNode();
  const hn = loopNoise('pink');
  hn.connect(b.howlF1); hn.connect(b.howlF2);
  const hg = gainNode(4.5); b.howlF1.connect(hg); b.howlF2.connect(hg);
  const hbroad = biq('bandpass', 350, 0.6); hn.connect(hbroad); hbroad.connect(hg);
  chain(hg, b.howl, amb);
  // crickets: carrier AM by fast pulse AM by chirp-group pulse
  b.crickets = gainNode();
  for (const [f, r1, r2] of [[4300, 32, 2.6], [4750, 27, 1.9], [3900, 36, 3.3]]) {
    const o = c.createOscillator(); o.frequency.value = f;
    const a1 = gainNode(0), a2 = gainNode(0);
    const l1 = c.createOscillator(); l1.type = 'square'; l1.frequency.value = r1;
    const l1g = gainNode(0.5); l1.connect(l1g); l1g.connect(a1.gain);
    const c1 = c.createConstantSource ? c.createConstantSource() : null;
    if (c1) { c1.offset.value = 0.5; c1.connect(a1.gain); c1.start(); }
    const l2 = c.createOscillator(); l2.type = 'square'; l2.frequency.value = r2;
    const l2g = gainNode(0.5); l2.connect(l2g); l2g.connect(a2.gain);
    const c2 = c.createConstantSource ? c.createConstantSource() : null;
    if (c2) { c2.offset.value = 0.5; c2.connect(a2.gain); c2.start(); }
    const pan = c.createStereoPanner(); pan.pan.value = rnd(-0.7, 0.7);
    chain(o, a1, a2, gainNode(0.05), pan, b.crickets);
    o.start(); l1.start(); l2.start();
  }
  b.crickets.connect(amb);
  // water lapping
  b.waterLfoG = gainNode(0); b.water = gainNode();
  chain(loopNoise('brown'), biq('lowpass', 650, 0.8), b.waterLfoG, b.water, amb);
  const wl = c.createOscillator(); wl.frequency.value = 0.35; const wlg = gainNode(0.5); wl.connect(wlg); wlg.connect(b.waterLfoG.gain); wl.start();
  const wc = c.createConstantSource ? c.createConstantSource() : null; if (wc) { wc.offset.value = 0.6; wc.connect(b.waterLfoG.gain); wc.start(); }
  const wsh = biq('bandpass', 1600, 1.5); const wshg = gainNode(0.15);
  chain(loopNoise('pink'), wsh, wshg, b.water);
  // town murmur: noise through moving "vowel" formants, syllabic AM
  b.murF = [biq('bandpass', 500, 5), biq('bandpass', 1300, 6), biq('bandpass', 2500, 8)];
  b.murAM = gainNode(0.5); b.murmur = gainNode();
  const mn = loopNoise('pink');
  const msum = gainNode(3);
  for (const f of b.murF) { mn.connect(f); f.connect(msum); }
  chain(msum, b.murAM, biq('lowpass', 1800, 0.5), b.murmur, amb);
  // palace banners flapping: noise AM by an irregular flutter
  b.flagAM = gainNode(0); b.flags = gainNode();
  chain(loopNoise('pink'), biq('bandpass', 1100, 0.9), b.flagAM, b.flags, amb);
  const fl = c.createOscillator(); fl.type = 'sawtooth'; fl.frequency.value = 9; b.flagLfo = fl;
  const flg = gainNode(0.5); fl.connect(flg); flg.connect(b.flagAM.gain); fl.start();
  // campfire bed (crackles are events)
  b.fire = gainNode();
  chain(loopNoise('brown', 1.4), biq('lowpass', 900, 0.7), b.fire, amb);
  return b;
}

function set(g, v, tc = 0.8) { g.gain.setTargetAtTime(v, E.ctx.currentTime, tc); }

// Zone/time weights are computed even without audio (the visuals use them too).
export function updateSoundscape(dt) {
  if (E.ctx && (!beds || beds.ctx !== E.ctx)) { beds = buildBeds(); beds.ctx = E.ctx; }
  const lx = game.started && game.player ? game.player.pos.x : E.lx;
  const lz = game.started && game.player ? game.player.pos.z : E.lz;
  const t = game.time;
  if (t - lastSlow < 0.25) { if (beds) events(lx, lz, t); return; }
  lastSlow = t;

  // zone weights (soft)
  const ds = {};
  let dmin = Infinity;
  for (const zn of Object.values(ZONES)) {
    const d = Math.hypot(lx - zn.center[0], lz - zn.center[1]) * (zn.id === 'humans' ? 1.15 : 1);
    ds[zn.id] = d; dmin = Math.min(dmin, d);
  }
  let sum = 0;
  for (const k in ds) { ds[k] = Math.exp(-(ds[k] - dmin) / 70); sum += ds[k]; }
  for (const k in ds) W[k] = ds[k] / sum;
  const h = game.hour;
  const elev = Math.sin(((h - 6) / 24) * Math.PI * 2);
  W.day = Math.max(0, Math.min(1, (elev + 0.1) / 0.3));
  W.night = 1 - W.day;
  W.dawn = h > 4.5 && h < 8.5 ? 1 - Math.abs(h - 6.5) / 2 : 0;
  W.town = Math.max(0, 1 - Math.hypot(lx - LOC.town.x, lz - LOC.town.z) / 220);
  W.palace = Math.max(0, 1 - Math.hypot(lx - LOC.palace.x, lz - LOC.palace.z) / 200);
  W.fort = Math.max(0, 1 - Math.hypot(lx - LOC.fort.x, lz - LOC.fort.z) / 220);
  // water proximity: probe ring around the listener
  if (t - lastWaterProbe > 1) {
    lastWaterProbe = t;
    let wet = 0;
    for (const r of [8, 22, 40]) for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      if (heightAt(lx + Math.cos(a) * r, lz + Math.sin(a) * r) < WATER_LEVEL) wet += r === 8 ? 2 : r === 22 ? 1.2 : 0.6;
    }
    W.water = Math.min(1, wet / 12);
  }
  if (t - lastFireScan > 5) { lastFireScan = t; scanFires(); }
  let fireD = Infinity;
  for (const f of fires) fireD = Math.min(fireD, Math.hypot(f.x - lx, f.z - lz));
  W.fire = Math.max(0, 1 - fireD / 18);
  W.nearFire = fires.find(f => Math.hypot(f.x - lx, f.z - lz) < 18);

  if (!beds) return;
  const duck = 1 - W.combat * 0.4;
  const gust = 0.6 + 0.4 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1);
  set(beds.leaves, (W.elves * 0.22 + (W.humans + W.empire) * 0.05) * gust * duck);
  beds.leavesF.frequency.setTargetAtTime(1500 + gust * 1200, E.ctx.currentTime, 1);
  set(beds.breeze, (0.1 + W.villain * 0.3 + W.humans * 0.06) * (0.5 + gust * 0.5) * duck);
  set(beds.howl, W.villain * (0.05 + gust * 0.07 + W.night * 0.03) * duck);
  beds.howlF1.frequency.setTargetAtTime(380 + 300 * (0.5 + 0.5 * Math.sin(t * 0.17)), E.ctx.currentTime, 1.5);
  beds.howlF2.frequency.setTargetAtTime(650 + 350 * (0.5 + 0.5 * Math.sin(t * 0.11 + 2)), E.ctx.currentTime, 1.5);
  set(beds.crickets, W.night * (W.elves * 0.6 + W.humans * 0.5 + W.empire * 0.3) * 0.5 * duck, 2);
  set(beds.water, W.water * 0.22 * duck);
  set(beds.murmur, W.town * W.day * 0.18 * duck, 1.2);
  set(beds.flags, W.palace * 0.13 * (0.5 + gust), 0.5);
  beds.flagLfo.frequency.setTargetAtTime(6 + gust * 9, E.ctx.currentTime, 0.3);
  set(beds.fire, W.fire * 0.25);
  events(lx, lz, t);
}

function scanFires() {
  fires = [];
  try {
    for (const [k, v] of game.places) {
      if (!v || v.x == null) continue;
      if (/fire|campfire|костер|костёр|очаг/i.test(k + ' ' + (v.name ?? ''))) fires.push(v);
    }
  } catch (e) { /* ignore */ }
}
export function getFires() { return fires; }

// schedule helper: run fn when timer due; returns true if fired
function due(key, t, minGap, maxGap) {
  if (timers[key] == null) { timers[key] = t + rnd(minGap * 0.3, maxGap * 0.6); return false; }
  if (t < timers[key]) return false;
  timers[key] = t + rnd(minGap, maxGap);
  return true;
}

// a random position around the listener (for 3D placed ambient critters)
function around(r0, r1, y = 8) {
  const a = Math.random() * Math.PI * 2, r = rnd(r0, r1);
  return { x: E.lx + Math.cos(a) * r, y: E.ly + rnd(2, y), z: E.lz + Math.sin(a) * r };
}

function events(lx, lz, t) {
  // murmur formant wandering (syllables)
  if (W.town > 0.05 && due('mur', t, 0.12, 0.22)) {
    const ct = E.ctx.currentTime;
    const v = pick([[700, 1200, 2600], [450, 900, 2500], [350, 1900, 2600], [600, 1600, 2500], [300, 700, 2400]]);
    beds.murF.forEach((f, i) => f.frequency.setTargetAtTime(v[i] * rnd(0.9, 1.15), ct, 0.04));
    beds.murAM.gain.setTargetAtTime(rnd(0.2, 1), ct, 0.05);
  }
  const birdy = W.day * (W.elves * 1 + W.humans * 0.5 + W.empire * 0.4) * (1 - W.combat);
  if (birdy > 0.08 && due('bird', t, 1.2 / birdy, 5 / birdy)) bird(around(12, 40));
  if (W.elves * W.day > 0.4 && due('cuckoo', t, 25, 60)) cuckoo(around(25, 60));
  if (W.elves * W.night > 0.3 && due('owl', t, 12, 30)) owl(around(20, 50));
  if (W.humans > 0.3 && W.dawn > 0.2 && due('rooster', t, 15, 40)) rooster(around(30, 70));
  if (W.town > 0.15 && due('dog', t, 18, 50)) dog(around(25, 70));
  if (W.palace > 0.1 && W.day > 0.5 && due('drill', t, 14, 32)) drill(W.palace);
  if (W.villain > 0.3 && W.day > 0.2 && due('crow', t, 8, 22)) crow(around(15, 50));
  if (W.villain > 0.4 && due('thunder', t, 25 - W.night * 8, 70)) {
    const a = Math.random() * Math.PI * 2;
    const p = farPan(lx + Math.cos(a) * 500, lz + Math.sin(a) * 500, game.camera);
    sfx.thunder(p.pan * 0.7, (0.35 + W.night * 0.25) * W.villain, rnd(1, 2));
    if (game.ambience?.flash) game.ambience.flash();
  }
  if (W.water > 0.3 && due('plop', t, 3, 9)) waterPlop(W.water);
  if (W.fire > 0.05 && due('crackle', t, 0.08, 0.5)) crackle(W.nearFire);
  // church bell at noon (and a short one at 6 and 18)
  const hr = Math.floor(game.hour);
  if (hr !== lastBellHour) {
    const prev = lastBellHour; lastBellHour = hr;
    if (prev !== -1 && (hr === 12 || hr === 6 || hr === 18)) {
      const p = farPan(LOC.town.x, LOC.town.z, game.camera);
      const vol = Math.max(0, 1 - p.d / 700) * 0.5;
      if (vol > 0.03) sfx.bell(p.pan, vol, hr === 12 ? 4 : 2);
    }
  }
}

// ---- critters ----
function bird(pos) {
  const species = Math.random();
  const s = sound({ pos, vol: rnd(0.08, 0.16), dur: 2, prio: 0, bus: 'amb', cull: 90, ref: 6, verb: 0.2 });
  if (!s) return;
  let t = s.t;
  if (species < 0.4) { // trill
    const f = rnd(3000, 5200), n = 4 + (Math.random() * 8 | 0), gap = rnd(0.045, 0.08);
    for (let i = 0; i < n; i++) {
      const o = s.osc('sine', f, t, gap, s.env(t, 0.004, gap * 0.8, 0.8));
      o.frequency.setValueAtTime(f * 1.15, t); o.frequency.exponentialRampToValueAtTime(f * 0.85, t + gap * 0.9);
      t += gap;
    }
  } else if (species < 0.75) { // whistle phrase
    const n = 2 + (Math.random() * 3 | 0);
    let f = rnd(2200, 3800);
    for (let i = 0; i < n; i++) {
      const d = rnd(0.08, 0.22);
      const o = s.osc('sine', f, t, d, s.env(t, 0.02, d * 0.9, 0.9));
      const f2 = f * rnd(0.75, 1.35);
      o.frequency.exponentialRampToValueAtTime(f2, t + d);
      f = f2; t += d + rnd(0.03, 0.12);
    }
  } else { // chirp-chirp with FM
    const n = 2 + (Math.random() * 2 | 0), c = E.ctx;
    for (let i = 0; i < n; i++) {
      const f = rnd(4000, 6000);
      const o = s.osc('sine', f, t, 0.07, s.env(t, 0.003, 0.06, 0.8));
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.06);
      const m = c.createOscillator(); m.frequency.value = rnd(60, 120);
      const mg = s.n(c.createGain()); mg.gain.value = f * 0.1; m.connect(mg); mg.connect(o.frequency); s.src(m, t, t + 0.07);
      t += rnd(0.12, 0.2);
    }
  }
  s.done();
}

function cuckoo(pos) {
  const n = 2 + (Math.random() * 4 | 0);
  const s = sound({ pos, vol: 0.12, dur: n * 0.75 + 0.3, prio: 0, bus: 'amb', cull: 100, ref: 10, verb: 0.35 });
  if (!s) return;
  for (let i = 0; i < n; i++) {
    const t = s.t + i * 0.75;
    s.osc('sine', mtof(76), t, 0.2, s.env(t, 0.02, 0.17, 0.8));
    s.osc('sine', mtof(72), t + 0.25, 0.3, s.env(t + 0.25, 0.02, 0.25, 0.8));
  }
  s.done();
}

function owl(pos) {
  const s = sound({ pos, vol: 0.14, dur: 2.2, prio: 0, bus: 'amb', cull: 100, ref: 10, verb: 0.4 });
  if (!s) return;
  const lp = s.filter('lowpass', 900, 0.7);
  [[0, 0.25], [0.45, 0.6], [1.25, 0.4]].forEach(([at, d]) => {
    const t = s.t + at;
    const o = s.osc('sine', 390, t, d, s.env(t, 0.06, d - 0.06, 0.9, lp));
    o.frequency.linearRampToValueAtTime(350, t + d);
    s.osc('triangle', 390, t, d, s.env(t, 0.06, d - 0.06, 0.15, lp));
  });
  s.done();
}

function rooster(pos) {
  // "ку-ка-ре-ку!"
  const s = sound({ pos, vol: 0.18, dur: 1.8, prio: 0, bus: 'amb', cull: 120, ref: 12, verb: 0.3 });
  if (!s) return;
  const bp1 = s.filter('bandpass', 1300, 4), bp2 = s.filter('bandpass', 2600, 5);
  const seq = [[0, 0.12, 620, 640], [0.16, 0.12, 700, 720], [0.32, 0.12, 760, 780], [0.48, 0.8, 820, 600]];
  for (const [at, d, f1, f2] of seq) {
    const t = s.t + at;
    const g = s.n(E.ctx.createGain());
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.02);
    g.gain.setValueAtTime(1, t + d * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    g.connect(bp1); g.connect(bp2);
    const o = s.osc('sawtooth', f1, t, d, g);
    if (d > 0.5) o.frequency.setValueCurveAtTime(new Float32Array([f1, f1 * 1.05, f1, f1 * 0.95, f2]), t, d);
    else o.frequency.linearRampToValueAtTime(f2, t + d);
  }
  s.done();
}

function dog(pos) {
  const n = 1 + (Math.random() * 3 | 0);
  const s = sound({ pos, vol: 0.14, dur: n * 0.3 + 0.3, prio: 0, bus: 'amb', cull: 110, ref: 10, verb: 0.3 });
  if (!s) return;
  const f0 = rnd(280, 420);
  const bp = s.filter('bandpass', 900, 2);
  for (let i = 0; i < n; i++) {
    const t = s.t + i * rnd(0.22, 0.32);
    const g = s.env(t, 0.008, 0.1, 1, bp);
    const o = s.osc('sawtooth', f0, t, 0.12, g);
    o.frequency.setValueAtTime(f0 * 1.3, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.1);
    s.noise('pink', t, 0.08, s.env(t, 0.003, 0.06, 0.6, bp));
  }
  s.done();
}

function crow(pos) {
  const n = 1 + (Math.random() * 3 | 0);
  const s = sound({ pos, vol: 0.15, dur: n * 0.45 + 0.3, prio: 0, bus: 'amb', cull: 110, ref: 10, verb: 0.3 });
  if (!s) return;
  const bp = s.filter('bandpass', 1200, 3), bp2 = s.filter('bandpass', 2400, 4);
  for (let i = 0; i < n; i++) {
    const t = s.t + i * rnd(0.35, 0.5);
    const g = s.env(t, 0.01, 0.28, 1, bp); g.connect(bp2);
    const o = s.osc('sawtooth', rnd(520, 640), t, 0.3, g);
    o.frequency.linearRampToValueAtTime(o.frequency.value * 0.85, t + 0.28);
    s.noise('white', t, 0.28, s.env(t, 0.01, 0.26, 0.4, bp));
  }
  s.done();
}

function drill(w) {
  // distant drill sergeant + soldiers answering, then a stomp
  const ang = Math.atan2(LOC.palace.z - E.lz, LOC.palace.x - E.lx);
  const pos = { x: E.lx + Math.cos(ang) * 45, y: E.ly + 3, z: E.lz + Math.sin(ang) * 45 };
  const vol = 0.18 + w * 0.15;
  const f = rnd(95, 120);
  const words = pick([[['a', 'a']], [['a', 'a'], ['a', 'o']], [['e', 'a'], ['a', 'a'], ['y', 'o']], [['i', 'a'], ['a', 'a']]]);
  words.forEach((v, i) => shout(f, pos, v, vol, { delay: i * 0.55, verb: 0.4 }));
  // troop answer "Ура!" / stomp
  const s = sound({ pos, vol: vol * 0.8, dur: 3, prio: 0, verb: 0.45, delay: words.length * 0.55 + 0.4 });
  if (!s) return;
  for (let i = 0; i < 4; i++) {
    const t = s.t + i * 0.5;
    for (let k = 0; k < 6; k++) {
      const tk = t + rnd(0, 0.05);
      const o = s.osc('sine', rnd(70, 95), tk, 0.12, s.env(tk, 0.003, 0.1, 0.3));
      o.frequency.exponentialRampToValueAtTime(45, tk + 0.1);
    }
  }
  s.done();
}

function waterPlop(w) {
  const pos = around(6, 25, 0.5); pos.y = Math.min(pos.y, WATER_LEVEL + 0.2);
  const s = sound({ pos, vol: 0.12 * w, dur: 0.3, prio: 0, bus: 'amb', ref: 6 });
  if (!s) return;
  const n = 1 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const t = s.t + i * rnd(0.04, 0.1);
    const o = s.osc('sine', rnd(350, 700), t, 0.08, s.env(t, 0.002, 0.06, 0.7));
    o.frequency.exponentialRampToValueAtTime(rnd(1000, 1800), t + 0.06);
  }
  s.done();
}

function crackle(f) {
  if (!f) return;
  const s = sound({ pos: { x: f.x, y: (f.y ?? E.ly) + 0.5, z: f.z }, vol: rnd(0.1, 0.3), dur: 0.1, prio: 0, bus: 'amb', ref: 3 });
  if (!s) return;
  const n = 1 + (Math.random() * 3 | 0);
  const hp = s.filter('bandpass', rnd(1500, 4000), 1.2);
  for (let i = 0; i < n; i++) { const t = s.t + rnd(0, 0.05); s.noise('white', t, 0.02, s.env(t, 0.0005, 0.012, rnd(0.5, 1.5), hp)); }
  s.done();
}
