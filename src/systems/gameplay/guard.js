// Palace guard career: "надо слушаться командира". The Commander issues orders (post duty, patrols, defending the
// palace, catching spies, raids on the elves / the villain's fort). Obedience pays and promotes; disobedience earns
// reprimands, fines and finally the deserter status (all guards attack you).
import { game } from '../../core/game.js';
import { ROADS } from '../../world/zones.js';
import { addInteractable } from '../../entities/player.js';
import { pick, rand, randInt } from '../../core/rng.js';
import { S, stats } from './state.js';
import { place, placeList, playerDist, dist, shout, say, banner, dialog, fmtTime } from './util.js';
import { launchRaid, spawnSpy, raids, delayNextRaid, spies } from './raids.js';
import { setPlayerSquadSize, releaseArmy } from './army.js';

export const RANKS = ['Рядовой', 'Ефрейтор', 'Сержант', 'Лейтенант', 'Капитан'];
const MERIT_FOR = [0, 4, 9, 15, 22];
const SQUAD_FOR_RANK = [0, 0, 3, 5, 7];

export const G = { order: null, nextOrderT: 0, reprimandCd: 0, tutorialDone: false };

const isGuard = () => game.playerFaction === 'guard';
const cmdName = () => game.commander?.name ?? 'Командир';

function setHud() {
  if (!isGuard()) return;
  if (S.deserter) { game.hudStatus.set('order', '<span style="color:#ff5040">ДЕЗЕРТИР — стража охотится на вас!</span>'); game.hudStatus.delete('merit'); return; }
  const o = G.order;
  let line = o ? `<span class="order">Приказ: ${o.title}</span>` : '<span class="order">Приказ: ожидайте распоряжений командира</span>';
  if (o?.progress) line += `<br><small>${o.progress()}</small>`;
  game.hudStatus.set('order', line);
  game.hudStatus.set('merit', `<small>Заслуги: ${S.merit}${S.reprimands ? ` • выговоры: <span style="color:#ff7050">${S.reprimands}</span>` : ''}</small>`);
}

function setRank(i, silent = false) {
  S.rankIdx = Math.max(0, Math.min(RANKS.length - 1, i));
  game.rank = RANKS[S.rankIdx];
  setPlayerSquadSize(SQUAD_FOR_RANK[S.rankIdx]);
  if (!silent) setHud();
}

function addMerit(n) {
  S.merit = Math.max(0, S.merit + n);
  while (S.rankIdx < RANKS.length - 1 && S.merit >= MERIT_FOR[S.rankIdx + 1]) {
    setRank(S.rankIdx + 1);
    stats().promotions++;
    banner('ПОВЫШЕНИЕ!', `Вы теперь ${RANKS[S.rankIdx]}. Жалованье повышено.`, '#e8c060');
    say(`${cmdName()}: «Поздравляю, ${RANKS[S.rankIdx].toLowerCase()}! Служи императору!»`, 'good');
    game.journal.add(`Повышен в звании: ${RANKS[S.rankIdx]}.`);
    if (SQUAD_FOR_RANK[S.rankIdx] > 0) say(`Вам выделен отряд из ${SQUAD_FOR_RANK[S.rankIdx]} стражников. C — командовать.`, 'good');
    if (S.rankIdx === RANKS.length - 1) game.journal.complete('guard:rank');
    game.bus.emit('rank:change', { rank: game.rank, idx: S.rankIdx });
  }
}

export function reprimand(reason, fine = 0) {
  if (!isGuard() || S.deserter) return;
  if (G.reprimandCd > S.t) return;
  G.reprimandCd = S.t + 6;
  S.reprimands++;
  S.merit = Math.max(0, S.merit - 2);
  const f = fine || 10 * S.reprimands;
  const paid = Math.min(game.gold, f);
  if (paid > 0) game.addGold(-paid, 'fine');
  say(`ВЫГОВОР: ${reason}${paid ? ` Штраф ${paid} зол.` : ''}`, 'bad');
  game.journal.add(`Выговор от командира: ${reason}`);
  if (game.commander?.alive && playerDist(game.commander.pos) < 60) shout(game.commander, pick(['Безобразие!', 'Под трибунал захотел?!', 'Ещё раз — и вон из стражи!']), { kind: 'bad' });
  if (S.reprimands === 3) say('Командир: «Последнее предупреждение! Ещё выговоры — и ты дезертир!»', 'bad');
  if (S.reprimands >= 5) declareDeserter();
  setHud();
}

