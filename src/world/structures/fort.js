// ZONE 4 — the villain's OLD FORT in the northern mountains: ruined dark walls with gaps, broken towers,
// south gate, central hall with the spiky throne, purple banners, skulls, campfires, tents, cages, black market.
import * as THREE from 'three';
import { game } from '../../core/game.js';
import { heightAt } from '../terrain.js';
import { LOC } from '../zones.js';
import { Frame, wallSeg, parapet, stairs, torch, banner, flagPole, lantern, campfire, drape, exclude, addGlow, rr, rng, ri } from './kit.js';

const STONE = '#77717f', STONE2 = '#666070', PLINTH = '#4a4650', PURPLE = '#5b1f7a', BLACK = '#17121c', BONE = '#ddd6c0';
const WOOD = '#3e2c1e', CLOTH = '#2b1d2e';

function skull(f, x, y, z, s = 1, ry = 0) {
  f.sphere(x, y, z, 0.2 * s, BONE, { detail: 1 });
  f.box(x, y - 0.17 * s, z + 0.03 * s, 0.22 * s, 0.12 * s, 0.24 * s, BONE, { ry });
  const fx = Math.sin(ry) * 0.17 * s, fz = Math.cos(ry) * 0.17 * s, sx = Math.cos(ry) * 0.075 * s, sz = -Math.sin(ry) * 0.075 * s;
  for (const k of [-1, 1]) f.box(x + fx + sx * k, y - 0.02 * s, z + fz + sz * k, 0.08 * s, 0.07 * s, 0.04 * s, '#111', { ry, ao: 0 });
}
function skullPike(f, x, z, h = 2.6) {
  const y = f.ground(x, z) - f.y;
  f.cyl(x, y - 0.3, z, 0.05, 0.08, h + 0.3, '#2a1e14', { seg: 5 });
  skull(f, x, y + h + 0.12, z, 1.1, rr(-0.6, 0.6));
  f.post(x, z, 0.12, y + h);
}
function rubble(f, x, z, r = 3, n = 12, color = STONE2) {
  for (let i = 0; i < n; i++) {
    const a = rr(0, Math.PI * 2), d = Math.sqrt(rng()) * r;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const s = rr(0.35, 1.0) * (1 - d / r * 0.5);
    if (rng() < 0.5) f.sphere(px, f.ground(px, pz) - f.y + s * 0.2, pz, s, color, { sy: rr(0.5, 0.9) });
    else f.box(px, f.ground(px, pz) - f.y - 0.1, pz, s * 1.4, s * 0.8, s, color, { ry: rr(0, 3), rz: rr(-0.3, 0.3) });
  }
}
function spikesRow(f, ax, az, bx, bz, n, len = 2.4) {
  const dir = Math.atan2(bx - ax, bz - az);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const y = f.ground(x, z) - f.y;
    f.cone(x, y - 0.2, z, 0.12, len, '#5a4632', { seg: 4, rx: (i % 2 ? 0.55 : 0.35), ry: dir + Math.PI / 2 });
  }
  const L = Math.hypot(bx - ax, bz - az);
  f.solid((ax + bx) / 2, (az + bz) / 2, 0.8, L, 1.2, { rot: dir });
}

