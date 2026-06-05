// ─── FloorRewardScene.js ─────────────────────────────────────────────────────
// Shown after every non-final floor is cleared. Player picks one of three
// randomly offered upgrades before advancing to the next floor.

class FloorRewardScene extends Phaser.Scene {
  constructor() { super({ key: 'FloorReward' }); }

  init(data) {
    this.saveData  = data.saveData;
    this.slotIndex = data.slotIndex;
  }

  // ── Upgrade pool ─────────────────────────────────────────────────────────────
  static POOL = [
    { id: 'repair',               label: 'Repair Items',    desc: 'Restore all items by half their max uses.'                            },
    { id: 'full_heal',            label: 'Full Heal',        desc: 'Fully restore the lord\'s HP.'                                        },
    { id: 'level_up',             label: 'Level Up',         desc: 'Gain one level. Stat bonuses roll immediately.'                       },
    { id: 'duplicate',            label: 'Duplicate Item',   desc: 'Select one item to receive a full-uses copy.'                         },
    { id: 'weapon_blaze',         label: 'Blaze Weapon',     desc: 'Receive a Blaze weapon. Burns on hit (35%): halves target Pow.'       },
    { id: 'weapon_frost',         label: 'Frost Weapon',     desc: 'Receive a Frost weapon. Freezes on hit (35%): immobilizes target.'    },
    { id: 'weapon_poison',        label: 'Poison Weapon',    desc: 'Receive a Poison weapon. Poisons on hit (35%): 15% max HP per turn.'  },
    { id: 'weapon_spark',         label: 'Spark Weapon',     desc: 'Receive a Spark weapon. Paralyzes on hit (35%): halves target Spd.'   },
    { id: 'ability_double_blaze', label: 'Double Blaze',     desc: 'Give a unit Double Blaze. Their Blaze weapons deal 2× might.'         },
    { id: 'ability_double_frost', label: 'Double Frost',     desc: 'Give a unit Double Frost. Their Frost weapons deal 2× might.'         },
    { id: 'ability_double_poison',label: 'Double Poison',    desc: 'Give a unit Double Poison. Their Poison weapons deal 2× might.'        },
    { id: 'ability_double_spark', label: 'Double Spark',     desc: 'Give a unit Double Spark. Their Spark weapons deal 2× might.'         },
  ];

