// Neon Tide — Palmera Bay: the game loop.
// Owns the game state, the input, the camera, the top-down renderer and
// the wanted/police director. Everything else (city, cars, missions, HUD,
// audio) plugs in here. The canvas is north-up: the city never rotates,
// the camera just follows Mara.

// --- Game state ---------------------------------------------------------

const Game = {
  mode: 'title',        // 'title' | 'playing' | 'paused' | 'busted' | 'complete'
  player: null,         // {x, y, angle} — Mara herself, on foot or driving
  playerCar: null,      // the car Mara is driving, or null when on foot
  parked: [],           // stealable parked cars
  traffic: [],
  police: [],
  peds: [],
  wanted: 0,
  wantedHeat: 0,        // 0..1: how sure the police are where Mara is
  policeCanSee: false,
  nearestParked: null,
  camera: { x: 0, y: 0 },
  rng: mulberry32(20261118),
  keys: {},
  skidMarks: [],        // {x, y, angle, life}
  particles: [],        // crash smoke / sparks {x, y, vx, vy, life, color, size}
  time: 0,
  fps: 60,
  bustTimer: 0,
  shot: null,           // ?shot=start|drive|chase|mission (screenshots)
  shotSeed: 1,
  lastCrashSound: 0,
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Setup --------------------------------------------------------------

// Fresh world: rebuild the city, scatter cars and people, put Mara at the
// hideout on foot, and load the save if there is one.
function setupWorld(seed) {
  City.build(seed);
  Game.rng = mulberry32(seed);
  Game.parked = spawnParkedCars(Game.rng, 16);
  Game.parked.push(spawnGoldCar());
  Game.traffic = spawnTraffic(Game.rng, 14);
  Game.police = [];
  Game.peds = spawnPedestrians(Game.rng, 26);
  Game.skidMarks = [];
  Game.particles = [];
  const spawn = City.playerSpawn();
  Game.player = { x: spawn.x, y: spawn.y, angle: spawn.angle };
  Game.playerCar = null;
  Game.wanted = 0;
  Game.wantedHeat = 0;
  Game.bustTimer = 0;
  Game.time = 0;
}

// Start a fresh story from mission 1 (used by the title screen's New Game).
function newGame() {
  setupWorld(20261118 + Math.floor(Math.random() * 100000));
  Missions.reset(Game);
  Game.mode = 'playing';
  HUD.showScreen(null);
  AudioSys.ensure();
}

// Continue from the save: same city seed, missions resume where they were.
function continueGame() {
  setupWorld(20261118);
  if (Missions.state.completed.length > 0 || Missions.state.index > 0) {
    Missions.startMission(Game);
  } else {
    Missions.startMission(Game);
  }
  Game.mode = 'playing';
  HUD.showScreen(null);
  AudioSys.ensure();
}

// --- Input --------------------------------------------------------------

const KEYMAP = {};
for (const action of Object.keys(KEYS)) {
  for (const code of KEYS[action]) KEYMAP[code] = action;
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  const action = KEYMAP[e.code];
  if (action) Game.keys[action] = true;
  if (e.code === 'Enter') onEnter();
  if (e.code === 'KeyM') AudioSys.toggleMute();
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyH') AudioSys.horn();
  if (e.code === 'KeyE' && !e.repeat) onEnterCar();
});

window.addEventListener('keyup', (e) => {
  const action = KEYMAP[e.code];
  if (action) Game.keys[action] = false;
});

window.addEventListener('blur', () => { Game.keys = {}; });

// Enter: start / continue / retry, depending on the screen showing.
function onEnter() {
  if (Game.mode === 'title') { continueGame(); return; }
  if (Game.mode === 'busted') { respawnAfterBust(); return; }
  if (Game.mode === 'complete') {
    if (!Missions.nextMission(Game)) { Game.mode = 'playing'; HUD.showScreen(null); }
    else { Game.mode = 'playing'; HUD.showScreen(null); }
    return;
  }
  if (Game.mode === 'playing' && !Missions.state.active && !Missions.state.storyDone) {
    Missions.startMission(Game);
  }
}

function togglePause() {
  if (Game.mode === 'playing') {
    Game.mode = 'paused';
    HUD.showScreen('pauseScreen');
  } else if (Game.mode === 'paused') {
    Game.mode = 'playing';
    HUD.showScreen(null);
  }
}