export function buildFort() {
  const C = LOC.fort;
  const y0 = heightAt(C.x, C.z);
  const f = new Frame(C.x, y0, C.z, 0); // local +z = world south (toward the gate / road)
  exclude(C.x, C.z, 66);
  const WH = 6, T = 2.6;
  const posts = [];
  const wallOpt = { h: WH, t: T, color: STONE, merlon: STONE2, plinth: PLINTH, cornice: '#857f8c', walkColor: '#5a5560', out: 1 };

  // polygon (clockwise from the west side of the gate); outer side = right-hand side
  const P = [[-9, 50], [-34, 40], [-50, 12], [-48, -22], [-30, -46], [0, -52], [30, -45], [48, -20], [50, 14], [34, 40], [9, 50]];
  // segments with gaps: [index, gapStart t, gapEnd t]
  const gaps = { 3: [0.45, 0.7], 7: [0.3, 0.55], 1: [0.6, 0.8] };
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    // shorten ends so towers cover the joints
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const s0 = i === 0 ? 0 : 3.5, s1 = i === P.length - 2 ? 0 : 3.5;
    const A = [ax + ux * s0, az + uz * s0], B = [bx - ux * s1, bz - uz * s1];
    const g = gaps[i];
    const pOpt = { parapetOpts: { ragged: true, broken: 0.3, h: 1.4 } };
    if (!g) { wallSeg(f, A[0], A[1], B[0], B[1], { ...wallOpt, ...pOpt }); continue; }
    const lerpP = t => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    const G0 = lerpP(g[0]), G1 = lerpP(g[1]);
    wallSeg(f, A[0], A[1], G0[0], G0[1], { ...wallOpt, ...pOpt });
    wallSeg(f, G1[0], G1[1], B[0], B[1], { ...wallOpt, ...pOpt });
    // broken stubs at the edges of the breach + rubble
    const st = (Q, d) => {
      const q = [Q[0] + ux * d * 1.2, Q[1] + uz * d * 1.2];
      f.box(q[0], -2, q[1], T * 0.9, 2 + rr(1.5, 3.5), 2.4, STONE2, { ry: Math.atan2(ux, uz) + rr(-0.2, 0.2) });
    };
    st(G0, 1); st(G1, -1);
    const M = lerpP((g[0] + g[1]) / 2);
    rubble(f, M[0], M[1], 4.5, 16);
  }
  // ---- towers at the vertices (round, ruined) ----
  const towerAt = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const i of towerAt) {
    const [x, z] = P[i];
    const R = 4.2;
    const collapsed = i === 4 || i === 8;
    if (collapsed) {
      f.cyl(x, -3, z, R, R + 0.3, 5.5, STONE2, { seg: 10, ao: 0.3 });
      f.post(x, z, R, 2.5);
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + rr(0, 0.5); f.box(x + Math.cos(a) * (R - 0.4), 2.5, z + Math.sin(a) * (R - 0.4), 0.9, rr(0.4, 2.2), 1.6, STONE2, { ry: -a }); }
      rubble(f, x + 3, z + 3, 5, 14);
      continue;
    }
    f.cyl(x, -3, z, R, R + 0.4, WH + 3, STONE2, { seg: 10, ao: 0.35 });
    f.cyl(x, WH - 0.3, z, R + 0.35, R + 0.2, 0.4, '#57525e', { seg: 10, ao: 0 });
    f.cyl(x, WH - 0.02, z, R - 0.1, R - 0.1, 0.06, '#5a5560', { seg: 10, ao: 0 });
    f.solid(x, z, R * 1.6, R * 1.6, WH, { walkable: true, rot: 0 });
    f.post(x, z, R, WH);
    // ragged merlon ring on the outer half + tall broken shell on some
    const outA = Math.atan2(z, x); // angle pointing away from the centre
    for (let k = 0; k < 9; k++) {
      const a = outA - Math.PI * 0.55 + (k / 8) * Math.PI * 1.1;
      const tall = (i % 3 === 0) && k > 2 && k < 7;
      const h = tall ? rr(3, 6) : rr(0.6, 1.5);
      f.box(x + Math.cos(a) * (R - 0.35), WH, z + Math.sin(a) * (R - 0.35), 0.7, h, 1.5, STONE2, { ry: Math.PI / 2 - a });
      const cx = x + Math.cos(a) * (R - 0.35), cz = z + Math.sin(a) * (R - 0.35);
      f.solid(cx, cz, 0.7, 1.5, WH + Math.min(h, 1.1), { rot: Math.PI / 2 - a });
    }
    // purple banner hanging outside
    banner(f, x + Math.cos(outA) * (R + 0.2), WH - 0.5, z + Math.sin(outA) * (R + 0.2), 1.6, 3.6, PURPLE, BLACK, { ry: Math.PI / 2 - outA });
    if (i % 2) torch(f, x - Math.cos(outA) * (R + 0.1), WH - 2.6, z - Math.sin(outA) * (R + 0.1), { color: '#b070ff' });
    posts.push(f.place(x - Math.cos(outA) * 1.2, z - Math.sin(outA) * 1.2, Math.atan2(Math.cos(outA), Math.sin(outA)), { y: +(y0 + WH).toFixed(2) }));
  }

  // ---- gate (south): two squat gate towers + broken wooden gate ----
  {
    const gz = 50;
    for (const s of [-1, 1]) {
      const gx = s * 10.5;
      f.box(gx, -3, gz, 6, WH + 5.5, 6, STONE2, { ao: 0.35 });
      f.box(gx, -3, gz, 6.5, 3.5, 6.5, PLINTH, { ao: 0.2 });
      f.solid(gx, gz, 6, 6, WH + 2.5, { walkable: true });
      f.box(gx, WH + 2.5 - 0.02, gz, 5.8, 0.06, 5.8, '#5a5560', { ao: 0 });
      parapet(f, gx - 2.7, gz + 2.7, gx + 2.7, gz + 2.7, WH + 2.5, { color: STONE2, ragged: true });
      parapet(f, gx + s * 2.7, gz - 2.7, gx + s * 2.7, gz + 2.7, WH + 2.5, { color: STONE2, ragged: true });
      // horns / spikes on the gate towers
      for (let k = 0; k < 3; k++) f.cone(gx - 2 + k * 2, WH + 3.2, gz + 3.1, 0.25, 1.6, BONE, { seg: 5, rx: 0.6 });
      banner(f, gx, WH + 1.5, gz + 3.12, 2.4, 5.5, PURPLE, BLACK);
      torch(f, s * 6.8, 2.6, gz + 3.2, { color: '#b070ff' });
      // gate leaves: one hanging askew, one fallen
      if (s < 0) f.box(-3.6, 0, gz + 1.5, 3.4, 5, 0.35, '#3a2a1a', { ry: 1.2 });
      else f.box(3.2, 0.05, gz + 4.5, 3.4, 0.35, 5, '#3a2a1a', { ry: 0.25, rz: 0.04 });
      posts.push(f.place(s * 5.5, gz + 5, 0), f.place(gx, gz, 0, { y: +(y0 + WH + 2.5).toFixed(2) }));
      skullPike(f, s * 8, gz + 9); skullPike(f, s * 9, gz + 16); skullPike(f, s * 7, gz + 24);
      spikesRow(f, s * 14, gz + 6, s * 30, gz + 2, 9);
    }
    // stairs to the gate towers (inside)
    stairs(f, -10.5, gz - 3 - 14.5, 0, 2.2, 0, WH + 2.5, '#635d6b', { run: 0.5 });
    stairs(f, 10.5, gz - 3 - 14.5, 0, 2.2, 0, WH + 2.5, '#635d6b', { run: 0.5 });
    // lintel beam with skulls
    f.box(0, WH + 1, gz, 15, 1.2, 1.5, '#2a1e14');
    for (let k = -2; k <= 2; k++) skull(f, k * 1.4, WH + 0.75, gz + 0.85, 1.2, 0);
    f.sign(0, WH + 3, gz + 0.9, 'СТАРЫЙ ФОРТ', 5, 1, { style: 'dark', back: false });
    f.box(0, WH + 2.2, gz + 0.8, 0.2, 0.4, 0.2, '#2a1e14');
    game.places.set('fort:gate', { ...f.place(0, gz + 7, 0), name: 'Ворота форта' });
    f.exclude(0, gz + 10, 12);
  }
  // stairs along the inner west wall
  {
    const [ax, az] = P[2], [bx, bz] = P[3];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const nx = -uz, nz = ux; // left-hand = inside
    const sx = ax + ux * 6 + nx * (T / 2 + 1.2), sz = az + uz * 6 + nz * (T / 2 + 1.2);
    stairs(f, sx, sz, Math.atan2(ux, uz), 2.2, 0, WH, '#635d6b');
  }
  {
    const [ax, az] = P[8], [bx, bz] = P[9];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const nx = -uz, nz = ux;
    const sx = ax + ux * 6 + nx * (T / 2 + 1.2), sz = az + uz * 6 + nz * (T / 2 + 1.2);
    stairs(f, sx, sz, Math.atan2(ux, uz), 2.2, 0, WH, '#635d6b');
  }

  // ---- central HALL with the spiky throne ----
  {
    const hz = -24, HW = 22, HD = 18, HH = 8;
    const front = hz + HD / 2, back = hz - HD / 2, wt = 1.3;
    f.box(0, -0.6, hz, HW, 0.9, HD, '#4e4955', { ao: 0 });
    f.floor(0, hz, HW, HD, 0.3);
    f.box(0, -1, back + wt / 2, HW, HH + 1, wt, STONE);
    f.solid(0, back + wt / 2, HW, wt, HH + 6);
    for (const s of [-1, 1]) {
      f.box(s * (HW / 2 - wt / 2), -1, hz, wt, HH + 1, HD, STONE);
      f.solid(s * (HW / 2 - wt / 2), hz, wt, HD, HH + 6);
      // front wall pieces either side of a 9-wide broken opening
      f.box(s * 8, -1, front - wt / 2, 6, HH + 1 - (s > 0 ? 1.5 : 0), wt, STONE);
      f.solid(s * 8, front - wt / 2, 6, wt, HH + 6);
      // buttresses
      for (let k = 0; k < 3; k++) f.box(s * (HW / 2 + 0.6), -1, hz - 6 + k * 6, 1.2, HH - 1, 1.6, STONE2, { rz: s * 0.08 });
      banner(f, s * 8, HH - 1, front + 0.1, 2.6, 5.5, PURPLE, BLACK);
      torch(f, s * 5.2, 3, front + 0.25, { color: '#b070ff' });
      // slit windows glowing purple-ish
      for (let k = -1; k <= 1; k++) f.box(s * (HW / 2 + 0.02), 3, hz + k * 5, 0.12, 2.4, 0.5, '#2a1830', { mat: 'glow' });
    }
    // broken arch over the opening
    f.box(-1.5, HH - 1.6, front - wt / 2, 7, 1.6, wt, STONE);
    f.solid(0, front - wt / 2, 9, wt, HH + 6, { bottom: HH - 1.6 });
    // roof: dark steep gable with ridge spikes (ridge along z)
    f.gableRoof(0, HH, hz, HW, HD, 6, '#3a2c44', { overhang: 0.8, wallColor: STONE });
    for (let k = 0; k < 7; k++) f.cone(0, HH + 6.2, hz - HD / 2 + 1.5 + k * 2.5, 0.3, 1.8 + (k % 2) * 1.2, '#1a1a1a', { seg: 5 });
    // giant horns on the gable
    for (const s of [-1, 1]) f.cone(s * 2.2, HH + 3.2, front + 0.5, 0.6, 4.5, BONE, { seg: 6, rz: -s * 0.7, rx: 0.3 });
    skull(f, 0, HH + 3.5, front + 0.9, 3.2, 0);
    // interior: black carpet, pillars, braziers, dais & throne
    f.box(0, 0.3, hz + 2, 2.6, 0.04, HD - 5, '#3a1050', { ao: 0 });
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const cz = hz + 3 - k * 7;
      f.box(s * 5.5, 0.3, cz, 1.1, HH - 0.3, 1.1, STONE2);
      f.post(s * 5.5, cz, 0.7);
      // braziers
      f.cyl(s * 3.5, 0.3, cz, 0.35, 0.2, 1.1, '#222', { seg: 6 });
      f.cone(s * 3.5, 1.4, cz, 0.4, 0.9, '#b45cff', { mat: 'fire', seg: 6 });
      const p = f.w(s * 3.5, cz); addGlow(p.x, y0 + 2.1, p.z, 5, '#a050ff');
      f.post(s * 3.5, cz, 0.4, 1.4);
    }
    const dz = back + 3.5;
    for (let k = 0; k < 3; k++) {
      const w = 9 - k * 1.6, d = 5 - k;
      f.box(0, 0.3, dz - k * 0.5, w, 0.3 * (k + 1), d, k === 2 ? '#2a1830' : '#5a5560', { ao: 0.05 });
      f.floor(0, dz - k * 0.5, w, d, 0.3 + 0.3 * (k + 1));
    }
    // spiky throne (bigger: the villain is 1.28x scale)
    const ty = 1.2, tz = back + 2.4;
    f.box(0, ty, tz, 2.4, 0.7, 1.9, BLACK);
    f.box(0, ty + 0.7, tz + 0.1, 1.9, 0.16, 1.5, '#5b1f7a');
    f.box(0, ty, tz - 0.9, 2.4, 4.4, 0.35, BLACK);
    f.box(0, ty + 0.8, tz - 0.7, 1.6, 2.8, 0.06, '#5b1f7a');
    for (const s of [-1, 1]) {
      f.box(s * 1.15, ty + 0.7, tz, 0.25, 0.8, 1.9, BLACK);
      f.cone(s * 1.15, ty + 1.5, tz + 0.8, 0.12, 0.7, BONE, { seg: 4 });
      skull(f, s * 1.15, ty + 1.72, tz + 0.15, 0.9, 0);
    }
    for (let k = -3; k <= 3; k++) f.cone(k * 0.36, ty + 4.3, tz - 0.9, 0.14, 1.6 - Math.abs(k) * 0.3, k % 2 ? BONE : '#1a1a1a', { seg: 4, rz: -k * 0.12 });
    for (let k = 0; k < 4; k++) skull(f, -0.9 + k * 0.6, ty + 0.25, tz + 1.3, 0.8, 0);
    f.post(0, tz - 0.2, 0.85, ty + 0.85);
    banner(f, 0, HH - 0.4, back + wt + 0.06, 3.6, 5.6, PURPLE, BLACK);
    for (const s of [-1, 1]) banner(f, s * 5, HH - 0.4, back + wt + 0.06, 2, 4.6, BLACK, PURPLE, { emblem: false });
    const L = new THREE.PointLight(0xb070ff, 26, 24, 1.6);
    const lp = f.w(0, hz); L.position.set(lp.x, y0 + 5, lp.z); game.scene.add(L);
    game.places.set('fort:throne', { ...f.place(0, tz + 1.1, 0), y: +(y0 + ty).toFixed(2), name: 'Трон Злого' });
    posts.push(f.place(-3, front + 2, 0), f.place(3, front + 2, 0));
    f.exclude(0, hz, 16);
  }

  // ---- yard: campfires, tents, cages, black market ----
  campfire(f, 0, 22, { r: 1.2, flame: '#ff7a2a', size: 9 });
  campfire(f, -24, 6, {});
  campfire(f, 26, 0, {});
  // log benches around the main fire
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.4;
    f.cyl(Math.cos(a) * 3.3, 0.25, 22 + Math.sin(a) * 3.3, 0.25, 0.25, 2.2, '#3a2616', { seg: 6, center: true, rz: Math.PI / 2, ry: -a + Math.PI / 2 });
  }
  // recruitment board
  {
    const r = f.sub(-7, 0, 26, 0.5);
    r.box(-1.1, 0, 0, 0.18, 2.6, 0.18, WOOD); r.box(1.1, 0, 0, 0.18, 2.6, 0.18, WOOD);
    r.sign(0, 2.0, 0, 'ВЕРБОВКА\nв войско Злого', 2.6, 1.0, { style: 'dark' });
    r.post(0, 0, 0.6, 2.6);
    game.places.set('fort:recruit', { ...r.place(0, 2, 0), name: 'Вербовка' });
  }
  // tents: A-frame cloth
  const tents = [[-34, -4, 1.2], [-36, 18, 1.4], [-24, 30, 0.6], [34, -6, -1.3], [36, 16, -1.5], [24, 30, -0.5], [-38, -18, 1.6], [36, -26, -1.6]];
  for (const [tx, tz, ry] of tents) {
    const t = f.sub(tx, f.ground(tx, tz) - y0, tz, ry);
    const col = rng() < 0.5 ? '#3a2438' : '#2a2a30';
    t.gableRoof(0, 0, 0, 3.2, 4.2, 2.3, col, { overhang: 0.1, thick: 0.06, gable: false, mat: 'cloth' });
    t.prism(0, 0, -2.1, 3.2, 2.3, 0.04, col, { mat: 'cloth' });
    t.prism(0, 0, 2.1, 1.0, 1.0, 0.04, '#120c14', { mat: 'cloth' });
    t.cyl(0, 0, 2.2, 0.05, 0.05, 2.6, WOOD, { seg: 4 });
    t.solid(0, 0, 3.0, 4.2, 2.3);
  }
  // cages
  for (const [cx, cz] of [[-15, -6], [-15, -12], [15, -9]]) {
    const c = f.sub(cx, 0, cz, rr(-0.3, 0.3));
    c.box(0, 0, 0, 2.6, 0.2, 2.6, '#2a2a2a');
    c.box(0, 2.6, 0, 2.7, 0.18, 2.7, '#2a2a2a');
    for (let k = 0; k < 8; k++) {
      const t = -1.2 + (k / 7) * 2.4;
      for (const [x, z] of [[t, -1.25], [t, 1.25], [-1.25, t], [1.25, t]]) c.cyl(x, 0.2, z, 0.04, 0.04, 2.4, '#3a3a3a', { seg: 4 });
    }
    c.solid(0, 0, 2.6, 2.6, 2.8);
    skull(c, 0.4, 0.38, 0.3, 1, 0.5);
    c.cyl(-0.5, 0.2, -0.4, 0.25, 0.3, 0.3, '#5a4632', { seg: 6 });
  }
  // black market stall in the east corner
  {
    const m = f.sub(30, 0, 22, -Math.PI / 2 - 0.4);
    m.box(0, 0, 0, 3.6, 1.0, 1.0, '#2a1e14');
    m.box(0, 1.0, 0, 3.8, 0.1, 1.2, '#3a2a1c');
    for (const s of [-1, 1]) { m.box(s * 1.8, 0, -0.6, 0.14, 2.8, 0.14, '#2a1e14'); m.box(s * 1.8, 0, 0.7, 0.14, 2.4, 0.14, '#2a1e14'); }
    m.box(0, 2.55, 0.05, 4, 0.06, 1.9, '#3a1050', { center: true, rx: 0.2, mat: 'cloth' });
    for (let k = 0; k < 5; k++) m.box(-1.4 + k * 0.7, 1.1, 0, 0.4, 0.3, 0.4, ['#6a2a8a', '#2a2a2a', '#8a7a3a'][k % 3]);
    m.cyl(1.4, 1.1, 0.1, 0.12, 0.12, 0.4, '#3a8a4a', { seg: 6 });
    m.box(-2.6, 0, -0.6, 1, 1, 1, '#3a2a1c'); m.box(-2.6, 1, -0.6, 0.8, 0.8, 0.8, '#3a2a1c', { ry: 0.4 });
    m.sign(0, 3.1, 0.6, 'ЧЁРНЫЙ РЫНОК', 2.6, 0.55, { style: 'dark' });
    lantern(m, 2.4, 0.6, 2.4, { light: '#c690ff', glow: '#b070ff' });
    m.solid(0, 0, 3.6, 1.0, 1.1);
    game.places.set('shop:fort', { ...m.place(0, -0.9, 0), name: 'Чёрный рынок' });
  }
  // skull pikes & bone piles inside
  for (const [x, z] of [[-10, 14], [10, 14], [-18, 34], [18, 34], [-6, -8], [6, -8]]) skullPike(f, x, z, 2.4);
  for (const [x, z] of [[-20, -30], [22, -34]]) for (let k = 0; k < 6; k++) skull(f, x + rr(-0.8, 0.8), 0.15 + (k > 3 ? 0.3 : 0), z + rr(-0.8, 0.8), 1, rr(-1, 1));
  // weapon racks & crates near tents
  for (const [x, z] of [[-30, 26], [30, -16]]) {
    const r = f.sub(x, 0, z, rr(0, 3));
    for (let k = 0; k < 4; k++) r.box(k * 0.95, 0, 0, 0.9, 0.9, 0.9, '#3a2a1c', { ry: rr(-0.2, 0.2) });
    r.cyl(-1, 0, 0, 0.4, 0.4, 1.0, '#2e2216', { seg: 8 });
    r.solid(1.4, 0, 4.2, 1.2, 1);
  }
  flagPole(f, 0, 6, 11, PURPLE, BLACK);
  game.places.set('fort:yard', { ...f.place(0, 10, 0), name: 'Двор форта' });

  // ---- approach from LOC.fortGate: muddy path + skull pikes ----
  const G = f.w(0, 56);
  drape([[LOC.fortGate.x, LOC.fortGate.z], [G.x, G.z]], 5, '#5e5040', { off: 0.1 });
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    const z = LOC.fortGate.z + (G.z - LOC.fortGate.z) * t, x = LOC.fortGate.x + (G.x - LOC.fortGate.x) * t;
    for (const s of [-1, 1]) skullPike(new Frame(0, 0, 0, 0), x + s * 4, z, 2.8);
  }
  game.places.set('fort:posts', posts);
}
