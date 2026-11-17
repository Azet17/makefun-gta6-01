// Neon Tide — Palmera Bay: everything that moves.
// Player car, police cruisers, traffic and pedestrians share one
// small car model: position, heading, speed, and a draw routine.
// No file here knows about missions or the HUD; it only moves cars.
'use strict';

function makeCar(x, y, angle, color, color2) {
  return {
    x, y, angle, speed: 0,
    color, color2: color2 || color,
    w: 46, h: 22, radius: 20,
    steer: 0, crashed: 0,
  };
}

// --- Player -------------------------------------------------------------
function makePlayer(city) {
  const p = makeCar(1600, 1180, -Math.PI / 2, CONFIG.PLAYER.color, CONFIG.PLAYER.color2);
  p.health = CONFIG.PLAYER.health;
  p.money = CONFIG.START_MONEY;
  p.wanted = 0;
  p.onFoot = false;
  p.footX = p.x; p.footY = p.y;
  p.footAngle = p.angle;
  p.hidden = 0;         // seconds out of police sight
  p.invulnerable = 0;
  return p;
}

// Drive the player car one tick. `input` is {up,down,left,right,brake}.
function drivePlayer(player, input, dt, city) {
  const c = CONFIG.PLAYER;
  const onRoad = isRoad(city, player.x, player.y);
  const grip = onRoad ? 1 : 0.82; // off-road is slower and slidey
  if (input.up) player.speed += c.accel * grip * dt;
  if (input.down) player.speed -= c.reverseAccel * dt;
  if (input.brake) player.speed *= Math.pow(0.12, dt);
  player.speed *= Math.pow(0.35, dt); // drag
  player.speed = clamp(player.speed, -c.maxReverse, c.maxSpeed * grip);
  const steerDir = player.speed >= 0 ? 1 : -1;
  if (input.left) player.angle -= c.turnRate * steerDir * dt * Math.min(1, Math.abs(player.speed) / 120 + 0.25);
  if (input.right) player.angle += c.turnRate * steerDir * dt * Math.min(1, Math.abs(player.speed) / 120 + 0.25);
  const nx = player.x + Math.cos(player.angle) * player.speed * dt;
  const ny = player.y + Math.sin(player.angle) * player.speed * dt;
  const fixed = resolveBuilding(city, nx, ny, player.radius);
  if (fixed.hit) {
    if (Math.abs(player.speed) > 240) {
      player.health -= 4;
      player.crashed = 0.4;
      player.invulnerable = Math.max(player.invulnerable, 0.5);
    }
    player.speed *= -0.25;
  }
  player.x = clamp(fixed.x, 24, CONFIG.WORLD_W - 24);
  player.y = clamp(fixed.y, 24, CONFIG.WORLD_H - 24);
  if (player.crashed > 0) player.crashed -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;
}

// Walk on foot: Mara leaves the car and moves as a pedestrian.
function walkPlayer(player, input, dt, city) {
  const speed = 150;
  let dx = 0, dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (dx || dy) {
    const len = Math.sqrt(dx * dx + dy * dy);
    player.footAngle = Math.atan2(dy / len, dx / len);
    const nx = player.footX + (dx / len) * speed * dt;
    const ny = player.footY + (dy / len) * speed * dt;
    const fixed = resolveBuilding(city, nx, ny, 12);
    if (!fixed.hit) { player.footX = nx; player.footY = ny; }
  }
}

// --- Police -------------------------------------------------------------
function makePolice(x, y) {
  const car = makeCar(x, y, 0, CONFIG.POLICE.color, CONFIG.POLICE.stripe);
  car.sirenPhase = Math.random() * Math.PI * 2;
  car.stuck = 0;
  return car;
}

// One police tick: steer toward the player, ram when close, and
// recover from walls instead of grinding against them forever.
function updatePolice(car, player, dt, city) {
  const c = CONFIG.POLICE;
  const px = player.onFoot ? player.footX : player.x;
  const py = player.onFoot ? player.footY : player.y;
  const dx = px - car.x, dy = py - car.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += clamp(diff, -c.turnRate * dt, c.turnRate * dt);
  car.speed = Math.min(car.speed + c.accel * dt, c.maxSpeed);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = resolveBuilding(city, nx, ny, car.radius);
  if (fixed.hit) {
    car.speed *= 0.3;
    car.stuck += dt;
    if (car.stuck > 1.2) { // back out and re-aim
      car.angle += Math.PI * 0.7;
      car.stuck = 0;
    }
  } else if (car.stuck > 0) {
    car.stuck = Math.max(0, car.stuck - dt);
  }
  car.x = clamp(fixed.x, 24, CONFIG.WORLD_W - 24);
  car.y = clamp(fixed.y, 24, CONFIG.WORLD_H - 24);
  car.sirenPhase += dt * 6;
  return d;
}

// --- Traffic ------------------------------------------------------------
function makeTraffic(city, rng, player) {
  const cars = [];
  for (let i = 0; i < CONFIG.TRAFFIC.count; i++) {
    const p = randomRoadPoint(city, rng, player.x, player.y, 500);
    const color = CONFIG.TRAFFIC.colors[i % CONFIG.TRAFFIC.colors.length];
    const car = makeCar(p.x, p.y, p.vertical ? Math.PI / 2 : 0, color, color);
    car.cruise = CONFIG.TRAFFIC.speed * (0.8 + rng() * 0.4);
    car.vertical = p.vertical;
    car.turnAt = 0;
    cars.push(car);
  }
  return cars;
}

