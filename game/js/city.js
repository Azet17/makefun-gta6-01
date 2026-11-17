// Neon Tide — Palmera Bay: the city itself.
// A seeded generator lays out the road grid, the five districts, the
// beach, the docks and every building, then answers the two questions
// the rest of the game keeps asking: "is this road?" and "did I hit
// a building?" Nothing here touches the canvas or the player.
'use strict';

// Small deterministic RNG (mulberry32) so a seeded run rebuilds the
// exact same city: screenshots stay reproducible.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

// Build the whole city from a seed. Returns { roads, buildings,
// districts, beach, docks, piers, parks, pickups }.
function buildCity(seed) {
  const rng = makeRng(seed || 1337);
  const W = CONFIG.WORLD_W, H = CONFIG.WORLD_H;
  const roads = [];
  const buildings = [];
  const parks = [];

  // Roads: a regular grid, 400 units apart, 56 wide. Verticals and
  // horizontals alike, so every block is reachable from every other.
  const spacing = 400, roadW = 56;
  for (let x = 0; x <= W; x += spacing) {
    roads.push({ x: x - roadW / 2, y: 0, w: roadW, h: H, vertical: true });
  }
  for (let y = 0; y <= H; y += spacing) {
    roads.push({ x: 0, y: y - roadW / 2, w: W, h: roadW, vertical: false });
  }
  // Two diagonal avenues so the grid never feels like graph paper.
  roads.push({ x: 0, y: 0, w: W, h: roadW, vertical: false, diag: 0.35 });
  roads.push({ x: 0, y: 0, w: roadW, h: H, vertical: true, diag: -0.3 });

  // Buildings fill the blocks between roads. Each block gets one to
  // four buildings with a gap for a sidewalk; the beach strip and the
  // dock yard stay open.
  const beach = { x: 1600, y: 2050, w: 1600, h: 350 };
  const docks = { x: 0, y: 0, w: 1100, h: 340 };
  for (let bx = 0; bx < 8; bx++) {
    for (let by = 0; by < 6; by++) {
      const blockX = bx * spacing + roadW / 2 + 14;
      const blockY = by * spacing + roadW / 2 + 14;
      const blockW = spacing - roadW - 28;
      const blockH = spacing - roadW - 28;
      // Beach strip: sand, palms and the boardwalk, no buildings.
      if (blockY + blockH > beach.y && blockX > beach.x) continue;
      // Docks: containers and cranes instead of buildings.
      if (blockY < docks.h && blockX < docks.w) {
        if (rng() < 0.55) {
          buildings.push({
            x: blockX + rng() * 120, y: blockY + rng() * 120,
            w: 90 + rng() * 60, h: 40 + rng() * 30,
            kind: 'container', color: pick(rng, ['#b45309', '#0e7490', '#9d174d', '#166534']),
            district: districtAt(blockX + 40, blockY + 40).name,
          });
        }
        continue;
      }
      // One plaza park per district, at most.
      if (rng() < 0.12) {
        parks.push({ x: blockX, y: blockY, w: blockW, h: blockH, trees: 6 + Math.floor(rng() * 6) });
        continue;
      }
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const bw = 70 + rng() * 130, bh = 60 + rng() * 120;
        const px = blockX + rng() * Math.max(1, blockW - bw);
        const py = blockY + rng() * Math.max(1, blockH - bh);
        const district = districtAt(px + bw / 2, py + bh / 2);
        buildings.push({
          x: px, y: py, w: bw, h: bh,
          kind: rng() < 0.18 ? 'tower' : 'block',
          color: shadeFor(district, rng),
          district: district.name,
          height: 18 + rng() * 46,
        });
      }
    }
  }

  // The long pier at Sunset Beach, the finale's destination.
  const piers = [{ x: 2900, y: 2050, w: 90, h: 300 }];

  return { roads, buildings, parks, beach, docks, piers, seed };
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function shadeFor(district, rng) {
  const base = {
    'Old Docks': ['#2c4a5e', '#37586b', '#22384a'],
    'Neon Row': ['#4a2c5e', '#5e2c4a', '#3a2c6e'],
    'Palm Heights': ['#2c4a38', '#3a5e44', '#243d2c'],
    'Market Mile': ['#5e4a2c', '#6b5432', '#4a3a22'],
    'Sunset Beach': ['#2c425e', '#38546b', '#223850'],
  }[district.name] || ['#333a4a'];
  return pick(rng, base);
}

function districtAt(x, y) {
  for (const d of CONFIG.DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return CONFIG.DISTRICTS[4];
}

// Is this point on the beach sand (drives like a road, slower grip)?
function isBeach(city, x, y) {
  return x >= city.beach.x && x <= city.beach.x + city.beach.w &&
    y >= city.beach.y && y <= city.beach.y + city.beach.h;
}

// Is this point on a road (or the beach, which drives like one)?
function isRoad(city, x, y) {
  if (isBeach(city, x, y)) return true;
  for (const r of city.roads) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

// Circle-vs-building collision. Returns the building hit, or null.
function hitBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    if (dist2(x, y, cx, cy) < radius * radius) return b;
  }
  return null;
}

// Push a circle out of a building it overlaps, and report the hit.
function resolveBuilding(city, x, y, radius) {
  const b = hitBuilding(city, x, y, radius);
  if (!b) return { x, y, hit: null };
  const cx = clamp(x, b.x, b.x + b.w);
  const cy = clamp(y, b.y, b.y + b.h);
  let dx = x - cx, dy = y - cy;
  let len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) { dx = 0; dy = -1; len = 1; }
  dx /= len; dy /= len;
  return { x: cx + dx * radius, y: cy + dy * radius, hit: b };
}

// Nearest point on the road grid to (x, y): where traffic spawns.
function nearestRoadPoint(city, x, y) {
  let best = null, bestD = Infinity;
  for (const r of city.roads) {
    const px = clamp(x, r.x, r.x + r.w);
    const py = clamp(y, r.y, r.y + r.h);
    const d = dist2(x, y, px, py);
    if (d < bestD) { bestD = d; best = { x: px, y: py, vertical: !!r.vertical }; }
  }
  return best || { x, y, vertical: true };
}

// A random road point at least `minDist` from (x, y).
function randomRoadPoint(city, rng, x, y, minDist) {
  for (let tries = 0; tries < 40; tries++) {
    const rx = 100 + rng() * (CONFIG.WORLD_W - 200);
    const ry = 100 + rng() * (CONFIG.WORLD_H - 200);
    const p = nearestRoadPoint(city, rx, ry);
    if (dist2(p.x, p.y, x, y) > minDist * minDist) return p;
  }
  return nearestRoadPoint(city, x + 600, y + 400);
}
