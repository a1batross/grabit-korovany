// Item table + player inventory + item use/equip logic (Daggerfall-style).
// game.inventory = { items: Map(id->count), add, remove, has, count, weight() }
// game.equipment = { weapon, armor, shield }  (ids; weapon also lives in player.weapon)
import { game } from '../core/game.js';
import { WEAPONS } from '../entities/weapons.js';
import { PART_NAMES } from '../entities/actor.js';

const WEAPON_META = {
  dagger:   { icon: '🗡️', w: 1, desc: 'Короткий, но колет прямо в глаз. Пол-экрана — врагу!' },
  club:     { icon: '🏏', w: 3, desc: 'Дубина. Классика крестьянского фехтования.' },
  sword:    { icon: '⚔️', w: 4, desc: 'Добротный меч дворцовой ковки. Хорошо рубит руки.' },
  elfblade: { icon: '🗡️', w: 3, desc: 'Лёгкий эльфийский клинок. Звенит, как листва на ветру.' },
  axe:      { icon: '🪓', w: 5, desc: 'Топор. Отрубает конечности с завидным постоянством.' },
  spear:    { icon: '🔱', w: 5, desc: 'Копьё. Длинное. Держите врага на расстоянии.' },
  halberd:  { icon: '🪓', w: 8, desc: 'Алебарда стражи. Тяжёлая, страшная, эффективная.' },
  mace:     { icon: '🔨', w: 5, desc: 'Булава. Плевать на доспехи.' },
  darkblade:{ icon: '🗡️', w: 6, desc: 'Тёмный клинок Злого. Шепчет по ночам. Рубит головы.' },
  bow:      { icon: '🏹', w: 2, desc: 'Простой лук. Стреляет стрелами (стрелы бесплатные, мы не Daggerfall).' },
  longbow:  { icon: '🏹', w: 2, desc: 'Эльфийский длинный лук. Бьёт далеко и больно.' },
};

export const ITEMS = {};
for (const w of Object.values(WEAPONS)) {
  if (w.id === 'fists') continue;
  const m = WEAPON_META[w.id] ?? { icon: '⚔️', w: 4, desc: '' };
  ITEMS[w.id] = { id: w.id, name: w.name, cat: 'weapon', price: w.price, weight: m.w, icon: m.icon,
    desc: `${m.desc} Урон ${w.dmg}, ${w.ranged ? 'дальность ' + w.reach + ' м' : 'досягаемость ' + w.reach + ' м'}.` };
}

const def = (id, o) => (ITEMS[id] = { id, weight: 1, ...o });

// --- armor (sets player.armor) ---
def('armor_leather', { name: 'Кожаная куртка', cat: 'armor', price: 60, weight: 6, icon: '🧥', armor: 0.12, desc: 'Защищает от комаров и немного от мечей.' });
def('armor_chain', { name: 'Кольчуга', cat: 'armor', price: 180, weight: 14, icon: '⛓️', armor: 0.25, desc: 'Тысяча колечек. Кузнец плёл джва года.' });
def('armor_guard', { name: 'Кираса стражи дворца', cat: 'armor', price: 260, weight: 15, icon: '🛡️', armor: 0.3, desc: 'С гербом императора. Выдаётся под роспись.' });
def('armor_plate', { name: 'Латы', cat: 'armor', price: 420, weight: 24, icon: '🤖', armor: 0.38, desc: 'Тяжёлые латы. Бегать в них — отдельный спорт.' });
def('armor_elven', { name: 'Эльфийская кольчуга', cat: 'armor', price: 380, weight: 5, icon: '🍃', armor: 0.3, desc: 'Лёгкая, как лист, прочная, как дуб.' });
def('armor_dark', { name: 'Тёмные доспехи Злого', cat: 'armor', price: 900, weight: 20, icon: '🖤', armor: 0.45, desc: 'Шипастые. Очень злые. Очень дорогие.' });

// --- shields ---
def('shield', { name: 'Деревянный щит', cat: 'shield', price: 30, weight: 5, icon: '🛡️', desc: 'Блокирует удары. Держится левой рукой (если она есть).' });
def('shield_iron', { name: 'Окованный щит', cat: 'shield', price: 90, weight: 8, icon: '🛡️', desc: 'Щит с железной оковкой. Звенит при блоке.' });
def('shield_guard', { name: 'Щит стражи', cat: 'shield', price: 120, weight: 8, icon: '🛡️', desc: 'Красный щит с гербом дворца.' });

