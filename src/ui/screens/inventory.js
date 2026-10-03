// Inventory + character sheet: Daggerfall-like paper doll showing lost / prosthetic limbs, equipment and items.
import { game } from '../../core/game.js';
import { ITEMS, CAT_NAMES, CAT_ORDER, isEquipped, useItem, lostPartsFor } from '../../systems/items.js';
import { PART_NAMES } from '../../entities/actor.js';
import { FACTIONS } from '../../systems/factions.js';
import { openModal, rerender, currentModal, closeModal, restoreSel, esc } from './modal.js';

let filter = 'all';
const FILTERS = [
  ['all', 'Всё', null],
  ['gear', 'Снаряжение', ['weapon', 'shield', 'armor']],
  ['med', 'Лечение', ['medical', 'prosthetic', 'food']],
  ['misc', 'Товары и разное', ['trade', 'misc']],
];
const FIT_LABEL = { armL: 'На левую', armR: 'На правую', legL: 'На левую', legR: 'На правую', eyeL: 'В левый', eyeR: 'В правый' };
const PROS_ITEM = { arm: 'prosthetic_arm', leg: 'prosthetic_leg', eye: 'glass_eye' };

export function toggleInventory() {
  if (currentModal() === 'inventory') { closeModal(); return; }
  openModal('inventory', { title: 'Инвентарь<small>и состояние тела</small>', render, onAct, onKey });
}

game.bus.on('inventory:change', () => { if (currentModal() === 'inventory') rerender(); });

function onAct(act, d) {
  if (act === 'filter') filter = d.f;
  else if (act === 'use') useItem(d.id, { part: d.part });
  else if (act === 'drop') {
    const it = ITEMS[d.id];
    if (it.id === 'kirill_letter') game.bus.emit('notify', { text: 'Рука не поднимается выбросить письмо Кирилла.' });
    else if (game.inventory.remove(d.id, 1)) game.bus.emit('notify', { text: `Вы выбросили: ${it.name}. Лучше бы продали.` });
  } else if (act === 'fit') {
    const kind = d.part.slice(0, 3);
    useItem(PROS_ITEM[kind], { part: d.part });
  } else if (act === 'wc') {
    const p = game.player;
    p.useWheelchair = !p.useWheelchair; p.body.setWheelchair(p.useWheelchair && p.moveMode === 'wheelchair');
  }
  rerender();
}

function onKey(e) {
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
    filter = FILTERS[+e.code.slice(5) - 1][0]; rerender(); return true;
  }
  if (e.code === 'KeyR') { // drop selected
    const row = document.querySelector('.kv-row.sel'); const b = row?.querySelector('[data-act=drop]'); if (b) { b.click(); return true; }
  }
  return false;
}