  // ── All recruitable unit templates (used for pre-chapter offer) ─────────────
  static RECRUIT_POOL = [
    // ── Rookies (level 1) ──────────────────────────────────────────────────────
    {
      name: 'Grunt', className: 'Grunt', color: 0x4080b0, symbol: '♙',
      level: 1,
      stats:   { hp: 14, pow: 5,  mag: 0, sp: 4, lck: 3, def: 5,  mdef: 2, move: 4 },
      growths: { hp: 80, pow: 65, mag: 0, sp: 55, lck: 45, def: 70, mdef: 20 },
      weapons:   ['WOOD_LANCE', 'HEALING_POTION'],
      abilities: [],
    },
    {
      name: 'Clergy', className: 'Clergy', color: 0xc0a030, symbol: '♗',
      level: 1,
      stats:   { hp: 11, pow: 2,  mag: 9, sp: 5, lck: 7, def: 2,  mdef: 8, move: 5 },
      growths: { hp: 55, pow: 5,  mag: 90, sp: 65, lck: 75, def: 10, mdef: 85 },
      weapons:   ['WOOD_TOME', 'HEAL', 'HEALING_POTION'],
      abilities: [],
    },
    {
      name: 'Ruffian', className: 'Ruffian', color: 0xb05030, symbol: '♕',
      level: 1,
      stats:   { hp: 19, pow: 8,  mag: 0, sp: 4, lck: 3, def: 5,  mdef: 2, move: 4 },
      growths: { hp: 90, pow: 70, mag: 0, sp: 35, lck: 30, def: 45, mdef: 15 },
      weapons:   ['WOOD_AXE', 'HEALING_POTION'],
      abilities: ['hi_crit'],
    },
    {
      name: 'Vagabond', className: 'Vagabond', color: 0xe0a020, symbol: '†',
      level: 1,
      stats:   { hp: 12, pow: 7,  mag: 0, sp: 7, lck: 4, def: 3,  mdef: 2, move: 5 },
      growths: { hp: 55, pow: 75, mag: 0, sp: 80, lck: 50, def: 30, mdef: 20 },
      weapons:   ['WOOD_SWORD', 'HEALING_POTION'],
      abilities: ['hi_crit'],
    },
    // ── Veterans (level 5–7) ───────────────────────────────────────────────────
    {
      name: 'Bulwark', className: 'Bulwark', color: 0x607060, symbol: '♖',
      level: 7,
      stats:   { hp: 38, pow: 15, mag: 1, sp: 4,  lck: 6, def: 18, mdef: 6, move: 4 },
      growths: { hp: 50, pow: 30, mag: 5, sp: 15, lck: 20, def: 45, mdef: 10 },
      weapons:   ['BRONZE_LANCE', 'HEALING_POTION'],
      abilities: [],
    },
    {
      name: 'Fletcher', className: 'Fletcher', color: 0x50a090, symbol: '♘',
      level: 7,
      stats:   { hp: 28, pow: 13, mag: 0, sp: 10, lck: 7, def: 7,  mdef: 4, move: 6 },
      growths: { hp: 35, pow: 30, mag: 0, sp: 25, lck: 30, def: 20, mdef: 10 },
      weapons:   ['BRONZE_SWORD', 'BRONZE_BOW', 'HEALING_POTION'],
      abilities: [],
    },
    {
      name: 'Defender', className: 'Defender', color: 0x4060a0, symbol: '♘',
      level: 5,
      stats:   { hp: 28, pow: 14, mag: 0, sp: 9, lck: 6, def: 8,  mdef: 3, move: 5 },
      growths: { hp: 65, pow: 70, mag: 0, sp: 65, lck: 45, def: 40, mdef: 15 },
      weapons:   ['BRONZE_SWORD', 'BRONZE_AXE', 'HEALING_POTION'],
      abilities: ['hi_crit', 'lifesteal'],
    },
    {
      name: 'Specialist', className: 'Specialist', color: 0x306060, symbol: '♝',
      level: 5,
      stats:   { hp: 22, pow: 10, mag: 0, sp: 8, lck: 7, def: 5,  mdef: 4, move: 5 },
      growths: { hp: 55, pow: 60, mag: 0, sp: 75, lck: 55, def: 25, mdef: 20 },
      weapons:   ['BRONZE_LANCE', 'BRONZE_BOW', 'HEALING_POTION'],
      abilities: ['reach', 'versatile'],
    },
    {
      name: 'Dragoon Knight', className: 'Dragoon Knight', color: 0x505080, symbol: '♜',
      level: 6,
      stats:   { hp: 32, pow: 13, mag: 0, sp: 6, lck: 5, def: 10, mdef: 4, move: 6 },
      growths: { hp: 75, pow: 60, mag: 0, sp: 40, lck: 30, def: 55, mdef: 20 },
      weapons:   ['BRONZE_LANCE', 'BRONZE_AXE', 'HEALING_POTION'],
      abilities: ['flight', 'bow_weakness', 'magic_weakness', 'dragon_scales'],
    },
  ];

