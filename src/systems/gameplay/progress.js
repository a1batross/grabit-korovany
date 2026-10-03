// Feeds game.hudProgress with bars for things that take real time:
// guard post duty, squads marching to a target, and assault countdowns (attack or hold out).
import { game } from '../../core/game.js';
import { squads } from './squad.js';
import { G } from './guard.js';
import { E } from './elves.js';
import { dist } from './util.js';

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let acc = 0;

function routeFrac(sq) {
  const L = sq.leader ?? sq.members[0];
  const tg = sq.tgt;
  if (!L || !tg) return 0;
  const pts = [...sq.route.map(([x, z]) => ({ x, z })), tg];
  // remaining distance along the route from the leader vs. total route length
  let total = 0, remaining = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  const wp = Math.min(sq.wp, pts.length - 1);
  remaining = dist(L.pos, pts[wp]);
  for (let i = wp + 1; i < pts.length; i++) remaining += dist(pts[i - 1], pts[i]);
  total = Math.max(total, remaining, 1);
  return { frac: 1 - remaining / total, remaining };
}

export function updateProgress(dt) {
  acc += dt;
  if (acc < 0.2) return;
  acc = 0;
  const bars = game.hudProgress;
  bars.clear();
  const p = game.player;
  if (!p?.alive) return;

  // timed orders/tasks (e.g. stand on post for N seconds)
  const o = game.playerFaction === 'guard' ? G.order : game.playerFaction === 'elves' ? E.task : null;
  if (o?.frac) {
    const f = Math.max(0, Math.min(1, o.frac()));
    if (f > 0) bars.set('order', { label: o.title, frac: f, color: '#e8c060', text: o.timeLeft?.() });
  }

  // squads the player cares about: their own faction's, or anything aimed at / near the player
  const list = [];
  for (const sq of squads) {
    if (sq.ended || !sq.members.length) continue;
    const tg = sq.tgt; if (!tg) continue;
    const L = sq.leader ?? sq.members[0];
    const own = sq.faction === game.playerFaction;
    const near = dist(p.pos, tg) < (tg.r ?? 30) + 120 || dist(p.pos, L.pos) < 120;
    if (!own && !near) continue;
    list.push({ sq, own, d: dist(p.pos, L.pos) });
  }
  list.sort((a, b) => a.d - b.d);
  for (const { sq, own } of list.slice(0, 3)) {
    const name = sq.name ?? 'Отряд';
    const n = sq.members.length;
    if (sq.state === 'march') {
      const { frac, remaining } = routeFrac(sq);
      bars.set('sq' + sq.id, {
        label: own ? `${name}: марш к цели (${n})` : `⚔ Набигают: ${name} (${n})`,
        frac, color: own ? '#80b0ff' : '#ff9040', text: `${Math.round(remaining)} м`,
      });
    } else if (sq.state === 'assault') {
      const left = Math.max(0, sq.assaultTime - sq.stateT);
      bars.set('sq' + sq.id, own
        ? { label: `Штурм: ${name} (${n})`, frac: sq.stateT / sq.assaultTime, color: '#ff5040', text: `осталось ${fmt(left)}` }
        : { label: `Оборона! Продержитесь (врагов: ${n})`, frac: sq.stateT / sq.assaultTime, color: '#60d060', text: fmt(left) });
    }
  }
}
