// Synthesized one-shot sound effects (combat, UI, fanfares...). All functions are safe no-ops
// when audio is unavailable (sound() returns null).
import { E, sound, rnd, pick, mtof } from './engine.js';

// ---------- combat ----------
// style: 'slash' | 'thrust' | 'bow'; weight 0..1 (weapon heaviness)
export function whoosh(pos, style = 'slash', weight = 0.5, vol = 0.5) {
  const dur = style === 'thrust' ? 0.18 : 0.26 + weight * 0.12;
  const s = sound({ pos, vol, dur: dur + 0.05, prio: 0, verb: 0.05 });
  if (!s) return;
  const t = s.t;
  const bp = s.filter('bandpass', 500, 1.6 - weight * 0.6);
  const f0 = 450 - weight * 200, f1 = (style === 'thrust' ? 2600 : 1900) - weight * 700;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.55);
  bp.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
  const g = s.n(E.ctx.createGain());
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1.6, t + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(bp);
  s.noise('pink', t, dur, g);
  s.done();
}

export function bowCreak(pos, vol = 0.25) {
  const s = sound({ pos, vol, dur: 0.5, prio: 0 });
  if (!s) return;
  const t = s.t;
  const bp = s.filter('bandpass', 900, 6);
  const g = s.env(t, 0.25, 0.25, 0.6, bp);
  const o = s.osc('sawtooth', 38, t, 0.5, g);
  o.frequency.linearRampToValueAtTime(55, t + 0.45);
  s.done();
}

export function twang(pos, vol = 0.55) {
  const s = sound({ pos, vol, dur: 0.6, prio: 1 });
  if (!s) return;
  const t = s.t;
  // string: decaying triangle with pitch drop + harmonics
  const lp = s.filter('lowpass', 2200, 2);
  const g = s.env(t, 0.002, 0.35, 0.9, lp);
  const o = s.osc('sawtooth', 175, t, 0.4, g);
  o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.3);
  const o2 = s.osc('triangle', 380, t, 0.3, g);
  o2.frequency.exponentialRampToValueAtTime(250, t + 0.25);
  // wood slap
  const slap = s.env(t, 0.001, 0.05, 1.2, s.filter('bandpass', 1400, 1.5));
  s.noise('white', t, 0.06, slap);
  // arrow whistle
  const hp = s.filter('bandpass', 4000, 4);
  hp.frequency.setValueAtTime(5200, t + 0.02); hp.frequency.exponentialRampToValueAtTime(2600, t + 0.4);
  s.noise('white', t + 0.02, 0.4, s.env(t + 0.02, 0.05, 0.33, 0.35, hp));
  s.done();
}

// flesh impact; dmg 0..60; blunt adds a bonk, cut adds a slice
export function fleshHit(pos, dmg = 15, kind = 'cut', vol = 0.7) {
  const heavy = Math.min(1, dmg / 40);
  const s = sound({ pos, vol: vol * (1.0 + heavy * 0.8), dur: 0.4, prio: 1 });
  if (!s) return;
  const t = s.t;
  // body thump
  const tg = s.env(t, 0.002, 0.12 + heavy * 0.12, 1.1);
  const o = s.osc('sine', 140 + (1 - heavy) * 60, t, 0.3, tg);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.18 + heavy * 0.1);
  // wet smack
  const lp = s.filter('lowpass', 1100 + heavy * 600, 1);
  s.noise('white', t, 0.12, s.env(t, 0.001, 0.08 + heavy * 0.05, 1.2, lp));
  const sq = s.filter('bandpass', 700, 3);
  sq.frequency.setValueAtTime(1200, t); sq.frequency.exponentialRampToValueAtTime(350, t + 0.15);
  s.noise('pink', t + 0.01, 0.18, s.env(t + 0.01, 0.005, 0.15, 1.3 * heavy + 0.3, sq));
  if (kind === 'cut') {
    const hp = s.filter('highpass', 3200, 0.8);
    s.noise('white', t, 0.09, s.env(t, 0.001, 0.07, 0.7, hp));
  } else if (kind === 'blunt') {
    const g2 = s.env(t, 0.001, 0.09, 0.9, s.filter('bandpass', 380, 2));
    s.noise('white', t, 0.1, g2);
    const o2 = s.osc('triangle', 230, t, 0.12, s.env(t, 0.001, 0.08, 0.5));
    o2.frequency.exponentialRampToValueAtTime(90, t + 0.1);
  } else if (kind === 'arrow') {
    // "thwack"
    const g3 = s.env(t, 0.001, 0.04, 1.4, s.filter('bandpass', 2400, 2));
    s.noise('white', t, 0.05, g3);
  }
  s.done();
}

