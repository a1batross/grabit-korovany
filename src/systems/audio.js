// AUDIO & ATMOSPHERE module. Everything is synthesized with the Web Audio API (no audio files):
//  - SFX driven by bus events (combat, gore, coins, UI, fanfares, horns), 3D-positioned relative to the camera
//  - footsteps by surface, crawling, Kirill's squeaky wheelchair, peg-leg "tok", heartbeat/breathing at low HP
//  - zone ambience crossfaded by position & time of day
//  - procedural folk music per zone + combat layer, menu theme
//  - atmosphere particles (src/systems/ambience/visuals.js)
// Public API: game.audio = { setMaster, setMusic, setSfx, setAmbience, mute, toggleMute, play, unlock, volumes, ready }
// The AudioContext is created on the first user gesture (browsers block audio before that).
import { game } from '../core/game.js';
import { E, initEngine, applyVolumes, updateListener } from './ambience/engine.js';
import * as sfx from './ambience/sfx.js';
import * as voice from './ambience/voice.js';
import { updateFootsteps, playerJump, step, tok, squeak, surfaceAt } from './ambience/footsteps.js';
import { updateSoundscape, W } from './ambience/soundscape.js';
import { updateMusic, setMusicEnabled, currentMood } from './ambience/music.js';
import { initVisuals, updateVisuals } from './ambience/visuals.js';
import { isHostile } from './factions.js';

export const name = 'audio';

const LS_KEY = 'korovany:audio';
let combatLevel = 0, lastCombatScan = -10;
const last = {}; // throttles

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
    if (s) for (const k of ['master', 'music', 'sfx', 'amb']) if (typeof s[k] === 'number') E.vol[k] = Math.max(0, Math.min(1, s[k]));
    if (s && typeof s.muted === 'boolean') E.vol.muted = s.muted;
  } catch (e) { /* storage unavailable */ }
}
function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(E.vol)); } catch (e) { /* ignore */ }
}

const safe = fn => (...a) => { try { return fn(...a); } catch (e) { if (!safe.warned) { safe.warned = true; console.warn('audio:', e); } } };

function unlock() {
  try {
    if (!E.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      initEngine(new AC({ latencyHint: 'interactive' }));
    }
    if (E.ctx.state === 'suspended' && !document.hidden) E.ctx.resume().catch(() => {});
    return true;
  } catch (e) { E.ctx = null; return false; }
}

function throttle(key, gap) {
  const t = performance.now() / 1000;
  if (last[key] && t - last[key] < gap) return false;
  last[key] = t; return true;
}

// position helpers
const at = (a, h = 1.3) => a ? { x: a.pos.x, y: a.pos.y + h * (a.scale ?? 1) * (a.moveMode === 'crawl' ? 0.3 : 1), z: a.pos.z } : null;
const BLUNT = new Set(['fists', 'club', 'mace', 'kick']);
const ARMORED = new Set(['guard', 'commander', 'minion', 'villain', 'caravaneer']);
const HELMET = new Set(['guard', 'commander', 'minion', 'villain', 'caravaneer']);

function voiceReady(a, gap) {
  const t = game.time;
  if (a._vt && t < a._vt) return false;
  a._vt = t + gap; return true;
}

