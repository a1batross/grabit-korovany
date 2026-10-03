// Corpse loot window ("и труп тоже 3д" — and it has pockets).
import { game } from '../../core/game.js';
import { ITEMS } from '../../systems/items.js';
import { takeFromBag, bagEmpty } from '../../systems/economy.js';
import { openModal, rerender, closeModal, restoreSel, esc } from './modal.js';

let st = null;
const EPITAPHS = [
  'Покойник смотрит на вас с укоризной.',
  'Труп трёхмерный. Карманы — тоже.',
  'Ему это больше не понадобится.',
  'Мёртвые не торгуются.',
  'Обыскивать мёртвых — нехорошо. Но выгодно.',
];

export function openLootUI(actor, bag) {
  st = { actor, bag, epitaph: EPITAPHS[Math.floor(Math.random() * EPITAPHS.length)] };
  openModal('loot', { title: `Труп<small>${esc(actor.name)}</small>`, cls: 'kv-loot', render, onAct, onKey });
}

function takeAll() {
  takeFromBag(st.bag, 'gold');
  for (const id of [...st.bag.items.keys()]) takeFromBag(st.bag, id);
  game.bus.emit('loot:taken', { actor: st.actor });
  closeModal();
}

function onAct(act, d) {
  if (act === 'take') { takeFromBag(st.bag, d.id); game.bus.emit('loot:taken', { actor: st.actor }); }
  if (act === 'all') { takeAll(); return; }
  if (act === 'close') { closeModal(); return; }
  if (bagEmpty(st.bag)) { closeModal(); return; }
  rerender();
}

function onKey(e) {
  if (e.code === 'KeyE' || e.code === 'Space') { takeAll(); return true; }
  return false;
}

function render(body) {
  const { bag, actor } = st;
  let rows = '';
  if (bag.gold > 0) rows += `<div class="kv-row" data-key="gold"><div class="kv-ico">💰</div>
    <div><div class="kv-name">Золото <span class="n">×${bag.gold}</span></div><div class="kv-desc">Звенит приятно.</div></div><div></div>
    <div class="kv-acts"><button class="kv-btn pri" data-act="take" data-id="gold">Взять</button></div></div>`;
  for (const [id, n] of bag.items) {
    const it = ITEMS[id];
    rows += `<div class="kv-row" data-key="${id}"><div class="kv-ico">${it.icon}</div>
      <div><div class="kv-name">${esc(it.name)} ${n > 1 ? `<span class="n">×${n}</span>` : ''}</div><div class="kv-desc">${esc(it.desc)}</div></div>
      <div class="kv-price">${it.price ? '~' + it.price + ' зол.' : ''}</div>
      <div class="kv-acts"><button class="kv-btn pri" data-act="take" data-id="${id}">Взять</button></div></div>`;
  }
  const cause = { blood: 'истёк кровью', head: 'без головы', fall: 'разбился', wound: 'погиб в бою' }[actor.deathCause] ?? 'мёртв';
  body.innerHTML = `<div class="kv-parch">
    <div class="kv-desc" style="font-style:italic;margin-bottom:6px">${esc(actor.name)} — ${cause}. ${st.epitaph}</div>
    <div class="kv-list kv-scroll" data-scroll="loot">${rows || '<div class="kv-empty">Пусто. Кто-то обыскал его до вас.</div>'}</div></div>
    <div class="kv-foot"><span class="kv-keys"><b>E</b> / <b>Пробел</b> — взять всё · <b>Esc</b> — уйти</span>
    <span><button class="kv-btn pri big" data-act="all">Взять всё</button> <button class="kv-btn big" data-act="close">Уйти</button></span></div>`;
  restoreSel();
}
