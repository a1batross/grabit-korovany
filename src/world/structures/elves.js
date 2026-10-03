// ZONE 3 — the ELF VILLAGE in the dense forest ("домики деревяные"): log houses with leaf roofs, treehouses on
// giant trunks with walkable platforms, spiral stairs and rope bridges, central campfire, palisade, archery range,
// lanterns, an elf trader; plus small hunting camps scattered through the elf forest.
import { game } from '../../core/game.js';
import { heightAt, slopeAt } from '../terrain.js';
import { LOC, distToAnyRoad } from '../zones.js';
import { Frame, groundRange, torch, banner, lantern, campfire, drape, exclude, addGlow, rr, rng, rpick, debug } from './kit.js';

const LOG = '#7a5634', LOG2 = '#6a4a2c', LOGEND = '#b48a5a', LEAF = '#4f7a2e', LEAF2 = '#5f8a34', THATCH = '#8a7a40';
const GREEN = '#2f7d32', GOLDLEAF = '#e0c060', WIN = '#3a3020';

// ---------- log house ----------
export function logHouse(f, o = {}) {
  const w = o.w ?? 7, d = o.d ?? 5.5, wallH = o.h ?? 2.9, roofH = o.roofH ?? 2.6;
  const { lo, hi } = groundRange(f, 0, 0, w + 1, d + 1);
  const fy = hi - f.y + 0.35; // floor level (relative)
  const lr = 0.19; // log radius
  // stone footing down to the lowest terrain point
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) f.box(sx * (w / 2 - 0.2), lo - f.y - 0.4, sz * (d / 2 - 0.2), 0.8, fy - (lo - f.y) + 0.4, 0.8, '#7d7a72', { ao: 0.3 });
  f.box(0, fy - 0.25, 0, w - 0.2, 0.25, d - 0.2, '#5a4028', { ao: 0 });
  const rows = Math.round(wallH / (lr * 2));
  const doorW = 1.2, doorH = 2.1;
  for (let r = 0; r < rows; r++) {
    const y = fy + lr + r * lr * 2;
    const col = r % 2 ? LOG : LOG2;
    // side walls (along z) at x=±w/2, front/back (along x) at z=±d/2; ends cross
    for (const s of [-1, 1]) {
      f.cyl(s * w / 2, y, 0, lr, lr, d + 0.6, col, { center: true, rx: Math.PI / 2, seg: 6, ao: 0 });
      if (s < 0) f.cyl(0, y, -d / 2, lr, lr, w + 0.6, col, { center: true, rz: Math.PI / 2, seg: 6, ao: 0 });
    }
    // front with door gap
    if (y < fy + doorH) {
      const segW = (w + 0.6 - doorW) / 2;
      for (const s of [-1, 1]) f.cyl(s * (doorW / 2 + segW / 2), y, d / 2, lr, lr, segW, col, { center: true, rz: Math.PI / 2, seg: 6, ao: 0 });
    } else f.cyl(0, y, d / 2, lr, lr, w + 0.6, col, { center: true, rz: Math.PI / 2, seg: 6, ao: 0 });
  }
  const top = fy + rows * lr * 2;
  // log ends (lighter discs) at the corners
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) f.box(sx * (w / 2 + 0.3), fy, sz * (d / 2 + 0.3), 0.06, top - fy, 0.06, LOGEND, { ao: 0 });
  // door (rounded top), step, round windows
  f.box(0, fy, d / 2 - 0.05, doorW - 0.1, doorH - 0.4, 0.12, '#3e2a18');
  f.cyl(0, fy + doorH - 0.4, d / 2 - 0.05, (doorW - 0.1) / 2, (doorW - 0.1) / 2, 0.12, '#3e2a18', { center: true, rx: Math.PI / 2, seg: 10 });
  f.box(0, fy - 0.2, d / 2 + 0.5, 1.6, 0.2, 0.9, '#5a4028');
  for (const s of [-1, 1]) {
    f.cyl(s * w * 0.28, fy + 1.55, d / 2 + 0.12, 0.42, 0.42, 0.12, '#5a3e24', { center: true, rx: Math.PI / 2, seg: 10 });
    f.cyl(s * w * 0.28, fy + 1.55, d / 2 + 0.16, 0.32, 0.32, 0.1, WIN, { center: true, rx: Math.PI / 2, seg: 10, mat: 'glow' });
    f.cyl(s * (w / 2 + 0.15), fy + 1.55, 0, 0.32, 0.32, 0.1, WIN, { center: true, rz: Math.PI / 2, seg: 10, mat: 'glow' });
  }
  // gable roof (ridge along z = depth), leafy/thatched with a big overhang + ridge log
  const roofCol = o.roof ?? rpick([LEAF, LEAF2, THATCH, '#6e7a36']);
  f.gableRoof(0, top, 0, w, d, roofH, roofCol, { overhang: 0.75, thick: 0.35, wallColor: LOG2, ridge: '#5a3e24' });
  // leaf tufts along the eaves
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) f.sphere(s * (w / 2 + 0.6), top - 0.1, -d / 2 + 0.3 + (k / 5) * (d - 0.6), 0.32, roofCol, { sy: 0.6 });
  // carved crossed finials at the gable peaks
  for (const s of [-1, 1]) for (const r of [-1, 1]) f.box(0, top + roofH + 0.1, s * (d / 2 + 0.7), 0.12, 1.1, 0.12, '#5a3e24', { rz: r * 0.6 });
  if (o.chimney) { f.box(-w / 2 + 1, fy, -d / 2 + 0.8, 0.9, top + roofH - fy + 0.4, 0.9, '#7d7a72'); }
  // garland over the door
  for (let k = 0; k < 7; k++) { const t = k / 6 - 0.5; f.sphere(t * 1.8, fy + doorH + 0.2 - Math.cos(t * Math.PI) * 0.25, d / 2 + 0.25, 0.13, rpick([GREEN, GOLDLEAF, '#c84a3a']), { detail: 0 }); }
  f.solid(0, 0, w + 0.4, d + 0.4, top + roofH);
  f.exclude(0, 0, Math.max(w, d) * 0.75 + 1);
  return { fy, top, door: f.place(0, d / 2 + 1.3, 0) };
}

