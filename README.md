# SAN VERANO: Neon Coast 3D

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Kopler12/kopler-gta6-final2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Kopler12/kopler-gta6-final2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
Live rank and reward badges above update as the entry is judged.

An original open-world crime game for make.fun's **gta6-01** bounty — a complete
3D city you explore on foot and by car, with traffic, pedestrians, police, a
wanted system, missions, combat, a HUD with a live minimap, saves and
synthesized sound. Everything is original: the city of San Verano, its people
(Rio Vega, Mara Solis, Dario Finn), its cars and its story. No Rockstar
content, no GTA names, characters, map or assets — and no network requests:
the game runs entirely from static files, with three.js vendored locally.

## The story

Rio Vega just rolled into San Verano with an empty wallet and a fast car. Mara
Solis runs the garage, Dario Finn runs the harbour — and the whole neon coast
is up for grabs. Five jobs stand between Rio and the big score: a first shift
at the garage, a harbour pickup, a shootout on the pier, a race from the plaza
to the beach, and one last cash run. Finish the story and the city opens up:
taxi fares keep the money coming while you free-roam.

## Features

- **Living 3D city** — procedural sunset city with a road grid, neon signs,
  lit windows, a beach, the sea, a pier, a harbour, palm trees and
  streetlights, all deterministic from a seed.
- **On foot and by car** — third-person walking with running and jumping, and
  arcade driving with a chase camera, handbrake skids and damage smoke.
- **Steal any car** — parked cars and traffic cars (stealing raises your
  wanted level); press E to enter and exit.
- **Traffic and pedestrians** — cars follow the road grid, turn at
  intersections and stop behind each other; pedestrians stroll the sidewalks
  and flee from speeding cars and gunfire.
- **Wanted system (0–5 stars)** — crimes raise the heat; police cars spawn
  in proportion to the stars, chase and ram you, and flash their light bars.
  Lay low and the heat decays.
- **Missions and story** — five sequential story missions with objective text,
  world markers and payouts, then free-roam taxi fares.
- **Combat** — pistol with mouse aim, raycast hits, tracers, muzzle flash and
  rival gunmen who shoot back during the pier shootout.
- **HUD and minimap** — health, cash, wanted stars, speed, in-game clock,
  mission objective and a live canvas minimap with player, police, traffic
  and mission markers.
- **Start screen, pause, game over and saves** — progress, cash, mission and
  position save to localStorage; continue any time.
- **Sound** — fully synthesized WebAudio: engine hum, police sirens,
  gunshots, pickup jingles and a procedural sunset music loop. No audio files.
- **Polish** — skid dust, damage smoke, screen shake, headlights and a
  golden-hour sunset with shadows.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Run (on foot) |
| Space | Jump (on foot) / handbrake (driving) |
| E | Enter / exit car |
| Mouse drag | Orbit camera |
| Mouse click | Shoot (on foot) |
| R | Reload |
| M | Taxi fare (after the story) |
| P / Esc | Pause |
| F | Save game |
| N | Mute |

## How to run

```sh
node serve.ts
# open http://localhost:8080
```

Any static file server works: serve `game/` and open `index.html` in desktop
Chrome. The game makes no network requests; three.js is vendored under
`game/vendor/three.min.js`.

## Files

- `game/index.html` — the page, HUD and styles
- `game/src/main.js` — boot, game loop, player, camera, save/load
- `game/src/world.js` — procedural city, collisions, roads
- `game/src/vehicles.js` — car meshes, driving physics, traffic AI
- `game/src/pedestrians.js` — sidewalk walkers and fleeing
- `game/src/police.js` — wanted system and police pursuit
- `game/src/missions.js` — story missions and taxi fares
- `game/src/combat.js` — pistol combat and rival AI
- `game/src/hud.js` — HUD, minimap, menus
- `game/src/audio.js` — synthesized WebAudio sound
- `game/src/shots.js` — deterministic staged scenes for screenshots
- `game/src/util.js` — seeded random and helpers

## License

MIT — see `LICENSE`.
