// ─── constants.js ───────────────────────────────────────────────────────────
// All magic numbers and shared enums live here.

const GAME_W = 960;
const GAME_H = 640;

const MAX_FLOORS = 30;  // total floors in a run

// Floors that present a guaranteed recruit offer before the map loads.
// 14 opportunities total — lord + 14 = 15 max units.
const RECRUIT_FLOORS = new Set([2, 3, 4, 6, 8, 11, 13, 16, 18, 21, 23, 26, 28, 29]);
// Floor type helpers (used throughout the game)
const isCastleFloor = f => f % 5 === 0;          // floors 5,10,15,20,25,30
const isBossFloor   = f => f % 10 === 0;          // floors 10,20,30 (structure reserved)

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
  DOOR:     9,   // locked door — impassable until opened with a key or lockpick
  CHEST:    10,  // treasure chest — interact from adjacent tile
};

const TILE_NAME = ['Plain','Forest','Mountain','Wall','Fort','Village','Throne','Water','Road','Door','Chest'];

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
  { fill: 0x6a3a18, shade: 0x4a2208 }, // DOOR
  { fill: 0xb08020, shade: 0x806010 }, // CHEST
];

const TILE_ICON = ['', '♣', '▲', '▪', '□', '⌂', '♛', '~', '', '▬', '⊞'];

// Movement cost per tile type (99 = impassable)
// Index: Plain Forest Mountain Wall Fort Village Throne Water Road Door Chest
const MOVE_COST = [1, 2, 3, 99, 1, 1, 1, 99, 1, 99, 99];

