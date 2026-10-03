// Title screen, faction choice, loading screen, death screen.
import { game } from '../core/game.js';
import { input } from '../core/input.js';

const root = () => document.getElementById('menu-root');

const QUOTES = [
  '«Я джва года хочу такую игру.» — Кирилл',
  '«Можно грабить корованы...» — Кирилл',
  '«А движок можно поставить так что вдали деревья картинкой, когда подходиш они преобразовываются в 3-хмерные деревья.»',
  '«И враги 3-хмерные тоже, и труп тоже 3д.»',
  '«Так же чтобы в игре могли не только убить но и отрубить руку...»',
  '«...или самое хорошее... поставить протез.»',
  '«Сохранятся можно...»',
];
export const randomQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];

export function showLoading(text) {
  root().innerHTML = `<div class="screen" style="background:#0a0805">
    <h1 class="title">ГРАБИТЬ КОРОВАНЫ</h1>
    <div class="subtitle">${text}</div>
    <div class="quote">${randomQuote()}</div></div>`;
}

export function hideMenus() { root().innerHTML = ''; }

export function showMainMenu() {
  game.uiOpen = false;
  const hasSave = !!game.saves?.hasAny?.();
  root().innerHTML = `<div class="screen">
    <h1 class="title">ГРАБИТЬ КОРОВАНЫ</h1>
    <div class="subtitle">3Д-экшон, суть такова... Лесные эльфы, охрана дворца и Злой (имя не придумали). Всего 4 зоны.</div>
    <div class="cards">
      <div class="card" data-f="elves"><div class="emoji">🧝</div><h3 style="color:#4fc35a">Лесные эльфы</h3>
        <p>Густой лес, деревянные домики. Набигают солдаты дворца и злодеи.</p><p><b>Можно грабить корованы!</b></p></div>
      <div class="card" data-f="guard"><div class="emoji">🛡️</div><h3 style="color:#e04a3a">Охрана дворца</h3>
        <p>Слушайтесь командира. Защищайте дворец от Злого, шпионов и партизанов-эльфов.</p><p>Ходите в набеги.</p></div>
      <div class="card" data-f="villain"><div class="emoji">😈</div><h3 style="color:#a066e0">Злой</h3>
        <p>Старый форт в горах. Вы сам себе командир — прикажите войскам и ведите их на дворец.</p><p>Шпионы и партизаны иногда нападают.</p></div>
    </div>
    <div style="margin-top:22px">
      ${hasSave ? '<button class="btn" id="mm-load">Загрузить сохранение</button>' : ''}
      <button class="btn" id="mm-help">Управление</button>
    </div>
    <div class="quote">${randomQuote()}</div>
    <div class="footer-note">Посвящается Кириллу, который джва года ждал.</div>
  </div>`;
  root().querySelectorAll('.card').forEach(c => c.addEventListener('click', () => game.startGame({ faction: c.dataset.f })));
  root().querySelector('#mm-load')?.addEventListener('click', () => game.saves.showLoadMenu());
  root().querySelector('#mm-help').addEventListener('click', showHelp);
}

export const HELP_HTML = `
  <table style="font-size:15px;line-height:1.6">
  <tr><td><b>WASD</b></td><td>ходить</td></tr>
  <tr><td><b>Shift</b></td><td>бежать</td></tr>
  <tr><td><b>Пробел</b></td><td>прыгать (можно прыгать и т.п.)</td></tr>
  <tr><td><b>ЛКМ</b></td><td>удар (смотрите вверх — бьёте в голову, вниз — по ногам)</td></tr>
  <tr><td><b>ПКМ</b></td><td>блок</td></tr>
  <tr><td><b>E</b></td><td>взаимодействие: говорить, торговать, грабить корованы и трупы</td></tr>
  <tr><td><b>V</b></td><td>вид от первого / третьего лица</td></tr>
  <tr><td><b>X</b></td><td>сесть в коляску / слезть с неё</td></tr>
  <tr><td><b>I / Tab</b></td><td>инвентарь</td></tr>
  <tr><td><b>M</b></td><td>карта (4 зоны)</td></tr>
  <tr><td><b>N</b></td><td>масштаб миникарты</td></tr>
  <tr><td><b>J</b></td><td>журнал / приказы</td></tr>
  <tr><td><b>C</b></td><td>командование войсками (за Злого и командиров)</td></tr>
  <tr><td><b>F5 / F9</b></td><td>быстрое сохранение / загрузка (сохранятся можно!)</td></tr>
  <tr><td><b>Esc</b></td><td>пауза</td></tr>
  </table>`;

function showHelp() {
  const prev = root().innerHTML;
  root().innerHTML = `<div class="screen"><div class="panel"><h2>Управление</h2>${HELP_HTML}
    <div style="text-align:center;margin-top:12px"><button class="btn" id="hb">Назад</button></div></div></div>`;
  root().querySelector('#hb').addEventListener('click', showMainMenu);
}

export function showDeathScreen(cause) {
  input.unlock();
  const causes = {
    blood: 'Вы истекли кровью. Вас не вылечили — вот вы и умерли.',
    head: 'Вам отрубили голову. Протеза для головы пока не изобрели.',
    fall: 'Вы разбились. Не надо было так прыгать.',
    wound: 'Вы погибли в бою.',
  };
  root().innerHTML = `<div class="screen" style="background:radial-gradient(ellipse at center, rgba(90,0,0,0.5), rgba(0,0,0,0.92))">
    <h1 class="title" style="color:#c02020;text-shadow:0 4px 0 #300">ВЫ УМЕРЛИ</h1>
    <div class="subtitle">${causes[cause] ?? causes.wound}</div>
    <div>
      ${game.saves?.hasAny?.() ? '<button class="btn" id="d-load">Загрузить сохранение</button>' : ''}
      <button class="btn" id="d-menu">Главное меню</button>
    </div>
    <div class="quote">${randomQuote()}</div></div>`;
  root().querySelector('#d-load')?.addEventListener('click', () => game.saves.showLoadMenu());
  root().querySelector('#d-menu').addEventListener('click', () => location.reload());
}