export function declareDeserter() {
  if (S.deserter) return;
  S.deserter = true;
  const p = game.player;
  p.outlawFor = new Set([...(p.outlawFor ?? []), 'guard']);
  G.order = null;
  releaseArmy();
  banner('ДЕЗЕРТИР!', 'Вас объявили дезертиром. Стража дворца теперь атакует вас!', '#ff4030');
  game.journal.add('Объявлен дезертиром. Теперь вся стража дворца — враги.');
  game.journal.setObjective('guard:obey', 'Слушаться командира — провалено (дезертир)', true);
  game.compassPois.delete('order');
  game.bus.emit('guard:deserter', {});
  setHud();
}

// ---------- orders ----------
function finishOrder(ok, note = '') {
  const o = G.order;
  if (!o) return;
  G.order = null;
  game.compassPois.delete('order');
  o.cleanup?.();
  G.nextOrderT = S.t + rand(25, 45);
  if (ok) {
    S.ordersDone++; stats().ordersDone++;
    const pay = o.pay ?? 25;
    const sal = Math.round(pay * (1 + S.rankIdx * 0.5));
    game.addGold(sal, 'salary');
    say(`Приказ выполнен: ${o.title}. Жалованье +${sal} зол.${note ? ' ' + note : ''}`, 'good');
    game.journal.add(`Выполнен приказ: ${o.title}.`);
    game.journal.complete('order:' + o.id);
    if (S.reprimands > 0 && S.ordersDone % 3 === 0) { S.reprimands--; say('Командир снял с вас один выговор за усердие.', 'good'); }
    addMerit(o.merit ?? 2);
    game.bus.emit('order:complete', { order: o, ok: true });
  } else {
    S.ordersFailed++;
    game.journal.add(`Провален приказ: ${o.title}.`);
    game.journal.setObjective('order:' + o.id, o.title + ' (провалено)', true);
    reprimand(note || `Приказ «${o.title}» не выполнен!`);
    game.bus.emit('order:complete', { order: o, ok: false });
  }
  setHud();
}

let orderId = 1;
function giveOrder(o, viaCommander = false) {
  o.id = orderId++;
  o.t0 = S.t;
  G.order = o;
  const msg = `${cmdName()}: «${o.speech}»`;
  say(viaCommander ? msg : `Гонец от командира. ${msg}`, '');
  game.journal.add(`Приказ командира: ${o.title}.`);
  game.journal.setObjective('order:' + o.id, `Приказ: ${o.title}`);
  if (o.poi) game.compassPois.set('order', { ...o.poi(), label: '★', color: '#ffd84a' });
  game.bus.emit('order:issued', { order: o });
  setHud();
}

const POST_NAMES = ['у главных ворот', 'на восточной стене', 'у казармы', 'на северной башне', 'у тронного зала', 'на южной стене', 'у конюшни', 'на западной стене', 'у колодца', 'у сокровищницы'];

function orderPost() {
  const posts = placeList('palace:posts');
  const i = randInt(0, posts.length - 1);
  const p = posts[i];
  const dur = randInt(60, 100);
  let held = 0, away = 0, warned = false;
  return {
    type: 'post', title: `Стоять на посту ${POST_NAMES[i % POST_NAMES.length]}`, pay: 20, merit: 2,
    speech: `Заступай на пост ${POST_NAMES[i % POST_NAMES.length]}! Стоять ${dur} секунд и не сходить с места!`,
    data: { i, dur },
    poi: () => ({ x: p.x, z: p.z }),
    progress: () => held > 0 ? `На посту: ${fmtTime(held)} / ${fmtTime(dur)}` : `Идите на пост (${Math.round(playerDist(p))} м)`,
    update(dt) {
      const d = playerDist(p);
      if (d < 7) { held += dt; away = 0; warned = false; }
      else if (held > 0 && d > 14) {
        away += dt;
        if (!warned && away > 6) { warned = true; say('Вы покинули пост! Немедленно вернитесь!', 'bad'); }
        if (away > 25) return finishOrder(false, 'Самовольно покинул пост!');
      }
      if (held >= dur) return finishOrder(true);
      if (held === 0 && S.t - this.t0 > 150) return finishOrder(false, 'Так и не явился на пост!');
    },
  };
}

