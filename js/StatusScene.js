// ─── StatusScene.js ───────────────────────────────────────────────────────────
// Stats overlay with two modes:
//   stats view  — portrait + stat sheet + scrollable item list
//   item view   — selected item's full stats and description
//
// Stats view controls:  W/S or Up/Down = scroll item list
//                       E             = open item detail (if unit has items)
//                       X / Z / Esc   = close
// Item view controls:   E/X/Z/Esc     = back to stats view

class StatusScene extends Phaser.Scene {
  constructor() { super({ key: 'Status' }); }

  init(data) {
    this.unit      = data.unit;
    this.callerKey = data.callerKey || 'GameMap';
  }

  // ── Layout constants ───────────────────────────────────────────────────────
  static PX = 8;   static PY = 8;   static PW = 70;  static PH = 102;
  static SX = 84;  static SY = 8;
  static PANEL_H  = 144;  // expanded from 132 to fit item list
  static IX       = 84;   // item list x (same column as stats)
  static IY_HDR   = 104;  // "ITEMS" label y
  static IY_START = 113;  // first item row y
  static I_STEP   = 9;    // px per row
  static I_VIS    = 3;    // max visible rows (scrolls beyond this)

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  create() {
    this.view       = 'stats';
    this.itemCursor = 0;
    this.scrollOff  = 0;

    this.gfx     = this.add.graphics();
    this.portImg = null;

    this.keys = this.input.keyboard.addKeys({
      up:      Phaser.Input.Keyboard.KeyCodes.UP,
      down:    Phaser.Input.Keyboard.KeyCodes.DOWN,
      w:       Phaser.Input.Keyboard.KeyCodes.W,
      s:       Phaser.Input.Keyboard.KeyCodes.S,
      e:       Phaser.Input.Keyboard.KeyCodes.E,
      confirm: Phaser.Input.Keyboard.KeyCodes.X,
      cancel:  Phaser.Input.Keyboard.KeyCodes.Z,
      enter:   Phaser.Input.Keyboard.KeyCodes.ENTER,
      esc:     Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this._buildAllText();
    this._buildPortrait();
    this._redraw();
  }

  // ── Build all text objects ─────────────────────────────────────────────────
  _buildAllText() {
    const f = (sz, col) => ({
      fontFamily: '"Press Start 2P", monospace', fontSize: `${sz}px`, color: col,
    });
    const { SX: sx, SY: sy, IX: ix,
            PX: px, PY: py, PW: pw, PH: ph,
            IY_HDR, IY_START, I_STEP, I_VIS } = StatusScene;
    const rx = sx + 76;

    // ── Stats view ─────────────────────────────────────────────────────────
    this.txtName    = this.add.text(sx, sy + 2,  '', f(7, C.TITLE)).setDepth(3);
    this.txtClass   = this.add.text(sx, sy + 13, '', f(5, C.SUBTITLE)).setDepth(3);
    this.txtLevel   = this.add.text(sx, sy + 22, '', f(5, C.DIM)).setDepth(3);

    this.txtHP      = this.add.text(sx, sy + 34, '', f(6, C.TEXT)).setDepth(3);
    this.txtPow     = this.add.text(sx, sy + 48, '', f(6, C.TEXT)).setDepth(3);
    this.txtSP      = this.add.text(sx, sy + 60, '', f(6, C.TEXT)).setDepth(3);
    this.txtDef     = this.add.text(sx, sy + 72, '', f(6, C.TEXT)).setDepth(3);
    this.txtMove    = this.add.text(sx, sy + 84, '', f(6, C.TEXT)).setDepth(3);
    this.txtMoj     = this.add.text(rx, sy + 48, '', f(6, C.TEXT)).setDepth(3);
    this.txtLck     = this.add.text(rx, sy + 60, '', f(6, C.TEXT)).setDepth(3);
    this.txtMDef    = this.add.text(rx, sy + 72, '', f(6, C.TEXT)).setDepth(3);

    this.txtFaction = this.add.text(px + pw / 2, py + ph - 9, '', f(5, '#ffffff'))
                        .setOrigin(0.5).setDepth(3);

    // Item list
    this.txtItemsHdr = this.add.text(ix, IY_HDR,  'ITEMS', f(5, C.DIM)).setDepth(3);
    this.txtItemNone = this.add.text(ix, IY_START, 'None',  f(5, C.DIM)).setDepth(3);
    this.txtItemRows = [];
    for (let i = 0; i < I_VIS; i++) {
      this.txtItemRows.push(
        this.add.text(ix, IY_START + i * I_STEP, '', f(5, C.TEXT)).setDepth(3)
      );
    }

    // Shared hint (updated by both views)
    this.txtHint = this.add.text(GAME_W / 2, 140, '', f(5, C.DIM))
                     .setOrigin(0.5).setDepth(3);

    // ── Item detail view ────────────────────────────────────────────────────
    this.txtIDName   = this.add.text(14, 14, '', f(8, C.TITLE)).setDepth(3);
    this.txtIDType   = this.add.text(14, 28, '', f(5, C.SUBTITLE)).setDepth(3);
    this.txtIDStats  = this.add.text(14, 44, '', f(5, C.TEXT)).setDepth(3);
    this.txtIDRange  = this.add.text(14, 54, '', f(5, C.TEXT)).setDepth(3);
    this.txtIDEffect = this.add.text(14, 68, '', f(5, C.SUBTITLE)).setDepth(3);
    this.txtIDDesc   = this.add.text(14, 82, '', f(5, C.DIM)).setDepth(3);

    // Group references for bulk visibility toggling
    this._statsGroup = [
      this.txtName, this.txtClass, this.txtLevel,
      this.txtHP, this.txtPow, this.txtSP, this.txtDef, this.txtMove,
      this.txtMoj, this.txtLck, this.txtMDef, this.txtFaction,
      this.txtItemsHdr,
    ];
    this._itemGroup = [
      this.txtIDName, this.txtIDType, this.txtIDStats,
      this.txtIDRange, this.txtIDEffect, this.txtIDDesc,
    ];
  }

  // ── Build portrait (created once; visibility toggled on view switch) ────────
  _buildPortrait() {
    Portraits.registerTextures(this);
    const u  = this.unit;
    const { PX: px, PY: py, PW: pw, PH: ph } = StatusScene;
    const lordIndex = u.isLord ? LORD_DEFS.findIndex(d => d.label === u.name) : -1;
    const portKey   = lordIndex >= 0 ? Portraits.get(lordIndex) : null;

    if (portKey && this.textures.exists(portKey)) {
      const imgH = ph - 5 - 14;
      this.portImg = this.add.image(px + pw / 2, py + 5 + imgH / 2, portKey)
        .setDisplaySize(pw - 2, imgH).setDepth(5);
    } else {
      const f = (sz, col) => ({
        fontFamily: '"Press Start 2P", monospace', fontSize: `${sz}px`, color: col,
      });
      this.portImg = this.add.text(px + pw / 2, py + ph / 2 - 12, u.symbol || '?', f(22, '#ffffff'))
        .setOrigin(0.5).setDepth(5);
    }
  }

  // ── Master render ──────────────────────────────────────────────────────────
  _redraw() {
    this.gfx.clear();
    if (this.view === 'stats') {
      this._drawStatsBackground();
      this._fillStats();
      this._showStatsTexts();   // sets group visibility, updates hint
      this._fillItemList();     // manages txtItemRows / txtItemNone individually
    } else {
      this._drawItemBackground();
      this._fillItemDetail();
      this._showItemTexts();
    }
  }

  // ── Stats background ───────────────────────────────────────────────────────
  _drawStatsBackground() {
    const u  = this.unit;
    const g  = this.gfx;
    const { PX: px, PY: py, PW: pw, PH: ph,
            SX: sx, SY: sy, PANEL_H, IY_HDR } = StatusScene;

    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GAME_W, GAME_H);

    g.fillStyle(C.PANEL_BG, 1);
    g.fillRect(4, 4, GAME_W - 8, PANEL_H);
    g.lineStyle(1.5, C.PANEL_BD, 1);
    g.strokeRect(4, 4, GAME_W - 8, PANEL_H);

    const portColor = Phaser.Display.Color.IntegerToColor(u.color).darken(40).color;
    g.fillStyle(portColor, 1);
    g.fillRect(px, py, pw, ph);

    const stripeColor = u.faction === FACTION.PLAYER ? 0x3a5fa0 : 0xa03a3a;
    g.fillStyle(stripeColor, 1);
    g.fillRect(px, py, pw, 5);

    g.fillStyle(0x000000, 0.6);
    g.fillRect(px, py + ph - 14, pw, 14);

    g.lineStyle(1.5, u.color, 1);
    g.strokeRect(px, py, pw, ph);

    g.lineStyle(1, C.PANEL_BD, 0.8);
    g.strokeLineShape(new Phaser.Geom.Line(sx, sy + 30, sx + 148, sy + 30));

    g.lineStyle(0.5, C.PANEL_BD, 0.4);
    g.strokeLineShape(new Phaser.Geom.Line(sx + 73, sy + 34, sx + 73, sy + 96));

    // Items section separator
    g.lineStyle(0.5, C.PANEL_BD, 0.6);
    g.strokeLineShape(new Phaser.Geom.Line(sx, IY_HDR - 3, sx + 148, IY_HDR - 3));
  }

  // ── Item detail background ─────────────────────────────────────────────────
  _drawItemBackground() {
    const g = this.gfx;
    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GAME_W, GAME_H);

    g.fillStyle(C.PANEL_BG, 1);
    g.fillRect(4, 4, GAME_W - 8, StatusScene.PANEL_H);
    g.lineStyle(1.5, C.PANEL_BD, 1);
    g.strokeRect(4, 4, GAME_W - 8, StatusScene.PANEL_H);

    g.lineStyle(1, C.PANEL_BD, 0.8);
    g.strokeLineShape(new Phaser.Geom.Line(14, 38, GAME_W - 14, 38));

    g.lineStyle(0.5, C.PANEL_BD, 0.5);
    g.strokeLineShape(new Phaser.Geom.Line(14, 62, GAME_W - 14, 62));
    g.strokeLineShape(new Phaser.Geom.Line(14, 78, GAME_W - 14, 78));
  }

