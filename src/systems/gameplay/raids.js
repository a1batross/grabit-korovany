// Raid director: "НАБИГАЮТ!" — squads spawn at the edge of a zone and march (in formation, along roads) into the
// elf village / palace / fort. Defenders rally. Spies sneak in disguised and strike later.
import { game } from '../../core/game.js';
import { spawn } from '../../entities/spawn.js';
import { addInteractable } from '../../entities/player.js';
import { pick, rand, randInt } from '../../core/rng.js';
import { S, stats } from './state.js';
import { Squad, squads } from './squad.js';
import { routeTo } from './nav.js';
import { LOC } from '../../world/zones.js';
import { snapActor, applySnap } from './util.js';
import { place, dryNear, playerDist, aliveCount, dist, shout, say, banner, hostilesNear } from './util.js';

export const raids = [];   // active raids
let nextId = 1;

export const TARGETS = {
  elves: { name: 'эльфийскую деревню', owner: 'elves', at: () => place('elves:square'), r: 38, gate: null },
  palace: { name: 'дворец', owner: 'guard', at: () => place('palace:yard'), r: 42, gate: () => place('palace:gate') },
  fort: { name: 'форт Злого', owner: 'villain', at: () => place('fort:yard'), r: 38, gate: () => place('fort:gate') },
};
// Approach: spawn point (edge of the zone, on a road) + waypoints before the target
const APPROACH = {
  elves: { guard: { spawn: [-505, 145], route: [[-640, 90]] }, villain: { spawn: [-835, 200], route: [[-760, 150]] }, humans: { spawn: [-505, 145], route: [[-640, 90]] } },
  palace: { villain: { spawn: [564, -244], route: [[600, -200]] }, elves: { spawn: [470, 54], route: [[500, 40], [620, 0]] }, humans: { spawn: [470, 54], route: [[500, 40], [620, 0]] } },
  fort: { elves: { spawn: [-8, -500], route: [[-30, -560]] }, guard: { spawn: [250, -555], route: [[200, -600]] } },
};
const ATTACKER_NAMES = { guard: 'Солдаты дворца', villain: 'Войска Злого', elves: 'Эльфы-партизаны' };
const LEADERS = {
  guard: ['Десятник Кузьмич', 'Сотник Голицын', 'Сержант Петренко'],
  villain: ['Тёмный сотник Гнилобрюх', 'Орк-вожак Ыргх', 'Палач Злого'],
  elves: ['Партизан Элендил', 'Следопыт Арагорнэль', 'Лесничий Финвэ'],
};
const COMPOSITION = {
  guard: n => [...Array(n)].map((_, i) => i % 4 === 3 ? 'guardArcher' : 'guard'),
  villain: n => [...Array(n)].map((_, i) => i % 4 === 3 ? 'minionArcher' : 'minion'),
  elves: n => [...Array(n)].map((_, i) => i % 3 === 2 ? 'elfArcher' : 'elf'),
};

// gate + a point just inside it (armies must pass through the gatehouse, not hug the walls)
export function entryFor(T) {
  if (!T.gate) return null;
  const g = T.gate(), y = T.at();
  const d = Math.hypot(y.x - g.x, y.z - g.z) || 1;
  const k = Math.min(14, d * 0.6);
  return [{ x: g.x, z: g.z }, { x: g.x + (y.x - g.x) / d * k, z: g.z + (y.z - g.z) / d * k }];
}

// which fortified base (palace/fort) contains the point
export function fortressAt(x, z) {
  for (const [k, c] of [['palace', LOC.palace], ['fort', LOC.fort]]) if (Math.hypot(x - c.x, z - c.z) < 56) return TARGETS[k];
  return null;
}
// full marching route from (x,z) to target T: out through our own gate, along the roads, in through their gate
export function fullRoute(x, z, T) {
  const pts = [];
  const F = fortressAt(x, z);
  if (F === T) return pts;
  let sx = x, sz = z;
  if (F) { const [g, inner] = entryFor(F); pts.push([inner.x, inner.z], [g.x, g.z]); sx = g.x; sz = g.z; }
  const tgt = T.at();
  pts.push(...routeTo(sx, sz, tgt.x, tgt.z));
  const e = entryFor(T);
  if (e) pts.push(...e.map(p => [p.x, p.z]));
  return pts;
}
// nested goto orders through waypoints ending with `final`
export function chainOrder(points, final, run = false) {
  let o = final;
  for (let i = points.length - 1; i >= 0; i--) o = { type: 'goto', x: points[i][0], z: points[i][1], r: 4, run, then: o };
  return o;
}

