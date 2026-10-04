// UI screens module: hotkeys and modal windows — inventory (I/Tab), map (M), journal (J), pause (Esc),
// quick save/load (F5/F9), achievements. Exposes game.ui = { inventory(), map(), journal(), pause(), close(), current() }.
import { game } from '../core/game.js';
import { input } from '../core/input.js';
import { currentModal, closeModal, modalKey, modalOpenedAt } from './screens/modal.js';
import { toggleInventory } from './screens/inventory.js';
import { toggleMap } from './screens/map.js';
import { toggleJournal } from './screens/journal.js';
import { openPause, openLetter, loadSettings } from './screens/pause.js';
import { initAchievements } from './screens/achievements.js';

export const name = 'screens';

const canPlayUI = () => game.started && game.player && !document.getElementById('menu-root').children.length;

function pauseOnFocusLoss() {
  // Preserve an existing inventory, shop, or dialogue: it already freezes the world.
  if (canPlayUI() && game.player.alive && !game.uiOpen && !game.paused) openPause();
}

function onKeyDown(e) {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
  if (e.code === 'F5' || e.code === 'F9') {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'F5') { if (canPlayUI() && game.player.alive) game.saves?.quickSave(); }
    else game.saves?.quickLoad();
    return;
  }
  const mine = currentModal();
  if (e.code === 'Escape') {
    if (mine) {
      if (performance.now() - modalOpenedAt() < 250) return; // same Esc that opened the pause menu
      if (['help', 'settings'].includes(mine) || (mine === 'saves' && game.started && game.player?.alive)) openPause();
      else closeModal();
      e.preventDefault();
      return;
    }
    if (game.uiOpen) {
      // a modal from another module: close it generically
      const root = document.getElementById('modal-root');
      if (root.children.length) { root.innerHTML = ''; game.uiOpen = false; game.bus.emit('ui:close', { id: 'foreign' }); }
      return;
    }
    if (canPlayUI() && game.player.alive) openPause();
    return;
  }
  if (typing) return;
  if (mine && modalKey(e)) { e.preventDefault(); return; }
  if (!canPlayUI() || !game.player.alive) return;
  if (game.uiOpen && !mine) return; // someone else's window
  const k = e.code;
  if (k === 'KeyI' || k === 'Tab') { e.preventDefault(); if (mine === 'inventory' || !mine || mine !== 'shop') toggleInventory(); return; }
  if (k === 'KeyM') { toggleMap(); return; }
  if (k === 'KeyJ') { toggleJournal(); return; }
}

export function init() {
  loadSettings();
  initAchievements();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', pauseOnFocusLoss);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnFocusLoss(); });
  // browser released pointer lock (Esc while playing) -> pause menu
  game.bus.on('pointerlock', locked => {
    if (locked || game.uiOpen || !canPlayUI() || !game.player.alive) return;
    setTimeout(() => { if (!input.locked && !game.uiOpen && canPlayUI() && game.player.alive && document.hasFocus()) openPause(); }, 60);
  });
  game.bus.on('ui:letter', openLetter);
  game.ui = {
    inventory: () => { if (currentModal() !== 'inventory') toggleInventory(); },
    map: () => { if (currentModal() !== 'map') toggleMap(); },
    journal: tab => toggleJournal(tab ?? 'obj'),
    pause: openPause,
    close: () => closeModal(),
    current: currentModal,
  };
}
