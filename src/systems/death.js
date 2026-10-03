// Player death handling.
import { game } from '../core/game.js';
import { showDeathScreen } from '../ui/menu.js';

export const name = 'death';

export function init() {
  game.bus.on('actor:death', ({ actor, cause }) => {
    if (actor !== game.player) return;
    setTimeout(() => showDeathScreen(cause), 3500);
  });
  game.bus.on('player:injury', ({ part }) => {
    const msg = {
      armL: 'Вам отрубили левую руку! Кровь хлещет — срочно перевяжитесь или найдите лекаря!',
      armR: 'Вам отрубили правую руку! Оружие выпало. Кровотечение!',
      legL: 'Вам отрубили левую ногу! Теперь только ползать... или коляска... или протез!',
      legR: 'Вам отрубили правую ногу! Теперь только ползать... или коляска... или протез!',
      eyeL: 'Вам выкололи левый глаз! Пол экрана не видно.',
      eyeR: 'Вам выкололи правый глаз! Пол экрана не видно.',
    }[part];
    if (msg) game.bus.emit('notify', { text: msg, kind: 'bad' });
  });
}