// ---------- treehouse ----------
function treehouse(f, platY, o = {}) {
  const R = 5, rT = 1.35;
  const ent = []; // openings (angles) in the railing
  // trunk with flared roots and a big crown
  f.cyl(0, -0.5, 0, rT, rT + 0.7, platY + 0.5, '#5a3d24', { seg: 9, ao: 0.2 });
  f.cyl(0, platY, 0, rT - 0.4, rT, 7.5, '#5a3d24', { seg: 9, ao: 0 });
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + 0.3;
    f.cyl(Math.cos(a) * 1.6, -0.3, Math.sin(a) * 1.6, 0.2, 0.55, 2.4, '#553a22', { seg: 5, rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9, ry: 0 });
  }
  for (const [x, y, z, r] of [[0, 9.5, 0, 4.6], [2.8, 8.3, 1.2, 3.2], [-2.6, 8.5, -1.5, 3.4], [0.6, 8, -3, 3], [-1, 12, 0.6, 3.2], [1.5, 7.6, 3.2, 2.6]]) f.sphere(x, platY + y - 2.5, z, r, rpick(['#2f6a2a', '#3a7a30', '#2a5e26']), { detail: 1 });
  f.post(0, 0, rT + 0.3);
  // platform (octagon) with braces
  f.cyl(0, platY - 0.35, 0, R, R, 0.35, '#7a5a38', { seg: 8, ao: 0 });
  for (let k = 0; k < 8; k++) f.box(Math.cos(k * Math.PI / 4) * R * 0.5, platY - 0.35, Math.sin(k * Math.PI / 4) * R * 0.5, 0.08, 0.04, R, '#5a4028', { ry: Math.PI / 2 - k * Math.PI / 4, ao: 0 });
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    f.cyl(Math.cos(a) * 2.6, platY - 3.4, Math.sin(a) * 2.6, 0.12, 0.12, 3.6, '#5a4028', { seg: 5, rz: Math.cos(a) * 0.55, rx: -Math.sin(a) * 0.55 });
  }
  f.floor(0, 0, R * 2 * 0.83, R * 2 * 0.83, platY, { bottom: platY - 0.5 });
  f.floor(0, 0, R * 2 * 0.83, R * 2 * 0.83, platY, { rot: Math.PI / 4, bottom: platY - 0.5 });
  // hut wrapped around the trunk
  const hr = 2.5;
  f.cyl(0, platY, 0, hr, hr, 2.5, '#8a6a42', { seg: 10, ao: 0.15 });
  f.cone(0, platY + 2.4, 0, hr + 1.1, 2.8, rpick([LEAF, LEAF2]), { seg: 10 });
  f.box(0, platY, hr - 0.02, 0.9, 1.8, 0.14, '#3e2a18');
  for (const a of [1.6, -1.2, 3.4]) f.cyl(Math.sin(a) * hr, platY + 1.4, Math.cos(a) * hr, 0.28, 0.28, 0.12, WIN, { center: true, rx: Math.PI / 2, ry: a, seg: 8, mat: 'glow' });
  f.post(0, 0, hr + 0.1, platY + 5);
  return { R, hr, platY, ent };
}
function railing(f, R, y, openings) {
  // 16 posts around, rails between; skip segments near opening angles
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const open = openings.some(o => Math.abs(Math.atan2(Math.sin(am - o), Math.cos(am - o))) < 0.32);
    const x0 = Math.cos(a0) * (R - 0.2), z0 = Math.sin(a0) * (R - 0.2), x1 = Math.cos(a1) * (R - 0.2), z1 = Math.sin(a1) * (R - 0.2);
    f.cyl(x0, y, z0, 0.07, 0.07, 1.1, '#5a4028', { seg: 4 });
    if (open) continue;
    const L = Math.hypot(x1 - x0, z1 - z0), dir = Math.atan2(x1 - x0, z1 - z0);
    f.box((x0 + x1) / 2, y + 0.95, (z0 + z1) / 2, 0.08, 0.08, L, '#6a4a2c', { ry: dir, ao: 0 });
    f.box((x0 + x1) / 2, y + 0.5, (z0 + z1) / 2, 0.05, 0.05, L, '#6a4a2c', { ry: dir, ao: 0 });
    f.solid((x0 + x1) / 2, (z0 + z1) / 2, 0.25, L, y + 1.05, { rot: dir, bottom: y - 0.3 });
  }
}
// spiral stair outside the platform, from the ground up to platY, ending at angle aEnd
function spiral(f, platY, R, aEnd) {
  const rS = R + 1.65, run = 0.78, rise = 0.29;
  const g0 = 0; // frame y is the ground at the trunk
  const n = Math.ceil((platY - g0) / rise);
  const da = run / rS;
  const path = [];
  for (let i = 0; i < n; i++) {
    const a = aEnd - (n - 1 - i) * da;
    const top = g0 + (i + 1) * (platY - g0) / n;
    const x = Math.cos(a) * rS, z = Math.sin(a) * rS;
    const gy = f.ground(x, z) - f.y;
    path.push(f.w(x, z));
    if (top <= gy + 0.05) continue;
    f.box(x, top - 0.14, z, 1.4, 0.14, run + 0.06, '#7a5a38', { ry: Math.PI / 2 - a + Math.PI / 2, ao: 0 });
    f.cyl(Math.cos(a) * (rS + 0.7), gy - 0.2, Math.sin(a) * (rS + 0.7), 0.06, 0.07, top - gy + 0.2 + 1.0, '#5a4028', { seg: 4 });
    if (i % 2 === 0) f.cyl(Math.cos(a) * (rS - 0.6), gy - 0.2, Math.sin(a) * (rS - 0.6), 0.06, 0.07, top - gy + 0.06, '#5a4028', { seg: 4 });
    f.floor(x, z, 1.4, run + 0.02, top, { rot: Math.PI - a, bottom: top - 0.45 });
    // outer handrail collider
    f.solid(Math.cos(a) * (rS + 0.85), Math.sin(a) * (rS + 0.85), 0.2, run + 0.1, top + 1.0, { rot: Math.PI - a, bottom: top - 0.3 });
  }
  // landing plank from the last step to the platform
  const lx = Math.cos(aEnd) * (R + 0.7), lz = Math.sin(aEnd) * (R + 0.7);
  f.box(lx, platY - 0.14, lz, 2.4, 0.14, 1.3, '#7a5a38', { ry: Math.PI - aEnd, ao: 0 });
  f.floor(lx, lz, 2.4, 1.3, platY, { rot: Math.PI - aEnd, bottom: platY - 0.45 });
  path.push(f.w(lx, lz), f.w(Math.cos(aEnd) * 3.6, Math.sin(aEnd) * 3.6));
  (debug.paths.spirals ??= []).push(path);
  return aEnd;
}
// rope bridge between two platform centres (local coords), both at platY
function ropeBridge(f, A, B, platY, R) {
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const s = [A[0] + ux * (R - 1.0), A[1] + uz * (R - 1.0)], e = [B[0] - ux * (R - 1.0), B[1] - uz * (R - 1.0)];
  const span = Math.hypot(e[0] - s[0], e[1] - s[1]);
  const N = Math.ceil(span / 0.75), seg = span / N, dir = Math.atan2(ux, uz);
  const sag = Math.min(1.1, span * 0.05);
  const yAt = t => platY - sag * 4 * t * (1 - t);
  const px = -uz, pz = ux; // perpendicular
  (debug.paths.bridges ??= []).push([f.w(A[0] + ux * 3, A[1] + uz * 3), f.w(s[0], s[1]), f.w(e[0], e[1]), f.w(B[0] - ux * 3, B[1] - uz * 3)]);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N, x = s[0] + (e[0] - s[0]) * t, z = s[1] + (e[1] - s[1]) * t, y = yAt(t);
    f.box(x, y - 0.1, z, 1.5 + (i % 3 === 0 ? 0.15 : 0), 0.1, seg * 0.8, i % 2 ? '#8a6a42' : '#7a5a38', { ry: dir, ao: 0 });
    f.floor(x, z, 1.6, seg + 0.02, y, { rot: dir, bottom: y - 0.45 });
    for (const k of [-1, 1]) f.solid(x + px * k * 0.95, z + pz * k * 0.95, 0.2, seg + 0.02, y + 1.0, { rot: dir, bottom: y - 0.3 });
    if (i % 3 === 0) for (const k of [-1, 1]) f.cyl(x + px * k * 0.85, y - 0.05, z + pz * k * 0.85, 0.025, 0.025, 1.0, '#c8b890', { seg: 3 });
  }
  // hand ropes (segmented)
  const M = 8;
  for (let i = 0; i < M; i++) {
    const t0 = i / M, t1 = (i + 1) / M;
    for (const k of [-1, 1]) {
      const x0 = s[0] + (e[0] - s[0]) * t0 + px * k * 0.85, z0 = s[1] + (e[1] - s[1]) * t0 + pz * k * 0.85;
      const x1 = s[0] + (e[0] - s[0]) * t1 + px * k * 0.85, z1 = s[1] + (e[1] - s[1]) * t1 + pz * k * 0.85;
      const y0 = yAt(t0) + 1.0 + sag * 0.3 * 4 * t0 * (1 - t0), y1 = yAt(t1) + 1.0 + sag * 0.3 * 4 * t1 * (1 - t1);
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      f.cyl((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0.035, 0.035, len, '#c8b890', { center: true, seg: 4, ry: dir, rx: Math.atan2(Math.hypot(x1 - x0, z1 - z0), y1 - y0), ao: 0 });
    }
  }
  return [Math.atan2(uz, ux), Math.atan2(-uz, -ux)]; // opening angles at A and B (atan2(z,x) convention)
}

