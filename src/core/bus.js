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
//  (factions gameplay) 'caravan:spawn' { caravan } · 'raid:end' { raid, result: 'repelled'|'success', playerNear }
//   'order:complete' { order, ok } · 'rank:change' { rank, idx } · 'guard:deserter' {} · 'victory' { key, faction }
//   'npc:shout' { actor, text } · 'spy:revealed' { spy, by } · 'spy:caught' { spy } · 'army:order' { order, groups, members }
//   'army:recruit' { actor, type }
//  (economy/UI/save) 'inventory:change' { id, n } · 'item:used' { id } · 'shop:buy'/'shop:sell' { shop, id, n, price }
//   'shop:haggle' { ok } · 'player:prosthetic' { part, byHealer } · 'player:wheelchair' · 'player:box' · 'player:sleep' { hours }
//   'loot:taken' { actor } · 'stats:kill' { actor } · 'achievement' { id } · 'ui:open'/'ui:close' { id } · 'ui:letter'
//   'save' { slot } · 'load' (save data)
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
