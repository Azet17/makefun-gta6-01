// Neon Tide — Palmera Bay: the city itself.
// A seeded procedural city: a road grid, five districts, a beach and bay on
// the west edge, parks, and the story landmarks (chop shop, casino, marina,
// docks, penthouse, hideout). Everything the game draws or collides with
// comes from the tables built here.

const City = (function () {
  const city = {
    buildings: [],   // {x, y, w, h, color, district, roof}
    parks: [],       // {x, y, w, h}
    roadblocks: [],  // {x, y, angle, broken}
    landmarks: {},   // named story spots: {x, y, label, color}
    avenues: [],     // x positions of north-south road centres
    streets: [],     // y positions of east-west road centres
    pickups: [],     // repair wrench spots {x, y, taken}
    seed: 20261118,
  };

  // Build the whole city from a seed. Called once at load and again only
  // when the player starts a brand-new story.
  function build(seed) {
    city.seed = seed;
    const rng = mulberry32(seed);
    city.buildings = [];
    city.parks = [];
    city.roadblocks = [];
    city.pickups = [];
    city.avenues = [];
    city.streets = [];

    const W = CONFIG.worldWidth, H = CONFIG.worldHeight;
    const bw = CONFIG.blockWidth, bh = CONFIG.blockHeight, rw = CONFIG.roadWidth;
    const cityX0 = CONFIG.waterWidth + CONFIG.beachWidth; // city starts east of the sand

    // Avenue centres: from the first road east of the beach to the east edge.
    for (let x = cityX0 + rw / 2 + bw / 2; x < W - rw; x += bw + rw) city.avenues.push(x);
    for (let y = rw / 2 + bh / 2; y < H - rw; y += bh + rw) city.streets.push(y);

    // One building (sometimes two, sometimes a park) per city block.
    const roofColors = [
      CONFIG.palette.buildingRoof, CONFIG.palette.buildingRoof2,
      CONFIG.palette.buildingRoof3, CONFIG.palette.buildingRoof4,
      CONFIG.palette.buildingRoof5,
    ];
    for (let ai = 0; ai < city.avenues.length - 1; ai++) {
      for (let si = 0; si < city.streets.length - 1; si++) {
        const bx0 = city.avenues[ai] + rw / 2 + CONFIG.sidewalk;
        const by0 = city.streets[si] + rw / 2 + CONFIG.sidewalk;
        const bx1 = city.avenues[ai + 1] - rw / 2 - CONFIG.sidewalk;
        const by1 = city.streets[si + 1] - rw / 2 - CONFIG.sidewalk;
        const roll = rng();
        if (roll < 0.12) {
          // A park: trees, benches, no buildings.
          city.parks.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
          continue;
        }
        if (roll < 0.2) {
          // An open plaza with a fountain square.
          city.parks.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0, plaza: true });
          continue;
        }
        const district = districtAt((bx0 + bx1) / 2, (by0 + by1) / 2);
        const split = rng() < 0.45;
        if (split) {
          const midX = bx0 + (bx1 - bx0) * (0.42 + rng() * 0.16);
          addBuilding(bx0 + 6, by0 + 6, midX - bx0 - 12, by1 - by0 - 12, roofColors, rng, district);
          addBuilding(midX + 6, by0 + 6, bx1 - midX - 12, by1 - by0 - 12, roofColors, rng, district);
        } else {
          addBuilding(bx0 + 8, by0 + 8, bx1 - bx0 - 16, by1 - by0 - 16, roofColors, rng, district);
        }
      }
    }

    // Landmarks: fixed story spots on real roads, clear of buildings.
    city.landmarks = {
      hideout:     { x: 430,  y: 2350, label: 'Beach Hideout', color: '#e8c84a' },
      chopShop:    { x: 1456, y: 1463, label: 'Chop Shop', color: '#e8c84a' },
      marina:      { x: 824,  y: 665,  label: 'Marina', color: '#e8c84a' },
      docks:       { x: 3036, y: 2527, label: 'Palm Docks', color: '#e8c84a' },
      penthouse:   { x: 1456, y: 399,  label: 'Penthouse', color: '#e8c84a' },
      casino:      { x: 2404, y: 665,  label: 'Neon Casino', color: '#e8c84a' },
      repairNorth: { x: 1140, y: 1197, label: 'Repair', color: '#4fc94f' },
      repairSouth: { x: 2088, y: 1995, label: 'Repair', color: '#4fc94f' },
    };

    // Repair pickups: drive over a wrench to fix the car.
    city.pickups = [
      { x: 1140, y: 1197, taken: false },
      { x: 2088, y: 1995, taken: false },
      { x: 1772, y: 665, taken: false },
    ];

    // Roadblocks for mission 4: two striped barriers across the roads
    // that lead to the marina, with a narrow kerb gap on one side.
    city.roadblocks = [
      { x: 824, y: 1197, angle: 0, broken: false },
      { x: 1140, y: 665, angle: Math.PI / 2, broken: false },
    ];
    return city;
  }

  function addBuilding(x, y, w, h, roofColors, rng, district) {
    if (w < 40 || h < 30) return;
    const color = roofColors[Math.floor(rng() * roofColors.length)];
    city.buildings.push({
      x, y, w, h, color,
      district: district ? district.name : 'Palmera Bay',
      roof: rng() < 0.3,
      windows: Math.floor(rng() * 3),
    });
  }

  // Which district owns a point? The first match wins; the beach and bay
  // belong to no district and report null.
  function districtAt(x, y) {
    for (const d of DISTRICTS) {
      if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
    }
    return null;
  }

  // Is a point on a road (asphalt) rather than a block?
  function isRoad(x, y) {
    if (x < CONFIG.waterWidth + CONFIG.beachWidth) return false;
    const rw = CONFIG.roadWidth / 2;
    for (const ax of city.avenues) if (Math.abs(x - ax) <= rw) return true;
    for (const sy of city.streets) if (Math.abs(y - sy) <= rw) return true;
    return false;
  }

  // Is a point in the water or on the sand?
  function isWater(x, y) { return x < CONFIG.waterWidth; }
  function isSand(x, y) {
    return x >= CONFIG.waterWidth && x < CONFIG.waterWidth + CONFIG.beachWidth;
  }

  // The building whose rectangle contains the point, or null.
  function buildingAt(x, y) {
    for (const b of city.buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  // Circle-vs-buildings collision: returns the building hit by a circle of
  // radius r at (x, y), or null. Used by cars and by the walking player.
  function collideCircle(x, y, r) {
    for (const b of city.buildings) {
      const cx = clamp(x, b.x, b.x + b.w);
      const cy = clamp(y, b.y, b.y + b.h);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return b;
    }
    return null;
  }

  // Nearest road centre to a point, and whether it is an avenue or street.
  function nearestRoad(x, y) {
    let bestA = null, bestAd = Infinity;
    for (const ax of city.avenues) {
      const d = Math.abs(x - ax);
      if (d < bestAd) { bestAd = d; bestA = ax; }
    }
    let bestS = null, bestSd = Infinity;
    for (const sy of city.streets) {
      const d = Math.abs(y - sy);
      if (d < bestSd) { bestSd = d; bestS = sy; }
    }
    if (bestAd <= bestSd) return { kind: 'avenue', at: bestA, dist: bestAd };
    return { kind: 'street', at: bestS, dist: bestSd };
  }

  // A random point on a road, for spawning traffic and parked cars.
  function randomRoadPoint(rng) {
    const vertical = rng() < 0.5;
    if (vertical) {
      const ax = city.avenues[Math.floor(rng() * city.avenues.length)];
      const y = CONFIG.roadWidth + rng() * (CONFIG.worldHeight - CONFIG.roadWidth * 2);
      return { x: ax + (rng() < 0.5 ? -14 : 14), y, angle: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
    }
    const sy = city.streets[Math.floor(rng() * city.streets.length)];
    const x = CONFIG.waterWidth + CONFIG.beachWidth + CONFIG.roadWidth + rng() * (CONFIG.worldWidth - CONFIG.waterWidth - CONFIG.beachWidth - CONFIG.roadWidth * 2);
    return { x, y: sy + (rng() < 0.5 ? -14 : 14), angle: rng() < 0.5 ? 0 : Math.PI };
  }

  // A point on a road near (x, y), used to drop police in around the player.
  function roadPointNear(x, y, distance, rng) {
    for (let tries = 0; tries < 24; tries++) {
      const a = rng() * Math.PI * 2;
      const px = clamp(x + Math.cos(a) * distance, CONFIG.waterWidth + CONFIG.beachWidth + 80, CONFIG.worldWidth - 80);
      const py = clamp(y + Math.sin(a) * distance, 80, CONFIG.worldHeight - 80);
      const road = nearestRoad(px, py);
      if (road.dist < CONFIG.roadWidth / 2 - 6) {
        return road.kind === 'avenue'
          ? { x: road.at + (rng() < 0.5 ? -14 : 14), y: py, angle: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 }
          : { x: px, y: road.at + (rng() < 0.5 ? -14 : 14), angle: rng() < 0.5 ? 0 : Math.PI };
      }
    }
    return { x, y: y - distance, angle: Math.PI / 2 };
  }

  // The player's story start: on the beach road by the hideout, facing east.
  function playerSpawn() {
    return { x: 480, y: 2350, angle: 0 };
  }

  // The roadblock whose barrier a circle of radius r at (x, y) touches, or null.
  // A barrier is a striped bar across the road; the kerb gap at each end lets
  // a careful driver slip past without smashing it.
  function roadblockHit(x, y, r) {
    for (const rb of city.roadblocks) {
      if (rb.broken) continue;
      const dx = x - rb.x, dy = y - rb.y;
      const along = rb.angle === 0 ? dx : dy;
      const across = rb.angle === 0 ? dy : dx;
      if (Math.abs(across) < 12 + r && Math.abs(along) < 52) return rb;
    }
    return null;
  }

  return {
    data: city, build, districtAt, isRoad, isWater, isSand,
    buildingAt, collideCircle, nearestRoad, randomRoadPoint, roadPointNear,
    playerSpawn, roadblockHit,
  };
})();

// Build the default city at load so every module can read it.
City.build(20261118);
