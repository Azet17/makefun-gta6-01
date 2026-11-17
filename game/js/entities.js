/* Neon Tide — traffic, pedestrians and police. All non-player actors in the city. */
'use strict';

/* ---- Traffic cars: follow the road grid, stop for nothing, honk rarely. ---- */
const Traffic = {
  cars: [],
  maxCars: 26,

  spawn(n, near) {
    for (let i = 0; i < n; i++) {
      const p = City.randomRoadPoint();
      if (near && dist(p.x, p.y, near.x, near.y) < 500) continue;
      const model = pick(CAR_MODELS);
      const vertical = Math.random() < 0.5;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.cars.push({
        x: p.x, y: p.y, angle: vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
        speed: rand(70, 130), model, vertical, dir, color: model.color,
        honkT: rand(4, 20), parked: false, id: Math.random().toString(36).slice(2, 8),
      });
    }
  },

  update(dt, player) {
    // Keep the count topped up near the player.
    if (this.cars.length < this.maxCars && Math.random() < dt * 2) {
      this.spawn(1, player);
    }
    for (const c of this.cars) {
      if (c.parked) continue;
      // Drive along the current road; at an intersection, sometimes turn.
      const step = c.speed * dt;
      c.x += Math.cos(c.angle) * step;
      c.y += Math.sin(c.angle) * step;
      const onIntersection = Math.abs(((c.x % ROAD_GAP) + ROAD_GAP) % ROAD_GAP - ROAD_W / 2) < 14 &&
                             Math.abs(((c.y % ROAD_GAP) + ROAD_GAP) % ROAD_GAP - ROAD_W / 2) < 14;
      if (onIntersection && Math.random() < dt * 1.2) {
        const turns = [0, Math.PI / 2, -Math.PI / 2];
        c.angle += pick(turns);
      }
      // Snap back onto the road centre if drifting (keeps cars on asphalt).
      const mx = ((c.x % ROAD_GAP) + ROAD_GAP) % ROAD_GAP;
      const my = ((c.y % ROAD_GAP) + ROAD_GAP) % ROAD_GAP;
      if (c.vertical) c.x = Math.round((c.x - ROAD_W / 2) / ROAD_GAP) * ROAD_GAP + ROAD_W / 2 + (mx < ROAD_W / 2 ? 8 : -8);
      else c.y = Math.round((c.y - ROAD_W / 2) / ROAD_GAP) * ROAD_GAP + ROAD_W / 2 + (my < ROAD_W / 2 ? 8 : -8);
      if (c.x < 40 || c.x > WORLD - 40 || c.y < 40 || c.y > WORLD - 40) {
        const p = City.randomRoadPoint();
        c.x = p.x; c.y = p.y;
      }
      // Slow down when the player is right ahead.
      if (player && dist(c.x, c.y, player.x, player.y) < 90) c.speed = Math.max(40, c.speed - 60 * dt);
      else c.speed = Math.min(c.model.top * 0.45, c.speed + 30 * dt);
      c.honkT -= dt;
      if (c.honkT <= 0) { c.honkT = rand(8, 25); if (player && dist(c.x, c.y, player.x, player.y) < 320) Sound.horn(); }
    }
  },

  draw(ctx, cam) {
    for (const c of this.cars) drawCar(ctx, cam, c.x, c.y, c.angle, c.model, c.color);
  },
};

