/* Neon Tide — story missions. Six missions, each a list of steps:
   goto / steal (take a car, then reach a point) / fight (defeat rivals) /
   collect (grab cash drops) / escape (lose the wanted level). */
'use strict';

const MISSIONS = [
  {
    id: 1, title: 'THE PICKUP', reward: 400,
    intro: [
      ['MARA', 'Back in Palmera Bay. First job: pick up a package from the marina and bring it to Rico. No cops, no noise.'],
      ['RICO', 'Package is at the marina, by the blue crates. Bring it to my garage in Old Harbor. And Mara — drive like you mean it.'],
    ],
    steps: [
      { type: 'goto', at: 'marina', text: 'Pick up the package at the Marina', sub: 'Follow the yellow marker' },
      { type: 'goto', at: 'harbor', text: 'Deliver the package to Rico in Old Harbor', sub: 'Rico is waiting at the garage' },
    ],
  },
  {
    id: 2, title: 'HOT WHEELS', reward: 700,
    intro: [
      ['LENA', 'A Comet GT is parked outside the Coral Heights club. No alarm, no owner in sight. Take it — the crew needs wheels.'],
      ['MARA', 'Stealing a car in broad daylight. What could go wrong?'],
    ],
    steps: [
      { type: 'steal', at: 'heights', text: 'Steal the Comet GT in Coral Heights', sub: 'Walk up to it and press E — the cops will notice' },
      { type: 'goto', at: 'downtown', text: 'Deliver the Comet GT to the Downtown chop shop', sub: 'Stay in the car — the marker is the drop-off' },
    ],
  },
  {
    id: 3, title: 'DOCKSIDE DEAL', reward: 900,
    intro: [
      ['RICO', 'The Tide crew is meeting at the docks. They think they run this city. Show them they are wrong.'],
      ['MARA', 'I brought my pistol. Let us talk business.'],
    ],
    steps: [
      { type: 'goto', at: 'dockside', text: 'Reach the Dockside meeting', sub: 'Rivals are waiting — be ready' },
      { type: 'fight', at: 'dockside', count: 5, text: 'Take down the Tide crew (0/5)', sub: 'Aim with the mouse, click to shoot' },
      { type: 'collect', at: 'dockside', count: 3, text: 'Grab the Tide crew cash (0/3)', sub: 'Walk over the green cash drops' },
    ],
  },
  {
    id: 4, title: 'GETAWAY', reward: 1000,
    intro: [
      ['LENA', 'The cops saw your face at the docks. They are coming in hot — three stars and climbing. Lose them.'],
      ['MARA', 'Then I drive. Hold on.'],
    ],
    steps: [
      { type: 'escape', text: 'Lose the Bay Police', sub: 'Break line of sight and stay quiet until the stars fade' },
    ],
  },
  {
    id: 5, title: 'THE VAULT', reward: 1400,
    intro: [
      ['RICO', 'The Tide crew stashed their money in a Downtown office. Grab the cash, get out clean.'],
      ['MARA', 'A vault job. Finally, something fun.'],
    ],
    steps: [
      { type: 'goto', at: 'downtown', text: 'Reach the Downtown office', sub: 'Guards inside — expect a fight' },
      { type: 'fight', at: 'downtown', count: 4, text: 'Clear the office guards (0/4)', sub: 'Four guards between you and the vault' },
      { type: 'collect', at: 'downtown', count: 4, text: 'Grab the vault cash (0/4)', sub: 'Walk over the green cash drops' },
      { type: 'goto', at: 'beach', text: 'Escape to the beach rendezvous', sub: 'Lena is waiting at the shore' },
    ],
  },
  {
    id: 6, title: 'NEON TIDE', reward: 2500,
    intro: [
      ['LENA', 'This is it. The Tide crew boss is at the marina with the whole gang. End this tonight.'],
      ['MARA', 'For my brother. For the garage. For Palmera Bay.'],
    ],
    steps: [
      { type: 'goto', at: 'marina', text: 'Reach the marina for the final fight', sub: 'The whole Tide crew is there' },
      { type: 'fight', at: 'marina', count: 8, text: 'Take down the Tide crew (0/8)', sub: 'Eight rivals. No mercy, no retreat.' },
      { type: 'goto', at: 'beach', text: 'Meet Lena at the beach', sub: 'The city is yours now' },
    ],
  },
];

/* Mission runtime state. One mission runs at a time; steps run in order
   and the next mission starts a couple of seconds after the last one pays out. */
