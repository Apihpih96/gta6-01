# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Apihpih96/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Apihpih96/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solar Coast** — an open-world coastal crime game set in a sun-soaked procedural city. Explore on foot or behind the wheel of a drivable car, navigate traffic, and watch pedestrians scatter as you speed past. Built with three.js — zero network requests, everything runs locally.

## Features

- **Procedural city** — 12×12 grid with a downtown core, beachfront, palm trees, and street lamps
- **On-foot exploration** — WASD movement, running, jumping, building collision, walk animation
- **Drivable vehicles** — 4 body styles (sedan, hatchback, pickup, van), arcade physics with handbrake
- **Traffic AI** — cars driving the road grid, keeping gaps, spawning and despawning
- **Pedestrians** — walkers on sidewalks that flee from fast-moving vehicles
- **Wanted level** — 0–5 stars that rise from crimes (stealing cars, hitting peds, punching) and decay when you lay low
- **Police pursuit** — black-and-white patrol cars with flashing light bars, on-foot officers at 3+ stars, ramming and bust logic
- **Combat** — punch with F or left-click, pedestrian health and flee response, some fight back, player health regen
- **Top-down minimap** — roads, buildings, parked cars, traffic, pedestrians, police blips, and player arrow
- **HUD** — health bar, cash, wanted stars, speed readout, contextual prompts, BUSTED/WASTED overlays

## Run it

```sh
node serve.ts
```

Then open `http://localhost:8080` in your browser.

## Controls

| Key | Action |
|-----|--------|
| WASD | Move / Drive |
| Shift | Run |
| Space | Jump / Handbrake |
| Mouse | Look / Steer |
| E | Enter/Exit vehicle |
| F / Left click | Punch |
| Esc | Pause |

## Build

```sh
MAKEFUN_OUTPUT_DIR=/tmp/gta6-out node main.ts
```

Copies the game, screenshots, and writes `dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qv9aepwe&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
