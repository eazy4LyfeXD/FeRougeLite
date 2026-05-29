# Fire Emblem Roguelite — Design Document

> Living document. Sections marked **[TBD]** are not yet decided.
> Update this file as decisions are made before touching code.

---

## 1. Game Overview

A GBA-styled tactical RPG roguelite built in Phaser 3.
Each run places the player on a procedurally generated map with a small squad.
The goal of a run is to defeat the boss unit (General) on the Throne tile.
Runs are self-contained but a small set of meta-upgrades carry over between them.

- **Platform:** Browser (open `index.html` locally)
- **Resolution:** 240 × 160 (GBA native), scaled 4× to ~960 × 640
- **Font:** Press Start 2P (Google Fonts, pixel-perfect at 4× zoom)
- **Controls:** Arrow keys or WASD to move; X = confirm (A button); Z = cancel (B button); Enter = confirm; Esc = cancel

---

## 2. Main Menu

### Options
| Label | Action |
|---|---|
| NEW GAME | Opens File Select screen (mode: new) |
| CONTINUE | Opens File Select screen (mode: continue) |
| EXIT | Closes the browser tab (`window.close()`) |

- Cursor navigates with W/S or Up/Down arrow keys.
- X or Enter confirms. Z or Esc have no action on the top-level menu.
- Decorative star-field background, title panel, menu panel — GBA aesthetic.

### File Select Screen
Reached from either NEW GAME or CONTINUE.

- Displays **3 save slots** stacked vertically.
- Each slot shows:
  - Slot label: `FILE 1`, `FILE 2`, `FILE 3`
  - If empty: `-- EMPTY --`
  - If occupied: Lord name + current level (e.g. `LORD I  Lv.3`)
- Cursor navigates with W/S or Up/Down.
- **NEW GAME mode:**
  - Any slot is selectable.
  - Selecting an empty slot starts a new game immediately.
  - Selecting an occupied slot shows an overwrite confirmation (`X = YES  Z = NO`).
- **CONTINUE mode:**
  - Only occupied slots are selectable (empty slots are dimmed).
  - If no saves exist, the scene transitions back to the main menu automatically.
  - Confirming loads the save and resumes from the correct scene (Lord Select if no lord chosen, Game Map otherwise).
- Z or Esc returns to the main menu.

---

## 3. Save System

- **3 independent save slots**, stored in `localStorage` under keys:
  - `fe_roguelite_save_0`, `fe_roguelite_save_1`, `fe_roguelite_save_2`
- Each slot stores:
  ```
  hasSave       boolean   — slot is occupied
  selectedLord  number    — index into LORD_DEFS (-1 = not yet chosen)
  currentLevel  number    — which map the player is on (starts at 1)
  mapSeed       number    — RNG seed for the current map
  ```
- Slots are independent; deleting one does not affect others.
- **[TBD]** Additional save fields for meta-progression (gold, unlocked lords, passive upgrades).

---

## 4. Unit Stats System

Every unit (lord and enemy alike) has the following stats:

