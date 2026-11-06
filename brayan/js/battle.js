/*
 * Brayan's fight, as rules: every command gives back a list of events (the log, the effects,
 * the hits) for the HUD to play out. The Gunman's shot stops the turn part way (the HUD asks
 * Brayan to DODGE, then hands back whether he did: `shot(dodged)`); where Brayan is, and what
 * he's found, are here too. The searches and CLASSROOM A happen in real time, in the HUD.
 */
(function (root) {
  const DATA = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.BRAYAN_DATA;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  class Battle {
    constructor(seed = 1) {
      this.rand = rng(seed);
      const h = DATA.hero;
      const f = DATA.foe;
      this.hero = { hp: h.hp, hpMax: h.hp, pat: h.pat, patMax: h.pat, mods: [], frozen: false, secondWind: true, ears: 0, focus: 0, talk: 0 };
      this.foe = { hp: f.hp, hpMax: f.hp, mods: [], stunDmg: 0, stunned: 0, distracted: 0, shotAt: -99 };
      this.items = Object.fromEntries(DATA.items.map((i) => [i.id, i.count]));
      this.round = 1;
      this.loc = 'entrance';
      this.have = { fuel: 0, keys: false, bear: false };
      this.seen = { hallA: false }; // (been there: the search is the first time)
      this.rootOffset = Math.floor(this.rand() * DATA.root.cycle.length);
      this.over = null; // 'win' (it's dead), 'escape' (they're gone), 'lose'
      this.lostTo = null; // 'gunman' or 'root'
      this.pending = null; // the shot, waiting on Brayan's dodge
      this.classStage = 1; // how awake the thing in CLASSROOM A was when he went in
    }

    // ------------------------------------------------------------------ what Brayan can do
    heroStat(k) {
      let v = DATA.hero[k];
      for (const m of this.hero.mods) if (m[k]) v *= 1 + m[k];
      return v;
    }
    foeStat(k) {
      let v = DATA.foe[k];
      for (const m of this.foe.mods) if (m[k]) v *= m[k];
      return v;
    }
    canFlee() {
      const f = this.foe;
      if (this.loc === 'entrance') return f.stunned > 0 || f.distracted > 0;
      return f.stunned > 0;
    }
    whyNotFlee() {
      return this.loc === 'entrance' ? 'It has to be stunned or distracted' : 'It has to be stunned';
    }
    hasAll() {
      return this.have.fuel >= DATA.fuel && this.have.keys;
    }
    // where FLEE goes from here
    fleeTo() {
      if (this.loc === 'entrance') return this.hasAll() ? ['out'] : ['hallA'];
      return ['entrance', 'classA'];
    }
    rootStage() {
      const c = DATA.root.cycle;
      return c[(this.round + this.rootOffset) % c.length];
    }
    options() {
      const h = this.hero;
      return {
        skills: DATA.skills.map((s) => ({ ...s, ok: h.pat >= s.pat, why: 'Not enough PATIENCE' })),
        acts: DATA.acts.map((a) => ({ ...a, ok: true })),
        items: DATA.items.map((i) => ({ ...i, count: this.items[i.id], ok: this.items[i.id] > 0, why: 'None left' })),
        flee: { ok: this.canFlee(), why: this.whyNotFlee(), to: this.fleeTo() },
      };
    }

    // ------------------------------------------------------------------ a turn
    command(cmd) {
      const ev = [];
      if (this.over || this.pending) return ev;
      if (cmd.type === 'flee') return this.flee(cmd.to, ev);
      if (cmd.type === 'frozen') {
        ev.push({ t: 'log', text: 'Brayan can’t move. He can’t make himself move.', tone: 'bad' });
        this.hero.frozen = false;
      } else this.heroAct(cmd, ev);
      if (this.over) return ev;
      this.foeTurn(ev);
      if (this.pending || this.over) return ev;
      this.endRound(ev);
      return ev;
    }
    heroAct(cmd, ev) {
      const h = this.hero;
      if (cmd.type === 'attack') {
        ev.push({ t: 'log', text: 'Brayan goes at it.', tone: 'hero' });
        ev.push({ t: 'fx', name: 'attack' });
        this.strike(DATA.attack.power, ev);
      } else if (cmd.type === 'skill') {
        const s = DATA.skills.find((x) => x.id === cmd.id);
        h.pat -= s.pat;
        if (s.pat) ev.push({ t: 'pat', value: h.pat });
        this['skill_' + s.id](s, ev);
      } else if (cmd.type === 'act') this['act_' + cmd.id](DATA.acts.find((x) => x.id === cmd.id), ev, cmd);
      else if (cmd.type === 'item') {
        this.items[cmd.id]--;
        this['item_' + cmd.id](DATA.items.find((x) => x.id === cmd.id), ev);
      }
    }
    strike(power, ev, stunBonus = 0) {
      const h = this.hero;
      const crit = this.rand() < DATA.hero.crit + h.focus;
      let dmg = Math.round(this.heroStat('atk') * power * (100 / (100 + this.foeStat('def'))) * (0.9 + this.rand() * 0.2));
      if (crit) dmg *= 2;
      ev.push({ t: 'hit', who: 'foe', amount: dmg, crit });
      if (crit) ev.push({ t: 'log', text: 'A critical hit!', tone: 'good' });
      this.hurtFoe(dmg, ev, stunBonus);
    }
    hurtFoe(n, ev, stunBonus = 0) {
      const f = this.foe;
      f.hp = Math.max(0, f.hp - n);
      if (f.hp <= 0) {
        this.over = 'win';
        ev.push({ t: 'log', text: 'The Gunman folds up on the floor of the hall like nothing was ever standing there.', tone: 'special' });
        ev.push({ t: 'win' });
        return;
      }
      if (f.stunned) return;
      f.stunDmg += n + stunBonus;
      ev.push({ t: 'stunbar', value: this.stunLevel() });
      if (f.stunDmg >= DATA.foe.stun) {
        f.stunDmg = 0;
        f.stunned = 2;
        f.distracted = 0;
        ev.push({ t: 'stun' });
        ev.push({ t: 'log', text: 'The Gunman staggers into the wall. It’s STUNNED.', tone: 'special' });
        ev.push({ t: 'log', text: 'Now Brayan can FLEE.', tone: 'sys' });
      }
    }
    stunLevel() {
      return Math.min(1, this.foe.stunDmg / DATA.foe.stun);
    }

    skill_voice(s, ev) {
      ev.push({ t: 'log', text: 'Brayan uses his hallway voice: “HEY. STOP.” It echoes all the way down.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'voice' });
      this.strike(s.power, ev, s.stun);
    }
    skill_chair(s, ev) {
      ev.push({ t: 'log', text: 'Brayan picks up a classroom chair and throws it as hard as he can.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'chair' });
      this.strike(s.power, ev);
    }
    skill_brace(s, ev) {
      ev.push({ t: 'log', text: 'Brayan sets his feet and gets his shoulders down. DEF up.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'brace' });
      this.addMod(this.hero, { def: s.def }, s.turns, 'BRACED', ev);
    }
    skill_breath(s, ev) {
      const h = this.hero;
      ev.push({ t: 'log', text: 'In for four. Out for four. Brayan takes a breath.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'breath' });
      h.pat = Math.min(h.patMax, h.pat + s.restore);
      ev.push({ t: 'pat', value: h.pat, delta: s.restore });
      this.heal(Math.round(h.hpMax * s.heal), ev);
    }

    act_check(a, ev) {
      ev.push({ t: 'log', text: DATA.check, tone: 'sys' });
      const stun = Math.round(this.stunLevel() * 100);
      ev.push({ t: 'log', text: this.foe.stunned ? 'It’s still reeling.' : `It’s ${stun}% of the way to being stunned.`, tone: 'sys' });
    }
    act_talk(a, ev) {
      const h = this.hero;
      const [say, back] = DATA.talk[h.talk % DATA.talk.length];
      h.talk++;
      ev.push({ t: 'log', text: `Brayan: ${say}`, tone: 'hero' });
      ev.push({ t: 'fx', name: 'talk' });
      ev.push({ t: 'log', text: back, tone: 'foe' });
      h.pat = Math.min(h.patMax, h.pat + 6);
      ev.push({ t: 'pat', value: h.pat, delta: 6 });
    }
    act_kids(a, ev) {
      ev.push({ t: 'log', text: 'Brayan tells it about the kids on Bus 13: their names, who sits where, who cried this morning. It hesitates.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'kids' });
      this.foe.mods = this.foe.mods.filter((m) => m.label !== 'HESITANT');
      this.addMod(this.foe, { atk: a.atk }, a.turns, 'HESITANT', ev);
    }
    // (the timing test is in the HUD: `cmd.passed`)
    act_distract(a, ev, cmd) {
      if (!cmd.passed) {
        ev.push({ t: 'log', text: 'Brayan throws his keys down the other hall, too late. It doesn’t even turn its head.', tone: 'bad' });
        return;
      }
      ev.push({ t: 'log', text: 'A clatter, far down the other hall, right on time. The Gunman turns to look. It’s DISTRACTED.', tone: 'special' });
      ev.push({ t: 'fx', name: 'distract' });
      this.foe.distracted = 2;
      if (this.loc === 'entrance') ev.push({ t: 'log', text: 'Now Brayan can FLEE.', tone: 'sys' });
      else ev.push({ t: 'log', text: 'Not that it helps here: in HALLWAY A it has to be stunned.', tone: 'sys' });
    }
    act_squint(a, ev) {
      ev.push({ t: 'log', text: 'Brayan narrows his eyes until there’s nothing in the world but it. FOCUSED.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'squint' });
      this.hero.mods = this.hero.mods.filter((m) => m.label !== 'FOCUSED');
      this.hero.focus = a.crit;
      this.addMod(this.hero, { focus: a.crit }, a.turns, 'FOCUSED', ev);
    }

    item_bec(it, ev) {
      ev.push({ t: 'log', text: 'Brayan eats a bacon, egg and cheese. Salt, pepper, ketchup. Still warm, somehow.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'bec' });
      this.heal(Math.round(this.hero.hpMax * it.heal), ev);
    }
    item_newports(it, ev) {
      const h = this.hero;
      ev.push({ t: 'log', text: 'Brayan lights a Newport with shaking hands. By the second drag they’re steady, and the building’s gone very quiet: he can hear everything.', tone: 'hero' });
      ev.push({ t: 'fx', name: 'newports' });
      h.pat = Math.min(h.patMax, h.pat + it.pat);
      ev.push({ t: 'pat', value: h.pat, delta: it.pat });
      h.ears = it.ears;
      ev.push({ t: 'tag' });
    }

    heal(n, ev) {
      const h = this.hero;
      const before = h.hp;
      h.hp = Math.min(h.hpMax, h.hp + n);
      ev.push({ t: 'heal', amount: h.hp - before });
    }
    addMod(who, stats, turns, label, ev) {
      who.mods.push({ ...stats, turns, label });
      ev.push({ t: 'tag' });
    }

    // ------------------------------------------------------------------ the Gunman's turn
    foeTurn(ev) {
      const f = this.foe;
      if (f.stunned) {
        f.stunned--;
        if (f.stunned) {
          ev.push({ t: 'log', text: 'The Gunman is still reeling.', tone: 'sys' });
          return;
        }
        ev.push({ t: 'log', text: 'The Gunman straightens up. It’s not stunned anymore.', tone: 'foe' });
        ev.push({ t: 'recover' });
      }
      if (f.distracted) {
        f.distracted--;
        if (f.distracted) {
          ev.push({ t: 'log', text: 'The Gunman is still staring down the other hall.', tone: 'sys' });
          return;
        }
        ev.push({ t: 'log', text: 'The Gunman turns back around. It found nothing.', tone: 'foe' });
        ev.push({ t: 'recover' });
      }
      const S = DATA.foe.shot;
      if (this.round >= S.from && this.round - f.shotAt >= S.gap && this.rand() < S.chance) {
        f.shotAt = this.round;
        ev.push({ t: 'log', text: DATA.moves.gunshot.line, tone: 'foe' });
        ev.push({ t: 'gunshot' });
        this.pending = 'shot';
        return;
      }
      const w = DATA.weights[f.hp / f.hpMax > 0.5 ? 'fresh' : 'hurt'];
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      let r = this.rand() * total;
      let id = 'loom';
      for (const [k, v] of Object.entries(w)) if ((r -= v) < 0) { id = k; break; }
      const mv = DATA.moves[id];
      ev.push({ t: 'log', text: mv.line, tone: 'foe' });
      ev.push({ t: 'foe', move: id });
      if (mv.power) {
        const dmg = Math.round(this.foeStat('atk') * mv.power * (100 / (100 + this.heroStat('def'))) * (0.9 + this.rand() * 0.2));
        ev.push({ t: 'hit', who: 'hero', amount: dmg });
        this.hurtHero(dmg, ev);
        if (this.over) return;
      }
      if (mv.hp) {
        const dmg = Math.max(1, Math.round(this.hero.hpMax * mv.hp * (this.foeStat('atk') / DATA.foe.atk)));
        ev.push({ t: 'hit', who: 'hero', amount: dmg, kind: 'mind' });
        this.hurtHero(dmg, ev);
        if (this.over) return;
      }
      if (mv.pat) this.hurtPat(Math.round(mv.pat * (0.85 + this.rand() * 0.3)), ev);
    }
    // the DODGE, done (or not)
    shot(dodged) {
      const ev = [];
      if (this.pending !== 'shot') return ev;
      this.pending = null;
      ev.push({ t: 'shot', dodged });
      if (dodged) {
        ev.push({ t: 'log', text: 'Brayan throws himself to the floor. The shot goes over him and into the wall.', tone: 'good' });
        this.hurtPat(10, ev);
      } else {
        const dmg = Math.round(this.hero.hpMax * DATA.foe.shot.hit);
        ev.push({ t: 'log', text: 'It fires. The sound fills the whole hall, and Brayan’s shoulder.', tone: 'bad' });
        ev.push({ t: 'hit', who: 'hero', amount: dmg, kind: 'shot' });
        this.hurtHero(dmg, ev);
        if (this.over) return ev;
      }
      this.endRound(ev);
      return ev;
    }
    hurtPat(n, ev) {
      const h = this.hero;
      h.pat = Math.max(0, h.pat - n);
      ev.push({ t: 'pat', value: h.pat, delta: -n });
      if (h.pat > 0) return;
      h.frozen = true;
      h.pat = DATA.hero.frozenPat;
      ev.push({ t: 'log', text: 'Brayan’s patience is gone. He freezes.', tone: 'bad' });
      ev.push({ t: 'frozen' });
    }
    hurtHero(n, ev) {
      const h = this.hero;
      h.hp = Math.max(0, h.hp - n);
      if (h.hp > 0) return;
      if (h.secondWind) {
        h.secondWind = false;
        h.hp = Math.round(h.hpMax * DATA.hero.secondWind);
        ev.push({ t: 'log', text: 'Brayan goes down...', tone: 'bad' });
        ev.push({ t: 'revive', hp: h.hp });
        ev.push({ t: 'log', text: 'and hears the kids, out on the bus, through the wall. He gets up. SECOND WIND!', tone: 'special' });
        return;
      }
      this.lose('gunman', ev);
    }
    lose(by, ev) {
      this.over = 'lose';
      this.lostTo = by;
      this.hero.hp = 0;
      ev.push({ t: 'lose', by });
    }

    endRound(ev) {
      const h = this.hero;
      for (const who of [h, this.foe]) {
        for (const m of who.mods) m.turns--;
        const gone = who.mods.filter((m) => m.turns <= 0);
        who.mods = who.mods.filter((m) => m.turns > 0);
        if (gone.length) ev.push({ t: 'tag' });
      }
      h.focus = h.mods.some((m) => m.label === 'FOCUSED') ? h.focus : 0;
      if (h.ears) {
        h.ears--;
        if (!h.ears) ev.push({ t: 'tag' });
      }
      h.pat = Math.min(h.patMax, h.pat + DATA.hero.patRegen);
      this.round++;
      ev.push({ t: 'round', round: this.round });
    }

    // ------------------------------------------------------------------ going places
    flee(to, ev) {
      if (!this.canFlee() || !this.fleeTo().includes(to)) return ev;
      const f = this.foe;
      if (to === 'out') {
        this.over = 'escape';
        ev.push({ t: 'log', text: 'Brayan runs for the front doors while it can’t stop him, keys in one hand and the can in the other.', tone: 'special' });
        ev.push({ t: 'escape' });
        return ev;
      }
      if (to === 'classA') {
        // (as it was when he listened: going in doesn't give it a turn to wake)
        this.classStage = this.rootStage();
        ev.push({ t: 'log', text: 'While it can’t stop him, Brayan slips into CLASSROOM A.', tone: 'hero' });
        if (this.classStage >= 3) {
          this.lose('root', ev);
          return ev;
        }
        ev.push({ t: 'flee', to, stage: this.classStage });
        this.endRound(ev);
        return ev;
      }
      ev.push({ t: 'log', text: { hallA: 'While it can’t stop him, Brayan runs, down into HALLWAY A.', entrance: 'While it can’t stop him, Brayan runs back to THE ENTRANCE.' }[to], tone: 'hero' });
      ev.push({ t: 'flee', to });
      {
        this.loc = to;
        // (it'll be there again: it always is)
        f.stunned = f.distracted = 0;
        f.stunDmg = 0;
      }
      this.endRound(ev);
      return ev;
    }
    // back out of CLASSROOM A, to HALLWAY A (and the Gunman); or it had him
    leaveClass() {
      const f = this.foe;
      this.loc = 'hallA';
      f.stunned = f.distracted = 0;
      f.stunDmg = 0;
    }
    // something found
    collect(what) {
      if (what === 'can') this.have.fuel++;
      else this.have[what] = true;
    }
  }

  const API = { Battle, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.BRAYAN_BATTLE = API;
})(typeof window !== 'undefined' ? window : globalThis);