// --- consumables / medicine ---
def('bandage', { name: 'Бинт', cat: 'medical', price: 8, weight: 0.2, icon: '🩹', desc: 'Останавливает кровотечение. Без него — истечёте кровью, как Кирилл и предупреждал.', consumable: true });
def('herbs', { name: 'Эльфийские травы', cat: 'medical', price: 22, weight: 0.3, icon: '🌿', desc: 'Восстанавливают 35 единиц здоровья и ослабляют кровотечение. Лесная медицина эльфов!', consumable: true });
def('potion_heal', { name: 'Зелье лечения', cat: 'medical', price: 45, weight: 0.5, icon: '🧪', desc: 'Красная жидкость. +70 здоровья. Вкус — как у малинового варенья с ржавчиной.', consumable: true });
def('bread', { name: 'Хлеб', cat: 'food', price: 3, weight: 0.5, icon: '🍞', desc: 'Свежий каравай. +10 здоровья.', consumable: true });
def('cheese', { name: 'Сыр', cat: 'food', price: 6, weight: 0.5, icon: '🧀', desc: '+15 здоровья. С дырками.', consumable: true });
def('meat', { name: 'Жареное мясо', cat: 'food', price: 9, weight: 0.8, icon: '🍗', desc: '+22 здоровья. Чьё — лучше не спрашивать.', consumable: true });
def('apple', { name: 'Яблоко', cat: 'food', price: 2, weight: 0.2, icon: '🍎', desc: '+6 здоровья. Эльфы говорят, оно от всех болезней.', consumable: true });
def('wine', { name: 'Вино', cat: 'food', price: 12, weight: 1, icon: '🍷', desc: '+8 здоровья, −трезвость. Мир покачивается.', consumable: true });

// --- trade goods (loot from caravans) ---
def('cloth', { name: 'Рулон сукна', cat: 'trade', price: 25, weight: 3, icon: '🧶', desc: 'Товар из корована. Продайте торговцу.' });
def('spices', { name: 'Пряности', cat: 'trade', price: 40, weight: 1, icon: '🌶️', desc: 'Заморские пряности из корована. Дорого!' });
def('silver', { name: 'Серебряный кубок', cat: 'trade', price: 65, weight: 1, icon: '🏆', desc: 'Явно чей-то. Теперь ваш.' });
def('jewel', { name: 'Драгоценный камень', cat: 'trade', price: 150, weight: 0.1, icon: '💎', desc: 'Блестит. Купцы любят.' });
def('furs', { name: 'Меха', cat: 'trade', price: 55, weight: 4, icon: '🦊', desc: 'Тёплые меха с севера.' });

// --- prosthetics & mobility (Kirill: "достать или купить протез") ---
def('prosthetic_arm', { name: 'Протез руки (крюк)', cat: 'prosthetic', price: 120, weight: 3, icon: '🪝', part: 'arm', desc: 'Деревянная рука с железным крюком. Крюком можно и колоть. Арр!' });
def('prosthetic_leg', { name: 'Деревянная нога', cat: 'prosthetic', price: 110, weight: 4, icon: '🦿', part: 'leg', desc: 'Самое хорошее — поставить протез! Будете слегка хромать.' });
def('glass_eye', { name: 'Волшебный стеклянный глаз', cat: 'prosthetic', price: 160, weight: 0.1, icon: '🔮', part: 'eye', desc: 'Светится голубым и возвращает зрение на пол-экрана.' });
def('wheelchair', { name: 'Коляска', cat: 'prosthetic', price: 90, weight: 12, icon: '♿', desc: 'Для тех, кто без ноги. Катайтесь! (X — сесть/слезть)' });

