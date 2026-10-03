// Formant voice synthesis: grunts, pain cries, screams, death groans, shouts.
// Source = sawtooth (+ breath noise) -> soft clipper (roughness) -> 3 parallel formant bandpasses.
import { E, sound, rnd, shaperCurve } from './engine.js';

const VOWELS = {
  a: [[800, 1150, 2900], [1, 0.5, 0.18]],
  o: [[450, 800, 2830], [1, 0.35, 0.1]],
  u: [[325, 700, 2530], [1, 0.25, 0.06]],
  e: [[400, 1700, 2600], [1, 0.4, 0.2]],
  i: [[290, 1870, 2800], [1, 0.3, 0.2]],
  y: [[360, 1400, 2500], [1, 0.35, 0.12]], // Russian "ы" — essential for "ыыы"
};

// Base pitch by body kind (Hz)
const KIND_F0 = {
  elf: 185, elfChief: 150, guard: 118, commander: 98, emperor: 128, minion: 92, villain: 62,
  spy: 135, peasant: 125, merchant: 112, healer: 132, caravaneer: 110,
};
const KIND_FORMANT = { elf: 1.14, elfChief: 1.08, villain: 0.82, minion: 0.9, commander: 0.94, merchant: 0.96 };
const KIND_ROUGH = { villain: 1.0, minion: 0.6, commander: 0.4 };

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

export function voiceOf(actor) {
  if (!actor) return { f0: 120, fs: 1, rough: 0.2 };
  if (!actor._voice) {
    const h = hash(actor.id ?? 1);
    const f0 = (KIND_F0[actor.kind] ?? 120) * (0.86 + h * 0.28) / Math.sqrt(actor.scale ?? 1);
    actor._voice = { f0, fs: (KIND_FORMANT[actor.kind] ?? 1) * (0.95 + hash(h * 99) * 0.1), rough: KIND_ROUGH[actor.kind] ?? 0.15 + h * 0.2 };
  }
  return actor._voice;
}

// spec: { pos, f0, fs (formant scale), dur, vowels:[...], pitch:[mult...], rough, breath, vol, vib, vibRate, prio, delay, verb }
export function say(spec) {
  const dur = spec.dur ?? 0.3;
  const s = sound({ pos: spec.pos, vol: (spec.vol ?? 0.5) * 0.7, prio: spec.prio ?? 1, dur: dur + 0.1, delay: spec.delay, verb: spec.verb, bus: spec.bus });
  if (!s) return;
  const c = E.ctx, t = s.t, fs = spec.fs ?? 1;
  const f0 = spec.f0 ?? 120;
  // glottal source
  const o = c.createOscillator(); o.type = 'sawtooth';
  const pc = spec.pitch ?? [1, 0.85];
  o.frequency.setValueAtTime(f0 * pc[0], t);
  for (let i = 1; i < pc.length; i++) o.frequency.linearRampToValueAtTime(f0 * pc[i] * (1 + rnd(-0.03, 0.03)), t + dur * i / (pc.length - 1));
  // vibrato / jitter
  const vib = spec.vib ?? 0.02;
  if (vib > 0) {
    const l = c.createOscillator(); l.frequency.value = spec.vibRate ?? rnd(5, 7);
    const lg = s.n(c.createGain()); lg.gain.value = f0 * vib;
    l.connect(lg); lg.connect(o.frequency); s.src(l, t, t + dur + 0.05);
  }
  const amp = s.n(c.createGain());
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(1, t + Math.min(0.04, dur * 0.2));
  amp.gain.setValueAtTime(1, t + dur * 0.6);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const rough = spec.rough ?? 0.2;
  const sh = s.n(c.createWaveShaper()); sh.curve = shaperCurve(1 + rough * 6);
  o.connect(sh); sh.connect(amp);
  s.src(o, t, t + dur + 0.02);
  // breath noise into the same formants
  const br = spec.breath ?? 0.15;
  if (br > 0) {
    const ng = s.n(c.createGain()); ng.gain.value = br * 2.5;
    s.noise('white', t, dur + 0.02, ng); ng.connect(amp);
  }
  // formants
  const vs = spec.vowels ?? ['a'];
  const out = s.filter('lowpass', 4200, 0.5);
  for (let k = 0; k < 3; k++) {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    const [fr, ga] = VOWELS[vs[0]] ?? VOWELS.a;
    bp.frequency.setValueAtTime(fr[k] * fs, t); bp.Q.value = [6, 9, 14][k];
    const g = s.n(c.createGain()); g.gain.setValueAtTime(ga[k] * [2.2, 3.2, 4.5][k], t);
    for (let i = 1; i < vs.length; i++) {
      const [fr2, ga2] = VOWELS[vs[i]] ?? VOWELS.a;
      const ti = t + dur * i / (vs.length - 1) * 0.9;
      bp.frequency.linearRampToValueAtTime(fr2[k] * fs, ti);
      g.gain.linearRampToValueAtTime(ga2[k] * [2.2, 3.2, 4.5][k], ti);
    }
    amp.connect(bp); bp.connect(g); g.connect(out); s.n(bp);
  }
  s.done();
}

