// Tiny modal manager shared by all economy/UI screens. One modal at a time, rendered into #modal-root.
// openModal(id, { title, cls, render(body), onAct(act, dataset, el, event), onKey(e) -> handled?, onClose })
import { game } from '../../core/game.js';
import { input } from '../../core/input.js';
import './screens.css';

let cur = null;

// another module may have replaced #modal-root contents: forget a detached window
function alive() { if (cur && !cur.wrap.isConnected) cur = null; return cur; }
export const currentModal = () => alive()?.id ?? null;
export const modalOpenedAt = () => cur?.opened ?? 0;

export function openModal(id, o) {
  if (alive()) closeModal(true);
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'kv-overlay';
  wrap.innerHTML = `<div class="kv-win ${o.cls ?? ''}">
    <div class="kv-head"><span class="kv-title"></span><button class="kv-x" title="Закрыть (Esc)">✕</button></div>
    <div class="kv-body"></div></div>`;
  root.appendChild(wrap);
  const body = wrap.querySelector('.kv-body');
  cur = { id, wrap, body, ...o, opened: performance.now() };
  setTitle(o.title ?? '');
  wrap.querySelector('.kv-x').addEventListener('click', () => closeModal());
  wrap.addEventListener('mousedown', e => { if (e.target === wrap && o.backdropClose !== false) closeModal(); });
  body.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || !cur || cur.body !== body) return;
    cur.onAct?.(el.dataset.act, el.dataset, el, e);
  });
  body.addEventListener('input', e => { cur?.onInput?.(e); });
  game.uiOpen = true;
  input.unlock();
  rerender();
  game.bus.emit('ui:open', { id });
  return cur;
}

export function setTitle(t) { if (cur) cur.wrap.querySelector('.kv-title').innerHTML = t; }

// Re-render keeping scroll positions of [data-scroll] containers
export function rerender() {
  if (!cur?.render) return;
  const scroll = {};
  cur.body.querySelectorAll('[data-scroll]').forEach(el => { scroll[el.dataset.scroll] = el.scrollTop; });
  cur.render(cur.body);
  cur.body.querySelectorAll('[data-scroll]').forEach(el => { if (scroll[el.dataset.scroll] != null) el.scrollTop = scroll[el.dataset.scroll]; });
}

export function closeModal(noLock = false) {
  if (!cur) return;
  const c = cur;
  cur = null;
  c.wrap.remove();
  c.onClose?.();
  if (noLock) return;
  game.uiOpen = false;
  game.bus.emit('ui:close', { id: c.id });
  if (game.started && game.player?.alive && !document.getElementById('menu-root').children.length) input.lock();
}

// Route a keydown to the open modal; returns true if handled
export function modalKey(e) {
  if (!alive()) return false;
  if (cur.onKey?.(e)) return true;
  // generic list navigation: rows with class kv-row inside the body
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    const rows = [...cur.body.querySelectorAll('.kv-row[data-key]')];
    if (!rows.length) return false;
    let i = rows.findIndex(r => r.classList.contains('sel'));
    i = e.code === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
    rows.forEach(r => r.classList.remove('sel'));
    rows[i].classList.add('sel');
    rows[i].scrollIntoView({ block: 'nearest' });
    cur.selKey = rows[i].dataset.key;
    return true;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    const row = cur.body.querySelector('.kv-row.sel');
    const btn = row?.querySelector('[data-act]:not([disabled])');
    if (btn) { btn.click(); return true; }
  }
  return false;
}

// keep selection highlight after a re-render
export function restoreSel() {
  if (!cur?.selKey) return;
  const row = cur.body.querySelector(`.kv-row[data-key="${CSS.escape(cur.selKey)}"]`);
  row?.classList.add('sel');
}

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
