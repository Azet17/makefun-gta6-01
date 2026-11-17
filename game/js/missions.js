// Neon Tide — Palmera Bay: the story.
// Six missions, one state machine. A mission is started, its
// objective is checked every tick, and it either completes (money,
// next mission, save) or fails (timer out, busted, wasted).
// Nothing here draws anything: it returns plain status for the HUD.
'use strict';

function makeMissionState() {
  return {
    index: 0,                 // which of MISSIONS is active
    phase: 'idle',            // idle | active | hold | done | failed
    timer: 0,                 // countdown for timed missions
    holdLeft: 0,              // seconds left holding a point
    message: '',
    messageUntil: 0,
    completed: [],            // ids of finished missions
    storyDone: false,
  };
}

function currentMission(state) {
  return MISSIONS[state.index] || null;
}

function startMission(state, index, now) {
  const m = MISSIONS[index];
  if (!m) return false;
  state.index = index;
  state.phase = 'active';
  state.timer = m.timeLimit || 0;
  state.holdLeft = m.holdSeconds || 0;
  state.message = m.name + ' — ' + m.brief;
  state.messageUntil = now + 6;
  return true;
}

// Distance from the player (car or on foot) to the mission target.
function missionDistance(state, player) {
  const m = currentMission(state);
  if (!m) return Infinity;
  const px = player.onFoot ? player.footX : player.x;
  const py = player.onFoot ? player.footY : player.y;
  return Math.sqrt(dist2(px, py, m.target.x, m.target.y));
}

// One tick of mission logic. Returns an event object when something
// notable happens, else null. `events` is filled by the caller with
// { wanted, busted, wasted } flags for failure checks.
function updateMissions(state, player, dt, now, flags) {
  const m = currentMission(state);
  if (!m || state.phase === 'done') return null;
  if (state.phase === 'idle') {
    startMission(state, state.index, now);
    return { type: 'start', mission: m };
  }
  if (flags && flags.wasted) {
    state.phase = 'failed';
    return { type: 'failed', mission: m, reason: 'wasted' };
  }
  if (flags && flags.busted) {
    state.phase = 'failed';
    return { type: 'failed', mission: m, reason: 'busted' };
  }
  if (m.timeLimit) {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.phase = 'failed';
      return { type: 'failed', mission: m, reason: 'time' };
    }
  }
  const d = missionDistance(state, player);
  switch (m.kind) {
    case 'steal':
      // Reach the coupe, then press F to jack it: the steal itself
      // is completed by main.js calling completeSteal().
      if (d < 90 && !player.onFoot) {
        state.message = 'Press F to steal the coupe!';
        state.messageUntil = now + 1;
      }
      break;
    case 'heist': {
      if (d < 110) {
        if (state.phase === 'active') {
          state.phase = 'hold';
          state.holdLeft = m.holdSeconds;
        }
        state.holdLeft -= dt;
        state.message = 'Cracking the vault… ' + Math.ceil(state.holdLeft) + 's';
        state.messageUntil = now + 0.5;
        if (state.holdLeft <= 0) return completeMission(state, player, now);
      } else if (state.phase === 'hold') {
        state.phase = 'active';
        state.holdLeft = m.holdSeconds;
        state.message = 'You left the vault! Get back inside the ring.';
        state.messageUntil = now + 3;
      }
      break;
    }
    case 'escape':
      // Complete when the wanted level has fully faded.
      if (player.wanted === 0) return completeMission(state, player, now);
      state.message = 'Lose the cops — stars must hit zero. Hide in the docks.';
      state.messageUntil = now + 1;
      break;
    default:
      // getaway / delivery / finale: reach the marker.
      if (d < 80) return completeMission(state, player, now);
      break;
  }
  return null;
}

// Called by main.js when Mara steals the target car of mission 1.
function completeSteal(state, player, now) {
  const m = currentMission(state);
  if (!m || m.kind !== 'steal') return null;
  return completeMission(state, player, now);
}

function completeMission(state, player, now) {
  const m = currentMission(state);
  player.money += m.reward;
  player.health = Math.min(100, player.health + 20);
  state.completed.push(m.id);
  state.phase = 'done';
  state.message = m.name + ' complete! +$' + m.reward;
  state.messageUntil = now + 5;
  const event = { type: 'complete', mission: m, reward: m.reward };
  // Advance, or finish the story.
  if (state.index + 1 < MISSIONS.length) {
    state.index += 1;
    state.phase = 'idle';
  } else {
    state.storyDone = true;
  }
  return event;
}

function retryMission(state, now) {
  state.phase = 'idle';
  state.timer = 0;
  state.holdLeft = 0;
  state.message = 'Try again — ' + currentMission(state).name;
  state.messageUntil = now + 4;
}

// Short progress line for the pause screen / save note, e.g. "3/6".
function missionProgressText(state) {
  return state.completed.length + '/' + MISSIONS.length + ' missions complete';
}

// Objective text for the HUD, one line.
function missionObjectiveText(state) {
  const m = currentMission(state);
  if (!m) return 'Story complete — free roam Palmera Bay!';
  if (state.phase === 'failed') return 'Mission failed — press R to retry.';
  if (state.phase === 'done') return m.name + ' complete!';
  let text = 'Mission ' + m.id + '/6: ' + m.name + ' — ' + m.hint;
  if (m.timeLimit && state.timer > 0) text += ' [' + Math.ceil(state.timer) + 's]';
  if (m.kind === 'heist' && state.phase === 'hold') text += ' [' + Math.ceil(state.holdLeft) + 's]';
  return text;
}
