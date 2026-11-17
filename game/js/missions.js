// Neon Tide: Palmera Bay — the story.
// Six jobs for Mara Voss. Each mission is a chain of steps; a step is
// finished by reaching a place, stealing a car, collecting a package, or
// surviving a chase. Finishing a mission pays cash, and the last one
// wins the game.

import { dist } from './config.js';

// Landmark lookups come from the city at runtime (buildCity landmarks).
function landmark(city, id) {
  return city.landmarks.find((l) => l.id === id);
}

// Mission definitions. `steps` run in order; `kind` decides the check:
//   goto     — get within `radius` of (x, y)
//   steal    — be inside any car (or the named model)
//   collect  — reach the pickup point (a floating package)
//   survive  — stay alive with the wanted level for `seconds`
//   deliver  — reach the drop-off while driving the mission vehicle
export const MISSIONS = [
  {
    id: 'm1', title: '1 · First Wheels',
    briefing: 'No wheels, no work. Lift a car off the street and bring it to the Pier.',
    steps: [
      { kind: 'steal', text: 'Steal any car — walk up to one and press E' },
      { kind: 'goto', lm: 'pier', radius: 110, text: 'Drive to Palmera Pier' },
    ],
    reward: 400,
  },
  {
    id: 'm2', title: '2 · Beach Run',
    briefing: 'A package is buried by the lifeguard hut. Grab it and get it to Neon Plaza — quietly.',
    steps: [
      { kind: 'collect', lm: 'pier', radius: 70, text: 'Pick up the package at the Pier' },
      { kind: 'goto', lm: 'neon-plaza', radius: 100, text: 'Deliver the package to Neon Plaza' },
    ],
    reward: 650,
  },
  {
    id: 'm3', title: '3 · Hot Pursuit',
    briefing: 'The Bay PD knows your face now. Lose them — or at least outrun them to the Docks.',
    steps: [
      { kind: 'goto', lm: 'docks', radius: 120, text: 'Reach the Harbor Docks Gate', wanted: 2 },
      { kind: 'survive', seconds: 20, text: 'Survive the heat for 20 seconds' },
    ],
    reward: 900,
  },
  {
    id: 'm4', title: '4 · Harbor Heist',
    briefing: 'A Dock Hauler full of untraceable gear is parked at the Docks. Take it to the Old Town Garage.',
    steps: [
      { kind: 'steal', model: 'truck', text: 'Steal the Dock Hauler truck' },
      { kind: 'deliver', lm: 'garage', radius: 110, text: 'Deliver the truck to Old Town Garage' },
    ],
    reward: 1400,
  },
  {
    id: 'm5', title: '5 · Neon Getaway',
    briefing: 'Your crew contact is waiting at Neon Plaza. Pick her up, then shake the tail all the way to the Safehouse.',
    steps: [
      { kind: 'collect', lm: 'neon-plaza', radius: 80, text: 'Pick up the crew contact at Neon Plaza' },
      { kind: 'goto', lm: 'safehouse', radius: 120, text: 'Reach the Sunset Safehouse', wanted: 3 },
      { kind: 'survive', seconds: 15, text: 'Hold out until the heat dies down' },
    ],
    reward: 2000,
  },
  {
    id: 'm6', title: '6 · The Big Score',
    briefing: 'Bay National Bank. One grab, five stars of heat, and a straight run home. Do not get caught.',
    steps: [
      { kind: 'collect', lm: 'bank', radius: 80, text: 'Grab the score at Bay National Bank', wanted: 4 },
      { kind: 'goto', lm: 'safehouse', radius: 120, text: 'Escape to the Sunset Safehouse' },
    ],
    reward: 5000,
  },
];

// Runtime state for the mission chain.
export function makeMissionState() {
  return { index: 0, step: 0, timer: 0, done: false, won: false, packageAt: null };
}

// The current step's world position (from its landmark), or null.
export function currentTarget(city, ms) {
  const m = MISSIONS[ms.index];
  if (!m || ms.done) return null;
  const step = m.steps[ms.step];
  if (!step || !step.lm) return null;
  const lm = landmark(city, step.lm);
  return lm ? { x: lm.x, y: lm.y, radius: step.radius || 100, text: step.text } : null;
}

