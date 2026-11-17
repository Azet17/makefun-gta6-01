/* Neon Tide — Palmera Bay. World constants, districts, tuning and shared helpers. */
'use strict';

/* Canvas and world size. The world is a 3600x3600 grid city; the camera shows 1280x720 of it. */
const VIEW_W = 1280;
const VIEW_H = 720;
const WORLD = 3600;
const ROAD_GAP = 300;          // distance between road centre lines
const ROAD_W = 64;             // road width
const BLOCK = ROAD_GAP - ROAD_W;

/* Palmera Bay districts — all original names. */
const DISTRICTS = [
  { name: 'Marina del Sol', x0: 0,    y0: 0,    x1: 1800, y1: 900,  tint: '#1c4a6b' },
  { name: 'Downtown',       x0: 1800, y0: 0,    x1: 3600, y1: 1500, tint: '#3a2a5e' },
  { name: 'Old Harbor',     x0: 0,    y0: 900,  x1: 1500, y1: 2100, tint: '#274a2e' },
  { name: 'Coral Heights',  x0: 1500, y0: 1500, x1: 3600, y1: 2700, tint: '#5e3a2a' },
  { name: 'Dockside',       x0: 0,    y0: 2100, x1: 3600, y1: 3600, tint: '#24344f' },
];

/* Street names, invented for this city. */
const STREETS_H = ['Sunset Row', 'Neon Ave', 'Coral St', 'Harbor Blvd', 'Palm Court', 'Tide Way', 'Marina Dr', 'Cactus Ln', 'Solano St', 'Breeze Rd', 'Lagoon St'];
const STREETS_V = ['Ocean View', 'Palm St', 'Flamingo Ave', 'Anchor Rd', 'Vista Blvd', 'Shell St', 'Bayfront', 'Lighthouse Rd', 'Mango St', 'Reef Ave', 'Sailor Ln'];

/* Car models — original, invented names and paint. */
const CAR_MODELS = [
  { name: 'Sunchaser',  color: '#e8b23a', top: 300, accel: 340, grip: 3.2, w: 46, h: 24 },
  { name: 'Comet GT',   color: '#d43a5e', top: 360, accel: 420, grip: 3.6, w: 48, h: 24 },
  { name: 'Tide Runner',color: '#3a9bd4', top: 330, accel: 380, grip: 3.4, w: 47, h: 24 },
  { name: 'Dune Buggy', color: '#7bc23a', top: 280, accel: 360, grip: 3.0, w: 44, h: 24 },
  { name: 'Harbor Van', color: '#c8ccd4', top: 240, accel: 280, grip: 2.8, w: 52, h: 26 },
  { name: 'Night Taxi', color: '#f2c200', top: 310, accel: 350, grip: 3.3, w: 46, h: 24 },
];
const POLICE_COLOR = '#20264a';
const POLICE_TOP = 380;

/* Player tuning. */
const PLAYER_SPEED = 235;
const PLAYER_SPRINT = 330;
const PLAYER_RADIUS = 13;
const MAX_HEALTH = 100;

/* Wanted level tuning. */
const WANTED_DECAY_MS = 16000;     // ms without a crime before one star fades
const MAX_WANTED = 5;

/* Economy. */
const START_CASH = 250;
const GARAGE_REPAIR_COST = 60;
const AMMO_COST = 40;

/* Small helpers shared by every module (classic scripts share one global scope). */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtCash(n) { return Math.floor(n).toLocaleString('en-US'); }
function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  return 'Palmera Bay';
}
function onRoad(x, y) {
  const mx = ((x % ROAD_GAP) + ROAD_GAP) % ROAD_GAP;
  const my = ((y % ROAD_GAP) + ROAD_GAP) % ROAD_GAP;
  return mx < ROAD_W || mx > ROAD_GAP - 2 || my < ROAD_W || my > ROAD_GAP - 2;
}
