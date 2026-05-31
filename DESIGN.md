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

### Experience Points

Player lords earn XP by killing enemies. No XP is awarded for combat that does not result in a kill.

| Kill type | XP awarded |
|---|---|
| Regular enemy | `max(5, round(40 × 0.9^(level − 1)))` |
| Boss | 100 (always fills the bar) |

The formula produces a natural exponential decay:

| Lord level | XP per regular kill |
|---|---|
| 1 | 40 |
| 5 | ~26 |
| 10 | ~15 |
| 20 | ~6 |

This keeps early-game leveling fast and later levels increasingly difficult without a separate XP-threshold system.

### XP bar

After a kill, a **gold XP bar** appears in a thin strip just above the HUD. It animates from the previous XP value to the new value over ~1.1 seconds. If the bar reaches 100 %, the level-up screen is triggered immediately after the animation completes.

### Level-up screen

When a lord levels up, the game pauses and launches the **LevelUpScene** overlay:

- The unit's **portrait** is shown on the left (same layout as the Status Screen).
- The right panel shows all stats at their **new values**.
- Stats that increased have their label brightened and a blinking **+1** indicator in gold.
- The **+1** indicators blink rapidly for ~1.2 seconds, then hold steady.
- After 0.8 seconds the player can press any button to close the screen and resume.

### Growth rate mechanics

- Each stat rolls independently on level-up: `random(0–99) < growth_rate` → stat + 1.
- HP gain increases both `hp` (current) and `maxHp` by 1.
- **Move never grows.**
- No class promotions. No level cap.

### Lord base stats & growth rates

| | LORD I · Pickpocket | LORD II · Astronomer | LORD III · Stud Master |
|---|---|---|---|
| **Theme** | Swift blade | Magic specialist | Physical tank |
| HP | 20 **(80%)** | 17 **(65%)** | 22 **(90%)** |
| Pow | 8 **(70%)** | 3 **(10%)** | 10 **(75%)** |
| Moj | 2 **(10%)** | 11 **(90%)** | 1 **(5%)** |
| SP | 7 **(75%)** | 7 **(65%)** | 6 **(50%)** |
| Lck | 5 **(55%)** | 6 **(60%)** | 4 **(40%)** |
| Def | 5 **(55%)** | 3 **(15%)** | 8 **(75%)** |
| MDef | 4 **(35%)** | 8 **(85%)** | 3 **(20%)** |
| Move | 5 | 5 | **7** |

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
| **Steal** | When adjacent to an enemy who carries at least one item, the **STEAL** option appears in the action menu. The player picks which item to take; the item is removed from the enemy and added to the Pickpocket's inventory. Ends the turn. |

**Design notes:**
- The movement advantage makes Pickpocket excellent at rushing objectives (Throne, chests) and repositioning.
- Steal and Lockpick synergize with a future item/treasure system.
- Sword-only means lower combat power vs armored enemies (high Def) — a deliberate trade-off for mobility.

---

### Astronomer *(LORD II)*
*Inspired by the Mage archetype, but with unrestricted access to all magic disciplines from the very start — no specialization required.*

**Weapons:** All three magic schools + Staves

**Passive ability — Exalt:** On every attack, there is a **1/12 chance** the Astronomer's strike ignores the target's MDef entirely. Damage is calculated as if MDef = 0. The battle log displays `[EXALT]` when it triggers. Applies on the initial hit only (not counters).

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
| **Gallop** | After performing any action (attack, execute, use item), the Stud Master may still move using any movement points that were not spent during the initial move that turn. The remaining blue move range is shown; the player moves normally or presses Z to skip. Does **not** trigger after WAIT. |

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

### Turn flow

1. **Select** a player unit (X on the unit tile). Move range (blue) and potential attack range (red) are shown.
2. **Move** the cursor to any tile in the move range and confirm (X). The unit moves there. To stay in place, confirm on the unit's own tile.
3. **Action menu** appears near the unit with the available options:
   - **ATTACK** — only shown if at least one enemy is within attack range.
   - **ITEMS** — only shown if the unit has at least one item in their inventory.
   - **WAIT** — end the unit's turn without acting.
   Navigate with W/S or Up/Down; confirm with X; cancel with Z (undoes the move).
4. **Targeting** — if ATTACK is chosen, the cursor auto-snaps to the nearest attackable enemy. Move the cursor across other enemies to cycle targets. The **combat forecast panel** appears above the HUD showing both sides' stats.
5. Confirm (X) on an enemy to execute combat. The unit is marked as done.
6. **Auto-end turn** — as soon as every player unit has committed an action (attacked, used an item, or waited), the player phase ends automatically and the enemy phase begins.

