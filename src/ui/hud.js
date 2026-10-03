// In-game HUD: health/stamina, bleeding, body status, gold, zone/time, compass, notifications, eye overlay.
import { game } from '../core/game.js';
import { zoneAt, LOC } from '../world/zones.js';
import { getCurrentInteract, cam } from '../entities/player.js';
import { FACTIONS } from '../systems/factions.js';
import { PART_NAMES } from '../entities/actor.js';

const $ = id => document.getElementById(id);
let hud, els = {};
// Other systems can add lines to the top-left status block: game.hudStatus.set('key', html)
game.hudStatus = new Map();
// Points of interest shown on the compass: game.compassPois.set(key, { x, z, label, color })
game.compassPois = new Map();
// Progress bars for things that take real time: game.hudProgress.set(key, { label, frac 0..1, color?, text? })
game.hudProgress = new Map();

export function notify(text, kind = '') {
  const box = $('notify');
  const d = document.createElement('div');
  d.textContent = text;
  if (kind) d.className = kind;
  box.appendChild(d);
  while (box.children.length > 6) box.firstChild.remove();
  setTimeout(() => d.remove(), 6000);
}

export function initHud() {
  hud = $('hud');
  hud.innerHTML = `
    <div class="damage-vignette" id="vign"></div>
    <div class="faction-badge"><div id="fbadge"></div><div id="qbars"></div></div>
    <div class="topinfo"><div class="zone" id="zone"></div><div class="time" id="time"></div>
      <div class="compass"><div class="strip" id="cstrip"></div><div id="cpois"></div><div class="mark"></div></div></div>
    <div class="body-status" id="bstat"></div>
    <div class="bars">
      <div id="bleed" class="bleeding"></div>
      <div class="bar hp"><i id="hpb"></i><span id="hpt"></span></div>
      <div class="bar st"><i id="stb"></i><span id="stt"></span></div>
    </div>
    <div class="gold" id="gold"></div>`;
  for (const id of ['vign', 'fbadge', 'zone', 'time', 'cstrip', 'cpois', 'bstat', 'bleed', 'hpb', 'hpt', 'stb', 'stt', 'gold', 'qbars']) els[id] = $(id);
  game.bus.on('notify', ({ text, kind }) => notify(text, kind));
  // hit marker
  const ch = $('crosshair');
  game.bus.on('actor:hit', ({ attacker }) => {
    if (attacker !== game.player) return;
    ch.style.color = '#ff3030'; ch.style.transform = 'translate(-50%,-50%) scale(1.6)';
    clearTimeout(ch._t); ch._t = setTimeout(() => { ch.style.color = ''; ch.style.transform = ''; }, 160);
  });
  game.bus.on('block', ({ attacker }) => {
    if (attacker !== game.player) return;
    ch.style.color = '#ffd040'; clearTimeout(ch._t); ch._t = setTimeout(() => { ch.style.color = ''; }, 200);
  });
  game.addSystem({ name: 'hud', order: 200, update: updateHud });
}

let lastZone = null, acc = 0;
const DIRS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];

