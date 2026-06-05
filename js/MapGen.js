// ─── MapGen.js ───────────────────────────────────────────────────────────────
// Seeded procedural map generator.  Returns a 2-D array [row][col] of TILE values.

class SeededRng {
  constructor(seed) {
    // Mulberry32 — simple, good quality, 32-bit seed
    this.s = seed >>> 0;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // integer in [min, max] inclusive
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  pick(arr)     { return arr[this.int(0, arr.length - 1)]; }
}

class MapGen {
  static generate(seed) {
    const rng  = new SeededRng(seed);
    const grid = [];
    for (let y = 0; y < MAP_H; y++) {
      grid.push(new Array(MAP_W).fill(TILE.PLAIN));
    }

    // ── Roads: one horizontal + one vertical ──────────────────────────────
    const roadY = rng.int(3, MAP_H - 4);
    const roadX = rng.int(4, MAP_W - 5);
    for (let x = 0; x < MAP_W; x++) grid[roadY][x] = TILE.ROAD;
    for (let y = 0; y < MAP_H; y++) grid[y][roadX]  = TILE.ROAD;

    // ── Terrain blobs ──────────────────────────────────────────────────────
    const blobTypes = [
      TILE.FOREST, TILE.FOREST, TILE.FOREST,
      TILE.MOUNTAIN, TILE.WATER,
    ];
    for (let i = 0; i < 18; i++) {
      const tx   = rng.int(0, MAP_W - 1);
      const ty   = rng.int(0, MAP_H - 1);
      const type = rng.pick(blobTypes);
      const size = rng.int(2, 5);
      for (let j = 0; j < size; j++) {
        const bx = Math.max(0, Math.min(MAP_W - 1, tx + rng.int(-2, 2)));
        const by = Math.max(0, Math.min(MAP_H - 1, ty + rng.int(-2, 2)));
        if (grid[by][bx] !== TILE.ROAD) grid[by][bx] = type;
      }
    }

    // ── Wall clusters ──────────────────────────────────────────────────────
    for (let i = 0; i < 6; i++) {
      const wx = rng.int(1, MAP_W - 2);
      const wy = rng.int(1, MAP_H - 2);
      for (let dw = -1; dw <= 1; dw++) {
        for (let dh = -1; dh <= 1; dh++) {
          const nx = Math.max(0, Math.min(MAP_W - 1, wx + dw));
          const ny = Math.max(0, Math.min(MAP_H - 1, wy + dh));
          if (grid[ny][nx] !== TILE.ROAD) grid[ny][nx] = TILE.WALL;
        }
      }
    }

    // ── Forts ──────────────────────────────────────────────────────────────
    for (let i = 0; i < 4; i++) {
      const fx = rng.int(1, MAP_W - 2);
      const fy = rng.int(1, MAP_H - 2);
      if (MOVE_COST[grid[fy][fx]] < 99) grid[fy][fx] = TILE.FORT;
    }

    // ── Villages (near edges) ──────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      const vx = rng.pick([0, MAP_W - 1]);
      const vy = rng.int(1, MAP_H - 2);
      grid[vy][vx] = TILE.VILLAGE;
    }

    // ── Throne (enemy side, right column area) ─────────────────────────────
    const throneY = rng.int(2, MAP_H - 3);
    grid[throneY][MAP_W - 2] = TILE.THRONE;
    // clear impassable tiles near throne
    for (let dx = -1; dx <= 1; dx++) {
      const nx = Math.max(0, Math.min(MAP_W - 1, MAP_W - 2 + dx));
      if (grid[throneY][nx] === TILE.WALL || grid[throneY][nx] === TILE.WATER) {
        grid[throneY][nx] = TILE.PLAIN;
      }
    }

    // ── Ensure player spawn (left side) is open ────────────────────────────
    const midY = Math.floor(MAP_H / 2);
    for (let dy = -2; dy <= 2; dy++) {
      const cy = Math.max(0, Math.min(MAP_H - 1, midY + dy));
      if (MOVE_COST[grid[cy][0]] >= 99) grid[cy][0] = TILE.PLAIN;
      if (MOVE_COST[grid[cy][1]] >= 99) grid[cy][1] = TILE.PLAIN;
    }

