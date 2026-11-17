// Neon Tide: Palmera Bay — shared tuning and world constants.
// Every number here is picked for a top-down open-world drive: a city
// big enough to get lost in, cars fast enough to outrun the Bay Police,
// and a wanted system that forgives a quiet cruise but not a crime spree.

// World size in world units (1 unit ~ 1 pixel at zoom 1).
export const WORLD_W = 3600;
export const WORLD_H = 2600;

// The five districts of Palmera Bay. Each one paints the ground a
// different shade, spawns its own flavour of traffic and pedestrians,
// and hosts at least one story mission.
export const DISTRICTS = [
  { id: 'beach',   name: 'Palmera Beach', x: 0,    y: 0,    w: 900,  h: 1300, ground: '#c9a86a', road: '#3a3f4a', accent: '#ff9d5c' },
  { id: 'neon',    name: 'Neon Row',      x: 900,  y: 0,    w: 1200, h: 1300, ground: '#2e2a3d', road: '#23222e', accent: '#ff2e88' },
  { id: 'harbor',  name: 'Harbor Docks',  x: 2100, y: 0,    w: 1500, h: 1300, ground: '#3d3a33', road: '#2b2a26', accent: '#ffb02e' },
  { id: 'oldtown', name: 'Old Town',      x: 0,    y: 1300, w: 1800, h: 1300, ground: '#4a3f35', road: '#33291f', accent: '#7dd87d' },
  { id: 'hills',   name: 'Sunset Hills',  x: 1800, y: 1300, w: 1800, h: 1300, ground: '#54423a', road: '#3a2d28', accent: '#ff5c5c' },
];

// The sea hems the city in on the west edge; the sand runs beside it.
export const SEA = { x: 0, y: 0, w: 130, h: WORLD_H };
export const SAND = { x: 130, y: 0, w: 90, h: WORLD_H };

// Avenue / street centrelines. Roads are 96 units wide.
export const AVENUES = [420, 1020, 1620, 2220, 2820, 3360];
export const STREETS = [340, 840, 1340, 1840, 2340];
export const ROAD_W = 96;

// Driving and walking feel.
export const PLAYER_WALK_SPEED = 210;
export const PLAYER_RUN_SPEED = 320;
export const CAR_ACCEL = 620;
export const CAR_BRAKE = 900;
export const CAR_MAX_SPEED = 560;
export const CAR_REVERSE_SPEED = 200;
export const CAR_TURN = 2.9;
export const CAR_DRAG = 0.55;

// Wanted level: 0 calm .. 5 full Bay Police lockdown.
export const WANTED_MAX = 5;
export const WANTED_DECAY_SECONDS = 26;
export const POLICE_PER_STAR = 2;

// Player state.
export const PLAYER_MAX_HEALTH = 100;
export const START_CASH = 150;
export const SAVE_KEY = 'neon-tide-palmera-bay-save-v1';

// Keyboard bindings (also shown on the start screen).
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  enterCar: ['KeyE'],
  punch: ['Space'],
  horn: ['KeyH'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  save: ['KeyF'],
};

// Small deterministic RNG so the city, traffic and screenshots are
// reproducible from a seed (the ?shot= mode uses seed 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

// Wrap an angle to (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// Pick a random element with the supplied rng.
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Car models the traffic spawns. Each has a colour set, size and top speed.
export const CAR_MODELS = [
  { id: 'sedan',  name: 'Bayside Sedan',  w: 46, h: 22, top: 430, colors: ['#c0392b', '#2e86c1', '#7d8a99', '#e67e22'] },
  { id: 'taxi',   name: 'Palmera Taxi',   w: 46, h: 22, top: 450, colors: ['#f1c40f'] },
  { id: 'sport',  name: 'Neon Comet',     w: 48, h: 21, top: 560, colors: ['#ff2e88', '#00d4ff', '#f5f5f5'] },
  { id: 'truck',  name: 'Dock Hauler',    w: 62, h: 26, top: 330, colors: ['#5d6d7e', '#935116'] },
  { id: 'van',    name: 'Surf Van',       w: 54, h: 24, top: 380, colors: ['#1abc9c', '#af7ac5'] },
  { id: 'police', name: 'Bay Police',     w: 48, h: 22, top: 540, colors: ['#1a1a2e'] },
];

// Pedestrian shirt colours, so the crowds do not all look alike.
export const PED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1', '#1abc9c', '#e67e22'];

// Wanted-level labels shown under the stars.
export const WANTED_LABELS = [
  'Clean — keep it that way',
  'Heat — one patrol is looking',
  'Wanted — patrols are closing in',
  'Hot — roadblocks ahead',
  'Lockdown — the whole Bay is hunting you',
  'Five stars — nowhere is safe',
];

// Screenshot mode (?shot=...) — fixed scenes the maker captures.
export const SHOT_SCENES = ['start', 'drive', 'chase', 'mission'];
