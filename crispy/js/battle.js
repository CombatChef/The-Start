/*
 * The turn engine for Crispy's birthday battle. No DOM: the game and the headless test both
 * drive it. Each command returns a list of events (log lines, hits, effects) for the UI to play
 * out in order.
 *
 * A round: Crispy picks a command; whoever is faster goes first; then the end of the round
 * (poison, effects wearing off, a little SP back). NUTCRACKAAAA!!! can be used twice in one
 * turn: after the first, the battle waits (`awaiting === 'again'`) for a second one or a pass.
 */
(function (root) {
  const DATA = root.CRISPY_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const STAT_NAMES = { atk: 'ATK', def: 'DEF', spd: 'SPD', acc: 'ACC', smt: 'SMT', mag: 'MAG' };

  class Battle {
    constructor(seed = Date.now()) {
      this.D = DATA;
      this.rand = rng(seed);
      const H = DATA.hero;
      this.hero = {
        name: H.short,
        hp: H.hp,
        hpMax: H.hp,
        sp: H.sp,
        spMax: H.sp,
        mods: [], // { label, stats: {atk: 1.5}, turns, good, fearless }
        afraid: 0,
        willpower: true,
        items: Object.fromEntries(DATA.items.map((i) => [i.id, i.count])),
        tasteUsed: false,
        real: 0, // rounds left of the real sword
        nutThisTurn: 0,
        last: null, // the last thing he did, for Andy to copy
      };
      this.foe = { stage: 0, turns: 0, slices: 0, poison: 0, disarmed: 0, distracted: false, mods: [] };
      this.setStage(0, 1);
      this.round = 1;
      this.awaiting = null;
      this.foeActed = false;
      this.over = null;
      this.lights = 0; // rounds the lights stay up
    }

    // ------------------------------------------------------------ stats
    get stage() {
      return DATA.foe.stages[this.foe.stage];
    }
    setStage(i, fraction) {
      const st = DATA.foe.stages[i];
      this.foe.stage = i;
      this.foe.hpMax = DATA.foe.health[st.health];
      this.foe.hp = Math.max(1, Math.round(this.foe.hpMax * fraction));
      this.foe.turns = 0;
    }
    mult(unit, stat) {
      let m = 1;
      for (const mod of unit.mods) if (mod.stats[stat]) m *= mod.stats[stat];
      return m;
    }
    heroStat(k) {
      let v = DATA.hero.stats[k] * this.mult(this.hero, k);
      if (this.hero.afraid && DATA.afraid[k]) v *= DATA.afraid[k];
      return v;
    }
    heroAcc() {
      let a = DATA.hero.accuracy * this.mult(this.hero, 'acc');
      if (this.hero.afraid) a *= DATA.afraid.acc;
      return a;
    }
    foeStat(k) {
      let v = this.stage.stats[k] * this.mult(this.foe, k);
      if (['atk', 'def', 'mag'].includes(k)) v *= Math.pow(DATA.skills.find((s) => s.id === 'slice').cut, this.foe.slices);
      if (k === 'atk' && this.foe.disarmed) v *= 0.5;
      return v;
    }
    foeFirst() {
      return this.foeStat('spd') > this.heroStat('spd');
    }
    fearless() {
      return this.hero.mods.some((m) => m.fearless);
    }
    healthWord(unit = this.hero) {
      const list = unit === this.hero ? DATA.health : DATA.foeHealth;
      const pct = (unit.hp / unit.hpMax) * 100;
      if (unit.hp <= 0) return unit === this.hero ? 'DEAD' : 'DEFEATED';
      return list.find((h) => pct <= h.upTo).id;
    }
    canNut() {
      const s = DATA.special;
      return this.hero.hp <= this.hero.hpMax * s.below && this.hero.sp >= s.sp && this.hero.nutThisTurn < s.perTurn;
    }
    // What's on the menus, and why anything isn't.
    options() {
      const h = this.hero;
      const skills = DATA.skills.map((s) => {
        let why = '';
        if (s.once && h.tasteUsed) why = 'Used';
        else if (h.sp < s.sp) why = 'Not enough SP';
        return { id: s.id, name: s.name, sp: s.sp, doc: s.doc, ok: !why, why, target: !!s.target };
      });
      const sp = DATA.special;
      let why = '';
      if (h.hp > h.hpMax * sp.below) why = 'Only at half health or less';
      else if (h.sp < sp.sp) why = 'Not enough SP';
      else if (h.nutThisTurn >= sp.perTurn) why = 'Twice a turn';
      skills.push({ id: 'nut', name: sp.name, sp: sp.sp, doc: sp.doc, ok: !why, why, special: true });
      const items = DATA.items.map((i) => ({ id: i.id, name: i.name, doc: i.doc, count: h.items[i.id], ok: h.items[i.id] > 0, why: h.items[i.id] > 0 ? '' : 'None left' }));
      return { skills, items, acts: DATA.acts.map((a) => ({ id: a.id, name: a.name, doc: a.doc, ok: true })), mercy: DATA.mercy.map((m) => ({ ...m, ok: true })) };
    }
    adjustIn() {
      return this.stage.final ? null : DATA.foe.adjustOn - this.foe.turns;
    }

    // ------------------------------------------------------------ a round
    command(cmd) {
      if (this.over) return [];
      const ev = [];
      if (this.awaiting === 'again') {
        this.awaiting = null;
        if (cmd.type === 'special' && this.canNut()) {
          this.heroAct(cmd, ev);
          if (this.over) return ev;
        } else ev.push({ t: 'log', text: 'Crispy catches his breath.', tone: 'sys' });
        this.finishRound(ev);
        return ev;
      }
      this.foeActed = false;
      if (this.foeFirst()) {
        this.foeTurn(ev);
        this.foeActed = true;
        if (this.over) return ev;
      }
      this.heroAct(cmd, ev);
      if (this.over) return ev;
      if (cmd.type === 'special' && this.canNut()) {
        this.awaiting = 'again';
        ev.push({ t: 'again' });
        return ev;
      }
      this.finishRound(ev);
      return ev;
    }
    finishRound(ev) {
      if (!this.foeActed) {
        this.foeTurn(ev);
        this.foeActed = true;
        if (this.over) return;
      }
      this.endRound(ev);
    }
    endRound(ev) {
      const h = this.hero;
      const f = this.foe;
      if (f.poison > 0) {
        const dmg = Math.min(DATA.poisonMax, Math.round(f.hpMax * DATA.skills.find((s) => s.id === 'trash').poison.perTurn));
        f.poison--;
        ev.push({ t: 'log', text: `The garbage juice eats at ${this.stage.name}. (${dmg})`, tone: 'good' });
        ev.push({ t: 'hit', who: 'foe', amount: dmg, kind: 'poison' });
        this.hurtFoe(dmg, ev);
        if (this.over) return;
      }
      const tick = (unit) => {
        for (const m of unit.mods) m.turns--;
        const gone = unit.mods.filter((m) => m.turns <= 0);
        unit.mods = unit.mods.filter((m) => m.turns > 0);
        return gone;
      };
      for (const m of tick(h)) if (m.label) ev.push({ t: 'tag', who: 'hero', text: `${m.label} wore off`, good: false, quiet: true });
      for (const m of tick(f)) if (m.label === 'EXPOSED') ev.push({ t: 'lights', on: false });
      if (h.afraid) h.afraid--;
      if (f.disarmed) f.disarmed--;
      if (h.real > 0) {
        if (h.realFresh) h.realFresh = false;
        else {
          h.real--;
          if (!h.real) {
            ev.push({ t: 'log', text: 'The Buster Sword goes back to foam.', tone: 'sys' });
            ev.push({ t: 'sword', real: false });
          }
        }
      }
      h.sp = Math.min(h.spMax, h.sp + DATA.hero.spPerRound);
      h.nutThisTurn = 0;
      this.round++;
      ev.push({ t: 'round', round: this.round });
    }

    // ------------------------------------------------------------ Crispy
    heroAct(cmd, ev) {
      const h = this.hero;
      this.justAdjusted = false;
      const say = (text, tone = 'hero') => ev.push({ t: 'log', text, tone });
      if (cmd.type === 'attack') {
        h.last = 'attack';
        say(h.real ? 'Crispy swings the Buster Sword. It is REAL.' : 'Crispy swings the Hard Foam Buster Sword!');
        ev.push({ t: 'fx', name: h.real ? 'realSlash' : 'swing' });
        const hit = this.heroHit(DATA.attack.power * (h.real ? DATA.skills.find((s) => s.id === 'taste').mult : 1), ev, { kind: h.real ? 'real' : 'foam' });
        if (hit !== null) this.gainSp(DATA.attack.sp, ev);
        return;
      }
      if (cmd.type === 'skill' || cmd.type === 'special') {
        const s = cmd.type === 'special' ? DATA.special : DATA.skills.find((x) => x.id === cmd.id);
        h.sp -= s.sp;
        h.last = s.name;
        ev.push({ t: 'sp', value: h.sp });
        return this['skill_' + s.id](s, cmd, ev);
      }
      if (cmd.type === 'act') return this['act_' + cmd.id](DATA.acts.find((a) => a.id === cmd.id), ev);
      if (cmd.type === 'item') {
        const it = DATA.items.find((i) => i.id === cmd.id);
        h.items[it.id]--;
        h.last = it.name;
        return this['item_' + it.id](it, ev);
      }
      if (cmd.type === 'mercy') return this['mercy_' + cmd.id](ev);
    }
    gainSp(n, ev) {
      const h = this.hero;
      const before = h.sp;
      h.sp = Math.min(h.spMax, h.sp + n);
      if (h.sp !== before) ev.push({ t: 'sp', value: h.sp });
    }
    // One hit on the creature. Returns the damage, or null for a miss.
    heroHit(power, ev, o = {}) {
      const f = this.foe;
      const dodge = clamp((this.foeStat('spd') - this.heroStat('spd')) / 700, 0, 0.18);
      if (!o.sure && this.rand() > this.heroAcc() - dodge) {
        ev.push({ t: 'miss', who: 'foe' });
        ev.push({ t: 'log', text: this.stage.final ? 'Andy steps aside. Too quick.' : 'It jerks out of the way. Miss!', tone: 'sys' });
        return null;
      }
      const atk = o.atk != null ? o.atk : this.heroStat('atk');
      const def = o.def != null ? o.def : this.foeStat('def');
      let dmg = power * atk * (100 / (100 + def)) * (0.9 + this.rand() * 0.2);
      let crit = false;
      const critChance = o.crit != null ? o.crit : (this.heroStat('smt') / 1000) * 1.2;
      if (this.rand() < critChance) {
        crit = true;
        dmg *= o.critMult || 1.6;
      }
      dmg = Math.max(1, Math.round(dmg));
      ev.push({ t: 'hit', who: 'foe', amount: dmg, crit, kind: o.kind });
      if (crit) ev.push({ t: 'log', text: o.critText || 'A critical hit!', tone: 'good' });
      this.hurtFoe(dmg, ev);
      void f;
      return dmg;
    }
    addMod(unit, stats, turns, label, extra = {}) {
      const good = Object.values(stats).every((v) => v >= 1);
      unit.mods.push({ stats, turns, label, good, ...extra });
      const who = unit === this.hero ? 'hero' : 'foe';
      const parts = Object.entries(stats).map(([k, v]) => `${STAT_NAMES[k]}${v >= 1 ? '↑' : '↓'}`);
      return { t: 'tag', who, text: label ? `${label} ${parts.join(' ')}` : parts.join(' '), good: unit === this.hero ? good : !good };
    }

    skill_trash(s, cmd, ev) {
      ev.push({ t: 'log', text: 'Crispy whips a full trash bag around his head—', tone: 'hero' });
      ev.push({ t: 'fx', name: 'trash' });
      const dmg = this.heroHit(s.power, ev, { kind: 'trash' });
      if (dmg === null || this.over || this.justAdjusted) return (this.justAdjusted = false);
      if (this.rand() < s.tear) {
        ev.push({ t: 'fx', name: 'tear' });
        ev.push({ t: 'log', text: 'The bag tears open! Garbage everywhere. It’s POISONED.', tone: 'good' });
        this.heroHit(s.tearPower, ev, { kind: 'garbage', sure: true, crit: 0 });
        if (this.over || this.justAdjusted) return (this.justAdjusted = false);
        this.foe.poison = s.poison.turns;
        ev.push({ t: 'tag', who: 'foe', text: 'POISONED', good: true });
      }
    }
    skill_early(s, cmd, ev) {
      ev.push({ t: 'log', text: 'Crispy has been up since 4 AM. EARLY BIRD!', tone: 'hero' });
      ev.push({ t: 'fx', name: 'early' });
      this.hero.mods = this.hero.mods.filter((m) => m.label !== 'EARLY BIRD');
      ev.push(this.addMod(this.hero, { atk: s.self.atk }, s.self.turns, 'EARLY BIRD'));
      ev.push(this.addMod(this.hero, { spd: s.self.spd }, s.self.turns, 'GROGGY'));
      this.foe.mods = this.foe.mods.filter((m) => m.label !== 'BEHIND');
      ev.push(this.addMod(this.foe, { atk: s.foe.atk, def: s.foe.def }, s.foe.turns, 'BEHIND'));
      ev.push({ t: 'log', text: `${this.stage.name} is a step behind.`, tone: 'good' });
    }
    skill_authority(s, cmd, ev) {
      ev.push({ t: 'log', text: 'Crispy puts his foot down. What he says, goes.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'authority', target: cmd.target });
      if (cmd.target === 'foe') {
        const n = this.foe.mods.filter((m) => m.good).length;
        this.foe.mods = this.foe.mods.filter((m) => !m.good);
        ev.push({ t: 'log', text: n ? `${this.stage.name}'s tricks are cancelled.` : 'It has nothing to take away.', tone: n ? 'good' : 'sys' });
        if (n) ev.push({ t: 'tag', who: 'foe', text: 'CLEARED', good: true });
      } else {
        const n = this.hero.mods.filter((m) => !m.good).length + (this.hero.afraid ? 1 : 0);
        this.hero.mods = this.hero.mods.filter((m) => m.good);
        this.hero.afraid = 0;
        ev.push({ t: 'log', text: n ? 'Every bad effect on Crispy is cancelled.' : 'Nothing to cancel. He feels great.', tone: n ? 'good' : 'sys' });
        if (n) ev.push({ t: 'tag', who: 'hero', text: 'CLEARED', good: true });
      }
    }
    skill_rg(s, cmd, ev) {
      ev.push({ t: 'log', text: 'Crispy pulls out the RG 405M. The world bends.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'rg' });
      const elec = 0.6 * this.heroStat('atk') + 3 * DATA.hero.stats.mag * this.mult(this.hero, 'mag');
      this.heroHit(s.power, ev, { kind: 'elec', sure: true, atk: elec, def: this.foeStat('def') * 0.5 });
      if (this.over || this.justAdjusted) return (this.justAdjusted = false);
      if (this.rand() < s.disarm.chance) {
        this.foe.disarmed = s.disarm.turns;
        ev.push({ t: 'log', text: 'Its claws go limp. DISARMED!', tone: 'good' });
        ev.push({ t: 'tag', who: 'foe', text: 'DISARMED', good: true });
      }
    }
    skill_wine(s, cmd, ev) {
      const h = this.hero;
      ev.push({ t: 'log', text: 'Crispy takes a Wine Break. Just one glass.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'wine' });
      this.gainSp(Math.round(h.spMax * s.restoreSp), ev);
      this.healHero(Math.round(h.hpMax * s.heal), ev);
      h.mods = h.mods.filter((m) => m.label !== 'TIPSY');
      ev.push(this.addMod(h, { smt: s.self.smt, atk: s.self.atk }, s.self.turns, 'TIPSY'));
    }
    skill_slice(s, cmd, ev) {
      ev.push({ t: 'log', text: 'CRISPY SLICE!', tone: 'hero' });
      ev.push({ t: 'fx', name: 'slice' });
      const dmg = this.heroHit(s.power, ev, { kind: 'slice' });
      if (dmg === null || this.over || this.justAdjusted) return (this.justAdjusted = false);
      if (this.foe.slices < s.stacks) {
        this.foe.slices++;
        ev.push({ t: 'tag', who: 'foe', text: `SLICED ×${this.foe.slices}  ATK↓ DEF↓ MAG↓`, good: true });
        ev.push({ t: 'log', text: this.foe.slices === 1 ? 'That one will leave a mark for the rest of the fight.' : 'Cut deeper. It won’t forget that.', tone: 'good' });
      } else ev.push({ t: 'log', text: 'It can’t be cut any deeper than that.', tone: 'sys' });
    }
    skill_taste(s, cmd, ev) {
      const h = this.hero;
      h.tasteUsed = true;
      h.real = s.turns;
      h.realFresh = true;
      ev.push({ t: 'log', text: 'Crispy grips the foam sword. It gets heavy. Cold. Sharp.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'taste' });
      ev.push({ t: 'sword', real: true });
      ev.push({ t: 'log', text: 'TASTE OF REALITY! His ATTACKs deal triple damage for 3 turns.', tone: 'good' });
    }
    skill_nut(s, cmd, ev) {
      const h = this.hero;
      h.nutThisTurn++;
      ev.push({ t: 'log', text: 'NUTCRACKAAAA!!!', tone: 'special' });
      ev.push({ t: 'fx', name: 'nut' });
      if (this.rand() < s.ko) {
        ev.push({ t: 'log', text: 'A PERFECT CRACK. INSTANT K.O.!', tone: 'special' });
        const amount = this.foe.hp;
        ev.push({ t: 'hit', who: 'foe', amount, crit: true, kind: 'ko' });
        this.hurtFoe(amount, ev);
        this.justAdjusted = false;
        return;
      }
      this.heroHit(s.power, ev, { kind: 'nut', sure: true, crit: s.crit.chance, critMult: s.crit.mult, critText: 'A FATAL CRITICAL HIT!' });
      if (this.over || this.justAdjusted) return (this.justAdjusted = false);
      this.foe.mods = this.foe.mods.filter((m) => m.label !== 'CRACKED');
      ev.push(this.addMod(this.foe, { def: s.foe.def, mag: s.foe.mag }, s.foe.turns, 'CRACKED'));
    }

    act_lights(a, ev) {
      ev.push({ t: 'log', text: 'Crispy reaches for the dimmer and turns it all the way up.', tone: 'hero' });
      const andy = this.stage.final;
      if (this.rand() > a.chance) {
        ev.push({ t: 'fx', name: 'lightsFail' });
        ev.push({ t: 'log', text: 'The bulbs flicker... and die back down.', tone: 'sys' });
        return;
      }
      this.foe.mods = this.foe.mods.filter((m) => m.label !== 'EXPOSED');
      const k = andy ? 0.5 : 1; // Andy doesn't mind being seen
      ev.push({ t: 'fx', name: 'lights' });
      ev.push({ t: 'lights', on: true });
      ev.push(this.addMod(this.foe, { acc: 1 - (1 - a.foe.acc) * k, def: 1 - (1 - a.foe.def) * k }, a.turns, 'EXPOSED'));
      ev.push({ t: 'log', text: andy ? 'Andy squints, smiling. "There you are."' : 'Light floods the room. It recoils, shielding its face!', tone: 'good' });
    }
    act_stance(a, ev) {
      this.hero.mods = this.hero.mods.filter((m) => m.label !== 'FEARLESS');
      this.hero.afraid = 0;
      ev.push({ t: 'log', text: 'Crispy plants his feet between it and the stairs. Not one step further.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'stance' });
      ev.push(this.addMod(this.hero, { def: a.self.def, atk: a.self.atk }, a.turns, 'FEARLESS', { fearless: true }));
    }
    act_talk(a, ev) {
      const i = this.foe.stage;
      const lines = [
        ['Crispy: "Hey. You need to leave."', 'It tilts its head all the way over. It doesn’t understand words. Yet.'],
        ['Crispy: "Whatever you are, you’re not welcome here."', 'Its mouth opens wider. Something inside it tries to say "welcome."'],
        ['Crispy: "Who are you?"', 'It answers in a wet whisper: "who... are... you..." It’s learning.'],
        ['Crispy: "This is MY house."', 'It answers in Crispy’s own voice: "This is my house."'],
        ['Crispy: "You’re not me."', 'Andy smiles with all of his teeth. "Not yet."'],
      ][i];
      ev.push({ t: 'fx', name: 'talk' });
      ev.push({ t: 'log', text: lines[0], tone: 'hero' });
      ev.push({ t: 'log', text: lines[1], tone: 'foe' });
      const chance = 0.3 + this.stage.stats.chm / 200;
      if (this.rand() < chance) {
        this.foe.mods = this.foe.mods.filter((m) => m.label !== 'UNSETTLED');
        ev.push(this.addMod(this.foe, { atk: a.foe.atk }, a.foe.turns, 'UNSETTLED'));
        ev.push({ t: 'log', text: 'It hesitates. Its attack drops.', tone: 'good' });
      }
    }

    item_choc(it, ev) {
      ev.push({ t: 'log', text: 'Crispy breaks off a square of 70% dark chocolate.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'choc' });
      this.healHero(Math.round(this.hero.hpMax * it.heal), ev);
    }
    item_cheese(it, ev) {
      ev.push({ t: 'log', text: 'Crispy eats a grilled cheese. Golden. Perfect.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'cheese' });
      this.healHero(Math.round(this.hero.hpMax * it.heal), ev);
      this.hero.mods = this.hero.mods.filter((m) => m.label !== 'WELL FED');
      ev.push(this.addMod(this.hero, { def: it.self.def }, it.self.turns, 'WELL FED'));
    }
    item_pills(it, ev) {
      ev.push({ t: 'log', text: 'Crispy takes his allergy pills. Non-drowsy. Everything is so clear.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'pills' });
      this.hero.mods = this.hero.mods.filter((m) => m.label !== 'CLEAR-HEADED');
      ev.push(this.addMod(this.hero, { atk: it.self.atk, spd: it.self.spd, acc: it.self.acc }, it.self.turns, 'CLEAR-HEADED'));
    }
    item_keys(it, ev) {
      ev.push({ t: 'log', text: 'Crispy mashes the panic button on his car keys.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'keys' });
      this.foe.distracted = true;
      ev.push({ t: 'log', text: 'WEE-OOO WEE-OOO! Its head snaps towards the window.', tone: 'good' });
      ev.push({ t: 'tag', who: 'foe', text: 'DISTRACTED', good: true });
    }
    mercy_flee(ev) {
      ev.push({ t: 'log', text: 'Crispy turns to run— but his family is upstairs. He can’t leave them.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'flee' });
      ev.push({ t: 'log', text: 'It catches him with his back turned!', tone: 'foe' });
      const dmg = Math.round(0.6 * this.foeStat('atk') * (100 / (100 + this.heroStat('def'))) * (0.9 + this.rand() * 0.2));
      ev.push({ t: 'hit', who: 'hero', amount: dmg, kind: 'claw' });
      this.hurtHero(dmg, ev);
    }
    mercy_spare(ev) {
      ev.push({ t: 'fx', name: 'spare' });
      ev.push({ t: 'log', text: 'Crispy lowers his sword and offers it mercy.', tone: 'hero' });
      ev.push({ t: 'log', text: this.stage.final ? 'Andy laughs. "Spare me? I’m YOU."' : 'It doesn’t know what that means. It doesn’t care.', tone: 'foe' });
    }

    healHero(n, ev) {
      const h = this.hero;
      const got = Math.min(n, h.hpMax - h.hp);
      h.hp += got;
      ev.push({ t: 'heal', who: 'hero', amount: got });
    }
    hurtHero(n, ev) {
      const h = this.hero;
      h.hp = Math.max(0, h.hp - n);
      if (h.hp > 0) return;
      if (h.willpower) {
        h.willpower = false;
        h.hp = Math.round(h.hpMax * DATA.hero.willpower.heal);
        h.mods = h.mods.filter((m) => m.good);
        h.afraid = 0;
        ev.push({ t: 'log', text: 'Crispy goes down...', tone: 'bad' });
        ev.push({ t: 'revive', hp: h.hp });
        ev.push({ t: 'log', text: 'But his family is upstairs. He gets back up. WILLPOWER!', tone: 'special' });
        return;
      }
      this.over = 'lose';
      ev.push({ t: 'log', text: 'Crispy falls. His willpower is spent.', tone: 'bad' });
      ev.push({ t: 'lose' });
    }
    hurtFoe(n, ev) {
      const f = this.foe;
      f.hp = Math.max(0, f.hp - n);
      if (f.hp > 0) return;
      if (this.stage.final) {
        this.over = 'win';
        ev.push({ t: 'log', text: 'Andy stops smiling.', tone: 'special' });
        ev.push({ t: 'win' });
        return;
      }
      // It can't die like this: the body breaks and it ADJUSTS into the next one, fresh.
      ev.push({ t: 'log', text: 'Its body breaks apart—', tone: 'good' });
      this.adjust(ev, true);
      this.justAdjusted = true;
    }

    // ------------------------------------------------------------ the creature
    adjust(ev, forced) {
      const from = this.foe.stage;
      const fraction = forced ? 1 : Math.max(0.35, this.foe.hp / this.foe.hpMax);
      this.setStage(from + 1, fraction);
      const f = this.foe;
      f.mods = [];
      f.poison = 0;
      f.disarmed = 0;
      f.distracted = false;
      ev.push({ t: 'adjust', from, to: f.stage, forced });
      if (this.stage.final) {
        ev.push({ t: 'log', text: 'It ADJUSTS one last time.', tone: 'foe' });
        ev.push({ t: 'log', text: 'It looks like a man now. It looks like YOU. It says its name is Andy.', tone: 'foe' });
      } else {
        ev.push({ t: 'log', text: forced ? '—and it ADJUSTS into something new.' : 'The Creature ADJUSTS.', tone: 'foe' });
        ev.push({ t: 'log', text: ['To look like them.', 'To look LIKE YOU.', 'Closer. Closer.'][from] || 'To look LIKE YOU.', tone: 'foe' });
      }
    }
    foeTurn(ev) {
      const f = this.foe;
      if (f.distracted) {
        f.distracted = false;
        ev.push({ t: 'fx', name: 'distracted' });
        ev.push({ t: 'log', text: `${this.stage.name} stares at the window, twitching at the car alarm. It loses its turn.`, tone: 'good' });
        return;
      }
      f.turns++;
      if (!this.stage.final && f.turns >= this.D.foe.adjustOn) {
        ev.push({ t: 'log', text: 'It goes very still. Something under its skin moves.', tone: 'foe' });
        this.adjust(ev, false);
        return;
      }
      this.foeMove(ev);
      if (!this.over && this.stage.final && this.rand() < this.stage.followUp) {
        ev.push({ t: 'log', text: 'Andy moves again before Crispy can blink.', tone: 'foe' });
        this.foeMove(ev);
      }
    }
    pickMove() {
      const f = this.foe;
      const pool = this.stage.moves.filter((m) => {
        const mv = DATA.foe.moves[m.id];
        if (mv.heal && f.hp > f.hpMax * 0.7) return false;
        if (mv.buff && f.mods.some((x) => x.label === mv.name.toUpperCase())) return false;
        if (mv.debuff && this.hero.mods.some((x) => x.label === mv.name.toUpperCase())) return false;
        return true;
      });
      let total = pool.reduce((s, m) => s + m.w, 0);
      let r = this.rand() * total;
      for (const m of pool) if ((r -= m.w) < 0) return m.id;
      return pool[0].id;
    }
    foeMove(ev) {
      const id = this.pickMove();
      const mv = DATA.foe.moves[id];
      const f = this.foe;
      const name = this.stage.name;
      const andy = this.stage.final;
      const say = (text, tone = 'foe') => ev.push({ t: 'log', text, tone });
      ev.push({ t: 'foe', move: id });
      const lines = {
        claw: `${name} rakes its long claws at Crispy!`,
        reach: `${name} reaches across the room with an arm far too long for its body.`,
        screech: `${name} SCREECHES. The windows hum.`,
        twitch: `${name} twitches violently. It's staring at Crispy. It doesn't blink.`,
        lash: 'Tendrils burst from its back and lash out!',
        lash3: 'A nest of tendrils whips across the room!',
        scream: `${name} screams with its mouth open far too wide.`,
        weep: `${name} weeps something black. Its wounds knit shut.`,
        lengthen: 'Its arms crack and get LONGER.',
        rake: `${name} rakes twice, fast!`,
        lunge: `${name} lunges out of the dark!`,
        stare: `${name} just stares. Crispy can feel it under his skin.`,
        harden: 'Its skin pulls tight and turns hard as a shell.',
        mimic: `Andy copies Crispy’s ${this.hero.last && this.hero.last !== 'attack' ? this.hero.last : 'swing'}. It’s almost right. Almost.`,
        grab: 'Andy grabs Crispy by the shoulders and squeezes. "Gotcha."',
        smile: 'Andy smiles. Wider. Wider. It doesn’t stop.',
        pat: 'Andy pats Crispy on the back. "Proud of you, champ." His hand is so cold.',
      };
      say(lines[id]);
      if (mv.heal) {
        const n = Math.min(Math.round(f.hpMax * mv.heal), f.hpMax - f.hp);
        f.hp += n;
        ev.push({ t: 'heal', who: 'foe', amount: n });
        return;
      }
      if (mv.buff) {
        const { turns, ...stats } = mv.buff;
        ev.push(this.addMod(f, stats, turns, mv.name.toUpperCase()));
        return;
      }
      if (mv.debuff) {
        if (this.rand() > (mv.acc || 1) * this.mult(f, 'acc')) {
          say('Crispy looks away just in time.', 'sys');
          return;
        }
        const { turns, ...stats } = mv.debuff;
        ev.push(this.addMod(this.hero, stats, turns, mv.name.toUpperCase()));
      }
      if (mv.afraid && !mv.power) this.scare(mv.afraid, ev);
      if (!mv.power) return;
      for (let i = 0; i < (mv.hits || 1); i++) {
        const dodge = clamp((this.heroStat('spd') - this.foeStat('spd')) / 800, 0, 0.12);
        if (this.rand() > mv.acc * this.mult(f, 'acc') - dodge) {
          ev.push({ t: 'miss', who: 'hero' });
          say(andy ? 'Crispy twists free!' : 'Crispy ducks under it!', 'good');
          continue;
        }
        if (this.rand() < DATA.hero.blockChance) {
          ev.push({ t: 'block' });
          say('BLOCKED! The foam sword soaks it up.', 'good');
          continue;
        }
        let dmg = mv.power * this.foeStat('atk') * (100 / (100 + this.heroStat('def'))) * (0.9 + this.rand() * 0.2);
        let crit = false;
        if (this.rand() < this.stage.stats.smt / 1000) {
          crit = true;
          dmg *= 1.5;
        }
        dmg = Math.max(1, Math.round(dmg));
        ev.push({ t: 'hit', who: 'hero', amount: dmg, crit, kind: id });
        if (crit) say('It found a weak spot!', 'bad');
        this.hurtHero(dmg, ev);
        if (this.over) return;
      }
      if (mv.afraid) this.scare(mv.afraid, ev);
    }
    scare(turns, ev) {
      if (this.fearless()) {
        ev.push({ t: 'log', text: 'Crispy doesn’t flinch. FEARLESS.', tone: 'good' });
        return;
      }
      if (this.rand() < DATA.hero.stats.brv / 300) {
        ev.push({ t: 'log', text: 'Crispy shakes it off.', tone: 'good' });
        return;
      }
      this.hero.afraid = Math.max(this.hero.afraid, turns);
      ev.push({ t: 'tag', who: 'hero', text: 'AFRAID ATK↓ ACC↓', good: false });
    }
  }

  const API = { Battle, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CRISPY_BATTLE = API;
})(typeof window !== 'undefined' ? window : globalThis);