function orderPatrol() {
  const road = ROADS.townPalace;
  const pts = [road[4], road[3], road[2], road[3], road[5]].map(([x, z]) => ({ x, z }));
  let k = 0;
  return {
    type: 'patrol', title: 'Патрулировать дорогу к Слободе', pay: 30, merit: 3,
    speech: 'Пройди патрулём по дороге до Слободы и обратно. Гляди в оба — там разбойники и эльфы шастают.',
    poi: () => pts[k] ?? pts[pts.length - 1],
    progress: () => `Точка патруля ${k + 1} / ${pts.length} (${Math.round(playerDist(pts[k] ?? pts[0]))} м)`,
    update() {
      if (playerDist(pts[k]) < 12) {
        k++;
        if (k >= pts.length) return finishOrder(true);
        say(`Точка патруля пройдена (${k}/${pts.length}).`);
        game.compassPois.set('order', { ...pts[k], label: '★', color: '#ffd84a' });
      }
      if (S.t - this.t0 > 480) finishOrder(false, 'Патруль не завершён вовремя!');
    },
  };
}

function orderSpy(forceWhere = null, existing = null) {
  const where = forceWhere ?? (Math.random() < 0.6 ? 'town' : 'palace');
  const spy = existing ?? spawnSpy(where, { strikeIn: where === 'palace' ? 200 : 9999 });
  spy.transient = false; // keep him around while the order is active
  const sq = where === 'town' ? place('town:square') : place('palace:yard');
  return {
    type: 'spy', title: where === 'town' ? 'Поймать шпиона в Слободе' : 'Поймать шпиона во дворце', pay: 45, merit: 4,
    speech: where === 'town'
      ? 'Донесли: в Слободе шпион Злого, переодетый крестьянином. Досматривай подозрительных (E) и прикончи гада!'
      : 'Во дворец пробрался шпион, одет как крестьянин! Найди его, пока он не добрался до императора!',
    spy, poi: () => ({ x: sq.x, z: sq.z }),
    progress: () => spy.revealed ? 'Шпион раскрыт — убейте его!' : `Досматривайте подозрительных (E) около ${where === 'town' ? 'площади Слободы' : 'двора дворца'}`,
    update() {
      if (!spy.alive) { stats().spiesCaught += spy.revealed ? 0 : 1; return finishOrder(true, 'Шпион обезврежен.'); }
      if (spy.removed || S.t - this.t0 > 420) finishOrder(false, 'Шпион ушёл!');
    },
    cleanup() { if (spy.alive && spy.undercover) { spy.transient = true; } },
  };
}

function orderRaid() {
  const target = S.bossDead.villain || Math.random() < 0.55 ? 'elves' : 'fort';
  const tName = target === 'elves' ? 'эльфийскую деревню' : 'форт Злого';
  // the squad gathers at a staging point on the road near the enemy and waits for you
  const stage = target === 'elves' ? { x: -420, z: 165, name: 'на дороге к западу от Слободы' } : { x: 205, z: -598, name: 'на горной дороге к форту' };
  let raid = null, assaultT = 0, started = false, joined = false;
  const o = {
    type: 'raid', title: `Набег на ${tName}`, pay: 70, merit: 5, target,
    speech: `Идём в набег на ${tName}! Отряд сержанта Петренко ждёт тебя ${stage.name}. Бегом туда — без тебя не выступят!`,
    poi: () => { const L = raid?.squad?.members?.find(m => m.alive); return L ? { x: L.pos.x, z: L.pos.z } : stage; },
    progress: () => !joined ? `Бегите к отряду (${Math.round(playerDist(stage))} м)` : raid.squad?.state === 'assault' ? `Бой! (${Math.round(assaultT)} с)` : `Идите с отрядом (${Math.round(playerDist(o.poi()))} м до сержанта)`,
    update(dt) {
      if (!started) {
        started = true;
        raid = launchRaid('guard', target, {
          size: 7, spawnAt: stage, leaderName: 'Сержант Петренко', announce: false, transient: true, playerSide: true, quiet: true,
          cry: 'За императора! Вперёд!',
        });
        raid.squad.hold = () => !joined;
        for (const m of raid.members) m.transient = true;
      }
      if (!joined && playerDist(o.poi()) < 25) {
        joined = true;
        shout(raid.squad.members[0], 'Наконец-то! Отряд, за мной — шагом марш!', { range: 40 });
      }
      if (!joined) { if (S.t - this.t0 > 300) { raid.cancelled = true; raid.squad.end('timeout'); return finishOrder(false, 'Отряд так и не дождался тебя!'); } return; }
      const near = playerDist(o.poi()) < 70;
      if (raid.squad?.state === 'assault' && near) assaultT += dt;
      if (raid.result) {
        if (raid.result === 'success' && assaultT > 5) return finishOrder(true, 'Набег удался!');
        if (assaultT > 30) return finishOrder(true, 'Вы храбро сражались.');
        return finishOrder(false, assaultT > 0 ? 'Набег провалился.' : 'Ты отсиживался, пока отряд воевал!');
      }
      if (assaultT > 70) return finishOrder(true, 'Набег удался!');
      if (S.t - this.t0 > 900) finishOrder(false, 'Набег затянулся и провалился.');
    },
  };
  return o;
}

