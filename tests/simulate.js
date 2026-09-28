#!/usr/bin/env node
/*
 * Headless battle simulator.
 *   node tests/simulate.js                -> fuzz + balance report, every slasher
 *   node tests/simulate.js 2000           -> more battles
 *   node tests/simulate.js 600 trollge    -> one slasher only
 *   SHOW_LOG=smart node tests/simulate.js -> also print one battle log per slasher
 *
 * Plays full battles with no screen: a "smart" policy (for balance numbers) and a
 * "random" policy that presses every button it can (to shake out crashes), with the default
 * squad and with every squad the title screen's swap can make.
 * Exits non-zero if any battle throws or breaks an invariant.
 */
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'battle.js'));
const SC = globalThis.SC;

const N = Number(process.argv[2]) || 600;
const ENEMIES = process.argv[3] ? [process.argv[3]] : SC.DATA.enemies;
const MAX_TURNS = 80;

function makeIo(rng) {
  return {
    say: async () => {},
    fx: async () => {},
    refresh: () => {},
    // A player hits the zone most of the time when it is wide.
    skillCheck: async (o) => rng() < Math.min(0.95, Math.max(0.2, o.zone * 2.5)),
  };
}

function check(b) {
  const bad = (msg) => {
    throw new Error(`invariant: ${msg} (seed ${b.seed}, turn ${b.turn})`);
  };
  for (const u of b.party) {
    if (!Number.isFinite(u.hp)) bad(`${u.id} hp ${u.hp}`);
    if (u.hp < 0 || u.hp > b.D.health.max) bad(`${u.id} hp out of range ${u.hp}`);
    if (!Number.isFinite(u.res) || u.res < 0 || u.res > u.resMax) bad(`${u.id} res ${u.res}`);
    if (u.dead && u.hp !== 0) bad(`${u.id} dead with hp`);
    if (!u.dead && !u.ghost && u.hp <= 0) bad(`${u.id} alive with 0 hp`);
    if (u.carriedBy && !u.dead) bad(`${u.id} carried while alive`);
    for (const k of ['atk', 'def', 'spd', 'mag', 'chm', 'smt', 'brv']) {
      if (!Number.isFinite(b.stat(u, k))) bad(`${u.id} ${k} NaN`);
    }
  }
  const s = b.enemy;
  if (!Number.isFinite(s.hp) || s.hp < 1 || s.hp > s.maxHp) bad(`${s.id} hp ${s.hp}`);
  if (!Number.isFinite(s.anger) || s.anger < 0 || s.anger > 100) bad(`${s.id} anger ${s.anger}`);
  if (s.flags.overflow !== s.anger >= b.enemyDef.anger.overflow) bad(`overflow flag ${s.flags.overflow} at anger ${s.anger}`);
  for (const k of ['atk', 'def', 'spd']) if (!Number.isFinite(b.stat(s, k))) bad(`${s.id} ${k} NaN`);
  if (b.deathward && !(b.deathward.turns > 0)) bad('deathward with no turns left');
  for (const k of Object.keys(b.bag)) if (b.bag[k] < 0) bad(`bag ${k} < 0`);
  const e = b.escapeChance();
  if (!Number.isFinite(e.chance) || e.chance < 0 || e.chance > 95) bad(`escape ${e.chance}`);
}

// ------------------------------------------------------------------ policies
function randomPolicy(b, rng) {
  const esc = b.escapeChance();
  if (!esc.blocked && rng() < 0.12) return { run: true };
  const cmds = {};
  for (const u of b.party) {
    if (!b.canCommand(u)) continue;
    const acts = b.actionsFor(u).filter((a) => a.enabled);
    const a = acts[Math.floor(rng() * acts.length)];
    if (a.id === 'attack') cmds[u.id] = { type: 'attack' };
    else if (a.id === 'guard') cmds[u.id] = { type: u.ghost ? 'focus' : 'guard' };
    else if (a.id === 'carry') {
      const ts = b.targetsFor('body', u);
      cmds[u.id] = { type: 'carry', target: ts[0].id };
    } else if (a.id === 'skills') {
      const sk = b.skillsFor(u).filter((s) => s.enabled);
      if (!sk.length) {
        cmds[u.id] = { type: 'attack' };
        continue;
      }
      const s = sk[Math.floor(rng() * sk.length)];
      const ts = b.targetsFor(s.target, u);
      cmds[u.id] = { type: 'skill', skill: s.id, target: ts.length ? ts[Math.floor(rng() * ts.length)].id : null };
    } else if (a.id === 'items') {
      const it = b.itemsFor(u).filter((i) => i.enabled);
      if (!it.length) {
        cmds[u.id] = { type: 'attack' };
        continue;
      }
      const i = it[Math.floor(rng() * it.length)];
      const ts = b.targetsFor(i.target, u);
      cmds[u.id] = { type: 'item', item: i.id, target: ts.length ? ts[Math.floor(rng() * ts.length)].id : null };
    }
  }
  return { commands: cmds };
}