  // ── Fill stats ─────────────────────────────────────────────────────────────
  _fillStats() {
    const u = this.unit;
    const className = u.className
      || (u.isBoss ? 'Boss' : u.faction === FACTION.ENEMY ? 'Enemy' : '');

    this.txtName.setText(u.name);
    this.txtClass.setText(className);
    this.txtLevel.setText(`Lv. ${u.level}`);

    this.txtHP.setText(  `HP ${u.hp}/${u.maxHp}`);
    this.txtPow.setText( `Pw  ${u.pow}`);
    this.txtSP.setText(  `SP  ${u.sp}`);
    this.txtDef.setText( `Df  ${u.def}`);
    this.txtMove.setText(`Mv  ${u.move}`);
    this.txtMoj.setText( `Mj  ${u.moj}`);
    this.txtLck.setText( `Lk  ${u.lck}`);
    this.txtMDef.setText(`MD  ${u.mdef}`);

    const w = u.equippedWeapon;
    const isMagic = w ? !!w.isMagic : u.moj > u.pow;
    this.txtPow.setColor( isMagic ? C.TEXT     : C.SUBTITLE);
    this.txtDef.setColor( isMagic ? C.TEXT     : C.SUBTITLE);
    this.txtMoj.setColor( isMagic ? C.SUBTITLE : C.TEXT);
    this.txtMDef.setColor(isMagic ? C.SUBTITLE : C.TEXT);

    this.txtFaction.setText(u.faction === FACTION.PLAYER ? 'ALLY' : 'ENEMY');
  }

