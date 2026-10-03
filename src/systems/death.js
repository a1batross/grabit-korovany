// Player death handling.
import { game } from '../core/game.js';
import { showDeathScreen } from '../ui/menu.js';

export const name = 'death';

export function init() {
  game.bus.on('actor:death', ({ actor, cause }) => {
    if (actor !== game.player) return;
    setTimeout(() => showDeathScreen(cause), 3500);
  });
  // Juice: callouts + a moment of slow motion when the player chops something off
  const CHOP = {
    armL: 'Вы отрубили левую руку!', armR: 'Вы отрубили правую руку!', legL: 'Вы отрубили левую ногу!',
    legR: 'Вы отрубили правую ногу!', eyeL: 'Вы выкололи глаз!', eyeR: 'Вы выкололи глаз!', head: 'ГОЛОВА С ПЛЕЧ!',
  };
  let slowTimer = null;
  game.bus.on('actor:dismember', ({ actor, part, attacker }) => {
    if (attacker !== game.player || actor === game.player) return;
    game.bus.emit('notify', { text: `${CHOP[part] ?? 'Вы что-то отрубили!'} (${actor.name})`, kind: 'good' });
    game.slowmo = part === 'head' ? 0.2 : 0.35;
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => { game.slowmo = 1; }, part === 'head' ? 700 : 350);
  });
  game.bus.on('player:injury', ({ part }) => {
    const msg = {
      armL: 'Вам отрубили левую руку! Кровь хлещет — срочно перевяжитесь или найдите лекаря!',
      armR: 'Вам отрубили правую руку! Оружие выпало. Кровотечение!',
      legL: 'Вам отрубили левую ногу! Теперь только ползать... или коляска... или протез!',
      legR: 'Вам отрубили правую ногу! Теперь только ползать... или коляска... или протез!',
      eyeL: 'Вам выкололи левый глаз! Пол-экрана не видно.',
      eyeR: 'Вам выкололи правый глаз! Пол-экрана не видно.',
    }[part];
    if (msg) game.bus.emit('notify', { text: msg, kind: 'bad' });
  });
}
