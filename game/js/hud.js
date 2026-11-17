// Neon Tide — Palmera Bay: the HUD.
// DOM for the text readouts (health, wanted stars, speed, money,
// mission line) and a small canvas for the minimap. The HUD never
// owns game state: main.js hands it a snapshot each frame.
'use strict';

function makeHud() {
  return {
    healthFill: document.getElementById('health-fill'),
    healthText: document.getElementById('health-text'),
    stars: document.getElementById('wanted-stars'),
    speedText: document.getElementById('speed-text'),
    moneyText: document.getElementById('money-text'),
    missionText: document.getElementById('mission-text'),
    districtText: document.getElementById('district-text'),
    toast: document.getElementById('toast'),
    minimap: document.getElementById('minimap'),
    toastUntil: 0,
  };
}

// Mute button label, so the player can see the sound state at a glance.
function hudSetSoundLabel(hud, muted) {
  const btn = document.getElementById('btn-sound');
  if (btn) btn.textContent = muted ? '🔇 SOUND OFF' : '🔊 SOUND ON';
}

function hudShowToast(hud, text, now, seconds) {
  if (!hud.toast) return;
  hud.toast.textContent = text;
  hud.toast.classList.add('show');
  hud.toastUntil = now + (seconds || 4);
}

function hudTickToast(hud, now) {
  if (hud.toast && now > hud.toastUntil) hud.toast.classList.remove('show');
}

// Refresh every readout from one snapshot object:
// { health, wanted, speedKmh, money, missionText, district, onFoot }.
function hudUpdate(hud, snap, now) {
  if (hud.healthFill) {
    hud.healthFill.style.width = Math.max(0, snap.health) + '%';
    hud.healthFill.className = 'fill' + (snap.health < 30 ? ' low' : snap.health < 60 ? ' mid' : '');
  }
  if (hud.healthText) hud.healthText.textContent = Math.ceil(Math.max(0, snap.health)) + ' HP';
  if (hud.stars) {
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < snap.wanted ? '★' : '☆';
    hud.stars.textContent = stars;
    hud.stars.className = 'stars' + (snap.wanted >= 4 ? ' hot' : snap.wanted > 0 ? ' warm' : '');
  }
  if (hud.speedText) hud.speedText.textContent = Math.round(Math.abs(snap.speedKmh)) + ' km/h';
  if (hud.moneyText) hud.moneyText.textContent = '$' + Math.floor(snap.money).toLocaleString('en-US');
  if (hud.missionText) hud.missionText.textContent = snap.missionText;
  if (hud.districtText) hud.districtText.textContent = snap.district + (snap.onFoot ? ' · on foot' : '');
  hudTickToast(hud, now);
}

// Draw the minimap: whole city shrunk into a 190x150 canvas, with
// the player arrow, police dots, traffic dots and the gold mission
// marker. North is up; the beach is the blue strip at the bottom.
function hudDrawMinimap(hud, city, player, police, traffic, missionTarget) {
  const canvas = hud.minimap;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const sx = w / CONFIG.WORLD_W, sy = h / CONFIG.WORLD_H;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, w, h);
  // District tints.
  for (const d of CONFIG.DISTRICTS) {
    ctx.fillStyle = d.tint;
    ctx.fillRect(d.x * sx, d.y * sy, d.w * sx, d.h * sy);
  }
  // Beach sand.
  ctx.fillStyle = '#c9a86a';
  ctx.fillRect(city.beach.x * sx, city.beach.y * sy, city.beach.w * sx, city.beach.h * sy);
  // Roads.
  ctx.fillStyle = '#3a4356';
  for (const r of city.roads) ctx.fillRect(r.x * sx, r.y * sy, Math.max(1, r.w * sx), Math.max(1, r.h * sy));
  // Mission marker: a pulsing gold ring.
  if (missionTarget) {
    const pulse = 4 + Math.sin(Date.now() / 240) * 2;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(missionTarget.x * sx, missionTarget.y * sy, pulse + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(missionTarget.x * sx, missionTarget.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Traffic: faint white dots.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const car of traffic) {
    ctx.fillRect(car.x * sx - 1, car.y * sy - 1, 2, 2);
  }
  // Police: red-blue dots.
  for (const car of police) {
    ctx.fillStyle = '#ff3344';
    ctx.beginPath(); ctx.arc(car.x * sx, car.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Player: a pink arrow that rotates with the car.
  const px = player.onFoot ? player.footX : player.x;
  const py = player.onFoot ? player.footY : player.y;
  const pa = player.onFoot ? player.footAngle : player.angle;
  ctx.save();
  ctx.translate(px * sx, py * sy);
  ctx.rotate(pa);
  ctx.fillStyle = '#ff2fb3';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // Border.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}
