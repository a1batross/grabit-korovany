// PLACEHOLDER population — to be replaced by the faction gameplay agent.
import { spawn } from '../entities/spawn.js';
import { LOC } from '../world/zones.js';
export const name = 'population';
export function startGame() {
  for (let i = 0; i < 8; i++) spawn('guard', LOC.palace.x + Math.random() * 30 - 15, LOC.palace.z + Math.random() * 30 - 15);
  for (let i = 0; i < 8; i++) spawn(i < 3 ? 'elfArcher' : 'elf', LOC.elfVillage.x + Math.random() * 30 - 15, LOC.elfVillage.z + Math.random() * 30 - 15);
  for (let i = 0; i < 8; i++) spawn('minion', LOC.fort.x + Math.random() * 30 - 15, LOC.fort.z + Math.random() * 30 - 15);
  for (let i = 0; i < 8; i++) spawn('peasant', LOC.town.x + Math.random() * 30 - 15, LOC.town.z + Math.random() * 30 - 15);
}
