# Specification validation

Validated on 2026-10-04 against `SPECIFICATION.txt` and the current working tree.

**Verdict: substantial feature coverage, but not fully conformant in behavior.** All major explicit features have implementations. Five issues were found in spy attacks, persistence, injury treatment, and raid outcomes. Four were reproduced in the browser; the fifth is supported by source inspection.

## Issues

### 1. High — Spies disappear before reaching the player's base

**Requirement:** Palace guards must defend against spies; spies must sometimes attack the villain.

**Observed:** With the player at the starting position, a fort spy spawned approximately 250 m away and a palace spy approximately 270 m away. After two simulated seconds, both had `removed === true`. The fort spy was also removed from the active spy registry without attacking.

**Cause:** `spawnSpy()` marks spies as transient. Population cleanup deletes transient actors more than 230 m from the player, without exempting active spies. Their approach starts beyond that threshold. Commander-assigned spy missions can avoid this because `orderSpy()` explicitly sets its target's `transient` flag to false; this does not protect ordinary scheduled spy attacks.

**Evidence:** [Spy spawning](src/systems/gameplay/raids.js), lines 173–196; [population cleanup](src/systems/population.js), lines 183–186; [commander spy mission](src/systems/gameplay/guard.js), `orderSpy()`.

**Reproduce:** Start as `villain`, remain at spawn, then run through the existing console/test API:

```js
const spy = game.gameplay.spawnSpy('fort');
game.simulate(2);
console.log(spy.removed); // true
```

Repeat as `guard` with `spawnSpy('palace')`.

**Expected correction:** Preserve active infiltrators while they approach and carry out their mission; distance-based cleanup should not cancel a newly launched spy attack.

### 2. High — Loading loses active missions but retains their unfinished journal entries

**Requirement:** “Сохранятся можно...” combined with the guard's obligation to follow the commander.

**Observed:** Saved a guard game during a patrol and reloaded the entire page through the normal pending-save mechanism. Before saving, `G.order.type` was `patrol`; immediately after loading, `G.order` was null. The journal still contained the unfinished patrol objective (`order:2`). Gold and player health restored correctly in the same test.

**Cause:** Gameplay saves only `orderType` and `taskType`, and deserialization never reads either. Mission parameters, progress, targets, and deadlines are absent. Loading starts default faction behavior; for a guard who has completed the tutorial, deserialization clears the new introductory order and schedules a different order. Elves similarly start with a fresh caravan task instead of restoring their saved task, as established by source inspection.

**Evidence:** [Gameplay persistence](src/systems/gameplay.js), lines 94–132; [guard initialization](src/systems/gameplay/guard.js), `startGuard()`; [elf initialization](src/systems/gameplay/elves.js), `startElves()`; [save restoration](src/systems/save.js), `restore()`.

**Reproduce:** Start as a guard, obtain a patrol (or use `game.gameplay.forceOrder('patrol')`), save, and load that slot through a full page reload. Compare the current order and journal.

**Expected correction:** Restore the active mission and its progress with consistent journal identifiers, targets, and timers.

### 3. High — Loading cancels army attacks and resets ongoing world encounters

**Requirement:** Saving, commanding the villain's troops to attack the palace, and robbing caravans must work together.

**Observed across a full page reload:**

| Before saving | After loading |
| --- | --- |
| All three army groups ordered to `attack:palace` | All three ordered to `defend` |
| One soldier missing an arm, with 31 HP | No soldiers missing arms; units recreated |
| An existing caravan in `robbed` state | Three newly initialized caravans, all in `travel` state |

All restored army members were near the fort. The robbery itself succeeded; the persistence failure concerns the encounter state.

**Cause:** Army persistence stores counts by group and broad unit category, not individual positions, injuries, health, weapons, or squad progress. Deserialization recreates units at the fort and converts attack, retreat, caravan, and hold orders to defense. Active caravans, raids, and spies are not serialized; startup creates new encounters. Loss of active raid/spy state is source-confirmed, rather than separately exercised across reload.

**Evidence:** [Gameplay initialization and persistence](src/systems/gameplay.js), `startGame()`, `serialize()`, and `deserialize()` (particularly lines 97–106 and 134–153); [caravan initialization](src/systems/gameplay/caravans.js), `initialCaravans()`; [population initialization](src/systems/population.js), `startGame()`.

**Reproduce:** Start as the villain, issue a palace attack from the command menu, save, and load. For the injury variant, injure an army member before saving. Rob a caravan before saving to observe encounter replacement.

**Expected correction:** Preserve the active army and encounter state needed to resume play at the saved point, rather than restoring only aggregate progression.

### 4. Medium — Fitting one prosthetic also stops bleeding from an untreated severed limb

**Requirement:** A severed arm or leg must remain a potentially fatal injury unless treated.

**Observed:** Severing both player arms produced 2.2 HP/s bleeding. Fitting only the left-arm prosthesis reduced bleeding to zero, even though the right arm remained lost and untreated.

