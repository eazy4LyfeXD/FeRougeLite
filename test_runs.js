#!/usr/bin/env node
// test_runs.js — headless run simulator: 3 runs × 3 lords (9 total)
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ─── Load pure-JS game modules into a shared VM context ──────────────────────
const dir = path.join(__dirname, 'js');
const src  = [
  fs.readFileSync(path.join(dir, 'constants.js'), 'utf8'),
  fs.readFileSync(path.join(dir, 'Unit.js'),      'utf8'),
  fs.readFileSync(path.join(dir, 'MapGen.js'),    'utf8'),
  // var so it becomes a ctx property
  `var __G = { MAX_FLOORS, isCastleFloor, TILE, MAP_W, MAP_H, TILE_DEF,
    FACTION, MOVE_COST, CLASS_MOVE_COSTS, CLASSES, WEAPON_DATA,
    LORD_DEFS, makeWeapon, Unit, MapGen };`,
].join('\n\n');

const ctx = vm.createContext({
  Math, Array, Object, String, Number, Boolean, JSON, Date,
  Error, TypeError, RegExp, Map, Set, Promise,
  parseInt, parseFloat, isNaN, isFinite, undefined, Infinity, NaN, console,
});
vm.runInContext(src, ctx);

const {
  MAX_FLOORS, isCastleFloor, TILE, MAP_W, MAP_H, TILE_DEF,
  FACTION, MOVE_COST, CLASS_MOVE_COSTS, WEAPON_DATA,
  LORD_DEFS, makeWeapon, Unit, MapGen,
} = ctx.__G;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const tilePassable = (grid, x, y) =>
  x >= 0 && x < MAP_W && y >= 0 && y < MAP_H && MOVE_COST[grid[y][x]] < 99;

const unitAt = (units, x, y) =>
  units.find(u => u.gx === x && u.gy === y && u.alive);

function weaponRange(unit) {
  const w = unit.equippedWeapon;
  if (!w || w.isStaff || w.isConsumable || w.isKey) return [1, 1];
  return w.range || [1, 1];
}

function cloneWeapon(w) {
  const c = Object.assign({}, w);
  if (c.effect) c.effect = Object.assign({}, c.effect);
  return c;
}

// ─── Combat ───────────────────────────────────────────────────────────────────
function doAttack(attacker, defender, grid, floor) {
  if (!attacker.alive || !defender.alive) return;

  const tDef = TILE_DEF[grid[defender.gy][defender.gx]];
  const { dmg, doubles } = attacker.calcDamage(defender, tDef);
  const aw         = attacker.equippedWeapon;
  const critChance = (aw ? (aw.crit || 0) : 0) +
                     (attacker.abilities.includes('hi_crit') ? 20 : 0);

  function applyHit() {
    if (!defender.alive) return;
    const isCrit = critChance > 0 && Math.random() * 100 < critChance;
    defender.hp -= isCrit ? dmg * 3 : dmg;
  }

  applyHit();
  if (doubles && defender.alive) applyHit();

  // On-hit status
  if (aw && aw.effect && ['burn','poison','freeze','paralyze'].includes(aw.effect.type)) {
    if (!defender.hasStatus(aw.effect.type) && Math.random() * 100 < aw.effect.chance)
      defender.addStatus(aw.effect.type);
  }

  attacker.decrementWeaponUses();

  // Counter-attack
  if (defender.alive) {
    const dist = Math.abs(attacker.gx - defender.gx) + Math.abs(attacker.gy - defender.gy);
    const [defMin, defMax] = weaponRange(defender);
    const dw = defender.equippedWeapon;
    if (dw && !dw.isStaff && !dw.isConsumable && !dw.isKey &&
        dist >= defMin && dist <= defMax) {
      const aTDef = TILE_DEF[grid[attacker.gy][attacker.gx]];
      const { dmg: cdmg } = defender.calcDamage(attacker, aTDef);
      attacker.hp -= cdmg;
      defender.decrementWeaponUses();
    }
  }

  // XP
  const xpFor = (killer, victim) => victim.isBoss
    ? 100
    : Math.max(5, Math.round(40 * Math.pow(0.9, killer.level - 1) * (1 + (floor - 1) * 0.15)));

  if (attacker.faction === FACTION.PLAYER && !defender.alive)
    attacker.awardXP(xpFor(attacker, defender));
  if (defender.faction === FACTION.PLAYER && !attacker.alive)
    defender.awardXP(xpFor(defender, attacker));
}