// E: climb into the nearest parked car, or climb out of the one driving.
function onEnterCar() {
  if (Game.mode !== 'playing') return;
  AudioSys.ensure();
  if (Game.playerCar) {
    // Climb out: Mara appears beside the car, the car stays parked.
    const car = Game.playerCar;
    car.speed = 0;
    car.kind = 'parked';
    if (!Game.parked.includes(car)) Game.parked.push(car);
    Game.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    Game.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    Game.player.angle = car.angle;
    Game.playerCar = null;
    AudioSys.doorSlam();
    return;
  }
  const near = Game.nearestParked;
  if (!near) return;
  Game.parked = Game.parked.filter((c) => c !== near);
  near.kind = 'player';
  near.speed = 0;
  Game.playerCar = near;
  Game.player.x = near.x;
  Game.player.y = near.y;
  Game.player.angle = near.angle;
  Missions.carStolen(Game);
  AudioSys.doorSlam();
  AudioSys.engineStart();
  if (Game.wanted >= 1) AudioSys.wantedUp();
}

// --- Wanted + police director -------------------------------------------

// Heat: wanted rises on crime, cools when no police unit can see Mara.
// Police spawn up to a cap set by the wanted level.
function updateWanted(dt) {
  const prev = Game.wanted;
  // Can any police unit see the player? (range + rough line of sight: no
  // building between them.)
  Game.policeCanSee = false;
  for (const p of Game.police) {
    if (dist(p.x, p.y, Game.player.x, Game.player.y) < POLICE.sightRange) {
      Game.policeCanSee = true;
      break;
    }
  }
  if (Game.policeCanSee) Game.wantedHeat = Math.min(1, Game.wantedHeat + dt * 0.5);
  else Game.wantedHeat = Math.max(0, Game.wantedHeat - dt / CONFIG.wantedDecaySeconds);
  // Cool down one star when the heat fully dies and the player is hidden.
  if (Game.wanted > 0 && Game.wantedHeat <= 0 && !Game.policeCanSee) {
    Game.wanted--;
    Game.wantedHeat = 0.6;
    if (Game.wanted === 0) Missions.state.message = 'You lost them. The heat is off.';
  }
  if (Game.wanted !== prev && Game.wanted > prev) AudioSys.wantedUp();
  // Spawn police to match the wanted level (1 star = 1 unit, 5 = 6).
  const wantUnits = Game.wanted === 0 ? 0 : Math.min(POLICE.maxUnits, Game.wanted + 1);
  while (Game.police.length < wantUnits) {
    const spot = City.roadPointNear(Game.player.x, Game.player.y, POLICE.spawnDistance, Game.rng);
    const car = makeCar('police', spot.x, spot.y, spot.angle, '#1c2f6e');
    Game.police.push(car);
  }
  while (Game.police.length > wantUnits) Game.police.pop();
}

// Busted: a police car sits on Mara's car while she crawls, or her car is
// wrecked. On foot, getting touched by a police car at low speed busts her.
function updateBusted(dt) {
  if (Game.wanted === 0) { Game.bustTimer = 0; return; }
  const playerSpeed = Math.abs(Game.playerCar ? Game.playerCar.speed : 0);
  let touching = false;
  for (const p of Game.police) {
    if (dist(p.x, p.y, Game.player.x, Game.player.y) < 46) { touching = true; break; }
  }
  if (touching && playerSpeed < 60) {
    Game.bustTimer += dt;
    if (Game.bustTimer >= CONFIG.bustHoldSeconds) return doBust('The Bay Police boxed Mara in.');
  } else {
    Game.bustTimer = Math.max(0, Game.bustTimer - dt * 2);
  }
  if (Game.playerCar && Game.playerCar.dead) return doBust('Mara\'s car is wrecked — the police moved in.');
}

function doBust(reason) {
  Game.mode = 'busted';
  Game.wanted = 0;
  Game.wantedHeat = 0;
  Game.police = [];
  Missions.state.active = false;
  Missions.state.target = null;
  Missions.state.cash = Math.max(0, Missions.state.cash - 200);
  Missions.save(Game);
  AudioSys.busted();
  HUD.showBusted(reason + ' The cops took $200.');
}

