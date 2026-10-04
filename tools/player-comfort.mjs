// Run against a Vite server: node tools/player-comfort.mjs http://127.0.0.1:5175
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && m.text().includes('bus handler error')) errors.push(m.text()); });
const url = process.argv[2] ?? 'http://127.0.0.1:5175';

async function start(faction) {
  console.log(`Starting ${faction} checks...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('.card', { timeout: 180000 });
  await page.evaluate(async f => {
    window.dispatchEvent(new Event('blur'));
    if (game.uiOpen) throw new Error('The title screen must not open a pause menu');
    await game.startGame({ faction: f });
    game.paused = true; // Drive individual systems deterministically below.
  }, faction);
}

try {
  await start('elves');
  const frozen = await page.evaluate(() => {
    const i = game.lib.input;
    game.player.hp = 70; game.player.bleed = 1;
    i.keys.add('KeyW'); i.buttons.add(0); i.pressed.add('Space'); i.clicked.add(0);
    i.mouseDX = 80; i.mouseDY = 30; i.wheel = 2;
    game.paused = false;
    window.dispatchEvent(new Event('blur'));
    if (!game.uiOpen || game.ui.current() !== 'pause') throw new Error('Focus loss did not pause');
    if (i.keys.size || i.buttons.size || i.pressed.size || i.clicked.size || i.mouseDX || i.mouseDY || i.wheel)
      throw new Error('Stale controls survived focus loss');
    return { hp: game.player.hp, time: game.gameplay.S.t };
  });
  await page.waitForTimeout(1500);
  assert.deepEqual(await page.evaluate(() => ({ hp: game.player.hp, time: game.gameplay.S.t })), frozen);

  await page.evaluate(() => {
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const i = game.lib.input;
    game.ui.close();
    check(!game.uiOpen, 'Explicit resume failed');
    // A repeat from a key held before the pause must not count as a fresh press.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true }));
    check(!i.hit('Space'), 'Held key retriggered a jump after resume');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    check(i.down('KeyW'), 'Fresh movement input stopped working');
    document.dispatchEvent(new Event('pointerlockchange'));
    if (!document.pointerLockElement) check(!i.down('KeyW'), 'Pointer unlock retained movement');
    game.inventory.add('bandage', 1);
    game.ui.inventory();
    check(document.querySelector('[data-f="med"]').classList.contains('on'), 'Bleeding did not select treatment');
    window.dispatchEvent(new Event('blur'));
    check(game.ui.current() === 'inventory', 'Focus loss replaced an existing modal');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    game.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    check(!i.down('KeyW') && !i.buttons.size && !i.wheel, 'Modal controls leaked into gameplay');
    const before = game.inventory.count('bandage');
    document.querySelector('[data-act="use"][data-id="bandage"]').click();
    check(game.player.bleed === 0 && game.inventory.count('bandage') === before - 1, 'Bandaging failed');
    game.ui.close();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      check(game.ui.current() === 'pause', 'Hidden tab did not pause');
    } finally { delete document.hidden; }
    game.ui.close();
    game.paused = true;

    const { E, S } = game.gameplay;
    const chief = [...game.lib.player.interactables].find(o => o.label().includes(game.elfChief.name));
    const clearTask = () => { E.task?.cleanup?.(); E.task = null; };
    clearTask(); S.tasksDone = 3;
    chief.use();
    const dialog = document.querySelector('.gp-modal');
    window.dispatchEvent(new Event('blur'));
    check(dialog.isConnected, 'Focus loss replaced a faction dialogue');
    const hunt = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Выследить'));
    check(hunt, 'Unlocked hunt choice is missing');
    const random = Math.random;
    try {
      Math.random = () => 0.99; // Previously a hunt became a caravan at this value.
      hunt.click();
      check(E.task.type === 'hunt', 'Requested hunt became another mission');
      clearTask(); E.lastType = 'caravan';
      for (let n = 0; n < 8; n++) {
        const previous = E.lastType;
        E.nextTaskT = S.t - 100;
        game.getSystem('gameplay').update(0);
        check(E.task.type !== previous, 'Automatic elf assignment repeated');
        clearTask();
      }
    } finally { Math.random = random; }
    const alive = game.commander.alive;
    game.commander.alive = false;
    chief.use();
    check(![...document.querySelectorAll('.gp-modal button')].some(b => b.textContent.includes('Выследить')), 'Dead commander offered as a hunt');
    document.querySelector('[data-close]').click(); game.commander.alive = alive;
  });
  console.log('PASS: focus, input, treatment, and elf mission checks');

  await start('guard');
  const pacing = await page.evaluate(() => {
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const { G, S, forceOrder } = game.gameplay;
    const mod = game.lib.modules.find(m => m.name === 'gameplay');
    const post = forceOrder('post');
    check(post.save().dur >= 25 && post.save().dur <= 40, 'New sentry shift is too long');
    const data = mod.serialize();
    data.guard.order.p.dur = 85; data.guard.order.p.held = 12;
    mod.deserialize(data);
    check(G.order.save().dur === 85 && G.order.save().held === 12, 'Existing sentry progress changed on load');
    check(G.lastType === 'post', 'Assignment history was lost on load');
    const fresh = forceOrder('post');
    const at = fresh.poi(); game.player.pos.x = at.x; game.player.pos.z = at.z;
    const gold = game.gold, done = S.ordersDone;
    fresh.update(fresh.save().dur);
    check(!G.order && S.ordersDone === done + 1 && game.gold > gold, 'Short shift did not award completion');
    const sequence = [];
    const random = Math.random;
    try {
      Math.random = () => 0; // Worst-case RNG used to repeatedly choose sentry duty.
      for (const rank of [0, 2]) {
        S.rankIdx = rank; S.tutorialDone = true;
        for (let n = 0; n < 12; n++) {
          G.order?.cleanup?.(); G.order = null; G.nextOrderT = S.t - 1;
          const previous = G.lastType;
          game.getSystem('gameplay').update(0);
          check(G.order.type !== previous, 'Automatic guard assignment repeated');
          check(rank < 2 || G.order.type !== 'post', 'Senior guard assigned sentry duty');
          sequence.push(G.order.type);
        }
      }
    } finally { Math.random = random; }
    return { shortShift: fresh.save().dur, restoredShift: 85, sequence };
  });
  assert.deepEqual(errors, []);
  console.log('PASS: focus pause and frozen simulation, input reset, treatment, mission choice, mission variety, and saved post progress', pacing);
} finally {
  await browser.close();
}