// --- misc / easter eggs ---
def('cardboard_box', { name: 'Картонная коробка', cat: 'misc', price: 15, weight: 1, icon: '📦', desc: 'Тактический шпионаж. Залезьте внутрь — враги вас почти не замечают, пока вы стоите.' });
def('kirill_letter', { name: 'Письмо Кирилла', cat: 'misc', price: 0, weight: 0, icon: '📜', desc: 'Древний свиток. Говорят, с него всё началось.', noSell: true });
def('torch', { name: 'Факел', cat: 'misc', price: 4, weight: 1, icon: '🔥', desc: 'Горит. Больше ничего не делает. Как и в Daggerfall.' });
def('lute', { name: 'Лютня', cat: 'misc', price: 35, weight: 3, icon: '🪕', desc: 'Сыграйте врагу — может, он передумает.' });

export const CAT_NAMES = {
  weapon: 'Оружие', armor: 'Доспехи', shield: 'Щиты', medical: 'Медицина', food: 'Еда и питьё',
  trade: 'Товары', prosthetic: 'Протезы', misc: 'Разное',
};
export const CAT_ORDER = ['weapon', 'shield', 'armor', 'medical', 'prosthetic', 'food', 'trade', 'misc'];

export const item = id => ITEMS[id];

// ---------------- inventory ----------------
export function createInventory() {
  const inv = {
    items: new Map(),
    add(id, n = 1) {
      if (!ITEMS[id] || n <= 0) { if (!ITEMS[id]) console.warn('unknown item', id); return false; }
      this.items.set(id, (this.items.get(id) ?? 0) + n);
      game.bus.emit('inventory:change', { id, n });
      updateEncumbrance();
      return true;
    },
    remove(id, n = 1) {
      const c = this.items.get(id) ?? 0;
      if (c < n) return false;
      if (c - n <= 0) this.items.delete(id); else this.items.set(id, c - n);
      // dropping the last copy of an equipped item unequips it
      const eq = game.equipment;
      if (eq && !this.items.has(id)) {
        if (eq.weapon === id) equip('fists', true);
        if (eq.armor === id) unequipArmor(true);
        if (eq.shield === id) unequipShield(true);
      }
      game.bus.emit('inventory:change', { id, n: -n });
      updateEncumbrance();
      return true;
    },
    has(id, n = 1) { return (this.items.get(id) ?? 0) >= n; },
    count(id) { return this.items.get(id) ?? 0; },
    clear() { this.items.clear(); updateEncumbrance(); },
    weight() { let w = 0; for (const [id, c] of this.items) w += (ITEMS[id]?.weight ?? 0) * c; return Math.round(w * 10) / 10; },
    get capacity() { return game.playerFaction === 'villain' ? 90 : 60; },
  };
  return inv;
}

export function updateEncumbrance() {
  const inv = game.inventory;
  if (!inv) return;
  const was = game.encumbered;
  game.encumbered = inv.weight() > inv.capacity;
  if (game.encumbered && !was && game.started) game.bus.emit('notify', { text: 'Вы перегружены! Скорость снижена. Продайте хлам торговцу.', kind: 'bad' });
}

// ---------------- equipment ----------------
export function isEquipped(id) {
  const e = game.equipment;
  return !!e && (e.weapon === id || e.armor === id || e.shield === id);
}

export function equip(id, silent = false) {
  const p = game.player, e = game.equipment;
  if (!p || !e) return false;
  const it = ITEMS[id];
  if (id === 'fists' || it?.cat === 'weapon') {
    e.weapon = id === 'fists' ? null : id;
    p.equipWeapon(id);
    if (!silent) {
      if (p.limbs.armR === 'lost') say(`Вы взяли «${it.name}»... но правой руки нет. Будете махать левой — кулаком.`, 'bad');
      else if (p.limbs.armR === 'prosthetic') say(`«${it.name}» не держится на крюке. Крюк — ваше оружие.`, 'bad');
      else say(id === 'fists' ? 'Вы убрали оружие.' : `В руке: ${it.name}`);
    }
    return true;
  }
  if (it?.cat === 'armor') {
    e.armor = id; p.armor = it.armor;
    if (!silent) say(`Надето: «${it.name}» (защита ${Math.round(it.armor * 100)}%)`);
    return true;
  }
  if (it?.cat === 'shield') {
    if (!p.limbUsable('armL') || p.limbs.armL === 'prosthetic') { if (!silent) say('Щит держать нечем — левой руки нет (крюк щит не держит).', 'bad'); return false; }
    e.shield = id; p.shield = true; p.body.setShield(true);
    if (!silent) say(`Вы взяли щит: ${it.name}`);
    return true;
  }
  return false;
}
export function unequipArmor(silent) { const p = game.player; game.equipment.armor = null; if (p) p.armor = 0; if (!silent) say('Вы сняли доспехи.'); }
export function unequipShield(silent) { const p = game.player; game.equipment.shield = null; if (p) { p.shield = false; p.body.setShield(false); } if (!silent) say('Вы убрали щит.'); }
export function unequip(id) {
  const e = game.equipment;
  if (e.weapon === id) equip('fists');
  else if (e.armor === id) unequipArmor();
  else if (e.shield === id) unequipShield();
}

