// Roadside architecture: signposts at junctions, milestones, a bridge over the marshy creek, a roadside inn,
// watchtowers, and the caravan waystation "Западная застава" near LOC.westExit.
import { game } from '../../core/game.js';
import { heightAt } from '../terrain.js';
import { LOC, ROADS, distToAnyRoad } from '../zones.js';
import { Frame, torch, banner, flagPole, lantern, campfire, stairs, parapet, exclude, addGlow, rr, rng, rpick } from './kit.js';
import { townHouse } from './town.js';

const WOOD = '#6a4a2c', WOOD2 = '#5a3e24';

// point & direction at distance s along a polyline
function along(road, s) {
  for (let i = 0; i < road.length - 1; i++) {
    const [ax, az] = road[i], [bx, bz] = road[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (s <= L || i === road.length - 2) {
      const t = Math.min(1, s / L);
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / L, dz: (bz - az) / L };
    }
    s -= L;
  }
}
const roadLen = road => road.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - road[i][0], p[1] - road[i][1]), 0);

// Signpost with arrow boards: arms = [[label, targetX, targetZ], ...]
function signpost(x, z, arms) {
  const f = new Frame(x, heightAt(x, z), z, 0);
  f.cyl(0, -0.4, 0, 0.13, 0.16, 4.0, WOOD2, { seg: 6 });
  f.cone(0, 3.6, 0, 0.2, 0.35, WOOD2, { seg: 6 });
  f.post(0, 0, 0.25);
  arms.forEach(([label, tx, tz], i) => {
    const phi = Math.atan2(tx - x, tz - z);
    const g = new Frame(x, f.y + 3.1 - i * 0.62, z, phi - Math.PI / 2);
    g.box(1.15, 0, 0, 2.0, 0.46, 0.08, '#8a6a42', { center: true });
    g.prism(2.15, -0.23, 0, 0.46, 0.3, 0.08, '#8a6a42', { rz: -Math.PI / 2 });
    g.sign(1.1, 0, 0, label, 1.85, 0.4, { board: '#8a6a42' });
  });
  exclude(x, z, 3);
}

function milestone(x, z, text) {
  const f = new Frame(x, heightAt(x, z), z, rr(0, 6));
  f.box(0, -0.4, 0, 0.55, 1.4, 0.35, '#a8a294', { ao: 0.3 });
  f.cyl(0, 1.0, 0, 0.275, 0.275, 0.35, '#a8a294', { center: true, rx: Math.PI / 2, seg: 8 });
  f.box(0, 0.9, 0, 0.6, 0.12, 0.4, '#3a6a9a', { ao: 0 });
  f.signPlane(0, 0.55, 0.18, 0.5, 0.3, signCellCached(text));
  f.signPlane(0, 0.55, -0.18, 0.5, 0.3, signCellCached(text), { ry: Math.PI });
  f.post(0, 0, 0.35, 1.1);
}
import { signCell } from './kit.js';
const signCellCached = t => signCell(t, 'stone');

// Wooden bridge following the road between distances s0..s1 (arched deck)
function bridge(road, s0, s1) {
  const A = along(road, s0), B = along(road, s1);
  const len = Math.hypot(B.x - A.x, B.z - A.z), dx = (B.x - A.x) / len, dz = (B.z - A.z) / len;
  const yaw = Math.atan2(dx, dz);
  const hA = heightAt(A.x, A.z) + 0.15, hB = heightAt(B.x, B.z) + 0.15;
  const f = new Frame(A.x, 0, A.z, yaw);
  const N = Math.ceil(len / 0.9), seg = len / N, W = 5.2;
  const yAt = t => hA + (hB - hA) * t + 1.6 * Math.sin(Math.PI * t);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N, z = t * len, y = yAt(t);
    f.box(0, y - 0.18, z, W + (i % 2) * 0.2, 0.18, seg * 0.92, i % 2 ? '#7a5a38' : '#6e5032', { ao: 0 });
    f.floor(0, z, W, seg + 0.02, y, { bottom: y - 0.8 });
    for (const s of [-1, 1]) f.solid(s * (W / 2 + 0.1), z, 0.25, seg + 0.02, y + 1.1, { bottom: y - 0.3 });
    // stringers under the deck
    for (const s of [-1, 0, 1]) f.box(s * 2.0, y - 0.45, z, 0.3, 0.3, seg + 0.02, WOOD2, { ao: 0 });
    if (i % 5 === 2) {
      for (const s of [-1, 1]) {
        const gy = heightAt(f.w(s * 2.2, z).x, f.w(s * 2.2, z).z);
        f.cyl(s * 2.2, Math.min(gy, -1) - 0.5, z, 0.22, 0.25, y - Math.min(gy, -1) + 0.1, '#4e3620', { seg: 6 });
        f.cyl(s * (W / 2 + 0.1), y, z, 0.1, 0.1, 1.2, WOOD2, { seg: 5 });
      }
      f.box(0, y - 1.0, z, W, 0.2, 0.2, WOOD2, { ao: 0 });
    }
  }
  // railings
  const M = 10;
  for (let i = 0; i < M; i++) {
    const t0 = i / M, t1 = (i + 1) / M, y0 = yAt(t0), y1 = yAt(t1);
    const z0 = t0 * len, z1 = t1 * len;
    const L = Math.hypot(z1 - z0, y1 - y0);
    for (const s of [-1, 1]) f.box(s * (W / 2 + 0.1), (y0 + y1) / 2 + 1.05, (z0 + z1) / 2, 0.12, 0.12, L, '#7a5a38', { center: true, rx: -Math.atan2(y1 - y0, z1 - z0), ao: 0 });
  }
  for (const t of [0, 1]) for (const s of [-1, 1]) lantern(f, s * (W / 2 + 0.5), t * len + (t ? 0.6 : -0.6), 2.4, { y: yAt(t) - 0.15 });
  exclude((A.x + B.x) / 2, (A.z + B.z) / 2, len / 2 + 3);
}

