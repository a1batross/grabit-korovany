// The player's own troops: the villain's army ("пользователь сам себе командир"), a guard sergeant's squad and an
// elf partisan band. Members carry `armyGroup` (1..3). Orders are given from the C command menu (ui/command.js).
import { game } from '../../core/game.js';
import { spawn } from '../../entities/spawn.js';
import { pick, randInt } from '../../core/rng.js';
import { S } from './state.js';
import { Squad, formationSlot } from './squad.js';
import { routeTo } from './nav.js';
import { place, dryNear, playerDist, dist, shout, say, aliveCount, snapActor, applySnap, presetFor, spawnArgs } from './util.js';
import { TARGETS, entryFor, fullRoute, chainOrder } from './raids.js';
import { caravans } from './caravans.js';

export const ARMY_CAP = 40;
let lastSquad = null;
export const GROUP_NAMES = { 1: 'Личная гвардия', 2: 'Второй отряд', 3: 'Лучники' };
export const groupOrders = { 1: 'follow', 2: 'defend', 3: 'defend' };
export const ORDER_NAMES = {
  follow: 'За мной!', hold: 'Стоять здесь', defend: 'Охранять базу', 'attack:palace': 'В атаку на дворец!',
  'attack:fort': 'Штурм форта Злого', 'attack:elves': 'Набег на эльфов', caravan: 'Грабить корован!', retreat: 'Отступать!',
};
export const RECRUITS = {
  minion: { name: 'Тёмный воин', price: 40, group: 0 },
  minionArcher: { name: 'Тёмный лучник', price: 55, group: 3 },
  knight: { name: 'Чёрный рыцарь', price: 110, group: 1 },
};

const homeKey = () => ({ villain: 'fort:yard', guard: 'palace:yard', elves: 'elves:square' }[game.playerFaction] ?? 'town:square');
const homeTarget = () => TARGETS[{ villain: 'fort', guard: 'palace', elves: 'elves' }[game.playerFaction]];
const unitPreset = () => ({ villain: 'minion', guard: 'guard', elves: 'elf' }[game.playerFaction]);
const archerPreset = () => ({ villain: 'minionArcher', guard: 'guardArcher', elves: 'elfArcher' }[game.playerFaction]);

export function armyMembers(groups = null) {
  return game.actors.filter(a => a.alive && !a.removed && a.armyGroup && (!groups || groups.includes(a.armyGroup)));
}
export function groupCounts() {
  const c = { 1: 0, 2: 0, 3: 0 };
  for (const a of armyMembers()) c[a.armyGroup]++;
  return c;
}

export function addToArmy(a, group) {
  a.armyGroup = group;
  a.transient = false;
  a.zoneHome = null; a.popGroup = null;
  a.ai.leash = 60;
  a.ai.courage = Math.max(a.ai.courage, 0.6);
  applyOrder(group);
  return a;
}

function spawnUnit(preset, x, z, group, extra = {}) {
  const p = dryNear(x, z, 3);
  const a = spawn(preset, p.x, p.z, extra);
  a.armyGroup = group; a.transient = false; a.ai.leash = 60; a.preset = preset;
  return a;
}

// villain starting army
export function spawnVillainArmy(counts = { 1: 6, 2: 5, 3: 4 }) {
  const y = place('fort:yard');
  for (let g = 1; g <= 3; g++) for (let i = 0; i < counts[g]; i++)
    spawnUnit(g === 3 ? 'minionArcher' : 'minion', y.x + (i - 3) * 2, y.z + (g - 2) * 3, g);
  for (let g = 1; g <= 3; g++) applyOrder(g);
}

// guard squads & elf bands grow with rank / reputation
export function setPlayerSquadSize(n) {
  if (!game.player || game.playerFaction === 'villain') return;
  const have = armyMembers().length;
  if (n <= have) return;
  const home = game.playerFaction === 'guard' ? place('palace:barracks') : place('elves:square');
  for (let i = have; i < n; i++) {
    const archer = i % 3 === 2;
    const name = game.playerFaction === 'guard' ? pick(['Рядовой Сидоров', 'Рядовой Пупкин', 'Рядовой Иванов', 'Рядовой Тяпкин', 'Рядовой Ляпкин', 'Рядовой Смирнов', 'Рядовой Кузнецов'])
      : pick(['Партизан Леголас', 'Партизан Халдир', 'Партизанка Тауриэль', 'Партизан Линдир', 'Партизан Эрестор']);
    spawnUnit(archer ? archerPreset() : unitPreset(), home.x, home.z, archer ? 3 : 1, { name });
  }
  applyOrder(1); applyOrder(3);
}