function palisade(f, cx, cz, r, a0, a1, step = 0.55) {
  const n = Math.floor(((a1 - a0) * r) / step);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * (a1 - a0);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const gy = f.ground(x, z) - f.y;
    const h = rr(2.4, 3.2);
    f.cyl(x, gy - 0.4, z, 0.22, 0.24, h, i % 2 ? LOG : LOG2, { seg: 5 });
    f.cone(x, gy - 0.4 + h, z, 0.22, 0.5, LOG, { seg: 5 });
  }
  // colliders as chords
  const m = Math.max(1, Math.round(((a1 - a0) * r) / 4));
  for (let i = 0; i < m; i++) {
    const b0 = a0 + (i / m) * (a1 - a0), b1 = a0 + ((i + 1) / m) * (a1 - a0);
    const x0 = cx + Math.cos(b0) * r, z0 = cz + Math.sin(b0) * r, x1 = cx + Math.cos(b1) * r, z1 = cz + Math.sin(b1) * r;
    f.solid((x0 + x1) / 2, (z0 + z1) / 2, 0.5, Math.hypot(x1 - x0, z1 - z0), 3, { rot: Math.atan2(x1 - x0, z1 - z0) });
  }
}

function target(f, x, z, ry) {
  const t = f.sub(x, f.ground(x, z) - f.y, z, ry);
  t.box(-0.5, 0, -0.3, 0.12, 2.2, 0.12, LOG2, { rx: 0.2 }); t.box(0.5, 0, -0.3, 0.12, 2.2, 0.12, LOG2, { rx: 0.2 });
  t.box(0, 0, -0.9, 0.12, 2.0, 0.12, LOG2, { rx: -0.4 });
  t.cyl(0, 1.5, 0, 0.75, 0.75, 0.3, '#e0d0a0', { center: true, rx: Math.PI / 2, seg: 14 });
  t.cyl(0, 1.5, 0.13, 0.55, 0.55, 0.06, '#2f7d32', { center: true, rx: Math.PI / 2, seg: 14 });
  t.cyl(0, 1.5, 0.15, 0.33, 0.33, 0.06, '#e8e0c0', { center: true, rx: Math.PI / 2, seg: 12 });
  t.cyl(0, 1.5, 0.17, 0.14, 0.14, 0.06, '#c83a2a', { center: true, rx: Math.PI / 2, seg: 10 });
  for (let k = 0; k < 2; k++) t.cyl(rr(-0.4, 0.4), 1.5 + rr(-0.4, 0.4), 0.5, 0.015, 0.015, 0.7, '#4a3a2a', { center: true, rx: Math.PI / 2 + rr(-0.1, 0.1), seg: 3 });
  t.post(0, 0, 0.6, 2.3);
}

