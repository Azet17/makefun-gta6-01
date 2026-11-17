// Neon Tide — Palmera Bay: the game loop and the glue.
// Owns the state machine (menu / playing / paused / mission-complete
// / busted / wasted / story-complete), the camera, input, collisions
// between the player and the world, the wanted system, saving, and
// all canvas rendering of the city. The other files own their jobs;
// this file calls them in the right order, every frame.
'use strict';

// Query params drive the screenshot staging: ?shot=start|drive|
// chase|mission stages a scene, ?seed=N fixes the city. No param
// means a normal fresh game on the menu.
const PARAMS = new URLSearchParams(window.location.search);
const SHOT = PARAMS.get('shot') || '';
const SEED = parseInt(PARAMS.get('seed') || '20261118', 10) || 20261118;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const city = buildCity(SEED);
const rng = makeRng(SEED + 7);
const player = makePlayer(city);
const missions = makeMissionState();
const audio = makeAudio();
const hud = makeHud();
let traffic = makeTraffic(city, rng, player);
let peds = makePeds(city, rng, player);
let pickups = makePickups(city, rng);
let police = [];

let state = 'menu'; // menu | playing | paused | busted | wasted | complete
let now = 0;        // seconds since the page loaded
let lastTs = 0;
let camera = { x: player.x, y: player.y };
let wantedTimer = 0;   // seconds since last crime / sighting
let bustedTimer = 0;
let screenFlash = 0;
let stealTarget = null; // the pink coupe of mission 1
let storyShown = false;

// --- The pink coupe (mission 1 target) and the boat (finale) ------
stealTarget = makeCar(1560, 320, Math.PI / 2, '#ff2fb3', '#7c3aed');
stealTarget.stolen = false;

// --- Input ----------------------------------------------------------
const keysDown = {};
const input = { up: false, down: false, left: false, right: false, brake: false };

function keyMatches(list) { return list.some((k) => keysDown[k]); }

function refreshInput() {
  input.up = keyMatches(KEYS.up);
  input.down = keyMatches(KEYS.down);
  input.left = keyMatches(KEYS.left);
  input.right = keyMatches(KEYS.right);
  input.brake = keyMatches(KEYS.brake);
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  audioEnsure(audio);
  if (e.repeat) return;
  keysDown[e.code] = true;
  refreshInput();
  if (keyMatches(KEYS.pause)) togglePause();
  if (keyMatches(KEYS.mute)) audioSetMuted(audio, !audio.muted);
  if (keyMatches(KEYS.interact)) onInteract();
  if (keyMatches(KEYS.horn)) { audioHorn(audio); }
  if (keyMatches(KEYS.restart) && (state === 'busted' || state === 'wasted' || missions.phase === 'failed')) retryCurrent();
  if (e.code === 'Enter' && state === 'menu') startGame(false);
});
window.addEventListener('keyup', (e) => { keysDown[e.code] = false; refreshInput(); });
window.addEventListener('blur', () => { for (const k in keysDown) keysDown[k] = false; refreshInput(); });

// Mouse: click the on-screen buttons; clicking the canvas honks.
canvas.addEventListener('mousedown', () => { audioEnsure(audio); audioHorn(audio); });

function bindButton(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => { audioEnsure(audio); fn(); });
}
bindButton('btn-start', () => startGame(false));
bindButton('btn-continue', () => startGame(true));
bindButton('btn-resume', () => togglePause());
bindButton('btn-restart', () => retryCurrent());
bindButton('btn-retry', () => retryCurrent());
bindButton('btn-menu', () => showMenu());
bindButton('btn-menu-end', () => showMenu());
bindButton('btn-sound', () => audioSetMuted(audio, !audio.muted));

// --- State transitions ----------------------------------------------
function showMenu() {
  state = 'menu';
  setOverlay('menu');
  const save = loadSave();
  const cont = document.getElementById('btn-continue');
  if (cont) cont.style.display = save ? 'inline-block' : 'none';
}

function startGame(fromSave) {
  const save = fromSave ? loadSave() : null;
  if (save) {
    player.x = save.x; player.y = save.y; player.angle = save.angle;
    player.money = save.money; player.health = save.health;
    missions.index = save.mission; missions.completed = save.completed || [];
    missions.phase = 'idle'; missions.storyDone = false;
  } else {
    missions.index = 0; missions.completed = [];
    missions.phase = 'idle'; missions.storyDone = false;
    player.money = CONFIG.START_MONEY; player.health = CONFIG.PLAYER.health;
  }
  player.wanted = 0; player.onFoot = false;
  police = [];
  state = 'playing';
  setOverlay(null);
  startMission(missions, missions.index, now);
  hudShowToast(hud, missions.message, now, 6);
  saveGame();
}