const handlers = {
  'actor:swing': ({ actor }) => {
    const w = actor.activeWeapon;
    const pos = at(actor, 1.2);
    if (w.style === 'bow') return sfx.bowCreak(pos, actor.isPlayer ? 0.25 : 0.2);
    const weight = Math.max(0, Math.min(1, (w.speed - 0.4) / 0.55 + (w.dmg > 25 ? 0.2 : 0)));
    sfx.whoosh(pos, w.style, weight, actor.isPlayer ? 0.55 : 0.45);
    if (actor.isPlayer ? Math.random() < 0.18 : Math.random() < 0.1) if (voiceReady(actor, 0.8)) voice.grunt(actor, pos, 0.3);
  },
  'actor:hit': ({ target, attacker, part, damage, weapon }) => {
    const pos = at(target, part === 'head' ? 1.6 : part?.startsWith('leg') ? 0.6 : 1.2);
    if (!weapon && !attacker) { // fall damage
      sfx.land(pos, 0.8);
    } else {
      const kind = weapon?.ranged ? 'arrow' : BLUNT.has(weapon?.id) ? 'blunt' : (weapon?.cut ?? 0) >= 0.3 ? 'cut' : 'blunt';
      sfx.fleshHit(pos, Math.max(4, damage), kind, target.isPlayer ? 0.8 : 0.7);
      if (part === 'head' && HELMET.has(target.kind)) sfx.clang(pos, 900, 0.25, 0.35);
    }
    // vocal reaction (death handles the dying)
    if (target.hp > 0 && voiceReady(target, 0.55) && Math.random() < (target.isPlayer ? 0.7 : 0.6)) {
      if (damage > 16) voice.pain(target, pos, Math.min(1, damage / 40));
      else voice.grunt(target, pos, Math.min(1, damage / 20));
    }
  },
  'block': ({ target, attacker, pos, shield }) => {
    const p = pos ?? at(target);
    if (attacker?.activeWeapon?.ranged) return shield ? sfx.woodThud(p, 0.45) : sfx.clang(p, 1200, 0.3, 0.3);
    if (shield) { sfx.woodThud(p, 0.7); sfx.clang(p, 420, 0.18, 0.3); }
    else sfx.clang(p, rnd(560, 680), 0.55, 0.7);
  },
  'attack:miss': ({ attacker }) => { if (attacker?.isPlayer) sfx.miss(at(attacker, 1.2)); },
  'arrow:fire': ({ actor }) => sfx.twang(at(actor, 1.4), actor.isPlayer ? 0.5 : 0.45),
  'actor:dismember': ({ actor, part }) => {
    const pos = at(actor, part.startsWith('leg') ? 0.6 : part === 'head' || part.startsWith('eye') ? 1.6 : 1.3);
    const kind = part === 'head' ? 'head' : part.startsWith('eye') ? 'eye' : 'limb';
    sfx.squelch(pos, kind, actor.isPlayer ? 0.85 : 0.75);
    if (kind === 'head') {
      actor._vt = game.time + 5; // no more voice, obviously
      sfx.woodThud({ x: pos.x + 1, y: pos.y - 1.5, z: pos.z }, 0.35); // the head lands... bonk
    } else {
      actor._vt = game.time + 1.3;
      voice.scream(actor, pos);
    }
  },
  'actor:death': ({ actor, cause }) => {
    const pos = at(actor, 1.2);
    if (!actor.headless && cause !== 'fall') {
      if (!actor._vt || game.time >= actor._vt - 0.4) {
        if (cause === 'head' && Math.random() < 0.4) voice.gurgle(pos);
        else voice.groan(actor, pos);
      }
    }
    actor._vt = game.time + 99;
    sfx.bodyFall(at(actor, 0.2), ARMORED.has(actor.kind), cause === 'blood' ? 0.25 : 0.5, actor.isPlayer ? 0.9 : 0.75);
    if (actor.isPlayer) sfx.lament(0.35);
  },
  'player:jump': () => playerJump(),
  'gold:change': ({ amount }) => {
    if (!amount || !throttle('gold', 0.12)) return;
    last.coinAt = performance.now() / 1000;
    if (amount > 0) sfx.coins(3 + Math.round(Math.log2(1 + amount) * 1.5), 0.38);
    else sfx.coins(3, 0.22);
  },
  'notify': ({ kind } = {}) => {
    if (!throttle('notify', 0.15)) return;
    if (kind === 'good') sfx.good();
    else if (kind === 'bad') sfx.bad();
    else if (!last.coinAt || performance.now() / 1000 - last.coinAt > 0.2) sfx.tick();
  },
  'caravan:robbed': () => { sfx.fanfare(0.32); setTimeout(safe(() => sfx.coins(12, 0.35)), 700); },
  'raid:start': (d) => {
    let pan = 0;
    const a = d?.attackers?.[0];
    if (a?.pos && game.camera) { const e = game.camera.matrixWorld.elements; const dx = a.pos.x - E.lx, dz = a.pos.z - E.lz; const dd = Math.hypot(dx, dz) || 1; pan = (dx * e[0] + dz * e[2]) / dd * 0.6; }
    sfx.horn('war', 0.32, pan);
  },
  'order:issued': () => { if (throttle('order', 1.5)) sfx.horn('cmd', 0.22); },
  'victory': () => sfx.fanfare(0.38, true),
  'achievement': () => sfx.chime(0.35),
  'ui:open': () => { if (throttle('ui', 0.05)) sfx.click(0.16); },
  'ui:click': () => { if (throttle('ui', 0.05)) sfx.click(0.14); },
  'journal:add': () => { if (game.started && throttle('journal', 1.2)) sfx.paper(0.22); },
  'journal:objective': (o) => { if (o?.done && throttle('objdone', 1)) sfx.chime(0.25); },
};
const rnd = (a, b) => a + Math.random() * (b - a);