**Cause:** Player amputations add 1.1 HP/s per arm or 1.4 per leg, while `fitProsthetic()` subtracts the NPC rates of 2.2 or 2.8. A single prosthesis can therefore cancel bleeding from two player amputations. This occurs through the underlying method used by item fitting, not only through a test-only implementation.

**Evidence:** [Actor injuries](src/entities/actor.js), lines 151–153 and 163–168; [prosthetic item fitting](src/systems/items.js), `fitPart()`.

**Reproduce on a fresh player:**

```js
game.player.sever('armL');
game.player.sever('armR');
console.log(game.player.bleed); // 2.2
game.player.fitProsthetic('armL');
console.log(game.player.bleed); // 0; armR remains lost
```

**Expected correction:** Treat only the fitted limb's bleeding contribution, consistently accounting for player/NPC injury rates and prior treatment.

### 5. Medium — An assault timeout is reported as an attacker victory

**Requirement:** Defending the palace/village/fort and participating in raids must have meaningful outcomes.

**Source-confirmed behavior:** A squad ends an assault with `timeout` after its assault timer expires, even when defenders remain. `endRaid()` recognizes only `wiped`, `repelled`, and `lost` as attacker failures; every other result becomes `success`. Thus a timeout can produce a “base ravaged” message and cause a palace-defense order to fail without checking that the attackers defeated the defenders or took the base.

**Evidence:** [Squad outcome checks](src/systems/gameplay/squad.js), lines 79–83; [raid outcome mapping](src/systems/gameplay/raids.js), lines 141–167; [defense mission](src/systems/gameplay/guard.js), `orderDefend()`.

**Reproduction to verify in play:** Keep attackers and defenders alive through the 200-second raid assault limit. Inspect the resulting raid outcome and defense mission. A targeted browser confirmation was attempted, but the local server had stopped; this finding is based on the explicit code path, not a completed runtime reproduction.

**Expected correction:** Give timeout an explicit inconclusive/repelled outcome, or define and check a concrete capture condition before reporting attacker victory.

## Requirement coverage and validation limits

| Specification feature | Validation result |
| --- | --- |
| 3D action; playable elves, palace guard, villain | All three factions started in browser tests; procedural 3D actors and combat implementation reviewed. |
| Forest elves, wooden homes, dense forest | Elf structures and terrain reviewed; generated world contained 28,701 trees across all zones. |
| Distant trees as pictures, nearby trees in 3D | Implemented with billboard shaders and instanced 3D trees around a 78 m threshold; source-reviewed, not exhaustively visually tested. |
| Palace soldiers and villain troops raid elves | Both raid types instantiated successfully; scheduling and raid logic reviewed. Full marches and battles were not played to completion. |
| Caravan robbery | Browser test disabled the escorts, robbed the caravan, and verified `robbed` state and proceeds. Combat difficulty was not assessed by that test. |
| Purchasing and Daggerfall-like possibilities | Prosthesis purchase passed; inventory, selling, haggling, healing, and tavern services exist in source. “и т.п. возможности как в Daggerfall” is too open-ended to certify complete parity or infer a mandatory list of additional features. |
| 3D enemies and corpses | Procedural character implementation reviewed; a bleeding death left its body attached to the 3D scene. |
| Jumping | Simulated Space input produced an airborne player with positive vertical velocity. |
| Guard obedience, defense, offensive raids | Orders, discipline, promotions, and offensive missions implemented; spy, save, and outcome defects above affect this loop. |
| Villain autonomy, troop commands, palace attack | Fifteen starting army members; palace-attack command accepted. Completion of the entire siege was not verified. |
| Spies and elf partisans attack the villain | Scheduling exists; spy approach fails under the tested starting-position conditions. |
| Four zones and map, including neutral humans and mountain fort | Four zone definitions, map rendering, neutral faction relations, mountains, palace, village, and old fort reviewed. |
| Amputation, bleeding, treatment, eye loss | Injury logic reviewed; untreated bleeding killed a test actor. Eye loss produced the half-screen overlay, also inspected in a screenshot. Multi-injury treatment defect above remains. |
| Crawling, wheelchair, prosthetics | Browser checks confirmed `crawl` → `wheelchair` → `walk` as a leg was lost, wheelchair enabled, and prosthesis fitted. |
| Saving | Local-storage save and full-page load worked for basic player data; active gameplay state has the defects above. |

Validation used the repository's `tools/shot.mjs`, existing `game.lib`/`game.gameplay` hooks, and a temporary Playwright reload harness. Tests deliberately forced selected states for reproducibility; they do not establish whole-game balance, long-session stability, or that every feature is fun. No dynamic imports of game modules were used in browser tests.

`npx vite build` **passed**. It emitted a non-fatal warning that `src/modules.js` is imported both statically and dynamically. The completed multi-faction/reload harness recorded no uncaught page errors. Headless software-rendering speed was not treated as a hardware performance defect.

Temporary scripts, screenshots, and detailed reload results are under `/tmp/meme-validation/` for this session. Only this report was added to the repository; game code was not changed, and the pre-existing `package-lock.json` modification was left intact.