export function releaseArmy() {
  for (const a of armyMembers()) {
    a.squad?.release?.([a]);
    a.armyGroup = null; a.transient = true;
    a.ai.setOrder({ type: 'wander', x: a.pos.x, z: a.pos.z, r: 20 });
  }
}

export function recruit(type) {
  const R = RECRUITS[type];
  if (!R || game.playerFaction !== 'villain') return { ok: false, msg: 'Нанимать воинов может только Злой' };
  const rp = place('fort:recruit');
  if (playerDist(rp) > 12) return { ok: false, msg: 'Нанимать можно только у вербовщика в форте' };
  if (armyMembers().length >= ARMY_CAP) return { ok: false, msg: `Армия слишком велика (максимум ${ARMY_CAP})` };
  if (aliveCount() >= 165) return { ok: false, msg: 'Некого нанимать — все заняты' };
  if (!game.addGold(-R.price, 'recruit')) return { ok: false, msg: 'Не хватает золота' };
  const c = groupCounts();
  const group = R.group || (c[1] <= c[2] ? 1 : 2);
  const extra = type === 'knight' ? { name: 'Чёрный рыцарь', hp: 160, armor: 0.4, weapon: 'darkblade', shield: true } : {};
  const a = spawnUnit(type === 'knight' ? 'minion' : type, rp.x, rp.z, group, extra);
  S.armyRecruited++;
  applyOrder(group);
  shout(a, pick(['Служу Злому!', 'Готов грабить и убивать!', 'Куда идти, хозяин?']), { range: 30 });
  game.bus.emit('army:recruit', { actor: a, type });
  return { ok: true, msg: `Нанят: ${R.name} (${GROUP_NAMES[group]})`, actor: a };
}

// ---------- orders ----------
function leaveSquads(members) {
  const bySquad = new Map();
  for (const m of members) if (m.squad) { if (!bySquad.has(m.squad)) bySquad.set(m.squad, []); bySquad.get(m.squad).push(m); }
  for (const [sq, ms] of bySquad) sq.release(ms);
}

function holdSpots(members, cx, cz, cols = 5) {
  members.forEach((m, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const x = cx + (col - (cols - 1) / 2) * 2.2, z = cz + row * 2.2;
    m.ai.setOrder({ type: 'guard', x, z, r: 1.5 });
  });
}

// Re-apply the stored order of a group (used after recruiting / joining)
export function applyOrder(group) {
  const ord = groupOrders[group];
  const ms = armyMembers([group]).filter(m => !m.squad);
  if (!ms.length) return;
  if (ord === 'follow') refollow();
  else if (ord === 'defend' || ord === 'retreat') { const h = place(homeKey()); ms.forEach(m => m.ai.setOrder({ type: 'wander', x: h.x, z: h.z, r: 18 })); }
  else if (ord === 'hold' && groupOrders['hold' + group]) { const p = groupOrders['hold' + group]; ms.forEach(m => m.ai.setOrder({ type: 'guard', x: p.x + (Math.random() - 0.5) * 6, z: p.z + (Math.random() - 0.5) * 6, r: 1.5 })); }
}

// all members of groups whose order is 'follow' trail the player in one formation
function refollow() {
  const followers = armyMembers().filter(m => groupOrders[m.armyGroup] === 'follow' && !m.squad);
  followers.sort((a, b) => a.armyGroup - b.armyGroup || a.id - b.id);
  followers.forEach((m, i) => {
    const f = formationSlot(i + 1, 4, 1.9, 2.8);
    const o = m.ai.order;
    if (o.type !== 'follow' || o.leader !== game.player || o.ox !== f.ox || o.oz !== f.oz) m.ai.setOrder({ type: 'follow', leader: game.player, ox: f.ox, oz: f.oz });
  });
}