// Traffic follows the grid: drive straight, turn at intersections,
// never leave the road. Cheap, but it reads as real traffic.
function updateTraffic(car, dt, city) {
  car.speed = car.cruise;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const ahead = nearestRoadPoint(city, nx, ny);
  if (dist2(nx, ny, ahead.x, ahead.y) > 90 * 90) {
    // Off the grid: snap back onto the nearest road and re-aim.
    car.x = ahead.x; car.y = ahead.y;
    car.angle = ahead.vertical ? Math.PI / 2 : 0;
    return;
  }
  // At an intersection, sometimes turn onto the cross street.
  const onCross = (Math.abs(nx % 400) < 40 && Math.abs(ny % 400) < 40);
  if (onCross && Math.random() < dt * 0.25) {
    car.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  }
  const fixed = resolveBuilding(city, nx, ny, car.radius);
  car.x = fixed.x; car.y = fixed.y;
}

// --- Pedestrians --------------------------------------------------------
function makePeds(city, rng, player) {
  const peds = [];
  for (let i = 0; i < CONFIG.PEDS.count; i++) {
    const p = randomRoadPoint(city, rng, player.x, player.y, 350);
    peds.push({
      x: p.x + (rng() - 0.5) * 60, y: p.y + (rng() - 0.5) * 60,
      angle: rng() * Math.PI * 2,
      speed: CONFIG.PEDS.speed * (0.7 + rng() * 0.6),
      color: CONFIG.PEDS.colors[i % CONFIG.PEDS.colors.length],
      turnIn: 1 + rng() * 4, panic: 0,
    });
  }
  return peds;
}

function updatePed(ped, dt, city, player) {
  const px = player.onFoot ? player.footX : player.x;
  const py = player.onFoot ? player.footY : player.y;
  const d = Math.sqrt(dist2(ped.x, ped.y, px, py));
  if (d < 90 && Math.abs(player.speed || 0) > 60) ped.panic = 1.5; // flee the car
  if (ped.panic > 0) {
    ped.panic -= dt;
    ped.angle = Math.atan2(ped.y - py, ped.x - px);
  } else {
    ped.turnIn -= dt;
    if (ped.turnIn <= 0) {
      ped.angle += (Math.random() - 0.5) * 2.4;
      ped.turnIn = 1 + Math.random() * 4;
    }
  }
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * (ped.panic > 0 ? 2.2 : 1) * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * (ped.panic > 0 ? 2.2 : 1) * dt;
  const fixed = resolveBuilding(city, nx, ny, 10);
  if (!fixed.hit) { ped.x = clamp(nx, 20, CONFIG.WORLD_W - 20); ped.y = clamp(ny, 20, CONFIG.WORLD_H - 20); }
}

// --- Pickups ------------------------------------------------------------
function makePickups(city, rng) {
  const items = [];
  for (let i = 0; i < CONFIG.PICKUPS.cash; i++) {
    const p = randomRoadPoint(city, rng, 1600, 1200, 200);
    items.push({ kind: 'cash', x: p.x, y: p.y, value: CONFIG.PICKUPS.cashValue, taken: false });
  }
  for (let i = 0; i < CONFIG.PICKUPS.repair; i++) {
    const p = randomRoadPoint(city, rng, 1600, 1200, 200);
    items.push({ kind: 'repair', x: p.x, y: p.y, value: CONFIG.PICKUPS.repairValue, taken: false });
  }
  return items;
}

// --- Drawing ------------------------------------------------------------
// All drawing is plain canvas 2D: rounded rectangles, circles and
// gradients, no image assets at all.
function drawCar(ctx, car, isPolice) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, -car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h, 7);
  ctx.fill();
  const grad = ctx.createLinearGradient(-car.w / 2, 0, car.w / 2, 0);
  grad.addColorStop(0, car.color2);
  grad.addColorStop(0.55, car.color);
  grad.addColorStop(1, car.color2);
  ctx.fillStyle = grad;
  roundRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(10,16,32,0.85)'; // cabin glass
  roundRect(ctx, -6, -car.h / 2 + 4, 18, car.h - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,220,0.9)'; // headlights
  ctx.fillRect(car.w / 2 - 2, -car.h / 2 + 2, 3, 5);
  ctx.fillRect(car.w / 2 - 2, car.h / 2 - 7, 3, 5);
  ctx.fillStyle = 'rgba(255,40,40,0.85)'; // tail lights
  ctx.fillRect(-car.w / 2 - 1, -car.h / 2 + 2, 3, 5);
  ctx.fillRect(-car.w / 2 - 1, car.h / 2 - 7, 3, 5);
  if (isPolice) {
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BAY PD', 0, 3);
    const flash = Math.sin(car.sirenPhase || 0) > 0;
    ctx.fillStyle = flash ? '#ff2233' : '#2563eb';
    ctx.beginPath();
    ctx.arc(-14, -car.h / 2 + 1, 4, 0, Math.PI * 2);
    ctx.arc(8, -car.h / 2 + 1, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Speed in km/h for the HUD: world units per second, scaled.
function carSpeedKmh(car) { return Math.abs(car.speed || 0) * 0.42; }

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(1, 2, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.beginPath(); ctx.arc(0, -1, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
