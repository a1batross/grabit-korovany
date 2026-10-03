// Shared mutable state of the factions gameplay (serialised by gameplay.js).
import { game } from '../../core/game.js';

export const S = {
  t: 0,                 // gameplay clock (seconds, only advances while the game runs)
  bossDead: { villain: false, emperor: false },
  victory: null,        // key of achieved victory (game continues afterwards)
  // guard career
  rankIdx: 0, merit: 0, reprimands: 0, deserter: false, ordersDone: 0, ordersFailed: 0,
  // elves
  elfRep: 0, tasksDone: 0, raidsSurvived: 0,
  // villain
  armyRecruited: 0, caravansRobbed: 0,
};

export function resetState() {
  Object.assign(S, {
    t: 0, bossDead: { villain: false, emperor: false }, victory: null,
    rankIdx: 0, merit: 0, reprimands: 0, deserter: false, ordersDone: 0, ordersFailed: 0,
    elfRep: 0, tasksDone: 0, raidsSurvived: 0, armyRecruited: 0, caravansRobbed: 0, tutorialDone: false,
  });
}

// game.stats is shared with other modules (economy may add keys too)
export function stats() {
  game.stats = game.stats ?? {};
  const s = game.stats;
  for (const k of ['caravansRobbed', 'raidsRepelled', 'raidsLaunched', 'ordersDone', 'spiesCaught', 'promotions'])
    s[k] = s[k] ?? 0;
  return s;
}