function togglePause() {
  if (state === 'playing') { state = 'paused'; setOverlay('pause'); }
  else if (state === 'paused') { state = 'playing'; setOverlay(null); }
}

function retryCurrent() {
  if (missions.phase === 'failed') retryMission(missions, now);
  player.health = CONFIG.PLAYER.health;
  player.wanted = 0;
  police = [];
  player.x = 1600; player.y = 1180; player.angle = -Math.PI / 2;
  player.speed = 0; player.onFoot = false;
  state = 'playing';
  setOverlay(null);
  startMission(missions, missions.index, now);
}

function setOverlay(which) {
  for (const id of ['menu', 'pause', 'end']) {
    const el = document.getElementById('overlay-' + id);
    if (el) el.classList.toggle('hidden', id !== which);
  }
  const endTitle = document.getElementById('end-title');
  const endText = document.getElementById('end-text');
  if (which === 'end' && endTitle) {
    if (state === 'busted') { endTitle.textContent = 'BUSTED'; endText.textContent = 'The Bay Police caught Mara. The story pauses here — press R to try again.'; }
    else if (state === 'wasted') { endTitle.textContent = 'WASTED'; endText.textContent = 'Mara\'s car is a wreck. The bay is not done with her yet — press R to try again.'; }
    else if (state === 'complete') { endTitle.textContent = 'NEON TIDE COMPLETE'; endText.textContent = 'Mara made the boat. Six missions, one legend of Palmera Bay. Free roam unlocked — keep driving.'; }
  }
}

// --- Stealing and entering cars --------------------------------------
function onInteract() {
  if (state !== 'playing') return;
  if (!player.onFoot) {
    // Step out of the car.
    player.onFoot = true;
    player.footX = player.x + Math.cos(player.angle + Math.PI / 2) * 30;
    player.footY = player.y + Math.sin(player.angle + Math.PI / 2) * 30;
    player.footAngle = player.angle;
    audioNoise(audio, 0.12, 0.15, 2000);
    return;
  }
  // On foot: near the pink coupe during mission 1? Steal it.
  const m = currentMission(missions);
  if (m && m.kind === 'steal' && !stealTarget.stolen &&
      Math.sqrt(dist2(player.footX, player.footY, stealTarget.x, stealTarget.y)) < 70) {
    stealTarget.stolen = true;
    player.x = stealTarget.x; player.y = stealTarget.y; player.angle = stealTarget.angle;
    player.onFoot = false;
    player.color = '#ff2fb3'; player.color2 = '#7c3aed';
    addWanted(1, 'Grand theft auto');
    audioSteal(audio);
    const ev = completeSteal(missions, player, now);
    if (ev) onMissionEvent(ev);
    return;
  }
  // On foot: near any traffic car? Jack it.
  for (const car of traffic) {
    if (Math.sqrt(dist2(player.footX, player.footY, car.x, car.y)) < 60) {
      player.x = car.x; player.y = car.y; player.angle = car.angle;
      player.onFoot = false;
      player.color = car.color; player.color2 = car.color;
      traffic.splice(traffic.indexOf(car), 1);
      addWanted(1, 'Carjacking');
      audioSteal(audio);
      hudShowToast(hud, 'Car jacked! The owner called it in — wanted level up.', now, 4);
      return;
    }
  }
}

// --- Wanted system -----------------------------------------------------
function addWanted(stars, reason) {
  if (stars <= 0) return;
  player.wanted = Math.min(CONFIG.WANTED.max, player.wanted + stars);
  wantedTimer = 0;
  hudShowToast(hud, reason + ' — wanted level ' + player.wanted + '!', now, 3);
  syncPolice();
}

// Keep the number of active cruisers matched to the wanted level.
function syncPolice() {
  const want = player.wanted === 0 ? 0 : Math.min(CONFIG.POLICE.maxActive, 1 + player.wanted);
  while (police.length < want) {
    const p = randomRoadPoint(city, rng, player.x, player.y, CONFIG.POLICE.spawnDistance);
    police.push(makePolice(p.x, p.y));
  }
  if (police.length > want) police.length = want;
}

