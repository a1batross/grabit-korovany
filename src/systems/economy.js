// Economy: Daggerfall-style shops with keepers, haggling, faction-based prices, healer & prosthetist services,
// tavern (rent a bed, rumours), corpse looting, starting kits and the game.stats counters.
// Public: game.inventory, game.equipment, game.stats, game.economy = { shops, openShop(key), lootActor(actor), ... }
import { game } from '../core/game.js';
import { spawn } from '../entities/spawn.js';
import { addInteractable } from '../entities/player.js';
import { LOC } from '../world/zones.js';
import { factionsHostile } from './factions.js';
import { ITEMS, createInventory, equip, fitPart, lostPartsFor, updateEncumbrance } from './items.js';
import { PART_NAMES } from '../entities/actor.js';
import { openShopUI, refreshShopUI } from '../ui/screens/shop.js';
import { openLootUI } from '../ui/screens/loot.js';

export const name = 'economy';

const pick = a => a[Math.floor(Math.random() * a.length)];
const say = (text, kind = '') => game.bus.emit('notify', { text, kind });

// ---------------------------------------------------------------- stats
export function ensureStats() {
  game.stats ??= {};
  const d = { kills: 0, killsBy: {}, limbsChopped: 0, eyesGouged: 0, heads: 0, caravansRobbed: 0, goldEarned: 0, goldSpent: 0,
    itemsBought: 0, itemsSold: 0, haggleWins: 0, haggleFails: 0, prosthetics: 0, corpsesLooted: 0, wine: 0, limbsLost: 0, healerVisits: 0, slept: 0 };
  for (const k in d) game.stats[k] ??= d[k];
  return game.stats;
}

// ---------------------------------------------------------------- shop definitions
const RUMORS = [
  'Говорят, корованы ходят по дороге от Слободы ко дворцу. Охрана там — так себе.',
  'Один эльф рассказывал: в лесу деревья вдали — картинкой, а подойдёшь — трёхмерные! Колдовство, не иначе.',
  'Злой сидит в старом форте в горах. Имя ему так и не придумали.',
  'Шпионы Злого переодеваются крестьянами. Если крестьянин ходит с кинжалом — это не крестьянин.',
  'Мой кузен потерял ногу в бою. Теперь катается на коляске и всех обгоняет на спуске.',
  'Лекарь в Слободе ставит протезы. Деревянная нога — самое хорошее, так все говорят.',
  'Император опять повысил налоги. Корованы теперь богаче — и вкуснее для грабителей.',
  'Есть один парень, Кирилл. Говорят, джва года ждёт какую-то игру.',
  'Если выколют глаз — не помрёшь, просто пол экрана видно не будет. Мне так бабка рассказывала.',
  'На чёрном рынке в форте продают б/у протезы. Происхождение лучше не уточнять.',
  'Эльфы лечатся травами. Помогает, если кровь не хлещет.',
  'Если заснуть с кровотечением — проснёшься мёртвым. Сначала бинт!',
  'Говорят, в картонной коробке можно пройти мимо целой армии. Главное — не шевелиться.',
  'Набигают! Каждую неделю кто-нибудь да набигает.',
];

const HEALER_LINES = {
  greet: [
    'Заходите, заходите! Что отрубили на этот раз?',
    'Лекарь и протезист к вашим услугам. Руки, ноги, глаза — всё поправимо! Кроме головы.',
    'А, клиент! Кровью мне пол не заливайте, я только помыл.',
  ],
  bleed: ['Так-так, хлещет... Сейчас перетянем. Не дёргайтесь!', 'Жгут, бинт, немного самогона — и как новенький!'],
  heal: ['Пара примочек, подорожник — и готово. С вас денежка.', 'Здоровье — бесценно. Но у меня есть прайс.'],
  fitLeg: ['Деревянная нога — самое хорошее! Так и Кирилл говорил. Ходить будете с прихрамыванием, зато сами!', 'Дуб, мореный, с резиновой пяткой. Сносу не будет!'],
  fitArm: ['Крюк! Крюком и бить можно, и кружку держать. Пираты обзавидуются.', 'Вот вам рука. Не родная, но своя.'],
  fitEye: ['Волшебный стеклянный глаз! Светится в темноте, видит на пол экрана больше.', 'Вставляем... щёлк! Теперь вы снова видите всё. Голубым.'],
  reattach: ['Пришить обратно? Я лекарь, а не некромант. Только протез!', 'Вашу руку уже доедают вороны. Давайте лучше крюк.'],
};