// ─── AI — Player ──────────────────────────────────────────────────────────────
function playerAct(unit, units, grid, floor) {
  if (!unit.alive) return;

  // Heal if low and have a potion
  if (unit.hp < unit.maxHp * 0.4) {
    const pot = unit.weapons.find(w => w.isConsumable && w.healAmount && w.uses > 0);
    if (pot) {
      unit.hp = Math.min(unit.maxHp, unit.hp + pot.healAmount);
      pot.uses--;
      if (pot.uses <= 0) unit.weapons = unit.weapons.filter(w => w !== pot);
      return;
    }
  }

  // Ensure a combat weapon is equipped
  if (!unit.equippedWeapon || unit.equippedWeapon.isStaff ||
      unit.equippedWeapon.isConsumable || unit.equippedWeapon.isKey) {
    const cw = unit.weapons.find(w => !w.isStaff && !w.isConsumable && !w.isKey);
    if (cw) unit.equippedWeapon = cw;
    else return;
  }

  const enemies = units.filter(u => u.faction === FACTION.ENEMY && u.alive);
  if (!enemies.length) return;

  // Target: boss first, then nearest
  let target = enemies.find(e => e.isBoss);
  if (!target) {
    let bestD = 9999;
    for (const e of enemies) {
      const d = Math.abs(unit.gx - e.gx) + Math.abs(unit.gy - e.gy);
      if (d < bestD) { bestD = d; target = e; }
    }
  }
  if (!target) return;

  const [minR] = weaponRange(unit);
  const moveRange = unit.computeMoveRange(grid, units);

  // Move to position within weapon range of target
  let bestPos = { x: unit.gx, y: unit.gy };
  let bestScore = 9999;
  for (const key of moveRange.keys()) {
    const [mx, my] = key.split(',').map(Number);
    if (unitAt(units, mx, my) && unitAt(units, mx, my) !== unit) continue;
    const d = Math.abs(mx - target.gx) + Math.abs(my - target.gy);
    const score = Math.abs(d - minR);
    if (score < bestScore) { bestScore = score; bestPos = { x: mx, y: my }; }
  }

  unit.gx = bestPos.x;
  unit.gy = bestPos.y;

  // Attack if in range
  const [wMin, wMax] = weaponRange(unit);
  const dist = Math.abs(unit.gx - target.gx) + Math.abs(unit.gy - target.gy);
  if (dist >= wMin && dist <= wMax) doAttack(unit, target, grid, floor);
}

// ─── AI — Enemy ───────────────────────────────────────────────────────────────
function enemyAct(eu, units, grid, floor) {
  if (!eu.alive) return;

  // Status ticks
  if (eu.hasStatus('poison')) {
    eu.hp -= Math.max(1, Math.floor(eu.maxHp * 0.15));
    if (!eu.alive) return;
  }
  if (eu.hasStatus('freeze')) {
    if (Math.random() < 0.4)
      eu.statusEffects = eu.statusEffects.filter(s => s.type !== 'freeze');
    else return;
  }

  const [euMin, euMax] = weaponRange(eu);

  // Find nearest player
  let target = null, bestD = 9999;
  for (const u of units) {
    if (u.faction === FACTION.PLAYER && u.alive) {
      const d = Math.abs(eu.gx - u.gx) + Math.abs(eu.gy - u.gy);
      if (d < bestD) { bestD = d; target = u; }
    }
  }
  if (!target) return;

  if (bestD >= euMin && bestD <= euMax) { doAttack(eu, target, grid, floor); return; }

  // Move toward target (one step BFS simplification from GameMapScene)
  let bestPos = { x: eu.gx, y: eu.gy };
  let bestGap  = Math.abs(bestD - euMin);
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = eu.gx + dx, ny = eu.gy + dy;
    if (!tilePassable(grid, nx, ny)) continue;
    if (unitAt(units, nx, ny)) continue;
    const d   = Math.abs(nx - target.gx) + Math.abs(ny - target.gy);
    const gap = Math.abs(d - euMin);
    if (gap < bestGap) { bestGap = gap; bestPos = { x: nx, y: ny }; }
  }
  eu.gx = bestPos.x;
  eu.gy = bestPos.y;

  const nd = Math.abs(eu.gx - target.gx) + Math.abs(eu.gy - target.gy);
  if (nd >= euMin && nd <= euMax) doAttack(eu, target, grid, floor);
}

