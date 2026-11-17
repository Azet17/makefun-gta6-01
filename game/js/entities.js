// Neon Tide: Palmera Bay — people and cars.
// The player (Mara Voss, on foot or behind the wheel), traffic that
// cruises the avenues, pedestrians on the pavements, and the Bay Police
// cars that hunt her when the wanted level rises.

import {
  WORLD_W, WORLD_H, PLAYER_WALK_SPEED, PLAYER_RUN_SPEED, CAR_ACCEL, CAR_BRAKE,
  CAR_MAX_SPEED, CAR_REVERSE_SPEED, CAR_TURN, CAR_DRAG, CAR_MODELS, PED_COLORS,
  clamp, dist, angleTo, wrapAngle, pick, mulberry32,
} from './config.js';
import { isRoad, nearestRoadPoint, randomRoadPoint, randomWalkPoint, hitBuilding, resolveBuildings } from './city.js';

// ---- The player ----

export function makePlayer(x, y) {
  return {
    kind: 'player', x, y, angle: -Math.PI / 2, speed: 0,
    health: 100, cash: 150, wanted: 0, wantedTimer: 0,
    inCar: null, punchTimer: 0, punchHit: false, moving: false, running: false,
  };
}

// Walk Mara on foot. Returns true when she moved this frame.
export function updatePlayerOnFoot(p, input, dt, city) {
  let dx = 0, dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  p.moving = dx !== 0 || dy !== 0;
  p.running = !!input.run;
  if (!p.moving) { p.speed = 0; return false; }
  const len = Math.hypot(dx, dy);
  const sp = (p.running ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED) * dt;
  p.angle = Math.atan2(dy / len, dx / len);
  p.x = clamp(p.x + (dx / len) * sp, 150, WORLD_W - 10);
  p.y = clamp(p.y + (dy / len) * sp, 10, WORLD_H - 10);
  resolveBuildings(city, p, 13);
  p.speed = p.running ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
  return true;
}

// ---- Cars ----

let carSeq = 0;

export function makeCar(model, x, y, angle, opts = {}) {
  carSeq += 1;
  return {
    kind: 'car', id: carSeq, model, x, y, angle, speed: 0,
    color: opts.color || pick(mulberry32(carSeq * 7919 + 3), model.colors),
    driver: opts.driver || 'traffic', // 'traffic' | 'player' | 'police' | 'parked' | 'mission'
    police: model.id === 'police',
    siren: 0, hornTimer: 0, crashed: 0, targetAngle: angle,
    cruise: opts.cruise || 0,
  };
}

export function makeTrafficCar(city, rng) {
  const model = pick(rng, CAR_MODELS.filter((m) => m.id !== 'police'));
  const p = randomRoadPoint(rng);
  const onAvenue = Math.abs(p.x - Math.round(p.x)) >= 0 && rng() < 0.5;
  const angle = onAvenue ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
  const car = makeCar(model, p.x, p.y, angle, { cruise: 120 + rng() * 130 });
  car.speed = car.cruise;
  return car;
}

export function makeParkedCar(city, rng) {
  const model = pick(rng, CAR_MODELS.filter((m) => m.id !== 'police'));
  const p = randomRoadPoint(rng);
  // Park just off the road edge, nose along the street.
  const along = rng() < 0.5;
  const off = (rng() < 0.5 ? -1 : 1) * (52 + rng() * 8);
  const x = along ? p.x + off : p.x;
  const y = along ? p.y : p.y + off;
  const car = makeCar(model, x, y, along ? (off > 0 ? 0 : Math.PI) : (off > 0 ? Math.PI / 2 : -Math.PI / 2), { driver: 'parked' });
  if (hitBuilding(city, x, y, 30)) { car.x = p.x; car.y = p.y; car.driver = 'traffic'; car.speed = 100; }
  return car;
}