// Look overrides keep keepers recognisable
const SHOP_DEFS = {
  'shop:weapons': {
    title: 'Кузница «Ржавый гвоздь»', keeperName: 'Кузнец Тихон', preset: 'merchant', faction: 'humans',
    look: { shirt: '#5a4632', pants: '#3a2c20', hat: null, belly: false, beard: '#3a2412', hair: '#2a1a0a', armor: '#6a4a30' },
    fallback: ['town', 24, -14], priceMul: 1, sellRate: 0.45, buys: ['weapon', 'shield', 'armor'],
    stock: { dagger: 3, club: 4, sword: 3, axe: 3, spear: 2, mace: 2, halberd: 1, bow: 2, shield: 3, shield_iron: 2, armor_leather: 3, armor_chain: 2, armor_plate: 1 },
    greet: ['Добро пожаловать в кузницу! Мечи, топоры, латы — всё, чтобы отрубать руки и не терять свои.', 'Чем рубить будем? Есть топоры — руки так и отлетают!', 'Куй железо, не отходя от кассы!'],
  },
  'shop:general': {
    title: 'Лавка «Всё для корована»', keeperName: 'Купец Абрам', preset: 'merchant', faction: 'humans',
    look: { shirt: '#3a5a9a' }, fallback: ['town', -20, 10], priceMul: 1, sellRate: 0.38, buys: 'all',
    stock: { bandage: 15, bread: 12, cheese: 8, apple: 15, meat: 6, wine: 6, potion_heal: 4, torch: 5, cardboard_box: 2, lute: 1, cloth: 3 },
    greet: ['Заходи, дорогой! Бинты, хлеб, вино... Корованы не грабишь? Нет? Ну и правильно, ха-ха.', 'Всё для путника! Бинт купи — без бинта нынче никуда.', 'Покупаю всё, продаю всё. Даже коробку!'],
  },
  'shop:healer': {
    title: 'Лекарь и протезист Айболит', keeperName: 'Лекарь Айболит', preset: 'healer', faction: 'humans',
    look: {}, fallback: ['town', 12, 28], priceMul: 1, sellRate: 0.4, buys: ['medical', 'prosthetic'],
    stock: { bandage: 20, herbs: 4, potion_heal: 6, prosthetic_arm: 2, prosthetic_leg: 3, glass_eye: 2, wheelchair: 2 },
    services: 'healer', greet: HEALER_LINES.greet,
  },
  'shop:tavern': {
    title: 'Таверна «Пьяный корован»', keeperName: 'Трактирщица Глаша', preset: 'merchant', faction: 'humans',
    look: { shirt: '#9a3a3a', pants: '#6a2a2a', hat: null, belly: true, hair: '#c87a2a' }, fallback: ['town', -26, -22], priceMul: 1, sellRate: 0.35, buys: ['food', 'trade'],
    stock: { wine: 25, bread: 10, meat: 10, cheese: 8, apple: 6 },
    services: 'tavern',
    greet: ['Заходи, путник! Вино, мясо, койка на ночь. Слухи — бесплатно... почти.', 'Опять корован ограбили! Не ты, случаем? Шучу. Наливать?', 'Садись, отдохни. Кровь с сапог только вытри.'],
  },
  'shop:elves': {
    title: 'Эльфийская лавка «Лист и тетива»', keeperName: 'Эльф-торговец Элендил', preset: 'merchant', kind: 'elf', faction: 'elves',
    look: { shirt: '#3a8a4a', hood: '#2a6a3a' }, fallback: ['elfVillage', 16, -14], priceMul: 1.05, sellRate: 0.4, buys: ['weapon', 'medical', 'food', 'trade'],
    stock: { elfblade: 2, bow: 3, longbow: 2, armor_elven: 1, herbs: 15, apple: 12, bandage: 8, wine: 4 },
    greet: ['Мэ гованнэн, лесной брат. Луки, клинки, травы — всё из чистой листвы.', 'Деревья шепчут, что ты пришёл за луком.', 'Лес даёт — лес берёт. Цены честные, эльфийские.'],
  },
  'shop:fort': {
    title: 'Чёрный рынок «У Злого»', keeperName: 'Барыга Фикса', preset: 'merchant', kind: 'spy', faction: 'humans',
    look: { shirt: '#2a2a2a', hood: '#111', belly: true }, fallback: ['fort', 14, 18], priceMul: 0.72, sellRate: 0.55, buys: 'all',
    stock: { dagger: 4, axe: 2, mace: 2, darkblade: 1, armor_leather: 2, armor_dark: 1, shield_iron: 1, potion_heal: 3, bandage: 6, cardboard_box: 3, prosthetic_leg: 1, prosthetic_arm: 1, glass_eye: 1, jewel: 1, silver: 2, spices: 2, wine: 5 },
    greet: ['Тссс... Чего надо? Всё ворованное, но отличного качества.', 'Б/у протезы, краденое сукно, кинжалы без истории. Бери, пока Злой не видит.', 'Покупаю добычу с корованов. Вопросов не задаю.'],
  },
  'shop:palace': {
    title: 'Интендант дворцовой стражи', keeperName: 'Интендант Порфирий', preset: 'merchant', kind: 'guard', faction: 'guard',
    look: { shirt: '#8a2a2a', helmet: 'steel', belly: true }, fallback: ['palace', -40, 18], priceMul: 1.15, sellRate: 0.4, buys: ['weapon', 'shield', 'armor', 'medical'],
    stock: { sword: 4, spear: 3, halberd: 2, bow: 2, shield_guard: 3, armor_chain: 3, armor_guard: 2, armor_plate: 1, bandage: 12, potion_heal: 4 },
    services: 'palace',
    greet: ['Стражникам — скидка! Остальным — строго по уставу.', 'Распишитесь в получении. Неразборчиво — тоже можно.', 'Казённое имущество! Не потеряйте. Особенно руки.'],
  },
};

