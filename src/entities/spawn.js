// Actor presets + the actor update system (AI, LOD, corpse cleanup, crowd separation).
import { game } from '../core/game.js';
import { Actor } from './actor.js';
import { AI } from './ai.js';
import { pick, rand } from '../core/rng.js';

const ELF_NAMES = ['Леголас', 'Элронд', 'Финрод', 'Галадрин', 'Аэлин', 'Тауриэль', 'Лютиэн', 'Эрестор', 'Линдир', 'Халдир', 'Келеборн', 'Ниэнор'];
const GUARD_NAMES = ['Стражник Иван', 'Стражник Пётр', 'Стражник Фёдор', 'Стражник Гаврила', 'Стражник Митрофан', 'Стражник Кузьма', 'Стражник Демьян'];
const MINION_NAMES = ['Прислужник Злого', 'Тёмный воин', 'Орк-наёмник', 'Головорез', 'Чёрный рыцарь'];
const PEASANT_NAMES = ['Крестьянин Вася', 'Крестьянка Маша', 'Дед Макар', 'Баба Нюра', 'Мужик Степан', 'Пастух Ерёма', 'Кузнец Тихон'];

export const PRESETS = {
  elf:      () => ({ kind: 'elf', faction: 'elves', name: pick(ELF_NAMES), hp: 80, weapon: Math.random() < 0.45 ? 'bow' : 'elfblade', role: 'partisan', speedMul: 1.1, gold: 5 + rand(0, 15) | 0 }),
  elfArcher:() => ({ kind: 'elf', faction: 'elves', name: pick(ELF_NAMES), hp: 75, weapon: 'longbow', role: 'archer', speedMul: 1.1, gold: 5 + rand(0, 10) | 0 }),
  elfChief: () => ({ kind: 'elfChief', faction: 'elves', name: 'Владыка Эльфов Трандуил', hp: 220, weapon: 'elfblade', role: 'chief', armor: 0.2, gold: 120 }),
  guard:    () => ({ kind: 'guard', faction: 'guard', name: pick(GUARD_NAMES), hp: 100, weapon: pick(['sword', 'spear', 'sword', 'halberd']), shield: Math.random() < 0.5, armor: 0.25, role: 'soldier', gold: 10 + rand(0, 20) | 0 }),
  guardArcher: () => ({ kind: 'guard', faction: 'guard', name: 'Лучник дворца', hp: 85, weapon: 'bow', armor: 0.15, role: 'archer', gold: 10 + rand(0, 15) | 0 }),
  commander:() => ({ kind: 'commander', faction: 'guard', name: 'Командир Брусилов', hp: 260, weapon: 'halberd', armor: 0.4, role: 'commander', gold: 150 }),
  emperor:  () => ({ kind: 'emperor', faction: 'guard', name: 'Император Всеволод IV', hp: 150, weapon: 'sword', armor: 0.1, role: 'emperor', gold: 1000 }),
  minion:   () => ({ kind: 'minion', faction: 'villain', name: pick(MINION_NAMES), hp: 105, weapon: pick(['axe', 'mace', 'club', 'axe', 'sword']), shield: Math.random() < 0.3, armor: 0.2, role: 'soldier', gold: 8 + rand(0, 20) | 0 }),
  minionArcher: () => ({ kind: 'minion', faction: 'villain', name: 'Тёмный лучник', hp: 85, weapon: 'bow', armor: 0.15, role: 'archer', gold: 8 + rand(0, 12) | 0 }),
  villain:  () => ({ kind: 'villain', faction: 'villain', name: 'Злой', hp: 450, weapon: 'darkblade', armor: 0.45, role: 'boss', scale: 1.28, gold: 2000 }),
  spy:      () => ({ kind: 'spy', faction: 'villain', name: 'Шпион Злого', hp: 70, weapon: 'dagger', role: 'spy', disguisedAs: 'humans', look: { shirt: '#7a6a5a', hood: '#4a3a2a' }, gold: 30 }),
  peasant:  () => ({ kind: 'peasant', faction: 'humans', name: pick(PEASANT_NAMES), hp: 60, weapon: Math.random() < 0.3 ? 'club' : 'fists', role: 'civilian', gold: rand(0, 12) | 0 }),
  merchant: () => ({ kind: 'merchant', faction: 'humans', name: 'Купец', hp: 70, weapon: 'fists', role: 'merchant', gold: 60 }),
  caravaneer: () => ({ kind: 'caravaneer', faction: 'humans', name: 'Охранник каравана', hp: 95, weapon: pick(['sword', 'axe', 'spear']), shield: Math.random() < 0.4, armor: 0.2, role: 'caravaneer', gold: 15 }),
  healer:   () => ({ kind: 'healer', faction: 'humans', name: 'Лекарь', hp: 60, weapon: 'fists', role: 'healer', gold: 40 }),
};

// spawn('guard', x, z, { order, ...overrides })
export function spawn(preset, x, z, extra = {}) {
  const base = typeof preset === 'string' ? PRESETS[preset]() : preset;
  const { order, ...rest } = extra;
  const a = new Actor({ ...base, x, z, ...rest });
  if (!a.isPlayer) a.ai = new AI(a, order);
  game.actors.push(a);
  return a;
}

const MAX_CORPSES = 70;

export function initActorSystem() {
  game.addSystem({
    name: 'actors', order: 10,
    update(dt) {
      const pp = game.player?.pos ?? game.camera.position;
      const acts = game.actors;
      let corpses = 0;
      for (let i = acts.length - 1; i >= 0; i--) {
        const a = acts[i];
        const d2 = (a.pos.x - pp.x) ** 2 + (a.pos.z - pp.z) ** 2;
        a.lod = d2 < 90 * 90 ? 0 : d2 < 260 * 260 ? 1 : 2;
        a.body.root.visible = d2 < 420 * 420;
        if (!a.alive) {
          corpses++;
          if (corpses > MAX_CORPSES && !a.isPlayer && !a.keepCorpse) { a.remove(); continue; }
          if (a.lod < 2) a.update(dt);
          continue;
        }
        if (a.lod === 2) {
          // far away: tick at low rate
          a.updateAccum += dt;
          if (a.updateAccum < 0.25) { a.pos.x += a.vel.x * dt; a.pos.z += a.vel.z * dt; continue; }
          const sdt = a.updateAccum; a.updateAccum = 0;
          a.ai?.update(sdt); a.update(Math.min(sdt, 0.25));
          continue;
        }
        if (a.ai && !a.isPlayer) a.ai.update(dt);
        a.update(dt);
      }
      // crowd separation (near actors only)
      const near = acts.filter(a => a.alive && a.lod === 0);
      for (let i = 0; i < near.length; i++) {
        const a = near[i];
        for (let j = i + 1; j < near.length; j++) {
          const b = near[j];
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const min = a.radius + b.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
            const d = Math.sqrt(d2), push = (min - d) / 2;
            const nx = dx / d, nz = dz / d;
            const wa = a.isPlayer ? 0.3 : 1, wb = b.isPlayer ? 0.3 : 1;
            a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
            b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
          }
        }
      }
    },
  });
}