// Per-class movement cost overrides
// Index: Plain Forest Mountain Wall Fort Village Throne Water Road Door Chest
const CLASS_MOVE_COSTS = {
  PICKPOCKET: [1, 1, 1, 99, 1, 1, 1, 99, 1, 99, 99],
  NORMAL:     [1, 2, 3, 99, 1, 1, 1, 99, 1, 99, 99],
  CAVALRY:    [1, 3, 4, 99, 2, 1, 1, 99, 1, 99, 99],
  RUFFIAN:    [1, 2, 3, 99, 1, 1, 1,  2, 1, 99, 99],
  ALICORN:    [1, 1, 1, 99, 1, 1, 1,  1, 1, 99, 99],
  DRAGON:     [1, 1, 2, 99, 1, 1, 1,  1, 1, 99, 99],
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
    name: 'Ruffian', weapons: ['axe'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['hi_crit'],
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
  VAGABOND: {
    name: 'Vagabond', weapons: ['sword'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['hi_crit'],
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
  DRAGOON_KNIGHT: {
    name: 'Dragoon Knight', weapons: ['axe', 'lance'],
    moveCosts: CLASS_MOVE_COSTS.DRAGON, mounted: true, flying: true,
    abilities: ['flight', 'bow_weakness', 'magic_weakness', 'dragon_scales'],
  },
  DEFENDER: {
    name: 'Defender', weapons: ['axe', 'sword'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['hi_crit', 'lifesteal'],
  },
  SPECIALIST: {
    name: 'Specialist', weapons: ['lance', 'bow'],
    moveCosts: CLASS_MOVE_COSTS.NORMAL, mounted: false, flying: false,
    abilities: ['reach', 'versatile'],
  },
};

// Defence bonus per tile type (index matches TILE values)
const TILE_DEF  = [0, 1, 2, 0, 2, 1, 3, 0, 0, 0, 0];

// Map dimensions
const MAP_W  = 15;
const MAP_H  = 12;
const TILE_S = 56;   // pixels per tile (14 × 4 — game now renders at native 960×640)
const UI_H   = 120;  // bottom HUD height (30 × 4)

// Factions
const FACTION = { PLAYER: 0, ENEMY: 1, NEUTRAL: 2 };

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
  IRON_TOME:        { name: 'Iron Tome',        type: 'tome', tier: 'iron',        isMagic: true, might:  8, hit: 80, crit:  0, uses: 20, maxUses: 20, range: [1,2], desc: 'A heavy magic tome.' },
  // ── Steel tier ───────────────────────────────────────────────────────────────
  STEEL_SWORD:      { name: 'Steel Sword',      type: 'sword', tier: 'steel',                  might:  8, hit: 85, crit:  0, uses: 18, maxUses: 18, range: [1,1], desc: 'A finely forged steel blade.' },
  STEEL_LANCE:      { name: 'Steel Lance',      type: 'lance', tier: 'steel',                  might:  9, hit: 75, crit:  0, uses: 18, maxUses: 18, range: [1,1], desc: 'A tempered steel spear.' },
  STEEL_AXE:        { name: 'Steel Axe',        type: 'axe',   tier: 'steel',                  might: 10, hit: 65, crit:  0, uses: 18, maxUses: 18, range: [1,1], desc: 'A heavy steel axe.' },
  STEEL_BOW:        { name: 'Steel Bow',        type: 'bow',   tier: 'steel',                  might:  8, hit: 80, crit:  0, uses: 18, maxUses: 18, range: [2,2], desc: 'A powerful steel bow.' },
  STEEL_TOME:       { name: 'Steel Tome',       type: 'tome',  tier: 'steel',  isMagic: true,  might: 11, hit: 80, crit:  0, uses: 18, maxUses: 18, range: [1,2], desc: 'A reinforced magic tome.' },
  // ── Ivory tier ───────────────────────────────────────────────────────────────
  IVORY_SWORD:      { name: 'Ivory Sword',      type: 'sword', tier: 'ivory',                  might: 10, hit: 80, crit:  0, uses: 15, maxUses: 15, range: [1,1], desc: 'A blade carved from ancient ivory.' },
  IVORY_LANCE:      { name: 'Ivory Lance',      type: 'lance', tier: 'ivory',                  might: 11, hit: 70, crit:  0, uses: 15, maxUses: 15, range: [1,1], desc: 'A pale, razor-sharp lance.' },
  IVORY_AXE:        { name: 'Ivory Axe',        type: 'axe',   tier: 'ivory',                  might: 12, hit: 60, crit:  0, uses: 15, maxUses: 15, range: [1,1], desc: 'A massive ivory-tipped axe.' },
  IVORY_BOW:        { name: 'Ivory Bow',        type: 'bow',   tier: 'ivory',                  might: 10, hit: 75, crit:  0, uses: 15, maxUses: 15, range: [2,2], desc: 'An ornate ivory bow.' },
  IVORY_TOME:       { name: 'Ivory Tome',       type: 'tome',  tier: 'ivory',  isMagic: true,  might: 14, hit: 75, crit:  0, uses: 15, maxUses: 15, range: [1,2], desc: 'A tome bound in ivory.' },
  // ── Dragonscale tier ─────────────────────────────────────────────────────────
  DRAGONSCALE_SWORD:{ name: 'Dragonscale Sword',type: 'sword', tier: 'dragonscale',             might: 12, hit: 75, crit:  0, uses: 12, maxUses: 12, range: [1,1], desc: 'Forged with dragonscale, cuts through armour.' },
  DRAGONSCALE_LANCE:{ name: 'Dragonscale Lance',type: 'lance', tier: 'dragonscale',             might: 13, hit: 65, crit:  0, uses: 12, maxUses: 12, range: [1,1], desc: 'A terrifying lance of dragon origin.' },
  DRAGONSCALE_AXE:  { name: 'Dragonscale Axe',  type: 'axe',   tier: 'dragonscale',             might: 14, hit: 55, crit:  0, uses: 12, maxUses: 12, range: [1,1], desc: 'Devastating dragonscale axe.' },
  DRAGONSCALE_BOW:  { name: 'Dragonscale Bow',  type: 'bow',   tier: 'dragonscale',             might: 12, hit: 70, crit:  0, uses: 12, maxUses: 12, range: [2,2], desc: 'A bow strung with dragon sinew.' },
  DRAGONSCALE_TOME: { name: 'Dragonscale Tome', type: 'tome',  tier: 'dragonscale',isMagic: true,might:17, hit: 70, crit:  0, uses: 12, maxUses: 12, range: [1,2], desc: 'Ancient magic etched in dragonscale.' },
  // ── Gold tier (1.5× Steel might, 3 uses — burst damage) ──────────────────────
  GOLD_SWORD:       { name: 'Gold Sword',       type: 'sword', tier: 'gold',                   might: 12, hit: 85, crit:  5, uses:  3, maxUses:  3, range: [1,1], desc: 'Gleaming. Cuts deep, fades fast.' },
  GOLD_LANCE:       { name: 'Gold Lance',       type: 'lance', tier: 'gold',                   might: 13, hit: 75, crit:  5, uses:  3, maxUses:  3, range: [1,1], desc: 'A golden lance that strikes true.' },
  GOLD_AXE:         { name: 'Gold Axe',         type: 'axe',   tier: 'gold',                   might: 15, hit: 65, crit:  5, uses:  3, maxUses:  3, range: [1,1], desc: 'Heavy gold — enormous damage.' },
  GOLD_BOW:         { name: 'Gold Bow',         type: 'bow',   tier: 'gold',                   might: 12, hit: 80, crit:  5, uses:  3, maxUses:  3, range: [2,2], desc: 'A golden bow of unerring accuracy.' },
  GOLD_TOME:        { name: 'Gold Tome',        type: 'tome',  tier: 'gold',   isMagic: true,  might: 16, hit: 80, crit:  5, uses:  3, maxUses:  3, range: [1,2], desc: 'Forbidden knowledge, three castings only.' },
  // ── Pearl tier (1.5× Dragonscale might, 1 use — single decisive strike) ──────
  PEARL_SWORD:      { name: 'Pearl Sword',      type: 'sword', tier: 'pearl',                  might: 18, hit: 75, crit: 10, uses:  1, maxUses:  1, range: [1,1], desc: 'One perfect strike.' },
  PEARL_LANCE:      { name: 'Pearl Lance',      type: 'lance', tier: 'pearl',                  might: 19, hit: 65, crit: 10, uses:  1, maxUses:  1, range: [1,1], desc: 'One thrust that ends battles.' },
  PEARL_AXE:        { name: 'Pearl Axe',        type: 'axe',   tier: 'pearl',                  might: 21, hit: 55, crit: 10, uses:  1, maxUses:  1, range: [1,1], desc: 'Annihilating. One use.' },
  PEARL_BOW:        { name: 'Pearl Bow',        type: 'bow',   tier: 'pearl',                  might: 18, hit: 70, crit: 10, uses:  1, maxUses:  1, range: [2,2], desc: 'A single arrow that never misses its mark.' },
  PEARL_TOME:       { name: 'Pearl Tome',       type: 'tome',  tier: 'pearl',  isMagic: true,  might: 25, hit: 70, crit: 10, uses:  1, maxUses:  1, range: [1,2], desc: 'Absolute magic. One casting only.' },
  // ── Tomes & Dark Magic (isMagic — uses Mag stat for attack) ──────────────────
  FLAME:   { name: 'Flame',   type: 'tome', tier: 'bronze', isMagic: true, might:  5, hit: 85, crit: 5, uses: 20, maxUses: 20, range: [1,2], effect: { type: 'burn',   chance: 40  }, desc: 'Fire tome. Burns on hit.' },
  SMITE:   { name: 'Smite',   type: 'tome', tier: 'bronze', isMagic: true, might: 25, hit: 70, crit: 0, uses:  3, maxUses:  3, range: [1,2],                                           desc: 'Holy wrath. 3 uses only.' },
  DROUGHT: { name: 'Drought', type: 'dark', tier: 'wood',   isMagic: true, might:  2, hit: 85, crit: 0, uses: 25, maxUses: 25, range: [1,2], effect: { type: 'poison', chance: 100 }, desc: 'Dark curse. Poisons on hit.' },
  // ── Staves (support only — isStaff; skipped in auto-equip for combat) ───────
  HEAL: { name: 'Heal', type: 'staff', tier: 'bronze', isStaff: true, might: 0, hit: 100, crit: 0, uses: 5, maxUses: 5, range: [1,1], healAmount: 10, desc: 'Restores HP to an ally.' },
  // ── Consumable items ─────────────────────────────────────────────────────────
  HEALING_POTION: { name: 'Healing Potion', type: 'consumable', tier: 'basic', isConsumable: true, uses: 3, maxUses: 3, healAmount: 10, desc: 'Restores 10 HP to the user.' },
  // ── Castle keys (castle floors only) ─────────────────────────────────────────
  DOOR_KEY:  { name: 'Door Key',  type: 'key', tier: 'basic', isKey: true, keyType: 'door',  uses: 1, maxUses: 1, desc: 'Opens one locked door.' },
  CHEST_KEY: { name: 'Chest Key', type: 'key', tier: 'basic', isKey: true, keyType: 'chest', uses: 2, maxUses: 2, desc: 'Opens up to 2 chests.' },
  // ── Elemental weapons ─────────────────────────────────────────────────────────
  // Iron-tier might, 15 uses, 35% chance to inflict status on hit.
  BLAZE_SWORD:  { name: 'Blaze Sword',  type: 'sword', tier: 'iron', might: 5, hit: 80, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'burn',     chance: 35 }, desc: 'Burns on hit (35%). Halves target Pow.' },
  BLAZE_LANCE:  { name: 'Blaze Lance',  type: 'lance', tier: 'iron', might: 6, hit: 70, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'burn',     chance: 35 }, desc: 'Burns on hit (35%). Halves target Pow.' },
  BLAZE_AXE:    { name: 'Blaze Axe',    type: 'axe',   tier: 'iron', might: 7, hit: 60, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'burn',     chance: 35 }, desc: 'Burns on hit (35%). Halves target Pow.' },
  BLAZE_BOW:    { name: 'Blaze Bow',    type: 'bow',   tier: 'iron', might: 5, hit: 75, crit: 0, uses: 15, maxUses: 15, range: [2,2], effect: { type: 'burn',     chance: 35 }, desc: 'Burns on hit (35%). Halves target Pow.' },
  FROST_SWORD:  { name: 'Frost Sword',  type: 'sword', tier: 'iron', might: 5, hit: 80, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'freeze',   chance: 35 }, desc: 'Freezes on hit (35%). Immobilizes; 40% thaw per turn.' },
  FROST_LANCE:  { name: 'Frost Lance',  type: 'lance', tier: 'iron', might: 6, hit: 70, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'freeze',   chance: 35 }, desc: 'Freezes on hit (35%). Immobilizes; 40% thaw per turn.' },
  FROST_AXE:    { name: 'Frost Axe',    type: 'axe',   tier: 'iron', might: 7, hit: 60, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'freeze',   chance: 35 }, desc: 'Freezes on hit (35%). Immobilizes; 40% thaw per turn.' },
  FROST_BOW:    { name: 'Frost Bow',    type: 'bow',   tier: 'iron', might: 5, hit: 75, crit: 0, uses: 15, maxUses: 15, range: [2,2], effect: { type: 'freeze',   chance: 35 }, desc: 'Freezes on hit (35%). Immobilizes; 40% thaw per turn.' },
  POISON_SWORD: { name: 'Poison Sword', type: 'sword', tier: 'iron', might: 5, hit: 80, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'poison',   chance: 35 }, desc: 'Poisons on hit (35%). 15% max HP per turn.' },
  POISON_LANCE: { name: 'Poison Lance', type: 'lance', tier: 'iron', might: 6, hit: 70, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'poison',   chance: 35 }, desc: 'Poisons on hit (35%). 15% max HP per turn.' },
  POISON_AXE:   { name: 'Poison Axe',   type: 'axe',   tier: 'iron', might: 7, hit: 60, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'poison',   chance: 35 }, desc: 'Poisons on hit (35%). 15% max HP per turn.' },
  POISON_BOW:   { name: 'Poison Bow',   type: 'bow',   tier: 'iron', might: 5, hit: 75, crit: 0, uses: 15, maxUses: 15, range: [2,2], effect: { type: 'poison',   chance: 35 }, desc: 'Poisons on hit (35%). 15% max HP per turn.' },
  SPARK_SWORD:  { name: 'Spark Sword',  type: 'sword', tier: 'iron', might: 5, hit: 80, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'paralyze', chance: 35 }, desc: 'Paralyzes on hit (35%). Halves target Spd.' },
  SPARK_LANCE:  { name: 'Spark Lance',  type: 'lance', tier: 'iron', might: 6, hit: 70, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'paralyze', chance: 35 }, desc: 'Paralyzes on hit (35%). Halves target Spd.' },
  SPARK_AXE:    { name: 'Spark Axe',    type: 'axe',   tier: 'iron', might: 7, hit: 60, crit: 0, uses: 15, maxUses: 15, range: [1,1], effect: { type: 'paralyze', chance: 35 }, desc: 'Paralyzes on hit (35%). Halves target Spd.' },
  SPARK_BOW:    { name: 'Spark Bow',    type: 'bow',   tier: 'iron', might: 5, hit: 75, crit: 0, uses: 15, maxUses: 15, range: [2,2], effect: { type: 'paralyze', chance: 35 }, desc: 'Paralyzes on hit (35%). Halves target Spd.' },
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
    stats:   { hp: 20, pow: 8,  mag: 2,  sp: 7, lck: 5, def: 5, mdef: 4, move: 5 },
    growths: { hp: 80, pow: 70, mag: 10, sp: 75, lck: 55, def: 55, mdef: 35 },
    moveCosts: CLASS_MOVE_COSTS.PICKPOCKET,
    startingWeapons: ['SERPENTS_BONE', 'HEALING_POTION', 'HEALING_POTION'],
  },
  {
    label: 'LORD II', className: 'Astronomer', color: 0x6a3a9a, light: '#b080f0',
    desc: 'All magic and staves.',
    stats:   { hp: 17, pow: 3,  mag: 11, sp: 7, lck: 6, def: 3, mdef: 8, move: 5 },
    growths: { hp: 65, pow: 10, mag: 90, sp: 65, lck: 60, def: 15, mdef: 85 },
    moveCosts: CLASS_MOVE_COSTS.NORMAL,
    startingWeapons: ['FLAME', 'SMITE', 'DROUGHT', 'HEAL', 'HEALING_POTION', 'HEALING_POTION'],
  },
  {
    label: 'LORD III', className: 'Stud Master', color: 0x3a8a50, light: '#80d090',
    desc: 'Mounted. High Pow and Move.',
    stats:   { hp: 18, pow: 8,  mag: 1,  sp: 5, lck: 4, def: 6, mdef: 3, move: 7 },
    growths: { hp: 95, pow: 85, mag: 5,  sp: 60, lck: 50, def: 85, mdef: 25 },
    moveCosts: CLASS_MOVE_COSTS.CAVALRY,
    startingWeapons: ['SWIFT_BLADE', 'PIERCER', 'HEALING_POTION', 'HEALING_POTION'],
  },
];