export const shops = new Map(); // key -> shop state

function placeFor(key, d) {
  const pl = game.places?.get?.(key);
  if (pl) return { x: pl.x, z: pl.z, yaw: pl.yaw ?? 0, name: pl.name };
  const [loc, dx, dz] = d.fallback;
  const L = LOC[loc];
  return { x: L.x + dx, z: L.z + dz, yaw: 0, name: d.title };
}

function spawnKeeper(shop) {
  const d = shop.def, pl = shop.place;
  const k = spawn(d.preset, pl.x, pl.z, {
    name: d.keeperName, faction: d.faction, kind: d.kind ?? d.preset, look: d.look, hp: 90, role: d.preset === 'healer' ? 'healer' : 'merchant',
    gold: 120 + Math.floor(Math.random() * 120), yaw: pl.yaw,
    order: { type: 'guard', x: pl.x, z: pl.z, r: 1.5, yaw: pl.yaw },
  });
  k.shopKey = shop.key;
  k.isShopkeeper = true;
  // what a dead keeper drops: a few things from the shelves
  const ids = Object.keys(shop.stock).filter(id => shop.stock[id] > 0);
  k.loot = [...k.loot, ...Array.from({ length: 3 }, () => pick(ids)).filter(Boolean)];
  shop.keeper = k;
  shop.deadSince = null;
  return k;
}

function initShop(key, d) {
  const shop = {
    key, def: d, title: d.title, place: placeFor(key, d), stock: { ...d.stock },
    discount: 0, mood: 0, haggles: 0, haggleDay: -1, bannedUntil: -1, lastRestock: game.day, keeper: null, deadSince: null,
    salaryDay: -1,
  };
  shops.set(key, shop);
  spawnKeeper(shop);
  // talk to the keeper
  addInteractable({
    pos: () => shop.keeper.pos, r: 3.2,
    enabled: () => shop.keeper?.alive && !shop.keeper.removed,
    label: () => (d.services === 'healer' ? `Лечиться и торговать: ${shop.keeper.name}` : d.services === 'tavern' ? `Таверна: ${shop.keeper.name}` : `Торговать: ${shop.keeper.name}`),
    use: () => openShop(key),
  });
  // closed sign when the keeper was killed
  addInteractable({
    pos: () => shop.place, r: 4,
    enabled: () => !shop.keeper?.alive || shop.keeper.removed,
    label: () => `${shop.title} — ЗАКРЫТО (торговца убили)`,
    use: () => say(pick(['Дверь заперта. На ней мелом: «Ушёл на тот свет, буду не скоро».', 'Лавка закрыта. Некому торговать — сами знаете почему.', 'Закрыто. Ждите нового торговца (обычно присылают через день).']), 'bad'),
  });
}