function say(text, kind = '') { game.bus.emit('notify', { text, kind }); }

// Lost parts that a prosthetic of type `kind` ('arm'|'leg'|'eye') can be fitted to
export function lostPartsFor(kind, p = game.player) {
  if (!p) return [];
  const parts = kind === 'arm' ? ['armR', 'armL'] : kind === 'leg' ? ['legL', 'legR'] : ['eyeL', 'eyeR'];
  return parts.filter(x => p.limbs[x] === 'lost');
}

// Fit a prosthetic to the player (self-fit = painful; healer = clean)
export function fitPart(part, { byHealer = false } = {}) {
  const p = game.player;
  if (!p.fitProsthetic(part)) return false;
  if (part === 'armR' && game.equipment.weapon) say('Оружие на крюк не повесишь — теперь вы бьёте крюком!');
  if (part === 'armL' && game.equipment.shield) unequipShield(true);
  game.stats && (game.stats.prosthetics = (game.stats.prosthetics ?? 0) + 1);
  game.bus.emit('player:prosthetic', { part, byHealer });
  if (!byHealer) {
    p.hp = Math.max(1, p.hp - 15);
    say(part.startsWith('eye') ? 'Вы вставили стеклянный глаз сами. Щёлк! Мир снова целый (почти).' :
      `Вы сами приладили протез (${PART_NAMES[part]}) — ремнями и гвоздями. Больно, но работает!`, 'good');
  }
  return true;
}

// Use / consume an item. Returns true if something happened.
export function useItem(id, opts = {}) {
  const p = game.player, inv = game.inventory, it = ITEMS[id];
  if (!p || !it || !inv.has(id) || !p.alive) return false;
  if (['weapon', 'armor', 'shield'].includes(it.cat)) {
    if (isEquipped(id)) { unequip(id); return true; }
    return equip(id);
  }
  const consume = () => { inv.remove(id, 1); game.bus.emit('item:used', { id }); };
  switch (id) {
    case 'bandage':
      if (p.bleed > 0) { p.stopBleeding(); say('Вы туго перевязали рану. Кровотечение остановлено.', 'good'); }
      else { p.heal(5); say('Вы перевязали царапины. +5 здоровья.'); }
      consume(); return true;
    case 'herbs':
      p.heal(35); p.bleed = p.bleed > 0 ? Math.max(0, p.bleed * 0.4 - 0.2) : 0;
      say(p.bleed > 0 ? 'Травы помогли, но кровь всё ещё идёт. Нужен бинт.' : 'Эльфийские травы: +35 здоровья, кровотечение унялось.', 'good');
      consume(); return true;
    case 'potion_heal': p.heal(70); say('Зелье лечения: +70 здоровья. Конечности, увы, не отрастают.', 'good'); consume(); return true;
    case 'bread': p.heal(10); say('Вкусный хлеб. +10 здоровья.'); consume(); return true;
    case 'cheese': p.heal(15); say('Сыр. +15 здоровья.'); consume(); return true;
    case 'meat': p.heal(22); say('Мясо! +22 здоровья.'); consume(); return true;
    case 'apple': p.heal(6); say('Хрум. +6 здоровья.'); consume(); return true;
    case 'wine': {
      p.heal(8); consume();
      game.stats && (game.stats.wine = (game.stats.wine ?? 0) + 1);
      drunk(25);
      say(['Ик! Мир покачивается.', 'Вино ударило в голову. Корованы двоятся!', 'Вы чувствуете в себе силы ограбить сразу два корована.'][Math.floor(Math.random() * 3)]);
      return true;
    }
    case 'prosthetic_arm': case 'prosthetic_leg': case 'glass_eye': {
      const parts = lostPartsFor(it.part);
      if (!parts.length) { say(it.part === 'eye' ? 'Оба глаза на месте. Вставлять третий — перебор.' : `Все ${it.part === 'arm' ? 'руки' : 'ноги'} на месте. Протез пока не нужен — но пусть полежит.`); return false; }
      const part = opts.part && parts.includes(opts.part) ? opts.part : parts[0];
      if (fitPart(part)) { consume(); return true; }
      return false;
    }
    case 'wheelchair':
      if (p.hasWheelchair) { say('У вас уже есть коляска.'); return false; }
      p.useWheelchair = true; p.setWheelchair(true); consume();
      say(p.legsOk < 2 ? 'Вы сели в коляску! Теперь не ползать, а кататься. (X — слезть)' : 'Вы поставили коляску рядом. Пригодится, если что-то случится с ногами...', 'good');
      game.bus.emit('player:wheelchair');
      return true;
    case 'cardboard_box': toggleBox(); return true;
    case 'kirill_letter': game.bus.emit('ui:letter'); return true;
    case 'torch': say('Факел горит. Ничего не происходит.'); return true;
    case 'lute': say(['Вы сыграли «Я джва года ждал». Птицы замолкли.', 'Бреньк. Ближайший эльф скривился.', 'Вы исполнили балладу о корованах. Скупая слеза.'][Math.floor(Math.random() * 3)]); return true;
    default:
      say(`Это ${it.name.toLowerCase()}. Можно продать торговцу.`);
      return false;
  }
}

