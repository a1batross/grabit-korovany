// Web Audio core: context, buses, master chain (compressor + limiter), generated reverb,
// shared noise buffers, voice limiting and a small "Sound" builder that auto-disconnects its nodes.
// Everything is synthesized — there are no audio files in this game.
// Works with a real AudioContext or an OfflineAudioContext (used for tests).

export const E = {
  ctx: null,
  out: null,      // master volume
  sfx: null,      // sfx bus (positional + UI)
  amb: null,      // ambience bus
  music: null,    // music bus
  muffle: null,   // lowpass on sfx+amb (low HP "tunnel" effect)
  verbIn: null,   // reverb send
  noise: {},      // white / pink / brown AudioBuffers
  voices: [],     // { end, prio }
  maxVoices: 24,
  cullDist: 80,
  lx: 0, ly: 0, lz: 0, // listener position (camera)
  vol: { master: 0.8, music: 0.5, sfx: 0.9, amb: 0.8, muted: false },
};

export function initEngine(ctx) {
  E.ctx = ctx;
  const c = ctx;
  E.out = c.createGain();
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
  const trim = c.createGain(); trim.gain.value = 0.92;
  E.out.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(c.destination);

  E.muffle = c.createBiquadFilter(); E.muffle.type = 'lowpass'; E.muffle.frequency.value = 20000; E.muffle.Q.value = 0.5;
  E.muffle.connect(E.out);
  E.sfx = c.createGain(); E.sfx.connect(E.muffle);
  E.amb = c.createGain(); E.amb.connect(E.muffle);
  E.music = c.createGain(); E.music.connect(E.out);

  makeNoise();
  // Generated stereo impulse response (~2.4 s, darkening tail)
  const conv = c.createConvolver();
  conv.buffer = makeImpulse(2.4, 2.8);
  E.verbIn = c.createGain(); E.verbIn.gain.value = 1;
  const verbOut = c.createGain(); verbOut.gain.value = 0.55;
  E.verbIn.connect(conv); conv.connect(verbOut); verbOut.connect(E.muffle);
  // separate (wetter, longer) reverb for music
  const mconv = c.createConvolver();
  mconv.buffer = makeImpulse(3.2, 2.2);
  E.musicVerb = c.createGain(); E.musicVerb.gain.value = 0.35;
  E.musicVerb.connect(mconv); mconv.connect(E.music);
  applyVolumes(true);
  return E;
}

export function applyVolumes(instant = false) {
  if (!E.ctx) return;
  const v = E.vol, t = E.ctx.currentTime;
  const set = (p, x) => { if (instant) p.value = x; else p.setTargetAtTime(x, t, 0.05); };
  set(E.out.gain, v.muted ? 0 : v.master);
  set(E.sfx.gain, v.sfx);
  set(E.amb.gain, v.sfx * v.amb * 0.6);
  set(E.music.gain, v.music * 0.55);
}

function makeNoise() {
  const c = E.ctx, sr = c.sampleRate, n = Math.floor(sr * 2.5);
  const white = c.createBuffer(1, n, sr), pink = c.createBuffer(1, n, sr), brown = c.createBuffer(1, n, sr);
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.96900 * b2 + x * 0.1538520;
    b3 = 0.86650 * b3 + x * 0.3104856; b4 = 0.55000 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.0168980;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02; b[i] = last * 3.5;
  }
  // crossfade the loop seam
  const f = Math.floor(sr * 0.05);
  for (const d of [w, p, b]) for (let i = 0; i < f; i++) { const k = i / f; d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k; }
  E.noise = { white, pink, brown };
}

function makeImpulse(dur, decay) {
  const c = E.ctx, sr = c.sampleRate, n = Math.floor(sr * dur);
  const buf = c.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const pre = Math.floor(sr * 0.012);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const k = Math.min(0.9, 0.15 + t * 0.35); // tail gets darker
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - (i - pre) / (n - pre), decay) * 1.6;
    }
    // a few early reflections
    for (let r = 0; r < 6; r++) d[pre + Math.floor(Math.random() * sr * 0.06)] += (Math.random() - 0.5) * 0.6;
  }
  return buf;
}

export const now = () => E.ctx.currentTime;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// Voice limiting: returns false if this sound should be dropped.
export function claimVoice(dur, prio = 1) {
  const t = E.ctx.currentTime;
  const v = E.voices;
  for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= t) v.splice(i, 1);
  const cap = prio >= 2 ? E.maxVoices + 8 : E.maxVoices;
  if (v.length >= cap) return false;
  v.push({ end: t + dur, prio });
  return true;
}

export function distTo(pos) {
  return Math.hypot(pos.x - E.lx, (pos.y ?? E.ly) - E.ly, pos.z - E.lz);
}

