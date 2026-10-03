// Cheap atmosphere particles around the camera: fireflies (elf forest at night), falling leaves (forest),
// dust motes (town / palace by day), snow (high mountains), lightning flash, campfire flicker lights.
// 4 Points draw calls total; each hidden when its weight is zero.
import * as THREE from 'three';
import { game } from '../../core/game.js';
import { groundAt } from '../../world/terrain.js';
import { W, getFires } from './soundscape.js';

const VS = `
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime, uSize, uBlink;
  varying float vA; varying vec3 vC; varying float vRot;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = -mv.z < 0.6 ? 0.0 : min(uSize * (120.0 / -mv.z), 24.0);
    float b = sin(uTime * (1.3 + fract(aPhase * 7.1)) + aPhase * 6.283);
    vA = mix(1.0, smoothstep(0.2, 1.0, b), uBlink);
    vC = aColor; vRot = aPhase * 6.283 + uTime * (0.5 + fract(aPhase * 3.3));
  }`;
const FS = `
  uniform float uOpacity, uShape, uLight;
  varying float vA; varying vec3 vC; varying float vRot;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a;
    if (uShape > 0.5) { // leaf: rotated ellipse
      float c = cos(vRot), s = sin(vRot);
      vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
      a = 1.0 - smoothstep(0.18, 0.24, length(q * vec2(1.0, 2.4)));
    } else a = 1.0 - smoothstep(0.0, 0.5, length(p)) ;
    float alpha = a * vA * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vC * uLight, alpha);
  }`;

function makeLayer(n, { size, blink = 0, shape = 0, additive = false, colors }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), ph = new Float32Array(n), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    ph[i] = Math.random();
    const c = colors[Math.floor(Math.random() * colors.length)];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    pos[i * 3 + 1] = -9999;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: size }, uBlink: { value: blink }, uOpacity: { value: 0 }, uShape: { value: shape }, uLight: { value: 1 } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 5;
  game.scene.add(pts);
  return { pts, pos, n, mat, vel: new Float32Array(n * 3), init: false, w: 0 };
}

let layers = null, flashLight = null, flashT = 0, fireLights = [];

export function initVisuals() {
  layers = {
    fireflies: makeLayer(90, { size: 0.9, blink: 1, additive: true, colors: [[1, 0.95, 0.4], [0.75, 1, 0.35]] }),
    leaves: makeLayer(70, { size: 2.2, shape: 1, colors: [[0.55, 0.62, 0.18], [0.75, 0.55, 0.15], [0.62, 0.35, 0.1], [0.4, 0.55, 0.2]] }),
    dust: makeLayer(60, { size: 0.35, blink: 0.6, additive: true, colors: [[1, 0.95, 0.8]] }),
    snow: makeLayer(600, { size: 0.55, colors: [[1, 1, 1], [0.92, 0.95, 1]] }),
  };
  flashLight = new THREE.AmbientLight(0xc8d8ff, 0);
  game.scene.add(flashLight);
  // campfire flicker: only if the world has campfires (adding lights later would force shader recompiles)
  const fires = [];
  try { for (const [k, v] of game.places) if (v?.x != null && /fire|костер|костёр|очаг/i.test(k + ' ' + (v.name ?? ''))) fires.push(v); } catch (e) { /**/ }
  if (fires.length) {
    for (let i = 0; i < Math.min(2, fires.length); i++) {
      const l = new THREE.PointLight(0xff9a40, 0, 16, 2);
      l.position.set(0, -999, 0);
      game.scene.add(l); fireLights.push(l);
    }
  }
  game.ambience = game.ambience ?? {};
  game.ambience.flash = () => { flashT = 0.35; };
}

const BOX = { fireflies: 28, leaves: 22, dust: 12, snow: 26 };

function respawn(L, name, i, cx, cy, cz, top) {
  const r = BOX[name];
  const x = cx + (Math.random() * 2 - 1) * r, z = cz + (Math.random() * 2 - 1) * r;
  const g = groundAt(x, z);
  let y;
  if (name === 'fireflies') y = g + 0.4 + Math.random() * 2.5;
  else if (name === 'dust') y = cy + (Math.random() - 0.5) * 4;
  else y = top ? cy + 6 + Math.random() * 10 : g + Math.random() * (cy + 14 - g);
  L.pos[i * 3] = x; L.pos[i * 3 + 1] = y; L.pos[i * 3 + 2] = z;
  const v = L.vel;
  if (name === 'snow') { v[i * 3] = 0.3; v[i * 3 + 1] = -(1.2 + Math.random() * 0.8); v[i * 3 + 2] = 0.1; }
  else if (name === 'leaves') { v[i * 3] = (Math.random() - 0.5) * 0.6; v[i * 3 + 1] = -(0.6 + Math.random() * 0.5); v[i * 3 + 2] = (Math.random() - 0.5) * 0.6; }
  else { v[i * 3] = (Math.random() - 0.5) * 0.4; v[i * 3 + 1] = (Math.random() - 0.5) * 0.2; v[i * 3 + 2] = (Math.random() - 0.5) * 0.4; }
}

