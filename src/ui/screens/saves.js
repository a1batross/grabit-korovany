// Save / Load slot menus.
import { game } from '../../core/game.js';
import { FACTIONS } from '../../systems/factions.js';
import { SLOTS, SLOT_NAMES, slotMeta, saveTo, loadFrom, deleteSlot } from '../../systems/save.js';
import { openModal, rerender, closeModal, esc } from './modal.js';

let mode = 'save', editing = null, confirmDel = null;
const PART_SHORT = { armL: 'л.рука', armR: 'п.рука', legL: 'л.нога', legR: 'п.нога', eyeL: 'л.глаз', eyeR: 'п.глаз' };

export function openSaveUI(m) {
  mode = m; editing = null; confirmDel = null;
  if (mode === 'save' && (!game.started || !game.player?.alive)) { mode = 'load'; }
  openModal('saves', {
    title: mode === 'save' ? 'Сохранить игру<small>«Сохранятся можно...»</small>' : 'Загрузить игру',
    cls: 'kv-saves', render, onAct, onKey,
  });
}

function fmtDate(t) {
  const d = new Date(t);
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

function onAct(act, d) {
  const slot = d.slot;
  if (act === 'edit') { editing = slot; rerender(); const inp = document.querySelector('.kv-saves input[type=text]'); inp?.focus(); inp?.select(); return; }
  if (act === 'write') {
    const inp = document.querySelector('.kv-saves input[type=text]');
    const label = inp?.value?.trim() || `Сохранение ${slot}`;
    saveTo(slot, label).then(ok => { if (ok) closeModal(); });
    return;
  }
  if (act === 'cancel') { editing = null; rerender(); return; }
  if (act === 'load') { loadFrom(slot); return; }
  if (act === 'del') { if (confirmDel === slot) { deleteSlot(slot); confirmDel = null; } else confirmDel = slot; rerender(); return; }
  if (act === 'mode') { openSaveUI(d.m); return; }
  if (act === 'back') { if (game.started && game.player?.alive) game.ui.pause(); else closeModal(); }
}

function onKey(e) {
  if (editing && (e.code === 'Enter' || e.code === 'NumpadEnter')) { onAct('write', { slot: editing }); return true; }
  return false;
}

function render(body) {
  const rows = SLOTS.map(slot => {
    const m = slotMeta(slot);
    const special = SLOT_NAMES[slot];
    const slotLabel = special ? (slot === 'quick' ? 'F5' : 'A') : slot;
    if (mode === 'save' && slot === 'auto') return '';
    if (!m) {
      if (mode === 'load') return `<div class="kv-save empty"><div class="slot">${slotLabel}</div><div><div class="kv-name">— пусто —</div></div><div></div></div>`;
      if (editing === slot) return editRow(slot, slotLabel, defaultName());
      return `<div class="kv-save empty"><div class="slot">${slotLabel}</div><div><div class="kv-name">— пустая ячейка —</div></div>
        <div class="kv-acts"><button class="kv-btn pri" data-act="${slot === 'quick' ? 'write' : 'edit'}" data-slot="${slot}">Сохранить сюда</button></div></div>`;
    }
    if (mode === 'save' && editing === slot) return editRow(slot, slotLabel, m.name);
    const fac = FACTIONS[m.faction];
    const lost = Object.entries(m.limbs ?? {}).filter(([, v]) => v !== 'ok').map(([k, v]) => (v === 'lost' ? '✖' : '⚙') + PART_SHORT[k]).join(' ');
    const info = `<span style="color:${fac?.color};filter:brightness(0.65)">${fac?.name ?? m.faction}</span> · день ${(m.day ?? 0) + 1} · 💰${m.gold ?? 0} · ❤${Math.ceil(m.hp ?? 0)}/${m.maxHp ?? '?'}${lost ? ' · ' + lost : ''}<br>${fmtDate(m.time)}`;
    const btns = mode === 'save'
      ? `<button class="kv-btn pri" data-act="${slot === 'quick' ? 'write' : 'edit'}" data-slot="${slot}">Перезаписать</button>`
      : `<button class="kv-btn pri" data-act="load" data-slot="${slot}">Загрузить</button>`;
    return `<div class="kv-save"><div class="slot">${slotLabel}</div><div><div class="kv-name">${esc(m.name)}</div><div class="info">${info}</div></div>
      <div class="kv-acts">${btns}<button class="kv-btn red" data-act="del" data-slot="${slot}" title="Удалить">${confirmDel === slot ? 'Точно?' : '✕'}</button></div></div>`;
  }).join('');
  const canSave = game.started && game.player?.alive;
  body.innerHTML = `<div class="kv-tabs">
      <button class="kv-tab ${mode === 'save' ? 'on' : ''}" data-act="mode" data-m="save" ${canSave ? '' : 'disabled'}>Сохранить</button>
      <button class="kv-tab ${mode === 'load' ? 'on' : ''}" data-act="mode" data-m="load">Загрузить</button></div>
    <div class="kv-parch">${rows}</div>
    <div class="kv-foot"><span class="kv-keys"><b>F5</b> быстрое сохранение · <b>F9</b> быстрая загрузка · автосохранение каждые 6 игровых часов</span>
      <button class="kv-btn big" data-act="back">Назад</button></div>`;
}

function defaultName() {
  const p = game.player;
  const z = p ? game.lib?.zones?.zoneAt?.(p.pos.x, p.pos.z)?.name : '';
  return `День ${game.day + 1}${z ? ', ' + z : ''}`;
}

function editRow(slot, slotLabel, val) {
  return `<div class="kv-save"><div class="slot">${slotLabel}</div>
    <div><input type="text" maxlength="40" value="${esc(val)}" placeholder="Название сохранения"></div>
    <div class="kv-acts"><button class="kv-btn pri" data-act="write" data-slot="${slot}">Сохранить</button><button class="kv-btn" data-act="cancel">Отмена</button></div></div>`;
}
