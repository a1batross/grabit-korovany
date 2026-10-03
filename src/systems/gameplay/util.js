// Helpers shared by the factions gameplay: named places with fallbacks, shouts & speech bubbles,
// proximity queries, big banners and simple dialog modals.
import * as THREE from 'three';
import { game } from '../../core/game.js';
import { input } from '../../core/input.js';
import { LOC } from '../../world/zones.js';
import { groundAt, heightAt, WATER_LEVEL } from '../../world/terrain.js';
import { isHostile, factionsHostile } from '../factions.js';

// ---------- places ----------
const ring = (cx, cz, r, n, a0 = 0, outward = true) => Array.from({ length: n }, (_, i) => {
  const a = a0 + i / n * Math.PI * 2;
  const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
  // yaw: facing outward (atan2(dx,dz) convention: yaw 0 = +z)
  const yaw = outward ? Math.atan2(x - cx, z - cz) : Math.atan2(cx - x, cz - z);
  return { x, z, yaw };
});

const P = LOC.palace, F = LOC.fort, E = LOC.elfVillage, T = LOC.town;
export const FALLBACK = {
  'palace:gate': { x: LOC.palaceGate.x, z: LOC.palaceGate.z, yaw: -Math.PI / 2 },
  'palace:throne': { x: P.x + 35, z: P.z - 15, yaw: -Math.PI / 2 },
  'palace:commander': { x: P.x - 25, z: P.z + 10, yaw: -Math.PI / 2 },
  'palace:barracks': { x: P.x - 10, z: P.z + 40 },
  'palace:yard': { x: P.x - 20, z: P.z },
  'palace:posts': [
    { x: LOC.palaceGate.x, z: LOC.palaceGate.z - 4, yaw: -Math.PI / 2 }, { x: LOC.palaceGate.x, z: LOC.palaceGate.z + 4, yaw: -Math.PI / 2 },
    ...ring(P.x, P.z, 55, 8, 0.3),
  ],
  'fort:gate': { x: LOC.fortGate.x, z: LOC.fortGate.z, yaw: 0 },
  'fort:throne': { x: F.x, z: F.z - 35, yaw: 0 },
  'fort:yard': { x: F.x, z: F.z + 5 },
  'fort:recruit': { x: F.x + 18, z: F.z + 20 },
  'fort:posts': [
    { x: LOC.fortGate.x - 4, z: LOC.fortGate.z, yaw: 0 }, { x: LOC.fortGate.x + 4, z: LOC.fortGate.z, yaw: 0 },
    ...ring(F.x, F.z, 50, 6, 0.5),
  ],
  'elves:square': { x: E.x, z: E.z },
  'elves:chief': { x: E.x - 8, z: E.z - 8, yaw: 0 },
  'elves:posts': ring(E.x, E.z, 58, 6, 0.2),
  'elves:camps': [{ x: E.x - 150, z: E.z - 120 }, { x: E.x + 130, z: E.z - 170 }, { x: E.x - 200, z: E.z + 170 }],
  'town:square': { x: T.x, z: T.z },
  'town:tavern': { x: T.x + 22, z: T.z - 12 },
  'town:houses': ring(T.x, T.z, 45, 10, 0.1),
  'westExit': { x: LOC.westExit.x, z: LOC.westExit.z },
};

export function place(key) {
  const p = game.places.get(key);
  if (p && !Array.isArray(p) && p.x != null) return p;
  if (Array.isArray(p) && p.length) return p[0];
  return FALLBACK[key];
}
export function placeList(key) {
  const p = game.places.get(key);
  if (Array.isArray(p) && p.length) return p;
  return FALLBACK[key] ?? [];
}

// find a dry spot near (x,z)
export function dryNear(x, z, r = 4) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r * (1 + i * 0.3);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (heightAt(px, pz) > WATER_LEVEL + 0.3) return { x: px, z: pz };
  }
  return { x, z };
}