// ---------------------------------------------------------------- relations & prices
// Returns { mul, refuse?: string, note: string }
export function relation(shop) {
  const p = game.player, k = shop.keeper, pf = game.playerFaction, kf = shop.def.faction;
  if (!k?.alive) return { mul: 1, refuse: 'Торговец мёртв.' };
  if (k.grudges?.has(p) || (k.ai?.target === p)) return { mul: 9, refuse: pick(['Ты на меня напал! Вон отсюда, пока я стражу не позвал!', 'С бандитами не торгую. Особенно с теми, кто меня бил.']) };
  if (p.outlawFor?.has(kf)) return { mul: 9, refuse: 'Ты предатель! Тебе тут ничего не продадут.' };
  if (factionsHostile(kf, pf)) return { mul: 9, refuse: kf === 'elves' ? 'Человек дворца... или слуга Злого? Уходи, пока стрела не нашла твой глаз.' : 'Враг в лавке! Стража!.. Ладно, просто уходи.' };
  if (shop.bannedUntil > game.worldTime) return { mul: 9, refuse: pick(['Я же сказал — проваливай! Приходи завтра, торгаш несчастный.', 'Не буду с тобой торговаться. И торговать не буду. До завтра!']) };
  let mul = 1, note = 'нейтральное';
  if (kf === pf) { mul = shop.key === 'shop:palace' ? 0.65 : 0.85; note = shop.key === 'shop:palace' ? 'своим скидка 35%' : 'дружелюбное (свой)'; }
  else if (shop.key === 'shop:fort') { mul = pf === 'villain' ? 0.85 : 1.1; note = pf === 'villain' ? 'Злому — уважение' : 'настороженное'; }
  else if (kf === 'humans') {
    if (pf === 'villain') { mul = 1.35; note = 'боится и дерёт втридорога'; }
    else if (pf === 'elves') { mul = 1.1; note = 'косится на уши'; }
  }
  mul *= 1 - Math.max(-2, Math.min(2, shop.mood)) * 0.03;
  return { mul, note };
}

export function buyPrice(shop, id) {
  const base = ITEMS[id]?.price ?? 0;
  const r = relation(shop);
  return Math.max(1, Math.round(base * shop.def.priceMul * r.mul * (1 - shop.discount)));
}
export function sellPrice(shop, id) {
  const it = ITEMS[id];
  if (!it || it.noSell || !shopBuys(shop, id)) return 0;
  const r = relation(shop);
  const p = Math.floor(it.price * shop.def.sellRate / Math.max(0.7, r.mul) * (1 + shop.discount * 0.5));
  return Math.max(1, Math.min(p, buyPrice(shop, id) - 1));
}
export function shopBuys(shop, id) {
  const b = shop.def.buys, it = ITEMS[id];
  return !!it && !it.noSell && (b === 'all' || b.includes(it.cat));
}

function restock(shop) {
  if (shop.lastRestock === game.day) return;
  shop.lastRestock = game.day;
  for (const [id, n] of Object.entries(shop.def.stock)) shop.stock[id] = Math.max(shop.stock[id] ?? 0, n);
  shop.discount *= 0.5; // haggled discount fades with time
}

// ---------------------------------------------------------------- trade actions
export function openShop(key) {
  const shop = shops.get(key);
  if (!shop) return;
  restock(shop);
  if (shop.haggleDay !== game.day) { shop.haggleDay = game.day; shop.haggles = 0; }
  const r = relation(shop);
  if (r.refuse) { say(`${shop.keeper?.name ?? 'Торговец'}: «${r.refuse}»`, 'bad'); return; }
  if (key === 'shop:healer') ensureStats().healerVisits++;
  openShopUI(shop);
}