// ─── Floor simulation ─────────────────────────────────────────────────────────
function simulateFloor(saveData) {
  const floor  = saveData.currentLevel;
  const castle = isCastleFloor(floor);
  const { grid, thronePos, rng } =
    castle ? MapGen.generateCastle(saveData.mapSeed) : MapGen.generate(saveData.mapSeed);

  const sc = (base, pp) => base + Math.round((floor - 1) * pp);
  const TIERS   = ['WOOD','BRONZE','IRON','STEEL','IVORY','DRAGONSCALE'];
  const tierIdx = Math.min(5, Math.floor((floor - 1) / 5));
  const tier    = TIERS[tierIdx];
  const bTier   = TIERS[Math.min(5, tierIdx + 1)];

  const units = [];

  // Spawn lord
  const ld          = LORD_DEFS[saveData.selectedLord];
  const lordWeapons = (ld.startingWeapons || []).map(k => makeWeapon(k));
  const lord = new Unit({
    name: ld.label, faction: FACTION.PLAYER,
    gx: 1, gy: Math.floor(MAP_H / 2),
    ...ld.stats, level: 1, growths: ld.growths, moveCosts: ld.moveCosts,
    className: ld.className, color: ld.color, symbol: '♞', isLord: true,
    weapons: lordWeapons,
  });

  const ps = saveData.playerStats;
  if (ps) {
    Object.assign(lord, {
      maxHp: ps.maxHp, hp: ps.hp, pow: ps.pow, mag: ps.mag,
      sp: ps.sp, lck: ps.lck, def: ps.def, mdef: ps.mdef,
      level: ps.level, xp: ps.xp || 0,
    });
    if (ps.weapons && ps.weapons.length) {
      lord.weapons = ps.weapons.map(cloneWeapon);
      lord.weapons.forEach(w => { if (w.effect && w.effect.type === 'execute') w.effect.charges = 1; });
      lord.equippedWeapon = lord.weapons[ps.equippedIdx] ||
        lord.weapons.find(w => !w.isStaff && !w.isConsumable) || lord.weapons[0] || null;
    }
    if (ps.abilities) lord.abilities = [...ps.abilities];
    lord.hp = Math.min(lord.maxHp, lord.hp + Math.floor(lord.maxHp / 2));
  }
  units.push(lord);

  // Spawn 6 regular enemies
  const eTypes = [
    { name:'Grunt',         className:'Grunt',         hp:sc(10,0.70), pow:sc(4,0.25),  mag:0,          sp:sc(3,0.10), lck:2,         def:sc(2,0.20), mdef:sc(1,0.10), move:4, moveCosts:CLASS_MOVE_COSTS.NORMAL,   abilities:[],          weapons:[makeWeapon(`${tier}_LANCE`)] },
    { name:'Fletcher',      className:'Fletcher',      hp:sc(9,0.60),  pow:sc(5,0.25),  mag:0,          sp:sc(4,0.10), lck:3,         def:sc(2,0.15), mdef:sc(1,0.10), move:6, moveCosts:CLASS_MOVE_COSTS.CAVALRY,  abilities:[],          weapons:[makeWeapon(`${tier}_SWORD`)] },
    { name:'Necromancer',   className:'Necromancer',   hp:sc(8,0.60),  pow:2,           mag:sc(4,0.25), sp:sc(3,0.10), lck:4,         def:sc(1,0.12), mdef:sc(3,0.15), move:5, moveCosts:CLASS_MOVE_COSTS.NORMAL,   abilities:[],          weapons:[makeWeapon(`${tier}_TOME`)]  },
    { name:'Vagabond',      className:'Vagabond',      hp:sc(8,0.50),  pow:sc(5,0.25),  mag:0,          sp:sc(6,0.25), lck:sc(3,0.10),def:sc(2,0.10), mdef:sc(1,0.10), move:5, moveCosts:CLASS_MOVE_COSTS.NORMAL,   abilities:['hi_crit'], weapons:[makeWeapon(`${tier}_SWORD`)] },
    { name:'Alicorn Rider', className:'Alicorn Rider', hp:sc(9,0.50),  pow:sc(4,0.25),  mag:0,          sp:sc(4,0.25), lck:4,         def:sc(2,0.10), mdef:sc(2,0.12), move:7, moveCosts:CLASS_MOVE_COSTS.ALICORN,  abilities:['flight'],  weapons:[makeWeapon(`${tier}_LANCE`)] },
    { name:'Ruffian',       className:'Ruffian',       hp:sc(13,0.80), pow:sc(6,0.35),  mag:0,          sp:sc(2,0.08), lck:2,         def:sc(2,0.10), mdef:sc(1,0.08), move:4, moveCosts:CLASS_MOVE_COSTS.NORMAL,   abilities:['hi_crit'], weapons:[makeWeapon(`${tier}_AXE`)]  },
  ];

  const usedPos = new Set();
  let attempts = 0;
  while (usedPos.size < 6 && attempts < 300) {
    attempts++;
    const ex = rng.int(Math.floor(MAP_W / 2) + 1, MAP_W - 1);
    const ey = rng.int(1, MAP_H - 2);
    const k  = `${ex},${ey}`;
    if (tilePassable(grid, ex, ey) && !usedPos.has(k) && !unitAt(units, ex, ey)) {
      usedPos.add(k);
      const et = rng.pick(eTypes);
      units.push(new Unit({
        ...et, faction: FACTION.ENEMY, gx: ex, gy: ey, level: floor,
        color: 0xc04040, symbol: '♟',
        abilities: [...et.abilities], weapons: et.weapons.map(cloneWeapon),
      }));
    }
  }

  // Spawn boss at throne
  if (thronePos && !unitAt(units, thronePos.x, thronePos.y)) {
    const bossPool = [
      { name:'General',    className:'Bulwark',    hp:sc(22,1.50), pow:sc(9,0.50),  mag:2,         sp:sc(3,0.12), lck:5,         def:sc(5,0.40), mdef:sc(3,0.10), move:3, moveCosts:CLASS_MOVE_COSTS.NORMAL,  abilities:[],          weapons:[makeWeapon(`${bTier}_LANCE`)] },
      { name:'Blade Master',className:'Vagabond',  hp:sc(16,1.20), pow:sc(10,0.60), mag:0,         sp:sc(10,0.40),lck:sc(6,0.20),def:sc(3,0.20), mdef:sc(2,0.10), move:5, moveCosts:CLASS_MOVE_COSTS.NORMAL,  abilities:['hi_crit'], weapons:[makeWeapon(`${bTier}_SWORD`)] },
      { name:'Archmage',   className:'Necromancer',hp:sc(15,1.00), pow:2,           mag:sc(9,0.50),sp:sc(5,0.20), lck:sc(4,0.15),def:sc(1,0.10), mdef:sc(7,0.40), move:4, moveCosts:CLASS_MOVE_COSTS.NORMAL,  abilities:[],          weapons:[makeWeapon(`${bTier}_TOME`)]  },
      { name:'Warlord',    className:'Fletcher',   hp:sc(18,1.20), pow:sc(9,0.50),  mag:0,         sp:sc(7,0.25), lck:sc(5,0.15),def:sc(4,0.20), mdef:sc(3,0.10), move:6, moveCosts:CLASS_MOVE_COSTS.NORMAL,  abilities:[],          weapons:[makeWeapon(`${bTier}_SWORD`)] },
    ];
    const bt = rng.pick(bossPool);
    units.push(new Unit({
      ...bt, faction: FACTION.ENEMY, isBoss: true,
      gx: thronePos.x, gy: thronePos.y, level: floor + 2,
      color: 0xe030e0, symbol: '♚',
      abilities: [...bt.abilities], weapons: bt.weapons.map(cloneWeapon),
    }));
  }

  // Simulate turns
  const MAX_TURNS = 150;
  for (let turn = 0; turn < MAX_TURNS; turn++) {

    // ── Player phase ──
    for (const u of units.filter(u => u.faction === FACTION.PLAYER && u.alive)) {
      playerAct(u, units, grid, floor);
    }
    // Prune dead
    for (let i = units.length - 1; i >= 0; i--) if (!units[i].alive) units.splice(i, 1);

    // Check end
    if (!units.some(u => u.faction === FACTION.PLAYER && u.isLord))
      return { outcome: 'defeat', turns: turn + 1 };

    if (!units.some(u => u.isBoss)) {
      return buildVictory(units, saveData, floor, turn + 1);
    }

    // ── Enemy phase (with poison ticks) ──
    for (const eu of units.filter(u => u.faction === FACTION.ENEMY && u.alive).slice()) {
      enemyAct(eu, units, grid, floor);
    }
    // Prune dead
    for (let i = units.length - 1; i >= 0; i--) if (!units[i].alive) units.splice(i, 1);

    // Check end
    if (!units.some(u => u.faction === FACTION.PLAYER && u.isLord))
      return { outcome: 'defeat', turns: turn + 1 };

    if (!units.some(u => u.isBoss)) {
      return buildVictory(units, saveData, floor, turn + 1);
    }
  }

  return { outcome: 'timeout', turns: MAX_TURNS };
}

