// Achievements & easter eggs with a golden toast.
import { game } from '../../core/game.js';
import { ensureStats } from '../../systems/economy.js';

export const ACHIEVEMENTS = [
  { id: 'dzhva', icon: '⏳', name: 'Джва года ждал', desc: 'Прожить джва игровых дня.' },
  { id: 'korovan', icon: '🐫', name: 'Корованщик', desc: 'Ограбить 5 корованов. Можно грабить корованы!' },
  { id: 'korovan1', icon: '💰', name: 'Можно грабить корованы', desc: 'Ограбить первый корован.' },
  { id: 'prosthetist', icon: '🦿', name: 'Протезист', desc: 'Иметь 3 протеза одновременно.' },
  { id: 'pirate', icon: '🏴‍☠️', name: 'Пират', desc: 'Крюк, деревянная нога и стеклянный глаз. Арр!' },
  { id: 'half', icon: '🌗', name: 'Пол экрана', desc: 'Потерять глаз. Пол экрана не видно, но жить можно.' },
  { id: 'wheels', icon: '♿', name: 'Покатушки', desc: 'Сесть в коляску без ноги.' },
  { id: 'crawl', icon: '🐛', name: 'Ползком к мечте', desc: 'Потерять ногу и ползти дальше.' },
  { id: 'first', icon: '🗡️', name: 'Первая кровь', desc: 'Убить первого врага.' },
  { id: 'butcher', icon: '🪓', name: 'Мясник', desc: 'Отрубить 10 конечностей.' },
  { id: 'gouger', icon: '👁️', name: 'Окулист', desc: 'Выколоть врагу глаз.' },
  { id: 'slayer', icon: '💀', name: 'Набигатель', desc: 'Убить 50 врагов.' },
  { id: 'haggler', icon: '🤝', name: 'Торгаш', desc: 'Удачно поторговаться 5 раз.' },
  { id: 'rich', icon: '👑', name: 'Богатей', desc: 'Накопить 1000 золотых.' },
  { id: 'drunk', icon: '🍷', name: 'Тамада', desc: 'Выпить 5 бутылок вина.' },
  { id: 'box', icon: '📦', name: 'Тактический шпионаж', desc: 'Залезть в картонную коробку.' },
  { id: 'save', icon: '💾', name: 'Сохранятся можно', desc: 'Сохранить игру.' },
  { id: 'letter', icon: '📜', name: 'Первоисточник', desc: 'Прочитать письмо Кирилла.' },
  { id: 'looter', icon: '⚰️', name: 'Труп тоже 3д', desc: 'Обыскать 10 трупов.' },
  { id: 'sleep', icon: '🛏️', name: 'Сон — лучшее лекарство', desc: 'Переночевать в таверне.' },
];

let toastBox = null;
export function toast(a) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'kv-toasts';
    document.getElementById('ui').appendChild(toastBox);
  }
  const d = document.createElement('div');
  d.className = 'kv-ach';
  d.innerHTML = `<div class="ai">${a.icon}</div><div><small>Достижение получено</small><b>${a.name}</b><span>${a.desc}</span></div>`;
  toastBox.appendChild(d);
  setTimeout(() => d.remove(), 5600);
  game.bus.emit('achievement', { id: a.id });
}

export function unlock(id) {
  game.achievements ??= new Set();
  if (game.achievements.has(id) || !game.started) return;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  game.achievements.add(id);
  game.journal?.add?.(`Достижение: «${a.name}»`);
  toast(a);
}

function check() {
  const p = game.player, s = ensureStats();
  if (!p || !game.started) return;
  if (game.day >= 2) unlock('dzhva');
  if (s.caravansRobbed >= 1) unlock('korovan1');
  if (s.caravansRobbed >= 5) unlock('korovan');
  const pros = Object.values(p.limbs).filter(v => v === 'prosthetic').length;
  if (pros >= 3) unlock('prosthetist');
  const L = p.limbs;
  if ((L.armL === 'prosthetic' || L.armR === 'prosthetic') && (L.legL === 'prosthetic' || L.legR === 'prosthetic') && (L.eyeL === 'prosthetic' || L.eyeR === 'prosthetic')) unlock('pirate');
  if (L.eyeL !== 'ok' || L.eyeR !== 'ok') unlock('half');
  if (p.moveMode === 'wheelchair') unlock('wheels');
  if (p.moveMode === 'crawl' && Math.hypot(p.vel.x, p.vel.z) > 0.3) unlock('crawl');
  if (s.kills >= 1) unlock('first');
  if (s.kills >= 50) unlock('slayer');
  if (s.limbsChopped >= 10) unlock('butcher');
  if (s.eyesGouged >= 1) unlock('gouger');
  if (s.haggleWins >= 5) unlock('haggler');
  if (game.gold >= 1000) unlock('rich');
  if (s.wine >= 5) unlock('drunk');
  if (s.corpsesLooted >= 10) unlock('looter');
  if (s.slept >= 1) unlock('sleep');
}

export function initAchievements() {
  game.achievements ??= new Set();
  game.bus.on('player:box', () => unlock('box'));
  game.bus.on('save', () => unlock('save'));
  game.bus.on('ui:letter', () => setTimeout(() => unlock('letter'), 1500));
  let acc = 0;
  game.addSystem({ name: 'achievements', order: 210, alwaysRun: true, update(dt) { acc += dt; if (acc > 0.5) { acc = 0; check(); } } });
}