  create() {
    this.gameState        = 'select';
    this.cursor           = 0;
    this.itemCursor       = 0;
    this.weaponPickCursor = 0;
    this.pendingElement   = null;
    this.weaponPickList   = [];
    this.abilityPickCursor = 0;
    this.pendingAbilityId  = null;
    this.abilityPickList   = [];
    this.recruitOfferDone  = false;
    this.pendingRecruit    = null;
    this.recruitCursor     = 0;    // 0 = YES, 1 = NO
    this.lordUnit          = this._buildLordUnit();
    this.upgrades          = this._pickUpgrades(3);

    this.gfx = this.add.graphics();
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

    this._buildText();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  // ── Reconstruct a live Unit from saveData so we can call levelUp() on it ─────
  _buildLordUnit() {
    const ld = LORD_DEFS[this.saveData.selectedLord];
    const ps = this.saveData.playerStats;

    const lord = new Unit({
      name: ld.label, faction: FACTION.PLAYER,
      gx: 0, gy: 0,
      ...ld.stats,
      level: 1, growths: ld.growths, moveCosts: ld.moveCosts,
      className: ld.className,
      color: ld.color, symbol: '♞', isLord: true,
      weapons: [],
    });

    if (ps) {
      lord.maxHp = ps.maxHp;  lord.hp   = ps.hp;
      lord.pow   = ps.pow;    lord.mag  = ps.mag;
      lord.sp    = ps.sp;     lord.lck  = ps.lck;
      lord.def   = ps.def;    lord.mdef = ps.mdef;
      lord.level = ps.level;  lord.xp   = ps.xp || 0;
      if (ps.abilities && ps.abilities.length > 0)
        lord.abilities = [...ps.abilities];
      lord.weapons = (ps.weapons || []).map(w => {
        const c = { ...w };
        if (c.effect) c.effect = { ...c.effect };
        return c;
      });
      lord.equippedWeapon =
        (ps.equippedIdx >= 0 ? lord.weapons[ps.equippedIdx] : null)
        || lord.weapons.find(w => !w.isStaff && !w.isConsumable)
        || lord.weapons[0] || null;
    }
    return lord;
  }

  // ── Pick n distinct upgrades ─────────────────────────────────────────────────
  // 'duplicate' excluded if inventory is empty.
  // recruit options only appear after floor 1 (currentLevel === 2 at reward time).
  // elemental weapon options excluded if no party member uses any physical weapon.
  _pickUpgrades(n) {
    const hasItems    = (this.saveData.playerStats?.weapons || []).length > 0;
    const anyPhysical = this._buildWeaponPickList().length > 0;

    const pool = FloorRewardScene.POOL.filter(u => {
      if (u.id === 'duplicate'          && !hasItems)    return false;
      if (u.id.startsWith('weapon_')    && !anyPhysical) return false;
      return true;
    });
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  }

  // ── Build all text objects ────────────────────────────────────────────────────
  _buildText() {
    const f = (sz, col) => ({
      fontFamily: '"Barlow Condensed", sans-serif',
      fontSize: `${sz}px`,
      color: col,
    });

    this.txtTitle = this.add.text(GAME_W / 2, 44, 'CHOOSE YOUR REWARD', f(38, C.TITLE))
      .setOrigin(0.5).setDepth(2);
    this.txtSub = this.add.text(GAME_W / 2, 96,
      `Floor ${this.saveData.currentLevel - 1} cleared!`, f(22, C.DIM))
      .setOrigin(0.5).setDepth(2);
    this.txtHint = this.add.text(GAME_W / 2, GAME_H - 32, '', f(20, C.DIM))
      .setOrigin(0.5).setDepth(2);

    // Card rows — one label + description per upgrade slot
    this.txtCardLabels = Array.from({ length: 3 }, () =>
      this.add.text(0, 0, '', f(26, C.TEXT)).setDepth(2)
    );
    this.txtCardDescs = Array.from({ length: 3 }, () =>
      this.add.text(0, 0, '', f(18, C.DIM)).setDepth(2)
    );

    // Item-pick overlay (duplicate)
    this.txtPickHeader = this.add.text(0, 0, 'Select an item to duplicate:', f(22, C.TITLE))
      .setDepth(4).setVisible(false);
    this.txtPickItems = Array.from({ length: 6 }, () =>
      this.add.text(0, 0, '', f(20, C.TEXT)).setDepth(4).setVisible(false)
    );

    // Shared party-pick overlay — used by both weapon-pick and ability-pick.
    // lord + up to 14 allies = 15 rows max.
    this.txtPartyPickHeader = this.add.text(0, 0, '', f(22, C.TITLE))
      .setDepth(4).setVisible(false);
    this.txtPartyPickItems = Array.from({ length: 15 }, () =>
      this.add.text(0, 0, '', f(20, C.TEXT)).setDepth(4).setVisible(false)
    );

    // Recruit offer overlay
    this.txtRecruitTitle   = this.add.text(0, 0, '', f(32, C.TITLE)).setDepth(5).setVisible(false);
    this.txtRecruitName    = this.add.text(0, 0, '', f(24, C.TEXT)).setDepth(5).setVisible(false);
    this.txtRecruitStats   = this.add.text(0, 0, '', f(20, C.DIM)).setDepth(5).setVisible(false);
    this.txtRecruitWeapons = this.add.text(0, 0, '', f(20, C.DIM)).setDepth(5).setVisible(false);
    this.txtRecruitOptions = this.add.text(0, 0, '', f(28, C.TEXT)).setDepth(5).setVisible(false);
    this.txtRecruitHint    = this.add.text(0, 0, '', f(18, C.DIM)).setDepth(5).setVisible(false);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────
  update() {
    const jd = k => Phaser.Input.Keyboard.JustDown(k);

    // Resumed from LevelUp scene — lord stats are already updated; now save + go
    if (this.gameState === 'levelup_wait') {
      this._saveLordStats();
      this._fadeToGameMap();
    }

    if (this.gameState === 'transitioning') {
      this._render();
      return;
    }

    if (this.gameState === 'select') {
      const count = this.upgrades.length;
      if (jd(this.keys.up)   || jd(this.keys.w))    this.cursor = (this.cursor - 1 + count) % count;
      if (jd(this.keys.down) || jd(this.keys.s))    this.cursor = (this.cursor + 1) % count;
      if (jd(this.keys.confirm) || jd(this.keys.enter)) this._confirmUpgrade();
    }

    if (this.gameState === 'item-pick') {
      const items = this.lordUnit.weapons;
      if (jd(this.keys.up)   || jd(this.keys.w))    this.itemCursor = Math.max(0, this.itemCursor - 1);
      if (jd(this.keys.down) || jd(this.keys.s))    this.itemCursor = Math.min(items.length - 1, this.itemCursor + 1);
      if (jd(this.keys.confirm) || jd(this.keys.enter)) this._confirmDuplicate();
      if (jd(this.keys.cancel)  || jd(this.keys.esc))   this.gameState = 'select';
    }

    if (this.gameState === 'weapon-pick') {
      const len = this.weaponPickList.length;
      if (jd(this.keys.up)   || jd(this.keys.w))    this.weaponPickCursor = Math.max(0, this.weaponPickCursor - 1);
      if (jd(this.keys.down) || jd(this.keys.s))    this.weaponPickCursor = Math.min(len - 1, this.weaponPickCursor + 1);
      if (jd(this.keys.confirm) || jd(this.keys.enter)) this._confirmWeaponPick();
      if (jd(this.keys.cancel)  || jd(this.keys.esc))   this.gameState = 'select';
    }

    if (this.gameState === 'ability-pick') {
      const len = this.abilityPickList.length;
      if (jd(this.keys.up)   || jd(this.keys.w))    this.abilityPickCursor = Math.max(0, this.abilityPickCursor - 1);
      if (jd(this.keys.down) || jd(this.keys.s))    this.abilityPickCursor = Math.min(len - 1, this.abilityPickCursor + 1);
      if (jd(this.keys.confirm) || jd(this.keys.enter)) this._confirmAbilityPick();
      if (jd(this.keys.cancel)  || jd(this.keys.esc))   this.gameState = 'select';
    }

    if (this.gameState === 'recruit-offer') {
      if (jd(this.keys.up)   || jd(this.keys.w))    this.recruitCursor = 0;
      if (jd(this.keys.down) || jd(this.keys.s))    this.recruitCursor = 1;
      if (jd(this.keys.confirm) || jd(this.keys.enter)) {
        if (this.recruitCursor === 0) {
          this._addAllyToSave(this.pendingRecruit);
          this._saveLordStats();
        }
        this._fadeToGameMap();
      }
    }

    this._render();
  }

  // ── Apply the highlighted upgrade ─────────────────────────────────────────────
  _confirmUpgrade() {
    const upg = this.upgrades[this.cursor];

    switch (upg.id) {
      case 'repair':
        this.lordUnit.weapons.forEach(w => {
          w.uses = Math.min(w.maxUses, w.uses + Math.floor(w.maxUses / 2));
        });
        this._saveLordStats();
        this._fadeToGameMap();
        break;

      case 'full_heal':
        this.lordUnit.hp = this.lordUnit.maxHp;
        this._saveLordStats();
        this._fadeToGameMap();
        break;

      case 'level_up': {
        const gained = this.lordUnit.levelUp();
        this.gameState = 'levelup_wait';
        this.scene.launch('LevelUp', { unit: this.lordUnit, gained, callerKey: 'FloorReward' });
        this.scene.pause();
        break;
      }

      case 'duplicate':
        this.itemCursor = 0;
        this.gameState  = 'item-pick';
        break;

      case 'weapon_blaze':
      case 'weapon_frost':
      case 'weapon_poison':
      case 'weapon_spark': {
        const element = upg.id.slice(7);
        const list    = this._buildWeaponPickList();
        if (list.length === 1) {
          this._giveElementalWeapon(element, list[0]);
          this._saveLordStats();
          this._fadeToGameMap();
        } else {
          this.pendingElement   = element;
          this.weaponPickList   = list;
          this.weaponPickCursor = 0;
          this.gameState        = 'weapon-pick';
        }
        break;
      }

      case 'ability_double_blaze':
      case 'ability_double_frost':
      case 'ability_double_poison':
      case 'ability_double_spark': {
        const abilityId = upg.id.slice(8); // e.g. 'double_blaze'
        const list      = this._buildAllPartyList();
        if (list.length === 1) {
          this._giveAbility(abilityId, list[0]);
          this._saveLordStats();
          this._fadeToGameMap();
        } else {
          this.pendingAbilityId   = abilityId;
          this.abilityPickList    = list;
          this.abilityPickCursor  = 0;
          this.gameState          = 'ability-pick';
        }
        break;
      }
    }
  }

  // ── Confirm elemental weapon recipient ────────────────────────────────────────
  _confirmWeaponPick() {
    const entry = this.weaponPickList[this.weaponPickCursor];
    if (!entry) return;
    this._giveElementalWeapon(this.pendingElement, entry);
    this._saveLordStats();
    this._fadeToGameMap();
  }

  // ── Confirm ability recipient ─────────────────────────────────────────────────
  _confirmAbilityPick() {
    const entry = this.abilityPickList[this.abilityPickCursor];
    if (!entry) return;
    this._giveAbility(this.pendingAbilityId, entry);
    this._saveLordStats();
    this._fadeToGameMap();
  }

  // ── Give elemental weapon to a party member ───────────────────────────────────
  _giveElementalWeapon(element, entry) {
    const weapon = this._makeElementalWeaponFor(element, entry);
    if (entry.isLord) {
      this.lordUnit.weapons.push(weapon);
      if (!this.lordUnit.equippedWeapon && !weapon.isStaff && !weapon.isConsumable)
        this.lordUnit.equippedWeapon = weapon;
    } else {
      const ally = this.saveData.allies[entry.allyIdx];
      const copy = { ...weapon };
      if (copy.effect) copy.effect = { ...copy.effect };
      ally.weapons.push(copy);
    }
  }

  // ── Add elemental ability to a party member (no duplicates) ──────────────────
  _giveAbility(abilityId, entry) {
    if (entry.isLord) {
      if (!this.lordUnit.abilities.includes(abilityId))
        this.lordUnit.abilities.push(abilityId);
    } else {
      const ally = this.saveData.allies[entry.allyIdx];
      if (!ally.abilities) ally.abilities = [];
      if (!ally.abilities.includes(abilityId))
        ally.abilities.push(abilityId);
    }
  }

  // ── Build party list: only members who can wield a physical weapon ────────────
  _buildWeaponPickList() {
    const physical = new Set(['sword', 'lance', 'axe', 'bow']);
    const list = [];

    const ld      = LORD_DEFS[this.saveData.selectedLord];
    const lordKey = ld.className.toUpperCase().replace(/\s+/g, '_');
    if ((CLASSES[lordKey]?.weapons || []).some(w => physical.has(w))) {
      list.push({
        name: ld.label, className: ld.className,
        level: this.saveData.playerStats?.level || 1,
        isLord: true, allyIdx: -1,
      });
    }

    (this.saveData.allies || []).forEach((ally, idx) => {
      const ak = ally.className.toUpperCase().replace(/\s+/g, '_');
      if ((CLASSES[ak]?.weapons || []).some(w => physical.has(w))) {
        list.push({
          name: ally.name, className: ally.className,
          level: ally.level || 1,
          isLord: false, allyIdx: idx,
        });
      }
    });

    return list;
  }

  // ── Build party list: every party member (for ability rewards) ────────────────
  _buildAllPartyList() {
    const ld = LORD_DEFS[this.saveData.selectedLord];
    const list = [{
      name: ld.label, className: ld.className,
      level: this.saveData.playerStats?.level || 1,
      isLord: true, allyIdx: -1,
    }];

    (this.saveData.allies || []).forEach((ally, idx) => {
      list.push({
        name: ally.name, className: ally.className,
        level: ally.level || 1,
        isLord: false, allyIdx: idx,
      });
    });

    return list;
  }

  // ── Create the elemental weapon appropriate for a party entry ─────────────────
  _makeElementalWeaponFor(element, entry) {
    const prefix  = element.toUpperCase();
    const typeMap = { sword: 'SWORD', lance: 'LANCE', axe: 'AXE', bow: 'BOW' };

    const classKey = (entry.isLord
      ? LORD_DEFS[this.saveData.selectedLord].className
      : entry.className
    ).toUpperCase().replace(/\s+/g, '_');

    const matching = (CLASSES[classKey]?.weapons || [])
      .filter(w => typeMap[w]).map(w => typeMap[w]);

    const types = matching.length > 0 ? matching : ['SWORD', 'LANCE', 'AXE', 'BOW'];
    const type  = types[Math.floor(Math.random() * types.length)];
    return makeWeapon(`${prefix}_${type}`);
  }

  // ── Duplicate: push a full-uses clone of the chosen item ──────────────────────
  _confirmDuplicate() {
    const item = this.lordUnit.weapons[this.itemCursor];
    if (!item) return;
    const copy = { ...item };
    if (copy.effect) copy.effect = { ...copy.effect };
    copy.uses = copy.maxUses;
    this.lordUnit.weapons.push(copy);
    this._saveLordStats();
    this._fadeToGameMap();
  }

  // ── Add a recruited ally to saveData.allies ──────────────────────────────────
  _addAllyToSave(template) {
    const weapons = template.weapons.map(key => makeWeapon(key));
    if (!this.saveData.allies) this.saveData.allies = [];
    this.saveData.allies.push({
      name:        template.name,
      className:   template.className,
      color:       template.color,
      symbol:      template.symbol,
      level:       template.level || 1,
      xp:          0,
      maxHp:       template.stats.hp,
      hp:          template.stats.hp,
      pow:         template.stats.pow,
      mag:         template.stats.mag,
      sp:          template.stats.sp,
      lck:         template.stats.lck,
      def:         template.stats.def,
      mdef:        template.stats.mdef,
      move:        template.stats.move,
      growths:     { ...template.growths },
      weapons:     weapons.map(w => ({ ...w })),
      equippedIdx: Math.max(0, weapons.findIndex(w => !w.isStaff && !w.isConsumable)),
      abilities:   template.abilities ? [...template.abilities] : [],
    });
  }

  // ── Write lord state back into saveData and persist to localStorage ───────────
  // saveData.allies is mutated in place, so SaveData.save here also persists
  // any ability or weapon changes made to allies this session.
  _saveLordStats() {
    const lord = this.lordUnit;
    this.saveData.playerStats = {
      maxHp: lord.maxHp, hp:    lord.hp,
      pow:   lord.pow,   mag:   lord.mag,
      sp:    lord.sp,    lck:   lord.lck,
      def:   lord.def,   mdef:  lord.mdef,
      level: lord.level, xp:    lord.xp || 0,
      weapons:     lord.weapons.map(w => ({ ...w })),
      equippedIdx: lord.weapons.indexOf(lord.equippedWeapon),
      abilities:   [...(lord.abilities || [])],
    };
    SaveData.save(this.slotIndex, this.saveData);
  }

  _fadeToGameMap() {
    const allyCount = (this.saveData.allies || []).length;
    if (!this.recruitOfferDone && RECRUIT_FLOORS.has(this.saveData.currentLevel) && allyCount < 14) {
      this._enterRecruitOffer();
      return;
    }
    this.gameState = 'transitioning';
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameMap', { saveData: this.saveData, slotIndex: this.slotIndex });
    });
  }

