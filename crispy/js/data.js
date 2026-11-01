/*
 * Everything you'd want to tune about Crispy's birthday battle: his stats, skills, items and
 * acts, and the creature's stages, from the stats doc ("Father Stats"). Shared by the game and
 * the headless test (tests/simulate.js).
 */
(function (root) {
  const DATA = {
    hero: {
      name: 'Crispy Soto',
      short: 'Crispy',
      lv: 99,
      // doc: Atk 134 | Def 85 | Spd 68 | Mag 17 | Chm 100 | Smt 99 | Brv 81
      stats: { atk: 134, def: 85, spd: 68, mag: 17, chm: 100, smt: 99, brv: 81 },
      hp: 280,
      sp: 100, // SPIRITUAL POWER pays for his skills
      spPerRound: 4,
      accuracy: 0.95,
      // When his health runs out the first time, the will to protect his family brings him back.
      willpower: { heal: 0.3, def: 1.7, turns: 5 }, // ...and his defense rises sharply
      // Hard Foam Buster Sword: "Has a small chance to block an incoming attack and take no damage!"
      blockChance: 0.1,
    },

    // Health words, as on SlashCo VR's HUD, by percent of his health.
    health: [
      { id: 'CRITICAL', upTo: 20 },
      { id: 'HURT', upTo: 40 },
      { id: 'SCATHED', upTo: 60 },
      { id: 'STABLE', upTo: 80 },
      { id: 'OK', upTo: 100 },
    ],
    // The creature's condition, by percent of its health.
    foeHealth: [
      { id: 'BARELY STANDING', upTo: 15 },
      { id: 'WEAKENED', upTo: 35 },
      { id: 'WOUNDED', upTo: 55 },
      { id: 'BRUISED', upTo: 80 },
      { id: 'GOOD', upTo: 100 },
    ],

    // FIGHT
    attack: { name: 'ATTACK', power: 1.0, sp: 6, doc: 'A swing of the Hard Foam Buster Sword. Not real, but pretty heavy. (+6 SP)' },

    // SKILL: Crispy's skills, from the doc.
    skills: [
      {
        id: 'trash',
        name: 'Trash Bag',
        sp: 12,
        power: 1.25,
        tear: 0.45, // chance the bag tears...
        tearPower: 0.35, // ...and its garbage lightly damages the creature
        poison: { turns: 3, perTurn: 0.05 }, // of its health, each turn
        doc: 'Only a true Sanitation worker can use this as a weapon. Deals damage to one target. When hitting, has a chance to tear, lightly damaging the enemy again and poisoning it.',
      },
      {
        id: 'early',
        name: 'Early Bird',
        sp: 20,
        self: { atk: 1.5, spd: 0.9, turns: 4 },
        foe: { atk: 0.85, def: 0.85, turns: 3 },
        doc: "There's always an advantage to waking up first. Heavily increases own attack and slightly decreases speed. Decreases the enemy's attack and defense as well.",
      },
      {
        id: 'authority',
        name: 'Authority',
        sp: 15,
        target: true, // pick: himself (clear his negative effects) or the creature (clear its positive ones)
        doc: 'What he says, goes. Nullifies all negative effects on yourself, or clears all positive effects on the enemy.',
      },
      {
        id: 'rg',
        name: 'RG 405M',
        sp: 30,
        power: 1.6, // electrical: from his attack and his magic, and it gets through armour
        disarm: { chance: 0.4, turns: 2 },
        doc: 'The world altering handheld console. Deals major electrical damage to all enemies, and could potentially disarm them for a while.',
      },
      {
        id: 'wine',
        name: 'Wine Break',
        sp: 0,
        restoreSp: 0.3,
        heal: 0.1,
        self: { smt: 0.75, atk: 0.9, turns: 2 },
        doc: 'Everyone needs some time to heal up... Kind of. Restores 30% spiritual power and 10% health. But slightly decreases smarts and attack for a little bit.',
      },
      {
        id: 'slice',
        name: 'Crispy Slice',
        sp: 15,
        power: 0.9,
        cut: 0.88, // the target's attack, defense and magic, for the rest of the battle
        stacks: 2,
        doc: "A signature move that I made up. Slightly decreases the target's attack, defense, and magic for the rest of the battle. Can stack twice...",
      },
      {
        id: 'taste',
        name: 'Taste of Reality',
        sp: 30,
        once: true,
        turns: 3,
        mult: 3,
        doc: 'That fake sword will turn real for a while, dealing triple the casual damage for 3 turns. Can only be used once per battle.',
      },
    ],

    // SPECIAL: only when he's at half health or less, and up to twice in one turn.
    special: {
      id: 'nut',
      name: 'NUTCRACKAAAA!!!',
      sp: 30,
      power: 1.7,
      below: 0.5,
      perTurn: 2,
      crit: { chance: 0.4, mult: 2.5 }, // "medium chance to land a fatal critical hit"
      ko: 0.03, // "small chance to instantly K.O the enemy"
      foe: { def: 0.6, mag: 0.6, turns: 2 }, // "drastically decreases defense and magic"
      doc: 'The most deadly attack in all of history. Medium chance to land a fatal critical hit, small chance to instantly K.O. the enemy. Drastically decreases the defense and magic of the enemy for 2 turns. (Only at half health or less; twice per turn.)',
    },

    acts: [
      { id: 'check', name: 'Check', free: true, doc: "Look at it. Really look. (Doesn't use up his turn.)" },
      {
        id: 'talk',
        name: 'Talk',
        foe: { atk: 0.85, turns: 2 },
        mercy: [2, 3, 4, 6, 8], // by stage: the more human it gets, the more it listens
        doc: 'Say something to it. The more human it gets, the more it listens. (MERCY up a little)',
      },
      {
        id: 'lights',
        name: 'Turn the lights brighter',
        chance: 0.75,
        turns: 3,
        foe: { acc: 0.8, def: 0.8 },
        doc: 'Reach for the dimmer. It hates being seen. (Its defense and aim drop while the lights are up.)',
      },
      {
        id: 'stance',
        name: 'Take a fearless stance',
        turns: 3,
        self: { def: 1.3, atk: 1.1 },
        doc: "Plant your feet. Nothing gets past you. (Defense up, attack up a little, and you can't be scared.)",
      },
      {
        // It wants his life. Each time, he shows it a bit more of what that life costs, and it
        // slowly loses interest. The ACT changes every time he uses it; once he's shown it
        // enough, MERCY keeps creeping up by itself each round (`trickle`, by steps done).
        id: 'show',
        name: 'Show it who he is',
        steps: [
          { name: 'Show it the photos', fx: 'photos', mercy: 4, doc: 'Point at the family photos on the wall. Show it whose house this is.' },
          { name: 'Say their names', fx: 'names', mercy: 5, doc: 'Veranda. Justin. Erik. Make sure it knows exactly who it would have to get through.' },
          { name: 'Tell it about 4 AM', fx: 'fourAm', mercy: 6, doc: 'Tell it what time he gets up. Every day.' },
          { name: 'Show it his hands', fx: 'hands', mercy: 7, doc: 'Every can, on every route. It wants this life? Show it what it costs.' },
          { name: 'Don’t blink', fx: 'noBlink', mercy: 8, doc: 'Stare it down.' },
          { name: 'Hold the line', fx: 'hold', mercy: 4, doc: 'Stay right where he is, in its way. Again.' },
        ],
        trickle: [0, 0, 0, 1, 1, 1], // MERCY each round, by how many steps he's shown it
        doc: '(MERCY up a little, and a different ACT each time. After a few, MERCY keeps creeping up on its own.)',
      },
      { id: 'door', name: 'Open the front door', mercy: 10, doc: 'Prop the front door open and show it the way out. (MERCY up a little, once. It also makes getting the family out, and running, safer.)' },
      {
        id: 'family',
        name: 'Get the family out',
        door: 0.1, // an open front door: a better chance to get each of them past it
        hunting: { atk: 1.3, turns: 2 }, // if it hears them
        caught: 1.3, // ...it goes for them, and Crispy takes the hit in their place
        doc: 'Text the next one, and get them out to the car without it hearing. (A sure thing while the car alarm or the lights cover it; an open front door helps.) Once all three are out, he can FLEE.',
      },
    ],
    // MERCY: at 100 it's lost interest, and will take a truce (SPARE). Hurting it costs some
    // back; the higher it is, the more often it can't be bothered to attack.
    mercyRules: { full: 100, hurt: 12, sting: 6, hesitate: 0.0012, spareTry: 5 }, // spareTry: each SPARE before it's ready
    // Who Crispy gets out, in order, and how likely each is to get past it unheard.
    family: [
      { name: 'Veranda', pron: 'her', who: 'his wife', where: 'upstairs', chance: 0.55 },
      { name: 'Justin', pron: 'him', who: 'his son', where: 'the basement', chance: 0.45 },
      { name: 'Erik', pron: 'him', who: 'his younger son', where: 'his room upstairs', chance: 0.4 },
    ],

    items: [
      { id: 'choc', name: '70% Dark Chocolate', count: 3, heal: 0.22, doc: 'Bittersweet. Heals lightly.' },
      { id: 'cheese', name: 'Grilled Cheese', count: 2, heal: 0.45, self: { def: 1.25, turns: 3 }, doc: 'Golden and gooey. Heals significantly and increases defense.' },
      { id: 'pills', name: 'Allergy Pills', count: 2, self: { atk: 1.2, spd: 1.3, acc: 1.15, turns: 4 }, doc: 'Non-drowsy. Increases attack, speed, and accuracy.' },
      {
        id: 'speaker',
        name: 'Speaker',
        count: 1,
        turns: 3, // how long the song plays
        aim: 0.8, // the music distracts it
        shield: 0.5, // its hits on Crispy, while the music plays
        smash: 0.3, // the chance, each of its turns, that it goes for the speaker instead
        doc: 'Turn it all the way up. For 3 turns the music distracts it (its aim drops), its hits on Crispy are halved, and anyone he gets out is sure to make it. It might go for the speaker instead.',
      },
      { id: 'keys', name: 'Car Keys', count: 1, alarm: 2, doc: 'Starts the car alarm, momentarily distracting the creature (and covering any noise for a moment). One time use.' },
    ],

    mercy: [
      { id: 'flee', name: 'FLEE', doc: 'Run.' },
      { id: 'spare', name: 'SPARE', doc: 'Show it mercy.' },
    ],
    // a parting swipe as he runs, if the door's shut and it isn't distracted
    fleeHit: 0.6,

    // ------------------------------------------------------------------ THE CREATURE
    // "ADJUST - To look like them. To look LIKE YOU. Transforms to the follow-up stage. Changing
    // STATS and appearance." It adjusts with time (its `adjustOn`-th turn in a stage), or the
    // moment a stage's health runs out. Only Andy can be killed. On a timed ADJUST the new body
    // keeps the old one's wounds (the same fraction of its health).
    foe: {
      name: 'The Creature',
      adjustOn: 3,
      health: { Moderate: 200, High: 270, Extreme: 440 },
      stages: [
        {
          name: 'The Creature',
          tag: 'Stage 1',
          // doc: Atk 120 | Def 168 | Spd 12 | Mag 0 | Chm 0 | Smt 40 | Brv 100 | Health: Moderate
          stats: { atk: 120, def: 168, spd: 12, mag: 0, chm: 0, smt: 40, brv: 100 },
          health: 'Moderate',
          moves: [
            { id: 'claw', w: 4 },
            { id: 'reach', w: 3 },
            { id: 'bite', w: 2 },
            { id: 'screech', w: 2 },
            { id: 'flicker', w: 2 },
            { id: 'twitch', w: 1 },
          ],
        },
        {
          name: 'The Creature',
          tag: 'Stage 2',
          stats: { atk: 110, def: 154, spd: 24, mag: 0, chm: 4, smt: 60, brv: 100 },
          health: 'Moderate',
          moves: [
            { id: 'claw', w: 3 },
            { id: 'lash', w: 3 },
            { id: 'bile', w: 2 },
            { id: 'scream', w: 2 },
            { id: 'reach', w: 2 },
            { id: 'lure', w: 2 },
          ],
        },
        {
          name: 'The Creature',
          tag: 'Stage 3',
          stats: { atk: 100, def: 143, spd: 48, mag: 0, chm: 16, smt: 70, brv: 100 },
          health: 'High',
          moves: [
            { id: 'lash3', w: 3 },
            { id: 'claw', w: 2 },
            { id: 'drop', w: 2 },
            { id: 'weep', w: 2 },
            { id: 'lengthen', w: 2 },
            { id: 'flicker', w: 2 },
          ],
        },
        {
          name: 'The Creature',
          tag: 'Stage 4',
          stats: { atk: 95, def: 133, spd: 96, mag: 0, chm: 32, smt: 80, brv: 100 },
          health: 'High',
          moves: [
            { id: 'rake', w: 3 },
            { id: 'lunge', w: 3 },
            { id: 'drop', w: 2 },
            { id: 'lure', w: 2 },
            { id: 'stare', w: 2 },
            { id: 'harden', w: 2 },
          ],
        },
        {
          name: 'Andy',
          tag: '',
          stats: { atk: 80, def: 122, spd: 192, mag: 0, chm: 64, smt: 120, brv: 120 },
          health: 'Extreme',
          final: true,
          followUp: 0.22, // so fast it sometimes goes again
          moves: [
            { id: 'mimic', w: 3 },
            { id: 'grab', w: 3 },
            { id: 'smile', w: 2 },
            { id: 'pat', w: 2 },
            { id: 'joke', w: 2 },
            { id: 'lock', w: 2 }, // only while the front door is open
          ],
        },
      ],
      // Andy's Mimic: he does whatever Crispy did last. An attack comes back at Crispy (darker);
      // anything that helped Crispy helps Andy, just as much. (Anything he can't copy: a swing.)
      mimic: {
        attack: { power: 1.05, acc: 0.92, line: 'Andy copies Crispy’s swing, with a sword of his own. A dark one.' },
        trash: { power: 1.2, acc: 0.9, line: 'Andy swings a trash bag of his own at Crispy. It’s darker. Wetter.' },
        slice: { power: 0.9, acc: 0.95, debuff: { atk: 0.88, def: 0.88, turns: 3 }, label: 'SLICED', line: 'Andy does the Crispy Slice. Crispy’s own move, on Crispy.' },
        rg: { power: 1.3, acc: 0.85, line: 'Andy holds up a console just like Crispy’s. Its screen is black.' },
        nut: { power: 1.45, acc: 0.85, line: 'Andy screams "NUTCRACKAAAA!!!" in Crispy’s voice.' },
        early: { self: { atk: 1.5, turns: 4 }, debuff: { atk: 0.85, def: 0.85, turns: 3 }, label: 'EARLY BIRD', line: 'Andy sets an alarm clock of his own. He was up before Crispy.' },
        authority: { cleanse: true, line: 'Andy puts his foot down. What HE says, goes.' },
        wine: { heal: 0.1, self: { atk: 0.9, turns: 2 }, label: 'TIPSY', line: 'Andy pours himself a glass of Crispy’s wine.' },
        taste: { self: { atk: 1.6, turns: 3 }, label: 'REAL', line: 'Andy’s copy of the sword turns real too.' },
        choc: { heal: 0.22, line: 'Andy eats a square of Crispy’s chocolate.' },
        cheese: { heal: 0.45, self: { def: 1.25, turns: 3 }, label: 'WELL FED', line: 'Andy eats a grilled cheese. He makes the same face Crispy does.' },
        pills: { self: { atk: 1.2, spd: 1.3, acc: 1.15, turns: 4 }, label: 'CLEAR-HEADED', line: 'Andy takes two of Crispy’s allergy pills.' },
        stance: { self: { def: 1.3, atk: 1.1, turns: 3 }, label: 'FEARLESS', line: 'Andy plants his feet, exactly like Crispy.' },
        talk: { afraid: 2, line: 'Andy says it back to him, word for word, in Crispy’s voice.' },
        lights: { debuff: { acc: 0.85, turns: 2 }, label: 'IN THE DARK', line: 'Andy turns the lights back down. "Better."' },
      },
      moves: {
        claw: { name: 'Claw', power: 1.0, acc: 0.9 },
        reach: { name: 'Reach', power: 1.3, acc: 0.72 },
        screech: { name: 'Screech', power: 0.35, acc: 1, afraid: 2 },
        twitch: { name: 'Twitch', power: 0, acc: 1 },
        lash: { name: 'Tendril Lash', power: 0.55, hits: 2, acc: 0.85 },
        lash3: { name: 'Tendril Lash', power: 0.42, hits: 3, acc: 0.85 },
        scream: { name: 'Scream', power: 0.5, acc: 1, afraid: 2 },
        weep: { name: 'Mend', heal: 0.12 },
        lengthen: { name: 'Lengthen', buff: { atk: 1.3, turns: 3 } },
        rake: { name: 'Rake', power: 0.62, hits: 2, acc: 0.9 },
        lunge: { name: 'Lunge', power: 1.25, acc: 0.8 },
        stare: { name: 'Stare', debuff: { def: 0.8, turns: 2 }, acc: 1 },
        harden: { name: 'Harden', buff: { def: 1.3, turns: 3 } },
        mimic: { name: 'Mimic' }, // see `mimic` below
        grab: { name: 'Grab', power: 1.4, acc: 0.8 },
        smile: { name: 'Smile', debuff: { atk: 0.8, turns: 2 }, afraid: 2, acc: 1 },
        pat: { name: 'Pat on the Back', power: 0.8, acc: 0.95 },
        bite: { name: 'Bite', power: 1.25, acc: 0.82 },
        flicker: { name: 'Flicker', power: 0.95, acc: 1, afraid: 1 },
        bile: { name: 'Bile', power: 0.75, acc: 0.88, debuff: { def: 0.85, turns: 2 }, label: 'BURNED' },
        lure: { name: 'Lure', debuff: { acc: 0.85, turns: 2 }, label: 'SHAKEN', afraid: 2, acc: 1 },
        drop: { name: 'Ceiling Drop', power: 1.5, acc: 0.8 },
        joke: { name: 'Steal the Joke', power: 0.8, acc: 0.95, debuff: { atk: 0.85, turns: 2 }, label: 'HECKLED' },
        lock: { name: 'Lock the Door', door: true, mercy: -6 },
        hesitate: { name: 'Hesitate' },
        adjust: { name: 'ADJUST' },
      },
    },

    // THE KILLER: not part of the fight. From round `from`, when the menu opens there's a
    // `chance` he starts coming up out of a corner of the screen (not again for `gap` rounds);
    // he takes `approach` seconds of Crispy deciding to get all the way in, unless he's clicked.
    // Then the jumpscare, and `hit` of Crispy's health.
    // By the creature's stage (0..4): he comes more often, and faster, the further it's gone.
    killer: {
      from: 2,
      chance: [0.55, 0.65, 0.75, 0.85, 0.95],
      gap: [2, 2, 2, 1, 1],
      approach: [6, 5.4, 4.8, 4.2, 3.6],
      hit: 0.15,
      // ...and the whole time, he's behind Crispy, in the dark kitchen, coming closer: the
      // portrait shows how close (he fades in behind him). `full`: seconds from the back door to
      // right in his face, by the creature's stage (a board creaks under him `stages` times on
      // the way). Crispy TURNS AROUND (it isn't a turn) and his phone's flash shows him, as close
      // as he is, and sends him back `flash` of the way;
      // then it needs `cooldown` seconds, and flashing before that brings him `early` closer.
      // Within `scare` of him, the flash shows him close enough to scream. While a turn plays
      // out he comes no closer than `cap`; all the way there (at the menu, or turned around),
      // he kills Crispy outright. WILLPOWER doesn't help.
      behind: { full: [60, 52, 45, 39, 34], stages: 5, flash: 0.4, cooldown: 10, early: 0.2, scare: 0.6, cap: 0.9 },
    },

    afraid: { atk: 0.8, acc: 0.9 }, // AFRAID: his attack and aim, while it lasts
    poisonMax: 30, // poison never does more than this a turn
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.CRISPY_DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