---

### Item menu (ITEMS option)

Opening ITEMS from the action menu shows the unit's full inventory as a popup list. Each row shows: `[>][*] Item name  uses/max`.  `*` marks the currently equipped weapon.

Navigate with W/S or Up/Down. Press **X** to open the action sub-menu for the highlighted item. Press **E** to view the item's full description (launches the StatusScene item-detail view). Press **Z** to return to the action menu (without ending the turn).

#### Item action sub-menu

| Item type | Available actions |
|---|---|
| Weapon / Tome | **EQUIP**, **DROP** |
| Staff | **EQUIP**, **DROP** |
| Consumable | **USE**, **DROP** |

- **EQUIP** — changes the unit's equipped weapon to this item. Does **not** end the turn. Returns to the action menu so the player can still ATTACK or WAIT.
- **USE** — applies the item effect to the unit (e.g. heal HP). Ends the turn.
- **DROP** — permanently removes the item from the unit's inventory. Does **not** end the turn.

Press **Z** from the sub-menu to cancel back to the inventory list.

#### Weapon selection (pre-attack)

When ATTACK is selected and the unit carries more than one combat-usable weapon (non-staff, non-consumable), a **weapon selection popup** appears first. Select a weapon with X to equip it for this combat and enter targeting. Press Z to go back to the action menu.  
If the unit has only one weapon, the weapon selection step is skipped and targeting opens immediately.

---

### Starting items

All lords begin each run with:
- Their lord-specific weapons (see Section 10)
- **1× Healing Potion** (3 uses, restores 10 HP to the user)

#### Healing Potion

| Stat | Value |
|---|---|
| Type | Consumable |
| Uses | 3/3 |
| Effect | Restores 10 HP to the user |
| Ends turn | Yes |
| Description | Restores 10 HP to the user. |

### Combat forecast panel

Shown at the bottom of the map area while targeting an enemy:

```
ATTACKER          ║ DEFENDER
HP:##/## Atk:##   ║ HP:##/## Atk:--
Hit:##%  x#       ║ No counter
```

| Field | Meaning |
|---|---|
| Atk | Damage per hit (after weapon Might, defender Def, and any status debuffs) |
| Hit% | Estimated hit rate: `weapon.hit + attacker.Lck − defender.SP × 2` (clamped 0–100) |
| x1 / x2 | Number of hits attacker makes (x2 if attacker SP ≥ defender SP + 4) |
| No counter | Defender cannot counter-attack (not adjacent after attacker moves) |

> Hit% is shown as a preview; all attacks currently always connect (miss system is TBD).

### Combat resolution
- Attack type (physical vs magic) determined by equipped weapon (`isMagic` flag); falls back to `Moj > Pow` for weaponless units.
- Defender counter-attacks if alive and adjacent (distance = 1). Counters never double.
- Speed doubling: attacker hits twice if `SP ≥ foe SP + 4`.
- Tile defense bonuses (physical only): Plain 0, Forest 1, Mountain 2, Fort 2, Village 1, Throne 3.
- **Win condition:** Defeat the boss (General) on the Throne tile. Remaining regular enemies do not need to be cleared.
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
- The screen has two sub-views: **Stats** (default) and **Item Detail**.

### Stats view

```
┌──────────────────────────────────────┐
│ ┌──────────┐  NAME          Lv. ##  │
│ │          │  ─────────────────────  │
│ │ PORTRAIT │  HP   ##/##            │
│ │          │  Pow  ##   Moj  ##     │
│ │  symbol  │  SP   ##   Lck  ##     │
│ │          │  Def  ##   MDef ##     │
│ │ [faction]│  Move ##               │
│ └──────────┘  ─────────────────────  │
│               ITEMS                 │
│               > Item name  XX/XX    │
│                 Item name  XX/XX    │
│                 Item name  XX/XX    │
│        E:info  W/S:item  Z:close    │
└──────────────────────────────────────┘
```

- **Portrait:** drawn using unit color + symbol glyph. Lords use real portrait images.
- **Faction indicator:** blue stripe (Player) or red stripe (Enemy) at top of portrait.
- Stats shown: HP (current/max), Pow, Moj, SP, Lck, Def, MDef, Move, Level.
- The dominant offensive stat (Pow or Moj based on equipped weapon) is highlighted.
- Enemy stats are fully visible — intentional for strategic planning.

#### Item list (bottom of stats view)