function smartPolicy(b, rng) {
  const e = b.enemy;
  const esc = b.escapeChance();
  if (!esc.blocked && (esc.chance >= 60 || (esc.chance >= 40 && b.corporeal().some((u) => u.hp <= 30)))) {
    return { run: true };
  }
  const cmds = {};
  const bodies = b.bodiesToCarry();
  const it = b.intent || {};
  const single = ['melee', 'gun', 'claws', 'scratch'].includes(it.kind);
  const threatened = (u) => b.intentKnown && single && it.targetId === u.id;
  const healItem = () => ['mayonnaise', 'royalBurger', 'orangeJello'].find((k) => b.bag[k] > 0);
  const mustCarry = bodies.length && e.hp / e.maxHp <= 0.5;
  const low = b.corporeal().filter((w) => w.hp <= 45).length;
  for (const u of b.party) {
    if (!b.canCommand(u)) continue;
    const skills = Object.fromEntries(b.skillsFor(u).map((s) => [s.id, s]));
    const can = (id) => skills[id] && skills[id].enabled;
    if (!u.ghost && mustCarry && bodies.length && !Object.values(cmds).some((c) => c.type === 'carry')) {
      cmds[u.id] = { type: 'carry', target: bodies[0].id };
      continue;
    }
    if (!u.ghost && u.hp <= 35 && healItem()) {
      cmds[u.id] = { type: 'item', item: healItem(), target: u.id };
      continue;
    }
    // Trollge: hold still while it stares at you.
    if (u.status.stared && !e.status.stunned && rng() < 0.85) {
      cmds[u.id] = { type: u.ghost ? 'focus' : 'guard' };
      continue;
    }
    if (!u.ghost && threatened(u) && u.hp <= (it.kind === 'scratch' ? 80 : 55) && rng() < 0.7) {
      cmds[u.id] = { type: 'guard' };
      continue;
    }
    if (u.id === 'mel') {
      if (u.flags.glassesOff && rng() < 0.6) cmds[u.id] = { type: 'skill', skill: 'tossGlasses' };
      else if (can('melsPages') && rng() < 0.45) cmds[u.id] = { type: 'skill', skill: 'melsPages' };
      else if (can('tossGlasses') && !e.status.shards && rng() < 0.3) cmds[u.id] = { type: 'skill', skill: 'tossGlasses' };
      else if (b.bag.pocketSand > 0 && rng() < 0.15) cmds[u.id] = { type: 'item', item: 'pocketSand', target: e.id };
      else cmds[u.id] = { type: 'attack' };
    } else if (u.id === 'john') {
      const hurt = b.corporeal().filter((w) => w !== u && w.hp <= 60);
      if (can('lunchBox') && (u.hp <= 70 || hurt.length)) {
        cmds[u.id] = { type: 'skill', skill: 'lunchBox', target: (hurt[0] || b.corporeal().find((w) => w !== u) || u).id };
      } else if (can('batteryCheck') && rng() < 0.35) cmds[u.id] = { type: 'skill', skill: 'batteryCheck' };
      else cmds[u.id] = { type: 'attack' };
    } else if (u.id === 'jim') {
      const target = it.targetId && b.unit(it.targetId);
      if (can('confidentialDocs') && b.turn <= 2) cmds[u.id] = { type: 'skill', skill: 'confidentialDocs' };
      else if (target && !target.status.trap && can('bearTrap') && single) {
        cmds[u.id] = { type: 'skill', skill: 'bearTrap', target: target.id };
      } else if (can('helicopterEscape') && (e.flags.overflow || b.stats.deaths > 0)) cmds[u.id] = { type: 'skill', skill: 'helicopterEscape' };
      else if (u.hp <= 50 && can('zingerBurger')) cmds[u.id] = { type: 'skill', skill: 'zingerBurger' };
      else if (can('matthewsAid') && rng() < 0.2) cmds[u.id] = { type: 'skill', skill: 'matthewsAid' };
      else cmds[u.id] = { type: 'attack' };
    } else if (u.id === 'mysti') {
      if (b.bag.deathward > 0 && !b.deathward && (low >= 2 || (e.flags.overflow && low >= 1))) cmds[u.id] = { type: 'item', item: 'deathward' };
      else if (can('phantomClone') && (u.status.seen || u.hp <= 50)) cmds[u.id] = { type: 'skill', skill: 'phantomClone' };
      else if (can('hiddenDocs') && b.turn <= 2) cmds[u.id] = { type: 'skill', skill: 'hiddenDocs' };
      else if (can('tacticalStab')) cmds[u.id] = { type: 'skill', skill: 'tacticalStab', target: e.id };
      else cmds[u.id] = { type: 'attack' };
    } else {
      if (can('seriousChills') && !e.status.chilled) cmds[u.id] = { type: 'skill', skill: 'seriousChills', target: e.id };
      else if (can('shadowsHand')) cmds[u.id] = { type: 'skill', skill: 'shadowsHand', target: e.id };
      else if (u.res < 40) cmds[u.id] = { type: 'focus' };
      else cmds[u.id] = { type: 'attack' };
    }
  }
  return { commands: cmds };
}

