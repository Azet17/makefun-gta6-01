/* Neon Tide — the city of Palmera Bay. Generates the road grid, buildings,
   parks, beach and service spots, and answers collision / placement queries. */
'use strict';

/* Building palettes: each block picks one palette and its buildings shade
   between its three tones. */
const CITY_PALETTES = [
  ['#e8d8b0', '#d4b98a', '#c9a86f'],
  ['#b0c4de', '#8fa8c8', '#7a94b8'],
  ['#e8a0a0', '#d48888', '#c07070'],
  ['#a0d8b0', '#88c098', '#70a880'],
  ['#d8c8f0', '#c0a8e0', '#a888d0'],
  ['#f0e0a0', '#e0c878', '#c8b060'],
];

const City = {
  buildings: [],
  trees: [],
  spots: {},        // named service spots: garage, gunshop, diner, hospital
  missionSpots: {}, // named mission anchors, all on road intersections

  build() {
    this.buildings = [];
    this.trees = [];
    const cols = WORLD / ROAD_GAP;
    for (let bx = 0; bx < cols; bx++) {
      for (let by = 0; by < cols; by++) {
        this.buildBlock(bx, by);
      }
    }
    // Fixed service spots on road corners, reachable from the street.
    this.spots = {
      garage:   { x: 330,  y: 330,  label: 'GARAGE — repairs $60', color: '#7dff9b' },
      gunshop:  { x: 2130, y: 330,  label: 'GUN SHOP — pistol ammo $40', color: '#ffb347' },
      diner:    { x: 330,  y: 2430, label: 'DINER — heal $25', color: '#ff7ad9' },
      hospital: { x: 2430, y: 2130, label: 'HOSPITAL — full heal $80', color: '#8fd8ff' },
    };
    // Mission anchors, on road intersections so markers and fights sit on streets.
    this.missionSpots = {
      marina:   { x: 332,  y: 332 },
      downtown: { x: 2732, y: 632 },
      harbor:   { x: 632,  y: 1532 },
      heights:  { x: 2732, y: 1832 },
      dockside: { x: 1832, y: 3032 },
      beach:    { x: 932,  y: 3332 },
    };
  },

  /* One city block: either a park (trees only), one big building, two
     buildings, or four small ones. The beach strip and the marina plaza
     stay open. */
  buildBlock(bx, by) {
    const x0 = bx * ROAD_GAP + ROAD_W + 14;
    const y0 = by * ROAD_GAP + ROAD_W + 14;
    const w = BLOCK - 28;
    const h = BLOCK - 28;
    if (x0 + w > WORLD || y0 + h > WORLD) return;
    if (by >= 11) return;            // beach strip along the south edge
    if (bx === 0 && by === 0) return; // marina plaza
    if (Math.random() < 0.14) {
      for (let i = 0; i < 6; i++) {
        this.trees.push({ x: x0 + rand(20, w - 20), y: y0 + rand(20, h - 20), r: rand(9, 15) });
      }
      return;
    }
    const pal = pick(CITY_PALETTES);
    const roll = Math.random();
    if (roll < 0.5) {
      this.addBuilding(x0, y0, w, h, pal);
    } else if (roll < 0.8) {
      if (Math.random() < 0.5) {
        this.addBuilding(x0, y0, w / 2 - 6, h, pal);
        this.addBuilding(x0 + w / 2 + 6, y0, w / 2 - 6, h, pal);
      } else {
        this.addBuilding(x0, y0, w, h / 2 - 6, pal);
        this.addBuilding(x0, y0 + h / 2 + 6, w, h / 2 - 6, pal);
      }
    } else {
      const hw = w / 2 - 6;
      const hh = h / 2 - 6;
      for (const [ox, oy] of [[0, 0], [w / 2 + 6, 0], [0, h / 2 + 6], [w / 2 + 6, h / 2 + 6]]) {
        this.addBuilding(x0 + ox, y0 + oy, hw, hh, pal);
      }
    }
    // A couple of street trees along the block's north edge.
    for (let i = 0; i < 2; i++) {
      this.trees.push({ x: x0 + rand(0, w), y: y0 - 8, r: rand(8, 12) });
    }
  },

  addBuilding(x, y, w, h, pal) {
    this.buildings.push({
      x, y, w, h,
      hgt: randInt(10, 42),
      color: pick(pal),
      roof: pick(pal),
      trim: pick(pal),
    });
  },

  /* True when a circle of radius r at (x,y) overlaps a building. */
  hitsBuilding(x, y, r) {
    for (const b of this.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  },

  /* Push a circle out of buildings along the shortest side; clamps to the world. */
  resolveCollision(x, y, r) {
    for (const b of this.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) {
        const dxl = x + r - b.x;
        const dxr = b.x + b.w - (x - r);
        const dyt = y + r - b.y;
        const dyb = b.y + b.h - (y - r);
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

  /* Nearest road centre-line coordinate, for snapping a value to the grid. */
  nearestRoad(v) {
    return Math.round(v / ROAD_GAP) * ROAD_GAP + ROAD_W / 2;
  },

  /* ---- drawing ---- */

  drawGround(ctx, cam) {
    // Base ground, then a faint wash of each district's tint.
    ctx.fillStyle = '#3f4a3a';
    ctx.fillRect(cam.x, cam.y, VIEW_W, VIEW_H);
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.tint;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(d.x0 - cam.x, d.y0 - cam.y, d.x1 - d.x0, d.y1 - d.y0);
    }
    ctx.globalAlpha = 1;
    // Beach strip and the sea beyond it, at the south edge.
    ctx.fillStyle = '#e8d8a0';
    ctx.fillRect(0 - cam.x, 3300 - cam.y, WORLD, 300);
    ctx.fillStyle = '#2a7ab0';
    ctx.fillRect(0 - cam.x, 3480 - cam.y, WORLD, 120);
    // Sidewalk blocks (the city blocks themselves).
    const x0 = Math.max(0, Math.floor(cam.x / ROAD_GAP) * ROAD_GAP);
    const y0 = Math.max(0, Math.floor(cam.y / ROAD_GAP) * ROAD_GAP);
    const x1 = Math.min(WORLD, cam.x + VIEW_W + ROAD_GAP);
    const y1 = Math.min(WORLD, cam.y + VIEW_H + ROAD_GAP);
    for (let bx = 0; bx < WORLD / ROAD_GAP; bx++) {
      for (let by = 0; by < WORLD / ROAD_GAP; by++) {
        const px = bx * ROAD_GAP + ROAD_W;
        const py = by * ROAD_GAP + ROAD_W;
        if (px > x1 || py > y1 || px + BLOCK < x0 || py + BLOCK < y0) continue;
        if (by >= 11) continue;
        ctx.fillStyle = '#5a6274';
        ctx.fillRect(px - cam.x, py - cam.y, BLOCK, BLOCK);
        ctx.fillStyle = '#6a7286';
        ctx.fillRect(px + 4 - cam.x, py + 4 - cam.y, BLOCK - 8, BLOCK - 8);
      }
    }
    // Roads: dark asphalt, then yellow centre dashes.
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
    // Street-name labels at a few intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    for (let i = 1; i < 11; i += 3) {
      for (let j = 1; j < 11; j += 3) {
        const sx = i * ROAD_GAP + 8 - cam.x;
        const sy = j * ROAD_GAP + 18 - cam.y;
        if (sx > -80 && sx < VIEW_W && sy > -20 && sy < VIEW_H) {
          ctx.fillText(STREETS_H[i % STREETS_H.length] + ' / ' + STREETS_V[j % STREETS_V.length], sx, sy);
        }
      }
    }
    // District names, large, across each district's centre.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 20px sans-serif';
    for (const d of DISTRICTS) {
      const cx = (d.x0 + d.x1) / 2 - cam.x;
      const cy = (d.y0 + d.y1) / 2 - cam.y;
      if (cx > -200 && cx < VIEW_W + 200 && cy > -40 && cy < VIEW_H + 40) {
        ctx.textAlign = 'center';
        ctx.fillText(d.name.toUpperCase(), cx, cy);
      }
    }
    ctx.textAlign = 'left';
  },

  drawBuildings(ctx, cam) {
    for (const b of this.buildings) {
      const sx = b.x - cam.x;
      const sy = b.y - cam.y;
      if (sx > VIEW_W + 60 || sy > VIEW_H + 60 || sx + b.w < -60 || sy + b.h < -60) continue;
      // Fake height: the roof face is offset up, with a drop shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(sx + 4, sy + 6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(sx, sy - b.hgt * 0.4, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(sx, sy - b.hgt * 0.4, b.w, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(sx + 6, sy - b.hgt * 0.4 + 12, b.w - 12, 3);
      // Windows across the roof face.
      ctx.fillStyle = 'rgba(20,30,60,0.55)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 30));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          ctx.fillRect(sx + 10 + cx * 26, sy - b.hgt * 0.4 + 20 + cy * 30, 12, 14);
        }
      }
      ctx.strokeStyle = b.trim;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy - b.hgt * 0.4, b.w, b.h);
    }
    // Trees: shadow, canopy, highlight.
    for (const t of this.trees) {
      const sx = t.x - cam.x;
      const sy = t.y - cam.y;
      if (sx < -30 || sx > VIEW_W + 30 || sy < -30 || sy > VIEW_H + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx + 3, sy + 4, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a8a4a';
      ctx.beginPath();
      ctx.arc(sx, sy, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5ab86a';
      ctx.beginPath();
      ctx.arc(sx - 3, sy - 3, t.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  drawSpots(ctx, cam) {
    for (const [key, s] of Object.entries(this.spots)) {
      const sx = s.x - cam.x;
      const sy = s.y - cam.y;
      if (sx < -60 || sx > VIEW_W + 60 || sy < -60 || sy > VIEW_H + 60) continue;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(sx, sy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0e1a';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(key === 'garage' ? '🔧' : key === 'gunshop' ? '◎' : key === 'diner' ? '☕' : '+', sx, sy + 5);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '11px sans-serif';
      ctx.fillText(s.label, sx, sy + 32);
    }
    ctx.textAlign = 'left';
  },
};
