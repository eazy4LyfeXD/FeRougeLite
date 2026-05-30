// ─── MainMenuScene.js ─────────────────────────────────────────────────────────

class MainMenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MainMenu' }); }

  create() {
    this.cursor = 0;    // 0=New Game  1=Continue  2=Exit
    this.blinkOn = true;
    this.blinkT  = 0;

    // Star field (fixed seed)
    this.stars = [];
    const rng  = new SeededRng(99);
    for (let i = 0; i < 200; i++) {
      this.stars.push({ x: rng.next() * GAME_W, y: rng.next() * GAME_H, a: 0.2 + rng.next() * 0.6, r: rng.next() < 0.3 ? 2 : 1 });
    }

    this.keys = this.input.keyboard.addKeys({
      up:      Phaser.Input.Keyboard.KeyCodes.UP,
      down:    Phaser.Input.Keyboard.KeyCodes.DOWN,
      w:       Phaser.Input.Keyboard.KeyCodes.W,
      s:       Phaser.Input.Keyboard.KeyCodes.S,
      confirm: Phaser.Input.Keyboard.KeyCodes.X,
      enter:   Phaser.Input.Keyboard.KeyCodes.ENTER,
      space:   Phaser.Input.Keyboard.KeyCodes.SPACE,
      cancel:  Phaser.Input.Keyboard.KeyCodes.Z,
      esc:     Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this.gfx = this.add.graphics();
    this._buildText();
  }

  _buildText() {
    const style = (size, color) => ({
      fontFamily: '"Barlow Condensed", sans-serif', fontSize: `${size}px`, color,
    });

    this.txtTitle = this.add.text(GAME_W / 2, 88,  'FIRE EMBLEM', { ...style(52, C.TITLE), align: 'center' }).setOrigin(0.5);
    this.txtSub   = this.add.text(GAME_W / 2, 136, 'ROGUELITE',   { ...style(36, C.SUBTITLE), align: 'center' }).setOrigin(0.5);

    const labels = ['NEW GAME', 'CONTINUE', 'EXIT'];
    this.menuTexts = labels.map((lbl, i) =>
      this.add.text(GAME_W / 2, 352 + i * 72, lbl, { ...style(28, C.TEXT), align: 'center' }).setOrigin(0.5)
    );

    this.txtHint = this.add.text(GAME_W / 2, GAME_H - 20, 'X / Enter : select', style(18, C.DIM)).setOrigin(0.5);
  }

  update(time, delta) {
    this.blinkT += delta;
    if (this.blinkT >= 450) { this.blinkT = 0; this.blinkOn = !this.blinkOn; }
    this._handleInput();
    this._draw();
  }

  _handleInput() {
    const jd = k => Phaser.Input.Keyboard.JustDown(k);

    if (jd(this.keys.down) || jd(this.keys.s)) this.cursor = (this.cursor + 1) % 3;
    if (jd(this.keys.up)   || jd(this.keys.w)) this.cursor = (this.cursor - 1 + 3) % 3;

    if (jd(this.keys.confirm) || jd(this.keys.enter) || jd(this.keys.space)) {
      this._activate();
    }
  }

  _activate() {
    switch (this.cursor) {
      case 0: this.scene.start('FileSelect', { mode: 'new' });      break;
      case 1: this.scene.start('FileSelect', { mode: 'continue' }); break;
      case 2: window.close(); break;
    }
  }

  _draw() {
    const g = this.gfx;
    g.clear();

    // Background
    g.fillStyle(C.BG, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);

    // Stars
    for (const s of this.stars) {
      g.fillStyle(0xffffff, s.a);
      g.fillRect(s.x, s.y, s.r, s.r);
    }

    // Decorative bars
    g.fillStyle(C.PANEL_BD, 1);
    g.fillRect(0, 0, GAME_W, 8);
    g.fillRect(0, GAME_H - 8, GAME_W, 8);

    // Title panel
    g.fillStyle(C.PANEL_BG, 1);
    g.fillRect(200, 40, 560, 128);
    g.lineStyle(4, C.PANEL_BD, 1);
    g.strokeRect(200, 40, 560, 128);

    // Menu panel
    g.fillStyle(C.PANEL_BG, 1);
    g.fillRect(280, 296, 400, 264);
    g.lineStyle(4, C.PANEL_BD, 1);
    g.strokeRect(280, 296, 400, 264);

    // Cursor arrow
    if (this.blinkOn) {
      const cy = 338 + this.cursor * 72;
      g.fillStyle(C.CURSOR, 1);
      g.fillTriangle(292, cy, 314, cy + 20, 292, cy + 40);
    }

    // All menu items always white (no greyed-out Continue logic needed here)
    this.menuTexts.forEach(t => t.setColor(C.TEXT));
  }
}
