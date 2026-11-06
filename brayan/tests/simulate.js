// Plays Brayan's fight many times without the HUD, to see how the numbers hold up:
//   node brayan/tests/simulate.js [fights]
// smart: the escape route (stun, FLEE, find what's there, back out); killer: only fights;
// random: anything. The searches always find the thing; a dodge lands `dodge` of the time.
const { Battle } = require('../js/battle.js');
const DATA = require('../js/data.js');

function play(style, seed) {
  const b = new Battle(seed);
  const rnd = b.rand;
  const dodge = { smart: 0.7, killer: 0.7, random: 0.4 }[style];
  let guard = 0;
  let inClass = false;
  while (!b.over && guard++ < 300) {
    if (b.pending) { b.shot(rnd() < dodge); continue; }
    if (b.hero.frozen) { b.command({ type: 'frozen' }); continue; }
    const o = b.options();
    const h = b.hero;
    let cmd = null;
    if (style !== 'random') {
      if (h.hp < h.hpMax * 0.35 && b.items.bec) cmd = { type: 'item', id: 'bec' };
      else if (h.pat < 25) cmd = b.items.newports ? { type: 'item', id: 'newports' } : { type: 'skill', id: 'breath' };
      else if (style === 'smart' && o.flee.ok) {
        const to = o.flee.to;
        if (to.includes('out')) cmd = { type: 'flee', to: 'out' };
        else if (b.loc === 'entrance') cmd = { type: 'flee', to: 'hallA' };
        else if (!b.have.keys && b.rootStage() < 3) cmd = { type: 'flee', to: 'classA' };
        else if (b.have.keys) cmd = { type: 'flee', to: 'entrance' };
      }
      if (!cmd) cmd = h.pat >= 18 && rnd() < 0.3 ? { type: 'skill', id: 'chair' } : { type: 'attack' };
    } else {
      const pick = rnd();
      if (o.flee.ok && pick < 0.5) cmd = { type: 'flee', to: o.flee.to[Math.floor(rnd() * o.flee.to.length)] };
      else if (pick < 0.65) { const s = o.skills.filter((x) => x.ok); cmd = s.length ? { type: 'skill', id: s[Math.floor(rnd() * s.length)].id } : { type: 'attack' }; }
      else if (pick < 0.8) { const a = o.acts[Math.floor(rnd() * o.acts.length)]; cmd = { type: 'act', id: a.id, passed: rnd() < 0.3 }; }
      else if (pick < 0.88 && o.items.some((i) => i.ok)) { const it = o.items.filter((i) => i.ok); cmd = { type: 'item', id: it[0].id }; }
      else cmd = { type: 'attack' };
    }
    const ev = b.command(cmd);
    for (const e of ev) {
      if (e.t !== 'flee') continue;
      if (e.to === 'hallA' && !b.seen.hallA) { b.seen.hallA = true; b.collect('can'); }
      if (e.to === 'classA') { b.collect('keys'); b.collect('bear'); b.leaveClass(); }
    }
  }
  return { over: b.over || 'stuck', lostTo: b.lostTo, rounds: b.round, foeHp: b.foe.hp / b.foe.hpMax };
}

const N = +process.argv[2] || 500;
for (const style of ['smart', 'killer', 'random']) {
  const res = [];
  for (let i = 0; i < N; i++) res.push(play(style, 1000 + i * 7919));
  const n = (k) => res.filter((r) => r.over === k).length;
  const avg = (f) => (res.reduce((a, r) => a + f(r), 0) / res.length).toFixed(1);
  console.log(`${style.padEnd(7)} escape ${(100 * n('escape') / N).toFixed(1)}%  killed it ${(100 * n('win') / N).toFixed(1)}%  lost ${(100 * n('lose') / N).toFixed(1)}% (to the thing ${res.filter((r) => r.lostTo === 'root').length})  stuck ${n('stuck')}  rounds ${avg((r) => r.rounds)}`);
}
