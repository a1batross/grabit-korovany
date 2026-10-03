// Procedural 3D humanoid built from primitives. Every limb is its own Group so it can be
// chopped off (and flies away as a 3D object), eyes can be gouged, legs replaced by prosthetics, etc.
// Model faces +Z. Character's LEFT side is +X.
import * as THREE from 'three';
import { makeWeaponMesh } from './weapons.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loft, plate } from './model-geometry.js';

// ---- draw-call reduction: merge the plain meshes directly under each Group into one vertex-coloured mesh ----
const bakedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const bakeCache = new Map(); // key -> merged geometry (shared by all bodies with the same look)
function bakeGroup(group, key) {
  const plain = group.children.filter(c => c.isMesh && !c.material.emissive?.getHex() && c.material.side !== THREE.DoubleSide && !c.material.transparent);
  if (plain.length < 2) return;
  let geo = bakeCache.get(key);
  if (!geo) {
    const parts = plain.map(m => {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.deleteAttribute('uv');
      g.applyMatrix4(m.matrix);
      const c = m.material.color, n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const shade = 0.9 + Math.max(0, g.attributes.normal.getY(i)) * 0.1;
        col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    geo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    bakeCache.set(key, geo);
  }
  for (const m of plain) group.remove(m);
  const merged = new THREE.Mesh(geo, bakedMat);
  merged.castShadow = true;
  group.add(merged);
}
function bakeBody(root, key) {
  let i = 0;
  const visit = o => {
    const kids = o.children.filter(c => !c.isMesh);
    if (o.isGroup || o === root) bakeGroup(o, key + '/' + (i++));
    for (const k of kids) visit(k);
  };
  visit(root);
}

const geoCache = new Map();
function G(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
const matCache = new Map();
export function M(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
const box = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const sph = (r) => G(`s${r}`, () => new THREE.SphereGeometry(r, 10, 8));
const cone = (r, h, s = 8) => G(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const cyl = (r1, r2, h, s = 10) => G(`y${r1},${r2},${h},${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));
const form = (rings) => G('loft' + JSON.stringify(rings), () => loft(rings));
const panel = (points, depth = 0.025) => G('plate' + JSON.stringify([points, depth]), () => plate(points, depth));

// Visual presets per character kind
export const LOOKS = {
  elf:        { skin: '#f1d6b8', shirt: '#2f7d32', pants: '#5b4630', boots: '#3a2a1a', hair: '#e8d27a', ears: true, hood: '#245e27' },
  elfChief:   { skin: '#f1d6b8', shirt: '#1e6a52', pants: '#4a3b28', boots: '#3a2a1a', hair: '#f4f0e0', ears: true, crown: 'leaf', cape: '#2b8a5a' },
  guard:      { skin: '#e0b996', shirt: '#a3262a', pants: '#3a3a48', boots: '#222', helmet: 'steel', armor: '#9aa3ad' },
  commander:  { skin: '#d9ad88', shirt: '#7e1518', pants: '#2a2a35', boots: '#111', helmet: 'plume', armor: '#c9b04a', cape: '#8a1a1a' },
  emperor:    { skin: '#e8c4a0', shirt: '#d4a514', pants: '#6a1f8a', boots: '#3a1a0a', crown: 'gold', cape: '#8a1a7a', beard: '#ddd' },
  minion:     { skin: '#8a9a7a', shirt: '#222026', pants: '#18161c', boots: '#0c0c0c', helmet: 'horned', armor: '#3a3440', eyes: '#ff2a1a' },
  villain:    { skin: '#7a8a8a', shirt: '#1a1020', pants: '#120a16', boots: '#050505', helmet: 'spiky', armor: '#2a1a3a', cape: '#4a0a5a', eyes: '#ff1010', scale: 1.28 },
  spy:        { skin: '#e0b996', shirt: '#2a2a2a', pants: '#1a1a1a', boots: '#111', hood: '#151515' },
  peasant:    { skin: '#e7bf9a', shirt: '#9a7a4a', pants: '#5a4a3a', boots: '#4a3020', hair: '#6a4a2a', hat: 'straw' },
  merchant:   { skin: '#e7bf9a', shirt: '#3a5a9a', pants: '#4a3a2a', boots: '#2a1a0a', hair: '#3a2a1a', hat: 'cap', belly: true },
  healer:     { skin: '#e7bf9a', shirt: '#eeeeee', pants: '#cccccc', boots: '#555', hair: '#aaa', hat: 'cap', beard: '#bbb' },
  caravaneer: { skin: '#d8a880', shirt: '#7a5a2a', pants: '#4a3a2a', boots: '#2a1a0a', helmet: 'leather', armor: '#6a4a2a' },
};

export function createBody(kind = 'peasant', overrides = {}) {
  const L = { ...LOOKS[kind], ...overrides };
  const skin = M(L.skin), shirt = M(L.shirt), pants = M(L.pants), boots = M(L.boots);
  const root = new THREE.Group();
  root.name = 'body:' + kind;
  const scale = L.scale ?? 1;
  const elven = !!L.ears, dark = L.helmet === 'horned' || L.helmet === 'spiky';
  const trim = M(elven ? '#c6b77a' : dark ? '#82738d' : '#c6ae71');
  const leather = M('#4a3025');

  const pelvis = new THREE.Group(); pelvis.position.y = 0.95; root.add(pelvis);
  pelvis.add(mesh(form([[-0.1, 0.32, 0.23], [0.08, 0.35, 0.25]]), pants));

  // ---- legs ----
  function leg(side) {
    const g = new THREE.Group(); g.position.set(0.1 * side, -0.05, 0);
    g.add(mesh(form([[-0.41, 0.12, 0.14], [-0.2, 0.17, 0.18], [-0.04, 0.16, 0.18]]), pants));
    const knee = new THREE.Group(); knee.position.y = -0.45; g.add(knee);
    knee.add(mesh(form([[-0.39, 0.12, 0.13], [-0.15, 0.145, 0.155], [0, 0.12, 0.14]]), boots));
    knee.add(mesh(form([[-0.47, 0.15, 0.28, 0.06], [-0.39, 0.145, 0.26, 0.055], [-0.34, 0.115, 0.14]]), boots));
    knee.add(mesh(cyl(0.084, 0.08, 0.055, 8), leather, 0, -0.13, 0));
    if (L.armor) knee.add(mesh(panel([[-0.06, 0.04], [0.06, 0.04], [0.07, -0.03], [0, -0.09], [-0.07, -0.03]]), M(L.armor), 0, -0.025, 0.08));
    g.userData.knee = knee;
    return g;
  }
  const legL = leg(1), legR = leg(-1);
  pelvis.add(legL, legR);

  // ---- torso ----
  const spine = new THREE.Group(); spine.position.y = 0.08; pelvis.add(spine);
  spine.add(mesh(form([[0.02, 0.33, 0.24], [0.2, L.belly ? 0.45 : 0.34, L.belly ? 0.36 : 0.25],
    [0.46, elven ? 0.39 : 0.43, 0.27], [0.57, 0.34, 0.23]]), shirt));
  if (L.belly) spine.add(mesh(sph(0.2), shirt, 0, 0.18, 0.08));
  if (L.armor) {
    spine.add(mesh(form([[0.22, 0.35, 0.27], [0.43, dark ? 0.47 : 0.45, 0.32], [0.55, 0.37, 0.27]]), M(L.armor)));
    spine.add(mesh(panel([[-0.065, 0.05], [0.065, 0.05], [0.05, -0.045], [0, -0.085], [-0.05, -0.045]], 0.012), trim, 0, 0.4, 0.168));
    for (let i = 0; i < 2; i++) spine.add(mesh(form([[0.13 + i * 0.045, 0.36, 0.275], [0.16 + i * 0.045, 0.37, 0.28]]), M(L.armor)));
  }
  // Split coat tails stay with the pelvis and leave both hip joints free.
  for (const s of [-1, 1]) {
    pelvis.add(mesh(panel([[-0.075, 0.1], [0.075, 0.1], [0.095, -0.17], [0.02, elven ? -0.25 : -0.2], [-0.09, -0.17]], 0.018), shirt, s * 0.085, 0, 0.14));
  }
  spine.add(mesh(form([[0.03, L.belly ? 0.44 : 0.36, L.belly ? 0.37 : 0.27], [0.085, L.belly ? 0.44 : 0.36, L.belly ? 0.37 : 0.27]]), leather));
  spine.add(mesh(box(0.055, 0.05, 0.018), trim, 0, 0.058, L.belly ? 0.195 : 0.148));
  if (elven || !L.armor) {
    const strap = mesh(box(0.045, 0.46, 0.02), leather, 0, 0.31, L.belly ? 0.21 : 0.147);
    strap.rotation.z = -0.5; spine.add(strap);
    spine.add(mesh(form([[-0.07, 0.105, 0.07], [0.055, 0.12, 0.075]]), leather, -0.19, 0.075, 0.015));
  }
  if (L.cape) {
    const capeM = new THREE.Mesh(G('cape', () => {
      const g = new THREE.PlaneGeometry(0.58, 0.94, 6, 4), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = (0.47 - p.getY(i)) / 0.94, x = p.getX(i);
        p.setXYZ(i, x * (0.66 + t * 0.34), -t * 0.94,
          -0.025 - t * 0.09 + Math.cos(x / 0.58 * Math.PI * 6) * 0.023 * t);
      }
      g.computeVertexNormals(); return g;
    }),
      M(L.cape, { side: THREE.DoubleSide }));
    capeM.position.set(0, 0.6, -0.14); capeM.rotation.x = 0.12; capeM.castShadow = true;
    spine.add(capeM);
    spine.userData.cape = capeM;
  }

  // ---- head ----
  const head = new THREE.Group(); head.position.y = 0.6; spine.add(head);
  head.add(mesh(cyl(0.05, 0.06, 0.1), skin, 0, 0.03, 0));
  head.add(mesh(form([[0.055, 0.14, 0.16, 0.005], [0.12, 0.215, 0.21], [0.23, 0.235, 0.225], [0.305, 0.205, 0.205], [0.32, 0.14, 0.16]]), skin));
  const eyeMat = M('#ffffff'), pupil = M(L.eyes ?? '#2a2a3a', L.eyes ? { emissive: L.eyes } : {});
  function eye(side) {
    const e = new THREE.Group(); e.position.set(0.055 * side, 0.2, 0.115);
    const white = mesh(sph(0.023), eyeMat); white.scale.set(1, 0.64, 0.4); e.add(white);
    const iris = mesh(sph(0.012), pupil, 0, 0, 0.009); iris.scale.set(0.7, 0.95, 0.45); e.add(iris);
    return e;
  }
  const eyeL = eye(1), eyeR = eye(-1);
  head.add(eyeL, eyeR);
  head.add(mesh(form([[0.13, 0.046, 0.035, 0.13], [0.16, 0.037, 0.06, 0.131], [0.23, 0.025, 0.02, 0.112]]), skin));
  head.add(mesh(box(0.055, 0.009, 0.012), M('#8e594b'), 0, 0.1, 0.111));
  for (const s of [-1, 1]) {
    const brow = mesh(box(0.061, 0.013, 0.016), M(L.hair ?? '#4b3932'), s * 0.055, 0.231, 0.115);
    brow.rotation.z = s * (dark ? -0.17 : 0.06); head.add(brow);
    if (!elven) head.add(mesh(form([[-0.04, 0.035, 0.04], [0.035, 0.035, 0.05]]), skin, s * 0.123, 0.19, 0));
  }
  if (L.hair) {
    if (!L.hood && !L.helmet) head.add(mesh(form([[0.26, 0.245, 0.24], [0.325, 0.23, 0.23], [0.355, 0.13, 0.17]]), M(L.hair), 0, 0, -0.013));
    for (const s of [-1, 1]) head.add(mesh(form([[elven ? 0.025 : 0.19, 0.055, 0.055], [0.29, 0.08, 0.12]]), M(L.hair), s * 0.11, 0, -0.067));
  }
  if (L.beard) head.add(mesh(form([[0.005, 0.07, 0.025], [0.085, 0.18, 0.045], [0.13, 0.195, 0.032]]), M(L.beard), 0, 0, 0.108));
  if (L.ears) {
    for (const s of [1, -1]) {
      const ear = mesh(cone(0.035, 0.18, 4), skin, 0.12 * s, 0.22, -0.01);
      ear.rotation.z = -1.1 * s; ear.rotation.x = -0.3;
      head.add(ear);
    }
  }
  if (L.hood) {
    const hood = mesh(G('hood', () => new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)), M(L.hood), 0, 0.22, -0.02);
    hood.scale.set(0.95, 1, 1.05);
    head.add(hood);
  }
  if (L.helmet) {
    const steel = M(L.helmet === 'horned' || L.helmet === 'spiky' ? '#2a2630' : L.helmet === 'leather' ? '#6a4a2a' : '#b8c0c8');
    head.add(mesh(G('helm', () => new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), steel, 0, 0.22, 0));
    head.add(mesh(cyl(0.158, 0.157, 0.028, 12), trim, 0, 0.232, -0.005));
    for (const s of [-1, 1]) head.add(mesh(form([[0.1, 0.035, 0.09], [0.24, 0.035, 0.15]]), steel, s * 0.133, 0, -0.025));
    if (L.helmet === 'steel' || L.helmet === 'plume') head.add(mesh(box(0.03, 0.12, 0.05), steel, 0, 0.16, 0.14)); // nasal
    if (L.helmet === 'plume') {
      const p = mesh(form([[0, 0.035, 0.28], [0.1, 0.055, 0.32, -0.025], [0.15, 0.028, 0.2, -0.06]]), M('#d01818'), 0, 0.36, -0.02); head.add(p);
    }
    if (L.helmet === 'horned') {
      for (const s of [1, -1]) {
        const h = mesh(cone(0.04, 0.22, 6), M('#e8e0c8'), 0.16 * s, 0.32, 0); h.rotation.z = -0.8 * s; head.add(h);
      }
    }
    if (L.helmet === 'spiky') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const sp = mesh(cone(0.03, 0.22, 5), M('#3a0a4a', { emissive: '#200030' }), Math.sin(a) * 0.12, 0.38, Math.cos(a) * 0.12);
        head.add(sp);
      }
    }
  }
  if (L.crown === 'gold') {
    const c = mesh(cyl(0.13, 0.13, 0.08, 8), M('#ffd23a', { emissive: '#3a2a00' }), 0, 0.35, 0); head.add(c);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; head.add(mesh(cone(0.025, 0.08, 4), M('#ffd23a'), Math.sin(a) * 0.12, 0.42, Math.cos(a) * 0.12)); }
  }
  if (L.crown === 'leaf') head.add(mesh(G('leafcrown', () => new THREE.TorusGeometry(0.13, 0.025, 5, 12)), M('#4caa3a'), 0, 0.33, 0).rotateX(Math.PI / 2));
  if (L.hat === 'straw') { head.add(mesh(cyl(0.26, 0.26, 0.03, 12), M('#d8c070'), 0, 0.33, 0)); head.add(mesh(cyl(0.11, 0.14, 0.12, 10), M('#d8c070'), 0, 0.38, 0)); }
  if (L.hat === 'cap') head.add(mesh(cyl(0.14, 0.15, 0.1, 10), M(L.shirt), 0, 0.34, 0));

  // ---- arms ----
  function arm(side) {
    const g = new THREE.Group(); g.position.set(0.27 * side, 0.52, 0);
    g.add(mesh(form([[-0.29, 0.115, 0.13], [-0.07, 0.16, 0.18], [0.02, 0.12, 0.14]]), shirt));
    // Armor belongs to the arm, so it follows the shoulder and detaches with it.
    if (L.armor) {
      g.add(mesh(form([[-0.09, 0.185, 0.21], [0.025, dark ? 0.23 : 0.21, 0.23], [0.085, 0.13, 0.16]]), M(L.armor)));
      g.add(mesh(box(0.17, 0.025, 0.018), trim, 0, -0.065, 0.108));
      if (dark && side === 1) g.add(mesh(cone(0.037, 0.13, 5), trim, 0.045, 0.14, 0));
    } else if (elven) {
      g.add(mesh(panel([[-0.1, 0.02], [0.09, 0.02], [0.06, -0.11], [0, -0.17], [-0.08, -0.08]], 0.018), M(L.hood ?? L.shirt), 0, 0.015, 0.09));
    }
    const elbow = new THREE.Group(); elbow.position.y = -0.32; g.add(elbow);
    elbow.add(mesh(form([[-0.27, 0.082, 0.085], [-0.08, 0.12, 0.13], [0, 0.11, 0.12]]), L.armor ? M(L.armor) : skin));
    elbow.add(mesh(cyl(0.067, 0.053, 0.065, 8), elven ? leather : boots, 0, -0.21, 0));
    const hand = new THREE.Group(); hand.position.y = -0.3; elbow.add(hand);
    hand.add(mesh(box(0.08, 0.1, 0.08), skin, 0, 0, 0));
    g.userData.elbow = elbow; g.userData.hand = hand;
    return g;
  }
  const armL = arm(1), armR = arm(-1);
  spine.add(armL, armR);

  root.scale.setScalar(scale);
  // Cache the resolved appearance: explicit undefined overrides can remove a hood.
  bakeBody(root, kind + JSON.stringify(L));
  const body = new Body(root, { pelvis, spine, head, armL, armR, legL, legR, eyeL, eyeR }, L, kind);
  return body;
}

const stumpMat = () => M('#8a0d0d', { emissive: '#2a0000' });

export class Body {
  constructor(root, parts, look, kind) {
    this.root = root; this.parts = parts; this.look = look; this.kind = kind;
    this.walkPhase = Math.random() * 10;
    this.weaponMesh = null; this.shieldMesh = null;
    this.prosthetics = {}; // part -> mesh
    this.wheelchair = null;
    this.deathT = 0;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    this.poseTime = 0;
    this.wheelAngle = 0;
  }

  setWeapon(weaponDef) {
    const hand = this.parts.armR.userData.hand;
    if (this.weaponMesh) { this.weaponMesh.parent?.remove(this.weaponMesh); this.weaponMesh = null; }
    if (!weaponDef || weaponDef.id === 'fists') return;
    const holder = this.isOwn(this.parts.armR) ? hand : (this.isOwn(this.parts.armL) ? this.parts.armL.userData.hand : null);
    if (!holder) return;
    this.weaponMesh = makeWeaponMesh(weaponDef);
    holder.add(this.weaponMesh);
  }
  setShield(has) {
    if (this.shieldMesh) { this.shieldMesh.parent?.remove(this.shieldMesh); this.shieldMesh = null; }
    if (!has || !this.isOwn(this.parts.armL)) return;
    const s = new THREE.Group();
    const outline = [[-0.23, 0.24], [0.23, 0.24], [0.25, 0.04], [0.15, -0.19], [0, -0.32], [-0.15, -0.19], [-0.25, 0.04]];
    const rim = mesh(panel(outline, 0.035), M('#92969d')); rim.rotation.y = Math.PI / 2; s.add(rim);
    const face = mesh(panel(outline.map(([x, y]) => [x * 0.88, y * 0.9]), 0.035), M(this.look.shirt), 0.026, 0, 0);
    face.rotation.y = Math.PI / 2; s.add(face);
    const boss = mesh(sph(0.06), M('#c8b77a'), 0.064, 0.025, 0); boss.scale.x = 0.5; s.add(boss);
    s.add(mesh(box(0.02, 0.35, 0.025), M('#c8b77a'), 0.051, -0.015, 0));
    s.position.set(0.08, 0.05, 0.05);
    this.parts.armL.userData.hand.add(s);
    bakeGroup(s, 'shield:' + this.look.shirt);
    this.shieldMesh = s;
  }

  // Remove a body part. Returns the detached Object3D (in world space, already added to scene) or null.
  detach(part, scene) {
    if (part === 'eyeL' || part === 'eyeR') {
      const e = this.parts[part];
      if (this.prosthetics[part]) { this.removeProsthetic(part); const so = this[part + 'Socket']; if (so) so.visible = true; return null; }
      if (!e.parent || !this.isOwn(e)) return null;
      const parent = e.parent;
      scene.attach(e);
      const socket = mesh(sph(0.03), stumpMat(), e.userData.ox ?? 0, 0, 0);
      socket.position.copy(parent.worldToLocal(e.getWorldPosition(new THREE.Vector3())));
      socket.userData.socketFor = part;
      parent.add(socket);
      this[part + 'Socket'] = socket;
      return e;
    }
    // a prosthetic can be knocked off too (it flies away like a real limb)
    const pros = this.prosthetics[part];
    if (pros && !part.startsWith('eye')) {
      delete this.prosthetics[part];
      scene.attach(pros);
      if (part === 'armR' && this.weaponMesh) this.weaponMesh = null;
      const st = this[part + 'Stump']; if (st) st.visible = true;
      return pros;
    }
    const p = this.parts[part];
    if (!p || !p.parent || !this.isOwn(p)) return null;
    const parent = p.parent;
    const local = p.position.clone();
    scene.attach(p);
    if (part === 'armR' && this.weaponMesh) { /* weapon flies away with the arm */ this.weaponMesh = null; }
    if (part === 'armL' && this.shieldMesh) this.shieldMesh = null;
    const radius = part === 'head' ? 0.07 : 0.075;
    const stump = mesh(cyl(radius, radius * 0.88, 0.025, 8), stumpMat(), local.x, local.y, local.z);
    parent.add(stump);
    // The severed limb has its own closed cut face; neither cap crosses a joint.
    p.add(mesh(cyl(radius * 0.88, radius, 0.015, 8), stumpMat()));
    this[part + 'Stump'] = stump;
    return p;
  }

  // prosthetic: 'hook' (arm), 'woodleg' (leg), 'glasseye' (eye)
  addProsthetic(part) {
    this.removeProsthetic(part);
    const stump = this[part + 'Stump'] || this[part + 'Socket'];
    if (part.startsWith('eye')) {
      const g = mesh(sph(0.03), M('#9ad8ff', { emissive: '#3080c0' }));
      if (stump) { g.position.copy(stump.position); stump.parent.add(g); stump.visible = false; }
      this.prosthetics[part] = g; return;
    }
    const wood = M('#8a5a2a'), metal = M('#9aa0a8');
    const g = new THREE.Group();
    const side = part.endsWith('L') ? 1 : -1;
    if (part.startsWith('arm')) {
      g.position.set(0.27 * side, 0.52, 0);
      g.add(mesh(cyl(0.05, 0.04, 0.55, 8), wood, 0, -0.28, 0));
      for (const y of [-0.055, -0.21, -0.48]) g.add(mesh(cyl(0.061, 0.057, 0.045, 8), metal, 0, y, 0));
      const hook = mesh(G('hook', () => new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI * 1.4)), metal, 0, -0.6, 0.03);
      hook.rotation.y = Math.PI / 2; g.add(hook);
      const elbow = new THREE.Group(); elbow.position.y = -0.32; const hand = new THREE.Group(); hand.position.y = -0.3; elbow.add(hand); g.add(elbow);
      g.userData.elbow = elbow; g.userData.hand = hand;
      this.parts.spine.add(g);
    } else {
      g.position.set(0.1 * side, -0.05, 0);
      g.add(mesh(cyl(0.07, 0.05, 0.4, 8), wood, 0, -0.22, 0));
      const knee = new THREE.Group(); knee.position.y = -0.45; g.add(knee);
      knee.add(mesh(cyl(0.035, 0.03, 0.46, 6), wood, 0, -0.23, 0));
      knee.add(mesh(cyl(0.05, 0.05, 0.03, 8), M('#333'), 0, -0.46, 0));
      for (const y of [-0.065, -0.32]) g.add(mesh(cyl(0.076, 0.07, 0.045, 8), metal, 0, y, 0));
      knee.add(mesh(cyl(0.046, 0.044, 0.045, 8), metal, 0, -0.08, 0));
      g.userData.knee = knee;
      this.parts.pelvis.add(g);
    }
    if (stump) stump.visible = false;
    bakeBody(g, 'prosthetic:' + part);
    this.prosthetics[part] = g;
  }
  removeProsthetic(part) {
    const p = this.prosthetics[part];
    if (p) { p.parent?.remove(p); delete this.prosthetics[part]; }
  }

  setWheelchair(on) {
    if (!on) { if (this.wheelchair) this.root.remove(this.wheelchair); this.wheelchair = null; return; }
    if (this.wheelchair) return;
    const wc = new THREE.Group();
    const metal = M('#555b62'), seat = M('#5a2a1a'), tire = M('#1a1a1a');
    wc.add(mesh(box(0.5, 0.06, 0.45), seat, 0, 0.5, 0));
    wc.add(mesh(box(0.5, 0.5, 0.05), seat, 0, 0.78, -0.22));
    for (const s of [1, -1]) {
      const wheel = new THREE.Group(); wheel.position.set(0.3 * s, 0.33, -0.05); wheel.userData.wheel = true;
      const w = mesh(G('wheel', () => new THREE.TorusGeometry(0.32, 0.03, 6, 20)), tire);
      w.rotation.y = Math.PI / 2; wheel.add(w);
      for (let i = 0; i < 4; i++) {
        const spoke = mesh(box(0.02, 0.59, 0.018), metal); spoke.rotation.x = i * Math.PI / 4; wheel.add(spoke);
      }
      wheel.add(mesh(cyl(0.055, 0.055, 0.08, 8), metal).rotateZ(Math.PI / 2));
      bakeGroup(wheel, 'wheelchair:wheel'); wc.add(wheel);
      wc.add(mesh(cyl(0.05, 0.05, 0.03, 8), tire, 0.18 * s, 0.06, 0.28).rotateZ(Math.PI / 2));
      wc.add(mesh(box(0.03, 0.4, 0.03), metal, 0.22 * s, 0.3, 0.25));
      wc.add(mesh(box(0.055, 0.05, 0.42), seat, 0.26 * s, 0.77, 0));
      wc.add(mesh(box(0.16, 0.025, 0.18), metal, 0.13 * s, 0.17, 0.39));
    }
    bakeGroup(wc, 'wheelchair:frame');
    this.root.add(wc);
    this.wheelchair = wc;
  }

  limbAttached(part) {
    return !!(this.parts[part]?.parent && this.parts[part].parent !== this.root.parent) || !!this.prosthetics[part];
  }
  leg(side) { return this.prosthetics['leg' + side] ?? (this.parts['leg' + side].parent && this.isOwn(this.parts['leg' + side]) ? this.parts['leg' + side] : null); }
  arm(side) { return this.prosthetics['arm' + side] ?? (this.parts['arm' + side].parent && this.isOwn(this.parts['arm' + side]) ? this.parts['arm' + side] : null); }
  isOwn(obj) { let o = obj; while (o) { if (o === this.root) return true; o = o.parent; } return false; }

  // s: { speed, moving, attackT(-1|0..1), attackStyle, blocking, mode: 'walk'|'crawl'|'wheelchair', airborne, dead, dt, aimPitch, limp }
  animate(s) {
    const { pelvis, spine, head } = this.parts;
    const dt = s.dt;
    this.poseTime += dt;
    const legL = this.leg('L'), legR = this.leg('R'), armL = this.arm('L'), armR = this.arm('R');
    if (s.dead) {
      this.deathT = Math.min(1, this.deathT + dt * 2.2);
      const t = this.deathT;
      const e = t * t;
      this.root.rotation.x = -e * Math.PI / 2 * 0.98;
      this.root.rotation.z = e * 0.25 * this.fallDir;
      pelvis.position.y = 0.95 - e * 0.75;
      if (armL) armL.rotation.set(-2.6 * e, 0, 0.6 * e);
      if (armR) armR.rotation.set(-2.2 * e, 0, -0.9 * e);
      if (legL) legL.rotation.set(0.15 * e, 0, 0.2 * e);
      if (legR) legR.rotation.set(-0.1 * e, 0, -0.15 * e);
      if (this.isOwn(head)) head.rotation.set(-0.3 * e, 0.6 * e * this.fallDir, 0);
      return;
    }
    this.root.rotation.x = 0; this.root.rotation.z = 0;
    const sp = Math.min(s.speed, 9);
    this.walkPhase += dt * (s.mode === 'crawl' ? 3.5 : 2.2 + sp * 1.1) * (s.moving ? 1 : 0);
    const ph = this.walkPhase;
    const amp = s.moving ? Math.min(0.9, 0.25 + sp * 0.11) : 0;
    const limp = s.limp ? 0.5 : 1;
    pelvis.rotation.z = 0;
    spine.rotation.set(0, 0, 0);

    if (s.mode === 'crawl') {
      pelvis.position.y = 0.22;
      pelvis.rotation.x = 1.35;
      spine.rotation.x = 0.05;
      if (this.isOwn(head)) head.rotation.set(-1.1, 0, 0);
      const a = Math.sin(ph) * 0.6;
      if (armL) { armL.rotation.set(-2.6 + a, 0, 0.2); armL.userData.elbow.rotation.x = -0.4; }
      if (armR) { armR.rotation.set(-2.6 - a, 0, -0.2); armR.userData.elbow.rotation.x = -0.4; }
      if (legL) { legL.rotation.set(-a * 0.4, 0, 0.1); legL.userData.knee.rotation.x = 0.3; }
      if (legR) { legR.rotation.set(a * 0.4, 0, -0.1); legR.userData.knee.rotation.x = 0.3; }
      const strike = armR ?? armL;
      if (strike && s.attackT >= 0) {
        const hit = s.attackStyle === 'bow' ? 0.75 : 0.55;
        const t = s.attackT, k = t < hit ? t / hit : (1 - t) / (1 - hit);
        strike.rotation.x = -2.3 - k * 0.65;
        strike.userData.elbow.rotation.x = -0.7 * (1 - k);
      }
      return;
    }
    pelvis.rotation.x = 0;
    if (this.isOwn(head)) head.rotation.set(-(s.aimPitch ?? 0) * 0.5, 0, 0);
    if (s.mode === 'wheelchair') {
      pelvis.position.y = 0.6;
      if (legL) { legL.rotation.set(-1.5, 0, 0.05); legL.userData.knee.rotation.x = 1.5; }
      if (legR) { legR.rotation.set(-1.5, 0, -0.05); legR.userData.knee.rotation.x = 1.5; }
      this.wheelAngle += s.speed * dt / 0.32;
      if (this.wheelchair) for (const c of this.wheelchair.children) if (c.userData.wheel) c.rotation.x = this.wheelAngle;
      if (armL && !s.blocking) { armL.rotation.set(-0.3 + (s.moving ? Math.sin(ph * 2) * 0.5 : 0), 0, 0.15); armL.userData.elbow.rotation.x = -0.6; }
    } else {
      const bob = s.moving ? Math.abs(Math.sin(ph)) * 0.05 * Math.min(1, sp / 3) : 0;
      pelvis.position.y = 0.95 + bob;
      spine.rotation.x = s.moving ? Math.min(0.09, sp * 0.012) : Math.sin(this.poseTime * 1.8) * 0.012;
      spine.rotation.z = s.moving ? Math.sin(ph) * 0.025 : 0;
      const swing = Math.sin(ph) * amp;
      if (legL) { legL.rotation.set(s.airborne ? -0.6 : swing * (legL === this.prosthetics.legL ? limp : 1), 0, 0); legL.userData.knee.rotation.x = s.airborne ? 0.9 : Math.max(0, -Math.cos(ph)) * amp * 1.2; }
      if (legR) { legR.rotation.set(s.airborne ? 0.2 : -swing * (legR === this.prosthetics.legR ? limp : 1), 0, 0); legR.userData.knee.rotation.x = s.airborne ? 0.4 : Math.max(0, Math.cos(ph)) * amp * 1.2; }
      if (armL && !s.blocking) { armL.rotation.set(-swing * 0.7, 0, 0.08); armL.userData.elbow.rotation.x = -0.3 - amp * 0.3; }
      if (!legL || !legR) pelvis.rotation.z = Math.sin(ph) * 0.12;
      else pelvis.rotation.z = 0;
    }
    spine.rotation.y = 0;
    if (spine.userData.cape) spine.userData.cape.rotation.x = 0.12 + (s.moving ? 0.25 + Math.sin(ph * 2) * 0.05 : 0);

    // Weapon arm, or the remaining left fist after amputation.
    const strikeArm = armR ?? armL;
    if (strikeArm) {
      if (s.attackT >= 0) {
        const t = s.attackT;
        if (s.attackStyle === 'bow') {
          strikeArm.rotation.set(-1.55, 0, 0.0); strikeArm.userData.elbow.rotation.x = -1.4 * (1 - t);
          if (armL) { armL.rotation.set(-1.55, 0, -0.25); armL.userData.elbow.rotation.x = 0; }
        } else if (s.attackStyle === 'thrust') {
          const k = t < 0.55 ? t / 0.55 : (1 - t) / 0.45;
          strikeArm.rotation.set(-0.6 - k * 0.9, 0, 0); strikeArm.userData.elbow.rotation.x = -1.4 + k * 1.4;
        } else {
          // overhead/diagonal slash: wind-up then swing down
          let x, z;
          if (t < 0.35) { const k = t / 0.35; x = -0.4 - k * 2.4; z = -k * 0.5; }
          else { const k = Math.min(1, (t - 0.35) / 0.3); x = -2.8 + k * 2.6; z = -0.5 + k * 1.0; }
          strikeArm.rotation.set(x, 0, z); strikeArm.userData.elbow.rotation.x = -0.25;
          spine.rotation.y = (t < 0.35 ? -t : (t - 0.35) * 1.2 - 0.35) * 0.9;
        }
      } else if (s.mode !== 'wheelchair') {
        const swing = Math.sin(ph) * amp;
        strikeArm.rotation.set(swing * 0.7 - (this.weaponMesh ? 0.25 : 0), 0, -0.08);
        strikeArm.userData.elbow.rotation.x = this.weaponMesh ? -0.9 : -0.3 - amp * 0.3;
      } else {
        strikeArm.rotation.set(-0.3 + (s.moving ? Math.sin(ph * 2) * 0.5 : 0), 0, -0.15); strikeArm.userData.elbow.rotation.x = -0.6;
      }
    }
    if (armL && s.blocking) { armL.rotation.set(-1.4, 0.5, -0.4); armL.userData.elbow.rotation.x = -1.1; }
  }
}