function respawnAfterBust() {
  setupWorld(20261118);
  Missions.startMission(Game);
  Game.mode = 'playing';
  HUD.showScreen(null);
}

// --- Update ---------------------------------------------------------------

function update(dt) {
  Game.time += dt;
  const p = Game.player;

  // Nearest stealable car (for the E prompt).
  Game.nearestParked = null;
  if (!Game.playerCar) {
    let best = Infinity;
    for (const c of Game.parked) {
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < best) { best = d; Game.nearestParked = c; }
    }
    if (best > 55) Game.nearestParked = null;
  }

  // Player movement: driving or walking.
  if (Game.playerCar) {
    const car = Game.playerCar;
    const throttle = (Game.keys.up ? 1 : 0) - (Game.keys.down ? 0.7 : 0);
    const steer = (Game.keys.left ? -1 : 0) + (Game.keys.right ? 1 : 0);
    const before = car.speed;
    driveCar(car, throttle, steer, !!Game.keys.brake, dt, playerTune());
    wreckedCap(car);
    if (car.skidding && Math.random() < 0.5) {
      Game.skidMarks.push({ x: car.x, y: car.y, angle: car.angle, life: 5 });
      if (Math.random() < 0.2) AudioSys.skid();
    }
    // Hard hit into a building: damage + sound + flash.
    if (Math.abs(before - car.speed) > 130 && Game.time - Game.lastCrashSound > 0.4) {
      Game.lastCrashSound = Game.time;
      damageCar(car, 8);
      AudioSys.crash();
      HUD.flashDamage();
      burstParticles(car.x, car.y, 8, '#ffb84d');
    }
    p.x = car.x; p.y = car.y; p.angle = car.angle;
  } else {
    const mx = (Game.keys.right ? 1 : 0) - (Game.keys.left ? 1 : 0);
    const my = (Game.keys.down ? 1 : 0) - (Game.keys.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      const nx = p.x + (mx / len) * CONFIG.walkSpeed * dt;
      const ny = p.y + (my / len) * CONFIG.walkSpeed * dt;
      p.angle = Math.atan2(my, mx);
      if (!City.collideCircle(nx, p.y, 10)) p.x = nx;
      if (!City.collideCircle(p.x, ny, 10)) p.y = ny;
      p.x = clamp(p.x, CONFIG.waterWidth + 4, CONFIG.worldWidth - 4);
      p.y = clamp(p.y, 4, CONFIG.worldHeight - 4);
    }
  }

  // Roadblocks: smash through (damage + passed) or slip the kerb gap.
  const rb = Game.playerCar ? City.roadblockHit(Game.playerCar.x, Game.playerCar.y, 14) : null;
  if (rb) {
    rb.broken = true;
    damageCar(Game.playerCar, 12);
    AudioSys.crash();
    HUD.flashDamage();
    burstParticles(rb.x, rb.y, 14, '#ff5d5d');
    Missions.roadblockPassed(Game);
  } else if (Game.playerCar) {
    // Passed a roadblock's line without touching it: count the slip-through.
    for (const r of City.data.roadblocks) {
      if (r.broken || r.counted) continue;
      const d = dist(Game.playerCar.x, Game.playerCar.y, r.x, r.y);
      if (d < 60) { r.counted = true; Missions.roadblockPassed(Game); }
    }
  }

  // Repair pickups.
  for (const pk of City.data.pickups) {
    if (!pk.taken && Game.playerCar && dist(p.x, p.y, pk.x, pk.y) < 46) {
      pk.taken = true;
      Game.playerCar.hp = 100;
      Game.playerCar.dead = false;
      AudioSys.pickup();
      Missions.state.message = 'Car repaired.';
      Missions.state.messageTimer = 2;
    }
  }

  // Police, traffic, pedestrians.
  for (const cop of Game.police) policeStep(cop, p, dt);
  for (const t of Game.traffic) trafficStep(t, dt, Game.rng);
  for (const ped of Game.peds) pedestrianStep(ped, [...Game.traffic, ...Game.police, ...(Game.playerCar ? [Game.playerCar] : [])], dt, Game.rng);

  // Car-vs-car bumps: damage both, push apart, sparks.
  const allCars = [...Game.traffic, ...Game.police];
  if (Game.playerCar) allCars.push(Game.playerCar);
  for (let i = 0; i < allCars.length; i++) {
    for (let j = i + 1; j < allCars.length; j++) {
      const a = allCars[i], b = allCars[j];
      if (carsOverlap(a, b)) {
        separateCars(a, b);
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 90 && Game.time - Game.lastCrashSound > 0.4) {
          Game.lastCrashSound = Game.time;
          if (a === Game.playerCar || b === Game.playerCar) {
            damageCar(Game.playerCar, 6);
            AudioSys.crash();
            HUD.flashDamage();
          }
          burstParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd94a');
        }
      }
    }
  }

  // Skid marks and particles age out.
  for (const s of Game.skidMarks) s.life -= dt;
  Game.skidMarks = Game.skidMarks.filter((s) => s.life > 0);
  for (const pt of Game.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  Game.particles = Game.particles.filter((pt) => pt.life > 0);

  // Wanted, missions, busted.
  updateWanted(dt);
  const result = Missions.update(Game, dt);
  if (result === 'complete') {
    AudioSys.missionComplete();
    Game.mode = 'complete';
    HUD.showComplete(Missions.state.message);
  } else if (result === 'failed') {
    AudioSys.missionFailed();
    Game.mode = 'complete';
    HUD.showComplete(Missions.state.message + ' Press Enter to retry.');
  }
  updateBusted(dt);

  // Audio follows the drive.
  let nearestPolice = null;
  for (const cop of Game.police) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (nearestPolice === null || d < nearestPolice) nearestPolice = d;
  }
  AudioSys.update(Game.playerCar ? Game.playerCar.speed : 0, nearestPolice, dt);

  // Camera follows the player, clamped to the world.
  Game.camera.x = clamp(p.x - CONFIG.viewWidth / 2, 0, CONFIG.worldWidth - CONFIG.viewWidth);
  Game.camera.y = clamp(p.y - CONFIG.viewHeight / 2, 0, CONFIG.worldHeight - CONFIG.viewHeight);
}

