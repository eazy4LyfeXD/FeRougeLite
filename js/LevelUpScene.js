// ─── LevelUpScene.js ──────────────────────────────────────────────────────────
// Launched on top of GameMapScene after a unit levels up.
// Shows the portrait, new stat values, and +1 for each stat that grew.
// The +1 indicators blink for ~1.2 s then stay solid; player can close after 0.8 s.

class LevelUpScene extends Phaser.Scene {
  constructor() { super({ key: 'LevelUp' }); }

  init(data) {
    this.unit      = data.unit;
    this.gained    = data.gained || {};
    this.callerKey = data.callerKey || 'GameMap';
  }

  // ── Layout (mirrors StatusScene portrait block) ───────────────────────────
  static PX = 32; static PY = 32; static PW = 280; static PH = 408;
  static SX = 336; static SY = 32;

  // ── Stat definitions ──────────────────────────────────────────────────────
  static STAT_KEYS   = ['hp', 'pow', 'moj', 'sp', 'lck', 'def', 'mdef'];
  static STAT_LABELS = ['HP   ', 'Pow  ', 'Moj  ', 'SP   ', 'Lck  ', 'Def  ', 'MDef '];

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  create() {
    this.blinkOn  = true;
    this.blinkT   = 0;
    this.flashT   = 1200;   // ms: +1 indicators blink during this period
    this.closeT   = 800;    // ms: before the player can dismiss the screen
    this.closeable = false;

    this.gfx = this.add.graphics();

    this.keys = this.input.keyboard.addKeys({
      confirm: Phaser.Input.Keyboard.KeyCodes.X,
      cancel:  Phaser.Input.Keyboard.KeyCodes.Z,
      enter:   Phaser.Input.Keyboard.KeyCodes.ENTER,
      esc:     Phaser.Input.Keyboard.KeyCodes.ESC,
      e:       Phaser.Input.Keyboard.KeyCodes.E,
    });

    this._buildText();
    this._drawBackground();
    this._placePortrait();
    this._fillStats();
  }

  // ── Build text objects ─────────────────────────────────────────────────────
  _buildText() {
    const f   = (sz, col) => ({ fontFamily: '"Barlow Condensed", sans-serif', fontSize: `${sz}px`, color: col });
    const { SX: sx, SY: sy, PX: px, PY: py, PW: pw, PH: ph } = LevelUpScene;

    this.txtHeader  = this.add.text(sx, sy + 8,  'LEVEL UP!', f(36, C.TITLE)).setDepth(3);
    this.txtLevel   = this.add.text(sx, sy + 60, '',          f(22, C.SUBTITLE)).setDepth(3);

    this.txtStatLines = [];
    this.txtPlusOne   = [];
    for (let i = 0; i < LevelUpScene.STAT_KEYS.length; i++) {
      const y = sy + 112 + i * 46;
      this.txtStatLines.push(this.add.text(sx,       y, '', f(22, C.TEXT)).setDepth(3));
      this.txtPlusOne.push(  this.add.text(sx + 220, y, '', f(22, C.TITLE)).setDepth(3).setVisible(false));
    }

    this.txtFaction = this.add.text(
      px + pw / 2, py + ph - 36, '', f(18, '#ffffff')
    ).setOrigin(0.5).setDepth(3);

    this.txtHint = this.add.text(
      GAME_W / 2, 500, '', f(18, C.DIM)
    ).setOrigin(0.5).setDepth(3);
  }

  // ── Panel + portrait box background ───────────────────────────────────────
  _drawBackground() {
    const u  = this.unit;
    const g  = this.gfx;
    const { PX: px, PY: py, PW: pw, PH: ph, SX: sx, SY: sy } = LevelUpScene;

    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GAME_W, GAME_H);

    g.fillStyle(C.PANEL_BG, 1);
    g.fillRect(16, 16, GAME_W - 32, 520);
    g.lineStyle(4, C.PANEL_BD, 1);
    g.strokeRect(16, 16, GAME_W - 32, 520);

