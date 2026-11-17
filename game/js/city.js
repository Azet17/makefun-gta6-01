// Neon Tide: Palmera Bay — the city itself.
// Palmera Bay is a fixed grid: avenues run north-south, streets run
// east-west, and every block between them holds buildings, a park, a
// parking lot or a landmark. Generation is seeded, so the same seed
// always builds the same city — screenshots included.

import { WORLD_W, WORLD_H, DISTRICTS, SEA, SAND, AVENUES, STREETS, ROAD_W, mulberry32, clamp } from './config.js';

// A building: a rectangle with a height (for the fake shadow) and a colour.
export function buildCity(seed = 7) {
  const rng = mulberry32(seed);
  const buildings = [];
  const parks = [];
  const lots = [];
  const landmarks = [];

  // Blocks are the rectangles between neighbouring roads. The left/top
  // edge list and the right/bottom edge list line up one-to-one, so no
  // block is ever built with a NaN size.
  const xs = [SAND.x + SAND.w, ...AVENUES.map((a) => a + ROAD_W / 2)];
  const ys = [0, ...STREETS.map((s) => s + ROAD_W / 2)];
  const xe = [...AVENUES.map((a) => a - ROAD_W / 2), WORLD_W];
  const ye = [...STREETS.map((s) => s - ROAD_W / 2), WORLD_H];

  const palette = ['#5b4a68', '#6e5a7a', '#4a5a6e', '#7a5a4a', '#4e6e5a', '#8a6a4a', '#5a4a3a', '#3f4a5f'];
  for (let bi = 0; bi < xs.length; bi++) {
    for (let bj = 0; bj < ys.length; bj++) {
      const bx = xs[bi], by = ys[bj];
      const bw = xe[bi] - bx, bh = ye[bj] - by;
      if (!Number.isFinite(bw) || !Number.isFinite(bh)) continue;
      if (bw < 90 || bh < 90) continue;
      const roll = rng();
      const cx = bx + bw / 2, cy = by + bh / 2;
      if (roll < 0.14) {
        // A park: trees and open grass, no buildings.
        parks.push({ x: bx + 8, y: by + 8, w: bw - 16, h: bh - 16, trees: Math.floor(rng() * 9) + 4 });
      } else if (roll < 0.26) {
        // A parking lot: flat tarmac with marked bays.
        lots.push({ x: bx + 6, y: by + 6, w: bw - 12, h: bh - 12 });
      } else {
        // A cluster of 2-4 buildings inside the block.
        const n = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const w = 60 + rng() * Math.max(40, bw / 2 - 70);
          const h = 50 + rng() * Math.max(40, bh / 2 - 60);
          const x = bx + 8 + rng() * Math.max(1, bw - w - 16);
          const y = by + 8 + rng() * Math.max(1, bh - h - 16);
          buildings.push({
            x, y, w, h,
            height: 10 + rng() * 46,
            color: palette[Math.floor(rng() * palette.length)],
            roof: rng() < 0.3,
          });
        }
      }
      void cx; void cy;
    }
  }

  // Landmarks: one per district, placed on a road edge so missions can
  // point at them without landing inside a building.
  landmarks.push({ id: 'pier', name: 'Palmera Pier', x: 300, y: 640, r: 90 });
  landmarks.push({ id: 'neon-plaza', name: 'Neon Plaza', x: 1620, y: 340, r: 80 });
  landmarks.push({ id: 'docks', name: 'Harbor Docks Gate', x: 2820, y: 840, r: 90 });
  landmarks.push({ id: 'garage', name: 'Old Town Garage', x: 1020, y: 1840, r: 80 });
  landmarks.push({ id: 'safehouse', name: 'Sunset Safehouse', x: 2820, y: 2340, r: 90 });
  landmarks.push({ id: 'bank', name: 'Bay National Bank', x: 2220, y: 1340, r: 80 });

  return { buildings, parks, lots, landmarks, seed };
}

// Which district holds this point? The beach strip is water and sand.
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[0];
}

export function isSea(x, y) {
  return x >= SEA.x && x < SEA.x + SEA.w && y >= SEA.y && y < SEA.y + SEA.h;
}

export function isSand(x, y) {
  return x >= SAND.x && x < SAND.x + SAND.w && y >= SAND.y && y < SAND.y + SAND.h;
}

// True when the point sits on a road (avenue or street).
export function isRoad(x, y) {
  for (const a of AVENUES) if (Math.abs(x - a) < ROAD_W / 2) return true;
  for (const s of STREETS) if (Math.abs(y - s) < ROAD_W / 2) return true;
  return false;
}

// Snap a point to the nearest road centreline (used for traffic spawns).
export function nearestRoadPoint(x, y) {
  let bestA = AVENUES[0], bestD = Infinity;
  for (const a of AVENUES) { const d = Math.abs(x - a); if (d < bestD) { bestD = d; bestA = a; } }
  let bestS = STREETS[0]; bestD = Infinity;
  for (const s of STREETS) { const d = Math.abs(y - s); if (d < bestD) { bestD = d; bestS = s; } }
  return Math.abs(x - bestA) < Math.abs(y - bestS) ? { x: bestA, y } : { x, y: bestS };
}

