// Neon Tide: Palmera Bay — game loop, input, camera, screens and save.
// This file wires the modules together: it owns the canvas, the clock,
// the wanted/police pressure, stealing cars, punching, pickups, and the
// win/lose flow. Everything it needs lives in the other modules.

import {
  WORLD_W, WORLD_H, SAVE_KEY, KEYS, CAR_MODELS, WANTED_MAX, WANTED_DECAY_SECONDS,
  POLICE_PER_STAR, PLAYER_MAX_HEALTH, START_CASH, SHOT_SCENES, AVENUES, STREETS,
  DISTRICTS, clamp, dist, mulberry32, pick,
} from './config.js';
import { buildCity, districtAt, isSea, hitBuilding, randomRoadPoint, randomWalkPoint, drawGround, drawRoads, drawCityDetail } from './city.js';
import { makePlayer, makeCar, makeTrafficCar, makeParkedCar, makePed, updatePlayerOnFoot, updatePlayerCar, updateTrafficCar, updatePoliceCar, updatePed, drawCar, drawPlayer, drawPed, nearestStealableCar } from './entities.js';
import { MISSIONS, makeMissionState, currentTarget, currentStepText, currentMissionTitle, updateMissions, applyStepHeat, drawMissionTarget } from './missions.js';
import { makeAudio, makeNoiseBurst } from './audio.js';
import { makeHud, renderHud, drawMinimap, showToast, showScreen } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = makeHud();
const audio = makeAudio();

let city = buildCity(7);
let rng = mulberry32(20261117);
let player = makePlayer(1020, 840);
let missions = makeMissionState();
let cars = [];
let peds = [];
let police = [];
let pickups = [];
let particles = [];

let mode = 'title'; // title | playing | paused | over | won
let shot = null;    // ?shot=start|drive|chase|mission
let shotSeed = 1;
let cam = { x: 0, y: 0 };
let time = 0;
let lastTs = 0;
let bustedTimer = 0;
let deathReason = '';
let autopilot = false;
let autoTarget = null; // screenshot mode: steer straight at this point
let muted = false;
let events = [];

// ---- Input ----

const keys = new Set();
const input = { up: false, down: false, left: false, right: false, run: false };

function refreshInput() {
  const has = (list) => list.some((k) => keys.has(k));
  input.up = has(KEYS.up);
  input.down = has(KEYS.down);
  input.left = has(KEYS.left);
  input.right = has(KEYS.right);
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  refreshInput();
  audio.ensure();
  if (KEYS.enterCar.includes(e.code) && mode === 'playing') tryEnterExitCar();
  if (KEYS.punch.includes(e.code) && mode === 'playing') doPunch();
  if (KEYS.horn.includes(e.code) && mode === 'playing' && player.inCar) audio.horn();
  if (KEYS.pause.includes(e.code)) togglePause();
  if (KEYS.mute.includes(e.code)) { muted = !muted; audio.setMuted(muted); showToast(hud, muted ? 'Sound muted' : 'Sound on'); }
  if (KEYS.save.includes(e.code) && mode === 'playing') saveGame(true);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); refreshInput(); });
window.addEventListener('blur', () => { keys.clear(); refreshInput(); });

function resize() {
  canvas.width = Math.floor(window.innerWidth * window.devicePixelRatio);
  canvas.height = Math.floor(window.innerHeight * window.devicePixelRatio);
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---- Screens and save ----

function toTitle() {
  mode = 'title';
  showScreen('start');
  document.getElementById('btn-continue').disabled = !loadSaveData();
}

function startNewGame() {
  city = buildCity(7);
  rng = mulberry32(20261117);
  player = makePlayer(1020, 840);
  missions = makeMissionState();
  cars = [];
  peds = [];
  police = [];
  pickups = [];
  particles = [];
  bustedTimer = 0;
  autoTarget = null;
  events = [];
  spawnWorld();
  mode = 'playing';
  showScreen(null);
  audio.ensure();
  showToast(hud, 'Job 1: steal a car. Press E near one.', 4200);
}

function togglePause() {
  if (mode === 'playing') {
    mode = 'paused';
    showScreen('pause');
    document.getElementById('pause-stats').textContent =
      `${currentMissionTitle(missions)} — ${currentStepText(missions)} · Cash $${Math.floor(player.cash)} · Wanted ${player.wanted}★`;
  } else if (mode === 'paused') {
    mode = 'playing';
    showScreen(null);
  }
}

function endGame(won, reason) {
  mode = won ? 'won' : 'over';
  deathReason = reason;
  showScreen('end');
  document.getElementById('end-title').textContent = won ? 'The Big Score!' : 'Busted';
  document.getElementById('end-text').textContent = won
    ? 'Mara walks out of the Sunset Safehouse with the whole score. Palmera Bay is hers — for now.'
    : reason;
  document.getElementById('end-stats').textContent =
    `Missions finished: ${missions.index} of ${MISSIONS.length} · Cash $${Math.floor(player.cash)} · Wanted ${player.wanted}★`;
  if (won) audio.jingle(); else audio.busted();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage may be blocked */ }
}