// ---------- queries ----------
export const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export const dist = (a, b) => Math.sqrt(d2(a, b));
export function playerDist(p) { return game.player ? dist(game.player.pos, p) : 1e9; }
export function aliveCount() { let n = 0; for (const a of game.actors) if (a.alive) n++; return n; }
export function actorsNear(x, z, r, filter) {
  const out = [];
  for (const a of game.actors) if (a.alive && (a.pos.x - x) ** 2 + (a.pos.z - z) ** 2 < r * r && (!filter || filter(a))) out.push(a);
  return out;
}
// hostiles of `faction` alive within r of (x,z)
export function hostilesNear(faction, x, z, r) {
  return actorsNear(x, z, r, a => factionsHostile(faction, a.disguisedAs && !a.revealed ? a.disguisedAs : a.faction)
    || (a.isPlayer && a.outlawFor?.has(faction)));
}
export { isHostile };

// ---------- shouts & speech bubbles ----------
const bubbles = [];
function makeBubble(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = 'bold 34px "PT Serif", Georgia, serif';
  const w = Math.min(500, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(250,240,215,0.93)';
  g.strokeStyle = '#3a2a12'; g.lineWidth = 4;
  const x0 = (512 - w) / 2;
  g.beginPath(); g.roundRect?.(x0, 6, w, 70, 18) ?? g.rect(x0, 6, w, 70); g.fill(); g.stroke();
  g.fillStyle = '#2a1a08'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 42, 480);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(3.6, 0.68, 1);
  s.renderOrder = 999;
  return s;
}
export function bubble(actor, text, life = 3.5) {
  if (!actor?.body || typeof document === 'undefined') return;
  // one bubble per actor
  for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].actor === actor) { killBubble(bubbles[i]); bubbles.splice(i, 1); }
  const s = makeBubble(text);
  s.position.set(0, 2.45 / (actor.scale || 1) + 0.2, 0);
  actor.body.root.add(s);
  bubbles.push({ actor, s, t: life });
}
function killBubble(b) { b.s.parent?.remove(b.s); b.s.material.map.dispose(); b.s.material.dispose(); }
export function updateBubbles(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.t -= dt;
    if (b.t <= 0 || !b.actor.alive) { killBubble(b); bubbles.splice(i, 1); }
  }
}
// NPC shouts: speech bubble + notification if the player is near (or `always`)
export function shout(actor, text, o = {}) {
  if (!actor || !actor.alive) return;
  const d = playerDist(actor.pos);
  if (o.always || d < (o.range ?? 60)) game.bus.emit('notify', { text: `${actor.name}: «${text}»`, kind: o.kind ?? '' });
  if (d < 140) bubble(actor, text);
  game.bus.emit('npc:shout', { actor, text });
}
export const say = (text, kind = '') => game.bus.emit('notify', { text, kind });

// ---------- big banner ("КОРОВАН ОГРАБЛЕН!") ----------
let bannerEl = null, bannerT = 0;
export function banner(title, sub = '', color = '#e8c060') {
  if (typeof document === 'undefined') return;
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.id = 'gp-banner';
    bannerEl.style.cssText = 'position:absolute;left:0;right:0;top:22%;text-align:center;pointer-events:none;transition:opacity .5s;z-index:5';
    document.getElementById('ui')?.appendChild(bannerEl);
  }
  bannerEl.innerHTML = `<div style="font-family:var(--title);font-size:64px;color:${color};text-shadow:0 4px 0 #3a1a00,0 0 30px rgba(255,160,40,.6);letter-spacing:2px">${title}</div>`
    + (sub ? `<div style="font-size:20px;color:#f2e8d0;text-shadow:0 0 6px #000;margin-top:6px">${sub}</div>` : '');
  bannerEl.style.opacity = '1';
  bannerT = 4;
}
export function updateBanner(dt) {
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0 && bannerEl) bannerEl.style.opacity = '0'; }
}