| Stat | Abbr | Description |
|---|---|---|
| Health Points | HP | Current / max hit points. Reaches 0 = dead. |
| Power | Pow | Physical attack strength. |
| Mojo | Moj | Magic attack strength (like FE's Magic stat). |
| Speed | SP | Determines move order; doubles attack if SP ≥ foe SP + 4. |
| Luck | Lck | Improves hit rate and reduces enemy crit chance. **[TBD formula]** |
| Defense | Def | Reduces physical damage taken. |
| Mojo Defense | MDef | Reduces magic (Mojo) damage taken. |
| Movement | Move | Tiles a unit can travel per turn. Does **not** grow on level-up. |

### Attack type selection
A unit automatically uses whichever attack is stronger:
- If `Moj > Pow`: **magic attack** — damage = `max(1, Moj − defender.MDef)`. Ignores terrain defense.
- Otherwise: **physical attack** — damage = `max(1, Pow − (defender.Def + TILE_DEF))`.

### Speed doubling
If attacker `SP ≥ defender SP + 4`, the attacker strikes **twice** in one combat exchange.
Counter-attacks are not doubled regardless.

---

## 5. Growth Rates & Leveling

- Every unit (initially just the player Lord) has a **growth rate** for each stat (except Move).
- Growth rates are expressed as a **percentage (0–100)**.
- On level-up, each stat rolls independently: if `random(0–99) < growth_rate`, the stat increases by 1.
  - HP increase also raises `maxHp` by 1.
- **No class promotions. No level cap.** The lord grows indefinitely.
- **[TBD]** What triggers a level-up (XP from combat? clearing a map?).
- **[TBD]** Whether enemies also level up as the run progresses.

### Lord base stats & growth rates

| | LORD I | LORD II | LORD III |
|---|---|---|---|
| **Theme** | Balanced | Powerhouse | Mojo Specialist |
| HP | 20 (75%) | 24 (85%) | 16 (60%) |
| Pow | 8 (50%) | 11 (65%) | 3 (15%) |
| Moj | 2 (15%) | 1 (5%) | 10 (65%) |
| SP | 7 (55%) | 5 (35%) | 8 (60%) |
| Lck | 5 (40%) | 3 (25%) | 6 (50%) |
| Def | 5 (40%) | 7 (55%) | 3 (25%) |
| MDef | 4 (30%) | 2 (15%) | 8 (60%) |
| Move | 5 | 5 | 5 |

---

## 6. Lord Select

- Shown when starting a new game (or continuing before a lord was chosen).
- Displays 3 lord cards side by side.
- A/D or Left/Right arrow keys navigate between cards.
- X or Enter confirms selection; camera fades to Game Map.
- Z or Esc returns to File Select (not Main Menu).
- **Player starts the first map with the Lord only — no starting allies.**

---

## 7. Class System

Each of the three lords belongs to a **unique class**. Classes are permanent — there are no promotions or class changes. The class defines weapon proficiency, special abilities, and movement rules. All three lord classes are one-of-a-kind variants inspired by FE archetypes.

### Class overview

| Class | Weapons | Movement | Mount | Key Trait |
|---|---|---|---|---|
| **Pickpocket** | Sword | No terrain penalty | — | Lockpick, Steal |
| **Astronomer** | All magic + Staves | Standard | — | All magic schools from the start |
| **Stud Master** | Sword, Lance | Cavalry (rough terrain +1) | Horse | High Move (7), well-rounded physical |
| **Fletcher** | Sword, Bow | Cavalry (rough terrain +1) | Horse | Ranged bow + mounted |
| **Ruffian** | Axe, Sword | Standard + water passable | — | Sea Legs — can move through water |
| **Necromancer** | Wicked Magic, Staff | Standard | — | Raise Dead [TBD] |
| **Clergy** | Heaven Magic, Staff | Standard | — | Healing and support focus |
| **Grunt** | Lance | Standard | — | Simple reliable infantry |
| **Bulwark** | Lance, Axe | Standard | — | Physical tank — very high Def/HP, low Move |
| **Musician** | None | Standard | — | Encore — spend turn to refresh an adjacent ally |
| **Prisoner** | Sword + all magic | Standard | — | Exceptional offense, extremely fragile |
| **Enlightened** | None | Standard | — | Dodge/def tank — absorbs hits, deals no damage |
| **Alicorn Rider** | Sword, Lance | Flying (all terrain, not walls) | Alicorn | Ignores terrain and water completely |

---

### Pickpocket *(LORD I)*
*Inspired by the Thief / Assassin / Rogue archetype in Fire Emblem.*

**Weapon:** Sword

**Special abilities:**

| Ability | Description |
|---|---|
| **Pathfinder** | Ignores all terrain movement costs — every passable tile costs exactly 1 movement. Mountain, Forest, Water (if passable), etc. are all treated equally. |
| **Lockpick** | Can open locked doors and treasure chests without a key item. **[TBD]** Locked doors and chests need to be added to map generation. |
| **Steal** | When adjacent to an enemy, can use the Steal action instead of attacking. Takes one item from the enemy's inventory (if they carry one). **[TBD]** Requires an item system. |

**Design notes:**
- The movement advantage makes Pickpocket excellent at rushing objectives (Throne, chests) and repositioning.
- Steal and Lockpick synergize with a future item/treasure system.
- Sword-only means lower combat power vs armored enemies (high Def) — a deliberate trade-off for mobility.

---

### Astronomer *(LORD II)*
*Inspired by the Mage archetype, but with unrestricted access to all magic disciplines from the very start — no specialization required.*

**Weapons:** All three magic schools + Staves

| Magic School | FE Equivalent | Thematic Identity |
|---|---|---|
| **Wicked Magic** | Dark Magic | Cursed, corrupting spells. **[TBD]** Higher raw damage, lower hit rate; possible debuff or HP-drain effects. |
| **Heaven Magic** | Light Magic | Divine, radiant spells. **[TBD]** High accuracy and crit chance; possibly effective against certain enemy types (undead, bosses). |
| **Elemental Magic** | Anima Magic | Fire, Wind, and Lightning. **[TBD]** Three distinct elements, each with different power/weight trade-offs. Balanced baseline. |
| **Staves** | Staves | Healing and support. **[TBD]** Requires ally units to be present — most relevant once the party system is designed. |

**Special abilities:**

| Ability | Description |
|---|---|
| **Polymath** | Can equip and freely switch between all three magic schools and staves. No other class has this breadth from the start. |
| **[TBD]** | Additional class-unique ability to be determined. |

**Design notes:**
- The Astronomer's power is **flexibility** — they can always pick the right magic for the situation once element weaknesses/resistances are designed.
- Having staves means they can self-sustain or support allies, which no other lord class can do.
- Their weakness is that they are fragile physically (low Pow and Def by nature of the class).

---

### Stud Master *(LORD III)*
*Inspired by the Cavalier / Paladin archetype — a dependable mounted warrior with exceptional reach.*

**Weapons:** Physical only (Sword and Lance — **[TBD]** lance range/mechanics)

**Special abilities:**

| Ability | Description |
|---|---|
| **Mounted** | Rides a horse. Gains +2 base Move over standard infantry (Move 7 vs 5). |
| **Terrain Burden** | The flip side of the mount — rough terrain costs more movement than it would for infantry. See terrain table below. |
| **[TBD]** | Additional class-unique ability to be determined (e.g. Canto — move again after an action). |

**Terrain movement costs (Stud Master vs standard infantry):**

| Terrain | Standard | Stud Master |
|---|---|---|
| Plain | 1 | 1 |
| Forest | 2 | 3 *(+1)* |
| Mountain | 3 | 4 *(+1)* |
| Fort | 1 | 2 *(+1)* |
| Village | 1 | 1 |
| Throne | 1 | 1 |
| Road | 1 | 1 |
| Water | ✗ | ✗ |
| Wall | ✗ | ✗ |

**Design notes:**
- High Move (7) means the Stud Master covers ground fast on open terrain and roads — great for chasing down enemies or rushing the Throne.
- Terrain costs punish going through forests and mountains, which creates a meaningful path-planning decision.
- Well-rounded physical stats (high Pow and Def) mean they can fight head-on unlike the Pickpocket or Astronomer.
- Zero Mojo — cannot attack magic-resistant enemies with Mojo; relies entirely on Pow vs Def.

---

---

### Fletcher
*Inspired by the Nomad / Ranger archetype — a mobile mounted archer equally comfortable with a blade or a bow.*

**Weapons:** Sword, Bow
**Mount:** Horse (cavalry terrain costs apply, same as Stud Master)
**Movement:** 6 (mounted, but slightly less than Stud Master due to bow equipment weight — **[TBD]**)

| Ability | Description |
|---|---|
| **Mounted** | Horse mount — cavalry terrain cost table applies. |
| **Bow Range** | Bows attack at range 2 (cannot attack adjacent enemies). Swords cover melee. **[TBD]** Ranged attack system. |

**Design notes:** The Fletcher bridges the gap between the Stud Master's physical power and ranged harassment. Switching between sword and bow to cover both ranges is the defining tactical decision.

---

### Ruffian
*Inspired by the Pirate / Berserker / Fighter archetype — a brutal brawler who is equally at home on sea and land.*

**Weapons:** Axe, Sword
**Movement:** Standard infantry + **water is passable** (cost 2)

| Ability | Description |
|---|---|
| **Sea Legs** | Can enter water tiles at movement cost 2 (all other units treat water as impassable). Opens up diagonal routes and coastal flanking. |
| **[TBD]** | High crit chance or bonus damage on axes — berserker-style fury ability. |

**Design notes:** The water traversal makes the Ruffian uniquely flexible on maps with rivers, coasts, or flooded tiles. High offensive stats but likely low Def — hits hard, takes hard hits.

---

### Necromancer
*Inspired by the Necromancer / Druid archetype — a dark magic specialist who commands the boundary between life and death.*

**Weapons:** Wicked Magic, Staff
**Movement:** Standard foot unit

| Ability | Description |
|---|---|
| **Raise Dead** | **[TBD]** Spend a staff use to raise a fallen enemy (or ally) as an undead unit that fights for the Necromancer. Requires a corpse system. |
| **Wicked Mastery** | Access to the full Wicked Magic school (dark spells) — the deepest single-school specialization of any class. **[TBD]** May have bonus damage or debuff effects specific to Wicked Magic. |

**Design notes:** The Necromancer trades breadth (Astronomer has all schools) for depth and the unique Raise Dead ability. A high-skill, high-reward class. Staff access also gives healing utility.

---

### Clergy
*Inspired by the Bishop / Monk / Troubadour archetype — a devoted healer who channels light magic.*

**Weapons:** Heaven Magic, Staff
**Movement:** Standard foot unit

| Ability | Description |
|---|---|
| **Divine Ward** | **[TBD]** Passive: nearby allies take slightly reduced magic damage (aura effect). |
| **Mend** | Staves restore HP to adjacent allies. **[TBD]** Staff charges / uses system. |

**Design notes:** The Clergy is the primary healing class of the game. Heaven Magic gives them an offensive option but their role is fundamentally supportive. Fragile physically — needs protection. Most effective once the party system has multiple units.

---

### Grunt
*Inspired by the Soldier / Halberdier archetype — a dependable spear-wielding foot soldier with no frills.*

**Weapons:** Lance only
**Movement:** Standard foot unit

| Ability | Description |
|---|---|
| **Steadfast** | **[TBD]** Cannot be pushed or repositioned by enemy abilities. Passive survivability trait. |

**Design notes:** The Grunt is the simplest class — one weapon, no special tricks, solid stats. Lance-only means they're straightforward to play against and easy to build around. Good for filling out enemy squads or as early-run recruitable allies.

---

### Bulwark
*Inspired by the General / Great Knight archetype — a walking fortress built purely for absorbing punishment.*

**Weapons:** Lance, Axe
**Movement:** Standard terrain costs, but base Move is **4** (slow — heavy armor)

| Ability | Description |
|---|---|
| **Fortress** | **[TBD]** Passive: physical damage taken is reduced by a flat amount (bonus Def on top of stat). |
| **Immovable** | **[TBD]** Cannot be killed in one hit — always survives with at least 1 HP once per map. |

**Design notes:** The Bulwark is the anchor of any formation. Extremely high Def and HP, very low Speed (almost never doubles or gets doubled meaningfully). Their weakness is magic — high MDef is not their strength, so Mojo users are their natural counter.

---

### Musician
*Inspired by the Dancer / Bard archetype — support through performance rather than combat.*

**Weapons:** None — the Musician does not attack
**Movement:** Standard foot unit

| Ability | Description |
|---|---|
| **Encore** | Instead of moving and acting normally, the Musician can target an adjacent ally who has already moved this turn and **reset that unit's moved status**, allowing them to act again. This is their entire purpose. |

**Design notes:** The Musician has no offensive ability whatsoever — they exist entirely to give another unit a second turn. This is one of the most powerful mechanics in FE (Dancer), so careful balancing is needed. The Musician themselves should have low combat stats and be a priority target for enemies. **[TBD]** Whether the Musician can move before using Encore, or if Encore replaces movement.

> ⚠️ **Implementation note:** Encore requires extending the action system in `GameMapScene` — a unit needs to gain a new action type ("Encore") and the target's `moved` flag needs to be cleared. This is deferred until the action menu system is built.

---

### Prisoner
*A wholly original class — someone with nothing to lose and everything to prove. Master of both blade and spell, destroyed by a single strong hit.*

**Weapons:** Sword + all three magic schools (Wicked, Heaven, Elemental)
**Movement:** Standard foot unit — **not mounted**

| Ability | Description |
|---|---|
| **Desperation** | **[TBD]** When below 50% HP, gains a significant bonus to damage or speed — the lower the HP, the stronger the output. |
| **Unshackled** | Access to every offensive weapon type except bows, lances, and axes. The broadest offensive toolkit of any class. |

**Design notes:** The Prisoner is the glass cannon. Best offensive versatility in the game but the lowest defensive stats. One well-placed hit can kill them. Intended for players who want high risk, high reward gameplay. Pairs beautifully with a Musician for that second-turn safety net.

---

### Enlightened
*A philosophical warrior who has transcended the need to harm — a living shield.*

**Weapons:** None — the Enlightened deals **zero damage**
**Movement:** Standard foot unit

| Ability | Description |
|---|---|
| **Transcend** | **[TBD]** Passive high dodge rate — a percentage of incoming attacks simply miss. Requires a hit/miss system. |
| **Bulwark Aura** | **[TBD]** Adjacent allies take reduced damage from all sources. |
| **Immutable** | Very high Def AND MDef — the only class that tanks both physical and magical damage equally well. |

**Design notes:** The Enlightened literally cannot kill anything — their purpose is to stand between enemies and allies, absorbing hits indefinitely. Balanced by the fact that without offensive pressure, they don't end battles faster. Requires a hit/dodge system to fully function. The dodge mechanic is their defining feature and should be implemented alongside Luck/Hit rate.

> ⚠️ **Implementation note:** Dealing zero damage needs special handling in `Unit.calcDamage()` — simplest approach is checking `if (this.enlightened) return { dmg: 0, ... }`. Deferred until the full ability system is built.

---

### Alicorn Rider
*Inspired by the Pegasus Knight / Falcoknight archetype — a graceful flying lancer who laughs at terrain.*

**Weapons:** Sword, Lance
**Mount:** Alicorn (winged horse/unicorn) — **flying unit**
**Movement:** **All terrain costs 1** including water and mountains. Walls remain impassable (can't land inside a wall).

| Ability | Description |
|---|---|
| **Flight** | Ignores all terrain movement costs (water, forest, mountain all cost 1). The Alicorn Rider moves as if the map is entirely plains. |
| **Bow Weakness** | **[TBD]** Takes bonus damage from bow attacks — the classic pegasus weakness. Requires a weapon-effectiveness system. |
| **[TBD]** | Triangle Attack or similar multi-unit synergy ability if multiple Alicorn Riders are present. |

**Design notes:** The Alicorn Rider is the fastest-repositioning unit in the game — able to cross rivers, mountains, and forests in one move that would take others several turns. Their weakness is that bows counter them hard, and lance-only melee means they struggle against high-Def targets. Sword gives them a backup option.

---

### Revised lord stats (aligned to classes)

> Previous LORD II and III stats were placeholder. Now corrected to match their class identities.

| | LORD I · Pickpocket | LORD II · Astronomer | LORD III · Stud Master |
|---|---|---|---|
| **Role** | Balanced blade | Magic generalist | Mounted bruiser |
| HP | 20 (75%) | 17 (60%) | 22 (80%) |
| Pow | 8 (50%) | 3 (15%) | 10 (60%) |
| Moj | 2 (15%) | 11 (70%) | 1 (5%) |
| SP | 7 (55%) | 7 (55%) | 6 (45%) |
| Lck | 5 (40%) | 6 (50%) | 4 (35%) |
| Def | 5 (40%) | 3 (20%) | 8 (55%) |
| MDef | 4 (30%) | 8 (65%) | 3 (20%) |
| Move | 5 | 5 | **7** |
| Terrain | No penalty | Standard | Cavalry penalty |

---

## 8. Game Map & Combat  <!-- updated from §7 -->

### Map
- Grid: 15 × 12 tiles, tile size 14 px.
- Tile types: Plain, Forest, Mountain, Wall, Fort, Village, Throne, Water, Road.
- One Throne tile per map (boss spawn).
- Generated procedurally from a stored seed so the same level is reproducible.

### Starting units
- **Player:** Lord only (1 unit).
- **Enemies:** 6 random units + 1 General boss on the Throne.

### Enemy base stats

| Type | HP | Pow | Moj | SP | Lck | Def | MDef | Move |
|---|---|---|---|---|---|---|---|---|
| Knight | 14 | 7 | 0 | 4 | 2 | 4 | 2 | 3 |
| Archer | 12 | 8 | 0 | 6 | 3 | 2 | 1 | 4 |
| Mage | 10 | 2 | 10 | 5 | 4 | 1 | 5 | 3 |
| General | 30 | 12 | 3 | 4 | 5 | 7 | 4 | 3 |

### Combat
- Attack type (physical vs magic) auto-selected per unit as described in Section 4.
- Defender counter-attacks if alive and in melee range (distance = 1).
- Speed doubling applies (attacker hits twice if SP ≥ foe SP + 4).
- Tile defense bonuses (physical only): Plain 0, Forest 1, Mountain 2, Fort 2, Village 1, Throne 3.
- **Win condition:** Defeat all enemies, or defeat the boss (General).
- **Lose condition:** Lord unit is killed.

### Combat animations
**Not implemented — deferred intentionally.**
Combat currently resolves instantly: damage is calculated, HP is updated, and a brief battle log message appears in the HUD. There is no cut-away combat scene.

When the game is more fleshed out, a dedicated `CombatScene.js` will be added that launches as an overlay (similar to `StatusScene`) and plays out the exchange blow-by-blow with unit sprites, hit flashes, damage numbers, and the GBA-style combat forecast panel. This should be designed after the weapon system, animations/sprites, and sound are in place.

> **Do not add combat animations until explicitly requested.**

### Turn Flow
1. Player Phase — move and act all player units (auto-ends when all have moved).
2. Enemy Phase — enemies act sequentially with a short delay between each.
3. Repeat until win/loss condition is met.

### Enemy AI (current)
- Greedy: move one step toward the nearest player unit each turn.
- Attack immediately if adjacent after move.
- **[TBD]** Smarter priority targeting (focus weakest, protect boss, ranged units keep distance).

---

## 9. Unit Status Screen

- Press **E** while the cursor is on any unit (player or enemy) to open the Status Screen.
- Works during both Player Phase and Enemy Phase. Not available on the end screen (Victory/Game Over).
- The Status Screen overlays the game map — the map is paused and stays visible behind.
- Press **E**, **X**, **Z**, or **Esc** to close and resume the game.

### Layout
```
┌──────────────────────────────────────┐
│ ┌──────────┐  NAME          Lv. ##  │
│ │          │  ─────────────────────  │
│ │ PORTRAIT │  HP   ##/##            │
│ │          │  Pow  ##   Moj  ##     │
│ │  symbol  │  SP   ##   Lck  ##     │
│ │          │  Def  ##   MDef ##     │
│ │ [faction]│  Move ##               │
│ └──────────┘                        │
│           [ E / X / Z : close ]     │
└──────────────────────────────────────┘
```
- **Portrait:** drawn using unit color + their symbol glyph. No sprite sheets required.
- **Faction indicator:** blue strip (Player) or red strip (Enemy) at top of portrait.
- Stats shown: HP (current/max), Pow, Moj, SP, Lck, Def, MDef, Move, Level.
- Enemy stats are fully visible — this is intentional for strategic planning.

---

## 10. Roguelite Progression

**[TBD]** — Core loop not yet designed. Questions to resolve:

- How many maps make a full run?
- What is the inter-map screen? (shop, rest, upgrade node?)
- What meta-upgrades carry over between runs?
- Is there a currency (gold, shards)?
- Do units level up within a run, or between runs, or both?
- Are there items or weapon types?
- What unlocks (new lords, enemy variants, map modifiers)?

---

## 11. Controls Reference

| Input | Action |
|---|---|
| W / Up Arrow | Move cursor up |
| S / Down Arrow | Move cursor down |
| A / Left Arrow | Move cursor left |
| D / Right Arrow | Move cursor right |
| X | Confirm (A button) |
| Enter | Confirm (alternate) |
| Z | Cancel (B button) |
| Esc | Cancel (alternate) |
