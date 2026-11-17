// Rogue training drones: three types, hover-and-strafe AI, telegraphed attacks,
// projectiles and death explosions. All meshes are primitives + emissive
// materials — no model files.
import * as THREE from 'three';
import { DRONES, ARENA } from './config.js';
import { range } from './random.js';
import { collideCircle, pointInCollider } from './world.js';

const tmpV = new THREE.Vector3();

function makeDroneMesh(def) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: def.color, emissive: def.color, emissiveIntensity: 0.55,
    roughness: 0.35, metalness: 0.7,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x11142a, roughness: 0.5, metalness: 0.6 });
  let body;
  if (def.id === 'spark') {
    body = new THREE.Mesh(new THREE.OctahedronGeometry(def.radius), bodyMat);
  } else if (def.id === 'stinger') {
    body = new THREE.Mesh(new THREE.IcosahedronGeometry(def.radius, 0), bodyMat);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(def.radius * 1.25, 0.06, 8, 28),
      new THREE.MeshBasicMaterial({ color: def.color }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  } else {
    body = new THREE.Mesh(new THREE.DodecahedronGeometry(def.radius, 0), bodyMat);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(def.radius * 1.7, 0.18, def.radius * 1.7), darkMat);
    group.add(plate);
  }
  group.add(body);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(def.radius * 0.42, 12, 12),
    new THREE.MeshBasicMaterial({ color: def.core }),
  );
  core.position.z = def.radius * 0.55;
  group.add(core);
  // Eye: the part that faces the player.
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(def.radius * 0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  eye.position.set(0, 0, def.radius * 0.95);
  group.add(eye);
  group.userData.bodyMat = bodyMat;
  group.userData.core = core;
  return group;
}

