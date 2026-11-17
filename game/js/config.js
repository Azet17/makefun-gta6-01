// Neon Tide — Palmera Bay: shared constants and tuning.
// Every number the rest of the game reads lives here, so a balance
// change is one edit in one place, never a hunt through the code.
'use strict';

const CONFIG = {
  // World: one big top-down coastal city, 3200 x 2400 world units.
  WORLD_W: 3200,
  WORLD_H: 2400,
  TILE: 80,

  // Camera and viewport.
  VIEW_W: 1280,
  VIEW_H: 720,

  // The five districts of Palmera Bay, west to east, north to south.
  DISTRICTS: [
    { name: 'Old Docks',   x: 0,    y: 0,    w: 1100, h: 900,  tint: '#1d3a4d', accent: '#38b6c9', desc: 'Cranes, containers and the smell of diesel.' },
    { name: 'Neon Row',    x: 1100, y: 0,    w: 1000, h: 900,  tint: '#3d1d4d', accent: '#ff2fb3', desc: 'Arcades, clubs and signs that never sleep.' },
    { name: 'Palm Heights',x: 2100, y: 0,    w: 1100, h: 900,  tint: '#14382a', accent: '#4ade80', desc: 'Hillside mansions above the bay.' },
    { name: 'Market Mile', x: 0,    y: 900,  w: 1600, h: 800,  tint: '#4d3a1d', accent: '#ffb02f', desc: 'Stalls, pawn shops and back-alley deals.' },
    { name: 'Sunset Beach',x: 1600, y: 900,  w: 1600, h: 1500, tint: '#0f2a4d', accent: '#2fd4ff', desc: 'Sand, boardwalk and the long pier.' },
  ],

  // Player car tuning.
  PLAYER: {
    accel: 340,        // world units per second squared
    reverseAccel: 200,
    maxSpeed: 520,
    maxReverse: 180,
    turnRate: 3.1,     // radians per second at full lock
    grip: 0.92,        // velocity kept each frame along heading
    health: 100,
    color: '#ff2fb3',
    color2: '#7c3aed',
  },

  // Police tuning: slightly slower top speed than the player, but
  // they spawn ahead of you and cut you off, so they stay dangerous.
  POLICE: {
    accel: 330,
    maxSpeed: 500,
    turnRate: 3.4,
    ramDamage: 8,
    spawnDistance: 700,
    maxActive: 6,
    color: '#e8e8f0',
    stripe: '#2563eb',
    sirenColor: '#ff2233',
  },

  // Traffic cars cruise the roads and obey the grid.
  TRAFFIC: {
    count: 26,
    speed: 130,
    colors: ['#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#e5e7eb', '#8b5cf6', '#14b8a6'],
  },

  // Pedestrians wander the sidewalks.
  PEDS: {
    count: 34,
    speed: 42,
    colors: ['#f472b6', '#facc15', '#a78bfa', '#34d399', '#f87171', '#93c5fd'],
  },

  // Wanted levels: 0 calm, 5 the whole bay is after you.
  WANTED: {
    max: 5,
    decaySeconds: 14,   // seconds out of sight before one star drops
    crimeHeat: { steal: 1, hitPed: 1, hitCop: 2, speeding: 0 },
  },

  // Mission rewards and pacing.
  MISSION_REWARD: [400, 700, 900, 1500, 1200, 3000],
  START_MONEY: 250,

  // Pickups scattered around the city.
  PICKUPS: {
    cash: 14,
    repair: 8,
    cashValue: 150,
    repairValue: 35,
  },

  // Save slot.
  SAVE_KEY: 'neon-tide-palmera-bay-save-v1',

  // Presentation.
  VERSION: '1.0.0',
  FLASH_CRASH: 0.35, // seconds of red flash on a hard crash
};

// The six story missions. Each one is a beat in Mara Voss's week:
// steal, run, deliver, rob, escape, and the finale on the pier.
const MISSIONS = [
  {
    id: 1, name: 'Hot Wheels', kind: 'steal',
    brief: 'Mara needs wheels. Jack the pink coupe parked outside the Neon Row arcade.',
    hint: 'Drive to the pink marker. Press F near the coupe to steal it. Watch the cops.',
    target: { x: 1560, y: 320 }, reward: 400,
  },
  {
    id: 2, name: 'Bay Run', kind: 'getaway',
    brief: 'The arcade job went loud. Outrun the Bay Police and reach the Market Mile safehouse.',
    hint: 'Follow the gold marker. Keep your speed up and break line of sight to lose stars.',
    target: { x: 700, y: 1300 }, reward: 700,
  },
  {
    id: 3, name: 'Sunset Delivery', kind: 'delivery',
    brief: 'A sealed case for the Palm Heights buyer. Deliver it before the timer runs out.',
    hint: 'Reach the gold marker before the clock hits zero. Shortcuts through the beach help.',
    target: { x: 2650, y: 420 }, reward: 900, timeLimit: 75,
  },
  {
    id: 4, name: 'The Tide Heist', kind: 'heist',
    brief: 'The Old Docks vault holds the tide money. Break in, hold the line, then run.',
    hint: 'Reach the vault and stay inside the ring for 12 seconds. Then escape to the beach.',
    target: { x: 520, y: 480 }, reward: 1500, holdSeconds: 12,
  },
  {
    id: 5, name: 'Heat Wave', kind: 'escape',
    brief: 'Five stars. Every cop in Palmera Bay is on Mara. Lose them all.',
    hint: 'Break line of sight and stay hidden until every star fades. The docks hide you best.',
    target: { x: 300, y: 700 }, reward: 1200,
  },
  {
    id: 6, name: 'Neon Tide', kind: 'finale',
    brief: 'The pier at Sunset Beach. One last run, one last boat, and Mara is free of the bay.',
    hint: 'Reach the pier marker with the cops on your tail. Do not stop until you see the boat.',
    target: { x: 2950, y: 2050 }, reward: 3000,
  },
];

// Keys, kept in one place so the help screen and the input code agree.
const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  brake: ['Space'],
  interact: ['KeyF', 'KeyE'],
  horn: ['KeyH'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  restart: ['KeyR'],
};