// ----- paper doll (SVG) -----
function doll(p) {
  const L = p.limbs;
  const C = { ok: '#e9c69c', stroke: '#5a3a1a', wood: '#94602c', lost: '#b0201a' };
  const armorItem = ITEMS[game.equipment.armor];
  const torsoCol = !armorItem ? '#7a8a5a' : armorItem.id === 'armor_dark' ? '#3a2a4a' : armorItem.id === 'armor_leather' ? '#8a5a30' : armorItem.id === 'armor_elven' ? '#5aa070' : '#a9b2bb';
  const lostMarks = [];
  const fitCls = part => (L[part] === 'lost' && game.inventory.has(PROS_ITEM[part.slice(0, 3)]) ? 'part fit' : 'part');
  const limb = (part, x, y, w, h) => {
    const st = L[part];
    const tip = `${PART_NAMES[part]}: ${st === 'ok' ? 'цела' : st === 'lost' ? 'ОТРУБЛЕНА' : 'протез'}`;
    if (st === 'ok') return `<rect class="part" x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="${C.ok}" stroke="${C.stroke}" stroke-width="2"><title>${tip}</title></rect>`;
    if (st === 'prosthetic') {
      const isArm = part.startsWith('arm');
      return `<g class="part"><title>${tip}</title><rect x="${x + w * 0.2}" y="${y}" width="${w * 0.6}" height="${h - (isArm ? 14 : 0)}" rx="4" fill="${C.wood}" stroke="#3a200a" stroke-width="2"/>
        <line x1="${x + w * 0.2}" y1="${y + h * 0.3}" x2="${x + w * 0.8}" y2="${y + h * 0.3}" stroke="#3a200a" stroke-width="2"/>
        <line x1="${x + w * 0.2}" y1="${y + h * 0.6}" x2="${x + w * 0.8}" y2="${y + h * 0.6}" stroke="#3a200a" stroke-width="2"/>
        ${isArm ? `<path d="M ${x + w / 2} ${y + h - 14} q 0 14 -9 12 q -6 -2 -3 -8" fill="none" stroke="#8a929a" stroke-width="4" stroke-linecap="round"/>` : `<rect x="${x + w * 0.1}" y="${y + h - 5}" width="${w * 0.8}" height="5" fill="#222"/>`}</g>`;
    }
    lostMarks.push([x + w / 2, y + 6]);
    return `<g class="${fitCls(part)}" data-act="${fitCls(part).includes('fit') ? 'fit' : ''}" data-part="${part}"><title>${tip}${fitCls(part).includes('fit') ? ' — нажмите, чтобы поставить протез' : ''}</title>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="rgba(176,32,26,0.06)" stroke="${C.lost}" stroke-width="2" stroke-dasharray="5 4"/>
      <text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-size="18" fill="${C.lost}" font-weight="bold">✖</text></g>`;
  };
  const eye = (part, cx) => {
    const st = L[part];
    if (st === 'ok') return `<circle class="part" cx="${cx}" cy="44" r="4.5" fill="#fff" stroke="#333"><title>${PART_NAMES[part]}: цел</title></circle><circle cx="${cx}" cy="45" r="2" fill="#2a2a3a"/>`;
    if (st === 'prosthetic') return `<circle class="part" cx="${cx}" cy="44" r="5" fill="#7ad0ff" stroke="#1a5a9a" stroke-width="1.5" style="filter:drop-shadow(0 0 3px #3af)"><title>${PART_NAMES[part]}: стеклянный глаз</title></circle>`;
    return `<g class="${fitCls(part)}" data-act="${fitCls(part).includes('fit') ? 'fit' : ''}" data-part="${part}"><title>${PART_NAMES[part]}: ВЫКОЛОТ</title><circle cx="${cx}" cy="44" r="5" fill="#5a0a0a"/><text x="${cx}" y="48" text-anchor="middle" font-size="9" fill="#ff8a7a">✖</text></g>`;
  };
  // character's left side is the viewer's right
  let svg = `<svg width="180" height="283" viewBox="0 0 200 330">
    <defs><radialGradient id="kvglow"><stop offset="0" stop-color="rgba(255,240,200,0.6)"/><stop offset="1" stop-color="rgba(255,240,200,0)"/></radialGradient></defs>
    <ellipse cx="100" cy="170" rx="95" ry="160" fill="url(#kvglow)"/>
    ${limb('armR', 46, 82, 22, 104)}${limb('armL', 132, 82, 22, 104)}
    ${limb('legR', 74, 178, 23, 128)}${limb('legL', 103, 178, 23, 128)}
    <rect x="70" y="76" width="60" height="108" rx="10" fill="${torsoCol}" stroke="${C.stroke}" stroke-width="2"><title>Туловище${armorItem ? ': ' + armorItem.name : ''}</title></rect>
    ${armorItem ? '<path d="M78 90 L100 104 L122 90" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2"/><circle cx="100" cy="130" r="4" fill="rgba(0,0,0,0.25)"/>' : ''}
    <rect x="92" y="64" width="16" height="14" fill="${C.ok}" stroke="${C.stroke}" stroke-width="2"/>
    <circle cx="100" cy="44" r="25" fill="${C.ok}" stroke="${C.stroke}" stroke-width="2"/>
    ${game.playerFaction === 'elves' ? '<path d="M76 40 l-12 -12 l8 18 z M124 40 l12 -12 l-8 18 z" fill="#e9c69c" stroke="#5a3a1a" stroke-width="1.5"/>' : ''}
    ${eye('eyeR', 91)}${eye('eyeL', 109)}
    <path d="M92 56 q8 5 16 0" fill="none" stroke="#5a3a1a" stroke-width="2"/>`;
  // equipped weapon in the right hand, shield on the left
  const wId = game.equipment.weapon;
  if (wId && L.armR === 'ok') svg += `<text x="40" y="206" font-size="26">${ITEMS[wId].icon}</text>`;
  if (game.equipment.shield && p.shield) svg += `<text x="140" y="206" font-size="26">🛡️</text>`;
  if (p.bleed > 0) for (const [x, y] of lostMarks.length ? lostMarks : [[100, 130]]) {
    svg += `<g><circle cx="${x}" cy="${y + 4}" r="3.5" fill="#c00"><animate attributeName="cy" values="${y};${y + 26}" dur="0.9s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="0.9s" repeatCount="indefinite"/></circle></g>`;
  }
  if (p.hasWheelchair) svg += `<text x="150" y="320" font-size="26">♿</text>`;
  if (p.moveMode === 'crawl') svg += `<text x="100" y="326" text-anchor="middle" font-size="12" fill="#9a1a0a" font-weight="bold">ползёт</text>`;
  return svg + '</svg>';
}