// Circle-vs-building collision: returns the building hit, or null.
export function hitBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.w) || !Number.isFinite(b.h)) continue;
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps (cheap, runs per frame).
export function resolveBuildings(city, ent, r) {
  for (const b of city.buildings) {
    const cx = clamp(ent.x, b.x, b.x + b.w);
    const cy = clamp(ent.y, b.y, b.y + b.h);
    let dx = ent.x - cx, dy = ent.y - cy;
    let d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 < 0.0001) { dx = 0; dy = -1; d2 = 1; }
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    ent.x += dx * push;
    ent.y += dy * push;
  }
}

// A random point on a road, anywhere in the city.
export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    return { x: AVENUES[Math.floor(rng() * AVENUES.length)], y: 60 + rng() * (WORLD_H - 120) };
  }
  return { x: 260 + rng() * (WORLD_W - 320), y: STREETS[Math.floor(rng() * STREETS.length)] };
}

// A random walkable point (road or pavement, never inside a building).
export function randomWalkPoint(city, rng) {
  for (let tries = 0; tries < 40; tries++) {
    const x = 240 + rng() * (WORLD_W - 300);
    const y = 60 + rng() * (WORLD_H - 120);
    if (!hitBuilding(city, x, y, 20)) return { x, y };
  }
  return { x: 1020, y: 840 };
}

// ---- Drawing the city (top-down, camera-space) ----

// (Drawing helpers below reuse the imports at the top of this file.)

// Paint the ground: district colours, the sea and the sand strip.
export function drawGround(ctx, cam) {
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x - cam.x, d.y - cam.y, d.w, d.h);
  }
  ctx.fillStyle = '#1d6f8e';
  ctx.fillRect(SEA.x - cam.x, SEA.y - cam.y, SEA.w, SEA.h);
  ctx.fillStyle = '#2a8ab0';
  for (let y = 0; y < WORLD_H; y += 90) {
    const wob = Math.sin((y + performance.now() / 900) * 0.02) * 8;
    ctx.fillRect(SEA.x + 40 + wob - cam.x, y - cam.y, 60, 4);
  }
  ctx.fillStyle = SAND.ground || '#d9bd85';
  ctx.fillStyle = '#d9bd85';
  ctx.fillRect(SAND.x - cam.x, SAND.y - cam.y, SAND.w, SAND.h);
}

// Roads: dark strips with pale centre dashes and crosswalk stripes.
export function drawRoads(ctx, cam) {
  ctx.fillStyle = '#26262e';
  for (const a of AVENUES) ctx.fillRect(a - ROAD_W / 2 - cam.x, -cam.y, ROAD_W, WORLD_H);
  for (const s of STREETS) ctx.fillRect(-cam.x, s - ROAD_W / 2 - cam.y, WORLD_W, ROAD_W);
  ctx.strokeStyle = 'rgba(240,220,120,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const a of AVENUES) { ctx.moveTo(a - cam.x, -cam.y); ctx.lineTo(a - cam.x, WORLD_H - cam.y); }
  for (const s of STREETS) { ctx.moveTo(-cam.x, s - cam.y); ctx.lineTo(WORLD_W - cam.x, s - cam.y); }
  ctx.stroke();
  ctx.setLineDash([]);
}

// Parks, parking lots and landmarks, then buildings with a soft shadow.
export function drawCityDetail(ctx, cam, city, time) {
  for (const p of city.parks) {
    ctx.fillStyle = '#2f6b3a';
    ctx.fillRect(p.x - cam.x, p.y - cam.y, p.w, p.h);
    ctx.fillStyle = '#3f8a4a';
    for (let i = 0; i < p.trees; i++) {
      const tx = p.x + 16 + ((i * 53) % Math.max(20, p.w - 32));
      const ty = p.y + 16 + ((i * 37) % Math.max(20, p.h - 32));
      ctx.beginPath(); ctx.arc(tx - cam.x, ty - cam.y, 11, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const l of city.lots) {
    ctx.fillStyle = '#3a3a42';
    ctx.fillRect(l.x - cam.x, l.y - cam.y, l.w, l.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let x = l.x + 18; x < l.x + l.w - 10; x += 52) {
      ctx.beginPath(); ctx.moveTo(x - cam.x, l.y + 8 - cam.y); ctx.lineTo(x - cam.x, l.y + l.h - 8 - cam.y); ctx.stroke();
    }
  }
  for (const lm of city.landmarks) {
    const pulse = 1 + Math.sin(time * 3 + lm.x) * 0.08;
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(lm.x - cam.x, lm.y - cam.y, lm.r * 0.18 * pulse + 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lm.name, lm.x - cam.x, lm.y - lm.r * 0.22 - cam.y);
  }
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(b.x + 6 - cam.x, b.y + 8 - cam.y, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(b.x - cam.x, b.y - cam.y, b.w, 6);
    if (b.roof) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.w * 0.25 - cam.x, b.y + b.h * 0.25 - cam.y, b.w * 0.5, b.h * 0.5);
    }
    ctx.fillStyle = 'rgba(255,230,120,0.5)';
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 30));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 13 + b.x) % 5 === 0) {
          ctx.fillRect(b.x + 8 + i * 34 - cam.x, b.y + 8 + j * 30 - cam.y, 10, 12);
        }
      }
    }
  }
}