// small hunting camp: hut + campfire + drying rack + log seat
function huntCamp(x, z, seed) {
  const f = new Frame(x, heightAt(x, z), z, seed * 1.7);
  exclude(x, z, 11);
  campfire(f, 0, 0, {});
  // round hut with a leaf cone roof
  const hx = 0, hz = -5.5;
  const gy = f.ground(hx, hz) - f.y;
  f.cyl(hx, gy - 0.5, hz, 2.0, 2.1, 2.5, '#8a6a42', { seg: 9 });
  f.cone(hx, gy + 1.9, hz, 2.9, 2.6, rpick([LEAF, LEAF2, THATCH]), { seg: 9 });
  f.box(hx, gy, hz + 1.95, 0.8, 1.6, 0.14, '#3e2a18');
  f.cyl(hx + 1.2, gy + 1.3, hz + 1.6, 0.22, 0.22, 0.1, WIN, { center: true, rx: Math.PI / 2, ry: 0.6, seg: 8, mat: 'glow' });
  f.post(hx, hz, 2.1, gy + 4.5);
  // log seats
  for (const a of [0.3, 2.4]) f.cyl(Math.cos(a) * 2.6, f.ground(Math.cos(a) * 2.6, Math.sin(a) * 2.6) - f.y + 0.25, Math.sin(a) * 2.6, 0.26, 0.26, 2.0, LOG, { center: true, rz: Math.PI / 2, ry: -a + Math.PI / 2, seg: 6 });
  // drying rack with hides
  const rx = 4.5, rz = -1.5, ry = f.ground(rx, rz) - f.y;
  f.box(rx, ry, rz - 1.2, 0.12, 2.1, 0.12, LOG2); f.box(rx, ry, rz + 1.2, 0.12, 2.1, 0.12, LOG2);
  f.box(rx, ry + 2.0, rz, 0.1, 0.1, 2.7, LOG2);
  f.box(rx, ry + 1.25, rz - 0.55, 0.05, 1.4, 0.9, '#a07850', { mat: 'cloth' });
  f.box(rx, ry + 1.4, rz + 0.55, 0.05, 1.1, 0.8, '#8a6040', { mat: 'cloth' });
  f.solid(rx, rz, 0.4, 2.6, 2.2);
  // bow & quiver against the hut, bedroll
  f.box(-2.4, f.ground(-2.4, 1.6) - f.y + 0.05, 1.6, 0.8, 0.18, 1.9, '#4a6a3a', { ry: 0.3 });
  lantern(f, -3.2, -2.6, 2.2, { y: f.ground(-3.2, -2.6) - f.y, light: '#d8ff9a', glow: '#b8ff70' });
  return { x: +x.toFixed(1), z: +z.toFixed(1), yaw: +f.yaw.toFixed(2), name: 'Охотничий лагерь эльфов' };
}

