[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Azet17/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Azet17/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Neon Tide — Palmera Bay

An original top-down open-world crime game for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01).

Mara Voss steals cars. The Bay Police steal them back. Across five districts
of the sun-soaked coastal city of Palmera Bay — Marina Bay, Coral Heights,
Old Town, the Neon Strip and the Palm Docks — Mara runs six story missions:
hot-wiring her first car, delivering it to the chop shop, losing a three-star
heat, smashing through roadblocks to the marina, running a package from the
docks to the penthouse, and finally stealing the gold supercar outside the
Neon Casino and vanishing to the beach hideout.

## How to play

```sh
node serve.ts
```

Then open http://localhost:8080 and press Enter.

- **WASD / arrows** — drive and walk
- **E** — steal a parked car / climb out of your car
- **Space** — handbrake
- **H** — horn
- **M** — mute
- **P** — pause

## What is in the game

- A procedural coastal city: road grid, five districts, beach and bay, parks,
  plazas, and story landmarks (chop shop, casino, marina, docks, penthouse,
  beach hideout)
- Driving and walking, car theft, traffic, and pedestrians who flee from
  speeding cars
- A wanted system (0–5 stars) with police cars that chase, ram, and try to
  box Mara in — plus a bust timer when they catch her crawling
- Six story missions with timers, objectives, a gold marker, and cash rewards
- A HUD with speed, wanted stars, cash, car health, mission objective and
  timer, district name, and a live minimap
- Synthesized WebAudio sound: engine, two-tone siren, horn, crashes, skids,
  pickups, and mission jingles — no audio files
- Save / continue via localStorage: mission progress and cash persist
- Repair pickups, skid marks, crash particles, and a damage vignette

## Layout

- `game/index.html` — the page and the HUD markup
- `game/css/style.css` — HUD and menu styling
- `game/js/config.js` — tuning, districts, missions, helpers
- `game/js/city.js` — procedural city generation and collision queries
- `game/js/entities.js` — cars, police AI, traffic AI, pedestrians
- `game/js/missions.js` — the six-mission story and save / continue
- `game/js/audio.js` — synthesized WebAudio sound
- `game/js/hud.js` — HUD updates and the live minimap
- `game/js/main.js` — game loop, input, camera, renderer, screenshots
- `main.ts` — hands the entry in (copies `game/` + `screenshots/`, writes `dossier.json`)
- `serve.ts` — local static server for playtesting

Everything in `game/` is a local static file; the game makes no network
request. No assets, names, characters, or music are taken from any commercial
game — the city, the story, and Mara Voss are original.

## Screenshots

Four screenshots of the game itself, in `screenshots/` (cover first):
`1-start.jpg` (title screen), `2-drive.jpg` (driving), `3-chase.jpg`
(police chase), `4-mission.jpg` (mission in progress). They are rendered
from the game with `?shot=start|drive|chase|mission` staging the scene.

## Entry

Built for the make.fun **gta6-01** bounty. Referral code: `3cnb50c1`.
