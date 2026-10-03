// Win conditions & the victory screen. The game continues after victory.
import { game } from '../../core/game.js';
import { S, stats } from './state.js';
import { openModal, closeModal, say, banner, playerDist, place } from './util.js';
import { groups } from '../population.js';
import { armyMembers } from './army.js';
import { updateObjectives } from './elves.js';

const VICTORIES = {
  villain: { title: 'Злой захватил дворец!', text: 'Император пал. Над дворцом развевается чёрное знамя. Имя злому так и не придумали, но теперь его знает каждый.' },
  guard: { title: 'Злой повержен!', text: 'Вы убили Злого в его старом форте. Император лично вешает вам орден. Командир плачет от гордости.' },
  elvesVillain: { title: 'Лес свободен! Злой повержен!', text: 'Эльфы празднуют в деревянных домиках. Больше никто не набигает с гор.' },
  elvesEmperor: { title: 'Лес свободен! Император пал!', text: 'Солдаты дворца больше не набигают на лес. Эльфы грабят корованы спокойно.' },
};

export function showVictory(key) {
  const V = VICTORIES[key];
  if (!V || S.victory) return;
  S.victory = key;
  game.journal.add(`ПОБЕДА: ${V.title}`);
  game.bus.emit('victory', { key, faction: game.playerFaction });
  const st = stats();
  const html = `<div class="panel" style="text-align:center;max-width:640px">
    <h1 class="title" style="font-size:52px">ПОБЕДА!</h1>
    <h2 style="margin-top:6px">${V.title}</h2>
    <p style="font-size:17px">${V.text}</p>
    <p style="opacity:.9">Корованов ограблено: <b>${st.caravansRobbed}</b> • набегов отбито: <b>${st.raidsRepelled}</b> • приказов выполнено: <b>${st.ordersDone}</b>${game.rank ? ` • звание: <b>${game.rank}</b>` : ''} • золото: <b>${game.gold}</b></p>
    <p class="quote">«Я джва года хочу такую игру.» — Кирилл. Дождался!</p>
    <button class="btn" id="v-cont">Продолжить играть</button><button class="btn" id="v-menu">Главное меню</button></div>`;
  setTimeout(() => {
    const el = openModal(html);
    el?.querySelector('#v-cont')?.addEventListener('click', closeModal);
    el?.querySelector('#v-menu')?.addEventListener('click', () => location.reload());
  }, game.simulating ? 0 : 2500);
  banner('ПОБЕДА!', V.title);
}

function emperorGroup() { return groups.find(g => g.key === 'palace:emperor'); }

function onBossDeath(actor, killer) {
  const pf = game.playerFaction;
  const byPlayerSide = killer === game.player || killer?.armyGroup || killer?.faction === pf;
  if (actor.role === 'emperor') {
    const credited = pf === 'villain' ? (byPlayerSide || playerDist(actor.pos) < 250) : true;
    if (pf === 'villain' && !credited) {
      // someone else killed him far from the villain: a new emperor is crowned
      say('Императора убили без вас... Двор уже коронует нового императора!', 'bad');
      const g = emperorGroup(); if (g) { g.delay = 120; g.cd = 120; }
      return;
    }
    S.bossDead.emperor = true;
    if (pf === 'villain') { game.journal.complete('villain:palace'); showVictory('villain'); }
    else if (pf === 'elves') { updateObjectives(); showVictory('elvesEmperor'); }
    else if (pf === 'guard') { banner('ИМПЕРАТОР ПОГИБ!', 'Позор страже! Но служба продолжается...', '#ff4030'); game.journal.add('Император погиб. Позор страже!'); }
  } else if (actor.role === 'boss' && actor !== game.player) {
    S.bossDead.villain = true;
    if (pf === 'guard') { game.journal.complete('guard:villain'); showVictory('guard'); }
    else if (pf === 'elves') { updateObjectives(); showVictory('elvesVillain'); }
  }
}

let acc = 0;
export function updateVictory(dt) {
  acc += dt;
  if (acc < 2) return;
  acc = 0;
  if (game.playerFaction === 'villain') {
    const n = armyMembers().length;
    game.journal.setObjective('villain:army', `Собрать армию из 25 воинов (${Math.min(25, n)}/25)`, n >= 25 || game.journal.objectives.get('villain:army')?.done);
    game.hudStatus.set('order', `<span class="order">Армия: ${n} воинов</span> <small>(C — командовать)</small>`);
    if (!S.bossDead.emperor && game.emperor?.alive && playerDist(game.emperor.pos) < 400) game.compassPois.set('emperor', { x: game.emperor.pos.x, z: game.emperor.pos.z, label: '♛', color: '#ffd84a' });
    else game.compassPois.delete('emperor');
  }
  if (game.playerFaction === 'guard' && !S.bossDead.villain && game.villainBoss?.alive && playerDist(game.villainBoss.pos) < 400)
    game.compassPois.set('villain', { x: game.villainBoss.pos.x, z: game.villainBoss.pos.z, label: '☠', color: '#c070ff' });
}

export function startVictory(faction) {
  if (faction === 'villain') {
    game.journal.setObjective('villain:palace', 'Захватить дворец: убить Императора (приказ войскам — C → «В атаку на дворец!»)');
    game.journal.setObjective('villain:army', 'Собрать армию из 25 воинов (вербовщик в форте)');
  }
}

export function initVictory() {
  game.bus.on('actor:death', ({ actor, killer }) => {
    if (actor.role === 'emperor' || actor.role === 'boss') onBossDeath(actor, killer);
  });
}
