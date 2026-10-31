// Headless balance test for Crispy's birthday battle: plays many fights with a few kinds of
// player and prints how they go. node crispy/tests/simulate.js [fights]
const DATA = require('../js/data.js');
const { Battle } = require('../js/battle.js');

const N = +process.argv[2] || 3000;

// Players. Each gets the battle and returns a command.
const POLICIES = {
  // Knows what everything does.
  smart(b) {
    const h = b.hero;
    const o = b.options();
    const ok = (id) => o.skills.find((s) => s.id === id).ok;
    const pct = h.hp / h.hpMax;
    if (b.awaiting === 'again') return { type: 'special' };
    if (pct < 0.3 && h.items.cheese) return { type: 'item', id: 'cheese' };
    if (pct < 0.25 && h.items.choc) return { type: 'item', id: 'choc' };
    if (ok('nut')) return { type: 'special' };
    if (b.stage.final && !h.tasteUsed && ok('taste')) return { type: 'skill', id: 'taste' };
    if (h.real) return { type: 'attack' };
    if (!h.mods.some((m) => m.label === 'EARLY BIRD') && ok('early')) return { type: 'skill', id: 'early' };
    if (b.foe.slices < 2 && ok('slice') && b.stage.final) return { type: 'skill', id: 'slice' };
    if (b.foe.mods.some((m) => m.good) && ok('authority')) return { type: 'skill', id: 'authority', target: 'foe' };
    if (h.afraid && ok('authority')) return { type: 'skill', id: 'authority', target: 'hero' };
    if (b.stage.final && h.items.pills && !h.mods.some((m) => m.label === 'CLEAR-HEADED')) return { type: 'item', id: 'pills' };
    if (h.sp < 25 && pct < 0.9) return { type: 'skill', id: 'wine' };
    if (ok('rg') && h.sp > 60) return { type: 'skill', id: 'rg' };
    if (ok('trash') && b.rand() < 0.5) return { type: 'skill', id: 'trash' };
    return { type: 'attack' };
  },
  // Pokes at the menus: any command that's allowed.
  random(b) {
    if (b.awaiting === 'again') return { type: b.rand() < 0.5 ? 'special' : 'pass' };
    const o = b.options();
    const all = [{ type: 'attack' }];
    for (const s of o.skills) if (s.ok) all.push(s.special ? { type: 'special' } : { type: 'skill', id: s.id, target: b.rand() < 0.5 ? 'foe' : 'hero' });
    for (const a of o.acts) all.push({ type: 'act', id: a.id });
    for (const i of o.items) if (i.ok) all.push({ type: 'item', id: i.id });
    if (b.rand() < 0.05) all.push({ type: 'mercy', id: b.rand() < 0.5 ? 'flee' : 'spare' });
    return all[Math.floor(b.rand() * all.length)];
  },
  // Mostly attacks; eats when he's low; uses his skills now and then.
  casual(b) {
    const h = b.hero;
    const o = b.options();
    const ok = (id) => o.skills.find((s) => s.id === id).ok;
    if (b.awaiting === 'again') return { type: 'special' };
    if (h.hp < h.hpMax * 0.3) {
      if (h.items.cheese) return { type: 'item', id: 'cheese' };
      if (h.items.choc) return { type: 'item', id: 'choc' };
    }
    if (ok('nut')) return { type: 'special' };
    const r = b.rand();
    if (r < 0.15 && ok('trash')) return { type: 'skill', id: 'trash' };
    if (r < 0.25 && ok('slice')) return { type: 'skill', id: 'slice' };
    if (r < 0.32 && ok('taste')) return { type: 'skill', id: 'taste' };
    if (r < 0.38 && ok('early')) return { type: 'skill', id: 'early' };
    return { type: 'attack' };
  },
  // Only ever presses ATTACK.
  mash(b) {
    if (b.awaiting === 'again') return { type: 'pass' };
    return { type: 'attack' };
  },
};

const KNOWN = new Set(['log', 'fx', 'hit', 'miss', 'block', 'heal', 'sp', 'tag', 'adjust', 'revive', 'win', 'lose', 'again', 'round', 'lights', 'sword', 'foe']);
let bad = 0;
for (const [name, policy] of Object.entries(POLICIES)) {
  let wins = 0, rounds = 0, andy = 0, revived = 0, ko = 0, nuts = 0, forced = 0, timed = 0, hpLeft = 0;
  const reached = [0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    const b = new Battle(1000 + i * 7919);
    let guard = 0;
    while (!b.over && guard++ < 400) {
      const ev = b.command(policy(b));
      for (const e of ev) {
        if (!KNOWN.has(e.t)) throw new Error('unknown event ' + e.t);
        if (e.t === 'log' && (!e.text || /undefined|NaN/.test(e.text))) { bad++; console.log('BAD LOG', e); }
        if (e.t === 'hit' && !(e.amount >= 0)) { bad++; console.log('BAD HIT', e); }
        if (e.t === 'adjust') (e.forced ? forced++ : timed++);
        if (e.t === 'hit' && e.kind === 'ko') ko++;
        if (e.t === 'fx' && e.name === 'nut') nuts++;
        if (e.t === 'revive') revived++;
      }
      if (b.hero.hp > b.hero.hpMax || b.hero.sp > b.hero.spMax || b.hero.sp < 0) { bad++; console.log('BAD STATE', b.hero.hp, b.hero.sp); }
    }
    if (!b.over) { bad++; console.log('NEVER ENDED', name, i); }
    reached[b.foe.stage]++;
    if (b.foe.stage === 4) andy++;
    if (b.over === 'win') { wins++; hpLeft += b.hero.hp / b.hero.hpMax; }
    rounds += b.round;
  }
  const p = (n) => ((100 * n) / N).toFixed(1) + '%';
  console.log(`${name.padEnd(7)} win ${p(wins)}  rounds ${(rounds / N).toFixed(1)}  saw Andy ${p(andy)}  revived ${p(revived)}  KO ${p(ko)}  nut/fight ${(nuts / N).toFixed(2)}  adjust forced/timed ${(forced / N).toFixed(2)}/${(timed / N).toFixed(2)}  hp left on a win ${wins ? ((100 * hpLeft) / wins).toFixed(0) : 0}%  ended at stage ${reached.map((r) => p(r)).join(' ')}`);
}
if (bad) {
  console.log(bad + ' problems');
  process.exit(1);
}
console.log('ok');