// Plays like someone learning the game: attacks a lot, heals late, rarely guards.
function casualPolicy(b, rng) {
  const esc = b.escapeChance();
  if (!esc.blocked && esc.chance >= 50) return { run: true };
  const cmds = {};
  const bodies = b.bodiesToCarry();
  for (const u of b.party) {
    if (!b.canCommand(u)) continue;
    if (!u.ghost && bodies.length && b.enemy.flags.weakened && !Object.values(cmds).some((c) => c.type === 'carry')) {
      cmds[u.id] = { type: 'carry', target: bodies[0].id };
      continue;
    }
    const heal = ['royalBurger', 'mayonnaise'].find((k) => b.bag[k] > 0);
    if (!u.ghost && u.hp <= 25 && heal && rng() < 0.6) {
      cmds[u.id] = { type: 'item', item: heal, target: u.id };
      continue;
    }
    if (rng() < 0.08) {
      cmds[u.id] = { type: u.ghost ? 'focus' : 'guard' };
      continue;
    }
    const sk = b.skillsFor(u).filter((s) => s.enabled && s.id !== 'nap' && s.id !== 'watermelonLob');
    if (sk.length && rng() < 0.45) {
      const s = sk[Math.floor(rng() * sk.length)];
      const ts = b.targetsFor(s.target, u);
      cmds[u.id] = { type: 'skill', skill: s.id, target: ts.length ? ts[0].id : null };
      continue;
    }
    cmds[u.id] = u.ghost && u.res < 20 ? { type: 'focus' } : { type: 'attack' };
  }
  return { commands: cmds };
}

// ------------------------------------------------------------------ runner
async function play(seed, policy, enemy, party) {
  const b = new SC.Battle({ seed, io: null, enemy, party });
  const prng = SC.makeRng(seed ^ 0x5eed);
  b.io = makeIo(prng);
  await b.start();
  let weakenedTurn = null;
  let overflowTurn = null;
  let lowest = 100;
  while (!b.outcome && b.turn < MAX_TURNS) {
    await b.beginTurn();
    check(b);
    if (b.outcome) break;
    const choice = policy(b, prng);
    if (choice.run) await b.runTurn();
    else await b.resolveTurn(choice.commands);
    check(b);
    for (const u of b.corporeal()) lowest = Math.min(lowest, u.hp);
    if (weakenedTurn == null && b.enemy.flags.weakened) weakenedTurn = b.turn;
    if (overflowTurn == null && b.enemy.flags.overflow) overflowTurn = b.turn;
  }
  return {
    chopper: b.escapedBy === 'chopper',
    outcome: b.outcome || 'timeout',
    turns: b.turn,
    deaths: b.stats.deaths,
    runs: b.stats.runs,
    weakenedTurn,
    overflowTurn,
    credits: b.credits,
    taken: b.stats.damageTaken,
    lowest,
    log: b.log,
  };
}

