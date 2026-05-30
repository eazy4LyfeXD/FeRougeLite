// ─── FileSelectScene.js ───────────────────────────────────────────────────────
// Shown after choosing New Game or Continue from the main menu.
// mode = 'new'      — any slot selectable; occupied slots prompt overwrite.
// mode = 'continue' — only occupied slots selectable.

class FileSelectScene extends Phaser.Scene {
  constructor() { super({ key: 'FileSelect' }); }

  init(data) {
    this.mode = data.mode; // 'new' | 'continue'
  }

  create() {
    this.slots   = SaveData.loadAll();
    this.cursor  = 0;
    this.screen  = 'select'; // 'select' | 'confirm'
    this.blinkOn = true;
    this.blinkT  = 0;

    // In continue mode, skip to the first occupied slot.
    // If none exist, return to main menu immediately.
    if (this.mode === 'continue') {
      const first = this.slots.findIndex(s => s.hasSave);
      if (first === -1) { this.scene.start('MainMenu'); return; }
      this.cursor = first;
    }

    this.gfx = this.add.graphics();
    this._buildText();

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
  }

  // ── Layout constants ────────────────────────────────────────────────────────
  static SLOT_Y    = [148, 268, 388];  // top-y of each slot panel
  static SLOT_H    = 96;
  static SLOT_X    = 80;
  static SLOT_W    = 800;

