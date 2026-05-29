// ─── SaveData.js ─────────────────────────────────────────────────────────────
// Manages three independent save slots in localStorage.

const SaveData = {
  _key(slot) { return `fe_roguelite_save_${slot}`; },

  defaults() {
    return {
      hasSave:      false,
      selectedLord: -1,
      currentLevel: 1,
      mapSeed:      0,
    };
  },

  load(slot) {
    try {
      const raw = localStorage.getItem(this._key(slot));
      if (!raw) return this.defaults();
      return Object.assign(this.defaults(), JSON.parse(raw));
    } catch(e) {
      return this.defaults();
    }
  },

  // Returns array of all three slot data objects.
  loadAll() {
    return [0, 1, 2].map(i => this.load(i));
  },

  save(slot, data) {
    try {
      localStorage.setItem(this._key(slot), JSON.stringify(data));
    } catch(e) {}
  },

  newGame(slot) {
    const d      = this.defaults();
    d.hasSave    = true;
    d.mapSeed    = Math.floor(Math.random() * 2_000_000);
    this.save(slot, d);
    return d;
  },

  deleteSave(slot) {
    localStorage.removeItem(this._key(slot));
  },
};