  _enterRecruitOffer() {
    this.recruitOfferDone = true;
    const pool = FloorRewardScene.RECRUIT_POOL;
    this.pendingRecruit   = pool[Math.floor(Math.random() * pool.length)];
    this.recruitCursor    = 0;
    this.gameState        = 'recruit-offer';
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────
  _render() {
    const g = this.gfx;
    g.clear();

    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GAME_W, GAME_H);

    this._renderCards(g);

    if (this.gameState === 'item-pick') {
      this._renderItemPick(g);
    } else {
      this.txtPickHeader.setVisible(false);
      this.txtPickItems.forEach(t => t.setVisible(false));
    }

    if (this.gameState === 'weapon-pick') {
      this._renderPartyPick(g, this.weaponPickList, this.weaponPickCursor, this.pendingElement, 'weapon');
    } else if (this.gameState === 'ability-pick') {
      this._renderPartyPick(g, this.abilityPickList, this.abilityPickCursor, this.pendingAbilityId, 'ability');
    } else {
      this.txtPartyPickHeader.setVisible(false);
      this.txtPartyPickItems.forEach(t => t.setVisible(false));
    }

    if (this.gameState === 'recruit-offer') {
      this._renderRecruitOffer(g);
    } else {
      this.txtRecruitTitle.setVisible(false);
      this.txtRecruitName.setVisible(false);
      this.txtRecruitStats.setVisible(false);
      this.txtRecruitWeapons.setVisible(false);
      this.txtRecruitOptions.setVisible(false);
      this.txtRecruitHint.setVisible(false);
    }
  }