export function currentStepText(ms) {
  const m = MISSIONS[ms.index];
  if (!m) return '';
  if (ms.done) return 'All jobs done — Palmera Bay is yours.';
  const step = m.steps[ms.step];
  return step ? step.text : '';
}

export function currentMissionTitle(ms) {
  const m = MISSIONS[ms.index];
  return m ? m.title : 'Free roam';
}

// Advance the mission chain. Returns an event string when something
// happens ('step', 'mission', 'win') or null. Mutates the player only
// through the callbacks the caller supplies (cash, wanted).
export function updateMissions(city, ms, player, dt, events) {
  const m = MISSIONS[ms.index];
  if (!m || ms.done) return null;
  const step = m.steps[ms.step];
  if (!step) return null;

  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  let advanced = false;

  if (step.kind === 'goto' || step.kind === 'collect' || step.kind === 'deliver') {
    const lm = landmark(city, step.lm);
    if (lm && dist(px, py, lm.x, lm.y) < (step.radius || 100)) {
      if (step.kind === 'deliver' && (!player.inCar || player.inCar.model.id !== 'truck')) {
        // Deliver needs the truck; standing there on foot does not count.
      } else {
        advanced = true;
      }
    }
    if (step.kind === 'collect' && step.wanted && player.wanted < step.wanted) {
      player.wanted = step.wanted;
    }
    if (step.kind === 'goto' && step.wanted && player.wanted < step.wanted && advanced) {
      player.wanted = step.wanted;
    }
  } else if (step.kind === 'steal') {
    if (player.inCar && (!step.model || player.inCar.model.id === step.model)) advanced = true;
  } else if (step.kind === 'survive') {
    ms.timer += dt;
    if (ms.timer >= step.seconds) advanced = true;
  }

  if (!advanced) return null;
  ms.timer = 0;
  ms.step += 1;
  if (ms.step >= m.steps.length) {
    player.cash += m.reward;
    events.push({ type: 'mission', text: `${m.title} complete — +$${m.reward}` });
    ms.index += 1;
    ms.step = 0;
    if (ms.index >= MISSIONS.length) {
      ms.done = true;
      ms.won = true;
      return 'win';
    }
    return 'mission';
  }
  return 'step';
}

// ---- Heat and markers ----

// Some steps carry a wanted level: the job itself draws the heat.
// Apply it while the step is active so the chase starts with the job.
export function applyStepHeat(ms, player) {
  const m = MISSIONS[ms.index];
  if (!m || ms.done) return;
  const step = m.steps[ms.step];
  if (step && step.wanted && player.wanted < step.wanted) {
    player.wanted = step.wanted;
    player.wantedTimer = 0;
  }
}

// Draw the mission target: a pulsing ring and a bouncing arrow, plus a
// floating package when the step is a pickup.
export function drawMissionTarget(ctx, cam, city, ms, time) {
  const t = currentTarget(city, ms);
  if (!t) return;
  const m = MISSIONS[ms.index];
  const step = m.steps[ms.step];
  const pulse = 1 + Math.sin(time * 4) * 0.12;
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(t.x - cam.x, t.y - cam.y, (t.radius * 0.45) * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,217,74,0.18)';
  ctx.beginPath();
  ctx.arc(t.x - cam.x, t.y - cam.y, (t.radius * 0.45) * pulse, 0, Math.PI * 2);
  ctx.fill();
  // A bouncing marker above the target so it reads from far away.
  const bob = Math.sin(time * 5) * 6;
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(t.x - cam.x, t.y - 52 + bob - cam.y);
  ctx.lineTo(t.x - 10 - cam.x, t.y - 70 + bob - cam.y);
  ctx.lineTo(t.x + 10 - cam.x, t.y - 70 + bob - cam.y);
  ctx.closePath();
  ctx.fill();
  if (step.kind === 'collect') {
    ctx.fillStyle = '#ff9d5c';
    ctx.fillRect(t.x - 10 - cam.x, t.y - 10 - cam.y, 20, 16);
    ctx.fillStyle = '#ffd94a';
    ctx.fillRect(t.x - 10 - cam.x, t.y - 3 - cam.y, 20, 3);
  }
}