// Player driving: arcade handling — accelerate, brake/reverse, steer
// with speed, drift a little at full lock, drag bleeds speed off.
export function updatePlayerCar(car, input, dt, city) {
  const forward = Math.cos(car.angle), right = Math.sin(car.angle);
  if (input.up) car.speed += CAR_ACCEL * dt;
  if (input.down) car.speed -= (car.speed > 20 ? CAR_BRAKE : CAR_ACCEL * 0.6) * dt;
  if (!input.up && !input.down) car.speed -= Math.sign(car.speed) * CAR_DRAG * 220 * dt;
  car.speed = clamp(car.speed, -CAR_REVERSE_SPEED, car.model.top);
  if (Math.abs(car.speed) < 4 && !input.up && !input.down) car.speed = 0;
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const grip = clamp(Math.abs(car.speed) / 160, 0.25, 1);
  car.angle += steer * CAR_TURN * grip * dt * Math.sign(car.speed || 1) * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(nx, 150, WORLD_W - 10);
  car.y = clamp(ny, 10, WORLD_H - 10);
  if (hitBuilding(city, car.x, car.y, 20)) {
    car.x -= Math.cos(car.angle) * car.speed * dt;
    car.y -= Math.sin(car.angle) * car.speed * dt;
    if (Math.abs(car.speed) > 240) car.crashed = 0.35;
    car.speed *= -0.25;
  }
  if (car.crashed > 0) car.crashed -= dt;
  void forward; void right;
}

// Traffic cars cruise their road and turn at intersections.
export function updateTrafficCar(car, dt, city, rng) {
  if (car.driver === 'parked') return;
  const onAvenue = Math.abs(Math.sin(car.angle)) > 0.7;
  car.speed += (car.cruise - car.speed) * Math.min(1, dt * 1.5);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // At an intersection, sometimes turn onto the crossing road.
  const nearX = AVENUE_LIST.find((a) => Math.abs(car.x - a) < 26);
  const nearY = STREET_LIST.find((s) => Math.abs(car.y - s) < 26);
  if (nearX !== undefined && nearY !== undefined && rng() < dt * 0.5) {
    car.angle = rng() < 0.5 ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  }
  if (car.x < 240 || car.x > WORLD_W - 20 || car.y < 20 || car.y > WORLD_H - 20) {
    car.angle += Math.PI;
    car.x = clamp(car.x, 240, WORLD_W - 20);
    car.y = clamp(car.y, 20, WORLD_H - 20);
  }
  if (hitBuilding(city, car.x, car.y, 20)) {
    car.x -= Math.cos(car.angle) * car.speed * dt;
    car.y -= Math.sin(car.angle) * car.speed * dt;
    car.angle += Math.PI / 2;
  }
  void onAvenue;
}

// Police AI: chase the player, ram to stop her, give up slowly when far.
export function updatePoliceCar(car, target, dt, city) {
  const d = dist(car.x, car.y, target.x, target.y);
  const want = angleTo(car.x, car.y, target.x, target.y);
  const diff = wrapAngle(want - car.angle);
  car.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
  const top = d > 700 ? car.model.top : car.model.top * 0.82;
  car.speed += (top - car.speed) * Math.min(1, dt * 1.2);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (hitBuilding(city, car.x, car.y, 20)) {
    car.x -= Math.cos(car.angle) * car.speed * dt;
    car.y -= Math.sin(car.angle) * car.speed * dt;
    car.angle += Math.PI / 3;
    car.speed *= 0.5;
  }
  car.x = clamp(car.x, 150, WORLD_W - 10);
  car.y = clamp(car.y, 10, WORLD_H - 10);
  car.siren += dt;
  return d;
}

// ---- Pedestrians ----

export function makePed(city, rng) {
  const p = randomWalkPoint(city, rng);
  return {
    kind: 'ped', x: p.x, y: p.y,
    angle: rng() * Math.PI * 2, speed: 34 + rng() * 40,
    color: pick(rng, PED_COLORS), panic: 0, tx: p.x, ty: p.y,
    retarget: 0, down: 0,
  };
}

