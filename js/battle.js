/*
 * SLASHCO VR — TURN-BASED BATTLE
 * battle.js — the turn engine.
 *
 * No DOM in here. The engine talks to the screen through `io`:
 *   await io.say(text, { tone })     one battle-log line
 *   await io.fx(event)               an animation cue (the UI may ignore any of them)
 *   await io.skillCheck(options)     the timing mini-game, resolves true/false
 *   io.refresh()                     redraw the HUD from the current state
 * so the same rules run in the browser and in the headless tests.
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});

  // ---------------------------------------------------------------- helpers
  function makeRng(seed) {
    let a = seed >>> 0;
    const rng = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    rng.range = (r) => rng.int(r[0], r[1]);
    rng.float = (r) => r[0] + rng() * (r[1] - r[0]);
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.chance = (p) => rng() < p;
    rng.weighted = (pairs) => {
      const total = pairs.reduce((s, p) => s + p[1], 0);
      let r = rng() * total;
      for (const [value, weight] of pairs) {
        r -= weight;
        if (r < 0) return value;
      }
      return pairs[pairs.length - 1][0];
    };
    return rng;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // Hits a worker lands with their body or a thrown/held object (hitEnemy's `kind`): the ones
  // Dolphin Man's Mucus Layer can make slip. Magic, shocks, blasts, traps and bleeding can't.
  const PHYSICAL = new Set(['hit', 'stab', 'page']);

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
  }

  const nullIo = {
    say: async () => {},
    fx: async () => {},
    skillCheck: async () => false,
    refresh: () => {},
  };

  // ---------------------------------------------------------------- units
  class Unit {
    constructor(id, def, side) {
      this.id = id;
      this.def = def;
      this.side = side; // 'party' | 'enemy'
      this.name = def.name;
      this.pr = Object.assign({ he: 'he', his: 'his', him: 'him' }, def.pronouns);
      this.base = Object.assign({}, def.stats);
      this.passives = new Set(def.passives || []);
      this.skills = (def.skills || []).slice();
      this.ghost = !!def.ghost;
      this.buffs = []; // { stat, amount, turns, tag }
      this.status = {}; // named timed states (bleed, afraid, asleep, seen, ...)
      this.flags = {}; // everything else
      this.carrying = []; // ids of bodies this worker is carrying
      this.carriedBy = null;
      this.possessed = false;
      this.dead = false;
      this.aggro = 0;
      this.timesTargeted = 0;
    }
    has(passive) {
      return this.passives.has(passive);
    }
    hasBuff(tag) {
      return this.buffs.some((b) => b.tag === tag);
    }
  }

  // ---------------------------------------------------------------- battle
  class Battle {
    constructor(opts) {
      opts = opts || {};
      this.D = opts.data || SC.DATA;
      this.io = Object.assign({}, nullIo, opts.io || {});
      this.seed = opts.seed != null ? opts.seed : (Math.random() * 2 ** 32) >>> 0;
      this.rng = makeRng(this.seed);

      const D = this.D;
      // The squad picked on the title screen, or the default four.
      this.party = (opts.party || D.party).map((id) => {
        const def = D.workers[id];
        const u = new Unit(id, def, 'party');
        u.hp = u.ghost ? 100 : D.health.start;
        u.res = def.resource.max;
        u.resMax = def.resource.max;
        return u;
      });
      const enemyId = opts.enemy || D.enemy;
      const edef = D.slashers[enemyId];
      this.enemyDef = edef;
      this.enemy = new Unit(enemyId, edef, 'enemy');
      this.enemy.hp = this.enemy.maxHp = edef.maxHp;
      this.enemy.anger = edef.anger.start;
      // Past `anger.overflow` every slasher changes: Sid draws his gun, Trollge breaks into a run.
      this.enemy.flags.overflow = this.enemy.anger >= edef.anger.overflow;
      this.units = this.party.concat([this.enemy]);

      this.bag = Object.assign({}, D.startingBag);
      this.credits = 0;
      this.exp = 0;
      this.turn = 0;
      this.intent = null;
      this.intentKnown = false;
      this.foresightTurns = 0;
      this.intel = false; // Captain Jim's Confidential Documents
      this.secrets = false; // Mysti's Hidden Documents
      this.deathward = null; // Mysti's DEATHWARD: { turns }
      this.chopper = null; // Captain Jim's Helicopter Escape: { turns }
      this.spent = {}; // other once-per-battle skills that have been used
      this.failedRuns = 0;
      this.secondLifeUsed = false;
      this.angerCarry = 0;
      this.outcome = null; // null | 'win' | 'lose'
      this.log = [];
      this.stats = { damageDealt: 0, damageTaken: 0, deaths: 0, runs: 0, itemsUsed: 0 };
    }

    // The slasher's name and pronouns, for log lines ("Trollge… it", "Sid… he").
    get en() {
      return this.enemy.name;
    }
    get pr() {
      return this.enemy.pr;
    }
    // Text from data.js may say {e} for the slasher's name.
    fill(text) {
      return text ? text.replace(/\{e\}/g, this.en) : text;
    }

    // ============================================================ io helpers
    async say(text, opts) {
      this.log.push({ turn: this.turn, text, tone: opts && opts.tone });
      await this.io.say(text, opts || {});
    }
    async fx(event) {
      await this.io.fx(event);
    }
    refresh() {
      this.io.refresh();
    }

    // ============================================================ lookups
    unit(id) {
      return this.units.find((u) => u.id === id) || null;
    }
    workers() {
      return this.party;
    }
    corporeal() {
      return this.party.filter((u) => !u.ghost && !u.dead);
    }
    present(u) {
      return !!u && !u.dead && !u.status.phasing;
    }
    withPassive(p) {
      return this.party.find((u) => u.has(p)) || null;
    }
    freakyActive() {
      const p = this.withPassive('freakyDoctor');
      return !!p && this.present(p) && p.res > 0;
    }
    moralSupportActive() {
      const p = this.withPassive('moralSupport');
      return !!p && this.present(p);
    }
    partyNames() {
      return joinNames(this.party.map((u) => u.name));
    }
    isLost() {
      return this.corporeal().length === 0;
    }
    // Exact numbers on the slasher's condition: Confidential Documents or Hidden Documents.
    known() {
      return this.intel || this.secrets;
    }

    // ============================================================ stats
    addBuff(u, stat, amount, turns, tag) {
      const same = u.buffs.find((b) => b.tag === tag && b.stat === stat);
      if (same) {
        same.amount = amount;
        same.turns = Math.max(same.turns, turns);
      } else {
        u.buffs.push({ stat, amount, turns, tag });
      }
    }

    // BRAVO Team Uniform: "a general stat increase while neutral", i.e. showing no emotion.
    neutral(u) {
      const s = u.status;
      return !s.afraid && !s.confused && !s.happy && !(s.balkan && s.balkan.phase === 'boosted');
    }
    uniformBonus(u) {
      const armor = u.def.armor;
      return armor && armor.neutralUp && !u.dead && this.neutral(u) ? armor.neutralUp : 0;
    }

    stat(u, key) {
      const D = this.D;
      let mult = 1 + this.uniformBonus(u);
      for (const b of u.buffs) {
        if (b.stat !== key && b.stat !== 'all') continue;
        let m = b.amount;
        if (key === 'spd' && u.has('speedAddict')) {
          if (m < 0) continue; // "John's SPEED can never be decreased"
          m *= D.passives.speedAddict.boostScale; // "...25% less effective"
        }
        mult += m;
      }
      let base = u.base[key];
      // Slow Walker, Fast Runner: "Spd: 12 -> 77" once its ANGER overflows.
      if (key === 'spd' && u.def.fastRunner && u.flags.overflow) base = u.def.fastRunner.spd;
      let v = base * Math.max(0.2, mult);
      const armor = u.def.armor;
      if (key === 'mag' && armor && armor.magBonus) v *= 1 + armor.magBonus;
      if (u.side === 'party') {
        if (key === 'atk' && this.freakyActive()) v *= 1 + D.passives.freakyDoctor.atk;
        if (key === 'def' && u.status.afraid) v *= 1 - D.balance.afraidDef;
        // Carrying a body is weight, not a debuff, so it slows even Speed Addict.
        if (key === 'spd' && u.carrying.length) v *= Math.pow(D.escape.carrySpeed, u.carrying.length);
      } else if (key === 'atk') {
        v *= 1 + u.anger * this.enemyDef.anger.atkBonusPerPoint;
      } else if (key === 'def' && u.status.fetal) {
        v *= 1 + D.skills.fetalPosition.defUp; // Fetal Position: "significantly increases defense"
      }
      return v;
    }

    healthState(u) {
      if (u.side === 'enemy') {
        const pct = u.hp / u.maxHp;
        const row = this.D.slasherHealth.find((r) => pct <= r.upTo);
        // The top row is the slasher's own doc health ("Unhealthy" Sid, "Good" Trollge).
        return { id: row && row.id ? row.id : u.def.health.toUpperCase() };
      }
      if (u.ghost) return { id: 'NONE' };
      if (u.dead || u.hp <= 0) return { id: 'DEAD' };
      const states = this.D.health.states;
      return states.find((s) => u.hp >= s.min && u.hp <= s.max) || states[states.length - 1];
    }

    async announce(u) {
      if (u.ghost || u.dead) return;
      const st = this.healthState(u);
      if (st.says) await this.say(st.says.replace('{n}', u.name), { tone: 'state', who: u.id });
    }

    // ============================================================ combat math
    // Additive modifiers that are not stat multipliers: 'eva' (dodge), 'hit', 'crit'.
    mod(u, key) {
      let m = 0;
      for (const b of u.buffs) if (b.stat === key) m += b.amount;
      return m;
    }

    critChance(u) {
      const B = this.D.balance;
      let c = B.critBase + this.stat(u, 'smt') * B.critPerSmarts + this.mod(u, 'crit');
      if (u.side === 'party' && this.intel) c += this.D.skills.confidentialDocs.critUp;
      return c;
    }

    // How much of the ANGER a worker's actions cause actually lands (Full Blood Aussie).
    angerFactor(u) {
      return u && u.has('fullBloodAussie') ? this.D.passives.fullBloodAussie.angerCaused : 1;
    }

    // NOISE: ANGER a worker causes by being loud. Dolphin Man hunts by sound: the angrier he is
    // the more he hears, curled up he hears it twice over, and he goes after whoever made it.
    // `o.sound` names the sound for his log line ('ring', 'clang', ...).
    async noise(u, amount, o) {
      o = o || {};
      const H = this.enemyDef.hearing;
      const e = this.enemy;
      let n = amount * this.angerFactor(u);
      if (H) {
        if (o.sound && H.lines[o.sound]) await this.say(this.fill(H.lines[o.sound]), { tone: 'anger' });
        n *= 1 + e.anger * H.perAnger;
        if (e.status.fetal) n *= this.D.skills.fetalPosition.noiseMult;
      }
      await this.addAnger(Math.max(1, Math.round(n)), { quiet: o.quiet });
      if (H) await this.hunt(u);
    }

    // Sounds only Dolphin Man reacts to (a battery going in, glass breaking, an explosion).
    async sound(u, key) {
      const H = this.enemyDef.hearing;
      if (!H || !H.sounds[key] || this.outcome) return;
      await this.noise(u, H.sounds[key], { sound: key });
    }

    // [Hunt] state: he goes after whoever made the noise, and sees them better.
    async hunt(u) {
      const e = this.enemy;
      if (!u || u.dead || u.ghost || this.outcome) return;
      const was = e.status.hunt;
      e.status.hunt = { target: u.id, turns: this.enemyDef.hearing.huntTurns, fresh: true };
      if (was && was.target === u.id) return;
      await this.fx({ type: 'status', target: u.id, text: 'HUNTED' });
      await this.say(`${this.en} is HUNTING ${u.name}!`, { tone: 'danger' });
      this.refresh();
    }

    hunted() {
      const h = this.enemy.status.hunt;
      return h ? this.unit(h.target) : null;
    }

    // Eyes of the Angry: "eyesight will begin extremely bad... But as ANGER increases, so does
    // eyesight." A multiplier on his physical attacks' HIT RATE; better on whoever he hunts.
    eyesight(t) {
      const e = this.enemy;
      if (!e.has('eyesOfTheAngry')) return 1;
      const P = this.D.passives.eyesOfTheAngry;
      let m = P.hitAt0 + ((P.hitAt100 - P.hitAt0) * e.anger) / this.enemyDef.anger.max;
      if (t && this.hunted() === t) m += this.enemyDef.hearing.huntEyes;
      return m;
    }

    hitChance(att, def, hitMult) {
      const B = this.D.balance;
      let hit = B.baseHit;
      if (att.side === 'enemy') {
        hit -= this.enemyDef.armor.hitRatePenalty || 0;
        if (att.status.blind) hit -= att.status.blind.amount;
      } else {
        if (att.has('shadowborn')) hit += this.D.passives.shadowborn.hitBonus;
        if (att.flags.glassesOff) hit -= this.D.skills.tossGlasses.hitPenalty;
      }
      hit += this.mod(att, 'hit');
      hit -= this.mod(def, 'eva');
      const faster = this.stat(def, 'spd') - this.stat(att, 'spd');
      if (faster > 0) hit -= faster * B.evasionPerSpd;
      if (att.side === 'enemy') hit *= this.eyesight(def);
      return clamp(hit * (hitMult || 1), 0.05, 0.99);
    }

    rollHit(att, def, hitMult) {
      return this.rng() < this.hitChance(att, def, hitMult);
    }

    physical(att, def, power, o) {
      o = o || {};
      const B = this.D.balance;
      const key = o.stat || (o.magic ? 'mag' : 'atk'); // Tail Whip hits with DEF
      const offense = this.stat(att, key);
      const defense = o.ignoreDef ? 0 : this.stat(def, 'def') * (1 - (o.defIgnore || 0));
      let dmg = (offense * power * 100) / (100 + defense);
      if (!o.flat) dmg *= this.rng.float(B.variance);
      if (o.crit) dmg *= B.critMult;
      return dmg;
    }

    // ============================================================ anger
    async addAnger(n, o) {
      o = o || {};
      const e = this.enemy;
      const A = this.enemyDef.anger;
      const before = e.anger;
      e.anger = clamp(before + n, 0, A.max);
      const delta = e.anger - before;
      if (!delta) return;
      await this.fx({ type: 'anger', delta });
      if (delta > 0) {
        const crossed = Math.floor(before / 20) < Math.floor(e.anger / 20);
        if (!o.quiet || crossed) await this.say(`${this.en} is getting angrier…`, { tone: 'anger' });
      }
      await this.checkOverflow();
      this.refresh();
    }

    // Each slasher's "unique result of high ANGER" (doc).
    async checkOverflow() {
      const e = this.enemy;
      const L = this.enemyDef.lines;
      const over = e.anger >= this.enemyDef.anger.overflow;
      if (over === !!e.flags.overflow) return;
      e.flags.overflow = over;
      await this.fx({ type: 'enemyPose' });
      if (over) for (const line of L.overflow) await this.say(line, { tone: 'danger' });
      else await this.say(L.calm);
    }

    // ============================================================ damage / healing
    async hitEnemy(attacker, amount, o) {
      o = o || {};
      const e = this.enemy;
      const A = this.enemyDef.anger;
      const armor = this.enemyDef.armor;
      // Mucus Layer: "causes many attacks to slip over the skin… Physical ones."
      const slipped = !!armor.slipChance && PHYSICAL.has(o.kind || 'hit') && this.rng.chance(armor.slipChance);
      if (slipped) amount *= armor.slipDamage;
      const before = e.hp;
      let after = before - Math.max(1, Math.round(amount));
      let refused = false;
      if (after < 1) {
        after = 1; // slashers can't be killed — only weakened
        refused = true;
      }
      const dealt = before - after;
      e.hp = after;
      this.stats.damageDealt += dealt;
      if (attacker) attacker.aggro += dealt;
      await this.fx({ type: 'hitEnemy', amount: dealt, crit: !!o.crit, kind: o.kind || 'hit', quick: !!o.quick, slipped });
      if (slipped && !o.quick) await this.say(`It slips right off ${this.en}’s slimy skin!`);
      if (o.crit && !o.quietCrit && !slipped) await this.say('It hits a weak point!', { tone: 'crit' });
      this.refresh();

      if (attacker) {
        const chm = this.stat(attacker, 'chm');
        this.angerCarry += (dealt / A.perDamage) * Math.max(0.1, 1 - chm / A.charmDivisor) * this.angerFactor(attacker);
        const whole = Math.floor(this.angerCarry);
        if (whole > 0) {
          this.angerCarry -= whole;
          await this.addAnger(whole, { quiet: true });
        }
      }
      if (refused && !e.flags.refusedThisTurn) {
        e.flags.refusedThisTurn = true;
        await this.say(`${this.en} refuses to go down!`);
      }
      // Curled up in Fetal Position he hears every blow, and every blow makes him angrier.
      if (e.status.fetal && attacker && !this.outcome) {
        if (!e.flags.echoSaid) {
          e.flags.echoSaid = true;
          await this.say(`Every blow echoes down the hallway… ${this.en} twitches at the sound!`, { tone: 'anger' });
        }
        await this.noise(attacker, this.D.skills.fetalPosition.hitNoise, { quiet: true });
      }
      await this.checkWeakened(attacker);
      return dealt;
    }

    async checkWeakened(attacker) {
      const e = this.enemy;
      const S = this.enemyDef;
      const pct = e.hp / e.maxHp;
      if (!e.flags.weakened && pct <= S.weakenedAt) {
        e.flags.weakened = true;
        e.flags.downed = true;
        e.status.stunned = { slots: S.weakenedStun, by: attacker ? attacker.name : null };
        delete e.status.fetal; // knocked flat: no more Fetal Position DEF
        if (!this.enemyActed) this.intent = { kind: 'stunned' }; // whatever it planned, it can't do it now
        await this.fx({ type: 'enemyPose' });
        await this.say(`${this.en} is weakened! Now is your time for escape!`, { tone: 'good' });
        await this.checkPossession();
      }
      if (!e.flags.barelyStanding && pct <= S.barelyStandingAt) {
        e.flags.barelyStanding = true;
        e.flags.downed = true;
        const slots = e.status.stunned ? e.status.stunned.slots : 0;
        e.status.stunned = { slots: Math.max(1, slots), by: attacker ? attacker.name : null };
        delete e.status.fetal;
        if (!this.enemyActed) this.intent = { kind: 'stunned' };
        await this.fx({ type: 'enemyPose' });
        await this.say(S.lines.barelyStanding, { tone: 'good' });
      }
      this.refresh();
    }

    // source: 'enemy' | 'gun' | 'magdump' | 'self' | 'lob' | 'poison' | 'ally'
    async damageWorker(t, amount, o) {
      o = o || {};
      const D = this.D;
      if (!t || t.dead) return 0;
      if (t.ghost) {
        await this.fx({ type: 'passThrough', target: t.id });
        await this.say(`It passes right through ${t.name}!`);
        return 0;
      }
      if (t.flags.barrier) {
        await this.fx({ type: 'block', target: t.id });
        await this.say('The barrier absorbs the blow!', { tone: 'good' });
        return 0;
      }
      let dmg = amount;
      if (!o.raw) {
        if (t.flags.guarding) dmg *= D.balance.guard;
        const fromEnemy = o.source === 'enemy' || o.source === 'gun' || o.source === 'magdump' || o.source === 'wail';
        if (fromEnemy && t.flags.braced) dmg *= 1 - D.skills.foresight.braced;
        if (t.status.exposed) dmg *= 1 + D.skills.exterminate.exposedDamage;
        if (this.freakyActive()) dmg *= D.passives.freakyDoctor.damageTaken;
        if (t.has('fullBloodAussie')) dmg *= D.passives.fullBloodAussie.damageTaken;
      }
      dmg = Math.max(1, Math.round(dmg));
      const before = t.hp;
      this.stats.damageTaken += Math.min(dmg, before);

      if (dmg >= before) {
        if (t.has('aliveHard') && before >= D.passives.aliveHard.threshold) {
          t.hp = 1;
          await this.fx({ type: 'hitWorker', target: t.id, amount: dmg, big: true });
          await this.say(`${t.name} survives on the edge of life!`, { tone: 'good' });
          this.refresh();
          await this.firstResponder(t);
          return before - 1;
        }
        if (this.deathward) {
          t.hp = 1;
          await this.fx({ type: 'hitWorker', target: t.id, amount: dmg, big: true });
          await this.fx({ type: 'ward', target: t.id });
          await this.say(`The DEATHWARD holds! ${t.name} refuses to die!`, { tone: 'good' });
          this.refresh();
          await this.firstResponder(t);
          return before - 1;
        }
        t.hp = 0;
        await this.fx({ type: 'hitWorker', target: t.id, amount: dmg, big: true });
        await this.onDeath(t, o.source);
        return before;
      }
      t.hp = before - dmg;
      await this.fx({ type: 'hitWorker', target: t.id, amount: dmg, quick: !!o.quick });
      this.refresh();
      if (!o.silent) await this.announce(t);
      await this.firstResponder(t);
      return dmg;
    }

    // Mysti's First Responder: the first time each teammate drops to CRITICAL, she patches
    // them up to SCATHED on the spot.
    async firstResponder(t) {
      const m = this.withPassive('firstResponder');
      if (!m || m === t || !this.present(m) || m.status.asleep || t.dead || t.ghost || t.flags.firstAid) return;
      if (this.healthState(t).id !== 'CRITICAL') return;
      t.flags.firstAid = true;
      await this.fx({ type: 'cast', from: m.id, kind: 'aid' });
      await this.say(`${m.name} rushes to ${t.name}’s side! First Responder!`, { tone: 'good' });
      await this.heal(t, this.D.passives.firstResponder.healTo - t.hp, { raw: true });
    }

    async heal(t, amount, o) {
      o = o || {};
      if (!t || t.dead || t.ghost) return 0;
      const D = this.D;
      let n = amount;
      if (!o.raw && this.freakyActive()) n *= D.passives.freakyDoctor.healing;
      if (o.item && t.has('fullBloodAussie')) n *= D.passives.fullBloodAussie.itemBoost;
      n = Math.max(0, Math.round(n));
      const before = t.hp;
      t.hp = Math.min(D.health.max, t.hp + n);
      await this.fx({ type: 'healWorker', target: t.id, amount: t.hp - before });
      this.refresh();
      if (!o.silent) await this.announce(t);
      return t.hp - before;
    }

    gainCredits(n) {
      let got = n;
      if (this.freakyActive()) got *= this.D.passives.freakyDoctor.credits;
      got = Math.round(got);
      this.credits += got;
      return got;
    }

    async onDeath(t, source) {
      const D = this.D;
      const FD = D.passives.freakyDoctor;
      if (!this.secondLifeUsed && this.freakyActive()) {
        this.secondLifeUsed = true;
        t.hp = FD.reviveHp;
        await this.fx({ type: 'revive', target: t.id });
        await this.say(`${this.withPassive('freakyDoctor').name}’s freaky machinations drag ${t.name} back to life!`, { tone: 'good' });
        await this.announce(t);
        return;
      }
      t.dead = true;
      t.hp = 0;
      t.buffs = [];
      t.status = {};
      if (this.hunted() === t) delete this.enemy.status.hunt;
      t.flags = { deathSource: source };
      this.stats.deaths++;
      await this.fx({ type: 'death', target: t.id });
      await this.say(`${t.name} is dead…`, { tone: 'death' });
      if (t.id === 'mel' && (source === 'gun' || source === 'magdump')) {
        await this.say('A gunshot to the cranium. Just like the report said.', { tone: 'death' });
      }
      for (const id of t.carrying) {
        const body = this.unit(id);
        body.carriedBy = null;
        await this.say(`${t.name} drops ${body.name}’s body!`);
      }
      t.carrying = [];
      this.refresh();
      if (this.isLost()) {
        this.outcome = 'lose';
        return;
      }
      await this.checkPossession();
    }

    async checkPossession() {
      const p = this.withPassive('possession');
      if (!p || !this.present(p) || p.flags.possessing) return;
      if (!this.enemy.flags.weakened) return;
      const bodies = this.party.filter((u) => u.dead && !u.possessed);
      if (!bodies.length) return;
      const body = this.rng.pick(bodies);
      body.possessed = true;
      p.flags.possessing = body.id;
      if (body.carriedBy) {
        const carrier = this.unit(body.carriedBy);
        carrier.carrying = carrier.carrying.filter((id) => id !== body.id);
        body.carriedBy = null;
        await this.say(`${carrier.name} no longer has to carry ${body.name}!`);
      }
      await this.fx({ type: 'possess', target: body.id });
      await this.say(`${p.name} possesses ${body.name}’s body!`, { tone: 'status' });
      await this.say(`${body.name}’s body can move on its own now!`);
      this.refresh();
    }

    // ============================================================ escape
    bodiesToCarry() {
      return this.party.filter((u) => u.dead && !u.carriedBy && !u.possessed);
    }

    escapeChance() {
      const E = this.D.escape;
      const S = this.enemyDef;
      const e = this.enemy;
      const n = this.en;
      const parts = [];
      const loose = this.bodiesToCarry();
      const runners = this.corporeal();
      if (!runners.length) return { chance: 0, blocked: true, reason: 'No one is left to run.', parts };
      if (loose.length) {
        const names = joinNames(loose.map((u) => u.name));
        return {
          chance: 0,
          blocked: true,
          reason: `${names} can’t be left behind! Someone has to CARRY ${loose.length > 1 ? 'them' : 'the body'}.`,
          short: `CARRY ${loose.map((u) => u.name.toUpperCase()).join(' & ')} FIRST`,
          parts,
        };
      }
      let c = E.base;
      parts.push(['Base', E.base]);
      const lost = (1 - e.hp / e.maxHp) * E.perHealthLost;
      c += lost;
      parts.push([`${n}’s wounds`, lost]);
      const add = (on, label, value) => {
        if (!on) return;
        c += value;
        parts.push([label, value]);
      };
      add(e.flags.weakened, `${n} is weakened`, E.weakened);
      add(e.status.stunned, `${n} can’t move`, E.stunned);
      add(e.status.chilled, `${n} is freezing`, E.chilled);
      add(e.status.confused, `${n} is confused`, E.confused);
      add(e.status.blind, `${n} can’t see`, E.blind);
      add(e.status.fetal, `${n} is curled up`, E.curledUp);
      add(e.flags.overflow && S.escapeOverflow, S.escapeOverflow && S.escapeOverflow.label, S.escapeOverflow && S.escapeOverflow.value);
      const avg = runners.reduce((s, u) => s + this.stat(u, 'spd'), 0) / runners.length;
      const spd = clamp((avg - this.stat(e, 'spd')) * E.speedPerPoint, E.speedMin, E.speedMax);
      c += spd;
      parts.push(['Team speed', spd]);
      const carried = this.party.filter((u) => u.dead && u.carriedBy).length;
      add(carried, `Carrying ${carried > 1 ? carried + ' bodies' : 'a body'}`, -carried * E.perCarried);
      add(this.failedRuns, 'Earlier attempts', this.failedRuns * E.perFailedTry);
      return { chance: Math.round(clamp(c, E.min, E.max)), blocked: false, parts };
    }

    // ============================================================ turn flow
    async start() {
      this.refresh();
      const L = this.enemyDef.lines;
      if (L.intro) await this.say(L.intro, { tone: 'intro' });
      await this.say(`${this.partyNames()} are backed into a corner against ${this.en}!`, { tone: 'intro' });
      for (const u of this.party) {
        const line = u.def.weapon.intro && u.def.weapon.intro[this.enemy.id];
        if (line) await this.say(line);
      }
    }

    canCommand(u) {
      if (!u || u.dead) return false;
      if (u.status.asleep || u.status.phasing) return false;
      if (u.status.balkan && u.status.balkan.phase === 'boosted') return false;
      return true;
    }

    async beginTurn() {
      const D = this.D;
      const e = this.enemy;
      this.turn++;
      this.enemyActed = false;
      this.intentWord = null;
      e.flags.refusedThisTurn = false;
      e.flags.echoSaid = false;
      for (const u of this.party) {
        u.flags.guarding = false;
        u.flags.barrier = false;
        u.flags.braced = false;
        u.flags.moved = false;
      }
      await this.fx({ type: 'turn', turn: this.turn });
      await this.say(`Turn ${this.turn}:`, { tone: 'turn' });

      if (this.turn === 1) {
        for (const u of this.party) {
          if (!u.has('athlete')) continue;
          const P = D.passives.athlete;
          this.addBuff(u, 'spd', P.spdUp, P.turns, 'athlete');
          await this.say(`${u.name}’s inner athlete kicks in!`);
          await this.fx({ type: 'buff', target: u.id });
          await this.say(`${u.name}’s speed drastically increases!`, { tone: 'buff' });
        }
        if (this.freakyActive()) {
          await this.say(`${this.withPassive('freakyDoctor').name}’s strange machinations hum through the air…`, { tone: 'status' });
        }
        await this.unsettle();
      }

      if (e.flags.downed && !e.status.stunned) {
        e.flags.downed = false;
        await this.fx({ type: 'enemyPose' });
        await this.say(`${this.en} gets back up… and ${this.pr.he}’s furious!`, { tone: 'danger' });
        await this.addAnger(this.enemyDef.getsUpAnger, { quiet: true });
      }

      for (const u of this.party) await this.moodSwing(u);
      for (const u of this.party) {
        if (this.outcome) return;
        await this.startOfTurnFor(u);
      }
      if (this.outcome) return;
      await this.fastRunnerGlance();

      this.intent = this.planEnemy();
      this.intentKnown = false;
      const seer = this.party.find((u) => u.has('hyperceptive') && !u.dead && !u.status.asleep);
      if (seer) {
        await this.say(`${seer.name} ${this.turn === 1 ? 'stares' : 'looks'} at ${this.en}…`);
        this.intentKnown = true;
        await this.fx({ type: 'intent' });
        await this.say(this.intentLine(this.intent), { tone: 'warn' });
      }
      const purpl = this.withPassive('freakyDoctor');
      if (this.foresightTurns > 0 && this.present(purpl)) await this.warnPower(purpl);
      else if (this.intel) this.intentWord = this.intentPower(this.intent); // Confidential Documents

      for (const u of this.party) await this.lunchBoxTick(u);
      await this.checkPossession();
      this.refresh();
    }

    // Mood Swings: every turn Purpl Lady feels HAPPY, ANGRY or SAD (her face shows it, and her
    // Hex changes with it).
    async moodSwing(u) {
      if (!u.has('moodSwings') || u.dead || u.status.phasing) return;
      u.mood = this.rng.pick(this.D.passives.moodSwings.moods);
      const line = { happy: 'feels HAPPY!', angry: 'is ANGRY!', sad: 'feels SAD…' }[u.mood];
      await this.fx({ type: 'status', target: u.id, text: u.mood.toUpperCase() });
      await this.say(`${u.name} ${line}`, { tone: 'status' });
    }

    // Trollface: "a permanent grin on its face definitely is unsettling…"
    async unsettle() {
      const A = this.enemyDef.armor;
      if (!A.unsettling) return;
      await this.say(`${this.en} grins at the team. It doesn’t blink.`, { tone: 'danger' });
      for (const u of this.corporeal()) {
        if (!this.rng.chance((A.unsettling - this.stat(u, 'brv')) / 100)) continue;
        u.status.afraid = { turns: 1 };
        await this.fx({ type: 'status', target: u.id, text: 'AFRAID' });
        await this.say(`${u.name} is AFRAID!`, { tone: 'debuff' });
      }
    }

    // Slow Walker, Fast Runner: "...marks a random enemy as SEEN once per turn."
    async fastRunnerGlance() {
      const e = this.enemy;
      if (!e.has('slowWalkerFastRunner') || !e.flags.overflow || e.status.stunned) return;
      const pool = this.enemyTargets().filter((u) => !u.status.seen);
      if (!pool.length) return;
      const t = this.rng.pick(pool);
      await this.fx({ type: 'enemyAttack', kind: 'glance', target: t.id });
      await this.say(`${this.en}’s head snaps toward ${t.name}!`, { tone: 'danger' });
      await this.markSeen(t);
    }

    async markSeen(t) {
      t.status.seen = { turns: this.D.skills.staticStare.seenTurns };
      await this.fx({ type: 'status', target: t.id, text: 'SEEN' });
      await this.say(`${t.name} is SEEN!`, { tone: 'debuff' });
      this.refresh();
    }

    async startOfTurnFor(u) {
      const D = this.D;
      if (u.dead) return;
      // Balkan Boost kicks in the turn after drinking it.
      if (u.status.balkan && u.status.balkan.phase === 'pending') {
        const it = D.items.balkanBoost;
        u.status.balkan = { phase: 'boosted', turns: it.boostTurns };
        this.addBuff(u, 'all', it.boost, it.boostTurns, 'balkan');
        await this.fx({ type: 'buff', target: u.id });
        await this.say(`${u.name} is powered up by the Balkan boost!`, { tone: 'buff' });
        await this.say(`All of ${u.name}’s STATS drastically increase!`, { tone: 'buff' });
      }
      // Waking up from a nap.
      if (u.status.asleep && u.status.asleep.turns <= 0) {
        const sk = D.skills.nap;
        delete u.status.asleep;
        await this.fx({ type: 'portrait', target: u.id });
        await this.say(`${u.name} wakes up!`);
        u.res = u.resMax;
        await this.heal(u, sk.heal);
        this.addBuff(u, 'atk', -sk.atkDown, sk.atkDownTurns, 'napAtk');
        await this.say(`${u.name}’s attack decreases slightly.`, { tone: 'debuff' });
      }
      // Coming back from Phase for ITEMS.
      if (u.status.phasing && u.status.phasing.turns <= 0) {
        await this.returnFromPhase(u);
      } else if (u.status.phasing) {
        await this.say(`${u.name} is still searching the lockers…`);
      }
      // Captain Jim's Proxy Locator, while it's switched on.
      if (u.flags.proxy) {
        const sk = D.skills.proxyLocator;
        if (this.rng.chance(sk.findChance)) {
          const id = this.rng.pick(D.phaseLoot.common);
          this.bag[id] = (this.bag[id] || 0) + 1;
          await this.fx({ type: 'loot', items: [D.items[id].name] });
          await this.say(`The Proxy Locator pings! ${u.name} finds ${this.withArticle(D.items[id])}!`, { tone: 'good' });
        }
        if (this.rng.chance(sk.noiseChance)) {
          await this.say('The Proxy Locator screeches! It’s making NOISE!', { tone: 'anger' });
          await this.noise(u, sk.noiseAnger, { sound: 'screech' });
        }
      }
    }

    withArticle(it) {
      const art = it.article != null ? it.article : /^[aeiou]/i.test(it.name) ? 'an ' : 'a ';
      return art + it.name;
    }

    async lunchBoxTick(u) {
      if (!u.flags.lunch || u.dead) return;
      const L = u.flags.lunch;
      L.turns--;
      if (L.turns > 0) {
        await this.say(`${u.name} is looking for ${u.pr.his} lunch box…`);
        return;
      }
      delete u.flags.lunch;
      const sk = this.D.skills.lunchBox;
      await this.fx({ type: 'item', target: u.id, item: 'lunchBox' });
      await this.say(`${u.name} finds ${u.pr.his} lunch box!`, { tone: 'good' });
      await this.heal(u, sk.heal);
      const ally = this.unit(L.allyId);
      if (ally && !ally.dead && !ally.ghost) await this.heal(ally, sk.heal);
    }

    intentLine(intent) {
      const t = intent && intent.targetId ? this.unit(intent.targetId) : null;
      const n = this.en;
      switch (intent && intent.kind) {
        case 'melee':
        case 'gun':
        case 'claws':
          return this.rng.chance(0.5) ? `${n} will hit ${t.name} next!` : `${n} will attack ${t.name} next!`;
        case 'scratch':
          return `${n} will scratch ${t.name} next!`;
        case 'stare':
          return `${n} will stare at ${t.name} next!`;
        case 'magdump':
          return `${n} will attack everyone next!`;
        case 'claims':
          return `${n} will target everyone next!`;
        case 'hands':
          return this.rng.chance(0.5) ? `${n} will slap at ${t.name} next!` : `${n} will grab at ${t.name} next!`;
        case 'whip':
          return `${n} will whip ${t.name} with ${this.pr.his} tail next!`;
        case 'wail':
          return `${n} will wail at everyone next!`;
        case 'fetal':
          return `${n} is about to curl up into a ball!`;
        case 'curled':
          return `${n} is curled up and won’t attack!`;
        case 'stunned':
          return `${n} can’t move!`;
        default:
          return `${n} will not be attacking anyone!`;
      }
    }

    // The moves a single-target attack picks from, for power estimates.
    movesFor(kind) {
      const S = this.enemyDef;
      if (kind === 'gun') return S.gunAttacks;
      if (kind === 'claws') return S.claws;
      if (kind === 'scratch') return [this.D.skills.scratch];
      return S.melee;
    }

    intentPower(intent) {
      const S = this.enemyDef;
      const e = this.enemy;
      if (!intent) return null;
      // Dolphin Man's moves: his poor eyesight is part of how hard they land.
      if (intent.kind === 'hands' || intent.kind === 'whip') {
        const t = this.unit(intent.targetId);
        if (!t || t.dead) return null;
        const W = S.weapon;
        const sk = this.D.skills.tailWhip;
        const exp =
          intent.kind === 'hands'
            ? W.hits * this.hitChance(e, t) * this.physical(e, t, W.power, { flat: true })
            : this.hitChance(e, t, sk.hitMult) * this.physical(e, t, sk.power, { flat: true, stat: 'def' });
        return this.powerWord(exp / Math.max(1, t.hp));
      }
      if (intent.kind === 'wail') {
        const targets = this.corporeal();
        if (!targets.length) return null;
        const weakest = targets.reduce((a, b) => (a.hp <= b.hp ? a : b));
        const W = this.D.skills.loudWail;
        const exp = W.pulses * ((W.damage[0] + W.damage[1]) / 2) * (1 + e.anger * W.perAnger);
        return this.powerWord(exp / Math.max(1, weakest.hp));
      }
      if (['melee', 'gun', 'claws', 'scratch'].includes(intent.kind)) {
        const t = this.unit(intent.targetId);
        if (!t || t.dead) return null;
        const list = this.movesFor(intent.kind);
        const pow = list.reduce((s, m) => s + m.power, 0) / list.length;
        const exp = this.physical(e, t, pow, { flat: true });
        return this.powerWord(exp / Math.max(1, t.hp));
      }
      if (intent.kind === 'magdump') {
        const targets = this.corporeal();
        if (!targets.length) return null;
        const weakest = targets.reduce((a, b) => (a.hp <= b.hp ? a : b));
        const M = this.D.skills.magdump;
        const acc = M.accuracy + (e.flags.deagleFocus ? S.weapon.magdumpAccuracyBonus : 0);
        const avgBullets = (M.bullets[0] + M.bullets[1]) / 2;
        const shooters = this.party.filter((u) => !u.dead && !u.status.phasing).length || 1;
        const exp = (avgBullets * acc * this.physical(e, weakest, M.power, { flat: true })) / shooters;
        return this.powerWord(exp / Math.max(1, weakest.hp));
      }
      if (intent.kind === 'claims' || intent.kind === 'stare') return 'UNSETTLING';
      return null;
    }

    powerWord(ratio) {
      if (ratio >= 1) return 'DEADLY';
      if (ratio >= 0.5) return 'STRONG';
      if (ratio >= 0.25) return 'MODERATE';
      return 'WEAK';
    }

    async warnPower(purpl) {
      const word = this.intentPower(this.intent);
      if (!word) {
        await this.say(`${purpl.name} senses no attack coming.`);
        return;
      }
      for (const u of this.party) u.flags.braced = true;
      this.intentWord = word;
      await this.fx({ type: 'intent' });
      await this.say(`${purpl.name} warns everyone of a ${word} attack!`, { tone: 'warn' });
    }

    // ------------------------------------------------------------ the slasher's plan
    enemyTargets() {
      return this.party.filter((u) => !u.dead && !u.ghost);
    }

    // Who the slasher can single out right now: Stealth Camo hides a guarding Captain Jim, but
    // not from Dolphin Man once he's hunting him by sound.
    hidden(u) {
      return u.has('stealthCamo') && u.flags.guarding && !(this.enemyDef.hearing && this.hunted() === u);
    }

    targetWeight(u) {
      const w = 1 + u.aggro / 150 + (u.hp <= 40 ? 0.5 : 0) + (u.status.asleep ? 0.5 : 0);
      return u.has('stealthCamo') ? w * this.D.passives.stealthCamo.targetWeight : w;
    }

    pickEnemyTarget(filter) {
      const ts = this.enemyTargets().filter((u) => !this.hidden(u) && (!filter || filter(u)));
      if (!ts.length) return null;
      return this.rng.weighted(ts.map((u) => [u, this.targetWeight(u)]));
    }

    // Who Trollge can stare at: anyone in sight. A stare needs no touch, so Purpl Lady's Ghost
    // Body doesn't help her here (only while she's phased out).
    watchTargets() {
      return this.party.filter((u) => !u.dead && !u.status.phasing && !this.hidden(u));
    }

    pickWatchTarget(filter) {
      const ts = this.watchTargets().filter((u) => !filter || filter(u));
      if (!ts.length) return null;
      return this.rng.weighted(ts.map((u) => [u, this.targetWeight(u)]));
    }

    planEnemy() {
      if (this.enemy.status.stunned) return { kind: 'stunned' };
      const plan = { trollge: this.planTrollge, dolphin: this.planDolphin }[this.enemy.id] || this.planSid;
      return plan.call(this);
    }

    planSid() {
      const sid = this.enemy;
      const S = this.enemyDef;
      const target = this.pickEnemyTarget();
      if (!target) return { kind: 'idle' };
      const w = sid.flags.overflow ? S.ai.armed : S.ai.calm;
      const opts = [];
      if (!sid.flags.overflow) {
        opts.push(['melee', w.melee]);
        if (sid.anger >= S.ai.cookieMinAnger && !sid.hasBuff('jumboCookie')) opts.push(['cookie', w.cookie]);
        if (this.lastEnemyKind !== 'claims') opts.push(['claims', w.claims]);
      } else {
        opts.push(['gun', w.gun]);
        opts.push(['magdump', w.magdump]);
        if (!sid.flags.deagleFocus && sid.anger < S.anger.max) opts.push(['deagle', w.deagle]);
        if (this.lastEnemyKind !== 'claims') opts.push(['claims', w.claims]);
      }
      const kind = this.rng.weighted(opts);
      const intent = { kind };
      if (kind === 'melee' || kind === 'gun') intent.targetId = target.id;
      return intent;
    }

    // Trollge stares someone down, then scratches whoever it has SEEN.
    planTrollge() {
      const S = this.enemyDef;
      if (!this.pickEnemyTarget()) return { kind: 'idle' };
      const seen = (u) => !!u.status.seen;
      const fresh = (u) => !u.status.seen && !u.status.stared;
      const anySeen = this.enemyTargets().some((u) => seen(u) && !this.hidden(u));
      const w = anySeen ? S.ai.seen : S.ai.unseen;
      const opts = [['claws', w.claws]];
      if (anySeen) opts.push(['scratch', w.scratch]);
      if (this.lastEnemyKind !== 'stare' && this.watchTargets().some(fresh)) opts.push(['stare', w.stare]);
      const kind = this.rng.weighted(opts);
      const t = kind === 'stare' ? this.pickWatchTarget(fresh) : this.pickEnemyTarget(kind === 'scratch' ? seen : null);
      return { kind, targetId: t && t.id };
    }

    // Dolphin Man slaps and whips whoever he hunts (or anyone), wails more once he's angry, and
    // curls up now and then, more often once he's hurt.
    planDolphin() {
      const S = this.enemyDef;
      const e = this.enemy;
      if (e.status.fetal) return { kind: 'curled' };
      const prey = this.hunted();
      const t = prey && !this.hidden(prey) ? prey : this.pickEnemyTarget();
      if (!t) return { kind: 'idle' };
      const w = e.anger >= S.ai.angryAt ? S.ai.angry : S.ai.calm;
      const opts = [
        ['hands', w.hands],
        ['whip', w.whip],
      ];
      if (this.lastEnemyKind !== 'wail') opts.push(['wail', w.wail]);
      if (this.lastEnemyKind !== 'curled' && this.lastEnemyKind !== 'fetal') {
        opts.push(['fetal', w.fetal + (e.hp < e.maxHp * 0.6 ? S.ai.hurtFetal : 0)]);
      }
      const kind = this.rng.weighted(opts);
      return kind === 'hands' || kind === 'whip' ? { kind, targetId: t.id } : { kind };
    }

    // ------------------------------------------------------------ resolution
    priorityOf(u, cmd) {
      if (cmd.type === 'guard' || cmd.type === 'focus') return 2;
      if (cmd.type === 'skill' && this.D.skills[cmd.skill].priority) return this.D.skills[cmd.skill].priority;
      return 0;
    }

    autoCommand(u) {
      if (u.status.asleep) return { type: 'sleep' };
      if (u.status.balkan && u.status.balkan.phase === 'boosted') return { type: 'berserk' };
      return null;
    }

    async resolveTurn(commands) {
      commands = commands || {};
      const e = this.enemy;
      const acts = [];
      for (const u of this.party) {
        if (u.dead || u.status.phasing) continue;
        const cmd = this.autoCommand(u) || commands[u.id];
        if (!cmd) continue;
        acts.push({ u, cmd, prio: this.priorityOf(u, cmd), spd: this.stat(u, 'spd'), tie: this.rng() });
      }
      const intent = this.intent || { kind: 'idle' };
      acts.push({
        enemy: true,
        prio: intent.kind === 'cookie' ? this.D.skills.jumboCookie.priority : 0,
        spd: this.stat(e, 'spd'),
        tie: this.rng(),
      });
      // Slow Walker, Fast Runner: at full speed it also comes back around after everyone else.
      if (this.lapping()) acts.push({ enemy: true, lap: true, prio: -1, spd: 0, tie: 0 });
      acts.sort((a, b) => b.prio - a.prio || b.spd - a.spd || a.tie - b.tie);

      for (const a of acts) {
        if (this.outcome) break;
        if (a.lap) await this.enemyLap();
        else if (a.enemy) {
          await this.enemyAct();
          await this.enemyFollowUp();
        } else await this.workerAct(a.u, a.cmd);
        this.refresh();
      }
      if (!this.outcome) await this.endTurn();
    }

    async runTurn() {
      const esc = this.escapeChance();
      if (esc.blocked) {
        await this.say(esc.reason, { tone: 'warn' });
        return false;
      }
      this.stats.runs++;
      const runners = this.corporeal();
      const lead = runners.reduce((a, b) => (this.stat(a, 'spd') >= this.stat(b, 'spd') ? a : b));
      await this.say(runners.length > 1 ? 'The team makes a run for it!' : `${lead.name} makes a run for it!`, {
        tone: 'run',
      });
      for (const u of runners) {
        for (const id of u.carrying) await this.say(`${u.name} hauls ${this.unit(id).name}’s body along!`);
      }
      const possessed = this.party.find((u) => u.possessed);
      if (possessed) await this.say(`${possessed.name}’s possessed body shambles after them!`);

      const success = this.rng() * 100 < esc.chance;
      await this.fx({ type: 'run', success });
      if (success) {
        await this.win();
        return true;
      }
      this.failedRuns++;
      await this.say(this.rng.pick(this.enemyDef.lines.blocksEscape), { tone: 'bad' });
      const lap = this.lapping();
      await this.enemyAct();
      await this.enemyFollowUp();
      if (lap) await this.enemyLap();
      if (!this.outcome) await this.endTurn();
      return false;
    }

    async win() {
      const D = this.D;
      const sk = D.skills.hiddenDocs;
      this.outcome = 'win';
      const got = this.gainCredits(D.escape.reward + (this.secrets ? sk.credits : 0));
      this.exp = Math.round(this.enemyDef.exp * (this.secrets ? 1 + sk.expBonus : 1));
      await this.say(`A successful escape! ${this.partyNames()} win!`, { tone: 'win' });
      await this.say(`The group receives ${got} credits.`, { tone: 'good' });
      if (this.secrets) await this.say('The Hidden Documents are worth a little extra.', { tone: 'good' });
      this.refresh();
    }

    // ------------------------------------------------------------ worker actions
    async workerAct(u, cmd) {
      const B = this.D.balance;
      if (u.dead) return;
      if (!(cmd.type === 'skill' && cmd.skill === 'capSlap')) u.flags.capStreak = 0;
      if (cmd.type === 'sleep') {
        await this.say(`${u.name} is fast asleep… Zzz…`);
        return;
      }
      if (cmd.type !== 'guard' && cmd.type !== 'focus' && cmd.type !== 'berserk') {
        if (u.status.afraid && this.rng.chance(B.afraidSkip)) {
          await this.fx({ type: 'status', target: u.id, text: 'AFRAID' });
          await this.say(`${u.name} is too scared to move!`, { tone: 'debuff' });
          return;
        }
        if (u.status.confused && this.rng.chance(B.confusedSkip)) {
          await this.fx({ type: 'status', target: u.id, text: 'CONFUSED' });
          await this.say(`${u.name} is confused and stumbles around!`, { tone: 'debuff' });
          return;
        }
      }
      if (cmd.type !== 'guard' && cmd.type !== 'focus') {
        await this.moves(u);
        if (u.dead || this.outcome) return;
      }
      switch (cmd.type) {
        case 'attack':
          return u.ghost ? this.hex(u) : this.basicAttack(u);
        case 'berserk':
          return this.berserk(u);
        case 'guard':
          return this.guard(u);
        case 'focus':
          return this.focus(u);
        case 'carry':
          return this.carry(u, cmd.target);
        case 'item':
          return this.useItem(u, cmd.item, cmd.target);
        case 'skill':
          return this.useSkill(u, cmd.skill, cmd.target);
        default:
          return undefined;
      }
    }

    // Anything but GUARD is movement, and Trollge sees movement. Moving while it stares at
    // you: "anger increases by 20. And marks the enemy with SEEN."
    async moves(u) {
      u.flags.moved = true;
      if (!u.status.stared) return;
      delete u.status.stared;
      await this.fx({ type: 'enemyAttack', kind: 'caught', target: u.id });
      await this.say(`${u.name} moves… and ${this.en} sees it!`, { tone: 'danger' });
      if (!u.ghost) await this.markSeen(u); // its Scratch would pass straight through a ghost anyway
      await this.noise(u, this.D.skills.staticStare.angerUp);
    }

    async basicAttack(u, o) {
      o = o || {};
      const e = this.enemy;
      const W = u.def.weapon;
      const B = this.D.balance;
      const power = o.power || W.power || B.basicPower;
      const hits = o.hits || W.hits;
      await this.fx({ type: 'lunge', from: u.id });
      if (o.line) await this.say(o.line);
      else if (W.line && hits === W.hits) await this.say(this.fill(W.line.replace('{n}', u.name)));
      else await this.say(hits > 1 ? `${u.name} ${W.verb} ${this.en} twice!` : `${u.name} ${W.verb} ${this.en}!`);
      for (let i = 0; i < hits; i++) {
        if (this.outcome) return;
        const mult = i === 0 ? 1 : W.followUpHitRate;
        if (!this.rollHit(u, e, mult)) {
          await this.fx({ type: 'miss', target: e.id });
          if (hits > 1) await this.say(i === 0 ? 'The first attack missed!' : 'The second attack whiffed!');
          else await this.say('The attack missed!');
          continue;
        }
        const crit = this.rng.chance(this.critChance(u));
        await this.hitEnemy(u, this.physical(u, e, power, { crit }), { crit });
        if (W.bleedTurns && !this.outcome) await this.bleedEnemy(W.bleedTurns); // Mysti's Knife
      }
      if (W.noiseChance && !this.outcome && this.rng.chance(W.noiseChance)) {
        await this.fx({ type: 'status', target: u.id, text: 'RING RING' });
        await this.say(`${u.name}’s ${W.name} starts blaring its ringtone!`, { tone: 'anger' });
        await this.noise(u, W.noiseAnger, { sound: 'ring' });
      }
    }

    async bleedEnemy(turns) {
      const e = this.enemy;
      const was = e.status.bleed;
      e.status.bleed = { turns: Math.max(turns, was ? was.turns : 0) };
      if (was) return;
      await this.fx({ type: 'status', target: e.id, text: 'BLEEDING' });
      await this.say(`${this.en} is BLEEDING!`, { tone: 'status' });
    }

    async berserk(u) {
      if (!this.present(this.enemy)) return;
      await this.basicAttack(u, { hits: 1, power: 0.9, line: `${u.name} delivers a roundhouse kick to ${this.en}’s face!` });
      if (this.outcome || u.dead) return;
      await this.say(`${u.name} just can’t calm down!`, { tone: 'buff' });
      await this.basicAttack(u, { hits: 1, power: 0.7, line: `${u.name} rushes at ${this.en}!` });
    }

    async guard(u) {
      const D = this.D;
      u.flags.guarding = true;
      await this.fx({ type: 'guard', target: u.id });
      await this.say(`${u.name} guards!`);
      if (u.status.stared) await this.say(`${u.name} holds perfectly still…`, { tone: 'status' });
      if (u.has('solidJohn') && !u.flags.solidUsed) {
        const P = D.passives.solidJohn;
        u.flags.solidUsed = true;
        u.flags.barrier = true;
        await this.fx({ type: 'barrier', target: u.id });
        await this.say(`A powerful barrier envelops ${u.name}!`, { tone: 'buff' });
        const bonus = Math.min(P.maxAtk, u.timesTargeted * P.atkPerTarget);
        if (bonus > 0) {
          this.addBuff(u, 'atk', bonus, 99, 'solidJohn');
          await this.say(`${u.name}’s attack increases!`, { tone: 'buff' });
        }
      }
      if (u.has('grouchBehavior')) {
        await this.say(`${u.name} squeezes into a locker. “THIS IS MY LOCKER, IT WAS MADE FOR ME!!!”`);
        await this.heal(u, D.passives.grouchBehavior.heal);
        await this.sound(u, 'shout'); // yelling, with Dolphin Man around
      }
      if (u.has('stealthCamo') && !u.flags.camoShown) {
        u.flags.camoShown = true;
        await this.say(`${u.name} blends right in. ${this.en} can’t single ${u.pr.him} out while ${u.pr.he} guards.`, { tone: 'status' });
      }
      u.res = Math.min(u.resMax, u.res + D.balance.guardRestore);
    }

    async focus(u) {
      const wasActive = this.freakyActive();
      u.res = Math.min(u.resMax, u.res + this.D.balance.guardRestore);
      await this.fx({ type: 'buff', target: u.id });
      await this.say(`${u.name} drifts quietly and gathers her spirit.`, { tone: 'status' });
      if (!wasActive && this.freakyActive()) {
        await this.say('Her strange machinations hum back to life…', { tone: 'status' });
      }
    }

    async carry(u, bodyId) {
      const body = this.unit(bodyId);
      if (!body || !body.dead || body.carriedBy || body.possessed) {
        await this.say(`${u.name} looks around… there’s no one left to pick up.`);
        return;
      }
      body.carriedBy = u.id;
      u.carrying.push(body.id);
      await this.fx({ type: 'carry', carrier: u.id, body: body.id });
      await this.say(`${u.name} picks up ${body.name}’s body!`);
      await this.say(`${u.name}’s speed decreases!`, { tone: 'debuff' });
      this.refresh();
    }

    async hex(u) {
      const e = this.enemy;
      const n = this.en;
      const M = u.def.weapon.moods && u.mood && u.def.weapon.moods[u.mood];
      await this.fx({ type: 'cast', from: u.id, kind: 'hex' });
      if (M) return this.moodHex(u, M);
      await this.say(`${u.name} ${u.def.weapon.verb} ${n} with her Magic Book…`);
      const pick = this.rng.pick(['atk', 'def', 'spd', 'confused', 'calm', 'blind']);
      switch (pick) {
        case 'atk':
          this.addBuff(e, 'atk', -0.2, 2, 'hexAtk');
          await this.say(`${n}’s attack decreases!`, { tone: 'debuff' });
          break;
        case 'def':
          this.addBuff(e, 'def', -0.2, 2, 'hexDef');
          await this.say(`${n}’s defense decreases!`, { tone: 'debuff' });
          break;
        case 'spd':
          this.addBuff(e, 'spd', -0.25, 2, 'hexSpd');
          await this.say(`${n}’s speed decreases!`, { tone: 'debuff' });
          break;
        case 'confused':
          e.status.confused = { turns: Math.max(1, e.status.confused ? e.status.confused.turns : 0) };
          await this.say(`${n} is confused!`, { tone: 'status' });
          break;
        case 'calm':
          await this.addAnger(-10);
          await this.say(`${n} calms down a little.`, { tone: 'status' });
          break;
        default:
          e.status.blind = { amount: 0.25, turns: 1 };
          await this.say(`${n} can’t see!`, { tone: 'status' });
      }
      await this.fx({ type: 'status', target: e.id, text: 'HEX' });
      this.refresh();
      return undefined;
    }

    // Her Hex, by mood: HAPPY soothes, ANGRY hurts, SAD weighs the slasher down.
    async moodHex(u, M) {
      const e = this.enemy;
      const n = this.en;
      if (u.mood === 'happy') {
        await this.say(`${u.name} giggles and hexes ${n} with her Magic Book…`);
        await this.addAnger(-M.angerDown);
        await this.say(`${n} calms down a little.`, { tone: 'status' });
        for (const w of this.corporeal()) await this.heal(w, M.heal);
        await this.say('Everyone feels a little better.', { tone: 'good' });
      } else if (u.mood === 'angry') {
        await this.say(`${u.name} slams her Magic Book into ${n}!`);
        const crit = this.rng.chance(this.critChance(u));
        await this.hitEnemy(u, this.physical(u, e, M.power, { magic: true, crit }), { crit, kind: 'hex' });
        if (this.outcome) return;
        this.addBuff(e, 'def', -M.defDown, M.turns, 'hexDef');
        await this.say(`${n}’s defense decreases!`, { tone: 'debuff' });
      } else {
        await this.say(`${u.name} sighs and hexes ${n} with her Magic Book…`);
        this.addBuff(e, 'atk', -M.atkDown, M.turns, 'hexAtk');
        this.addBuff(e, 'spd', -M.spdDown, M.turns, 'hexSpd');
        await this.say(`${n} feels heavy: attack and speed decrease!`, { tone: 'debuff' });
      }
      await this.fx({ type: 'status', target: e.id, text: 'HEX' });
      this.refresh();
    }

    // ------------------------------------------------------------ items
    async useItem(u, itemId, targetId) {
      const D = this.D;
      const it = D.items[itemId];
      const e = this.enemy;
      if (!it || !this.bag[itemId]) {
        await this.say(`${u.name} reaches into the bag… but it’s gone!`);
        return;
      }
      if (u.ghost) return;
      let t = targetId ? this.unit(targetId) : u;
      if (it.target === 'ally' && (!t || t.dead || t.ghost)) t = u;
      if (!it.keep) this.bag[itemId]--;
      this.stats.itemsUsed++;
      const given = t !== u && it.target === 'ally';
      await this.fx({ type: 'item', target: (t || u).id, item: itemId });

      switch (itemId) {
        case 'royalBurger':
        case 'cookie':
        case 'mayonnaise':
        case 'orangeJello': {
          await this.say(given ? `${u.name} gives ${t.name} ${this.withArticle(it)}.` : `${u.name} eats ${this.withArticle(it)}.`);
          await this.heal(t, it.heal, { item: true });
          const boost = t.has('fullBloodAussie') ? this.D.passives.fullBloodAussie.itemBoost : 1;
          if (itemId === 'cookie') {
            this.addBuff(t, 'atk', it.atkUp * boost, it.turns, 'cookieAtk');
            await this.say(`${t.name}’s attack increases!`, { tone: 'buff' });
            if (e.has('methAddict')) {
              await this.say(`${this.en} smells the cookie… METH Addict!`, { tone: 'danger' });
              await this.addAnger(D.passives.methAddict.anger);
            }
          }
          if (itemId === 'orangeJello') {
            this.addBuff(t, 'def', it.defUp * boost, it.turns, 'jelloDef');
            await this.say(`${t.name}’s defense greatly increases!`, { tone: 'buff' });
          }
          if (itemId === 'mayonnaise' && this.rng.chance(it.poisonChance)) {
            t.status.poison = { dmg: it.poisonDamage, turns: it.poisonTurns };
            await this.fx({ type: 'status', target: t.id, text: 'URANIUM' });
            await this.say(`Uh oh… ${t.name} has Uranium poisoning!`, { tone: 'debuff' });
          }
          break;
        }
        case 'balkanBoost': {
          await this.say(given ? `${u.name} gives ${t.name} a Balkan Boost.` : `${u.name} consumes a Balkan Boost.`);
          t.status.balkan = { phase: 'pending' };
          await this.say(`${t.name} feels nothing so far…`);
          if (t.has('uncleSink')) await this.uncleSink(t);
          this.bag.emptyBottle = (this.bag.emptyBottle || 0) + 1;
          break;
        }
        case 'emptyBottle': {
          if (!u.has('uncleSink')) {
            this.bag[itemId]++;
            await this.say(`${u.name} shakes the bottle. It’s empty.`);
            break;
          }
          await this.say(`${u.name} drinks from the seemingly empty bottle…`);
          await this.uncleSink(u);
          break;
        }
        case 'pocketSand': {
          await this.say(`${u.name} throws Pocket Sand into ${this.en}’s eyes!`);
          e.status.blind = { amount: it.blind, turns: it.turns };
          await this.fx({ type: 'status', target: e.id, text: 'BLIND' });
          await this.say(`${this.en} can’t see!`, { tone: 'status' });
          await this.addAnger(it.anger, { quiet: true });
          if (u.has('batterUp')) {
            const P = D.passives.batterUp;
            const got = this.gainCredits(P.credits);
            this.addBuff(u, 'atk', P.atkUp, P.turns, 'batterUp');
            this.addBuff(u, 'spd', P.spdUp, P.turns, 'batterUp');
            await this.fx({ type: 'credits', amount: got });
            await this.say(`Batter up! The team receives ${got} credits!`, { tone: 'good' });
            await this.say(`${u.name}’s attack and speed increase!`, { tone: 'buff' });
          }
          break;
        }
        case 'beerKeg': {
          await this.say(`${u.name} arms the Beer Keg and lets it roll…`);
          await this.fx({ type: 'explosion' });
          await this.say('KABOOM!', { tone: 'danger' });
          await this.hitEnemy(u, this.rng.range(it.damage), { kind: 'explosion' });
          await this.sound(u, 'boom');
          if (!this.outcome) await this.damageWorker(u, this.rng.range(it.selfDamage), { source: 'self' });
          break;
        }
        case 'masterLock': {
          await this.say(`${u.name} swings the Master Lock 607 around…`);
          await this.say('It does nothing.');
          break;
        }
        case 'deathward': {
          if (!u.has('deitySwindler')) {
            this.bag[itemId]++;
            await this.say(`${u.name} can’t make heads or tails of the DEATHWARD.`);
            break;
          }
          this.deathward = { turns: it.turns };
          await this.fx({ type: 'ward', target: u.id, all: true });
          await this.say(`${u.name} applies the DEATHWARD. “THESE are the forces you are choosing to mess with?”`);
          await this.say(`The whole team is protected from death for ${it.turns} turns!`, { tone: 'buff' });
          break;
        }
        default:
          await this.say(`${u.name} uses ${it.name}.`);
      }
      this.refresh();
    }

    async uncleSink(u) {
      await this.say(`Uncle Sink fears no drink! ${u.name} feels a little better.`, { tone: 'good' });
      await this.heal(u, this.D.passives.uncleSink.heal);
    }

    // ------------------------------------------------------------ skills
    skillCost(u, skillId) {
      if (skillId === 'tossGlasses' && u.flags.glassesOff) return 0;
      if (skillId === 'proxyLocator' && u.flags.proxy) return 0;
      return this.D.skills[skillId].cost;
    }

    skillName(u, skillId) {
      const sk = this.D.skills[skillId];
      if (skillId === 'tossGlasses' && u.flags.glassesOff) return sk.reequipName;
      if (skillId === 'proxyLocator' && u.flags.proxy) return sk.offName;
      return sk.name;
    }

    // Once-per-battle skills that have already been used.
    skillSpent(skillId) {
      if (skillId === 'confidentialDocs') return !!this.intel;
      if (skillId === 'hiddenDocs') return !!this.secrets;
      if (skillId === 'helicopterEscape') return !!this.chopper;
      return !!this.spent[skillId];
    }

    skillZone(u) {
      const C = this.D.balance.skillCheck;
      const zone = C.baseZone + this.stat(u, 'smt') * C.perSmarts;
      return clamp(zone, 0.05, 0.8);
    }

    async skillCheck(u, kind) {
      const C = this.D.balance.skillCheck;
      const M = this.D.passives.moralSupport;
      const support = this.moralSupportActive();
      const fuel = kind === 'fuel';
      const res = await this.io.skillCheck({
        who: u.id,
        name: u.name,
        kind,
        title: fuel ? 'FUEL SKILL CHECK' : 'BATTERY SKILL CHECK',
        zone: this.skillZone(u),
        ms: fuel ? C.pourMs : C.clipMs,
        slow: support ? (fuel ? M.fuelSlow : M.clipSlow) : 1, // Moral Support slows the check down
        moralSupport: support,
        rng: this.rng,
      });
      return !!res;
    }

    statLine() {
      const e = this.enemy;
      const r = (k) => Math.round(this.stat(e, k));
      return `${this.enemyDef.title}: ${e.hp}/${e.maxHp} health, ANGER ${Math.round(e.anger)}. ATK ${r('atk')}, DEF ${r('def')}, SPD ${r('spd')}.`;
    }

    async useSkill(u, skillId, targetId) {
      const D = this.D;
      const sk = D.skills[skillId];
      const e = this.enemy;
      const n = this.en;
      const cost = this.skillCost(u, skillId);
      if (this.skillSpent(skillId)) {
        await this.say(`${sk.name} can only be used once per battle.`);
        return;
      }
      if (u.res < cost) {
        await this.say(`${u.name} is too exhausted to do that!`);
        return;
      }
      u.res -= cost;
      this.refresh();

      switch (skillId) {
        // ---------------- MEL
        case 'fuelCheck': {
          await this.say(`${u.name} starts pouring fuel…`);
          const ok = await this.skillCheck(u, 'fuel');
          await this.say('…');
          if (ok) {
            const got = this.gainCredits(u.hasBuff('cookieAtk') ? sk.creditsWithCookie : sk.credits);
            await this.fx({ type: 'credits', amount: got });
            await this.say(`Done! The team receives ${got} credits!`, { tone: 'good' });
            for (const w of this.corporeal()) this.addBuff(w, 'def', sk.teamDefUp, sk.turns, 'fuelDef');
            await this.say('The team’s defense increases!', { tone: 'buff' });
          } else {
            await this.say(`The fuel canister falls on ${u.name}’s foot!`, { tone: 'bad' });
            await this.damageWorker(u, this.rng.range(sk.failDamage), { source: 'self' });
            if (!this.outcome) await this.noise(u, sk.failAnger, { sound: 'clang' });
          }
          break;
        }
        case 'tossGlasses': {
          if (u.flags.glassesOff) {
            u.flags.glassesOff = false;
            await this.fx({ type: 'portrait', target: u.id });
            await this.say(`${u.name} re-equips a new pair of glasses!`);
            await this.say(`${u.name} can see again!`, { tone: 'buff' });
            break;
          }
          await this.say(`${u.name} throws ${u.pr.his} glasses!`);
          await this.fx({ type: 'throw', from: u.id, item: 'glasses' });
          const hit = this.rollHit(u, e);
          u.flags.glassesOff = true;
          await this.fx({ type: 'portrait', target: u.id });
          if (hit) {
            const crit = this.rng.chance(this.critChance(u));
            await this.hitEnemy(u, this.physical(u, e, sk.power, { crit }), { crit });
            if (!this.outcome && this.rng.chance(sk.bleedChance)) await this.bleedEnemy(sk.bleedTurns);
          } else {
            await this.fx({ type: 'miss', target: e.id });
            await this.say(`The glasses miss ${n}!`);
          }
          e.status.shards = { turns: sk.shardsTurns };
          await this.say(`Glass falls around ${n}’s feet!`, { tone: 'status' });
          await this.say(`${u.name} can’t see as well…`, { tone: 'debuff' });
          await this.sound(u, 'glass');
          break;
        }
        case 'melsPages': {
          await this.say(`${u.name} uses ${u.pr.his} pages!`);
          await this.fx({ type: 'cast', from: u.id, kind: 'pages' });
          let hits = 0;
          let crits = 0;
          for (let i = 0; i < sk.hits; i++) {
            if (this.outcome) break;
            if (!this.rollHit(u, e)) {
              await this.fx({ type: 'miss', target: e.id, quick: true });
              continue;
            }
            const crit = this.rng.chance(sk.critChance);
            hits++;
            if (crit) crits++;
            await this.hitEnemy(u, this.physical(u, e, sk.power, { crit, ignoreDef: true }), {
              crit,
              quietCrit: true,
              quick: true,
              kind: 'page',
            });
          }
          await this.say(`${hits} of ${sk.hits} pages hit ${n}!`);
          if (crits) await this.say(crits > 1 ? `It hits a weak point! (x${crits})` : 'It hits a weak point!', { tone: 'crit' });
          break;
        }
        case 'watermelonLob': {
          await this.say(`${u.name} lobs a watermelon… me lone :3`);
          await this.fx({ type: 'explosion' });
          await this.say('KABOOM!', { tone: 'danger' });
          await this.hitEnemy(u, e.maxHp * sk.percent, { kind: 'explosion' });
          await this.sound(u, 'boom');
          for (const w of this.party) {
            if (this.outcome) break;
            if (w.dead || w.status.phasing) continue;
            if (w.ghost) {
              await this.say(`The blast passes right through ${w.name}.`);
              continue;
            }
            await this.damageWorker(w, D.health.start * sk.percent, { source: 'lob', raw: true });
          }
          break;
        }

        // ---------------- JOHN
        case 'capSlap': {
          const streak = Math.min(u.flags.capStreak || 0, sk.maxStreak);
          const power = sk.power * (1 + sk.streakBonus * streak);
          await this.fx({ type: 'lunge', from: u.id });
          await this.say(streak ? `${u.name} slaps ${n} with ${u.pr.his} cap! (x${streak + 1})` : `${u.name} slaps ${n} with ${u.pr.his} cap!`);
          if (this.rollHit(u, e)) {
            const crit = this.rng.chance(this.critChance(u));
            await this.hitEnemy(u, this.physical(u, e, power, { crit }), { crit });
            if (streak) await this.say('The slaps are getting stronger!', { tone: 'buff' });
          } else {
            await this.fx({ type: 'miss', target: e.id });
            await this.say('The slap missed!');
          }
          u.flags.capStreak = streak + 1;
          break;
        }
        case 'nap': {
          u.status.asleep = { turns: this.rng.range(sk.turns), fresh: true };
          await this.fx({ type: 'portrait', target: u.id });
          await this.say(`${u.name} takes a nap…`);
          await this.say('Zzz…');
          break;
        }
        case 'lunchBox': {
          const ally = this.unit(targetId);
          u.flags.lunch = {
            turns: this.rng.range(sk.delay),
            allyId: ally && !ally.dead && !ally.ghost && ally !== u ? ally.id : null,
          };
          await this.say(`${u.name} is looking for ${u.pr.his} Lunch Box!`);
          break;
        }
        case 'batteryCheck': {
          await this.say(`${u.name} is putting in a battery…`);
          const ok = await this.skillCheck(u, 'battery');
          if (ok) {
            await this.fx({ type: 'shock' });
            await this.say(`Success! ${n} is electrically shocked!`, { tone: 'good' });
            await this.hitEnemy(u, this.physical(u, e, sk.power, { defIgnore: sk.defIgnore }), { kind: 'shock' });
            this.addBuff(u, 'atk', sk.atkUp, sk.turns, 'battery');
            await this.say(`${u.name}’s attack increases!`, { tone: 'buff' });
          } else {
            await this.fx({ type: 'shockSelf', target: u.id });
            await this.say(`Missed… ${u.name} is shocked!`, { tone: 'bad' });
            await this.damageWorker(u, this.rng.range(sk.failDamage), { source: 'self' });
          }
          if (!u.dead) await this.sound(u, 'battery'); // "installing a battery will trigger the Dolphinman"
          break;
        }

        // ---------------- PURPL LADY
        case 'seriousChills': {
          await this.fx({ type: 'cast', from: u.id, kind: 'chill' });
          await this.say(`${u.name} gives ${n} some serious chills!`);
          this.addBuff(e, 'def', -sk.defDown, sk.turns, 'chills');
          this.addBuff(e, 'spd', -sk.spdDown, sk.turns, 'chills');
          e.status.chilled = { turns: sk.turns };
          await this.fx({ type: 'status', target: e.id, text: 'FREEZING' });
          await this.say(`${n} is FREEZING!`, { tone: 'status' });
          await this.say(`${n}’s defense and speed drastically decrease!`, { tone: 'debuff' });
          break;
        }
        case 'shadowsHand': {
          await this.fx({ type: 'cast', from: u.id, kind: 'shadow' });
          await this.say(`${u.name} solidifies just enough to hit ${n}!`);
          const crit = this.rng.chance(this.critChance(u));
          await this.hitEnemy(u, this.physical(u, e, sk.power, { magic: true, crit, defIgnore: sk.defIgnore }), {
            crit,
            kind: 'shadow',
          });
          if (!this.outcome) {
            e.status.confused = { turns: sk.confuseTurns };
            await this.fx({ type: 'status', target: e.id, text: 'CONFUSED' });
            await this.say(`${n} is very confused!`, { tone: 'status' });
          }
          break;
        }
        case 'foresight': {
          this.foresightTurns = sk.turns;
          await this.fx({ type: 'cast', from: u.id, kind: 'foresight' });
          await this.say(`${u.name} peers into what’s coming…`);
          if (!this.enemyActed) await this.warnPower(u);
          break;
        }
        case 'phaseForItems': {
          u.status.phasing = { turns: this.rng.range(sk.turns), fresh: true };
          await this.fx({ type: 'phase', target: u.id });
          await this.say(`${u.name} phases into the lockers to look for items…`);
          break;
        }

        // ---------------- CAPTAIN JIM
        case 'proxyLocator': {
          if (u.flags.proxy) {
            u.flags.proxy = false;
            await this.say(`${u.name} switches the Proxy Locator off.`);
            break;
          }
          u.flags.proxy = true;
          await this.fx({ type: 'cast', from: u.id, kind: 'proxy' });
          await this.say(`${u.name} switches on the Proxy Locator. It starts crackling…`);
          break;
        }
        case 'matthewsAid': {
          await this.fx({ type: 'cast', from: u.id, kind: 'aid' });
          await this.say(`${u.name} calls in Matthew’s AID. “Man I hate that four-eyes kid.”`);
          for (const w of this.party) if (!w.dead) this.addBuff(w, 'all', sk.allUp, sk.turns, 'aid');
          await this.fx({ type: 'buff', target: u.id });
          await this.say('Everyone’s stats slightly increase!', { tone: 'buff' });
          break;
        }
        case 'confidentialDocs': {
          this.intel = true;
          await this.fx({ type: 'cast', from: u.id, kind: 'docs' });
          await this.say(`${u.name} flips through the Confidential Documents…`);
          await this.say(this.statLine(), { tone: 'status' });
          await this.say('The team knows where to hit now! Crit chance increases!', { tone: 'buff' });
          if (!this.enemyActed) {
            this.intentWord = this.intentPower(this.intent);
            if (this.intentWord) await this.say(`${n}’s next attack will be ${this.intentWord}.`, { tone: 'warn' });
          }
          break;
        }
        case 'bearTrap': {
          let t = this.unit(targetId);
          if (!t || t.dead || t.ghost) t = u;
          t.status.trap = { turns: sk.turns, by: u.id, fresh: true };
          await this.fx({ type: 'item', target: t.id, item: 'bearTrap' });
          await this.say(t === u ? `${u.name} sets a bear trap at ${u.pr.his} own feet.` : `${u.name} sets a bear trap at ${t.name}’s feet.`);
          break;
        }
        case 'helicopterEscape': {
          this.chopper = { turns: sk.turns };
          await this.fx({ type: 'cast', from: u.id, kind: 'chopper' });
          await this.say(`${u.name} radios the chopper: “The chopper is touchdown, let’s get out of here!”`);
          for (const w of this.party) {
            if (w.dead) continue;
            this.addBuff(w, 'def', sk.defUp, 99, 'chopper');
            this.addBuff(w, 'eva', sk.evaUp, 99, 'chopper');
          }
          await this.fx({ type: 'buff', target: u.id });
          await this.say('Everyone’s DEFENSE and EVASION significantly increase!', { tone: 'buff' });
          await this.say(`The chopper will land in ${sk.turns} turns. Hold on until then!`, { tone: 'good' });
          break;
        }
        case 'zingerBurger': {
          await this.fx({ type: 'item', target: u.id, item: 'zingerBurger' });
          await this.say(`${u.name} unwraps a Zinger Burger. “Would you bounce on it for a Zinger Burger? ‘Cuz me go boing-boing!”`);
          await this.heal(u, sk.heal);
          u.status.happy = { turns: sk.happyTurns };
          this.addBuff(u, 'spd', sk.happySpd, sk.happyTurns, 'happy');
          this.addBuff(u, 'crit', sk.happyCrit, sk.happyTurns, 'happy');
          this.addBuff(u, 'hit', sk.happyHit, sk.happyTurns, 'happy');
          await this.say(`${u.name} is HAPPY!`, { tone: 'buff' });
          break;
        }

        // ---------------- MYSTI
        case 'tacticalStab': {
          await this.fx({ type: 'lunge', from: u.id });
          await this.say(`${u.name} goes for a Tactical Stab!`);
          if (!this.rollHit(u, e)) {
            await this.fx({ type: 'miss', target: e.id });
            await this.say('The stab missed!');
            break;
          }
          const vs = (sk.strongVs && sk.strongVs[e.id]) || 1;
          const crit = this.rng.chance(this.critChance(u));
          const dmg = this.physical(u, e, sk.power * vs, { crit, ignoreDef: true }) + e.hp * sk.currentHp;
          if (vs > 1) await this.say(`It’s extremely effective against ${n}!`, { tone: 'crit' });
          await this.hitEnemy(u, dmg, { crit, kind: 'stab' });
          if (this.outcome) break;
          await this.bleedEnemy(sk.bleedTurns);
          this.addBuff(e, 'def', -sk.defDown, sk.turns, 'stab');
          await this.say(`${n}’s defense decreases!`, { tone: 'debuff' });
          break;
        }
        case 'exterminate': {
          await this.fx({ type: 'lunge', from: u.id });
          await this.say(`${u.name}: “We’re not playing anymore games…” Gulp.`);
          if (!this.rollHit(u, e)) {
            await this.fx({ type: 'miss', target: e.id });
            await this.say(`${n} slips away!`);
          } else if (!e.flags.barelyStanding && this.rng.chance(sk.chance)) {
            // Slashers can't be killed, so "eliminate" drops it straight to BARELY STANDING.
            await this.fx({ type: 'exterminate' });
            await this.say(`${u.name} finds the one spot that matters!`, { tone: 'crit' });
            const floor = Math.floor(e.maxHp * this.enemyDef.barelyStandingAt);
            await this.hitEnemy(u, Math.max(1, e.hp - floor), { crit: true, quietCrit: true, kind: 'exterminate' });
          } else {
            const crit = this.rng.chance(this.critChance(u));
            await this.hitEnemy(u, this.physical(u, e, sk.power, { crit }), { crit });
            if (!this.outcome) await this.say(`${n} is still standing…`);
          }
          if (this.outcome) break;
          u.status.exposed = { turns: sk.exposedTurns, fresh: true };
          await this.fx({ type: 'status', target: u.id, text: 'VULNERABLE' });
          await this.say(`${u.name} is left VULNERABLE!`, { tone: 'debuff' });
          break;
        }
        case 'phantomClone': {
          this.spent.phantomClone = true;
          await this.fx({ type: 'cast', from: u.id, kind: 'clone' });
          await this.say(`${u.name} takes a droplet of Bababooey’s Phantom Clone Extract…`);
          this.addBuff(u, 'eva', sk.evaUp, sk.evaTurns, 'clone');
          this.addBuff(u, 'spd', sk.spdUp, 99, 'cloneSpd');
          await this.say(`${u.name} flickers! ${cap(u.pr.his)} evasion massively increases!`, { tone: 'buff' });
          await this.say(`${u.name}’s speed significantly increases for the rest of the battle!`, { tone: 'buff' });
          if (u.status.seen || u.status.stared || this.hunted() === u) {
            delete u.status.seen;
            delete u.status.stared;
            if (this.hunted() === u) delete e.status.hunt;
            await this.say(`${n} loses track of ${u.name}!`, { tone: 'good' });
          }
          break;
        }
        case 'hiddenDocs': {
          await this.fx({ type: 'cast', from: u.id, kind: 'docs' });
          await this.say(`${u.name} digs for the extra-secret files on ${n}…`);
          if (!this.rng.chance(sk.chance)) {
            await this.say('…they’re buried too deep. Nothing this time.');
            break;
          }
          this.secrets = true;
          await this.say(`${u.name} found the Hidden Documents!`, { tone: 'good' });
          await this.say(this.enemyDef.secret, { tone: 'status' });
          await this.say(this.statLine(), { tone: 'status' });
          await this.say('Extra EXP and CREDITS after the battle!', { tone: 'good' });
          break;
        }
        default:
          await this.say(`${u.name} uses ${sk.name}.`);
      }
      this.refresh();
    }

    async returnFromPhase(u) {
      const D = this.D;
      const sk = D.skills.phaseForItems;
      delete u.status.phasing;
      await this.fx({ type: 'unphase', target: u.id });
      await this.say(`${u.name} phases back out of the lockers!`);
      if (this.rng.chance(sk.nothingChance)) {
        await this.say('…but she found nothing.');
        return;
      }
      const n = this.rng.range(sk.finds);
      const found = [];
      for (let i = 0; i < n; i++) {
        const pool = this.rng.chance(sk.rareChance) ? D.phaseLoot.rare : D.phaseLoot.common;
        const id = this.rng.pick(pool);
        this.bag[id] = (this.bag[id] || 0) + 1;
        found.push(D.items[id].name);
      }
      await this.fx({ type: 'loot', items: found });
      await this.say(`The team receives: ${joinNames(found)}!`, { tone: 'good' });
      await this.checkPossession();
    }

    // ------------------------------------------------------------ the slasher's actions
    async enemyAct() {
      const D = this.D;
      const S = this.enemyDef;
      const B = D.balance;
      const e = this.enemy;
      this.enemyActed = true;
      const intent = Object.assign({}, this.intent || { kind: 'idle' });

      if (e.status.stunned) {
        const st = e.status.stunned;
        if (st.slots >= 2) await this.say(S.lines.dazed.replace('{by}', st.by || 'the workers'));
        else await this.say(`${this.en} is trying to get up!`);
        st.slots--;
        if (st.slots <= 0) delete e.status.stunned;
        this.lastEnemyKind = 'stunned';
        this.refresh();
        return;
      }

      if (e.status.shards && !e.status.fetal) {
        await this.say(`${this.en} steps on the glass shards!`);
        await this.hitEnemy(null, this.rng.range(D.skills.tossGlasses.shardsDamage), { kind: 'shards' });
        if (e.status.stunned) return; // the shards knocked it down
      }

      if (e.status.confused && !e.status.fetal && this.rng.chance(B.enemyConfusedFumble)) {
        this.lastEnemyKind = 'confused';
        if (this.rng.chance(0.5)) {
          await this.say(`${this.en} is confused… and smacks ${this.pr.him}self in the face!`, { tone: 'good' });
          await this.hitEnemy(null, this.stat(e, 'atk') * 0.35, { kind: 'self' });
        } else {
          await this.say(`${this.en} is confused and flails at nothing!`);
        }
        return;
      }

      const act = { trollge: this.actTrollge, dolphin: this.actDolphin }[e.id] || this.actSid;
      await act.call(this, intent);
      this.refresh();
    }

    // At high ANGER (Sid: 60+) the slasher isn't done after one move.
    async enemyFollowUp() {
      const e = this.enemy;
      const A = this.enemyDef.anger;
      if (this.outcome || e.status.stunned || !A.frenzyAt || e.anger < A.frenzyAt) return;
      const t = this.pickEnemyTarget();
      if (!t) return;
      await this.say(`${this.en} isn’t done yet!`, { tone: 'danger' });
      if (e.id === 'trollge') await this.claw(t, t.status.seen ? 'scratch' : 'claws');
      else await this.sidBasic({ kind: e.flags.overflow ? 'gun' : 'melee', targetId: t.id });
      this.refresh();
    }

    lapping() {
      const F = this.enemyDef.fastRunner;
      return !!F && F.lap && this.enemy.flags.overflow && !this.enemy.status.stunned;
    }

    // Fast Runner's second move of the turn: it goes for whoever it has SEEN, or anyone.
    async enemyLap() {
      const e = this.enemy;
      if (this.outcome || e.status.stunned || !e.flags.overflow) return;
      const t = this.pickEnemyTarget((u) => !!u.status.seen) || this.pickEnemyTarget();
      if (!t) return;
      await this.fx({ type: 'enemyAttack', kind: 'lap', target: t.id });
      await this.say(`${this.en} darts back around the hallway!`, { tone: 'danger' });
      await this.claw(t, t.status.seen ? 'scratch' : 'claws');
      this.refresh();
    }

    validTarget(id) {
      const t = this.unit(id);
      return !!t && !t.dead && !t.ghost;
    }

    // Captain Jim's Bear Trap snaps before a physical blow lands. True if it caught the slasher.
    async trapSnaps(t) {
      if (!t.status.trap) return false;
      const sk = this.D.skills.bearTrap;
      const e = this.enemy;
      const setter = this.unit(t.status.trap.by);
      delete t.status.trap;
      await this.fx({ type: 'enemyAttack', kind: 'trapped', target: t.id });
      await this.say(`${this.en} goes for ${t.name}… SNAP! ${cap(this.pr.he)} steps right into the bear trap!`, { tone: 'good' });
      await this.hitEnemy(setter && !setter.dead ? setter : null, this.rng.range(sk.damage), { kind: 'trap' });
      if (this.outcome) return true;
      this.addBuff(e, 'def', -sk.vulnerable, sk.vulnerableTurns, 'vulnerable');
      e.status.vulnerable = { turns: sk.vulnerableTurns };
      await this.fx({ type: 'status', target: e.id, text: 'VULNERABLE' });
      await this.say(`${this.en} is VULNERABLE!`, { tone: 'status' });
      return true;
    }

    // Mysti's Knife: "small chance to parry attacks" that come within reach.
    async parried(t) {
      const W = t.def.weapon;
      if (!W || !W.parryChance || t.status.asleep || !this.rng.chance(W.parryChance)) return false;
      await this.fx({ type: 'block', target: t.id });
      await this.say(W.parryLine.replace('{n}', t.name), { tone: 'good' });
      return true;
    }

    // ---------------- SID
    async actSid(intent) {
      const S = this.enemyDef;
      const sid = this.enemy;
      // His plan was made at the start of the turn; ANGER may have changed since.
      if (sid.flags.overflow) {
        if (intent.kind === 'melee') intent.kind = 'gun';
        if (intent.kind === 'cookie') {
          await this.say('Sid reaches for a cookie… but he’s too angry to eat!');
          intent = { kind: 'gun' };
        }
      } else if (intent.kind === 'gun' || intent.kind === 'magdump' || intent.kind === 'deagle') {
        intent = { kind: 'melee', targetId: intent.targetId };
      }
      const single = intent.kind === 'melee' || intent.kind === 'gun';
      if (single && !this.validTarget(intent.targetId)) {
        const t = this.pickEnemyTarget();
        intent.targetId = t && t.id;
      }
      // Stealth Camo: a guarding Captain Jim can't be singled out.
      const planned = single ? this.unit(intent.targetId) : null;
      if (planned && this.hidden(planned)) {
        const t = this.pickEnemyTarget();
        if (!t) {
          await this.say(`Sid looks around for ${planned.name}, but can’t find him anywhere!`, { tone: 'good' });
          this.lastEnemyKind = 'lost';
          return;
        }
        await this.say(`Sid loses track of ${planned.name}, and turns on ${t.name} instead!`, { tone: 'warn' });
        intent.targetId = t.id;
      }
      if (single && intent.targetId && sid.anger >= S.anger.wildAt && this.rng.chance(S.anger.wildChance)) {
        const t = this.rng.pick(this.enemyTargets().filter((u) => !this.hidden(u)));
        if (t && t.id !== intent.targetId) {
          intent.targetId = t.id;
          await this.say('Sid is losing control!', { tone: 'danger' });
        }
      }
      if (single && !intent.targetId) {
        await this.say('Sid watches the workers…');
        this.lastEnemyKind = 'idle';
        return;
      }

      switch (intent.kind) {
        case 'melee':
        case 'gun':
          await this.sidBasic(intent);
          break;
        case 'magdump':
          await this.sidMagdump();
          break;
        case 'cookie':
          await this.sidCookie();
          break;
        case 'claims':
          await this.sidClaims();
          break;
        case 'deagle':
          await this.sidDeagle();
          break;
        default:
          await this.say('Sid watches the workers…');
      }
      this.lastEnemyKind = intent.kind;
    }

    async sidBasic(intent) {
      const S = this.enemyDef;
      const sid = this.enemy;
      const t = this.unit(intent.targetId);
      if (!t) return;
      const move = this.rng.pick(intent.kind === 'gun' ? S.gunAttacks : S.melee);
      t.timesTargeted++;
      if (await this.trapSnaps(t)) return;
      await this.fx({ type: 'enemyAttack', kind: intent.kind, target: t.id });
      await this.say(move.text.replace('{t}', t.name));
      if (move.close && (await this.parried(t))) return;
      if (!this.rollHit(sid, t)) {
        await this.fx({ type: 'miss', target: t.id });
        await this.say(`${t.name} dodges!`, { tone: 'good' });
        return;
      }
      const crit = this.rng.chance(this.critChance(sid) + move.crit);
      const dmg = this.physical(sid, t, move.power, { crit });
      if (crit) await this.say(`It hits ${t.name} on the head!`, { tone: 'crit' });
      await this.damageWorker(t, dmg, { source: intent.kind === 'gun' ? 'gun' : 'enemy' });
    }

    async sidMagdump() {
      const D = this.D;
      const S = this.enemyDef;
      const M = D.skills.magdump;
      const sid = this.enemy;
      const n = this.rng.range(M.bullets);
      let acc = M.accuracy + (sid.flags.deagleFocus ? S.weapon.magdumpAccuracyBonus : 0);
      acc -= S.armor.hitRatePenalty;
      if (sid.status.blind) acc -= sid.status.blind.amount;
      acc = clamp(acc, 0.05, 0.95);
      await this.fx({ type: 'enemyAttack', kind: 'magdump' });
      await this.say('Sid empties the mag on his gun!', { tone: 'danger' });
      const hitsOn = {};
      const passedThrough = new Set();
      for (let i = 0; i < n; i++) {
        const pool = this.party.filter((u) => !u.dead && !u.status.phasing);
        if (!pool.length || this.outcome) break;
        const t = this.rng.pick(pool);
        t.timesTargeted++;
        if (t.ghost) {
          passedThrough.add(t.name);
          await this.fx({ type: 'shot', target: t.id, hit: false, ghost: true });
          continue;
        }
        if (!this.rng.chance(acc)) {
          await this.fx({ type: 'shot', target: t.id, hit: false });
          continue;
        }
        await this.fx({ type: 'shot', target: t.id, hit: true });
        const crit = this.rng.chance(this.critChance(sid));
        const dmg = this.physical(sid, t, M.power, { crit });
        hitsOn[t.id] = (hitsOn[t.id] || 0) + 1;
        await this.damageWorker(t, dmg, { source: 'magdump', silent: true });
      }
      const landed = Object.values(hitsOn).reduce((s, v) => s + v, 0);
      await this.say(`${n} ${n === 1 ? 'shot' : 'shots'} fired… ${landed} ${landed === 1 ? 'hits' : 'hit'}!`);
      if (passedThrough.size) await this.say(`Bullets pass right through ${joinNames([...passedThrough])}.`);
      for (const id of Object.keys(hitsOn)) {
        const t = this.unit(id);
        if (!t.dead) await this.announce(t);
      }
    }

    async sidCookie() {
      const sk = this.D.skills.jumboCookie;
      const sid = this.enemy;
      await this.fx({ type: 'enemyAttack', kind: 'cookie' });
      await this.say('Sid pulls a Cookie from his pocket and munches down!');
      this.addBuff(sid, 'atk', sk.atkUp, sk.turns, 'jumboCookie');
      await this.say('Sid’s attack increases!', { tone: 'danger' });
      await this.addAnger(-sk.angerDown);
      await this.say('Sid calms down a little.');
      await this.fx({ type: 'enemyPose' });
    }

    async sidClaims() {
      const D = this.D;
      const sk = D.skills.psychoticClaims;
      const S = this.enemyDef;
      await this.fx({ type: 'enemyAttack', kind: 'claims' });
      await this.say('Sid starts rambling…');
      await this.say(`Sid: ${this.rng.pick(S.claimsLines)}`, { tone: 'sid' });
      for (const u of this.party) {
        if (u.dead || u.status.phasing) continue;
        this.addBuff(u, 'all', -sk.statDown, sk.turns, 'claims');
        if (this.rng.chance(this.stat(u, 'brv') * sk.resistPerBravery)) {
          await this.say(`${u.name} shrugs it off.`);
          continue;
        }
        if (this.rng.chance(0.5)) {
          u.status.afraid = { turns: sk.statusTurns };
          await this.fx({ type: 'status', target: u.id, text: 'AFRAID' });
          await this.say(`${u.name} is AFRAID!`, { tone: 'debuff' });
        } else {
          u.status.confused = { turns: sk.statusTurns };
          await this.fx({ type: 'status', target: u.id, text: 'CONFUSED' });
          await this.say(`${u.name} is confused!`, { tone: 'debuff' });
        }
      }
      await this.say('Everyone’s stats slightly decrease!', { tone: 'debuff' });
      await this.addAnger(sk.angerUp);
    }

    async sidDeagle() {
      const S = this.enemyDef;
      const sid = this.enemy;
      await this.fx({ type: 'enemyAttack', kind: 'deagle' });
      await this.say('Sid spins the Desert Eagle around his finger…');
      await this.addAnger(this.rng.range(S.weapon.itemAnger));
      sid.flags.deagleFocus = true;
      await this.say('Sid’s aim sharpens!', { tone: 'danger' });
    }

    // ---------------- TROLLGE
    async actTrollge(intent) {
      const S = this.enemyDef;
      const e = this.enemy;
      let kind = intent.kind;
      if (kind !== 'stare' && kind !== 'scratch' && kind !== 'claws') {
        await this.say(`${this.en} watches the workers…`);
        this.lastEnemyKind = 'idle';
        return;
      }
      const reachable = (u) => !!u && !u.dead && !u.ghost && !this.hidden(u);
      const inSight = (u) => !!u && this.watchTargets().includes(u);
      const planned = this.unit(intent.targetId);
      let t = planned;
      // Scratch "can only hit SEEN enemies": if its mark is gone, it claws instead.
      if (kind === 'scratch' && !(reachable(t) && t.status.seen)) {
        const other = this.pickEnemyTarget((u) => !!u.status.seen);
        if (other) t = other;
        else kind = 'claws';
      }
      if (!(kind === 'stare' ? inSight(t) : reachable(t))) {
        t = (kind === 'stare' && this.pickWatchTarget((u) => !u.status.stared)) || this.pickEnemyTarget();
        if (!t) {
          await this.say(`${this.en} looks around, but can’t find anyone!`, { tone: 'good' });
          this.lastEnemyKind = 'lost';
          return;
        }
        if (planned && this.hidden(planned)) {
          await this.say(`${this.en} loses track of ${planned.name}, and turns on ${t.name} instead!`, { tone: 'warn' });
        }
      }
      // "...sometimes less controllable": a random victim at 90+ ANGER.
      if (kind === 'claws' && e.anger >= S.anger.wildAt && this.rng.chance(S.anger.wildChance)) {
        const wild = this.rng.pick(this.enemyTargets().filter((u) => !this.hidden(u)));
        if (wild && wild !== t) {
          t = wild;
          await this.say(`${this.en} is losing control!`, { tone: 'danger' });
        }
      }
      if (kind === 'stare') await this.stare(t);
      else await this.claw(t, kind);
      this.lastEnemyKind = kind;
    }

    // Static Stare: whoever it stares at must not move until the end of the next turn.
    async stare(t) {
      t.status.stared = { turns: 1, fresh: true };
      await this.fx({ type: 'enemyAttack', kind: 'stare', target: t.id });
      await this.say(`${this.en} stares at ${t.name}…`, { tone: 'danger' });
      await this.fx({ type: 'status', target: t.id, text: 'STARED AT' });
      await this.say(`Don’t move, ${t.name}… GUARD and stay perfectly still.`, { tone: 'warn' });
      this.refresh();
    }

    // Claws (a basic attack) or Scratch.
    async claw(t, kind) {
      const D = this.D;
      const S = this.enemyDef;
      const e = this.enemy;
      const scratch = kind === 'scratch';
      const move = scratch
        ? { text: this.rng.pick(S.scratchLines), power: D.skills.scratch.power, crit: D.skills.scratch.crit }
        : this.rng.pick(S.claws);
      t.timesTargeted++;
      if (await this.trapSnaps(t)) return;
      await this.fx({ type: 'enemyAttack', kind, target: t.id });
      await this.say(move.text.replace('{t}', t.name));
      if (await this.parried(t)) return;
      // Statokinetic Dissociation: its basic attacks barely register someone who hasn't moved.
      const still = !scratch && e.has('statokineticDissociation') && !t.flags.moved;
      if (!this.rollHit(e, t, still ? D.passives.statokineticDissociation.hitMult : 1)) {
        await this.fx({ type: 'miss', target: t.id });
        await this.say(still ? `${t.name} hasn’t moved… the claws swipe right past!` : `${t.name} dodges!`, { tone: 'good' });
        return;
      }
      const crit = this.rng.chance(this.critChance(e) + move.crit);
      const dmg = this.physical(e, t, move.power, { crit });
      if (crit) await this.say(`It tears right into ${t.name}!`, { tone: 'crit' });
      await this.damageWorker(t, dmg, { source: 'enemy' });
      if (!t.dead && !this.outcome) await this.frighten(t);
    }

    // Claws: "Full of darkness and fears. Makes enemies feel AFRAID on hit."
    async frighten(t) {
      const W = this.enemyDef.weapon;
      const resist = clamp((this.stat(t, 'brv') - W.braveryResist) / 200, 0, 0.75);
      if (this.rng.chance(resist)) {
        await this.say(`${t.name} refuses to be afraid.`);
        return;
      }
      const was = t.status.afraid;
      t.status.afraid = { turns: Math.max(W.afraidTurns, was ? was.turns : 0) };
      if (was) return;
      await this.fx({ type: 'status', target: t.id, text: 'AFRAID' });
      await this.say(`${t.name} is AFRAID!`, { tone: 'debuff' });
    }

    // ---------------- DOLPHIN MAN
    async actDolphin(intent) {
      const S = this.enemyDef;
      const e = this.enemy;
      let kind = intent.kind;
      if (e.status.fetal && kind !== 'fetal') kind = 'curled';
      if (kind === 'curled') {
        await this.fx({ type: 'enemyAttack', kind: 'curled' });
        await this.say(`${this.en} stays curled up on the floor, twitching at every sound…`);
        this.lastEnemyKind = 'curled';
        return;
      }
      if (kind === 'fetal') {
        await this.dolphinCurl();
        this.lastEnemyKind = 'fetal';
        return;
      }
      if (kind === 'wail') {
        await this.dolphinWail();
        this.lastEnemyKind = 'wail';
        return;
      }
      if (kind !== 'hands' && kind !== 'whip') {
        await this.say(`${this.en} sniffs the air…`);
        this.lastEnemyKind = 'idle';
        return;
      }
      const reachable = (u) => !!u && !u.dead && !u.ghost && !this.hidden(u);
      const planned = this.unit(intent.targetId);
      let t = planned;
      // [Hunt]: "Dolphinman will chase towards the sound created." A noise made since he
      // planned his move turns him toward whoever made it.
      const prey = this.hunted();
      if (reachable(prey) && prey !== t) {
        t = prey;
        await this.say(`${this.en} turns toward the sound… and lunges at ${t.name}!`, { tone: 'danger' });
      }
      if (!reachable(t)) {
        t = this.pickEnemyTarget();
        if (!t) {
          await this.say(`${this.en} gropes around, but can’t find anyone!`, { tone: 'good' });
          this.lastEnemyKind = 'lost';
          return;
        }
        if (planned && this.hidden(planned)) {
          await this.say(`${this.en} loses track of ${planned.name}, and turns on ${t.name} instead!`, { tone: 'warn' });
        }
      }
      if (e.anger >= S.anger.wildAt && this.rng.chance(S.anger.wildChance)) {
        const wild = this.rng.pick(this.enemyTargets().filter((u) => !this.hidden(u)));
        if (wild && wild !== t) {
          t = wild;
          await this.say(`${this.en} is losing control!`, { tone: 'danger' });
        }
      }
      if (kind === 'hands') await this.dolphinHands(t);
      else await this.dolphinWhip(t);
      this.lastEnemyKind = kind;
    }

    // Dolphin Hands: "Basic attacks hit 5 times and heal slightly based on damage."
    async dolphinHands(t) {
      const S = this.enemyDef;
      const W = S.weapon;
      const e = this.enemy;
      t.timesTargeted++;
      if (await this.trapSnaps(t)) return;
      await this.fx({ type: 'enemyAttack', kind: 'hands', target: t.id });
      await this.say(this.rng.pick(S.hands).replace('{t}', t.name));
      if (await this.parried(t)) return;
      if (t.flags.barrier) {
        await this.fx({ type: 'block', target: t.id });
        await this.say('The barrier absorbs every slap!', { tone: 'good' });
        return;
      }
      // Roll every slap first, so the log can say how many land before anyone goes down.
      const rolls = [];
      for (let i = 0; i < W.hits; i++) rolls.push(this.rollHit(e, t));
      const landed = rolls.filter(Boolean).length;
      if (!landed) {
        for (let i = 0; i < 2; i++) await this.fx({ type: 'miss', target: t.id, quick: true });
        await this.say(e.anger < 50 ? `${this.en} can’t see a thing… every slap misses!` : `${t.name} dodges every slap!`, { tone: 'good' });
        return;
      }
      await this.say(`${landed} of ${W.hits} slaps hit ${t.name}!`);
      let dealt = 0;
      for (const hit of rolls) {
        if (t.dead || this.outcome) break;
        if (!hit) {
          await this.fx({ type: 'miss', target: t.id, quick: true });
          continue;
        }
        const crit = this.rng.chance(this.critChance(e));
        dealt += await this.damageWorker(t, this.physical(e, t, W.power, { crit }), { source: 'enemy', silent: true, quick: true });
      }
      if (!t.dead) await this.announce(t);
      if (this.outcome || !dealt) return;
      const heal = Math.min(e.maxHp - e.hp, Math.round(dealt * W.lifesteal));
      if (heal <= 0) return;
      e.hp += heal;
      await this.fx({ type: 'healEnemy', amount: heal });
      await this.say(`${this.en} licks ${this.pr.his} hands… and recovers a little health.`, { tone: 'bad' });
    }

    // Tail Whip: "A little inaccurate... Deals damage based on current defense, and slightly
    // increases ANGER."
    async dolphinWhip(t) {
      const S = this.enemyDef;
      const sk = this.D.skills.tailWhip;
      const e = this.enemy;
      t.timesTargeted++;
      if (await this.trapSnaps(t)) return;
      await this.fx({ type: 'enemyAttack', kind: 'whip', target: t.id });
      await this.say(this.rng.pick(S.whip).replace('{t}', t.name));
      if (await this.parried(t)) return;
      if (!this.rollHit(e, t, sk.hitMult)) {
        await this.fx({ type: 'miss', target: t.id });
        await this.say(`The tail whips right past ${t.name}!`, { tone: 'good' });
      } else {
        const crit = this.rng.chance(this.critChance(e) + sk.crit);
        const dmg = this.physical(e, t, sk.power, { crit, stat: 'def' });
        if (crit) await this.say(`It cracks ${t.name} right across the face!`, { tone: 'crit' });
        await this.damageWorker(t, dmg, { source: 'enemy' });
      }
      if (!this.outcome) await this.addAnger(sk.angerUp, { quiet: true });
    }

    // Loud Wail: "dealing repeated damage to all enemies, decreasing their speed and smarts.
    // (Damage increases with ANGER.)" It's sound: DEF doesn't help, GUARD does, and a ghost
    // hears it too (no damage, but the slowdown).
    async dolphinWail() {
      const sk = this.D.skills.loudWail;
      const e = this.enemy;
      const mult = 1 + e.anger * sk.perAnger;
      await this.fx({ type: 'enemyAttack', kind: 'wail' });
      await this.say(`${this.en} lets out a loud, screeching wail!`, { tone: 'danger' });
      const hurt = new Set();
      for (let i = 0; i < sk.pulses; i++) {
        if (this.outcome) return;
        await this.fx({ type: 'wailPulse', n: i });
        for (const u of this.party) {
          if (this.outcome) return;
          if (u.dead || u.ghost || u.status.phasing || u.flags.barrier) continue;
          hurt.add(u);
          await this.damageWorker(u, this.rng.range(sk.damage) * mult, { source: 'wail', silent: true, quick: true });
        }
      }
      const ears = this.party.filter((u) => !u.dead && !u.status.phasing);
      for (const u of ears) {
        this.addBuff(u, 'spd', -sk.spdDown, sk.turns, 'wail');
        this.addBuff(u, 'smt', -sk.smtDown, sk.turns, 'wail');
      }
      for (const u of ears) if (u.flags.barrier) await this.say(`${u.name}’s barrier muffles the wail!`, { tone: 'good' });
      if (ears.length) await this.say('Everyone’s ears are ringing! Speed and smarts decrease!', { tone: 'debuff' });
      for (const u of hurt) if (!u.dead) await this.announce(u);
    }

    // Fetal Position: "unable to attack; but ... increases ANGER from most sources of sound.
    // Also significantly increases defense."
    async dolphinCurl() {
      const sk = this.D.skills.fetalPosition;
      const e = this.enemy;
      e.status.fetal = { turns: sk.turns };
      await this.fx({ type: 'enemyAttack', kind: 'fetal' });
      await this.say(`${this.en} curls up into a ball on the floor…`);
      await this.fx({ type: 'status', target: e.id, text: 'FETAL POSITION' });
      await this.say(`${this.en}’s defense drastically increases! Every sound makes ${this.pr.him} angrier…`, { tone: 'danger' });
      this.refresh();
    }

    // ------------------------------------------------------------ end of turn
    async endTurn() {
      const D = this.D;
      const B = D.balance;
      const e = this.enemy;
      const n = this.en;

      if (e.status.bleed && !this.outcome) {
        await this.say(`${n} is bleeding…`);
        await this.hitEnemy(null, e.maxHp * B.bleedPercent, { kind: 'bleed' });
      }
      for (const u of this.party) {
        if (this.outcome) break;
        if (u.dead || !u.status.poison) continue;
        await this.say(`${u.name} feels sick from the Uranium…`, { tone: 'debuff' });
        await this.damageWorker(u, u.status.poison.dmg, { source: 'poison', raw: true });
      }
      if (this.outcome) return;

      // Timed statuses.
      const expire = async (u, key, line) => {
        const st = u.status[key];
        if (!st) return;
        if (st.fresh) {
          st.fresh = false;
          return;
        }
        st.turns--;
        if (st.turns <= 0 && key !== 'asleep' && key !== 'phasing') {
          delete u.status[key];
          if (line && !u.dead) await this.say(line);
        }
      };
      await expire(e, 'bleed', `${n} stops bleeding.`);
      await expire(e, 'shards', 'The glass shards get kicked away.');
      await expire(e, 'confused', `${n} snaps out of ${this.pr.his} confusion.`);
      await expire(e, 'blind', `${n} can see again.`);
      await expire(e, 'chilled', `${n} warms back up.`);
      await expire(e, 'vulnerable', `${n} pulls ${this.pr.him}self together.`);
      const prey = this.hunted();
      await expire(e, 'hunt', prey && `${n} loses track of ${prey.name}.`);
      if (e.status.fetal && --e.status.fetal.turns <= 0) {
        delete e.status.fetal;
        await this.fx({ type: 'enemyPose' });
        await this.say(`${n} uncurls and flops back onto ${this.pr.his} feet…`, { tone: 'danger' });
      }
      for (const u of this.party) {
        await expire(u, 'afraid', `${u.name} isn’t afraid anymore.`);
        await expire(u, 'confused', `${u.name} snaps out of it.`);
        await expire(u, 'happy', `${u.name} is back to ${u.pr.his} usual self.`);
        await expire(u, 'trap', `The bear trap at ${u.name}’s feet goes unused.`);
        await expire(u, 'stared', `${n} looks away from ${u.name}.`);
        await expire(u, 'seen', `${n} loses sight of ${u.name}.`);
        await expire(u, 'exposed', `${u.name} is back on guard.`);
        await expire(u, 'poison');
        await expire(u, 'asleep');
        await expire(u, 'phasing');
      }
      for (const u of this.units) {
        for (const b of u.buffs) b.turns--;
        u.buffs = u.buffs.filter((b) => b.turns > 0);
        u.aggro *= 0.5;
      }
      if (this.foresightTurns > 0) this.foresightTurns--;
      if (this.deathward && --this.deathward.turns <= 0) {
        this.deathward = null;
        await this.say('The DEATHWARD fades…', { tone: 'debuff' });
      }

      // Balkan Boost wears off → crash (after the tick, so the crash lasts its full length).
      for (const u of this.party) {
        const bk = u.status.balkan;
        if (!bk || bk.phase !== 'boosted' || u.dead) continue;
        bk.turns--;
        if (bk.turns > 0) continue;
        const it = D.items.balkanBoost;
        delete u.status.balkan;
        u.buffs = u.buffs.filter((b) => b.tag !== 'balkan');
        await this.say('The Balkan boost wears off…');
        if (u.has('balkanWarrior')) {
          await this.say(`${u.name} doesn’t even flinch. Balkan Warrior!`, { tone: 'buff' });
          continue;
        }
        this.addBuff(u, 'all', -it.crash, it.crashTurns, 'balkanCrash');
        await this.say(`${u.name} crashes hard! All of ${u.name}’s STATS decrease!`, { tone: 'debuff' });
      }

      // STAMINA comes back on its own; Purpl Lady's SPIRIT only drains (Freaky Doctor).
      const purpl = this.withPassive('freakyDoctor');
      const wasActive = this.freakyActive();
      for (const u of this.party) {
        if (u.dead) continue;
        const regen = u.def.resource.regen != null ? u.def.resource.regen : B.regen;
        u.res = Math.min(u.resMax, u.res + regen);
      }
      if (purpl && this.present(purpl)) purpl.res = Math.max(0, purpl.res - D.passives.freakyDoctor.drain);
      const nowActive = this.freakyActive();
      if (wasActive && !nowActive && purpl && this.present(purpl)) {
        await this.say(`${purpl.name} is drained… her machinations fizzle out.`, { tone: 'debuff' });
      }

      await this.addAnger(this.rng.range(this.enemyDef.anger.perTurn), { quiet: true });
      await this.chopperTick();
      this.refresh();
    }

    // Captain Jim's Helicopter Escape: count down, then everyone gets out.
    async chopperTick() {
      if (!this.chopper || this.outcome) return;
      this.chopper.turns--;
      if (this.chopper.turns > 0) {
        await this.say(
          this.chopper.turns === 1 ? 'The chopper is circling overhead. It lands next turn!' : `The chopper lands in ${this.chopper.turns} turns…`,
          { tone: 'good' }
        );
        return;
      }
      await this.fx({ type: 'chopper' });
      await this.say('The chopper touches down!', { tone: 'win' });
      for (const u of this.party) {
        if (u.dead && !u.possessed) await this.say(`${u.name}’s body is loaded onto the chopper. Nobody gets left behind.`);
      }
      this.escapedBy = 'chopper';
      await this.win();
    }

    // ============================================================ menus (for the UI)
    actionsFor(u) {
      const bodies = this.bodiesToCarry();
      const anyItem = Object.keys(this.bag).some((k) => this.bag[k] > 0);
      return [
        { id: 'attack', label: u.ghost ? 'HEX' : 'ATTACK', enabled: true },
        { id: 'skills', label: 'SKILLS', enabled: true },
        {
          id: 'items',
          label: 'ITEMS',
          enabled: !u.ghost && anyItem,
          reason: u.ghost ? 'Ghost Body: she can’t use items.' : 'The bag is empty.',
        },
        { id: 'guard', label: u.ghost ? 'FOCUS' : 'GUARD', enabled: true },
        {
          id: 'carry',
          label: 'CARRY',
          enabled: !u.ghost && bodies.length > 0,
          reason: u.ghost ? 'Ghost Body: she can’t pick dead allies up.' : 'No one needs carrying.',
        },
      ];
    }

    skillsFor(u) {
      return u.skills.map((id) => {
        const sk = this.D.skills[id];
        const cost = this.skillCost(u, id);
        let enabled = u.res >= cost;
        let reason = enabled ? '' : `Not enough ${u.def.resource.name}.`;
        if (id === 'lunchBox' && u.flags.lunch) {
          enabled = false;
          reason = 'He is already looking for it.';
        }
        if (id === 'foresight' && this.foresightTurns > 1) {
          enabled = false;
          reason = 'Foresight is already active.';
        }
        if (this.skillSpent(id)) {
          enabled = false;
          reason = id === 'helicopterEscape' ? 'The chopper is already on its way.' : 'Once per battle, and it has been used.';
        }
        const name = this.skillName(u, id);
        const reequip = id === 'tossGlasses' && u.flags.glassesOff;
        return {
          id,
          name,
          short: sk.short,
          cost,
          resource: u.def.resource.short,
          doc: reequip ? 'Put the spare glasses on. Mel can see again.' : sk.doc,
          rules: reequip ? 'Free. Removes the HIT RATE penalty.' : this.fill(sk.rules),
          target: reequip ? 'none' : sk.target,
          enabled,
          reason,
        };
      });
    }

    itemsFor(u) {
      const D = this.D;
      return Object.keys(this.bag)
        .filter((id) => this.bag[id] > 0)
        .map((id) => {
          const it = D.items[id];
          let enabled = true;
          let reason = '';
          if (it.needsPassive && !u.has(it.needsPassive)) {
            enabled = false;
            reason = `Only someone with ${D.passives[it.needsPassive].name} can ${it.needsVerb || 'use'} this.`;
          }
          const warn = it.warning && (!it.warnIf || this.enemy.has(it.warnIf));
          return {
            id,
            name: it.name,
            count: it.keep ? null : this.bag[id],
            doc: it.doc || it.desc,
            rules: this.fill(it.inBattle + (warn ? ' ' + it.warning : '')),
            rarity: it.rarity,
            target: it.target === 'self' ? 'none' : it.target,
            enabled,
            reason,
          };
        });
    }

    targetsFor(kind, u) {
      switch (kind) {
        case 'enemy':
          return [this.enemy];
        case 'ally':
          return this.party.filter((w) => !w.dead && !w.ghost);
        case 'otherAlly':
          return this.party.filter((w) => !w.dead && !w.ghost && w !== u);
        case 'body':
          return this.bodiesToCarry();
        default:
          return [];
      }
    }
  }

  SC.Battle = Battle;
  SC.makeRng = makeRng;
  SC.joinNames = joinNames;
})(typeof window !== 'undefined' ? window : globalThis);
