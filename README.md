[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Azet17/makefun-gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Azet17/makefun-gta6-01/reward.svg)](https://make.fun/c/gta6-01)

# Neon Tide — Palmera Bay

An original open-world crime game built for the [make.fun gta6-01 competition](https://make.fun/c/gta6-01).
Mara Voss returns to Palmera Bay — a sun-soaked coastal city of her own — to take back
what the Tide crew stole from her family. Explore the city on foot and by car, steal
wheels, outrun the Bay Police, and finish all six story missions.

## The game

- **Open world:** five districts (Marina del Sol, Downtown, Old Harbor, Coral Heights,
  Dockside) plus a beach, on a 3600×3600 road grid with named streets, parks and traffic.
- **On foot and by car:** walk, sprint, aim with the mouse, shoot — or steal any car
  (press E) and drive it with real acceleration, steering and handbrake physics.
- **Traffic and pedestrians:** cars follow the road grid, pedestrians walk the
  sidewalks and flee from gunfire.
- **Wanted level:** 0–5 stars. Steal cars, hit people or shoot and the Bay Police
  respond — patrol cars chase and ram you, officers hunt you on foot at high heat.
  Lay low and the stars fade.
- **Missions and story:** six missions with dialogue, objectives and cash rewards —
  a pickup, a car theft, a dockside shootout, a police getaway, a vault job, and a
  final showdown with the Tide crew.
- **Combat:** fists, pistol, shotgun and SMG, with ammo, reloads, enemy health bars,
  cash drops and pickups.
- **HUD and minimap:** mission objective, wanted stars, cash, health, weapon and
  speed, plus a live minimap with the mission marker, traffic and police dots.
- **Start screen, pause and save:** title menu with story intro, how-to-play, pause
  menu, and autosave after every mission (localStorage) with Continue on the menu.
- **Polish:** procedural WebAudio sound — synthwave music loop, engine hum, sirens,
  gunshots — plus particles, car damage, garages, a gun shop, a diner and a hospital.

## How to play

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Aim (on foot) |
| Click | Shoot / punch |
| E | Enter or exit a car, use a service spot |
| Shift | Sprint |
| R | Reload |
| Space | Handbrake (driving) |
| M | Mute |
| Esc | Pause |

## Play it

Serve `game/` with any static file server and open `index.html` in desktop Chrome —
no build step, no network requests, everything is a file under `game/`.

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

## Files

- `game/index.html` — the page and menus
- `game/css/style.css` — HUD and menu styling
- `game/js/config.js` — world constants, districts, car models
- `game/js/city.js` — city generation, buildings, collision
- `game/js/entities.js` — traffic, pedestrians, police
- `game/js/missions.js` — the six story missions
- `game/js/combat.js` — weapons, bullets, particles, pickups
- `game/js/audio.js` — procedural WebAudio sound and music
- `game/js/save.js` — localStorage save
- `game/js/hud.js` — HUD panels and minimap
- `game/js/game.js` — main loop, input, driving, wanted level, rendering
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`

## Originality

Every name, character, vehicle, street, district and line of story in this game is
original and invented for it. Nothing is taken from Rockstar Games' Grand Theft Auto
series or any other commercial game — no names, logos, characters, map, art or music.

## License

MIT — see [LICENSE](LICENSE).