// Spawn a marching squad. o: { attacker, target ('elves'|'palace'|'fort'), size, spawnAt:{x,z}, route, cry, leaderName,
//   transient=true, announce=true, quiet, onEnd(result) }
export function launchRaid(attacker, target, o = {}) {
  const T = TARGETS[target];
  const ap = APPROACH[target]?.[attacker] ?? APPROACH[target]?.humans ?? { spawn: [T.at().x + 150, T.at().z], route: [] };
  const size = Math.max(1, Math.min(o.size ?? 6, 150 - aliveCount()));
  const sp = o.spawnAt ?? { x: ap.spawn[0], z: ap.spawn[1] };
  const tgt = T.at();
  let route = o.route ?? ap.route.map(p => [...p]);
  const entry = entryFor(T);
  if (o.spawnAt && !o.route) route = fullRoute(sp.x, sp.z, T);
  else if (entry && !o.route) route.push(...entry.map(p => [p.x, p.z]));
  const members = [];
  const comp = COMPOSITION[attacker](size);
  comp.forEach((preset, i) => {
    const p = dryNear(sp.x + (i % 3 - 1) * 2, sp.z + Math.floor(i / 3) * 2, 1);
    const a = spawn(preset, p.x, p.z, i === 0 ? { name: o.leaderName ?? pick(LEADERS[attacker]), hp: 130, armor: 0.3 } : {});
    a.transient = o.transient ?? true;
    a.raider = true;
    members.push(a);
  });
  const raid = { id: nextId, uid: o.uid ?? nextId++, attacker, target, T, members, started: S.t, announced: false, size, o };
  const squad = new Squad({
    members, faction: attacker, name: ATTACKER_NAMES[attacker], route, kind: 'raid',
    target: { x: tgt.x, z: tgt.z, r: T.r }, assaultTime: 200, cry: o.cry, entry,
    onAssault: () => onAssault(raid),
    onEnd: (result) => endRaid(raid, result),
    returnHome: null,
  });
  raid.squad = squad;
  raids.push(raid);
  stats().raidsLaunched++;
  if (o.announce !== false) announce(raid);
  game.bus.emit('raid:start', { attackers: members, target, attacker, raid });
  return raid;
}

function announce(raid) {
  const T = raid.T;
  const pf = game.playerFaction;
  const defending = T.owner === pf;
  const text = `⚔ НАБИГАЮТ! ${ATTACKER_NAMES[raid.attacker]} (${raid.size}) идут на ${T.name}!`;
  if (defending) {
    banner('НАБИГАЮТ!', `${ATTACKER_NAMES[raid.attacker]} идут на ${T.name}!`, '#ff5a3a');
    say(text, 'bad');
    game.journal.add(`${ATTACKER_NAMES[raid.attacker]} набигают на ${T.name}.`);
  } else if (playerDist(T.at()) < 300) say(text);
  raid.announced = true;
}