// ---------- modal dialogs ----------
let modalClose = null;
export function modalOpen() { return !!modalClose; }
// openModal(html, { onClose, keys: { KeyC: fn } }) -> returns root element. Buttons wired by caller.
export function openModal(html, o = {}) {
  closeModal();
  const root = document.getElementById('modal-root');
  if (!root) return null;
  root.innerHTML = `<div class="screen gp-modal" style="background:rgba(0,0,0,0.55)">${html}</div>`;
  game.uiOpen = true;
  input.unlock();
  const onKey = e => {
    if (e.code === 'Escape' || (o.closeKeys ?? []).includes(e.code)) { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
    o.onKey?.(e);
  };
  // capture phase so Esc does not also open the pause menu
  window.addEventListener('keydown', onKey, true);
  modalClose = () => {
    window.removeEventListener('keydown', onKey, true);
    root.innerHTML = '';
    game.uiOpen = false;
    input.keys.clear();
    modalClose = null;
    o.onClose?.();
    if (game.started && game.player?.alive) input.lock();
  };
  return root.firstElementChild;
}
export function closeModal() { modalClose?.(); }

// dialog({ title, html, buttons: [{ label, fn, close=true, disabled }] })
export function dialog({ title, html, buttons = [], parchment = true, width = 520 }) {
  const btns = buttons.map((b, i) => `<button class="btn small" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('');
  const el = openModal(`<div class="panel ${parchment ? 'parchment' : ''}" style="max-width:${width}px">
    <h2>${title}</h2><div style="font-size:16px;line-height:1.5">${html}</div>
    <div style="text-align:center;margin-top:14px">${btns}<button class="btn small" data-close>Уйти</button></div></div>`);
  if (!el) return;
  el.querySelectorAll('button[data-i]').forEach(bt => bt.addEventListener('click', () => {
    const b = buttons[+bt.dataset.i];
    if (b.close !== false) closeModal();
    b.fn?.();
  }));
  el.querySelector('[data-close]').addEventListener('click', closeModal);
}

export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export { groundAt };

// ---------- actor snapshots (save/load of NPCs that matter: army, raiders, escorts, spies) ----------
const LIMB_KEYS = ['armL', 'armR', 'legL', 'legR', 'eyeL', 'eyeR'];
export function snapActor(a) {
  return {
    kind: a.kind, faction: a.faction, name: a.name, preset: a.preset ?? null,
    x: +a.pos.x.toFixed(2), y: +a.pos.y.toFixed(2), z: +a.pos.z.toFixed(2), yaw: +a.yaw.toFixed(3),
    hp: Math.round(a.hp * 10) / 10, maxHp: a.maxHp, armor: a.armor, weapon: a.weapon?.id ?? 'fists', shield: !!a.shield,
    limbs: { ...a.limbs }, bleed: a.bleed, ranged: !!a.weapon?.ranged,
  };
}
export function presetFor(d) {
  if (d.preset) return d.preset;
  const r = d.ranged;
  return ({ guard: r ? 'guardArcher' : 'guard', minion: r ? 'minionArcher' : 'minion', elf: r ? 'elfArcher' : 'elf' })[d.kind] ?? d.kind;
}
export function spawnArgs(d) {
  return { name: d.name, hp: d.maxHp, armor: d.armor, weapon: d.weapon, shield: d.shield, yaw: d.yaw, y: d.y };
}
// apply position / health / injuries (lost limbs are detached silently, prosthetics refitted)
export function applySnap(a, d) {
  a.pos.set(d.x, d.y ?? a.pos.y, d.z); a.vel.set(0, 0, 0); a.yaw = d.yaw ?? a.yaw;
  a.body.root.position.copy(a.pos);
  a.maxHp = d.maxHp ?? a.maxHp; a.hp = Math.min(a.maxHp, d.hp ?? a.maxHp);
  for (const part of LIMB_KEYS) {
    const st = d.limbs?.[part];
    if (!st || st === 'ok') continue;
    const obj = a.body.detach(part, game.scene);
    if (obj) obj.parent?.remove(obj);
    a.limbs[part] = 'lost';
    if (part === 'armR') a.body.setWeapon(null);
    if (part === 'armL') { a.shield = false; a.body.setShield(false); }
    if (st === 'prosthetic') a.fitProsthetic(part);
  }
  a.bleed = d.bleed ?? 0;
  if (a.legsOk < 2) a.body.setWheelchair?.(false);
  return a;
}
