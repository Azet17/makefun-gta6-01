/* Neon Tide — combat: weapons, bullets, particles, cash drops and pickups. */
'use strict';

const WEAPONS = {
  fists:  { name: 'Fists',   damage: 12, rate: 0.38, range: 46,  spread: 0.1,  speed: 0,   ammo: Infinity, auto: false },
  pistol: { name: 'Pistol',  damage: 22, rate: 0.28, range: 460, spread: 0.05, speed: 900, ammo: 24,  auto: false },
  shotgun:{ name: 'Shotgun', damage: 14, rate: 0.7,  range: 300, spread: 0.22, speed: 780, ammo: 12,  auto: false, pellets: 5 },
  smg:    { name: 'SMG',     damage: 11, rate: 0.09, range: 380, spread: 0.12, speed: 950, ammo: 40,  auto: true },
};

const Combat = {
  bullets: [],       // player + enemy bullets: {x,y,vx,vy,damage,from,life}
  particles: [],     // sparks, smoke, blood puffs
  cashDrops: [],     // green cash pickups
  pickups: [],       // weapon / health pickups on the ground

  reset() { this.bullets = []; this.particles = []; this.cashDrops = []; this.pickups = []; },

  /* Player fires the equipped weapon toward an angle. Returns true if a shot left the barrel. */
  playerShoot(player, angle) {
    const w = WEAPONS[player.weapon];
    if (player.fireT > 0) return false;
    if (w.ammo !== Infinity && player.ammo <= 0) { Sound.click(); Game.showHint('Out of ammo — buy more at the gun shop'); return false; }
    player.fireT = w.rate;
    if (player.weapon === 'fists') {
      Sound.punch();
      this.meleeHit(player, angle, w);
      return true;
    }
    if (w.ammo !== Infinity) player.ammo--;
    Sound.shoot();
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = angle + rand(-w.spread, w.spread);
      this.bullets.push({
        x: player.x + Math.cos(angle) * 20, y: player.y + Math.sin(angle) * 20,
        vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        damage: w.damage, from: 'player', life: w.range / w.speed,
      });
    }
    this.spawnParticles(player.x + Math.cos(angle) * 26, player.y + Math.sin(angle) * 26, 3, '#ffd23f');
    return true;
  },

  meleeHit(player, angle, w) {
    const reach = w.range;
    const hx = player.x + Math.cos(angle) * reach, hy = player.y + Math.sin(angle) * reach;
    // Hit pedestrians, rivals, officers.
    for (const p of Pedestrians.list) {
      if (!p.dead && dist(p.x, p.y, hx, hy) < 26) { p.dead = true; this.blood(p.x, p.y); Game.commitCrime(1, p.x, p.y); }
    }
    for (const e of MissionManager.spawned) {
      if (!e.dead && dist(e.x, e.y, hx, hy) < 26) { e.hp -= w.damage; this.blood(e.x, e.y); if (e.hp <= 0) { e.dead = true; MissionManager.onKill(); } }
    }
    for (const o of Police.officers) {
      if (dist(o.x, o.y, hx, hy) < 26) { o.hp -= w.damage; this.blood(o.x, o.y); if (o.hp <= 0) { Police.officers.splice(Police.officers.indexOf(o), 1); Game.commitCrime(1, o.x, o.y); } }
    }
  },

  enemyShoot(x, y, angle, damage) {
    Sound.shoot();
    this.bullets.push({
      x: x + Math.cos(angle) * 20, y: y + Math.sin(angle) * 20,
      vx: Math.cos(angle + rand(-0.06, 0.06)) * 700, vy: Math.sin(angle + rand(-0.06, 0.06)) * 700,
      damage, from: 'enemy', life: 0.9,
    });
  },

  spawnParticles(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x, y, vx: rand(-90, 90), vy: rand(-90, 90), life: rand(0.2, 0.5), max: 0.5, color, size: rand(2, 4) });
    }
  },
  blood(x, y) { this.spawnParticles(x, y, 10, '#c02030'); },
  smoke(x, y) { this.spawnParticles(x, y, 4, '#888888'); },

  dropCash(x, y, amount) { this.cashDrops.push({ x, y, amount, t: 0 }); },
  dropPickup(x, y, kind) { this.pickups.push({ x, y, kind, t: 0 }); },

  update(dt, player) {
    // Bullets.
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (City.hitsBuilding(b.x, b.y, 2)) { b.life = 0; this.spawnParticles(b.x, b.y, 3, '#cccccc'); continue; }
      if (b.from === 'player') {
        // Rivals.
        for (const e of MissionManager.spawned) {
          if (!e.dead && dist(b.x, b.y, e.x, e.y) < 14) {
            e.hp -= b.damage; b.life = 0; this.blood(b.x, b.y);
            if (e.hp <= 0) { e.dead = true; MissionManager.onKill(); this.dropCash(e.x, e.y, randInt(40, 90)); }
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const o of Police.officers) {
          if (dist(b.x, b.y, o.x, o.y) < 14) {
            o.hp -= b.damage; b.life = 0; this.blood(b.x, b.y);
            if (o.hp <= 0) { Police.officers.splice(Police.officers.indexOf(o), 1); Game.commitCrime(1, o.x, o.y); }
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const p of Pedestrians.list) {
          if (!p.dead && dist(b.x, b.y, p.x, p.y) < 12) {
            p.dead = true; b.life = 0; this.blood(b.x, b.y); Game.commitCrime(1, p.x, p.y);
            break;
          }
        }
        if (b.life <= 0) continue;
        // Police cars can be shot out (they smoke and slow).
        for (const c of Police.cars) {
          if (dist(b.x, b.y, c.x, c.y) < 24) { b.life = 0; c.speed *= 0.6; this.smoke(b.x, b.y); break; }
        }
      } else if (b.from === 'enemy') {
        if (player.inCar) {
          const car = player.car;
          if (car && dist(b.x, b.y, car.x, car.y) < 26) {
            b.life = 0; car.hp = Math.max(0, (car.hp || 100) - b.damage); this.spawnParticles(b.x, b.y, 4, '#ffcc00');
            if (car.hp <= 0) Game.carDestroyed();
          }
        } else if (dist(b.x, b.y, player.x, player.y) < PLAYER_RADIUS) {
          b.life = 0;
          Game.damagePlayer(b.damage);
          this.blood(b.x, b.y);
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    // Particles.
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    // Cash drops.
    for (const d of this.cashDrops) {
      d.t += dt;
      if (!player.inCar && dist(player.x, player.y, d.x, d.y) < 30) {
        Game.cash += d.amount;
        Sound.cash();
        Game.showToast('+$' + fmtCash(d.amount));
        MissionManager.onCollect();
        d.amount = 0;
      }
    }
    this.cashDrops = this.cashDrops.filter((d) => d.amount > 0 && d.t < 60);
    // Pickups.
    for (const p of this.pickups) {
      p.t += dt;
      if (!player.inCar && dist(player.x, player.y, p.x, p.y) < 30) {
        if (p.kind === 'health') { player.health = Math.min(MAX_HEALTH, player.health + 40); Game.showToast('HEALTH +40'); }
        else if (p.kind === 'shotgun') { player.weapon = 'shotgun'; player.ammo = WEAPONS.shotgun.ammo; Game.showToast('SHOTGUN PICKED UP'); }
        else if (p.kind === 'smg') { player.weapon = 'smg'; player.ammo = WEAPONS.smg.ammo; Game.showToast('SMG PICKED UP'); }
        Sound.pickup();
        p.t = 999;
      }
    }
    this.pickups = this.pickups.filter((p) => p.t < 60);
  },

  draw(ctx, cam) {
    // Cash drops: green pulsing circles with $.
    for (const d of this.cashDrops) {
      const sx = d.x - cam.x, sy = d.y - cam.y;
      const pulse = 1 + Math.sin(d.t * 5) * 0.15;
      ctx.fillStyle = '#2fae4a';
      ctx.beginPath(); ctx.arc(sx, sy, 13 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('$', sx, sy + 5);
    }
    for (const p of this.pickups) {
      const sx = p.x - cam.x, sy = p.y - cam.y;
      ctx.fillStyle = p.kind === 'health' ? '#ff5a5a' : '#ffb347';
      ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.kind === 'health' ? '+' : 'W', sx, sy + 4);
    }
    // Bullets as bright tracers.
    for (const b of this.bullets) {
      ctx.strokeStyle = b.from === 'player' ? '#ffe66d' : '#ff6a5a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - cam.x - b.vx * 0.02, b.y - cam.y - b.vy * 0.02);
      ctx.lineTo(b.x - cam.x, b.y - cam.y);
      ctx.stroke();
    }
    // Particles.
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  },
};