// Watchtower: stone base with a wooden roofed top, straight stair up to the platform
function watchtower(x, z, yaw, style) {
  const f = new Frame(x, heightAt(x, z), z, yaw);
  const H = 6.5, S = 6;
  const stone = style === 'villain' ? '#6a6472' : '#bdb4a2';
  f.box(0, -2, 0, S, H + 2, S, stone, { ao: 0.3 });
  f.box(0, -2, 0, S + 0.5, 2.6, S + 0.5, style === 'villain' ? '#4e4a55' : '#9a927f', { ao: 0.2 });
  f.box(0, H - 0.02, 0, S - 0.2, 0.06, S - 0.2, '#8a7a62', { ao: 0 });
  f.floor(0, 0, S, S, H);
  const e = S / 2 - 0.3;
  parapet(f, -e, -e, e, -e, H, { color: stone });
  parapet(f, e, -e, e, e, H, { color: stone });
  parapet(f, e, e, -e, e, H, { color: stone });
  parapet(f, -e, e, -e, 0.6, H, { color: stone });
  for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) f.box(px * (S / 2 - 0.5), H, pz * (S / 2 - 0.5), 0.3, 3, 0.3, WOOD);
  f.hipRoof(0, H + 3, 0, S - 0.6, S - 0.6, 2.8, style === 'villain' ? '#3a2c44' : '#9e2a24', { overhang: 0.7 });
  // stair along the -x side going up to the open part of the parapet
  stairs(f, -S / 2 - 1.3, S / 2 + 6.6, Math.PI, 2.2, 0, H, stone, { run: 0.55 });
  const flagC = style === 'villain' ? '#5b1f7a' : '#a3262a', trim = style === 'villain' ? '#17121c' : '#d9b13b';
  flagPole(f, 0, 0, 3.6, flagC, trim, { y: H + 5.8 });
  banner(f, 0, H - 0.6, S / 2 + 0.1, 1.8, 3.6, flagC, trim);
  torch(f, S / 2 + 0.15, 3, 0, { color: style === 'villain' ? '#b070ff' : '#ffa040' });
  f.exclude(0, 3, 11);
  return [f.place(1, 1, 0, { y: +(f.y + H).toFixed(2) }), f.place(-1, -1, Math.PI, { y: +(f.y + H).toFixed(2) })];
}