// play(name, opts) for other modules / UI. opts: { pos:{x,y,z}, volume, ... }
const PLAY = {
  click: o => sfx.click(o.volume ?? 0.15),
  tick: o => sfx.tick(o.volume ?? 0.18),
  good: o => sfx.good(o.volume ?? 0.3),
  bad: o => sfx.bad(o.volume ?? 0.3),
  coins: o => sfx.coins(o.count ?? 6, o.volume ?? 0.38),
  fanfare: o => sfx.fanfare(o.volume ?? 0.42),
  victory: o => sfx.fanfare(o.volume ?? 0.5, true),
  horn: o => sfx.horn('cmd', o.volume ?? 0.3, o.pan ?? 0),
  warhorn: o => sfx.horn('war', o.volume ?? 0.45, o.pan ?? 0),
  bell: o => sfx.bell(o.pan ?? 0, o.volume ?? 0.4, o.strikes ?? 3),
  chime: o => sfx.chime(o.volume ?? 0.35),
  paper: o => sfx.paper(o.volume ?? 0.22),
  whoosh: o => sfx.whoosh(o.pos, o.style ?? 'slash', o.weight ?? 0.5, o.volume ?? 0.4),
  hit: o => sfx.fleshHit(o.pos, o.damage ?? 15, o.kind ?? 'cut', o.volume ?? 0.7),
  clang: o => sfx.clang(o.pos, o.freq ?? 600, o.volume ?? 0.5),
  thud: o => sfx.woodThud(o.pos, o.volume ?? 0.6),
  twang: o => sfx.twang(o.pos, o.volume ?? 0.5),
  squelch: o => sfx.squelch(o.pos, o.kind ?? 'limb', o.volume ?? 0.75),
  scream: o => voice.scream(o.actor, o.pos),
  groan: o => voice.groan(o.actor, o.pos),
  grunt: o => voice.grunt(o.actor, o.pos, o.heavy ?? 0.5),
  pain: o => voice.pain(o.actor, o.pos, o.heavy ?? 0.7),
  heartbeat: o => sfx.heartbeat(o.volume ?? 0.5),
  splash: o => sfx.splash(o.pos, o.volume ?? 0.4),
  thunder: o => sfx.thunder(o.pan ?? 0, o.volume ?? 0.6),
  fall: o => sfx.bodyFall(o.pos, !!o.armored, 0, o.volume ?? 0.8),
  land: o => sfx.land(o.pos, o.volume ?? 0.45),
  tok: o => tok(o.pos, o.volume ?? 0.45),
  squeak: o => squeak(o.pos, o.volume ?? 0.22),
  step: o => step(o.pos, o.surface ?? (o.pos ? surfaceAt(o.pos.x, o.pos.z) : 'grass'), o.heavy ?? 0.4, o.volume ?? 0.35),
  lament: o => sfx.lament(o.volume ?? 0.35),
};

