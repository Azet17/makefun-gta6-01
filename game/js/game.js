/* Neon Tide — main game: loop, input, player, driving, wanted level,
   menus, dialogue and rendering. The one file that ties the modules together. */
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const Game = {
  state: 'menu',           // menu | playing | paused | wasted | busted | complete
  player: null,
  cam: { x: 0, y: 0 },
  cash: START_CASH,
  wanted: 0,
  lastCrimeT: 0,
  keys: {},
  mouse: { x: VIEW_W / 2, y: VIEW_H / 2, down: false },
  dialogueQueue: [],
  dialogueActive: false,
  stats: { kills: 0, carsStolen: 0, missionsDone: 0, playMs: 0 },
  lastT: 0,
  saveTimer: 0,
  bustedT: 0,
  demoMode: null,
  fps: 0,

  /* ---------- lifecycle ---------- */

  init() {
    City.build();
    HUD.init();
    this.newPlayer(450, 450);
    Traffic.spawn(20, this.player);
    Pedestrians.spawn(28, this.player);
    Combat.dropPickup(500, 500, 'shotgun');
    Combat.dropPickup(2400, 600, 'smg');
    Combat.dropPickup(700, 1700, 'health');
    this.bindInput();
    this.bindMenus();
    const save = Save.load();
    document.getElementById('btn-continue').disabled = !save;
    document.getElementById('save-info').textContent = save ? Save.summary() : 'No save yet — start a new game.';
    // Screenshot staging: ?shot=chase|drive|fight|roam starts the game directly.
    const params = new URLSearchParams(location.search);
    const shot = params.get('shot');
    if (shot) {
      this.demoMode = shot;
      this.startGame(false, shot);
    }
    requestAnimationFrame((t) => this.loop(t));
  },

  newPlayer(x, y) {
    this.player = {
      x, y, angle: 0, health: MAX_HEALTH, weapon: 'pistol', ammo: 12, reserve: 36,
      fireT: 0, inCar: false, car: null, speed: 0, walkPhase: 0,
    };
  },

  /* ---------- menus ---------- */

  bindMenus() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').onclick = () => { Sound.ensure(); Sound.click(); Save.clear(); this.startGame(true); };
    $('btn-continue').onclick = () => { Sound.ensure(); Sound.click(); this.startGame(false); };
    $('btn-how').onclick = () => { Sound.click(); $('menu').classList.add('hidden'); $('howto').classList.remove('hidden'); };
    $('btn-how-back').onclick = () => { Sound.click(); $('howto').classList.add('hidden'); $('menu').classList.remove('hidden'); };
    $('btn-resume').onclick = () => { Sound.click(); this.resume(); };
    $('btn-save-quit').onclick = () => { Sound.click(); Save.saveGame(); this.toMenu(); };
    $('btn-retry').onclick = () => { Sound.click(); this.retryAfterDeath(); };
    $('btn-end-menu').onclick = () => { Sound.click(); this.toMenu(); };
    $('btn-free-roam').onclick = () => { Sound.click(); $('complete').classList.add('hidden'); this.state = 'playing'; HUD.show(); };
    $('btn-complete-menu').onclick = () => { Sound.click(); this.toMenu(); };
    $('dialogue').onclick = () => this.advanceDialogue();
  },

  startGame(fresh, shot) {
    Sound.ensure();
    Sound.startMusic();
    if (fresh) {
      Save.clear();
      this.newPlayer(450, 450);
      this.cash = START_CASH;
      this.wanted = 0;
      this.stats = { kills: 0, carsStolen: 0, missionsDone: 0, playMs: 0 };
      Combat.reset();
      Traffic.cars = [];
      Police.cars = [];
      Police.officers = [];
      Traffic.spawn(20, this.player);
      Pedestrians.spawn(28, this.player);
      MissionManager.index = 0;
      MissionManager.stepIndex = 0;
      MissionManager.state = 'idle';
      MissionManager.marker = null;
    } else if (!shot) {
      this.loadFromSave();
    }
    for (const id of ['menu', 'howto', 'complete', 'endcard', 'pause']) {
      document.getElementById(id).classList.add('hidden');
    }
    this.state = 'playing';
    HUD.show();
    HUD.refreshObjective();
    if (shot) this.setupShot(shot);
    else if (MissionManager.state === 'idle' && MissionManager.index < MISSIONS.length) {
      MissionManager.startMission(MissionManager.index);
    }
    HUD.showHint('WASD move · E steal a car · follow the yellow marker');
  },

  /* Restore the player, cash and progress from the save slot, if one exists. */
  loadFromSave() {
    const s = Save.load();
    if (!s) return;
    this.newPlayer(s.x || 450, s.y || 450);
    this.cash = s.cash ?? START_CASH;
    this.player.health = s.health ?? MAX_HEALTH;
    this.player.weapon = s.weapon || 'pistol';
    this.player.ammo = s.ammo ?? 12;
    this.stats.kills = s.kills || 0;
    this.stats.carsStolen = s.carsStolen || 0;
    this.stats.missionsDone = s.missionsDone || 0;
    this.stats.playMs = s.playMs || 0;
    MissionManager.index = Math.min(s.missionIndex || 0, MISSIONS.length - 1);
    MissionManager.stepIndex = 0;
    MissionManager.state = 'idle';
    MissionManager.marker = null;
  },

  /* Deterministic staged scenes for the screenshots (?shot=...). Each one
     puts Mara, the wanted level and a mission into a photogenic state. */
  setupShot(shot) {
    const p = this.player;
    if (shot === 'chase') {
      // A police chase: Mara in a Comet GT, 3 stars, cops closing in, mission 4 active.
      MissionManager.index = 3;
      MissionManager.stepIndex = 0;
      MissionManager.state = 'active';
      MissionManager.marker = null;
      const model = CAR_MODELS[1];
      const car = { x: 1500, y: 950, angle: 0, speed: 260, model, color: model.color, hp: 100 };
      p.x = car.x;
      p.y = car.y;
      p.inCar = true;
      p.car = car;
      this.setWanted(3);
      this.cash = 2450;
      Police.cars = [];
      for (let i = 0; i < 3; i++) {
        const a = -0.4 + i * 0.5;
        Police.cars.push({
          x: 1500 - 320 - i * 90, y: 950 + Math.sin(a) * 260,
          angle: 0, speed: 300, color: POLICE_COLOR, model: CAR_MODELS[1], ramT: 0,
        });
      }
      Traffic.spawn(6, p);
      HUD.refreshObjective();
      HUD.showHint('Wanted level 3 — lose the Bay Police!');
    } else if (shot === 'drive') {
      // Cruising Downtown in a sports car, mission 2 in progress.
      MissionManager.index = 1;
      MissionManager.stepIndex = 1;
      MissionManager.state = 'active';
      MissionManager.marker = { x: 2732, y: 632 };
      const model = CAR_MODELS[1];
      const car = { x: 2100, y: 932, angle: 0, speed: 240, model, color: model.color, hp: 100 };
      p.x = car.x;
      p.y = car.y;
      p.inCar = true;
      p.car = car;
      this.setWanted(1);
      this.cash = 1150;
      Traffic.spawn(10, p);
      HUD.refreshObjective();
    } else if (shot === 'fight') {
      // On-foot shootout at the docks, mission 3 fight step.
      MissionManager.index = 2;
      MissionManager.stepIndex = 1;
      MissionManager.state = 'active';
      MissionManager.marker = { x: 1832, y: 3032 };
      p.x = 1700;
      p.y = 3032;
      p.angle = 0;
      p.weapon = 'pistol';
      p.ammo = 18;
      p.reserve = 48;
      this.setWanted(2);
      this.cash = 1750;
      MissionManager.spawnEnemies(5, City.missionSpots.dockside);
      HUD.refreshObjective();
    } else {
      // Roam: Mara on foot near the marina, mission 1's pickup marker ahead.
      MissionManager.index = 0;
      MissionManager.stepIndex = 0;
      MissionManager.state = 'active';
      MissionManager.marker = { x: 332, y: 332 };
      p.x = 400;
      p.y = 380;
      p.weapon = 'pistol';
      p.ammo = 12;
      this.cash = 250;
      Traffic.spawn(8, p);
      Pedestrians.spawn(10, p);
      HUD.refreshObjective();
    }
  },

  toMenu() {
    this.state = 'menu';
    HUD.hide();
    Sound.engine(null);
    for (const id of ['pause', 'endcard', 'complete', 'dialogue']) {
      document.getElementById(id).classList.add('hidden');
    }
    document.getElementById('menu').classList.remove('hidden');
    const save = Save.load();
    document.getElementById('btn-continue').disabled = !save;
    document.getElementById('save-info').textContent = save ? Save.summary() : 'No save yet — start a new game.';
  },

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    Sound.engine(null);
    document.getElementById('pause').classList.remove('hidden');
  },

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    document.getElementById('pause').classList.add('hidden');
  },

  retryAfterDeath() {
    document.getElementById('endcard').classList.add('hidden');
    const s = Save.load();
    this.player.health = MAX_HEALTH;
    this.player.x = 450;
    this.player.y = 450;
    this.player.inCar = false;
    this.player.car = null;
    this.setWanted(0);
    if (s) this.cash = Math.max(0, s.cash - 100);
    this.state = 'playing';
    HUD.show();
    HUD.showHint('You respawned at the marina. $100 hospital bill.');
  },

  storyComplete() {
    this.state = 'complete';
    this.stats.missionsDone = MISSIONS.length;
    Save.saveGame();
    document.getElementById('final-stats').textContent =
      `Missions: ${MISSIONS.length}/${MISSIONS.length} · Cash: $${fmtCash(this.cash)} · Cars stolen: ${this.stats.carsStolen} · Play time: ${Math.round(this.stats.playMs / 60000)} min`;
    document.getElementById('complete').classList.remove('hidden');
    HUD.hide();
    Sound.engine(null);
  },

  wasted() {
    this.state = 'wasted';
    Sound.busted();
    Sound.engine(null);
    document.getElementById('end-title').textContent = 'WASTED';
    document.getElementById('end-text').textContent = 'Mara went down in Palmera Bay. The city keeps moving — but so does she. Try again from your last save.';
    document.getElementById('endcard').classList.remove('hidden');
    HUD.hide();
  },

  busted() {
    this.state = 'busted';
    Sound.busted();
    Sound.engine(null);
    document.getElementById('end-title').textContent = 'BUSTED';
    document.getElementById('end-text').textContent = 'The Bay Police caught up with Mara. A night in the cells, a fine, and back to the streets.';
    document.getElementById('endcard').classList.remove('hidden');
    HUD.hide();
  },

  /* ---------- wanted / crime ---------- */

  setWanted(n) {
    this.wanted = clamp(n, 0, MAX_WANTED);
    this.lastCrimeT = performance.now();
  },

  addWanted(n) { this.setWanted(this.wanted + n); },

  commitCrime(stars, x, y) {
    this.addWanted(stars);
    for (const p of Pedestrians.list) {
      if (dist(p.x, p.y, x, y) < 300) p.flee = 2;
    }
  },

  damagePlayer(d) {
    if (this.state !== 'playing') return;
    this.player.health -= d;
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.wasted();
    }
  },

  carDestroyed() {
    const car = this.player.car;
    if (!car) return;
    Sound.crash();
    Combat.smoke(car.x, car.y);
    this.player.inCar = false;
    this.player.car = null;
    this.player.x = car.x + 40;
    this.player.y = car.y;
    this.player.health = Math.max(1, this.player.health - 25);
    this.addWanted(1);
    HUD.showHint('Your car is wrecked! Find another one.');
  },

  /* ---------- dialogue ---------- */

  showDialogue(lines) {
    this.dialogueQueue = lines.slice();
    this.dialogueActive = true;
    this.advanceDialogue();
  },

  advanceDialogue() {
    if (!this.dialogueActive) return;
    const line = this.dialogueQueue.shift();
    const box = document.getElementById('dialogue');
    if (!line) {
      this.dialogueActive = false;
      box.classList.add('hidden');
      return;
    }
    document.getElementById('dialogue-name').textContent = line[0];
    document.getElementById('dialogue-text').textContent = line[1];
    box.classList.remove('hidden');
    Sound.click();
  },

  showToast(t) { HUD.showToast(t); },
  showHint(t, ms) { HUD.showHint(t, ms); },

  spawnCashDrops(n, spot) {
    for (let i = 0; i < n; i++) {
      Combat.dropCash(spot.x + rand(-140, 140), spot.y + rand(-140, 140), randInt(120, 260));
    }
  },

  /* ---------- input ---------- */

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'Escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (e.key.toLowerCase() === 'm' && this.state === 'playing' && !this.dialogueActive) {
        Sound.toggleMute();
        HUD.showHint(Sound.muted ? 'Sound muted (M to unmute)' : 'Sound on');
      }
      if (e.key === 'Enter' && this.dialogueActive) this.advanceDialogue();
      if (e.key.toLowerCase() === 'e' && this.state === 'playing' && !this.dialogueActive) this.tryInteract();
      if (e.key.toLowerCase() === 'r' && this.state === 'playing') this.reload();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (VIEW_W / r.width);
      this.mouse.y = (e.clientY - r.top) * (VIEW_H / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      Sound.ensure();
      if (this.dialogueActive) {
        this.advanceDialogue();
        return;
      }
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  reload() {
    const p = this.player;
    const w = WEAPONS[p.weapon];
    if (w.ammo === Infinity || p.ammo >= w.ammo || p.reserve <= 0) return;
    const need = w.ammo - p.ammo;
    const take = Math.min(need, p.reserve);
    p.reserve -= take;
    p.ammo += take;
    Sound.click();
    HUD.showHint(`Reloaded — ${p.ammo} in the mag, ${p.reserve} spare`);
  },

  /* E key: enter/exit a car, or use a service spot. */
  tryInteract() {
    const p = this.player;
    // Service spots first (on foot only).
    if (!p.inCar) {
      for (const [key, s] of Object.entries(City.spots)) {
        if (dist(p.x, p.y, s.x, s.y) < 60) {
          this.useServiceSpot(key, s);
          return;
        }
      }
    }
    if (p.inCar) {
      this.exitCar();
      return;
    }
    this.enterNearestCar();
  },

  /* One service spot's E interaction: garage, gun shop, diner, hospital. */
  useServiceSpot(key, s) {
    const p = this.player;
    if (key === 'garage') {
      HUD.showHint('Garage repairs your car — drive one here and press E');
      return;
    }
    if (key === 'gunshop') {
      if (this.cash >= AMMO_COST) {
        this.cash -= AMMO_COST;
        p.reserve += 48;
        Sound.cash();
        HUD.showToast('AMMO +48 — $40');
      } else HUD.showHint('Not enough cash for ammo ($40)');
      return;
    }
    if (key === 'diner') {
      if (this.cash >= 25) {
        this.cash -= 25;
        p.health = Math.min(MAX_HEALTH, p.health + 50);
        Sound.pickup();
        HUD.showToast('HEALED +50 — $25');
      } else HUD.showHint('Not enough cash for a meal ($25)');
      return;
    }
    if (key === 'hospital') {
      if (this.cash >= 80) {
        this.cash -= 80;
        p.health = MAX_HEALTH;
        Sound.pickup();
        HUD.showToast('FULLY HEALED — $80');
      } else HUD.showHint('Not enough cash for treatment ($80)');
    }
  },

  /* Step out of the car; it stays parked where it is. */
  exitCar() {
    const p = this.player;
    const car = p.car;
    car.speed = 0;
    car.parked = true;
    if (!Traffic.cars.includes(car)) Traffic.cars.push(car);
    p.inCar = false;
    p.car = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    const fixed = City.resolveCollision(p.x, p.y, PLAYER_RADIUS);
    p.x = fixed.x;
    p.y = fixed.y;
    Sound.engine(null);
  },

  /* Step into the nearest car within reach — traffic or police. Stealing is a crime. */
  enterNearestCar() {
    const p = this.player;
    let best = null;
    let bestD = 70;
    for (const c of Traffic.cars) {
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    for (const c of Police.cars) {
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return;
    const wasPolice = Police.cars.includes(best);
    if (wasPolice) Police.cars.splice(Police.cars.indexOf(best), 1);
    else Traffic.cars.splice(Traffic.cars.indexOf(best), 1);
    best.parked = false;
    best.hp = best.hp ?? 100;
    p.inCar = true;
    p.car = best;
    p.x = best.x;
    p.y = best.y;
    this.stats.carsStolen++;
    MissionManager.onSteal(best);
    if (!best.missionTarget) {
      this.commitCrime(wasPolice ? 2 : 1, best.x, best.y);
      HUD.showToast(wasPolice ? 'YOU STOLE A POLICE CAR!' : `YOU STOLE THE ${best.model.name.toUpperCase()}!`);
    }
    Sound.horn();
  },

  /* ---------- update ---------- */

  update(dt) {
    const p = this.player;
    this.stats.playMs += dt * 1000;
    p.fireT = Math.max(0, p.fireT - dt);
    // Wanted decay: one star fades after quiet time.
    if (this.wanted > 0 && performance.now() - this.lastCrimeT > WANTED_DECAY_MS) {
      this.wanted--;
      this.lastCrimeT = performance.now();
      if (this.wanted === 0) HUD.showToast('YOU LOST THE COPS');
    }
    // Aim follows the mouse; on foot the player turns to face it.
    const aimX = this.cam.x + this.mouse.x;
    const aimY = this.cam.y + this.mouse.y;
    if (!p.inCar) p.angle = angleTo(p.x, p.y, aimX, aimY);
    if (p.inCar) this.updateDriving(dt);
    else this.updateOnFoot(dt);
    this.updateServiceHints();
    // Shooting: hold to fire automatic weapons, click for the rest.
    if (this.mouse.down && !p.inCar && !this.dialogueActive) {
      const w = WEAPONS[p.weapon];
      if (w.auto || p.fireT <= 0) Combat.playerShoot(p, p.angle);
    }
    this.updatePoliceContact(dt);
    // World actors.
    Traffic.update(dt, p);
    Pedestrians.update(dt, p, this.mouse.down ? { x: p.x, y: p.y } : null);
    Police.update(dt, p, this.wanted);
    MissionManager.update(dt, p);
    Combat.update(dt, p);
    // Autosave every 30 s.
    this.saveTimer += dt;
    if (this.saveTimer > 30) {
      this.saveTimer = 0;
      Save.saveGame();
    }
    // Camera follows the player, clamped to the world.
    this.cam.x = clamp(p.x - VIEW_W / 2, 0, WORLD - VIEW_W);
    this.cam.y = clamp(p.y - VIEW_H / 2, 0, WORLD - VIEW_H);
    HUD.refreshStats(p, this.cash, this.wanted);
  },

  /* Hints for the service spot under the player's feet, or a garage repair
     while driving past one with a damaged car. */
  updateServiceHints() {
    const p = this.player;
    if (!p.inCar) {
      for (const [key, s] of Object.entries(City.spots)) {
        if (dist(p.x, p.y, s.x, s.y) < 60) {
          HUD.showHint(`Press E — ${s.label}`, 600);
          break;
        }
      }
      return;
    }
    if (!p.car) return;
    const g = City.spots.garage;
    if (dist(p.car.x, p.car.y, g.x, g.y) < 70 && (p.car.hp ?? 100) < 100 && this.cash >= GARAGE_REPAIR_COST) {
      this.cash -= GARAGE_REPAIR_COST;
      p.car.hp = 100;
      Sound.cash();
      HUD.showToast('CAR REPAIRED — $60');
    }
  },

  /* Police cars ramming the player's car, or an officer catching Mara on foot. */
  updatePoliceContact(dt) {
    const p = this.player;
    if (p.inCar && p.car) {
      for (const c of Police.cars) {
        if (dist(c.x, c.y, p.car.x, p.car.y) < 46) {
          p.car.hp = Math.max(0, (p.car.hp ?? 100) - 14 * dt);
          Combat.smoke(p.car.x, p.car.y);
          if ((p.car.hp ?? 100) <= 0) this.carDestroyed();
        }
      }
      return;
    }
    let near = false;
    for (const o of Police.officers) {
      if (dist(o.x, o.y, p.x, p.y) < 26) near = true;
    }
    if (near && this.wanted >= 3) {
      this.bustedT += dt;
      if (this.bustedT > 1.2) {
        this.bustedT = 0;
        this.busted();
      }
    } else {
      this.bustedT = 0;
    }
  },

  updateOnFoot(dt) {
    const p = this.player;
    let mx = 0;
    let my = 0;
    if (this.keys['w'] || this.keys['arrowup']) my -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) my += 1;
    if (this.keys['a'] || this.keys['arrowleft']) mx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) mx += 1;
    if (mx === 0 && my === 0) return;
    const len = Math.hypot(mx, my);
    const speed = this.keys['shift'] ? PLAYER_SPRINT : PLAYER_SPEED;
    const step = speed * dt;
    p.x += (mx / len) * step;
    p.y += (my / len) * step;
    p.walkPhase += dt * 10;
    const fixed = City.resolveCollision(p.x, p.y, PLAYER_RADIUS);
    p.x = fixed.x;
    p.y = fixed.y;
    // Bump into traffic cars (they slow, you don't pass through them).
    for (const c of Traffic.cars) {
      if (dist(p.x, p.y, c.x, c.y) < 30) {
        const a = angleTo(c.x, c.y, p.x, p.y);
        p.x = c.x + Math.cos(a) * 30;
        p.y = c.y + Math.sin(a) * 30;
      }
    }
  },

  updateDriving(dt) {
    const p = this.player;
    const car = p.car;
    if (!car) {
      p.inCar = false;
      return;
    }
    const fwd = (this.keys['w'] || this.keys['arrowup'] ? 1 : 0) - (this.keys['s'] || this.keys['arrowdown'] ? 0.55 : 0);
    const steer = (this.keys['a'] || this.keys['arrowleft'] ? -1 : 0) + (this.keys['d'] || this.keys['arrowright'] ? 1 : 0);
    const handbrake = !!this.keys[' '];
    const dir = car.speed >= 0 ? 1 : -1;
    car.angle += steer * car.model.grip * dt * clamp(Math.abs(car.speed) / 120, 0, 1) * dir;
    car.speed += fwd * car.model.accel * dt;
    if (!fwd) car.speed = lerp(car.speed, 0, dt * 0.8);
    if (handbrake) car.speed = lerp(car.speed, 0, dt * 4);
    car.speed = clamp(car.speed, -120, car.model.top);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const hit = City.hitsBuilding(nx, ny, 20);
    if (hit) {
      if (Math.abs(car.speed) > 140) {
        Sound.crash();
        Combat.smoke(car.x, car.y);
        car.hp = Math.max(0, (car.hp ?? 100) - 12);
        this.commitCrime(0, car.x, car.y);
        if (car.hp <= 0) {
          this.carDestroyed();
          return;
        }
      }
      car.speed *= -0.25;
    } else {
      car.x = clamp(nx, 30, WORLD - 30);
      car.y = clamp(ny, 30, WORLD - 30);
    }
    // Hit pedestrians while driving: a crime, and they go down.
    for (const ped of Pedestrians.list) {
      if (!ped.dead && dist(ped.x, ped.y, car.x, car.y) < 28 && Math.abs(car.speed) > 40) {
        ped.dead = true;
        Combat.blood(ped.x, ped.y);
        Sound.crash();
        this.commitCrime(1, ped.x, ped.y);
      }
    }
    // Bump traffic cars.
    for (const c of Traffic.cars) {
      if (c === car) continue;
      if (dist(c.x, c.y, car.x, car.y) < 44 && Math.abs(car.speed) > 60) {
        c.speed = Math.max(0, c.speed - 40);
        if (Math.random() < 0.3) Sound.crash();
      }
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    Sound.engine(Math.abs(car.speed) / car.model.top);
  },

  /* ---------- render ---------- */

  draw() {
    const p = this.player;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    City.drawGround(ctx, this.cam);
    City.drawSpots(ctx, this.cam);
    City.drawBuildings(ctx, this.cam);
    Combat.draw(ctx, this.cam);
    Traffic.draw(ctx, this.cam);
    Police.draw(ctx, this.cam);
    Pedestrians.draw(ctx, this.cam);
    this.drawRivals(ctx, p);
    if (p.inCar && p.car) this.drawPlayerCar(ctx, p);
    else this.drawPlayer(ctx, p);
    HUD.drawMarker(ctx, this.cam);
    if (this.state === 'playing') HUD.drawMinimap(ctx, p);
    // Crosshair follows the mouse on foot.
    const ch = document.getElementById('crosshair');
    if (this.state === 'playing' && !p.inCar && !this.dialogueActive) {
      ch.style.display = 'block';
      ch.style.left = this.mouse.x + 'px';
      ch.style.top = this.mouse.y + 'px';
    } else {
      ch.style.display = 'none';
    }
    // Vignette + sunset grade over the whole frame.
    const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
    grad.addColorStop(0, 'rgba(255,170,80,0)');
    grad.addColorStop(1, 'rgba(255,120,60,0.12)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  },

  /* Rival gang members: dark shirts, health bars, guns pointed at Mara. */
  drawRivals(ctx, p) {
    for (const e of MissionManager.spawned) {
      if (e.dead) continue;
      const sx = e.x - this.cam.x;
      const sy = e.y - this.cam.y;
      if (sx < -30 || sx > VIEW_W + 30 || sy < -30 || sy > VIEW_H + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx + 2, sy + 4, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20242e';
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.skin;
      ctx.beginPath();
      ctx.arc(sx, sy - 9, 5.5, 0, Math.PI * 2);
      ctx.fill();
      // Health bar above the head.
      ctx.fillStyle = '#c02030';
      ctx.fillRect(sx - 10, sy - 20, 20, 3);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(sx - 10, sy - 20, 20 * (e.hp / 50), 3);
      // Their gun, aimed at the player.
      const a = angleTo(e.x, e.y, p.x, p.y);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * 16, sy + Math.sin(a) * 16);
      ctx.stroke();
    }
  },

  /* The player's car, with its health bar above it. */
  drawPlayerCar(ctx, p) {
    drawCar(ctx, this.cam, p.car.x, p.car.y, p.car.angle, p.car.model, p.car.color);
    const sx = p.car.x - this.cam.x;
    const sy = p.car.y - this.cam.y;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(sx - 22, sy - 32, 44, 5);
    ctx.fillStyle = (p.car.hp ?? 100) > 40 ? '#7dff9b' : '#ff5a5a';
    ctx.fillRect(sx - 22, sy - 32, 44 * ((p.car.hp ?? 100) / 100), 5);
  },

  /* Mara on foot: teal jacket, white ring so she stays readable in a crowd. */
  drawPlayer(ctx, p) {
    const sx = p.x - this.cam.x;
    const sy = p.y - this.cam.y;
    const bob = Math.sin(p.walkPhase) * 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx + 2, sy + 5, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0e9a8a';
    ctx.beginPath();
    ctx.arc(sx, sy + bob * 0.3, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c8a0';
    ctx.beginPath();
    ctx.arc(sx, sy - 11 + bob * 0.3, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath();
    ctx.arc(sx, sy - 13 + bob * 0.3, 6, Math.PI, 0);
    ctx.fill();
    // Gun in the aim direction, plus a faint aim tick.
    if (p.weapon !== 'fists') {
      ctx.strokeStyle = '#14141a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(p.angle) * 20, sy + Math.sin(p.angle) * 20);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(p.angle) * 14, sy + Math.sin(p.angle) * 14);
    ctx.lineTo(sx + Math.cos(p.angle) * 24, sy + Math.sin(p.angle) * 24);
    ctx.stroke();
  },

  /* ---------- main loop ---------- */

  loop(t) {
    requestAnimationFrame((nt) => this.loop(nt));
    const dt = Math.min(0.05, (t - this.lastT) / 1000 || 0.016);
    this.lastT = t;
    this.fps = Math.round(1 / Math.max(dt, 0.001));
    if (this.state === 'playing' && !this.dialogueActive) {
      this.update(dt);
    } else if (this.state === 'menu' || this.state === 'complete' || this.state === 'wasted' || this.state === 'busted') {
      // Attract mode: slow camera drift over the marina behind the menu.
      this.cam.x = clamp(200 + Math.sin(t / 9000) * 200, 0, WORLD - VIEW_W);
      this.cam.y = clamp(200 + Math.cos(t / 12000) * 150, 0, WORLD - VIEW_H);
      Traffic.update(dt, this.player);
      Pedestrians.update(dt, this.player, null);
    }
    this.draw();
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