// ---- vocabulary ----
export function grunt(actor, pos, heavy = 0.5) {
  const v = voiceOf(actor);
  say({ pos, f0: v.f0 * rnd(1.0, 1.2), fs: v.fs, dur: rnd(0.14, 0.24) + heavy * 0.08, vowels: Math.random() < 0.5 ? ['a', 'u'] : ['y', 'o'],
    pitch: [1.15, 1.2, 0.8], rough: v.rough + 0.3, breath: 0.25, vol: 0.32 + heavy * 0.2, vib: 0.01 });
}
export function pain(actor, pos, heavy = 0.7) {
  const v = voiceOf(actor);
  say({ pos, f0: v.f0 * rnd(1.25, 1.5), fs: v.fs, dur: rnd(0.45, 0.7) + heavy * 0.2, vowels: ['a', 'a', 'o', 'u'],
    pitch: [1.0, 1.25, 1.15, 0.75], rough: v.rough + 0.45, breath: 0.2, vol: 0.4 + heavy * 0.15, vib: 0.035 });
}
export function scream(actor, pos) {
  // comic, over-the-top "AAAAAAA!"
  const v = voiceOf(actor);
  say({ pos, f0: v.f0 * rnd(1.8, 2.2), fs: v.fs * 1.05, dur: rnd(1.0, 1.35), vowels: ['a', 'a', 'e', 'a', 'o'],
    pitch: [1.0, 1.35, 1.45, 1.3, 1.5, 0.9], rough: v.rough + 0.35, breath: 0.15, vol: 0.55, vib: 0.06, vibRate: rnd(6.5, 8.5), prio: 2 });
}
export function groan(actor, pos) {
  const v = voiceOf(actor);
  say({ pos, f0: v.f0 * rnd(1.0, 1.15), fs: v.fs, dur: rnd(0.9, 1.3), vowels: ['o', 'o', 'u', 'u'],
    pitch: [1.1, 1.0, 0.8, 0.55], rough: v.rough + 0.5, breath: 0.45, vol: 0.45, vib: 0.03, vibRate: 4 });
}
export function hup(actor, pos) {
  const v = voiceOf(actor);
  say({ pos, f0: v.f0 * 1.2, fs: v.fs, dur: 0.13, vowels: ['u', 'a'], pitch: [1, 1.15], rough: 0.2, breath: 0.4, vol: 0.18, vib: 0 });
}
export function shout(f0, pos, vowels = ['a', 'o'], vol = 0.4, extra = {}) {
  say({ pos, f0, dur: rnd(0.25, 0.4), vowels, pitch: [1.1, 1.25, 0.9], rough: 0.7, breath: 0.3, vol, vib: 0.01, ...extra });
}
export function gurgle(pos) {
  say({ pos, f0: 70, dur: 0.8, vowels: ['u', 'o', 'u'], pitch: [1, 0.7, 1.1, 0.6], rough: 1, breath: 0.8, vol: 0.3, vib: 0.3, vibRate: 13 });
}
