// Very small road-graph navigation: marching armies follow roads between zones instead of
// bulldozing through the dense elf forest / mountains.
import { ROADS } from '../../world/zones.js';

const nodes = [];      // { x, z, adj: [{ i, d }] }
function nodeIndex(x, z) {
  for (let i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].x - x) < 1 && Math.abs(nodes[i].z - z) < 1) return i;
  nodes.push({ x, z, adj: [] });
  return nodes.length - 1;
}
for (const road of Object.values(ROADS)) {
  let prev = -1;
  for (const [x, z] of road) {
    const i = nodeIndex(x, z);
    if (prev >= 0) {
      const d = Math.hypot(nodes[prev].x - x, nodes[prev].z - z);
      nodes[prev].adj.push({ i, d }); nodes[i].adj.push({ i: prev, d });
    }
    prev = i;
  }
}

function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

// Returns waypoints [[x,z], ...] (excluding the final goal) from (sx,sz) to (gx,gz).
export function routeTo(sx, sz, gx, gz) {
  const direct = Math.hypot(gx - sx, gz - sz);
  if (direct < 240) return [];
  const a = nearestNode(sx, sz), b = nearestNode(gx, gz);
  if (a === b) return [];
  const dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Set();
  dist[a] = 0;
  while (true) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done.has(i) && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    done.add(u);
    for (const { i, d } of nodes[u].adj) if (dist[u] + d < dist[i]) { dist[i] = dist[u] + d; prev[i] = u; }
  }
  const path = [];
  for (let u = b; u >= 0; u = prev[u]) path.unshift([nodes[u].x, nodes[u].z]);
  // skip first node if we are already past it (closer to the second one)
  if (path.length > 1) {
    const [x1, z1] = path[1];
    if (Math.hypot(x1 - sx, z1 - sz) < Math.hypot(x1 - path[0][0], z1 - path[0][1])) path.shift();
  }
  // drop the last node if goal is close to it anyway
  return path;
}