- All weapons in the unit's inventory are listed with current and max uses (`XX/XX`).
- Up to **3 rows** are visible; scroll with **W/S** or **Up/Down** if the unit has more.
- The selected row is highlighted with `>` and shown in the cursor colour.
- If the unit carries no items the list shows `None`.

#### Stats view controls

| Input | Action |
|---|---|
| W / Up | Scroll item cursor up |
| S / Down | Scroll item cursor down |
| E | Open Item Detail for the selected item (if any items exist; otherwise close) |
| X / Z / Esc | Close the Status Screen |

---

### Item Detail view

Pressing **E** on a highlighted item replaces the panel with the item's full data sheet. The portrait is hidden; the item fills the whole panel.

```
┌──────────────────────────────────────┐
│ ITEM NAME                           │
│ Type  [Tier]                        │
│ ─────────────────────────────────── │
│ Mgt:X  Hit:X  Crt:X  Uses:XX/XX    │
│ Range: X-X  [Magic]                 │
│ ─────────────────────────────────── │
│ Eff: [on-hit effect description]    │
│ ─────────────────────────────────── │
│ [short flavor description]          │
│                                     │
│              E / Z : back           │
└──────────────────────────────────────┘
```

- **Mgt** — Might (added to Pow/Moj before damage calculation).
- **Hit** — Hit rate (tracked; miss system not yet active).
- **Crt** — Crit chance (tracked; crit system not yet active).
- **Uses/MaxUses** — remaining uses out of original total.
- **Range** — attack range min-max. `Magic` tag shown for tomes and dark magic.
- **Eff** — on-hit effect, if any (Burn chance, Poison chance, damage multiplier, Execute).
- **Flavor** — short placeholder description.

#### Item Detail controls

| Input | Action |
|---|---|
| E / X / Z / Esc / Enter | Return to the Stats view |

---

## 10. Weapon System

### Overview

Every combat-capable unit equips a **weapon** that adds its **Might** to the attacker's offensive stat (Pow for physical, Moj for magic) before the damage formula runs. Units without weapons still attack using base stats only.

Damage formula (unchanged structure):
- **Physical:** `max(1, (Pow + Might) − (Def + TILE_DEF))`
- **Magic:** `max(1, (Moj + Might) − MDef)` *(ignores terrain)*

The equipped weapon's type (`isMagic: true` on tomes/dark magic) now determines whether a unit attacks physically or magically, overriding the old `Moj > Pow` auto-select. Weaponless enemies still use stat comparison as before.

Each weapon has a **uses** counter. One use is consumed per combat engagement (attacker and counter-attacker each consume one use). When a weapon reaches 0 uses it is removed from the unit's inventory; the next non-staff weapon auto-equips.

---

### Basic Weapon Tiers

Three tiers apply to all physical weapons and bows. Higher tiers hit harder but have fewer uses.

#### Swords *(physical, range 1)*

| Name | Tier | Might | Hit | Uses |
|---|---|---|---|---|
| Wood Sword | Wood | 2 | 90 | 40 |
| Bronze Sword | Bronze | 4 | 90 | 25 |
| Iron Sword | Iron | 6 | 85 | 20 |

#### Lances *(physical, range 1)*

| Name | Tier | Might | Hit | Uses |
|---|---|---|---|---|
| Wood Lance | Wood | 3 | 80 | 35 |
| Bronze Lance | Bronze | 5 | 80 | 25 |
| Iron Lance | Iron | 7 | 75 | 20 |

#### Axes *(physical, range 1)*

| Name | Tier | Might | Hit | Uses |
|---|---|---|---|---|
| Wood Axe | Wood | 4 | 70 | 35 |
| Bronze Axe | Bronze | 6 | 70 | 25 |
| Iron Axe | Iron | 8 | 65 | 20 |

#### Bows *(physical, range 2 — **[TBD]** range system)*

| Name | Tier | Might | Hit | Uses |
|---|---|---|---|---|
| Wood Bow | Wood | 2 | 85 | 35 |
| Bronze Bow | Bronze | 4 | 85 | 25 |
| Iron Bow | Iron | 6 | 80 | 20 |

> **Note:** Bow range (2, cannot attack adjacent) requires a ranged attack system that is not yet implemented. Bows are defined in data but behave as melee until that system is added.

---

### Lord Starting Weapons

Lords start each run with unique weapons. These weapons are stronger than common gear but have limited uses.

#### LORD I · Pickpocket — *Serpent's Bone*

