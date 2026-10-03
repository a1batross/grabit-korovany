// Playing as the forest elves: the chief (Владыка Эльфов) gives tasks — rob a caravan, ambush a patrol, defend the
// village from raids, hunt the palace commander. Rewards: gold + reputation; reputation grants a partisan band.
import { game } from '../../core/game.js';
import { ROADS } from '../../world/zones.js';
import { addInteractable } from '../../entities/player.js';
import { spawn } from '../../entities/spawn.js';
import { pick, rand } from '../../core/rng.js';
import { S, stats } from './state.js';
import { place, playerDist, dist, shout, say, banner, dialog, dryNear, snapActor, applySnap, presetFor, spawnArgs } from './util.js';
import { raids, findRaid } from './raids.js';
import { caravans } from './caravans.js';
import { setPlayerSquadSize } from './army.js';
import { formationSlot } from './squad.js';

const REP_TITLES = [[0, 'Чужак'], [3, 'Свой'], [6, 'Друг леса'], [10, 'Герой леса'], [16, 'Легенда леса']];
export const repTitle = () => REP_TITLES.filter(([r]) => S.elfRep >= r).pop()[1];
export const E = { task: null, nextTaskT: 0 };
const isElf = () => game.playerFaction === 'elves';
const chiefName = () => game.elfChief?.name ?? 'Владыка эльфов';

function setHud() {
  if (!isElf()) return;
  const t = E.task;
  game.hudStatus.set('order', t ? `<span class="order">Задание вождя: ${t.title}</span>${t.progress ? `<br><small>${t.progress()}</small>` : ''}`
    : '<span class="order">Вождь ждёт вас (E) — за новым заданием</span>');
  game.hudStatus.set('merit', `<small>Репутация: ${S.elfRep} (${repTitle()})</small>`);
}

function addRep(n) {
  const before = repTitle();
  S.elfRep += n;
  if (repTitle() !== before) { banner(repTitle().toUpperCase() + '!', 'Эльфы уважают вас всё больше.', '#7ad86a'); game.journal.add(`Репутация у эльфов: ${repTitle()}.`); }
  const band = S.tasksDone >= 6 ? 7 : S.tasksDone >= 4 ? 5 : S.tasksDone >= 2 ? 3 : 0;
  if (band) { const had = game.actors.filter(a => a.alive && a.armyGroup).length; setPlayerSquadSize(band); if (band > had) say(`Вождь дал вам отряд партизан (${band}). C — командовать.`, 'good'); }
}

function finishTask(ok, note = '') {
  const t = E.task;
  if (!t) return;
  E.task = null;
  game.compassPois.delete('order');
  t.cleanup?.();
  E.nextTaskT = S.t + 20;
  if (ok) {
    S.tasksDone++;
    game.addGold(t.pay, 'task');
    say(`Задание выполнено: ${t.title}. +${t.pay} зол., репутация +${t.rep}. ${note}`, 'good');
    game.journal.add(`Выполнено задание вождя: ${t.title}.`);
    game.journal.complete('task:' + t.id);
    addRep(t.rep);
    game.bus.emit('order:complete', { order: t, ok: true });
  } else {
    say(`Задание провалено: ${t.title}. ${note}`, 'bad');
    game.journal.setObjective('task:' + t.id, t.title + ' (провалено)', true);
    S.elfRep = Math.max(0, S.elfRep - 1);
    game.bus.emit('order:complete', { order: t, ok: false });
  }
  setHud();
}

let taskId = 1;
function giveTask(t) {
  t.id = taskId++; t.t0 = S.t;
  E.task = t;
  say(`${chiefName()}: «${t.speech}»`);
  game.journal.add(`Задание вождя: ${t.title}.`);
  game.journal.setObjective('task:' + t.id, `Задание: ${t.title}`);
  if (t.poi) game.compassPois.set('order', { ...t.poi(), label: '★', color: '#7aff6a' });
  game.bus.emit('order:issued', { order: t });
  setHud();
}

function taskCaravan() {
  const t = {
    type: 'caravan', title: 'Ограбить корован', pay: 60, rep: 2, save: () => ({}),
    speech: 'Люди везут товары мимо нашего леса. Ограбь корован — нам нужны хлеб, вино и ткани!',
    poi: () => { const c = caravans.filter(c => c.state !== 'robbed').sort((a, b) => playerDist(a.pos) - playerDist(b.pos))[0]; return c ? { x: c.pos.x, z: c.pos.z } : place('elves:square'); },
    progress: () => `Ближайший корован: ${Math.round(playerDist(t.poi()))} м (🐂 на компасе)`,
    update() { game.compassPois.set('order', { ...t.poi(), label: '★', color: '#7aff6a' }); },
  };
  return t;
}

