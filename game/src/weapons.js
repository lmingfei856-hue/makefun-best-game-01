// Weapons: hitscan firing with spread and pierce, tracers, a simple view
// model, reload and switching. Ray tests are analytic (sphere vs AABB), so
// firing never needs the physics engine.
import * as THREE from 'three';
import { WEAPONS, ARENA } from './config.js';
import { COLLIDERS } from './world.js';
import { sfx } from './audio.js';

const tmpDir = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();

/** Ray vs sphere: nearest t in [0, maxT], or Infinity. */
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox; const ly = cy - oy; const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

/** Ray vs axis-aligned box (min/max): nearest t, or Infinity. */
function rayBox(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = 0; let tmax = Infinity;
  const o = [ox, oy, oz]; const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return Infinity;
    } else {
      let t1 = (min[i] - o[i]) / d[i];
      let t2 = (max[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** Ray vs box, exit distance: for a ray starting inside the box, how far to leave it. */
function rayBoxExit(ox, oy, oz, dx, dy, dz, min, max) {
  let tmax = Infinity;
  const o = [ox, oy, oz]; const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return Infinity;
    } else {
      const t1 = (min[i] - o[i]) / d[i];
      const t2 = (max[i] - o[i]) / d[i];
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
  }
  return tmax;
}

/** True when nothing solid stands between two points (for screenshot staging). */
export function hasLineOfSight(ox, oy, oz, tx, ty, tz) {
  const dx = tx - ox; const dy = ty - oy; const dz = tz - oz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.001) return true;
  const nx = dx / len; const ny = dy / len; const nz = dz / len;
  const half = ARENA.size / 2;
  if (rayBoxExit(ox, oy, oz, nx, ny, nz, [-half, 0, -half], [half, ARENA.wallHeight, half]) < len - 0.01) return false;
  for (const c of COLLIDERS) {
    const h = c.hx > 0.75 ? 4 : 2.3;
    const t = rayBox(ox, oy, oz, nx, ny, nz, [c.x - c.hx, 0, c.z - c.hz], [c.x + c.hx, h, c.z + c.hz]);
    if (t < len - 0.01) return false;
  }
  return true;
}

export class WeaponSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.owned = new Set(['pulse']);
    this.current = 'pulse';
    this.ammo = {}; // id -> { mag, reserve }
    for (const id of Object.keys(WEAPONS)) {
      this.ammo[id] = { mag: WEAPONS[id].mag, reserve: Infinity };
    }
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.damageMul = 1;
    this.recoil = 0;
    this.muzzle = new THREE.PointLight(0xffffff, 0, 9, 1.8);
    this.scene.add(this.muzzle);
    // Tracer pool.
    this.tracers = [];
    for (let i = 0; i < 28; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerHead = 0;
    // View model: a chunky neon gun fixed to the camera, kept small so it
    // reads as a weapon and never as a wall.
    this.viewModel = this.buildViewModel();
    this.viewModel.scale.setScalar(0.55);
    this.camera.add(this.viewModel);
    this.viewModel.position.set(0.3, -0.24, -0.5);
  }

  buildViewModel() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3554, roughness: 0.35, metalness: 0.85 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x19e6ff });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.42), bodyMat);
    group.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 10), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.32);
    group.add(barrel);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.3), glowMat);
    strip.position.set(0, 0.055, -0.08);
    group.add(strip);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), glowMat);
    sight.position.set(0, 0.09, -0.18);
    group.add(sight);
    return group;
  }

  get def() { return WEAPONS[this.current]; }

  get state() { return this.ammo[this.current]; }

  /** Back to the starter loadout, keeping the scene objects in place. */
  reset() {
    this.owned = new Set(['pulse']);
    this.current = 'pulse';
    this.ammo = {};
    for (const id of Object.keys(WEAPONS)) {
      this.ammo[id] = { mag: WEAPONS[id].mag, reserve: Infinity };
    }
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.damageMul = 1;
    this.recoil = 0;
    this.muzzle.intensity = 0;
    this.viewModel.children[2].material.color.setHex(WEAPONS.pulse.tracer);
    this.viewModel.children[3].material.color.setHex(WEAPONS.pulse.tracer);
    for (const t of this.tracers) { t.life = 0; t.line.visible = false; }
  }

  switchTo(id) {
    if (!this.owned.has(id) || id === this.current) return false;
    this.current = id;
    this.reloadTimer = 0;
    this.cooldown = 0.25;
    this.viewModel.children[2].material.color.setHex(WEAPONS[id].tracer);
    this.viewModel.children[3].material.color.setHex(WEAPONS[id].tracer);
    return true;
  }

  buy(id) {
    if (this.owned.has(id)) return false;
    this.owned.add(id);
    this.ammo[id] = { mag: WEAPONS[id].mag, reserve: Infinity };
    return true;
  }

  startReload() {
    const def = this.def;
    const st = this.state;
    if (this.reloadTimer > 0 || st.mag >= def.mag) return false;
    this.reloadTimer = def.reload;
    sfx.reload();
    return true;
  }

  update(dt, moving) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.state.mag = this.def.mag;
        this.reloadTimer = 0;
      }
    }
    // Recoil + walk bob on the view model.
    this.recoil = Math.max(0, this.recoil - dt * 0.35);
    const bob = moving ? Math.sin(performance.now() * 0.011) * 0.012 : 0;
    this.viewModel.position.z = -0.5 + this.recoil * 0.35;
    this.viewModel.position.y = -0.24 + bob;
    this.viewModel.rotation.x = this.recoil * 0.9;
    // Muzzle light decay.
    if (this.muzzle.intensity > 0) this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 260);
    // Tracers fade.
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
  }

  canFire() {
    return this.cooldown <= 0 && this.reloadTimer <= 0 && this.state.mag > 0;
  }

  /**
   * Fire one trigger pull from `origin` along `dir`. Returns the list of
   * { drone, damage } hits (already applied by the caller through `onHit`).
   */
  fire(origin, dir, drones, onHit) {
    const def = this.def;
    if (!this.canFire()) return [];
    this.state.mag -= 1;
    this.cooldown = 1 / def.rate;
    this.recoil = 1;
    sfx.shoot(def.sound);
    this.muzzle.position.copy(origin).addScaledVector(dir, 0.6);
    this.muzzle.color.setHex(def.tracer);
    this.muzzle.intensity = 26;

    const hits = [];
    const half = ARENA.size / 2;
    for (let p = 0; p < def.pellets; p++) {
      tmpDir.copy(dir);
      // Spread: perturb the direction in the camera's local plane.
      const sx = (Math.random() - 0.5) * 2 * def.spread;
      const sy = (Math.random() - 0.5) * 2 * def.spread;
      tmpDir.x += sx; tmpDir.y += sy; tmpDir.z += (Math.random() - 0.5) * def.spread;
      tmpDir.normalize();
      tmpOrigin.copy(origin);

      // Nearest wall / crate along the ray.
      let wallT = Infinity;
      // Arena bounds: the ray starts inside, so the wall is the exit distance.
      wallT = Math.min(wallT, rayBoxExit(tmpOrigin.x, tmpOrigin.y, tmpOrigin.z, tmpDir.x, tmpDir.y, tmpDir.z,
        [-half, 0, -half], [half, ARENA.wallHeight, half]));
      for (const c of COLLIDERS) {
        const h = c.hx > 0.75 ? 4 : 2.3; // pillars are tall, crates low
        const t = rayBox(tmpOrigin.x, tmpOrigin.y, tmpOrigin.z, tmpDir.x, tmpDir.y, tmpDir.z,
          [c.x - c.hx, 0, c.z - c.hz], [c.x + c.hx, h, c.z + c.hz]);
        wallT = Math.min(wallT, t);
      }

      // Nearest drone along the ray.
      let best = null; let bestT = wallT;
      for (const d of drones) {
        if (d.dead) continue;
        const m = d.mesh.position;
        const t = raySphere(tmpOrigin.x, tmpOrigin.y, tmpOrigin.z, tmpDir.x, tmpDir.y, tmpDir.z,
          m.x, m.y, m.z, d.def.radius * 1.05);
        if (t < bestT) { bestT = t; best = d; }
      }
      const endT = Math.min(bestT, wallT, 60);
      const end = tmpOrigin.clone().addScaledVector(tmpDir, endT);
      this.spawnTracer(tmpOrigin, end, def.tracer);
      if (best) {
        const dmg = def.damage * this.damageMul;
        hits.push({ drone: best, damage: dmg, point: end });
        if (!def.pierce) continue; // next pellet
        // Pierce: keep going past this drone.
        tmpOrigin.copy(end).addScaledVector(tmpDir, 0.1);
        // Re-run the same pellet from just past the drone.
        // (Implemented by looping the pellet logic once more below.)
        let guard = 0;
        while (guard++ < 3) {
          let wT = Infinity;
          wT = Math.min(wT, rayBoxExit(tmpOrigin.x, tmpOrigin.y, tmpOrigin.z, tmpDir.x, tmpDir.y, tmpDir.z,
            [-half, 0, -half], [half, ARENA.wallHeight, half]));
          let nb = null; let nbT = wT;
          for (const d of drones) {
            if (d.dead || d === best) continue;
            const m = d.mesh.position;
            const t = raySphere(tmpOrigin.x, tmpOrigin.y, tmpOrigin.z, tmpDir.x, tmpDir.y, tmpDir.z,
              m.x, m.y, m.z, d.def.radius * 1.05);
            if (t < nbT) { nbT = t; nb = d; }
          }
          if (!nb) break;
          const e2 = tmpOrigin.clone().addScaledVector(tmpDir, nbT);
          this.spawnTracer(tmpOrigin, e2, def.tracer);
          hits.push({ drone: nb, damage: dmg, point: e2 });
          tmpOrigin.copy(e2).addScaledVector(tmpDir, 0.1);
        }
      } else {
        onHit(null, end); // wall impact spark
      }
    }
    return hits;
  }

  spawnTracer(from, to, color) {
    const t = this.tracers[this.tracerHead];
    this.tracerHead = (this.tracerHead + 1) % this.tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.09;
  }
}
