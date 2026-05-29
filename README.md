# Fire Emblem Roguelite — JavaScript/Phaser 3

A GBA-style turn-based SRPG roguelite built with Phaser 3.
No build tools, no bundler — just open `index.html` in a browser.

## How to run

**Option A — Local file (simplest):**
Just double-click `index.html`. Works in most browsers.
If you see a blank screen, use Option B (some browsers block local script loading).

**Option B — Local server (recommended):**
```bash
# Python 3
python3 -m http.server 8080
# then open http://localhost:8080 in your browser

# Node (if you have npx)
npx serve .
```

## Controls

| Key           | Action               |
|---------------|----------------------|
| Arrow Keys    | Move cursor / menu   |
| Z or Enter    | Confirm / Select     |
| X or Escape   | Cancel / Back        |

## Project structure

```
index.html              ← entry point, loads all scripts
js/
  constants.js          ← all shared enums, colours, tile data
  SaveData.js           ← localStorage save/load wrapper
  MapGen.js             ← seeded procedural map generator
  Unit.js               ← Unit class, BFS movement/attack range
  MainMenuScene.js      ← title screen
  LordSelectScene.js    ← lord selection (3 lords)
  GameMapScene.js       ← full SRPG gameplay
  main.js               ← Phaser config & boot
```

## Gameplay

- **New Game** creates a save file and seeds a unique map
- Select one of **3 Lords** (more will be added later)
- The map is **procedurally generated** — terrain, roads, villages, forts, throne
- **Turn-based combat**: select a unit → blue tiles = move range, red = attack range
- Units auto-end turn once all have moved
- **Enemy AI** moves toward nearest player unit and attacks if adjacent
- **Win** by defeating all enemies (or the boss on the throne)
- **Lose** if your Lord falls

## Extending the game

All the interesting numbers live in `constants.js` (tile costs, colours)
and `GameMapScene.js` (`_spawnUnits` for unit stats).  `MapGen.js` controls
terrain generation.  Each file is self-contained and heavily commented.
