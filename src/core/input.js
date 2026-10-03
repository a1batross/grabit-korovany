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

  lock() {
    const c = game.renderer?.domElement;
    if (c && !this.locked && !game.uiOpen) c.requestPointerLock?.()?.catch?.(() => {});
  },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },

  init(canvas) {
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F9'].includes(e.code) && game.started) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    canvas.addEventListener('mousedown', e => {
      if (!this.locked && game.started && !game.uiOpen) { this.lock(); return; }
      this.buttons.add(e.button); this.clicked.add(e.button);
    });
    window.addEventListener('mouseup', e => this.buttons.delete(e.button));
    window.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      game.bus.emit('pointerlock', this.locked);
    });
  },
};