  // ── Fill item list rows ────────────────────────────────────────────────────
  _fillItemList() {
    const weapons = this.unit.weapons || [];
    const { I_VIS } = StatusScene;

    // Always reset row visibility first
    this.txtItemRows.forEach(t => t.setText('').setVisible(false));
    this.txtItemNone.setVisible(false);

    if (weapons.length === 0) {
      this.txtItemNone.setVisible(true);
      return;
    }

    for (let i = 0; i < I_VIS; i++) {
      const wIdx = i + this.scrollOff;
      if (wIdx >= weapons.length) break;
      const w     = weapons[wIdx];
      const isSel = wIdx === this.itemCursor;
      this.txtItemRows[i]
        .setText(`${isSel ? '>' : ' '} ${w.name}  ${w.uses}/${w.maxUses}`)
        .setColor(isSel ? C.TITLE : C.TEXT)
        .setVisible(true);
    }
  }

  // ── Fill item detail ───────────────────────────────────────────────────────
  _fillItemDetail() {
    const w = (this.unit.weapons || [])[this.itemCursor];
    if (!w) return;

    this.txtIDName.setText(w.name);

    const tier = w.tier ? w.tier[0].toUpperCase() + w.tier.slice(1) : '';
    const type = w.type ? w.type[0].toUpperCase() + w.type.slice(1) : '';
    this.txtIDType.setText(`${type}  [${tier}]`);

    if (w.isStaff) {
      this.txtIDStats.setText(`Heals: ${w.healAmount}  Uses: ${w.uses}/${w.maxUses}`);
      this.txtIDRange.setText('');
    } else {
      this.txtIDStats.setText(
        `Mgt:${w.might}  Hit:${w.hit}  Crt:${w.crit}  Uses:${w.uses}/${w.maxUses}`
      );
      this.txtIDRange.setText(
        w.range ? `Range: ${w.range[0]}-${w.range[1]}${w.isMagic ? '  Magic' : ''}` : ''
      );
    }

    const fxStr = this._effectText(w);
    this.txtIDEffect.setText(fxStr ? `Eff: ${fxStr}` : '');
    this.txtIDDesc.setText(w.desc || '');
  }