// Defend the palace (issued when a raid on the palace starts)
function orderDefend(raid) {
  return {
    type: 'defend', title: 'Защитить дворец!', pay: 50, merit: 4, raid,
    speech: `${raid.attacker === 'villain' ? 'Войска Злого' : 'Эльфы-партизаны'} идут на дворец! Все к воротам! Защищать императора!`,
    poi: () => { const L = raid.squad?.members?.find(m => m.alive); return L ? { x: L.pos.x, z: L.pos.z } : place('palace:gate'); },
    progress: () => `Врагов осталось: ${raid.squad?.members?.filter(m => m.alive).length ?? 0}`,
    update() {
      if (raid.result) {
        if (raid.result === 'repelled' && raid.playerHelped) return finishOrder(true, 'Дворец отстоян!');
        if (raid.result === 'repelled') return finishOrder(false, 'Где ты был, когда враг штурмовал дворец?!');
        return finishOrder(false, 'Враг прорвался во дворец!');
      }
    },
  };
}

function orderReport() {
  const o = {
    type: 'report', title: 'Явиться к командиру', pay: 5, merit: 0,
    speech: 'Новобранец! Явись ко мне за приказом.',
    poi: () => game.commander?.alive ? { x: game.commander.pos.x, z: game.commander.pos.z } : place('palace:commander'),
    progress: () => `Командир в ${Math.round(playerDist(o.poi()))} м — подойдите и нажмите E`,
    update() {},
  };
  return o;
}

function newOrder(viaCommander = false) {
  if (S.deserter) return;
  const pool = ['post', 'post', 'patrol', 'spy'];
  if (S.rankIdx >= 1 || S.ordersDone >= 2) pool.push('raid');
  if (S.rankIdx >= 2) pool.push('raid', 'spy');
  let t = pick(pool);
  if (G.lastType === t && Math.random() < 0.7) t = pick(pool);
  G.lastType = t;
  const o = { post: orderPost, patrol: orderPatrol, spy: orderSpy, raid: orderRaid }[t]();
  giveOrder(o, viaCommander);
}

// debug/tests: issue a specific order now ('post'|'patrol'|'spy'|'raid')
export function forceOrder(type) {
  if (G.order) { G.order.cleanup?.(); G.order = null; }
  S.tutorialDone = true;
  giveOrder({ post: orderPost, patrol: orderPatrol, spy: orderSpy, raid: orderRaid }[type](), true);
  return G.order;
}

// ---------- commander dialog ----------
function talkCommander() {
  const c = game.commander;
  if (!c?.alive) return;
  if (S.deserter) { shout(c, 'Дезертир! Взять его!', { kind: 'bad' }); c.grudges.add(game.player); return; }
  const o = G.order;
  if (o?.type === 'report') {
    S.tutorialDone = true;
    G.order = null;
    game.journal.complete('order:' + o.id);
    game.addGold(5, 'salary');
    newOrder(true);
    return;
  }
  const next = RANKS[S.rankIdx + 1];
  const rows = `<p><b>Звание:</b> ${RANKS[S.rankIdx]}${next ? ` (до звания «${next}»: ${Math.max(0, MERIT_FOR[S.rankIdx + 1] - S.merit)} заслуг)` : ' — высшее!'}<br>
    <b>Выполнено приказов:</b> ${S.ordersDone} • <b>выговоров:</b> ${S.reprimands}</p>`;
  const cur = o ? `<p><b>Текущий приказ:</b> ${o.title}<br><i>«${o.speech}»</i>${o.progress ? `<br><small>${o.progress()}</small>` : ''}</p>`
    : '<p>Приказов пока нет. «Отдыхай, но недолго.»</p>';
  const greeting = pick(['Смирно! Докладывай.', 'А, это ты. Ну, что там?', 'Император не любит бездельников.', 'Слушай командира — и будет тебе жалованье.']);
  dialog({
    title: cmdName(), html: `<p><i>«${greeting}»</i></p>${rows}${cur}`,
    buttons: [
      ...(!o ? [{ label: 'Жду приказа!', fn: () => newOrder(true) }] : []),
      ...(o && o.type !== 'defend' ? [{ label: 'Отказаться от приказа (выговор)', fn: () => finishOrder(false, 'Отказ выполнять приказ!') }] : []),
    ],
  });
}

