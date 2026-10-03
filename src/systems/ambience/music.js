// Procedural folk score: Karplus-Strong "gusli" plucks, a drone, frame drum and a reed pipe.
// Modal melodies (phrase = motif A A' B A, then breathing rests), mood per zone,
// plus a COMBAT layer (driving toms + low ostinato) faded in by game.audio combat intensity.
import { game } from '../../core/game.js';
import { E, rnd, pick, mtof } from './engine.js';
import { zoneAt } from '../../world/zones.js';

const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
};

const MOODS = {
  menu:    { root: 50, mode: 'dorian',     bpm: 84,  bar: 8, drum: ['D..tD.t.', 'D..tD.tt'], drumVol: 0.32, flute: 0.35, oct: 12, prog: [0, 6, 0, 4], density: 0.8,  drone: 0.11, rests: [1, 2] },
  humans:  { root: 55, mode: 'mixolydian', bpm: 100, bar: 8, drum: ['D.t.D.tt', 'D.ttD.t.'], drumVol: 0.26, flute: 0.2,  oct: 12, prog: [0, 3, 6, 0], density: 0.7,  drone: 0.07, rests: [2, 5] },
  empire:  { root: 53, mode: 'ionian',     bpm: 80,  bar: 8, drum: ['D...D.t.', 'D.t.D.tt'], drumVol: 0.3,  flute: 0.1,  oct: 12, prog: [0, 3, 4, 0], density: 0.65, drone: 0.08, rests: [2, 5] },
  elves:   { root: 52, mode: 'lydian',     bpm: 66,  bar: 6, drum: null,                     drumVol: 0,    flute: 0.65, oct: 24, prog: [0, 1, 0, 4], density: 0.55, drone: 0.07, rests: [2, 6] },
  villain: { root: 45, mode: 'phrygian',   bpm: 60,  bar: 8, drum: ['D.......', 'D...D..t'], drumVol: 0.45, flute: 0,    oct: 0,  prog: [0, 1, 0, 6], density: 0.45, drone: 0.12, rests: [2, 5], low: true },
  death:   { root: 50, mode: 'aeolian',    bpm: 54,  bar: 8, drum: null,                     drumVol: 0,    flute: 0.5,  oct: 12, prog: [0, 5, 3, 4], density: 0.4,  drone: 0.06, rests: [3, 6] },
};

const RHYTHM8 = [[1, 0, 1, 0, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 1, 0], [1, 1, 1, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]];
const RHYTHM6 = [[1, 0, 1, 1, 0, 1], [1, 0, 0, 1, 0, 0], [1, 1, 1, 1, 0, 0], [1, 0, 0, 0, 0, 0]];

let mood = null, moodName = '', targetMood = 'menu';
let mainG, combatG, droneG, drone = [], nextT = 0, stepN = 0, plan = [], planBar = 0, planInst = 'pluck';
let combat = 0, enabled = true, sectionCount = 0;
const ksCache = new Map();
const warmQueue = [];

function noteOf(deg, octShift = 0) {
  const m = MODES[mood.mode];
  const o = Math.floor(deg / 7);
  return mood.root + mood.oct + octShift + o * 12 + m[((deg % 7) + 7) % 7];
}

// ---- Karplus–Strong pluck buffer (cached per midi note) ----
function ks(midi) {
  let b = ksCache.get(midi);
  if (b) return b;
  const c = E.ctx, sr = c.sampleRate;
  const f = mtof(midi);
  const N = Math.max(4, Math.floor(sr / f));
  const dur = midi < 50 ? 3 : 2.2;
  const n = Math.floor(sr * dur);
  b = c.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const ring = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp = lp * 0.4 + (Math.random() * 2 - 1) * 0.6; ring[i] = lp; } // slightly darker seed
  const damp = midi < 50 ? 0.998 : midi > 74 ? 0.993 : 0.996;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const cur = ring[idx], nx = ring[idx + 1 === N ? 0 : idx + 1];
    ring[idx] = damp * 0.5 * (cur + nx);
    d[i] = cur;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  const fo = Math.floor(sr * 0.05);
  for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
  b._rate = f * N / sr; // correct the integer-delay tuning error
  ksCache.set(midi, b);
  return b;
}

function cleanup(src, nodes) { src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /**/ } } }; }

function pluck(midi, t, vol, dest, pan = 0) {
  const c = E.ctx;
  const buf = ks(midi);
  const s = c.createBufferSource(); s.buffer = buf; s.playbackRate.value = buf._rate;
  const g = c.createGain(); g.gain.value = vol;
  const p = c.createStereoPanner(); p.pan.value = pan;
  const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 280; body.Q.value = 1.2; body.gain.value = 4;
  s.connect(body); body.connect(g); g.connect(p); p.connect(dest);
  s.start(t); s.stop(t + buf.duration);
  cleanup(s, [s, body, g, p]);
}

