// ─── constants.js ───────────────────────────────────────────────────────────
// All magic numbers and shared enums live here.

const GAME_W = 240;
const GAME_H = 160;

const MAX_FLOORS = 5;   // total floors in a run

// Tile types
const TILE = {
  PLAIN:    0,
  FOREST:   1,
  MOUNTAIN: 2,
  WALL:     3,
  FORT:     4,
  VILLAGE:  5,
  THRONE:   6,
  WATER:    7,
  ROAD:     8,
};

const TILE_NAME = ['Plain','Forest','Mountain','Wall','Fort','Village','Throne','Water','Road'];

// Pixel colours for each tile (fill, shade/edge)
const TILE_COLOR = [
  { fill: 0x4a7c3f, shade: 0x3a6030 }, // PLAIN
  { fill: 0x2d5a1b, shade: 0x1a4010 }, // FOREST
  { fill: 0x7a6a4a, shade: 0x5a5030 }, // MOUNTAIN
  { fill: 0x3c3c3c, shade: 0x202020 }, // WALL
  { fill: 0x6a5a3a, shade: 0x4a3a20 }, // FORT
  { fill: 0x8a7a3a, shade: 0x6a5a20 }, // VILLAGE
  { fill: 0x9a3a9a, shade: 0x6a1a6a }, // THRONE
  { fill: 0x2a4a8a, shade: 0x1a3060 }, // WATER
  { fill: 0x8a7a5a, shade: 0x6a5a3a }, // ROAD
];

const TILE_ICON = ['', '♣', '▲', '▪', '□', '⌂', '♛', '~', ''];

// Movement cost per tile type (99 = impassable)
// Index order: Plain, Forest, Mountain, Wall, Fort, Village, Throne, Water, Road
const MOVE_COST = [1, 2, 3, 99, 1, 1, 1, 99, 1];

// Per-class movement cost overrides (same index order as MOVE_COST)
// Index: Plain, Forest, Mountain, Wall, Fort, Village, Throne, Water, Road
const CLASS_MOVE_COSTS = {
  PICKPOCKET:    [1, 1, 1, 99, 1, 1, 1, 99, 1], // no terrain penalty whatsoever
  NORMAL:        [1, 2, 3, 99, 1, 1, 1, 99, 1], // standard infantry costs
  CAVALRY:       [1, 3, 4, 99, 2, 1, 1, 99, 1], // horse: Forest+1, Mountain+1, Fort+1
  RUFFIAN:       [1, 2, 3, 99, 1, 1, 1,  2, 1], // can traverse water (cost 2)
  ALICORN:       [1, 1, 1, 99, 1, 1, 1,  1, 1], // flying: all terrain cost 1, walls still block
};