// ---------- system ----------
let unreg = null;
export function startGuard() {
  G.order = null; G.nextOrderT = S.t + 3; G.reprimandCd = 0;
  setRank(S.rankIdx, true);
  game.journal.setObjective('guard:obey', 'Слушаться командира (приказы — у командира во дворце, E)');
  game.journal.setObjective('guard:rank', 'Дослужиться до звания Капитан');
  game.journal.setObjective('guard:villain', 'Убить Злого в его старом форте (горы на севере)');
  giveOrder(orderReport());
  setHud();
}

export function updateGuard(dt) {
  if (!isGuard() || !game.player?.alive) return;
  const o = G.order;
  if (!S.deserter) {
    if (o) o.update?.(dt);
    // raids on the palace override everything
    const r = raids.find(r => r.T.owner === 'guard' && !r.result && r.squad?.state);
    if (r && (!G.order || G.order.type !== 'defend') && !(G.order?.type === 'raid')) {
      if (G.order && G.order.type !== 'report') { G.order.cleanup?.(); game.journal.setObjective('order:' + G.order.id, G.order.title + ' (отменён)', true); G.order = null; }
      if (!G.order) giveOrder(orderDefend(r), false);
    }
    if (!G.order && S.t > G.nextOrderT && S.tutorialDone) newOrder(false);
    // commander killed?
    if (game.commander && !game.commander.alive && !G.cmdDeadNoted) { G.cmdDeadNoted = true; say('Командир погиб! Новый командир скоро прибудет из столицы.', 'bad'); }
    if (game.commander?.alive) G.cmdDeadNoted = false;
  }
  if ((S.t * 2 | 0) !== ((S.t - dt) * 2 | 0)) setHud();
}

export function initGuard() {
  unreg = addInteractable({
    pos: () => game.commander?.pos ?? { x: 1e9, y: 0, z: 1e9 },
    r: 3,
    enabled: () => isGuard() && !!game.commander?.alive && !S.deserter,
    label: () => G.order?.type === 'report' ? `Явиться к командиру (${cmdName()})` : `Говорить: ${cmdName()}`,
    use: talkCommander,
  });
  // discipline: attacking allies, robbing caravans
  game.bus.on('actor:hit', ({ target, attacker }) => {
    if (!isGuard() || S.deserter || attacker !== game.player || !target?.alive) return;
    if (target.faction === 'guard' && !target.grudges.has(game.player)) reprimand('Нападение на своего товарища!');
    else if (target.faction === 'guard') reprimand('Драка со своими!');
    else if (target.faction === 'humans' && !target.caravan && !target.disguisedAs && target.role !== 'caravaneer') { if (Math.random() < 0.5) reprimand('Избиение мирных жителей!'); }
  });
  game.bus.on('actor:death', ({ actor, killer }) => {
    if (!isGuard() || S.deserter || killer !== game.player) return;
    if (actor.faction === 'guard') { G.reprimandCd = 0; reprimand('Убийство товарища!', 60); if (actor.role === 'commander' || actor.role === 'emperor') declareDeserter(); }
  });
  // a spy sneaked into the palace: the commander sends you after him
  game.bus.on('raid:start', ({ attacker, target, attackers }) => {
    if (!isGuard() || S.deserter || attacker !== 'spy' || target !== 'palace' || !attackers?.length) return;
    if (G.order && ['defend', 'raid', 'spy', 'report'].includes(G.order.type)) return;
    if (G.order) { G.order.cleanup?.(); game.journal.setObjective('order:' + G.order.id, G.order.title + ' (отменён)', true); G.order = null; }
    giveOrder(orderSpy('palace', attackers[0]));
  });
  game.bus.on('caravan:robbed', ({ robber }) => {
    if (isGuard() && robber === game.player && !S.deserter) { G.reprimandCd = 0; reprimand('Грабёж корована! Стража не грабит корованы!', 50); }
  });
}
