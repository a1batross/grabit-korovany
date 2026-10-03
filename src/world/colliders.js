// Static XZ colliders for buildings/walls (oriented boxes + circles) with optional height,
// so actors can't walk through walls. Buildings register here via addBox/addCircle.
const boxes = [];   // { x, z, hw, hd, rot, cos, sin, top }
const circles = []; // { x, z, r, top }
const CELL = 32;
const grid = new Map();
const key = (i, j) => i * 100003 + j;

function insert(obj, x, z, r) {
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = key(i, j);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(obj);
  }
}

// Oriented box centred at (x,z) with half-extents hw (local x) and hd (local z), rotated by rot (radians, around Y).
// top: world Y of the top surface (actors above it are not blocked; can stand on it if `walkable`).
export function addBox(x, z, hw, hd, rot = 0, top = 1e9, walkable = false, bottom = -1e9) {
  const b = { type: 'box', x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), top, bottom, walkable };
  boxes.push(b);
  insert(b, x, z, Math.hypot(hw, hd));
  return b;
}
export function addCircle(x, z, r, top = 1e9, walkable = false) {
  const c = { type: 'circle', x, z, r, top, walkable, bottom: -1e9 };
  circles.push(c);
  insert(c, x, z, r);
  return c;
}
export function removeCollider(c) {
  for (const list of grid.values()) { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); }
}

const seen = new Set();
function query(x, z, r, fn) {
  seen.clear();
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const list = grid.get(key(i, j));
    if (list) for (const o of list) if (!seen.has(o)) { seen.add(o); fn(o); }
  }
}

// Push pos (Vector3: uses x,z; y = feet height) out of colliders. Returns true if anything was hit.
export function collideStatic(pos, radius, height = 1.8) {
  let hit = false;
  query(pos.x, pos.z, radius + 1, o => {
    if (pos.y >= o.top - 0.35 || pos.y + height < o.bottom) return; // above it (stepping on) or below
    if (o.type === 'circle') {
      const dx = pos.x - o.x, dz = pos.z - o.z, min = radius + o.r, d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1e-4;
        pos.x = o.x + (dx / d) * min; pos.z = o.z + (dz / d) * min; hit = true;
      }
    } else {
      // to local
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const lx = dx * o.cos - dz * o.sin, lz = dx * o.sin + dz * o.cos;
      const cx = Math.max(-o.hw, Math.min(o.hw, lx)), cz = Math.max(-o.hd, Math.min(o.hd, lz));
      let px = lx - cx, pz = lz - cz;
      const d2 = px * px + pz * pz;
      if (d2 < radius * radius) {
        let nx, nz;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = lx + (px / d) * (radius - d) ; nz = lz + (pz / d) * (radius - d); }
        else {
          // centre inside the box: push out along the smallest penetration axis
          const ox = o.hw - Math.abs(lx), oz = o.hd - Math.abs(lz);
          if (ox < oz) { nx = Math.sign(lx || 1) * (o.hw + radius); nz = lz; }
          else { nx = lx; nz = Math.sign(lz || 1) * (o.hd + radius); }
        }
        // back to world
        pos.x = o.x + nx * o.cos + nz * o.sin;
        pos.z = o.z - nx * o.sin + nz * o.cos;
        hit = true;
      }
    }
  });
  return hit;
}

// Highest walkable surface under (x,z) that is at or below y+stepUp. Returns -Infinity if none.
export function floorAt(x, z, y, stepUp = 0.6) {
  let best = -Infinity;
  query(x, z, 0.5, o => {
    if (!o.walkable || o.top > y + stepUp) return;
    if (o.type === 'circle') { if ((x - o.x) ** 2 + (z - o.z) ** 2 <= o.r * o.r) best = Math.max(best, o.top); }
    else {
      const dx = x - o.x, dz = z - o.z;
      const lx = dx * o.cos - dz * o.sin, lz = dx * o.sin + dz * o.cos;
      if (Math.abs(lx) <= o.hw && Math.abs(lz) <= o.hd) best = Math.max(best, o.top);
    }
  });
  return best;
}

// Line-of-sight / projectile test against boxes in 2D (cheap): returns true if segment is blocked below given height.
export function segmentBlocked(ax, ay, az, bx, by, bz) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    let blocked = false;
    query(x, z, 0.1, o => {
      if (blocked || y > o.top || y < o.bottom) return;
      if (o.type === 'circle') { if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) blocked = true; }
      else {
        const dx = x - o.x, dz = z - o.z;
        const lx = dx * o.cos - dz * o.sin, lz = dx * o.sin + dz * o.cos;
        if (Math.abs(lx) < o.hw && Math.abs(lz) < o.hd) blocked = true;
      }
    });
    if (blocked) return true;
  }
  return false;
}