// Roadside inn on the palace road
function roadsideInn() {
  const road = ROADS.townPalace;
  const p = along(road, 470);
  const nx = p.dz, nz = -p.dx; // to the left of the road (north side)
  const x = p.x + nx * 17, z = p.z + nz * 17;
  const f = new Frame(x, heightAt(x, z), z, Math.atan2(-nx, -nz));
  const res = townHouse(f, { type: 'plaster', w: 11, d: 8, storeys: 2, wall: '#e6d4a8', roof: '#7a3a24', trim: '#7a3a2a' });
  f.sign(0, res.top - 0.7, res.d / 2 + 0.25, 'ПОСТОЯЛЫЙ ДВОР «КОЛЕСО»', 4.2, 0.6, { back: false });
  // wagon wheel ornament
  f.cyl(-4, res.top - 0.7, res.d / 2 + 0.3, 0.55, 0.55, 0.08, WOOD2, { center: true, rx: Math.PI / 2, seg: 10 });
  // stable lean-to
  const s = f.sub(9.5, 0, 0, 0);
  const sy = s.ground(0, 0) - s.y;
  s.box(0, sy - 0.5, 0, 5, 0.6, 8, '#7a6a5a');
  for (const k of [-1, 1]) for (const zz of [-3.8, 0, 3.8]) s.box(k * 2.3, sy, zz, 0.2, k > 0 ? 2.6 : 3.4, 0.2, WOOD);
  s.box(0, sy + 3.0, 0, 5.6, 0.12, 8.6, '#6a5a3a', { center: true, rz: 0.15 });
  s.box(-2.4, sy, 0, 0.12, 3.2, 8, '#7a5a38');
  for (let k = 0; k < 3; k++) s.cyl(0.8, sy, -2.5 + k * 2.4, 0.9, 1.0, 1.0, '#d8b65a', { seg: 7 });
  s.solid(-2.4, 0, 0.3, 8, sy + 3);
  // hitching rail, wagon, lantern, well
  f.box(-1, f.ground(-1, 9) - f.y + 0.9, 9, 5, 0.12, 0.12, WOOD);
  for (const k of [-1, 1]) f.box(-1 + k * 2.4, f.ground(-1, 9) - f.y - 0.2, 9, 0.15, 1.2, 0.15, WOOD);
  wagon(f, -7, 10, 0.5);
  lantern(f, 3.4, res.d / 2 + 2, 2.8, { y: f.ground(3.4, res.d / 2 + 2) - f.y });
  f.exclude(2, 3, 16);
  game.places.set('roadside:inn', { ...f.place(0, res.d / 2 + 2.5, 0), name: 'Постоялый двор «Колесо»' });
  return res.door;
}

function wagon(f, x, z, yaw, cover = true) {
  const w = f.sub(x, f.ground(x, z) - f.y, z, yaw);
  w.box(0, 0.7, 0, 1.8, 0.5, 3.4, '#7a5a38');
  w.box(0, 1.2, 0, 1.9, 0.12, 3.5, '#5a3e24');
  for (const s of [-1, 1]) for (const zz of [-1.1, 1.1]) w.cyl(s * 1.0, 0.62, zz, 0.62, 0.62, 0.12, '#4a3424', { center: true, rz: Math.PI / 2, seg: 10 });
  w.box(0, 0.6, 2.3, 0.1, 0.1, 1.6, '#5a3e24');
  if (cover) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 4 - 0.5) * Math.PI * 0.9;
      w.box(Math.sin(a) * 0.95, 1.2 + Math.cos(a) * 0.95, 0, 0.62, 0.06, 3.0, '#e8dfc8', { center: true, rz: -a, mat: 'cloth', ao: 0 });
    }
  } else for (let k = 0; k < 3; k++) w.box(-0.4 + k * 0.4, 1.2, -0.8 + k * 0.6, 0.6, 0.5, 0.6, '#8a6a44', { ry: rr(-0.3, 0.3) });
  w.solid(0, 0, 2.0, 3.6, 2.2);
}

