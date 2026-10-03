// Factions gameplay module entry: caravans, raids, the guard career, elf tasks, the villain's army, victory, save data.
// Sub-systems live in ./gameplay/*. Population (zone garrisons & reinforcement) is the separate `population` module.
import { game } from '../core/game.js';
import { spawn } from '../entities/spawn.js';
import { addInteractable } from '../entities/player.js';
import { S, resetState, stats } from './gameplay/state.js';
import { place, playerDist, say, updateBubbles, updateBanner, dryNear, shout } from './gameplay/util.js';
import { updateSquads, clearSquads, squads } from './gameplay/squad.js';
import { caravans, initCaravans, initialCaravans, updateCaravans, clearCaravans, spawnCaravan, ROUTES, saveCaravans, loadCaravans } from './gameplay/caravans.js';
import { raids, initRaids, updateRaids, resetRaids, launchRaid, triggerRaid, spawnSpy, revealSpy, spies, saveRaids, loadRaids } from './gameplay/raids.js';
import { G, RANKS, initGuard, startGuard, updateGuard, reprimand, declareDeserter, forceOrder, saveGuard, loadGuard } from './gameplay/guard.js';
import { updateProgress } from './gameplay/progress.js';
import { E, initElves, startElves, updateElves, updateObjectives, saveElves, loadElves, forceTask } from './gameplay/elves.js';
import { armyMembers, groupCounts, groupOrders, commandArmy, recruit, spawnVillainArmy, setPlayerSquadSize, updateArmy, resetArmy, applyOrder, saveArmy, loadArmy } from './gameplay/army.js';
import { initVictory, startVictory, updateVictory, showVictory } from './gameplay/victory.js';
import { initCommandMenu, openCommandMenu } from '../ui/command.js';

export const name = 'gameplay';

export function init() {
  initCaravans();
  initRaids();
  initGuard();
  initElves();
  initVictory();
  initCommandMenu();
  // recruiting officer at the fort (villain only): E opens the command menu with recruitment
  addInteractable({
    pos: () => { const p = place('fort:recruit'); return { x: p.x, y: 0, z: p.z }; },
    r: 3.5,
    enabled: () => game.playerFaction === 'villain' && game.player?.alive,
    label: () => 'Вербовщик: нанять воинов',
    use: () => openCommandMenu('recruit'),
  });
  game.addSystem({
    name: 'gameplay', order: 25,
    update(dt) {
      if (!game.player) return;
      S.t += dt;
      updateSquads(dt);
      updateCaravans(dt);
      updateRaids(dt);
      updateGuard(dt);
      updateElves(dt);
      updateArmy(dt);
      updateVictory(dt);
      updateBubbles(dt);
      updateBanner(dt);
      updateProgress(dt);
    },
  });
  // debug / test API
  game.gameplay = {
    S, G, E, caravans, raids, squads, spies, ROUTES, RANKS,
    spawnCaravan, launchRaid, triggerRaid, spawnSpy, revealSpy,
    armyMembers, groupCounts, groupOrders, commandArmy, recruit, setPlayerSquadSize, openCommandMenu,
    reprimand, declareDeserter, showVictory, forceOrder, forceTask,
  };
}

const INTRO = {
  elves: 'Вы — лесной эльф. Густой лес, деревянные домики... и набигают солдаты дворца и злодеи. Вождь даёт задания (E). Можно грабить корованы!',
  guard: 'Вы — рядовой охраны дворца. Надо слушаться командира! Явитесь к нему за приказом (★ на компасе).',
  villain: 'Вы — Злой (имя не придумали). Вы сам себе командир: C — приказы войскам, вербовщик в форте нанимает новых. Захватите дворец!',
};

export function startGame(opts) {
  const f = opts.faction;
  resetState();
  clearSquads();
  clearCaravans();
  stats();
  game.hudStatus.delete('order'); game.hudStatus.delete('merit');
  game.rank = null;
  resetRaids(f);
  resetArmy();
  initialCaravans(f);
  // difficulty: a normal player beats 1–2 soldiers, never 6 (tuned with headless duels)
  if (game.playerDmgMul == null) game.playerDmgMul = 1.3;
  if (f === 'villain') {
    game.addGold(200, 'treasury'); // казна Злого: на вербовку
    spawnVillainArmy();
    const rp = place('fort:recruit');
    const p = dryNear(rp.x + 1.5, rp.z + 1.5, 1);
    const rec = spawn('minion', p.x, p.z, { name: 'Вербовщик Злого', weapon: 'club', order: { type: 'guard', x: p.x, z: p.z, r: 1 } });
    rec.ai.leash = 10; rec.recruiter = true;
    game.compassPois.set('recruit', { x: rp.x, z: rp.z, label: '⚑', color: '#c070ff' });
  } else game.compassPois.delete('recruit');
  if (f === 'guard') startGuard();
  if (f === 'elves') startElves();
  startVictory(f);
  setTimeout(() => say(INTRO[f] ?? ''), 600);
}

// ---------- save support ----------
// Saves the whole live gameplay situation: progression (S), the active guard order / elf task with progress,
// every soldier of the player's army (position, hp, injuries, weapon, group) and group orders, active caravans
// (route progress, robbed state, escorts) and active raids & spies. deserialize() runs after startGame and replaces
// the defaults startGame spawned.
export function serialize() {
  const st = stats();
  return {
    v: 2,
    S: JSON.parse(JSON.stringify(S)),
    stats: { caravansRobbed: st.caravansRobbed, raidsRepelled: st.raidsRepelled, ordersDone: st.ordersDone, spiesCaught: st.spiesCaught, promotions: st.promotions },
    army: saveArmy(),
    caravans: saveCaravans(),
    raids: saveRaids(),
    guard: game.playerFaction === 'guard' ? saveGuard() : null,
    elves: game.playerFaction === 'elves' ? saveElves() : null,
  };
}

export function deserialize(data) {
  if (!data || !data.S) return;
  Object.assign(S, data.S, { t: S.t });
  Object.assign(stats(), data.stats ?? {});
  const pf = game.playerFaction;
  // dead bosses stay dead
  if (S.bossDead.emperor && game.emperor) { game.emperor.remove(); game.emperor = null; }
  if (S.bossDead.villain && game.villainBoss) { game.villainBoss.remove(); game.villainBoss = null; }
  if (pf === 'guard') {
    game.rank = RANKS[S.rankIdx];
    if (S.deserter) game.player.outlawFor = new Set([...(game.player.outlawFor ?? []), 'guard']);
  }
  if (data.v >= 2) {
    loadCaravans(data.caravans);
    loadRaids(data.raids);           // before orders/tasks: they reference raids & spies by uid
    loadArmy(data.army);
    if (pf === 'guard') loadGuard(data.guard);
    if (pf === 'elves') { loadElves(data.elves); updateObjectives(); }
  } else {
    // old (v1) saves: progression only
    if (pf === 'guard' && !S.deserter) { if (S.tutorialDone) loadGuard({ order: null }); setPlayerSquadSize([0, 0, 3, 5, 7][S.rankIdx] ?? 0); }
    if (pf === 'elves') { setPlayerSquadSize(S.tasksDone >= 6 ? 7 : S.tasksDone >= 4 ? 5 : S.tasksDone >= 2 ? 3 : 0); updateObjectives(); }
  }
  if (pf === 'villain') game.hudStatus.set('order', `<span class="order">Армия: ${armyMembers().length} воинов</span>`);
}
