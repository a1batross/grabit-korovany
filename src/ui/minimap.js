// Rotating minimap (bottom-right). Base layer is pre-rendered once per session: terrain/zone colours,
// water, roads, trees and building footprints. Live layer: actors (enemy/ally/neutral), caravans, quest markers.
// N cycles the zoom.
import { game } from '../core/game.js';
import { input } from '../core/input.js';
import { WORLD_HALF, ROADS, ZONES, zoneAt } from '../world/zones.js';
import { heightAt, WATER_LEVEL } from '../world/terrain.js';
import { trees } from '../world/trees.js';
import { forEachCollider } from '../world/colliders.js';
import { cam } from '../entities/player.js';
import { isHostile } from '../systems/factions.js';

const MPP = 2;                              // world metres per base pixel
const RES = (WORLD_HALF * 2) / MPP;
const SIZE = 200;                           // CSS pixels
const ZOOMS = [90, 160, 300];               // visible radius in metres
let zoomI = 0, base = null, canvas, ctx, acc = 0, nLabel;

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toB = v => (v + WORLD_HALF) / MPP;    // world -> base pixel

function buildBase() {
  const c = document.createElement('canvas');
  c.width = c.height = RES;
  const g = c.getContext('2d');
  const img = g.createImageData(RES, RES);
  const zc = {}; for (const z of Object.values(ZONES)) zc[z.id] = hex(z.color);
  const ground = [104, 128, 70];
  for (let j = 0; j < RES; j++) {
    const z = -WORLD_HALF + (j + 0.5) * MPP;
    for (let i = 0; i < RES; i++) {
      const x = -WORLD_HALF + (i + 0.5) * MPP;
      const h = heightAt(x, z);
      const o = (j * RES + i) * 4;
      if (h < WATER_LEVEL - 0.3) { img.data[o] = 52; img.data[o + 1] = 92; img.data[o + 2] = 130; img.data[o + 3] = 255; continue; }
      const zn = zc[zoneAt(x, z).id];
      let r = ground[0] * 0.75 + zn[0] * 0.25, gg = ground[1] * 0.75 + zn[1] * 0.25, b = ground[2] * 0.75 + zn[2] * 0.25;
      const shade = Math.max(-0.35, Math.min(0.35, (heightAt(x - MPP, z - MPP) - h) * 0.12));
      const rock = Math.max(0, Math.min(1, (h - 50) / 110));
      r += (128 - r) * rock; gg += (122 - gg) * rock; b += (116 - b) * rock;
      if (h > 165) { const s = Math.min(1, (h - 165) / 30); r += (235 - r) * s; gg += (238 - gg) * s; b += (242 - b) * s; }
      img.data[o] = r * (1 + shade); img.data[o + 1] = gg * (1 + shade); img.data[o + 2] = b * (1 + shade); img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // trees
  g.fillStyle = 'rgba(22,58,24,0.75)';
  for (const t of trees) { g.beginPath(); g.arc(toB(t.x), toB(t.z), 0.9 + t.s * 0.5, 0, Math.PI * 2); g.fill(); }
  // roads
  g.strokeStyle = '#b89a66'; g.lineWidth = 3; g.lineJoin = g.lineCap = 'round';
  for (const road of Object.values(ROADS)) {
    g.beginPath(); road.forEach(([x, z], k) => (k ? g.lineTo(toB(x), toB(z)) : g.moveTo(toB(x), toB(z)))); g.stroke();
  }
  // building footprints / walls
  g.fillStyle = 'rgba(58,40,28,0.95)';
  forEachCollider(o => {
    if (o.type === 'circle') { if (o.r > 6) return; g.beginPath(); g.arc(toB(o.x), toB(o.z), Math.max(0.8, o.r / MPP), 0, Math.PI * 2); g.fill(); return; }
    if (o.hw > 60 || o.hd > 60) return;
    g.save(); g.translate(toB(o.x), toB(o.z)); g.rotate(-o.rot);
    g.fillRect(-o.hw / MPP, -o.hd / MPP, Math.max(1, o.hw * 2 / MPP), Math.max(1, o.hd * 2 / MPP));
    g.restore();
  });
  base = c;
}

export function initMinimap() {
  const hud = document.getElementById('hud');
  canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = SIZE * dpr;
  hud.appendChild(canvas);
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  nLabel = document.createElement('div'); nLabel.id = 'minimap-n'; nLabel.textContent = 'С';
  hud.appendChild(nLabel);
  game.minimap = { setZoom: i => { zoomI = i % ZOOMS.length; } };
  game.addSystem({ name: 'minimap', order: 210, update: updateMinimap });
  const t0 = performance.now(); buildBase(); // during the loading screen (trees & buildings exist by now)
  console.log(`minimap base built in ${Math.round(performance.now() - t0)} ms`);
}

function updateMinimap(dt) {
  const p = game.player;
  if (!p || !game.started) return;
  if (input.hit('KeyN')) { zoomI = (zoomI + 1) % ZOOMS.length; acc = 1; }
  acc += dt;
  if (acc < 0.1) return;
  acc = 0;
  if (!base) buildBase();
  const R = ZOOMS[zoomI], k = (SIZE / 2 - 4) / R, C = SIZE / 2;
  // rotate so the camera's forward direction points up
  const th = -Math.PI / 2 - Math.atan2(Math.cos(cam.yaw), Math.sin(cam.yaw));
  const cs = Math.cos(th), sn = Math.sin(th);
  const toS = (x, z) => { const dx = (x - p.pos.x) * k, dz = (z - p.pos.z) * k; return [C + dx * cs - dz * sn, C + dx * sn + dz * cs]; };

  ctx.save();
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.beginPath(); ctx.arc(C, C, C, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#1a1a14'; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.translate(C, C); ctx.rotate(th); ctx.scale(k * MPP, k * MPP); ctx.translate(-toB(p.pos.x), -toB(p.pos.z));
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, 0, 0);
  ctx.restore();
  // darker at night
  const night = 1 - (game.ambientLevel ?? 1);
  if (night > 0.05) { ctx.fillStyle = `rgba(5,8,25,${night * 0.45})`; ctx.fillRect(0, 0, SIZE, SIZE); }

  // caravans
  for (const c of game.gameplay?.caravans ?? []) {
    if (!c.pos || c.alive === false) continue;
    const [sx, sy] = toS(c.pos.x, c.pos.z);
    if ((sx - C) ** 2 + (sy - C) ** 2 > C * C) continue;
    ctx.fillStyle = c.state === 'robbed' ? '#776655' : '#d89a3a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.fillRect(sx - 4, sy - 3, 8, 6); ctx.strokeRect(sx - 4, sy - 3, 8, 6);
  }
  // actors
  const R2 = (R * 1.05) ** 2;
  for (const a of game.actors) {
    if (a === p || !a.alive || a.removed) continue;
    const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
    if (dx * dx + dz * dz > R2) continue;
    let col;
    if (isHostile(a, p) || a.ai?.target === p) col = '#ff3a2a';
    else if (a.faction === game.playerFaction) col = '#58e060';
    else if (a.faction === 'humans') col = '#f0d870';
    else col = '#b0b0b0';
    const [sx, sy] = toS(a.pos.x, a.pos.z);
    const r = a.role === 'boss' || a.role === 'emperor' || a.role === 'commander' || a.role === 'chief' ? 4 : 2.6;
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // quest markers / POIs (clamped to the rim)
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const poi of game.compassPois.values()) {
    let [sx, sy] = toS(poi.x, poi.z);
    const dx = sx - C, dy = sy - C, d = Math.hypot(dx, dy), max = C - 10;
    if (d > max) { sx = C + dx / d * max; sy = C + dy / d * max; }
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(poi.label, sx, sy);
    ctx.fillStyle = poi.color ?? '#fff'; ctx.fillText(poi.label, sx, sy);
  }
  // player arrow (player yaw relative to the camera)
  ctx.save();
  ctx.translate(C, C); ctx.rotate(cam.yaw - p.yaw);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
  // zoom label + north marker on the rim
  ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(255,240,200,0.85)'; ctx.textAlign = 'center';
  ctx.fillText(`${R} м`, C, SIZE - 12);
  const nx = Math.sin(th) * 1, ny = -Math.cos(th) * 1; // world north (0,-1) rotated by th
  const rect = canvas.getBoundingClientRect();
  nLabel.style.left = rect.left + C + nx * (C - 2) + 'px';
  nLabel.style.top = rect.top + C + ny * (C - 2) + 'px';
}