export function buy(shop, id, n = 1) {
  if ((shop.stock[id] ?? 0) < n) return { ok: false, msg: 'Этого больше нет.' };
  const price = buyPrice(shop, id) * n;
  if (!game.addGold(-price, 'buy')) return { ok: false, msg: pick(['Денег не хватает. Иди корованы грабь, потом приходи.', 'Без денег — не продаю. Это вам не благотворительность.']) };
  shop.stock[id] -= n;
  if (shop.stock[id] <= 0) delete shop.stock[id];
  game.inventory.add(id, n);
  const s = ensureStats(); s.itemsBought += n; s.goldSpent += price;
  if (shop.keeper) shop.keeper.gold += price;
  game.bus.emit('shop:buy', { shop: shop.key, id, n, price });
  return { ok: true, msg: `Куплено: ${ITEMS[id].name} за ${price} зол.` };
}

export function sell(shop, id, n = 1) {
  const price = sellPrice(shop, id) * n;
  if (!price) return { ok: false, msg: 'Это мне не нужно.' };
  if (!game.inventory.has(id, n)) return { ok: false, msg: 'У вас этого нет.' };
  game.inventory.remove(id, n);
  game.addGold(price, 'sell');
  shop.stock[id] = (shop.stock[id] ?? 0) + n;
  ensureStats().itemsSold += n;
  game.bus.emit('shop:sell', { shop: shop.key, id, n, price });
  return { ok: true, msg: `Продано: ${ITEMS[id].name} за ${price} зол.` };
}

const HAGGLE_OK = [
  'Эх, грабишь ты меня без ножа... Ладно, уступлю.',
  'Только ради тебя! И только сегодня!',
  'Ну и язык у тебя. Хорошо, скидка.',
  'Ладно-ладно, не плачь. Сбавлю цену.',
];
const HAGGLE_FAIL = [
  'Ты что, Кирилл? Джва года торговаться будешь?',
  'Цена окончательная! Как приговор Злого.',
  'Торгуйся с корованом, а у меня всё по-честному.',
  'Ещё раз сбавишь — я сам цену подниму.',
  'Не нравится — грабь корованы, а у меня тут лавка!',
];
export function haggle(shop) {
  const s = ensureStats();
  if (shop.discount >= 0.35) return { ok: false, msg: 'Дальше некуда! Я и так в убыток торгую!' };
  let chance = 0.58 - shop.haggles * 0.13 + (game.playerFaction === 'villain' ? 0.1 : 0) + Math.min(0.1, s.haggleWins * 0.01);
  shop.haggles++;
  if (Math.random() < chance) {
    const d = 0.06 + Math.random() * 0.08;
    shop.discount = Math.min(0.35, shop.discount + d);
    s.haggleWins++;
    game.bus.emit('shop:haggle', { ok: true });
    return { ok: true, msg: `${pick(HAGGLE_OK)} (скидка теперь ${Math.round(shop.discount * 100)}%)` };
  }
  shop.mood -= 1; s.haggleFails++;
  game.bus.emit('shop:haggle', { ok: false });
  if (shop.mood <= -3) {
    shop.mood = -1; shop.discount = 0;
    shop.bannedUntil = game.worldTime + 12 * 60;
    return { ok: false, kicked: true, msg: 'ВСЁ! Надоел! Вон из моей лавки, приходи через полдня!' };
  }
  return { ok: false, msg: `${pick(HAGGLE_FAIL)} (торговец раздражён)` };
}