// Builder for one-shot sounds.
// opts: { pos:{x,y,z}, vol, prio, dur, bus:'sfx'|'amb'|'music', verb, pan, delay, cull }
// Returns null if the sound is culled / voice-limited / audio unavailable.
export function sound(opts = {}) {
  if (!E.ctx) return null;
  const dur = opts.dur ?? 0.5;
  const pos = opts.pos;
  if (pos) {
    const d = distTo(pos);
    if (d > (opts.cull ?? E.cullDist)) return null;
  }
  if (!claimVoice(dur + (opts.delay ?? 0), opts.prio ?? 1)) return null;
  const c = E.ctx;
  const s = new Sound(c, opts.delay ?? 0);
  const g = c.createGain(); g.gain.value = opts.vol ?? 1;
  s.out = g; s.nodes.push(g);
  let last = g;
  if (pos) {
    const p = c.createPanner();
    p.panningModel = opts.hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = opts.ref ?? 3.5; p.maxDistance = 120; p.rolloffFactor = opts.rolloff ?? 1.1;
    setPos(p, pos.x, pos.y ?? E.ly, pos.z);
    g.connect(p); last = p; s.nodes.push(p);
  } else if (opts.pan) {
    const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan));
    g.connect(p); last = p; s.nodes.push(p);
  }
  const bus = opts.bus === 'amb' ? E.amb : opts.bus === 'music' ? E.music : E.sfx;
  last.connect(bus);
  const verb = opts.verb ?? (pos ? Math.min(0.5, 0.08 + distTo(pos) / 140) : 0.06);
  if (verb > 0) {
    const vs = c.createGain(); vs.gain.value = verb;
    last.connect(vs); vs.connect(opts.bus === 'music' ? E.musicVerb : E.verbIn); s.nodes.push(vs);
  }
  return s;
}

export function setPos(p, x, y, z) {
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
  else p.setPosition(x, y, z);
}

class Sound {
  constructor(c, delay) { this.c = c; this.t = c.currentTime + 0.005 + delay; this.nodes = []; this.lastStop = -1; this.lastSrc = null; }
  // register a node for cleanup
  n(node) { this.nodes.push(node); return node; }
  gain(v = 1, dest = this.out) { const g = this.c.createGain(); g.gain.value = v; g.connect(dest); return this.n(g); }
  filter(type, freq, Q = 1, dest = this.out) {
    const f = this.c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; f.connect(dest); return this.n(f);
  }
  src(node, start, stop) {
    node.start(start); node.stop(stop);
    this.n(node);
    if (stop > this.lastStop) { this.lastStop = stop; this.lastSrc = node; }
    return node;
  }
  osc(type, freq, start, dur, dest = this.out) {
    const o = this.c.createOscillator(); o.type = type; o.frequency.value = freq; o.connect(dest);
    return this.src(o, start, start + dur);
  }
  noise(kind, start, dur, dest = this.out, rate = 1) {
    const b = this.c.createBufferSource(); b.buffer = E.noise[kind] ?? E.noise.white; b.loop = true; b.playbackRate.value = rate;
    b.connect(dest);
    b.start(start, Math.random() * 2); b.stop(start + dur);
    this.n(b);
    if (start + dur > this.lastStop) { this.lastStop = start + dur; this.lastSrc = b; }
    return b;
  }
  buffer(buf, start, dest = this.out, rate = 1) {
    const b = this.c.createBufferSource(); b.buffer = buf; b.playbackRate.value = rate; b.connect(dest);
    return this.src(b, start, start + buf.duration / rate);
  }
  // percussive envelope gain node: attack a, decay d (exp), peak
  env(start, a, d, peak = 1, dest = this.out) {
    const g = this.c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + a);
    g.gain.exponentialRampToValueAtTime(0.0001, start + a + d);
    g.connect(dest);
    return this.n(g);
  }
  // finish: when the last source ends, disconnect everything
  done() {
    const nodes = this.nodes;
    if (this.lastSrc) this.lastSrc.onended = () => { for (const nd of nodes) { try { nd.disconnect(); } catch (e) { /* already */ } } nodes.length = 0; };
    return this;
  }
}

let shaperCurves = {};
export function shaperCurve(k) {
  const key = Math.round(k * 10);
  if (shaperCurves[key]) return shaperCurves[key];
  const n = 1024, cur = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cur[i] = Math.tanh(x * k) / Math.tanh(k); }
  return (shaperCurves[key] = cur);
}

export function updateListener(cam) {
  if (!cam) return;
  const p = cam.position;
  E.lx = p.x; E.ly = p.y; E.lz = p.z;
  if (!E.ctx) return;
  const L = E.ctx.listener;
  const e = cam.matrixWorld.elements;
  const fx = -e[8], fy = -e[9], fz = -e[10];
  if (L.positionX) {
    const t = E.ctx.currentTime;
    L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
    L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
    L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
  } else if (L.setPosition) {
    L.setPosition(p.x, p.y, p.z); L.setOrientation(fx, fy, fz, 0, 1, 0);
  }
}

// For far-away ambient events (bells, thunder, horns beyond the cull distance):
// manual stereo pan + distance gain relative to the listener's facing.
export function farPan(x, z, cam) {
  const dx = x - E.lx, dz = z - E.lz;
  const d = Math.hypot(dx, dz) || 1;
  let pan = 0;
  if (cam) {
    const e = cam.matrixWorld.elements; // right vector = column 0
    pan = (dx * e[0] + dz * e[2]) / d;
  }
  return { pan: Math.max(-0.9, Math.min(0.9, pan)), d };
}