// metallic ring with inharmonic partials (sword on sword, helmet bonk, armour)
export function clang(pos, base = 520, vol = 0.55, decay = 0.6) {
  const s = sound({ pos, vol, dur: decay + 0.1, prio: 1, verb: 0.2 });
  if (!s) return;
  const t = s.t;
  const ratios = [1, 2.76, 5.4, 8.93, 1.51];
  const f = base * rnd(0.92, 1.08);
  ratios.forEach((r, i) => {
    const g = s.env(t, 0.001, decay * (1 - i * 0.15), 0.35 / (1 + i * 0.6));
    s.osc('sine', f * r, t, decay + 0.05, g);
  });
  // impact click
  s.noise('white', t, 0.03, s.env(t, 0.0005, 0.025, 1.4, s.filter('highpass', 2500, 0.7)));
  s.done();
}

export function woodThud(pos, vol = 0.7) {
  const s = sound({ pos, vol, dur: 0.35, prio: 1 });
  if (!s) return;
  const t = s.t;
  const o = s.osc('sine', 190, t, 0.25, s.env(t, 0.001, 0.18, 1));
  o.frequency.exponentialRampToValueAtTime(95, t + 0.15);
  s.noise('white', t, 0.12, s.env(t, 0.001, 0.09, 1.1, s.filter('bandpass', 650, 3)));
  s.osc('triangle', 410, t, 0.12, s.env(t, 0.001, 0.07, 0.35));
  s.done();
}

export function miss(pos, vol = 0.18) {
  const s = sound({ pos, vol, dur: 0.3, prio: 0 });
  if (!s) return;
  const t = s.t;
  const bp = s.filter('bandpass', 1400, 0.8);
  bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
  s.noise('pink', t, 0.28, s.env(t, 0.02, 0.24, 1, bp));
  s.done();
}

// comic-gory wet squelch (+ crunch); kind: 'limb'|'eye'|'head'
export function squelch(pos, kind = 'limb', vol = 0.75) {
  const s = sound({ pos, vol, dur: 0.9, prio: 2, verb: 0.15 });
  if (!s) return;
  const t = s.t, c = E.ctx;
  // bone crunch: cluster of tiny clicks
  if (kind !== 'eye') {
    const hp = s.filter('bandpass', 2600, 1.2);
    for (let i = 0; i < 7; i++) {
      const ti = t + i * rnd(0.008, 0.02);
      s.noise('white', ti, 0.02, s.env(ti, 0.0005, 0.012, rnd(0.6, 1.4), hp));
    }
  }
  // gloopy squelch: bandpass sweeping noise bursts with resonant wobble
  const n = kind === 'eye' ? 2 : 4;
  for (let i = 0; i < n; i++) {
    const ti = t + 0.03 + i * rnd(0.06, 0.11);
    const bp = s.filter('bandpass', 600, 7);
    bp.frequency.setValueAtTime(rnd(300, 600), ti);
    bp.frequency.exponentialRampToValueAtTime(rnd(900, 1800), ti + 0.08);
    bp.frequency.exponentialRampToValueAtTime(rnd(200, 400), ti + 0.16);
    s.noise('pink', ti, 0.18, s.env(ti, 0.008, 0.15, rnd(2.5, 4), bp));
  }
  // low "splorch"
  const o = s.osc('sine', 160, t, 0.35, s.env(t, 0.003, 0.3, 0.9));
  o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  const lfo = c.createOscillator(); lfo.frequency.value = 23;
  const lg = s.n(c.createGain()); lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency); s.src(lfo, t, t + 0.35);
  if (kind === 'eye' || kind === 'head') {
    // cork "pop!"
    const ti = t + (kind === 'eye' ? 0.02 : 0.08);
    const p = s.osc('sine', 500, ti, 0.08, s.env(ti, 0.001, 0.06, 0.8));
    p.frequency.exponentialRampToValueAtTime(1600, ti + 0.05);
  }
  // dripping splats
  for (let i = 0; i < 3; i++) {
    const ti = t + 0.35 + i * rnd(0.08, 0.16);
    const p = s.osc('sine', rnd(900, 1400), ti, 0.05, s.env(ti, 0.001, 0.04, 0.25));
    p.frequency.exponentialRampToValueAtTime(rnd(300, 500), ti + 0.04);
  }
  s.done();
}

