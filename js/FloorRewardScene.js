// ─── FloorRewardScene.js ─────────────────────────────────────────────────────
// Shown after every non-final floor is cleared. Player picks one of three
// randomly offered upgrades before advancing to the next floor.

class FloorRewardScene extends Phaser.Scene {
  constructor() { super({ key: 'FloorReward' }); }

  init(data) {
    this.saveData  = data.saveData;
    this.slotIndex = data.slotIndex;
  }

  // ── Upgrade pool ─────────────────────────────────────────────────────────────
  static POOL = [
    { id: 'repair',    label: 'Repair Items',  desc: 'Restore all items by half their max uses.'      },
    { id: 'full_heal', label: 'Full Heal',      desc: 'Fully restore the lord\'s HP.'                  },
    { id: 'level_up',  label: 'Level Up',       desc: 'Gain one level. Stat bonuses roll immediately.' },
    { id: 'duplicate', label: 'Duplicate Item', desc: 'Select one item to receive a full-uses copy.'   },
  ];

  create() {
    this.gameState  = 'select';
    this.cursor     = 0;
    this.itemCursor = 0;
    this.lordUnit   = this._buildLordUnit();
    this.upgrades   = this._pickUpgrades(3);

    this.gfx = this.add.graphics();
    this.keys = this.input.keyboard.addKeys({
      up:      Phaser.Input.Keyboard.KeyCodes.UP,
      down:    Phaser.Input.Keyboard.KeyCodes.DOWN,
      w:       Phaser.Input.Keyboard.KeyCodes.W,
      s:       Phaser.Input.Keyboard.KeyCodes.S,
      confirm: Phaser.Input.Keyboard.KeyCodes.X,
      enter:   Phaser.Input.Keyboard.KeyCodes.ENTER,
      cancel:  Phaser.Input.Keyboard.KeyCodes.Z,
      esc:     Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this._buildText();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  // ── Reconstruct a live Unit from saveData so we can call levelUp() on it ─────
  _buildLordUnit() {
    const ld = LORD_DEFS[this.saveData.selectedLord];
    const ps = this.saveData.playerStats;

    const lord = new Unit({
      name: ld.label, faction: FACTION.PLAYER,
      gx: 0, gy: 0,
      ...ld.stats,
      level: 1, growths: ld.growths, moveCosts: ld.moveCosts,
      className: ld.className,
      color: ld.color, symbol: '♞', isLord: true,
      weapons: [],
    });

    if (ps) {
      lord.maxHp = ps.maxHp;  lord.hp   = ps.hp;
      lord.pow   = ps.pow;    lord.moj  = ps.moj;
      lord.sp    = ps.sp;     lord.lck  = ps.lck;
      lord.def   = ps.def;    lord.mdef = ps.mdef;
      lord.level = ps.level;  lord.xp   = ps.xp || 0;
      lord.weapons = (ps.weapons || []).map(w => {
        const c = { ...w };
        if (c.effect) c.effect = { ...c.effect };
        return c;
      });
      lord.equippedWeapon =
        (ps.equippedIdx >= 0 ? lord.weapons[ps.equippedIdx] : null)
        || lord.weapons.find(w => !w.isStaff && !w.isConsumable)
        || lord.weapons[0] || null;
    }
    return lord;
  }

  // ── Pick n distinct upgrades; exclude 'duplicate' if inventory is empty ───────
  _pickUpgrades(n) {
    const hasItems = (this.saveData.playerStats?.weapons || []).length > 0;
    const pool     = FloorRewardScene.POOL.filter(u => u.id !== 'duplicate' || hasItems);
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  }

  // ── Build all text objects ────────────────────────────────────────────────────
  _buildText() {
    const f = (sz, col) => ({
      fontFamily: '"Barlow Condensed", sans-serif',
      fontSize: `${sz}px`,
      color: col,
    });

    this.txtTitle = this.add.text(GAME_W / 2, 44, 'CHOOSE YOUR REWARD', f(38, C.TITLE))
      .setOrigin(0.5).setDepth(2);
    this.txtSub = this.add.text(GAME_W / 2, 96,
      `Floor ${this.saveData.currentLevel - 1} cleared!`, f(22, C.DIM))
      .setOrigin(0.5).setDepth(2);
    this.txtHint = this.add.text(GAME_W / 2, GAME_H - 32, '', f(20, C.DIM))
      .setOrigin(0.5).setDepth(2);

    // Card rows — one label + description per upgrade slot
    this.txtCardLabels = Array.from({ length: 3 }, () =>
      this.add.text(0, 0, '', f(26, C.TEXT)).setDepth(2)
    );
    this.txtCardDescs = Array.from({ length: 3 }, () =>
      this.add.text(0, 0, '', f(18, C.DIM)).setDepth(2)
    );

    // Item-pick overlay
    this.txtPickHeader = this.add.text(0, 0, 'Select an item to duplicate:', f(22, C.TITLE))
      .setDepth(4).setVisible(false);
    this.txtPickItems = Array.from({ length: 6 }, () =>
      this.add.text(0, 0, '', f(20, C.TEXT)).setDepth(4).setVisible(false)
    );
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────
  update() {
    const jd = k => Phaser.Input.Keyboard.JustDown(k);

    // Resumed from LevelUp scene — lord stats are already updated; now save + go
    if (this.gameState === 'levelup_wait') {
      this._saveLordStats();
      this._fadeToGameMap();
    }

    if (this.gameState === 'transitioning') {
      this._render();
      return;
    }

    if (this.gameState === 'select') {
      const count = this.upgrades.length;
      if (jd(this.keys.up)   || jd(this.keys.w))    this.cursor = (this.cursor - 1 + count) % count;
      if (jd(this.keys.down) || jd(this.keys.s))    this.cursor = (this.cursor + 1) % count;
      if (jd(this.keys.confirm) || jd(this.keys.enter)) this._confirmUpgrade();
    }

    if (this.gameState === 'item-pick') {
      const items = this.lordUnit.weapons;
      if (jd(this.keys.up)   || jd(this.keys.w))    this.itemCursor = Math.max(0, this.itemCursor - 1);
      if (jd(this.keys.down) || jd(this.keys.s))    this.itemCursor = Math.min(items.length - 1, this.itemCursor + 1);
      if (jd(this.keys.confirm) || jd(this.keys.enter)) this._confirmDuplicate();
      if (jd(this.keys.cancel)  || jd(this.keys.esc))   this.gameState = 'select';
    }

    this._render();
  }

  // ── Apply the highlighted upgrade ─────────────────────────────────────────────
  _confirmUpgrade() {
    const upg = this.upgrades[this.cursor];

    switch (upg.id) {
      case 'repair':
        this.lordUnit.weapons.forEach(w => {
          w.uses = Math.min(w.maxUses, w.uses + Math.floor(w.maxUses / 2));
        });
        this._saveLordStats();
        this._fadeToGameMap();
        break;

      case 'full_heal':
        this.lordUnit.hp = this.lordUnit.maxHp;
        this._saveLordStats();
        this._fadeToGameMap();
        break;

      case 'level_up': {
        const gained = this.lordUnit.levelUp();
        this.gameState = 'levelup_wait';
        this.scene.launch('LevelUp', { unit: this.lordUnit, gained, callerKey: 'FloorReward' });
        this.scene.pause();
        break;
      }

      case 'duplicate':
        this.itemCursor = 0;
        this.gameState  = 'item-pick';
        break;
    }
  }

  // ── Duplicate: push a full-uses clone of the chosen item ──────────────────────
  _confirmDuplicate() {
    const item = this.lordUnit.weapons[this.itemCursor];
    if (!item) return;
    const copy = { ...item };
    if (copy.effect) copy.effect = { ...copy.effect };
    copy.uses = copy.maxUses;
    this.lordUnit.weapons.push(copy);
    this._saveLordStats();
    this._fadeToGameMap();
  }

  // ── Write lord state back into saveData and persist to localStorage ───────────
  _saveLordStats() {
    const lord = this.lordUnit;
    this.saveData.playerStats = {
      maxHp: lord.maxHp, hp:    lord.hp,
      pow:   lord.pow,   moj:   lord.moj,
      sp:    lord.sp,    lck:   lord.lck,
      def:   lord.def,   mdef:  lord.mdef,
      level: lord.level, xp:    lord.xp || 0,
      weapons:     lord.weapons.map(w => ({ ...w })),
      equippedIdx: lord.weapons.indexOf(lord.equippedWeapon),
    };
    SaveData.save(this.slotIndex, this.saveData);
  }

  _fadeToGameMap() {
    this.gameState = 'transitioning';
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameMap', { saveData: this.saveData, slotIndex: this.slotIndex });
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────
  _render() {
    const g = this.gfx;
    g.clear();

    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GAME_W, GAME_H);

    this._renderCards(g);

    if (this.gameState === 'item-pick') {
      this._renderItemPick(g);
    } else {
      this.txtPickHeader.setVisible(false);
      this.txtPickItems.forEach(t => t.setVisible(false));
    }
  }

  _renderCards(g) {
    const cardW = 640, cardH = 110;
    const cardX = (GAME_W - cardW) / 2;
    const startY = 144;
    const gap    = 18;

    for (let i = 0; i < this.upgrades.length; i++) {
      const upg = this.upgrades[i];
      const y   = startY + i * (cardH + gap);
      const sel = i === this.cursor && this.gameState === 'select';

      g.fillStyle(sel ? 0x1a2a4a : 0x111122, 0.98);
      g.fillRect(cardX, y, cardW, cardH);
      g.lineStyle(sel ? 3 : 2, sel ? C.CURSOR : C.PANEL_BD, 1);
      g.strokeRect(cardX, y, cardW, cardH);

      if (sel) {
        g.fillStyle(C.CURSOR, 1);
        g.fillRect(cardX, y, 6, cardH);
      }

      this.txtCardLabels[i]
        .setText(`${sel ? '▶' : '   '}  ${upg.label}`)
        .setPosition(cardX + 24, y + 18)
        .setColor(sel ? C.TITLE : C.TEXT)
        .setVisible(true);

      this.txtCardDescs[i]
        .setText(upg.desc)
        .setPosition(cardX + 56, y + 66)
        .setVisible(true);
    }

    for (let i = this.upgrades.length; i < 3; i++) {
      this.txtCardLabels[i].setVisible(false);
      this.txtCardDescs[i].setVisible(false);
    }

    this.txtHint.setText(this.gameState === 'item-pick' ? '' : 'W/S: navigate   X: select');
  }

  _renderItemPick(g) {
    const items = this.lordUnit.weapons;
    const rowH  = 48;
    const popW  = 500;
    const popH  = items.length * rowH + 80;
    const popX  = (GAME_W - popW) / 2;
    const popY  = (GAME_H - popH) / 2;

    g.fillStyle(C.PANEL_BG, 0.98);
    g.fillRect(popX, popY, popW, popH);
    g.lineStyle(4, C.PANEL_BD, 1);
    g.strokeRect(popX, popY, popW, popH);

    g.fillStyle(C.SEL_BD, 0.22);
    g.fillRect(popX + 4, popY + 44 + this.itemCursor * rowH, popW - 8, rowH - 4);

    this.txtPickHeader.setPosition(popX + 16, popY + 8).setVisible(true);
    this.txtHint.setText('X: duplicate   Z: cancel');

    for (let i = 0; i < Math.min(items.length, this.txtPickItems.length); i++) {
      const item = items[i];
      const sel  = i === this.itemCursor;
      const eq   = (item === this.lordUnit.equippedWeapon) ? '*' : ' ';
      this.txtPickItems[i]
        .setText(`${sel ? '▶' : ' '}${eq} ${item.name}  ${item.uses}/${item.maxUses}`)
        .setPosition(popX + 16, popY + 46 + i * rowH)
        .setColor(sel ? C.TITLE : C.TEXT)
        .setVisible(true);
    }
    for (let i = items.length; i < this.txtPickItems.length; i++) {
      this.txtPickItems[i].setVisible(false);
    }
  }
}
