// World builder: all static architecture of the 4 zones (palace, old fort, elf village, town) + roadside props.
// Geometry is merged per 64x64 chunk / material (see structures/kit.js); colliders and tree exclusions are
// registered for every footprint; named locations are published into game.places for gameplay modules.
//
// Published places (game.places): see the report / each structure file. Main keys:
//  palace:gate|throne|commander|barracks|yard|posts, fort:gate|throne|yard|posts|recruit,
//  elves:square|chief|posts|camps, town:square|tavern|houses|church, shop:weapons|general|healer|tavern|elves|fort|palace,
//  westExit, westExit:posts, roadside:inn, roadside:doors, watchtower:empire|villain, bridge:west, farm
import { game } from '../core/game.js';
import { finalizeBatches, nightSystem, mats, fireSpots, debug } from './structures/kit.js';
export { debug };
import { buildPalace } from './structures/palace.js';
import { buildFort } from './structures/fort.js';
import { buildElves } from './structures/elves.js';
import { buildTown } from './structures/town.js';
import { buildRoads } from './structures/roads.js';
import { buildProps } from './structures/props.js';

export const name = 'buildings';

export async function buildWorld() {
  const t0 = performance.now();
  mats();
  const steps = [['palace', buildPalace], ['fort', buildFort], ['elves', buildElves], ['town', buildTown], ['roads', buildRoads], ['props', buildProps]];
  for (const [n, fn] of steps) {
    try { fn(); } catch (e) { console.error('[buildings] failed to build', n, e); }
  }
  finalizeBatches();
  nightSystem();
  // campfire positions (for ambience/audio modules)
  game.places.set('fires', fireSpots.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) })));
  console.log(`[buildings] world built in ${Math.round(performance.now() - t0)} ms`);
}