function buildVictory(units, saveData, floor, turns) {
  const lord = units.find(u => u.faction === FACTION.PLAYER && u.isLord);
  const newSave = {
    ...saveData,
    currentLevel: floor + 1,
    mapSeed: Math.floor(Math.random() * 2_000_000_000),
    playerStats: lord ? {
      maxHp: lord.maxHp, hp: lord.hp, pow: lord.pow, mag: lord.mag,
      sp: lord.sp, lck: lord.lck, def: lord.def, mdef: lord.mdef,
      level: lord.level, xp: lord.xp || 0,
      weapons: lord.weapons.map(cloneWeapon),
      equippedIdx: lord.weapons.indexOf(lord.equippedWeapon),
      abilities: [...(lord.abilities || [])],
    } : null,
    allies: units
      .filter(u => u.faction === FACTION.PLAYER && !u.isLord)
      .map(u => ({
        name: u.name, className: u.className, color: u.color, symbol: u.symbol || '♟',
        level: u.level, xp: u.xp || 0,
        maxHp: u.maxHp, hp: u.hp, pow: u.pow, mag: u.mag,
        sp: u.sp, lck: u.lck, def: u.def, mdef: u.mdef, move: u.move,
        growths: { ...u.growths },
        weapons: u.weapons.map(cloneWeapon),
        equippedIdx: u.weapons.indexOf(u.equippedWeapon),
        abilities: [...(u.abilities || [])],
      })),
  };
  return { outcome: 'victory', turns, saveData: newSave };
}

