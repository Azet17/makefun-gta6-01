// Neon Tide — Palmera Bay: everything that moves.
// Cars (player, police, traffic, parked), pedestrians, and the small
// arcade physics that makes them feel like a top-down getaway game.
// A car is a point with an angle, a speed and a length; steering only
// bites while the car is moving, and grip bleeds sideways velocity away.

// --- Cars ---------------------------------------------------------------

function makeCar(kind, x, y, angle, color) {
  return {
    kind,            // 'player' | 'police' | 'traffic' | 'parked'
    x, y, angle,
    speed: 0,
    color,
    length: kind === 'police' ? 46 : 44,
    width: 22,
    hp: 100,
    maxHp: 100,
    // Police state.
    bustTimer: 0,
    sirenPhase: 0,
    stuckTimer: 0,
    // Traffic state: which road it follows and which way it turns.
    roadKind: null,
    roadAt: 0,
    dir: 1,
    turnAt: 0,
    // Skid marks and smoke this car left behind.
    skidding: false,
    dead: false,
  };
}

// One physics step for a driven car. throttle -1..1, steer -1..1, handbrake
// true/false. The car accelerates along its nose, steering turns it in
// proportion to speed, and grip damps the sideways slide.
function driveCar(car, throttle, steer, handbrake, dt, tune) {
  const accel = throttle > 0 ? tune.accel : tune.reverse;
  car.speed += throttle * accel * dt;
  if (throttle === 0) {
    // Rolling resistance: the car coasts to a stop.
    const drag = 90 * dt;
    if (Math.abs(car.speed) <= drag) car.speed = 0;
    else car.speed -= Math.sign(car.speed) * drag;
  }
  if (handbrake) car.speed *= Math.max(0, 1 - 2.6 * dt);
  car.speed = clamp(car.speed, -tune.maxReverse, tune.maxSpeed);
  // Steering: sharper at low speed, gentler flat-out.
  const steerAuthority = clamp(Math.abs(car.speed) / 140, 0, 1);
  car.angle += steer * tune.turn * steerAuthority * Math.sign(car.speed || 1) * dt;
  car.angle = wrapAngle(car.angle);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Buildings are solid: slide along them instead of passing through.
  if (!City.collideCircle(nx, car.y, car.width * 0.55)) car.x = nx;
  else car.speed *= 0.55;
  if (!City.collideCircle(car.x, ny, car.width * 0.55)) car.y = ny;
  else car.speed *= 0.55;
  car.x = clamp(car.x, CONFIG.waterWidth + 8, CONFIG.worldWidth - 8);
  car.y = clamp(car.y, 8, CONFIG.worldHeight - 8);
  car.skidding = handbrake && Math.abs(car.speed) > 120;
  return car;
}

// Circle collision between two cars (treated as circles of their half-width
// plus a little length). Returns true when they overlap.
function carsOverlap(a, b) {
  const r = (a.width + b.width) * 0.5 + 6;
  return dist(a.x, a.y, b.x, b.y) < r;
}

// Push two overlapping cars apart and trade a little speed between them.
function separateCars(a, b) {
  const d = dist(a.x, a.y, b.x, b.y) || 1;
  const r = (a.width + b.width) * 0.5 + 6;
  const overlap = r - d;
  if (overlap <= 0) return;
  const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
  a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
  const push = 26;
  a.speed -= push * 0.4; b.speed += push * 0.4;
}

// --- Police AI ----------------------------------------------------------

