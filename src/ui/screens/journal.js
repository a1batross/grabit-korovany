// Journal (J): objectives / orders, diary entries, statistics, achievements.
import { game } from '../../core/game.js';
import { FACTIONS } from '../../systems/factions.js';
import { ensureStats } from '../../systems/economy.js';
import { ACHIEVEMENTS } from './achievements.js';
import { openModal, rerender, currentModal, closeModal, esc } from './modal.js';

let tab = 'obj';
const TABS = [['obj', 'Задания'], ['log', 'Записи'], ['stats', 'Статистика'], ['ach', 'Достижения']];

export function toggleJournal(t) {
  if (currentModal() === 'journal' && !t) { closeModal(); return; }
  if (t) tab = t;
  openModal('journal', { title: 'Журнал<small>«Я джва года хочу такую игру»</small>', cls: 'kv-journal', render, onAct, onKey });
}
game.bus.on('journal:add', () => { if (currentModal() === 'journal') rerender(); });
game.bus.on('journal:objective', () => { if (currentModal() === 'journal') rerender(); });

function onAct(act, d) { if (act === 'tab') { tab = d.tab; rerender(); } }
function onKey(e) {
  const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (i >= 0) { tab = TABS[i][0]; rerender(); return true; }
  return false;
}

const fmtTime = (day, hour) => `День ${day + 1}, ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
const RU_FACTION = { elves: 'эльфов', guard: 'стражников', villain: 'слуг Злого', humans: 'людей' };

function render(body) {
  let html = '';
  if (tab === 'obj') {
    const objs = [...game.journal.objectives.entries()];
    const active = objs.filter(([, o]) => !o.done), done = objs.filter(([, o]) => o.done);
    const fac = FACTIONS[game.playerFaction];
    html = `<h3>${esc(fac?.name ?? '')}${game.rank ? ' — ' + esc(game.rank) : ''}</h3>
      <h4>Текущие задания</h4>${active.map(([, o]) => `<div class="kv-obj">${esc(o.text)}</div>`).join('') || '<div class="kv-empty">Заданий нет. Можно грабить корованы!</div>'}
      ${done.length ? `<h4>Выполнено</h4>${done.map(([, o]) => `<div class="kv-obj done">${esc(o.text)}</div>`).join('')}` : ''}
      <h4>Советы Кирилла</h4>
      <div class="kv-desc" style="font-size:14px;line-height:1.6">
      • Отрубили руку или ногу — срочно бинт (<b>I</b>) или лекарь в Слободе, иначе истечёте кровью.<br>
      • Без ноги можно ползать, кататься на коляске или — самое хорошее — поставить протез.<br>
      • Выкололи глаз — не беда: стеклянный глаз у протезиста или на чёрном рынке.<br>
      • Корованы ходят по дорогам (см. карту, <b>M</b>). Добычу продавайте торговцам.<br>
      • Сохранятся можно: <b>F5</b> — быстро, <b>Esc</b> → Сохранить — в ячейку.</div>`;
  } else if (tab === 'log') {
    const es = [...game.journal.entries].reverse();
    html = es.map(e => `<div class="kv-entry"><span class="when">${fmtTime(e.day ?? 0, e.hour ?? 0)}</span>${esc(e.text)}</div>`).join('') || '<div class="kv-empty">Журнал пуст. Пока ничего не случилось.</div>';
  } else if (tab === 'stats') {
    const s = ensureStats();
    const by = Object.entries(s.killsBy).map(([f, n]) => `<div><span>…из них ${RU_FACTION[f] ?? f}</span><b>${n}</b></div>`).join('');
    const p = game.player;
    const rows = [
      ['Прожито дней', game.day + 1], ['Убито врагов', s.kills], ['Отрублено конечностей', s.limbsChopped], ['Выколото глаз', s.eyesGouged],
      ['Отрублено голов', s.heads], ['Ограблено корованов', s.caravansRobbed], ['Обыскано трупов', s.corpsesLooted],
      ['Заработано золота', s.goldEarned], ['Потрачено золота', s.goldSpent], ['Куплено вещей', s.itemsBought], ['Продано вещей', s.itemsSold],
      ['Удачных торгов', s.haggleWins], ['Неудачных торгов', s.haggleFails], ['Потеряно своих конечностей', s.limbsLost],
      ['Поставлено протезов', s.prosthetics], ['Выпито вина', s.wine], ['Визитов к лекарю', s.healerVisits], ['Ночей в таверне', s.slept],
    ];
    html = `<h3>Летопись подвигов${p ? ': ' + esc(p.name) : ''}</h3><div class="kv-stats">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}${by}</div>`;
  } else {
    const got = game.achievements ?? new Set();
    html = `<h3>Достижения: ${got.size} / ${ACHIEVEMENTS.length}</h3><div class="kv-achs">${ACHIEVEMENTS.map(a => `<div class="kv-achv ${got.has(a.id) ? '' : 'locked'}">
      <div class="ai">${a.icon}</div><div><b>${a.name}</b><span>${a.desc}</span></div></div>`).join('')}</div>`;
  }
  body.innerHTML = `<div class="kv-tabs">${TABS.map(([id, n], i) => `<button class="kv-tab ${tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${n}<span class="k">${i + 1}</span></button>`).join('')}</div>
    <div class="kv-parch" data-scroll="j-${tab}">${html}</div>
    <div class="kv-foot"><span>${fmtTime(game.day, game.hour)}</span><span class="kv-keys"><b>1-4</b> вкладки · <b>J</b>/<b>Esc</b> закрыть</span><span class="kv-gold">💰 ${game.gold}</span></div>`;
}
