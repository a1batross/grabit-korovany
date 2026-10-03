// The map has 4 zones (per Kirill's spec):
// 1 - humans (neutral), 2 - emperor (palace), 3 - elves (dense forest), 4 - villain (mountains, old fort)
// Coordinates: +x = east, -z = north. World spans [-WORLD_HALF, WORLD_HALF].
export const WORLD_HALF = 1200;

export const ZONES = {
  humans:  { id: 'humans',  name: 'Земли людей (нейтрал)',   center: [0, 300],    color: '#d8c27a' },
  empire:  { id: 'empire',  name: 'Земли императора',        center: [760, -20],  color: '#d84a3a' },
  elves:   { id: 'elves',   name: 'Лес эльфов',              center: [-760, 20],  color: '#3fae4a' },
  villain: { id: 'villain', name: 'Горы Злого',              center: [0, -760],   color: '#8a5cc8' },
};

// Key locations
export const LOC = {
  town:        { x: 0,    z: 260,  r: 95,  name: 'Слобода' },
  palace:      { x: 780,  z: -40,  r: 75,  name: 'Дворец императора' },
  palaceGate:  { x: 690,  z: -20 },
  elfVillage:  { x: -680, z: 40,   r: 80,  name: 'Эльфийская деревня' },
  fort:        { x: 0,    z: -820, r: 70,  name: 'Старый форт' },
  fortGate:    { x: 0,    z: -735 },
  lake:        { x: 330,  z: 520,  r: 120 },
  westExit:    { x: -1120, z: 300 },
  eastFarm:    { x: 300,  z: 150 },
};

// Roads (polylines). Caravans travel along these.
export const ROADS = {
  townPalace: [[0, 260], [160, 200], [330, 120], [500, 40], [620, 0], [690, -20]],
  townWest:   [[0, 260], [-180, 230], [-360, 180], [-520, 140], [-640, 90], [-760, 150], [-900, 240], [-1120, 300]],
  townFort:   [[0, 260], [30, 80], [-20, -150], [40, -380], [-30, -560], [0, -735]],
  palaceFort: [[690, -20], [600, -200], [420, -420], [200, -600], [0, -735]],
};

const centers = Object.values(ZONES);

export function zoneAt(x, z) {
  let best = null, bd = Infinity;
  for (const zn of centers) {
    const dx = x - zn.center[0], dz = z - zn.center[1];
    // humans zone slightly "smaller" so the frontier feels right
    const d = Math.sqrt(dx * dx + dz * dz) * (zn.id === 'humans' ? 1.15 : 1);
    if (d < bd) { bd = d; best = zn; }
  }
  return best;
}

// Distance from point to a polyline (used for road flattening / tree exclusion)
export function distToRoad(x, z, road) {
  let best = Infinity;
  for (let i = 0; i < road.length - 1; i++) {
    const [ax, az] = road[i], [bx, bz] = road[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const px = ax + vx * t - x, pz = az + vz * t - z;
    const d = px * px + pz * pz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function distToAnyRoad(x, z) {
  let d = Infinity;
  for (const r of Object.values(ROADS)) d = Math.min(d, distToRoad(x, z, r));
  return d;
}