// Steer a police car toward the player. Police take the racing line: they
// aim a little ahead of the player, cut corners, and ram when close.
function policeStep(car, player, dt) {
  const tune = { accel: CONFIG.policeAccel, reverse: 120, maxSpeed: CONFIG.policeMaxSpeed, maxReverse: 90, turn: CONFIG.policeTurn };
  const d = dist(car.x, car.y, player.x, player.y);
  // Aim ahead of the player by a fraction of their speed.
  const lead = clamp(d / 420, 0.15, 0.6);
  const tx = player.x + Math.cos(player.angle) * (player.speed || 0) * lead;
  const ty = player.y + Math.sin(player.angle) * (player.speed || 0) * lead;
  const want = angleTo(car.x, car.y, tx, ty);
  const diff = wrapAngle(want - car.angle);
  const steer = clamp(diff * 1.8, -1, 1);
  const throttle = Math.abs(diff) > 1.9 ? -0.5 : 1;
  driveCar(car, throttle, steer, false, dt, tune);
  car.sirenPhase += dt * 2.2;
  // Stuck detection: if the car barely moved while trying, reverse out.
  if (Math.abs(car.speed) < 12) car.stuckTimer += dt;
  else car.stuckTimer = 0;
  if (car.stuckTimer > 1.2) {
    car.angle += Math.PI * 0.7;
    car.stuckTimer = -1.5;
  }
  return car;
}

// --- Traffic AI ---------------------------------------------------------

// A traffic car cruises its road and turns at random intersections.
function trafficStep(car, dt, rng) {
  const tune = { accel: 200, reverse: 0, maxSpeed: CONFIG.trafficSpeed, maxReverse: 0, turn: CONFIG.trafficTurn };
  if (car.roadKind === null) {
    const road = City.nearestRoad(car.x, car.y);
    car.roadKind = road.kind;
    car.roadAt = road.at;
    car.dir = rng() < 0.5 ? 1 : -1;
    car.angle = car.roadKind === 'avenue'
      ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (car.dir > 0 ? 0 : Math.PI);
  }
  // Follow the road centre: steer gently toward the lane line.
  const laneOffset = 14;
  let wantAngle;
  if (car.roadKind === 'avenue') {
    const laneX = car.roadAt + laneOffset * (car.dir > 0 ? 1 : -1);
    wantAngle = (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + clamp((laneX - car.x) * 0.004, -0.5, 0.5);
  } else {
    const laneY = car.roadAt + laneOffset * (car.dir > 0 ? 1 : -1);
    wantAngle = (car.dir > 0 ? 0 : Math.PI) + clamp((laneY - car.y) * 0.004, -0.5, 0.5);
  }
  const diff = wrapAngle(wantAngle - car.angle);
  const steer = clamp(diff * 2.2, -1, 1);
  driveCar(car, 1, steer, false, dt, tune);
  // At an intersection, sometimes turn onto the crossing road.
  const road = City.nearestRoad(car.x, car.y);
  const onCross = car.roadKind === 'avenue'
    ? Math.abs(car.y - road.at) < 8 && road.kind === 'street'
    : Math.abs(car.x - road.at) < 8 && road.kind === 'avenue';
  if (onCross && rng() < 0.006) {
    car.roadKind = car.roadKind === 'avenue' ? 'street' : 'avenue';
    car.roadAt = road.at;
    car.dir = rng() < 0.5 ? 1 : -1;
  }
  return car;
}

// --- Pedestrians --------------------------------------------------------

// A pedestrian strolls along a sidewalk, turns at corners, and flees from
// fast cars nearby. They are decoration with a little self-preservation.
function makePedestrian(x, y, rng) {
  return {
    x, y,
    angle: rng() * Math.PI * 2,
    speed: 34 + rng() * 26,
    color: ['#e85d75', '#5d8fe8', '#e8b45d', '#7ad67a', '#c95de8'][Math.floor(rng() * 5)],
    fleeing: 0,
  };
}

function pedestrianStep(ped, cars, dt, rng) {
  // Flee from the nearest fast car.
  let nearest = Infinity;
  for (const car of cars) {
    if (Math.abs(car.speed || 0) < 60) continue;
    const d = dist(ped.x, ped.y, car.x, car.y);
    if (d < nearest) nearest = d;
  }
  if (nearest < 90) ped.fleeing = 0.9;
  if (ped.fleeing > 0) {
    ped.fleeing -= dt;
    // Run away from the road: toward the nearest building side is fine,
    // any direction off the asphalt counts.
    const road = City.nearestRoad(ped.x, ped.y);
    const away = road.kind === 'avenue'
      ? (ped.x < road.at ? -1 : 1)
      : (ped.y < road.at ? -1 : 1);
    ped.angle = road.kind === 'avenue' ? (away > 0 ? 0 : Math.PI) : (away > 0 ? Math.PI / 2 : -Math.PI / 2);
    ped.x += Math.cos(ped.angle) * 130 * dt;
    ped.y += Math.sin(ped.angle) * 130 * dt;
    return ped;
  }
  // Stroll: keep walking, bounce off buildings and water.
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  if (City.collideCircle(nx, ny, 8) || City.isWater(nx, ny) || nx < CONFIG.waterWidth + CONFIG.beachWidth) {
    ped.angle += (rng() < 0.5 ? 1 : -1) * (Math.PI / 2 + rng() * 0.6);
  } else {
    ped.x = nx; ped.y = ny;
  }
  ped.x = clamp(ped.x, CONFIG.waterWidth + CONFIG.beachWidth + 4, CONFIG.worldWidth - 4);
  ped.y = clamp(ped.y, 4, CONFIG.worldHeight - 4);
  return ped;
}

// The player's drive tune, straight from CONFIG so the feel lives in one place.
function playerTune() {
  return {
    accel: CONFIG.playerAccel,
    reverse: CONFIG.playerReverse,
    maxSpeed: CONFIG.playerMaxSpeed,
    maxReverse: CONFIG.playerMaxReverse,
    turn: CONFIG.playerTurn,
  };
}

// Damage a car; returns true when the hit wrecked it. Wrecked cars smoke
// and slow down hard, and a wrecked player car ends the run.
function damageCar(car, amount) {
  car.hp = Math.max(0, car.hp - amount);
  if (car.hp <= 0) car.dead = true;
  return car.dead;
}

// A wrecked car still rolls, but barely: cap its speed hard.
function wreckedCap(car) {
  if (car.dead) car.speed = clamp(car.speed, -40, 40);
}

// --- Spawning -----------------------------------------------------------

// Spawn parked cars along the kerbs: some near the hideout for mission 1,
// the rest scattered over the city. Returns an array of parked cars.
function spawnParkedCars(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const spot = City.randomRoadPoint(rng);
    const color = PARKED_CAR_COLORS[Math.floor(rng() * PARKED_CAR_COLORS.length)];
    const car = makeCar('parked', spot.x, spot.y, spot.angle, color);
    // Parked cars sit half on the kerb, engine off.
    car.x += Math.cos(spot.angle + Math.PI / 2) * 16;
    car.y += Math.sin(spot.angle + Math.PI / 2) * 16;
    cars.push(car);
  }
  return cars;
}

