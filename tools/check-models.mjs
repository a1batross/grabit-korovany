// Pure model-contract regression checks; no renderer, DOM, or game-state mutation.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBody, LOOKS } from '../src/entities/character.js';
import { makeWeaponMesh, WEAPONS } from '../src/entities/weapons.js';

const neutral = { dt: 1 / 30, speed: 0, moving: false, attackT: -1, attackStyle: 'slash', blocking: false, mode: 'walk' };
function animate(body, overrides = {}) { body.animate({ ...neutral, ...overrides }); body.root.updateMatrixWorld(true); }
function inspect(root) {
  let meshes = 0, triangles = 0;
  root.traverse(o => {
    assert(o.matrixWorld.elements.every(Number.isFinite), 'finite world transform');
    if (!o.isMesh) return;
    meshes++;
    const geo = o.geometry;
    for (const name of ['position', 'normal']) {
      assert(geo.attributes[name], `geometry has ${name}`);
      assert(geo.attributes[name].array.every(Number.isFinite), `finite ${name}`);
    }
    triangles += (geo.index?.count ?? geo.attributes.position.count) / 3;
  });
  return { meshes, triangles };
}
const results = [];
for (const kind of Object.keys(LOOKS)) {
  const body = createBody(kind), scene = new THREE.Scene();
  scene.add(body.root); body.root.position.set(3, 2, -5); body.root.rotation.y = 0.7;
  for (const key of ['pelvis', 'spine', 'head', 'armL', 'armR', 'legL', 'legR', 'eyeL', 'eyeR']) assert(body.parts[key]?.isGroup, key);
  for (const key of ['armL', 'armR']) assert(body.parts[key].userData.elbow && body.parts[key].userData.hand);
  for (const key of ['legL', 'legR']) assert(body.parts[key].userData.knee);
  body.setWeapon(WEAPONS.sword); body.setShield(true);
  assert(body.weaponMesh.parent === body.parts.armR.userData.hand);
  for (const mode of ['walk', 'crawl', 'wheelchair', 'walk']) {
    body.setWheelchair(mode === 'wheelchair');
    for (const attackStyle of ['slash', 'thrust', 'bow']) for (const attackT of [-1, 0, 0.35, 0.55, 0.75, 1]) {
      animate(body, { mode, attackStyle, attackT, speed: 3.8, moving: true, blocking: attackT < 0 }); inspect(body.root);
    }
  }
  animate(body, { airborne: true }); animate(body);
  assert.equal(body.parts.pelvis.rotation.x, 0, 'crawl tilt resets');
  results.push({ kind, ...inspect(body.root) });
  for (const part of ['armR', 'armL', 'legR', 'legL', 'eyeL', 'eyeR']) {
    scene.updateMatrixWorld(true);
    const before = body.parts[part].getWorldPosition(new THREE.Vector3());
    const detached = body.detach(part, scene);
    assert(detached && detached.parent === scene && !body.isOwn(detached), `${part} detaches`);
    assert(before.distanceTo(detached.getWorldPosition(new THREE.Vector3())) < 1e-6, 'world position preserved');
    assert.equal(body.detach(part, scene), null, 'double detachment is harmless');
    body.addProsthetic(part); assert(body.prosthetics[part] && body.isOwn(body.prosthetics[part]));
    for (const mode of ['crawl', 'wheelchair', 'walk']) animate(body, { mode, attackT: 0.55 });
    const prosthetic = body.prosthetics[part]; body.detach(part, scene);
    assert(!body.prosthetics[part], 'prosthetic can be knocked off');
    if (!part.startsWith('eye')) assert.equal(prosthetic.parent, scene);
    body.addProsthetic(part); animate(body); inspect(body.root);
  }
  body.setWeapon(WEAPONS.sword); body.setShield(true);
  assert.equal(body.weaponMesh, null, 'weapons cannot attach to detached original arms');
  assert.equal(body.shieldMesh, null, 'shield cannot attach to detached original arm');
  body.setWheelchair(true);
  const wheels = body.wheelchair.children.filter(c => c.userData.wheel);
  assert.equal(wheels.length, 2);
  animate(body, { mode: 'wheelchair', speed: 2, moving: true });
  const angles = wheels.map(w => w.rotation.x);
  animate(body, { mode: 'wheelchair' });
  assert.deepEqual(wheels.map(w => w.rotation.x), angles, 'stationary wheels do not spin');
  const head = body.detach('head', scene), rot = head.rotation.clone();
  animate(body, { dead: true }); animate(body, { dead: true });
  assert(head.rotation.equals(rot), 'corpse animation cannot rotate the detached head');
  inspect(body.root);
}
// Cache entries must distinguish a disguise that explicitly removes the default hood.
const hood = createBody('elf'), noHood = createBody('elf', { hood: undefined });
assert.notEqual(hood.parts.head.children.find(o => o.isMesh).geometry, noHood.parts.head.children.find(o => o.isMesh).geometry);
const a = createBody('guard'), b = createBody('guard');
assert.notEqual(a.parts.spine, b.parts.spine);
assert.equal(a.parts.spine.children.find(o => o.isMesh).geometry, b.parts.spine.children.find(o => o.isMesh).geometry);
// Missing right arm still has a visible left-fist attack.
const scene = new THREE.Scene(); scene.add(a.root); a.detach('armR', scene);
animate(a, { attackStyle: 'thrust', attackT: 0 }); const windup = a.parts.armL.rotation.x;
animate(a, { attackStyle: 'thrust', attackT: 0.55 }); assert.notEqual(a.parts.armL.rotation.x, windup);
for (const weapon of Object.values(WEAPONS)) {
  const a = makeWeaponMesh(weapon), b = makeWeaponMesh(weapon);
  assert.notEqual(a, b); assert(inspect(a).meshes <= 2, 'weapon draw-call budget');
  if (a.children.length) assert.equal(a.children[0].geometry, b.children[0].geometry, 'shared weapon geometry');
  a.rotation.x = 9; assert.notEqual(a.rotation.x, b.rotation.x, 'independent transforms');
}
console.table(results);
console.log('PASS: model hierarchy, geometry, animation, injuries, prosthetics, wheelchairs, weapon caches.');