// commandArmy('attack:palace', [1,2,3]) -> { ok, msg }
export function commandArmy(order, groups = [1, 2, 3], quiet = false) {
  const p = game.player;
  if (!p?.alive) return { ok: false, msg: 'Вы мертвы' };
  const members = armyMembers(groups);
  if (!members.length) return { ok: false, msg: 'В выбранных отрядах никого нет' };
  leaveSquads(members);
  for (const g of groups) groupOrders[g] = order;
  let msg = '';
  if (order === 'follow') { refollow(); msg = 'Войска следуют за вами'; }
  else if (order === 'hold') {
    for (const g of groups) groupOrders['hold' + g] = { x: p.pos.x, z: p.pos.z };
    const f = p.forward;
    holdSpots(members, p.pos.x + f.x * 4, p.pos.z + f.z * 4);
    msg = 'Войска заняли позицию';
  } else if (order === 'defend' || order === 'retreat') {
    const h = place(homeKey()), HT = homeTarget();
    for (const m of members) {
      const fin = { type: 'goto', x: h.x, z: h.z, r: 8, run: order === 'retreat', then: { type: 'wander', x: h.x, z: h.z, r: 18 } };
      m.ai.setOrder(HT ? chainOrder(fullRoute(m.pos.x, m.pos.z, HT), fin, order === 'retreat') : fin);
      if (order === 'retreat') m.ai.target = null;
    }
    msg = order === 'retreat' ? 'Отступаем на базу!' : 'Войска охраняют базу';
  } else if (order.startsWith('attack:')) {
    const t = order.split(':')[1];
    const T = TARGETS[t];
    if (!T) return { ok: false, msg: 'Неизвестная цель' };
    if (T.owner === game.playerFaction) return { ok: false, msg: 'Это наша собственная база!' };
    const tgt = T.at();
    const c = centroid(members);
    const route = fullRoute(c.x, c.z, T);
    const entry = entryFor(T);
    const sq = new Squad({
      members, faction: game.playerFaction, name: 'Армия игрока', route, kind: 'army', speed: 1, cols: 3,
      target: { x: tgt.x, z: tgt.z, r: T.r }, assaultTime: 1e9, clearTime: 20, entry,
      afterOrder: (m, why) => why === 'won' ? { type: 'wander', x: tgt.x, z: tgt.z, r: 25 }
        : chainOrder(fullRoute(m.pos.x, m.pos.z, homeTarget()), { type: 'wander', x: place(homeKey()).x, z: place(homeKey()).z, r: 18 }, true),
      onEnd: (res) => {
        if (res === 'won') say(`Ваши войска захватили ${T.name}!`, 'good');
        else { say('Атака захлебнулась! Остатки войск отступают.', 'bad'); for (const g of groups) groupOrders[g] = 'retreat'; }
      },
    });
    lastSquad = sq;
    sq.cry = { villain: 'За Злого! В атаку!', guard: 'За императора! Вперёд!', elves: 'За лес! Вперёд!' }[game.playerFaction];
    msg = `Войска выступили на ${T.name}`;
  } else if (order === 'caravan') {
    const cv = caravans.filter(c => c.alive && c.state !== 'robbed').sort((a, b) => playerDist(a.pos) - playerDist(b.pos))[0];
    if (!cv) return { ok: false, msg: 'Поблизости нет корованов' };
    for (const m of members) for (const e of cv.escorts) if (e.alive) m.grudges.add(e);
    const c = centroid(members);
    const route = routeTo(c.x, c.z, cv.pos.x, cv.pos.z);
    const sq = new Squad({
      members, faction: game.playerFaction, name: 'Грабители корованов', route, kind: 'army', speed: 0.95, cols: 4,
      target: () => cv.alive ? { x: cv.pos.x, z: cv.pos.z, r: 10 } : null, assaultTime: 1e9, clearTime: 4,
      enemies: () => cv.escorts.filter(e => e.alive && !e.ai?.fleeing),
      afterOrder: m => ({ type: 'guard', x: cv.pos.x + (Math.random() - 0.5) * 8, z: cv.pos.z + (Math.random() - 0.5) * 8, r: 2 }),
      onAssault: () => cv.alarm(members[0]),
      onEnd: (res) => { if (res === 'won') say('Охрана корована перебита! Грабьте корован (E)!', 'good'); },
    });
    lastSquad = sq;
    sq.cry = 'Грабь корованы!';
    game.compassPois.set('armyCaravan', { x: cv.pos.x, z: cv.pos.z, label: '🐂!', color: '#ff9030' });
    setTimeout(() => game.compassPois.delete('armyCaravan'), 60000);
    msg = `Войска идут грабить ${cv.name}`;
  }
  const L = members[0];
  const cries = {
    follow: ['Слушаюсь!', 'Идём за тобой!'], hold: ['Стоим насмерть!', 'Есть стоять!'], defend: ['Есть охранять!'], retreat: ['Отходим!'],
    caravan: ['Грабить корованы!', 'Корованы! Наконец-то!'],
  }[order] ?? ['В атаку!', 'Будет сделано!'];
  if (!quiet) shout(L, pick(cries), { range: 50 });
  game.bus.emit('army:order', { order, groups, members });
  return { ok: true, msg };
}