// Full class definitions — weapons, movement, abilities, and role
const CLASSES = {
  PICKPOCKET: {
    name: 'Pickpocket', weapons: ['sword'],
    moveCosts: CLASS_MOVE_COSTS.PICKPOCKET, mounted: false, flying: false,
    abilities: ['pathfinder', 'lockpick', 'steal'],
  },
  ASTRONOMER: {
    name: 'Astronomer', weapons: ['wicked_magic', 'heaven_magic', 'elemental_magic', 'staff'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['polymath'],
  },
  STUD_MASTER: {
    name: 'Stud Master', weapons: ['sword', 'lance'],
    moveCosts: CLASS_MOVE_COSTS.CAVALRY, mounted: true, flying: false,
    abilities: ['mounted', 'terrain_burden'],
  },
  FLETCHER: {
    name: 'Fletcher', weapons: ['sword', 'bow'],
    moveCosts: CLASS_MOVE_COSTS.CAVALRY, mounted: true, flying: false,
    abilities: ['mounted', 'bow_range'],
  },
  RUFFIAN: {
    name: 'Ruffian', weapons: ['axe', 'sword'],
    moveCosts: CLASS_MOVE_COSTS.RUFFIAN, mounted: false, flying: false,
    abilities: ['sea_legs'],
  },
  NECROMANCER: {
    name: 'Necromancer', weapons: ['wicked_magic', 'staff'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['raise_dead', 'wicked_mastery'],
  },
  CLERGY: {
    name: 'Clergy', weapons: ['heaven_magic', 'staff'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['divine_ward', 'mend'],
  },
  GRUNT: {
    name: 'Grunt', weapons: ['lance'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['steadfast'],
  },
  BULWARK: {
    name: 'Bulwark', weapons: ['lance', 'axe'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['fortress', 'immovable'],
  },
  MUSICIAN: {
    name: 'Musician', weapons: [],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['encore'],
  },
  PRISONER: {
    name: 'Prisoner', weapons: ['sword', 'wicked_magic', 'heaven_magic', 'elemental_magic'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['desperation', 'unshackled'],
  },
  ENLIGHTENED: {
    name: 'Enlightened', weapons: [],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['transcend', 'bulwark_aura', 'immutable'],
    noDamage: true,
  },
  ALICORN_RIDER: {
    name: 'Alicorn Rider', weapons: ['sword', 'lance'],
    moveCosts: CLASS_MOVE_COSTS.ALICORN, mounted: true, flying: true,
    abilities: ['flight', 'bow_weakness'],
  },
};

// Defence bonus per tile type
const TILE_DEF  = [0, 1, 2, 0, 2, 1, 3, 0, 0];

// Map dimensions
const MAP_W  = 15;
const MAP_H  = 12;
const TILE_S = 14;   // pixels per tile
const UI_H   = 30;   // bottom HUD height

// Factions
const FACTION = { PLAYER: 0, ENEMY: 1 };

// Phases
const PHASE = {
  PLAYER_TURN:  0,
  ENEMY_TURN:   1,
  GAME_OVER:    2,
  VICTORY:      3,
};

// Colours (as CSS hex strings for Phaser text/graphics)
const C = {
  BG:       0x0d0d1a,
  TITLE:    '#c8a84b',
  SUBTITLE: '#7abfdc',
  TEXT:     '#dcdccc',
  DIM:      '#555566',
  CURSOR:   0xf0d060,
  PANEL_BG: 0x12152a,
  PANEL_BD: 0x3a3a6a,
  SEL_BD:   0xc8a84b,
  HP_FULL:  0x40d040,
  HP_LOW:   0xd04040,
  HP_BG:    0x202020,
  MOVE_HL:  0x4d80ff,   // alpha applied separately
  ATCK_HL:  0xff3333,
  PHASE_P:  '#7abfdc',
  PHASE_E:  '#e07060',
  WHITE:    '#dcdccc',
};

// ─── Weapon Data ──────────────────────────────────────────────────────────────
// Templates only — call makeWeapon(key) to get a live instance for a unit.
// Fields: name, type, tier, might, hit, crit, uses, maxUses, range, isMagic?,
//         isStaff?, healAmount?, effect?
// effect types: 'burn' {chance}, 'poison' {chance},
//               'effective' {vsClass|vsWeapon, multiplier},
//               'execute' {charges}  [UI not yet implemented]
const WEAPON_DATA = {
  // ── Swords ──────────────────────────────────────────────────────────────────
  WOOD_SWORD:   { name: 'Wood Sword',   type: 'sword', tier: 'wood',    might: 2, hit: 90, crit: 0, uses: 40, maxUses: 40, range: [1,1], desc: 'A crude practice blade.' },
  BRONZE_SWORD: { name: 'Bronze Sword', type: 'sword', tier: 'bronze',  might: 4, hit: 90, crit: 0, uses: 25, maxUses: 25, range: [1,1], desc: 'A dependable bronze sword.' },
  IRON_SWORD:   { name: 'Iron Sword',   type: 'sword', tier: 'iron',    might: 6, hit: 85, crit: 0, uses: 20, maxUses: 20, range: [1,1], desc: 'A heavy iron blade.' },
  // ── Lances ──────────────────────────────────────────────────────────────────
  WOOD_LANCE:   { name: 'Wood Lance',   type: 'lance', tier: 'wood',    might: 3, hit: 80, crit: 0, uses: 35, maxUses: 35, range: [1,1], desc: 'A simple wooden spear.' },
  BRONZE_LANCE: { name: 'Bronze Lance', type: 'lance', tier: 'bronze',  might: 5, hit: 80, crit: 0, uses: 25, maxUses: 25, range: [1,1], desc: 'Standard-issue spear.' },
  IRON_LANCE:   { name: 'Iron Lance',   type: 'lance', tier: 'iron',    might: 7, hit: 75, crit: 0, uses: 20, maxUses: 20, range: [1,1], desc: 'A solid iron lance.' },
  // ── Axes ────────────────────────────────────────────────────────────────────
  WOOD_AXE:     { name: 'Wood Axe',     type: 'axe',   tier: 'wood',    might: 4, hit: 70, crit: 0, uses: 35, maxUses: 35, range: [1,1], desc: 'Rough-hewn hatchet.' },
  BRONZE_AXE:   { name: 'Bronze Axe',   type: 'axe',   tier: 'bronze',  might: 6, hit: 70, crit: 0, uses: 25, maxUses: 25, range: [1,1], desc: 'A weighty bronze axe.' },
  IRON_AXE:     { name: 'Iron Axe',     type: 'axe',   tier: 'iron',    might: 8, hit: 65, crit: 0, uses: 20, maxUses: 20, range: [1,1], desc: 'Brutal cleaving power.' },
  // ── Bows ────────────────────────────────────────────────────────────────────
  WOOD_BOW:     { name: 'Wood Bow',     type: 'bow',   tier: 'wood',    might: 2, hit: 85, crit: 0, uses: 35, maxUses: 35, range: [2,2], desc: 'A weak practice bow.' },
  BRONZE_BOW:   { name: 'Bronze Bow',   type: 'bow',   tier: 'bronze',  might: 4, hit: 85, crit: 0, uses: 25, maxUses: 25, range: [2,2], desc: 'A reliable bronze bow.' },
  IRON_BOW:     { name: 'Iron Bow',     type: 'bow',   tier: 'iron',    might: 6, hit: 80, crit: 0, uses: 20, maxUses: 20, range: [2,2], desc: 'High-tension iron bow.' },
  // ── Generic tomes (for enemy Necromancers — no special effects) ─────────────
  WOOD_TOME:   { name: 'Wood Tome',   type: 'tome', tier: 'wood',   isMagic: true, might: 2, hit: 90, crit: 0, uses: 35, maxUses: 35, range: [1,2], desc: 'A crude magic tome.' },
  BRONZE_TOME: { name: 'Bronze Tome', type: 'tome', tier: 'bronze', isMagic: true, might: 5, hit: 85, crit: 0, uses: 25, maxUses: 25, range: [1,2], desc: 'A reliable magic tome.' },
  IRON_TOME:   { name: 'Iron Tome',   type: 'tome', tier: 'iron',   isMagic: true, might: 8, hit: 80, crit: 0, uses: 20, maxUses: 20, range: [1,2], desc: 'A heavy magic tome.' },
  // ── Tomes & Dark Magic (isMagic — uses Moj stat for attack) ─────────────────
  FLAME:   { name: 'Flame',   type: 'tome', tier: 'bronze', isMagic: true, might:  5, hit: 85, crit: 5, uses: 20, maxUses: 20, range: [1,2], effect: { type: 'burn',   chance: 40  }, desc: 'Fire tome. Burns on hit.' },
  SMITE:   { name: 'Smite',   type: 'tome', tier: 'bronze', isMagic: true, might: 25, hit: 70, crit: 0, uses:  3, maxUses:  3, range: [1,2],                                           desc: 'Holy wrath. 3 uses only.' },
  DROUGHT: { name: 'Drought', type: 'dark', tier: 'wood',   isMagic: true, might:  2, hit: 85, crit: 0, uses: 25, maxUses: 25, range: [1,2], effect: { type: 'poison', chance: 100 }, desc: 'Dark curse. Poisons on hit.' },
  // ── Staves (support only — isStaff; skipped in auto-equip for combat) ───────
  HEAL: { name: 'Heal', type: 'staff', tier: 'bronze', isStaff: true, might: 0, hit: 100, crit: 0, uses: 5, maxUses: 5, range: [1,1], healAmount: 10, desc: 'Restores HP to an ally.' },
  // ── Consumable items ─────────────────────────────────────────────────────────
  HEALING_POTION: { name: 'Healing Potion', type: 'consumable', tier: 'basic', isConsumable: true, uses: 3, maxUses: 3, healAmount: 10, desc: 'Restores 10 HP to the user.' },
  // ── Special lord weapons ─────────────────────────────────────────────────────
  SERPENTS_BONE: { name: "Serpent's Bone", type: 'sword', tier: 'special', might:  6, hit: 85, crit: 5, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'execute',   charges: 1 },                              desc: 'Stolen from a dead god.' },
  PIERCER:       { name: 'Piercer',        type: 'lance', tier: 'special', might:  5, hit: 80, crit: 0, uses: 20, maxUses: 20, range: [1,1], effect: { type: 'effective', vsClass: 'Bulwark', multiplier: 3 },        desc: 'Forged to crack plate armor.' },
  SWIFT_BLADE:   { name: 'Swift Blade',    type: 'sword', tier: 'special', might:  4, hit: 90, crit: 0, uses: 20, maxUses: 20, range: [1,1], effect: { type: 'effective', vsWeapon: 'axe',    multiplier: 2 },        desc: 'Honed for quick strikes.' },
};

// Clone a weapon template into a fresh instance.
// The effect object is also cloned so mutable fields like charges are independent.
function makeWeapon(key) {
  const t = WEAPON_DATA[key];
  const w = Object.assign({}, t);
  if (w.effect) w.effect = Object.assign({}, w.effect);
  return w;
}

// Lord definitions — base stats, growth rates, class identity, and movement costs
const LORD_DEFS = [
  {
    label: 'LORD I', className: 'Pickpocket', color: 0x3a5fa0, light: '#8ab0f0',
    desc: 'Swift blade. No terrain.',
    stats:   { hp: 20, pow: 8,  moj: 2,  sp: 7, lck: 5, def: 5, mdef: 4, move: 5 },
    growths: { hp: 80, pow: 70, moj: 10, sp: 75, lck: 55, def: 55, mdef: 35 },
    moveCosts: CLASS_MOVE_COSTS.PICKPOCKET,
    startingWeapons: ['SERPENTS_BONE', 'HEALING_POTION'],
  },
  {
    label: 'LORD II', className: 'Astronomer', color: 0x6a3a9a, light: '#b080f0',
    desc: 'All magic and staves.',
    stats:   { hp: 17, pow: 3,  moj: 11, sp: 7, lck: 6, def: 3, mdef: 8, move: 5 },
    growths: { hp: 65, pow: 10, moj: 90, sp: 65, lck: 60, def: 15, mdef: 85 },
    moveCosts: CLASS_MOVE_COSTS.NORMAL,
    startingWeapons: ['FLAME', 'SMITE', 'DROUGHT', 'HEAL', 'HEALING_POTION'],
  },
  {
    label: 'LORD III', className: 'Stud Master', color: 0x3a8a50, light: '#80d090',
    desc: 'Mounted. High Pow and Move.',
    stats:   { hp: 22, pow: 10, moj: 1,  sp: 6, lck: 4, def: 8, mdef: 3, move: 7 },
    growths: { hp: 90, pow: 75, moj: 5,  sp: 50, lck: 40, def: 75, mdef: 20 },
    moveCosts: CLASS_MOVE_COSTS.CAVALRY,
    startingWeapons: ['SWIFT_BLADE', 'PIERCER', 'HEALING_POTION'],
  },
];