function taskAmbush(p0 = null) {
  const faction = p0?.faction ?? (Math.random() < 0.6 ? 'guard' : 'villain');
  const road = ROADS.townWest;
  const pts = [road[1], road[2], road[3], road[2]];
  const members = [];
  const start = dryNear(road[1][0], road[1][1], 2);
  const snaps = p0?.members ?? [0, 1, 2, 3].map(() => null);
  snaps.forEach((sn, i) => {
    const preset = sn ? presetFor(sn) : faction === 'guard' ? (i === 3 ? 'guardArcher' : 'guard') : (i === 3 ? 'minionArcher' : 'minion');
    const a = spawn(preset, sn?.x ?? start.x + i * 1.5, sn?.z ?? start.z + i, sn ? spawnArgs(sn) : i === 0 ? { name: faction === 'guard' ? 'Десятник патруля' : 'Вожак патруля' } : {});
    if (sn) applySnap(a, sn);
    a.transient = false; a.taskTarget = true;
    members.push(a);
  });
  if (!members.length) return null;
  members[0].ai.setOrder({ type: 'patrol', points: pts, i: 1 });
  members.slice(1).forEach((m, i) => { const f = formationSlot(i + 1, 2); m.ai.setOrder({ type: 'follow', leader: members[0], ox: f.ox, oz: f.oz }); });
  const t = {
    type: 'ambush', title: `Устроить засаду на патруль ${faction === 'guard' ? 'дворца' : 'Злого'}`, pay: 55, rep: 2, members,
    save: () => ({ faction, members: members.filter(m => m.alive && !m.removed).map(snapActor) }),
    speech: `Патруль ${faction === 'guard' ? 'дворцовой стражи' : 'Злого'} рыщет по дороге у Слободы. Устрой засаду — пусть ни один не уйдёт!`,
    poi: () => { const L = members.find(m => m.alive); return L ? { x: L.pos.x, z: L.pos.z } : { x: pts[0][0], z: pts[0][1] }; },
    progress: () => `Осталось врагов: ${members.filter(m => m.alive).length}`,
    update() {
      game.compassPois.set('order', { ...t.poi(), label: '★', color: '#7aff6a' });
      // leaderless patrol keeps going
      const alive = members.filter(m => m.alive);
      if (alive.length && !alive.some(m => m.ai.order.type === 'patrol')) { alive[0].ai.setOrder({ type: 'patrol', points: pts, i: 0 }); alive.slice(1).forEach((m, i) => { const f = formationSlot(i + 1, 2); m.ai.setOrder({ type: 'follow', leader: alive[0], ox: f.ox, oz: f.oz }); }); }
      if (!alive.length) finishTask(true, 'Засада удалась!');
      else if (S.t - t.t0 > 900) finishTask(false, 'Патруль ушёл.');
    },
    cleanup() { for (const m of members) m.transient = true; },
  };
  return t;
}

function taskDefend(raid) {
  const t = {
    type: 'defend', title: 'Защитить деревню', pay: 45, rep: 2, raid, save: () => ({ raidUid: raid.uid }),
    speech: 'Набигают! Защити деревню, брат!',
    poi: () => { const L = raid.squad?.members?.find(m => m.alive); return L ? { x: L.pos.x, z: L.pos.z } : place('elves:square'); },
    progress: () => `Врагов: ${raid.squad?.members?.filter(m => m.alive).length ?? 0}`,
    update() {
      game.compassPois.set('order', { ...t.poi(), label: '⚔', color: '#ff5040' });
      if (raid.result === 'repelled') finishTask(raid.playerHelped, raid.playerHelped ? 'Деревня спасена!' : 'Деревня отбилась без вас.');
      else if (raid.result) finishTask(false, 'Деревню разорили...');
    },
  };
  return t;
}

function taskHunt(force = false) {
  const victim = (force || Math.random() < 0.5) && game.commander?.alive ? game.commander : null;
  const t = victim ? {
    type: 'hunt', title: `Убить ${victim.name}`, pay: 150, rep: 4, victim, save: () => ({}),
    speech: `${victim.name} водит солдат на наш лес. Убей его — и солдаты долго не сунутся!`,
    poi: () => ({ x: victim.pos.x, z: victim.pos.z }),
    progress: () => `Цель во дворце, ${Math.round(playerDist(victim.pos))} м`,
    update() { if (!victim.alive) finishTask(true, 'Командир дворцовой стражи убит!'); else if (S.t - t.t0 > 1200) finishTask(false, 'Слишком долго.'); },
  } : taskCaravan();
  return t;
}

function newTask() {
  const pool = ['caravan', 'ambush', 'ambush', 'caravan'];
  if (S.tasksDone >= 3) pool.push('hunt');
  let k = pick(pool);
  if (k === E.lastType) k = pick(pool);
  E.lastType = k;
  giveTask({ caravan: taskCaravan, ambush: taskAmbush, hunt: taskHunt }[k]());
}