| Stat | Value |
|---|---|
| Type | Sword (Iron tier equivalent) |
| Might | 6 |
| Hit | 85 |
| Crit | 5 |
| Uses | 15 |
| **Special** | **Execute** — once per floor, can instantly KO any non-boss enemy. Appears as a separate **EXECUTE** option in the action menu alongside ATTACK, ITEMS, and WAIT. After use the option disappears for the rest of the floor; resets on the next floor. Cannot target the boss. |

The execute charge is stored on the weapon instance (`effect.charges`). It resets to 1 at the start of every new floor.

---

#### LORD II · Astronomer — Starting Arsenal

The Astronomer begins with **four** weapons. Only the first non-staff weapon (Flame) auto-equips for combat; the others require a weapon-selection UI to use. **[TBD — weapon switch UI]**

##### Heal *(Staff)*

| Stat | Value |
|---|---|
| Type | Staff |
| Heals | 10 HP |
| Uses | 5 |
| **Special** | Restores HP to an adjacent ally. Cannot be used offensively. **[TBD — requires ally units and staff-action UI]** |

##### Flame *(Elemental Tome — default equipped)*

| Stat | Value |
|---|---|
| Type | Tome (Bronze tier) |
| Might | 5 |
| Hit | 85 |
| Crit | 5 |
| Uses | 20 |
| **On-hit** | **40% chance to inflict Burn** — halves the target's physical damage output (Pow × ½) until end of map |

##### Smite *(Heaven Tome)*

| Stat | Value |
|---|---|
| Type | Tome (Bronze tier) |
| Might | 25 |
| Hit | 70 |
| Crit | 0 |
| Uses | 3 |
| **Special** | Devastatingly high Might — designed to one-shot any enemy (including the boss) during the first three maps at base Moj 11. The 3-use limit makes it a decisive weapon to save for the right moment. |

##### Drought *(Wicked/Dark Magic)*

| Stat | Value |
|---|---|
| Type | Dark (Wood tier damage) |
| Might | 2 |
| Hit | 85 |
| Crit | 0 |
| Uses | 25 |
| **On-hit** | **100% chance to inflict Poison** — deals 2 HP per turn DoT, and halves the target's Moj (magic offense) and Def (physical defense) for the rest of the map |

---

#### LORD III · Stud Master — Starting Weapons

##### Swift Blade *(Bronze Sword — default equipped)*

| Stat | Value |
|---|---|
| Type | Sword (Bronze tier) |
| Might | 4 |
| Hit | 90 |
| Crit | 0 |
| Uses | 20 |
| **Special** | **2× damage against axe-wielding enemies** |

##### Piercer *(Bronze Lance)*

| Stat | Value |
|---|---|
| Type | Lance (Bronze tier) |
| Might | 5 |
| Hit | 80 |
| Crit | 0 |
| Uses | 20 |
| **Special** | **3× damage against Bulwark-class enemies** — makes the Stud Master a direct counter to the boss General (a Bulwark) |

---

### Status Effects

Status effects are applied by certain weapons on hit and persist for the remainder of the map. **[TBD]** A cure system (staff spells, item use) is not yet implemented.

| Status | Source | Effect on afflicted unit |
|---|---|---|
| **Burn** | Flame (40% chance on hit) | Physical power halved (Pow × ½) when calculating damage dealt |
| **Poison** | Drought (100% chance on hit) | Magic power halved (Moj × ½) when attacking; physical defense halved (Def × ½) when defending; **+2 HP damage per turn** at the start of each phase |

Poison DoT is applied to all living units of a faction at the moment their phase begins. Poison can reduce a unit to 0 HP (it can kill). Burn cannot kill on its own.

---

### [TBD] Future Weapon Mechanics

- **Weapon selection UI** — inventory screen or in-map menu to switch between equipped weapons (required before Smite, Drought, and Heal can be used by the Astronomer; also needed for Stud Master to switch between Swift Blade and Piercer)
- **Execute UI** — action-menu trigger for Serpent's Bone's one-time execute charge
- **Bow range** — bows attack at exactly range 2 and cannot retaliate at range 1; requires ranged attack system
- **Hit rate / miss system** — the `hit` stat on every weapon is tracked but not yet checked; all attacks currently always connect
- **Crit system** — `crit` stat tracked but not used; crits should deal 3× damage (classic FE)
- **Weapon weight / Constitution** — heavier weapons reduce effective speed; relevant once weapon variety grows
- **Weapon triangle** — Swords beat Axes, Axes beat Lances, Lances beat Swords (give/take +1 Def and +15 Hit on favored side)
- **Status cure** — staff spells or items that remove Burn/Poison

---

