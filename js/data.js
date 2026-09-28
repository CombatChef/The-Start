/*
 * SLASHCO VR — TURN-BASED BATTLE
 * data.js — every stat, skill, passive, item and tuning number lives here.
 *
 * Descriptions marked `doc:` are copied word for word from "Slasher Statistics".
 * The numbers next to them are how each description is turned into game rules.
 * Change any number here and the battle picks it up; no other file needs editing.
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});

  SC.DATA = {
    // ------------------------------------------------------------------
    // WORKER HEALTH  (doc: "A worker's health is displayed by the following: (In PERCENT %)")
    // ------------------------------------------------------------------
    health: {
      start: 100, // doc: "Starting health: 100"
      max: 150, // doc: "(150 maximum, 200 with the perk "Heavy")"
      states: [
        // min/max are inclusive percent ranges. `says` is the battle-log line.
        { id: 'CRITICAL', min: 1, max: 20, says: '{n} is in critical condition!' },
        { id: 'HURT', min: 21, max: 40, says: '{n} is hurt!' },
        { id: 'SCATHED', min: 41, max: 60, says: '{n} is scathed!' },
        { id: 'STABLE', min: 61, max: 80, says: '{n} is in stable condition!' },
        { id: 'OK', min: 81, max: 100, says: '{n} is OK!' },
        { id: 'SATED', min: 101, max: 150, says: '{n} is in a sated condition!' },
        { id: 'OVERSATED', min: 151, max: 200, says: '{n} is oversated!' },
      ],
    },

    // Slashers never show a percent either; their bar reads the first row whose `upTo` their
    // health fits under. Keep WEAKENED / BARELY STANDING in step with each slasher's
    // `weakenedAt` and `barelyStandingAt` below.
    slasherHealth: [
      { upTo: 0.12, id: 'BARELY STANDING' },
      { upTo: 0.35, id: 'WEAKENED' },
      { upTo: 0.6, id: 'WOUNDED' },
      { upTo: 0.8, id: 'BRUISED' },
      { upTo: 1, id: null }, // their doc health: "Good" for Trollge, "Unhealthy" for Sid
    ],

    // Party order = HUD corners: top-left, top-right, bottom-left, bottom-right.
    // Purpl Lady ('purpl') still works here if you want her back in Mysti's place.
    party: ['mel', 'john', 'mysti', 'jim'],
    enemy: 'trollge', // the default fight
    enemies: ['trollge', 'sid'], // picked on the title screen

    // ------------------------------------------------------------------
    // WORKERS
    // ------------------------------------------------------------------
    workers: {
      mel: {
        name: 'Mel',
        title: 'MEL SLASHCO',
        stats: { atk: 87, def: 68, spd: 57, mag: 12, chm: 73, smt: 100, brv: 80 },
        health: 'Good',
        spiritualPower: 'Barely',
        morals: 'Considerable',
        resource: { name: 'STAMINA', short: 'STA', max: 90 },
        weapon: {
          name: 'Mannequin Fists',
          doc: 'A little tougher than a human’s fist. Basic attacks hit twice for a third the HIT RATE on the second hit.',
          hits: 2,
          followUpHitRate: 1 / 3,
          verb: 'punches',
        },
        armor: {
          name: 'Slash Co Uniform',
          doc: 'A sturdy and rugged looking uniform, balanced in all ways, even if it lacks in fashion.',
        },
        skills: ['fuelCheck', 'tossGlasses', 'melsPages', 'watermelonLob'],
        passives: ['uncleSink', 'athlete', 'aliveHard', 'batterUp'],
      },

      john: {
        name: 'John',
        title: 'JOHN SLASHCO',
        stats: { atk: 98, def: 34, spd: 56, mag: 0, chm: 78, smt: 50, brv: 90 },
        health: 'OK',
        spiritualPower: 'None',
        morals: 'Moderate',
        resource: { name: 'STAMINA', short: 'STA', max: 80 },
        weapon: {
          name: 'COOL Fists',
          doc: 'At least Captain Jim thinks he’s cool… Basic attacks hit twice for half the HIT RATE on the second hit.',
          hits: 2,
          followUpHitRate: 1 / 2,
          verb: 'jabs',
        },
        armor: {
          name: 'Slash Co Uniform',
          doc: 'A sturdy and rugged looking uniform, balanced in all ways, even if it lacks in fashion.',
        },
        skills: ['capSlap', 'nap', 'lunchBox', 'batteryCheck'],
        passives: ['hyperceptive', 'speedAddict', 'shadowborn', 'solidJohn'],
      },

      purpl: {
        name: 'Purpl Lady',
        title: 'PURPL LADY',
        stats: { atk: 66, def: 85, spd: 109, mag: 92, chm: 210, smt: 100, brv: 10 },
        health: 'None', // She is a ghost: no health bar, physical hits pass through her.
        spiritualPower: 'Strong',
        morals: 'High',
        ghost: true,
        resource: { name: 'SPIRIT', short: 'SPR', max: 100, regen: 0 }, // only FOCUS brings it back
        weapon: {
          name: 'Magic Book',
          doc: 'Doesn’t do anything physically, but targeting an enemy with a basic attack makes them suffer a random debuff.',
          hits: 0,
          verb: 'hexes',
        },
        armor: {
          name: 'Magical Robes',
          doc: 'Not the best for defense, luckily you’re dead. Increases MAGIC.',
          magBonus: 0.1,
        },
        skills: ['seriousChills', 'shadowsHand', 'foresight', 'phaseForItems'],
        passives: ['ghostBody', 'freakyDoctor', 'moralSupport', 'possession'],
      },

      jim: {
        name: 'Captain Jim',
        title: 'CAPTAIN JIM',
        stats: { atk: 108, def: 66, spd: 41, mag: 0, chm: 80, smt: 75, brv: 145 },
        health: 'Questionable',
        spiritualPower: 'None',
        morals: 'High',
        resource: { name: 'STAMINA', short: 'STA', max: 100 },
        weapon: {
          name: 'Burner Phone',
          doc: 'Gets loud often, but it’s a NOKIA… Expect a lot of damage from this thing.',
          rules: 'One heavy hit. 30% of the time the phone rings mid-swing and makes NOISE ({e} ANGER +5).',
          hits: 1,
          power: 0.95,
          verb: 'smacks',
          line: '{n} smacks {e} with his Burner Phone!',
          noiseChance: 0.3,
          noiseAnger: 5,
        },
        armor: {
          name: 'Slash Co Pilot Uniform',
          doc: 'A sturdy and rugged looking uniform, balanced in all ways, it even comes with cool goggles and headphones… The COOLER uniform.',
        },
        skills: ['proxyLocator', 'matthewsAid', 'confidentialDocs', 'bearTrap', 'helicopterEscape', 'zingerBurger'],
        passives: ['stealthCamo', 'grouchBehavior', 'fullBloodAussie'],
      },

      mysti: {
        name: 'Mysti',
        title: 'BRAVO MYSTI', // doc: Bravo Team “Mysti”
        pronouns: { he: 'she', his: 'her', him: 'her' },
        stats: { atk: 190, def: 93, spd: 34, mag: 0, chm: 120, smt: 150, brv: 200 },
        health: 'Scarred',
        spiritualPower: 'None',
        morals: 'Medium',
        resource: { name: 'STAMINA', short: 'STA', max: 100 },
        weapon: {
          name: 'Knife',
          doc: 'Retrieved from being stabbed into Trollge. Always causes bleeding upon hit, small chance to parry attacks.',
          rules: 'One slash that always makes {e} BLEED. 15% chance to parry a close-range attack aimed at her.',
          hits: 1,
          power: 0.7,
          verb: 'slashes',
          line: '{n} slashes {e} with her Knife!',
          bleedTurns: 3,
          parryChance: 0.15,
          parryLine: '{n} parries with her Knife!',
          intro: { trollge: 'Mysti grips the Knife she once pulled out of Trollge.' },
        },
        armor: {
          name: 'BRAVO Team Uniform',
          doc: 'An elite uniform only meant for the best of the best, grants a general stat increase while neutral.',
          rules: 'All stats +10% while she isn’t AFRAID, CONFUSED, HAPPY or boosted.',
          neutralUp: 0.1,
        },
        skills: ['tacticalStab', 'exterminate', 'phantomClone', 'hiddenDocs'],
        passives: ['firstResponder', 'deitySwindler', 'balkanWarrior', 'needForRevenge'],
      },
    },

    // ------------------------------------------------------------------
    // SLASHERS
    // ------------------------------------------------------------------
    slashers: {
      trollge: {
        name: 'Trollge',
        title: 'TROLLGE',
        tags: ['[Umbra]', '[DEVASTATING]'],
        pronouns: { he: 'it', his: 'its', him: 'it' }, // doc: "a permanent grin on its face"
        stats: { atk: 110, def: 41, spd: 12, mag: 64, chm: 0, smt: 57, brv: 120 },
        health: 'Good',
        spiritualPower: 'Intact',
        morals: 'Very Low',
        exp: 300,
        maxHp: 4000,
        weakenedAt: 0.35,
        barelyStandingAt: 0.12,
        weakenedStun: 2,
        getsUpAnger: 20,
        anger: {
          start: 10,
          max: 100,
          perTurn: [4, 7],
          perDamage: 55, // it shrugs off wounds; being caught moving under its stare is what enrages it
          charmDivisor: 400,
          overflow: 80, // Slow Walker, Fast Runner
          atkBonusPerPoint: 0.005,
          wildAt: 90,
          wildChance: 0.2,
        },
        // Slow Walker, Fast Runner, from `anger.overflow`: SPEED 77 (doc: "Spd: 12 -> 77"). It moves
        // first, and so fast (`lap`) that it comes back around for a second attack after everyone.
        fastRunner: { spd: 77, lap: true },
        skills: ['staticStare', 'scratch'],
        passives: ['slowWalkerFastRunner', 'statokineticDissociation'],
        weapon: {
          name: 'Claws',
          doc: 'Kind of like SPEEDRUNNER’s but… Full of darkness and fears. Makes enemies feel AFRAID on hit.',
          afraidTurns: 2,
          braveryResist: 100, // BRAVERY over this can shrug the fear off: Mysti 50%, Captain Jim 22%
        },
        armor: {
          name: 'Trollface',
          doc: 'Not the prettiest thing; a permanent grin on its face definitely is unsettling… And heavy. And the large head wobbles on its skinny body.',
          unsettling: 110, // on turn 1, a worker is AFRAID with (110 - BRAVERY)% chance: Mel 30%, John 20%
        },
        // How often Trollge picks each move (weights). It re-rolls every turn.
        ai: {
          unseen: { claws: 50, stare: 50 }, // nobody is SEEN yet
          seen: { claws: 25, scratch: 60, stare: 15 },
        },
        claws: [
          { text: 'Trollge rakes {t} with its claws!', power: 0.85, crit: 0 },
          { text: 'Trollge’s stick arm whips across {t}!', power: 0.8, crit: 0.05 },
          { text: 'Trollge jabs its long claws at {t}!', power: 0.9, crit: 0 },
        ],
        scratchLines: ['Trollge scratches {t}! Its stick arms creak…', 'Trollge drags its claws down {t}!'],
        escapeOverflow: { label: 'Trollge is running fast', value: -10 },
        secret: 'EXTRA-SECRET: Trollge only sees what moves. Whoever GUARDS holds still: its claws mostly miss them, and its stare can’t catch them.',
        lines: {
          intro: 'A grin floats at the end of the hallway…',
          overflow: ['Trollge’s stick legs start twitching…', 'Slow Walker, Fast Runner! Trollge’s speed massively increases!'],
          overflowShort: 'FAST',
          calm: 'Trollge slows back down to a crawl.',
          barelyStanding: 'Trollge folds up on its stick legs!',
          dazed: 'Trollge’s head lolls around on its skinny neck…',
          blocksEscape: [
            'Trollge’s stick arm reaches across the hallway and blocks the way!',
            'Trollge is already standing in the doorway, grinning.',
            'The door won’t budge!',
          ],
        },
      },

      sid: {
        name: 'Sid',
        title: 'SID',
        tags: ['[Demon]', '[CONSIDERABLE]'],
        stats: { atk: 78, def: 59, spd: 34, mag: 0, chm: 8, smt: 30, brv: 100 },
        health: 'Unhealthy',
        spiritualPower: 'None',
        morals: 'None',
        exp: 100,
        maxHp: 2000,
        weakenedAt: 0.35, // "Sid is weakened! Now is your time for escape!"
        barelyStandingAt: 0.12,
        weakenedStun: 2, // actions Sid loses when he is first weakened
        getsUpAnger: 20, // ANGER Sid gains when he gets back up
        anger: {
          start: 20,
          max: 100,
          perTurn: [5, 8], // ANGER rises by itself every turn
          perDamage: 30, // +1 ANGER per this much damage taken (lowered by the attacker's CHARM)
          charmDivisor: 400, // attacker CHARM / this = share of that ANGER removed
          overflow: 80, // doc: "At 80 ANGER ..." (Overflowing ANGER)
          atkBonusPerPoint: 0.005, // "The higher the character's ANGER is, the stronger ... they become."
          wildAt: 90, // "... and sometimes less controllable"
          wildChance: 0.2,
          // Hyperceptive tells John "who the enemy will hit first": from this much ANGER on,
          // Sid follows his move with an extra basic attack every turn.
          frenzyAt: 60,
        },
        skills: ['jumboCookie', 'magdump', 'psychoticClaims'],
        passives: ['methAddict', 'overflowingAnger'],
        weapon: {
          name: 'Desert Eagle',
          doc: 'A heavy and hard-shooting gun that feels extra weak in Sid’s hands. Using this weapon as an ITEM will increase ANGER significantly (30 - 40) and increase the accuracy of “The Great Sid Magdump”.',
          onlyAtAnger: 80,
          itemAnger: [30, 40],
          magdumpAccuracyBonus: 0.25,
        },
        armor: {
          name: 'Cookie Monster’s Suit',
          doc: 'A rugged, bloodied, and worn-out suit once used for the Cookie Monster long ago. It’s hard to breathe in and lowers visibility.',
          hitRatePenalty: 0.1,
        },
        // How often Sid picks each move (weights). He re-rolls every turn.
        ai: {
          calm: { melee: 55, cookie: 16, claims: 15 }, // below 80 ANGER
          armed: { gun: 45, magdump: 35, deagle: 10, claims: 8 }, // 80+ ANGER
          cookieMinAnger: 25,
        },
        // Basic attacks. `power` multiplies ATK, `crit` adds to crit chance, `close` ones can
        // be parried (Mysti's Knife).
        melee: [
          { text: 'Sid bites {t}…', power: 0.75, crit: 0, close: true },
          { text: 'Sid slams {t} into a wall!', power: 0.9, crit: 0, close: true },
          { text: 'Sid throws {t} to the ground, and stomps!', power: 1.0, crit: 0.1, close: true },
          { text: 'Sid swipes at {t} with his matted claws!', power: 0.8, crit: 0, close: true },
        ],
        gunAttacks: [
          { text: 'Sid whips {t} with his gun!', power: 1.1, crit: 0.05, close: true },
          { text: 'Sid fires the Desert Eagle at {t}!', power: 1.0, crit: 0.05 },
        ],
        escapeOverflow: { label: 'Sid has his gun out', value: -5 },
        secret: 'EXTRA-SECRET: Sid can’t say no to a cookie. Below 80 ANGER he eats them to calm down… and anyone else eating one sets him off.',
        lines: {
          overflow: ['Sid has had enough, and draws his gun!'],
          overflowShort: 'DESERT EAGLE', // tag on the plate from 80 ANGER
          calm: 'Sid calms down and tucks the Desert Eagle away.',
          barelyStanding: 'Sid collapses to one knee!',
          dazed: 'Sid stares at {by} in confusion.',
          blocksEscape: ['Sid cuts off the escape route!', 'Sid blocks the way!', 'The door won’t budge!'],
        },
        claimsLines: [
          '“C IS FOR CRANIUM! THAT GOOD ENOUGH FOR ME!”',
          '“ME HEAR THE VENTS TALKING. VENTS SAY YOU TOOK ME COOKIE.”',
          '“ME NOT MONSTER. ME CERTIFIED. ME HAVE PAPERS.”',
          '“EVERYBODY KNOW MOON IS COOKIE. EVERYBODY. WHY YOU LYING.”',
          '“FRIENDS DON’T RUN. WHY YOU RUNNING. WE FRIENDS.”',
          '“ME COUNT YOUR FINGERS LATER. ME GOOD AT COUNTING.”',
        ],
      },
    },

    // ------------------------------------------------------------------
    // SKILLS  (cost = STAMINA for workers, SPIRIT for Purpl Lady)
    // ------------------------------------------------------------------
    skills: {
      // ---------------- MEL ----------------
      fuelCheck: {
        name: 'Fuel Skill Check',
        cost: 15,
        target: 'none',
        skillCheck: 'fuel',
        doc: 'Mel is put into a mini skill-check of pouring fuel into a generator; if done correctly, grants 10 CREDITS (20 with Cookie under effect) and slightly increases the teams’ DEFENSE. If he fails the skill check, the fuel canister will fall on his foot, dealing small damage as well as increasing ANGER of the slashers by 5% of their max.',
        rules: 'Timing mini-game. Hit: +10 credits (20 with Cookie), team DEF +15% for 3 turns. Miss: small damage to Mel, {e} ANGER +5.',
        credits: 10,
        creditsWithCookie: 20,
        teamDefUp: 0.15,
        turns: 3,
        failDamage: [8, 12],
        failAnger: 5,
      },
      tossGlasses: {
        name: 'Toss Glasses',
        cost: 10,
        target: 'enemy',
        doc: 'A surprisingly effective attack. Mel will throw his currently worn glasses at a chosen enemy, this will temporarily decrease his hit rate, until he re-equips extra glasses he is holding. (Using the skill again re-equips.) May cause bleeding to the enemy on impact, and drop glass shards at an enemy’s feet, damaging them when they act.',
        rules: 'Strong hit, 60% BLEED, GLASS SHARDS for 3 turns. Mel’s HIT RATE -30% until he uses it again to re-equip (free).',
        reequipName: 'Re-equip Glasses',
        power: 1.15,
        bleedChance: 0.6,
        bleedTurns: 3,
        shardsTurns: 3,
        shardsDamage: [10, 16],
        hitPenalty: 0.3,
      },
      melsPages: {
        name: 'Mel’s 8 Pages',
        cost: 30,
        target: 'enemy',
        doc: 'Find my pages. Lands 8 weak attacks on random targets, with a very high chance to land a critical hit, also ignores defense.',
        rules: '8 weak hits, 45% crit chance each, ignores DEF.',
        hits: 8,
        power: 0.14,
        critChance: 0.45,
        ignoreDef: true,
      },
      watermelonLob: {
        name: 'Watermelon Lob',
        cost: 40,
        target: 'everyone',
        doc: 'me lone :3. A highly lethal explosive device, damages everyone in battle equally.',
        rules: 'Everyone in battle (allies and Mel too) loses 30% of their max health. Ghosts are unaffected.',
        percent: 0.3,
      },

      // ---------------- JOHN ----------------
      capSlap: {
        name: 'Cap Slap',
        cost: 5,
        target: 'enemy',
        priority: 1,
        doc: 'A very weak and ineffective attack. Always goes first and deals more damage the more times the skill is used consecutively.',
        rules: 'Always acts first. Weak, but +60% damage for every consecutive use (max 6).',
        power: 0.3,
        streakBonus: 0.6,
        maxStreak: 6,
      },
      nap: {
        name: 'Nap',
        cost: 0,
        target: 'none',
        doc: 'He seems to really do this a lot. Naps for 1 - 2 turns, and slightly heals and lightly decreases ATTACK when waking up.',
        rules: 'Sleep 1-2 turns. On waking: small heal, STAMINA fully restored, ATK -10% for 2 turns.',
        turns: [1, 2],
        heal: 15,
        atkDown: 0.1,
        atkDownTurns: 2,
      },
      lunchBox: {
        name: 'John’s Lunch Box',
        cost: 20,
        target: 'otherAlly',
        doc: 'A fresh and well-designed Hello-Kitty lunch box, that he always loses. Heals significant damage from John and one other ally after 1 -3 turns.',
        rules: 'After 1-3 turns, heals John and the chosen ally a lot. John can act normally while he searches.',
        delay: [1, 3],
        heal: 55,
      },
      batteryCheck: {
        name: 'Battery Skill Check',
        cost: 20,
        target: 'none',
        skillCheck: 'battery',
        doc: 'John is put into a mini skill-check of applying a battery into a generator, if done correctly in the limited amount of time, creates an electrical shock to all enemies and slightly increases John’s ATTACK. If he fails the skill check, he will be shocked, dealing light damage to himself.',
        rules: 'Timing mini-game. Hit: shocks {e} (ignores half of its DEF), John ATK +15% for 3 turns. Miss: John takes light damage.',
        power: 1.2,
        defIgnore: 0.5,
        atkUp: 0.15,
        turns: 3,
        failDamage: [10, 15],
      },

      // ---------------- PURPL LADY ----------------
      seriousChills: {
        name: 'Serious Chills',
        cost: 30,
        target: 'enemy',
        doc: 'Even in death, you’re still causing problems!  Makes all enemies extremely cold, drastically decreasing defense and speed.',
        rules: '{e} is FREEZING: DEF -40% and SPD -40% for 3 turns.',
        defDown: 0.4,
        spdDown: 0.4,
        turns: 3,
      },
      shadowsHand: {
        name: 'A shadow’s hand',
        cost: 40,
        target: 'enemy',
        doc: 'Solidifying enough just to hit someone!  Deals massive damage to a single enemy, making them very confused.',
        rules: 'Massive MAGIC damage (ignores half of DEF). {e} is CONFUSED for 2 turns.',
        power: 2.0,
        defIgnore: 0.5,
        confuseTurns: 2,
      },
      foresight: {
        name: 'Foresight',
        cost: 15,
        target: 'none',
        doc: 'A friendly warning of inevitable death!  At the start of a turn, warns all members of the power of the upcoming enemy attack.',
        rules: 'For 3 turns, reveals how strong {e}’s next attack is. Warned workers take 15% less damage.',
        turns: 3,
        braced: 0.15,
      },
      phaseForItems: {
        name: 'Phase for ITEMS',
        cost: 20,
        target: 'none',
        doc: 'Isn’t this basically cheating?  Takes a few turns and looks for items. (Very small chance to gain any Uncommon and rarer item.) After successfully finding something, grant items to the team.',
        rules: 'Leaves for 2-3 turns (her passives pause), then brings back 1-2 items. 10% chance per item to be Rare.',
        turns: [2, 3],
        finds: [1, 2],
        nothingChance: 0.15,
        rareChance: 0.1,
      },

      // ---------------- CAPTAIN JIM ----------------
      proxyLocator: {
        name: 'Proxy Locator',
        cost: 10,
        target: 'none',
        toggle: true,
        offName: 'Switch off Proxy Locator',
        doc: 'An obsolete piece of equipment used once by SlashCo Exterminator teams. At the start of a turn, has a small chance to gain a random item, but also makes NOISE, ANGERING enemies often.',
        rules: 'Switch it on (free to switch off). While on, at the start of every turn: 20% chance to find an item, 60% chance of NOISE ({e} ANGER +6).',
        findChance: 0.2,
        noiseChance: 0.6,
        noiseAnger: 6,
      },
      matthewsAid: {
        name: 'Matthew’s AID',
        cost: 25,
        target: 'none',
        doc: 'Man I hate that four-eyes kid. Slightly raises all stats for every ally in battle.',
        rules: 'Every ally: all stats +15% for 3 turns.',
        allUp: 0.15,
        turns: 3,
      },
      confidentialDocs: {
        name: 'Confidential Documents',
        cost: 15,
        target: 'none',
        oncePerBattle: true,
        doc: 'Collect information about the current enemy being fought. Once per battle, works on all enemies.',
        rules: 'Once per battle. Shows {e}’s exact health and ANGER and how hard every planned attack will hit, for the rest of the battle. Knowing its weak spots: team crit chance +10%.',
        critUp: 0.1,
      },
      bearTrap: {
        name: 'Bear Trap',
        cost: 20,
        target: 'ally',
        doc: 'Set a bear trap at the feet of any ally, if they are targeted by a physical attack, deals large damage to the enemy, and renders them momentarily vulnerable,',
        rules: 'Lasts 4 turns. When {e} goes for that ally with a physical attack, the trap snaps first: large damage, the attack is stopped, and {e} is VULNERABLE (DEF -50%) for 2 turns.',
        damage: [130, 170],
        vulnerable: 0.5,
        vulnerableTurns: 2,
        turns: 4,
      },
      helicopterEscape: {
        name: 'Helicopter Escape',
        cost: 70,
        target: 'none',
        oncePerBattle: true,
        doc: 'The chopper is touchdown, let’s get out of here! Significantly increases all ally’s EVASION and DEFENSE,  and guarantees an escape from a fight in 5 turns.',
        rules: 'Once per battle. Every ally: DEF +40% and EVASION +25% until the chopper lands. After 5 turns it touches down and everyone gets out, bodies included, as long as someone who can carry a body is still alive.',
        defUp: 0.4,
        evaUp: 0.25,
        turns: 5,
      },
      zingerBurger: {
        name: 'Zinger Burger',
        cost: 20,
        target: 'none',
        doc: 'Would you bounce on it for a Zinger Burger? ‘Cuz me go boing-boing!  Significantly heals Captain Jim, and makes him HAPPY.',
        rules: 'Big heal for Captain Jim, and he is HAPPY for 3 turns: SPEED +25%, crit chance +10%, HIT RATE -10%.',
        heal: 60,
        happyTurns: 3,
        happySpd: 0.25,
        happyCrit: 0.1,
        happyHit: -0.1,
      },

      // ---------------- MYSTI ----------------
      tacticalStab: {
        name: 'Tactical Stab',
        cost: 35,
        target: 'enemy',
        doc: 'Extremely effective against Trollge. Deals massive damage to the target, and causes bleeding, decreases defense, ignores defense, and deals damage equal to 5% of the enemy’s current health.',
        rules: 'Massive damage that ignores DEF (x1.5 against Trollge), plus 5% of {e}’s current health. {e} BLEEDS, and its DEF drops 25% for 3 turns.',
        power: 1.0,
        strongVs: { trollge: 1.5 },
        currentHp: 0.05,
        bleedTurns: 3,
        defDown: 0.25,
        turns: 3,
      },
      exterminate: {
        name: 'Exterminate',
        cost: 35,
        target: 'enemy',
        doc: 'We’re not playing anymore games… Gulp. Has a very small chance to instantly eliminate an enemy, but leaves you vulnerable for an extra turn after.',
        rules: 'A heavy strike with an 8% chance to drop {e} straight to BARELY STANDING (slashers can’t be killed). Mysti is VULNERABLE (takes +50% damage) this turn and next.',
        power: 0.9,
        chance: 0.08,
        exposedTurns: 1,
        exposedDamage: 0.5,
      },
      phantomClone: {
        name: 'Bababooey’s Phantom Clone Extract',
        short: 'Phantom Clone Extract', // for the skills menu
        cost: 20,
        target: 'none',
        oncePerBattle: true,
        doc: 'Just a droplet of this will make you want to vanish. Massively increases EVASION for a good number of turns, and significantly increases SPEED for the rest of the game. (Used once per battle.)',
        rules: 'Once per battle. Mysti: EVASION +45% for 4 turns, SPEED +40% for the rest of the battle, and {e} loses track of her (no longer SEEN).',
        evaUp: 0.45,
        evaTurns: 4,
        spdUp: 0.4,
      },
      hiddenDocs: {
        name: 'Hidden Documents',
        cost: 15,
        target: 'none',
        oncePerBattle: true,
        doc: 'Attempts to collect extra-secret information about the current enemy being fought. Once per battle, works on all enemies. Grants extra EXP and CREDITS after battle if done.',
        rules: 'Works 85% of the time (try again if it doesn’t). Shows {e}’s exact health and ANGER, and one extra-secret weakness. After a win: +20 CREDITS and +50% EXP.',
        chance: 0.85,
        credits: 20,
        expBonus: 0.5,
      },

      // ---------------- TROLLGE ----------------
      staticStare: {
        name: 'Static Stare',
        doc: 'The scariest experience of someone’s life. Stare at an enemy… If they move by any means, anger increases by 20. And marks the enemy with SEEN.',
        angerUp: 20,
        seenTurns: 3, // SEEN lasts this many turns
      },
      scratch: {
        name: 'Scratch',
        doc: 'Not too easy on those stick arms, but does dangerous amounts of damage. Can only hit SEEN enemies.',
        power: 1.5,
        crit: 0.05,
      },

      // ---------------- SID ----------------
      jumboCookie: {
        name: 'Sid’s JUMBO Cookie',
        doc: 'A large cookie, but the sugar content seems to be replaced with METH… Drastically increases attack for a short number of turns, and decreases anger by 15.',
        priority: 1,
        atkUp: 0.5,
        turns: 3,
        angerDown: 15,
      },
      magdump: {
        name: 'The Great Sid Magdump',
        doc: 'Shoots 1 to 9 bullets at all enemies; low accuracy, low damage. He seems to have an endless amount of bullets…',
        bullets: [1, 9],
        power: 0.35,
        accuracy: 0.45,
      },
      psychoticClaims: {
        name: 'Psychotic Claims',
        doc: 'Throws a bunch of psychotic nonsense at the enemy, causing them to either be AFRAID or confused. Increases ANGER by 20% and decreases overall stats of the enemy by a slight amount.',
        angerUp: 20,
        statDown: 0.1,
        turns: 3,
        statusTurns: 2,
        resistPerBravery: 1 / 200, // BRAVERY 90 = 45% chance to shrug it off
      },
    },

    // ------------------------------------------------------------------
    // PASSIVES
    // ------------------------------------------------------------------
    passives: {
      // MEL
      uncleSink: {
        name: 'Uncle Sink',
        doc: 'A god amongst men fears no drink, not even a seemingly empty one. Grants the ability to consume glass bottle items for slight healing.',
        heal: 12,
      },
      athlete: {
        name: 'Athlete',
        doc: 'You did some casual track back in high school. At the start of battle, SPEED increases by a large number for a short amount of time.',
        spdUp: 0.6,
        turns: 3,
      },
      aliveHard: {
        name: 'Alive Hard',
        doc: 'You’re one of the few people who knows when and where to panic. Treasure this reflex. Grants Mel the ability to survive an attack that WOULD kill him while at 50% health or higher. Doesn’t work below 50% health.',
        threshold: 50,
      },
      batterUp: {
        name: 'Batter Up',
        doc: 'You’re a fiesty little guy. Probably were a bully in high school. Shame on you. Using POCKET SAND on an enemy grants some CREDITS, and increases Mel’s ATTACK and SPEED for a short while.',
        credits: 10,
        atkUp: 0.25,
        spdUp: 0.25,
        turns: 3,
      },
      // JOHN
      hyperceptive: {
        name: 'Hyperceptive',
        doc: 'You’re a naturally jumpy person, it seems. Calm those nerves, son… At the start of a turn, John is notified who the enemy will hit first.',
      },
      speedAddict: {
        name: 'Speed Addict',
        doc: 'You know what they say about trying to run in your dreams?  John’s SPEED can never be decreased, but effects that increase SPEED are 25% less effective.',
        boostScale: 0.75,
      },
      shadowborn: {
        name: 'Shadowborn',
        doc: 'After staying up all night for so damn long your eyes must surely be used to the darkness by now. Increases HIT RATE, darkness does not affect HIT RATE.',
        hitBonus: 0.1,
      },
      solidJohn: {
        name: 'Solid John',
        doc: 'If you show off that diamond-cutting jawline, no one will want to mess with you. The first time John GUARDS, he takes no damage, and increases attack based on how many times he was targeted.',
        atkPerTarget: 0.05,
        maxAtk: 0.4,
      },
      // PURPL LADY
      ghostBody: {
        name: 'Ghost Body',
        doc: 'Don’t think being a ghost is all that cool. You cannot attack, defend others, use items, or pick dead allies up. Sorry, man.',
      },
      freakyDoctor: {
        name: 'Freaky Doctor',
        doc: 'Your strange machinations benefit the team, but hurt your own wellbeing. While active in team, grants minor damage resistance, extra healing, extra credit gain, increased attack, and a single use second-life mechanic.',
        rules: 'While she is here and has SPIRIT: workers take -10% damage, heal +25%, earn +50% credits, ATK +10%, and the first worker to die comes back once. Costs her 3 SPIRIT a turn, and her SPIRIT only comes back when she FOCUSES.',
        damageTaken: 0.9,
        healing: 1.25,
        credits: 1.5,
        atk: 0.1,
        reviveHp: 30,
        drain: 3,
      },
      moralSupport: {
        name: 'Moral Support',
        doc: 'You could put some real work into it… But okay. John and Mel’s skill checks are much easier.',
        zoneScale: 1.6,
      },
      possession: {
        name: 'Possession',
        doc: 'Even I think this is too far . When the slasher is weakened, you will automatically possess a random dead ally (if any) in order to help escape without others needing to carry them.',
      },
      // CAPTAIN JIM
      stealthCamo: {
        name: 'Stealth Camo',
        doc: 'Oh yeah. You were an airsoft kid, weren’t you? Jackpot. Enemies do not target you as often, and guarding makes you never get targeted. (Does not avoid area attacks.)',
        targetWeight: 0.35,
      },
      grouchBehavior: {
        name: 'Grouch Behavior',
        doc: 'THIS IS MY LOCKER, IT WAS MADE FOR ME!!!  Guarding will grant passive moderate healing to you.',
        heal: 25,
      },
      fullBloodAussie: {
        name: 'Full Blood Aussie',
        doc: 'As someone who deals with worse conditions, you’ve gotten used to these encounters. Take reduced overall damage, actions you commit anger the enemy less, items have greater effects on you.',
        damageTaken: 0.85,
        angerCaused: 0.5,
        itemBoost: 1.3,
      },
      // MYSTI
      firstResponder: {
        name: 'First Responder',
        doc: 'Things can get pretty dire out there. Luckily, your team has you! Right...?  The first time any team member reaches CRITICAL health, immediately heals them to SCATHED health. (Once per team member, doesn’t include self.)',
        healTo: 50,
      },
      deitySwindler: {
        name: 'Deity Swindler',
        doc: 'THESE are the forces you are choosing to mess with? Didn’t Mauser warn you?  Grants the ability to apply the DEATHWARD item as a group death protection for a short number of turns.',
      },
      balkanWarrior: {
        name: 'Balkan Warrior',
        doc: 'Biće snijega jedanaestog dana ushićenja. Ne zaboravite da spakujete svoje stvari i skuvate ih srednje pečenja. The after effects of the Balkan boost no longer cripple you.',
      },
      needForRevenge: {
        name: 'Need For Revenge',
        doc: 'I remember what you did to me. When facing The Watcher, she will only be able to target him. Causes her to face permanent ANGER, and greatly increases ATTACK.',
        rules: 'Only against The Watcher, who isn’t in this fight.',
      },
      // TROLLGE
      slowWalkerFastRunner: {
        name: 'Slow Walker, Fast Runner',
        doc: 'At 80 ANGER or higher, massively increases SPEED and marks a random enemy as SEEN once per turn.',
      },
      statokineticDissociation: {
        name: 'Statokinetic Dissociation',
        doc: 'When attacking with basic attacks, hit rate is heavily decreased when an enemy hasn’t acted yet.',
        rules: 'Its Claws hit a worker who hasn’t moved this turn (hasn’t acted yet, or GUARDED) at a third of the usual HIT RATE.',
        hitMult: 0.35,
      },
      // SID
      methAddict: {
        name: 'METH Addict',
        doc: 'Anyone who eats Sid’s JUMBO Cookie while Sid is in battle will cause Sid’s ANGER to rise by 35.',
        anger: 35,
      },
      overflowingAnger: {
        name: 'Overflowing ANGER',
        doc: 'At 80 ANGER, Sid will no longer be able to consume any item, including Cookies. He will also equip his Desert Eagle and use it as a basic attack for extra damage.',
      },
    },

    // ------------------------------------------------------------------
    // ITEMS  (shared team bag, like OMORI snacks)
    // ------------------------------------------------------------------
    items: {
      royalBurger: {
        name: 'Royal Burger',
        rarity: 'Common',
        price: 10,
        doc: 'A burger for The King.',
        inBattle: 'Heals Moderate Damage',
        target: 'ally',
        heal: 45,
      },
      cookie: {
        name: 'Cookie',
        rarity: 'Common',
        price: 15,
        doc: 'A jumbo-sized chocolate chip cookie. Its sugar seems to have been substituted with crystal methamphetamine.',
        inBattle: 'Heals light Damage, increases ATTACK slightly.',
        warning: 'Sid is a METH Addict: eating this raises his ANGER by 35!',
        warnIf: 'methAddict', // only shown when the slasher has it
        target: 'ally',
        heal: 20,
        atkUp: 0.15,
        turns: 3,
      },
      mayonnaise: {
        name: 'Mayonnaise',
        rarity: 'Rare',
        price: 20,
        article: '', // "Mel gives John Mayonnaise."
        doc: 'A jar of strangely highly caloric mayonnaise. It is suspected to contain Uranium.',
        inBattle: 'Heals massive damage to the user. Very small chance to cause Uranium poisoning.',
        target: 'ally',
        heal: 90,
        poisonChance: 0.05,
        poisonDamage: 6,
        poisonTurns: 3,
      },
      orangeJello: {
        name: 'Orange Jello',
        rarity: 'Rare',
        price: 20,
        doc: 'Nope, this is DEFINITELY laced. You don’t just take a cup of mystery jello from a crackhead and expect simply a tasty treat.',
        inBattle: 'Heals light damage to the user. Greatly increases defense for a small amount of turns.',
        target: 'ally',
        heal: 20,
        defUp: 0.6,
        turns: 2,
      },
      beerKeg: {
        name: 'Beer Keg',
        rarity: 'Rare',
        price: 20,
        doc: 'An extremely unstable explosive device, with the ability to completely incapacitate small dogs. Once armed and released, cover your ears and watch the fireworks!',
        inBattle: 'Deals massive explosion damage to all enemies, and damages the user too.',
        target: 'enemy',
        damage: [140, 180],
        selfDamage: [15, 25],
      },
      masterLock: {
        name: 'Master Lock 607',
        rarity: 'Common',
        price: 5,
        doc: 'This is a Master Lock Model 607. With some decent swing force and a bit of elbow grease it can smack open just about any closed door lock, and can itself be opened with a Master Lock Model 607.',
        inBattle: 'Does nothing.',
        target: 'none',
        keep: true, // it does nothing, so it is never used up
      },
      // Not in the ITEMS list, but the doc uses both (Batter Up, and the battle dialogue example),
      // so their text is written here (`desc`) rather than copied (`doc`).
      pocketSand: {
        name: 'Pocket Sand',
        rarity: 'Common',
        price: 5,
        desc: 'Sand. In a pocket. For throwing into eyes.',
        inBattle: 'Blinds {e} (HIT RATE -40%) for 2 turns. Mel’s Batter Up turns it into CREDITS, ATTACK and SPEED.',
        target: 'enemy',
        blind: 0.4,
        turns: 2,
        anger: 5,
      },
      balkanBoost: {
        name: 'Balkan Boost',
        rarity: 'Rare',
        price: 20,
        glassBottle: true,
        desc: 'An unlabeled glass bottle. The after effects are said to be crippling.',
        inBattle: 'Kicks in next turn: all stats +60% for 3 turns, but the drinker can’t calm down and attacks on their own. Then all stats -25% for 2 turns. Leaves an Empty Bottle.',
        target: 'ally',
        boost: 0.6,
        boostTurns: 3,
        crash: 0.25,
        crashTurns: 2,
      },
      // Gives Mel's Uncle Sink ("not even a seemingly empty one") something to drink.
      emptyBottle: {
        name: 'Empty Bottle',
        rarity: 'Common',
        price: 0,
        glassBottle: true,
        desc: 'A seemingly empty glass bottle. Seemingly.',
        inBattle: 'Only someone with Uncle Sink can drink from it: slight healing.',
        target: 'self',
        needsPassive: 'uncleSink',
        needsVerb: 'drink',
      },
      // Mysti's Deity Swindler: "apply the DEATHWARD item as a group death protection".
      deathward: {
        name: 'DEATHWARD',
        rarity: 'Rare',
        price: 0,
        desc: 'Group death protection, swindled from forces nobody should be messing with.',
        inBattle: 'Only someone with Deity Swindler can apply it. For 3 turns, a blow that would kill any worker leaves them at 1 health instead.',
        target: 'self',
        needsPassive: 'deitySwindler',
        needsVerb: 'apply',
        turns: 3,
      },
    },

    startingBag: {
      royalBurger: 2,
      cookie: 2,
      mayonnaise: 1,
      orangeJello: 1,
      pocketSand: 2,
      beerKeg: 1,
      balkanBoost: 1,
      emptyBottle: 1,
      masterLock: 1,
      deathward: 1,
    },

    // Items Purpl Lady can bring back from Phase for ITEMS.
    phaseLoot: {
      common: ['royalBurger', 'cookie', 'pocketSand', 'masterLock'],
      rare: ['mayonnaise', 'orangeJello', 'beerKeg', 'balkanBoost'],
    },

    // ------------------------------------------------------------------
    // ESCAPE — the only way to win. Everything is in percent.
    // ------------------------------------------------------------------
    escape: {
      base: 3,
      perHealthLost: 40, // +40% spread over the slasher losing all its health
      weakened: 15, // the slasher at or below `weakenedAt`
      stunned: 25, // the slasher can't move this turn
      chilled: 5,
      confused: 5,
      blind: 5,
      // (each slasher's `escapeOverflow` applies from its overflow ANGER: Sid's gun, Trollge's run)
      speedPerPoint: 0.25, // per point of (team average SPD - slasher SPD)
      speedMin: -15,
      speedMax: 15,
      perCarried: 12, // "decreases escape chance"
      carrySpeed: 0.6, // carrier SPEED x0.6 per body ("lowers their speed")
      perFailedTry: 5, // each failed attempt makes the next one easier
      min: 0,
      max: 95,
      reward: 20, // doc example: "The group receives 20 credits."
    },

    // ------------------------------------------------------------------
    // GENERAL BATTLE TUNING
    // ------------------------------------------------------------------
    balance: {
      variance: [0.85, 1.15],
      baseHit: 0.95,
      evasionPerSpd: 0.0025, // per point the defender is faster than the attacker
      critBase: 0.03,
      critPerSmarts: 0.0006, // SMARTS 100 = +6% crit
      critMult: 1.75,
      guard: 0.5,
      guardRestore: 20, // STAMINA/SPIRIT regained by guarding
      regen: 6, // STAMINA/SPIRIT regained every turn
      basicPower: 0.6,
      afraidSkip: 0.35,
      afraidDef: 0.15,
      confusedSkip: 0.35,
      enemyConfusedFumble: 0.3,
      bleedPercent: 0.025, // of the slasher's max health per turn
      skillCheck: { baseZone: 0.16, perSmarts: 0.0008, sweepMs: 950, timeLimitMs: 2800 },
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
