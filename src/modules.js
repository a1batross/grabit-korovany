// Feature modules plug into the game here. Each module may export:
//   name                      - string
//   buildWorld()              - (async) create static world content (before trees are placed; register tree exclusions!)
//   init()                    - (async) once after core systems exist; register systems/event handlers
//   startGame(opts)           - (async) when the player picks a faction or loads; opts = { faction, save? }
//   serialize() -> data / deserialize(data)  - save-game support (save system iterates modules by name)
// Order matters: modules are initialised in this order.
import * as buildings from './world/buildings.js';
import * as economy from './systems/economy.js';
import * as population from './systems/population.js';
import * as gameplay from './systems/gameplay.js';
import * as death from './systems/death.js';
import * as screens from './ui/screens.js';
import * as save from './systems/save.js';
import * as audio from './systems/audio.js';

export const MODULES = [buildings, economy, population, gameplay, death, screens, save, audio];
