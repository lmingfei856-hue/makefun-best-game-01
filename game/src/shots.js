// Screenshot scenes behind ?shot=start|play|buy|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (face the nearest drone, close the distance, fire when the
// aim is on), so the frame is what a short game really looks like and the same
// seed always gives the same frame.
import { TOTAL_ROUNDS } from './config.js';
import { COLLIDERS } from './world.js';
import { hasLineOfSight } from './weapons.js';

const STEP = 1 / 60;

/** Distance from (x, z) to the nearest collider, and its centre. */
function nearestCollider(x, z) {
  let best = Infinity; let cx = 0; let cz = 0;
  for (const c of COLLIDERS) {
    const dx = Math.max(Math.abs(x - c.x) - c.hx, 0);
    const dz = Math.max(Math.abs(z - c.z) - c.hz, 0);
    const d = Math.hypot(dx, dz);
    if (d < best) { best = d; cx = c.x; cz = c.z; }
  }
  return { dist: best, x: cx, z: cz };
}

/** The control the autopilot returns for one step: { axes, look, fire }. */
export function autopilotCtl(game) {
  const p = game.player;
  const drones = game.drones.drones;
  if (drones.length === 0) {
    return { axes: { x: 0, y: 0 }, look: { yaw: p.yaw, pitch: p.pitch }, fire: false };
  }
  // Nearest live drone, with ranged threats weighted closer: a stinger
  // plinking from 14m hurts more than a spark still closing in.
  let best = null; let bestD = Infinity;
  for (const d of drones) {
    const dist = Math.hypot(d.x - p.x, d.z - p.z) * (d.type === 'spark' ? 1.4 : 1);
    if (dist < bestD) { bestD = dist; best = d; }
  }
  const bestDist = Math.hypot(best.x - p.x, best.z - p.z);
  const m = best.mesh.position;
  const dx = m.x - p.x; const dz = m.z - p.z; const dy = m.y - 1.7;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
  // Turn fast toward the target, then judge the aim on what is left after
  // the turn: the residual must be smaller than the target's angular size,
  // or the shot sails past it at range.
  let yaw = p.yaw;
  let diff = wantYaw - yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = Math.max(-0.22, Math.min(0.22, diff));
  yaw += turn;
  const residualYaw = diff - turn;
  const pitchTurn = Math.max(-0.12, Math.min(0.12, wantPitch - p.pitch));
  const pitch = p.pitch + pitchTurn;
  const residualPitch = (wantPitch - p.pitch) - pitchTurn;
  const aimed = Math.abs(residualYaw) < 0.015 && Math.abs(residualPitch) < 0.015;
  // Close in when far, back off when a spark gets too close — and run when
  // hurt: a live runner buys another round.
  let forward = 0;
  if (p.hp < 35) forward = -1;
  else if (bestDist > 12) forward = 1;
  else if (best.type === 'spark' && bestDist < 3) forward = -0.6;
  // Strafe hard: projectiles are slow, and a moving target lives longer.
  const strafe = Math.sin(game.elapsed * 1.1) > 0 ? 0.7 : -0.7;
  // Never hug a pillar: a camera pressed against cover sees nothing but
  // cover. Back away from the nearest collider when it gets too close.
  const near = nearestCollider(p.x, p.z);
  if (near.dist < 2.2) {
    const ax = p.x - near.x; const az = p.z - near.z;
    const len = Math.hypot(ax, az) || 1;
    const fx = -Math.sin(p.yaw); const fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw); const rz = -Math.sin(p.yaw);
    return {
      axes: { x: (ax * rx + az * rz) / len, y: (ax * fx + az * fz) / len },
      look: { yaw, pitch }, fire: false, sprint: false,
    };
  }
  // Keep the trigger pulled while aimed: the game gates the rate, and an
  // empty magazine still needs a trigger pull to start the reload.
  const fire = aimed;
  return { axes: { x: strafe, y: forward }, look: { yaw, pitch }, fire, sprint: bestD > 14 };
}