  _renderRecruitOffer(g) {
    const r    = this.pendingRecruit;
    const panW = 600, panH = 320;
    const panX = (GAME_W - panW) / 2;
    const panY = (GAME_H - panH) / 2;

    g.fillStyle(C.PANEL_BG, 0.98);
    g.fillRect(panX, panY, panW, panH);
    g.lineStyle(3, C.SEL_BD, 1);
    g.strokeRect(panX, panY, panW, panH);
    g.fillStyle(C.SEL_BD, 1);
    g.fillRect(panX, panY, panW, 6);

    const s = r.stats;
    const wNames = r.weapons.map(k => WEAPON_DATA[k]?.name || k).join('  ·  ');

    this.txtRecruitTitle
      .setText('NEW RECRUIT')
      .setPosition(panX + panW / 2, panY + 28).setOrigin(0.5)
      .setVisible(true);

    this.txtRecruitName
      .setText(`${r.name}   ·   ${r.className}   Lv.${r.level}`)
      .setPosition(panX + panW / 2, panY + 72).setOrigin(0.5)
      .setVisible(true);

    this.txtRecruitStats
      .setText(`HP ${s.hp}   Pow ${s.pow}   Spd ${s.sp}   Def ${s.def}   MDef ${s.mdef}   Move ${s.move}`)
      .setPosition(panX + panW / 2, panY + 118).setOrigin(0.5)
      .setVisible(true);

    this.txtRecruitWeapons
      .setText(`Weapons: ${wNames}`)
      .setPosition(panX + panW / 2, panY + 158).setOrigin(0.5)
      .setVisible(true);

    this.txtRecruitOptions
      .setText(`${this.recruitCursor === 0 ? '▶ ' : '   '}YES        ${this.recruitCursor === 1 ? '▶ ' : '   '}NO`)
      .setPosition(panX + panW / 2, panY + 224).setOrigin(0.5)
      .setColor(C.TEXT)
      .setVisible(true);

    this.txtRecruitHint
      .setText('W/S: choose   X / Enter: confirm')
      .setPosition(panX + panW / 2, panY + 282).setOrigin(0.5)
      .setVisible(true);
  }

