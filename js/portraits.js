// ─── portraits.js ─────────────────────────────────────────────────────────────
// Portrait management. Real lord portraits are embedded as Base64 data URIs
// in portrait_data.js so they work with file:// protocol and require no server.
//
// Images are pre-loaded as HTMLImageElements when this script evaluates
// (data URIs are handled synchronously by the browser, so they are complete
// by the time any scene needs them). Call Portraits.registerTextures(scene)
// in a scene's create() to add them to Phaser's texture manager instantly —
// no async loader lifecycle required.

const Portraits = {
  KEYS: ['portrait_lord_0', 'portrait_lord_1', 'portrait_lord_2'],

  DATA: {
    2: typeof PORTRAIT_STUD_MASTER !== 'undefined' ? PORTRAIT_STUD_MASTER : null,
    // Add more as portraits are created:
    // 0: typeof PORTRAIT_PICKPOCKET  !== 'undefined' ? PORTRAIT_PICKPOCKET  : null,
    // 1: typeof PORTRAIT_ASTRONOMER  !== 'undefined' ? PORTRAIT_ASTRONOMER  : null,
  },

  // HTMLImageElement objects keyed by lord index (populated by _init).
  _imgs: {},

  // Pre-load every portrait whose data is available. Called once when this
  // script is evaluated — by the time any gameplay scene opens the images
  // are guaranteed complete.
  _init() {
    for (const [idxStr, data] of Object.entries(this.DATA)) {
      if (data) {
        const img = new Image();
        img.src = data;
        this._imgs[idxStr] = img;
      }
    }
  },

  // Register any complete portrait images into Phaser's texture manager.
  // Call this once in a scene's create() — it is synchronous and safe to
  // call multiple times (skips textures that are already present).
  registerTextures(scene) {
    for (const [idxStr, img] of Object.entries(this._imgs)) {
      const key = this.KEYS[+idxStr];
      if (img.complete && img.naturalWidth > 0 && !scene.textures.exists(key)) {
        scene.textures.addImage(key, img);
      }
    }
  },

  // Returns the texture key for lordIndex, or null if no portrait exists.
  get(lordIndex) {
    const key = this.KEYS[lordIndex];
    return this.DATA[lordIndex] ? key : null;
  },
};

Portraits._init();