/* ---- Pedestrians: walk the sidewalks, flee from gunfire and cars. ---- */
const Pedestrians = {
  list: [],
  maxPeds: 34,
  palette: ['#e8e0d0', '#c8a878', '#8a6a4a', '#5a3a2a', '#d8b0a0', '#a0c8d8'],
  shirtColors: ['#e84a5a', '#4a9be8', '#7bc23a', '#f2c200', '#9a5ae8', '#ff7ad9', '#e8e8e8', '#3a3a4a'],

  spawn(n, near) {
    for (let i = 0; i < n; i++) {
      const p = City.randomRoadPoint();
      if (near && dist(p.x, p.y, near.x, near.y) < 300) continue;
      this.list.push({
        x: p.x + rand(-30, 30), y: p.y + rand(-30, 30),
        angle: rand(0, Math.PI * 2), speed: rand(28, 55),
        skin: pick(this.palette), shirt: pick(this.shirtColors),
        flee: 0, walkPhase: rand(0, 6), dead: false, deadT: 0,
      });
    }
  },

  update(dt, player, danger) {
    if (this.list.length < this.maxPeds && Math.random() < dt * 3) this.spawn(1, player);
    for (const p of this.list) {
      if (p.dead) { p.deadT += dt; continue; }
      if (danger && dist(p.x, p.y, danger.x, danger.y) < 260) {
        p.flee = 2.5;
        p.angle = angleTo(danger.x, danger.y, p.x, p.y);
      }
      if (p.flee > 0) {
        p.flee -= dt;
        p.x += Math.cos(p.angle) * 120 * dt;
        p.y += Math.sin(p.angle) * 120 * dt;
      } else {
        p.walkPhase += dt * 6;
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
        if (Math.random() < dt * 0.15) p.angle += rand(-1.2, 1.2);
      }
      const fixed = City.resolveCollision(p.x, p.y, 10);
      p.x = fixed.x; p.y = fixed.y;
      p.x = clamp(p.x, 20, WORLD - 20); p.y = clamp(p.y, 20, WORLD - 20);
    }
    this.list = this.list.filter((p) => !p.dead || p.deadT < 8);
  },

  draw(ctx, cam) {
    for (const p of this.list) {
      const sx = p.x - cam.x, sy = p.y - cam.y;
      if (sx < -30 || sx > VIEW_W + 30 || sy < -30 || sy > VIEW_H + 30) continue;
      if (p.dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(sx, sy, 14, 7, p.angle, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.shirt;
        ctx.beginPath(); ctx.ellipse(sx, sy, 12, 6, p.angle, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const bob = Math.sin(p.walkPhase) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx + 2, sy + 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.shirt;
      ctx.beginPath(); ctx.arc(sx, sy + bob * 0.3, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.skin;
      ctx.beginPath(); ctx.arc(sx, sy - 9 + bob * 0.3, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2a3a';
      ctx.beginPath(); ctx.arc(sx, sy - 11 + bob * 0.3, 5, Math.PI, 0); ctx.fill();
    }
  },
};

/* ---- Police: cars that chase the player when wanted, officers on foot. ---- */
const Police = {
  cars: [],
  officers: [],
  sirenT: 0,

  wantedCarCount(wanted) { return wanted <= 0 ? 0 : wanted <= 1 ? 1 : wanted <= 2 ? 2 : wanted <= 3 ? 3 : wanted <= 4 ? 4 : 5; },

  update(dt, player, wanted) {
    const want = this.wantedCarCount(wanted);
    while (this.cars.length < want) {
      const a = rand(0, Math.PI * 2);
      this.cars.push({
        x: clamp(player.x + Math.cos(a) * 700, 40, WORLD - 40),
        y: clamp(player.y + Math.sin(a) * 700, 40, WORLD - 40),
        angle: 0, speed: 0, color: POLICE_COLOR, model: CAR_MODELS[1],
        ramT: 0,
      });
    }
    while (this.cars.length > want) this.cars.pop();
    this.sirenT -= dt;
    if (wanted > 0 && this.sirenT <= 0) { this.sirenT = 1.1; Sound.sirenBlip(); }
    for (const c of this.cars) {
      const d = dist(c.x, c.y, player.x, player.y);
      const target = angleTo(c.x, c.y, player.x, player.y);
      c.angle += clamp(angleDiff(c.angle, target), -3.2 * dt, 3.2 * dt);
      const wantSpeed = d > 420 ? POLICE_TOP : d > 120 ? 300 : 210;
      c.speed = lerp(c.speed, wantSpeed, dt * 1.4);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      const fixed = City.resolveCollision(c.x, c.y, 20);
      c.x = fixed.x; c.y = fixed.y;
      c.ramT -= dt;
      if (d < 70 && c.ramT <= 0) { c.ramT = 1; Sound.crash(); }
    }
    // Officers on foot only at high wanted levels.
    const wantOfficers = wanted >= 4 ? 3 : wanted >= 3 ? 1 : 0;
    while (this.officers.length < wantOfficers) {
      const a = rand(0, Math.PI * 2);
      this.officers.push({ x: clamp(player.x + Math.cos(a) * 400, 40, WORLD - 40), y: clamp(player.y + Math.sin(a) * 400, 40, WORLD - 40), hp: 40, shootT: rand(0.5, 1.5) });
    }
    while (this.officers.length > wantOfficers) this.officers.pop();
    for (const o of this.officers) {
      const d = dist(o.x, o.y, player.x, player.y);
      if (d > 130) {
        const a = angleTo(o.x, o.y, player.x, player.y);
        o.x += Math.cos(a) * 150 * dt;
        o.y += Math.sin(a) * 150 * dt;
      }
      o.shootT -= dt;
      if (o.shootT <= 0 && d < 420) {
        o.shootT = rand(1.2, 2.0);
        Combat.enemyShoot(o.x, o.y, angleTo(o.x, o.y, player.x, player.y), 9);
      }
    }
  },

  draw(ctx, cam) {
    for (const c of this.cars) {
      drawCar(ctx, cam, c.x, c.y, c.angle, c.model, c.color, true);
      // Flashing light bar.
      const sx = c.x - cam.x, sy = c.y - cam.y;
      const phase = Math.floor(performance.now() / 180) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2e4a' : '#2e7dff';
      ctx.beginPath(); ctx.arc(sx - 6, sy - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = phase ? '#2e7dff' : '#ff2e4a';
      ctx.beginPath(); ctx.arc(sx + 6, sy - 4, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const o of this.officers) {
      const sx = o.x - cam.x, sy = o.y - cam.y;
      if (sx < -30 || sx > VIEW_W + 30 || sy < -30 || sy > VIEW_H + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx + 2, sy + 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#20264a';
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8d8b0';
      ctx.beginPath(); ctx.arc(sx, sy - 9, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#20264a';
      ctx.beginPath(); ctx.arc(sx, sy - 11, 5, Math.PI, 0); ctx.fill();
    }
  },
};

/* ---- Shared car drawing: top-down body, cabin, wheels, headlights. ---- */
function drawCar(ctx, cam, x, y, angle, model, color, isPolice) {
  const sx = x - cam.x, sy = y - cam.y;
  if (sx < -70 || sx > VIEW_W + 70 || sy < -70 || sy > VIEW_H + 70) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  const w = model.w, h = model.h;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  // Wheels.
  ctx.fillStyle = '#14141a';
  for (const [wx, wy] of [[-w / 2 + 8, -h / 2 - 2], [w / 2 - 8, -h / 2 - 2], [-w / 2 + 8, h / 2 - 2], [w / 2 - 8, h / 2 - 2]]) {
    ctx.fillRect(wx, wy, 10, 6);
  }
  // Body.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 7);
  ctx.fill();
  // Cabin + windshield.
  ctx.fillStyle = isPolice ? '#d8e8f8' : '#1c2438';
  ctx.beginPath(); ctx.roundRect(-w / 2 + 12, -h / 2 + 4, w - 26, h - 8, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(w / 2 - 12, -h / 2 + 5, 3, h - 10);
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 4);
  ctx.fillRect(w / 2 - 2, h / 2 - 7, 3, 4);
  if (isPolice) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('BPD', 0, 3);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