function onAssault(raid) {
  // defenders of the zone rally to the square
  const tgt = raid.T.at();
  raid.rallied = [];
  for (const a of game.actors) {
    if (!a.alive || a.isPlayer || a.squad || a.armyGroup || a.faction !== raid.T.owner) continue;
    if (a.zoneHome == null || !['elves', 'palace', 'fort'].includes(a.zoneHome)) continue;
    if (/posts|throne|emperor|villain|chief|commander/.test(a.popGroup ?? '')) continue;
    if (dist(a.pos, tgt) > 180) continue;
    raid.rallied.push([a, a.ai.order]);
    a.ai.setOrder({ type: 'assault', x: tgt.x, z: tgt.z, r: raid.T.r + 10 });
  }
  const rallier = { elves: game.elfChief, guard: game.commander, villain: game.villainBoss }[raid.T.owner];
  const cry = { elves: 'Набигают! Все к оружию!', guard: 'Тревога! Защищать дворец! За императора!', villain: 'Нас атакуют! Рубите их!' }[raid.T.owner];
  if (rallier?.alive) shout(rallier, cry, { range: 120 });
  else if (raid.rallied[0]) shout(raid.rallied[0][0], cry, { range: 120 });
}

function endRaid(raid, result) {
  const i = raids.indexOf(raid);
  if (i >= 0) raids.splice(i, 1);
  game.compassPois.delete('raid' + raid.id);
  for (const [a, order] of raid.rallied ?? []) if (a.alive && !a.squad) a.ai.setOrder(order);
  const T = raid.T, pf = game.playerFaction;
  // a timed-out assault is not a capture: the attackers give up and retreat. Success needs a cleared base ('won').
  const defendersWon = result !== 'won';
  raid.result = defendersWon ? 'repelled' : 'success';
  const playerNear = playerDist(T.at()) < 160 || raid.playerHelped;
  if (defendersWon) {
    if (T.owner === pf && !raid.o.quiet) {
      const reward = playerNear ? 30 + raid.size * 8 : 0;
      banner('НАБЕГ ОТБИТ!', reward ? `Награда: +${reward} зол.` : 'Без вас справились...', '#7ad86a');
      say(`Набег на ${T.name} отбит!${reward ? ` +${reward} зол.` : ''}`, 'good');
      if (reward) { game.addGold(reward, 'raid'); stats().raidsRepelled++; }
      game.journal.add(`Набег на ${T.name} отбит.`);
    } else if (raid.attacker === pf && raid.o.playerSide) {
      say(`Набег на ${T.name} провалился!`, 'bad');
    }
    // survivors retreat (they are transient and vanish when far)
    for (const m of raid.members) if (m.alive) { m.ai.setOrder({ type: 'goto', x: raid.squad?.route?.[0]?.[0] ?? m.pos.x + 200, z: raid.squad?.route?.[0]?.[1] ?? m.pos.z, r: 8, run: true }); m.transient = true; }
  } else {
    if (T.owner === pf && !raid.o.quiet) { say(`${ATTACKER_NAMES[raid.attacker]} разорили ${T.name}!`, 'bad'); game.journal.add(`${ATTACKER_NAMES[raid.attacker]} разорили ${T.name}.`); }
    else if (raid.attacker === pf && raid.o.playerSide && !raid.cancelled) { banner('НАБЕГ УДАЛСЯ!', `${T.name} разорен(а)!`); }
  }
  game.bus.emit('raid:end', { raid, result: raid.result, playerNear });
  raid.o.onEnd?.(raid.result, raid);
}