export function updateVisuals(dt) {
  if (!layers) return;
  const cam = game.camera.position;
  const t = game.time;
  const light = game.ambientLevel ?? 1;
  const hi = THREE.MathUtils.smoothstep(cam.y, 70, 130);
  const target = {
    fireflies: W.elves * W.night,
    leaves: W.elves * 0.9 + (W.humans + W.empire) * 0.15,
    dust: (W.town + W.palace) * W.day * 0.8,
    snow: Math.max(hi, W.villain * 0.25) * (W.villain > 0.3 ? 1 : 0),
  };
  for (const name in layers) {
    const L = layers[name];
    L.w += (target[name] - L.w) * Math.min(1, dt * 0.5);
    const vis = L.w > 0.02;
    L.pts.visible = vis;
    if (!vis) { L.init = false; continue; }
    const u = L.mat.uniforms;
    u.uTime.value = t;
    u.uOpacity.value = Math.min(1, L.w) * (name === 'dust' ? 0.5 : name === 'snow' ? 0.85 : 1);
    u.uLight.value = name === 'fireflies' ? 1.4 : name === 'dust' ? 0.9 : 0.35 + light * 0.75;
    if (!L.init) { for (let i = 0; i < L.n; i++) respawn(L, name, i, cam.x, cam.y, cam.z, false); L.init = true; }
    const r = BOX[name], p = L.pos, v = L.vel;
    // only a fraction of the layer is "active" depending on weight (density fade)
    const active = Math.floor(L.n * Math.min(1, L.w));
    for (let i = 0; i < L.n; i++) {
      const k = i * 3;
      if (i >= active) { p[k + 1] = -9999; continue; }
      if (p[k + 1] < -9000) { respawn(L, name, i, cam.x, cam.y, cam.z, true); continue; }
      let sway = 0;
      if (name === 'leaves') sway = Math.sin(t * 1.7 + i) * 0.9;
      else if (name === 'snow') sway = Math.sin(t * 0.9 + i * 0.37) * 0.35;
      else if (name === 'fireflies') { v[k] += (Math.random() - 0.5) * dt; v[k + 2] += (Math.random() - 0.5) * dt; v[k + 1] += (Math.random() - 0.5) * dt * 0.5; v[k] *= 0.99; v[k + 1] *= 0.98; v[k + 2] *= 0.99; }
      p[k] += (v[k] + sway) * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += (v[k + 2] + sway * 0.5) * dt;
      const dx = p[k] - cam.x, dz = p[k + 2] - cam.z;
      const out = Math.abs(dx) > r || Math.abs(dz) > r;
      let below = false;
      if (name === 'leaves' || name === 'snow') below = p[k + 1] < groundAt(p[k], p[k + 2]) + 0.05 || p[k + 1] < cam.y - 25;
      else if (name === 'fireflies') below = Math.abs(p[k + 1] - groundAt(p[k], p[k + 2]) - 1.5) > 3;
      else below = Math.abs(p[k + 1] - cam.y) > 6;
      if (out || below) {
        if (out && !below && name !== 'dust') { // wrap horizontally (keeps density stable when running)
          if (Math.abs(dx) > r) p[k] -= Math.sign(dx) * r * 2;
          if (Math.abs(dz) > r) p[k + 2] -= Math.sign(dz) * r * 2;
          if (name === 'fireflies') p[k + 1] = groundAt(p[k], p[k + 2]) + 0.5 + Math.random() * 2;
        } else respawn(L, name, i, cam.x, cam.y, cam.z, name === 'leaves' || name === 'snow');
      }
    }
    L.pts.geometry.attributes.position.needsUpdate = true;
  }
  // lightning flash
  if (flashLight) {
    if (flashT > 0) { flashT -= dt; flashLight.intensity = flashT > 0 ? (Math.random() < 0.6 ? 2.2 : 0.4) * (flashT / 0.35) : 0; }
    else flashLight.intensity = 0;
  }
  // campfire flicker (nearest fires)
  if (fireLights.length) {
    const fires = getFires().slice().sort((a, b) => ((a.x - cam.x) ** 2 + (a.z - cam.z) ** 2) - ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2));
    fireLights.forEach((l, i) => {
      const f = fires[i];
      if (!f || (f.x - cam.x) ** 2 + (f.z - cam.z) ** 2 > 90 * 90) { l.intensity = 0; return; }
      l.position.set(f.x, (f.y ?? groundAt(f.x, f.z)) + 1.2, f.z);
      l.intensity = (1 - (game.ambientLevel ?? 1) * 0.7) * (6 + Math.sin(t * 13 + i) * 1.2 + Math.sin(t * 29.7 + i * 3) * 0.8 + Math.random() * 1.2);
    });
  }
}
