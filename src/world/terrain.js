// Heightmap terrain. heightAt(x,z) is exact w.r.t. the rendered mesh (same grid, same triangulation).
import * as THREE from 'three';
import { game } from '../core/game.js';
import { fbm, ridged, smoothstep, clamp, lerp } from '../core/rng.js';
import { WORLD_HALF, LOC, ZONES, zoneAt, distToAnyRoad, ROADS, distToRoad } from './zones.js';

export const CELL = 6;
export const N = Math.round((WORLD_HALF * 2) / CELL); // cells per side
const V = N + 1;
export const heights = new Float32Array(V * V);
export const WATER_LEVEL = 0;

function flatten(h, x, z, cx, cz, r, target, blend = 40) {
  const d = Math.hypot(x - cx, z - cz);
  const t = 1 - smoothstep(r, r + blend, d);
  return lerp(h, target, t);
}

function rawHeight(x, z) {
  let h = 10 + fbm(x / 420, z / 420, 5, 3) * 26 + fbm(x / 70, z / 70, 3, 9) * 3;

  // Villain mountains in the north
  const m = smoothstep(-260, -640, z) * (1 - smoothstep(520, 900, Math.abs(x)) * 0.3);
  h += ridged(x / 260, z / 260, 5, 77) * 210 * m * m;
  // World edge ring of mountains
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(1000, 1190, edge) * 160 * (0.6 + 0.4 * ridged(x / 150, z / 150, 3, 5));

  // Palace hill
  const dp = Math.hypot(x - LOC.palace.x, z - LOC.palace.z);
  h += 22 * Math.exp(-(dp * dp) / (2 * 140 * 140));
  // Lake basin
  const dl = Math.hypot(x - LOC.lake.x, z - LOC.lake.z);
  h -= 22 * (1 - smoothstep(LOC.lake.r * 0.4, LOC.lake.r * 1.4, dl));
  return h;
}

function finalHeight(x, z) {
  let h = rawHeight(x, z);
  // Flatten building sites
  h = flatten(h, x, z, LOC.town.x, LOC.town.z, LOC.town.r, rawHeight(LOC.town.x, LOC.town.z) * 0 + 12, 60);
  h = flatten(h, x, z, LOC.palace.x, LOC.palace.z, LOC.palace.r, rawHeight(LOC.palace.x, LOC.palace.z), 50);
  h = flatten(h, x, z, LOC.elfVillage.x, LOC.elfVillage.z, LOC.elfVillage.r, 10, 50);
  h = flatten(h, x, z, LOC.fort.x, LOC.fort.z, LOC.fort.r, fortHeight, 60);
  // Roads: soften toward a smoothed height
  const rd = distToAnyRoad(x, z);
  if (rd < 14) {
    const smooth = (rawHeight(x + 9, z) + rawHeight(x - 9, z) + rawHeight(x, z + 9) + rawHeight(x, z - 9)) / 4;
    h = lerp(h, Math.max(smooth, WATER_LEVEL + 1.5), (1 - rd / 14) * 0.6);
  }
  return h;
}
let fortHeight = 0;

export function buildTerrain() {
  fortHeight = rawHeight(LOC.fort.x, LOC.fort.z) * 0.75;
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
      heights[j * V + i] = finalHeight(x, z);
    }
  }

  const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const zc = {
    humans: new THREE.Color('#7fa04a'), empire: new THREE.Color('#8fa850'),
    elves: new THREE.Color('#2f6b2a'), villain: new THREE.Color('#5a5547'),
  };
  const rock = new THREE.Color('#6d6a66'), snow = new THREE.Color('#eef2f7');
  const road = new THREE.Color('#8a7350'), sand = new THREE.Color('#c9b98a');
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    const i = Math.round((x + WORLD_HALF) / CELL), j = Math.round((z + WORLD_HALF) / CELL);
    const h = heights[j * V + i];
    pos.setY(k, h);
    // blended zone colour
    const zn = zoneAt(x, z);
    col.copy(zc[zn.id]);
    const n = fbm(x / 30, z / 30, 2, 41);
    col.offsetHSL(0, 0, n * 0.05);
    // slope
    const hx = heights[j * V + Math.min(i + 1, N)] - heights[j * V + Math.max(i - 1, 0)];
    const hz = heights[Math.min(j + 1, N) * V + i] - heights[Math.max(j - 1, 0) * V + i];
    const slope = Math.hypot(hx, hz) / (2 * CELL);
    col.lerp(rock, smoothstep(0.55, 1.1, slope));
    col.lerp(snow, smoothstep(130, 175, h + n * 15));
    if (h < WATER_LEVEL + 1.2) col.lerp(sand, 0.8);
    const rd = distToAnyRoad(x, z);
    if (rd < 6) col.lerp(road, 1 - smoothstep(2.5, 6, rd));
    // trampled ground at settlements
    for (const L of [LOC.town, LOC.elfVillage, LOC.fort, LOC.palace]) {
      const d = Math.hypot(x - L.x, z - L.z);
      if (d < L.r) col.lerp(L === LOC.elfVillage ? new THREE.Color('#4c6b2e') : road, 0.35 * (1 - d / L.r));
    }
    colors.set([col.r, col.g, col.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  game.scene.add(mesh);

  // Water
  const wgeo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2);
  wgeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wgeo, new THREE.MeshPhongMaterial({
    color: 0x3a6f9a, transparent: true, opacity: 0.78, shininess: 90, specular: 0x99bbdd,
  }));
  water.position.y = WATER_LEVEL;
  water.name = 'water';
  game.scene.add(water);
  return mesh;
}

// Exact height on the rendered mesh triangles (PlaneGeometry diagonal: a-b-d / b-c-d)
export function heightAt(x, z) {
  const fx = clamp((x + WORLD_HALF) / CELL, 0, N - 0.0001);
  const fz = clamp((z + WORLD_HALF) / CELL, 0, N - 0.0001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const h00 = heights[j * V + i], h10 = heights[j * V + i + 1];
  const h01 = heights[(j + 1) * V + i], h11 = heights[(j + 1) * V + i + 1];
  // PlaneGeometry faces: (a=i,j  b=i,j+1  d=i+1,j) and (b, c=i+1,j+1, d)
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

export function groundAt(x, z) { return Math.max(heightAt(x, z), WATER_LEVEL - 1.2); }

export function slopeAt(x, z) {
  const e = 1.5;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}

export function isInWater(x, z) { return heightAt(x, z) < WATER_LEVEL - 0.6; }