const MissionManager = {
  index: 0,            // 0-based mission index; MISSIONS.length means story done
  stepIndex: 0,
  state: 'idle',       // idle | active | done
  kills: 0,
  collected: 0,
  escapeTimer: 0,
  marker: null,        // {x, y} of the current objective, or null
  stealTarget: null,   // traffic car to steal, for steal steps
  spawned: [],         // enemies spawned for the current fight step

  current() { return MISSIONS[this.index] || null; },

  step() {
    const m = this.current();
    return m ? m.steps[this.stepIndex] : null;
  },

  startMission(i) {
    this.index = i;
    this.stepIndex = 0;
    this.state = 'active';
    this.kills = 0;
    this.collected = 0;
    this.spawned = [];
    const m = this.current();
    Game.showDialogue(m.intro);
    this.beginStep();
  },

  beginStep() {
    const s = this.step();
    if (!s) {
      this.completeMission();
      return;
    }
    this.kills = 0;
    this.collected = 0;
    this.spawned = [];
    const spot = s.at ? City.missionSpots[s.at] : null;
    this.marker = spot ? { x: spot.x, y: spot.y } : null;
    if (s.type === 'escape') {
      this.marker = null;
      this.escapeTimer = 0;
      Game.addWanted(3);
      Game.showToast('LOSE THE COPS!');
    }
    if (s.type === 'steal') {
      // Park a shiny target car at the spot for the player to take.
      const model = CAR_MODELS[1];
      const car = {
        x: spot.x, y: spot.y, angle: 0, speed: 0, model, vertical: false, dir: 1,
        color: model.color, honkT: 99, parked: true, id: 'mission-car', missionTarget: true,
      };
      Traffic.cars.push(car);
      this.stealTarget = car;
      this.marker = { x: spot.x, y: spot.y };
    }
    if (s.type === 'fight') this.spawnEnemies(s.count, spot);
    if (s.type === 'collect') Game.spawnCashDrops(s.count, spot);
    HUD.refreshObjective();
  },

  spawnEnemies(count, spot) {
    this.spawned = [];
    for (let i = 0; i < count; i++) {
      const e = {
        x: spot.x + rand(-160, 160), y: spot.y + rand(-160, 160),
        hp: 50, angle: 0, shootT: rand(0.6, 1.6), speed: 95,
        skin: pick(Pedestrians.palette), shirt: '#20242e', rival: true, dead: false,
      };
      const fixed = City.resolveCollision(e.x, e.y, 12);
      e.x = fixed.x;
      e.y = fixed.y;
      this.spawned.push(e);
    }
  },

  onKill() {
    this.kills++;
    const s = this.step();
    if (s && s.type === 'fight') {
      HUD.refreshObjective();
      if (this.kills >= s.count) this.nextStep();
    }
  },

  onCollect() {
    this.collected++;
    const s = this.step();
    if (s && s.type === 'collect') {
      HUD.refreshObjective();
      if (this.collected >= s.count) this.nextStep();
    }
  },

  onSteal(car) {
    const s = this.step();
    if (s && s.type === 'steal' && car && car.missionTarget) {
      Game.showToast('GOT IT — NOW DELIVER IT');
      Sound.cash();
      this.nextStep();
    }
  },

  /* Called every frame while a mission is active. */
  update(dt, player) {
    if (this.state !== 'active') return;
    const s = this.step();
    if (!s) return;
    if (s.type === 'goto' && this.marker) {
      if (dist(player.x, player.y, this.marker.x, this.marker.y) < 70) this.nextStep();
    }
    if (s.type === 'escape') {
      if (Game.wanted <= 0) {
        this.escapeTimer += dt;
        if (this.escapeTimer > 1) this.nextStep();
      } else {
        this.escapeTimer = 0;
      }
    }
    // Rival AI: close in on the player, then hold range and shoot.
    for (const e of this.spawned) {
      if (e.dead) continue;
      const d = dist(e.x, e.y, player.x, player.y);
      if (d > 150) {
        const a = angleTo(e.x, e.y, player.x, player.y);
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
        const fixed = City.resolveCollision(e.x, e.y, 12);
        e.x = fixed.x;
        e.y = fixed.y;
      }
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 460) {
        e.shootT = rand(1.1, 2.1);
        Combat.enemyShoot(e.x, e.y, angleTo(e.x, e.y, player.x, player.y), 8);
      }
    }
    this.spawned = this.spawned.filter((e) => !e.dead);
  },

  nextStep() {
    Sound.pickup();
    this.stepIndex++;
    if (this.stepIndex >= this.current().steps.length) this.completeMission();
    else this.beginStep();
  },

  completeMission() {
    const m = this.current();
    Game.cash += m.reward;
    Game.showToast('MISSION COMPLETE — +$' + fmtCash(m.reward));
    Sound.missionDone();
    Game.setWanted(0);
    this.state = 'done';
    this.marker = null;
    Save.saveGame();
    if (this.index + 1 < MISSIONS.length) {
      setTimeout(() => {
        if (Game.state === 'playing') this.startMission(this.index + 1);
      }, 2200);
    } else {
      setTimeout(() => {
        if (Game.state === 'playing') Game.storyComplete();
      }, 2200);
    }
    HUD.refreshObjective();
  },

  /* Objective text shown in the HUD's top-left box. */
  objectiveText() {
    if (this.state === 'done' && this.index + 1 >= MISSIONS.length) {
      return { title: 'NEON TIDE', text: 'Story complete — free roam!', sub: 'Palmera Bay is yours' };
    }
    if (this.state === 'idle' || !this.current()) {
      return { title: 'FREE ROAM', text: 'Explore Palmera Bay', sub: 'New Game starts the story — or just cause chaos' };
    }
    const m = this.current();
    const s = this.step();
    let text = s ? s.text : m.title;
    if (s && s.type === 'fight') text = text.replace(/\(\d+\/\d+\)/, `(${this.kills}/${s.count})`);
    if (s && s.type === 'collect') text = text.replace(/\(\d+\/\d+\)/, `(${this.collected}/${s.count})`);
    return { title: `MISSION ${m.id} — ${m.title}`, text, sub: s ? s.sub : '' };
  },
};