// ─── Run one complete game (up to MAX_FLOORS) ─────────────────────────────────
function runGame(lordIdx, runNum) {
  const ld   = LORD_DEFS[lordIdx];
  const seed = Math.floor(Math.random() * 2_000_000_000);
  let save   = { hasSave: true, selectedLord: lordIdx, currentLevel: 1,
                 mapSeed: seed, playerStats: null, allies: [] };

  process.stdout.write(`  Run ${runNum}  [seed ${seed}]\n`);

  let floorsCleared = 0;
  let finalOutcome  = 'unknown';

  for (let floor = 1; floor <= MAX_FLOORS; floor++) {
    const res = simulateFloor(save);

    if (res.outcome === 'defeat' || res.outcome === 'timeout') {
      finalOutcome  = res.outcome === 'defeat' ? 'DEFEAT' : 'TIMEOUT';
      const ps      = save.playerStats;
      const hpStr   = ps ? `HP ${ps.hp}/${ps.maxHp}` : `HP ${ld.stats.hp}/${ld.stats.hp}`;
      const lvStr   = ps ? `Lv.${ps.level}` : 'Lv.1';
      process.stdout.write(
        `    Floor ${String(floor).padStart(2)}: ${res.outcome.toUpperCase()} on turn ${res.turns}  (${lvStr} ${hpStr})\n`);
      break;
    }

    floorsCleared = floor;
    save          = res.saveData;
    const ps      = save.playerStats;
    const hpStr   = ps ? `HP ${ps.hp}/${ps.maxHp}` : '';
    const lvStr   = ps ? `Lv.${ps.level}` : '';
    process.stdout.write(
      `    Floor ${String(floor).padStart(2)}: Victory in ${String(res.turns).padStart(3)} turns  (${lvStr} ${hpStr})\n`);

    if (floor === MAX_FLOORS) {
      finalOutcome = 'RUN COMPLETE';
    }
  }

  process.stdout.write(`  → ${finalOutcome}  (${floorsCleared}/${MAX_FLOORS} floors cleared)\n\n`);
  return { lord: ld.label, run: runNum, outcome: finalOutcome, floorsCleared };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('  FE Roguelite — Automated Run Simulator  (3 runs × 3 lords)');
console.log('═══════════════════════════════════════════════════════════════\n');

const summary = [];
for (let li = 0; li < LORD_DEFS.length; li++) {
  const ld = LORD_DEFS[li];
  console.log(`┌─ ${ld.label}: ${ld.className} — ${ld.desc}`);
  for (let r = 1; r <= 3; r++) {
    summary.push(runGame(li, r));
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
for (const r of summary) {
  const bar = '█'.repeat(r.floorsCleared) + '░'.repeat(MAX_FLOORS - r.floorsCleared);
  console.log(`  ${r.lord} Run ${r.run}: ${String(r.outcome).padEnd(14)} ${r.floorsCleared.toString().padStart(2)}/${MAX_FLOORS}  [${bar}]`);
}
console.log('');