    // ── Find throne position ───────────────────────────────────────────────
    let thronePos = null;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (grid[y][x] === TILE.THRONE) { thronePos = { x, y }; break; }
      }
      if (thronePos) break;
    }

    return { grid, thronePos, rng };
  }

  // ── Castle floor generator ────────────────────────────────────────────────────
  // Layout: stone walls everywhere; a main corridor through the middle; 2-3 side
  // rooms each sealed by a DOOR tile; each room holds 2-4 CHEST tiles.
  // Returns { grid, thronePos, rooms, rng }
  // rooms: [{ doorX, doorY, chests:[{x,y}] }]
  static generateCastle(seed) {
    const rng  = new SeededRng(seed);
    // Start with all walls
    const grid = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(TILE.WALL));

    const corridorTop = Math.floor(MAP_H / 2) - 1;  // rows 4-5 (0-indexed)
    const corridorBot = corridorTop + 1;

    // ── Main corridor (horizontal, cols 1..MAP_W-2) ───────────────────────────
    for (let x = 1; x < MAP_W - 1; x++) {
      grid[corridorTop][x] = TILE.PLAIN;
      grid[corridorBot][x] = TILE.PLAIN;
    }

    // ── Player start area (cols 1-3, rows 1..MAP_H-2) ────────────────────────
    for (let y = 1; y < MAP_H - 1; y++) {
      grid[y][1] = TILE.PLAIN;
      grid[y][2] = TILE.PLAIN;
      grid[y][3] = TILE.PLAIN;
    }

    // ── Throne at far-right end of corridor ───────────────────────────────────
    const throneX = MAP_W - 2;
    const throneY = corridorTop;
    grid[throneY][throneX] = TILE.THRONE;
    grid[corridorBot][throneX] = TILE.PLAIN;

    // ── Chest rooms ───────────────────────────────────────────────────────────
    const numRooms = rng.int(2, 3);
    const rooms    = [];

    // Fixed x anchors spread across the corridor (excluding start + throne areas)
    const anchors = [5, 8, 11].slice(0, numRooms);

    for (const ax of anchors) {
      // Room goes up or down from the corridor
      const goesUp = rng.int(0, 1) === 0;

      // Room bounds (3 wide, 3 tall)
      const roomX1 = ax - 1, roomX2 = ax + 1;
      const roomY1 = goesUp ? 1 : corridorBot + 2;
      const roomY2 = goesUp ? corridorTop - 2 : MAP_H - 2;

      // Carve the room interior
      for (let ry = roomY1; ry <= roomY2; ry++) {
        for (let rx = roomX1; rx <= roomX2; rx++) {
          if (rx >= 1 && rx <= MAP_W - 2 && ry >= 1 && ry <= MAP_H - 2)
            grid[ry][rx] = TILE.PLAIN;
        }
      }

      // Carve connecting passage (one tile wide) between room and corridor
      const passX  = ax;
      const passY1 = goesUp ? roomY2 + 1 : corridorBot + 1;
      const passY2 = goesUp ? corridorTop - 1 : roomY1 - 1;
      for (let py = Math.min(passY1, passY2); py <= Math.max(passY1, passY2); py++) {
        if (py >= 1 && py <= MAP_H - 2) grid[py][passX] = TILE.PLAIN;
      }

      // Place DOOR at the passage mouth (adjacent to corridor)
      const doorY = goesUp ? corridorTop - 1 : corridorBot + 1;
      if (doorY >= 1 && doorY <= MAP_H - 2) grid[doorY][passX] = TILE.DOOR;

      // Place 2-4 CHESTs inside the room (not on the passage tile)
      const numChests  = rng.int(2, 4);
      const chests     = [];
      let   attempts   = 0;
      while (chests.length < numChests && attempts < 60) {
        attempts++;
        const cx = rng.int(roomX1, roomX2);
        const cy = rng.int(roomY1, roomY2);
        if (grid[cy][cx] === TILE.PLAIN && cx !== passX) {
          grid[cy][cx] = TILE.CHEST;
          chests.push({ x: cx, y: cy });
        }
      }

      rooms.push({ doorX: passX, doorY, chests });
    }

    // ── Find throne position object ───────────────────────────────────────────
    const thronePos = { x: throneX, y: throneY };

    return { grid, thronePos, rooms, rng };
  }
}
