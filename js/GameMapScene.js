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

    this.blinkOn  = true;
    this.blinkT   = 0;
    this.statusMsg = 'Player Phase';
    this.statusT   = 2000;
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
    const midY = Math.floor(MAP_H / 2);
    const ld   = LORD_DEFS[this.saveData.selectedLord];

    // Lord only — player starts each map alone
    this.units.push(new Unit({
      name: ld.label, faction: FACTION.PLAYER,
      gx: 1, gy: midY,
      ...ld.stats,
      level: 1, growths: ld.growths, moveCosts: ld.moveCosts,
      className: ld.className,
      color: ld.color, symbol: '♞', isLord: true,
    }));

    // Enemies (random positions on right half)
    const eTypes = [
      {
        name: 'Grunt',       className: 'Grunt',
        color: 0xc04040, symbol: '♟',
        hp: 14, pow: 7,  moj: 0,  sp: 4, lck: 2, def: 4, mdef: 2, move: 4,
        moveCosts: CLASSES.GRUNT.moveCosts,
      },
      {
        name: 'Fletcher',    className: 'Fletcher',
        color: 0xc07030, symbol: '♝',
        hp: 12, pow: 8,  moj: 0,  sp: 6, lck: 3, def: 2, mdef: 1, move: 6,
        moveCosts: CLASSES.FLETCHER.moveCosts,
      },
      {
        name: 'Necromancer', className: 'Necromancer',
        color: 0x9030c0, symbol: '♜',
        hp: 10, pow: 2,  moj: 10, sp: 5, lck: 4, def: 1, mdef: 5, move: 5,
        moveCosts: CLASSES.NECROMANCER.moveCosts,
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

    // Boss on throne
    if (this.thronePos && !this._unitAt(this.thronePos.x, this.thronePos.y)) {
      this.units.push(new Unit({
        name: 'General', className: 'Bulwark', faction: FACTION.ENEMY,
        gx: this.thronePos.x, gy: this.thronePos.y,
        hp: 30, pow: 12, moj: 3, sp: 4, lck: 5, def: 7, mdef: 4, move: 3,
        color: 0xe030e0, symbol: '♚', isBoss: true,
        moveCosts: CLASSES.BULWARK.moveCosts,
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

    // Status screen — available during player or enemy phase
    if (jd(this.keys.e)) {
      const inspected = this._unitAt(this.cursorX, this.cursorY);
      if (inspected) {
        this.scene.launch('Status', { unit: inspected, callerKey: 'GameMap' });
        this.scene.pause();
        return;
      }
    }

    if (this.phase === PHASE.ENEMY_TURN) return;

    if (jd(this.keys.up)    || jd(this.keys.w)) this._moveCursor(0, -1);
    if (jd(this.keys.down)  || jd(this.keys.s)) this._moveCursor(0,  1);
    if (jd(this.keys.left)  || jd(this.keys.a)) this._moveCursor(-1, 0);
    if (jd(this.keys.right) || jd(this.keys.d)) this._moveCursor(1,  0);
    if (jd(this.keys.confirm) || jd(this.keys.enter)) this._onConfirm();
    if (jd(this.keys.cancel)  || jd(this.keys.esc))   this._deselect();
  }

  _moveCursor(dx, dy) {
    this.cursorX = Math.max(0, Math.min(MAP_W-1, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(MAP_H-1, this.cursorY + dy));
    this._computeCamera();
  }

  _onConfirm() {
    const u = this._unitAt(this.cursorX, this.cursorY);
    const key = `${this.cursorX},${this.cursorY}`;

    if (!this.selectedUnit) {
      // Select a player unit
      if (u && u.faction === FACTION.PLAYER && !u.moved) {
        this.selectedUnit = u;
        this.moveRange   = u.computeMoveRange(this.grid, this.units);
        this.attackRange = u.computeAttackRange(this.moveRange);
      }
      return;
    }

    // Unit already selected:
    if (u && u.faction === FACTION.ENEMY && this.attackRange.has(key)) {
      // Attack
      this._doAttack(this.selectedUnit, u);
      return;
    }
    if (this.moveRange.has(key) && (!u || u === this.selectedUnit)) {
      // Move
      this.selectedUnit.gx = this.cursorX;
      this.selectedUnit.gy = this.cursorY;
      // Recompute attack-only range from new position
      const singleTile = new Map([[`${this.cursorX},${this.cursorY}`, 0]]);
      this.moveRange   = singleTile;
      this.attackRange = this.selectedUnit.computeAttackRange(singleTile);
      return;
    }
    if (u && u.faction === FACTION.ENEMY && this.attackRange.has(key)) {
      this._doAttack(this.selectedUnit, u);
      return;
    }
    // Clicked on own unit — switch selection
    if (u && u.faction === FACTION.PLAYER && !u.moved) {
      this.selectedUnit = u;
      this.moveRange   = u.computeMoveRange(this.grid, this.units);
      this.attackRange = u.computeAttackRange(this.moveRange);
      return;
    }
    // Clicked empty / impassable — mark unit done if it has moved
    if (!u || u === this.selectedUnit) {
      if (this.selectedUnit.gx !== this.selectedUnit._origX || true) {
        this.selectedUnit.moved = true;
        this._deselect();
      }
    }
  }

  _deselect() {
    this.selectedUnit = null;
    this.moveRange    = new Map();
    this.attackRange  = new Set();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMBAT
  // ═══════════════════════════════════════════════════════════════════════════
  _doAttack(attacker, defender) {
    const tDef = TILE_DEF[this.grid[defender.gy][defender.gx]];
    const { dmg, doubles } = attacker.calcDamage(defender, tDef);

    // First hit
    defender.hp -= dmg;
    this.battleLog = [`${attacker.name} → ${defender.name}: ${dmg} dmg`];

    // Speed-doubling: second hit before counter if attacker SP ≥ defender SP + 4
    if (doubles && defender.alive) {
      defender.hp -= dmg;
      this.battleLog[0] += ` ×2`;
    }

    // Counter-attack if defender still alive and adjacent
    if (defender.alive) {
      const dist = Math.abs(attacker.gx - defender.gx) + Math.abs(attacker.gy - defender.gy);
      if (dist === 1) {
        const aTDef = TILE_DEF[this.grid[attacker.gy][attacker.gx]];
        const { dmg: cdmg } = defender.calcDamage(attacker, aTDef);
        attacker.hp -= cdmg;
        this.battleLog.push(`${defender.name} → ${attacker.name}: ${cdmg} dmg (counter)`);
      }
    }

    attacker.moved = true;
    this.logT = 2500;
    this._deselect();
    this._removeDead();
    this._checkEndCondition();
  }

  _removeDead() {
    this.units = this.units.filter(u => u.alive);
  }

  _checkEndCondition() {
    const lordAlive    = this.units.some(u => u.faction === FACTION.PLAYER && u.isLord);
    const enemiesLeft  = this.units.some(u => u.faction === FACTION.ENEMY);
    const bossAlive    = this.units.some(u => u.isBoss);

    if (!lordAlive) {
      this.phase = PHASE.GAME_OVER;
    } else if (!enemiesLeft || !bossAlive) {
      this.phase = PHASE.VICTORY;
      this.saveData.currentLevel++;
      SaveData.save(this.slotIndex, this.saveData);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TURN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  _endPlayerTurn() {
    this._deselect();
    this.phase      = PHASE.ENEMY_TURN;
    this.statusMsg  = 'Enemy Phase';
    this.statusT    = 99999;
    this.enemyQueue = this.units.filter(u => u.faction === FACTION.ENEMY && u.alive);
    this.enemyIdx   = 0;
    this.enemyDelay = 600;
  }

  _tickEnemyTurn(delta) {
    this.enemyDelay -= delta;
    if (this.enemyDelay > 0) return;

    if (this.enemyIdx >= this.enemyQueue.length) {
      // Enemy turn over
      this.units.forEach(u => { if (u.faction === FACTION.PLAYER) u.moved = false; });
      this.turnNumber++;
      this.phase     = PHASE.PLAYER_TURN;
      this.statusMsg = `Player Phase – Turn ${this.turnNumber}`;
      this.statusT   = 2000;
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

    // Battle log container
    this.txtLog = [
      this.add.text(GAME_W/2, uy - 22, '', { ...s(6, C.TEXT), align: 'center' }).setOrigin(0.5).setDepth(6),
      this.add.text(GAME_W/2, uy - 12, '', { ...s(6, C.TEXT), align: 'center' }).setOrigin(0.5).setDepth(6),
    ];

    // End-screen texts
    this.txtEndTitle = this.add.text(GAME_W/2, GAME_H/2 - 12, '', { ...s(16, '#f0d060'), align: 'center' }).setOrigin(0.5).setDepth(10);
    this.txtEndSub   = this.add.text(GAME_W/2, GAME_H/2 + 6,  '', { ...s(7, C.TEXT), align: 'center' }).setOrigin(0.5).setDepth(10);
    this.txtEndHint  = this.add.text(GAME_W/2, GAME_H/2 + 20, '', { ...s(6, C.DIM), align: 'center' }).setOrigin(0.5).setDepth(10);
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

    // HUD background
    g.fillStyle(0x0d0d24, 0.95);
    g.fillRect(0, uy, GAME_W, UI_H);
    g.lineStyle(1, C.PANEL_BD, 1);
    g.strokeLineShape(new Phaser.Geom.Line(0, uy, GAME_W, uy));

    // Dividers
    g.lineStyle(0.5, C.PANEL_BD, 0.5);
    g.strokeLineShape(new Phaser.Geom.Line(74, uy, 74, GAME_H));
    g.strokeLineShape(new Phaser.Geom.Line(172, uy, 172, GAME_H));

    // Battle log background
    if (this.battleLog.length > 0) {
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

  _updateHudText() {
    const uy = GAME_H - UI_H;

    // Phase
    const isPlayer = this.phase === PHASE.PLAYER_TURN;
    this.txtPhase.setColor(isPlayer ? C.PHASE_P : C.PHASE_E);
    this.txtPhase.setText(isPlayer ? 'PLAYER TURN' : 'ENEMY TURN');
    this.txtTurn.setText(`Turn ${this.turnNumber}`);

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

    // Status message
    this.txtStatus.setText(this.statusMsg);
    this.txtHint.setText(
      this.selectedUnit ? 'X:act  Z:cancel' :
      this.phase === PHASE.PLAYER_TURN ? 'X:select  Z:cancel' : ''
    );

    // Battle log
    for (let i = 0; i < 2; i++) {
      this.txtLog[i].setText(this.battleLog[i] || '');
      this.txtLog[i].setY(uy - (2 - i) * 11 - 2);
    }

    // End screen
    const isEnd = this.phase === PHASE.GAME_OVER || this.phase === PHASE.VICTORY;
    this.txtEndTitle.setVisible(isEnd);
    this.txtEndSub.setVisible(isEnd);
    this.txtEndHint.setVisible(isEnd);

    if (this.phase === PHASE.VICTORY) {
      this.txtEndTitle.setText('VICTORY!').setColor('#f0d060');
      this.txtEndSub.setText('The enemy is defeated!');
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
  _unitAt(x, y) {
    return this.units.find(u => u.gx === x && u.gy === y && u.alive) || null;
  }

  _tilePassable(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    return MOVE_COST[this.grid[y][x]] < 99;
  }
}