  _renderCards(g) {
    const cardW = 640, cardH = 110;
    const cardX = (GAME_W - cardW) / 2;
    const startY = 144;
    const gap    = 18;

    for (let i = 0; i < this.upgrades.length; i++) {
      const upg = this.upgrades[i];
      const y   = startY + i * (cardH + gap);
      const sel = i === this.cursor && this.gameState === 'select';

      g.fillStyle(sel ? 0x1a2a4a : 0x111122, 0.98);
      g.fillRect(cardX, y, cardW, cardH);
      g.lineStyle(sel ? 3 : 2, sel ? C.CURSOR : C.PANEL_BD, 1);
      g.strokeRect(cardX, y, cardW, cardH);

      if (sel) {
        g.fillStyle(C.CURSOR, 1);
        g.fillRect(cardX, y, 6, cardH);
      }

      this.txtCardLabels[i]
        .setText(`${sel ? '▶' : '   '}  ${upg.label}`)
        .setPosition(cardX + 24, y + 18)
        .setColor(sel ? C.TITLE : C.TEXT)
        .setVisible(true);

      this.txtCardDescs[i]
        .setText(upg.desc)
        .setPosition(cardX + 56, y + 66)
        .setVisible(true);
    }

    for (let i = this.upgrades.length; i < 3; i++) {
      this.txtCardLabels[i].setVisible(false);
      this.txtCardDescs[i].setVisible(false);
    }

    const overlayOpen = ['item-pick', 'weapon-pick', 'ability-pick'].includes(this.gameState);
    this.txtHint.setText(overlayOpen ? '' : 'W/S: navigate   X: select');
  }