export function bodyFall(pos, armored = false, delay = 0.45, vol = 0.8) {
  const s = sound({ pos, vol, dur: 0.6, prio: 1, delay });
  if (!s) return;
  const t = s.t;
  const o = s.osc('sine', 85, t, 0.4, s.env(t, 0.004, 0.3, 1.2));
  o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
  s.noise('brown', t, 0.3, s.env(t, 0.003, 0.25, 2, s.filter('lowpass', 500, 0.7)));
  s.noise('pink', t + 0.02, 0.15, s.env(t + 0.02, 0.003, 0.12, 0.6, s.filter('bandpass', 1500, 1)));
  if (armored) {
    for (let i = 0; i < 5; i++) {
      const ti = t + 0.02 + i * rnd(0.03, 0.08);
      s.osc('sine', rnd(2200, 4200), ti, 0.12, s.env(ti, 0.001, 0.1, 0.12));
    }
  }
  s.done();
}

export function land(pos, vol = 0.45) {
  const s = sound({ pos, vol, dur: 0.3, prio: 1 });
  if (!s) return;
  const t = s.t;
  const o = s.osc('sine', 110, t, 0.2, s.env(t, 0.002, 0.15, 1));
  o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  s.noise('pink', t, 0.15, s.env(t, 0.002, 0.12, 1, s.filter('lowpass', 1200, 0.7)));
  s.done();
}

// ---------- coins / UI ----------
export function coins(n = 5, vol = 0.4) {
  n = Math.max(2, Math.min(14, n));
  const s = sound({ vol, dur: 0.25 + n * 0.06 + 0.3, prio: 2, verb: 0.12 });
  if (!s) return;
  let t = s.t;
  for (let i = 0; i < n; i++) {
    const f = rnd(2600, 4800);
    const g = s.env(t, 0.001, rnd(0.12, 0.25), rnd(0.2, 0.35));
    s.osc('sine', f, t, 0.3, g);
    s.osc('sine', f * 1.47, t, 0.2, s.env(t, 0.001, 0.08, 0.12));
    s.noise('white', t, 0.015, s.env(t, 0.0005, 0.01, 0.25, s.filter('highpass', 5000, 0.7)));
    t += rnd(0.025, 0.08);
  }
  s.done();
}

export function tick(vol = 0.18) {
  const s = sound({ vol, dur: 0.08, prio: 2 });
  if (!s) return;
  s.osc('sine', 1350, s.t, 0.06, s.env(s.t, 0.001, 0.045, 2.4));
  s.osc('sine', 2700, s.t, 0.03, s.env(s.t, 0.001, 0.02, 0.9));
  s.done();
}

export function click(vol = 0.15) {
  const s = sound({ vol, dur: 0.06, prio: 2, verb: 0 });
  if (!s) return;
  s.noise('white', s.t, 0.03, s.env(s.t, 0.0005, 0.02, 1, s.filter('bandpass', 2600, 2)));
  s.osc('sine', 700, s.t, 0.04, s.env(s.t, 0.001, 0.025, 0.4));
  s.done();
}

function bellTone(s, t, f, dur, peak) {
  [[1, 1], [2.0, 0.5], [3.01, 0.25], [4.2, 0.12]].forEach(([r, a]) =>
    s.osc('sine', f * r, t, dur, s.env(t, 0.002, dur * (1 - r * 0.12), peak * a)));
}

export function good(vol = 0.3) {
  const s = sound({ vol, dur: 0.8, prio: 2, verb: 0.2 });
  if (!s) return;
  bellTone(s, s.t, mtof(79), 0.5, 0.5);
  bellTone(s, s.t + 0.1, mtof(86), 0.6, 0.5);
  s.done();
}

export function bad(vol = 0.3) {
  const s = sound({ vol, dur: 0.8, prio: 2, verb: 0.15 });
  if (!s) return;
  const t = s.t;
  const lp = s.filter('lowpass', 1400, 1);
  s.osc('sawtooth', mtof(57), t, 0.25, s.env(t, 0.005, 0.22, 0.4, lp));
  s.osc('sawtooth', mtof(58), t + 0.18, 0.45, s.env(t + 0.18, 0.005, 0.4, 0.4, lp));
  s.osc('sawtooth', mtof(51), t + 0.18, 0.45, s.env(t + 0.18, 0.005, 0.4, 0.3, lp));
  s.done();
}