    const portColor = Phaser.Display.Color.IntegerToColor(u.color).darken(40).color;
    g.fillStyle(portColor, 1);
    g.fillRect(px, py, pw, ph);

    const stripeColor = u.faction === FACTION.PLAYER ? 0x3a5fa0 : 0xa03a3a;
    g.fillStyle(stripeColor, 1);
    g.fillRect(px, py, pw, 20);

    g.fillStyle(0x000000, 0.6);
    g.fillRect(px, py + ph - 56, pw, 56);

    g.lineStyle(4, u.color, 1);
    g.strokeRect(px, py, pw, ph);

    // Divider below the header text
    g.lineStyle(2, C.PANEL_BD, 0.8);
    g.strokeLineShape(new Phaser.Geom.Line(sx, sy + 100, sx + 592, sy + 100));
  }

  // ── Portrait image or symbol fallback ─────────────────────────────────────
  _placePortrait() {
    Portraits.registerTextures(this);
    const u  = this.unit;
    const { PX: px, PY: py, PW: pw, PH: ph } = LevelUpScene;
    const lordIndex = u.isLord ? LORD_DEFS.findIndex(d => d.label === u.name) : -1;
    const portKey   = lordIndex >= 0 ? Portraits.get(lordIndex) : null;

    if (portKey && this.textures.exists(portKey)) {
      const imgH = ph - 5 - 14;
      this.add.image(px + pw / 2, py + 5 + imgH / 2, portKey)
        .setDisplaySize(pw - 2, imgH).setDepth(5);
    } else {
      const f = (sz, col) => ({ fontFamily: '"Barlow Condensed", sans-serif', fontSize: `${sz}px`, color: col });
      this.add.text(px + pw / 2, py + ph / 2 - 12, u.symbol || '?', f(22, '#ffffff'))
        .setOrigin(0.5).setDepth(5);
    }
    this.txtFaction.setText(u.faction === FACTION.PLAYER ? 'ALLY' : 'ENEMY');
  }

  // ── Populate stat display ──────────────────────────────────────────────────
  _fillStats() {
    const u = this.unit;
    this.txtLevel.setText(`${u.name}  Lv.${u.level}`);

    // Use maxHp for the HP row so it shows the new maximum, not current HP
    const vals = {
      hp: u.maxHp, pow: u.pow, moj: u.moj,
      sp: u.sp, lck: u.lck, def: u.def, mdef: u.mdef,
    };

    for (let i = 0; i < LevelUpScene.STAT_KEYS.length; i++) {
      const key     = LevelUpScene.STAT_KEYS[i];
      const label   = LevelUpScene.STAT_LABELS[i];
      const didGain = !!this.gained[key];
      this.txtStatLines[i]
        .setText(`${label}${vals[key]}`)
        .setColor(didGain ? C.WHITE : C.DIM);
      this.txtPlusOne[i]
        .setText('+1')
        .setVisible(didGain);
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  update(time, delta) {
    this.blinkT += delta;
    this.flashT -= delta;
    this.closeT -= delta;

    if (this.blinkT >= 160) { this.blinkT = 0; this.blinkOn = !this.blinkOn; }
    if (this.closeT <= 0)   this.closeable = true;

    // Blink +1 indicators while flashT > 0, then hold them steady
    for (let i = 0; i < LevelUpScene.STAT_KEYS.length; i++) {
      if (this.gained[LevelUpScene.STAT_KEYS[i]]) {
        this.txtPlusOne[i].setVisible(this.flashT > 0 ? this.blinkOn : true);
      }
    }

    // Blink hint once closeable
    this.txtHint.setText(
      this.closeable ? (this.blinkOn ? 'Press any button' : '') : ''
    );

    if (this.closeable) {
      const jd = k => Phaser.Input.Keyboard.JustDown(k);
      if (jd(this.keys.confirm) || jd(this.keys.cancel) ||
          jd(this.keys.enter)   || jd(this.keys.esc) || jd(this.keys.e)) {
        this._close();
      }
    }
  }

  _close() {
    this.scene.resume(this.callerKey);
    this.scene.stop();
  }
}