function statusLines(p) {
  let s = '';
  if (p.bleed > 0) s += `<div class="bleed">🩸 Кровотечение −${p.bleed.toFixed(1)}/с — нужен бинт!</div>`;
  for (const part of ['armL', 'armR', 'legL', 'legR', 'eyeL', 'eyeR']) {
    const st = p.limbs[part];
    if (st === 'lost') s += `<div class="lost">✖ Нет: ${PART_NAMES[part]}</div>`;
    else if (st === 'prosthetic') s += `<div class="pros">⚙ Протез: ${PART_NAMES[part]}</div>`;
  }
  if (!s) s = '<div>Руки, ноги, глаза — всё на месте. Пока что.</div>';
  if (p.moveMode === 'crawl') s += `<div class="lost">Передвижение: ползком${p.hasWheelchair ? '' : ' (купите коляску или протез!)'}</div>`;
  if (p.hasWheelchair && p.legsOk < 2) s += `<div class="pros">♿ Коляска: ${p.useWheelchair ? 'сидите' : 'стоит рядом'} <button class="kv-btn" data-act="wc">${p.useWheelchair ? 'Слезть' : 'Сесть'}</button></div>`;
  return s;
}

function slot(icon, label, value) {
  return `<div class="kv-slot"><div class="kv-ico">${icon}</div><div><i>${label}</i>${esc(value)}</div></div>`;
}

function actionsFor(id) {
  const it = ITEMS[id], p = game.player;
  const eq = isEquipped(id);
  let main = '';
  if (['weapon', 'armor', 'shield'].includes(it.cat)) main = `<button class="kv-btn ${eq ? '' : 'pri'}" data-act="use" data-id="${id}">${eq ? 'Снять' : 'Надеть'}</button>`;
  else if (it.cat === 'prosthetic' && it.part) {
    const parts = lostPartsFor(it.part);
    main = parts.length ? parts.map(pt => `<button class="kv-btn pri" data-act="use" data-id="${id}" data-part="${pt}" title="Поставить самому (больно!)">${FIT_LABEL[pt]}</button>`).join('')
      : `<button class="kv-btn" disabled>Не нужен</button>`;
  } else if (id === 'wheelchair') main = `<button class="kv-btn pri" data-act="use" data-id="${id}" ${p.hasWheelchair ? 'disabled' : ''}>Сесть</button>`;
  else if (['medical', 'food'].includes(it.cat)) main = `<button class="kv-btn pri" data-act="use" data-id="${id}">${it.cat === 'food' ? (id === 'wine' ? 'Выпить' : 'Съесть') : 'Применить'}</button>`;
  else if (it.cat === 'misc') main = `<button class="kv-btn pri" data-act="use" data-id="${id}">${id === 'kirill_letter' ? 'Читать' : id === 'cardboard_box' ? 'Залезть' : 'Использовать'}</button>`;
  return main + `<button class="kv-btn red" data-act="drop" data-id="${id}" title="Выбросить (R)">✕</button>`;
}

