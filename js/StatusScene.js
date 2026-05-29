// ─── StatusScene.js ───────────────────────────────────────────────────────────
// Overlays the game map to display a unit's portrait and full stat sheet.
// Launched on top of GameMapScene (which is paused); closes on E/X/Z/Esc.

class StatusScene extends Phaser.Scene {
  constructor() { super({ key: 'Status' }); }

  init(data) {
    this.unit      = data.unit;
    this.callerKey = data.callerKey || 'GameMap';
  }

  create() {
    this.gfx = this.add.graphics();

    this.keys = this.input.keyboard.addKeys({
      e:       Phaser.Input.Keyboard.KeyCodes.E,
      confirm: Phaser.Input.Keyboard.KeyCodes.X,
      cancel:  Phaser.Input.Keyboard.KeyCodes.Z,
      enter:   Phaser.Input.Keyboard.KeyCodes.ENTER,
      esc:     Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this._buildText();
    this._drawBackground();
    this._placePortrait();
    this._fillStats();
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  static PX = 8;
  static PY = 8;
  static PW = 70;
  static PH = 102;
  static SX = 84;
  static SY = 8;

  // ── Build static text objects ───────────────────────────────────────────────
  _buildText() {
    const s  = (sz, col) => ({ fontFamily: '"Press Start 2P", monospace', fontSize: `${sz}px`, color: col });
    const sx = StatusScene.SX;
    const sy = StatusScene.SY;

    this.txtName  = this.add.text(sx, sy + 2,  '', s(7, C.TITLE)).setDepth(3);
    this.txtClass = this.add.text(sx, sy + 13, '', s(5, C.SUBTITLE)).setDepth(3);
    this.txtLevel = this.add.text(sx, sy + 22, '', s(5, C.DIM)).setDepth(3);

    // Stats — left column
    this.txtHP   = this.add.text(sx,      sy + 34, '', s(6, C.TEXT)).setDepth(3);
    this.txtPow  = this.add.text(sx,      sy + 48, '', s(6, C.TEXT)).setDepth(3);
    this.txtSP   = this.add.text(sx,      sy + 60, '', s(6, C.TEXT)).setDepth(3);
    this.txtDef  = this.add.text(sx,      sy + 72, '', s(6, C.TEXT)).setDepth(3);
    this.txtMove = this.add.text(sx,      sy + 84, '', s(6, C.TEXT)).setDepth(3);

    // Stats — right column
    const rx = sx + 76;
    this.txtMoj  = this.add.text(rx, sy + 48, '', s(6, C.TEXT)).setDepth(3);
    this.txtLck  = this.add.text(rx, sy + 60, '', s(6, C.TEXT)).setDepth(3);
    this.txtMDef = this.add.text(rx, sy + 72, '', s(6, C.TEXT)).setDepth(3);

    // Faction label at bottom of portrait
    this.txtFaction = this.add.text(
      StatusScene.PX + StatusScene.PW / 2,
      StatusScene.PY + StatusScene.PH - 9,
      '', s(5, '#ffffff')
    ).setOrigin(0.5).setDepth(3);

    // Close hint
    this.txtHint = this.add.text(
      GAME_W / 2, 124, 'E / X / Z : close', s(5, C.DIM)
    ).setOrigin(0.5).setDepth(3);
  }

  // ── Draw static background graphics ────────────────────────────────────────
  _drawBackground() {
    const u  = this.unit;
    const g  = this.gfx;
    const px = StatusScene.PX, py = StatusScene.PY;
    const pw = StatusScene.PW, ph = StatusScene.PH;
    const sx = StatusScene.SX, sy = StatusScene.SY;

    // Dim map behind overlay
    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GAME_W, GAME_H);

    // Outer panel
    g.fillStyle(C.PANEL_BG, 1);
    g.fillRect(4, 4, GAME_W - 8, 132);
    g.lineStyle(1.5, C.PANEL_BD, 1);
    g.strokeRect(4, 4, GAME_W - 8, 132);

    // Portrait box background (unit color, darkened)
    const portColor = Phaser.Display.Color.IntegerToColor(u.color).darken(40).color;
    g.fillStyle(portColor, 1);
    g.fillRect(px, py, pw, ph);

    // Faction stripe at top of portrait
    const stripeColor = u.faction === FACTION.PLAYER ? 0x3a5fa0 : 0xa03a3a;
    g.fillStyle(stripeColor, 1);
    g.fillRect(px, py, pw, 5);

    // Name strip at portrait bottom
    g.fillStyle(0x000000, 0.6);
    g.fillRect(px, py + ph - 14, pw, 14);

    // Portrait box border (unit color)
    g.lineStyle(1.5, u.color, 1);
    g.strokeRect(px, py, pw, ph);

    // Divider below name/class/level
    g.lineStyle(1, C.PANEL_BD, 0.8);
    g.strokeLineShape(new Phaser.Geom.Line(sx, sy + 30, sx + 148, sy + 30));

    // Vertical divider between stat columns
    g.lineStyle(0.5, C.PANEL_BD, 0.4);
    g.strokeLineShape(new Phaser.Geom.Line(sx + 73, sy + 34, sx + 73, sy + 96));
  }

  // ── Place portrait image (lord) or fallback symbol (enemy) ─────────────────
  _placePortrait() {
    // Register pre-loaded HTMLImageElements into Phaser's texture manager
    // synchronously — no async loader required.
    Portraits.registerTextures(this);

    const u  = this.unit;
    const px = StatusScene.PX, py = StatusScene.PY;
    const pw = StatusScene.PW, ph = StatusScene.PH;

    // Find lord index if this is a player lord with a real portrait
    const lordIndex = u.isLord ? LORD_DEFS.findIndex(d => d.label === u.name) : -1;
    const portKey   = lordIndex >= 0 ? Portraits.get(lordIndex) : null;

    if (portKey && this.textures.exists(portKey)) {
      // Real portrait image — fills the box minus faction stripe and name strip
      const imgH = ph - 5 - 14;
      this.add.image(px + pw / 2, py + 5 + imgH / 2, portKey)
        .setDisplaySize(pw - 2, imgH)
        .setDepth(5);
    } else {
      // Fallback: large unit symbol centered in portrait box
      const s = (sz, col) => ({ fontFamily: '"Press Start 2P", monospace', fontSize: `${sz}px`, color: col });
      this.add.text(px + pw / 2, py + ph / 2 - 12, u.symbol || '?', s(22, '#ffffff'))
        .setOrigin(0.5)
        .setDepth(5);
    }

    // Faction label
    this.txtFaction.setText(u.faction === FACTION.PLAYER ? 'ALLY' : 'ENEMY');
  }

  // ── Populate stat text ──────────────────────────────────────────────────────
  _fillStats() {
    const u = this.unit;

    const className = u.className
      || (u.isBoss ? 'Boss' : u.faction === FACTION.ENEMY ? 'Enemy' : '');

    this.txtName.setText(u.name);
    this.txtClass.setText(className);
    this.txtLevel.setText(`Lv. ${u.level}`);

    this.txtHP.setText(`HP ${u.hp}/${u.maxHp}`);
    this.txtPow.setText(`Pw  ${u.pow}`);
    this.txtSP.setText( `SP  ${u.sp}`);
    this.txtDef.setText(`Df  ${u.def}`);
    this.txtMove.setText(`Mv  ${u.move}`);
    this.txtMoj.setText( `Mj  ${u.moj}`);
    this.txtLck.setText( `Lk  ${u.lck}`);
    this.txtMDef.setText(`MD  ${u.mdef}`);

    // Highlight dominant attack type
    const isMagic = u.moj > u.pow;
    this.txtPow.setColor(isMagic ? C.TEXT : C.SUBTITLE);
    this.txtDef.setColor(isMagic ? C.TEXT : C.SUBTITLE);
    this.txtMoj.setColor(isMagic ? C.SUBTITLE : C.TEXT);
    this.txtMDef.setColor(isMagic ? C.SUBTITLE : C.TEXT);
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  update() {
    const jd = k => Phaser.Input.Keyboard.JustDown(k);
    if (
      jd(this.keys.e) || jd(this.keys.confirm) ||
      jd(this.keys.cancel) || jd(this.keys.esc) || jd(this.keys.enter)
    ) {
      this._close();
    }
  }

  _close() {
    this.scene.resume(this.callerKey);
    this.scene.stop();
  }
}