function saveGame(announce) {
  try {
    const data = {
      x: player.x, y: player.y, cash: player.cash, health: player.health,
      wanted: player.wanted, mission: missions.index, step: missions.step,
      time: Math.floor(time),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (announce) showToast(hud, 'Game saved.');
  } catch (e) { if (announce) showToast(hud, 'Save failed — storage blocked.'); }
}

function loadSaveData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function continueGame() {
  const data = loadSaveData();
  if (!data) return;
  startNewGame();
  player.x = data.x; player.y = data.y;
  player.cash = data.cash; player.health = data.health;
  player.wanted = data.wanted;
  missions.index = Math.min(data.mission, MISSIONS.length - 1);
  missions.step = data.step;
  showToast(hud, `Welcome back, Mara. ${currentMissionTitle(missions)}`, 3600);
}

document.getElementById('btn-new').addEventListener('click', startNewGame);
document.getElementById('btn-continue').addEventListener('click', continueGame);
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-save').addEventListener('click', () => saveGame(true));
document.getElementById('btn-quit').addEventListener('click', toTitle);
document.getElementById('btn-again').addEventListener('click', startNewGame);
document.getElementById('btn-title').addEventListener('click', toTitle);

// ---- World population ----

function spawnWorld() {
  for (let i = 0; i < 16; i++) cars.push(makeTrafficCar(city, rng));
  for (let i = 0; i < 10; i++) cars.push(makeParkedCar(city, rng));
  for (let i = 0; i < 26; i++) peds.push(makePed(city, rng));
  for (let i = 0; i < 8; i++) {
    const p = randomWalkPoint(city, rng);
    pickups.push({ x: p.x, y: p.y, value: 50, kind: 'cash' });
  }
  // Mission 4's truck starts parked at the Docks, waiting to be stolen.
  const truck = makeCar(CAR_MODELS.find((m) => m.id === 'truck'), 2820, 900, Math.PI / 2, { driver: 'parked' });
  cars.push(truck);
}

// ---- Actions: stealing cars, punching ----

function tryEnterExitCar() {
  if (player.inCar) {
    const car = player.inCar;
    car.driver = 'parked';
    car.speed = 0;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.angle = car.angle;
    player.inCar = null;
    audio.blip(440, 0.08, 'square', 0.08);
    return;
  }
  const car = nearestStealableCar(cars, player.x, player.y, 74);
  if (!car) { showToast(hud, 'No car close enough — walk up to one.', 1800); return; }
  car.driver = 'player';
  player.inCar = car;
  player.x = car.x; player.y = car.y;
  if (car.model.id !== 'taxi') raiseWanted(1, 'Car stolen — the owner called it in.');
  else showToast(hud, 'Taxi jacked. The meter is running.', 2200);
  audio.pickup();
}

function doPunch() {
  if (player.inCar || player.punchTimer > 0) return;
  player.punchTimer = 0.35;
  player.punchHit = false;
  audio.punch();
}

function resolvePunch(dt) {
  if (player.punchTimer <= 0) return;
  player.punchTimer -= dt;
  if (player.punchHit || player.punchTimer < 0.12) return;
  player.punchHit = true;
  for (const ped of peds) {
    if (ped.down > 0) continue;
    const d = dist(ped.x, ped.y, player.x, player.y);
    if (d < 46) {
      ped.down = 4;
      player.cash += 20;
      raiseWanted(1, 'Assault reported — a witness called the Bay PD.');
      showToast(hud, 'You took $20 off a pedestrian. That was loud.', 2000);
      makeNoiseBurst(audio, 0.12, 0.1);
    }
  }
}

function raiseWanted(level, why) {
  if (player.wanted < level) {
    player.wanted = level;
    player.wantedTimer = 0;
    if (why) showToast(hud, why, 2600);
  }
}

// ---- Police pressure ----

function policeTargetCount() {
  return Math.min(6, player.wanted * POLICE_PER_STAR);
}

function spawnPoliceCar() {
  // Spawn on a road 350-600 units from Mara, so the chase arrives
  // instead of appearing on top of her.
  for (let tries = 0; tries < 12; tries++) {
    const p = randomRoadPoint(rng);
    const d = dist(p.x, p.y, player.x, player.y);
    if (d > 340 && d < 700) {
      const car = makeCar(CAR_MODELS.find((m) => m.id === 'police'), p.x, p.y, 0, { driver: 'police' });
      police.push(car);
      cars.push(car);
      return;
    }
  }
  const p = randomRoadPoint(rng);
  const car = makeCar(CAR_MODELS.find((m) => m.id === 'police'), p.x, p.y, 0, { driver: 'police' });
  police.push(car);
  cars.push(car);
}

function updatePolice(dt) {
  while (police.length < policeTargetCount()) spawnPoliceCar();
  // Wanted decays only when no police car is anywhere near Mara.
  const nearest = police.reduce((m, c) => Math.min(m, dist(c.x, c.y, player.x, player.y)), Infinity);
  if (player.wanted > 0 && nearest > 520) {
    player.wantedTimer += dt;
    if (player.wantedTimer > WANTED_DECAY_SECONDS) {
      player.wanted -= 1;
      player.wantedTimer = 0;
      showToast(hud, player.wanted === 0 ? 'You lost them. Clean — for now.' : `Heat dropping: ${player.wanted}★`, 2400);
    }
  } else {
    player.wantedTimer = 0;
  }
  const tx = player.inCar ? player.inCar.x : player.x;
  const ty = player.inCar ? player.inCar.y : player.y;
  for (const car of police) {
    const d = updatePoliceCar(car, { x: tx, y: ty }, dt, city);
    if (d < 46) {
      if (player.inCar) {
        // A ram: shove the player's car and chip her health.
        player.health -= 14 * dt;
        player.inCar.speed *= 0.985;
        if (Math.random() < dt * 2) makeNoiseBurst(audio, 0.15, 0.12);
      } else {
        bustedTimer += dt;
        showToast(hud, 'The Bay PD has you cornered — RUN!', 900);
        if (bustedTimer > 1.6) {
          endGame(false, 'Cornered on foot by the Bay Police. The cuffs click shut on Palmera Pier.');
          return;
        }
      }
    }
  }
  if (player.wanted === 0) {
    // Stand down: police cruise away and despawn off-screen.
    for (const car of [...police]) {
      if (dist(car.x, car.y, player.x, player.y) > 800) {
        police.splice(police.indexOf(car), 1);
        cars.splice(cars.indexOf(car), 1);
      }
    }
  }
  audio.siren(police.length > 0 && nearest < 700, time);
}

// ---- Collisions between cars, and pickups ----

function resolveCarCollisions() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const min = (a.model.w + b.model.w) / 2 - 6;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / 2;
      const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      if (a.driver === 'player' || b.driver === 'player') {
        const pc = a.driver === 'player' ? a : b;
        const other = a.driver === 'player' ? b : a;
        if (Math.abs(pc.speed) > 260) { pc.crashed = 0.3; audio.crash(); makeNoiseBurst(audio, 0.2, 0.14); }
        pc.speed *= 0.6;
        // Shove a parked car out of the way instead of getting wedged
        // behind it: it becomes traffic and rolls off down the road.
        if (other.driver === 'parked' && Math.abs(pc.speed) > 60) {
          other.driver = 'traffic';
          other.angle = pc.angle;
          other.speed = Math.abs(pc.speed) * 0.5;
          other.cruise = 150;
        }
      }
      if (a.police || b.police) {
        const pc = a.police ? a : b;
        pc.speed *= 0.7;
      }
    }
  }
}