export class DroneManager {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.drones = [];
    this.projectiles = [];
    this.bursts = [];
    this.flashLight = new THREE.PointLight(0xffffff, 0, 18, 1.6);
    this.scene.add(this.flashLight);
    // Reusable particle pool: one Points cloud, slots recycled.
    this.particleMax = 600;
    this.pPositions = new Float32Array(this.particleMax * 3);
    this.pColors = new Float32Array(this.particleMax * 3);
    this.pVel = new Float32Array(this.particleMax * 3);
    this.pLife = new Float32Array(this.particleMax);
    this.pHead = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pColors, 3));
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    // Expanding death rings.
    this.rings = [];
  }

  clear() {
    for (const d of this.drones) this.scene.remove(d.mesh);
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.drones = [];
    this.projectiles = [];
    this.rings = [];
    this.pLife.fill(0);
    this.pPositions.fill(0);
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  spawn(typeId, x, z) {
    const def = DRONES[typeId];
    const mesh = makeDroneMesh(def);
    mesh.position.set(x, def.hover, z);
    this.scene.add(mesh);
    const drone = {
      type: typeId, def, mesh,
      hp: def.hp, maxHp: def.hp,
      x, z, y: def.hover,
      bobPhase: this.rng() * Math.PI * 2,
      strafeDir: this.rng() < 0.5 ? -1 : 1,
      strafeTimer: range(this.rng, 1, 3),
      state: 'approach', // approach | telegraph | recover
      stateTimer: 0,
      attackTimer: range(this.rng, 0.5, 1.5),
      flash: 0,
      dead: false,
    };
    this.drones.push(drone);
    return drone;
  }

  spawnRing(x, y, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.07, 8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 0.45, max: 0.45 });
  }

  burst(x, y, z, colorHex, count, speed) {
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.pHead;
      this.pHead = (this.pHead + 1) % this.particleMax;
      this.pPositions[idx * 3] = x;
      this.pPositions[idx * 3 + 1] = y;
      this.pPositions[idx * 3 + 2] = z;
      const a = this.rng() * Math.PI * 2;
      const b = (this.rng() - 0.5) * Math.PI;
      const s = speed * (0.4 + this.rng() * 0.8);
      this.pVel[idx * 3] = Math.cos(a) * Math.cos(b) * s;
      this.pVel[idx * 3 + 1] = Math.sin(b) * s + speed * 0.25;
      this.pVel[idx * 3 + 2] = Math.sin(a) * Math.cos(b) * s;
      this.pColors[idx * 3] = color.r;
      this.pColors[idx * 3 + 1] = color.g;
      this.pColors[idx * 3 + 2] = color.b;
      this.pLife[idx] = 0.5 + this.rng() * 0.5;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
  }

  explode(drone) {
    const { x, y, z } = drone.mesh.position;
    this.burst(x, y, z, drone.def.color, 26, 5);
    this.burst(x, y, z, 0xffffff, 10, 3);
    this.spawnRing(x, y, z, drone.def.color);
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = 90;
    this.flashLight.color.setHex(drone.def.color);
  }

  /** Apply damage; returns 'hit' | 'kill'. */
  damage(drone, amount) {
    drone.hp -= amount;
    drone.flash = 1;
    if (drone.hp <= 0 && !drone.dead) {
      drone.dead = true;
      this.explode(drone);
      this.scene.remove(drone.mesh);
      return 'kill';
    }
    return 'hit';
  }

  fireProjectile(drone, target, count = 1, spread = 0) {
    const from = drone.mesh.position;
    for (let i = 0; i < count; i++) {
      tmpV.copy(target).sub(from).normalize();
      if (spread > 0) {
        tmpV.x += (this.rng() - 0.5) * spread;
        tmpV.y += (this.rng() - 0.5) * spread * 0.5;
        tmpV.z += (this.rng() - 0.5) * spread;
        tmpV.normalize();
      }
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: drone.def.color }),
      );
      mesh.position.copy(from);
      this.scene.add(mesh);
      this.projectiles.push({
        mesh, damage: drone.def.attackDamage,
        vx: tmpV.x * drone.def.projectileSpeed,
        vy: tmpV.y * drone.def.projectileSpeed,
        vz: tmpV.z * drone.def.projectileSpeed,
        life: 3.5,
      });
    }
  }

  update(dt, player, onPlayerHit, sfx) {
    const px = player.x; const pz = player.z;
    const py = ARENA.eyeHeight;
    const half = ARENA.size / 2;

    for (const d of this.drones) {
      if (d.dead) continue;
      const mesh = d.mesh;
      const dx = px - d.x; const dz = pz - d.z;
      const dist = Math.hypot(dx, dz);
      const dirX = dist > 0.001 ? dx / dist : 0;
      const dirZ = dist > 0.001 ? dz / dist : 0;

      d.bobPhase += dt * 2.2;
      d.strafeTimer -= dt;
      if (d.strafeTimer <= 0) {
        d.strafeDir *= -1;
        d.strafeTimer = range(this.rng, 1.2, 2.8);
      }

      if (d.state === 'telegraph') {
        d.stateTimer -= dt;
        // Charge glow: pulse the core.
        const pulse = 0.7 + 0.3 * Math.sin(d.stateTimer * 40);
        mesh.userData.core.scale.setScalar(1 + pulse * 0.6);
        mesh.userData.bodyMat.emissiveIntensity = 1.6;
        if (d.stateTimer <= 0) {
          mesh.userData.core.scale.setScalar(1);
          mesh.userData.bodyMat.emissiveIntensity = 0.55;
          if (d.type === 'spark') {
            if (dist < 3.2) onPlayerHit(d.def.attackDamage);
            if (sfx) sfx.droneShot();
          } else {
            tmpV.set(px, py - 0.15, pz);
            this.fireProjectile(d, tmpV, d.def.burst || 1, d.type === 'bulwark' ? 0.22 : 0.04);
            if (sfx) sfx.droneShot();
          }
          d.state = 'recover';
          d.stateTimer = d.type === 'spark' ? 0.7 : 0.5;
        }
      } else if (d.state === 'recover') {
        d.stateTimer -= dt;
        if (d.stateTimer <= 0) { d.state = 'approach'; d.attackTimer = d.def.attackDelay * (0.8 + this.rng() * 0.5); }
      } else {
        // Approach / hold range, strafing sideways.
        let moveX = 0; let moveZ = 0;
        if (d.type === 'spark') {
          if (dist > d.def.attackRange * 0.8) { moveX = dirX; moveZ = dirZ; }
        } else {
          const want = 11; // preferred range
          if (dist > want + 2) { moveX = dirX; moveZ = dirZ; }
          else if (dist < want - 2) { moveX = -dirX; moveZ = -dirZ; }
          moveX += -dirZ * d.strafeDir * 0.7;
          moveZ += dirX * d.strafeDir * 0.7;
        }
        const len = Math.hypot(moveX, moveZ);
        if (len > 0.01) {
          d.x += (moveX / len) * d.def.speed * dt;
          d.z += (moveZ / len) * d.def.speed * dt;
          const fixed = collideCircle(d.x, d.z, d.def.radius);
          d.x = fixed.x; d.z = fixed.z;
        }
        d.attackTimer -= dt;
        if (d.attackTimer <= 0 && dist <= d.def.attackRange) {
          d.state = 'telegraph';
          d.stateTimer = d.def.telegraph;
          if (sfx) sfx.telegraph();
        }
      }

      // Face the player; hover bob.
      mesh.position.set(d.x, d.def.hover + Math.sin(d.bobPhase) * 0.16, d.z);
      mesh.lookAt(px, mesh.position.y, pz);
      mesh.rotateY(Math.PI); // core faces the player
      if (d.flash > 0) {
        d.flash = Math.max(0, d.flash - dt * 5);
        mesh.userData.bodyMat.emissiveIntensity = 0.55 + d.flash * 2.2;
      }
    }
    this.drones = this.drones.filter((d) => !d.dead);

    // Projectiles.
    for (const p of this.projectiles) {
      p.life -= dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const m = p.mesh.position;
      const hitPlayer = Math.hypot(m.x - px, m.y - py, m.z - pz) < 0.75;
      const out = Math.abs(m.x) > half || Math.abs(m.z) > half || m.y < 0.05 || m.y > ARENA.wallHeight + 2;
      if (hitPlayer) {
        onPlayerHit(p.damage);
        p.life = 0;
        this.burst(m.x, m.y, m.z, 0xff5a5a, 6, 2);
      } else if (out || pointInCollider(m.x, m.y, m.z)) {
        p.life = 0;
        this.burst(m.x, m.y, m.z, 0x8fa8ff, 4, 1.5);
      }
    }
    for (const p of this.projectiles.filter((q) => q.life <= 0)) this.scene.remove(p.mesh);
    this.projectiles = this.projectiles.filter((q) => q.life > 0);

    // Particles.
    let anyAlive = false;
    for (let i = 0; i < this.particleMax; i++) {
      if (this.pLife[i] <= 0) continue;
      anyAlive = true;
      this.pLife[i] -= dt;
      this.pPositions[i * 3] += this.pVel[i * 3] * dt;
      this.pPositions[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPositions[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      this.pVel[i * 3 + 1] -= 3.5 * dt;
      if (this.pLife[i] <= 0) this.pPositions[i * 3 + 1] = -100;
    }
    if (anyAlive) this.particles.geometry.attributes.position.needsUpdate = true;

    // Death rings.
    for (const r of this.rings) {
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(1 + t * 5);
      r.mesh.material.opacity = 0.9 * (1 - t);
    }
    for (const r of this.rings.filter((q) => q.life <= 0)) this.scene.remove(r.mesh);
    this.rings = this.rings.filter((q) => q.life > 0);

    if (this.flashLight.intensity > 0) {
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 320);
    }
  }

  get aliveCount() { return this.drones.length; }
}
