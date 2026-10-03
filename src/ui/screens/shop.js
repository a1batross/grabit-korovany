// Daggerfall-style shop window: keeper portrait + speech, Buy / Sell / Services tabs, haggling.
import { game } from '../../core/game.js';
import { ITEMS, CAT_NAMES, CAT_ORDER, isEquipped } from '../../systems/items.js';
import { buy, sell, haggle, services, runService, relation, buyPrice, sellPrice, shopBuys } from '../../systems/economy.js';
import { openModal, rerender, currentModal, restoreSel, closeModal, esc } from './modal.js';

const PORTRAITS = {
  'shop:weapons': '🧔', 'shop:general': '👳', 'shop:healer': '👨‍⚕️', 'shop:tavern': '👩‍🍳',
  'shop:elves': '🧝', 'shop:fort': '🥷', 'shop:palace': '💂',
};

let st = null; // { shop, tab, line, kind }

const pick = a => a[Math.floor(Math.random() * a.length)];

export function openShopUI(shop) {
  st = { shop, tab: shop.def.services === 'healer' ? 'svc' : 'buy', line: pick(shop.def.greet), kind: '' };
  openModal('shop', {
    title: `${esc(shop.title)}<small>${esc(shop.keeper.name)}</small>`, cls: 'kv-shopwin',
    render, onAct, onKey,
  });
}

export function refreshShopUI() { if (currentModal() === 'shop') rerender(); }

function speak(r) { st.line = r.msg; st.kind = r.ok ? 'good' : 'bad'; }

function onAct(act, d, el, e) {
  const shop = st.shop;
  const n = e?.shiftKey ? 5 : 1;
  if (act === 'tab') st.tab = d.tab;
  else if (act === 'buy') {
    const k = Math.min(n, shop.stock[d.id] ?? 0);
    const r = buy(shop, d.id, Math.max(1, k));
    speak(r.ok ? { ok: true, msg: pick(['Носи на здоровье!', 'Хороший выбор!', 'Приятно иметь дело.', 'Заходи ещё!']) + ' ' + r.msg } : r);
  } else if (act === 'sell') {
    const k = Math.min(n, game.inventory.count(d.id));
    const r = sell(shop, d.id, Math.max(1, k));
    speak(r.ok ? { ok: true, msg: pick(['Хм, сойдёт.', 'С корована, небось? Ладно, не моё дело.', 'Беру.', 'Ну, за такое больше не дам.']) + ' ' + r.msg } : r);
  } else if (act === 'svc') {
    const svc = services(shop).find(s => s.id === d.id);
    if (svc) speak(runService(shop, svc));
  } else if (act === 'haggle') {
    const r = haggle(shop);
    speak(r);
    if (r.kicked) { game.bus.emit('notify', { text: `${shop.keeper.name}: «${r.msg}»`, kind: 'bad' }); closeModal(); return; }
  } else if (act === 'close') { closeModal(); return; }
  rerender();
}

function onKey(e) {
  if (e.code === 'Digit1') { st.tab = 'buy'; rerender(); return true; }
  if (e.code === 'Digit2') { st.tab = 'sell'; rerender(); return true; }
  if (e.code === 'Digit3' && st.shop.def.services) { st.tab = 'svc'; rerender(); return true; }
  if (e.code === 'KeyH') { onAct('haggle', {}); return true; }
  return false;
}

function itemRow(id, { count, price, act, label, can, note }) {
  const it = ITEMS[id];
  const eq = isEquipped(id);
  return `<div class="kv-row ${eq ? 'eq' : ''}" data-key="${id}">
    <div class="kv-ico">${it.icon}</div>
    <div><div class="kv-name">${esc(it.name)} ${count > 1 ? `<span class="n">×${count}</span>` : ''}${eq ? '<span class="tag">надето</span>' : ''}${note ?? ''}</div>
      <div class="kv-desc">${esc(it.desc)}</div></div>
    <div class="kv-price ${can ? '' : 'cant'}">${price ? price + ' зол.' : '—'}</div>
    <div class="kv-acts"><button class="kv-btn ${can ? 'pri' : ''}" data-act="${act}" data-id="${id}" ${price && can !== null ? '' : 'disabled'}>${label}</button></div>
  </div>`;
}

function grouped(ids, row) {
  let html = '';
  for (const cat of CAT_ORDER) {
    const list = ids.filter(id => ITEMS[id].cat === cat);
    if (!list.length) continue;
    html += `<div class="kv-cat">${CAT_NAMES[cat]}</div>` + list.map(row).join('');
  }
  return html;
}