// The gold supercar for the final mission, parked outside the casino.
function spawnGoldCar() {
  const c = City.data.landmarks.casino;
  const car = makeCar('parked', c.x + 60, c.y + 40, Math.PI / 2, '#ffd94a');
  car.gold = true;
  car.length = 48;
  return car;
}

// Spawn traffic cars spread across the city.
function spawnTraffic(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const spot = City.randomRoadPoint(rng);
    const color = TRAFFIC_CAR_COLORS[Math.floor(rng() * TRAFFIC_CAR_COLORS.length)];
    const car = makeCar('traffic', spot.x, spot.y, spot.angle, color);
    cars.push(car);
  }
  return cars;
}

// Spawn pedestrians on the sidewalks near the roads.
function spawnPedestrians(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const spot = City.randomRoadPoint(rng);
    const side = rng() < 0.5 ? -1 : 1;
    const x = clamp(spot.x + Math.cos(spot.angle + Math.PI / 2) * 34 * side, CONFIG.waterWidth + CONFIG.beachWidth + 6, CONFIG.worldWidth - 6);
    const y = clamp(spot.y + Math.sin(spot.angle + Math.PI / 2) * 34 * side, 6, CONFIG.worldHeight - 6);
    if (City.collideCircle(x, y, 8)) continue;
    peds.push(makePedestrian(x, y, rng));
  }
  return peds;
}
