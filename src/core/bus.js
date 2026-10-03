// Tiny event bus. Events used across the game (payloads in comments):
//  'actor:hit'        { target, attacker, part, damage, weapon }
//  'actor:dismember'  { actor, part, attacker }   part: 'armL'|'armR'|'legL'|'legR'|'head'|'eyeL'|'eyeR'
//  'actor:death'      { actor, killer, cause }
//  'player:injury'    { part, kind }
//  'caravan:robbed'   { caravan, robber }
//  'raid:start'       { attackers, target }
//  'order:issued'     { order }
//  'notify'           { text, kind }
//  'gold:change'      { amount, total }
//  'save' / 'load'
export class Bus {
  constructor() { this.map = new Map(); }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev).add(fn);
    return () => this.map.get(ev).delete(fn);
  }
  emit(ev, data) {
    const set = this.map.get(ev);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (e) { console.error('bus handler error', ev, e); }
    }
  }
}