// --- wine: woozy screen ---
let drunkT = 0, drunkTimer = null;
function drunk(sec) {
  drunkT = Math.min(90, drunkT + sec);
  if (drunkTimer) return;
  const app = document.getElementById('app');
  drunkTimer = setInterval(() => {
    if (!game.uiOpen && !game.paused) drunkT -= 0.1;
    const k = Math.max(0, Math.min(1, drunkT / 40));
    const t = performance.now() / 1000;
    app.style.filter = k > 0 ? `blur(${(k * 1.6).toFixed(2)}px) saturate(${1 + k * 0.6}) hue-rotate(${Math.sin(t) * k * 12}deg)` : '';
    app.style.transform = k > 0 ? `rotate(${Math.sin(t * 0.9) * k * 1.2}deg) scale(${1 + k * 0.03})` : '';
    if (drunkT <= 0) { clearInterval(drunkTimer); drunkTimer = null; app.style.filter = ''; app.style.transform = ''; }
  }, 100);
}

// --- cardboard box: hide from enemies while standing still ---
let boxMesh = null, boxPrevStealth = null, boxTimer = null;
export function inBox() { return !!boxMesh; }
function toggleBox() {
  const p = game.player;
  const T = game.THREE;
  if (boxMesh) {
    boxMesh.parent?.remove(boxMesh); boxMesh = null;
    clearInterval(boxTimer); boxTimer = null;
    game.playerStealth = boxPrevStealth ?? undefined;
    say('Вы вылезли из коробки.');
    return;
  }
  boxMesh = new T.Mesh(new T.BoxGeometry(0.95, 1.25, 0.8), new T.MeshLambertMaterial({ color: '#b08a55' }));
  boxMesh.position.y = 0.62; boxMesh.castShadow = true;
  const tape = new T.Mesh(new T.BoxGeometry(0.97, 0.08, 0.82), new T.MeshLambertMaterial({ color: '#d8c49a' }));
  tape.position.y = 0.45; boxMesh.add(tape);
  p.body.root.add(boxMesh);
  boxPrevStealth = game.playerStealth;
  say('Вы залезли в картонную коробку. Тактический шпионаж! Стойте смирно — и вас никто не заметит.', 'good');
  game.bus.emit('player:box');
  boxTimer = setInterval(() => {
    if (!boxMesh) return;
    if (!p.alive || p.attackT >= 0) { toggleBox(); return; }
    const still = Math.hypot(p.vel.x, p.vel.z) < 0.4;
    game.playerStealth = still ? 40 : 3;
  }, 200);
}