// ---------------------------------------------------------------- services
// Returns a list of { id, label, desc, price, disabled, run() -> {ok,msg} }
export function services(shop) {
  const p = game.player, out = [];
  const type = shop.def.services;
  if (type === 'healer') {
    out.push({
      id: 'bleed', label: 'Остановить кровотечение', desc: p.bleed > 0 ? `Кровь хлещет: −${p.bleed.toFixed(1)} в секунду!` : 'Кровотечения нет.',
      price: Math.round(12 * relation(shop).mul), disabled: !(p.bleed > 0),
      run: () => { p.stopBleeding(); return { ok: true, msg: pick(HEALER_LINES.bleed) }; },
    });
    const miss = Math.ceil(p.maxHp - p.hp);
    out.push({
      id: 'heal', label: 'Залечить раны', desc: miss > 0 ? `Не хватает ${miss} здоровья.` : 'Вы здоровы как бык.',
      price: Math.max(3, Math.round((miss * 0.45 + 3) * relation(shop).mul)), disabled: miss <= 0,
      run: () => { p.heal(p.maxHp); p.stopBleeding(); return { ok: true, msg: pick(HEALER_LINES.heal) }; },
    });
    const FIT = { arm: ['prosthetic_arm', 'fitArm', 'Поставить крюк'], leg: ['prosthetic_leg', 'fitLeg', 'Поставить деревянную ногу'], eye: ['glass_eye', 'fitEye', 'Вставить стеклянный глаз'] };
    for (const kind of ['leg', 'arm', 'eye']) {
      for (const part of lostPartsFor(kind)) {
        const [itemId, line, label] = FIT[kind];
        const own = game.inventory.has(itemId);
        const fee = Math.round(25 * relation(shop).mul);
        const price = own ? fee : fee + buyPrice(shop, itemId);
        out.push({
          id: 'fit:' + part, label: `${label} (${PART_NAMES[part]})`,
          desc: own ? 'Протез у вас с собой — только работа мастера.' : 'Протез + работа мастера. Без боли и гвоздей!', price,
          run: () => {
            if (own) game.inventory.remove(itemId, 1);
            fitPart(part, { byHealer: true });
            p.stopBleeding();
            return { ok: true, msg: pick(HEALER_LINES[line]) };
          },
        });
        out.push({ id: 'reattach:' + part, label: `Пришить обратно (${PART_NAMES[part]})`, desc: 'Вдруг получится?', price: 0, joke: true,
          run: () => ({ ok: false, msg: pick(HEALER_LINES.reattach) }) });
      }
    }
    if (!out.some(s => s.id.startsWith('fit:'))) {
      out.push({ id: 'checkup', label: 'Осмотр', desc: 'Лекарь посмотрит, всё ли на месте.', price: 0,
        run: () => ({ ok: true, msg: p.limbs.legL === 'ok' && p.limbs.legR === 'ok' && p.armsOk === 2 && p.eyesOk === 2
          ? 'Руки, ноги, глаза — всё на месте! Редкий случай в наших краях. Берегите себя.' : 'Протезы в порядке. Смазывайте крюк, не мочите ногу.' }) });
    }
  }
  if (type === 'tavern') {
    out.push({
      id: 'bed', label: 'Снять койку (поспать 8 часов)', desc: 'Полностью восстанавливает здоровье. Время идёт.', price: Math.round(10 * relation(shop).mul),
      run: () => {
        if (p.bleed > 0) return { ok: false, refund: true, msg: 'С кровотечением спать нельзя — простыни испачкаешь и не проснёшься! Перевяжись сначала.' };
        game.worldTime += 8 * 60;
        p.heal(p.maxHp); p.stamina = p.maxStamina;
        ensureStats().slept++;
        game.bus.emit('player:sleep', { hours: 8 });
        return { ok: true, msg: pick(['Вы спите как убитый. Почти буквально. Проснулись бодрым! (+8 часов)', 'Вам снились корованы. Много корованов. (+8 часов, здоровье восстановлено)']) };
      },
    });
    out.push({ id: 'rumor', label: 'Послушать слухи', desc: 'Трактирщица знает всё.', price: 2,
      run: () => { const r = pick(RUMORS); game.journal.add('Слух из таверны: ' + r); return { ok: true, msg: r }; } });
  }
  if (type === 'palace') {
    const guard = game.playerFaction === 'guard';
    out.push({
      id: 'salary', label: 'Получить жалованье', desc: guard ? 'Раз в сутки. Положено по уставу.' : 'Только для стражи дворца.', price: 0,
      disabled: !guard || shop.salaryDay === game.day,
      run: () => {
        shop.salaryDay = game.day;
        const n = 30 + (game.rankLevel ?? 0) * 15;
        game.addGold(n, 'salary');
        return { ok: true, msg: `Жалованье: ${n} зол. Распишитесь. Не там. Вот тут.` };
      },
    });
  }
  return out;
}

export function runService(shop, svc) {
  if (svc.disabled) return { ok: false, msg: 'Сейчас это не нужно.' };
  if (svc.price > 0 && !game.addGold(-svc.price, 'service')) return { ok: false, msg: 'Не хватает золота. Лекарь в долг не лечит.' };
  const r = svc.run();
  if (r.refund && svc.price > 0) game.addGold(svc.price, 'refund');
  else if (svc.price > 0) ensureStats().goldSpent += svc.price;
  return r;
}

