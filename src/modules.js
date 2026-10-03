// Feature modules plug into the game here. Each module may export:
//   name                      - string
//   buildWorld()              - (async) create static world content (before trees are placed; register tree exclusions!)
//   init()                    - (async) once after core systems exist; register systems/event handlers
//   startGame(opts)           - (async) when the player picks a faction or loads; opts = { faction, save? }
//   serialize() / deserialize(data) - save-game support (save system iterates modules)
import * as buildings from './world/buildings.js';
import * as population from './systems/population.js';
import * as death from './systems/death.js';

export const MODULES = [buildings, population, death];