  _effectText(w) {
    if (!w.effect) return '';
    const fx = w.effect;
    if (fx.type === 'burn')      return `${fx.chance}% Burn on hit`;
    if (fx.type === 'poison')    return `${fx.chance}% Poison on hit`;
    if (fx.type === 'effective') {
      if (fx.vsClass)  return `${fx.multiplier}x dmg vs ${fx.vsClass}`;
      if (fx.vsWeapon) return `${fx.multiplier}x dmg vs axe users`;
    }
    if (fx.type === 'execute')   return 'Instant KO [non-boss]';
    return '';
  }

  // ── Visibility groups ──────────────────────────────────────────────────────
  _showStatsTexts() {
    this._statsGroup.forEach(t => t.setVisible(true));
    this._itemGroup.forEach(t => t.setVisible(false));
    if (this.portImg) this.portImg.setVisible(true);
    const hasItems = (this.unit.weapons || []).length > 0;
    this.txtHint.setText(hasItems ? 'E:info  W/S:item  Z:close' : 'Z / X : close')
                .setVisible(true);
  }

  _showItemTexts() {
    this._statsGroup.forEach(t => t.setVisible(false));
    this.txtItemRows.forEach(t => t.setVisible(false));
    this.txtItemNone.setVisible(false);
    this._itemGroup.forEach(t => t.setVisible(true));
    if (this.portImg) this.portImg.setVisible(false);
    this.txtHint.setText('E / Z : back').setVisible(true);
  }

  // ── Scroll helper ──────────────────────────────────────────────────────────
  _scrollToItem() {
    const { I_VIS } = StatusScene;
    if (this.itemCursor < this.scrollOff)
      this.scrollOff = this.itemCursor;
    else if (this.itemCursor >= this.scrollOff + I_VIS)
      this.scrollOff = this.itemCursor - I_VIS + 1;
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  update() {
    const jd = k => Phaser.Input.Keyboard.JustDown(k);

    // Item detail view — any confirm/cancel returns to stats
    if (this.view === 'item') {
      if (jd(this.keys.e) || jd(this.keys.confirm) || jd(this.keys.cancel) ||
          jd(this.keys.esc) || jd(this.keys.enter)) {
        this.view = 'stats';
        this._redraw();
      }
      return;
    }

    // Stats view
    const weapons = this.unit.weapons || [];

    if ((jd(this.keys.down) || jd(this.keys.s)) && weapons.length > 0) {
      this.itemCursor = Math.min(this.itemCursor + 1, weapons.length - 1);
      this._scrollToItem();
      this._fillItemList();
    }
    if ((jd(this.keys.up) || jd(this.keys.w)) && weapons.length > 0) {
      this.itemCursor = Math.max(this.itemCursor - 1, 0);
      this._scrollToItem();
      this._fillItemList();
    }

    if (jd(this.keys.e) || jd(this.keys.enter)) {
      if (weapons.length > 0) {
        this.view = 'item';
        this._redraw();
      } else {
        this._close();
      }
      return;
    }

    if (jd(this.keys.confirm) || jd(this.keys.cancel) || jd(this.keys.esc)) {
      this._close();
    }
  }

  _close() {
    this.scene.resume(this.callerKey);
    this.scene.stop();
  }
}
