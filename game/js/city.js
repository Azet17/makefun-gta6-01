/* Neon Tide — the city of Palmera Bay. Generates the road grid, buildings,
   parks, beach and service spots, and answers collision / placement queries. */
'use strict';

/* One building: position, size, height (for the fake-3D roof offset) and palette. */
const City = {
  buildings: [],
  trees: [],
  spots: {},       // named service spots: garage, gunshop, diner, hospital
  missionSpots: {},

  build() {
    this.buildings = [];
    this.trees = [];
    const palettes = [
      ['#e8d8b0', '#d4b98a', '#c9a86f'],
      ['#b0c4de', '#8fa8c8', '#7a94b8'],
      ['#e8a0a0', '#d48888', '#c07070'],
      ['#a0d8b0', '#88c098', '#70a880'],
      ['#d8c8f0', '#c0a8e0', '#a888d0'],
      ['#f0e0a0', '#e0c878', '#c8b060'],
    ];
    // Blocks: every grid cell between roads gets 1-4 buildings, or a park.
    for (let bx = 0; bx < WORLD / ROAD_GAP; bx++) {
      for (let by = 0; by < WORLD / ROAD_GAP; by++) {
        const x0 = bx * ROAD_GAP + ROAD_W + 14;
        const y0 = by * ROAD_GAP + ROAD_W + 14;
        const w = BLOCK - 28, h = BLOCK - 28;
        if (x0 + w > WORLD || y0 + h > WORLD) continue;
        // Beach strip along the south edge and the marina corner stay open.
        if (by >= 11) continue;
        if (bx === 0 && by === 0) continue; // marina plaza
        const r = Math.random();
        if (r < 0.14) {
          // Park: trees only, no building.
          for (let i = 0; i < 6; i++) {
            this.trees.push({ x: x0 + rand(20, w - 20), y: y0 + rand(20, h - 20), r: rand(9, 15) });
          }
          continue;
        }
        const pal = pick(palettes);
        const n = Math.random() < 0.5 ? 1 : (Math.random() < 0.6 ? 2 : 4);
        if (n === 1) {
          this.buildings.push({ x: x0, y: y0, w, h, hgt: randInt(14, 42), color: pal[0], roof: pal[1], trim: pal[2] });
        } else if (n === 2) {
          const vertical = Math.random() < 0.5;
          if (vertical) {
            this.buildings.push({ x: x0, y: y0, w: w / 2 - 6, h, hgt: randInt(12, 34), color: pal[0], roof: pal[1], trim: pal[2] });
            this.buildings.push({ x: x0 + w / 2 + 6, y: y0, w: w / 2 - 6, h, hgt: randInt(12, 34), color: pal[1], roof: pal[2], trim: pal[0] });
          } else {
            this.buildings.push({ x: x0, y: y0, w, h: h / 2 - 6, hgt: randInt(12, 34), color: pal[0], roof: pal[1], trim: pal[2] });
            this.buildings.push({ x: x0, y: y0 + h / 2 + 6, w, h: h / 2 - 6, hgt: randInt(12, 34), color: pal[1], roof: pal[2], trim: pal[0] });
          }
        } else {
          const hw = w / 2 - 6, hh = h / 2 - 6;
          for (const [ox, oy] of [[0, 0], [w / 2 + 6, 0], [0, h / 2 + 6], [w / 2 + 6, h / 2 + 6]]) {
            this.buildings.push({ x: x0 + ox, y: y0 + oy, w: hw, h: hh, hgt: randInt(10, 26), color: pick(pal), roof: pick(pal), trim: pick(pal) });
          }
        }
        // A few street trees around the block.
        for (let i = 0; i < 2; i++) {
          this.trees.push({ x: x0 + rand(0, w), y: y0 - 8, r: rand(8, 12) });
        }
      }
    }
    // Fixed service spots on road corners (reachable, on-road-adjacent).
    this.spots = {
      garage:  { x: 330,  y: 330,  label: 'GARAGE — repairs $60', color: '#7dff9b' },
      gunshop: { x: 2130, y: 330,  label: 'GUN SHOP — pistol ammo $40', color: '#ffb347' },
      diner:   { x: 330,  y: 2430, label: 'DINER — heal $25', color: '#ff7ad9' },
      hospital:{ x: 2430, y: 2130, label: 'HOSPITAL — full heal $80', color: '#8fd8ff' },
    };
    // Mission anchor spots, on road intersections so markers and fights sit on streets.
    this.missionSpots = {
      marina:   { x: 332,  y: 332 },
      downtown: { x: 2732, y: 632 },
      harbor:   { x: 632,  y: 1532 },
      heights:  { x: 2732, y: 1832 },
      dockside: { x: 1832, y: 3032 },
      beach:    { x: 932,  y: 3332 },
    };
  },

  /* True when a circle of radius r at (x,y) overlaps a building. */
  hitsBuilding(x, y, r) {
    for (const b of this.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  },

  /* Push a circle out of buildings; returns the corrected position. */
  resolveCollision(x, y, r) {
    for (const b of this.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) {
        const dxl = x + r - b.x, dxr = b.x + b.w - (x - r);
        const dyt = y + r - b.y, dyb = b.y + b.h - (y - r);
        const m = Math.min(dxl, dxr, dyt, dyb);
        if (m === dxl) x = b.x - r;
        else if (m === dxr) x = b.x + b.w + r;
        else if (m === dyt) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
    return { x: clamp(x, 20, WORLD - 20), y: clamp(y, 20, WORLD - 20) };
  },

  /* A random point on a road, for spawning cars and pedestrians. */
  randomRoadPoint() {
    const vertical = Math.random() < 0.5;
    const line = randInt(0, WORLD / ROAD_GAP - 1) * ROAD_GAP + ROAD_W / 2;
    const along = rand(100, WORLD - 100);
    return vertical ? { x: line, y: along } : { x: along, y: line };
  },

  /* Nearest road centre line coordinate for snapping. */
  nearestRoad(v) { return Math.round(v / ROAD_GAP) * ROAD_GAP + ROAD_W / 2; },

  drawGround(ctx, cam) {
    // Base ground: warm sand-tinted asphalt city with a beach at the south.
    ctx.fillStyle = '#3f4a3a';
    ctx.fillRect(cam.x, cam.y, VIEW_W, VIEW_H);
    const x0 = Math.max(0, Math.floor(cam.x / ROAD_GAP) * ROAD_GAP);
    const y0 = Math.max(0, Math.floor(cam.y / ROAD_GAP) * ROAD_GAP);
    const x1 = Math.min(WORLD, cam.x + VIEW_W + ROAD_GAP);
    const y1 = Math.min(WORLD, cam.y + VIEW_H + ROAD_GAP);
    // District tint blocks.
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.tint;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(d.x0 - cam.x, d.y0 - cam.y, d.x1 - d.x0, d.y1 - d.y0);
      ctx.globalAlpha = 1;
    }
    // Beach strip.
    ctx.fillStyle = '#e8d8a0';
    ctx.fillRect(0 - cam.x, 3300 - cam.y, WORLD, 300);
    ctx.fillStyle = '#2a7ab0';
    ctx.fillRect(0 - cam.x, 3480 - cam.y, WORLD, 120);
    // Sidewalk blocks (the city blocks themselves).
    for (let bx = 0; bx < WORLD / ROAD_GAP; bx++) {
      for (let by = 0; by < WORLD / ROAD_GAP; by++) {
        const px = bx * ROAD_GAP + ROAD_W, py = by * ROAD_GAP + ROAD_W;
        if (px > x1 || py > y1 || px + BLOCK < x0 || py + BLOCK < y0) continue;
        if (by >= 11) continue;
        ctx.fillStyle = '#5a6274';
        ctx.fillRect(px - cam.x, py - cam.y, BLOCK, BLOCK);
        ctx.fillStyle = '#6a7286';
        ctx.fillRect(px + 4 - cam.x, py + 4 - cam.y, BLOCK - 8, BLOCK - 8);
      }
    }
    // Roads: dark asphalt with centre dashes.
    ctx.fillStyle = '#2c2f38';
    for (let i = 0; i <= WORLD / ROAD_GAP; i++) {
      const c = i * ROAD_GAP + ROAD_W / 2;
      ctx.fillRect(c - ROAD_W / 2 - cam.x, 0 - cam.y, ROAD_W, WORLD);
      ctx.fillRect(0 - cam.x, c - ROAD_W / 2 - cam.y, WORLD, ROAD_W);
    }
    ctx.fillStyle = '#e8d84a';
    for (let i = 0; i <= WORLD / ROAD_GAP; i++) {
      const c = i * ROAD_GAP + ROAD_W / 2;
      for (let d = 0; d < WORLD; d += 60) {
        if (d > x0 - 60 && d < x1) ctx.fillRect(c - 2 - cam.x, d - cam.y, 4, 26);
        if (d > y0 - 60 && d < y1) ctx.fillRect(d - cam.x, c - 2 - cam.y, 26, 4);
      }
    }
    // Street name labels at a few intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    for (let i = 1; i < 11; i += 3) {
      for (let j = 1; j < 11; j += 3) {
        const sx = i * ROAD_GAP + 8 - cam.x, sy = j * ROAD_GAP + 18 - cam.y;
        if (sx > -80 && sx < VIEW_W && sy > -20 && sy < VIEW_H) {
          ctx.fillText(STREETS_H[i % STREETS_H.length] + ' / ' + STREETS_V[j % STREETS_V.length], sx, sy);
        }
      }
    }
    // District labels.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 20px sans-serif';
    for (const d of DISTRICTS) {
      const cx = (d.x0 + d.x1) / 2 - cam.x, cy = (d.y0 + d.y1) / 2 - cam.y;
      if (cx > -200 && cx < VIEW_W + 200 && cy > -40 && cy < VIEW_H + 40) {
        ctx.textAlign = 'center';
        ctx.fillText(d.name.toUpperCase(), cx, cy);
      }
    }
    ctx.textAlign = 'left';
  },

  drawBuildings(ctx, cam) {
    for (const b of this.buildings) {
      const sx = b.x - cam.x, sy = b.y - cam.y;
      if (sx > VIEW_W + 60 || sy > VIEW_H + 60 || sx + b.w < -60 || sy + b.h < -60) continue;
      // Fake height: roof offset up-left, walls shaded.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(sx + 4, sy + 6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(sx, sy - b.hgt * 0.4, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(sx, sy - b.hgt * 0.4, b.w, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(sx + 6, sy - b.hgt * 0.4 + 12, b.w - 12, 3);
      // Windows on the roof face.
      ctx.fillStyle = 'rgba(20,30,60,0.55)';
      const cols = Math.max(1, Math.floor(b.w / 26)), rows = Math.max(1, Math.floor(b.h / 30));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          ctx.fillRect(sx + 10 + cx * 26, sy - b.hgt * 0.4 + 20 + cy * 30, 12, 14);
        }
      }
      ctx.strokeStyle = b.trim;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy - b.hgt * 0.4, b.w, b.h);
    }
    // Trees.
    for (const t of this.trees) {
      const sx = t.x - cam.x, sy = t.y - cam.y;
      if (sx < -30 || sx > VIEW_W + 30 || sy < -30 || sy > VIEW_H + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx + 3, sy + 4, t.r, t.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a8a4a';
      ctx.beginPath(); ctx.arc(sx, sy, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5ab86a';
      ctx.beginPath(); ctx.arc(sx - 3, sy - 3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawSpots(ctx, cam) {
    for (const [key, s] of Object.entries(this.spots)) {
      const sx = s.x - cam.x, sy = s.y - cam.y;
      if (sx < -60 || sx > VIEW_W + 60 || sy < -60 || sy > VIEW_H + 60) continue;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0e1a';
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(key === 'garage' ? '🔧' : key === 'gunshop' ? '◎' : key === 'diner' ? '☕' : '+', sx, sy + 5);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '11px sans-serif';
      ctx.fillText(s.label, sx, sy + 32);
    }
    ctx.textAlign = 'left';
  },
};
