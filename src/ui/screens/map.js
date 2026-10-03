// Parchment world map (M): 4 coloured zones, hill shading, forest, roads, locations, shops, caravans, player arrow.
// Wheel = zoom, drag = pan, double-click = reset.
import { game } from '../../core/game.js';
import { ZONES, LOC, ROADS, WORLD_HALF, zoneAt } from '../../world/zones.js';
import { heightAt, WATER_LEVEL } from '../../world/terrain.js';
import { trees } from '../../world/trees.js';
import { cam } from '../../entities/player.js';
import { openModal, currentModal, closeModal } from './modal.js';

// caravans live in the factions-gameplay module; glob import keeps the build working even if that file moves
const CARAVAN_MODS = import.meta.glob('../../systems/gameplay/caravans.js', { eager: true });
const caravanList = () => game.caravans ?? Object.values(CARAVAN_MODS)[0]?.caravans ?? null;
const RES = 360; // base bitmap resolution
let base = null;
let view = { cx: 0, cz: 0, span: WORLD_HALF * 2 }; // world centre + visible world width
let canvas = null, ctx = null, size = 800, timer = null;

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function buildBase() {
  const c = document.createElement('canvas');
  c.width = c.height = RES;
  const g = c.getContext('2d');
  const img = g.createImageData(RES, RES);
  const step = (WORLD_HALF * 2) / RES;
  const H = new Float32Array((RES + 1) * (RES + 1));
  for (let j = 0; j <= RES; j++) for (let i = 0; i <= RES; i++) H[j * (RES + 1) + i] = heightAt(-WORLD_HALF + i * step, -WORLD_HALF + j * step);
  const zc = {};
  for (const z of Object.values(ZONES)) zc[z.id] = hex(z.color);
  const parch = [232, 216, 176];
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const x = -WORLD_HALF + (i + 0.5) * step, z = -WORLD_HALF + (j + 0.5) * step;
    const h = H[j * (RES + 1) + i];
    const hx = H[j * (RES + 1) + i + 1] - h, hz = H[(j + 1) * (RES + 1) + i] - h;
    const shade = Math.max(-0.5, Math.min(0.5, (-hx - hz) * 0.06));
    let r, gg, b;
    if (h < WATER_LEVEL - 0.3) {
      const deep = Math.min(1, (WATER_LEVEL - h) / 14);
      r = 128 - deep * 40; gg = 160 - deep * 30; b = 158 - deep * 10;
    } else {
      const zn = zc[zoneAt(x, z).id];
      const k = 0.26;
      r = parch[0] * (1 - k) + zn[0] * k; gg = parch[1] * (1 - k) + zn[1] * k; b = parch[2] * (1 - k) + zn[2] * k;
      const mnt = Math.max(0, Math.min(1, (h - 45) / 120));
      r = r * (1 - mnt) + 150 * mnt; gg = gg * (1 - mnt) + 130 * mnt; b = b * (1 - mnt) + 110 * mnt;
      if (h > 170) { const s = Math.min(1, (h - 170) / 40); r += (240 - r) * s; gg += (236 - gg) * s; b += (228 - b) * s; }
      r *= 1 + shade; gg *= 1 + shade; b *= 1 + shade;
    }
    // paper grain
    const n = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1 * 10;
    const o = (j * RES + i) * 4;
    img.data[o] = r + n; img.data[o + 1] = gg + n; img.data[o + 2] = b + n; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // forest: a sample of real tree positions as tiny ink trees
  g.fillStyle = 'rgba(40,80,30,0.55)';
  const stride = Math.max(1, Math.floor(trees.length / 9000));
  for (let t = 0; t < trees.length; t += stride) {
    const tr = trees[t];
    const px = (tr.x + WORLD_HALF) / step, py = (tr.z + WORLD_HALF) / step;
    g.beginPath(); g.moveTo(px, py - 1.6); g.lineTo(px - 1, py + 0.8); g.lineTo(px + 1, py + 0.8); g.fill();
  }
  base = c;
}

const W2S = (x, z) => [(x - view.cx) / view.span * size + size / 2, (z - view.cz) / view.span * size + size / 2];

function clampView() {
  view.span = Math.max(250, Math.min(WORLD_HALF * 2, view.span));
  const lim = WORLD_HALF - view.span / 2;
  view.cx = Math.max(-lim, Math.min(lim, view.cx));
  view.cz = Math.max(-lim, Math.min(lim, view.cz));
}

