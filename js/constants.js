// ─── constants.js ───────────────────────────────────────────────────────────
// All magic numbers and shared enums live here.

const GAME_W = 240;
const GAME_H = 160;

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

// Lord definitions — base stats, growth rates, class identity, and movement costs
const LORD_DEFS = [
  {
    label: 'LORD I', className: 'Pickpocket', color: 0x3a5fa0, light: '#8ab0f0',
    desc: 'Swift blade. No terrain.',
    stats:   { hp: 20, pow: 8,  moj: 2,  sp: 7, lck: 5, def: 5, mdef: 4, move: 5 },
    growths: { hp: 75, pow: 50, moj: 15, sp: 55, lck: 40, def: 40, mdef: 30 },
    moveCosts: CLASS_MOVE_COSTS.PICKPOCKET,
  },
  {
    label: 'LORD II', className: 'Astronomer', color: 0x6a3a9a, light: '#b080f0',
    desc: 'All magic and staves.',
    stats:   { hp: 17, pow: 3,  moj: 11, sp: 7, lck: 6, def: 3, mdef: 8, move: 5 },
    growths: { hp: 60, pow: 15, moj: 70, sp: 55, lck: 50, def: 20, mdef: 65 },
    moveCosts: CLASS_MOVE_COSTS.NORMAL,
  },
  {
    label: 'LORD III', className: 'Stud Master', color: 0x3a8a50, light: '#80d090',
    desc: 'Mounted. High Pow and Move.',
    stats:   { hp: 22, pow: 10, moj: 1,  sp: 6, lck: 4, def: 8, mdef: 3, move: 7 },
    growths: { hp: 80, pow: 60, moj: 5,  sp: 45, lck: 35, def: 55, mdef: 20 },
    moveCosts: CLASS_MOVE_COSTS.CAVALRY,
  },
];