function burstParticles(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 120;
    Game.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
  }
}

// --- Rendering ------------------------------------------------------------

// Everything is drawn top-down, north-up, in world space translated by the
// camera. The view shows about five city blocks at once.
function render() {
  const camX = Game.camera.x, camY = Game.camera.y;
  ctx.clearRect(0, 0, CONFIG.viewWidth, CONFIG.viewHeight);

  // Water: deep blue with slow moving wave bands.
  ctx.fillStyle = CONFIG.palette.waterDeep;
  ctx.fillRect(0, 0, CONFIG.viewWidth, CONFIG.viewHeight);
  ctx.fillStyle = CONFIG.palette.water;
  const waterW = CONFIG.waterWidth - camX;
  if (waterW > 0) {
    ctx.fillRect(0, 0, Math.min(waterW, CONFIG.viewWidth), CONFIG.viewHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (let y = 0; y < CONFIG.viewHeight + 90; y += 90) {
      const wy = y - ((Game.time * 24) % 90);
      ctx.beginPath();
      ctx.moveTo(0, wy);
      ctx.bezierCurveTo(waterW * 0.3, wy + 14, waterW * 0.6, wy - 14, waterW, wy);
      ctx.stroke();
    }
  }

  // Sand.
  const sandX0 = CONFIG.waterWidth - camX;
  const sandW = CONFIG.beachWidth;
  if (sandX0 + sandW > 0 && sandX0 < CONFIG.viewWidth) {
    ctx.fillStyle = CONFIG.palette.sand;
    ctx.fillRect(Math.max(0, sandX0), 0, Math.min(sandW, CONFIG.viewWidth - Math.max(0, sandX0)), CONFIG.viewHeight);
    ctx.fillStyle = CONFIG.palette.sandDark;
    for (let i = 0; i < 40; i++) {
      const wx = CONFIG.waterWidth + 8 + ((i * 97) % CONFIG.beachWidth);
      const wy = (i * 173) % CONFIG.worldHeight;
      const sx = wx - camX, sy = wy - camY;
      if (sx > -10 && sx < CONFIG.viewWidth + 10 && sy > -10 && sy < CONFIG.viewHeight + 10) {
        ctx.fillRect(sx, sy, 3, 2);
      }
    }
  }

  // Land base.
  const landX0 = CONFIG.waterWidth + CONFIG.beachWidth - camX;
  if (landX0 < CONFIG.viewWidth) {
    ctx.fillStyle = '#6d7a5e';
    ctx.fillRect(Math.max(0, landX0), 0, CONFIG.viewWidth - Math.max(0, landX0), CONFIG.viewHeight);
  }

  ctx.save();
  ctx.translate(-camX, -camY);
  const vx0 = camX - 60, vy0 = camY - 60, vx1 = camX + CONFIG.viewWidth + 60, vy1 = camY + CONFIG.viewHeight + 60;
  const inView = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

  // Parks and plazas.
  for (const p of City.data.parks) {
    if (!inView(p.x + p.w / 2, p.y + p.h / 2, Math.max(p.w, p.h))) continue;
    ctx.fillStyle = p.plaza ? CONFIG.palette.plaza : CONFIG.palette.park;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if (!p.plaza) {
      ctx.fillStyle = '#4e7a3e';
      for (let i = 0; i < 8; i++) {
        const tx = p.x + 20 + ((i * 53) % Math.max(20, p.w - 40));
        const ty = p.y + 16 + ((i * 71) % Math.max(20, p.h - 32));
        ctx.beginPath();
        ctx.arc(tx, ty, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Sidewalks: pale borders around every block.
  ctx.fillStyle = CONFIG.palette.sidewalk;
  for (let ai = 0; ai < City.data.avenues.length - 1; ai++) {
    for (let si = 0; si < City.data.streets.length - 1; si++) {
      const bx0 = City.data.avenues[ai] + CONFIG.roadWidth / 2;
      const by0 = City.data.streets[si] + CONFIG.roadWidth / 2;
      const bx1 = City.data.avenues[ai + 1] - CONFIG.roadWidth / 2;
      const by1 = City.data.streets[si + 1] - CONFIG.roadWidth / 2;
      if (inView((bx0 + bx1) / 2, (by0 + by1) / 2, Math.max(bx1 - bx0, by1 - by0))) {
        ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      }
    }
  }

  // Roads: asphalt with edge lines and dashed centre lines.
  ctx.fillStyle = CONFIG.palette.road;
  for (const ax of City.data.avenues) ctx.fillRect(ax - CONFIG.roadWidth / 2, 0, CONFIG.roadWidth, CONFIG.worldHeight);
  for (const sy of City.data.streets) ctx.fillRect(0, sy - CONFIG.roadWidth / 2, CONFIG.worldWidth, CONFIG.roadWidth);
  ctx.strokeStyle = CONFIG.palette.lane;
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (const ax of City.data.avenues) {
    if (ax < vx0 || ax > vx1) continue;
    ctx.beginPath(); ctx.moveTo(ax, vy0); ctx.lineTo(ax, vy1); ctx.stroke();
  }
  for (const sy of City.data.streets) {
    if (sy < vy0 || sy > vy1) continue;
    ctx.beginPath(); ctx.moveTo(vx0, sy); ctx.lineTo(vx1, sy); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Buildings: roof colour, darker edge, windows and a roof detail.
  for (const b of City.data.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    if (b.roof) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, Math.max(8, b.h * 0.2));
    }
    ctx.fillStyle = 'rgba(255,255,220,0.5)';
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 30));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 10 + i * 34, b.y + 10 + j * 30, 8, 6);
      }
    }
  }

  // Repair pickups: green wrench circles.
  for (const pk of City.data.pickups) {
    if (pk.taken || !inView(pk.x, pk.y, 40)) continue;
    ctx.fillStyle = '#2fae4e';
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', pk.x, pk.y + 1);
  }

  // Roadblocks: striped barriers.
  for (const rb of City.data.roadblocks) {
    if (rb.broken || !inView(rb.x, rb.y, 80)) continue;
    ctx.save();
    ctx.translate(rb.x, rb.y);
    ctx.rotate(rb.angle);
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ff3b30' : '#ffffff';
      ctx.fillRect(i * 20 - 10, -10, 20, 20);
    }
    ctx.fillStyle = '#333';
    ctx.fillRect(-52, 10, 6, 14);
    ctx.fillRect(46, 10, 6, 14);
    ctx.restore();
  }

  // Landmark markers: gold rings with labels.
  ctx.textAlign = 'center';
  for (const key of Object.keys(City.data.landmarks)) {
    const lm = City.data.landmarks[key];
    if (!inView(lm.x, lm.y, 120)) continue;
    const pulse = 1 + Math.sin(Game.time * 3 + key.length) * 0.12;
    ctx.strokeStyle = lm.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(lm.x, lm.y, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = 'bold 13px sans-serif';
    const tw = ctx.measureText(lm.label).width + 12;
    ctx.fillRect(lm.x - tw / 2, lm.y - 46, tw, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(lm.label, lm.x, lm.y - 36);
  }

  // Mission target: a tall gold beacon the player can see across the city.
  if (Missions.state.target) {
    const t = Missions.state.target;
    const pulse = 30 + Math.sin(Game.time * 4) * 6;
    ctx.strokeStyle = 'rgba(255,217,74,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(t.x, t.y, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,217,74,0.35)';
    ctx.beginPath(); ctx.arc(t.x, t.y, pulse * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,74,0.35)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 14]);
    ctx.beginPath(); ctx.moveTo(Game.player.x, Game.player.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Skid marks.
  ctx.fillStyle = 'rgba(20,20,20,0.5)';
  for (const s of Game.skidMarks) {
    if (!inView(s.x, s.y, 30)) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillRect(-12, -9, 24, 3);
    ctx.fillRect(-12, 6, 24, 3);
    ctx.restore();
  }

  // Particles (smoke and sparks).
  for (const pt of Game.particles) {
    if (!inView(pt.x, pt.y, 20)) continue;
    ctx.globalAlpha = clamp(pt.life * 2, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  // Pedestrians: small walking figures.
  for (const ped of Game.peds) {
    if (!inView(ped.x, ped.y, 20)) continue;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.color;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Cars: parked, traffic, police, then the player car on top.
  for (const car of [...Game.parked, ...Game.traffic, ...Game.police]) {
    if (!inView(car.x, car.y, 60)) continue;
    drawCar(car);
  }
  if (Game.playerCar) drawCar(Game.playerCar);

  // Mara on foot: a figure with a pink jacket.
  if (!Game.playerCar) {
    ctx.save();
    ctx.translate(Game.player.x, Game.player.y);
    ctx.rotate(Game.player.angle);
    ctx.fillStyle = '#e85d75';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(4, -4, 4, 8);
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (Game.nearestParked) {
      const c = Game.nearestParked;
      ctx.strokeStyle = '#ffd94a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, 34 + Math.sin(Game.time * 5) * 3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Police bust ring: the hold-to-bust progress circle.
  if (Game.bustTimer > 0) {
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(Game.player.x, Game.player.y, 40, -Math.PI / 2, -Math.PI / 2 + (Game.bustTimer / CONFIG.bustHoldSeconds) * Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  // Vignette: soft dark edges so the centre of the action pops.
  const grad = ctx.createRadialGradient(
    CONFIG.viewWidth / 2, CONFIG.viewHeight / 2, CONFIG.viewHeight * 0.45,
    CONFIG.viewWidth / 2, CONFIG.viewHeight / 2, CONFIG.viewHeight * 0.85,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CONFIG.viewWidth, CONFIG.viewHeight);
}

// One car, drawn top-down: body with rounded nose, windshield, roof,
// headlights, and for police a flashing red/blue light bar.
function drawCar(car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.length, W = car.width;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 3, L, W);
  ctx.fillStyle = car.color;
  roundRect(-L / 2, -W / 2, L, W, 7);
  ctx.fill();
  if (car.gold) {
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(-L / 2 + 4, -3, L - 8, 6);
  }
  ctx.fillStyle = '#20242e';
  ctx.fillRect(L * 0.12, -W / 2 + 3, L * 0.16, W - 6);
  ctx.fillRect(-L * 0.32, -W / 2 + 3, L * 0.12, W - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-L * 0.14, -W / 2 + 4, L * 0.22, W - 8);
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 3, 5);
  if (car.hp < 35) {
    ctx.fillStyle = 'rgba(120,120,120,0.7)';
    ctx.beginPath();
    ctx.arc(-L / 4 + Math.sin(Game.time * 9) * 3, 0, 6 + Math.sin(Game.time * 7) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.kind === 'police') {
    const red = Math.sin(car.sirenPhase * Math.PI) > 0;
    ctx.fillStyle = red ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-4, -W / 2 + 2, 8, 5);
    ctx.fillStyle = red ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(-4, W / 2 - 7, 8, 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BAY PD', 0, 3);
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- Screenshot modes -----------------------------------------------------

// ?shot=start|drive|chase|mission stages the game for a screenshot: the
// scene is set up deterministically, the loop runs, and the frame the
// browser captures shows the game at its best.
function applyShotMode() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return;
  Game.shot = shot;
  const seed = Number(params.get('seed') || 1);
  Game.shotSeed = seed;
  setupWorld(20261118 + seed * 7919);
  if (shot === 'start') {
    Game.mode = 'title';
    Missions.state.cash = 2450;
    Missions.state.completed = [1, 2];
    Missions.state.index = 2;
    HUD.fillTitle();
    HUD.showScreen('titleScreen');
    return;
  }
  Game.mode = 'playing';
  HUD.showScreen(null);
  const road = City.data.avenues[3];
  const street = City.data.streets[3];
  const car = Game.parked[0];
  car.kind = 'player';
  car.x = road; car.y = street + 200; car.angle = Math.PI / 2;
  car.speed = 260;
  Game.parked = Game.parked.filter((c) => c !== car);
  Game.playerCar = car;
  Game.player.x = car.x; Game.player.y = car.y; Game.player.angle = car.angle;
  Game.camera.x = clamp(car.x - CONFIG.viewWidth / 2, 0, CONFIG.worldWidth - CONFIG.viewWidth);
  Game.camera.y = clamp(car.y - CONFIG.viewHeight / 2, 0, CONFIG.worldHeight - CONFIG.viewHeight);
  if (shot === 'drive') {
    Missions.state.active = false;
    Game.wanted = 0;
    return;
  }
  if (shot === 'chase') {
    Game.wanted = 3;
    Game.wantedHeat = 1;
    for (let i = 0; i < 3; i++) {
      const spot = City.roadPointNear(car.x, car.y, 260 + i * 90, Game.rng);
      const cop = makeCar('police', spot.x, spot.y, spot.angle, '#1c2f6e');
      cop.speed = 300;
      Game.police.push(cop);
    }
    Missions.state.active = false;
    return;
  }
  if (shot === 'mission') {
    Missions.state.index = 1;
    Missions.state.active = true;
    Missions.state.stage = 0;
    Missions.state.timer = 74;
    Missions.state.message = 'Delivery Run — get the car to the Chop Shop in Old Town.';
    Missions.state.messageTimer = 6;
    Game.wanted = 1;
    Game.wantedHeat = 0.8;
    Missions.setTarget(Game);
    const spot = City.roadPointNear(car.x, car.y, 300, Game.rng);
    const cop = makeCar('police', spot.x, spot.y, spot.angle, '#1c2f6e');
    cop.speed = 280;
    Game.police.push(cop);
  }
}

// --- Main loop ------------------------------------------------------------

let lastTime = 0;
let fpsAccum = 0, fpsCount = 0, fpsTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  fpsAccum += dt; fpsCount++; fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    Game.fps = Math.round(fpsCount / fpsAccum);
    fpsAccum = 0; fpsCount = 0; fpsTimer = 0;
    const el = document.getElementById('fps');
    if (el) el.textContent = Game.fps + ' FPS';
  }
  if (Game.mode === 'playing') update(dt);
  else if (Game.mode === 'title') Game.time += dt;
  render();
  if (Game.mode !== 'title') HUD.update(Game, dt);
}

// --- Boot -----------------------------------------------------------------

function boot() {
  canvas.width = CONFIG.viewWidth;
  canvas.height = CONFIG.viewHeight;
  setupWorld(20261118);
  Missions.load();
  HUD.init();
  HUD.fillTitle();
  HUD.showScreen('titleScreen');
  applyShotMode();
  // In shot mode the game drives itself for the screenshot: hold the gas.
  if (Game.shot && Game.shot !== 'start') {
    Game.keys.up = true;
    setInterval(() => { if (Game.mode === 'playing') Game.keys.up = true; }, 500);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