export function chime(vol = 0.35) {
  const s = sound({ vol, dur: 1.6, prio: 2, verb: 0.35 });
  if (!s) return;
  [72, 76, 79, 84, 88].forEach((m, i) => bellTone(s, s.t + i * 0.09, mtof(m), 1.0, 0.35));
  s.done();
}

export function paper(vol = 0.25) {
  const s = sound({ vol, dur: 0.7, prio: 2, verb: 0.05 });
  if (!s) return;
  const t = s.t;
  // rustle
  const bp = s.filter('bandpass', 3000, 0.8);
  for (let i = 0; i < 3; i++) s.noise('white', t + i * 0.07, 0.09, s.env(t + i * 0.07, 0.01, 0.07, rnd(0.4, 0.8), bp));
  // quill scratches
  const sc = s.filter('bandpass', 5500, 5);
  for (let i = 0; i < 4; i++) { const ti = t + 0.28 + i * 0.08; s.noise('white', ti, 0.06, s.env(ti, 0.005, 0.05, 0.6, sc)); }
  s.done();
}

// brass-ish note for fanfares/horns
function brass(s, t, f, dur, peak, bright = 2400, dest) {
  const lp = s.filter('lowpass', 300, 1.5, dest ?? s.out);
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(bright, t + 0.06);
  lp.frequency.setTargetAtTime(bright * 0.6, t + 0.1, 0.3);
  const g = s.n(E.ctx.createGain());
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.04);
  g.gain.setValueAtTime(peak * 0.8, t + Math.max(0.05, dur - 0.08));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  g.connect(lp);
  const o1 = s.osc('sawtooth', f, t, dur + 0.02, g); o1.detune.value = -6;
  const o2 = s.osc('sawtooth', f, t, dur + 0.02, g); o2.detune.value = 7;
  return o1;
}

export function fanfare(vol = 0.4, big = false) {
  const seq = big
    ? [[67, 0, 0.15], [67, 0.16, 0.15], [67, 0.32, 0.15], [72, 0.5, 0.4], [67, 0.95, 0.2], [72, 1.17, 0.2], [76, 1.4, 0.3], [79, 1.75, 1.3]]
    : [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 0.8]];
  const end = seq[seq.length - 1][1] + seq[seq.length - 1][2];
  const s = sound({ vol, dur: end + 0.5, prio: 3, verb: 0.3 });
  if (!s) return;
  const t = s.t;
  for (const [m, at, d] of seq) brass(s, t + at, mtof(m), d, 0.35);
  // final chord
  const fin = t + seq[seq.length - 1][1];
  const last = seq[seq.length - 1][0];
  brass(s, fin, mtof(last - 7), seq[seq.length - 1][2], 0.22);
  brass(s, fin, mtof(last - 3), seq[seq.length - 1][2], 0.2);
  // timpani hits
  [[0, 43], [end - seq[seq.length - 1][2], 43]].forEach(([at, m]) => {
    const o = s.osc('sine', mtof(m), t + at, 0.6, s.env(t + at, 0.003, 0.5, 0.9));
    o.frequency.exponentialRampToValueAtTime(mtof(m) * 0.85, t + at + 0.5);
  });
  s.done();
}

// war horn (raid) / commander's horn (orders). Global, slightly panned if position given far away.
export function horn(kind = 'war', vol = 0.45, pan = 0) {
  const war = kind === 'war';
  const blasts = war ? [[0, 1.4], [1.6, 2.2]] : [[0, 0.7]];
  const end = blasts[blasts.length - 1][0] + blasts[blasts.length - 1][1];
  const s = sound({ vol, dur: end + 0.6, prio: 3, verb: 0.5, pan });
  if (!s) return;
  const t = s.t, c = E.ctx;
  const f = war ? mtof(38) : mtof(50);
  for (const [at, d] of blasts) {
    const ta = t + at;
    const o = brass(s, ta, f, d, 0.5, war ? 1100 : 1800);
    o.frequency.setValueAtTime(f * 0.9, ta);
    o.frequency.linearRampToValueAtTime(f, ta + 0.18);
    brass(s, ta + 0.05, f * 1.5, d - 0.05, 0.22, war ? 1300 : 2000);
    if (war) brass(s, ta, f * 0.5, d, 0.3, 600);
    const lfo = c.createOscillator(); lfo.frequency.value = 5;
    const lg = s.n(c.createGain()); lg.gain.value = 1.5; lfo.connect(lg); lg.connect(o.frequency); s.src(lfo, ta, ta + d);
  }
  s.done();
}

