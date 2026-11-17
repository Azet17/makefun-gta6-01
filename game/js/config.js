// Neon Tide — Palmera Bay: tuning, world layout and story data.
// Every number here is the game's own design; change one value and the
// whole feel of the drive changes, so keep this file as the single source.

const CONFIG = {
  // World: one big top-down coastal city, in world pixels.
  worldWidth: 3600,
  worldHeight: 2800,
  // Road grid: avenues run north-south, streets run east-west.
  roadWidth: 56,
  blockWidth: 260,
  blockHeight: 210,
  sidewalk: 14,
  // The western edge is the bay: water, then sand, then the city.
  waterWidth: 220,
  beachWidth: 130,
  // Camera and canvas.
  viewWidth: 1280,
  viewHeight: 720,
  // Player car feel.
  playerAccel: 340,
  playerBrake: 520,
  playerReverse: 170,
  playerMaxSpeed: 430,
  playerMaxReverse: 140,
  playerTurn: 2.9,
  playerGrip: 3.4,
  // Police cars are a touch slower than a clean getaway car.
  policeAccel: 330,
  policeMaxSpeed: 415,
  policeTurn: 2.7,
  // Traffic cars cruise the avenues and streets.
  trafficSpeed: 120,
  trafficTurn: 1.6,
  // On foot.
  walkSpeed: 150,
  // Wanted level: 0 to 5 stars. Heat rises on crime, cools when unseen.
  wantedDecaySeconds: 14,
  bustHoldSeconds: 2.2,
  // Money.
  startCash: 250,
  repairCost: 120,
  // Colours: a sun-soaked coastal palette.
  palette: {
    water: '#1e7fa8',
    waterDeep: '#14648c',
    sand: '#e8d29a',
    sandDark: '#d9c184',
    grass: '#7fb069',
    park: '#6da35c',
    road: '#3a3f4a',
    roadEdge: '#2c3038',
    lane: '#e8d44d',
    sidewalk: '#b8b2a4',
    buildingRoof: '#8a6f5c',
    buildingRoof2: '#5c7a8a',
    buildingRoof3: '#a85c5c',
    buildingRoof4: '#6c8a5c',
    buildingRoof5: '#7a5c8a',
    plaza: '#c9c2b2',
  },
};

// The five districts of Palmera Bay. Each one owns a rectangle of the map
// and a flavour used by the HUD, the minimap legend and mission text.
const DISTRICTS = [
  { name: 'Marina Bay',   x: 350,  y: 0,    w: 620,  h: 1400, color: '#2f8f9d', blurb: 'Yachts, gulls and getaway boats.' },
  { name: 'Coral Heights', x: 970, y: 0,    w: 900,  h: 900,  color: '#c96f4a', blurb: 'Penthouse glass over the bay.' },
  { name: 'Old Town',     x: 970,  y: 900,  w: 900,  h: 1000, color: '#8a6f5c', blurb: 'Brick lanes and old money.' },
  { name: 'Neon Strip',   x: 1870, y: 0,    w: 1730, h: 1400, color: '#b04a8a', blurb: 'Casinos, clubs, all-night neon.' },
  { name: 'Palm Docks',   x: 1870, y: 1400, w: 1730, h: 1400, color: '#5c7a4a', blurb: 'Containers, cranes and quiet deals.' },
];

// The six story beats. Each mission names its goal, its time limit (0 means
// no clock), the wanted level it starts at and the cash it pays.
const MISSION_DEFS = [
  {
    id: 1, title: 'Hot Wire', cash: 400, timeLimit: 0, wanted: 0,
    intro: 'Mara needs wheels. Steal any parked car on the street.',
    objective: 'Steal a parked car (walk up to one and press E)',
    hint: 'Parked cars sit along the kerb. Walk close and press E.',
  },
  {
    id: 2, title: 'Delivery Run', cash: 900, timeLimit: 90, wanted: 1,
    intro: 'The chop shop in Old Town wants the car. Deliver it before the clock dies.',
    objective: 'Deliver the car to the chop shop in Old Town',
    hint: 'Follow the gold marker on the minimap. Mind the traffic.',
  },
  {
    id: 3, title: 'Heat Wave', cash: 1200, timeLimit: 75, wanted: 3,
    intro: 'The Bay Police are on Mara now. Lose them before the timer runs out.',
    objective: 'Lose the police: drop your wanted level to zero',
    hint: 'Break line of sight, then stay out of sight until the heat cools.',
  },
  {
    id: 4, title: 'Roadblock Run', cash: 1600, timeLimit: 120, wanted: 2,
    intro: 'Two roadblocks guard the road to the marina. Smash through or slip around them.',
    objective: 'Pass both roadblocks and reach the marina',
    hint: 'Roadblocks sit on the avenues. A gap at the kerb or a hard ram both work.',
  },
  {
    id: 5, title: 'The Pickup', cash: 2200, timeLimit: 150, wanted: 2,
    intro: 'A package waits at the Palm Docks. Grab it, then take it to the penthouse in Coral Heights.',
    objective: 'Collect the package at the docks, then deliver it uptown',
    hint: 'The package is a glowing crate. Drive it to the gold marker.',
  },
  {
    id: 6, title: 'Neon Tide', cash: 5000, timeLimit: 180, wanted: 4,
    intro: 'The gold supercar sits outside the Neon Strip casino. Take it, then vanish to the beach hideout.',
    objective: 'Steal the gold supercar and escape to the beach hideout',
    hint: 'Four stars means every unit in the city is coming. Drive like it.',
  },
];

// Parked cars the city starts with: a mix of sedans, vans and one gold supercar.
const PARKED_CAR_COLORS = ['#c94f4f', '#4f7ec9', '#e8c84a', '#7ac94f', '#c9c9c9', '#8a5fc9', '#4fc9b8', '#e88a4f'];
const TRAFFIC_CAR_COLORS = ['#d8d8d8', '#5a6b7a', '#b8b8a8', '#7a4a3a', '#3a5a7a', '#c9a84f'];

// Small deterministic RNG so the city and the screenshots are repeatable.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Clamp a number into a range.
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// Distance between two points.
function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

// Angle helpers: wrap an angle to [-PI, PI] and the shortest turn between two.
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

// Format seconds as M:SS for the HUD timer.
function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Keyboard layout. Arrows and WASD both drive; E enters and exits a car,
// Space is the handbrake, H honks, M mutes the audio, P pauses.
const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  enter: ['KeyE'],
  brake: ['Space'],
  horn: ['KeyH'],
  mute: ['KeyM'],
  pause: ['KeyP'],
};

// Save slot in localStorage: story progress, cash and best escape time.
const SAVE_KEY = 'neon-tide-palmera-bay-save-v1';

// Police spawn rules: units arrive off-screen and peel in from the edges.
const POLICE = {
  spawnDistance: 700,
  maxUnits: 6,
  sightRange: 620,
  ramDamage: 6,
  sirenRange: 900,
};

// The minimap in the HUD draws the whole city into a small square.
const MINIMAP_SIZE = 168;
