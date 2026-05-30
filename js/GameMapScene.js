// ─── GameMapScene.js ──────────────────────────────────────────────────────────

class GameMapScene extends Phaser.Scene {
  constructor() { super({ key: 'GameMap' }); }

  init(data) {
    this.saveData  = data.saveData;
    this.slotIndex = data.slotIndex;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  create() {
    // Generate map
    const { grid, thronePos, rng } = MapGen.generate(this.saveData.mapSeed);
    this.grid      = grid;
    this.thronePos = thronePos;
    this.mapRng    = rng;

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
    const fMod  = floor - 1;                     // 0 on floor 1, 4 on floor 5

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
      lord.pow   = ps.pow;    lord.moj  = ps.moj;
      lord.sp    = ps.sp;     lord.lck  = ps.lck;
      lord.def   = ps.def;    lord.mdef = ps.mdef;
      lord.level = ps.level;  lord.xp   = ps.xp || 0;
      if (ps.weapons && ps.weapons.length > 0) {
        lord.weapons = ps.weapons.map(w => ({ ...w }));
        lord.equippedWeapon =
          (ps.equippedIdx >= 0 ? lord.weapons[ps.equippedIdx] : null)
          || lord.weapons.find(w => !w.isStaff && !w.isConsumable)
          || lord.weapons[0] || null;
      }
      // 50 % HP restoration at the start of each new floor
      lord.hp = Math.min(lord.maxHp, lord.hp + Math.floor(lord.maxHp / 2));
    }

    // ── Enemies (scaled by floor) ────────────────────────────────────────────
    const sc   = (base, perFloor) => base + Math.round(fMod * perFloor);
    // Weapon tier: Wood (fl 1) → Bronze (fl 2-3) → Iron (fl 4-5)
    const tier = floor >= 4 ? 'IRON' : floor >= 2 ? 'BRONZE' : 'WOOD';

    const eTypes = [
      {
        name: 'Grunt',       className: 'Grunt',
        color: 0xc04040, symbol: '♟',
        hp: sc(14,3), pow: sc(7,1),  moj: 0,       sp: sc(4,0.5),
        lck: 2,        def: sc(4,1), mdef: sc(2,0.5), move: 4,
        moveCosts: CLASSES.GRUNT.moveCosts,
        weapons: [makeWeapon(`${tier}_LANCE`)],
      },
      {
        name: 'Fletcher',    className: 'Fletcher',
        color: 0xc07030, symbol: '♝',
        hp: sc(12,3), pow: sc(8,1),  moj: 0,       sp: sc(6,0.5),
        lck: 3,        def: sc(2,1), mdef: sc(1,0.5), move: 6,
        moveCosts: CLASSES.FLETCHER.moveCosts,
        weapons: [makeWeapon(`${tier}_SWORD`)],
      },
      {
        name: 'Necromancer', className: 'Necromancer',
        color: 0x9030c0, symbol: '♜',
        hp: sc(10,3), pow: 2,        moj: sc(10,1), sp: sc(5,0.5),
        lck: 4,        def: sc(1,1), mdef: sc(5,0.5), move: 5,
        moveCosts: CLASSES.NECROMANCER.moveCosts,
        weapons: [makeWeapon(`${tier}_TOME`)],
      },
    ];
    const usedPos = new Set();
    let attempts = 0;
    while (usedPos.size < 6 && attempts < 300) {
      attempts++;
      const ex = this.mapRng.int(Math.floor(MAP_W/2)+1, MAP_W-1);
      const ey = this.mapRng.int(1, MAP_H-2);
      const k  = `${ex},${ey}`;
      if (this._tilePassable(ex, ey) && !usedPos.has(k)) {
        usedPos.add(k);
        const et = this.mapRng.pick(eTypes);
        this.units.push(new Unit({ ...et, faction: FACTION.ENEMY, gx: ex, gy: ey }));
      }
    }

    // ── Boss (scales faster than regulars) ────────────────────────────────────
    if (this.thronePos && !this._unitAt(this.thronePos.x, this.thronePos.y)) {
      this.units.push(new Unit({
        name: 'General', className: 'Bulwark', faction: FACTION.ENEMY,
        gx: this.thronePos.x, gy: this.thronePos.y,
        hp:   sc(30, 8), pow: sc(12, 2), moj: 3,
        sp:   sc(4, 0.5), lck: 5,
        def:  sc(7, 2),  mdef: sc(4, 0.5), move: 3,
        color: 0xe030e0, symbol: '♚', isBoss: true,
        moveCosts: CLASSES.BULWARK.moveCosts,
        weapons: [makeWeapon(`${tier}_LANCE`)],
      }));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INPUT
  // ═══════════════════════════════════════════════════════════════════════════
  _handleInput() {
    const jd = k => Phaser.Input.Keyboard.JustDown(k);

    if (this.phase === PHASE.GAME_OVER || this.phase === PHASE.VICTORY) {
      if (jd(this.keys.confirm) || jd(this.keys.enter) || jd(this.keys.cancel)) {
        this.scene.start('MainMenu');
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
    if (['menu', 'weapon-select', 'items', 'item-action'].includes(this.gameState)) {
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

    // Update combat preview while moving cursor in targeting mode
    if (this.gameState === 'targeting') {
      const t = this._unitAt(this.cursorX, this.cursorY);
      this.forecastTarget = (t && t.faction === FACTION.ENEMY &&
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
          this.attackRange  = u.computeAttackRange(this.moveRange);
          this.gameState    = 'selected';
        }
        break;

      case 'selected':
        // Switch to a different ready player unit
        if (u && u.faction === FACTION.PLAYER && !u.moved && u !== this.selectedUnit) {
          this.selectedUnit = u;
          this.moveRange    = u.computeMoveRange(this.grid, this.units);
          this.attackRange  = u.computeAttackRange(this.moveRange);
          break;
        }
        // Move to tile (or stay in place) → open action menu
        if (this.moveRange.has(key) && (!u || u === this.selectedUnit)) {
          this.preActionGx = this.selectedUnit.gx;
          this.preActionGy = this.selectedUnit.gy;
          this.selectedUnit.gx = this.cursorX;
          this.selectedUnit.gy = this.cursorY;
          const pos = new Map([[key, 0]]);
          this.moveRange   = pos;
          this.attackRange = this.selectedUnit.computeAttackRange(pos);
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
          this.itemActOptions = item.isConsumable ? ['USE', 'DROP'] : ['EQUIP', 'DROP'];
          this.itemActCursor  = 0;
          this.gameState      = 'item-action';
        }
        break;
      }

      case 'item-action':
        this._confirmItemAction();
        break;

      case 'targeting':
        if (u && u.faction === FACTION.ENEMY && this.attackRange.has(key)) {
          this._doAttack(this.selectedUnit, u);
        }
        break;
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
      case 'targeting':
        this.forecastTarget = null;
        this._openMenu();
        break;
      default:
        this._resetSelection();
        break;
    }
  }

  _openMenu() {
    const hasTarget = this.units.some(u =>
      u.faction === FACTION.ENEMY && u.alive &&
      this.attackRange.has(`${u.gx},${u.gy}`)
    );
    const hasItems = (this.selectedUnit?.weapons || []).length > 0;
    this.menuOptions = [
      ...(hasTarget ? ['ATTACK'] : []),
      ...(hasItems  ? ['ITEMS']  : []),
      'WAIT',
    ];
    this.menuCursor = 0;
    this.gameState  = 'menu';
  }

  _confirmMenuOption() {
    const opt = this.menuOptions[this.menuCursor];
    if (opt === 'ATTACK') {
      const cw = this._getCombatWeapons();
      if (cw.length > 1) {
        // Let the player choose which weapon to use
        this.invCursor = Math.max(0, cw.indexOf(this.selectedUnit.equippedWeapon));
        this.gameState = 'weapon-select';
      } else {
        this._enterTargeting();
      }
    } else if (opt === 'ITEMS') {
      this.invCursor = 0;
      this.gameState = 'items';
    } else {
      // WAIT
      this.selectedUnit.moved = true;
      this._resetSelection();
    }
  }

  // Combat preview data used by the forecast panel
  _calcForecast(atk, def) {
    const tDef  = TILE_DEF[this.grid[def.gy][def.gx]];
    const tADef = TILE_DEF[this.grid[atk.gy][atk.gx]];
    const aw = atk.equippedWeapon;
    const dw = def.equippedWeapon;

    const { dmg: atkDmg } = atk.calcDamage(def, tDef);
    const atkDoubles = atk.sp >= def.sp + 4;
    const atkHits    = atkDoubles ? 2 : 1;
    const atkHit     = Math.min(100, Math.max(0,
      (aw ? aw.hit : 80) + atk.lck - def.sp * 2));
    const atkCrit    = aw ? aw.crit : 0;

    const dist = Math.abs(atk.gx - def.gx) + Math.abs(atk.gy - def.gy);
    const canCounter = dist === 1;
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
    return 'invCursor';   // weapon-select, items
  }

  _currentListLength() {
    if (this.gameState === 'menu')          return this.menuOptions.length;
    if (this.gameState === 'weapon-select') return this._getCombatWeapons().length;
    if (this.gameState === 'items')         return (this.selectedUnit?.weapons || []).length;
    if (this.gameState === 'item-action')   return this.itemActOptions.length;
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
    return (w.isMagic ? unit.moj : unit.pow) + (w.might || 0);
  }

  // Enter targeting mode and auto-snap cursor to nearest attackable enemy
  _enterTargeting() {
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
      this.selectedUnit.moved = true;
      this.battleLog = [`${this.selectedUnit.name}: used ${item.name}`];
      this.logT = 1800;
      this._resetSelection();

    } else if (opt === 'EQUIP') {
      this.selectedUnit.equippedWeapon = item;
      this.gameState     = 'menu';
      this.itemActCursor = 0;

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
    if (!this.selectedUnit) return { x: 4, y: 4, w: 120, h: 24 };
    const { x: sx, y: sy } = this._screenPos(this.selectedUnit.gx, this.selectedUnit.gy);
    const list = this.selectedUnit.weapons || [];
    const w = 120, h = Math.max(1, list.length) * 10 + 4;
    let x = sx + TILE_S + 1;
    if (x + w > GAME_W) x = sx - w - 1;
    let y = sy - 2;
    if (y + h > GAME_H - UI_H) y = GAME_H - UI_H - h - 2;
    return { x: Math.max(0, x), y: Math.max(0, y), w, h };
  }

  // Bounding rect for the item-action sub-menu (appears beside the selected row)
  _itemActRect(inv) {
    const w = 50, h = this.itemActOptions.length * 10 + 4;
    let x = inv.x + inv.w + 1;
    if (x + w > GAME_W) x = inv.x - w - 1;
    const y = Math.min(inv.y + 2 + this.invCursor * 10, Math.max(0, GAME_H - UI_H - h - 2));
    return { x: Math.max(0, x), y, w, h };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMBAT
  // ═══════════════════════════════════════════════════════════════════════════
  _doAttack(attacker, defender) {
    const tDef = TILE_DEF[this.grid[defender.gy][defender.gx]];
    const { dmg, doubles } = attacker.calcDamage(defender, tDef);

    // First hit (+ optional speed double)
    defender.hp -= dmg;
    let logLine = `${attacker.name} → ${defender.name}: ${dmg} dmg`;
    if (doubles && defender.alive) {
      defender.hp -= dmg;
      logLine += ' ×2';
    }

    // On-hit weapon effects (burn / poison)
    const aw = attacker.equippedWeapon;
    if (aw && aw.effect) {
      const fx = aw.effect;
      if (fx.type === 'burn' && !defender.hasStatus('burn') && Math.random() * 100 < fx.chance) {
        defender.addStatus('burn');
        logLine += ' [BURN]';
      } else if (fx.type === 'poison' && !defender.hasStatus('poison') && Math.random() * 100 < fx.chance) {
        defender.addStatus('poison');
        logLine += ' [POISON]';
      }
    }

    // Consume one weapon use
    attacker.decrementWeaponUses();

    this.battleLog = [logLine];

    // Counter-attack if defender survived and is adjacent
    if (defender.alive) {
      const dist = Math.abs(attacker.gx - defender.gx) + Math.abs(attacker.gy - defender.gy);
      if (dist === 1) {
        const aTDef = TILE_DEF[this.grid[attacker.gy][attacker.gx]];
        const { dmg: cdmg } = defender.calcDamage(attacker, aTDef);
        attacker.hp -= cdmg;
        defender.decrementWeaponUses();
        this.battleLog.push(`${defender.name} → ${attacker.name}: ${cdmg} dmg (counter)`);
      }
    }

    attacker.moved = true;
    this.logT = 2500;
    this._resetSelection();

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
    } else if (!enemiesLeft || !bossAlive) {
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
            pow:   lord.pow,   moj:   lord.moj,
            sp:    lord.sp,    lck:   lord.lck,
            def:   lord.def,   mdef:  lord.mdef,
            level: lord.level, xp:    lord.xp || 0,
            weapons:     lord.weapons.map(w => ({ ...w })),
            equippedIdx: lord.weapons.indexOf(lord.equippedWeapon),
          };
        }
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
    // Find nearest player unit
    let target = null, bestDist = 9999;
    for (const u of this.units) {
      if (u.faction === FACTION.PLAYER && u.alive) {
        const d = Math.abs(eu.gx - u.gx) + Math.abs(eu.gy - u.gy);
        if (d < bestDist) { bestDist = d; target = u; }
      }
    }
    if (!target) return;

    // Attack if adjacent
    if (bestDist === 1) { this._doAttack(eu, target); return; }

    // Move toward target (greedy step)
    let bestPos = { x: eu.gx, y: eu.gy };
    let bestD   = bestDist;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = eu.gx + dx, ny = eu.gy + dy;
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
      if (MOVE_COST[this.grid[ny][nx]] >= 99) continue;
      if (this._unitAt(nx, ny)) continue;
      const d = Math.abs(nx - target.gx) + Math.abs(ny - target.gy);
      if (d < bestD) { bestD = d; bestPos = { x: nx, y: ny }; }
    }
    eu.gx = bestPos.x;
    eu.gy = bestPos.y;

    // Attack after move if now adjacent
    const newDist = Math.abs(eu.gx - target.gx) + Math.abs(eu.gy - target.gy);
    if (newDist === 1) this._doAttack(eu, target);
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
    const s  = (sz, col) => ({ fontFamily: '"Press Start 2P", monospace', fontSize: `${sz}px`, color: col, depth: 5 });
    const uy = GAME_H - UI_H;

    this.txtPhase    = this.add.text(4, uy + 8,  '', s(7, C.PHASE_P)).setDepth(5);
    this.txtTurn     = this.add.text(4, uy + 18, '', s(6, C.DIM)).setDepth(5);
    this.txtUnitName = this.add.text(80, uy + 7,  '', s(7, C.TITLE)).setDepth(5);
    this.txtUnitInfo = this.add.text(80, uy + 17, '', s(6, C.TEXT)).setDepth(5);
    this.txtTile     = this.add.text(178, uy + 7,  '', s(6, C.DIM)).setDepth(5);
    this.txtTileDef  = this.add.text(178, uy + 17, '', s(6, C.DIM)).setDepth(5);
    this.txtStatus   = this.add.text(GAME_W/2, uy - 8, '', { ...s(8, C.TITLE), align: 'center' }).setOrigin(0.5).setDepth(5);
    this.txtHint     = this.add.text(GAME_W/2, uy - 2, '', { ...s(5, C.DIM), align:'center' }).setOrigin(0.5, 1).setDepth(5);
    this.txtXPLabel  = this.add.text(3, uy - 9, '', s(5, C.TITLE)).setDepth(6).setVisible(false);

    // Battle log container
    this.txtLog = [
      this.add.text(GAME_W/2, uy - 22, '', { ...s(6, C.TEXT), align: 'center' }).setOrigin(0.5).setDepth(6),
      this.add.text(GAME_W/2, uy - 12, '', { ...s(6, C.TEXT), align: 'center' }).setOrigin(0.5).setDepth(6),
    ];

    // End-screen texts
    this.txtEndTitle = this.add.text(GAME_W/2, GAME_H/2 - 12, '', { ...s(16, '#f0d060'), align: 'center' }).setOrigin(0.5).setDepth(10);
    this.txtEndSub   = this.add.text(GAME_W/2, GAME_H/2 + 6,  '', { ...s(7, C.TEXT), align: 'center' }).setOrigin(0.5).setDepth(10);
    this.txtEndHint  = this.add.text(GAME_W/2, GAME_H/2 + 20, '', { ...s(6, C.DIM), align: 'center' }).setOrigin(0.5).setDepth(10);

    // Combat forecast panel (shown when gameState==='targeting' and forecastTarget set)
    const fy = uy - 39;  // forecast panel top: y = 130-39 = 91
    this.txtFcAtkName = this.add.text(3,           fy + 3,  '', s(5, C.PHASE_P)).setDepth(6);
    this.txtFcAtkInfo = this.add.text(3,           fy + 13, '', s(5, C.TEXT)).setDepth(6);
    this.txtFcAtkHit  = this.add.text(3,           fy + 23, '', s(5, C.TEXT)).setDepth(6);
    this.txtFcVs      = this.add.text(GAME_W / 2,  fy + 17, 'vs', { ...s(5, C.DIM), align: 'center' }).setOrigin(0.5).setDepth(6);
    this.txtFcDefName = this.add.text(GAME_W/2+3,  fy + 3,  '', s(5, C.PHASE_E)).setDepth(6);
    this.txtFcDefInfo = this.add.text(GAME_W/2+3,  fy + 13, '', s(5, C.TEXT)).setDepth(6);
    this.txtFcDefHit  = this.add.text(GAME_W/2+3,  fy + 23, '', s(5, C.TEXT)).setDepth(6);
    this._fcTexts = [
      this.txtFcAtkName, this.txtFcAtkInfo, this.txtFcAtkHit,
      this.txtFcVs,
      this.txtFcDefName, this.txtFcDefInfo, this.txtFcDefHit,
    ];
    this._fcTexts.forEach(t => t.setVisible(false));

    // Action menu texts (up to 3 options, positioned dynamically near the unit)
    this.txtMenuItems = [
      this.add.text(0, 0, '', s(6, C.TEXT)).setDepth(6),
      this.add.text(0, 0, '', s(6, C.TEXT)).setDepth(6),
      this.add.text(0, 0, '', s(6, C.TEXT)).setDepth(6),
    ];
    this.txtMenuItems.forEach(t => t.setVisible(false));

    // Weapon-select panel (full-width bar, positioned dynamically)
    this.txtWselHeader = this.add.text(GAME_W / 2, 0, 'CHOOSE WEAPON', { ...s(5, C.DIM), align: 'center' })
                           .setOrigin(0.5, 0).setDepth(6).setVisible(false);
    this.txtWselRows = Array.from({ length: 4 }, () =>
      this.add.text(10, 0, '', s(5, C.TEXT)).setDepth(6).setVisible(false)
    );

    // Inventory list (items / item-action states, up to 5 rows)
    this.txtInvItems = Array.from({ length: 5 }, () =>
      this.add.text(0, 0, '', s(5, C.TEXT)).setDepth(6).setVisible(false)
    );

    // Item action sub-menu (USE/EQUIP + DROP)
    this.txtItemAct = Array.from({ length: 2 }, () =>
      this.add.text(0, 0, '', s(5, C.TEXT)).setDepth(7).setVisible(false)
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

        // Shade edges (right & bottom 1px)
        g.fillStyle(tc.shade, 1);
        g.fillRect(sx + TILE_S - 1, sy, 1, TILE_S);
        g.fillRect(sx, sy + TILE_S - 1, TILE_S, 1);

        // Grid line
        g.lineStyle(0.5, 0x000000, 0.25);
        g.strokeRect(sx, sy, TILE_S, TILE_S);
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
      g.fillRect(sx + 1, sy + 1, TILE_S - 2, TILE_S - 5);

      // Border
      const bdCol = u.faction === FACTION.PLAYER ? 0xffffff : 0x000000;
      g.lineStyle(1, bdCol, 0.8);
      g.strokeRect(sx + 1, sy + 1, TILE_S - 2, TILE_S - 5);

      // HP bar
      const hpPct = u.hp / u.maxHp;
      g.fillStyle(C.HP_BG, 1);
      g.fillRect(sx + 1, sy + TILE_S - 3, TILE_S - 2, 2);
      g.fillStyle(hpPct > 0.4 ? C.HP_FULL : C.HP_LOW, 1);
      g.fillRect(sx + 1, sy + TILE_S - 3, Math.floor((TILE_S - 2) * hpPct), 2);

      // Lord crown marker
      if (u.isLord) {
        g.fillStyle(C.CURSOR, 1);
        g.fillRect(sx + 5, sy + 2, 4, 3);
        g.fillRect(sx + 4, sy + 2, 1, 2);
        g.fillRect(sx + 10, sy + 2, 1, 2);
      }

      // Boss marker
      if (u.isBoss) {
        g.fillStyle(0xff00ff, 1);
        g.fillRect(sx + 4, sy + 2, 6, 2);
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

    g.lineStyle(1.5, C.CURSOR, 1);
    g.strokeRect(sx, sy, TILE_S, TILE_S);

    // Corner ticks (GBA-style)
    const hl = 3;
    g.lineStyle(2, C.CURSOR, 1);
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

    // ── Combat forecast panel (above HUD, targeting mode only) ─────────────
    if (this.gameState === 'targeting' && this.forecastTarget) {
      const fy = uy - 39;
      g.fillStyle(C.PANEL_BG, 0.95);
      g.fillRect(0, fy, GAME_W, 39);
      g.lineStyle(1, C.PANEL_BD, 1);
      g.strokeLineShape(new Phaser.Geom.Line(0, fy, GAME_W, fy));
      // Centre divider
      g.lineStyle(0.5, C.PANEL_BD, 0.5);
      g.strokeLineShape(new Phaser.Geom.Line(GAME_W/2, fy + 2, GAME_W/2, fy + 37));
    }

    // ── Weapon-select: full-width bar just above the HUD ─────────────────────
    if (this.gameState === 'weapon-select' && this.selectedUnit) {
      const cw = this._getCombatWeapons();
      const ph = 13 + Math.min(4, cw.length) * 11;
      const py = uy - ph;
      g.fillStyle(C.PANEL_BG, 0.96);
      g.fillRect(0, py, GAME_W, ph);
      g.lineStyle(1, C.PANEL_BD, 1);
      g.strokeLineShape(new Phaser.Geom.Line(0, py, GAME_W, py));
      g.lineStyle(0.5, C.PANEL_BD, 0.5);
      g.strokeLineShape(new Phaser.Geom.Line(8, py + 11, GAME_W - 8, py + 11));
      // Highlight selected row
      g.fillStyle(C.SEL_BD, 0.25);
      g.fillRect(2, py + 13 + this.invCursor * 11, GAME_W - 4, 10);
    }

    // ── Inventory popup (items / item-action states) ───────────────────────
    if (['items', 'item-action'].includes(this.gameState) && this.selectedUnit) {
      const r = this._invRect();
      g.fillStyle(C.PANEL_BG, 0.96);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(1.5, C.PANEL_BD, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.fillStyle(C.SEL_BD, 0.2);
      g.fillRect(r.x + 1, r.y + 2 + this.invCursor * 10, r.w - 2, 9);

      if (this.gameState === 'item-action') {
        const ar = this._itemActRect(r);
        g.fillStyle(C.PANEL_BG, 0.96);
        g.fillRect(ar.x, ar.y, ar.w, ar.h);
        g.lineStyle(1.5, C.PANEL_BD, 1);
        g.strokeRect(ar.x, ar.y, ar.w, ar.h);
        g.fillStyle(C.SEL_BD, 0.2);
        g.fillRect(ar.x + 1, ar.y + 2 + this.itemActCursor * 10, ar.w - 2, 9);
      }
    }

    // ── Action menu panel (near selected unit, menu state only) ────────────
    if (this.gameState === 'menu' && this.selectedUnit) {
      const r = this._menuRect();
      g.fillStyle(C.PANEL_BG, 0.96);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(1.5, C.PANEL_BD, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
      // Highlight selected row
      g.fillStyle(C.SEL_BD, 0.2);
      g.fillRect(r.x + 1, r.y + 2 + this.menuCursor * 12, r.w - 2, 11);
    }

    // ── XP gain bar (just above HUD, shown while xpAnim is running) ──────────
    if (this.xpAnim) {
      const by = uy - 10;
      g.fillStyle(0x0d0d24, 0.95);
      g.fillRect(0, by, GAME_W, 10);
      g.lineStyle(1, C.PANEL_BD, 0.8);
      g.strokeLineShape(new Phaser.Geom.Line(0, by, GAME_W, by));
      // Track
      const barX = 82, barW = GAME_W - 88;
      g.fillStyle(0x1a1a30, 1);
      g.fillRect(barX, by + 2, barW, 6);
      // Fill (gold)
      const fill = Math.floor(barW * Math.min(1, this.xpAnim.displayXP / 100));
      if (fill > 0) {
        g.fillStyle(0xf0d060, 1);
        g.fillRect(barX, by + 2, fill, 6);
      }
      g.lineStyle(0.5, C.PANEL_BD, 0.5);
      g.strokeRect(barX, by + 2, barW, 6);
    }

    // ── Main HUD background ─────────────────────────────────────────────────
    g.fillStyle(0x0d0d24, 0.95);
    g.fillRect(0, uy, GAME_W, UI_H);
    g.lineStyle(1, C.PANEL_BD, 1);
    g.strokeLineShape(new Phaser.Geom.Line(0, uy, GAME_W, uy));

    g.lineStyle(0.5, C.PANEL_BD, 0.5);
    g.strokeLineShape(new Phaser.Geom.Line(74,  uy, 74,  GAME_H));
    g.strokeLineShape(new Phaser.Geom.Line(172, uy, 172, GAME_H));

    // Battle log background (hidden while forecast is showing)
    if (this.battleLog.length > 0 && !(this.gameState === 'targeting' && this.forecastTarget)) {
      const rows = this.battleLog.length;
      g.fillStyle(0x0d0d24, 0.92);
      g.fillRect(20, uy - rows * 11 - 4, GAME_W - 40, rows * 11 + 6);
      g.lineStyle(1, C.PANEL_BD, 1);
      g.strokeRect(20, uy - rows * 11 - 4, GAME_W - 40, rows * 11 + 6);
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
    const w = 58, h = this.menuOptions.length * 12 + 4;
    let x = sx + TILE_S + 1;
    if (x + w > GAME_W) x = sx - w - 1;
    let y = sy - 2;
    if (y + h > GAME_H - UI_H) y = GAME_H - UI_H - h - 2;
    if (y < 0) y = 0;
    return { x, y, w, h };
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
      const isMagic = u.moj > u.pow;
      this.txtUnitName.setText(`${u.name}  Lv.${u.level}`);
      this.txtUnitInfo.setText(
        `HP ${u.hp}/${u.maxHp}  ` +
        (isMagic ? `Mj${u.moj}  MD${u.mdef}` : `Pw${u.pow}  Df${u.def}`)
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

    // ── Combat forecast panel texts ───────────────────────────────────────
    const showFc = this.gameState === 'targeting' && !!this.forecastTarget;
    this._fcTexts.forEach(t => t.setVisible(showFc));
    if (showFc) {
      const fc  = this._calcForecast(this.selectedUnit, this.forecastTarget);
      const atk = this.selectedUnit;
      const def = this.forecastTarget;
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

    // ── Action menu texts ─────────────────────────────────────────────────
    this.txtMenuItems.forEach(t => t.setVisible(false));
    if (this.gameState === 'menu' && this.selectedUnit) {
      const r = this._menuRect();
      for (let i = 0; i < this.menuOptions.length; i++) {
        const sel = i === this.menuCursor;
        this.txtMenuItems[i]
          .setText((sel ? '>' : ' ') + ' ' + this.menuOptions[i])
          .setPosition(r.x + 4, r.y + 2 + i * 12)
          .setColor(sel ? C.TITLE : C.TEXT)
          .setVisible(true);
      }
    }

    // ── Weapon-select panel ───────────────────────────────────────────────
    this.txtWselHeader.setVisible(false);
    this.txtWselRows.forEach(t => t.setVisible(false));
    if (this.gameState === 'weapon-select' && this.selectedUnit) {
      const cw = this._getCombatWeapons();
      const ph = 13 + Math.min(4, cw.length) * 11;
      const py = uy - ph;
      this.txtWselHeader.setY(py + 2).setVisible(true);
      for (let i = 0; i < Math.min(cw.length, 4); i++) {
        const w    = cw[i];
        const sel  = i === this.invCursor;
        const eq   = (w === this.selectedUnit.equippedWeapon) ? '[E]' : '   ';
        const atk  = this._weaponAtk(this.selectedUnit, w);
        const type = this._weaponTypeAbbr(w);
        const nm   = w.name.slice(0, 12).padEnd(12);
        this.txtWselRows[i]
          .setText(`${sel ? '>' : ' '} ${eq} ${nm}  Atk:${atk} ${type} ${w.uses}/${w.maxUses}`)
          .setY(py + 14 + i * 11)
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
          .setText(`${isSel ? '>' : ' '}${eq}${item.name}  ${item.uses}/${item.maxUses}`)
          .setPosition(r.x + 3, r.y + 2 + i * 10)
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
          .setText((sel ? '>' : ' ') + ' ' + this.itemActOptions[i])
          .setPosition(ar.x + 3, ar.y + 2 + i * 10)
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

    // Status message (hide while forecast or XP bar is shown)
    this.txtStatus.setText((showFc || showXP) ? '' : this.statusMsg);

    // Hint line (hidden while XP bar is visible)
    this.txtHint.setVisible(!showXP);
    this.txtHint.setText(
      this.gameState === 'targeting'
        ? (this.forecastTarget ? 'X:attack  Z:back' : 'aim at enemy  Z:back')
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
      this.txtLog[i].setY(uy - (2 - i) * 11 - 2);
    }

    // End screen
    const isEnd = this.phase === PHASE.GAME_OVER || this.phase === PHASE.VICTORY;
    this.txtEndTitle.setVisible(isEnd);
    this.txtEndSub.setVisible(isEnd);
    this.txtEndHint.setVisible(isEnd);

    if (this.phase === PHASE.VICTORY) {
      if (this.runComplete) {
        this.txtEndTitle.setText('CONQUERED!').setColor('#f0d060');
        this.txtEndSub.setText('All 5 floors cleared!');
      } else {
        this.txtEndTitle.setText('FLOOR CLEAR').setColor('#f0d060');
        this.txtEndSub.setText(`Advance to floor ${this.saveData.currentLevel}`);
      }
      this.txtEndHint.setText(this.blinkOn ? 'Press X to return to title' : '');
    } else if (this.phase === PHASE.GAME_OVER) {
      this.txtEndTitle.setText('GAME OVER').setColor('#e05050');
      this.txtEndSub.setText('Your lord has fallen.');
      this.txtEndHint.setText(this.blinkOn ? 'Press X to return to title' : '');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Apply poison DoT to all living units of the given faction; show in battle log.
  _tickStatusEffects(faction) {
    const msgs = [];
    this.units.filter(u => u.faction === faction && u.alive).forEach(u => {
      const dmg = u.tickPoison();
      if (dmg > 0) msgs.push(`${u.name}: ${dmg} poison`);
    });
    if (msgs.length > 0) {
      this.battleLog = msgs.slice(0, 2);
      this.logT = 1500;
      this._removeDead();
      this._checkEndCondition();
    }
  }

  _unitAt(x, y) {
    return this.units.find(u => u.gx === x && u.gy === y && u.alive) || null;
  }

  _tilePassable(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    return MOVE_COST[this.grid[y][x]] < 99;
  }
}