function flute(midi, t, dur, vol, dest) {
  const c = E.ctx, f = mtof(midi);
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
  const g2 = c.createGain(); g2.gain.value = 0.12;
  const lfo = c.createOscillator(); lfo.frequency.value = 5.2;
  const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.6);
  lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.06);
  g.gain.setValueAtTime(vol * 0.85, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
  const nb = c.createBufferSource(); nb.buffer = E.noise.white; nb.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
  const ng = c.createGain(); ng.gain.value = 0.05;
  o.connect(g); o2.connect(g2); g2.connect(g); nb.connect(bp); bp.connect(ng); ng.connect(g); g.connect(dest);
  const end = t + dur + 0.15;
  for (const x of [o, o2, lfo]) { x.start(t); x.stop(end); }
  nb.start(t, Math.random()); nb.stop(end);
  cleanup(o, [o, o2, g2, lfo, lg, g, nb, bp, ng]);
}

function drum(kind, t, vol, dest) {
  const c = E.ctx;
  const nodes = [];
  const mk = n => { nodes.push(n); return n; };
  const out = mk(c.createGain()); out.gain.value = vol; out.connect(dest);
  let last;
  if (kind === 'D' || kind === 'L' || kind === 'T') {
    const low = kind === 'L', tom = kind === 'T';
    const o = mk(c.createOscillator()); o.type = 'sine';
    const f0 = low ? 62 : tom ? rnd(120, 150) : 95, f1 = low ? 34 : tom ? 70 : 52, d = low ? 0.7 : tom ? 0.22 : 0.32;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.8);
    const g = mk(c.createGain()); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.02);
    const nb = mk(c.createBufferSource()); nb.buffer = E.noise[low ? 'brown' : 'pink']; nb.loop = true;
    const lp = mk(c.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = low ? 300 : 700;
    const ng = mk(c.createGain()); ng.gain.setValueAtTime(low ? 1.2 : 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    nb.connect(lp); lp.connect(ng); ng.connect(out); nb.start(t, Math.random()); nb.stop(t + 0.14);
    last = o;
  } else { // 't' tek (rim/finger on frame drum) with tiny jingles
    const nb = mk(c.createBufferSource()); nb.buffer = E.noise.white; nb.loop = true;
    const bp = mk(c.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 1.5;
    const g = mk(c.createGain()); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    nb.connect(bp); bp.connect(g); g.connect(out); nb.start(t, Math.random()); nb.stop(t + 0.09);
    last = nb;
  }
  cleanup(last, nodes);
}

function setDrone(t) {
  const r = mood.root - 12 + (mood.low ? 0 : 0);
  const fr = [mtof(r), mtof(r + 7), mtof(r) * 1.003];
  drone.forEach((o, i) => o.frequency.setTargetAtTime(fr[i], t, 1.5));
  droneG.gain.setTargetAtTime(mood.drone, t, 2);
}

function build() {
  const c = E.ctx;
  mainG = c.createGain(); mainG.gain.value = 1; mainG.connect(E.music); mainG.connect(E.musicVerb);
  combatG = c.createGain(); combatG.gain.value = 0; combatG.connect(E.music);
  const cv = c.createGain(); cv.gain.value = 0.3; combatG.connect(cv); cv.connect(E.musicVerb);
  droneG = c.createGain(); droneG.gain.value = 0;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
  const lfg = c.createGain(); lfg.gain.value = 140; lfo.connect(lfg); lfg.connect(lp.frequency); lfo.start();
  droneG.connect(lp); lp.connect(E.music); lp.connect(E.musicVerb);
  drone = ['sawtooth', 'sawtooth', 'triangle'].map(type => { const o = c.createOscillator(); o.type = type; o.frequency.value = 73; const g = c.createGain(); g.gain.value = type === 'triangle' ? 0.6 : 0.35; o.connect(g); g.connect(droneG); o.start(); return o; });
}

function newSection() {
  const barLen = mood.bar;
  const R = barLen === 6 ? RHYTHM6 : RHYTHM8;
  const motif = () => {
    const notes = [];
    let deg = pick([2, 4, 4, 7]);
    for (let b = 0; b < 2; b++) {
      const r = pick(R.slice(0, R.length - 1));
      for (let s = 0; s < barLen; s++) {
        if (!r[s]) { notes.push(null); continue; }
        const x = Math.random();
        deg += x < 0.3 ? 1 : x < 0.6 ? -1 : x < 0.75 ? 2 : x < 0.9 ? -2 : 0;
        deg = Math.max(0, Math.min(10, deg));
        notes.push(deg);
      }
    }
    // land on a chord tone, hold it
    for (let i = notes.length - 1; i >= 0; i--) if (notes[i] != null) { notes[i] = pick([0, 4, 7]); break; }
    return notes;
  };
  const A = motif(), B = motif();
  const A2 = A.slice(); for (let i = barLen; i < A2.length; i++) if (A2[i] != null && Math.random() < 0.5) A2[i] = Math.max(0, A2[i] + pick([-1, 1, 2]));
  plan = [...A, ...A2, ...B, ...A];
  const rests = Math.floor(rnd(mood.rests[0], mood.rests[1] + 1));
  // every few sections take a long breath
  const longRest = ++sectionCount % 3 === 0 ? 6 : 0;
  for (let i = 0; i < (rests + longRest) * barLen; i++) plan.push(undefined); // undefined = resting (no accompaniment)
  planBar = 0;
  planInst = Math.random() < mood.flute ? 'flute' : 'pluck';
}

function setMood(name, t) {
  mood = MOODS[name] ?? MOODS.menu; moodName = name;
  setDrone(t);
  newSection();
  stepN = 0;
  // pre-warm pluck buffers for this mood's range
  for (let d = -7; d <= 11; d++) warmQueue.push(noteOf(d));
}

function scheduleStep(t) {
  const bar = mood.bar;
  const s = stepN % bar;
  const barN = Math.floor(stepN / bar);
  const stepDur = 60 / mood.bpm / 2;
  const night = game.started ? (game.hour < 5 || game.hour > 21 ? 0.7 : 1) : 1;
  const idx = planBar;
  const mel = plan[idx];
  const resting = mel === undefined && idx < plan.length;
  // melody
  if (mel != null && Math.random() < 0.6 + mood.density * 0.45) {
    const midi = noteOf(mel);
    if (planInst === 'flute') {
      let len = 1; while (plan[idx + len] === null && len < 4) len++;
      flute(midi + 12, t, stepDur * len * 0.95, 0.09 * night, mainG);
    } else pluck(midi, t, 0.32 * night, mainG, rnd(-0.2, 0.2));
  }
  // accompaniment arpeggio on the chord of this bar
  if (!resting) {
    const chord = mood.prog[barN % mood.prog.length];
    const arp = bar === 6 ? { 0: 0, 2: 2, 4: 4 } : { 0: 0, 3: 4, 4: 7, 6: 2 };
    if (arp[s] != null && Math.random() < 0.9) pluck(noteOf(chord + arp[s], -12), t, 0.18 * night, mainG, rnd(-0.5, 0.5));
    if (mood.drum) {
      const pat = mood.drum[barN % mood.drum.length];
      const ch = pat[s];
      if (ch === 'D') drum(mood.low ? 'L' : 'D', t, mood.drumVol * night, mainG);
      else if (ch === 't') drum('t', t, mood.drumVol * 0.5 * night, mainG);
    }
  } else if (s === 0 && Math.random() < 0.5) {
    // sparse low note while resting
    pluck(noteOf(0, -12), t, 0.14 * night, mainG, 0);
  }
  // combat layer
  if (combat > 0.02) {
    const pat = 'L.TTL.TtL.TTLTTt'.slice((barN % 2) * 8, (barN % 2) * 8 + 8);
    const ch = pat[s % 8];
    if (ch === 'L') drum('L', t, 0.6, combatG);
    else if (ch === 'T') drum('T', t, 0.4, combatG);
    else if (ch === 't') drum('t', t, 0.3, combatG);
    const ost = [0, 0, 1, 0, 4, 0, 3, 1];
    const savedOct = mood.oct; mood.oct = 0;
    pluck(noteOf(ost[s % 8], -12) + (mood.mode === 'phrygian' ? 0 : 0), t, 0.28, combatG, rnd(-0.3, 0.3));
    if (s % 4 === 0) pluck(noteOf(ost[s % 8] + 4, 0), t, 0.12, combatG, 0);
    mood.oct = savedOct;
  }
  stepN++;
  planBar++;
  if (planBar >= plan.length && s === bar - 1) newSection();
  return stepDur;
}

function chooseMood() {
  if (!game.started) return 'menu';
  const p = game.player;
  if (!p) return 'menu';
  if (!p.alive) return 'death';
  return zoneAt(p.pos.x, p.pos.z).id;
}

export function setMusicEnabled(v) { enabled = v; }

export function updateMusic(dt, combatLevel) {
  if (!E.ctx) return;
  if (!mainG || mainG.context !== E.ctx) { ksCache.clear(); warmQueue.length = 0; build(); setMood(chooseMood(), E.ctx.currentTime); nextT = E.ctx.currentTime + 0.3; }
  // warm a couple of pluck buffers per frame
  for (let i = 0; i < 2 && warmQueue.length; i++) ks(warmQueue.shift());
  const ct = E.ctx.currentTime;
  combat += ((combatLevel ?? 0) - combat) * Math.min(1, dt * (combatLevel > combat ? 1.5 : 0.35));
  combatG.gain.setTargetAtTime(combat * 0.9, ct, 0.2);
  mainG.gain.setTargetAtTime(1 - combat * 0.55, ct, 0.4);
  if (E.vol.music <= 0.001 || E.vol.muted || !enabled) { nextT = ct + 0.1; return; }
  targetMood = chooseMood();
  if (nextT < ct - 0.2) nextT = ct + 0.05; // stalled (tab hidden, long frame)
  let guard = 0;
  while (nextT < ct + 0.25 && guard++ < 16) {
    if (stepN % mood.bar === 0 && targetMood !== moodName) setMood(targetMood, nextT);
    nextT += scheduleStep(nextT);
  }
}

export function currentMood() { return moodName; }
