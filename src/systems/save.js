// Save / load ("Сохранятся можно..."). Named slots in localStorage + quicksave (F5) / quickload (F9) + autosave.
// Load = store slot id in sessionStorage, reload the page; after the world is built we auto-start the game with
// opts.save, every module's startGame runs normally, then this module (which runs late) restores the player and
// calls every module's deserialize(data.modules[name]).
import { game } from '../core/game.js';
import { cam } from '../entities/player.js';
import { equip, updateEncumbrance } from './items.js';
import { ensureStats } from './economy.js';
import { openSaveUI } from '../ui/screens/saves.js';

export const name = 'save';

const PREFIX = 'korovany.save.';
const LOAD_KEY = 'korovany.loadSlot';
export const SLOTS = ['quick', 'auto', '1', '2', '3', '4', '5', '6'];
export const SLOT_NAMES = { quick: 'Быстрое', auto: 'Авто' };
const LIMBS = ['armL', 'armR', 'legL', 'legR', 'eyeL', 'eyeR'];

let MODULES = null;
const modulesReady = import('../modules.js').then(m => { MODULES = m.MODULES; });

// ---------------------------------------------------------------- storage
export function readSlot(slot) {
  try { const s = localStorage.getItem(PREFIX + slot); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function slotMeta(slot) {
  const d = readSlot(slot);
  return d ? { slot, name: d.name, time: d.time, faction: d.faction, day: d.day, hour: d.hour, gold: d.gold, rank: d.rank, hp: d.player?.hp, maxHp: d.player?.maxHp, limbs: d.player?.limbs } : null;
}
export function deleteSlot(slot) { try { localStorage.removeItem(PREFIX + slot); } catch { /* ignore */ } }
export function hasAny() { return SLOTS.some(s => { try { return localStorage.getItem(PREFIX + s) != null; } catch { return false; } }); }

// ---------------------------------------------------------------- serialize
function serializePlayer(p) {
  return {
    name: p.name, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: cam.yaw, pitch: cam.pitch, camDist: cam.dist, firstPerson: cam.firstPerson,
    hp: p.hp, maxHp: p.maxHp, stamina: p.stamina, limbs: { ...p.limbs }, bleed: p.bleed,
    weapon: p.weapon?.id ?? 'fists', armor: p.armor, shield: p.shield,
    hasWheelchair: p.hasWheelchair, useWheelchair: p.useWheelchair, outlawFor: p.outlawFor ? [...p.outlawFor] : [],
  };
}

export function collect(label) {
  const p = game.player;
  const modules = {};
  for (const m of MODULES ?? []) {
    if (!m.serialize || m.name === name) continue;
    try { const d = m.serialize(); if (d !== undefined) modules[m.name] = d; } catch (e) { console.error('serialize failed', m.name, e); }
  }
  return {
    v: 1, name: label, time: Date.now(), faction: game.playerFaction, day: game.day, hour: game.hour,
    gold: game.gold, worldTime: game.worldTime, rank: game.rank ?? null,
    player: serializePlayer(p),
    inventory: [...game.inventory.items.entries()],
    equipment: { ...game.equipment },
    journal: { entries: game.journal.entries.slice(-300), objectives: [...game.journal.objectives.entries()] },
    stats: ensureStats(), achievements: [...(game.achievements ?? [])],
    modules,
  };
}

export async function saveTo(slot, label) {
  if (!game.started || !game.player?.alive) { game.bus.emit('notify', { text: 'Мёртвые не сохраняются.', kind: 'bad' }); return false; }
  await modulesReady;
  const data = collect(label || defaultLabel(slot));
  try {
    localStorage.setItem(PREFIX + slot, JSON.stringify(data));
  } catch (e) {
    console.error(e);
    game.bus.emit('notify', { text: 'Не удалось сохранить: ' + e.message, kind: 'bad' });
    return false;
  }
  game.bus.emit('save', { slot });
  if (slot !== 'auto') game.bus.emit('notify', { text: `Игра сохранена: «${data.name}». Сохранятся можно!`, kind: 'good' });
  return true;
}

function defaultLabel(slot) {
  const loc = game.player ? (game.lib?.zones?.zoneAt?.(game.player.pos.x, game.player.pos.z)?.name ?? '') : '';
  return `${SLOT_NAMES[slot] ?? 'Сохранение'} — день ${game.day + 1}${loc ? ', ' + loc : ''}`;
}

export function loadFrom(slot) {
  if (!readSlot(slot)) { game.bus.emit('notify', { text: 'Сохранение не найдено.', kind: 'bad' }); return; }
  try { sessionStorage.setItem(LOAD_KEY, slot); } catch { /* ignore */ }
  document.getElementById('modal-root').innerHTML = '';
  document.getElementById('menu-root').innerHTML = `<div class="screen" style="background:#0a0805"><h1 class="title">ГРАБИТЬ КОРОВАНЫ</h1><div class="subtitle">Загружаем сохранение...</div></div>`;
  setTimeout(() => location.reload(), 30);
}

// ---------------------------------------------------------------- restore
function restorePlayer(s) {
  const p = game.player;
  p.name = s.name ?? p.name;
  p.pos.set(s.x, s.y, s.z); p.vel.set(0, 0, 0);
  p.body.root.position.copy(p.pos);
  cam.yaw = s.yaw ?? cam.yaw; cam.pitch = s.pitch ?? cam.pitch; cam.dist = s.camDist ?? cam.dist; cam.firstPerson = !!s.firstPerson;
  p.yaw = cam.yaw;
  p.maxHp = s.maxHp ?? p.maxHp; p.hp = s.hp ?? p.maxHp; p.stamina = s.stamina ?? p.maxStamina;
  // limbs: silently detach (no blood fountain), then refit prosthetics
  for (const part of LIMBS) {
    const st = s.limbs?.[part];
    if (!st || st === 'ok') continue;
    const obj = p.body.detach(part, game.scene);
    if (obj) obj.parent?.remove(obj);
    p.limbs[part] = 'lost';
    if (part === 'armR') p.body.setWeapon(null);
    if (part === 'armL') p.shield = false;
    if (st === 'prosthetic') p.fitProsthetic(part);
  }
  p.bleed = s.bleed ?? 0;
  p.outlawFor = s.outlawFor?.length ? new Set(s.outlawFor) : p.outlawFor;
  p.useWheelchair = s.useWheelchair ?? true;
  p.setWheelchair(!!s.hasWheelchair);
}

function restore(data) {
  game.worldTime = data.worldTime ?? game.worldTime;
  game.gold = data.gold ?? game.gold;
  if (data.rank != null) game.rank = data.rank;
  restorePlayer(data.player);
  // inventory & equipment
  const inv = game.inventory;
  inv.items.clear();
  for (const [id, n] of data.inventory ?? []) inv.add(id, n);
  const eq = data.equipment ?? {};
  game.equipment = { weapon: null, armor: null, shield: null };
  const p = game.player;
  p.armor = 0; p.shield = false; p.body.setShield(false);
  equip(eq.weapon && inv.has(eq.weapon) ? eq.weapon : 'fists', true);
  if (eq.armor && inv.has(eq.armor)) equip(eq.armor, true);
  if (eq.shield && inv.has(eq.shield)) equip(eq.shield, true);
  updateEncumbrance();
  // journal
  if (data.journal) {
    game.journal.entries.length = 0;
    game.journal.entries.push(...(data.journal.entries ?? []));
    game.journal.objectives.clear();
    for (const [k, o] of data.journal.objectives ?? []) game.journal.objectives.set(k, o);
  }
  Object.assign(ensureStats(), data.stats ?? {});
  game.achievements = new Set(data.achievements ?? []);
  for (const m of MODULES ?? []) {
    if (!m.deserialize || m.name === name || !(m.name in (data.modules ?? {}))) continue;
    try { m.deserialize(data.modules[m.name]); } catch (e) { console.error('deserialize failed', m.name, e); }
  }
  game.bus.emit('load', data);
}

// ---------------------------------------------------------------- module hooks
export async function init() {
  await modulesReady;
  game.saves = {
    hasAny, list: () => SLOTS.map(s => slotMeta(s) ?? { slot: s, empty: true }),
    showLoadMenu: () => openSaveUI('load'), showSaveMenu: () => openSaveUI('save'),
    quickSave: () => saveTo('quick', `Быстрое — день ${game.day + 1}`),
    quickLoad: () => { if (readSlot('quick')) loadFrom('quick'); else game.bus.emit('notify', { text: 'Быстрого сохранения нет. Нажмите F5, чтобы создать.', kind: 'bad' }); },
    save: saveTo, load: loadFrom, delete: deleteSlot, collect, restore,
  };

  // autosave every 6 in-game hours
  let lastAuto = null, acc = 0;
  game.addSystem({
    name: 'autosave', order: 250,
    update(dt) {
      if (!game.started) return;
      acc += dt;
      if (acc < 3) return;
      acc = 0;
      const block = Math.floor(game.worldTime / 360);
      if (lastAuto == null) { lastAuto = block; return; }
      const p = game.player;
      if (block !== lastAuto && p?.alive && p.bleed <= 0 && !game.uiOpen) {
        lastAuto = block;
        saveTo('auto', `Авто — день ${game.day + 1}, ${String(Math.floor(game.hour)).padStart(2, '0')}:00`).then(ok => ok && game.bus.emit('notify', { text: '💾 Автосохранение' }));
      }
    },
  });

  // pending load after reload?
  let slot = null;
  try { slot = sessionStorage.getItem(LOAD_KEY); sessionStorage.removeItem(LOAD_KEY); } catch { /* ignore */ }
  const data = slot ? readSlot(slot) : null;
  if (data) {
    // main.js shows the title menu right after init; wait for it, then start the game with the save
    const t0 = performance.now();
    const wait = setInterval(() => {
      if (!document.querySelector('#menu-root .card') && performance.now() - t0 < 20000) return;
      clearInterval(wait);
      game.startGame({ faction: data.faction, save: data, name: data.player?.name });
    }, 50);
  }
}

export function startGame(opts) {
  if (!opts.save) return;
  restore(opts.save);
  game.bus.emit('notify', { text: `Загружено: «${opts.save.name}». Кликните мышью, чтобы продолжить.`, kind: 'good' });
  const hint = document.createElement('div');
  hint.className = 'kv-clickhint';
  hint.textContent = 'Кликните, чтобы продолжить';
  document.getElementById('ui').appendChild(hint);
  const off = game.bus.on('pointerlock', locked => { if (locked) { hint.remove(); off(); } });
  setTimeout(() => hint.remove(), 15000);
}
