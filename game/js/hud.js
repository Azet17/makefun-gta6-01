// Neon Tide — Palmera Bay: the HUD.
// The DOM bar (speed, wanted stars, cash, mission, timer, district) plus
// the live minimap canvas in the corner. The HUD never draws the world;
// it only reads the game state and paints the overlay.

const HUD = (function () {
  const hud = {
    el: {},
    minimap: null,
    mctx: null,
    lastSpeed: -1,
    lastWanted: -1,
    lastCash: -1,
  };

  // Grab every HUD element by id once the page is ready.
  function init() {
    const ids = ['hud', 'speed', 'speedUnit', 'wanted', 'cash', 'missionTitle',
      'missionObjective', 'missionTimer', 'district', 'message', 'minimap',
      'carHealth', 'healthFill', 'hint', 'titleScreen', 'pauseScreen',
      'bustedScreen', 'completeScreen', 'startCash', 'startProgress',
      'missionList', 'bustedText', 'completeText', 'fps'];
    for (const id of ids) hud.el[id] = document.getElementById(id);
    hud.minimap = hud.el.minimap;
    if (hud.minimap) {
      hud.minimap.width = MINIMAP_SIZE;
      hud.minimap.height = MINIMAP_SIZE;
      hud.mctx = hud.minimap.getContext('2d');
    }
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  // Stars: filled for the wanted level, empty for the rest.
  function wantedStars(wanted) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < wanted ? '★' : '☆';
    return s;
  }

  // Per-frame HUD refresh. Cheap string writes only when values change.
  function update(game, dt) {
    const el = hud.el;
    const speedKmh = Math.round(Math.abs((game.playerCar ? game.playerCar.speed : 0)) * 0.36);
    if (speedKmh !== hud.lastSpeed) {
      setText(el.speed, String(speedKmh));
      hud.lastSpeed = speedKmh;
    }
    if (game.wanted !== hud.lastWanted) {
      setText(el.wanted, wantedStars(game.wanted));
      if (el.wanted) el.wanted.className = 'wanted' + (game.wanted >= 3 ? ' hot' : '');
      hud.lastWanted = game.wanted;
    }
    if (Missions.state.cash !== hud.lastCash) {
      setText(el.cash, '$' + Missions.state.cash.toLocaleString('en-US'));
      hud.lastCash = Missions.state.cash;
    }
    if (Missions.state.active) {
      const d = Missions.def();
      setText(el.missionTitle, 'MISSION ' + d.id + ' — ' + d.title);
      setText(el.missionObjective, Missions.objectiveText());
      setText(el.missionTimer, Missions.state.timer > 0 ? formatTime(Missions.state.timer) : '');
    } else if (Missions.state.storyDone) {
      setText(el.missionTitle, 'STORY COMPLETE');
      setText(el.missionObjective, 'Mara owns Palmera Bay. Free roam — cause chaos.');
      setText(el.missionTimer, '');
    } else {
      setText(el.missionTitle, 'NEON TIDE');
      setText(el.missionObjective, 'Press Enter to start the next mission');
      setText(el.missionTimer, '');
    }
    const district = City.districtAt(game.player.x, game.player.y);
    setText(el.district, district ? district.name : (City.isSand(game.player.x, game.player.y) ? 'Palmera Beach' : 'The Bay'));
    // Car health bar.
    if (el.healthFill && game.playerCar) {
      const pct = Math.max(0, game.playerCar.hp);
      el.healthFill.style.width = pct + '%';
      el.healthFill.className = 'health-fill' + (pct < 30 ? ' low' : '');
      setText(el.carHealth, 'CAR ' + Math.round(pct) + '%');
    } else if (el.healthFill) {
      el.healthFill.style.width = '0%';
      setText(el.carHealth, 'ON FOOT');
    }
    // Big centre message (mission banners, warnings).
    if (Missions.state.messageTimer > 0 && Missions.state.message) {
      setText(el.message, Missions.state.message);
      if (el.message) el.message.style.opacity = String(Math.min(1, Missions.state.messageTimer));
    } else if (el.message) {
      el.message.style.opacity = '0';
    }
    // Context hint at the bottom.
    setText(el.hint, hintFor(game));
    drawMinimap(game);
  }

  // The one-line hint that tells the player what they can do right now.
  function hintFor(game) {
    if (game.mode === 'busted') return 'BUSTED — press Enter to get back on the street';
    if (game.mode === 'complete') return 'Press Enter for the next mission';
    if (game.mode === 'paused') return 'Paused — P to resume';
    if (!game.playerCar) {
      const near = game.nearestParked;
      if (near) return 'Press E to steal the ' + (near.gold ? 'GOLD SUPERCAR' : 'car');
      return 'WASD / arrows to walk — find a parked car and press E';
    }
    const keys = 'WASD drive · Space handbrake · E exit car · H horn · M mute · P pause';
    if (game.wanted >= 3) return 'POLICE ON YOU — break line of sight! · ' + keys;
    return keys;
  }

  // --- Minimap ----------------------------------------------------------

  function drawMinimap(game) {
    const ctx = hud.mctx;
    if (!ctx) return;
    const S = MINIMAP_SIZE;
    const sx = S / CONFIG.worldWidth;
    const sy = S / CONFIG.worldHeight;
    ctx.clearRect(0, 0, S, S);
    // Water and sand on the west edge.
    ctx.fillStyle = CONFIG.palette.waterDeep;
    ctx.fillRect(0, 0, CONFIG.waterWidth * sx, S);
    ctx.fillStyle = CONFIG.palette.sand;
    ctx.fillRect(CONFIG.waterWidth * sx, 0, CONFIG.beachWidth * sx, S);
    // Land.
    ctx.fillStyle = '#5d6b52';
    ctx.fillRect((CONFIG.waterWidth + CONFIG.beachWidth) * sx, 0, S - (CONFIG.waterWidth + CONFIG.beachWidth) * sx, S);
    // Parks.
    ctx.fillStyle = CONFIG.palette.park;
    for (const p of City.data.parks) ctx.fillRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy);
    // Roads (drawn lighter than in the world so the street grid reads).
    ctx.fillStyle = '#9aa0ad';
    for (const ax of City.data.avenues) ctx.fillRect((ax - CONFIG.roadWidth / 2) * sx, 0, CONFIG.roadWidth * sx, S);
    for (const sy2 of City.data.streets) ctx.fillRect(0, (sy2 - CONFIG.roadWidth / 2) * sy, S, CONFIG.roadWidth * sy);
    // Buildings.
    ctx.fillStyle = 'rgba(28, 24, 22, 0.9)';
    for (const b of City.data.buildings) ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
    // Mission target marker (pulsing gold dot).
    if (Missions.state.target) {
      const t = Missions.state.target;
      const pulse = 3 + Math.sin(performance.now() / 240) * 1.5;
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.arc(t.x * sx, t.y * sy, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Police blips (blue) and traffic (grey).
    ctx.fillStyle = '#3a7bff';
    for (const p of game.police) ctx.fillRect(p.x * sx - 2, p.y * sy - 2, 4, 4);
    ctx.fillStyle = '#c9c9c9';
    for (const t of game.traffic) ctx.fillRect(t.x * sx - 1, t.y * sy - 1, 2, 2);
    // The player: a white triangle pointing where they face.
    const px = game.player.x * sx, py = game.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(game.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Border.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }

  // --- Screens ----------------------------------------------------------

  // Show exactly one overlay screen; hide the rest.
  function showScreen(name) {
    const screens = ['titleScreen', 'pauseScreen', 'bustedScreen', 'completeScreen'];
    for (const s of screens) {
      const el = hud.el[s];
      if (el) el.classList.toggle('hidden', s !== name);
    }
    if (hud.el.hud) hud.el.hud.classList.toggle('hidden', name === 'titleScreen');
  }

  // Fill the title screen with the save state: cash, progress and missions.
  function fillTitle() {
    setText(hud.el.startCash, '$' + Missions.state.cash.toLocaleString('en-US'));
    const pct = Math.round(Missions.progressFraction() * 100);
    setText(hud.el.startProgress, pct + '% complete — ' + Missions.state.completed.length + ' of 6 missions');
    const list = hud.el.missionList;
    if (list) {
      list.innerHTML = '';
      for (const m of Missions.briefingLines()) {
        const row = document.createElement('div');
        row.className = 'mission-row ' + m.mark.toLowerCase();
        row.textContent = m.mark + '  ·  ' + m.id + '. ' + m.title + '  —  $' + m.cash + '  ·  ' + m.intro;
        list.appendChild(row);
      }
    }
  }

  function showBusted(reason) {
    setText(hud.el.bustedText, reason || 'The Bay Police caught Mara.');
    showScreen('bustedScreen');
  }

  // A quick red vignette flash when the player car takes a hard hit.
  function flashDamage() {
    const el = document.getElementById('damageFlash');
    if (!el) return;
    el.style.opacity = '0.55';
    setTimeout(() => { el.style.opacity = '0'; }, 130);
  }

  function showComplete(text) {
    setText(hud.el.completeText, text || 'Mission complete.');
    showScreen('completeScreen');
  }

  return { hud, init, update, wantedStars, drawMinimap, showScreen, fillTitle, showBusted, showComplete, flashDamage };
})();
