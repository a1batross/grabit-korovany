// C — command menu: "пользователь сам себе командир". Give orders to selected squads; the villain also recruits here.
import { game } from '../core/game.js';
import { input } from '../core/input.js';
import { openModal, closeModal, say, playerDist, place } from '../systems/gameplay/util.js';
import { S } from '../systems/gameplay/state.js';
import { armyMembers, groupCounts, groupOrders, commandArmy, recruit, GROUP_NAMES, ORDER_NAMES, RECRUITS, ARMY_CAP } from '../systems/gameplay/army.js';

const ORDERS_BY_FACTION = {
  villain: ['follow', 'hold', 'defend', 'attack:palace', 'attack:elves', 'caravan', 'retreat'],
  guard: ['follow', 'hold', 'defend', 'attack:fort', 'attack:elves', 'retreat'],
  elves: ['follow', 'hold', 'defend', 'attack:palace', 'attack:fort', 'caravan', 'retreat'],
};
const DEFEND_NAME = { villain: 'Охранять форт', guard: 'Охранять дворец', elves: 'Охранять деревню' };
const groupName = g => game.playerFaction === 'villain' ? GROUP_NAMES[g] : g === 3 ? 'Лучники' : g === 1 ? 'Бойцы' : 'Второй отряд';

let selected = new Set([1, 2, 3]);
let lastMsg = '';

export function canCommand() {
  const pf = game.playerFaction;
  if (!game.player?.alive) return [false, ''];
  if (pf === 'villain') return [true, ''];
  if (pf === 'guard') {
    if (S.deserter) return [false, 'Дезертирам никто не подчиняется.'];
    if (S.rankIdx < 2) return [false, 'Командовать отрядом можно со звания Сержант. Слушайтесь командира!'];
  }
  if (!armyMembers().length) return [false, pf === 'elves' ? 'У вас пока нет отряда партизан — выполняйте задания вождя.' : 'У вас нет солдат.'];
  return [true, ''];
}

export function openCommandMenu(tab = 'orders') {
  const [ok, why] = canCommand();
  if (!ok) { if (why) say(why, 'bad'); return false; }
  render();
  return true;
}

function render() {
  const pf = game.playerFaction;
  const counts = groupCounts();
  const groups = [1, 2, 3].filter(g => counts[g] > 0 || pf === 'villain');
  const orders = ORDERS_BY_FACTION[pf] ?? ORDERS_BY_FACTION.villain;
  const nearRecruit = pf === 'villain' && playerDist(place('fort:recruit')) <= 12;
  const total = armyMembers().length;
  const rows = groups.map(g => `<label style="display:flex;align-items:center;gap:10px;padding:5px 8px;border-bottom:1px solid rgba(232,192,96,.2);cursor:pointer">
      <input type="checkbox" data-g="${g}" ${selected.has(g) ? 'checked' : ''}>
      <b style="min-width:150px">${g}. ${groupName(g)}</b><span style="min-width:90px">${counts[g]} воинов</span>
      <small style="opacity:.8">${orderLabel(groupOrders[g])}</small></label>`).join('');
  const btns = orders.map((o, i) => `<button class="btn small" data-o="${o}" style="min-width:190px">${i + 1}. ${orderLabel(o)}</button>`).join('');
  const rec = pf === 'villain' ? `<h3 style="margin:14px 0 6px;color:var(--gold)">Вербовка ${nearRecruit ? '' : '<small style="opacity:.7">(подойдите к вербовщику во дворе форта)</small>'}</h3>
    ${Object.entries(RECRUITS).map(([id, r]) => `<button class="btn small" data-r="${id}" ${nearRecruit && game.gold >= r.price && total < ARMY_CAP ? '' : 'disabled'}>${r.name} — ${r.price} зол.</button>`).join('')}
    <div style="font-size:13px;opacity:.8">Золото: ${game.gold} • армия: ${total}/${ARMY_CAP}</div>` : '';
  const el = openModal(`<div class="panel" style="min-width:560px">
    <h2>${pf === 'villain' ? 'Командование армией Злого' : pf === 'guard' ? `Командование отрядом (${game.rank})` : 'Отряд партизан'}</h2>
    <div style="font-size:13px;opacity:.8;margin-bottom:6px">Выберите отряды и отдайте приказ. Клавиши 1–${orders.length} — приказ, C/Esc — закрыть.</div>
    <div>${rows}</div>
    <div style="display:flex;flex-wrap:wrap;justify-content:center;margin-top:10px">${btns}</div>
    ${rec}
    <div id="cmd-msg" style="min-height:22px;text-align:center;margin-top:8px;color:var(--gold)">${lastMsg}</div>
    <div style="text-align:center"><button class="btn small" data-close>Закрыть (C)</button></div></div>`,
  {
    closeKeys: ['KeyC'],
    onKey: e => { const n = +e.key; if (n >= 1 && n <= orders.length) { e.preventDefault(); issue(orders[n - 1]); } },
  });
  if (!el) return;
  el.querySelectorAll('input[data-g]').forEach(cb => cb.addEventListener('change', () => {
    const g = +cb.dataset.g; if (cb.checked) selected.add(g); else selected.delete(g);
  }));
  el.querySelectorAll('button[data-o]').forEach(b => b.addEventListener('click', () => issue(b.dataset.o)));
  el.querySelectorAll('button[data-r]').forEach(b => b.addEventListener('click', () => {
    const r = recruit(b.dataset.r);
    lastMsg = r.msg;
    render();
  }));
  el.querySelector('[data-close]').addEventListener('click', closeModal);
}

function orderLabel(o) {
  if (o === 'defend') return DEFEND_NAME[game.playerFaction] ?? ORDER_NAMES.defend;
  return ORDER_NAMES[o] ?? o;
}

function issue(order) {
  const groups = [...selected];
  if (!groups.length) { lastMsg = 'Не выбран ни один отряд'; render(); return; }
  const r = commandArmy(order, groups);
  lastMsg = r.msg;
  if (r.ok) { say(`Приказ: ${orderLabel(order)} — ${r.msg}`, 'good'); closeModal(); }
  else render();
}

// key handler (runs as a game system; systems are paused while a modal is open)
export function initCommandMenu() {
  game.openCommandMenu = openCommandMenu;
  game.addSystem({
    name: 'command-menu', order: 5,
    update() {
      if (!game.started || game.uiOpen || game.paused) return;
      if (input.hit('KeyC')) openCommandMenu();
    },
  });
}