function render(body) {
  const p = game.player;
  const eq = game.equipment;
  const inv = game.inventory;
  const cats = FILTERS.find(f => f[0] === filter)[2];
  const ids = [...inv.items.keys()].filter(id => ITEMS[id] && (!cats || cats.includes(ITEMS[id].cat)));
  let list = '';
  for (const cat of CAT_ORDER) {
    const l = ids.filter(id => ITEMS[id].cat === cat);
    if (!l.length) continue;
    list += `<div class="kv-cat">${CAT_NAMES[cat]}</div>`;
    for (const id of l) {
      const it = ITEMS[id], n = inv.count(id);
      list += `<div class="kv-row ${isEquipped(id) ? 'eq' : ''}" data-key="${id}"><div class="kv-ico">${it.icon}</div>
        <div><div class="kv-name">${esc(it.name)} ${n > 1 ? `<span class="n">×${n}</span>` : ''}${isEquipped(id) ? '<span class="tag">надето</span>' : ''}</div>
        <div class="kv-desc">${esc(it.desc)}</div></div>
        <div class="kv-price" style="font-weight:normal;font-size:12px">${it.weight ? (it.weight * n).toFixed(1).replace('.0', '') + ' кг' : ''}</div>
        <div class="kv-acts">${actionsFor(id)}</div></div>`;
    }
  }
  if (!list) list = '<div class="kv-empty">Пусто. Самое время грабить корованы.</div>';
  const w = inv.weight(), cap = inv.capacity;
  const wpn = p.activeWeapon;
  const fac = FACTIONS[game.playerFaction];
  body.innerHTML = `<div class="kv-inv">
    <div class="kv-doll">
      <div class="kv-parch">
        <div style="text-align:center;font-weight:bold">${esc(p.name)}</div>
        <div style="text-align:center;font-size:12px;color:${fac?.color ?? '#333'};filter:brightness(0.7)">${esc(fac?.name ?? '')}${game.rank ? ' — ' + esc(game.rank) : ''}</div>
        ${doll(p)}
        <div class="kv-bars">Здоровье ${Math.ceil(p.hp)} / ${p.maxHp}<div class="kv-bar"><i style="width:${Math.max(0, p.hp / p.maxHp * 100)}%"></i></div>
          Груз ${w} / ${cap} кг<div class="kv-bar w ${w > cap ? 'over' : ''}"><i style="width:${Math.min(100, w / cap * 100)}%"></i></div></div>
        <div class="kv-status">${statusLines(p)}</div>
      </div>
      <div class="kv-slots">
        ${slot(eq.weapon && p.limbs.armR === 'ok' ? ITEMS[eq.weapon].icon : p.limbs.armR === 'prosthetic' ? '🪝' : '✊', 'Оружие', `${wpn.name} (урон ${wpn.dmg})`)}
        ${slot(eq.armor ? ITEMS[eq.armor].icon : '👕', 'Доспехи', eq.armor ? `${ITEMS[eq.armor].name} (${Math.round(p.armor * 100)}%)` : 'рубаха (0%)')}
        ${slot(eq.shield ? '🛡️' : '—', 'Щит', eq.shield ? ITEMS[eq.shield].name : 'нет')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;min-height:0">
      <div class="kv-tabs">${FILTERS.map(([id, n], i) => `<button class="kv-tab ${filter === id ? 'on' : ''}" data-act="filter" data-f="${id}">${n}<span class="k">${i + 1}</span></button>`).join('')}</div>
      <div class="kv-parch list"><div class="kv-list kv-scroll" data-scroll="inv">${list}</div></div>
    </div>
  </div>
  <div class="kv-foot"><span class="kv-gold">💰 ${game.gold} зол.</span>
    <span class="kv-keys"><b>↑↓</b> выбор · <b>Enter</b> использовать · <b>R</b> выбросить · <b>1-4</b> фильтр · <b>I</b>/<b>Esc</b> закрыть</span>
    <span>День ${game.day + 1}</span></div>`;
  restoreSel();
}
