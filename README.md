[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Azet17/makefun-gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Azet17/makefun-gta6-01/reward.svg)](https://make.fun/c/gta6-01)

# Neon Tide — Palmera Bay

An original top-down open-world crime game for the make.fun **Make GTA 6** competition (`gta6-01`). You are **Mara Voss**, back in Palmera Bay with nothing but a grudge and a talent for other people's cars. Steal cars, outrun the Bay Police across a five-district coastal city, and run six story missions — from a hot-wired coupe in Neon Row to the boat at the end of the Sunset Beach pier.

Everything is original: the city, the characters, the vehicles, the story, the art and the sound. No assets from any commercial game. The game runs entirely offline from static files — no network requests, no external assets.

## What is in the game

- **Open world** — Palmera Bay: Old Docks, Neon Row, Palm Heights, Market Mile and Sunset Beach, with a road grid, buildings, parks, the beach and the long pier.
- **Driving and stealing** — drive with WASD or arrows, brake with Space, step out with F, and jack any traffic car (or the pink coupe in mission 1).
- **Wanted system** — crimes raise your stars; the Bay Police chase, ram and try to bust you. Break line of sight and the heat fades.
- **Traffic and pedestrians** — cars cruise the grid and turn at intersections; pedestrians stroll the sidewalks and flee when you come in hot.
- **Six story missions** — car theft, getaway, timed delivery, vault heist, five-star escape, and the finale, each with its own objective marker, timer and reward.
- **HUD and minimap** — health, wanted stars, speed, money, mission objective, current district, and a live minimap with the player arrow, police dots and the mission marker.
- **Combat and pickups** — ramming, crashes and busted/wasted states; cash stashes and repair pickups scattered through the city.
- **Sound** — fully synthesized WebAudio: engine hum that follows your speed, wailing sirens, crashes, pickups and mission jingles. No audio files.
- **Save** — progress autosaves to localStorage; continue from the main menu.

## How to run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome and press **New Game**. Or serve `game/` with any static HTTP server and open `game/index.html`.

## Controls

| Key | Action |
| --- | --- |
| W / A / S / D or arrows | Drive / steer |
| Space | Brake |
| F | Step out of the car / steal a nearby car |
| H | Horn |
| P or Esc | Pause |
| M | Mute |
| R | Retry mission (after failing) |
| Enter | Start from the menu |

## Screenshots

Four screenshots of the game itself, taken in desktop Chrome at 1280×720:

1. `1-start.jpg` — the title screen over Neon Row.
2. `2-drive.jpg` — driving through Market Mile with the HUD and minimap.
3. `3-chase.jpg` — a three-star police chase with sirens flashing.
4. `4-mission.jpg` — the timed Sunset Delivery mission with the gold marker.

## Project layout

```
game/
  index.html        page, HUD and menus
  css/style.css     dark neon styling
  js/config.js      constants, districts, car and police tuning, missions
  js/city.js        seeded city generation, roads, buildings, collision
  js/entities.js    player car, police AI, traffic, pedestrians, pickups
  js/missions.js    the six story missions and their state machine
  js/audio.js       synthesized WebAudio sound
  js/hud.js         HUD readouts and the minimap
  js/main.js        game loop, input, camera, wanted system, save/load
main.ts             copies game/ + screenshots/ to /output, writes dossier.json
serve.ts            local static server for playtesting
screenshots/       four screenshots of the game itself
```

## Entry

Built for the make.fun competition **gta6-01 — Make GTA 6**. Entry referral code: `3cnb50c1`.

## License

MIT — see [LICENSE](LICENSE).
