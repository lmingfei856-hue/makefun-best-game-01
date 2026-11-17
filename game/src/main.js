// NEON BREACH — game core: state machine, player movement, rounds, shop,
// scoring. The systems (render, world, drones, weapons, HUD, input, audio)
// do the work; this file wires them together.
import * as THREE from 'three';
import { ARENA, WEAPONS, ROUNDS, TOTAL_ROUNDS, ROUND_BONUS, SHOP, PLAYER } from './config.js';
import { mulberry32, hashSeed, range } from './random.js';
import { createRenderer, createScene, createCamera, createLights, resize } from './render.js';
import { buildArena, collideCircle } from './world.js';
import { DroneManager } from './drones.js';
import { WeaponSystem } from './weapons.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { sfx, unlockAudio, startHum } from './audio.js';
import { stageShot, autopilotCtl } from './shots.js';

const STEP = 1 / 60;
const SPAWN_INTERVAL = 0.9;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = createRenderer(canvas);
    this.scene = createScene();
    this.camera = createCamera();
    this.scene.add(this.camera);
    createLights(this.scene);
    buildArena(this.scene);
    this.rng = mulberry32(hashSeed('neon-breach:run'));
    this.drones = new DroneManager(this.scene, this.rng);
    this.weapons = new WeaponSystem(this.scene, this.camera);
    this.hud = new HUD();
    this.input = new Input(canvas);
    this.player = this.freshPlayer();
    this.state = 'title'; // title | playing | shop | end
    this.round = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.victory = false;
    this.best = 0;
    try { this.best = Number(localStorage.getItem('neon-breach-best') || 0) || 0; } catch { this.best = 0; }
    this.menuAngle = 0;
    this.elapsed = 0;
    this.last = performance.now();
    this.hud.setBest(this.best > 0 ? `BEST SCORE ${this.best}` : 'FIRST RUN — MAKE IT COUNT');
    this.wireUi();
    window.addEventListener('resize', () => resize(this.renderer, this.camera));
    this.input.onKey = (code) => this.onKey(code);
    this.input.onLockChange = (locked) => { if (!locked && this.state === 'playing') this.pauseToTitle(); };
    resize(this.renderer, this.camera);
  }

  freshPlayer() {
    return {
      x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0,
      hp: PLAYER.hp, armor: 0, credits: 0, kills: 0, score: 0,
      shots: 0, hits: 0, roundsCleared: 0,
    };
  }

  wireUi() {
    document.getElementById('play-btn').addEventListener('click', () => this.deploy());
    document.getElementById('restart-btn').addEventListener('click', () => this.deploy());
    this.hud.buildShop(this, (item) => this.buy(item), () => this.nextRound());
  }

  deploy() {
    unlockAudio();
    startHum();
    this.reset(hashSeed(`neon-breach:run:${Date.now()}`));
    this.state = 'playing';
    this.weapons.viewModel.visible = true;
    this.hud.showScreen('play');
    this.input.requestLock();
    this.startRound(1);
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    this.drones.rng = this.rng;
    this.drones.clear();
    this.weapons.reset();
    this.player = this.freshPlayer();
    this.round = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.victory = false;
    this.menuAngle = 0;
    this.camera.position.set(0, ARENA.eyeHeight, 0);
    this.camera.rotation.set(0, 0, 0);
  }

  pauseToTitle() {
    // Pointer lock lost mid-game (Esc): back to the title screen.
    if (this.state !== 'playing') return;
    this.state = 'title';
    this.hud.showScreen('title');
  }

  startRound(n) {
    this.round = n;
    const spec = ROUNDS[n - 1];
    this.spawnQueue = [];
    for (let i = 0; i < spec.spark; i++) this.spawnQueue.push('spark');
    for (let i = 0; i < spec.stinger; i++) this.spawnQueue.push('stinger');
    for (let i = 0; i < spec.bulwark; i++) this.spawnQueue.push('bulwark');
    // Shuffle with the seeded rng.
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    this.spawnTimer = 0.6;
    this.hud.showBanner(`ROUND ${n}`, n === TOTAL_ROUNDS ? 'FINAL ROUND — HOLD THE LINE' : `${this.spawnQueue.length} DRONES INBOUND`);
    sfx.roundStart();
  }

  spawnPoint() {
    // A point near the arena edge, at least 8m from the player.
    for (let tries = 0; tries < 12; tries++) {
      const side = Math.floor(this.rng() * 4);
      const along = range(this.rng, -16, 16);
      const edge = 17;
      let x = 0; let z = 0;
      if (side === 0) { x = along; z = -edge; }
      else if (side === 1) { x = along; z = edge; }
      else if (side === 2) { x = -edge; z = along; }
      else { x = edge; z = along; }
      if (Math.hypot(x - this.player.x, z - this.player.z) > 8) return { x, z };
    }
    return { x: 17, z: -17 };
  }

  onKey(code) {
    if (this.state === 'shop') {
      if (code === 'Enter' || code === 'NumpadEnter') { this.nextRound(); return; }
      const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(code);
      if (idx >= 0 && SHOP[idx]) this.buy(SHOP[idx]);
      return;
    }
    if (this.state === 'end') {
      if (code === 'KeyR' || code === 'Enter') this.deploy();
      return;
    }
    if (this.state !== 'playing') return;
    if (code === 'KeyR') this.weapons.startReload();
    const wIdx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (wIdx >= 0) {
      const ids = Object.keys(WEAPONS);
      if (ids[wIdx]) this.weapons.switchTo(ids[wIdx]);
    }
  }

  buy(item) {
    if (this.state !== 'shop') return;
    if (item.kind === 'weapon' && this.weapons.owned.has(item.id)) return;
    if (this.player.credits < item.price) { sfx.denied(); return; }
    this.player.credits -= item.price;
    if (item.kind === 'weapon') {
      this.weapons.buy(item.id);
      this.weapons.switchTo(item.id);
    } else if (item.kind === 'armor') {
      this.player.armor = Math.min(PLAYER.armorMax, this.player.armor + 50);
    } else if (item.kind === 'medkit') {
      this.player.hp = Math.min(PLAYER.hp, this.player.hp + 50);
    } else if (item.kind === 'overclock') {
      this.weapons.damageMul += 0.2;
    }
    sfx.buy();
    this.hud.refreshShop(this);
  }

  nextRound() {
    if (this.state !== 'shop') return;
    this.state = 'playing';
    this.weapons.viewModel.visible = true;
    this.hud.showScreen('play');
    this.input.requestLock();
    this.startRound(this.round + 1);
  }

  onPlayerHit(damage) {
    const p = this.player;
    if (this.state !== 'playing') return;
    const absorbed = Math.min(p.armor, damage * PLAYER.armorAbsorb);
    p.armor -= absorbed;
    p.hp -= (damage - absorbed);
    this.hud.damageFlash();
    sfx.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      this.endRun(false);
    }
  }

  endRun(victory) {
    this.victory = victory;
    this.state = 'end';
    this.input.exitLock();
    const p = this.player;
    const accuracy = p.shots > 0 ? Math.round((p.hits / p.shots) * 100) : 0;
    if (p.score > this.best) {
      this.best = p.score;
      try { localStorage.setItem('neon-breach-best', String(this.best)); } catch { /* ignore */ }
    }
    this.hud.showEnd(victory, {
      rounds: p.roundsCleared, kills: p.kills, score: p.score,
      credits: p.credits, shots: p.shots, accuracy,
    });
    this.hud.showScreen('end');
    if (victory) sfx.victory(); else sfx.defeat();
  }

  /** One fixed step of the game. `ctl` is { axes, look, fire, fireHeld }. */
  step(dt, ctl) {
    this.elapsed += dt;
    if (this.state === 'title') {
      // Slow menu orbit over the arena.
      this.menuAngle += dt * 0.12;
      const r = 13;
      this.camera.position.set(Math.cos(this.menuAngle) * r, 6.5, Math.sin(this.menuAngle) * r);
      this.camera.lookAt(0, 1.2, 0);
      this.drones.update(dt, { x: 999, z: 999 }, () => {}, null);
      this.hud.tick(dt);
      return;
    }
    if (this.state !== 'playing') {
      this.hud.tick(dt);
      return;
    }
    const p = this.player;

    // Look.
    if (ctl.look) {
      p.yaw = ctl.look.yaw;
      p.pitch = ctl.look.pitch;
    } else {
      const m = this.input.consumeMouse();
      p.yaw -= m.dx * 0.0022;
      p.pitch -= m.dy * 0.0022;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
    }
    this.camera.rotation.set(p.pitch, p.yaw, 0);

    // Move.
    const axes = ctl.axes || this.input.axes();
    const sprint = this.input.down('ShiftLeft') || this.input.down('ShiftRight') || ctl.sprint;
    const speed = sprint ? ARENA.sprintSpeed : ARENA.playerSpeed;
    const sin = Math.sin(p.yaw); const cos = Math.cos(p.yaw);
    const wx = (-sin * axes.y + cos * axes.x);
    const wz = (-cos * axes.y - sin * axes.x);
    p.vx += wx * ARENA.accel * dt;
    p.vz += wz * ARENA.accel * dt;
    const damp = Math.exp(-ARENA.friction * dt);
    p.vx *= damp; p.vz *= damp;
    const vlen = Math.hypot(p.vx, p.vz);
    if (vlen > speed) { p.vx = (p.vx / vlen) * speed; p.vz = (p.vz / vlen) * speed; }
    const fixed = collideCircle(p.x + p.vx * dt, p.z + p.vz * dt, ARENA.playerRadius);
    p.x = fixed.x; p.z = fixed.z;
    this.camera.position.set(p.x, ARENA.eyeHeight, p.z);

    // Spawning.
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        const type = this.spawnQueue.shift();
        const pt = this.spawnPoint();
        this.drones.spawn(type, pt.x, pt.z);
      }
    }

    // Firing: semi-auto weapons fire on a fresh press, auto weapons while held.
    const pressed = this.input.consumePressed();
    const held = this.input.mouseDown;
    const def = this.weapons.def;
    let fireNow = false;
    if (ctl.fire !== undefined) fireNow = ctl.fire;
    else fireNow = def.auto ? (held || pressed) : pressed;
    if (fireNow && this.weapons.canFire()) {
      const origin = this.camera.position.clone();
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      p.shots += def.pellets;
      const hits = this.weapons.fire(origin, dir, this.drones.drones, (drone, point) => {
        if (!drone && point) this.drones.burst(point.x, point.y, point.z, 0x8fa8ff, 3, 1.2);
      });
      for (const h of hits) {
        p.hits += 1;
        const result = this.drones.damage(h.drone, h.damage);
        if (result === 'kill') {
          p.kills += 1;
          p.credits += h.drone.def.reward;
          p.score += h.drone.def.score;
          this.hud.addKill(`<b>${h.drone.def.name}</b> down · +${h.drone.def.reward} CR`);
          this.hud.hitmarker(true);
          sfx.kill();
        } else {
          this.hud.hitmarker(false);
          sfx.hit();
        }
      }
    } else if (fireNow && this.weapons.state.mag === 0) {
      this.weapons.startReload();
    }

    this.weapons.update(dt, Math.hypot(p.vx, p.vz) > 0.5);
    this.drones.update(dt, { x: p.x, z: p.z }, (dmg) => this.onPlayerHit(dmg), sfx);

    // Round clear?
    if (this.spawnQueue.length === 0 && this.drones.aliveCount === 0 && this.state === 'playing') {
      p.roundsCleared = this.round;
      const bonus = ROUND_BONUS(this.round);
      p.credits += bonus;
      if (this.round >= TOTAL_ROUNDS) {
        p.score += 1000;
        this.endRun(true);
      } else {
        this.state = 'shop';
        this.input.exitLock();
        this.hud.showBanner(`ROUND ${this.round} CLEAR`, `BONUS +${bonus} CR`);
        sfx.roundClear();
        // Shop backdrop: hide the gun, pull the camera up for a clean view
        // of the arena behind the armory.
        this.weapons.viewModel.visible = false;
        this.camera.position.set(0, 7.5, 13);
        this.camera.lookAt(0, 1, 0);
        this.hud.buildShop(this, (item) => this.buy(item), () => this.nextRound());
        this.hud.showScreen('shop');
      }
    }

    this.hud.update({
      hp: p.hp, armor: p.armor, round: this.round,
      dronesLeft: this.drones.aliveCount + this.spawnQueue.length,
      credits: p.credits, weapon: this.weapons.current,
      ammo: { mag: this.weapons.state.mag, reloading: this.weapons.reloadTimer > 0 },
      locked: this.input.locked,
    });
    this.hud.tick(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) dt = STEP;
    this.step(dt, {});
    this.render();
    requestAnimationFrame(() => this.frame());
  }

  /** Headless self-test: autoplay round 1 and report via document.title. */
  selfTest() {
    const lines = [];
    try {
      this.reset(hashSeed('neon-breach:test'));
      this.state = 'playing';
      this.startRound(1);
      let steps = 0;
      let fired = 0;
      for (steps = 0; steps < 60 * 120 && this.state === 'playing'; steps++) {
        const ctl = autopilotCtl(this);
        if (ctl.fire) fired++;
        this.step(STEP, ctl);
        if (steps % 20 === 0) this.render();
      }
      lines.push(`steps=${steps} state=${this.state} round=${this.round} kills=${this.player.kills} ` +
        `shots=${this.player.shots} hits=${this.player.hits} hp=${Math.round(this.player.hp)} ` +
        `credits=${this.player.credits} fired=${fired} drones=${this.drones.aliveCount}`);
      const pass = this.player.kills >= 1 && this.player.shots > 0 && this.state !== 'end';
      document.title = (pass ? 'TEST PASS ' : 'TEST FAIL ') + lines.join(' | ');
      console.log(document.title);
    } catch (err) {
      document.title = `TEST FAIL exception: ${err.message}`;
      console.error(err);
    }
  }
}

// ---------------------------------------------------------------- boot

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const game = new Game(canvas);

if (params.has('test')) {
  game.selfTest();
} else if (params.has('shot')) {
  const name = params.get('shot') || 'start';
  const seed = Number(params.get('seed') || 7);
  stageShot(name, game, seed);
  game.render();
  document.title = `SHOT ${name}`;
} else {
  game.hud.showScreen('title');
  game.frame();
}
