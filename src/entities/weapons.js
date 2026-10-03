// Weapon definitions + procedural meshes.
// dmg: base damage, reach: metres, speed: attack duration (s), cut: chance multiplier to sever limbs,
// pierce: chance multiplier to gouge eyes, style: animation ('slash'|'thrust'|'bow'), ranged: true for bows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loft, plate } from './model-geometry.js';

export const WEAPONS = {
  fists:   { id: 'fists',   name: 'Кулаки',          dmg: 6,  reach: 1.5, speed: 0.45, cut: 0,   pierce: 0.2, style: 'thrust', price: 0 },
  dagger:  { id: 'dagger',  name: 'Кинжал',          dmg: 12, reach: 1.7, speed: 0.4,  cut: 0.3, pierce: 1.6, style: 'thrust', price: 25 },
  club:    { id: 'club',    name: 'Дубина',          dmg: 15, reach: 2.0, speed: 0.7,  cut: 0,   pierce: 0,   style: 'slash',  price: 10 },
  sword:   { id: 'sword',   name: 'Меч',             dmg: 20, reach: 2.3, speed: 0.6,  cut: 1.0, pierce: 0.4, style: 'slash',  price: 80 },
  elfblade:{ id: 'elfblade',name: 'Эльфийский клинок',dmg: 22, reach: 2.3, speed: 0.5, cut: 1.2, pierce: 0.6, style: 'slash',  price: 140 },
  axe:     { id: 'axe',     name: 'Топор',           dmg: 26, reach: 2.2, speed: 0.8,  cut: 1.7, pierce: 0,   style: 'slash',  price: 70 },
  spear:   { id: 'spear',   name: 'Копьё',           dmg: 21, reach: 3.0, speed: 0.65, cut: 0.2, pierce: 1.2, style: 'thrust', price: 60 },
  halberd: { id: 'halberd', name: 'Алебарда',        dmg: 30, reach: 3.0, speed: 0.95, cut: 1.5, pierce: 0.5, style: 'slash',  price: 160 },
  mace:    { id: 'mace',    name: 'Булава',          dmg: 25, reach: 2.1, speed: 0.75, cut: 0.1, pierce: 0,   style: 'slash',  price: 90 },
  darkblade:{id: 'darkblade',name:'Тёмный клинок Злого',dmg: 34, reach: 2.6, speed: 0.6, cut: 1.8, pierce: 0.8, style: 'slash', price: 600 },
  bow:     { id: 'bow',     name: 'Лук',             dmg: 18, reach: 60,  speed: 0.9,  cut: 0.2, pierce: 1.0, style: 'bow', ranged: true, arrowSpeed: 55, price: 75 },
  longbow: { id: 'longbow', name: 'Эльфийский лук',  dmg: 26, reach: 80,  speed: 0.85, cut: 0.3, pierce: 1.3, style: 'bow', ranged: true, arrowSpeed: 70, price: 190 },
};

const mats = {};
const mat = c => (mats[c] ??= new THREE.MeshLambertMaterial({ color: c }));
function part(geo, color, x, y, z, rx = 0) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true;
  return m;
}

// Meshes are built in hand space: hand at origin, arm hangs along -Y, "forward" is +Z.
// Blades point along +Z (forward) so they swing nicely with the arm.
const weaponCache = new Map();
const weaponMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

// One shared opaque mesh per weapon, plus a separate emissive blade where needed.
function bakeWeapon(g) {
  const meshes = g.children.filter(m => m.isMesh && !m.material.emissive.getHex());
  const parts = meshes.map(m => {
    m.updateMatrix();
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.deleteAttribute('uv'); geo.applyMatrix4(m.matrix);
    const c = m.material.color, colors = [];
    for (let i = 0; i < geo.attributes.position.count; i++) colors.push(c.r, c.g, c.b);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  });
  if (parts.length) {
    const merged = new THREE.Mesh(mergeGeometries(parts), weaponMaterial); merged.castShadow = true;
    meshes.forEach(m => { g.remove(m); m.geometry.dispose(); });
    parts.forEach(p => p.dispose()); g.add(merged);
  }
}

