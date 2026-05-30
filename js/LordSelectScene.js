// ─── LordSelectScene.js ───────────────────────────────────────────────────────

class LordSelectScene extends Phaser.Scene {
  constructor() { super({ key: 'LordSelect' }); }

  init(data) {
    this.saveData  = data.saveData;
    this.slotIndex = data.slotIndex;
  }

  create() {
    this.cursor = 0;
    this.blinkOn = true;
    this.blinkT  = 0;
    this.selecting = false;

    this.gfx = this.add.graphics();

    const cardW  = 60, cardH = 96, gap = 10;
    const totalW = cardW * 3 + gap * 2;
    this.cardStartX = Math.floor((GAME_W - totalW) / 2);
    this.cardY      = 38;
    this.cardW      = cardW;
    this.cardH      = cardH;

    this._buildText();

    this.keys = this.input.keyboard.addKeys({
      left:    Phaser.Input.Keyboard.KeyCodes.LEFT,
      right:   Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a:       Phaser.Input.Keyboard.KeyCodes.A,
      d:       Phaser.Input.Keyboard.KeyCodes.D,
      confirm: Phaser.Input.Keyboard.KeyCodes.X,
      enter:   Phaser.Input.Keyboard.KeyCodes.ENTER,
      cancel:  Phaser.Input.Keyboard.KeyCodes.Z,
      esc:     Phaser.Input.Keyboard.KeyCodes.ESC,
    });
  }

  _buildText() {
    const s = (sz, col) => ({ fontFamily: '"Barlow Condensed", sans-serif', fontSize: `${sz}px`, color: col });

    this.txtTitle = this.add.text(GAME_W/2, 14, 'CHOOSE YOUR LORD', s(13, C.TITLE)).setOrigin(0.5);
    this.txtSub   = this.add.text(GAME_W/2, 26, 'Select your hero for this run', s(8, C.DIM)).setOrigin(0.5);

    this.cardLabels  = [];
    this.cardClasses = [];
    this.cardDescs   = [];
    this.cardSels    = [];

    for (let i = 0; i < 3; i++) {
      const cx = this.cardStartX + i * (this.cardW + 10) + this.cardW / 2;
      const cy = this.cardY;

      this.cardLabels.push(
        this.add.text(cx, cy + 58, LORD_DEFS[i].label, s(7, C.DIM)).setOrigin(0.5)
      );
      this.cardClasses.push(
        this.add.text(cx, cy + 68, LORD_DEFS[i].className, s(8, C.TITLE)).setOrigin(0.5)
      );
      this.cardDescs.push(
        this.add.text(cx, cy + 79, LORD_DEFS[i].desc, s(7, C.TEXT)).setOrigin(0.5)
      );
      this.cardSels.push(
        this.add.text(cx, cy + 90, '', s(7, C.TITLE)).setOrigin(0.5)
      );
    }

    this.txtHint = this.add.text(GAME_W/2, GAME_H - 5,
      'A / D / ← → : move     X / Enter : confirm     Z : back', s(7, C.DIM)).setOrigin(0.5);
  }

  update(time, delta) {
    this.blinkT += delta;
    if (this.blinkT >= 400) { this.blinkT = 0; this.blinkOn = !this.blinkOn; }

    if (!this.selecting) this._handleInput();
    this._draw();
  }

  _handleInput() {
    const jDown = Phaser.Input.Keyboard.JustDown;
    if (jDown(this.keys.right) || jDown(this.keys.d)) this.cursor = (this.cursor + 1) % 3;
    if (jDown(this.keys.left)  || jDown(this.keys.a)) this.cursor = (this.cursor - 1 + 3) % 3;

    if (jDown(this.keys.confirm) || jDown(this.keys.enter)) {
      this.selecting = true;
      this.saveData.selectedLord = this.cursor;
      SaveData.save(this.slotIndex, this.saveData);
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameMap', { saveData: this.saveData, slotIndex: this.slotIndex });
      });
    }

    if (jDown(this.keys.cancel) || jDown(this.keys.esc)) {
      this.scene.start('FileSelect', { mode: 'new' });
    }
  }

  _draw() {
    const g = this.gfx;
    g.clear();

    // Background
    g.fillStyle(C.BG, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(C.PANEL_BD, 1);
    g.fillRect(0, 0, GAME_W, 2);
    g.fillRect(0, GAME_H - 2, GAME_W, 2);

    // Hint bar
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, GAME_H - 14, GAME_W, 14);

    for (let i = 0; i < 3; i++) {
      const cx  = this.cardStartX + i * (this.cardW + 10);
      const cy  = this.cardY;
      const sel = i === this.cursor;

      // Card shadow
      g.fillStyle(0x000000, 0.5);
      g.fillRect(cx + 2, cy + 2, this.cardW, this.cardH);

      // Card body
      g.fillStyle(C.PANEL_BG, 1);
      g.fillRect(cx, cy, this.cardW, this.cardH);

      // Card border
      g.lineStyle(sel ? 2 : 1, sel ? C.SEL_BD : C.PANEL_BD, 1);
      g.strokeRect(cx, cy, this.cardW, this.cardH);

      // Portrait area
      const pc = LORD_DEFS[i].color;
      g.fillStyle(sel ? pc : Phaser.Display.Color.IntegerToColor(pc).darken(30).color, 1);
      g.fillRect(cx + 5, cy + 5, this.cardW - 10, 50);
      g.lineStyle(1, pc, 1);
      g.strokeRect(cx + 5, cy + 5, this.cardW - 10, 50);

      // Select indicator
      this.cardSels[i].setText(sel ? '[ SELECT ]' : '');
    }

    // Cursor arrow above selected card
    if (this.blinkOn) {
      const arrowX = this.cardStartX + this.cursor * (this.cardW + 10) + this.cardW / 2;
      g.fillStyle(C.CURSOR, 1);
      g.fillTriangle(arrowX, 33, arrowX - 5, 27, arrowX + 5, 27);
    }

    // Selected card tint
    for (let i = 0; i < 3; i++) {
      const cx  = this.cardStartX + i * (this.cardW + 10);
      const cy  = this.cardY;
      if (i === this.cursor) {
        g.fillStyle(LORD_DEFS[i].color, 0.25);
        g.fillRect(cx + 5, cy + 5, this.cardW - 10, 50);
      }
    }
  }
}
