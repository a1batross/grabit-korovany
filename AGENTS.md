# ГРАБИТЬ КОРОВАНЫ — guide for AI agents working on this repo

We are building Kirill's dream game (read `SPECIFICATION.txt` — it is the legendary "Я джва года хочу такую игру" post).
Every feature in it MUST exist and be fun. Tone: a loving, slightly tongue-in-cheek homage. All in-game text is **Russian**
(feel free to quote Kirill's spelling in jokes/easter eggs: "корованы", "набигают", "джва года").

## Stack
- Three.js (r186) + Vite, plain ES modules, no TypeScript, no other runtime deps. All assets procedural (no image/model files).
- Dev server: `npx vite --port 5173` (one is usually already running at http://localhost:5173 — check with `curl -s localhost:5173 >/dev/null && echo up`).
  If you need your own, use another port.
- Headless smoke test / screenshot: `node tools/shot.mjs <url> <out.png> [script.js]`. The script runs inside the page
  (async function body; `return` a value to print it). Headless rendering is SLOW (~3 fps, swiftshader) so use
  `game.simulate(seconds)` to advance the game deterministically without rendering, then wait ~1.5s for a frame before the screenshot.
  Example script:
  ```js
  await game.startGame({ faction: 'elves' });
  game.player.godMode = true;
  game.simulate(10);
  await new Promise(r => setTimeout(r, 1500));
  return { hp: game.player.hp, actors: game.actors.length };
  ```
  **Do NOT use dynamic `import('/src/...')` in test scripts** — under Vite HMR it can return a *different module instance*
  (e.g. an empty heightmap). Use `game.lib` instead: `game.lib.spawn('guard', x, z)`, `game.lib.terrain.heightAt(x,z)`,
  `game.lib.zones.LOC`, `game.lib.modules` (all feature modules: find yours by `.name`), `game.lib.THREE`, etc. (see main.js).
  Expose your own test hooks on `game.*` from your module if you need them.
  Put screenshots/scratch files in your scratchpad dir, not the repo.
- `npx vite build` must succeed at the end of your work.

## Architecture (read these files before coding)
- `src/core/game.js` — global `game` hub (scene, camera, player, actors, systems, gold via `game.addGold(n, reason)`,
  `game.journal.add(text)` / `game.journal.setObjective(key, text)` / `.complete(key)`, `game.places` named locations,
  `game.uiOpen` (true while a modal UI is open: gameplay pauses and mouse is unlocked), `game.paused`).
- `src/core/bus.js` — event bus `game.bus.on/emit`. Event list is documented at the top of the file. Add new events there in a comment.
- `src/core/input.js` — `input.down(code)`, `input.hit(code)` (pressed this frame), `input.lock()/unlock()`.
- `src/core/rng.js` — random helpers & noise.
- `src/world/zones.js` — 4 zones, key locations `LOC`, `ROADS` polylines (caravan routes). Coordinates: +x east, −z north.
- `src/world/terrain.js` — `heightAt(x,z)`, `groundAt`, `WATER_LEVEL`.
- `src/world/trees.js` — dense forest with billboard→3D LOD. `addTreeExclusion(x,z,r)` MUST be called during `buildWorld()` for
  every building footprint (trees are placed after buildings). `collideTrees`, `treesNear`.
- `src/world/colliders.js` — `addBox(x,z,halfW,halfD,rotY,topY,walkable)`, `addCircle(...)`. Walls/buildings must register
  colliders so actors don't walk through them. Walkable boxes (floors, wall-walks, stairs steps) let actors stand on them.
- `src/world/sky.js` — day/night. `game.ambientLevel`.
- `src/entities/character.js` — procedural humanoid `createBody(kind)`, `LOOKS` presets, limbs detachable, prosthetics, wheelchair.
- `src/entities/weapons.js` — `WEAPONS` table (also used as shop items).
- `src/entities/actor.js` — `Actor`: `faction`, `role`, `hp`, `limbs` {armL,armR,legL,legR,eyeL,eyeR: 'ok'|'lost'|'prosthetic'},
  `bleed` (hp/s; `stopBleeding()`), `fitProsthetic(part)`, `setWheelchair(owned)`, `equipWeapon(id)`, `takeHit`, `sever`, `die`,
  `moveMode` ('walk'|'crawl'|'wheelchair'), `intent` (controllers write this), `gold`, `loot`, `grudges`, `disguisedAs/revealed` (spies).
- `src/entities/ai.js` — `AI` brain; orders: wander / guard / goto / follow / patrol / assault / caravan. `actor.ai.setOrder({...})`.
- `src/entities/spawn.js` — `spawn(presetName, x, z, { order, ...overrides })`, `PRESETS` (elf, elfArcher, elfChief, guard,
  guardArcher, commander, emperor, minion, minionArcher, villain, spy, peasant, merchant, caravaneer, healer).
- `src/entities/player.js` — player controller & camera; `addInteractable({ pos:()=>({x,y,z}), r, label:()=>str, use:()=>{}, enabled?:()=>bool })`
  registers things the player can use with **E** (shops, NPC dialogue, loot, caravans...). Returns an unregister fn.
- `src/systems/combat.js` — melee/arrows, hit-part selection, blocking. `src/systems/effects.js` — blood, severed limbs debris.
- `src/systems/factions.js` — `isHostile(a,b)`, faction ids: `elves`, `guard`, `villain`, `humans`.
- `src/ui/hud.js` — `notify(text, kind)` (or `game.bus.emit('notify',{text,kind})`, kind '' | 'good' | 'bad'),
  `game.hudStatus.set(key, html)` adds lines to the top-left status block, `game.compassPois.set(key,{x,z,label,color})`.
- `src/ui/menu.js` — title/loading/death screens, `HELP_HTML`. `src/ui/style.css` — shared styles (`.panel`, `.btn`, `.screen`, `.parchment`).
- `src/modules.js` — feature-module registry (hooks: `buildWorld`, `init`, `startGame(opts)`, `serialize`, `deserialize`).
  **Do not edit `modules.js`** — it already imports every module stub. If you need more files, import them from your module.

## File ownership (parallel agents — stay in your lane!)
| Agent | Owns (create/modify freely) |
|---|---|
| World builder | `src/world/buildings.js`, `src/world/structures/**` |
| Factions gameplay | `src/systems/population.js`, `src/systems/gameplay.js`, `src/systems/gameplay/**`, `src/ui/command.js` |
| Economy / UI / Save | `src/systems/economy.js`, `src/systems/items.js`, `src/systems/save.js`, `src/ui/screens.js`, `src/ui/screens/**` |
| Audio & atmosphere | `src/systems/audio.js`, `src/systems/ambience/**` |
| Lead (integrator) | everything in `src/core`, `src/entities`, `src/world/{terrain,trees,zones,sky,colliders}.js`, `src/systems/{combat,effects,factions,death}.js`, `src/ui/{hud,menu}.js`, `src/main.js` |

If you NEED a change in a file you don't own, prefer a non-invasive approach (bus events, monkey-patching a method from your
module, or a `game.*` hook). If truly unavoidable, make a minimal, surgical edit with the Edit tool (re-read the file first —
another agent may have changed it), and mention it in your final report. Never rewrite/reformat files you don't own.
Use `git` only to inspect (`git diff`, `git status`); do NOT commit, stash, reset or checkout — the lead commits.

## Conventions
- Keep it performant: merge static geometry (`BufferGeometryUtils.mergeGeometries`) per building/material, use
  `InstancedMesh` for repeated props, `MeshLambertMaterial` (vertex colors welcome), cast/receive shadows only where it matters.
  Total draw calls should stay reasonable (< ~600 at any view).
- Russian UI text. Comments in English.
- Keys already taken: WASD, Shift, Space, LMB, RMB, E (interact), V (camera), X (wheelchair), I/Tab (inventory), M (map),
  J (journal), N (minimap zoom), C (command menu), F5/F9 (quick save/load), Esc (pause). Coordinate via this table if you need others.
- When a modal UI opens: set `game.uiOpen = true` and call `input.unlock()`; on close set `game.uiOpen = false` and `input.lock()`.
  Render modals into `#modal-root`.
- Save/load: the save system serialises the player + calls every module's `serialize()`. Loading = page reload with the
  slot id in `sessionStorage`; after the world is built the game auto-starts `game.startGame({ faction, save })`; every module's
  `startGame(opts)` runs normally (spawning default population), then the save module restores the player and calls each module's
  `deserialize(data)`. So `deserialize` should adjust state set up by `startGame` (rank, orders, roster, killed bosses, etc.).
