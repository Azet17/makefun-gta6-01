# Neon Tide: Palmera Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Azet17/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Azet17/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original top-down open-world crime game for the make.fun **gta6-01** competition. You are Mara Voss, back in Palmera Bay with nothing but a name on a list: steal cars, outrun the Bay Police across five districts, and finish six story jobs to pull off the big score.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network requests — `game/` is plain HTML, CSS and JavaScript that runs from local files.

## The game

- **A city to explore** — five districts (Palmera Beach, Neon Row, Harbor Docks, Old Town, Sunset Hills), a pier, a harbor, parks, parking lots and a sea edge, all generated from a fixed seed.
- **On foot and by car** — walk Mara with WASD, steal any parked or traffic car with **E**, drive with arcade handling, horn with **H**.
- **Wanted level** — carjacking, assault and ramming the police raise the heat from 0 to 5 stars; patrol cars chase, ram and corner her, and the heat only cools off when she stays out of sight.
- **Six story missions** — First Wheels, Beach Run, Hot Pursuit, Harbor Heist, Neon Getaway and The Big Score, each with on-screen objectives, a pulsing map marker and a cash reward.
- **Traffic and pedestrians** — cars cruise the avenues and turn at intersections, pedestrians wander the pavements and panic when the heat is on.
- **HUD and minimap** — wanted stars, cash, health, speed, the current objective, and a live minimap with the player, police and mission target.
- **Combat, save and sound** — punch with **Space**, save with **F** (or from the pause menu, **P**), and synthesized WebAudio engine hum, sirens and jingles — no audio files.
- **Win and lose** — finish all six jobs to win; get cornered on foot or taken down and it is game over.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Shift | Run on foot |
| E | Steal / exit car |
| Space | Punch |
| H | Horn |
| P / Esc | Pause |
| F | Save game |
| M | Mute |

## Layout

- `game/index.html` — page, HUD overlay and screens
- `game/css/style.css` — HUD and menu styling
- `game/js/config.js` — tuning, districts, car models
- `game/js/city.js` — city generation, roads, drawing
- `game/js/entities.js` — player, cars, police AI, pedestrians
- `game/js/missions.js` — the six story jobs
- `game/js/audio.js` — synthesized sound
- `game/js/hud.js` — HUD, minimap, screens
- `game/js/main.js` — game loop, input, camera, save
- `main.ts` — hands the game in (`/output` + `dossier.json`)
- `serve.ts` — local static server
- `shots.json` — screenshot manifest (`?shot=start|drive|chase|mission`)

---

<sub>Entered on [make.fun](https://make.fun/?ref=3cnb50c1&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## Screenshots

The four screenshots in `screenshots/` are real renders of the game taken in headless Chromium at 1280×720: the title screen, Mara cruising Neon Row, a three-star police chase, and a mission in progress. Each was captured from the game's own `?shot=` scenes.