  _buildText() {
    const s = (sz, col) => ({ fontFamily: '"Barlow Condensed", sans-serif', fontSize: `${sz}px`, color: col });

    this.txtTitle = this.add.text(GAME_W / 2, 40,  'SELECT FILE', s(44, C.TITLE)).setOrigin(0.5);
    this.txtMode  = this.add.text(GAME_W / 2, 90, this.mode === 'new' ? '— NEW GAME —' : '— CONTINUE —', s(22, C.DIM)).setOrigin(0.5);

    this.slotLabels = [];
    this.slotInfos  = [];

    for (let i = 0; i < 3; i++) {
      const sy = FileSelectScene.SLOT_Y[i];
      const sx = FileSelectScene.SLOT_X;

      this.slotLabels.push(
        this.add.text(sx + 24, sy + 22, `FILE ${i + 1}`, s(26, C.TEXT)).setDepth(1)
      );
      this.slotInfos.push(
        this.add.text(sx + FileSelectScene.SLOT_W - 24, sy + 22, '', s(26, C.DIM)).setOrigin(1, 0).setDepth(1)
      );
    }

    this.txtHint = this.add.text(GAME_W / 2, GAME_H - 22,
      'W / S : move     X : select     Z : back', s(18, C.DIM)).setOrigin(0.5);

    // Confirm overlay — hidden by default
    this.txtConfirmQ    = this.add.text(GAME_W / 2, 272, 'Overwrite save?', s(28, C.TITLE)).setOrigin(0.5).setDepth(10).setVisible(false);
    this.txtConfirmHint = this.add.text(GAME_W / 2, 330, 'X = YES     Z = NO', s(22, C.DIM)).setOrigin(0.5).setDepth(10).setVisible(false);
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  update(time, delta) {
    this.blinkT += delta;
    if (this.blinkT >= 450) { this.blinkT = 0; this.blinkOn = !this.blinkOn; }

    this._handleInput();
    this._draw();
  }

  _handleInput() {
    const jd = k => Phaser.Input.Keyboard.JustDown(k);

    if (this.screen === 'confirm') {
      if (jd(this.keys.confirm) || jd(this.keys.enter)) {
        this._startNewGame(this.cursor);
      }
      if (jd(this.keys.cancel) || jd(this.keys.esc)) {
        this.screen = 'select';
      }
      return;
    }

    // Slot navigation
    if (jd(this.keys.down) || jd(this.keys.s)) this._moveCursor(1);
    if (jd(this.keys.up)   || jd(this.keys.w)) this._moveCursor(-1);

    if (jd(this.keys.confirm) || jd(this.keys.enter)) this._onConfirm();
    if (jd(this.keys.cancel)  || jd(this.keys.esc))   this.scene.start('MainMenu');
  }

  _moveCursor(dir) {
    let next = (this.cursor + dir + 3) % 3;
    // In continue mode skip empty slots
    let attempts = 0;
    while (this.mode === 'continue' && !this.slots[next].hasSave && attempts < 3) {
      next = (next + dir + 3) % 3;
      attempts++;
    }
    this.cursor = next;
  }

  _onConfirm() {
    const slot = this.slots[this.cursor];

    if (this.mode === 'new') {
      if (slot.hasSave) {
        this.screen = 'confirm'; // ask before overwriting
      } else {
        this._startNewGame(this.cursor);
      }
      return;
    }

    // Continue mode — slot is guaranteed occupied (cursor skips empties)
    if (!slot.hasSave) return;
    const data = SaveData.load(this.cursor);
    if (data.selectedLord < 0) {
      this.scene.start('LordSelect', { saveData: data, slotIndex: this.cursor });
    } else {
      this.scene.start('GameMap', { saveData: data, slotIndex: this.cursor });
    }
  }

  _startNewGame(slotIndex) {
    const data = SaveData.newGame(slotIndex);
    this.scene.start('LordSelect', { saveData: data, slotIndex });
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  _draw() {
    const g = this.gfx;
    g.clear();

    // Background
    g.fillStyle(C.BG, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(C.PANEL_BD, 1);
    g.fillRect(0, 0, GAME_W, 8);
    g.fillRect(0, GAME_H - 8, GAME_W, 8);

    // Hint bar
    g.fillStyle(0x000000, 0.5);
    g.fillRect(0, GAME_H - 56, GAME_W, 56);

    // Slot panels
    for (let i = 0; i < 3; i++) {
      const sy   = FileSelectScene.SLOT_Y[i];
      const sx   = FileSelectScene.SLOT_X;
      const sw   = FileSelectScene.SLOT_W;
      const sh   = FileSelectScene.SLOT_H;
      const sel  = i === this.cursor && this.screen === 'select';
      const slot = this.slots[i];
      const dim  = this.mode === 'continue' && !slot.hasSave;

      // Panel background
      g.fillStyle(C.PANEL_BG, dim ? 0.4 : 1);
      g.fillRect(sx, sy, sw, sh);

      // Border
      const bdColor = sel ? C.SEL_BD : C.PANEL_BD;
      const bdAlpha = dim ? 0.3 : 1;
      g.lineStyle(sel ? 6 : 3, bdColor, bdAlpha);
      g.strokeRect(sx, sy, sw, sh);

      // Cursor blink bar on selected slot
      if (sel && this.blinkOn) {
        g.fillStyle(C.SEL_BD, 0.15);
        g.fillRect(sx + 1, sy + 1, sw - 2, sh - 2);
      }

      // Slot label colour
      const labelCol = dim ? C.DIM : (sel ? C.TITLE : C.TEXT);
      this.slotLabels[i].setColor(labelCol);

      // Slot info text
      let infoText, infoCol;
      if (slot.hasSave) {
        const lordName = slot.selectedLord >= 0 ? LORD_DEFS[slot.selectedLord].label : 'No lord';
        infoText = `${lordName}  Lv.${slot.currentLevel}`;
        infoCol  = sel ? C.WHITE : C.TEXT;
      } else {
        infoText = '-- EMPTY --';
        infoCol  = C.DIM;
      }
      this.slotInfos[i].setText(infoText).setColor(infoCol);
    }

    // Confirm overlay
    const showConfirm = this.screen === 'confirm';
    if (showConfirm) {
      g.fillStyle(C.PANEL_BG, 0.97);
      g.fillRect(200, 220, 560, 200);
      g.lineStyle(4, C.PANEL_BD, 1);
      g.strokeRect(200, 220, 560, 200);
    }
    this.txtConfirmQ.setVisible(showConfirm);
    this.txtConfirmHint.setVisible(showConfirm);
  }
}