function centroid(ms) {
  let x = 0, z = 0;
  for (const m of ms) { x += m.pos.x; z += m.pos.z; }
  return { x: x / ms.length, z: z / ms.length };
}

let acc = 0;
export function updateArmy(dt) {
  acc += dt;
  if (acc < 1.5) return;
  acc = 0;
  if (Object.values(groupOrders).includes('follow')) refollow();
  // stragglers that lost their leader (dead squad leader etc.) go back to their group's order
  for (const m of armyMembers()) if (!m.squad && m.ai.order.type === 'wander' && groupOrders[m.armyGroup] === 'follow') refollow();
}

export function resetArmy() {
  groupOrders[1] = 'follow'; groupOrders[2] = 'defend'; groupOrders[3] = game.playerFaction === 'villain' ? 'defend' : 'follow';
}


// ---------- save / load of the player's troops ----------
export function saveArmy() {
  const units = armyMembers().map(a => ({ g: a.armyGroup, squadState: a.squad?.kind === 'army' ? a.squad.state : null, ...snapActor(a) }));
  const go = {};
  for (const k of Object.keys(groupOrders)) go[k] = groupOrders[k];
  return { units, groupOrders: go };
}
export function loadArmy(d) {
  if (!d) return;
  for (const a of armyMembers()) { a.squad?.release?.([a]); a.remove(); }
  for (const u of d.units ?? []) {
    const a = spawn(presetFor(u), u.x, u.z, spawnArgs(u));
    applySnap(a, u);
    a.armyGroup = u.g; a.transient = false; a.ai.leash = 60; a.preset = presetFor(u);
  }
  for (const [k, v] of Object.entries(d.groupOrders ?? {})) groupOrders[k] = v;
  // resume orders: groups sharing an order are commanded together (quietly)
  const byOrder = new Map();
  for (const g of [1, 2, 3]) { const o = groupOrders[g]; if (!byOrder.has(o)) byOrder.set(o, []); byOrder.get(o).push(g); }
  for (const [o, gs] of byOrder) {
    if (!armyMembers(gs).length) continue;
    if (o === 'follow' || o === 'defend') { gs.forEach(applyOrder); continue; }
    if (o === 'hold') { for (const m of armyMembers(gs)) m.ai.setOrder({ type: 'guard', x: m.pos.x, z: m.pos.z, r: 1.5 }); continue; }
    lastSquad = null;
    const r = commandArmy(o, gs, true);
    if (!r.ok) { gs.forEach(g => { groupOrders[g] = 'defend'; applyOrder(g); }); continue; }
    // the assault was already under way: no marching back to the gate
    const wasAssault = (d.units ?? []).some(u => gs.includes(u.g) && u.squadState === 'assault');
    if (wasAssault && lastSquad && !lastSquad.dissolved) lastSquad.startAssault();
  }
}