// Caravan waystation "Западная застава" straddling the western road
function waystation() {
  const road = ROADS.townWest;
  // find the point on the last segment at x = -1000
  const a = road[road.length - 2], b = road[road.length - 1];
  const t = (-1000 - a[0]) / (b[0] - a[0]);
  const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
  const dirYaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const f = new Frame(x, heightAt(x, z), z, dirYaw); // local +z = westward along the road
  exclude(x, z, 30);
  const HW = 14, HL = 20;
  const stake = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 0.5), dir = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= n; i++) {
      const px = ax + (bx - ax) * i / n, pz = az + (bz - az) * i / n, gy = f.ground(px, pz) - f.y;
      const h = rr(3.0, 3.6);
      f.cyl(px, gy - 0.5, pz, 0.24, 0.26, h + 0.5, i % 2 ? '#7a5634' : '#6a4a2c', { seg: 5 });
      f.cone(px, gy + h, pz, 0.24, 0.6, '#7a5634', { seg: 5 });
    }
    const m = Math.max(1, Math.round(L / 6));
    for (let i = 0; i < m; i++) {
      const p0x = ax + (bx - ax) * i / m, p0z = az + (bz - az) * i / m, p1x = ax + (bx - ax) * (i + 1) / m, p1z = az + (bz - az) * (i + 1) / m;
      const mx = (p0x + p1x) / 2, mz = (p0z + p1z) / 2;
      f.solid(mx, mz, 0.6, Math.hypot(p1x - p0x, p1z - p0z), f.ground(mx, mz) - f.y + 3.2, { rot: dir });
    }
    f.box((ax + bx) / 2, f.ground((ax + bx) / 2, (az + bz) / 2) - f.y + 2.2, (az + bz) / 2, 0.12, 0.18, L, '#4a3424', { ry: dir, ao: 0 });
  };
  stake(-HW, -HL, -HW, HL); stake(HW, -HL, HW, HL);
  stake(-HW, -HL, -3.5, -HL); stake(3.5, -HL, HW, -HL);
  stake(-HW, HL, -3.5, HL); stake(3.5, HL, HW, HL);
  // gate frames over both road openings
  for (const s of [-1, 1]) {
    const gz = s * HL;
    for (const k of [-1, 1]) f.cyl(k * 3.6, f.ground(k * 3.6, gz) - f.y - 0.5, gz, 0.32, 0.36, 5.4, '#5a3e24', { seg: 6 });
    f.box(0, 4.6, gz, 8.2, 0.5, 0.5, '#5a3e24');
    f.sign(0, 3.95, gz + s * 0.3, 'ЗАПАДНАЯ ЗАСТАВА', 4.4, 0.8, { style: 'red' });
    torch(f, -4.1, 2.4, gz + s * 0.4); torch(f, 4.1, 2.4, gz + s * 0.4);
  }
  // guard tower in a corner
  const tw = f.sub(-HW + 4, f.ground(-HW + 4, -HL + 4) - f.y, -HL + 4, 0);
  for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) tw.cyl(px * 1.6, -0.3, pz * 1.6, 0.2, 0.25, 7.5, '#5a3e24', { seg: 6, rz: -px * 0.05, rx: pz * 0.05 });
  tw.box(0, 6.6, 0, 4.4, 0.3, 4.4, '#7a5a38');
  for (const s of [-1, 1]) { tw.box(s * 2.1, 6.9, 0, 0.12, 1.0, 4.4, '#6a4a2c'); tw.box(0, 6.9, s * 2.1, 4.4, 1.0, 0.12, '#6a4a2c'); }
  for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) tw.box(px * 2, 6.9, pz * 2, 0.16, 2.4, 0.16, '#5a3e24');
  tw.hipRoof(0, 9.3, 0, 4.4, 4.4, 2.0, '#9e2a24', { overhang: 0.4 });
  for (let k = 0; k < 15; k++) tw.box(1.9, 0.3 + k * 0.42, 0, 0.6, 0.06, 0.06, '#6a4a2c', { ry: Math.PI / 2 });
  flagPole(tw, 0, 0, 3, '#a3262a', '#d9b13b', { y: 11.2 });
  for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) tw.post(px * 1.6, pz * 1.6, 0.3);
  // barracks hut + stable
  const hut = f.sub(HW - 5, 0, -8, -Math.PI / 2);
  const r1 = townHouse(hut, { type: 'izba', w: 8, d: 6, roof: '#6a5a3a', trim: '#a3262a' });
  const st = f.sub(-HW + 4.5, 0, 8, Math.PI / 2);
  const sy = st.ground(0, 0) - st.y;
  st.box(0, sy - 0.4, 0, 10, 0.5, 5, '#7a6a5a');
  for (const k of [-1, 1]) for (const xx of [-4.8, 0, 4.8]) st.box(xx, sy, k * 2.3, 0.2, k > 0 ? 3.4 : 2.6, 0.2, WOOD);
  st.box(0, sy + 3.0, 0, 10.6, 0.12, 5.6, '#6a5a3a', { center: true, rx: -0.15 });
  st.box(0, sy, -2.4, 10, 2.8, 0.12, '#7a5a38');
  st.solid(0, -2.4, 10, 0.3, sy + 3);
  for (let k = 0; k < 3; k++) st.cyl(-3 + k * 3, sy, -0.5, 0.9, 1.0, 1.1, '#d8b65a', { seg: 7 });
  // caravan yard: wagons, crates, campfire
  wagon(f, 7, 6, 0.1); wagon(f, 8, 12, -0.15, false); wagon(f, -7, -6, 3.1);
  campfire(f, 6, -14, {});
  for (let k = 0; k < 5; k++) f.box(-9 + k * 0.9, f.ground(-9 + k * 0.9, 14) - f.y, 14 + (k % 2) * 0.6, 0.85, 0.85, 0.85, '#8a6a44', { ry: rr(-0.3, 0.3) });
  f.solid(-7.2, 14.3, 4.6, 1.4, 1.0);
  flagPole(f, 5, 0, 8, '#a3262a', '#d9b13b', { y: f.ground(5, 0) - f.y });
  lantern(f, 3.6, -HL + 2, 2.8); lantern(f, -3.6, HL - 2, 2.8);
  game.places.set('westExit', { ...f.place(0, 6, 0), name: 'Западная застава' });
  game.places.set('westExit:posts', [f.place(-5, HL + 2, 0), f.place(5, HL + 2, 0), f.place(-5, -HL - 2, Math.PI), f.place(5, -HL - 2, Math.PI)]);
  return r1.door;
}