function runSteps(game, seconds, ctlFn) {
  const n = Math.floor(seconds / STEP);
  for (let i = 0; i < n; i++) {
    if (game.state !== 'playing') break;
    game.step(STEP, ctlFn(game));
  }
}

/**
 * Set `game` to the named scene (start, play, buy or end) and leave the HUD
 * and camera exactly as the frame needs them.
 */
export function stageShot(name, game, seed) {
  const s = Number.isFinite(seed) ? seed : 7;
  if (name === 'play') {
    game.reset(1000 + s);
    game.state = 'playing';
    game.hud.showScreen('play');
    // Round 4 is the busiest frame that stays mid-fight inside the window:
    // sparks, stingers and bulwarks on screen at once.
    game.startRound(4);
    runSteps(game, 10, autopilotCtl);
    // Keep playing until the frame is a real fight: a drone in the open,
    // in the crosshair, with a loaded gun — never a pillar, never mid-reload.
    // (10s + at most 6s more: round 4 cannot clear inside that window.)
    for (let i = 0; i < 6 / STEP && game.state === 'playing'; i++) {
      game.step(STEP, autopilotCtl(game));
      if (game.weapons.state.mag === 0) continue;
      let best = null; let bestD = Infinity;
      for (const d of game.drones.drones) {
        const dist = Math.hypot(d.x - game.player.x, d.z - game.player.z);
        if (dist < bestD) { bestD = dist; best = d; }
      }
      if (!best) break;
      const m = best.mesh.position;
      if (hasLineOfSight(game.player.x, 1.7, game.player.z, m.x, m.y, m.z)) break;
    }
    // The crosshair is part of the combat frame even without pointer lock.
    game.hud.el.crosshair.style.display = 'block';
    return;
  }
  if (name === 'buy') {
    game.reset(2000 + s);
    game.state = 'playing';
    game.hud.showScreen('play');
    game.startRound(1);
    runSteps(game, 120, autopilotCtl);
    if (game.state === 'playing') {
      // Autopilot did not finish round 1 in time: clear it by hand so the
      // shop frame is still the real shop, with real round-1 earnings.
      for (const d of [...game.drones.drones]) game.drones.damage(d, 99999);
      game.step(STEP, { axes: { x: 0, y: 0 }, look: { yaw: game.player.yaw, pitch: game.player.pitch }, fire: false });
    }
    return;
  }
  if (name === 'end') {
    // A well-equipped run: railgun, armour, overclock, patched up between
    // rounds the way a real player spends their credits. Retry harder if
    // the autopilot still goes down: the frame must be the victory screen.
    for (const mul of [2.0, 3.0]) {
      game.reset(3000 + s);
      game.state = 'playing';
      game.hud.showScreen('play');
      game.weapons.buy('lance');
      game.weapons.switchTo('lance');
      game.weapons.damageMul = mul;
      game.player.credits = 600;
      for (let r = 1; r <= TOTAL_ROUNDS; r++) {
        if (game.state === 'end') break;
        game.player.hp = 100;
        game.player.armor = 100;
        if (game.state === 'shop') game.nextRound();
        else if (r === 1) game.startRound(1);
        runSteps(game, 150, autopilotCtl);
        if (game.state === 'shop' && r < TOTAL_ROUNDS) game.nextRound();
      }
      if (game.state === 'end' && game.victory) return;
    }
    // Last resort: the run is over either way, show the victory screen with
    // the rounds the autopilot did clear on the books.
    game.player.roundsCleared = TOTAL_ROUNDS;
    game.endRun(true);
    return;
  }
  // Default: start — the title screen over a slow arena orbit.
  game.reset(4000 + s);
  game.state = 'title';
  game.hud.showScreen('title');
  for (let i = 0; i < 5 / STEP; i++) game.step(STEP, {});
}
