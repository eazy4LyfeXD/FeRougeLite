// ─── GameMapScene.js ──────────────────────────────────────────────────────────

class GameMapScene extends Phaser.Scene {
  constructor() { super({ key: 'GameMap' }); }

  init(data) {
    this.saveData  = data.saveData;
    this.slotIndex = data.slotIndex;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  create() {
    const floor      = this.saveData.currentLevel;
    const castle     = isCastleFloor(floor);
    // Generate map — castle floors use the structured castle generator
    const mapResult  = castle
      ? MapGen.generateCastle(this.saveData.mapSeed)
      : MapGen.generate(this.saveData.mapSeed);
    const { grid, thronePos, rng } = mapResult;
    this.castleRooms = mapResult.rooms || [];
    this.chestLoot   = new Map();
    this.grid        = grid;
    this.thronePos   = thronePos;
    this.mapRng      = rng;

    // Game state
    this.units         = [];
    this.phase         = PHASE.PLAYER_TURN;
    this.turnNumber    = 1;
    this.selectedUnit  = null;
    this.moveRange     = new Map();   // "x,y" -> cost
    this.attackRange   = new Set();   // "x,y"
    this.cursorX       = 1;
    this.cursorY       = Math.floor(MAP_H / 2);
    this.camX          = 0;
    this.camY          = 0;

    // XP gain animation  { unit, amount, startXP, endXP, displayXP, duration, elapsed, doLevelUp, gained }
    this.xpAnim = null;

    // Action-menu / combat-preview state machine
    // gameState: 'idle'|'selected'|'menu'|'weapon-select'|'items'|'item-action'|'targeting'
    this.gameState      = 'idle';
    this.menuOptions    = [];
    this.menuCursor     = 0;
    this.preActionGx    = 0;
    this.preActionGy    = 0;
    this.forecastTarget = null;
    this.invCursor      = 0;        // cursor in inventory / weapon-select lists
    this.itemActCursor  = 0;        // cursor in item action sub-menu
    this.itemActOptions = [];       // ['USE','DROP'] or ['EQUIP','DROP']

    this.runComplete = false;

    // Gallop (Stud Master) — remaining move points after an action
    this.gallopRemaining = 0;

    // Steal (Pickpocket) — enemy being stolen from and item cursor
    this.stealTarget = null;
    this.stealCursor = 0;

    this.blinkOn   = true;
    this.blinkT    = 0;
    this.statusMsg = `Floor ${this.saveData.currentLevel}`;
    this.statusT   = 2500;
    this.battleLog = [];
    this.logT      = 0;

    // Enemy AI queue
    this.enemyQueue = [];
    this.enemyIdx   = 0;
    this.enemyDelay = 0;

    this._spawnUnits();
    this._computeCamera();

    // Music — use HTML5 Audio directly so file:// protocol and spaces in
    // the filename don't cause Phaser's XHR loader to crash.
    this.bgm = new Audio('Fire Emblem_ Blazing Blade - Companions (Extended).mp3');
    this.bgm.loop   = true;
    this.bgm.volume = 0.6;
    this.bgm.play().catch(() => {});
    this.events.once('shutdown', () => { this.bgm.pause(); this.bgm.currentTime = 0; });

    // Graphics layers
    this.gfxMap    = this.add.graphics().setDepth(0);
    this.gfxRanges = this.add.graphics().setDepth(1);
    this.gfxUnits  = this.add.graphics().setDepth(2);
    this.gfxCursor = this.add.graphics().setDepth(3);
    this.gfxHud    = this.add.graphics().setDepth(4);

    // Text objects (depth 5+)
    this._buildHudText();

    // Input
    this.keys = this.input.keyboard.addKeys({
      up:      Phaser.Input.Keyboard.KeyCodes.UP,
      down:    Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:    Phaser.Input.Keyboard.KeyCodes.LEFT,
      right:   Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w:       Phaser.Input.Keyboard.KeyCodes.W,
      a:       Phaser.Input.Keyboard.KeyCodes.A,
      s:       Phaser.Input.Keyboard.KeyCodes.S,
      d:       Phaser.Input.Keyboard.KeyCodes.D,
      e:       Phaser.Input.Keyboard.KeyCodes.E,
      confirm: Phaser.Input.Keyboard.KeyCodes.X,
      enter:   Phaser.Input.Keyboard.KeyCodes.ENTER,
      cancel:  Phaser.Input.Keyboard.KeyCodes.Z,
      esc:     Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  UNIT SPAWNING
  // ═══════════════════════════════════════════════════════════════════════════
  _spawnUnits() {
    const midY  = Math.floor(MAP_H / 2);
    const ld    = LORD_DEFS[this.saveData.selectedLord];
    const floor = this.saveData.currentLevel;    // 1–MAX_FLOORS
    const fMod  = floor - 1;                     // 0 on floor 1, 29 on floor 30

    // ── Lord ─────────────────────────────────────────────────────────────────
    // Always create from base stats; saved state is layered on top below.
    const lordWeapons = (ld.startingWeapons || []).map(key => makeWeapon(key));
    this.units.push(new Unit({
      name: ld.label, faction: FACTION.PLAYER,
      gx: 1, gy: midY,
      ...ld.stats,
      level: 1, growths: ld.growths, moveCosts: ld.moveCosts,
      className: ld.className,
      color: ld.color, symbol: '♞', isLord: true,
      weapons: lordWeapons,
    }));

    // Restore persisted lord state (set after clearing floor 1+)
    const lord = this.units[0];
    const ps   = this.saveData.playerStats;
    if (ps) {
      lord.maxHp = ps.maxHp;  lord.hp   = ps.hp;
      lord.pow   = ps.pow;    lord.mag  = ps.mag;
      lord.sp    = ps.sp;     lord.lck  = ps.lck;
      lord.def   = ps.def;    lord.mdef = ps.mdef;
      lord.level = ps.level;  lord.xp   = ps.xp || 0;
      if (ps.weapons && ps.weapons.length > 0) {
        lord.weapons = ps.weapons.map(w => {
          const clone = { ...w };
          if (clone.effect) clone.effect = { ...clone.effect };
          return clone;
        });
        // Reset per-floor execute charge
        lord.weapons.forEach(w => {
          if (w.effect?.type === 'execute') w.effect.charges = 1;
        });
        lord.equippedWeapon =
          (ps.equippedIdx >= 0 ? lord.weapons[ps.equippedIdx] : null)
          || lord.weapons.find(w => !w.isStaff && !w.isConsumable)
          || lord.weapons[0] || null;
      }
      if (ps.abilities && ps.abilities.length > 0)
        lord.abilities = [...ps.abilities];
      // Full HP restoration at the start of each new floor
      lord.hp = lord.maxHp;
    }

    // ── Allies (recruited in previous floors) ────────────────────────────────
    const allySpots = [
      { x: 1, y: midY + 1 }, { x: 1, y: midY - 1 },
      { x: 2, y: midY },     { x: 2, y: midY + 1 }, { x: 2, y: midY - 1 },
      { x: 1, y: midY + 2 }, { x: 1, y: midY - 2 },
      { x: 3, y: midY },     { x: 3, y: midY + 1 }, { x: 3, y: midY - 1 },
      { x: 2, y: midY + 2 }, { x: 2, y: midY - 2 },
      { x: 3, y: midY + 2 }, { x: 3, y: midY - 2 },
    ];
    let spotIdx = 0;
    for (const ad of (this.saveData.allies || [])) {
      // Find the next passable, unoccupied spawn spot
      while (spotIdx < allySpots.length) {
        const sp = allySpots[spotIdx];
        if (this._tilePassable(sp.x, sp.y) && !this._unitAt(sp.x, sp.y)) break;
        spotIdx++;
      }
      if (spotIdx >= allySpots.length) break;
      const pos = allySpots[spotIdx++];

      const classKey  = ad.className.toUpperCase().replace(/\s+/g, '_');
      const moveCosts = CLASSES[classKey]?.moveCosts || MOVE_COST;
      const allyWeapons = (ad.weapons || []).map(w => {
        const c = { ...w };
        if (c.effect) c.effect = { ...c.effect };
        if (c.effect?.type === 'execute') c.effect.charges = 1;
        return c;
      });

      const ally = new Unit({
        name: ad.name, className: ad.className, faction: FACTION.PLAYER,
        gx: pos.x, gy: pos.y,
        hp: ad.maxHp, pow: ad.pow, mag: ad.mag,
        sp: ad.sp, lck: ad.lck, def: ad.def, mdef: ad.mdef, move: ad.move,
        level: ad.level || 1, growths: { ...ad.growths }, moveCosts,
        color: ad.color, symbol: ad.symbol || '♟',
        weapons: allyWeapons,
      });
      ally.xp          = ad.xp || 0;
      ally.abilities   = ad.abilities ? [...ad.abilities] : [];
      ally.hp          = Math.min(ad.maxHp, ad.hp + Math.floor(ad.maxHp / 2));
      ally.equippedWeapon =
        (ad.equippedIdx >= 0 ? ally.weapons[ad.equippedIdx] : null)
        || ally.weapons.find(w => !w.isStaff && !w.isConsumable)
        || ally.weapons[0] || null;
      this.units.push(ally);
    }

    // ── Enemies (scaled across 30 floors) ───────────────────────────────────
    const sc = (base, perFloor) => base + Math.round(fMod * perFloor);
    // Weapon tiers advance every 5 floors: Wood→Bronze→Iron→Steel→Ivory→Dragonscale
    const TIERS    = ['WOOD','BRONZE','IRON','STEEL','IVORY','DRAGONSCALE'];
    const tierIdx  = Math.min(5, Math.floor((floor - 1) / 5));
    const tier     = TIERS[tierIdx];
    const bossTier = tier;

    const eTypes = [
      {
        name: 'Grunt',         className: 'Grunt',
        color: 0xc04040, symbol: '♟',
        hp: sc(10,0.70), pow: sc(4,0.25), mag: 0,          sp: sc(3,0.10),
        lck: 2,           def: sc(2,0.20), mdef: sc(1,0.10), move: 4,
        moveCosts: CLASSES.GRUNT.moveCosts,
        weapons: [makeWeapon(`${tier}_LANCE`)],
      },
      {
        name: 'Fletcher',      className: 'Fletcher',
        color: 0xc07030, symbol: '♝',
        hp: sc(9,0.60),  pow: sc(5,0.25), mag: 0,          sp: sc(4,0.10),
        lck: 3,           def: sc(2,0.15), mdef: sc(1,0.10), move: 6,
        moveCosts: CLASSES.FLETCHER.moveCosts,
        weapons: [makeWeapon(`${tier}_SWORD`)],
      },
      {
        name: 'Necromancer',   className: 'Necromancer',
        color: 0x9030c0, symbol: '♜',
        hp: sc(8,0.60),  pow: 2,           mag: sc(4,0.25), sp: sc(3,0.10),
        lck: 4,           def: sc(1,0.12), mdef: sc(3,0.15), move: 5,
        moveCosts: CLASSES.NECROMANCER.moveCosts,
        weapons: [makeWeapon(`${tier}_TOME`)],
      },
      {
        name: 'Vagabond',      className: 'Vagabond',
        color: 0xe08020, symbol: '†',
        hp: sc(8,0.50),  pow: sc(5,0.25), mag: 0,           sp: sc(6,0.25),
        lck: sc(3,0.10), def: sc(2,0.10), mdef: sc(1,0.10), move: 5,
        moveCosts: CLASSES.VAGABOND.moveCosts,
        abilities: ['hi_crit'],
        weapons: [makeWeapon(`${tier}_SWORD`)],
      },
      {
        name: 'Alicorn Rider', className: 'Alicorn Rider',
        color: 0x50b0d0, symbol: '♦',
        hp: sc(9,0.50),  pow: sc(4,0.25), mag: 0,           sp: sc(4,0.25),
        lck: 4,           def: sc(2,0.10), mdef: sc(2,0.12), move: 7,
        moveCosts: CLASSES.ALICORN_RIDER.moveCosts,
        abilities: ['bow_weakness', 'flight'],
        weapons: [makeWeapon(`${tier}_LANCE`)],
      },
      {
        name: 'Ruffian',       className: 'Ruffian',
        color: 0xa05020, symbol: '✠',
        hp: sc(13,0.80), pow: sc(6,0.35), mag: 0,           sp: sc(2,0.08),
        lck: 2,           def: sc(2,0.10), mdef: sc(1,0.08), move: 4,
        moveCosts: CLASSES.RUFFIAN.moveCosts,
        abilities: ['hi_crit'],
        weapons: [makeWeapon(`${tier}_AXE`)],
      },
    ];
    // Scales from 2-3 on floor 1 to ~49-50 on floor 30.
    // Formula: (floor+1) + quadratic booster floor²/50
    const enemyBase  = floor + 1 + Math.floor(floor * floor / 50);
    const enemyCount = enemyBase + this.mapRng.int(0, 1);
    const usedPos = new Set();
    let attempts = 0;
    while (usedPos.size < enemyCount && attempts < 300) {
      attempts++;
      const ex = this.mapRng.int(Math.floor(MAP_W/2)+1, MAP_W-1);
      const ey = this.mapRng.int(1, MAP_H-2);
      const k  = `${ex},${ey}`;
      if (this._tilePassable(ex, ey) && !usedPos.has(k)) {
        usedPos.add(k);
        const et = this.mapRng.pick(eTypes);
        this.units.push(new Unit({ ...et, faction: FACTION.ENEMY, gx: ex, gy: ey, level: floor }));
      }
    }

    // ── Boss (random type, scales faster than regulars) ───────────────────────
    if (this.thronePos && !this._unitAt(this.thronePos.x, this.thronePos.y)) {
      const bossPool = [
        {
          name: 'General',      className: 'Bulwark',
          color: 0xe030e0, symbol: '♚',
          hp: sc(22,1.50), pow: sc(9,0.50), mag: 2,             sp: sc(3,0.12),
          lck: 5,           def: sc(5,0.40), mdef: sc(3,0.10),  move: 3,
          moveCosts: CLASSES.BULWARK.moveCosts,
          weapons: [makeWeapon(`${bossTier}_LANCE`)],
          abilities: [],
        },
        {
          name: 'Blade Master', className: 'Vagabond',
          color: 0xff6020, symbol: '✦',
          hp: sc(16,1.20), pow: sc(10,0.60), mag: 0,            sp: sc(10,0.40),
          lck: sc(6,0.20), def: sc(3,0.20),  mdef: sc(2,0.10), move: 5,
          moveCosts: CLASSES.VAGABOND.moveCosts,
          weapons: [makeWeapon(`${bossTier}_SWORD`)],
          abilities: ['hi_crit'],
        },
        {
          name: 'Archmage',     className: 'Necromancer',
          color: 0x7020c0, symbol: '♜',
          hp: sc(15,1.00), pow: 2,            mag: sc(9,0.50),  sp: sc(5,0.20),
          lck: sc(4,0.15), def: sc(1,0.10),   mdef: sc(7,0.40), move: 4,
          moveCosts: CLASSES.NECROMANCER.moveCosts,
          weapons: [makeWeapon(`${bossTier}_TOME`)],
          abilities: [],
        },
        {
          name: 'Warlord',      className: 'Fletcher',
          color: 0xd08000, symbol: '♞',
          hp: sc(18,1.20), pow: sc(9,0.50),  mag: 0,            sp: sc(7,0.25),
          lck: sc(5,0.15), def: sc(4,0.20),  mdef: sc(3,0.10), move: 6,
          moveCosts: CLASSES.FLETCHER.moveCosts,
          weapons: [makeWeapon(`${bossTier}_SWORD`)],
          abilities: [],
        },
      ];
      const bt = this.mapRng.pick(bossPool);
      this.units.push(new Unit({
        ...bt, faction: FACTION.ENEMY, isBoss: true,
        gx: this.thronePos.x, gy: this.thronePos.y,
        level: floor + 2,
      }));
    }

    // ── Castle floors: spawn door guards and chest room guards ────────────────
    if (isCastleFloor(floor)) this._spawnCastleGuards(tier);

  }

  // ── Castle-specific guard spawning ───────────────────────────────────────────
  // Each room gets one door guard (adjacent to door, carries DOOR_KEY) and
  // one chest guard inside the room (carries CHEST_KEY, opens 2 chests).
  _spawnCastleGuards(tier) {
    const floor = this.saveData.currentLevel;
    const fMod  = floor - 1;
    const sc    = (base, pp) => base + Math.round(fMod * pp);
    const TIERS = ['WOOD','BRONZE','IRON','STEEL','IVORY','DRAGONSCALE'];
    const guardTypes = [
      { name:'Gate Guard', className:'Grunt',   color:0xb03030, symbol:'♟',
        hp:sc(11,0.70), pow:sc(5,0.25), sp:sc(3,0.10), def:sc(2,0.20), mdef:sc(1,0.10), move:4,
        moveCosts:CLASSES.GRUNT.moveCosts, weapons:[makeWeapon(`${tier}_LANCE`)] },
      { name:'Ruffian',    className:'Ruffian', color:0xa05020, symbol:'✠',
        hp:sc(14,0.80), pow:sc(6,0.35), sp:sc(2,0.08), def:sc(2,0.10), mdef:sc(1,0.08), move:4,
        moveCosts:CLASSES.RUFFIAN.moveCosts, abilities:['hi_crit'], weapons:[makeWeapon(`${tier}_AXE`)] },
    ];

    for (const room of this.castleRooms) {
      // Seed the chest loot for every chest in this room
      for (const ch of room.chests) {
        this.chestLoot.set(`${ch.x},${ch.y}`, this._rollChestLoot(floor));
      }

      // Door guard — spawn on the corridor tile adjacent to the door
      const corridorY = this.grid[room.doorY - 1]?.[room.doorX] === TILE.PLAIN
        ? room.doorY - 1
        : room.doorY + 1;
      const doorGuardPos = this._findNearbyPassable(room.doorX, corridorY);
      if (doorGuardPos) {
        const tpl = this.mapRng.pick(guardTypes);
        const guard = new Unit({
          ...tpl, faction: FACTION.ENEMY,
          gx: doorGuardPos.x, gy: doorGuardPos.y,
          level: floor, mag: 0, lck: 2,
          weapons: [...tpl.weapons, makeWeapon('DOOR_KEY')],
          abilities: tpl.abilities ? [...tpl.abilities] : [],
        });
        this.units.push(guard);
      }

      // Chest guard — spawn inside the room on any plain tile
      const chestGuardPos = this._findNearbyPassable(room.doorX, room.doorY > 5 ? room.doorY + 2 : room.doorY - 2);
      if (chestGuardPos) {
        const tpl = this.mapRng.pick(guardTypes);
        const guard = new Unit({
          ...tpl, faction: FACTION.ENEMY,
          gx: chestGuardPos.x, gy: chestGuardPos.y,
          level: floor, mag: 0, lck: 2,
          weapons: [...tpl.weapons, makeWeapon('CHEST_KEY')],
          abilities: tpl.abilities ? [...tpl.abilities] : [],
        });
        this.units.push(guard);
      }
    }
  }

  // Find the nearest passable unoccupied tile within 3 steps of (x,y)
  _findNearbyPassable(x, y) {
    for (let r = 0; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this._tilePassable(nx, ny) && !this._unitAt(nx, ny))
            return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  // Generate a random loot item appropriate to the current floor
  _rollChestLoot(floor) {
    const TIERS  = ['WOOD','BRONZE','IRON','STEEL','IVORY','DRAGONSCALE'];
    const tier   = TIERS[Math.min(5, Math.floor((floor - 1) / 5))];
    const types  = ['SWORD','LANCE','AXE','BOW'];
    const elems  = ['BLAZE','FROST','POISON','SPARK'];
    const roll   = Math.random();
    if (roll < 0.25) {
      // Elemental weapon
      return makeWeapon(`${this.mapRng.pick(elems)}_${this.mapRng.pick(types)}`);
    } else if (roll < 0.55) {
      // Tier weapon
      return makeWeapon(`${tier}_${this.mapRng.pick(types)}`);
    } else if (roll < 0.75) {
      return makeWeapon('HEALING_POTION');
    } else {
      // Higher-tier weapon as bonus
      const bonusTier = TIERS[Math.min(5, Math.floor((floor - 1) / 5) + 1)];
      return makeWeapon(`${bonusTier}_${this.mapRng.pick(types)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INPUT
  // ═══════════════════════════════════════════════════════════════════════════
  _handleInput() {
    const jd = k => Phaser.Input.Keyboard.JustDown(k);

    if (this.phase === PHASE.GAME_OVER || this.phase === PHASE.VICTORY) {
      if (jd(this.keys.confirm) || jd(this.keys.enter) || jd(this.keys.cancel)) {
        if (this.phase === PHASE.VICTORY && !this.runComplete) {
          this.scene.start('FloorReward', { saveData: this.saveData, slotIndex: this.slotIndex });
        } else {
          this.scene.start('MainMenu');
        }
      }
      return;
    }

    // Status screen — available in any phase (not during menus to avoid confusion)
    if (jd(this.keys.e) && this.gameState !== 'menu') {
      const inspected = this._unitAt(this.cursorX, this.cursorY);
      if (inspected) {
        this.scene.launch('Status', { unit: inspected, callerKey: 'GameMap' });
        this.scene.pause();
        return;
      }
    }

    if (this.phase === PHASE.ENEMY_TURN) return;

    // All list-mode states intercept Up/Down for navigation
    if (['menu', 'weapon-select', 'items', 'item-action', 'steal-pick'].includes(this.gameState)) {
      if (jd(this.keys.up)   || jd(this.keys.w)) this._listNavigate(-1);
      if (jd(this.keys.down) || jd(this.keys.s)) this._listNavigate(1);
      if (jd(this.keys.confirm) || jd(this.keys.enter)) this._onConfirm();
      if (jd(this.keys.cancel)  || jd(this.keys.esc))   this._onCancel();
      // In inventory, E opens the item description overlay
      if (this.gameState === 'items' && jd(this.keys.e)) {
        const items = this.selectedUnit?.weapons || [];
        if (items.length > 0) {
          this.scene.launch('Status', {
            unit: this.selectedUnit, callerKey: 'GameMap',
            startView: 'item', startItemCursor: this.invCursor,
          });
          this.scene.pause();
        }
      }
      return;
    }

    // Normal cursor movement
    if (jd(this.keys.up)    || jd(this.keys.w)) this._moveCursor(0, -1);
    if (jd(this.keys.down)  || jd(this.keys.s)) this._moveCursor(0,  1);
    if (jd(this.keys.left)  || jd(this.keys.a)) this._moveCursor(-1, 0);
    if (jd(this.keys.right) || jd(this.keys.d)) this._moveCursor(1,  0);
    if (jd(this.keys.confirm) || jd(this.keys.enter)) this._onConfirm();
    if (jd(this.keys.cancel)  || jd(this.keys.esc))   this._onCancel();

    // Update combat/execute preview when the cursor moves
    if (this.gameState === 'targeting') {
      const t = this._unitAt(this.cursorX, this.cursorY);
      this.forecastTarget = (t && t.faction === FACTION.ENEMY &&
                             this.attackRange.has(`${this.cursorX},${this.cursorY}`))
        ? t : null;
    }
    if (this.gameState === 'execute') {
      const t = this._unitAt(this.cursorX, this.cursorY);
      this.forecastTarget = (t && t.faction === FACTION.ENEMY && !t.isBoss &&
                             this.attackRange.has(`${this.cursorX},${this.cursorY}`))
        ? t : null;
    }
    if (this.gameState === 'converse') {
      const t = this._unitAt(this.cursorX, this.cursorY);
      this.forecastTarget = (t && t.faction === FACTION.ENEMY && !t.isBoss &&
                             this.attackRange.has(`${this.cursorX},${this.cursorY}`))
        ? t : null;
    }
  }

  _moveCursor(dx, dy) {
    this.cursorX = Math.max(0, Math.min(MAP_W-1, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(MAP_H-1, this.cursorY + dy));
    this._computeCamera();
  }

  _onConfirm() {
    const u   = this._unitAt(this.cursorX, this.cursorY);
    const key = `${this.cursorX},${this.cursorY}`;

    switch (this.gameState) {
      case 'idle':
        if (u && u.faction === FACTION.PLAYER && !u.moved) {
          this.selectedUnit = u;
          this.moveRange    = u.computeMoveRange(this.grid, this.units);
          const [minR, maxR] = this._weaponRange(u);
          this.attackRange  = u.computeAttackRange(this.moveRange, minR, maxR);
          this.gameState    = 'selected';
        }
        break;

      case 'selected':
        // Switch to a different ready player unit
        if (u && u.faction === FACTION.PLAYER && !u.moved && u !== this.selectedUnit) {
          this.selectedUnit = u;
          this.moveRange    = u.computeMoveRange(this.grid, this.units);
          const [minR0, maxR0] = this._weaponRange(u);
          this.attackRange  = u.computeAttackRange(this.moveRange, minR0, maxR0);
          break;
        }
        // Move to tile (or stay in place) → open action menu
        if (this.moveRange.has(key) && (!u || u === this.selectedUnit)) {
          // Track unused move points for Gallop
          this.gallopRemaining = this.selectedUnit.move - (this.moveRange.get(key) || 0);
          this.preActionGx = this.selectedUnit.gx;
          this.preActionGy = this.selectedUnit.gy;
          this.selectedUnit.gx = this.cursorX;
          this.selectedUnit.gy = this.cursorY;
          const pos = new Map([[key, 0]]);
          this.moveRange   = pos;
          const [minR1, maxR1] = this._weaponRange(this.selectedUnit);
          this.attackRange = this.selectedUnit.computeAttackRange(pos, minR1, maxR1);
          this._openMenu();
        }
        break;

      case 'menu':
        this._confirmMenuOption();
        break;

      case 'weapon-select': {
        const cw = this._getCombatWeapons();
        if (cw[this.invCursor]) this.selectedUnit.equippedWeapon = cw[this.invCursor];
        this._enterTargeting();
        break;
      }

      case 'items': {
        const item = (this.selectedUnit?.weapons || [])[this.invCursor];
        if (item) {
          this.itemActOptions = item.isConsumable
          ? ['USE', 'DROP']
          : (item.isStaff && item.healAmount ? ['USE', 'EQUIP', 'DROP'] : ['EQUIP', 'DROP']);
          this.itemActCursor  = 0;
          this.gameState      = 'item-action';
        }
        break;
      }

      case 'item-action':
        this._confirmItemAction();
        break;

      case 'execute':
        if (u && u.faction === FACTION.ENEMY && !u.isBoss &&
            this.attackRange.has(key)) {
          this._doExecute(this.selectedUnit, u);
        }
        break;

      case 'targeting':
        if (u && u.faction === FACTION.ENEMY && this.attackRange.has(key)) {
          this._doAttack(this.selectedUnit, u);
        }
        break;

      case 'converse':
        if (u && u.faction === FACTION.ENEMY && !u.isBoss &&
            this.attackRange.has(key)) {
          this._doConverse(u);
        }
        break;

      case 'gallop':
        // Confirm on any tile in the gallop range (or stay in place) to reposition
        if (this.moveRange.has(key) && (!u || u === this.selectedUnit)) {
          this.selectedUnit.gx = this.cursorX;
          this.selectedUnit.gy = this.cursorY;
          this.selectedUnit.moved = true;
          this._resetSelection();
        }
        break;

      case 'steal-target':
        if (u && u.faction === FACTION.ENEMY && (u.weapons || []).length > 0 &&
            this.attackRange.has(key)) {
          this.stealTarget = u;
          this.stealCursor = 0;
          this.gameState   = 'steal-pick';
        }
        break;

      case 'steal-pick': {
        const stolen = (this.stealTarget?.weapons || [])[this.stealCursor];
        if (stolen) this._doSteal(stolen);
        break;
      }
    }
  }

  _onCancel() {
    switch (this.gameState) {
      case 'selected':
        this._resetSelection();
        break;
      case 'menu':
        // Undo the move — restore unit to pre-move position
        this.selectedUnit.gx = this.preActionGx;
        this.selectedUnit.gy = this.preActionGy;
        this.moveRange   = this.selectedUnit.computeMoveRange(this.grid, this.units);
        this.attackRange = this.selectedUnit.computeAttackRange(this.moveRange);
        this.gameState   = 'selected';
        break;
      case 'weapon-select':
        this._openMenu();
        break;
      case 'items':
        this._openMenu();
        break;
      case 'item-action':
        this.gameState     = 'items';
        this.itemActCursor = 0;
        break;
      case 'execute':
        this.forecastTarget = null;
        this._openMenu();
        break;
      case 'targeting':
        this.forecastTarget = null;
        this._openMenu();
        break;
      case 'converse':
        this.forecastTarget = null;
        this._openMenu();
        break;
      case 'gallop':
        // Skip remaining gallop movement — end the turn
        this.selectedUnit.moved = true;
        this._resetSelection();
        break;
      case 'steal-target':
      case 'steal-pick':
        this.stealTarget = null;
        this.stealCursor = 0;
        this._openMenu();
        break;
      default:
        this._resetSelection();
        break;
    }
  }

  _openMenu() {
    const inRange = u =>
      u.faction === FACTION.ENEMY && u.alive && this.attackRange.has(`${u.gx},${u.gy}`);
    const hasTarget  = this.units.some(inRange);
    const hasExecute = this._hasExecuteCharge() &&
                       this.units.some(u => inRange(u) && !u.isBoss);
    const hasSteal   = this.selectedUnit?.className === 'Pickpocket' &&
                       this._getStealableTargets().length > 0;
    const hasTalk     = this.selectedUnit?.isLord && this._getTalkTarget() !== null;
    const hasConverse = this.selectedUnit?.isLord &&
                        this.units.some(u => u.faction === FACTION.ENEMY && u.alive &&
                                             !u.isBoss && this.attackRange.has(`${u.gx},${u.gy}`));
    const hasItems    = (this.selectedUnit?.weapons || []).length > 0;
    const hasOpenDoor = this._adjacentCastleTile(TILE.DOOR)  !== null && this._hasKeyOrPick('door');
    const hasOpenChest= this._adjacentCastleTile(TILE.CHEST) !== null && this._hasKeyOrPick('chest');
    this.menuOptions = [
      ...(hasTarget    ? ['ATTACK']    : []),
      ...(hasExecute   ? ['EXECUTE']   : []),
      ...(hasSteal     ? ['STEAL']     : []),
      ...(hasTalk      ? ['TALK']      : []),
      ...(hasConverse  ? ['CONVERSE']  : []),
      ...(hasOpenDoor  ? ['OPEN DOOR'] : []),
      ...(hasOpenChest ? ['OPEN CHEST']: []),
      ...(hasItems     ? ['ITEMS']     : []),
      'WAIT',
    ];
    this.menuCursor = 0;
    this.gameState  = 'menu';
  }

  // Returns the position of the first adjacent tile of the given type, or null
  _adjacentCastleTile(tileType) {
    if (!this.selectedUnit) return null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = this.selectedUnit.gx + dx, ny = this.selectedUnit.gy + dy;
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && this.grid[ny][nx] === tileType)
        return { x: nx, y: ny };
    }
    return null;
  }

  // True if the unit can open a door or chest (has matching key item, or has lockpick)
  _hasKeyOrPick(keyType) {
    const u = this.selectedUnit;
    if (!u) return false;
    if (u.abilities?.includes('lockpick')) return true;
    return (u.weapons || []).some(w => w.isKey && w.keyType === keyType && w.uses > 0);
  }

  // True if any weapon in inventory carries an unconsumed execute charge
  _hasExecuteCharge() {
    return (this.selectedUnit?.weapons || []).some(
      w => w.effect?.type === 'execute' && (w.effect.charges ?? 0) > 0
    );
  }

  _confirmMenuOption() {
    const opt = this.menuOptions[this.menuCursor];
    if (opt === 'ATTACK') {
      const cw = this._getCombatWeapons();
      if (cw.length > 1) {
        this.invCursor = Math.max(0, cw.indexOf(this.selectedUnit.equippedWeapon));
        this.gameState = 'weapon-select';
      } else {
        this._enterTargeting();
      }
    } else if (opt === 'EXECUTE') {
      this._enterExecute();
    } else if (opt === 'STEAL') {
      this._enterStealTarget();
    } else if (opt === 'TALK') {
      this._doTalk();
    } else if (opt === 'CONVERSE') {
      this._enterConverse();
    } else if (opt === 'OPEN DOOR') {
      this._doOpenDoor();
    } else if (opt === 'OPEN CHEST') {
      this._doOpenChest();
    } else if (opt === 'ITEMS') {
      this.invCursor = 0;
      this.gameState = 'items';
    } else {
      // WAIT
      this.selectedUnit.moved = true;
      this._resetSelection();
    }
  }

  // ── Castle interaction ────────────────────────────────────────────────────────
  _doOpenDoor() {
    const pos = this._adjacentCastleTile(TILE.DOOR);
    if (!pos) return;
    this.grid[pos.y][pos.x] = TILE.PLAIN;
    this._consumeKey('door');
    this.battleLog = [`${this.selectedUnit.name} opened the door!`];
    this.logT = 2000;
    this._finalizeAction(this.selectedUnit);
  }

  _doOpenChest() {
    const pos = this._adjacentCastleTile(TILE.CHEST);
    if (!pos) return;
    const loot = this.chestLoot.get(`${pos.x},${pos.y}`);
    this.grid[pos.y][pos.x] = TILE.PLAIN;
    this.chestLoot.delete(`${pos.x},${pos.y}`);
    this._consumeKey('chest');
    if (loot) {
      this.selectedUnit.weapons.push(loot);
      this.battleLog = [`${this.selectedUnit.name} found ${loot.name}!`];
    } else {
      this.battleLog = [`${this.selectedUnit.name} opened an empty chest.`];
    }
    this.logT = 2000;
    this._finalizeAction(this.selectedUnit);
  }

  // Consume one use of the relevant key (door or chest). Lockpick skips consumption.
  _consumeKey(keyType) {
    if (this.selectedUnit?.abilities?.includes('lockpick')) return;
    const key = (this.selectedUnit?.weapons || []).find(
      w => w.isKey && w.keyType === keyType && w.uses > 0
    );
    if (!key) return;
    key.uses--;
    if (key.uses <= 0) {
      this.selectedUnit.weapons = this.selectedUnit.weapons.filter(w => w !== key);
      if (this.selectedUnit.equippedWeapon === key)
        this.selectedUnit.equippedWeapon = this.selectedUnit.weapons.find(w => !w.isStaff && !w.isConsumable) || null;
    }
  }

  // Combat preview data used by the forecast panel
  _calcForecast(atk, def) {
    const tDef  = TILE_DEF[this.grid[def.gy][def.gx]];
    const tADef = TILE_DEF[this.grid[atk.gy][atk.gx]];
    const aw = atk.equippedWeapon;
    const dw = def.equippedWeapon;

    const { dmg: atkDmg, doubles: atkDoubles } = atk.calcDamage(def, tDef);
    const atkHits    = atkDoubles ? 2 : 1;
    const atkHit     = Math.min(100, Math.max(0,
      (aw ? aw.hit : 80) + atk.lck - def.sp * 2));
    const atkCrit    = (aw ? (aw.crit || 0) : 0) + (atk.abilities.includes('hi_crit') ? 20 : 0);

    const dist = Math.abs(atk.gx - def.gx) + Math.abs(atk.gy - def.gy);
    const [defMinR, defMaxR] = this._weaponRange(def);
    const canCounter = dist >= defMinR && dist <= defMaxR;
    let defDmg = 0, defHit = 0, defHits = 0, defCrit = 0;
    if (canCounter) {
      const { dmg: cd } = def.calcDamage(atk, tADef);
      defDmg  = cd;
      defHit  = Math.min(100, Math.max(0,
        (dw ? dw.hit : 80) + def.lck - atk.sp * 2));
      defHits = 1;
      defCrit = dw ? dw.crit : 0;
    }
    return { atkDmg, atkHit, atkHits, atkCrit, defDmg, defHit, defHits, defCrit, canCounter };
  }

  _resetSelection() {
    this.selectedUnit   = null;
    this.moveRange      = new Map();
    this.attackRange    = new Set();
    this.forecastTarget = null;
    this.gameState      = 'idle';
    this.menuOptions    = [];
    this.menuCursor     = 0;
    this.invCursor      = 0;
    this.itemActCursor  = 0;
    this.itemActOptions = [];
    this.stealTarget    = null;
    this.stealCursor    = 0;
  }

  // ── Inventory helpers ──────────────────────────────────────────────────────

  // Navigate any list-mode cursor by delta (-1 or +1)
  _listNavigate(dir) {
    const len = this._currentListLength();
    if (len === 0) return;
    const key = this._cursorKey();
    this[key] = Math.max(0, Math.min(len - 1, this[key] + dir));
  }

  _cursorKey() {
    if (this.gameState === 'item-action') return 'itemActCursor';
    if (this.gameState === 'menu')        return 'menuCursor';
    if (this.gameState === 'steal-pick')  return 'stealCursor';
    return 'invCursor';   // weapon-select, items
  }

  _currentListLength() {
    if (this.gameState === 'menu')          return this.menuOptions.length;
    if (this.gameState === 'weapon-select') return this._getCombatWeapons().length;
    if (this.gameState === 'items')         return (this.selectedUnit?.weapons || []).length;
    if (this.gameState === 'item-action')   return this.itemActOptions.length;
    if (this.gameState === 'steal-pick')    return (this.stealTarget?.weapons || []).length;
    return 0;
  }

  // Weapons the unit can equip for combat (not staves, not consumables)
  _getCombatWeapons() {
    return (this.selectedUnit?.weapons || []).filter(w => !w.isStaff && !w.isConsumable);
  }

  // Short display type for a weapon (used in the weapon-select panel)
  _weaponTypeAbbr(w) {
    const map = { sword:'Sw', lance:'Ln', axe:'Ax', bow:'Bw', tome:'Tm', dark:'Dk', staff:'St', consumable:'It' };
    return map[w.type] || '--';
  }

  // Total attack power a unit deals with a specific weapon
  _weaponAtk(unit, w) {
    return (w.isMagic ? unit.mag : unit.pow) + (w.might || 0);
  }

  // Enter execute targeting — cursor snaps to nearest non-boss enemy
  _enterExecute() {
    this.gameState      = 'execute';
    this.forecastTarget = null;
    let nearest = null, bestD = 9999;
    for (const u of this.units) {
      if (u.faction === FACTION.ENEMY && u.alive && !u.isBoss &&
          this.attackRange.has(`${u.gx},${u.gy}`)) {
        const d = Math.abs(u.gx - this.selectedUnit.gx) +
                  Math.abs(u.gy - this.selectedUnit.gy);
        if (d < bestD) { bestD = d; nearest = u; }
      }
    }
    if (nearest) {
      this.cursorX = nearest.gx;
      this.cursorY = nearest.gy;
      this._computeCamera();
      this.forecastTarget = nearest;
    }
  }

  // Instant-kill a non-boss enemy, consume one execute charge, award XP
  _doExecute(attacker, defender) {
    // Consume one charge from the first execute weapon found
    const execW = attacker.weapons.find(
      w => w.effect?.type === 'execute' && (w.effect.charges ?? 0) > 0
    );
    if (execW) execW.effect.charges--;

    // Instant kill
    defender.hp = 0;

    this.battleLog = [`${attacker.name} EXECUTED ${defender.name}!`];
    this.logT = 2500;

    // Award XP (same formula as _doAttack)
    const floor   = this.saveData.currentLevel;
    const xpAmt   = Math.max(5, Math.round(
      40 * Math.pow(0.9, attacker.level - 1) * (1 + (floor - 1) * 0.15)
    ));
    const startXP = attacker.xp;
    const result  = attacker.awardXP(xpAmt);
    this.xpAnim   = {
      unit: attacker, amount: xpAmt, startXP,
      endXP:     result.leveled ? 100 : attacker.xp,
      displayXP: startXP,
      duration:  1100, elapsed: 0,
      doLevelUp: result.leveled, gained: result.gained,
    };

    this._removeDead();
    this._checkEndCondition();
    this._finalizeAction(attacker);
  }

  // Enter targeting mode and auto-snap cursor to nearest attackable enemy
  _enterTargeting() {
    // Recompute attack range in case the equipped weapon changed in weapon-select
    const [minR, maxR] = this._weaponRange(this.selectedUnit);
    this.attackRange = this.selectedUnit.computeAttackRange(this.moveRange, minR, maxR);
    this.gameState      = 'targeting';
    this.forecastTarget = null;
    let nearest = null, bestD = 9999;
    for (const u of this.units) {
      if (u.faction === FACTION.ENEMY && u.alive &&
          this.attackRange.has(`${u.gx},${u.gy}`)) {
        const d = Math.abs(u.gx - this.selectedUnit.gx) +
                  Math.abs(u.gy - this.selectedUnit.gy);
        if (d < bestD) { bestD = d; nearest = u; }
      }
    }
    if (nearest) {
      this.cursorX = nearest.gx;
      this.cursorY = nearest.gy;
      this._computeCamera();
      this.forecastTarget = nearest;
    }
  }

  // ── Talk (lord recruits adjacent neutral unit) ───────────────────────────────
  _getTalkTarget() {
    if (!this.selectedUnit) return null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const u = this._unitAt(this.selectedUnit.gx + dx, this.selectedUnit.gy + dy);
      if (u && u.faction === FACTION.NEUTRAL && u.isRecruitable) return u;
    }
    return null;
  }

  _doTalk() {
    const target = this._getTalkTarget();
    if (!target) return;
    target.faction      = FACTION.PLAYER;
    target.isRecruitable = false;
    target.moved        = true;   // can't act the turn they join
    this.battleLog = [`${target.name} joined the party!`];
    this.logT = 2500;
    this._finalizeAction(this.selectedUnit);
  }

  // ── Converse (lord persuades an adjacent enemy to switch sides) ──────────────
  _enterConverse() {
    this.gameState      = 'converse';
    this.forecastTarget = null;
    let nearest = null, bestD = 9999;
    for (const u of this.units) {
      if (u.faction === FACTION.ENEMY && u.alive && !u.isBoss &&
          this.attackRange.has(`${u.gx},${u.gy}`)) {
        const d = Math.abs(u.gx - this.selectedUnit.gx) +
                  Math.abs(u.gy - this.selectedUnit.gy);
        if (d < bestD) { bestD = d; nearest = u; }
      }
    }
    if (nearest) {
      this.cursorX = nearest.gx;
      this.cursorY = nearest.gy;
      this._computeCamera();
      this.forecastTarget = nearest;
    }
  }

  _doConverse(target) {
    if (Math.random() < 0.33) {
      target.faction = FACTION.PLAYER;
      target.moved   = true;
      this.battleLog = [`${target.name} joined the party!`];
    } else {
      this.battleLog = [`${target.name} wouldn't listen...`];
    }
    this.logT = 2500;
    this._finalizeAction(this.selectedUnit);
  }

  // ── Gallop (Stud Master) ──────────────────────────────────────────────────────
  // Called after every action. Grants the Stud Master a second move with
  // remaining movement points; all other units end their turn immediately.
  _finalizeAction(unit) {
    if (this.phase !== PHASE.PLAYER_TURN || unit.faction !== FACTION.PLAYER) {
      unit.moved = true;
      this._resetSelection();
      return;
    }
    if (unit.className === 'Stud Master' && this.gallopRemaining > 0) {
      this._enterGallop(unit);
    } else {
      unit.moved = true;
      this._resetSelection();
    }
  }

  _enterGallop(unit) {
    this.selectedUnit = unit;
    // Recompute move range limited to unused movement points
    this.moveRange   = unit.computeMoveRange(this.grid, this.units, this.gallopRemaining);
    this.attackRange = new Set();
    this.gameState   = 'gallop';
    this.cursorX     = unit.gx;
    this.cursorY     = unit.gy;
    this._computeCamera();
  }

  // ── Steal (Pickpocket) ────────────────────────────────────────────────────────
  _getStealableTargets() {
    return this.units.filter(u =>
      u.faction === FACTION.ENEMY && u.alive &&
      (u.weapons || []).length > 0 &&
      this.attackRange.has(`${u.gx},${u.gy}`)
    );
  }

  _enterStealTarget() {
    const targets = this._getStealableTargets();
    if (targets.length === 0) return;

    // Snap cursor to nearest valid target
    let nearest = targets[0], bestD = 9999;
    for (const u of targets) {
      const d = Math.abs(u.gx - this.selectedUnit.gx) + Math.abs(u.gy - this.selectedUnit.gy);
      if (d < bestD) { bestD = d; nearest = u; }
    }
    this.stealTarget = nearest;
    this.stealCursor = 0;

    if (targets.length === 1) {
      // Only one target — skip targeting cursor, go straight to item list
      this.gameState = 'steal-pick';
    } else {
      this.cursorX   = nearest.gx;
      this.cursorY   = nearest.gy;
      this._computeCamera();
      this.gameState = 'steal-target';
    }
  }

  _doSteal(item) {
    this.stealTarget.weapons = this.stealTarget.weapons.filter(w => w !== item);
    if (this.stealTarget.equippedWeapon === item) {
      this.stealTarget.equippedWeapon =
        this.stealTarget.weapons.find(w => !w.isStaff && !w.isConsumable)
        || this.stealTarget.weapons[0] || null;
    }
    this.selectedUnit.weapons.push(item);

    this.battleLog = [`${this.selectedUnit.name} stole ${item.name}!`];
    this.logT = 2500;
    this._finalizeAction(this.selectedUnit);
  }

  // Execute the selected action in the item-action sub-menu
  _confirmItemAction() {
    const items = this.selectedUnit?.weapons || [];
    const item  = items[this.invCursor];
    if (!item) return;
    const opt = this.itemActOptions[this.itemActCursor];

    if (opt === 'USE' && item.isConsumable) {
      if (item.healAmount) {
        this.selectedUnit.hp = Math.min(
          this.selectedUnit.maxHp, this.selectedUnit.hp + item.healAmount);
      }
      item.uses--;
      if (item.uses <= 0) {
        this.selectedUnit.weapons = items.filter(w => w !== item);
        if (this.selectedUnit.equippedWeapon === item) {
          this.selectedUnit.equippedWeapon =
            this.selectedUnit.weapons.find(w => !w.isStaff && !w.isConsumable)
            || this.selectedUnit.weapons[0] || null;
        }
      }
      this.battleLog = [`${this.selectedUnit.name}: used ${item.name}`];
      this.logT = 1800;
      this._finalizeAction(this.selectedUnit);

    } else if (opt === 'USE' && item.isStaff && item.healAmount) {
      this.selectedUnit.hp = Math.min(
        this.selectedUnit.maxHp, this.selectedUnit.hp + item.healAmount);
      // Cleanse passive: remove all status effects from the healed target
      if (this.selectedUnit.abilities?.includes('cleanse')) {
        this.selectedUnit.statusEffects = [];
      }
      item.uses--;
      if (item.uses <= 0) {
        this.selectedUnit.weapons = items.filter(w => w !== item);
        if (this.selectedUnit.equippedWeapon === item) {
          this.selectedUnit.equippedWeapon =
            this.selectedUnit.weapons.find(w => !w.isStaff && !w.isConsumable)
            || this.selectedUnit.weapons[0] || null;
        }
      }
      this.battleLog = [`${this.selectedUnit.name}: ${item.name} +${item.healAmount}HP`];
      this.logT = 1800;
      this._finalizeAction(this.selectedUnit);

    } else if (opt === 'EQUIP') {
      this.selectedUnit.equippedWeapon = item;
      // Recompute attack range for the newly equipped weapon's range
      const [minR, maxR] = this._weaponRange(this.selectedUnit);
      this.attackRange = this.selectedUnit.computeAttackRange(this.moveRange, minR, maxR);
      this.itemActCursor = 0;
      this._openMenu();

    } else if (opt === 'DROP') {
      this.selectedUnit.weapons = items.filter(w => w !== item);
      if (this.selectedUnit.equippedWeapon === item) {
        this.selectedUnit.equippedWeapon =
          this.selectedUnit.weapons.find(w => !w.isStaff && !w.isConsumable)
          || this.selectedUnit.weapons[0] || null;
      }
      this.invCursor     = Math.min(this.invCursor, Math.max(0, this.selectedUnit.weapons.length - 1));
      this.itemActCursor = 0;
      this.gameState     = this.selectedUnit.weapons.length > 0 ? 'items' : 'menu';
    }
  }

  // Bounding rect for the inventory popup (items / item-action states only)
  _invRect() {
    if (!this.selectedUnit) return { x: 16, y: 16, w: 480, h: 80 };
    const { x: sx, y: sy } = this._screenPos(this.selectedUnit.gx, this.selectedUnit.gy);
    const list = this.selectedUnit.weapons || [];
    const w = 480, h = Math.max(1, list.length) * 48 + 24;
    let x = sx + TILE_S + 4;
    if (x + w > GAME_W) x = sx - w - 4;
    let y = sy - 8;
    if (y + h > GAME_H - UI_H) y = GAME_H - UI_H - h - 8;
    return { x: Math.max(0, x), y: Math.max(0, y), w, h };
  }

  // Bounding rect for the item-action sub-menu (appears beside the selected row)
  _itemActRect(inv) {
    const w = 200, h = this.itemActOptions.length * 48 + 24;
    let x = inv.x + inv.w + 4;
    if (x + w > GAME_W) x = inv.x - w - 4;
    const y = Math.min(inv.y + 12 + this.invCursor * 48, Math.max(0, GAME_H - UI_H - h - 8));
    return { x: Math.max(0, x), y, w, h };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMBAT
  // ═══════════════════════════════════════════════════════════════════════════
  _doAttack(attacker, defender) {
    const tDef = TILE_DEF[this.grid[defender.gy][defender.gx]];

    // Exalt — Astronomer passive: 1/12 chance to ignore enemy MDef on magic attacks
    const exalt = attacker.className === 'Astronomer' && Math.random() < 1 / 12;
    const { dmg, doubles } = attacker.calcDamage(defender, tDef, exalt);

    // Resolve attacker's weapon here so crit + on-hit effects can both use it
    const aw = attacker.equippedWeapon;

    // Crit chance: weapon base + Hi-Crit passive bonus
    const critChance = (aw ? (aw.crit || 0) : 0) +
                       (attacker.abilities.includes('hi_crit') ? 20 : 0);

    // Apply attacker hits; track count, total damage, and whether a crit fired
    let hitCount = 0, totalAtkDmg = 0, didCrit = false;
    const applyHit = () => {
      if (!defender.alive) return;
      const isCrit = critChance > 0 && Math.random() * 100 < critChance;
      const hitDmg = isCrit ? dmg * 3 : dmg;
      if (isCrit) didCrit = true;
      defender.hp -= hitDmg;
      totalAtkDmg += hitDmg;
      hitCount++;
    };

    applyHit();                                                        // first hit (always)
    if (doubles && defender.alive) applyHit();                         // speed double

    // Double Hit passive: 30% proc per speed-based hit
    if (attacker.abilities?.includes('double_hit')) {
      if (defender.alive && Math.random() < 0.3)                  applyHit();
      if (doubles && defender.alive && Math.random() < 0.3)        applyHit();
    }

    // Lifesteal passive: heal 1/8 of total damage inflicted (before counter)
    const lifeHeal = attacker.abilities?.includes('lifesteal')
      ? Math.floor(totalAtkDmg / 8) : 0;
    if (lifeHeal > 0) attacker.hp = Math.min(attacker.maxHp, attacker.hp + lifeHeal);

    let logLine = `${attacker.name} → ${defender.name}: ${dmg} dmg`;
    if (exalt)         logLine += ' [EXALT]';
    if (didCrit)       logLine += ' [CRIT]';
    if (hitCount > 1)  logLine += ` ×${hitCount}`;
    if (lifeHeal > 0)  logLine += ` [+${lifeHeal}HP]`;

    // On-hit weapon effects
    if (aw && aw.effect) {
      const fx = aw.effect;
      if (fx.type === 'burn' && !defender.hasStatus('burn') && Math.random() * 100 < fx.chance) {
        defender.addStatus('burn');
        logLine += ' [BURN]';
      } else if (fx.type === 'poison' && !defender.hasStatus('poison') && Math.random() * 100 < fx.chance) {
        defender.addStatus('poison');
        logLine += ' [POISON]';
      } else if (fx.type === 'freeze' && !defender.hasStatus('freeze') && Math.random() * 100 < fx.chance) {
        defender.addStatus('freeze');
        logLine += ' [FREEZE]';
      } else if (fx.type === 'paralyze' && !defender.hasStatus('paralyze') && Math.random() * 100 < fx.chance) {
        defender.addStatus('paralyze');
        logLine += ' [PARA]';
      }
    }

    // Consume one weapon use
    attacker.decrementWeaponUses();

    this.battleLog = [logLine];

    // Counter-attack if defender survived and attacker is within defender's weapon range
    if (defender.alive) {
      const dist = Math.abs(attacker.gx - defender.gx) + Math.abs(attacker.gy - defender.gy);
      const [defMinR, defMaxR] = this._weaponRange(defender);
      if (dist >= defMinR && dist <= defMaxR) {
        const aTDef = TILE_DEF[this.grid[attacker.gy][attacker.gx]];
        const { dmg: cdmg } = defender.calcDamage(attacker, aTDef);
        attacker.hp -= cdmg;
        defender.decrementWeaponUses();
        this.battleLog.push(`${defender.name} → ${attacker.name}: ${cdmg} dmg (counter)`);
      }
    }

    this.logT = 2500;

    // Award XP for any kill where a player unit is responsible.
    // Covers both: player attacks and kills, AND enemy attacks but dies on counter.
    const playerKilledEnemy   = attacker.faction === FACTION.PLAYER && !defender.alive;
    const counterKilledAttack = defender.faction === FACTION.PLAYER && !attacker.alive;
    if (playerKilledEnemy || counterKilledAttack) {
      const playerUnit = playerKilledEnemy ? attacker : defender;
      const enemyUnit  = playerKilledEnemy ? defender : attacker;
      const floor      = this.saveData.currentLevel;
      const xpAmt      = enemyUnit.isBoss
        ? 100
        : Math.max(5, Math.round(
            40 * Math.pow(0.9, playerUnit.level - 1) * (1 + (floor - 1) * 0.15)
          ));
      const startXP = playerUnit.xp;
      const result  = playerUnit.awardXP(xpAmt);
      this.xpAnim   = {
        unit: playerUnit, amount: xpAmt, startXP,
        endXP:     result.leveled ? 100 : playerUnit.xp,
        displayXP: startXP,
        duration:  1100,
        elapsed:   0,
        doLevelUp: result.leveled,
        gained:    result.gained,
      };
    }

    this._removeDead();
    this._checkEndCondition();
    this._finalizeAction(attacker);
  }

  _removeDead() {
    this.units = this.units.filter(u => u.alive);
  }

  _checkEndCondition() {
    const lordAlive   = this.units.some(u => u.faction === FACTION.PLAYER && u.isLord);
    const enemiesLeft = this.units.some(u => u.faction === FACTION.ENEMY);
    const bossAlive   = this.units.some(u => u.isBoss);

    if (!lordAlive) {
      this.phase = PHASE.GAME_OVER;
    } else if (!bossAlive) {
      this.runComplete = (this.saveData.currentLevel >= MAX_FLOORS);
      this.phase       = PHASE.VICTORY;

      const lord = this.units.find(u => u.faction === FACTION.PLAYER && u.isLord);

      if (this.runComplete) {
        // Run is over — clear the save slot so it's ready for a fresh run
        SaveData.save(this.slotIndex, { hasSave: false });
      } else {
        // Save lord state and advance to the next floor
        if (lord) {
          this.saveData.playerStats = {
            maxHp: lord.maxHp, hp:    lord.hp,
            pow:   lord.pow,   mag:   lord.mag,
            sp:    lord.sp,    lck:   lord.lck,
            def:   lord.def,   mdef:  lord.mdef,
            level: lord.level, xp:    lord.xp || 0,
            weapons:     lord.weapons.map(w => ({ ...w })),
            equippedIdx: lord.weapons.indexOf(lord.equippedWeapon),
            abilities:   [...(lord.abilities || [])],
          };
        }
        // Save surviving allies (dead ones are simply omitted so they don't respawn)
        this.saveData.allies = this.units
          .filter(u => u.faction === FACTION.PLAYER && !u.isLord)
          .map(u => ({
            name: u.name, className: u.className,
            color: u.color, symbol: u.symbol || '♟',
            level: u.level, xp: u.xp || 0,
            maxHp: u.maxHp, hp: u.hp,
            pow: u.pow, mag: u.mag, sp: u.sp, lck: u.lck,
            def: u.def, mdef: u.mdef, move: u.move,
            growths: { ...u.growths },
            weapons: u.weapons.map(w => ({ ...w })),
            equippedIdx: u.weapons.indexOf(u.equippedWeapon),
            abilities: [...(u.abilities || [])],
          }));
        this.saveData.currentLevel++;
        this.saveData.mapSeed = Math.floor(Math.random() * 2_000_000_000);
        SaveData.save(this.slotIndex, this.saveData);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TURN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  _endPlayerTurn() {
    this._resetSelection();
    this.phase     = PHASE.ENEMY_TURN;
    this.statusMsg = 'Enemy Phase';
    this.statusT   = 99999;

    // Poison DoT on all living enemies at the start of their phase
    this._tickStatusEffects(FACTION.ENEMY);
    if (this.phase !== PHASE.ENEMY_TURN) return; // all enemies wiped by poison

    this.enemyQueue = this.units.filter(u => u.faction === FACTION.ENEMY && u.alive);
    this.enemyIdx   = 0;
    this.enemyDelay = 600;
  }

  _tickEnemyTurn(delta) {
    this.enemyDelay -= delta;
    if (this.enemyDelay > 0) return;

    if (this.enemyIdx >= this.enemyQueue.length) {
      // Enemy turn over — reset player units and start next player phase
      this.units.forEach(u => { if (u.faction === FACTION.PLAYER) u.moved = false; });
      this.turnNumber++;
      this.phase     = PHASE.PLAYER_TURN;
      this.statusMsg = `Player Phase – Turn ${this.turnNumber}`;
      this.statusT   = 2000;

      // Poison DoT on all living player units at the start of their phase
      this._tickStatusEffects(FACTION.PLAYER);
      return;
    }

    const eu = this.enemyQueue[this.enemyIdx];
    this.enemyIdx++;
    this.enemyDelay = 350;

    if (!eu.alive) return;
    this._enemyAct(eu);
  }

  _enemyAct(eu) {
    if (eu.hasStatus('freeze')) {
      if (Math.random() < 0.4) {
        eu.statusEffects = eu.statusEffects.filter(s => s.type !== 'freeze');
        this.battleLog = [`${eu.name} thawed out!`];
        this.logT = 1500;
      } else {
        return;
      }
    }

    const [euMinR, euMaxR] = this._weaponRange(eu);

    // Find nearest player unit
    let target = null, bestDist = 9999;
    for (const u of this.units) {
      if (u.faction === FACTION.PLAYER && u.alive) {
        const d = Math.abs(eu.gx - u.gx) + Math.abs(eu.gy - u.gy);
        if (d < bestDist) { bestDist = d; target = u; }
      }
    }
    if (!target) return;

    // Attack if already within weapon range
    if (bestDist >= euMinR && bestDist <= euMaxR) {
      this._doAttack(eu, target);
      return;
    }

    // Move to close in on (or, for ranged units, back off to) ideal attack distance.
    // We minimise |dist - euMinR| so a bow enemy seeks distance 2, not distance 1.
    let bestPos = { x: eu.gx, y: eu.gy };
    let bestD   = Math.abs(bestDist - euMinR);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = eu.gx + dx, ny = eu.gy + dy;
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
      if (eu.moveCosts[this.grid[ny][nx]] >= 99) continue;
      if (this._unitAt(nx, ny)) continue;
      const d = Math.abs(nx - target.gx) + Math.abs(ny - target.gy);
      const gap = Math.abs(d - euMinR);
      if (gap < bestD) { bestD = gap; bestPos = { x: nx, y: ny }; }
    }
    eu.gx = bestPos.x;
    eu.gy = bestPos.y;

    // Attack if now within range after the move
    const newDist = Math.abs(eu.gx - target.gx) + Math.abs(eu.gy - target.gy);
    if (newDist >= euMinR && newDist <= euMaxR) this._doAttack(eu, target);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CAMERA
  // ═══════════════════════════════════════════════════════════════════════════
  _computeCamera() {
    const visW = Math.floor(GAME_W / TILE_S);
    const visH = Math.floor((GAME_H - UI_H) / TILE_S);
    this.camX  = Math.max(0, Math.min(this.cursorX - Math.floor(visW/2), MAP_W - visW));
    this.camY  = Math.max(0, Math.min(this.cursorY - Math.floor(visH/2), MAP_H - visH));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HUD TEXT OBJECTS
  // ═══════════════════════════════════════════════════════════════════════════
  _buildHudText() {
    const s  = (sz, col) => ({ fontFamily: '"Barlow Condensed", sans-serif', fontSize: `${sz}px`, color: col, depth: 5 });
    const uy = GAME_H - UI_H;

    this.txtPhase    = this.add.text(16,  uy + 22, '', s(26, C.PHASE_P)).setDepth(5);
    this.txtTurn     = this.add.text(16,  uy + 72, '', s(18, C.DIM)).setDepth(5);
    this.txtUnitName = this.add.text(320, uy + 18, '', s(26, C.TITLE)).setDepth(5);
    this.txtUnitInfo = this.add.text(320, uy + 66, '', s(18, C.TEXT)).setDepth(5);
    this.txtTile     = this.add.text(712, uy + 18, '', s(18, C.DIM)).setDepth(5);
    this.txtTileDef  = this.add.text(712, uy + 66, '', s(18, C.DIM)).setDepth(5);
    this.txtStatus   = this.add.text(GAME_W/2, uy - 72, '', { ...s(24, C.TITLE), align: 'center' }).setOrigin(0.5).setDepth(5);
    this.txtHint     = this.add.text(GAME_W/2, uy - 8,  '', { ...s(18, C.DIM),   align: 'center' }).setOrigin(0.5, 1).setDepth(5);
    this.txtXPLabel  = this.add.text(12, uy - 44, '', s(18, C.TITLE)).setDepth(6).setVisible(false);

    // Battle log (2 lines centred above the HUD)
    this.txtLog = [
      this.add.text(GAME_W/2, uy - 116, '', { ...s(20, C.TEXT), align: 'center' }).setOrigin(0.5).setDepth(6),
      this.add.text(GAME_W/2, uy - 68,  '', { ...s(20, C.TEXT), align: 'center' }).setOrigin(0.5).setDepth(6),
    ];

    // End-screen texts
    this.txtEndTitle = this.add.text(GAME_W/2, GAME_H/2 - 48, '', { ...s(56, '#f0d060'), align: 'center' }).setOrigin(0.5).setDepth(10);
    this.txtEndSub   = this.add.text(GAME_W/2, GAME_H/2 + 30, '', { ...s(26, C.TEXT),    align: 'center' }).setOrigin(0.5).setDepth(10);
    this.txtEndHint  = this.add.text(GAME_W/2, GAME_H/2 + 80, '', { ...s(20, C.DIM),     align: 'center' }).setOrigin(0.5).setDepth(10);

    // Combat forecast panel
    const fy = uy - 168;
    this.txtFcAtkName = this.add.text(16,          fy + 16,  '', s(20, C.PHASE_P)).setDepth(6);
    this.txtFcAtkInfo = this.add.text(16,          fy + 56,  '', s(18, C.TEXT)).setDepth(6);
    this.txtFcAtkHit  = this.add.text(16,          fy + 100, '', s(18, C.TEXT)).setDepth(6);
    this.txtFcVs      = this.add.text(GAME_W / 2,  fy + 76,  'vs', { ...s(20, C.DIM), align: 'center' }).setOrigin(0.5).setDepth(6);
    this.txtFcDefName = this.add.text(GAME_W/2+16, fy + 16,  '', s(20, C.PHASE_E)).setDepth(6);
    this.txtFcDefInfo = this.add.text(GAME_W/2+16, fy + 56,  '', s(18, C.TEXT)).setDepth(6);
    this.txtFcDefHit  = this.add.text(GAME_W/2+16, fy + 100, '', s(18, C.TEXT)).setDepth(6);
    this._fcTexts = [
      this.txtFcAtkName, this.txtFcAtkInfo, this.txtFcAtkHit,
      this.txtFcVs,
      this.txtFcDefName, this.txtFcDefInfo, this.txtFcDefHit,
    ];
    this._fcTexts.forEach(t => t.setVisible(false));

    // Action menu (up to 9 options: ATTACK EXECUTE STEAL TALK CONVERSE OPEN_DOOR OPEN_CHEST ITEMS WAIT)
    this.txtMenuItems = Array.from({ length: 9 }, () =>
      this.add.text(0, 0, '', s(22, C.TEXT)).setDepth(6)
    );
    this.txtMenuItems.forEach(t => t.setVisible(false));

    // Weapon-select panel (full-width bar above HUD)
    this.txtWselHeader = this.add.text(GAME_W / 2, 0, 'CHOOSE WEAPON', { ...s(18, C.DIM), align: 'center' })
                           .setOrigin(0.5, 0).setDepth(6).setVisible(false);
    this.txtWselRows = Array.from({ length: 4 }, () =>
      this.add.text(40, 0, '', s(18, C.TEXT)).setDepth(6).setVisible(false)
    );

    // Inventory list (items / item-action states, up to 5 rows)
    this.txtInvItems = Array.from({ length: 5 }, () =>
      this.add.text(0, 0, '', s(18, C.TEXT)).setDepth(6).setVisible(false)
    );

    // Item action sub-menu (USE/EQUIP + DROP)
    this.txtItemAct = Array.from({ length: 2 }, () =>
      this.add.text(0, 0, '', s(18, C.TEXT)).setDepth(7).setVisible(false)
    );

    // Steal item list (steal-pick state — shows target enemy's inventory)
    this.txtStealHeader = this.add.text(0, 0, 'Steal item:', s(18, C.TITLE)).setDepth(6).setVisible(false);
    this.txtStealItems  = Array.from({ length: 4 }, () =>
      this.add.text(0, 0, '', s(18, C.TEXT)).setDepth(6).setVisible(false)
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  UPDATE LOOP
  // ═══════════════════════════════════════════════════════════════════════════
  update(time, delta) {
    // Timers
    this.blinkT += delta;
    if (this.blinkT >= 450) { this.blinkT = 0; this.blinkOn = !this.blinkOn; }
    if (this.statusT > 0) { this.statusT -= delta; if (this.statusT <= 0) this.statusMsg = ''; }
    if (this.logT > 0)    { this.logT -= delta;    if (this.logT <= 0)    this.battleLog = []; }

    // Auto-end player turn when all units have moved
    if (this.phase === PHASE.PLAYER_TURN) {
      const allMoved = this.units.filter(u => u.faction === FACTION.PLAYER).every(u => u.moved);
      if (allMoved) this._endPlayerTurn();
    }

    if (this.phase === PHASE.ENEMY_TURN) this._tickEnemyTurn(delta);

    // XP bar animation
    if (this.xpAnim) {
      this.xpAnim.elapsed += delta;
      const t = Math.min(1, this.xpAnim.elapsed / this.xpAnim.duration);
      this.xpAnim.displayXP = this.xpAnim.startXP +
        (this.xpAnim.endXP - this.xpAnim.startXP) * t;
      if (t >= 1) {
        const { doLevelUp, gained, unit } = this.xpAnim;
        this.xpAnim = null;
        if (doLevelUp) {
          this.scene.launch('LevelUp', { unit, gained, callerKey: 'GameMap' });
          this.scene.pause();
        }
      }
    }

    this._handleInput();
    this._renderAll();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDERING
  // ═══════════════════════════════════════════════════════════════════════════
  _renderAll() {
    this._drawMap();
    this._drawRanges();
    this._drawUnits();
    this._drawCursor();
    this._drawHud();
    this._updateHudText();
  }

  _screenPos(gx, gy) {
    return {
      x: (gx - this.camX) * TILE_S,
      y: (gy - this.camY) * TILE_S,
    };
  }

  _drawMap() {
    const g = this.gfxMap;
    g.clear();

    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const { x: sx, y: sy } = this._screenPos(tx, ty);
        if (sx + TILE_S < 0 || sx > GAME_W || sy + TILE_S < 0 || sy > GAME_H - UI_H) continue;

        const tile  = this.grid[ty][tx];
        const tc    = TILE_COLOR[tile];

        // Fill
        g.fillStyle(tc.fill, 1);
        g.fillRect(sx, sy, TILE_S, TILE_S);

        // Shade edges (right & bottom 4px)
        g.fillStyle(tc.shade, 1);
        g.fillRect(sx + TILE_S - 4, sy, 4, TILE_S);
        g.fillRect(sx, sy + TILE_S - 4, TILE_S, 4);

        // Grid line
        g.lineStyle(1.5, 0x000000, 0.25);
        g.strokeRect(sx, sy, TILE_S, TILE_S);

        // Door: dark cross bars
        if (tile === TILE.DOOR) {
          g.fillStyle(0x2a1408, 1);
          g.fillRect(sx + TILE_S/2 - 3, sy + 4,  6, TILE_S - 8);
          g.fillRect(sx + 4, sy + TILE_S/2 - 3,  TILE_S - 8, 6);
          g.lineStyle(2, 0x000000, 0.7);
          g.strokeRect(sx + 4, sy + 4, TILE_S - 8, TILE_S - 8);
        }
        // Chest: golden box with a lock dot
        if (tile === TILE.CHEST) {
          g.fillStyle(0x6a4010, 1);
          g.fillRect(sx + 8, sy + 14, TILE_S - 16, TILE_S - 24);
          g.fillStyle(0xd4a020, 1);
          g.fillRect(sx + 8, sy + 14, TILE_S - 16, 10);
          g.fillStyle(0x000000, 0.6);
          g.fillRect(sx + TILE_S/2 - 4, sy + TILE_S/2 - 2, 8, 8);
        }
      }
    }
  }

  _drawRanges() {
    const g = this.gfxRanges;
    g.clear();

    for (const key of this.moveRange.keys()) {
      const [tx, ty] = key.split(',').map(Number);
      const { x: sx, y: sy } = this._screenPos(tx, ty);
      g.fillStyle(C.MOVE_HL, 0.4);
      g.fillRect(sx, sy, TILE_S, TILE_S);
    }
    for (const key of this.attackRange) {
      const [tx, ty] = key.split(',').map(Number);
      const { x: sx, y: sy } = this._screenPos(tx, ty);
      g.fillStyle(C.ATCK_HL, 0.35);
      g.fillRect(sx, sy, TILE_S, TILE_S);
    }
  }

  _drawUnits() {
    const g = this.gfxUnits;
    g.clear();

    for (const u of this.units) {
      const { x: sx, y: sy } = this._screenPos(u.gx, u.gy);
      if (sx + TILE_S < 0 || sx > GAME_W || sy + TILE_S < 0 || sy > GAME_H - UI_H) continue;

      // Unit body
      const bodyCol = u.moved
        ? Phaser.Display.Color.IntegerToColor(u.color).darken(25).color
        : u.color;
      g.fillStyle(bodyCol, 1);
      g.fillRect(sx + 4, sy + 4, TILE_S - 8, TILE_S - 20);

      // Border — white for allies, gold for neutrals, black for enemies
      const bdCol = u.faction === FACTION.PLAYER  ? 0xffffff :
                    u.faction === FACTION.NEUTRAL  ? 0xf0d060 : 0x000000;
      g.lineStyle(3, bdCol, 0.8);
      g.strokeRect(sx + 4, sy + 4, TILE_S - 8, TILE_S - 20);

      // HP bar
      const hpPct = u.hp / u.maxHp;
      g.fillStyle(C.HP_BG, 1);
      g.fillRect(sx + 4, sy + TILE_S - 12, TILE_S - 8, 8);
      g.fillStyle(hpPct > 0.4 ? C.HP_FULL : C.HP_LOW, 1);
      g.fillRect(sx + 4, sy + TILE_S - 12, Math.floor((TILE_S - 8) * hpPct), 8);

      // Lord crown marker
      if (u.isLord) {
        g.fillStyle(C.CURSOR, 1);
        g.fillRect(sx + 20, sy + 8, 16, 12);
        g.fillRect(sx + 16, sy + 8,  4,  8);
        g.fillRect(sx + 40, sy + 8,  4,  8);
      }

      // Boss marker
      if (u.isBoss) {
        g.fillStyle(0xff00ff, 1);
        g.fillRect(sx + 16, sy + 8, 24, 8);
      }
    }
  }

  _drawCursor() {
    const g = this.gfxCursor;
    g.clear();
    if (!this.blinkOn && this.phase === PHASE.PLAYER_TURN) return;
    if (this.phase === PHASE.GAME_OVER || this.phase === PHASE.VICTORY) return;

    const { x: sx, y: sy } = this._screenPos(this.cursorX, this.cursorY);
    if (sx < -TILE_S || sx > GAME_W || sy < -TILE_S || sy > GAME_H - UI_H) return;

    g.lineStyle(4, C.CURSOR, 1);
    g.strokeRect(sx, sy, TILE_S, TILE_S);

    // Corner ticks
    const hl = 12;
    g.lineStyle(6, C.CURSOR, 1);
    [[sx, sy],[sx+TILE_S, sy],[sx, sy+TILE_S],[sx+TILE_S, sy+TILE_S]].forEach(([cx, cy]) => {
      const dx = cx === sx ? 1 : -1;
      const dy = cy === sy ? 1 : -1;
      g.strokeLineShape(new Phaser.Geom.Line(cx, cy, cx + dx * hl, cy));
      g.strokeLineShape(new Phaser.Geom.Line(cx, cy, cx, cy + dy * hl));
    });
  }

  _drawHud() {
    const g  = this.gfxHud;
    const uy = GAME_H - UI_H;
    g.clear();

    // ── Combat / execute forecast panel (above HUD) ───────────────────────
    if ((this.gameState === 'targeting' || this.gameState === 'execute') && this.forecastTarget) {
      const fy = uy - 168;
      g.fillStyle(C.PANEL_BG, 0.95);
      g.fillRect(0, fy, GAME_W, 168);
      g.lineStyle(3, C.PANEL_BD, 1);
      g.strokeLineShape(new Phaser.Geom.Line(0, fy, GAME_W, fy));
      g.lineStyle(1.5, C.PANEL_BD, 0.5);
      g.strokeLineShape(new Phaser.Geom.Line(GAME_W/2, fy + 8, GAME_W/2, fy + 160));
    }

    // ── Weapon-select: full-width bar just above the HUD ─────────────────────
    if (this.gameState === 'weapon-select' && this.selectedUnit) {
      const cw = this._getCombatWeapons();
      const ph = 56 + Math.min(4, cw.length) * 48;
      const py = uy - ph;
      g.fillStyle(C.PANEL_BG, 0.96);
      g.fillRect(0, py, GAME_W, ph);
      g.lineStyle(3, C.PANEL_BD, 1);
      g.strokeLineShape(new Phaser.Geom.Line(0, py, GAME_W, py));
      g.lineStyle(1.5, C.PANEL_BD, 0.5);
      g.strokeLineShape(new Phaser.Geom.Line(32, py + 48, GAME_W - 32, py + 48));
      g.fillStyle(C.SEL_BD, 0.25);
      g.fillRect(8, py + 56 + this.invCursor * 48, GAME_W - 16, 44);
    }

    // ── Inventory popup (items / item-action states) ───────────────────────
    if (['items', 'item-action'].includes(this.gameState) && this.selectedUnit) {
      const r = this._invRect();
      g.fillStyle(C.PANEL_BG, 0.96);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(4, C.PANEL_BD, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.fillStyle(C.SEL_BD, 0.2);
      g.fillRect(r.x + 4, r.y + 12 + this.invCursor * 48, r.w - 8, 44);

      if (this.gameState === 'item-action') {
        const ar = this._itemActRect(r);
        g.fillStyle(C.PANEL_BG, 0.96);
        g.fillRect(ar.x, ar.y, ar.w, ar.h);
        g.lineStyle(4, C.PANEL_BD, 1);
        g.strokeRect(ar.x, ar.y, ar.w, ar.h);
        g.fillStyle(C.SEL_BD, 0.2);
        g.fillRect(ar.x + 4, ar.y + 12 + this.itemActCursor * 48, ar.w - 8, 44);
      }
    }

    // ── Steal item popup (steal-pick state) ───────────────────────────────────
    if (this.gameState === 'steal-pick' && this.stealTarget) {
      const r = this._stealRect();
      g.fillStyle(C.PANEL_BG, 0.96);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(4, C.PANEL_BD, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.fillStyle(C.SEL_BD, 0.2);
      g.fillRect(r.x + 4, r.y + 38 + this.stealCursor * 48, r.w - 8, 44);
    }

    // ── Action menu panel (near selected unit, menu state only) ────────────
    if (this.gameState === 'menu' && this.selectedUnit) {
      const r = this._menuRect();
      g.fillStyle(C.PANEL_BG, 0.96);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(4, C.PANEL_BD, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.fillStyle(C.SEL_BD, 0.2);
      g.fillRect(r.x + 4, r.y + 12 + this.menuCursor * 52, r.w - 8, 48);
    }

    // ── XP gain bar (just above HUD, shown while xpAnim is running) ──────────
    if (this.xpAnim) {
      const by = uy - 40;
      g.fillStyle(0x0d0d24, 0.95);
      g.fillRect(0, by, GAME_W, 40);
      g.lineStyle(3, C.PANEL_BD, 0.8);
      g.strokeLineShape(new Phaser.Geom.Line(0, by, GAME_W, by));
      const barX = 328, barW = GAME_W - 352;
      g.fillStyle(0x1a1a30, 1);
      g.fillRect(barX, by + 8, barW, 24);
      const fill = Math.floor(barW * Math.min(1, this.xpAnim.displayXP / 100));
      if (fill > 0) {
        g.fillStyle(0xf0d060, 1);
        g.fillRect(barX, by + 8, fill, 24);
      }
      g.lineStyle(1.5, C.PANEL_BD, 0.5);
      g.strokeRect(barX, by + 8, barW, 24);
    }

    // ── Main HUD background ─────────────────────────────────────────────────
    g.fillStyle(0x0d0d24, 0.95);
    g.fillRect(0, uy, GAME_W, UI_H);
    g.lineStyle(1, C.PANEL_BD, 1);
    g.strokeLineShape(new Phaser.Geom.Line(0, uy, GAME_W, uy));

    g.lineStyle(1.5, C.PANEL_BD, 0.5);
    g.strokeLineShape(new Phaser.Geom.Line(296, uy, 296, GAME_H));
    g.strokeLineShape(new Phaser.Geom.Line(688, uy, 688, GAME_H));

    // Battle log background (hidden while forecast is showing)
    const showFcHud = (this.gameState === 'targeting' || this.gameState === 'execute') && !!this.forecastTarget;
    if (this.battleLog.length > 0 && !showFcHud) {
      const rows = this.battleLog.length;
      g.fillStyle(0x0d0d24, 0.92);
      g.fillRect(80, uy - rows * 56 - 24, GAME_W - 160, rows * 56 + 16);
      g.lineStyle(3, C.PANEL_BD, 1);
      g.strokeRect(80, uy - rows * 56 - 24, GAME_W - 160, rows * 56 + 16);
    }

    // End screen overlay
    if (this.phase === PHASE.GAME_OVER || this.phase === PHASE.VICTORY) {
      g.fillStyle(0x000000, 0.65);
      g.fillRect(0, 0, GAME_W, GAME_H);
    }
  }

  // Returns the bounding rect for the action menu popup
  _menuRect() {
    const { x: sx, y: sy } = this._screenPos(this.selectedUnit.gx, this.selectedUnit.gy);
    const w = 200, h = this.menuOptions.length * 52 + 24;
    let x = sx + TILE_S + 4;
    if (x + w > GAME_W) x = sx - w - 4;
    let y = sy - 8;
    if (y + h > GAME_H - UI_H) y = GAME_H - UI_H - h - 8;
    if (y < 0) y = 0;
    return { x, y, w, h };
  }

  // Returns [minRange, maxRange] for the unit's equipped weapon.
  // Reach passive adds 2 to bow max range.
  _weaponRange(unit) {
    const w = unit?.equippedWeapon;
    if (!w || !w.range) return [1, 1];
    let [minR, maxR] = w.range;
    if (unit.abilities?.includes('reach') && w.type === 'bow') maxR += 2;
    return [minR, maxR];
  }

  _stealRect() {
    if (!this.stealTarget) return { x: 16, y: 16, w: 360, h: 80 };
    const { x: sx, y: sy } = this._screenPos(this.stealTarget.gx, this.stealTarget.gy);
    const list = this.stealTarget.weapons || [];
    const w = 360, h = Math.max(1, list.length) * 48 + 48;
    let x = sx + TILE_S + 4;
    if (x + w > GAME_W) x = sx - w - 4;
    let y = sy - 8;
    if (y + h > GAME_H - UI_H) y = GAME_H - UI_H - h - 8;
    return { x: Math.max(0, x), y: Math.max(0, y), w, h };
  }

  _updateHudText() {
    const uy = GAME_H - UI_H;

    // Phase
    const isPlayer = this.phase === PHASE.PLAYER_TURN;
    this.txtPhase.setColor(isPlayer ? C.PHASE_P : C.PHASE_E);
    this.txtPhase.setText(isPlayer ? 'PLAYER TURN' : 'ENEMY TURN');
    this.txtTurn.setText(`T${this.turnNumber}  F${this.saveData.currentLevel}/${MAX_FLOORS}`);

    // Unit info
    const u = this._unitAt(this.cursorX, this.cursorY);
    if (u) {
      const isMagic = u.mag > u.pow;
      this.txtUnitName.setText(`${u.name}  Lv.${u.level}`);
      this.txtUnitInfo.setText(
        `HP ${u.hp}/${u.maxHp}  ` +
        (isMagic ? `Mg${u.mag}  MD${u.mdef}` : `Pw${u.pow}  Df${u.def}`)
      );
    } else {
      this.txtUnitName.setText('');
      this.txtUnitInfo.setText('');
    }

    // Tile info
    if (this.cursorX >= 0 && this.cursorX < MAP_W && this.cursorY >= 0 && this.cursorY < MAP_H) {
      const tile = this.grid[this.cursorY][this.cursorX];
      this.txtTile.setText(TILE_NAME[tile]);
      this.txtTileDef.setText(`DEF +${TILE_DEF[tile]}`);
    }

    // ── Combat / execute forecast panel texts ─────────────────────────────
    const showFc = (this.gameState === 'targeting' || this.gameState === 'execute')
                   && !!this.forecastTarget;
    this._fcTexts.forEach(t => t.setVisible(showFc));
    if (showFc) {
      const atk = this.selectedUnit;
      const def = this.forecastTarget;
      if (this.gameState === 'execute') {
        // Execute: guaranteed kill, no damage numbers
        this.txtFcAtkName.setText(atk.name);
        this.txtFcAtkInfo.setText(`HP:${atk.hp}/${atk.maxHp}`);
        this.txtFcAtkHit.setText( 'INSTANT KO');
        this.txtFcDefName.setText(def.name);
        this.txtFcDefInfo.setText(`HP:${def.hp}/${def.maxHp}`);
        this.txtFcDefHit.setText( 'No counter');
        this.txtFcVs.setVisible(true);
      } else {
        const fc = this._calcForecast(atk, def);
        this.txtFcAtkName.setText(atk.name);
        this.txtFcAtkInfo.setText(`HP:${atk.hp}/${atk.maxHp}  Atk:${fc.atkDmg}`);
        this.txtFcAtkHit.setText( `Hit:${fc.atkHit}%  x${fc.atkHits}${fc.atkCrit > 0 ? `  Cr:${fc.atkCrit}%` : ''}`);
        this.txtFcDefName.setText(def.name);
        if (fc.canCounter) {
          this.txtFcDefInfo.setText(`HP:${def.hp}/${def.maxHp}  Atk:${fc.defDmg}`);
          this.txtFcDefHit.setText( `Hit:${fc.defHit}%  x${fc.defHits}${fc.defCrit > 0 ? `  Cr:${fc.defCrit}%` : ''}`);
        } else {
          this.txtFcDefInfo.setText(`HP:${def.hp}/${def.maxHp}  Atk:--`);
          this.txtFcDefHit.setText( 'No counter');
        }
      }
    }

    // ── Action menu texts ─────────────────────────────────────────────────
    this.txtMenuItems.forEach(t => t.setVisible(false));
    if (this.gameState === 'menu' && this.selectedUnit) {
      const r = this._menuRect();
      for (let i = 0; i < this.menuOptions.length; i++) {
        const sel = i === this.menuCursor;
        this.txtMenuItems[i]
          .setText((sel ? '▶' : '   ') + ' ' + this.menuOptions[i])
          .setPosition(r.x + 16, r.y + 12 + i * 52)
          .setColor(sel ? C.TITLE : C.TEXT)
          .setVisible(true);
      }
    }

    // ── Weapon-select panel ───────────────────────────────────────────────
    this.txtWselHeader.setVisible(false);
    this.txtWselRows.forEach(t => t.setVisible(false));
    if (this.gameState === 'weapon-select' && this.selectedUnit) {
      const cw = this._getCombatWeapons();
      const ph = 56 + Math.min(4, cw.length) * 48;
      const py = uy - ph;
      this.txtWselHeader.setY(py + 8).setVisible(true);
      for (let i = 0; i < Math.min(cw.length, 4); i++) {
        const w    = cw[i];
        const sel  = i === this.invCursor;
        const eq   = (w === this.selectedUnit.equippedWeapon) ? '[E]' : '   ';
        const atk  = this._weaponAtk(this.selectedUnit, w);
        const type = this._weaponTypeAbbr(w);
        const nm   = w.name.slice(0, 16).padEnd(16);
        this.txtWselRows[i]
          .setText(`${sel ? '▶' : ' '} ${eq} ${nm}  Atk:${atk} ${type} ${w.uses}/${w.maxUses}`)
          .setY(py + 60 + i * 48)
          .setColor(sel ? C.TITLE : C.TEXT)
          .setVisible(true);
      }
    }

    // ── Inventory list (items / item-action) ──────────────────────────────
    this.txtInvItems.forEach(t => t.setVisible(false));
    if (['items', 'item-action'].includes(this.gameState) && this.selectedUnit) {
      const list = this.selectedUnit.weapons || [];
      const r = this._invRect();
      for (let i = 0; i < Math.min(list.length, this.txtInvItems.length); i++) {
        const item  = list[i];
        const isSel = i === this.invCursor;
        const eq    = (item === this.selectedUnit.equippedWeapon) ? '*' : ' ';
        this.txtInvItems[i]
          .setText(`${isSel ? '▶' : ' '}${eq} ${item.name}  ${item.uses}/${item.maxUses}`)
          .setPosition(r.x + 16, r.y + 12 + i * 48)
          .setColor(isSel ? C.TITLE : C.TEXT)
          .setVisible(true);
      }
    }

    // ── Item action sub-menu ──────────────────────────────────────────────
    this.txtItemAct.forEach(t => t.setVisible(false));
    if (this.gameState === 'item-action' && this.selectedUnit) {
      const r  = this._invRect();
      const ar = this._itemActRect(r);
      for (let i = 0; i < this.itemActOptions.length; i++) {
        const sel = i === this.itemActCursor;
        this.txtItemAct[i]
          .setText((sel ? '▶' : ' ') + ' ' + this.itemActOptions[i])
          .setPosition(ar.x + 16, ar.y + 12 + i * 48)
          .setColor(sel ? C.TITLE : C.TEXT)
          .setVisible(true);
      }
    }

    // ── Steal item list (steal-pick) ──────────────────────────────────────────
    this.txtStealHeader.setVisible(false);
    this.txtStealItems.forEach(t => t.setVisible(false));
    if (this.gameState === 'steal-pick' && this.stealTarget) {
      const list = this.stealTarget.weapons || [];
      const r    = this._stealRect();
      this.txtStealHeader.setPosition(r.x + 16, r.y + 8).setVisible(true);
      for (let i = 0; i < Math.min(list.length, this.txtStealItems.length); i++) {
        const item = list[i];
        const sel  = i === this.stealCursor;
        this.txtStealItems[i]
          .setText(`${sel ? '▶' : ' '} ${item.name}  ${item.uses}/${item.maxUses}`)
          .setPosition(r.x + 16, r.y + 40 + i * 48)
          .setColor(sel ? C.TITLE : C.TEXT)
          .setVisible(true);
      }
    }

    // XP bar label (hides status/hint while animating)
    const showXP = !!this.xpAnim;
    if (showXP) {
      this.txtXPLabel.setText(`${this.xpAnim.unit.name}  EXP +${this.xpAnim.amount}`).setVisible(true);
    } else {
      this.txtXPLabel.setVisible(false);
    }

    // Status message — also suppressed while the battle log is visible so they don't overlap
    this.txtStatus.setText((showFc || showXP || this.battleLog.length > 0) ? '' : this.statusMsg);

    // Hint line (hidden while XP bar is visible)
    this.txtHint.setVisible(!showXP);
    this.txtHint.setText(
      this.gameState === 'targeting'
        ? (this.forecastTarget ? 'X:attack  Z:back' : 'aim at enemy  Z:back')
        : this.gameState === 'execute'
        ? (this.forecastTarget ? 'X:execute  Z:back' : 'aim at enemy  Z:back')
        : this.gameState === 'converse'
        ? (this.forecastTarget ? 'X:attempt converse  Z:back' : 'aim at enemy  Z:back')
        : this.gameState === 'gallop'
        ? 'Gallop — move remaining tiles  Z:skip'
        : this.gameState === 'steal-target'
        ? 'Select enemy to steal from  Z:back'
        : this.gameState === 'steal-pick'
        ? 'X:steal item  Z:back'
        : this.gameState === 'menu' && this.menuOptions[this.menuCursor] === 'OPEN DOOR'
        ? 'X:open door  Z:undo move'
        : this.gameState === 'menu' && this.menuOptions[this.menuCursor] === 'OPEN CHEST'
        ? 'X:open chest  Z:undo move'
        : this.gameState === 'menu'
        ? 'X:confirm  Z:undo move'
        : this.gameState === 'weapon-select'
        ? 'X:select weapon  Z:back'
        : this.gameState === 'items'
        ? 'X:action  E:info  Z:back'
        : this.gameState === 'item-action'
        ? 'X:confirm  Z:cancel'
        : this.gameState === 'selected'
        ? 'X:move/stay  Z:cancel'
        : this.phase === PHASE.PLAYER_TURN ? 'X:select  E:inspect' : ''
    );

    // Battle log (hidden while forecast is shown)
    for (let i = 0; i < 2; i++) {
      this.txtLog[i].setText(showFc ? '' : (this.battleLog[i] || ''));
      this.txtLog[i].setY(uy - (2 - i) * 56 - 16);
    }

    // End screen
    const isEnd = this.phase === PHASE.GAME_OVER || this.phase === PHASE.VICTORY;
    this.txtEndTitle.setVisible(isEnd);
    this.txtEndSub.setVisible(isEnd);
    this.txtEndHint.setVisible(isEnd);

    if (this.phase === PHASE.VICTORY) {
      if (this.runComplete) {
        this.txtEndTitle.setText('CONQUERED!').setColor('#f0d060');
        this.txtEndSub.setText(`All ${MAX_FLOORS} floors cleared!`);
      } else {
        this.txtEndTitle.setText('FLOOR CLEAR').setColor('#f0d060');
        this.txtEndSub.setText(`Advance to floor ${this.saveData.currentLevel}`);
      }
      this.txtEndHint.setText(this.blinkOn ? (this.runComplete ? 'Press X to return to title' : 'Press X to continue') : '');
    } else if (this.phase === PHASE.GAME_OVER) {
      this.txtEndTitle.setText('GAME OVER').setColor('#e05050');
      this.txtEndSub.setText('Your lord has fallen.');
      this.txtEndHint.setText(this.blinkOn ? 'Press X to return to title' : '');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Apply status effects at the start of a faction's phase.
  _tickStatusEffects(faction) {
    const msgs = [];
    this.units.filter(u => u.faction === faction && u.alive).forEach(u => {
      const dmg = u.tickPoison();
      if (dmg > 0) msgs.push(`${u.name}: ${dmg} poison`);

      // Freeze: 40% chance to thaw at the start of the unit's phase.
      // For player units, set moved=true if still frozen so they can't act.
      if (faction === FACTION.PLAYER && u.hasStatus('freeze')) {
        if (Math.random() < 0.4) {
          u.statusEffects = u.statusEffects.filter(s => s.type !== 'freeze');
          msgs.push(`${u.name} thawed out!`);
        } else {
          u.moved = true;
          msgs.push(`${u.name} is frozen!`);
        }
      }
    });
    if (msgs.length > 0) {
      this.battleLog = msgs.slice(0, 2);
      this.logT = 1500;
    }
    this._removeDead();
    this._checkEndCondition();
  }

  _unitAt(x, y) {
    return this.units.find(u => u.gx === x && u.gy === y && u.alive) || null;
  }

  _tilePassable(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    return MOVE_COST[this.grid[y][x]] < 99;
  }
}