## 11. Roguelite Progression

### Run structure

A full run is **5 floors**. Each floor is a new procedurally generated map (different random seed). Clearing the boss on the Throne tile advances to the next floor. Dying on any floor ends the run.

### Floor transition

When the boss is defeated:

1. The screen shows **"FLOOR CLEAR"** and the next floor number.
2. The lord's full state (stats, level, XP, weapons, current HP) is saved.
3. A new random map seed is generated for the next floor.
4. The player presses X to open the **Floor Reward screen**.
5. After choosing a reward, the player advances directly to the next floor.

On loading a new floor, the lord receives a **50 % HP restoration** (current HP + ½ of max HP, capped at max HP). All other state (level, XP, inventory) carries over unchanged.

### Floor Reward screen

After every non-final floor clear the player is offered **3 randomly drawn rewards** from the pool below. They pick exactly one before the next floor begins.

| Reward | Effect |
|---|---|
| **Repair Items** | All weapons/items gain back half their max uses (`uses += floor(maxUses / 2)`, capped at max). |
| **Full Heal** | Lord's HP is restored to maximum before the 50 % floor-entry restore is applied (guaranteed full HP entering next floor). |
| **Level Up** | Lord immediately gains one level; stat bonuses roll against growth rates and the Level Up portrait screen is shown. |
| **Duplicate Item** | Player browses their inventory and selects one item; a fresh full-uses copy is added. Excluded from the pool if the lord has no items. |

- The reward pool is shuffled each time; the same reward can appear on consecutive floors.
- "Level Up" does not consume or alter the lord's current XP — the bonus level is on top of normal progression.
- The Level Up portrait screen (same as in-battle) is shown when that reward is chosen; the player must dismiss it before proceeding.

### Run completion

Clearing floor 5 shows **"CONQUERED! All 5 floors cleared!"**. The save slot is then cleared (the slot returns to EMPTY), ready for a fresh run.

### Enemy scaling

All enemies on floor N have their base stats boosted proportionally:

| Stat | Per-floor increase |
|---|---|
| HP | +3 per floor |
| Pow / Moj | +1 per floor |
| SP | +0.5 per floor (rounded) |
| Def / MDef | +1 / +0.5 per floor |
| Boss HP | +8 per floor |
| Boss Pow / Def | +2 per floor |

Example — floor 5 (fMod = 4) compared to floor 1:

| Enemy | HP | Pow | Def |
|---|---|---|---|
| Grunt | 14 → **26** | 7 → **11** | 4 → **8** |
| Fletcher | 12 → **24** | 8 → **12** | 2 → **6** |
| Necromancer | 10 → **22** | Moj 10 → **14** | 1 → **5** |
| General (boss) | 30 → **62** | 12 → **20** | 7 → **15** |

### XP scaling across floors

The XP formula includes a floor multiplier so that earnings stay roughly constant even as the lord levels up:

```
xp = max(5, round( 40 × 0.9^(lordLevel−1) × (1 + (floor−1) × 0.15) ))
```

This produces ~40 XP per kill at floor 1 / level 1, and keeps that roughly stable through floor 5 / level 6+. Bosses always award **100 XP**.

### Passive Ability Pool

These abilities are implemented as mechanics and can be assigned to any unit's `abilities` array at runtime (e.g. through floor rewards or future meta-progression). No unit starts with them by default.

| Ability | Effect |
|---|---|
| **Enrage** | While below 50% HP, the unit's offensive stat (Pow or Moj) and effective Speed are **doubled** for damage and speed-doubling calculations. |
| **Cleanse** | When the unit uses a healing staff, all status effects (Burn, Poison, etc.) are removed from the healed target in addition to restoring HP. |
| **Double Hit** | Each time the unit attacks, each speed-based hit (1 or 2) independently rolls a **30% chance** to strike an additional time. Maximum 4 hits if already speed-doubling. |
| **Lifesteal** | The unit heals for **1/8** of the total damage they inflict during their attack action (all hits, before the counter-attack). Shown as `[+XHP]` in the battle log. |
| **Reach** | Increases the maximum range of **bow** attacks by **+2 tiles** (bows normally reach [2,2]; with Reach they reach [2,4]). Also extends the range at which a bow-wielder can counter-attack. |

### [TBD] Future progression features

- Inter-floor rest screen (shop, upgrade choice, healing options)
- Meta-upgrades that persist across runs (unlockable lords, passive bonuses)
- Currency system
- More enemy variety and elite enemies at higher floors
- Branching floor paths

---

## 12. Controls Reference

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
