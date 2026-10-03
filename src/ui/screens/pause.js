// Pause menu (Esc), settings, controls help, Kirill's letter.
import { game } from '../../core/game.js';
import { cam } from '../../entities/player.js';
import { HELP_HTML } from '../menu.js';
import { FACTIONS } from '../../systems/factions.js';
import { openModal, closeModal, rerender, currentModal } from './modal.js';

const SKEY = 'korovany.settings';
const DEF = { sens: 0.0022, invertY: false, gore: 1 };

export function loadSettings() {
  let s = { ...DEF };
  try { Object.assign(s, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch { /* ignore */ }
  applySettings(s);
  return s;
}
function applySettings(s) { cam.sensitivity = s.sens; game.invertY = !!s.invertY; game.goreMul = +s.gore; }
function saveSettings(s) { applySettings(s); try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* ignore */ } }
const current = () => ({ sens: cam.sensitivity, invertY: !!game.invertY, gore: game.goreMul ?? 1 });

export function openPause() {
  const fac = FACTIONS[game.playerFaction];
  openModal('pause', {
    title: 'Пауза<small>Кирилл подождёт. Он джва года ждал.</small>', cls: 'kv-pausewin',
    render(body) {
      const h = Math.floor(game.hour), m = Math.floor((game.hour % 1) * 60);
      body.innerHTML = `<div class="kv-pause">
        <div class="meta">${fac?.name ?? ''} · День ${game.day + 1}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · 💰 ${game.gold}</div>
        <button class="btn" data-act="resume">▶ Продолжить</button>
        <button class="btn" data-act="save" ${game.player?.alive ? '' : 'disabled'}>💾 Сохранить</button>
        <button class="btn" data-act="load">📂 Загрузить</button>
        <button class="btn" data-act="inv">🎒 Инвентарь <small>(I)</small></button>
        <button class="btn" data-act="map">🗺️ Карта <small>(M)</small></button>
        <button class="btn" data-act="journal">📖 Журнал <small>(J)</small></button>
        <button class="btn" data-act="help">⌨ Управление</button>
        <button class="btn" data-act="settings">⚙ Настройки</button>
        <button class="btn" data-act="quit">🚪 Выйти в главное меню</button>
      </div>`;
    },
    onAct(act) {
      if (act === 'resume') closeModal();
      else if (act === 'save') game.saves.showSaveMenu();
      else if (act === 'load') game.saves.showLoadMenu();
      else if (act === 'inv') game.ui.inventory();
      else if (act === 'map') game.ui.map();
      else if (act === 'journal') game.ui.journal();
      else if (act === 'help') openHelp();
      else if (act === 'settings') openSettings();
      else if (act === 'quit') {
        if (confirm('Выйти в главное меню? Несохранённый прогресс пропадёт.')) location.reload();
      }
    },
  });
}

export function openHelp() {
  openModal('help', {
    title: 'Управление', cls: 'kv-help',
    render(body) {
      body.innerHTML = `<div class="kv-parch">${HELP_HTML}
        <h4>В окнах</h4><div class="kv-desc" style="font-size:14px">↑↓ — выбор строки, Enter — действие, 1-4 — вкладки, H — торговаться, Esc — закрыть.</div></div>
        <div class="kv-foot"><span></span><button class="kv-btn big" data-act="back">Назад</button></div>`;
    },
    onAct(act) { if (act === 'back') openPause(); },
  });
}

const GORE = [['0', 'Детский (без расчленёнки)'], ['0.5', 'Умеренный'], ['1', 'Нормальный'], ['1.5', 'Кровавый'], ['2', 'Кирилл одобряет']];

export function openSettings() {
  openModal('settings', {
    title: 'Настройки', cls: 'kv-settings',
    render(body) {
      const s = current();
      body.innerHTML = `<div class="kv-parch">
        <div class="kv-set"><div>Чувствительность мыши<small>${(s.sens * 1000).toFixed(1)}</small></div>
          <input type="range" min="0.0006" max="0.006" step="0.0002" value="${s.sens}" data-k="sens"></div>
        <div class="kv-set"><div>Инвертировать ось Y<small>для лётчиков</small></div><input type="checkbox" data-k="invertY" ${s.invertY ? 'checked' : ''}></div>
        <div class="kv-set"><div>Уровень жестокости<small>шанс отрубить руку, ногу, голову, выколоть глаз</small></div>
          <select data-k="gore">${GORE.map(([v, n]) => `<option value="${v}" ${+v === +s.gore ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div>
      <div class="kv-foot"><span class="kv-keys">Настройки сохраняются автоматически</span><button class="kv-btn big" data-act="back">Назад</button></div>`;
    },
    onInput(e) {
      const k = e.target.dataset.k;
      if (!k) return;
      const s = current();
      s[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
      saveSettings(s);
      if (k === 'sens') e.target.parentElement.querySelector('small').textContent = (s.sens * 1000).toFixed(1);
    },
    onAct(act) { if (act === 'back') openPause(); },
  });
  // <select>/<checkbox> fire 'change', not always 'input'
  document.querySelector('.kv-settings')?.addEventListener('change', e => {
    const k = e.target.dataset.k; if (!k) return;
    const s = current(); s[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value; saveSettings(s);
  });
}

const LETTER = `Здраствуйте. Я, Кирилл. Хотел бы чтобы вы сделали игру, 3Д-экшон суть такова... Пользователь может играть лесными эльфами, охраной дворца и злодеем. И если пользователь играет эльфами то эльфы в лесу, домики деревяные набигают солдаты дворца и злодеи. Можно грабить корованы... И эльфу раз лесные то сделать так что там густой лес... А движок можно поставить так что вдали деревья картинкой, когда подходиш они преобразовываются в 3-хмерные деревья. Можно покупать и т.п. возможности как в Daggerfall. И враги 3-хмерные тоже, и труп тоже 3д. Можно прыгать и т.п. Если играть за охрану дворца то надо слушаться командира, и защищать дворец от злого (имя я не придумал) и шпионов, партизанов эльфов, и ходит на набеги на когото из этих (эльфов, злого...). Ну а если за злого... то значит шпионы или партизаны эльфов иногда нападают, пользователь сам себе командир может делать что сам захочет прикажет своим войскам с ним самим напасть на дворец и пойдет в атаку. Всего в игре 4 зоны. Т.е. карта и на ней есть 4 зоны, 1 - зона людей (нейтрал), 2- зона императора (где дворец), 3-зона эльфов, 4 - зона злого... (в горах, там есть старый форт...)
Так же чтобы в игре могли не только убить но и отрубить руку и если пользователя не вылечат то он умрет, так же выколоть глаз но пользователь может не умереть а просто пол экрана не видеть, или достать или купить протез, если ногу тоже либо умреш либо будеш ползать либо на коляске котаться, или самое хорошее... поставить протез. Сохранятся можно...`;

export function openLetter() {
  openModal('letter', {
    title: 'Письмо Кирилла', cls: 'kv-letter-wrap',
    render(body) {
      body.innerHTML = `<div class="kv-parch kv-letter kv-scroll" style="max-height:66vh">${LETTER.split('\n').map(p => `<p>${p}</p>`).join('')}
        <p class="sig">P.S. Я джва года хочу такую игру.</p></div>
        <div class="kv-foot"><span class="kv-keys">Esc — свернуть свиток</span><button class="kv-btn big" data-act="close">Свернуть</button></div>`;
    },
    onAct(act) { if (act === 'close') closeModal(); },
  });
}

export const isPauseLike = () => ['pause', 'help', 'settings'].includes(currentModal());
export { rerender };
