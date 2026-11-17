/* Neon Tide — HUD: DOM panels, wanted stars, toasts, hints, and the minimap
   drawn in the corner of the main canvas. */
'use strict';

const HUD = {
  els: {},
  toastTimer: null,
  hintTimer: null,

  init() {
    const ids = ['hud', 'objective-box', 'mission-title', 'objective-text', 'objective-sub',
      'wanted-box', 'cash', 'health-fill', 'health-text', 'weapon-name', 'ammo',
      'speed-line', 'speed', 'hint-line', 'toast', 'crosshair', 'save-info'];
    for (const id of ids) this.els[id] = document.getElementById(id);
  },

  show() { this.els.hud.classList.remove('hidden'); },
  hide() { this.els.hud.classList.add('hidden'); },

  refreshObjective() {
    const o = MissionManager.objectiveText();
    this.els['mission-title'].textContent = o.title;
    this.els['objective-text'].textContent = o.text;
    this.els['objective-sub'].textContent = o.sub;
  },

  refreshStats(player, cash, wanted) {
    this.els.cash.textContent = fmtCash(cash);
    const hp = Math.max(0, Math.ceil(player.health));
    this.els['health-fill'].style.width = hp + '%';
    this.els['health-text'].textContent = hp;
    const w = WEAPONS[player.weapon];
    this.els['weapon-name'].textContent = w.name;
    this.els.ammo.textContent = w.ammo === Infinity ? '' : `(${player.ammo})`;
    if (player.inCar && player.car) {
      this.els['speed-line'].classList.remove('hidden');
      this.els.speed.textContent = Math.round(Math.abs(player.car.speed) * 0.36);
    } else {
      this.els['speed-line'].classList.add('hidden');
    }
    let stars = '';
    for (let i = 0; i < MAX_WANTED; i++) stars += `<span class="${i < wanted ? 'lit' : ''}">★</span>`;
    this.els['wanted-box'].innerHTML = stars;
  },

  showToast(text) {
    const el = this.els.toast;
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.style.opacity = 0; }, 2400);
  },

  showHint(text, ms) {
    const el = this.els['hint-line'];
    el.textContent = text;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { el.textContent = ''; }, ms || 3500);
  },

  /* Minimap: 190x190 in the bottom-left, roads, buildings, player, cars, marker. */
  drawMinimap(ctx, player) {
    const S = 190, scale = S / WORLD;
    const mx = 14, my = VIEW_H - S - 14;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,26,0.78)';
    ctx.fillRect(mx - 4, my - 4, S + 8, S + 8);
    ctx.strokeStyle = '#4a5480';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 4, my - 4, S + 8, S + 8);
    // Ground + beach.
    ctx.fillStyle = '#3f4a3a';
    ctx.fillRect(mx, my, S, S);
    ctx.fillStyle = '#e8d8a0';
    ctx.fillRect(mx, my + S * (3300 / WORLD), S, S * (300 / WORLD));
    ctx.fillStyle = '#2a7ab0';
    ctx.fillRect(mx, my + S * (3480 / WORLD), S, S * (120 / WORLD));
    // Roads.
    ctx.fillStyle = '#2c2f38';
    for (let i = 0; i <= WORLD / ROAD_GAP; i++) {
      const c = (i * ROAD_GAP + ROAD_W / 2) * scale;
      ctx.fillRect(mx + c - 1.5, my, 3, S);
      ctx.fillRect(mx, my + c - 1.5, S, 3);
    }
    // Buildings as dots.
    ctx.fillStyle = 'rgba(200,210,240,0.5)';
    for (const b of City.buildings) {
      ctx.fillRect(mx + b.x * scale, my + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    }
    // Mission marker: pulsing yellow diamond.
    if (MissionManager.marker) {
      const px = mx + MissionManager.marker.x * scale, py = my + MissionManager.marker.y * scale;
      const r = 5 + Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    // Police cars as red dots, traffic as white dots.
    ctx.fillStyle = '#ff2e4a';
    for (const c of Police.cars) { ctx.beginPath(); ctx.arc(mx + c.x * scale, my + c.y * scale, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const c of Traffic.cars) { ctx.fillRect(mx + c.x * scale - 1, my + c.y * scale - 1, 2, 2); }
    // Player: white arrow.
    const px = mx + player.x * scale, py = my + player.y * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // District label above the minimap.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(districtAt(player.x, player.y).toUpperCase(), mx, my - 8);
  },

  /* World-space objective marker: a bouncing yellow diamond + distance line. */
  drawMarker(ctx, cam) {
    const m = MissionManager.marker;
    if (!m || Game.state !== 'playing') return;
    const sx = m.x - cam.x, sy = m.y - cam.y;
    const bob = Math.sin(performance.now() / 250) * 6;
    // Off-screen: an edge arrow pointing toward it.
    if (sx < -20 || sx > VIEW_W + 20 || sy < -20 || sy > VIEW_H + 20) {
      const cx = VIEW_W / 2, cy = VIEW_H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ex = clamp(cx + Math.cos(a) * 420, 40, VIEW_W - 40);
      const ey = clamp(cy + Math.sin(a) * 260, 60, VIEW_H - 60);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.round(dist(Game.player.x, Game.player.y, m.x, m.y)) + 'm', ex, ey + 28);
      return;
    }
    ctx.save();
    ctx.translate(sx, sy + bob - 30);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
    // Ground ring.
    ctx.strokeStyle = 'rgba(255,210,63,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx, sy, 30, 12, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'left';
  },
};
