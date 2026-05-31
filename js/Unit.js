// ─── Unit.js ──────────────────────────────────────────────────────────────────

class Unit {
  constructor({
    name, faction, gx, gy,
    hp, pow = 0, mag = 0, sp = 0, lck = 0, def = 0, mdef = 0, move, abilities = [],
    color, symbol,
    level = 1, growths = null, moveCosts = null,
    className = '', isLord = false, isBoss = false,
    weapons = [],
  }) {
    this.name    = name;
    this.faction = faction;
    this.gx      = gx;
    this.gy      = gy;

    this.maxHp = hp;
    this.hp    = hp;
    this.pow   = pow;
    this.mag   = mag;
    this.sp    = sp;
    this.lck   = lck;
    this.def   = def;
    this.mdef  = mdef;
    this.move  = move;

    this.level     = level;
    this.growths   = growths   || { hp: 0, pow: 0, mag: 0, sp: 0, lck: 0, def: 0, mdef: 0 };
    this.moveCosts = moveCosts || MOVE_COST;

    this.color     = color;
    this.symbol    = symbol;
    this.className = className;
    this.isLord    = isLord;
    this.isBoss    = isBoss;
    this.moved     = false;

    this.weapons        = weapons.slice();
    this.equippedWeapon = this.weapons.find(w => !w.isStaff) || this.weapons[0] || null;
    this.statusEffects  = [];
    this.abilities      = abilities.slice();
    this.xp             = 0;   // 0–99; fills to 100 = level-up
  }

  // Award XP; returns { leveled, gained } where gained lists which stats rose.
  awardXP(amount) {
    this.xp += amount;
    if (this.xp >= 100) {
      this.xp -= 100;
      const gained = this.levelUp();
      return { leveled: true, gained };
    }
    return { leveled: false, gained: {} };
  }

  get alive() { return this.hp > 0; }

  // ── Level-up ───────────────────────────────────────────────────────────────
  // Rolls each stat against its growth rate. Returns an object of which stats
  // increased (used by the caller to display a level-up screen).
  levelUp() {
    this.level++;
    const gained = {};
    for (const stat of ['hp', 'pow', 'mag', 'sp', 'lck', 'def', 'mdef']) {
      if (Math.random() * 100 < (this.growths[stat] || 0)) {
        this[stat]++;
        if (stat === 'hp') this.maxHp++;
        gained[stat] = true;
      }
    }
    return gained; // e.g. { hp: true, pow: true }
  }

  // ── Status helpers ─────────────────────────────────────────────────────────
  hasStatus(type) { return this.statusEffects.some(s => s.type === type); }
  addStatus(type) { if (!this.hasStatus(type)) this.statusEffects.push({ type }); }

  // Apply poison DOT at the start of this unit's phase. Returns damage dealt.
  tickPoison() {
    if (!this.hasStatus('poison')) return 0;
    const dmg = 2;
    this.hp -= dmg;
    return dmg;
  }

  // Reduce the equipped weapon's uses by 1; remove it if depleted.
  decrementWeaponUses() {
    const w = this.equippedWeapon;
    if (!w || w.isStaff) return;
    w.uses--;
    if (w.uses <= 0) {
      this.weapons = this.weapons.filter(x => x !== w);
      this.equippedWeapon = this.weapons.find(wr => !wr.isStaff) || this.weapons[0] || null;
    }
  }

  // ── Damage calculation ─────────────────────────────────────────────────────
  // Attack type comes from the equipped weapon (isMagic flag); falls back to
  // stat comparison for weaponless units (enemies).
  // tileDef applies only to physical attacks.
  // Returns { dmg, isMagic, doubles }.
  calcDamage(defender, tileDef = 0, ignoreDefense = false) {
    const w       = this.equippedWeapon;
    const isMagic = w ? !!w.isMagic : this.mag > this.pow;

    // Offensive stat — halved by relevant status debuff
    let atkStat = isMagic ? this.mag : this.pow;
    if ( isMagic && this.hasStatus('poison')) atkStat = Math.floor(atkStat / 2);
    if (!isMagic && this.hasStatus('burn'))   atkStat = Math.floor(atkStat / 2);

    // Enrage passive: below 50% HP doubles offensive stat and effective SP
    const enraged = this.abilities.includes('enrage') && this.hp < this.maxHp / 2;
    if (enraged) atkStat *= 2;

    // Defensive stat — ignoreDefense bypasses MDef (Exalt passive)
    // poison halves defender's Def on physical hits
    let defStat;
    if (isMagic) {
      defStat = ignoreDefense ? 0 : defender.mdef;
    } else {
      const baseDef = (defender.hasStatus && defender.hasStatus('poison'))
        ? Math.floor(defender.def / 2)
        : defender.def;
      defStat = baseDef + tileDef;
    }

    let dmg = Math.max(1, (atkStat + (w ? w.might : 0)) - defStat);

    // Weapon type-effectiveness multiplier (Piercer vs Bulwark, Swift Blade vs axe)
    if (w && w.effect && w.effect.type === 'effective') {
      const fx = w.effect;
      if (fx.vsClass && defender.className === fx.vsClass) {
        dmg = Math.floor(dmg * fx.multiplier);
      } else if (fx.vsWeapon && defender.equippedWeapon && defender.equippedWeapon.type === fx.vsWeapon) {
        dmg = Math.floor(dmg * fx.multiplier);
      }
    }

    const effectiveSP = enraged ? this.sp * 2 : this.sp;
    const doubles = effectiveSP >= defender.sp + 4;
    return { dmg, isMagic, doubles };
  }

  // ── BFS flood-fill for movement range ──────────────────────────────────────
  // Returns a Map<"x,y" -> cost> for all reachable tiles.
  computeMoveRange(grid, units, maxMove = this.move) {
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
        if (newCost > maxMove) continue;

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

  // ── Attack range: all tiles reachable at [minRange, maxRange] from move range ──
  // minRange/maxRange come from the equipped weapon's range field.
  computeAttackRange(moveRange, minRange = 1, maxRange = 1) {
    const atk = new Set();
    for (const key of moveRange.keys()) {
      const [ox, oy] = key.split(',').map(Number);
      for (let ny = 0; ny < MAP_H; ny++) {
        for (let nx = 0; nx < MAP_W; nx++) {
          const dist = Math.abs(nx - ox) + Math.abs(ny - oy);
          if (dist >= minRange && dist <= maxRange) {
            const nk = `${nx},${ny}`;
            if (!moveRange.has(nk)) atk.add(nk);
          }
        }
      }
    }
    return atk;
  }
}
