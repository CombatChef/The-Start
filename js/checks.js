/*
 * SLASHCO VR — TURN-BASED BATTLE
 * checks.js — the rules of the two generator skill checks, with no drawing, so they can be
 * tested in Node. js/ui.js draws them and feeds in the keys.
 *
 *  FUEL: the arrow loses its balance. The further it leans, the faster it falls, and a gust
 *        keeps shoving it one way or the other. Every press of [Q] or [E] makes it jump back a
 *        little. Keep it out of the red until the can is empty.
 *  BATTERY: two clips bounce up and down at random speeds and change direction at random.
 *        Press when both are level with the middle of the terminals.
 *
 * Purpl Lady's Moral Support slows both down (`o.slow`, below 1): the arrow falls slower and
 * the clips move slower and turn less often.
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const FUEL = {
    lean: 4, // how fast a lean turns into a fall (per second squared, per unit of lean)
    gust: 1.1, // strongest shove
    gustEvery: [0.6, 1.3], // seconds between changes of shove
    drag: 1.5, // how quickly the arrow loses speed on its own
    jump: 0.08, // how far one press moves it
    brake: 0.3, // a press also takes away this much of its speed (as a share)
    harder: 0.35, // it falls up to 35% faster by the end of the pour
  };
  const BATTERY = {
    speed: [0.35, 0.95], // clip speed range, in heights per second
    turnEvery: [0.35, 1.0], // seconds between random turns
  };

  // p: 0 = left end, 0.5 = top of the arch, 1 = right end. The red covers `red` at each end.
  function fuel(o, rnd) {
    rnd = rnd || Math.random;
    const range = (a, b) => a + rnd() * (b - a);
    const safe = clamp(0.38 + o.zone * 1.2, 0.45, 0.85);
    const s = {
      kind: 'fuel',
      p: 0.5,
      v: 0,
      red: (1 - safe) / 2,
      t: 0,
      ms: o.ms,
      slow: o.slow || 1,
      done: false,
      ok: null,
      gust: (rnd() < 0.5 ? -1 : 1) * range(0.6, 1) * FUEL.gust,
      gustNow: 0,
      nextGust: range(FUEL.gustEvery[0], FUEL.gustEvery[1]),
    };
    // A press of [Q] (dir -1) or [E] (dir +1).
    s.tap = (dir) => {
      if (s.done) return;
      s.p = clamp(s.p + dir * FUEL.jump, 0, 1);
      s.v *= 1 - FUEL.brake;
      s.check();
    };
    s.check = () => {
      if (s.p <= s.red || s.p >= 1 - s.red) {
        s.done = true;
        s.ok = false;
      }
    };
    s.step = (dt) => {
      if (s.done) return;
      s.t += dt * 1000;
      const d = dt * s.slow; // Moral Support: everything happens slower
      s.nextGust -= d;
      if (s.nextGust <= 0) {
        s.gust = (rnd() < 0.5 ? -1 : 1) * range(0.35, 1) * FUEL.gust;
        s.nextGust = range(FUEL.gustEvery[0], FUEL.gustEvery[1]);
      }
      s.gustNow += (s.gust - s.gustNow) * Math.min(1, d * 6);
      const harder = 1 + FUEL.harder * clamp(s.t / s.ms, 0, 1);
      const a = (FUEL.lean * (s.p - 0.5) + s.gustNow) * harder;
      s.v += a * d;
      s.v -= s.v * FUEL.drag * d;
      s.p = clamp(s.p + s.v * d, 0, 1);
      s.check();
      if (!s.done && s.t >= s.ms) {
        s.done = true;
        s.ok = true;
      }
    };
    return s;
  }

  // Clip heights: 0 = top, 1 = bottom. The middle of the terminals is 0.5; a clip counts as
  // lined up within `tol` of it.
  function battery(o, rnd) {
    rnd = rnd || Math.random;
    const range = (a, b) => a + rnd() * (b - a);
    const slow = o.slow || 1;
    const speed = () => (rnd() < 0.5 ? -1 : 1) * range(BATTERY.speed[0], BATTERY.speed[1]) * slow;
    const turn = () => range(BATTERY.turnEvery[0], BATTERY.turnEvery[1]) / slow; // steadier when slowed
    const s = {
      kind: 'battery',
      clips: [0, 1].map(() => ({ y: rnd() < 0.5 ? range(0.02, 0.22) : range(0.78, 0.98), v: speed(), turn: turn() })),
      tol: clamp(0.07 + o.zone * 0.45, 0.1, 0.25),
      t: 0,
      ms: o.ms / slow, // slower clips get the same number of chances
      slow,
      done: false,
      ok: null,
    };
    s.inside = (c) => Math.abs(c.y - 0.5) <= s.tol;
    s.press = () => {
      if (s.done) return null;
      s.done = true;
      s.ok = s.clips.every(s.inside);
      return s.ok;
    };
    s.step = (dt) => {
      if (s.done) return;
      s.t += dt * 1000;
      for (const c of s.clips) {
        c.turn -= dt;
        if (c.turn <= 0) {
          c.v = speed();
          c.turn = turn();
        }
        c.y += c.v * dt;
        if (c.y < 0) {
          c.y = -c.y;
          c.v = Math.abs(c.v);
        } else if (c.y > 1) {
          c.y = 2 - c.y;
          c.v = -Math.abs(c.v);
        }
      }
      if (s.t >= s.ms) {
        s.done = true;
        s.ok = false;
        s.late = true;
      }
    };
    return s;
  }

  SC.Checks = { fuel, battery, FUEL, BATTERY };
})(typeof window !== 'undefined' ? window : globalThis);
