// The arena: floor grid, neon-trimmed walls, cover crates and pillars, a star
// field overhead. Also the 2D collision the player and projectiles use.
import * as THREE from 'three';
import { ARENA, PALETTE } from './config.js';

// Axis-aligned boxes the player collides with (crates + pillars), in XZ.
export const COLLIDERS = [];

function addCollider(x, z, hx, hz) {
  COLLIDERS.push({ x, z, hx, hz });
}

function neonStrip(material, w, h, x, y, z, ry) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  return mesh;
}

export function buildArena(scene) {
  const half = ARENA.size / 2;
  const group = new THREE.Group();
  group.name = 'arena';

  // Floor: dark slab + glowing grid.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.size, ARENA.size),
    new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.85, metalness: 0.25 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = false;
  group.add(floor);
  const grid = new THREE.GridHelper(ARENA.size, 40, PALETTE.trimCyan, PALETTE.grid);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 1;
  group.add(grid);

  // Centre pad: a magenta ring the player spawns on.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.85, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.trimMagenta, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  // Sky dome: a horizon glow so the upper half of the frame is never dead
  // black. A gradient shader, fog-exempt, far beyond the arena.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x02030a) },
      mid: { value: new THREE.Color(0x0a1030) },
      horizon: { value: new THREE.Color(0x241040) },
    },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h)) : mix(horizon, mid, smoothstep(-0.05, 0.25, h));
        float band = exp(-abs(h - 0.02) * 9.0);
        c += vec3(0.38, 0.08, 0.5) * band * 0.55;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), skyMat);
  group.add(sky);

  // Walls with neon top strips.
  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.7, metalness: 0.4 });
  const cyanMat = new THREE.MeshBasicMaterial({ color: PALETTE.trimCyan });
  const magentaMat = new THREE.MeshBasicMaterial({ color: PALETTE.trimMagenta });
  const wallGeo = new THREE.BoxGeometry(ARENA.size + 1, ARENA.wallHeight, 0.6);
  const walls = [
    { pos: [0, ARENA.wallHeight / 2, -half - 0.3], ry: 0, mat: cyanMat },
    { pos: [0, ARENA.wallHeight / 2, half + 0.3], ry: 0, mat: cyanMat },
    { pos: [-half - 0.3, ARENA.wallHeight / 2, 0], ry: Math.PI / 2, mat: magentaMat },
    { pos: [half + 0.3, ARENA.wallHeight / 2, 0], ry: Math.PI / 2, mat: magentaMat },
  ];
  for (const w of walls) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(...w.pos);
    if (w.ry) wall.rotation.y = w.ry;
    group.add(wall);
    const strip = neonStrip(w.mat, ARENA.size, 0.14, w.pos[0], ARENA.wallHeight - 0.12, w.pos[2], w.ry);
    // Strips on the long walls face inward; rotate the side walls' strips.
    if (w.ry) strip.rotation.y = w.ry + Math.PI / 2;
    group.add(strip);
  }
  // Mid-height neon rails, at eye level on every wall: thin boxes, visible
  // from all sides, so the sightline always has something to catch.
  const rail = (mat, horizontal, at) => {
    const mesh = new THREE.Mesh(
      horizontal ? new THREE.BoxGeometry(ARENA.size, 0.09, 0.09) : new THREE.BoxGeometry(0.09, 0.09, ARENA.size),
      mat,
    );
    mesh.position.set(at[0], 1.15, at[1]);
    group.add(mesh);
  };
  rail(cyanMat, true, [0, -half + 0.15]);
  rail(cyanMat, true, [0, half - 0.15]);
  rail(magentaMat, false, [-half + 0.15, 0]);
  rail(magentaMat, false, [half - 0.15, 0]);

  // Cover: crates (low, hop-over sightlines) and pillars (tall).
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x1c2547, roughness: 0.55, metalness: 0.55 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: PALETTE.crateEdge });
  const crateDefs = [
    { x: -9, z: -7, s: 2.4, h: 1.3 }, { x: 9, z: -7, s: 2.4, h: 1.3 },
    { x: -9, z: 7, s: 2.4, h: 1.3 }, { x: 9, z: 7, s: 2.4, h: 1.3 },
    { x: -12, z: 0, s: 1.8, h: 2.2 }, { x: 12, z: 0, s: 1.8, h: 2.2 },
    { x: 0, z: -12, s: 3.0, h: 1.1 }, { x: 0, z: 12, s: 3.0, h: 1.1 },
  ];
  for (const c of crateDefs) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(c.s, c.h, c.s), crateMat);
    box.position.set(c.x, c.h / 2, c.z);
    group.add(box);
    const top = new THREE.Mesh(new THREE.BoxGeometry(c.s + 0.06, 0.06, c.s + 0.06), edgeMat);
    top.position.set(c.x, c.h + 0.03, c.z);
    group.add(top);
    addCollider(c.x, c.z, c.s / 2 + 0.05, c.s / 2 + 0.05);
  }
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x252e57, roughness: 0.5, metalness: 0.6, emissive: 0x0c1030, emissiveIntensity: 0.6 });
  const pillarDefs = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: -5, z: 5 }, { x: 5, z: 5 }];
  for (const p of pillarDefs) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, ARENA.wallHeight, 10), pillarMat);
    pillar.position.set(p.x, ARENA.wallHeight / 2, p.z);
    group.add(pillar);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 24), magentaMat);
    band.rotation.x = Math.PI / 2;
    band.position.set(p.x, 2.6, p.z);
    group.add(band);
    addCollider(p.x, p.z, 0.75, 0.75);
  }

  // Stars overhead.
  const starCount = 420;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 45 + Math.random() * 30;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = 14 + Math.random() * 26;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.35, sizeAttenuation: true }));
  group.add(stars);

  scene.add(group);
  return group;
}

/** Push a circle (x, z, radius) out of every collider; returns corrected x/z. */
export function collideCircle(x, z, radius) {
  const half = ARENA.size / 2 - radius;
  x = Math.max(-half, Math.min(half, x));
  z = Math.max(-half, Math.min(half, z));
  for (const c of COLLIDERS) {
    const dx = x - c.x; const dz = z - c.z;
    const px = c.hx + radius - Math.abs(dx);
    const pz = c.hz + radius - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) x = c.x + Math.sign(dx || 1) * (c.hx + radius);
      else z = c.z + Math.sign(dz || 1) * (c.hz + radius);
    }
  }
  return { x, z };
}

/** True when a point is inside a collider box (for projectiles). */
export function pointInCollider(x, y, z) {
  for (const c of COLLIDERS) {
    if (Math.abs(x - c.x) < c.hx && Math.abs(z - c.z) < c.hz && y < 2.3) return true;
  }
  return false;
}