function summarize(name, rs) {
  const n = rs.length;
  const count = (o) => rs.filter((r) => r.outcome === o).length;
  const avg = (f, list = rs) => (list.length ? list.reduce((s, r) => s + f(r), 0) / list.length : 0);
  const weak = rs.filter((r) => r.weakenedTurn != null);
  const over = rs.filter((r) => r.overflowTurn != null);
  console.log(`\n== ${name} policy — ${n} battles`);
  console.log(`win ${((100 * count('win')) / n).toFixed(1)}%  lose ${((100 * count('lose')) / n).toFixed(1)}%  timeout ${count('timeout')}`);
  console.log(
    `avg turns ${avg((r) => r.turns).toFixed(1)}  avg deaths ${avg((r) => r.deaths).toFixed(2)}  avg run tries ${avg((r) => r.runs).toFixed(2)}  avg credits ${avg((r) => r.credits).toFixed(1)}`
  );
  console.log(
    `weakened in ${((100 * weak.length) / n).toFixed(0)}% (avg turn ${avg((r) => r.weakenedTurn, weak).toFixed(1)}); 80+ ANGER in ${((100 * over.length) / n).toFixed(0)}% (avg turn ${avg((r) => r.overflowTurn, over).toFixed(1)})`
  );
  console.log(
    `avg damage taken ${avg((r) => r.taken).toFixed(0)}  avg lowest worker health ${avg((r) => r.lowest).toFixed(0)}  battles with a death ${((100 * rs.filter((r) => r.deaths > 0).length) / n).toFixed(0)}%  wins by chopper ${((100 * rs.filter((r) => r.chopper).length) / n).toFixed(0)}%`
  );
}

module.exports = { smartPolicy, casualPolicy, randomPolicy, makeIo, play };

// Every squad the title screen can make by swapping Purpl Lady in for one of the default four.
function swaps() {
  const D = SC.DATA;
  return D.party.map((out) => ({ out, party: D.party.map((id) => (id === out ? D.bench : id)) }));
}

async function main() {
  let failures = 0;
  const POLICIES = [
    ['smart', smartPolicy],
    ['casual', casualPolicy],
    ['random', randomPolicy],
  ];
  for (const enemy of ENEMIES) {
    console.log(`\n######## vs ${SC.DATA.slashers[enemy].name.toUpperCase()}`);
    for (const [name, policy] of POLICIES) {
      const results = [];
      for (let i = 0; i < N; i++) {
        const seed = (i * 2654435761) >>> 0;
        try {
          results.push(await play(seed, policy, enemy));
        } catch (err) {
          failures++;
          console.error(`[${enemy} ${name}] seed ${seed}:`, err && err.stack ? err.stack : err);
          if (failures > 5) process.exit(1);
        }
      }
      summarize(name, results);
      if (name === process.env.SHOW_LOG) {
        const r = results.find((x) => x.outcome === 'win') || results[0];
        console.log('\n--- sample battle log ---');
        for (const l of r.log) console.log(l.text);
      }
    }
    // The squad swaps: fewer battles each, still checked for crashes and broken states.
    const M = Math.max(50, Math.round(N / 3));
    console.log(`\n-- ${SC.DATA.workers[SC.DATA.bench].name} in for someone, ${M} battles each (win %: smart / casual / random)`);
    for (const { out, party } of swaps()) {
      const rates = [];
      for (const [name, policy] of POLICIES) {
        let wins = 0;
        for (let i = 0; i < M; i++) {
          const seed = (i * 2654435761 + 97) >>> 0;
          try {
            if ((await play(seed, policy, enemy, party)).outcome === 'win') wins++;
          } catch (err) {
            failures++;
            console.error(`[${enemy} ${name} without ${out}] seed ${seed}:`, err && err.stack ? err.stack : err);
            if (failures > 5) process.exit(1);
          }
        }
        rates.push(((100 * wins) / M).toFixed(0) + '%');
      }
      console.log(`   instead of ${SC.DATA.workers[out].name.padEnd(12)} ${rates.join(' / ')}`);
    }
  }
  if (failures) {
    console.error(`\n${failures} battle(s) failed`);
    process.exit(1);
  }
  console.log('\nall battles finished without errors');
}

if (require.main === module) main();
