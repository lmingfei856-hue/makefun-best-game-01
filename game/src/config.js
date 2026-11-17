// NEON BREACH — tuning and content tables. One place for every number that
// shapes the game, so balance lives here and the systems stay dumb.
export const ARENA = {
  size: 40, // square arena, metres, centred on the origin
  wallHeight: 4,
  eyeHeight: 1.7,
  playerRadius: 0.45,
  playerSpeed: 6.2,
  sprintSpeed: 9.4,
  accel: 42,
  friction: 9,
};

export const PALETTE = {
  floor: 0x18264f,
  grid: 0x2a7fc4,
  wall: 0x141a38,
  trimCyan: 0x19e6ff,
  trimMagenta: 0xff2bd6,
  trimAmber: 0xffb020,
  crate: 0x131a33,
  crateEdge: 0x2de2ff,
  fog: 0x05070f,
  sky: 0x03040a,
};

export const WEAPONS = {
  pulse: {
    id: 'pulse', name: 'PULSE', price: 0,
    damage: 22, rate: 4.5, mag: 12, reload: 0.9, spread: 0.011,
    pellets: 1, auto: false, tracer: 0x7df9ff, kick: 0.011, sound: 'pulse',
    desc: 'Standard-issue pulse pistol. Reliable, infinite reserve.',
  },
  ripper: {
    id: 'ripper', name: 'RIPPER SMG', price: 400,
    damage: 13, rate: 11, mag: 32, reload: 1.3, spread: 0.03,
    pellets: 1, auto: true, tracer: 0xffe14d, kick: 0.008, sound: 'smg',
    desc: 'Rapid-fire shredder. Chews through drone swarms.',
  },
  scatter: {
    id: 'scatter', name: 'SCATTERGUN', price: 500,
    damage: 9, rate: 1.25, mag: 6, reload: 1.9, spread: 0.075,
    pellets: 8, auto: false, tracer: 0xff9d2e, kick: 0.035, sound: 'shotgun',
    desc: 'Eight pellets per shell. Devastating up close.',
  },
  lance: {
    id: 'lance', name: 'LANCE RAILGUN', price: 900,
    damage: 120, rate: 0.85, mag: 5, reload: 2.1, spread: 0.001,
    pellets: 1, auto: false, pierce: true, tracer: 0xff2bd6, kick: 0.05, sound: 'rail',
    desc: 'Piercing rail spike. One shot, one line of dead drones.',
  },
};

export const DRONES = {
  spark: {
    id: 'spark', name: 'SPARK', hp: 30, speed: 3.6, radius: 0.55,
    hover: 1.25, reward: 40, color: 0xffd23e, core: 0xfff3a0,
    attackRange: 2.6, attackDamage: 8, attackDelay: 1.1, telegraph: 0.45,
    score: 100,
  },
  stinger: {
    id: 'stinger', name: 'STINGER', hp: 65, speed: 2.3, radius: 0.7,
    hover: 1.7, reward: 80, color: 0xff3d71, core: 0xff8fb0,
    attackRange: 16, attackDamage: 10, attackDelay: 2.3, telegraph: 0.65,
    projectileSpeed: 13, score: 200,
  },
  bulwark: {
    id: 'bulwark', name: 'BULWARK', hp: 230, speed: 1.25, radius: 1.05,
    hover: 1.9, reward: 200, color: 0xb46bff, core: 0xe3c8ff,
    attackRange: 18, attackDamage: 12, attackDelay: 3.1, telegraph: 0.8,
    projectileSpeed: 12, burst: 2, score: 500,
  },
};

// Rounds: what spawns, in spawn order. Later rounds mix types and grow.
export const ROUNDS = [
  { spark: 4, stinger: 0, bulwark: 0 },
  { spark: 5, stinger: 2, bulwark: 0 },
  { spark: 6, stinger: 3, bulwark: 1 },
  { spark: 8, stinger: 4, bulwark: 2 },
  { spark: 10, stinger: 5, bulwark: 3 },
];
export const TOTAL_ROUNDS = ROUNDS.length;
export const ROUND_BONUS = (round) => 100 + 50 * round;

export const SHOP = [
  { id: 'ripper', kind: 'weapon', price: 400, label: 'RIPPER SMG', detail: '11/s · 13 dmg · 32 mag' },
  { id: 'scatter', kind: 'weapon', price: 500, label: 'SCATTERGUN', detail: '8 pellets · 9 dmg each' },
  { id: 'lance', kind: 'weapon', price: 900, label: 'LANCE RAILGUN', detail: '120 dmg · pierces drones' },
  { id: 'armor', kind: 'armor', price: 200, label: 'ARMOR PLATE +50', detail: 'Absorbs 60% of damage' },
  { id: 'medkit', kind: 'medkit', price: 150, label: 'MEDKIT +50 HP', detail: 'Patch up before the next round' },
  { id: 'overclock', kind: 'overclock', price: 100, label: 'OVERCLOCK +20% DMG', detail: 'Stacking damage boost, all weapons' },
];

export const PLAYER = {
  hp: 100,
  armorMax: 100,
  armorAbsorb: 0.6,
};
