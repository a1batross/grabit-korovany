// Player controller + camera (third person by default, V toggles first person).
// Also hosts the interaction registry: other systems add interactables the player can [E]-use.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { input } from '../core/input.js';
import { groundAt } from '../world/terrain.js';
import { segmentBlocked } from '../world/colliders.js';

export const interactables = new Set();
// Register: { pos: () => Vector3|{x,y,z}, r: number, label: () => string, use: () => void, enabled?: () => bool }
export function addInteractable(o) { interactables.add(o); return () => interactables.delete(o); }

export const cam = {
  yaw: 0, pitch: -0.15, dist: 4.2, firstPerson: false, shake: 0,
  sensitivity: 0.0022,
};

let currentInteract = null;
export function getCurrentInteract() { return currentInteract; }

const _v = new THREE.Vector3(), _f = new THREE.Vector3();

export function initPlayerControl() {
  game.addSystem({ name: 'player', order: 0, update: updatePlayer });
  game.addSystem({ name: 'camera', order: 100, update: updateCamera });
  game.bus.on('actor:hit', ({ target, damage }) => { if (target === game.player) cam.shake = Math.min(0.6, cam.shake + damage / 40); });
}

function updatePlayer(dt) {
  const p = game.player;
  if (!p) return;
  const it = p.intent;
  it.mx = 0; it.mz = 0; it.jump = false; it.attack = false; it.block = false; it.run = false;
  if (!p.alive || game.uiOpen || game.paused) { it.yaw = null; return; }

  // mouse look
  cam.yaw -= input.mouseDX * cam.sensitivity;
  cam.pitch -= input.mouseDY * cam.sensitivity * (game.invertY ? -1 : 1);
  cam.pitch = Math.max(-1.35, Math.min(1.25, cam.pitch));
  if (input.wheel && !cam.firstPerson) cam.dist = Math.max(2, Math.min(9, cam.dist + input.wheel * 0.5));
  if (input.hit('KeyV')) cam.firstPerson = !cam.firstPerson;

  // movement relative to camera
  const fwdX = Math.sin(cam.yaw), fwdZ = Math.cos(cam.yaw);
  let mx = 0, mz = 0;
  if (input.down('KeyW')) { mx += fwdX; mz += fwdZ; }
  if (input.down('KeyS')) { mx -= fwdX; mz -= fwdZ; }
  if (input.down('KeyA')) { mx += fwdZ; mz -= fwdX; }
  if (input.down('KeyD')) { mx -= fwdZ; mz += fwdX; }
  const l = Math.hypot(mx, mz);
  if (l > 0) { mx /= l; mz /= l; }
  it.mx = mx; it.mz = mz;
  it.run = input.down('ShiftLeft') || input.down('ShiftRight');
  it.jump = input.hit('Space');
  it.attack = input.buttons.has(0) && input.locked;
  it.block = input.buttons.has(2) && input.locked;
  // face camera direction while fighting / in first person / when moving
  if (cam.firstPerson || it.attack || it.block || p.attackT >= 0 || l > 0) it.yaw = cam.yaw;
  else it.yaw = null;

  p.aimPitch = cam.pitch;
  p.aimDir = _f.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).clone();

  // wheelchair toggle
  if (input.hit('KeyX') && p.hasWheelchair && p.legsOk < 2) {
    p.useWheelchair = !p.useWheelchair;
    p.body.setWheelchair(p.useWheelchair);
    game.bus.emit('notify', { text: p.useWheelchair ? 'Вы сели в коляску' : 'Вы слезли с коляски и ползёте' });
  }

  // interaction
  currentInteract = null;
  let best = Infinity;
  for (const o of interactables) {
    if (o.enabled && !o.enabled()) continue;
    const op = o.pos();
    const dx = op.x - p.pos.x, dz = op.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > (o.r ?? 2.5)) continue;
    const facing = d > 0.5 ? (dx * fwdX + dz * fwdZ) / d : 1;
    const score = d - facing * 1.5;
    if (score < best) { best = score; currentInteract = o; }
  }
  if (currentInteract && input.hit('KeyE')) currentInteract.use();
}

function updateCamera(dt) {
  const p = game.player;
  const camera = game.camera;
  if (!p) return;
  const head = p.body.parts.head;
  const crawl = p.moveMode === 'crawl';
  const eyeY = p.pos.y + (crawl ? 0.45 : p.moveMode === 'wheelchair' ? 1.25 : 1.65) * p.scale;
  const shake = cam.shake; cam.shake = Math.max(0, cam.shake - dt * 1.5);
  const sx = (Math.random() - 0.5) * shake * 0.3, sy = (Math.random() - 0.5) * shake * 0.3;

  if (!p.alive) {
    // death cam: slowly orbit the corpse
    cam.yaw += dt * 0.2;
    _v.set(p.pos.x - Math.sin(cam.yaw) * 6, p.pos.y + 4, p.pos.z - Math.cos(cam.yaw) * 6);
    camera.position.lerp(_v, Math.min(1, dt * 2));
    camera.lookAt(p.pos.x, p.pos.y + 0.3, p.pos.z);
    head.visible = true;
    return;
  }
  const dir = _f.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  if (cam.firstPerson) {
    head.visible = false;
    camera.position.set(p.pos.x + dir.x * 0.25 + sx, eyeY + sy, p.pos.z + dir.z * 0.25);
    camera.lookAt(camera.position.x + dir.x, camera.position.y + dir.y, camera.position.z + dir.z);
  } else {
    head.visible = true;
    // over-the-shoulder
    const rightX = -Math.cos(cam.yaw), rightZ = Math.sin(cam.yaw);
    const shoulder = 0.55;
    const tx = p.pos.x + rightX * shoulder, tz = p.pos.z + rightZ * shoulder, ty = eyeY + 0.15;
    let d = cam.dist;
    let cx = tx - dir.x * d, cy = ty - dir.y * d, cz = tz - dir.z * d;
    // keep above terrain
    for (let i = 0; i < 6; i++) {
      const g = groundAt(cx, cz) + 0.4;
      if (cy >= g) break;
      d *= 0.75; cx = tx - dir.x * d; cy = ty - dir.y * d; cz = tz - dir.z * d;
    }
    // pull the camera in front of walls
    for (let i = 0; i < 8 && d > 0.6 && segmentBlocked(tx, ty, tz, tx - dir.x * (d + 0.5), ty - dir.y * (d + 0.5), tz - dir.z * (d + 0.5), 0.35); i++) {
      d *= 0.75; cx = tx - dir.x * d; cy = ty - dir.y * d; cz = tz - dir.z * d;
    }
    cy = Math.max(cy, groundAt(cx, cz) + 0.4);
    // camera squeezed against a wall: hide our own body instead of filling the screen with it
    if (d < 1.3) p.body.root.visible = false;
    camera.position.set(cx + sx, cy + sy, cz);
    camera.lookAt(tx + dir.x * 10, ty + dir.y * 10, tz + dir.z * 10);
  }
}
