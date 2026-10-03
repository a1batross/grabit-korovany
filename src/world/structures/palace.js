// ZONE 2 — the Emperor's palace on the hill: curtain wall with towers, gatehouse (west), keep with an
// open-front throne hall, barracks, quartermaster, courtyard, wall-walks with stairs.
import * as THREE from 'three';
import { game } from '../../core/game.js';
import { heightAt } from '../terrain.js';
import { LOC } from '../zones.js';
import { Frame, wallSeg, parapet, stairs, torch, banner, flagPole, lantern, drape, exclude, rr, rng, debug } from './kit.js';

const RED = '#a3262a', GOLD = '#d9b13b', STONE = '#cfc6b2', STONE2 = '#b9ae98', ROOF = '#9e2a24', ROOF2 = '#7f1f1c';
const WOOD = '#6b4a2c', DARK = '#3a2a1c', WIN = '#2c3442';

export function buildPalace() {
  const C = LOC.palace;
  const y0 = heightAt(C.x, C.z);
  // local +z faces WEST (toward the gate / road), local +x = world south
  const f = new Frame(C.x, y0, C.z, -Math.PI / 2);
  const H = 46, WH = 7.5, T = 3;
  exclude(C.x, C.z, 72);

  const posts = [];
  const wallOpt = { h: WH, t: T, color: STONE, merlon: STONE, plinth: '#a49a86', cornice: '#e0d8c4' };
  // ---- curtain walls (clockwise seen from above, outer side on the right) ----
  // front wall (local z=+H) is split by the gatehouse (x in [-11, 11])
  wallSeg(f, -H + 4.5, H, -11, H, { ...wallOpt, out: -1 });
  wallSeg(f, 11, H, H - 4.5, H, { ...wallOpt, out: -1 });
  wallSeg(f, H, H - 4.5, H, -H + 4.5, { ...wallOpt, out: -1 });
  wallSeg(f, H - 4.5, -H, -H + 4.5, -H, { ...wallOpt, out: -1 });
  wallSeg(f, -H, -H + 4.5, -H, H - 4.5, { ...wallOpt, out: -1 });
  for (const [x, z, ly] of [[-28, H, 0], [28, H, 0], [H, 0, Math.PI / 2], [0, -H, Math.PI], [-H, 0, -Math.PI / 2], [H, -24, Math.PI / 2], [-H, -24, -Math.PI / 2]]) {
    posts.push(f.place(x - Math.sin(ly) * 0.2, z - Math.cos(ly) * 0.2, ly, { y: +(y0 + WH).toFixed(2) }));
  }

  // ---- corner towers ----
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const tx = sx * H, tz = sz * H, S = 9;
    f.box(tx, -3, tz, S, WH + 3, S, STONE2, { ao: 0.3 });
    f.box(tx, -3, tz, S + 0.6, 4, S + 0.6, '#a49a86', { ao: 0.2 });
    f.box(tx, WH - 0.5, tz, S + 0.5, 0.5, S + 0.5, '#e0d8c4', { ao: 0 });
    f.box(tx, WH - 0.02, tz, S - 0.2, 0.06, S - 0.2, '#9a8c72', { ao: 0 });
    f.floor(tx, tz, S, S, WH);
    // parapet on the two outer sides
    const e = S / 2 - 0.3;
    parapet(f, tx - e, tz + sz * e, tx + e, tz + sz * e, WH, { color: STONE2 });
    parapet(f, tx + sx * e, tz - e, tx + sx * e, tz + e, WH, { color: STONE2 });
    // inner sides: short parapets leaving an opening for the wall-walk
    parapet(f, tx - sx * e, tz - sz * e, tx - sx * e, tz - sz * 1.2, WH, { color: STONE2 });
    parapet(f, tx - sx * e, tz - sz * e, tx - sx * 1.2, tz - sz * e, WH, { color: STONE2 });
    // roof pavilion: 4 posts + red pyramid roof + gold spire
    for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      f.box(tx + px * (S / 2 - 0.9), WH, tz + pz * (S / 2 - 0.9), 0.5, 3.4, 0.5, WOOD);
      f.post(tx + px * (S / 2 - 0.9), tz + pz * (S / 2 - 0.9), 0.3);
    }
    f.hipRoof(tx, WH + 3.4, tz, S - 0.6, S - 0.6, 4.6, ROOF, { overhang: 0.9 });
    f.cyl(tx, WH + 7.6, tz, 0.08, 0.12, 2.2, GOLD, { seg: 5 });
    f.sphere(tx, WH + 9.8, tz, 0.3, GOLD);
    // banner on the outer face
    banner(f, tx + sx * (S / 2 + 0.1), WH - 0.8, tz, 2, 4, RED, GOLD, { ry: sx * Math.PI / 2 });
    torch(f, tx - sx * (S / 2 + 0.15), WH - 3, tz - sz * 2.2);
    posts.push(f.place(tx + sx * 2, tz + sz * 2, Math.atan2(sx, sz), { y: +(y0 + WH).toFixed(2) }));
    f.exclude(tx, tz, 8);
  }

  // ---- gatehouse (front, local z=+H): passage 7 wide, 5.5 high ----
  {
    const gz = H, D = 9, GW = 3.5, PH = 5.5;
    for (const s of [-1, 1]) {
      const cx = s * (GW + 3.75);
      f.box(cx, -3, gz, 7.5, WH + 3, D, STONE2, { ao: 0.3 });
      f.box(cx, -3, gz, 7.9, 4, D + 0.4, '#a49a86', { ao: 0.2 });
      f.solid(cx, gz, 7.5, D, WH, { walkable: true });
      // round turrets at the front corners
      f.cyl(s * 10.5, -3, gz + D / 2, 2.2, 2.4, WH + 7, STONE, { seg: 10, ao: 0.3 });
      f.cyl(s * 10.5, WH + 4, gz + D / 2, 2.6, 2.4, 0.6, '#e0d8c4', { seg: 10, ao: 0 });
      f.cone(s * 10.5, WH + 4.6, gz + D / 2, 2.9, 5, ROOF, { seg: 10 });
      f.cyl(s * 10.5, WH + 9.4, gz + D / 2, 0.06, 0.1, 1.8, GOLD, { seg: 5 });
      for (let k = 0; k < 3; k++) f.box(s * 10.5 + Math.cos(k * 2.1 + 0.5) * 2.25, WH + 1.5, gz + D / 2 + Math.sin(k * 2.1 + 0.5) * 2.25, 0.4, 1.1, 0.4, WIN, { mat: 'glow', ry: -(k * 2.1 + 0.5) });
      f.post(s * 10.5, gz + D / 2, 2.4);
      // big banners either side of the gate
      banner(f, s * 6.2, WH - 0.6, gz + D / 2 + 0.1, 2.6, 5.2, RED, GOLD);
      torch(f, s * (GW + 0.6), 2.4, gz + D / 2 + 0.3);
      torch(f, s * (GW + 0.6), 2.4, gz - D / 2 - 0.3);
      // guards outside the gate
      posts.push(f.place(s * 5, gz + D / 2 + 3, 0));
      // gate door leaves swung open against the passage walls (inner end)
      f.box(s * (GW - 0.25), 0, gz - D / 2 + 2.1, 0.3, PH - 0.3, 3.4, '#5a3a20', { ao: 0.1 });
      for (let k = 0; k < 3; k++) f.box(s * (GW - 0.42), 0.8 + k * 1.7, gz - D / 2 + 2.1, 0.06, 0.18, 3.4, '#2a2a2a');
    }
    // lintel block over the passage (walk on top, pass below)
    f.box(0, PH, gz, GW * 2, WH - PH, D, STONE2, { ao: 0.1 });
    f.box(0, PH - 0.4, gz + D / 2, GW * 2 + 0.6, 0.6, 0.6, '#e0d8c4');
    f.solid(0, gz, GW * 2, D, WH, { walkable: true, bottom: PH });
    // raised portcullis peeking out of the arch
    for (let k = -3; k <= 3; k++) f.box(k * 0.9, PH - 0.9, gz + 2.5, 0.12, 0.9, 0.12, '#2b2b2b');
    f.box(0, PH - 0.95, gz + 2.5, GW * 2, 0.12, 0.14, '#2b2b2b');
    // passage paving
    f.box(0, -0.2, gz, GW * 2, 0.26, D + 2, '#8d8577', { ao: 0 });
    // gatehouse top: floor + parapets front & back
    f.box(0, WH - 0.02, gz, 22, 0.06, D - 0.2, '#9a8c72', { ao: 0 });
    parapet(f, -11, gz + D / 2 - 0.3, 11, gz + D / 2 - 0.3, WH, { color: STONE2 });
    parapet(f, -8, gz - D / 2 + 0.3, 8, gz - D / 2 + 0.3, WH, { color: STONE2 });
    // the crest over the gate
    f.box(0, PH + 0.2, gz + D / 2 + 0.05, 2.4, 1.6, 0.2, GOLD, { ao: 0 });
    f.box(0, PH + 0.45, gz + D / 2 + 0.17, 1.4, 1.1, 0.1, RED, { ao: 0 });
    f.sign(0, WH + 2.4, gz + D / 2 - 0.3, 'ДВОРЕЦ ИМПЕРАТОРА', 6, 1.1, { style: 'red', back: false });
    f.box(-2.6, WH, gz + D / 2 - 0.3, 0.15, 2.4, 0.15, WOOD); f.box(2.6, WH, gz + D / 2 - 0.3, 0.15, 2.4, 0.15, WOOD);
    posts.push(f.place(-4, gz + 2, 0, { y: +(y0 + WH).toFixed(2) }), f.place(4, gz + 2, 0, { y: +(y0 + WH).toFixed(2) }));
    f.exclude(0, gz + 10, 10);
  }

  // ---- stairs up to the wall-walks (inner faces) ----
  stairs(f, -26, H - T / 2 - 1.2, Math.PI / 2, 2.4, 0, WH, '#b3a993');   // front-left, rises toward the gatehouse
  // test path: courtyard -> up the front-left stair -> onto the wall-walk -> along it
  debug.paths.palaceWall = [f.w(-30, H - 2.7), f.w(-26.5, H - 2.7), f.w(-13, H - 2.7), f.w(-13, H), f.w(-20, H), f.w(-20, H + 3)];
  stairs(f, 26, H - T / 2 - 1.2, -Math.PI / 2, 2.4, 0, WH, '#b3a993');   // front-right
  stairs(f, -H + T / 2 + 1.2, -6, Math.PI, 2.4, 0, WH, '#b3a993');       // left (north) wall, near the barracks
  stairs(f, 14, -H + T / 2 + 1.2, Math.PI / 2, 2.4, 0, WH, '#b3a993');   // back wall

  // ---- courtyard paving ----
  const paveTo = (a, b, w, c) => { const A = f.w(a[0], a[1]), B = f.w(b[0], b[1]); drape([[A.x, A.z], [B.x, B.z]], w, c, { flatY: y0, off: 0.05 }); };
  paveTo([0, H - 4], [0, -6], 7, '#a39a88');
  paveTo([-30, 12], [30, 12], 4.5, '#a39a88');
  // central plaza
  f.box(0, -0.3, 12, 16, 0.38, 14, '#b6ad9a', { ao: 0 });
  for (let i = -3; i <= 3; i++) f.box(i * 2.2, 0.06, 12, 0.06, 0.03, 14, '#8a8272', { ao: 0 });
  // fountain
  f.cyl(0, 0, 12, 3.2, 3.4, 0.8, '#d9d0bc', { seg: 12 });
  f.cyl(0, 0.75, 12, 2.8, 2.8, 0.06, '#4f86b5', { seg: 12, ao: 0 });
  f.cyl(0, 0, 12, 0.5, 0.7, 2.6, '#d9d0bc', { seg: 8 });
  f.cyl(0, 2.6, 12, 1.2, 0.4, 0.4, '#d9d0bc', { seg: 10 });
  f.sphere(0, 3.2, 12, 0.35, GOLD);
  f.post(0, 12, 3.4, 0.8);

  // ---- KEEP with open-front throne hall ----
  {
    const kz = -18, KW = 26, KD = 20, GH = 8.5, UH = 7;
    const front = kz + KD / 2, back = kz - KD / 2;
    const wt = 1.2;
    // floor
    f.box(0, -0.6, kz, KW, 0.9, KD, '#c9bfa8', { ao: 0 });
    f.floor(0, kz, KW, KD, 0.3);
    // entrance steps (3 steps up to 0.3 handled by step-up; just visual)
    f.box(0, -0.4, front + 1, 12, 0.55, 2, '#b8af9c', { ao: 0 });
    // side & back walls
    f.box(-KW / 2 + wt / 2, -1, kz, wt, GH + 1, KD, STONE);
    f.box(KW / 2 - wt / 2, -1, kz, wt, GH + 1, KD, STONE);
    f.box(0, -1, back + wt / 2, KW, GH + 1, wt, STONE);
    f.solid(-KW / 2 + wt / 2, kz, wt, KD, GH + UH);
    f.solid(KW / 2 - wt / 2, kz, wt, KD, GH + UH);
    f.solid(0, back + wt / 2, KW, wt, GH + UH);
    // front wall with a big 10-wide opening
    const OW = 10, OH = 6.5;
    for (const s of [-1, 1]) {
      f.box(s * (OW / 2 + (KW / 2 - OW / 2) / 2), -1, front - wt / 2, KW / 2 - OW / 2, GH + 1, wt, STONE);
      f.solid(s * (OW / 2 + (KW / 2 - OW / 2) / 2), front - wt / 2, KW / 2 - OW / 2, wt, GH + UH);
      // pilasters
      f.box(s * (OW / 2 + 0.4), -0.2, front + 0.1, 1.2, GH + 0.2, 0.8, '#e0d8c4');
      banner(f, s * 8.5, GH - 0.8, front + 0.12, 2.6, 5, RED, GOLD);
      torch(f, s * (OW / 2 + 1.3), 3, front + 0.25);
    }
    f.box(0, OH, front - wt / 2, OW, GH - OH, wt, STONE);
    f.box(0, OH - 0.5, front + 0.05, OW + 1.6, 0.7, 0.9, '#e0d8c4');
    f.solid(0, front - wt / 2, OW, wt, GH + UH, { bottom: OH });
    // ground floor cornice
    f.box(0, GH, kz, KW + 0.8, 0.6, KD + 0.8, '#e0d8c4', { ao: 0 });
    // upper storey (slightly inset) with windows
    f.box(0, GH + 0.6, kz, KW - 1, UH - 0.6, KD - 1, '#e8e0cc', { ao: 0.15 });
    for (let i = -2; i <= 2; i++) {
      for (const s of [-1, 1]) {
        f.box(i * 4.6, GH + 2.2, kz + s * (KD / 2 - 0.45), 1.3, 2.4, 0.2, WIN, { mat: 'glow' });
        f.box(i * 4.6, GH + 4.6, kz + s * (KD / 2 - 0.45), 1.7, 0.35, 0.3, GOLD);
      }
    }
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) f.box(s * (KW / 2 - 0.45), GH + 2.2, kz + i * 5.5, 0.2, 2.4, 1.3, WIN, { mat: 'glow' });
    // ground floor side windows (tall, narrow)
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) f.box(s * (KW / 2 + 0.02), 2.6, kz + i * 5.5, 0.12, 3, 1.1, WIN, { mat: 'glow' });
    // roof
    f.hipRoof(0, GH + UH, kz, KW - 1, KD - 1, 7, ROOF, { overhang: 1.2 });
    // front balcony banners on the roof edge
    // central tall tower at the back
    const tz = back - 4.6;
    f.box(0, -1, tz, 9, GH + UH + 9, 9, STONE2, { ao: 0.3 });
    f.solid(0, tz, 9, 9, GH + UH + 9);
    f.box(0, GH + UH + 8, tz, 10, 0.6, 10, '#e0d8c4');
    for (const s of [-1, 1]) {
      f.box(s * 4.52, GH + UH + 3, tz, 0.12, 3, 1.4, WIN, { mat: 'glow' });
      f.box(0, GH + UH + 3, tz + s * 4.52, 1.4, 3, 0.12, WIN, { mat: 'glow' });
    }
    f.hipRoof(0, GH + UH + 8.6, tz, 9, 9, 9, ROOF2, { overhang: 0.8 });
    f.cyl(0, GH + UH + 17, tz, 0.1, 0.18, 3.5, GOLD, { seg: 6 });
    f.sphere(0, GH + UH + 20.6, tz, 0.5, GOLD, { detail: 1 });
    flagPole(f, 0, tz, 3.6, RED, GOLD, { y: GH + UH + 21 });
    // front corner turrets
    for (const s of [-1, 1]) {
      f.cyl(s * (KW / 2), -1, front, 2.1, 2.3, GH + UH + 4, '#ddd4c0', { seg: 10 });
      f.cone(s * (KW / 2), GH + UH + 3, front, 2.7, 6, ROOF, { seg: 10 });
      f.sphere(s * (KW / 2), GH + UH + 9.1, front, 0.3, GOLD);
      f.box(s * (KW / 2) + s * 1.6, GH + 4, front + 1.2, 0.2, 2.2, 0.9, WIN, { mat: 'glow', ry: s * 0.8 });
      f.post(s * (KW / 2), front, 2.3);
    }
    // ---- interior ----
    // red carpet from entrance to dais
    f.box(0, 0.3, kz + 1.5, 3, 0.04, KD - 4, '#8e1b20', { ao: 0 });
    f.box(0, 0.31, kz + 1.5, 2.2, 0.04, KD - 4, '#b52a2e', { ao: 0 });
    // columns
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const cz = front - 4 - i * 5;
      f.cyl(s * 6, 0.3, cz, 0.55, 0.6, GH - 0.3, '#ece4d0', { seg: 8 });
      f.box(s * 6, GH - 0.8, cz, 1.6, 0.5, 1.6, GOLD);
      f.box(s * 6, 0.3, cz, 1.5, 0.4, 1.5, '#cfc6b2');
      f.post(s * 6, cz, 0.6);
      if (i === 1) torch(f, s * 6 - s * 0.7, 2.6, cz);
    }
    // dais with 3 steps
    const dz = back + 3.5;
    for (let k = 0; k < 3; k++) {
      const w = 10 - k * 1.6, d = 5 - k * 1.0;
      f.box(0, 0.3, dz - k * 0.5, w, 0.3 * (k + 1), d, k === 2 ? '#8e1b20' : '#d6ccb4', { ao: 0.05 });
      f.floor(0, dz - k * 0.5, w, d, 0.3 + 0.3 * (k + 1));
    }
    // the throne: gold frame, red cushion, high back with crown
    const ty = 1.2, tzz = back + 2.6;
    f.box(0, ty, tzz, 2.0, 0.6, 1.6, GOLD);
    f.box(0, ty + 0.6, tzz + 0.1, 1.6, 0.18, 1.2, '#b52a2e');
    f.box(0, ty, tzz - 0.75, 2.0, 3.4, 0.3, GOLD);
    f.box(0, ty + 0.7, tzz - 0.58, 1.4, 2.4, 0.06, '#b52a2e');
    for (const s of [-1, 1]) {
      f.box(s * 0.95, ty + 0.6, tzz, 0.2, 0.7, 1.6, GOLD);
      f.sphere(s * 0.95, ty + 3.5, tzz - 0.75, 0.2, GOLD);
    }
    for (let k = -2; k <= 2; k++) f.cone(k * 0.35, ty + 3.4, tzz - 0.75, 0.12, 0.6 - Math.abs(k) * 0.12, GOLD, { seg: 4 });
    f.post(0, tzz - 0.2, 0.75, ty + 0.75);
    // big banners behind the throne
    for (const s of [-1, 1]) banner(f, s * 4, GH - 0.5, back + wt + 0.06, 2.4, 5.5, RED, GOLD);
    banner(f, 0, GH - 0.3, back + wt + 0.06, 3.2, 3.2, '#5a1a6a', GOLD, { emblem: true });
    // warm light inside the hall
    const L = new THREE.PointLight(0xffc27a, 30, 26, 1.6);
    const lp = f.w(0, kz); L.position.set(lp.x, y0 + 5.5, lp.z); game.scene.add(L);
    // places
    game.places.set('palace:throne', { ...f.place(0, tzz + 1.0, 0), y: +(y0 + ty).toFixed(2), name: 'Трон императора' });
    posts.push(f.place(-3.5, dz + 3.5, 0), f.place(3.5, dz + 3.5, 0));
    posts.push(f.place(-6.5, front + 2.5, 0), f.place(6.5, front + 2.5, 0));
    f.exclude(0, kz, 20);
  }

  // ---- BARRACKS along the left (north) wall ----
  {
    const bx = -36, bz = 10, BW = 9, BD = 26, BH = 4.2;
    const b = f.sub(bx, 0, bz, Math.PI / 2); // door side faces +x (courtyard) -> local +z of sub-frame
    b.box(0, -1, 0, BD, BH + 1, BW, '#d8cdb5');
    b.box(0, -1, 0, BD + 0.3, 1.6, BW + 0.3, '#8f8878');
    for (let i = -3; i <= 3; i++) b.box(i * 3.9, -0.5, BW / 2 + 0.02, 0.35, BH + 0.5, 0.15, WOOD);
    b.gableRoof(0, BH, 0, BD, BW, 3, ROOF2, { overhang: 0.7, wallColor: '#d8cdb5', alongX: true });
    b.solid(0, 0, BD, BW, BH + 3);
    for (const s of [-1, 1]) b.box(s * 7, 0, BW / 2 + 0.05, 1.6, 2.5, 0.12, DARK);
    for (let i = -2; i <= 2; i++) if (i) b.box(i * 5.2 + (i > 0 ? 1 : -1), 1.4, BW / 2 + 0.05, 1.1, 1.0, 0.1, WIN, { mat: 'glow' });
    b.sign(0, BH - 0.7, BW / 2 + 0.12, 'КАЗАРМА', 3, 0.7, { style: 'red', back: false });
    // weapon racks + training dummies in front
    for (let i = 0; i < 2; i++) {
      const rx = -9 + i * 18;
      b.box(rx, 0, BW / 2 + 1.6, 2.4, 0.15, 0.3, WOOD);
      b.box(rx, 1.4, BW / 2 + 1.6, 2.4, 0.15, 0.3, WOOD);
      for (let k = 0; k < 5; k++) b.cyl(rx - 1 + k * 0.5, 0, BW / 2 + 1.5, 0.03, 0.03, 2.1, '#8a8a8a', { seg: 4, rx: -0.12 });
    }
    torch(b, -3.2, 2, BW / 2 + 0.2); torch(b, 3.2, 2, BW / 2 + 0.2);
    game.places.set('palace:barracks', { ...b.place(0, BW / 2 + 3, 0), name: 'Казарма' });
    b.exclude(0, 0, 15);
  }

  // training ground (front-left)
  {
    for (let i = 0; i < 4; i++) {
      const dx = -32 + i * 4.5, dz = 30;
      f.cyl(dx, 0, dz, 0.12, 0.12, 1.9, WOOD, { seg: 5 });
      f.box(dx, 1.2, dz, 1.3, 0.14, 0.14, WOOD);
      f.cyl(dx, 0.9, dz, 0.32, 0.3, 0.9, '#c9b26a', { seg: 7 });
      f.sphere(dx, 1.95, dz, 0.26, '#c9b26a');
      f.post(dx, dz, 0.35);
    }
    // archery butts
    for (let i = 0; i < 2; i++) {
      const dx = -34 + i * 6, dz = 38;
      f.cyl(dx, 1.3, dz, 0.9, 0.9, 0.3, '#d8c890', { seg: 12, rx: Math.PI / 2, center: true });
      f.cyl(dx, 1.3, dz + 0.17, 0.55, 0.55, 0.04, RED, { seg: 12, rx: Math.PI / 2, center: true });
      f.cyl(dx, 1.3, dz + 0.2, 0.2, 0.2, 0.04, GOLD, { seg: 10, rx: Math.PI / 2, center: true });
      f.box(dx, 0, dz - 0.4, 0.15, 1.5, 0.15, WOOD, { rx: 0.25 });
    }
  }

  // ---- QUARTERMASTER storehouse on the right (south) side ----
  {
    const q = f.sub(36, 0, 6, -Math.PI / 2); // faces -x (courtyard)
    const QW = 14, QD = 8, QH = 4;
    q.box(0, -1, 0, QW, QH + 1, QD, '#d8cdb5');
    q.box(0, -1, 0, QW + 0.3, 1.5, QD + 0.3, '#8f8878');
    q.gableRoof(0, QH, 0, QW, QD, 2.6, ROOF2, { overhang: 0.6, wallColor: '#d8cdb5', alongX: true });
    q.solid(0, 0, QW, QD, QH + 2.6);
    q.box(-3.5, 0, QD / 2 + 0.05, 2.6, 2.8, 0.12, DARK);
    q.box(2.5, 1.4, QD / 2 + 0.05, 1.2, 1.0, 0.1, WIN, { mat: 'glow' });
    // counter with awning
    q.box(2.5, 0, QD / 2 + 1.6, 4.4, 1.05, 0.8, WOOD);
    q.box(2.5, 1.05, QD / 2 + 1.6, 4.6, 0.1, 1.0, '#8a6a44');
    for (const s of [-1, 1]) q.box(2.5 + s * 2.3, 0, QD / 2 + 2.3, 0.15, 2.7, 0.15, WOOD);
    q.box(2.5, 2.6, QD / 2 + 1.3, 5, 0.08, 2.6, RED, { mat: 'cloth', rx: 0.25, center: true });
    q.solid(2.5, QD / 2 + 1.6, 4.4, 0.8, 1.1);
    // crates & barrels
    for (let i = 0; i < 4; i++) q.box(-5.6 + i * 0.95, 0, QD / 2 + 0.9, 0.9, 0.9, 0.9, '#8a6a44', { ry: rr(-0.2, 0.2) });
    for (let i = 0; i < 3; i++) q.cyl(-6 + i * 0.9, 0, QD / 2 + 2.1, 0.4, 0.4, 1.0, '#6b4a2c', { seg: 8 });
    q.sign(2.5, 3.1, QD / 2 + 0.2, 'КАПТЕНАРМУС', 3.2, 0.7, { style: 'red', back: false });
    lantern(q, 5.4, QD / 2 + 2.5, 2.6);
    game.places.set('shop:palace', { ...q.place(2.5, QD / 2 + 1.0, 0), name: 'Каптенармус дворца' });
    q.exclude(0, 0, 10);
  }

  // stable (back-right)
  {
    const s = f.sub(32, 0, -32, -Math.PI / 2);
    s.box(0, -1, 0, 12, 4, 6, '#7a5a38');
    s.gableRoof(0, 3, 0, 12, 6, 2, '#6a4a2a', { overhang: 0.5, wallColor: '#7a5a38', alongX: true });
    s.solid(0, 0, 12, 6, 5);
    for (let i = -2; i <= 2; i++) s.box(i * 2.3, 0, 3.05, 1.8, 1.4, 0.1, '#4a321c');
    for (let i = 0; i < 3; i++) s.cyl(-4 + i * 4, 0, 4.5, 0.9, 1.1, 1.1, '#d8b65a', { seg: 7 });
  }

  // commander's spot, yard, gardens
  game.places.set('palace:commander', { ...f.place(-8, 6, Math.PI / 2), name: 'Командир' });
  game.places.set('palace:yard', { ...f.place(0, 22, 0), name: 'Двор дворца' });
  game.places.set('palace:gate', { ...f.place(0, H + 8, 0), name: 'Ворота дворца' });
  flagPole(f, -14, 4, 9, RED, GOLD);
  flagPole(f, 14, 4, 9, RED, GOLD);
  // hedges & small trees in the back garden
  for (let i = 0; i < 8; i++) {
    const gx = -20 + i * 5.7, gz = -41;
    f.box(gx, 0, gz, 3.6, 1.1, 1.2, '#3f6e2f', { ao: 0.25 });
  }
  for (const [gx, gz] of [[-20, -36], [20, -36], [-16, 26], [16, 26], [-28, 0], [26, 24]]) {
    f.cyl(gx, 0, gz, 0.14, 0.18, 1.6, '#5a3d24', { seg: 5 });
    f.sphere(gx, 2.2, gz, 1.2, '#4c8a3a', { detail: 0 });
    f.post(gx, gz, 0.25);
  }
  // lanterns along the paved way
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) lantern(f, s * 5, H - 10 - i * 9, 3, { pole: '#2a2a2a' });

  // approach road from the old gate spot (LOC.palaceGate) up to the gatehouse, plus a ceremonial alley
  const G = f.w(0, H + 5);
  drape([[LOC.palaceGate.x, LOC.palaceGate.z], [(LOC.palaceGate.x + G.x) / 2, (LOC.palaceGate.z + G.z) / 2], [G.x, G.z]], 6, '#a39a88', { off: 0.08 });
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const px = LOC.palaceGate.x + (G.x - LOC.palaceGate.x) * t, pz = LOC.palaceGate.z + (G.z - LOC.palaceGate.z) * t;
    for (const s of [-1, 1]) {
      const g = new Frame(px, heightAt(px, pz + s * 5), pz + s * 5, -Math.PI / 2);
      g.cyl(0, -0.5, 0, 0.12, 0.16, 6, '#3a3030', { seg: 6 });
      g.box(0, 5.6, 0.55, 0.06, 0.06, 1.2, '#3a3030');
      banner(g, 0, 5.6, 1.1, 1.2, 2.8, RED, GOLD, { ry: Math.PI / 2 });
      g.post(0, 0, 0.2);
    }
  }
  game.places.set('palace:posts', posts);
}