export function updatePed(ped, dt, city, player, rng) {
  if (ped.down > 0) { ped.down -= dt; return; }
  const pd = dist(ped.x, ped.y, player.x, player.y);
  if (pd < 130 && player.wanted > 0) ped.panic = 1.5;
  if (ped.panic > 0) {
    ped.panic -= dt;
    const away = angleTo(player.x, player.y, ped.x, ped.y);
    ped.angle = away;
    ped.x += Math.cos(away) * 150 * dt;
    ped.y += Math.sin(away) * 150 * dt;
    resolveBuildings(city, ped, 11);
    return;
  }
  ped.retarget -= dt;
  if (ped.retarget <= 0 || dist(ped.x, ped.y, ped.tx, ped.ty) < 14) {
    const t = randomWalkPoint(city, rng);
    ped.tx = t.x; ped.ty = t.y;
    ped.retarget = 6 + rng() * 6;
  }
  ped.angle = angleTo(ped.x, ped.y, ped.tx, ped.ty);
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  resolveBuildings(city, ped, 11);
}

// ---- Drawing people and cars ----

import { AVENUES, STREETS } from './config.js';

// Road lists under the names the traffic code uses.
const AVENUE_LIST = AVENUES;
const STREET_LIST = STREETS;

// A car: body, roof, windshield, headlights, and a police light bar
// that flashes red/blue while the siren runs.
export function drawCar(ctx, cam, car, time) {
  ctx.save();
  ctx.translate(car.x - cam.x, car.y - cam.y);
  ctx.rotate(car.angle);
  const w = car.model.w, h = car.model.h;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,24,34,0.9)';
  ctx.beginPath();
  ctx.roundRect(-w * 0.18, -h / 2 + 3, w * 0.34, h - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,210,0.9)';
  ctx.fillRect(w / 2 - 3, -h / 2 + 3, 3, 5);
  ctx.fillRect(w / 2 - 3, h / 2 - 8, 3, 5);
  ctx.fillStyle = 'rgba(255,60,60,0.85)';
  ctx.fillRect(-w / 2, -h / 2 + 3, 3, 5);
  ctx.fillRect(-w / 2, h / 2 - 8, 3, 5);
  if (car.police) {
    const flash = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e7bff';
    ctx.fillRect(-4, -h / 2 - 1, 8, 6);
    ctx.fillStyle = flash ? '#2e7bff' : '#ff2e2e';
    ctx.fillRect(-4, h / 2 - 5, 8, 6);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BAY PD', 0, 3);
  }
  if (car.driver === 'player') {
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 9);
    ctx.stroke();
  }
  ctx.restore();
  if (car.crashed > 0) {
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦', car.x - cam.x, car.y - 24 - cam.y);
  }
}

// Mara on foot: a circle with a direction tick, a punch arc while she
// swings, and a little shadow so she reads against the road.
export function drawPlayer(ctx, cam, p, time) {
  if (p.inCar) return;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x - cam.x, p.y + 6 - cam.y, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5c8a';
  ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x - cam.x, p.y - cam.y);
  ctx.lineTo(p.x + Math.cos(p.angle) * 16 - cam.x, p.y + Math.sin(p.angle) * 16 - cam.y);
  ctx.stroke();
  if (p.punchTimer > 0) {
    ctx.strokeStyle = 'rgba(255,217,74,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y - cam.y, 26, p.angle - 0.9, p.angle + 0.9);
    ctx.stroke();
  }
  void time;
}

// A pedestrian: a small walker with a coloured shirt.
export function drawPed(ctx, cam, ped) {
  if (ped.down > 0) {
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.ellipse(ped.x - cam.x, ped.y - cam.y, 11, 6, ped.angle, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(ped.x - cam.x, ped.y + 5 - cam.y, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath(); ctx.arc(ped.x - cam.x, ped.y - cam.y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 4 - cam.x, ped.y + Math.sin(ped.angle) * 4 - cam.y, 4, 0, Math.PI * 2); ctx.fill();
}

// Find the nearest stealable car to the player (parked or traffic, not police).
export function nearestStealableCar(cars, x, y, maxD = 70) {
  let best = null, bestD = maxD;
  for (const c of cars) {
    if (c.police || c.driver === 'player') continue;
    const d = dist(c.x, c.y, x, y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
