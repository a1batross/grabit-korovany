// Faction relations.
//  elves   - лесные эльфы (партизаны)
//  guard   - охрана дворца + император
//  villain - Злой и его войска (+ его шпионы)
//  humans  - нейтральные люди: крестьяне, купцы, караванщики
export const FACTIONS = {
  elves:   { name: 'Лесные эльфы',   color: '#4fc35a' },
  guard:   { name: 'Охрана дворца',  color: '#e04a3a' },
  villain: { name: 'Войска Злого',   color: '#a066e0' },
  humans:  { name: 'Люди',           color: '#e0c060' },
};

const HOSTILE = {
  elves:   new Set(['guard', 'villain']),
  guard:   new Set(['elves', 'villain']),
  villain: new Set(['elves', 'guard']),
  humans:  new Set([]),
};

export function factionsHostile(fa, fb) {
  return fa !== fb && (HOSTILE[fa]?.has(fb) ?? false);
}

// Apparent faction: spies wear disguises until revealed (by attacking or being caught).
export function apparentFaction(a) { return a.disguisedAs && !a.revealed ? a.disguisedAs : a.faction; }

// Does `a` want to attack `b`? Per-actor grudges override faction relations.
export function isHostile(a, b) {
  if (a === b || !a.alive || !b.alive) return false;
  if (a.grudges.has(b) || b.grudges.has(a)) return true;
  // Player reputation: allies can turn on a traitor/deserter
  if (a.isPlayer && a.outlawFor?.has(b.faction)) return true;
  if (b.isPlayer && b.outlawFor?.has(a.faction)) return true;
  return factionsHostile(a.faction, apparentFaction(b));
}

export function isAlly(a, b) {
  return a.faction === b.faction && !isHostile(a, b);
}
