// Headless screenshot / smoke test. Usage: node tools/shot.mjs [url] [out.png] [script.js]
// The optional script is evaluated in the page after load (can drive the game via window.game).
import { chromium } from 'playwright';
import fs from 'fs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '/tmp/shot.png';
const script = process.argv[4] ? fs.readFileSync(process.argv[4], 'utf8') : null;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); else console.log('[log]', m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.stack));
await page.goto(url);
await page.waitForFunction(() => window.game && window.game.systems.length > 5 && document.querySelector('.card,.screen'), null, { timeout: 180000 }).catch(e => errors.push('timeout waiting for menu'));
if (script) {
  const res = await page.evaluate(`(async () => { ${script} })()`).catch(e => 'script error: ' + e.stack);
  if (res !== undefined) console.log('[script result]', typeof res === 'string' ? res : JSON.stringify(res));
} else await page.waitForTimeout(2000);
await page.screenshot({ path: out });
console.log(errors.slice(0, 30).join('\n'));
await browser.close();