  _renderItemPick(g) {
    const items = this.lordUnit.weapons;
    const rowH  = 48;
    const popW  = 500;
    const popH  = items.length * rowH + 80;
    const popX  = (GAME_W - popW) / 2;
    const popY  = (GAME_H - popH) / 2;

    g.fillStyle(C.PANEL_BG, 0.98);
    g.fillRect(popX, popY, popW, popH);
    g.lineStyle(4, C.PANEL_BD, 1);
    g.strokeRect(popX, popY, popW, popH);

    g.fillStyle(C.SEL_BD, 0.22);
    g.fillRect(popX + 4, popY + 44 + this.itemCursor * rowH, popW - 8, rowH - 4);

    this.txtPickHeader.setPosition(popX + 16, popY + 8).setVisible(true);
    this.txtHint.setText('X: duplicate   Z: cancel');

    for (let i = 0; i < Math.min(items.length, this.txtPickItems.length); i++) {
      const item = items[i];
      const sel  = i === this.itemCursor;
      const eq   = (item === this.lordUnit.equippedWeapon) ? '*' : ' ';
      this.txtPickItems[i]
        .setText(`${sel ? '▶' : ' '}${eq} ${item.name}  ${item.uses}/${item.maxUses}`)
        .setPosition(popX + 16, popY + 46 + i * rowH)
        .setColor(sel ? C.TITLE : C.TEXT)
        .setVisible(true);
    }
    for (let i = items.length; i < this.txtPickItems.length; i++) {
      this.txtPickItems[i].setVisible(false);
    }
  }