export function buildRoads() {
  // ---- signposts at junctions ----
  const P = LOC.palace, F = LOC.fort, E = LOC.elfVillage, T = LOC.town;
  signpost(LOC.palaceGate.x - 4, LOC.palaceGate.z + 9, [['Дворец', P.x, P.z], ['Слобода', 620, 0], ['Старый форт', 600, -200]]);
  signpost(LOC.fortGate.x + 8, LOC.fortGate.z + 6, [['Старый форт', F.x, F.z], ['Слобода', -30, -560], ['Дворец', 200, -600]]);
  signpost(-636, 103, [['Эльфы', E.x, E.z], ['Слобода', -520, 140], ['Застава', -760, 150]]);
  {
    const p = along(ROADS.townWest, 125); signpost(p.x + p.dz * 6, p.z - p.dx * 6, [['Лес эльфов', -360, 180], ['Слобода', T.x, T.z]]);
    const q = along(ROADS.townPalace, 125); signpost(q.x - q.dz * 6, q.z + q.dx * 6, [['Дворец', 330, 120], ['Слобода', T.x, T.z], ['Хутор', LOC.eastFarm.x, LOC.eastFarm.z]]);
    const r = along(ROADS.townFort, 125); signpost(r.x + r.dz * 6, r.z - r.dx * 6, [['Горы Злого', -20, -150], ['Слобода', T.x, T.z]]);
  }
  // ---- milestones every 200 units ("вёрсты") ----
  for (const road of Object.values(ROADS)) {
    const L = roadLen(road);
    for (let s = 200, k = 1; s < L - 60; s += 200, k++) {
      const p = along(road, s);
      const x = p.x + p.dz * 5.5, z = p.z - p.dx * 5.5;
      milestone(x, z, `${k} верст${k === 1 ? 'а' : k < 5 ? 'ы' : ''}`);
    }
  }
  // ---- bridge over the marshy creek on the western road ----
  {
    const road = ROADS.townWest;
    // find the low stretch automatically
    const L = roadLen(road);
    let s0 = -1, s1 = -1;
    for (let s = 300; s < L * 0.6; s += 2) {
      const p = along(road, s), h = heightAt(p.x, p.z);
      if (h < 1.6 && s0 < 0) s0 = s;
      if (h < 1.6) s1 = s;
    }
    if (s0 > 0) {
      bridge(road, s0 - 8, s1 + 8);
      game.places.set('bridge:west', { ...along(road, (s0 + s1) / 2), name: 'Мост через болото' });
    }
  }
  // ---- roadside inn, watchtowers, waystation ----
  const doors = [roadsideInn()];
  const posts = [];
  {
    const p = along(ROADS.palaceFort, 190);
    posts.push(...watchtower(p.x + p.dz * 14, p.z - p.dx * 14, Math.atan2(-p.dz, p.dx), 'empire'));
    game.places.set('watchtower:empire', { x: +(p.x + p.dz * 14).toFixed(1), z: +(p.z - p.dx * 14).toFixed(1), yaw: 0, name: 'Имперская сторожевая башня', posts: posts.slice(0) });
    const q = along(ROADS.townFort, 600);
    const vp = watchtower(q.x + q.dz * 14, q.z - q.dx * 14, Math.atan2(-q.dz, q.dx), 'villain');
    game.places.set('watchtower:villain', { x: +(q.x + q.dz * 14).toFixed(1), z: +(q.z - q.dx * 14).toFixed(1), yaw: 0, name: 'Дозор Злого', posts: vp });
  }
  doors.push(waystation());
  game.places.set('roadside:doors', doors.map(d => ({ x: d.x, z: d.z })));
  void distToAnyRoad; void addGlow; void rpick; void rng;
}