function render(body) {
  const shop = st.shop, d = shop.def;
  const rel = relation(shop);
  const gold = game.gold;
  let content = '';
  if (st.tab === 'buy') {
    const ids = Object.keys(shop.stock).filter(id => shop.stock[id] > 0 && ITEMS[id]);
    content = ids.length ? grouped(ids, id => {
      const p = buyPrice(shop, id);
      return itemRow(id, { count: shop.stock[id], price: p, act: 'buy', label: 'Купить', can: gold >= p });
    }) : '<div class="kv-empty">Полки пусты. Всё раскупили грабители корованов.</div>';
  } else if (st.tab === 'sell') {
    const ids = [...game.inventory.items.keys()].filter(id => ITEMS[id]);
    content = ids.length ? grouped(ids, id => {
      const ok = shopBuys(shop, id);
      const p = ok ? sellPrice(shop, id) : 0;
      return itemRow(id, { count: game.inventory.count(id), price: p, act: 'sell', label: 'Продать', can: ok ? true : null,
        note: ok ? '' : '<span class="tag red">не берут</span>' });
    }) : '<div class="kv-empty">Вам нечего продать. Сходите ограбьте корован.</div>';
  } else {
    content = services(shop).map(s => `<div class="kv-svc ${s.joke ? 'joke' : ''}">
      <div><div class="kv-name">${esc(s.label)}</div><div class="kv-desc">${esc(s.desc)}</div></div>
      <div class="kv-price ${gold >= s.price ? '' : 'cant'}">${s.price ? s.price + ' зол.' : (s.joke ? '' : 'бесплатно')}</div>
      <button class="kv-btn ${s.disabled ? '' : 'pri'}" data-act="svc" data-id="${s.id}" ${s.disabled ? 'disabled' : ''}>${s.joke ? 'Спросить' : 'Заказать'}</button>
    </div>`).join('') || '<div class="kv-empty">Услуг нет.</div>';
  }
  const tabs = [['buy', 'Купить', 1], ['sell', 'Продать', 2]];
  if (d.services) tabs.push(['svc', d.services === 'healer' ? 'Лечение и протезы' : d.services === 'tavern' ? 'Таверна' : 'Служба', 3]);
  const p = game.player;
  const injuries = d.services === 'healer'
    ? `<div class="kv-rel">${p.bleed > 0 ? '<b style="color:#ff6a5a">Кровотечение!</b> ' : ''}Здоровье: <b>${Math.ceil(p.hp)}/${p.maxHp}</b></div>` : '';
  body.innerHTML = `<div class="kv-shop">
    <div class="kv-keeper">
      <div class="kv-portrait">${PORTRAITS[shop.key] ?? '🧑'}</div>
      <div class="kv-kname">${esc(shop.keeper.name)}</div>
      <div class="kv-say ${st.kind}">«${esc(st.line)}»</div>
      <div class="kv-rel">Отношение: <b>${esc(rel.note ?? '')}</b>${shop.discount > 0.001 ? `<br>Выторговано: <b>−${Math.round(shop.discount * 100)}%</b>` : ''}</div>
      ${injuries}
      <button class="kv-btn big" data-act="haggle" title="H">🤝 Торговаться</button>
      <div class="kv-keys" style="text-align:center"><b>1</b>/<b>2</b>/<b>3</b> вкладки · <b>H</b> торг · <b>↑↓</b> <b>Enter</b><br>Shift+клик — сразу 5 шт.</div>
    </div>
    <div style="display:flex;flex-direction:column;min-height:0">
      <div class="kv-tabs">${tabs.map(([id, n, k]) => `<button class="kv-tab ${st.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${n}<span class="k">${k}</span></button>`).join('')}</div>
      <div class="kv-parch"><div class="kv-list kv-scroll" data-scroll="shop-${st.tab}">${content}</div></div>
    </div>
  </div>
  <div class="kv-foot"><span class="kv-gold">💰 ${gold} зол.</span>
    <span>Вес: ${game.inventory.weight()} / ${game.inventory.capacity}${game.encumbered ? ' <b style="color:#ff7a5a">перегруз!</b>' : ''}</span>
    <button class="kv-btn" data-act="close">Уйти (Esc)</button></div>`;
  restoreSel();
}
