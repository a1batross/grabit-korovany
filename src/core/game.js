// Central game hub. Every module imports `game` and reads/writes shared state here.
// Systems register via game.addSystem({ name, update(dt), ... }) and are ticked each frame.
import * as THREE from 'three';
import { Bus } from './bus.js';

export const game = {
  THREE,
  bus: new Bus(),
  renderer: null,
  scene: null,
  camera: null,
  clock: new THREE.Timer(),
  time: 0,          // seconds since session start (real, unpaused)
  worldTime: 8 * 60, // in-game minutes since day 0 00:00 (starts 08:00)
  dayLength: 24 * 60, // in-game minutes in a day
  timeScale: 2,     // in-game minutes per real second
  paused: false,
  uiOpen: false,    // a modal UI is open (mouse unlocked, gameplay frozen)
  started: false,

  player: null,     // Actor controlled by the player
  playerFaction: null, // 'elves' | 'guard' | 'villain'
  actors: [],       // all live/dead Actor instances
  systems: [],

  gold: 0,
  // Change player gold (negative to spend). Returns false if not enough money.
  addGold(n, reason = '') {
    if (n < 0 && this.gold + n < 0) return false;
    this.gold += n;
    this.bus.emit('gold:change', { amount: n, total: this.gold, reason });
    return true;
  },

  // Journal / objectives (UI for it lives in ui/journal.js)
  journal: {
    entries: [],          // { day, hour, text }
    objectives: new Map(), // key -> { text, done }
    add(text) {
      this.entries.push({ day: game.day, hour: game.hour, text });
      game.bus.emit('journal:add', { text });
    },
    setObjective(key, text, done = false) {
      this.objectives.set(key, { text, done });
      game.bus.emit('journal:objective', { key, text, done });
    },
    complete(key) { const o = this.objectives.get(key); if (o) { o.done = true; game.bus.emit('journal:objective', { key, ...o }); } },
  },

  // Named places other modules can look up, e.g. game.places.get('shop:weapons') -> { x, z, yaw, name }
  places: new Map(),

  addSystem(sys) {
    this.systems.push(sys);
    this.systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return sys;
  },
  getSystem(name) { return this.systems.find(s => s.name === name); },

  get day() { return Math.floor(this.worldTime / this.dayLength); },
  get hour() { return (this.worldTime % this.dayLength) / 60; },
};

window.game = game; // handy for debugging in the console