// ---------- spies ----------
export const spies = new Set();
let nextSpyUid = 1;
export function findSpy(uid) { for (const a of spies) if (a.spyUid === uid && a.alive && !a.removed) return a; return null; }
export function findRaid(uid) { return raids.find(r => r.uid === uid) ?? null; }
// spawn a disguised spy. side: 'villain' (disguised as human, targets palace/town) or 'guard' (лазутчик, disguised as a minion)
export function spawnSpy(where, o = {}) {
  let a;
  if (where === 'fort') {
    const p = dryNear(-8, -560, 3);
    a = spawn('spy', p.x, p.z, { faction: 'guard', disguisedAs: 'villain', kind: 'minion', look: {}, name: 'Лазутчик дворца', hp: 80, weapon: 'dagger' });
    a.spyTarget = 'fort';
    a.ai.setOrder({ type: 'goto', x: place('fort:yard').x, z: place('fort:yard').z, r: 6, then: { type: 'wander', x: place('fort:yard').x, z: place('fort:yard').z, r: 18 } });
  } else if (where === 'town') {
    const sq = place('town:square');
    const p = dryNear(sq.x + rand(-25, 25), sq.z + rand(-25, 25), 3);
    a = spawn('spy', p.x, p.z, { look: { shirt: '#8a6a4a', hat: 'straw', hair: '#5a3a1a', hood: undefined }, kind: 'peasant', name: pick(['Крестьянин Вася', 'Мужик Степан', 'Пастух Ерёма', 'Дед Макар']) });
    a.spyTarget = 'town';
    a.ai.setOrder({ type: 'wander', x: sq.x, z: sq.z, r: 30 });
  } else { // palace
    const p = dryNear(500, 40, 3);
    a = spawn('spy', p.x, p.z, { look: { shirt: '#8a6a4a', hat: 'straw', hair: '#5a3a1a', hood: undefined }, kind: 'peasant', name: 'Подозрительный крестьянин' });
    a.spyTarget = 'palace';
    const y = place('palace:yard');
    a.ai.setOrder({ type: 'goto', x: y.x, z: y.z, r: 6, then: { type: 'wander', x: y.x, z: y.z, r: 15 } });
  }
  a.transient = true; a.undercover = true;
  a.mission = true; // exempt from distance cleanup while on the job
  a.spyUid = o.uid ?? nextSpyUid++;
  a.ai.aggroRange = 0.01; // pretends to be harmless
  a.strikeAt = S.t + (o.strikeIn ?? rand(100, 160));
  spies.add(a);
  return a;
}

export function revealSpy(a, by) {
  if (!a.alive || !a.undercover) return;
  a.undercover = false; a.revealed = true;
  a.ai.aggroRange = null; a.ai.passive = false; a.ai.courage = 0.9;
  if (by) { a.grudges.add(by); a.ai.target = by; }
  shout(a, pick(['Раскрыли! Получай!', 'Ты ничего не видел!', 'Злой отомстит за меня!']), { range: 60, kind: 'bad' });
  if (a.faction === 'villain') say('Это шпион Злого! Хватай его!', 'bad');
  else say('Это лазутчик из дворца!', 'bad');
  game.bus.emit('spy:revealed', { spy: a, by });
}

function spyStrike(a) {
  // time to do the dirty deed
  let victim = null;
  if (a.spyTarget === 'palace') victim = [game.emperor, game.commander].find(v => v?.alive && dist(v.pos, a.pos) < 120);
  if (a.spyTarget === 'fort' && game.playerFaction === 'villain') victim = game.player;
  if (a.spyTarget === 'fort' && !victim) victim = game.villainBoss?.alive ? game.villainBoss : null;
  revealSpy(a, victim);
  if (victim) a.ai.setOrder({ type: 'assault', x: victim.pos.x, z: victim.pos.z, r: 10 });
}

function updateSpies() {
  for (const a of [...spies]) {
    if (!a.alive || a.removed) { spies.delete(a); continue; }
    // strike once arrived (or when he has been dawdling far too long)
    if (a.undercover && a.spyTarget !== 'town' && S.t > a.strikeAt && (a.ai.order.type !== 'goto' || S.t > a.strikeAt + 120)) spyStrike(a);
    if (a.revealed && !a.undercover && a.ai.target == null && a.ai.order.type !== 'assault') {
      // flee back out after striking
    }
  }
}

