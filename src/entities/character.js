// Procedural 3D humanoid built from primitives. Every limb is its own Group so it can be
// chopped off (and flies away as a 3D object), eyes can be gouged, legs replaced by prosthetics, etc.
// Model faces +Z. Character's LEFT side is +X.
import * as THREE from 'three';
import { makeWeaponMesh } from './weapons.js';

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
const cap = (r, l) => G(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 3, 8));
const sph = (r) => G(`s${r}`, () => new THREE.SphereGeometry(r, 10, 8));
const cone = (r, h, s = 8) => G(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const cyl = (r1, r2, h, s = 10) => G(`y${r1},${r2},${h},${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));

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

  const pelvis = new THREE.Group(); pelvis.position.y = 0.95; root.add(pelvis);
  pelvis.add(mesh(box(0.36, 0.2, 0.22), pants, 0, 0, 0));

  // ---- legs ----
  function leg(side) {
    const g = new THREE.Group(); g.position.set(0.1 * side, -0.05, 0);
    g.add(mesh(cap(0.075, 0.3), pants, 0, -0.22, 0));
    const knee = new THREE.Group(); knee.position.y = -0.45; g.add(knee);
    knee.add(mesh(cap(0.065, 0.28), pants, 0, -0.2, 0));
    knee.add(mesh(box(0.13, 0.1, 0.24), boots, 0, -0.42, 0.04));
    g.userData.knee = knee;
    return g;
  }
  const legL = leg(1), legR = leg(-1);
  pelvis.add(legL, legR);

  // ---- torso ----
  const spine = new THREE.Group(); spine.position.y = 0.08; pelvis.add(spine);
  spine.add(mesh(box(0.42, 0.55, 0.24), shirt, 0, 0.3, 0));
  if (L.belly) spine.add(mesh(sph(0.2), shirt, 0, 0.18, 0.08));
  if (L.armor) {
    spine.add(mesh(box(0.45, 0.36, 0.27), M(L.armor), 0, 0.4, 0));
    spine.add(mesh(sph(0.1), M(L.armor), 0.25, 0.56, 0)); // pauldrons
    spine.add(mesh(sph(0.1), M(L.armor), -0.25, 0.56, 0));
  }
  if (L.cape) {
    const capeM = new THREE.Mesh(G('cape', () => { const g = new THREE.PlaneGeometry(0.5, 0.95); g.translate(0, -0.47, 0); return g; }),
      M(L.cape, { side: THREE.DoubleSide }));
    capeM.position.set(0, 0.6, -0.14); capeM.rotation.x = 0.12; capeM.castShadow = true;
    spine.add(capeM);
    spine.userData.cape = capeM;
  }

  // ---- head ----
  const head = new THREE.Group(); head.position.y = 0.6; spine.add(head);
  head.add(mesh(cyl(0.05, 0.06, 0.1), skin, 0, 0.03, 0));
  head.add(mesh(box(0.22, 0.25, 0.23), skin, 0, 0.18, 0));
  const eyeMat = M('#ffffff'), pupil = M(L.eyes ?? '#2a2a3a', L.eyes ? { emissive: L.eyes } : {});
  function eye(side) {
    const e = new THREE.Group(); e.position.set(0.055 * side, 0.2, 0.115);
    e.add(mesh(sph(0.028), eyeMat));
    e.add(mesh(sph(0.015), pupil, 0, 0, 0.02));
    return e;
  }
  const eyeL = eye(1), eyeR = eye(-1);
  head.add(eyeL, eyeR);
  head.add(mesh(box(0.04, 0.06, 0.04), skin, 0, 0.15, 0.125)); // nose
  if (L.hair) head.add(mesh(box(0.24, 0.08, 0.25), M(L.hair), 0, 0.31, -0.01));
  if (L.hair && kind.startsWith('elf')) head.add(mesh(box(0.24, 0.22, 0.06), M(L.hair), 0, 0.2, -0.12));
  if (L.beard) head.add(mesh(box(0.2, 0.12, 0.06), M(L.beard), 0, 0.06, 0.11));
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
    if (L.helmet === 'steel' || L.helmet === 'plume') head.add(mesh(box(0.03, 0.12, 0.05), steel, 0, 0.16, 0.14)); // nasal
    if (L.helmet === 'plume') {
      const p = mesh(box(0.04, 0.12, 0.3), M('#d01818'), 0, 0.42, -0.02); head.add(p);
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
    g.add(mesh(cap(0.06, 0.22), shirt, 0, -0.16, 0));
    const elbow = new THREE.Group(); elbow.position.y = -0.32; g.add(elbow);
    elbow.add(mesh(cap(0.05, 0.2), L.armor ? M(L.armor) : skin, 0, -0.14, 0));
    const hand = new THREE.Group(); hand.position.y = -0.3; elbow.add(hand);
    hand.add(mesh(box(0.08, 0.1, 0.08), skin, 0, 0, 0));
    g.userData.elbow = elbow; g.userData.hand = hand;
    return g;
  }
  const armL = arm(1), armR = arm(-1);
  spine.add(armL, armR);

  root.scale.setScalar(scale);
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
  }

  setWeapon(weaponDef) {
    const hand = this.parts.armR.userData.hand;
    if (this.weaponMesh) { this.weaponMesh.parent?.remove(this.weaponMesh); this.weaponMesh = null; }
    if (!weaponDef || weaponDef.id === 'fists') return;
    const holder = this.parts.armR.parent ? hand : (this.parts.armL.parent ? this.parts.armL.userData.hand : null);
    if (!holder) return;
    this.weaponMesh = makeWeaponMesh(weaponDef);
    holder.add(this.weaponMesh);
  }
  setShield(has) {
    if (this.shieldMesh) { this.shieldMesh.parent?.remove(this.shieldMesh); this.shieldMesh = null; }
    if (!has || !this.parts.armL.parent) return;
    const s = new THREE.Group();
    const disc = mesh(cyl(0.28, 0.28, 0.05, 14), M(this.look.shirt), 0, 0, 0); disc.rotation.z = Math.PI / 2; s.add(disc);
    const boss = mesh(sph(0.07), M('#c8c8c8'), 0.04, 0, 0); s.add(boss);
    s.position.set(0.08, 0.05, 0.05);
    this.parts.armL.userData.hand.add(s);
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
    const stump = mesh(sph(part === 'head' ? 0.07 : 0.075), stumpMat(), local.x, local.y, local.z);
    parent.add(stump);
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
      g.userData.knee = knee;
      this.parts.pelvis.add(g);
    }
    if (stump) stump.visible = false;
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
      const w = mesh(G('wheel', () => new THREE.TorusGeometry(0.32, 0.03, 6, 20)), tire, 0.3 * s, 0.33, -0.05);
      w.rotation.y = Math.PI / 2; wc.add(w); w.userData.wheel = true;
      const spoke = mesh(box(0.02, 0.6, 0.02), metal, 0.3 * s, 0.33, -0.05); wc.add(spoke); spoke.userData.wheel = true;
      wc.add(mesh(cyl(0.05, 0.05, 0.03, 8), tire, 0.18 * s, 0.06, 0.28).rotateZ(Math.PI / 2));
      wc.add(mesh(box(0.03, 0.4, 0.03), metal, 0.22 * s, 0.3, 0.25));
    }
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
      head.rotation.set(-0.3 * e, 0.6 * e * this.fallDir, 0);
      return;
    }
    this.root.rotation.x = 0; this.root.rotation.z = 0;
    const sp = Math.min(s.speed, 9);
    this.walkPhase += dt * (s.mode === 'crawl' ? 3.5 : 2.2 + sp * 1.1) * (s.moving ? 1 : 0);
    const ph = this.walkPhase;
    const amp = s.moving ? Math.min(0.9, 0.25 + sp * 0.11) : 0;
    const limp = s.limp ? 0.5 : 1;

    if (s.mode === 'crawl') {
      pelvis.position.y = 0.22;
      pelvis.rotation.x = 1.35;
      spine.rotation.x = 0.05;
      head.rotation.x = -1.1;
      const a = Math.sin(ph) * 0.6;
      if (armL) { armL.rotation.set(-2.6 + a, 0, 0.2); armL.userData.elbow.rotation.x = -0.4; }
      if (armR) { armR.rotation.set(-2.6 - a, 0, -0.2); armR.userData.elbow.rotation.x = -0.4; }
      if (legL) { legL.rotation.set(-a * 0.4, 0, 0.1); legL.userData.knee.rotation.x = 0.3; }
      if (legR) { legR.rotation.set(a * 0.4, 0, -0.1); legR.userData.knee.rotation.x = 0.3; }
      return;
    }
    pelvis.rotation.x = 0; head.rotation.x = -(s.aimPitch ?? 0) * 0.5; head.rotation.y = 0;
    if (s.mode === 'wheelchair') {
      pelvis.position.y = 0.6;
      if (legL) { legL.rotation.set(-1.5, 0, 0.05); legL.userData.knee.rotation.x = 1.5; }
      if (legR) { legR.rotation.set(-1.5, 0, -0.05); legR.userData.knee.rotation.x = 1.5; }
      if (this.wheelchair) for (const c of this.wheelchair.children) if (c.userData.wheel) c.rotation.x = ph * 2;
      if (armL && !s.blocking) { armL.rotation.set(-0.3 + (s.moving ? Math.sin(ph * 2) * 0.5 : 0), 0, 0.15); armL.userData.elbow.rotation.x = -0.6; }
    } else {
      const bob = s.moving ? Math.abs(Math.sin(ph)) * 0.05 * Math.min(1, sp / 3) : 0;
      pelvis.position.y = 0.95 + bob - (s.airborne ? 0 : 0);
      const swing = Math.sin(ph) * amp;
      if (legL) { legL.rotation.set(s.airborne ? -0.6 : swing * (legL === this.prosthetics.legL ? limp : 1), 0, 0); legL.userData.knee.rotation.x = s.airborne ? 0.9 : Math.max(0, -Math.cos(ph)) * amp * 1.2; }
      if (legR) { legR.rotation.set(s.airborne ? 0.2 : -swing * (legR === this.prosthetics.legR ? limp : 1), 0, 0); legR.userData.knee.rotation.x = s.airborne ? 0.4 : Math.max(0, Math.cos(ph)) * amp * 1.2; }
      if (armL && !s.blocking) { armL.rotation.set(-swing * 0.7, 0, 0.08); armL.userData.elbow.rotation.x = -0.3 - amp * 0.3; }
      if (!legL || !legR) pelvis.rotation.z = Math.sin(ph) * 0.12;
      else pelvis.rotation.z = 0;
    }
    spine.rotation.y = 0;
    if (spine.userData.cape) spine.userData.cape.rotation.x = 0.12 + (s.moving ? 0.25 + Math.sin(ph * 2) * 0.05 : 0);

    // right arm: attack animation or idle
    if (armR) {
      if (s.attackT >= 0) {
        const t = s.attackT;
        if (s.attackStyle === 'bow') {
          armR.rotation.set(-1.55, 0, 0.0); armR.userData.elbow.rotation.x = -1.4 * (1 - t);
          if (armL) { armL.rotation.set(-1.55, 0, -0.25); armL.userData.elbow.rotation.x = 0; }
        } else if (s.attackStyle === 'thrust') {
          const k = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
          armR.rotation.set(-0.6 - k * 0.9, 0, 0); armR.userData.elbow.rotation.x = -1.4 + k * 1.4;
        } else {
          // overhead/diagonal slash: wind-up then swing down
          let x, z;
          if (t < 0.35) { const k = t / 0.35; x = -0.4 - k * 2.4; z = -k * 0.5; }
          else { const k = Math.min(1, (t - 0.35) / 0.3); x = -2.8 + k * 2.6; z = -0.5 + k * 1.0; }
          armR.rotation.set(x, 0, z); armR.userData.elbow.rotation.x = -0.25;
          spine.rotation.y = (t < 0.35 ? -t : (t - 0.35) * 1.2 - 0.35) * 0.9;
        }
      } else if (s.mode !== 'wheelchair') {
        const swing = Math.sin(ph) * amp;
        armR.rotation.set(swing * 0.7 - (this.weaponMesh ? 0.25 : 0), 0, -0.08);
        armR.userData.elbow.rotation.x = this.weaponMesh ? -0.9 : -0.3 - amp * 0.3;
      } else {
        armR.rotation.set(-0.3 + (s.moving ? Math.sin(ph * 2) * 0.5 : 0), 0, -0.15); armR.userData.elbow.rotation.x = -0.6;
      }
    }
    if (armL && s.blocking) { armL.rotation.set(-1.4, 0.5, -0.4); armL.userData.elbow.rotation.x = -1.1; }
  }
}