function label(text, x, y, font, color = '#3a1a08', align = 'center') {
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(240,228,196,0.85)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function posOf(o) {
  const p = o?.pos ?? o?.cart?.pos ?? o?.leader?.pos ?? o?.members?.[0]?.pos ?? o?.actors?.[0]?.pos ?? o;
  return p && typeof p.x === 'number' && typeof p.z === 'number' ? p : null;
}
const iter = c => (!c ? [] : c instanceof Map ? [...c.values()] : Array.isArray(c) ? c : c instanceof Set ? [...c] : Object.values(c));

function draw() {
  if (!ctx) return;
  const zoom = (WORLD_HALF * 2) / view.span;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  const sx = (view.cx - view.span / 2 + WORLD_HALF) / (WORLD_HALF * 2) * RES, sw = view.span / (WORLD_HALF * 2) * RES;
  const sy = (view.cz - view.span / 2 + WORLD_HALF) / (WORLD_HALF * 2) * RES;
  ctx.drawImage(base, sx, sy, sw, sw, 0, 0, size, size);

  // roads
  ctx.save();
  ctx.strokeStyle = 'rgba(110,60,20,0.85)'; ctx.lineWidth = Math.max(2, 1.6 * zoom); ctx.setLineDash([7, 5]);
  for (const road of Object.values(ROADS)) {
    ctx.beginPath();
    road.forEach(([x, z], i) => { const [a, b] = W2S(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.stroke();
  }
  ctx.restore();

  // zone names
  const ZL = { humans: [0, 470], empire: [820, 170], elves: [-820, -190], villain: [0, -600] };
  for (const z of Object.values(ZONES)) {
    const [a, b] = W2S(...(ZL[z.id] ?? z.center));
    label(z.name.toUpperCase(), a, b, `italic bold ${Math.round(15 + zoom * 3)}px 'PT Serif', serif`, 'rgba(70,30,10,0.55)');
  }

  // key locations
  const ICON = { town: '🏘️', palace: '🏰', elfVillage: '🌳', fort: '🏯', lake: '' };
  for (const [k, l] of Object.entries(LOC)) {
    if (!l.name) continue;
    const [a, b] = W2S(l.x, l.z);
    ctx.font = `${Math.round(20 + zoom * 4)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (ICON[k]) ctx.fillText(ICON[k], a, b);
    label(l.name, a, b + 18 + zoom * 2, `bold ${Math.round(13 + zoom)}px 'PT Serif', serif`);
  }
  // named places from the world builder + shops
  const shopIcon = { 'shop:weapons': '⚒️', 'shop:general': '🧺', 'shop:healer': '⚕️', 'shop:tavern': '🍺', 'shop:elves': '🏹', 'shop:fort': '💰', 'shop:palace': '🛡️' };
  const drawn = new Set();
  const shops = game.economy?.shops;
  if (shops) for (const s of shops.values()) {
    const p = s.keeper?.alive ? s.keeper.pos : s.place;
    const [a, b] = W2S(p.x, p.z);
    drawn.add(s.key);
    ctx.font = `${Math.round(11 + zoom * 3)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = s.keeper?.alive ? 1 : 0.4;
    ctx.fillText(shopIcon[s.key] ?? '🪙', a, b);
    if (zoom >= 2.5) label(s.title, a, b + 14, `${Math.round(10 + zoom)}px 'PT Serif', serif`, '#4a2a08');
    ctx.globalAlpha = 1;
  }
  for (const [k, pl] of game.places ?? []) {
    if (drawn.has(k) || !pl || typeof pl.x !== 'number') continue;
    if (zoom < 2 && k.includes(':')) continue;
    const [a, b] = W2S(pl.x, pl.z);
    ctx.fillStyle = '#5a2a08'; ctx.beginPath(); ctx.arc(a, b, 3, 0, Math.PI * 2); ctx.fill();
    if (pl.name && zoom >= 2) label(pl.name, a, b + 11, `${Math.round(10 + zoom)}px 'PT Serif', serif`, '#4a2a08');
  }
  // caravans
  for (const c of iter(caravanList())) {
    if (c?.robbed || c?.done || c?.dead || c?.alive === false || c?.state === 'robbed') continue;
    const p = posOf(c);
    if (!p) continue;
    const [a, b] = W2S(p.x, p.z);
    ctx.font = `${Math.round(16 + zoom * 2)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🐫', a, b);
  }
  // armies (optional, if the gameplay system exposes them)
  for (const ar of iter(game.armies)) {
    const p = posOf(ar);
    if (!p) continue;
    const [a, b] = W2S(p.x, p.z);
    ctx.font = `${Math.round(14 + zoom * 2)}px serif`; ctx.fillText('⚔️', a, b);
  }
  // compass POIs (objectives)
  for (const poi of game.compassPois?.values?.() ?? []) {
    const [a, b] = W2S(poi.x, poi.z);
    ctx.fillStyle = poi.color ?? '#c02020';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 9, an = i / 10 * Math.PI * 2 - Math.PI / 2; ctx.lineTo(a + Math.cos(an) * r, b + Math.sin(an) * r); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#2a1004'; ctx.lineWidth = 1; ctx.stroke();
  }
  // player arrow
  const p = game.player;
  if (p) {
    const [a, b] = W2S(p.pos.x, p.pos.z);
    const yaw = cam.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    ctx.save(); ctx.translate(a, b); ctx.rotate(Math.atan2(fz, fx));
    ctx.fillStyle = '#c01818'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(192,24,24,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(a, b, 18 + Math.sin(performance.now() / 250) * 3, 0, Math.PI * 2); ctx.stroke();
  }
  // compass rose
  const rx = size - 54, ry = 58;
  ctx.save(); ctx.translate(rx, ry);
  ctx.fillStyle = 'rgba(90,40,10,0.8)';
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(6, 0); ctx.lineTo(-6, 0); ctx.fill(); }
  ctx.restore();
  label('С', rx, ry - 40, "bold 15px 'PT Serif', serif", '#6a1a0a');
  // vignette edges
  const gr = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,50,10,0.45)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, size, size);
  // scale bar
  const m100 = 100 / view.span * size;
  ctx.fillStyle = '#3a1a08'; ctx.fillRect(18, size - 24, m100, 4);
  label('100 м', 18 + m100 / 2, size - 36, "12px 'PT Serif', serif");
}

function legend() {
  const z = Object.values(ZONES).map((zz, i) => `<div><span class="sw" style="background:${zz.color}"></span>${i + 1}. ${zz.name}</div>`).join('');
  const p = game.player;
  const here = p ? zoneAt(p.pos.x, p.pos.z).name : '';
  const caravans = iter(caravanList()).filter(c => posOf(c) && c.alive !== false && c.state !== 'robbed').length;
  return `<div class="kv-parch kv-legend" style="height:100%">
    <h3>Всего 4 зоны</h3>${z}
    <h4>Обозначения</h4>
    <div><span class="mk" style="color:#c01818">➤</span>Вы (${here})</div>
    <div><span class="mk">🐫</span>Корованы${caravanList() ? ` (${caravans})` : ''} — можно грабить!</div>
    <div><span class="mk" style="color:#c02020">★</span>Цели и приказы</div>
    <div><span class="mk">⚒️</span>Кузница</div><div><span class="mk">🧺</span>Лавка</div><div><span class="mk">⚕️</span>Лекарь-протезист</div>
    <div><span class="mk">🍺</span>Таверна</div><div><span class="mk">🏹</span>Эльфийская лавка</div><div><span class="mk">💰</span>Чёрный рынок</div>
    <div><span class="mk">🛡️</span>Интендант</div>
    <div><span class="mk" style="color:#6e3c14">┅</span>Дороги корованов</div>
    <h4>Управление</h4>
    <div class="kv-desc">Колесо — масштаб<br>Перетаскивание — сдвиг<br>Двойной клик — вся карта<br>M / Esc — закрыть</div></div>`;
}

export function toggleMap() {
  if (currentModal() === 'map') { closeModal(); return; }
  if (!base) buildBase();
  size = Math.floor(Math.max(360, Math.min(window.innerHeight * 0.8, window.innerWidth - 330, 900)));
  openModal('map', {
    title: 'Карта земель<small>«Т.е. карта и на ней есть 4 зоны»</small>', cls: 'kv-mapwin',
    render(body) {
      body.innerHTML = `<div class="kv-map"><canvas width="${size}" height="${size}"></canvas><div style="height:${size}px">${legend()}</div></div>`;
      canvas = body.querySelector('canvas'); ctx = canvas.getContext('2d');
      bindCanvas();
      draw();
    },
    onClose() { clearInterval(timer); timer = null; ctx = null; },
  });
  // centre on the player when zoomed in
  if (view.span < WORLD_HALF * 2 && game.player) { view.cx = game.player.pos.x; view.cz = game.player.pos.z; clampView(); }
  draw();
  clearInterval(timer);
  timer = setInterval(draw, 120);
}

function bindCanvas() {
  let drag = null;
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width * size, my = (e.clientY - r.top) / r.height * size;
    const wx = view.cx + (mx / size - 0.5) * view.span, wz = view.cz + (my / size - 0.5) * view.span;
    view.span *= e.deltaY > 0 ? 1.25 : 0.8;
    clampView();
    view.cx = wx - (mx / size - 0.5) * view.span; view.cz = wz - (my / size - 0.5) * view.span;
    clampView(); draw();
  }, { passive: false });
  canvas.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz }; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup', () => { drag = null; if (canvas) canvas.style.cursor = ''; });
  canvas.addEventListener('mousemove', e => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    view.cx = drag.cx - (e.clientX - drag.x) / r.width * view.span;
    view.cz = drag.cz - (e.clientY - drag.y) / r.height * view.span;
    clampView(); draw();
  });
  canvas.addEventListener('dblclick', () => { view = { cx: 0, cz: 0, span: WORLD_HALF * 2 }; draw(); });
}