export function bell(pan = 0, vol = 0.4, strikes = 3, base = 196) {
  const dur = strikes * 2.2 + 5;
  const s = sound({ vol, dur, prio: 2, bus: 'amb', verb: 0.5, pan });
  if (!s) return;
  const ratios = [[0.5, 0.6, 1.0], [1, 1, 0.8], [1.19, 0.5, 0.6], [1.5, 0.4, 0.5], [2, 0.35, 0.4], [2.51, 0.2, 0.3], [2.66, 0.15, 0.25], [3.01, 0.12, 0.2]];
  for (let k = 0; k < strikes; k++) {
    const t = s.t + k * 2.2;
    for (const [r, a, dd] of ratios) s.osc('sine', base * r, t, 5.5 * dd + 0.1, s.env(t, 0.003, 5.5 * dd, a * 0.25));
    s.noise('white', t, 0.03, s.env(t, 0.001, 0.02, 0.3, s.filter('bandpass', 1500, 1)));
  }
  s.done();
}

export function heartbeat(vol = 0.5) {
  const s = sound({ vol, dur: 0.6, prio: 2, verb: 0 });
  if (!s) return;
  const t = s.t;
  for (const [at, a] of [[0, 1], [0.24, 0.7]]) {
    const o = s.osc('sine', 62, t + at, 0.22, s.env(t + at, 0.008, 0.16, a, s.filter('lowpass', 160, 1)));
    o.frequency.exponentialRampToValueAtTime(38, t + at + 0.15);
  }
  s.done();
}

export function breath(inhale = true, vol = 0.18) {
  const d = inhale ? 0.7 : 0.55;
  const s = sound({ vol, dur: d + 0.1, prio: 2, verb: 0 });
  if (!s) return;
  const t = s.t;
  const bp = s.filter('bandpass', inhale ? 1300 : 900, 1.2);
  bp.frequency.linearRampToValueAtTime(inhale ? 1700 : 650, t + d);
  const g = s.n(E.ctx.createGain());
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(1, t + d * (inhale ? 0.7 : 0.2));
  g.gain.linearRampToValueAtTime(0.0001, t + d);
  g.connect(bp);
  s.noise('pink', t, d, g);
  s.done();
}

export function splash(pos, vol = 0.4) {
  const s = sound({ pos, vol, dur: 0.5, prio: 0 });
  if (!s) return;
  const t = s.t;
  const lp = s.filter('lowpass', 2500, 0.8);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
  s.noise('white', t, 0.35, s.env(t, 0.01, 0.3, 0.9, lp));
  for (let i = 0; i < 3; i++) {
    const ti = t + 0.05 + i * rnd(0.04, 0.09);
    const o = s.osc('sine', rnd(500, 800), ti, 0.07, s.env(ti, 0.002, 0.05, 0.25));
    o.frequency.exponentialRampToValueAtTime(rnd(1200, 1800), ti + 0.05);
  }
  s.done();
}

export function thunder(pan = 0, vol = 0.6, dist = 1) {
  const dur = rnd(4, 7);
  const s = sound({ vol, dur: dur + 0.3, prio: 2, bus: 'amb', verb: 0.4, pan });
  if (!s) return;
  const t = s.t, c = E.ctx;
  const lp = s.filter('lowpass', 400 / dist, 0.7);
  lp.frequency.setValueAtTime(900 / dist, t); lp.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = s.n(c.createGain());
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(dist < 1.3 ? 1.6 : 0.8, t + rnd(0.05, 0.4));
  // rolling rumble
  let tt = t + 0.4;
  while (tt < t + dur * 0.8) { g.gain.linearRampToValueAtTime(rnd(0.4, 1.4), tt); tt += rnd(0.2, 0.7); }
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(lp);
  s.noise('brown', t, dur, g, 0.7);
  s.noise('pink', t, dur * 0.5, s.env(t, 0.02, dur * 0.4, 0.3, lp));
  s.done();
}

export function lament(vol = 0.35) {
  // short mournful phrase on player's death
  const seq = [[62, 0, 0.6], [60, 0.6, 0.6], [58, 1.2, 0.6], [57, 1.8, 1.6]];
  const s = sound({ vol, dur: 3.8, prio: 3, verb: 0.4, bus: 'music' });
  if (!s) return;
  for (const [m, at, d] of seq) brass(s, s.t + at, mtof(m), d, 0.25, 900);
  brass(s, s.t + 1.8, mtof(50), 1.6, 0.18, 600);
  s.done();
}

export { pick };
