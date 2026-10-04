// Keyboard + mouse input with pointer lock.
import { game } from './game.js';

export const input = {
  keys: new Set(),        // currently held KeyboardEvent.code values
  pressed: new Set(),     // codes pressed this frame
  mouseDX: 0, mouseDY: 0,
  buttons: new Set(),     // held mouse buttons (0 left, 2 right)
  clicked: new Set(),     // mouse buttons clicked this frame
  wheel: 0,
  locked: false,

  down(code) { return this.keys.has(code); },
  hit(code) { return this.pressed.has(code); },
  endFrame() { this.pressed.clear(); this.clicked.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; },
  reset() { this.keys.clear(); this.buttons.clear(); this.endFrame(); },

  lock() {
    const c = game.renderer?.domElement;
    if (c && !this.locked && !game.uiOpen) c.requestPointerLock?.()?.catch?.(() => {});
  },
  unlock() { this.reset(); if (document.pointerLockElement) document.exitPointerLock(); },

  init(canvas) {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (game.uiOpen || game.paused || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F9'].includes(e.code) && game.started) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    canvas.addEventListener('mousedown', e => {
      if (game.uiOpen || game.paused) return;
      if (!this.locked && game.started && !game.uiOpen) { this.lock(); return; }
      this.buttons.add(e.button); this.clicked.add(e.button);
    });
    window.addEventListener('mouseup', e => this.buttons.delete(e.button));
    window.addEventListener('mousemove', e => {
      if (!this.locked || game.uiOpen || game.paused) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', e => { if (this.locked && !game.uiOpen && !game.paused) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.reset();
      game.bus.emit('pointerlock', this.locked);
    });
  },
};
