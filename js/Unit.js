// ─── Unit.js ──────────────────────────────────────────────────────────────────

class Unit {
  constructor({
    name, faction, gx, gy,
    hp, pow = 0, moj = 0, sp = 0, lck = 0, def = 0, mdef = 0, move,
    color, symbol,
    level = 1, growths = null, moveCosts = null,
    className = '', isLord = false, isBoss = false,
  }) {
    this.name    = name;
    this.faction = faction;
    this.gx      = gx;
    this.gy      = gy;

    this.maxHp = hp;
    this.hp    = hp;
    this.pow   = pow;
    this.moj   = moj;
    this.sp    = sp;
    this.lck   = lck;
    this.def   = def;
    this.mdef  = mdef;
    this.move  = move;

    this.level     = level;
    this.growths   = growths   || { hp: 0, pow: 0, moj: 0, sp: 0, lck: 0, def: 0, mdef: 0 };
    this.moveCosts = moveCosts || MOVE_COST;

    this.color     = color;
    this.symbol    = symbol;
    this.className = className;
    this.isLord    = isLord;
    this.isBoss = isBoss;
    this.moved  = false;
  }

  get alive() { return this.hp > 0; }

  // ── Level-up ───────────────────────────────────────────────────────────────
  // Rolls each stat against its growth rate. Returns an object of which stats
  // increased (used by the caller to display a level-up screen).
  levelUp() {
    this.level++;
    const gained = {};
    for (const stat of ['hp', 'pow', 'moj', 'sp', 'lck', 'def', 'mdef']) {
      if (Math.random() * 100 < (this.growths[stat] || 0)) {
        this[stat]++;
        if (stat === 'hp') this.maxHp++;
        gained[stat] = true;
      }
    }
    return gained; // e.g. { hp: true, pow: true }
  }

  // ── Damage calculation ─────────────────────────────────────────────────────
  // Auto-selects physical (Pow vs Def) or magic (Moj vs MDef) based on which
  // of the attacker's offensive stats is higher.
  // tileDef is only applied to physical attacks (magic ignores terrain).
  // Returns { dmg, isMagic, doubles } — doubles = true if SP advantage ≥ 4.
  calcDamage(defender, tileDef = 0) {
    const isMagic = this.moj > this.pow;
    let dmg;
    if (isMagic) {
      dmg = Math.max(1, this.moj - defender.mdef);
    } else {
      dmg = Math.max(1, this.pow - (defender.def + tileDef));
    }
    const doubles = this.sp >= defender.sp + 4;
    return { dmg, isMagic, doubles };
  }

  // ── BFS flood-fill for movement range ──────────────────────────────────────
  // Returns a Map<"x,y" -> cost> for all reachable tiles.
  computeMoveRange(grid, units) {
    const dist  = new Map();
    const queue = [{ x: this.gx, y: this.gy, cost: 0 }];
    dist.set(`${this.gx},${this.gy}`, 0);

    while (queue.length) {
      const { x, y, cost } = queue.shift();

      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;

        const stepCost = this.moveCosts[grid[ny][nx]];
        const newCost  = cost + stepCost;
        if (newCost > this.move) continue;

        const key = `${nx},${ny}`;
        if (dist.has(key) && dist.get(key) <= newCost) continue;

        // Can't pass through enemy units
        const blocker = units.find(u => u.gx === nx && u.gy === ny && u.alive);
        if (blocker && blocker !== this && blocker.faction !== this.faction) continue;

        dist.set(key, newCost);
        queue.push({ x: nx, y: ny, cost: newCost });
      }
    }
    return dist;
  }

  // ── Attack range = 1 step outside move range ──────────────────────────────
  computeAttackRange(moveRange) {
    const atk = new Set();
    for (const key of moveRange.keys()) {
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
        const nk = `${nx},${ny}`;
        if (!moveRange.has(nk)) atk.add(nk);
      }
    }
    return atk;
  }
}
