// Neon Tide: Palmera Bay — HUD and minimap.
// The DOM overlay shows cash, health, wanted stars, speed and the
// mission objective; the minimap canvas shows the whole city at a glance
// with the player, police and mission target marked.

import { WANTED_MAX, WANTED_LABELS } from './config.js';
import { districtAt } from './city.js';

export function makeHud() {
  const el = (id) => document.getElementById(id);
  return {
    root: el('hud'), wanted: el('wanted'), cash: el('cash'),
    title: el('objective-title'), text: el('objective-text'),
    healthFill: el('health-fill'), healthLabel: el('health-label'),
    speedValue: el('speed-value'), minimap: el('minimap'),
    toast: el('toast'), hint: el('hint'), status: el('status'),
  };
}

// Wanted stars: filled gold stars for the level, dim outlines above it.
export function renderWanted(hud, wanted) {
  let stars = '';
  for (let i = 0; i < WANTED_MAX; i++) {
    stars += `<span class="star${i < wanted ? ' on' : ''}">★</span>`;
  }
  hud.wanted.innerHTML = stars + `<span class="wanted-label">${WANTED_LABELS[wanted] || ''}</span>`;
}

export function renderHud(hud, state) {
  const p = state.player;
  renderWanted(hud, p.wanted);
  hud.cash.textContent = `$${Math.floor(p.cash).toLocaleString('en-US')}`;
  const hp = Math.max(0, Math.round(p.health));
  hud.healthFill.style.width = `${hp}%`;
  hud.healthFill.style.background = hp > 50 ? '#2ecc71' : hp > 25 ? '#f39c12' : '#e74c3c';
  hud.healthLabel.textContent = `HP ${hp}`;
  const speed = p.inCar ? Math.abs(p.inCar.speed) : Math.abs(p.speed);
  hud.speedValue.textContent = String(Math.round(speed * 0.18));
  hud.title.textContent = state.missionTitle;
  hud.text.textContent = state.missionText;
  const district = districtAt(p.x, p.y);
  hud.hint.textContent = state.hint || `${district.name} — ${p.inCar ? 'E exit car · H horn' : 'E steal car · Space punch'}`;
  hud.status.textContent = `${state.missionTitle}. ${state.missionText} Wanted level ${p.wanted}. Cash $${Math.floor(p.cash)}.`;
}

// The minimap: whole city shrunk into a 220x160 canvas.
export function drawMinimap(hud, city, state) {
  const ctx = hud.minimap.getContext('2d');
  const W = hud.minimap.width, H = hud.minimap.height;
  const sx = W / 3600, sy = H / 2600;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#14141c';
  ctx.fillRect(0, 0, W, H);
  for (const d of city.districts || []) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x * sx, d.y * sy, d.w * sx, d.h * sy);
  }
  ctx.fillStyle = '#1d6f8e';
  ctx.fillRect(0, 0, 130 * sx, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (const a of state.avenues) { ctx.beginPath(); ctx.moveTo(a * sx, 0); ctx.lineTo(a * sx, H); ctx.stroke(); }
  for (const s of state.streets) { ctx.beginPath(); ctx.moveTo(0, s * sy); ctx.lineTo(W, s * sy); ctx.stroke(); }
  if (state.target) {
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(state.target.x * sx, state.target.y * sy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(state.target.x * sx, state.target.y * sy, 8, 0, Math.PI * 2); ctx.stroke();
  }
  for (const pc of state.police) {
    ctx.fillStyle = '#2e7bff';
    ctx.fillRect(pc.x * sx - 2, pc.y * sy - 2, 4, 4);
  }
  const p = state.player;
  ctx.fillStyle = '#ff5c8a';
  ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 6, 0, Math.PI * 2); ctx.stroke();
}

// A short toast message over the HUD, fading after a few seconds.
export function showToast(hud, text, ms = 3600) {
  hud.toast.textContent = text;
  hud.toast.hidden = false;
  clearTimeout(hud.toast._t);
  hud.toast._t = setTimeout(() => { hud.toast.hidden = true; }, ms);
}

// ---- Screen switching ----

// Show exactly one full-screen overlay (start / pause / end), or none
// while the game is running.
export function showScreen(name) {
  for (const id of ['screen-start', 'screen-pause', 'screen-end']) {
    document.getElementById(id).hidden = id !== `screen-${name}`;
  }
  document.getElementById('hud').hidden = name !== null && name !== 'pause' ? true : name === null ? false : true;
  if (name === null) document.getElementById('hud').hidden = false;
}