// ---------------------------------------------------------------- corpse looting
const ROLE_LOOT = {
  guard: [['bandage', 0.35], ['bread', 0.3], ['armor_guard', 0.06], ['armor_chain', 0.08], ['potion_heal', 0.08]],
  commander: [['armor_guard', 1], ['potion_heal', 1], ['silver', 0.6]],
  emperor: [['jewel', 1], ['jewel', 1], ['silver', 1], ['wine', 1]],
  minion: [['bandage', 0.25], ['meat', 0.3], ['armor_leather', 0.1], ['wine', 0.2]],
  villain: [['armor_dark', 1], ['potion_heal', 1], ['jewel', 1]],
  elf: [['herbs', 0.45], ['apple', 0.4], ['bandage', 0.2]],
  elfChief: [['armor_elven', 1], ['herbs', 1], ['herbs', 1]],
  peasant: [['bread', 0.4], ['apple', 0.4], ['torch', 0.1]],
  merchant: [['cloth', 0.6], ['spices', 0.4], ['jewel', 0.15], ['silver', 0.25]],
  caravaneer: [['bandage', 0.4], ['bread', 0.5], ['cloth', 0.2]],
  spy: [['cardboard_box', 0.25], ['potion_heal', 0.2], ['bandage', 0.3]],
  healer: [['bandage', 1], ['herbs', 0.7], ['potion_heal', 0.6], ['prosthetic_leg', 0.2]],
};

function makeBag(a) {
  const items = new Map();
  const add = id => { if (ITEMS[id]) items.set(id, (items.get(id) ?? 0) + 1); };
  for (const id of a.loot ?? []) add(id);
  if (a.weapon && a.weapon.id !== 'fists' && ITEMS[a.weapon.id] && Math.random() < 0.85) add(a.weapon.id);
  if (a.shield || (a.kind === 'guard' && a.body?.shieldMesh)) add(a.faction === 'guard' ? 'shield_guard' : 'shield');
  for (const [id, ch] of ROLE_LOOT[a.kind] ?? []) if (Math.random() < ch) add(id);
  // Kirill: "достать протез" — sometimes the dead had one
  if (Math.random() < 0.035) add(pick(['prosthetic_leg', 'prosthetic_arm', 'glass_eye']));
  if (Math.random() < 0.01 && !game.inventory?.has('kirill_letter')) add('kirill_letter');
  return { gold: Math.max(0, Math.floor(a.gold ?? 0)), items };
}

export function bagEmpty(bag) { return !bag || (bag.gold <= 0 && bag.items.size === 0); }

function registerCorpse(a) {
  if (a.isPlayer || a.lootBag) return;
  a.lootBag = makeBag(a);
  if (a.role === 'cargo') return; // caravan carts are handled by the caravan system
  let unreg = null;
  unreg = addInteractable({
    pos: () => a.pos, r: 2.4,
    enabled: () => {
      if (a.removed || bagEmpty(a.lootBag)) { queueMicrotask(() => unreg?.()); return false; }
      return game.time - a.deathTime > 0.8;
    },
    label: () => `Обыскать труп: ${a.name}`,
    use: () => lootActor(a),
  });
}

export function lootActor(a) {
  if (!a.lootBag) registerCorpse(a);
  if (!a.lootSeen) { a.lootSeen = true; ensureStats().corpsesLooted++; }
  openLootUI(a, a.lootBag);
}

export function takeFromBag(bag, id) {
  if (id === 'gold') { if (bag.gold > 0) { game.addGold(bag.gold, 'loot'); bag.gold = 0; } return; }
  const c = bag.items.get(id) ?? 0;
  if (!c) return;
  game.inventory.add(id, c);
  bag.items.delete(id);
}