export function buildElves() {
  const C = LOC.elfVillage;
  const y0 = heightAt(C.x, C.z);
  const f = new Frame(C.x, y0, C.z, 0);
  const posts = [];
  exclude(C.x, C.z, 60);

  // ---- central square: campfire, seats, trader ----
  campfire(f, 0, 0, { r: 1.2, size: 9, glow: '#ffb050' });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    f.cyl(Math.cos(a) * 3.8, 0.3, Math.sin(a) * 3.8, 0.3, 0.3, 2.4, LOG, { center: true, rz: Math.PI / 2, ry: -a + Math.PI / 2, seg: 7 });
  }
  // ground: a ring of packed earth and paths to the houses
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    f.box(Math.cos(a) * 7.5, -0.15, Math.sin(a) * 7.5, 1.0, 0.25, 0.8, '#8a8478', { ry: -a, ao: 0 });
  }
  game.places.set('elves:square', { ...f.place(0, 6, 0), name: 'Площадь эльфов' });

  // elf trader stall with a leaf canopy
  {
    const s = f.sub(11, 0, 7, -2.1);
    s.box(0, 0, 0, 3.2, 1.0, 0.9, LOG2);
    s.box(0, 1.0, 0, 3.4, 0.1, 1.1, '#8a6a42');
    for (const k of [-1, 1]) for (const z of [-0.5, 0.6]) s.cyl(k * 1.6, 0, z, 0.08, 0.1, 2.7, LOG, { seg: 5 });
    s.box(0, 2.7, 0.05, 3.8, 0.12, 2.0, LEAF, { center: true, rx: 0.18 });
    for (let k = 0; k < 7; k++) s.sphere(-1.8 + k * 0.6, 2.62, 1.05, 0.25, rpick([LEAF, LEAF2, GOLDLEAF]), { sy: 0.7 });
    for (let k = 0; k < 4; k++) s.box(-1.1 + k * 0.72, 1.1, 0, 0.4, 0.25, 0.35, rpick(['#c8a050', '#5a8a3a', '#8a3a3a', '#c0c0c8']));
    // bows on display
    for (let k = 0; k < 2; k++) s.cyl(-0.6 + k * 1.2, 1.15, -0.35, 0.03, 0.03, 1.5, '#6a4a2a', { seg: 4, rz: 0.15 });
    s.sign(0, 3.25, 0.6, 'ЭЛЬФИЙСКАЯ ЛАВКА', 2.6, 0.55, { style: 'green' });
    lantern(s, 2.1, 0.5, 2.5, { light: '#e8ffb0', glow: '#d0ff80' });
    s.solid(0, 0, 3.2, 0.9, 1.1);
    game.places.set('shop:elves', { ...s.place(0, -0.9, 0), name: 'Эльфийский торговец' });
  }

  // ---- log houses around the square ----
  const houses = [];
  const spots = [[-23, -8, 7, 5.5], [24, -12, 7.5, 5.5], [-27, 15, 6.5, 5], [27, 17, 7, 5.5], [-12, 30, 6.5, 5], [14, 32, 7, 5], [-44, 4, 6.5, 5], [44, 30, 6, 5]];
  for (const [x, z, w, d] of spots) {
    const yaw = Math.atan2(-x, -z);
    const h = f.sub(x, 0, z, yaw);
    const r = logHouse(h, { w, d, chimney: rng() < 0.4 });
    houses.push(r.door);
    // dirt path from the square to the door, woodpile & barrel by the house
    const dr = Math.hypot(x, z), ux = x / dr, uz = z / dr;
    drape([[C.x + ux * 8, C.z + uz * 8], [r.door.x, r.door.z]], 1.6, '#7a6a48', { off: 0.06 });
    for (let k = 0; k < 5; k++) h.cyl(w / 2 + 0.7, 0.2 + Math.floor(k / 3) * 0.38, -1 + (k % 3) * 0.4 + Math.floor(k / 3) * 0.2, 0.19, 0.19, 1.4, '#8a6a44', { center: true, rx: Math.PI / 2, seg: 6 });
    h.cyl(-w / 2 - 0.6, 0, d / 2 - 0.5, 0.4, 0.4, 0.95, '#6a4a2c', { seg: 8 });
    h.post(-w / 2 - 0.6, d / 2 - 0.5, 0.45, 1);
  }
  // chief's longhouse (north of the square)
  {
    const h = f.sub(0, 0, -24, 0);
    const r = logHouse(h, { w: 11, d: 8, h: 3.3, roofH: 3.6, roof: '#4a7a2a', chimney: true });
    // antlers over the door, green banners
    for (const s of [-1, 1]) {
      h.cyl(s * 0.4, r.top + 0.3, 4.3, 0.06, 0.08, 1.2, '#e8dcc0', { seg: 4, rz: -s * 0.6 });
      h.cyl(s * 0.8, r.top + 0.8, 4.3, 0.04, 0.05, 0.6, '#e8dcc0', { seg: 4, rz: s * 0.3 });
      banner(h, s * 3.6, r.top - 0.2, 4.35, 1.4, 2.6, GREEN, GOLDLEAF);
      torch(h, s * 1.4, r.fy + 1.2, 4.4, { color: '#ffd080' });
    }
    h.sign(0, r.top - 0.45, 4.42, 'ДОМ ВОЖДЯ', 2.2, 0.5, { style: 'green', back: false });
    game.places.set('elves:chief', { ...h.place(0, 6.2, 0), name: 'Вождь эльфов' });
    posts.push(h.place(-2.5, 5.8, 0), h.place(2.5, 5.8, 0));
  }

  // ---- treehouses with platforms, spiral stairs and rope bridges ----
  const TH = [[-31, -32, 8], [-6, -46, 8], [20, -38, 8], [44, -8, 7]];
  const thInfo = TH.map(([x, z, py]) => {
    const t = f.sub(x, f.ground(x, z) - y0, z, 0);
    const info = treehouse(t, py - (f.ground(x, z) - y0) + 0, {});
    t.exclude(0, 0, 8.5);
    return { t, x, z, py: py - (f.ground(x, z) - y0), worldY: t.y + py - (f.ground(x, z) - y0), info };
  });
  // bridges T0-T1, T1-T2 (platforms at same world height => compute in village frame)
  const openings = thInfo.map(() => []);
  const bridgeY = (i) => thInfo[i].worldY - y0;
  for (const [i, j] of [[0, 1], [1, 2]]) {
    const yb = Math.min(bridgeY(i), bridgeY(j));
    const [oa, ob] = ropeBridge(f, [TH[i][0], TH[i][1]], [TH[j][0], TH[j][1]], yb, 5);
    openings[i].push(oa); openings[j].push(ob);
  }
  thInfo.forEach((T, i) => {
    // spiral arrives on the side facing the village centre
    const aEnd = Math.atan2(-T.z, -T.x) + 0.9;
    spiral(T.t, T.py, T.info.R, aEnd);
    openings[i].push(aEnd);
    railing(T.t, T.info.R, T.py, openings[i]);
    // decorative ladder on the opposite side
    const al = aEnd + Math.PI;
    for (let k = 0; k < Math.floor(T.py / 0.45); k++) T.t.box(Math.cos(al) * (T.info.R + 0.15), k * 0.45 + 0.3, Math.sin(al) * (T.info.R + 0.15), 0.7, 0.06, 0.06, '#6a4a2c', { ry: Math.PI / 2 - al });
    for (const s of [-1, 1]) T.t.cyl(Math.cos(al) * (T.info.R + 0.15) + Math.sin(al) * 0.35 * s, -0.2, Math.sin(al) * (T.info.R + 0.15) - Math.cos(al) * 0.35 * s, 0.05, 0.05, T.py + 1.2, '#6a4a2c', { seg: 4 });
    // lanterns & a green banner on the platform
    const p = T.t.w(Math.cos(aEnd - 0.8) * 3.8, Math.sin(aEnd - 0.8) * 3.8);
    lantern(T.t, Math.cos(aEnd - 0.8) * 3.8, Math.sin(aEnd - 0.8) * 3.8, 1.8, { y: T.py, light: '#e8ffb0', glow: '#d0ff80' });
    const pa = aEnd - 2.2;
    posts.push({ x: +(T.x + C.x + Math.cos(pa) * 3.7).toFixed(2), z: +(T.z + C.z + Math.sin(pa) * 3.7).toFixed(2), yaw: +Math.atan2(Math.cos(pa), Math.sin(pa)).toFixed(2), y: +T.worldY.toFixed(2) });
    void p;
  });
  // flag on top of the tallest crown
  // ---- archery range (east) ----
  for (let k = 0; k < 3; k++) target(f, 56, 8 + k * 5, -Math.PI / 2);
  for (let k = 0; k < 3; k++) f.box(38, 0, 8 + k * 5, 0.1, 0.05, 1.4, '#e8e0c0', { ao: 0 });
  f.sub(36, 0, 18, 0).sign(0, 1.4, 0, 'СТРЕЛЬБИЩЕ', 2, 0.5, { style: 'green' });
  f.box(36, 0, 18, 0.15, 1.2, 0.15, LOG2);
  posts.push(f.place(36, 13, Math.PI / 2));
  // ---- palisade arcs (north, west, east), gaps for paths; road passes south ----
  palisade(f, 0, 0, 62, -2.7, -1.95);
  palisade(f, 0, 0, 62, -1.7, -0.5);
  palisade(f, 0, 0, 62, -0.3, 0.45);
  palisade(f, 0, 0, 62, 2.6, 3.4);
  // watch posts at the palisade gaps
  for (const a of [-1.82, -0.4, 2.5]) posts.push(f.place(Math.cos(a) * 58, Math.sin(a) * 58, Math.atan2(Math.cos(a), Math.sin(a))));
  // lanterns along the paths, flower/herb beds
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.15, r = 17;
    lantern(f, Math.cos(a) * r, Math.sin(a) * r, 2.6, { light: '#f0ffb0', glow: '#d8ff80', size: 3.4 });
  }
  for (const [x, z] of [[-14, 12], [14, 14], [-34, -16], [34, -22]]) {
    f.box(x, -0.1, z, 3, 0.3, 1.6, '#5a4028', { ao: 0 });
    for (let k = 0; k < 6; k++) f.sphere(x - 1.2 + (k % 3) * 1.2, 0.3, z - 0.4 + Math.floor(k / 3) * 0.8, 0.32, rpick(['#4a8a3a', '#7aa040', '#c84a6a', '#e0c040']), { sy: 0.8 });
  }
  // giant mushrooms and mossy stones around the village
  for (let k = 0; k < 14; k++) {
    const a = rr(0, Math.PI * 2), r = rr(20, 55);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x + 4) < 4 && z > 30) continue;
    const gy = f.ground(x, z) - f.y;
    if (k % 2) { f.cyl(x, gy, z, 0.12, 0.16, 0.6, '#e8e0c8', { seg: 6 }); f.sphere(x, gy + 0.6, z, 0.38, rpick(['#c83a2a', '#d8a040', '#a05030']), { sy: 0.45 }); }
    else f.sphere(x, gy, z, rr(0.4, 0.9), '#6a7a5a', { sy: 0.6 });
  }
  // path to the road (south)
  drape([[C.x, C.z + 8], [C.x - 6, C.z + 40], [C.x - 2, C.z + 72]], 3, '#7a6a48', { off: 0.07 });
  // gate arch where the path meets the palisade line + sign
  {
    const g = f.sub(-4, 0, 60, 0);
    for (const s of [-1, 1]) { g.cyl(s * 2.2, -0.3, 0, 0.3, 0.35, 4.6, LOG, { seg: 6 }); g.post(s * 2.2, 0, 0.35); }
    g.box(0, 4.2, 0, 5.4, 0.45, 0.45, LOG2);
    g.sign(0, 3.55, 0.3, 'ЭЛЬФИЙСКАЯ ДЕРЕВНЯ', 4, 0.7, { style: 'green' });
    for (let k = 0; k < 8; k++) g.sphere(-2.4 + k * 0.7, 4.6, 0, 0.35, rpick([LEAF, LEAF2, GOLDLEAF]), { sy: 0.7 });
    posts.push(g.place(-3.2, 1.5, 0), g.place(3.2, 1.5, 0));
  }
  game.places.set('elves:posts', posts);

  // ---- hunting camps in the forest ----
  const cands = [[-560, -90], [-850, -150], [-960, 40], [-610, 270], [-730, -260], [-990, -230], [-880, 380]];
  const camps = [];
  for (const [cx, cz] of cands) {
    let best = null;
    for (let k = 0; k < 12 && !best; k++) {
      const x = cx + (k ? rr(-40, 40) : 0), z = cz + (k ? rr(-40, 40) : 0);
      if (slopeAt(x, z) < 0.22 && distToAnyRoad(x, z) > 18 && heightAt(x, z) > 2) best = [x, z];
    }
    if (best) camps.push(huntCamp(best[0], best[1], camps.length + 1));
    if (camps.length >= 6) break;
  }
  game.places.set('elves:camps', camps);
  return houses;
}