  // Shared renderer for both weapon-pick and ability-pick party selectors.
  _renderPartyPick(g, list, cursor, pendingId, pickType) {
    const rowH = 52;
    const popW = 580;
    const popH = list.length * rowH + 80;
    const popX = (GAME_W - popW) / 2;
    const popY = (GAME_H - popH) / 2;

    g.fillStyle(C.PANEL_BG, 0.98);
    g.fillRect(popX, popY, popW, popH);
    g.lineStyle(4, C.PANEL_BD, 1);
    g.strokeRect(popX, popY, popW, popH);

    g.fillStyle(C.SEL_BD, 0.22);
    g.fillRect(popX + 4, popY + 44 + cursor * rowH, popW - 8, rowH - 4);

    // Build a readable label from the pending ID:
    // 'blaze' → 'Blaze'  |  'double_blaze' → 'Double Blaze'
    const label = (pendingId || '')
      .split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const headerText = pickType === 'ability'
      ? `Give ${label} passive to:`
      : `Give ${label} weapon to:`;

    this.txtPartyPickHeader
      .setText(headerText)
      .setPosition(popX + 16, popY + 10)
      .setVisible(true);

    this.txtHint.setText('W/S: cycle   X: confirm   Z: back');

    for (let i = 0; i < Math.min(list.length, this.txtPartyPickItems.length); i++) {
      const entry = list[i];
      const sel   = i === cursor;
      this.txtPartyPickItems[i]
        .setText(`${sel ? '▶' : ' '}  ${entry.name}   ${entry.className}   Lv ${entry.level}`)
        .setPosition(popX + 16, popY + 46 + i * rowH)
        .setColor(sel ? C.TITLE : C.TEXT)
        .setVisible(true);
    }
    for (let i = list.length; i < this.txtPartyPickItems.length; i++) {
      this.txtPartyPickItems[i].setVisible(false);
    }
  }
}