function updatePickups() {
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  for (const pk of pickups) {
    if (pk.taken) continue;
    if (dist(pk.x, pk.y, px, py) < 42) {
      pk.taken = true;
      player.cash += pk.value;
      audio.pickup();
      showToast(hud, `Found $${pk.value} on the street.`, 1800);
    }
  }
}

// ---- Frame update ----

function update(dt) {
  if (mode !== 'playing') return;
  time += dt;
  applyStepHeat(missions, player);

  if (autopilot) {
    // Screenshot mode drives itself: hold W, steer toward the shot
    // target (a straight run down one street) or the mission marker.
    input.up = true;
    const t = autoTarget || currentTarget(city, missions);
    if (t && player.inCar) {
      const want = Math.atan2(t.y - player.y, t.x - player.x);
      const diff = ((want - player.inCar.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      input.left = diff < -0.15;
      input.right = diff > 0.15;
    }
  }

  if (player.inCar) {
    updatePlayerCar(player.inCar, input, dt, city);
    player.x = player.inCar.x;
    player.y = player.inCar.y;
    player.angle = player.inCar.angle;
    if (Math.abs(player.inCar.speed) > 300 && (input.left || input.right)) {
      particles.push({ x: player.x, y: player.y, life: 0.4, kind: 'smoke' });
    }
  } else {
    updatePlayerOnFoot(player, input, dt, city);
  }
  resolvePunch(dt);

  for (const car of cars) {
    if (car.driver === 'traffic') updateTrafficCar(car, dt, city, rng);
  }
  for (const ped of peds) updatePed(ped, dt, city, player, rng);
  updatePolice(dt);
  if (mode !== 'playing') return; // endGame may have fired inside updatePolice
  resolveCarCollisions();
  updatePickups();

  // Health: busted on foot, or wrecked outright.
  if (player.health <= 0) {
    endGame(false, 'Mara is down. The Bay Police tow the wreck and close the file.');
    return;
  }
  if (isSea(player.x, player.y)) {
    player.health -= 25 * dt;
  }

  // Mission progress and its events.
  const result = updateMissions(city, missions, player, dt, events);
  while (events.length) {
    const ev = events.shift();
    showToast(hud, ev.text, 4200);
    audio.jingle();
  }
  if (result === 'win') {
    endGame(true, '');
    return;
  }
  if (result === 'step' || result === 'mission') {
    showToast(hud, `${currentMissionTitle(missions)}: ${currentStepText(missions)}`, 3600);
  }

  // Keep traffic and crowds topped up near Mara — but not while a
  // staged screenshot scene is running, where new spawns would wander
  // into the shot's clear run.
  if (!autopilot && cars.filter((c) => c.driver === 'traffic').length < 12) cars.push(makeTrafficCar(city, rng));
  if (peds.length < 22) peds.push(makePed(city, rng));

  audio.engine(player.inCar ? player.inCar.speed : 0, !!player.inCar);
  for (const pt of particles) pt.life -= dt;
  particles = particles.filter((pt) => pt.life > 0);

  // Camera follows Mara, clamped to the world.
  const vw = window.innerWidth, vh = window.innerHeight;
  const tx = player.x, ty = player.y;
  cam.x += (clamp(tx - vw / 2, 0, WORLD_W - vw) - cam.x) * Math.min(1, dt * 6);
  cam.y += (clamp(ty - vh / 2, 0, WORLD_H - vh) - cam.y) * Math.min(1, dt * 6);
}

// ---- Rendering ----

function render() {
  const vw = window.innerWidth, vh = window.innerHeight;
  ctx.clearRect(0, 0, vw, vh);
  if (mode === 'title') {
    // Behind the title card, show the city at the pier in daylight.
    cam.x = 220; cam.y = 480;
    drawGround(ctx, cam);
    drawRoads(ctx, cam);
    drawCityDetail(ctx, cam, city, time);
    const demo = cars[0];
    if (demo) drawCar(ctx, cam, demo, time);
    drawPlayer(ctx, cam, player, time);
    return;
  }
  drawGround(ctx, cam);
  drawRoads(ctx, cam);
  drawCityDetail(ctx, cam, city, time);
  drawMissionTarget(ctx, cam, city, missions, time);
  for (const pk of pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = '#7dd87d';
    ctx.beginPath(); ctx.arc(pk.x - cam.x, pk.y - cam.y, 10 + Math.sin(time * 4) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d0d16';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', pk.x - cam.x, pk.y + 4 - cam.y);
  }
  for (const ped of peds) drawPed(ctx, cam, ped);
  for (const car of cars) drawCar(ctx, cam, car, time);
  drawPlayer(ctx, cam, player, time);
  for (const pt of particles) {
    ctx.fillStyle = `rgba(200,200,200,${Math.max(0, pt.life)})`;
    ctx.beginPath(); ctx.arc(pt.x - cam.x, pt.y - cam.y, 6, 0, Math.PI * 2); ctx.fill();
  }
  // District name tag, bottom-left of the viewport.
  const d = districtAt(player.x, player.y);
  ctx.fillStyle = 'rgba(13,13,22,0.75)';
  ctx.fillRect(16, vh - 96, 190, 30);
  ctx.fillStyle = d.accent;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(d.name, 28, vh - 75);
  // Red flash at the screen edge while the heat is on.
  if (player.wanted >= 3 && mode === 'playing') {
    const a = 0.10 + Math.sin(time * 6) * 0.05;
    ctx.strokeStyle = `rgba(255,46,46,${a})`;
    ctx.lineWidth = 26;
    ctx.strokeRect(0, 0, vw, vh);
  }
}

function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  update(dt);
  render();
  if (mode === 'playing') {
    renderHud(hud, {
      player, missionTitle: currentMissionTitle(missions), missionText: currentStepText(missions), hint: '',
    });
    drawMinimap(hud, { ...city, districts: DISTRICTS }, {
      player, police, target: currentTarget(city, missions), avenues: AVENUES, streets: STREETS,
    });
  }
  requestAnimationFrame(frame);
}

// ---- Screenshot mode (?shot=...) ----
// Deterministic staged scenes so the maker can capture the game itself:
// start = title screen, drive = Mara cruising Neon Row, chase = three
// stars with police on her tail, mission = a job in progress.

function applyShotMode() {
  const q = new URLSearchParams(window.location.search);
  const s = q.get('shot');
  if (!s || !SHOT_SCENES.includes(s)) return;
  shot = s;
  shotSeed = Number(q.get('seed') || 1);
  rng = mulberry32(shotSeed * 1013 + 7);
  startNewGame();
  autopilot = true;
  if (s === 'start') {
    autopilot = false;
    toTitle();
    return;
  }
  if (s === 'drive') {
    autoTarget = { x: 3000, y: 840 };
    const sport = makeCar(CAR_MODELS.find((m) => m.id === 'sport'), 1620, 840, 0, { driver: 'player' });
    cars.push(sport);
    player.inCar = sport;
    player.x = sport.x; player.y = sport.y;
    cam.x = clamp(player.x - 640, 0, WORLD_W - 1280);
    cam.y = clamp(player.y - 360, 0, WORLD_H - 720);
    return;
  }
  if (s === 'chase') {
    autoTarget = { x: 3000, y: 1340 };
    const sport = makeCar(CAR_MODELS.find((m) => m.id === 'sport'), 1620, 1340, 0, { driver: 'player' });
    cars.push(sport);
    player.inCar = sport;
    player.x = sport.x; player.y = sport.y;
    player.wanted = 3;
    for (let i = 0; i < 3; i++) {
      const p = makeCar(CAR_MODELS.find((m) => m.id === 'police'), 1620 - 180 - i * 70, 1340 + (i - 1) * 40, 0, { driver: 'police' });
      police.push(p);
      cars.push(p);
    }
    // Clear the chase corridor so Mara has a clean run east down the
    // street and the patrol cars can close in from behind: no traffic
    // cars at all in this staged scene, parked cars stay as scenery.
    cars = cars.filter((c) => c.driver !== 'traffic');
    cam.x = clamp(player.x - 640, 0, WORLD_W - 1280);
    cam.y = clamp(player.y - 360, 0, WORLD_H - 720);
    return;
  }
  if (s === 'mission') {
    autoTarget = { x: 2820, y: 840 };
    missions.index = 2;
    missions.step = 0;
    const sedan = makeCar(CAR_MODELS.find((m) => m.id === 'sedan'), 2220, 840, 0, { driver: 'player' });
    cars.push(sedan);
    player.inCar = sedan;
    player.x = sedan.x; player.y = sedan.y;
    player.wanted = 2;
    const p = makeCar(CAR_MODELS.find((m) => m.id === 'police'), 2220 - 200, 840, 0, { driver: 'police' });
    police.push(p);
    cars.push(p);
    cam.x = clamp(player.x - 640, 0, WORLD_W - 1280);
    cam.y = clamp(player.y - 360, 0, WORLD_H - 720);
  }
}

// Debug handle (read-only): lets a test harness watch the live state.
window.__neon = {
  get mode() { return mode; },
  get player() { return player; },
  get cars() { return cars; },
  get time() { return time; },
};

// ---- Boot ----

spawnWorld();
toTitle();
applyShotMode();
if (mode === 'playing') showScreen(null);
requestAnimationFrame(frame);
