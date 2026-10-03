// Actor = any living (or dead) character: player, soldiers, elves, villagers...
// Controllers (AI / player) write into actor.intent; Actor.update applies physics, injuries and animation.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { createBody } from './character.js';
import { WEAPONS } from './weapons.js';
import { groundAt, heightAt, WATER_LEVEL } from '../world/terrain.js';
import { collideTrees } from '../world/trees.js';
import { collideStatic, floorAt } from '../world/colliders.js';
import { WORLD_HALF } from '../world/zones.js';

let nextId = 1;
export const LIMBS = ['armL', 'armR', 'legL', 'legR', 'eyeL', 'eyeR'];
export const PART_NAMES = {
  head: 'голова', torso: 'туловище', armL: 'левая рука', armR: 'правая рука',
  legL: 'левая нога', legR: 'правая нога', eyeL: 'левый глаз', eyeR: 'правый глаз',
};

export class Actor {
  constructor(o = {}) {
    this.id = nextId++;
    this.kind = o.kind ?? 'peasant';
    this.name = o.name ?? 'Безымянный';
    this.faction = o.faction ?? 'humans';
    this.isPlayer = !!o.isPlayer;
    this.role = o.role ?? 'soldier'; // soldier | archer | civilian | merchant | caravaneer | commander | boss | spy | partisan | emperor | healer
    this.pos = new THREE.Vector3(o.x ?? 0, 0, o.z ?? 0);
    this.pos.y = o.y ?? groundAt(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3();
    this.yaw = o.yaw ?? Math.random() * Math.PI * 2;
    this.radius = 0.4 * (o.scale ?? 1);
    this.onGround = true;
    this.maxHp = o.hp ?? 100;
    this.hp = this.maxHp;
    this.maxStamina = 100; this.stamina = 100;
    this.armor = o.armor ?? 0;             // 0..0.7 damage reduction
    this.alive = true;
    this.deathTime = 0; this.deathCause = null;
    this.gold = o.gold ?? Math.floor(Math.random() * 15);
    this.loot = o.loot ?? [];               // item ids dropped on death
    this.grudges = new Set();
    this.disguisedAs = o.disguisedAs ?? null; this.revealed = false;
    this.limbs = { armL: 'ok', armR: 'ok', legL: 'ok', legR: 'ok', eyeL: 'ok', eyeR: 'ok' };
    this.bleed = 0;                         // hp per second
    this.hasWheelchair = false; this.useWheelchair = true;
    this.speedMul = o.speedMul ?? 1;
    this.intent = { mx: 0, mz: 0, run: false, jump: false, attack: false, block: false, yaw: null };
    this.attackT = -1; this.attackCooldown = 0; this.attackHitDone = false;
    this.blocking = false; this.stagger = 0;
    this.lastHitBy = null; this.lastHitTime = -100;
    this.squad = null;   // squad/army membership (systems/army)
    this.ai = null;      // AI brain
    this.home = o.home ?? { x: this.pos.x, z: this.pos.z };
    this.lod = 0; this.updateAccum = 0;
    this.body = createBody(this.kind, o.look);
    this.body.root.userData.actor = this;
    this.weapon = WEAPONS[o.weapon ?? 'fists'];
    this.shield = !!o.shield;
    this.body.setWeapon(this.weapon);
    this.body.setShield(this.shield);
    this.body.root.position.copy(this.pos);
    this.scale = o.scale ?? 1;
    this.eyeHeight = 1.62 * this.scale;
    game.scene.add(this.body.root);
  }

  get headPos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.currentHeight - 0.15, this.pos.z); }
  get currentHeight() { return (this.moveMode === 'crawl' ? 0.5 : this.moveMode === 'wheelchair' ? 1.3 : 1.8) * this.scale; }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  limbUsable(p) { return this.limbs[p] === 'ok' || this.limbs[p] === 'prosthetic'; }
  get legsOk() { return (this.limbUsable('legL') ? 1 : 0) + (this.limbUsable('legR') ? 1 : 0); }
  get armsOk() { return (this.limbUsable('armL') ? 1 : 0) + (this.limbUsable('armR') ? 1 : 0); }
  get eyesOk() { return (this.limbUsable('eyeL') ? 1 : 0) + (this.limbUsable('eyeR') ? 1 : 0); }
  get moveMode() {
    if (this.legsOk === 2) return 'walk';
    if (this.hasWheelchair && this.useWheelchair) return 'wheelchair';
    return 'crawl';
  }
  get limping() { return this.limbs.legL === 'prosthetic' || this.limbs.legR === 'prosthetic'; }
  get canBlock() { return this.limbUsable('armL') && this.moveMode !== 'crawl'; }
  get canAttack() { return this.armsOk > 0 || this.moveMode === 'walk'; }
  // Effective weapon: lost right arm -> left fist; hook prosthetic -> hook
  get activeWeapon() {
    if (this.limbs.armR === 'ok') return this.weapon;
    if (this.limbs.armR === 'prosthetic') return HOOK;
    if (this.limbs.armL !== 'lost') return WEAPONS.fists;
    return KICK;
  }
  get sightRange() { return this.eyesOk === 0 ? 4 : this.eyesOk === 1 ? 32 : 45; }

  equipWeapon(id) {
    this.weapon = WEAPONS[id] ?? WEAPONS.fists;
    if (this.limbs.armR === 'ok') this.body.setWeapon(this.weapon);
  }

  // ----- damage & injuries -----
  // part: 'head'|'torso'|limb ; opts: { cut, pierce, attacker, weapon, dir(Vector3) }
  takeHit(damage, part, opts = {}) {
    if (!this.alive) return;
    const attacker = opts.attacker;
    if (attacker && attacker !== this) {
      this.lastHitBy = attacker; this.lastHitTime = game.time;
      if (!this.isPlayer) this.grudges.add(attacker);
      if (attacker.disguisedAs) attacker.revealed = true;
    }
    let dmg = damage * (1 - this.armor * (part === 'head' ? 0.7 : 1));
    if (part === 'head') dmg *= 1.6;
    if (part.startsWith('arm') || part.startsWith('leg')) dmg *= 0.75;
    if (this.godMode) dmg = 0;
    this.hp -= dmg;
    this.stagger = 0.25;
    game.bus.emit('actor:hit', { target: this, attacker, part, damage: dmg, weapon: opts.weapon });

    // Dismemberment: Kirill wants arms chopped, eyes gouged and legs severed
    const cutChance = (opts.cut ?? 0) * Math.min(1, dmg / 30) * 0.45 * (game.goreMul ?? 1);
    if ((part.startsWith('arm') || part.startsWith('leg')) && this.limbs[part] !== 'lost' && Math.random() < cutChance) {
      this.sever(part, attacker, opts.dir);
    } else if (part === 'head') {
      const eyeChance = (opts.pierce ?? 0) * 0.25 * (game.goreMul ?? 1);
      const eye = Math.random() < 0.5 ? 'eyeL' : 'eyeR';
      const other = eye === 'eyeL' ? 'eyeR' : 'eyeL';
      const target = this.limbs[eye] === 'ok' ? eye : other;
      if (this.limbs[target] === 'ok' && Math.random() < eyeChance) this.sever(target, attacker, opts.dir);
    }
    if (this.hp <= 0) {
      // Decapitation on a strong cutting killing blow to the head
      if (part === 'head' && (opts.cut ?? 0) > 0.8 && Math.random() < 0.5 * (game.goreMul ?? 1)) this.sever('head', attacker, opts.dir);
      this.die(attacker, part === 'head' ? 'head' : 'wound');
    }
  }

  sever(part, attacker, dir) {
    if (part !== 'head' && this.limbs[part] === 'lost') return;
    if (part === 'head') {
      if (this.headless) return;
      this.headless = true;
    } else {
      const wasProsthetic = this.limbs[part] === 'prosthetic';
      this.limbs[part] = 'lost';
      if (wasProsthetic) {
        // knocking off a prosthetic doesn't bleed
        const obj = this.body.detach(part, game.scene);
        if (part === 'armR') this.body.setWeapon(null);
        if (part.startsWith('leg')) this.body.setWheelchair(this.moveMode === 'wheelchair');
        game.bus.emit('actor:dismember', { actor: this, part, attacker, object: obj, dir, prosthetic: true });
        if (this.isPlayer) game.bus.emit('player:injury', { part, kind: 'prosthetic-lost' });
        return;
      }
    }
    const obj = this.body.detach(part, game.scene);
    if (part.startsWith('arm')) this.bleed += this.isPlayer ? 1.1 : 2.2;
    else if (part.startsWith('leg')) this.bleed += this.isPlayer ? 1.4 : 2.8;
    else if (part.startsWith('eye')) this.bleed += 0.15;
    if (part === 'armR') { this.body.setWeapon(null); }
    if (part === 'armL' && this.shield) this.shield = false;
    if (part.startsWith('leg') && this.moveMode === 'wheelchair') this.body.setWheelchair(true);
    game.bus.emit('actor:dismember', { actor: this, part, attacker, object: obj, dir });
    if (this.isPlayer) game.bus.emit('player:injury', { part, kind: 'lost' });
  }

  stopBleeding() { this.bleed = 0; }

  fitProsthetic(part) {
    if (this.limbs[part] !== 'lost') return false;
    this.limbs[part] = 'prosthetic';
    this.body.addProsthetic(part);
    if (part === 'armR') this.body.setWeapon(null);
    this.bleed = Math.max(0, this.bleed - (part.startsWith('arm') ? 2.2 : part.startsWith('leg') ? 2.8 : 0.15));
    if (this.legsOk === 2) this.body.setWheelchair(false);
    return true;
  }

  setWheelchair(owned) {
    this.hasWheelchair = owned;
    this.body.setWheelchair(owned && this.moveMode === 'wheelchair');
  }

  heal(amount) { if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount); }

  die(killer, cause = 'wound') {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.bleed = 0;
    this.deathTime = game.time; this.deathCause = cause;
    this.attackT = -1; this.blocking = false;
    this.body.setWheelchair(false);
    this.vel.set(0, 0, 0);
    game.bus.emit('actor:death', { actor: this, killer, cause });
  }

  remove() {
    this.removed = true;
    game.scene.remove(this.body.root);
    const i = game.actors.indexOf(this);
    if (i >= 0) game.actors.splice(i, 1);
  }

  // ----- per-frame -----
  update(dt) {
    if (!this.alive) {
      this.body.animate({ dead: true, dt });
      // settle corpse on terrain
      const gy = Math.max(groundAt(this.pos.x, this.pos.z), floorAt(this.pos.x, this.pos.z, this.pos.y + 0.5));
      this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 8);
      this.body.root.position.copy(this.pos);
      return;
    }
    // bleeding (Kirill: если не вылечат — умрёт)
    if (this.bleed > 0) {
      this.hp -= this.bleed * dt;
      this.bleedFx = (this.bleedFx ?? 0) + dt;
      if (this.hp <= 0) { this.die(this.lastHitBy, 'blood'); return; }
    }
    this.attackCooldown -= dt;
    this.stagger = Math.max(0, this.stagger - dt);

    const it = this.intent;
    const mode = this.moveMode;
    // facing
    if (it.yaw != null) this.yaw = it.yaw;
    else if (it.mx || it.mz) {
      const target = Math.atan2(it.mx, it.mz);
      let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 10);
    }
    // speed
    let base = mode === 'crawl' ? 1.1 : mode === 'wheelchair' ? 4.6 : (it.run && this.stamina > 1 ? 7.6 : 3.8);
    if (this.limping && mode === 'walk') base *= 0.82;
    if (this.blocking) base *= 0.5;
    if (this.stagger > 0) base *= 0.4;
    base *= this.speedMul;
    if (this.isPlayer && game.encumbered) base *= 0.7;
    const inWater = heightAt(this.pos.x, this.pos.z) < WATER_LEVEL - 1.0;
    if (inWater) base *= 0.55;
    let mlen = Math.hypot(it.mx, it.mz);
    const mx = mlen > 1 ? it.mx / mlen : it.mx, mz = mlen > 1 ? it.mz / mlen : it.mz;
    mlen = Math.min(1, mlen);
    // stamina
    if (it.run && mlen > 0.1 && mode === 'walk') this.stamina = Math.max(0, this.stamina - dt * 14);
    else this.stamina = Math.min(this.maxStamina, this.stamina + dt * (this.blocking ? 4 : 12));

    const accel = this.onGround ? 14 : 2.5;
    this.vel.x += (mx * base - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (mz * base - this.vel.z) * Math.min(1, accel * dt);
    // jumping (Kirill: "Можно прыгать")
    if (it.jump && this.onGround && mode === 'walk' && this.stamina > 8) {
      this.vel.y = this.limping ? 4.2 : 6.2;
      this.stamina -= 8;
      this.onGround = false;
      if (this.isPlayer) game.bus.emit('player:jump');
    }
    it.jump = false;
    this.vel.y -= 18 * dt;

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    // collisions
    collideTrees(this.pos, this.radius);
    collideStatic(this.pos, this.radius, this.currentHeight);
    const lim = WORLD_HALF - 5;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x)); this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    const ground = Math.max(groundAt(this.pos.x, this.pos.z), floorAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y)));
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -13) {
        const fall = (-this.vel.y - 13) * 9;
        this.takeHit(fall, Math.random() < 0.5 ? 'legL' : 'legR', {});
        if (!this.alive) this.deathCause = 'fall';
      }
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y - ground > 0.3) this.onGround = false;
    else if (this.vel.y <= 0) { this.pos.y = ground; this.vel.y = 0; this.onGround = true; }

    // block
    this.blocking = !!it.block && this.canBlock && this.attackT < 0;
    // attack
    if (it.attack && this.attackT < 0 && this.attackCooldown <= 0 && this.canAttack && this.stagger <= 0 && this.stamina > 5) {
      this.attackT = 0; this.attackHitDone = false;
      this.stamina -= 6;
      game.bus.emit('actor:swing', { actor: this });
    }
    if (!this.isPlayer) it.attack = false;
    if (this.attackT >= 0) {
      const w = this.activeWeapon;
      this.attackT += dt / w.speed;
      if (!this.attackHitDone && this.attackT >= (w.ranged ? 0.75 : 0.55)) {
        this.attackHitDone = true;
        game.combat?.resolveAttack(this, w);
      }
      if (this.attackT >= 1) { this.attackT = -1; this.attackCooldown = 0.1; }
    }

    // render sync
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.body.root.position.copy(this.pos);
    this.body.root.rotation.y = this.yaw;
    if (this.lod < 2) {
      this.body.animate({
        dt, speed, moving: speed > 0.3, attackT: this.attackT, attackStyle: this.activeWeapon.style,
        blocking: this.blocking, mode, airborne: !this.onGround, aimPitch: this.aimPitch ?? 0, limp: this.limping,
      });
    }
  }
}

const HOOK = { id: 'hook', name: 'Крюк-протез', dmg: 13, reach: 1.7, speed: 0.5, cut: 0.4, pierce: 1.5, style: 'thrust', price: 0 };
const KICK = { id: 'kick', name: 'Пинок', dmg: 5, reach: 1.6, speed: 0.6, cut: 0, pierce: 0, style: 'thrust', price: 0 };