// --- Save / load -------------------------------------------------------
function saveGame() {
  try {
    localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify({
      x: player.x, y: player.y, angle: player.angle,
      money: player.money, health: player.health,
      mission: missions.index, completed: missions.completed,
      savedAt: Date.now(),
    }));
  } catch (e) { /* storage unavailable: the game still plays */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// --- Mission events ----------------------------------------------------
function onMissionEvent(ev) {
  if (ev.type === 'complete') {
    audioMissionComplete(audio);
    hudShowToast(hud, ev.mission.name + ' complete! +$' + ev.reward, now, 5);
    screenFlash = 0.35;
    saveGame();
    if (missions.storyDone && !storyShown) {
      storyShown = true;
      state = 'complete';
      setOverlay('end');
    } else if (missions.phase === 'idle') {
      startMission(missions, missions.index, now);
      hudShowToast(hud, missions.message, now, 6);
    }
  } else if (ev.type === 'failed') {
    audioFail(audio);
    hudShowToast(hud, 'Mission failed: ' + ev.reason + '. Press R to retry.', now, 5);
  } else if (ev.type === 'start') {
    hudShowToast(hud, ev.mission.name + ' — ' + ev.mission.brief, now, 6);
  }
}

// --- Update ------------------------------------------------------------
function update(dt) {
  if (state !== 'playing') return;

  if (player.onFoot) walkPlayer(player, input, dt, city);
  else drivePlayer(player, input, dt, city);

  // Wanted decay: stay out of sight and the heat fades, one star
  // every WANTED.decaySeconds.
  if (player.wanted > 0) {
    wantedTimer += dt;
    if (wantedTimer > CONFIG.WANTED.decaySeconds) {
      player.wanted -= 1;
      wantedTimer = 0;
      syncPolice();
      if (player.wanted === 0) hudShowToast(hud, 'You lost them. The bay is quiet… for now.', now, 4);
    }
  }

  // Police chase, ram, and the busted check.
  for (const cop of police) {
    const d = updatePolice(cop, player, dt, city);
    const px = player.onFoot ? player.footX : player.x;
    const py = player.onFoot ? player.footY : player.y;
    if (d < 46 && player.invulnerable <= 0) {
      if (player.onFoot) {
        state = 'busted'; bustedTimer = 0; setOverlay('end'); audioFail(audio);
      } else if (Math.abs(player.speed) < 90) {
        state = 'busted'; bustedTimer = 0; setOverlay('end'); audioFail(audio);
      } else {
        player.health -= CONFIG.POLICE.ramDamage;
        player.invulnerable = 0.8;
        player.speed *= 0.5;
        screenFlash = 0.25;
        audioCrash(audio);
      }
    }
  }

  // Traffic and pedestrians.
  for (const car of traffic) updateTraffic(car, dt, city);
  for (const ped of peds) updatePed(ped, dt, city, player);
  // Respawn traffic that drifted too far, so the streets stay alive.
  for (let i = 0; i < traffic.length; i++) {
    if (Math.sqrt(dist2(traffic[i].x, traffic[i].y, player.x, player.y)) > 2200) {
      const p = randomRoadPoint(city, rng, player.x, player.y, 900);
      traffic[i].x = p.x; traffic[i].y = p.y;
      traffic[i].angle = p.vertical ? Math.PI / 2 : 0;
    }
  }

  // A traffic bump costs health but is not itself a crime: the
  // wanted level only rises from real crimes (steal, hit-and-run).
  if (!player.onFoot) {
    for (const car of traffic) {
      if (Math.sqrt(dist2(player.x, player.y, car.x, car.y)) < 40 && Math.abs(player.speed) > 120) {
        player.health -= 3;
        player.speed *= 0.55;
        screenFlash = 0.2;
        audioCrash(audio);
      }
    }
    // Running over a pedestrian is a crime, and it shows.
    for (const ped of peds) {
      if (Math.sqrt(dist2(player.x, player.y, ped.x, ped.y)) < 26 && Math.abs(player.speed) > 80) {
        ped.panic = 2;
        addWanted(1, 'Hit and run');
        player.health -= 2;
      }
    }
  }

  // Pickups.
  const px = player.onFoot ? player.footX : player.x;
  const py = player.onFoot ? player.footY : player.y;
  for (const item of pickups) {
    if (!item.taken && Math.sqrt(dist2(px, py, item.x, item.y)) < 42) {
      item.taken = true;
      if (item.kind === 'cash') { player.money += item.value; hudShowToast(hud, 'Found stash cash: +$' + item.value, now, 3); }
      else { player.health = Math.min(100, player.health + item.value); hudShowToast(hud, 'Patched up the ride: +' + item.value + ' HP', now, 3); }
      audioPickup(audio);
    }
  }

  // Mission logic.
  const ev = updateMissions(missions, player, dt, now, {
    wasted: player.health <= 0,
    busted: false,
  });
  if (ev) onMissionEvent(ev);

  // Wasted: health hit zero.
  if (player.health <= 0 && state === 'playing') {
    state = 'wasted';
    setOverlay('end');
    audioFail(audio);
  }

  // Camera follows the player, clamped to the world.
  const tx = px - CONFIG.VIEW_W / 2, ty = py - CONFIG.VIEW_H / 2;
  camera.x += (clamp(tx, 0, CONFIG.WORLD_W - CONFIG.VIEW_W) - camera.x) * Math.min(1, dt * 5);
  camera.y += (clamp(ty, 0, CONFIG.WORLD_H - CONFIG.VIEW_H) - camera.y) * Math.min(1, dt * 5);

  if (screenFlash > 0) screenFlash -= dt;
  audioTick(audio, player.onFoot ? 0 : player.speed, player.wanted, dt);

  // Autosave every ~10 seconds of play.
  if (Math.floor(now) % 10 === 0 && Math.floor(now - dt) % 10 !== 0) saveGame();
}

// --- Rendering ---------------------------------------------------------
function render() {
  ctx.clearRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
  const camX = camera.x, camY = camera.y;
  ctx.save();
  ctx.translate(-camX, -camY);

  // Ground: district tints.
  for (const d of CONFIG.DISTRICTS) {
    ctx.fillStyle = d.tint;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }
  // Beach sand and surf.
  ctx.fillStyle = '#c9a86a';
  ctx.fillRect(city.beach.x, city.beach.y, city.beach.w, city.beach.h);
  ctx.fillStyle = '#1d6f9e';
  ctx.fillRect(city.beach.x, city.beach.y + city.beach.h - 60, city.beach.w, 60);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 12; i++) {
    const wx = city.beach.x + ((i * 137) % city.beach.w);
    ctx.fillRect(wx, city.beach.y + city.beach.h - 66 + Math.sin(now * 1.5 + i) * 4, 60, 3);
  }
  // Docks yard.
  ctx.fillStyle = '#16232e';
  ctx.fillRect(city.docks.x, city.docks.y, city.docks.w, city.docks.h);
  // Parks.
  for (const park of city.parks) {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = '#166534';
    for (let i = 0; i < park.trees; i++) {
      const tx2 = park.x + 20 + ((i * 53) % (park.w - 40));
      const ty2 = park.y + 20 + ((i * 97) % (park.h - 40));
      ctx.beginPath(); ctx.arc(tx2, ty2, 12, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Roads with center dashes.
  for (const r of city.roads) {
    ctx.fillStyle = '#232a38';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.strokeStyle = 'rgba(250,204,21,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (let x = 0; x <= CONFIG.WORLD_W; x += 400) { ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.WORLD_H); }
  for (let y = 0; y <= CONFIG.WORLD_H; y += 400) { ctx.moveTo(0, y); ctx.lineTo(CONFIG.WORLD_W, y); }
  ctx.stroke();
  ctx.setLineDash([]);
  // Sidewalk edges.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);

  // Buildings with a fake height shadow and a neon roof edge.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(b.x, b.y, b.w, 6);
    if (b.kind === 'tower') {
      ctx.fillStyle = 'rgba(255,210,63,0.75)';
      for (let wy = b.y + 14; wy < b.y + b.h - 10; wy += 22) {
        for (let wx = b.x + 10; wx < b.x + b.w - 10; wx += 26) ctx.fillRect(wx, wy, 10, 7);
      }
    } else if (b.kind === 'container') {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    }
  }
  // The pier.
  for (const pier of city.piers) {
    ctx.fillStyle = '#7c5a3a';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.fillStyle = '#a07850';
    for (let y = pier.y; y < pier.y + pier.h; y += 24) ctx.fillRect(pier.x, y, pier.w, 3);
  }
  // The boat at the end of the pier (finale destination).
  ctx.fillStyle = '#e5e7eb';
  roundRect(ctx, 2900, 2320, 90, 34, 10);
  ctx.fill();
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(2920, 2328, 50, 18);

  // Pickups: cash glows gold, repair glows green.
  for (const item of pickups) {
    if (item.taken) continue;
    const bob = Math.sin(now * 3 + item.x) * 3;
    ctx.save();
    ctx.translate(item.x, item.y + bob);
    ctx.fillStyle = item.kind === 'cash' ? 'rgba(250,204,21,0.25)' : 'rgba(74,222,128,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = item.kind === 'cash' ? '#facc15' : '#4ade80';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(item.kind === 'cash' ? '$' : '+', 0, 0);
    ctx.restore();
  }

  // Mission marker: a gold ring and a light pillar at the target.
  const m = currentMission(missions);
  if (m && missions.phase !== 'done' && state === 'playing') {
    const pulse = 26 + Math.sin(now * 4) * 6;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(m.target.x, m.target.y, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,63,0.12)';
    ctx.fillRect(m.target.x - 4, m.target.y - 260, 8, 260);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◆ ' + m.name.toUpperCase(), m.target.x, m.target.y - pulse - 12);
  }

  // The pink coupe, until Mara steals it.
  if (!stealTarget.stolen) drawCar(ctx, stealTarget, false);

  // Traffic, pedestrians, police, player.
  for (const car of traffic) drawCar(ctx, car, false);
  for (const ped of peds) drawPed(ctx, ped);
  for (const cop of police) drawCar(ctx, cop, true);
  if (player.onFoot) {
    ctx.save();
    ctx.translate(player.footX, player.footY);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(1, 2, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff2fb3';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(0, -1, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  } else {
    drawCar(ctx, player, false);
  }

  ctx.restore();

  // Vignette + damage flash.
  const vg = ctx.createRadialGradient(640, 360, 320, 640, 360, 780);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,6,23,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
  if (screenFlash > 0) {
    ctx.fillStyle = 'rgba(255,40,40,' + (screenFlash * 0.9) + ')';
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
  }
  if (state === 'menu') drawMenuBackdrop();
}

// Menu backdrop: dim the world and let the DOM title card speak.
function drawMenuBackdrop() {
  ctx.fillStyle = 'rgba(2,6,23,0.55)';
  ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
}

// --- HUD refresh ---------------------------------------------------------
function refreshHud() {
  const m = currentMission(missions);
  hudUpdate(hud, {
    health: player.health,
    wanted: player.wanted,
    speedKmh: player.onFoot ? 0 : carSpeedKmh(player),
    money: player.money,
    missionText: missionObjectiveText(missions),
    district: districtAt(player.onFoot ? player.footX : player.x, player.onFoot ? player.footY : player.y).name,
    onFoot: player.onFoot,
  }, now);
  hudDrawMinimap(hud, city, player, police, traffic, m && missions.phase !== 'done' ? m.target : null);
}

// --- Screenshot staging --------------------------------------------------
// ?shot= stages a fixed, good-looking scene so the screenshots show
// the real game: menu, driving, a police chase, a mission in progress.
function stageShot() {
  if (!SHOT) return;
  if (SHOT === 'start') {
    state = 'menu';
    camera.x = 1000; camera.y = 400;
    setOverlay('menu');
    return;
  }
  state = 'playing';
  setOverlay(null);
  if (SHOT === 'drive') {
    player.x = 1560; player.y = 1180; player.angle = 0; player.speed = 320;
    camera.x = player.x - 640; camera.y = player.y - 360;
    startMission(missions, 0, now);
  } else if (SHOT === 'chase') {
    player.x = 1560; player.y = 1180; player.angle = 0; player.speed = 380;
    player.wanted = 3;
    camera.x = player.x - 640; camera.y = player.y - 360;
    startMission(missions, 1, now);
    syncPolice();
    police.forEach((cop, i) => {
      cop.x = player.x - 220 - i * 90;
      cop.y = player.y + (i % 2 === 0 ? -70 : 70);
      cop.angle = 0;
    });
  } else if (SHOT === 'mission') {
    player.x = 2400; player.y = 420; player.angle = Math.PI / 2; player.speed = 260;
    player.wanted = 1;
    camera.x = player.x - 640; camera.y = player.y - 360;
    startMission(missions, 2, now);
    missions.timer = 62;
    syncPolice();
    if (police[0]) { police[0].x = player.x - 260; police[0].y = player.y + 80; police[0].angle = Math.PI / 2; }
  }
}

// --- Main loop -----------------------------------------------------------
function frame(ts) {
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  now += dt;
  if (state === 'playing') update(dt);
  render();
  refreshHud();
  requestAnimationFrame(frame);
}

// Boot: menu first, unless a shot is staged.
if (SHOT) {
  stageShot();
} else {
  showMenu();
}
// Center the menu camera on Neon Row so the backdrop looks alive.
if (state === 'menu') { camera.x = 1000; camera.y = 300; }
requestAnimationFrame(frame);