function makeApi() {
  const setV = (k, v) => { E.vol[k] = Math.max(0, Math.min(1, +v || 0)); safe(applyVolumes)(); saveSettings(); };
  return {
    get ready() { return !!E.ctx && E.ctx.state === 'running'; },
    get ctx() { return E.ctx; },
    get volumes() { return { ...E.vol }; },
    get mood() { return currentMood(); },
    get combat() { return combatLevel; },
    setMaster: v => setV('master', v),
    setMusic: v => setV('music', v),
    setSfx: v => setV('sfx', v),
    setAmbience: v => setV('amb', v),
    getMaster: () => E.vol.master, getMusic: () => E.vol.music, getSfx: () => E.vol.sfx, getAmbience: () => E.vol.amb,
    mute: (m = true) => { E.vol.muted = !!m; safe(applyVolumes)(); saveSettings(); },
    toggleMute: () => { E.vol.muted = !E.vol.muted; safe(applyVolumes)(); saveSettings(); return E.vol.muted; },
    isMuted: () => E.vol.muted,
    setMusicEnabled: v => setMusicEnabled(!!v),
    unlock: () => unlock(),
    play: (n, opts = {}) => { const f = PLAY[n]; if (f && E.ctx) safe(f)(opts); },
    sounds: Object.keys(PLAY),
    // test helpers
    _engine: E,
    _lib: { sfx, voice, initEngine, engine: E, updateMusic, updateSoundscape },
  };
}

function scanCombat() {
  const p = game.player;
  if (!game.started || !p || !p.alive) return 0;
  let n = 0;
  for (const a of game.actors) {
    if (!a.alive || a === p || a.ai?.target !== p) continue;
    const d2 = (a.pos.x - p.pos.x) ** 2 + (a.pos.z - p.pos.z) ** 2;
    if (d2 > 30 * 30) continue;
    try { if (!isHostile(a, p)) continue; } catch (e) { continue; }
    n += d2 < 12 * 12 ? 1 : 0.6;
  }
  if (game.time - (p.lastHitTime ?? -100) < 5) n += 0.5;
  return Math.min(1, n / 2.5);
}

function update(dt) {
  if (E.frozen) return; // offline-render tests swap the engine context
  try {
    updateListener(game.camera);
    if (game.time - lastCombatScan > 0.5) { lastCombatScan = game.time; combatLevel = scanCombat(); W.combat = combatLevel; }
    updateSoundscape(dt);
    if (E.ctx) {
      updateMusic(dt, combatLevel);
      if (game.started && !game.paused && !game.uiOpen) updateFootsteps(dt);
    }
  } catch (e) { if (!update.warned) { update.warned = true; console.warn('audio update failed', e); } }
  try { updateVisuals(dt); } catch (e) { if (!update.vwarned) { update.vwarned = true; console.warn('ambience visuals failed', e); } }
}

export function init() {
  loadSettings();
  game.audio = makeApi();
  const gesture = () => { if (unlock()) safe(applyVolumes)(); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) window.addEventListener(ev, gesture, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    try {
      if (!E.ctx) return;
      if (document.hidden) E.ctx.suspend(); else E.ctx.resume();
    } catch (e) { /* ignore */ }
  });
  for (const [ev, fn] of Object.entries(handlers)) {
    game.bus.on(ev, d => { if (!E.ctx) return; try { fn(d ?? {}); } catch (e) { if (!init.warned) { init.warned = true; console.warn('audio handler', ev, e); } } });
  }
  try { initVisuals(); } catch (e) { console.warn('ambience visuals init failed', e); }
  game.addSystem({ name: 'audio', order: 98, alwaysRun: true, update });
}

export function startGame() {
  // music mood switches automatically (menu -> zone); make sure a (re)start resumes the context
  if (E.ctx) unlock();
}
