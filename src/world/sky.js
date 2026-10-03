// Day/night cycle: sun, moon, sky dome gradient, stars, fog. Sets game.ambientLevel (0.15..1).
import * as THREE from 'three';
import { game } from '../core/game.js';

let sun, hemi, sky, skyMat, stars, sunMesh, moonMesh;
const dayTop = new THREE.Color('#4a86d8'), dayHor = new THREE.Color('#bcd6ee');
const duskTop = new THREE.Color('#3a3a78'), duskHor = new THREE.Color('#f09050');
const nightTop = new THREE.Color('#05070f'), nightHor = new THREE.Color('#141b2e');
const tmpA = new THREE.Color(), tmpB = new THREE.Color();

export function initSky() {
  const scene = game.scene;
  scene.fog = new THREE.Fog(0xbcd6ee, 120, 900);
  hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a30, 0.9);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff1d8, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);

  skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.6)), 1.0);
      #include <colorspace_fragment>
    }`,
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  const sg = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 1500; i++) {
    const t = Math.random() * Math.PI * 2, p = Math.acos(Math.random() * 0.95);
    sp.push(Math.sin(p) * Math.cos(t) * 1400, Math.cos(p) * 1400, Math.sin(p) * Math.sin(t) * 1400);
  }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false }));
  stars.frustumCulled = false;
  scene.add(stars);
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  moonMesh = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 8), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
  scene.add(sunMesh, moonMesh);

  game.addSystem({ name: 'sky', order: 95, update: updateSky });
}

function updateSky(dt) {
  if (!game.paused && !game.uiOpen) game.worldTime += dt * game.timeScale;
  const h = game.hour;
  const ang = ((h - 6) / 24) * Math.PI * 2; // 6:00 sunrise, 12:00 zenith
  const elev = Math.sin(ang);
  const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
  const dusk = Math.max(0, 1 - Math.abs(elev) * 4) ;
  const cam = game.camera.position;

  const sdir = new THREE.Vector3(Math.cos(ang), Math.max(elev, -0.3), 0.35).normalize();
  sky.position.copy(cam); stars.position.copy(cam);
  sunMesh.position.copy(cam).addScaledVector(sdir, 1300);
  moonMesh.position.copy(cam).addScaledVector(sdir, -1300);
  sunMesh.visible = elev > -0.1;
  moonMesh.visible = elev < 0.1;

  // light from the sun by day, the moon by night
  const ldir = elev > 0 ? sdir : sdir.clone().negate();
  const p = game.player?.pos ?? cam;
  sun.position.set(p.x + ldir.x * 150, p.y + Math.max(ldir.y, 0.15) * 150, p.z + ldir.z * 150);
  sun.target.position.set(p.x, p.y, p.z);
  sun.intensity = day * 2.3 + (1 - day) * 0.35;
  sun.color.setRGB(1, 0.85 + day * 0.1 - dusk * 0.2, 0.75 + day * 0.15 - dusk * 0.3);
  if (day < 0.5) sun.color.lerp(new THREE.Color('#8fa8ff'), 1 - day * 2);
  hemi.intensity = 0.25 + day * 0.75;

  tmpA.copy(nightTop).lerp(dayTop, day); tmpB.copy(nightHor).lerp(dayHor, day);
  tmpA.lerp(duskTop, dusk * 0.4); tmpB.lerp(duskHor, dusk * 0.6);
  skyMat.uniforms.top.value.copy(tmpA); skyMat.uniforms.hor.value.copy(tmpB);
  stars.material.opacity = 1 - day;
  const fogC = tmpB.clone();
  // villain mountains are gloomy
  const z = game.player?.pos.z ?? 0;
  const gloom = THREE.MathUtils.smoothstep(-z, 450, 750) * 0.5;
  fogC.lerp(new THREE.Color('#4a4458'), gloom);
  game.scene.fog.color.copy(fogC);
  game.scene.fog.far = (900 - gloom * 450) * (0.55 + day * 0.45);
  game.scene.fog.near = 60 + day * 60;
  game.renderer.setClearColor(fogC);
  game.ambientLevel = 0.22 + day * 0.78;
}