export function makeWeaponMesh(w) {
  if (weaponCache.has(w.id)) return weaponCache.get(w.id).clone(true);
  const g = new THREE.Group();
  const steel = '#c8ced6', wood = '#6a4424', dark = '#2a2a30';
  switch (w.id) {
    case 'dagger': {
      g.add(part(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8), wood, 0, 0, -0.02, Math.PI / 2));
      g.add(part(new THREE.BoxGeometry(0.13, 0.027, 0.04), '#b19b62', 0, 0, 0.055));
      const blade = loft([[0, 0.065, 0.018], [0.18, 0.05, 0.018], [0.29, 0.002, 0.002]], 0.4);
      g.add(part(blade, steel, 0, 0, 0.075, Math.PI / 2));
      break;
    }
    case 'club':
      g.add(part(new THREE.CylinderGeometry(0.035, 0.08, 0.8, 7), wood, 0, 0, 0.35, Math.PI / 2));
      break;
    case 'sword': case 'elfblade': case 'darkblade': {
      const col = w.id === 'darkblade' ? '#3a1a4a' : w.id === 'elfblade' ? '#d8f0e0' : steel;
      g.add(part(new THREE.BoxGeometry(0.03, 0.03, 0.16), w.id === 'elfblade' ? '#2a6a3a' : wood, 0, 0, -0.02));
      g.add(part(new THREE.BoxGeometry(0.2, 0.03, 0.04), w.id === 'elfblade' ? '#c8a23a' : '#888', 0, 0, 0.07));
      const len = w.id === 'darkblade' ? 1.05 : 0.85;
      const widths = w.id === 'elfblade' ? [0.065, 0.09, 0.04] : w.id === 'darkblade' ? [0.11, 0.09, 0.075] : [0.073, 0.066, 0.053];
      const blade = part(loft([[0, widths[0], 0.023], [len * 0.48, widths[1], 0.023],
        [len * 0.82, widths[2], 0.019], [len, 0.002, 0.002]], 0.42), col, 0, 0, 0.09, Math.PI / 2);
      if (w.id === 'darkblade') blade.material = new THREE.MeshLambertMaterial({ color: col, emissive: '#3a0050' });
      g.add(blade);
      g.add(part(new THREE.IcosahedronGeometry(0.041, 0), '#bfa777', 0, 0, -0.125));
      for (let i = 0; i < 4; i++) g.add(part(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 8), '#9b8157', 0, 0, -0.075 + i * 0.031, Math.PI / 2));
      break;
    }
    case 'axe':
      g.add(part(new THREE.CylinderGeometry(0.025, 0.03, 0.85, 6), wood, 0, 0, 0.3, Math.PI / 2));
      { const head = part(plate([[-0.13, -0.08], [-0.07, 0.13], [0.17, 0.26], [0.26, 0.14], [0.27, -0.16], [0.13, -0.23]], 0.028), steel, 0, 0, 0.6); head.rotation.y = -Math.PI / 2; g.add(head); }
      break;
    case 'spear':
      g.add(part(new THREE.CylinderGeometry(0.022, 0.022, 2.0, 6), wood, 0, 0, 0.55, Math.PI / 2));
      g.add(part(loft([[0, 0.025, 0.018], [0.065, 0.095, 0.025], [0.28, 0.002, 0.002]], 0.4), steel, 0, 0, 1.53, Math.PI / 2));
      break;
    case 'halberd':
      g.add(part(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6), wood, 0, 0, 0.55, Math.PI / 2));
      { const head = part(plate([[-0.18, -0.07], [-0.1, 0.08], [0.13, 0.27], [0.23, 0.15], [0.16, -0.18], [0.04, -0.23]], 0.028), steel, 0, 0, 1.4); head.rotation.y = -Math.PI / 2; g.add(head); }
      g.add(part(new THREE.ConeGeometry(0.04, 0.25, 6), steel, 0, 0, 1.68, Math.PI / 2));
      break;
    case 'mace':
      g.add(part(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 6), wood, 0, 0, 0.25, Math.PI / 2));
      g.add(part(new THREE.DodecahedronGeometry(0.095), dark, 0, 0, 0.6));
      for (let i = 0; i < 6; i++) { const flange = part(new THREE.BoxGeometry(0.025, 0.25, 0.14), steel, 0, 0, 0.6); flange.rotation.z = i * Math.PI / 3; g.add(flange); }
      break;
    case 'bow': case 'longbow': {
      const len = w.id === 'longbow' ? 1.5 : 1.15;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -len / 2, 0), new THREE.Vector3(0, -len * 0.3, -len * 0.16),
        new THREE.Vector3(0, 0, -len * 0.08), new THREE.Vector3(0, len * 0.3, -len * 0.16), new THREE.Vector3(0, len / 2, 0),
      ]);
      g.add(part(new THREE.TubeGeometry(curve, 14, 0.022, 5, false), w.id === 'longbow' ? '#bca063' : wood, 0, 0, 0));
      g.add(part(new THREE.CylinderGeometry(0.004, 0.004, len, 4), '#d6c8a5', 0, 0, 0));
      g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8), '#493526', 0, 0, -len * 0.08));
      break;
    }
  }
  bakeWeapon(g);
  // Counter the bent wrist for upright bows; blades keep their original grip angle.
  g.rotation.x = w.ranged ? Math.PI / 2 : -Math.PI / 2 * 0.35;
  g.position.y = -0.03;
  weaponCache.set(w.id, g);
  return g.clone(true);
}

// Arrow mesh for projectiles (points along +Z)
let arrowGeo = null;
export function makeArrowMesh() {
  if (!arrowGeo) {
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4); shaft.rotateX(Math.PI / 2);
    arrowGeo = shaft;
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(arrowGeo, mat('#8a6a3a')));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), mat('#aaa')); tip.rotation.x = Math.PI / 2; tip.position.z = 0.45; g.add(tip);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.06, 0.12), mat('#eee')); fl.position.z = -0.35; g.add(fl);
  return g;
}
