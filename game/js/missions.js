// Neon Tide — Palmera Bay: the story.
// Six missions, played in order. Each mission has stages (a small state
// machine per mission) so the objective, the marker and the win condition
// all move together. Progress is saved to localStorage after every
// completed mission, so the player can continue later.

// Mission runtime state. `stage` is per-mission; `target` is the world
// point the gold marker points at, or null when the goal is not a place.
const Missions = (function () {
  const state = {
    index: 0,          // 0-based: which mission is active
    active: false,     // a mission is running right now
    stage: 0,          // per-mission stage
    timer: 0,          // seconds left (0 = no clock)
    target: null,      // {x, y, label} or null
    passedRoadblocks: 0,
    hasPackage: false,
    evadeTime: 0,      // seconds spent unseen during mission 3
    message: '',       // banner text shown when the mission changes
    messageTimer: 0,
    completed: [],     // mission ids finished this story
    cash: CONFIG.startCash,
    storyDone: false,
  };

  function def() { return MISSION_DEFS[state.index]; }

  // Start (or restart) the current mission: reset its stages, set the
  // wanted level it opens with and place its first marker.
  function startMission(game) {
    const d = def();
    if (!d) { state.active = false; state.storyDone = true; return; }
    state.active = true;
    state.stage = 0;
    state.timer = d.timeLimit;
    state.passedRoadblocks = 0;
    state.hasPackage = false;
    state.evadeTime = 0;
    state.message = d.title + ' — ' + d.intro;
    state.messageTimer = 5;
    game.wanted = d.wanted;
    game.wantedHeat = d.wanted > 0 ? 1 : 0;
    setTarget(game);
  }

  // Where the gold marker points for the current mission and stage.
  function setTarget(game) {
    const L = City.data.landmarks;
    const i = state.index;
    if (i === 0) { state.target = null; return; }                       // steal any car
    if (i === 1) { state.target = { x: L.chopShop.x, y: L.chopShop.y, label: 'Chop Shop' }; return; }
    if (i === 2) { state.target = null; return; }                       // lose the heat
    if (i === 3) { state.target = state.passedRoadblocks >= 2
      ? { x: L.marina.x, y: L.marina.y, label: 'Marina' }
      : { x: L.marina.x, y: L.marina.y, label: 'Marina (via roadblocks)' }; return; }
    if (i === 4) {
      state.target = state.stage === 0
        ? { x: L.docks.x, y: L.docks.y, label: 'Package at the Docks' }
        : { x: L.penthouse.x, y: L.penthouse.y, label: 'Penthouse' };
      return;
    }
    if (i === 5) {
      state.target = state.stage === 0
        ? { x: L.casino.x, y: L.casino.y, label: 'Gold Supercar' }
        : { x: L.hideout.x, y: L.hideout.y, label: 'Beach Hideout' };
      return;
    }
    state.target = null;
  }

  // The objective line the HUD shows right now.
  function objectiveText() {
    if (!state.active) return 'Press Enter to start the story';
    const d = def();
    if (state.index === 3) return 'Pass roadblocks: ' + state.passedRoadblocks + '/2, then reach the Marina';
    if (state.index === 4 && state.stage === 1) return 'Deliver the package to the Penthouse';
    if (state.index === 5 && state.stage === 1) return 'Escape to the Beach Hideout — do not get busted';
    if (state.index === 2) return 'Lose the police (' + Math.ceil(state.evadeTime) + 's unseen)';
    return d.objective;
  }

  // Tick the mission clock and the per-mission win/lose checks.
  // Returns 'complete' | 'failed' | null.
  function update(game, dt) {
    if (!state.active) return null;
    const d = def();
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.timer = 0;
        return fail(game, 'Out of time — ' + d.title + ' failed.');
      }
    }
    const p = game.player;
    const inCar = !!game.playerCar;
    const L = City.data.landmarks;

    if (state.index === 0) {
      if (inCar) return complete(game);
    }
    if (state.index === 1) {
      if (inCar && dist(p.x, p.y, L.chopShop.x, L.chopShop.y) < 70) return complete(game);
    }
    if (state.index === 2) {
      if (game.wanted === 0) return complete(game);
      // Unseen time only counts while no police unit can see the player.
      if (!game.policeCanSee) state.evadeTime += dt;
    }
    if (state.index === 3) {
      if (state.passedRoadblocks >= 2 && dist(p.x, p.y, L.marina.x, L.marina.y) < 80) return complete(game);
    }
    if (state.index === 4) {
      if (state.stage === 0 && dist(p.x, p.y, L.docks.x, L.docks.y) < 70) {
        state.stage = 1;
        state.hasPackage = true;
        state.message = 'Package secured. Now take it to the Penthouse in Coral Heights.';
        state.messageTimer = 5;
        setTarget(game);
      } else if (state.stage === 1 && dist(p.x, p.y, L.penthouse.x, L.penthouse.y) < 70) {
        return complete(game);
      }
    }
    if (state.index === 5) {
      if (state.stage === 0 && game.playerCar && game.playerCar.gold) {
        state.stage = 1;
        state.message = 'The gold supercar is yours. Now vanish — the whole city is coming.';
        state.messageTimer = 5;
        game.wanted = 4;
        game.wantedHeat = 1;
        setTarget(game);
      } else if (state.stage === 1 && dist(p.x, p.y, L.hideout.x, L.hideout.y) < 90) {
        return complete(game);
      }
    }
    return null;
  }

  // Called when the player smashes or slips past a roadblock.
  function roadblockPassed(game) {
    if (state.active && state.index === 3) {
      state.passedRoadblocks++;
      state.message = 'Roadblock down — ' + state.passedRoadblocks + ' of 2.';
      state.messageTimer = 3;
      if (state.passedRoadblocks >= 2) setTarget(game);
    }
  }

  // Called when the player steals a car (any car, any mission).
  function carStolen(game) {
    if (game.wanted < 1) { game.wanted = 1; game.wantedHeat = 1; }
  }

  function complete(game) {
    const d = def();
    state.completed.push(d.id);
    state.cash += d.cash;
    state.message = d.title + ' complete! +$' + d.cash;
    state.messageTimer = 5;
    state.active = false;
    state.target = null;
    save(game);
    return 'complete';
  }

  function fail(game, reason) {
    state.message = reason;
    state.messageTimer = 6;
    state.active = false;
    state.target = null;
    save(game);
    return 'failed';
  }

  // Move on to the next mission after a completed one. Returns false when
  // the story is over (all six done).
  function nextMission(game) {
    state.index++;
    if (state.index >= MISSION_DEFS.length) {
      state.storyDone = true;
      state.message = 'NEON TIDE COMPLETE — Mara owns Palmera Bay.';
      state.messageTimer = 8;
      save(game);
      return false;
    }
    startMission(game);
    return true;
  }

  // Retry the mission that just failed.
  function retryMission(game) {
    startMission(game);
  }

  // One line per mission for the start screen: title, cash and status.
  function briefingLines() {
    return MISSION_DEFS.map((d, i) => {
      const done = state.completed.includes(d.id);
      const current = i === state.index && !state.storyDone;
      const mark = done ? 'DONE' : current ? 'NEXT' : 'LOCKED';
      return { id: d.id, title: d.title, cash: d.cash, mark, intro: d.intro };
    });
  }

  // Story progress as a fraction, for the start screen progress bar.
  function progressFraction() {
    return state.completed.length / MISSION_DEFS.length;
  }

  // --- Save / continue -----------------------------------------------

  function save(game) {
    try {
      const data = {
        index: state.index,
        completed: state.completed,
        cash: state.cash,
        storyDone: state.storyDone,
        wanted: game ? game.wanted : 0,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable: the story just does not persist */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (typeof data.index !== 'number') return false;
      state.index = clamp(data.index, 0, MISSION_DEFS.length - 1);
      state.completed = Array.isArray(data.completed) ? data.completed : [];
      state.cash = typeof data.cash === 'number' ? data.cash : CONFIG.startCash;
      state.storyDone = !!data.storyDone;
      return true;
    } catch (e) { return false; }
  }

  function reset(game) {
    state.index = 0;
    state.completed = [];
    state.cash = CONFIG.startCash;
    state.storyDone = false;
    state.active = false;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    startMission(game);
  }

  return {
    state, def, startMission, setTarget, objectiveText, update,
    roadblockPassed, carStolen, complete, fail, nextMission, retryMission,
    briefingLines, progressFraction, save, load, reset,
  };
})();
