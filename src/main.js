// Entry point: renderer, world generation, systems, main loop.
import * as THREE from 'three';
import { game } from './core/game.js';
import { input } from './core/input.js';
import { buildTerrain } from './world/terrain.js';
import { buildTrees } from './world/trees.js';
import { initSky } from './world/sky.js';
import { initEffects } from './systems/effects.js';
import { initCombat } from './systems/combat.js';
import { initActorSystem, spawn } from './entities/spawn.js';
import { initPlayerControl, cam } from './entities/player.js';
import { initHud } from './ui/hud.js';
import { showMainMenu, showLoading, hideMenus } from './ui/menu.js';
import { MODULES } from './modules.js';
import { LOC } from './world/zones.js';
import * as terrain from './world/terrain.js';
import * as zones from './world/zones.js';
import * as trees from './world/trees.js';
import * as colliders from './world/colliders.js';
import * as spawnMod from './entities/spawn.js';
import * as actorMod from './entities/actor.js';
import * as playerMod from './entities/player.js';
import * as factions from './systems/factions.js';
import * as effects from './systems/effects.js';
import * as weapons from './entities/weapons.js';

// Core modules exposed for tests/console (dynamic import() in tests can yield a different module instance under Vite HMR).
game.lib = { THREE, terrain, zones, trees, colliders, spawn: spawnMod.spawn, PRESETS: spawnMod.PRESETS, actor: actorMod,
  player: playerMod, factions, effects, weapons, modules: MODULES, input };

function initRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.getElementById('app').appendChild(renderer.domElement);
  game.renderer = renderer;
  game.scene = new THREE.Scene();
  game.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3200);
  game.camera.position.set(0, 60, 300);
  window.addEventListener('resize', () => {
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  input.init(renderer.domElement);
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

async function buildWorld() {
  showLoading('Насыпаем горы Злого...');
  await nextFrame();
  buildTerrain();
  initSky();
  showLoading('Строим дворец, форт и деревянные домики...');
  await nextFrame();
  for (const m of MODULES) if (m.buildWorld) await m.buildWorld();
  showLoading('Сажаем густой лес (вдали — картинкой!)...');
  await nextFrame();
  buildTrees();
  initEffects();
  initCombat();
  initActorSystem();
  initPlayerControl();
  initHud();
  for (const m of MODULES) if (m.init) await m.init();
}

// Called from the menu. opts: { faction, save }
export async function startGame(opts) {
  showLoading('Набигают солдаты...');
  await nextFrame();
  game.playerFaction = opts.faction;
  game.gold = opts.save?.gold ?? 50;
  const placeKey = { elves: 'elves:square', guard: 'palace:yard', villain: 'fort:yard' }[opts.faction];
  const fallback = { elves: LOC.elfVillage, guard: LOC.palace, villain: LOC.fort }[opts.faction];
  const pl = game.places.get(placeKey);
  const startAt = pl ? { x: pl.x - 6, z: pl.z - 12 } : fallback;
  const preset = { elves: 'elf', guard: 'guard', villain: 'villain' }[opts.faction];
  const player = spawn(preset, startAt.x + 6, startAt.z + 12, { isPlayer: true, name: opts.name ?? 'Игрок',
    ...(opts.faction === 'villain' ? { hp: 300 } : { hp: 120 }),
    ...(opts.faction === 'elves' ? { weapon: 'elfblade' } : opts.faction === 'guard' ? { weapon: 'sword', shield: true } : {}) });
  player.ai = null;
  game.player = player;
  cam.yaw = player.yaw;
  for (const m of MODULES) if (m.startGame) await m.startGame(opts);
  game.started = true;
  hideMenus();
  input.lock();
}
game.startGame = startGame;

// Test helper: advance the simulation without rendering (used by headless tests).
game.simulate = (seconds, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) {
    game.time += dt;
    for (const s of game.systems) if (s.name !== 'hud') s.update(dt);
    input.endFrame();
  }
};

function loop() {
  requestAnimationFrame(loop);
  game.clock.update();
  let dt = Math.min(game.clock.getDelta(), 0.05);
  game.time += dt;
  if (game.paused || game.uiOpen || !game.started) {
    // still run a few systems so UI/sky stays alive
    for (const s of game.systems) if (s.alwaysRun) s.update(dt);
  } else {
    dt *= game.slowmo ?? 1;
    for (const s of game.systems) s.update(dt);
  }
  input.endFrame();
  if (!game.started && game.menuCam) game.menuCam(dt);
  game.renderer.render(game.scene, game.camera);
}

async function main() {
  initRenderer();
  await buildWorld();
  // slow cinematic pan over the world behind the main menu
  let t = 0;
  game.menuCam = dt => {
    t += dt * 0.04;
    const r = 260;
    game.camera.position.set(Math.cos(t) * r - 300, 90, Math.sin(t) * r + 60);
    game.camera.lookAt(-650, 20, 40);
    for (const s of game.systems) if (s.name === 'trees' || s.name === 'sky' || s.name === 'actors' || s.name === 'effects') s.update(dt);
  };
  showMainMenu();
  loop();
}

main().catch(e => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f66;background:#000;z-index:9;padding:10px">${e.stack}</pre>`);
});