function updateHud(dt) {
  const p = game.player;
  if (!p || !game.started) return;
  hud.classList.remove('hidden');
  // eye overlay
  const eo = $('eye-overlay');
  const key = `${p.limbUsable('eyeL')}${p.limbUsable('eyeR')}${p.alive}`;
  if (eo.dataset.k !== key) {
    eo.dataset.k = key;
    // eyeL is the character's left eye -> left half of the screen goes dark
    eo.innerHTML = !p.alive ? '' :
      (!p.limbUsable('eyeL') && !p.limbUsable('eyeR')) ? '<div class="full"></div>' :
      (!p.limbUsable('eyeL') ? '<div class="half left"></div>' : '') + (!p.limbUsable('eyeR') ? '<div class="half right"></div>' : '');
  }
  $('crosshair').style.display = p.alive && !game.uiOpen ? '' : 'none';
  const it = getCurrentInteract();
  $('prompt').innerHTML = it && p.alive && !game.uiOpen ? `<b>E</b>${it.label()}` : '';

  els.hpb.style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
  els.hpt.textContent = `Здоровье ${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
  els.stb.style.width = (p.stamina / p.maxStamina * 100) + '%';
  els.stt.textContent = `Выносливость ${Math.ceil(p.stamina)}`;
  els.bleed.textContent = p.bleed > 0 ? `🩸 КРОВОТЕЧЕНИЕ! (−${p.bleed.toFixed(1)}/с) Нужен бинт или лекарь!` : '';
  const hpFrac = p.hp / p.maxHp;
  els.vign.style.boxShadow = `inset 0 0 ${80 + (1 - hpFrac) * 200}px rgba(160,0,0,${Math.max(0, 0.75 - hpFrac) * 1.1})`;

  acc += dt;
  // compass
  const deg = ((-cam.yaw * 180 / Math.PI) % 360 + 360) % 360; // yaw 0 = +z = south
  const heading = (deg + 180) % 360; // 0 = north
  let strip = '';
  for (let k = -1; k <= 2; k++) for (let i = 0; i < 8; i++) strip += `<b>${DIRS[i]}</b>`;
  if (els.cstrip.dataset.init !== '1') { els.cstrip.innerHTML = strip; els.cstrip.dataset.init = '1'; }
  // 8 dirs * 60px = 480px per 360deg
  els.cstrip.style.left = (180 - 30 - 480 - heading / 360 * 480) + 'px';
  let pois = '';
  for (const poi of game.compassPois.values()) {
    const ang = Math.atan2(poi.x - p.pos.x, -(poi.z - p.pos.z)) * 180 / Math.PI; // 0 = north
    let rel = ((ang - heading + 540) % 360) - 180;
    if (Math.abs(rel) > 90) continue;
    pois += `<div class="poi" style="left:${180 + rel / 360 * 480}px;color:${poi.color ?? '#fff'}">${poi.label}</div>`;
  }
  els.cpois.innerHTML = pois;

  if (acc < 0.2) return;
  acc = 0;
  const z = zoneAt(p.pos.x, p.pos.z);
  els.zone.textContent = z.name;
  els.zone.style.color = z.color;
  if (lastZone && lastZone !== z) notify(`Вы вошли: ${z.name}`);
  lastZone = z;
  const h = Math.floor(game.hour), m = Math.floor((game.hour % 1) * 60);
  els.time.textContent = `День ${game.day + 1}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  els.gold.innerHTML = `💰 ${game.gold ?? 0} зол.<small>${p.activeWeapon.name}${p.shield ? ' + щит' : ''}</small>`;

  // body status
  let bs = '';
  for (const part of ['armL', 'armR', 'legL', 'legR', 'eyeL', 'eyeR']) {
    const st = p.limbs[part];
    if (st === 'lost') bs += `<div class="lost">✖ Нет: ${PART_NAMES[part]}</div>`;
    else if (st === 'prosthetic') bs += `<div class="pros">⚙ Протез: ${PART_NAMES[part]}</div>`;
  }
  if (p.moveMode === 'crawl') bs += `<div class="lost">Вы ползёте${p.hasWheelchair ? ' (X — сесть в коляску)' : ' — купите коляску или протез!'}</div>`;
  if (p.moveMode === 'wheelchair') bs += `<div class="pros">♿ Вы катаетесь на коляске (X — слезть)</div>`;
  els.bstat.innerHTML = bs;

  let badge = `<div style="color:${FACTIONS[game.playerFaction]?.color}">⚑ ${FACTIONS[game.playerFaction]?.name ?? ''}${game.rank ? ' — ' + game.rank : ''}</div>`;
  for (const v of game.hudStatus.values()) badge += `<div>${v}</div>`;
  els.fbadge.innerHTML = badge;

  let bars = '';
  for (const b of game.hudProgress.values()) {
    const pct = Math.round(Math.max(0, Math.min(1, b.frac)) * 100);
    bars += `<div class="qbar"><div class="qlabel"><span>${b.label}</span><span>${b.text ?? pct + '%'}</span></div>
      <div class="qtrack"><i style="width:${pct}%;background:${b.color ?? 'var(--gold)'}"></i></div></div>`;
  }
  els.qbars.innerHTML = bars;
}
