// ─── main.js ─────────────────────────────────────────────────────────────────
// Phaser 3 game configuration and launch.

const config = {
  type: Phaser.AUTO,

  width:  GAME_W,
  height: GAME_H,

  zoom: 1,   // game renders natively at 960×640 — no scaling, crisp text

  backgroundColor: '#0d0d1a',

  render: {
    pixelArt:         false,
    antialias:        true,
    antialiasGL:      true,
    roundPixels:      false,
  },

  scene: [
    MainMenuScene,
    FileSelectScene,
    LordSelectScene,
    GameMapScene,
    StatusScene,
    FloorRewardScene,
    LevelUpScene,
  ],

  parent: document.body,
};

// Prevent default browser behaviour for arrow keys so they don't scroll
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
    e.preventDefault();
  }
});

document.fonts.ready.then(() => {
  new Phaser.Game(config);
});