// One shared [E] "inspect" interactable: picks the nearest civilian-looking actor while spies are undercover.
let inspectCand = null;
const inspected = new WeakSet();
function inspectCandidate() {
  const p = game.player;
  if (!p?.alive) return null;
  let anyUndercover = false;
  for (const s of spies) if (s.alive && s.undercover) { anyUndercover = true; break; }
  if (!anyUndercover) return null;
  let best = null, bd = 2.6 * 2.6;
  for (const a of game.actors) {
    if (!a.alive || a.isPlayer || a.caravan || inspected.has(a)) continue;
    const app = a.disguisedAs && !a.revealed ? a.disguisedAs : a.faction;
    // guards inspect "humans", the villain inspects his own troops (лазутчики)
    if (!(app === 'humans' && a.role !== 'merchant') && !(game.playerFaction === 'villain' && app === 'villain' && !a.armyGroup)) continue;
    const d = (a.pos.x - p.pos.x) ** 2 + (a.pos.z - p.pos.z) ** 2;
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
const GRUMBLES = ['Чего пристал? Я честный крестьянин!', 'Обыскивай, обыскивай... ничего нет!', 'Я тут джва года живу!', 'Ой, не губи, служивый!', 'Свой я, свой!'];
function inspect() {
  const a = inspectCand;
  if (!a?.alive) return;
  inspected.add(a);
  setTimeout(() => inspected.delete(a), 60000);
  if (a.undercover) {
    stats().spiesCaught++;
    revealSpy(a, game.player);
    game.bus.emit('spy:caught', { spy: a });
  } else shout(a, pick(GRUMBLES), { range: 20 });
}

// ---------- schedule ----------
const SCHED = {
  elves: { first: 75, every: [190, 280], kinds: [['guard', 'elves'], ['villain', 'elves']] },
  guard: { first: 170, every: [230, 320], kinds: [['villain', 'palace'], ['elves', 'palace'], ['spy', 'palace']] },
  villain: { first: 150, every: [220, 300], kinds: [['elves', 'fort'], ['guard', 'fort'], ['spy', 'fort']] },
};
let nextRaidT = 0, nextBgT = 0, raidN = 0;
export function resetRaids(faction) {
  for (const r of [...raids]) r.squad?.dissolve('reset');
  raids.length = 0; spies.clear();
  nextRaidT = SCHED[faction]?.first ?? 120; nextBgT = rand(300, 420); raidN = 0;
}
export function delayNextRaid(sec) { nextRaidT = Math.max(nextRaidT, S.t + sec); }
export function timeToNextRaid() { return nextRaidT - S.t; }

export function triggerRaid(kind) {
  const sch = SCHED[game.playerFaction];
  const [att, tgt] = kind ?? pick(sch.kinds);
  raidN++;
  if (att === 'spy') {
    const n = tgt === 'fort' ? randInt(1, 2) : randInt(1, 2);
    const list = [];
    for (let i = 0; i < n; i++) list.push(spawnSpy(tgt));
    game.bus.emit('raid:start', { attackers: list, target: tgt, attacker: 'spy' });
    if (tgt === 'fort') say('Донесение: во форт пробрался лазутчик дворца! Досмотрите подозрительных воинов (E).', 'bad');
    return { spies: list, target: tgt };
  }
  const size = Math.min(13, 6 + Math.floor(raidN * 1.2) + randInt(0, 2));
  return launchRaid(att, tgt, { size });
}

export function updateRaids(dt) {
  const pf = game.playerFaction;
  // compass markers for raids against the player's side
  for (const r of raids) {
    const L = r.squad?.members?.find(m => m.alive);
    if (L && (r.T.owner === pf || r.o.playerSide)) game.compassPois.set('raid' + r.id, { x: L.pos.x, z: L.pos.z, label: '⚔', color: '#ff5040' });
    // player helped if he fought near the raiders
    if (L && playerDist(L.pos) < 60) r.playerHelped = true;
  }
  updateSpies();
  if (S.t >= nextRaidT && SCHED[pf] && !S.victoryPause) {
    const sch = SCHED[pf];
    nextRaidT = S.t + rand(sch.every[0], sch.every[1]);
    if (aliveCount() < 150 - 8 && !raids.some(r => r.T.owner === pf)) triggerRaid();
  }
  // small background raids elsewhere keep the world at war
  if (S.t >= nextBgT) {
    nextBgT = S.t + rand(320, 480);
    if (aliveCount() < 150 - 20 && raids.length < 3) {
      const opts = [['villain', 'elves'], ['guard', 'elves'], ['elves', 'palace'], ['villain', 'palace'], ['elves', 'fort'], ['guard', 'fort']]
        .filter(([a, t]) => TARGETS[t].owner !== pf && a !== pf && !(t === 'palace' && S.bossDead.emperor));
      if (opts.length) { const [a, t] = pick(opts); launchRaid(a, t, { size: randInt(3, 5) }); }
    }
  }
}

export function initRaids() {
  game.bus.on('actor:hit', ({ target, attacker }) => {
    if (target?.undercover) revealSpy(target, attacker);
    if (attacker?.undercover && !attacker.isPlayer) revealSpy(attacker, target);
  });
  addInteractable({
    pos: () => { inspectCand = inspectCandidate(); return inspectCand ? inspectCand.pos : { x: 1e9, y: 0, z: 1e9 }; },
    r: 2.6,
    enabled: () => !!inspectCand || !!inspectCandidate(),
    label: () => `Досмотреть: ${inspectCand?.name ?? ''}`,
    use: inspect,
  });
}


// ---------- save / load of active raids and spies ----------
export function saveRaids() {
  return {
    nextRaidIn: nextRaidT - S.t, nextBgIn: nextBgT - S.t, raidN, nextId, nextSpyUid,
    raids: raids.filter(r => !r.result && r.squad && !r.squad.ended).map(r => ({
      uid: r.uid, attacker: r.attacker, target: r.target, size: r.size, state: r.squad.state, wp: r.squad.wp,
      route: r.squad.route, playerHelped: !!r.playerHelped, elapsed: S.t - r.started,
      o: { playerSide: !!r.o.playerSide, quiet: !!r.o.quiet, transient: r.o.transient ?? true, cry: r.o.cry ?? null, leaderName: r.o.leaderName ?? null },
      members: r.squad.members.filter(m => m.alive).map(snapActor),
    })),
    spies: [...spies].filter(a => a.alive && !a.removed).map(a => ({
      uid: a.spyUid, where: a.spyTarget, undercover: !!a.undercover, strikeIn: (a.strikeAt ?? S.t) - S.t, transient: !!a.transient, ...snapActor(a),
    })),
  };
}

export function loadRaids(d) {
  // drop the defaults spawned by startGame
  for (const r of [...raids]) { for (const m of r.members) m.remove(); r.squad?.dissolve('load'); }
  raids.length = 0;
  for (const a of [...spies]) a.remove();
  spies.clear();
  if (!d) return;
  nextRaidT = S.t + (d.nextRaidIn ?? 120); nextBgT = S.t + (d.nextBgIn ?? 300); raidN = d.raidN ?? 0;
  nextId = Math.max(nextId, d.nextId ?? 1); nextSpyUid = Math.max(nextSpyUid, d.nextSpyUid ?? 1);
  for (const sr of d.raids ?? []) {
    if (!sr.members?.length) continue;
    const m0 = sr.members[0];
    const route = (sr.route ?? []).slice(sr.wp ?? 0);
    const raid = launchRaid(sr.attacker, sr.target, {
      ...sr.o, cry: sr.o.cry ?? undefined, leaderName: sr.o.leaderName ?? undefined,
      size: sr.members.length, spawnAt: { x: m0.x, z: m0.z }, route, announce: false, uid: sr.uid,
    });
    raid.size = sr.size; raid.playerHelped = sr.playerHelped; raid.started = S.t - (sr.elapsed ?? 0);
    raid.squad.members.forEach((m, i) => { const sm = sr.members[i]; if (sm) { applySnap(m, sm); if (sm.weapon) m.equipWeapon(sm.weapon); m.name = sm.name; } });
    if (sr.state === 'assault') raid.squad.startAssault();
  }
  for (const ss of d.spies ?? []) {
    const a = spawnSpy(ss.where, { uid: ss.uid, strikeIn: ss.strikeIn });
    applySnap(a, ss);
    a.transient = ss.transient;
    if (!ss.undercover) { a.undercover = false; a.revealed = true; a.ai.aggroRange = null; a.ai.passive = false; }
  }
}