function talkChief() {
  const c = game.elfChief;
  if (!c?.alive) return;
  const t = E.task;
  const greet = pick(['Лес шепчет о тебе, брат.', 'Корованы сами себя не ограбят.', 'Люди и Злой набигают на нас. Мы ответим.', 'Я джва века жду, когда лес будет свободен.']);
  dialog({
    title: chiefName(),
    html: `<p><i>«${greet}»</i></p><p><b>Репутация:</b> ${S.elfRep} (${repTitle()}) • <b>заданий выполнено:</b> ${S.tasksDone}<br>
      <b>Набегов отбито:</b> ${S.raidsSurvived} • <b>корованов ограблено:</b> ${stats().caravansRobbed}</p>
      ${t ? `<p><b>Задание:</b> ${t.title}<br><i>«${t.speech}»</i>${t.progress ? `<br><small>${t.progress()}</small>` : ''}</p>` : '<p>Сейчас заданий нет — но я найду тебе дело.</p>'}`,
    buttons: [
      ...(!t ? [{ label: 'Дай задание, вождь!', fn: newTask }] : []),
      ...(t && t.type !== 'defend' ? [{ label: 'Отказаться от задания', fn: () => finishTask(false, 'Вы отказались.') }] : []),
    ],
  });
}

// debug/tests: give a specific task now ('caravan'|'ambush'|'hunt')
export function forceTask(type) {
  if (E.task) { E.task.cleanup?.(); E.task = null; }
  giveTask({ caravan: taskCaravan, ambush: taskAmbush, hunt: () => taskHunt(true) }[type]());
  return E.task;
}

// ---------- save / load of the active task ----------
export function saveElves() {
  const t = E.task;
  return { taskId, nextTaskIn: E.nextTaskT - S.t, lastType: E.lastType ?? null,
    task: t ? { type: t.type, id: t.id, elapsed: S.t - t.t0, p: t.save?.() ?? {} } : null };
}
export function loadElves(d) {
  if (!d) return;
  if (E.task) { E.task.cleanup?.(); for (const m of E.task.members ?? []) m.remove(); E.task = null; }
  game.compassPois.delete('order');
  taskId = Math.max(taskId, d.taskId ?? 1);
  E.nextTaskT = S.t + (d.nextTaskIn ?? 20); E.lastType = d.lastType;
  const st = d.task;
  let t = null;
  if (st?.type === 'caravan') t = taskCaravan();
  else if (st?.type === 'ambush') t = taskAmbush(st.p);
  else if (st?.type === 'hunt') t = taskHunt(true);
  else if (st?.type === 'defend') { const r = findRaid(st.p.raidUid); if (r) t = taskDefend(r); }
  if (t) { t.id = st.id; t.t0 = S.t - (st.elapsed ?? 0); E.task = t; if (t.poi) game.compassPois.set('order', { ...t.poi(), label: '★', color: '#7aff6a' }); }
  setHud();
}

export function updateObjectives() {
  if (!isElf()) return;
  const cr = Math.max(S.caravansRobbed ?? 0, stats().caravansRobbed ?? 0);
  game.journal.setObjective('elves:raids', `Пережить набеги на деревню (${Math.min(3, S.raidsSurvived)}/3)`, S.raidsSurvived >= 3);
  game.journal.setObjective('elves:caravans', `Ограбить корованы (${Math.min(3, cr)}/3)`, cr >= 3);
  game.journal.setObjective('elves:boss', 'Убить Злого или Императора', S.bossDead.villain || S.bossDead.emperor);
}

export function startElves() {
  E.task = null; E.nextTaskT = 0;
  updateObjectives();
  giveTask(taskCaravan());
  say(`${chiefName()} ждёт вас на площади деревни (E — поговорить).`);
  setHud();
}

export function updateElves(dt) {
  if (!isElf() || !game.player?.alive) return;
  const t = E.task;
  t?.update?.(dt);
  const r = raids.find(r => r.T.owner === 'elves' && !r.result);
  if (r && E.task?.type !== 'defend') {
    if (E.task) { E.task.cleanup?.(); game.journal.setObjective('task:' + E.task.id, E.task.title + ' (отложено)', true); E.task = null; }
    giveTask(taskDefend(r));
  }
  if (!E.task && S.t > E.nextTaskT && S.t - E.nextTaskT > 60) newTask(); // auto task if the player never visits the chief
  if ((S.t * 2 | 0) !== ((S.t - dt) * 2 | 0)) setHud();
}

export function initElves() {
  addInteractable({
    pos: () => game.elfChief?.pos ?? { x: 1e9, y: 0, z: 1e9 },
    r: 3,
    enabled: () => isElf() && !!game.elfChief?.alive,
    label: () => `Говорить: ${chiefName()}`,
    use: talkChief,
  });
  game.bus.on('caravan:robbed', ({ robber }) => {
    if (!isElf() || robber !== game.player) return;
    if (E.task?.type === 'caravan') finishTask(true, 'Эльфы пируют!');
    else addRep(1);
    updateObjectives();
  });
  game.bus.on('raid:end', ({ raid, result }) => {
    if (raid.T.owner === 'elves' && result === 'repelled') { S.raidsSurvived++; updateObjectives(); }
  });
}