// ---------------------------------------------------------------- module hooks
export function init() {
  game.inventory = createInventory();
  game.equipment = { weapon: null, armor: null, shield: null };
  ensureStats();
  game.encumbered = false;

  game.bus.on('actor:death', ({ actor, killer }) => {
    if (actor.isPlayer) return;
    registerCorpse(actor);
    if (killer === game.player || (!killer && actor.lastHitBy === game.player)) {
      const s = ensureStats();
      s.kills++; s.killsBy[actor.faction] = (s.killsBy[actor.faction] ?? 0) + 1;
      game.bus.emit('stats:kill', { actor });
    }
    if (actor.isShopkeeper) {
      const shop = shops.get(actor.shopKey);
      if (shop) { shop.deadSince = game.worldTime; say(`${shop.title}: торговец мёртв. Лавка закрыта.`, 'bad'); }
    }
  });
  game.bus.on('actor:dismember', ({ actor, part, attacker }) => {
    const s = ensureStats();
    if (actor === game.player) { if (part !== 'head') s.limbsLost++; return; }
    if (attacker !== game.player) return;
    if (part === 'head') s.heads++;
    else if (part.startsWith('eye')) s.eyesGouged++;
    else s.limbsChopped++;
  });
  game.bus.on('caravan:robbed', ({ robber }) => { if (!robber || robber === game.player) ensureStats().caravansRobbed++; });
  game.bus.on('gold:change', ({ amount, reason }) => { if (amount > 0 && reason !== 'refund') ensureStats().goldEarned += amount; });
  game.bus.on('shop:buy', () => refreshShopUI());

  // replacement shopkeepers arrive a day after a murder
  let acc = 0;
  game.addSystem({
    name: 'economy', order: 60,
    update(dt) {
      acc += dt;
      if (acc < 2) return;
      acc = 0;
      for (const shop of shops.values()) {
        const k = shop.keeper;
        // keepers stay at their counter even if some army system tried to recruit them
        if (k?.alive && k.ai && !k.ai.target && (k.ai.order?.type !== 'guard' || Math.hypot(k.ai.order.x - shop.place.x, k.ai.order.z - shop.place.z) > 3)) {
          k.ai.setOrder({ type: 'guard', x: shop.place.x, z: shop.place.z, r: 1.5, yaw: shop.place.yaw });
        }
        if (k && !k.alive && shop.deadSince != null && game.worldTime - shop.deadSince > 24 * 60) {
          spawnKeeper(shop);
          shop.stock = { ...shop.def.stock };
          say(`${shop.title}: прислали нового торговца. Лавка снова открыта!`, 'good');
        }
      }
    },
  });

  game.economy = { shops, openShop, buy, sell, haggle, services, runService, relation, buyPrice, sellPrice, lootActor, takeFromBag, ITEMS };
}

const KITS = {
  elves: { gold: 60, equip: ['elfblade'], items: { elfblade: 1, bow: 1, herbs: 3, bandage: 3, apple: 3 } },
  guard: { gold: 90, equip: ['sword', 'armor_chain', 'shield_guard'], items: { sword: 1, armor_chain: 1, shield_guard: 1, bandage: 3, bread: 2 } },
  villain: { gold: 500, equip: ['darkblade', 'armor_dark'], items: { darkblade: 1, armor_dark: 1, potion_heal: 2, bandage: 2, wine: 2 } },
};

export function startGame(opts) {
  // shops & keepers (also on load: keepers are part of the world)
  for (const [key, d] of Object.entries(SHOP_DEFS)) initShop(key, d);

  const p = game.player;
  game.inventory.clear();
  game.equipment = { weapon: null, armor: null, shield: null };
  p.armor = 0; p.shield = false; p.body.setShield(false);
  const kit = KITS[opts.faction] ?? KITS.elves;
  for (const [id, n] of Object.entries(kit.items)) game.inventory.add(id, n);
  game.inventory.add('kirill_letter', 1);
  for (const id of kit.equip) equip(id, true);
  if (!opts.save) game.gold = kit.gold;
  updateEncumbrance();
}

export function serialize() {
  const out = {};
  for (const [key, s] of shops) out[key] = { stock: s.stock, discount: s.discount, mood: s.mood, bannedUntil: s.bannedUntil, salaryDay: s.salaryDay, lastRestock: s.lastRestock, dead: !s.keeper?.alive };
  return out;
}

export function deserialize(data) {
  if (!data) return;
  for (const [key, d] of Object.entries(data)) {
    const s = shops.get(key);
    if (!s) continue;
    Object.assign(s, { stock: d.stock ?? s.stock, discount: d.discount ?? 0, mood: d.mood ?? 0, bannedUntil: d.bannedUntil ?? -1, salaryDay: d.salaryDay ?? -1, lastRestock: d.lastRestock ?? game.day });
  }
}
