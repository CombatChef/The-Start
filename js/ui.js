/*
 * SLASHCO VR — TURN-BASED BATTLE
 * ui.js — the HUD, in the style of SlashCo VR's own: SLASHERBOY (the monitor-room computer)
 * prints the battle log, the slasher's condition floats on the left, orders go through the
 * menu on the right, and each worker's profile shows health the way the game does, as a
 * coloured word under a heart. Also targeting, the generator skill checks (drawn after the
 * in-game ones), the title screen with the squad swap, and every animation.
 * It implements the `io` the battle engine talks to (say / fx / skillCheck / refresh).
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  const doc = root.document;

  // ------------------------------------------------------------------ helpers
  const $ = (sel, parent) => (parent || doc).querySelector(sel);
  function el(tag, cls, html) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sfx = (name) => SC.Audio && SC.Audio.play(name);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Party order = profile order along the bottom. Must match .profile[data-slot] in the CSS.
  const PROFILE_XY = [
    [16, 714],
    [330, 714],
    [644, 714],
    [958, 714],
  ];
  // Where each slasher's sprite sits on the stage (it is drawn at 2x).
  const ENEMY_BOX = {
    sid: { left: 500, top: 250 },
    trollge: { left: 390, top: 256 },
    dolphin: { left: 536, top: 210 },
  };
  const SCALE = 2;
  // SlashCo's danger levels, colour-coded 1 (yellow) to 3 (red).
  const DANGER = { MODERATE: 1, CONSIDERABLE: 2, DEVASTATING: 3 };
  // Health words and their colours, as on SlashCo VR's HUD.
  const HP_COLOR = {
    OVERSATED: 'var(--hp-oversated)',
    SATED: 'var(--hp-sated)',
    OK: 'var(--hp-ok)',
    STABLE: 'var(--hp-stable)',
    SCATHED: 'var(--hp-scathed)',
    HURT: 'var(--hp-hurt)',
    CRITICAL: 'var(--hp-critical)',
    DEAD: 'var(--hp-dead)',
    NONE: 'var(--hp-none)',
  };
  // The slasher's condition, from its doc health ("Good", "Unhealthy") down to BARELY STANDING.
  const FOE_COLOR = {
    GOOD: 'var(--hp-ok)',
    OK: 'var(--hp-ok)',
    UNHEALTHY: 'var(--hp-stable)',
    BRUISED: 'var(--hp-scathed)',
    WOUNDED: 'var(--hp-hurt)',
    WEAKENED: 'var(--hp-critical)',
    'BARELY STANDING': 'var(--red)',
  };

  // Icons, drawn the way SlashCo VR's HUD draws them: flat white shapes.
  const SVG = {
    heart:
      '<svg viewBox="0 0 32 30"><path d="M16 29C16 29 1 19.5 1 9.5 1 4.5 5 1 9.2 1c3.2 0 5.6 2 6.8 4.4C17.2 3 19.6 1 22.8 1 27 1 31 4.5 31 9.5 31 19.5 16 29 16 29Z"/></svg>',
    // CRITICAL: the skull and crossbones.
    skullBones:
      '<svg viewBox="0 0 48 44"><g stroke="currentColor" stroke-width="5" stroke-linecap="round"><line x1="8" y1="9" x2="40" y2="37"/><line x1="40" y1="9" x2="8" y2="37"/></g><circle cx="5" cy="10" r="3.6"/><circle cx="9" cy="5.5" r="3.6"/><circle cx="43" cy="10" r="3.6"/><circle cx="39" cy="5.5" r="3.6"/><circle cx="5" cy="36" r="3.6"/><circle cx="9" cy="40.5" r="3.6"/><circle cx="43" cy="36" r="3.6"/><circle cx="39" cy="40.5" r="3.6"/><path d="M24 5c-9 0-13.5 6-13.5 12.8 0 4.4 2 7 4.8 8.6V32h17.4v-5.6c2.8-1.6 4.8-4.2 4.8-8.6C37.5 11 33 5 24 5Z"/><g fill="#000"><ellipse cx="18.6" cy="18.5" rx="3.8" ry="4.2"/><ellipse cx="29.4" cy="18.5" rx="3.8" ry="4.2"/><path d="M24 22.5l-2.4 4.4h4.8Z"/><rect x="20" y="28.5" width="1.8" height="3.5"/><rect x="26.2" y="28.5" width="1.8" height="3.5"/></g></svg>',
    skull:
      '<svg viewBox="0 0 48 44"><path d="M24 3c-10 0-15 6.8-15 14.4 0 5 2.2 8 5.4 9.8V34h19.2v-6.8c3.2-1.8 5.4-4.8 5.4-9.8C39 9.8 34 3 24 3Z"/><g fill="#000"><ellipse cx="18" cy="18" rx="4.2" ry="4.6"/><ellipse cx="30" cy="18" rx="4.2" ry="4.6"/><path d="M24 23l-2.6 4.6h5.2Z"/><rect x="19.5" y="29.5" width="2" height="4.5"/><rect x="26.5" y="29.5" width="2" height="4.5"/></g></svg>',
    ghost:
      '<svg viewBox="0 0 32 32"><path d="M16 2C8.5 2 4 7.8 4 14.8V30l4-3.6 4 3.6 4-3.6 4 3.6 4-3.6 4 3.6V14.8C28 7.8 23.5 2 16 2Z"/><g fill="#000"><ellipse cx="11.5" cy="14" rx="2.6" ry="3.4"/><ellipse cx="20.5" cy="14" rx="2.6" ry="3.4"/></g></svg>',
    // The fuel check's ▽ marker.
    marker: '<svg viewBox="0 0 38 34"><polygon points="4,4 34,4 19,30" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>',
    // A petrol pump that fills with white as the fuel goes in.
    pump: '<svg viewBox="0 0 64 72"><defs><clipPath id="pump-shape"><path d="M8 6h30a4 4 0 0 1 4 4v52H4V10a4 4 0 0 1 4-4Z"/><rect x="0" y="62" width="46" height="8"/></clipPath><clipPath id="pump-fill"><rect id="pump-level" x="0" y="72" width="64" height="72"/></clipPath></defs><g clip-path="url(#pump-shape)"><rect width="64" height="72" fill="#5a5a5a"/><rect width="64" height="72" fill="#fff" clip-path="url(#pump-fill)"/></g><rect x="10" y="13" width="26" height="18" rx="2" fill="#000"/><path d="M42 20h8a4 4 0 0 1 4 4v22a3 3 0 0 0 6 0V16l-6-8" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // An alligator clip, jaws to the right.
    clip: '<svg viewBox="0 0 96 44"><g stroke="#000" stroke-width="11" stroke-linecap="round"><line x1="44" y1="20" x2="7" y2="6"/><line x1="44" y1="24" x2="7" y2="38"/></g><g stroke="#fff" stroke-width="6" stroke-linecap="round"><line x1="44" y1="20" x2="7" y2="6"/><line x1="44" y1="24" x2="7" y2="38"/></g><rect x="44" y="13" width="48" height="18" rx="4" fill="#fff" stroke="#000" stroke-width="3"/><polyline points="52,22 56,17 60,22 64,17 68,22 72,17 76,22 80,17 84,22 88,17" fill="none" stroke="#000" stroke-width="2.5"/><circle cx="46" cy="22" r="7" fill="#fff" stroke="#000" stroke-width="3"/><circle cx="46" cy="22" r="2" fill="#000"/></svg>',
    // The SLASHCO logo's saw blade.
    saw: (() => {
      let pts = '';
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const r = i % 2 ? 50 : 62;
        pts += `${(66 + Math.cos(a) * r).toFixed(1)},${(66 + Math.sin(a) * r).toFixed(1)} `;
      }
      return `<svg viewBox="0 0 132 66"><polygon points="${pts}" fill="#d9d9d9"/><circle cx="66" cy="66" r="14" fill="#000"/></svg>`;
    })(),
  };

  const UI = {
    battle: null,
    enemy: SC.DATA.enemy, // the slasher picked on the title screen
    place: 'random', // where the fight is: a data.js place, or 'random' (a different one each fight)
    party: SC.DATA.party.slice(), // the squad picked on the title screen
    bench: SC.DATA.bench,
    fast: false,
    cards: {},
    frame: 0,
    phase: 'boot', // boot | title | command | resolving | end — handy for tests
  };
  SC.UI = UI;

  let stage;
  let fxLayer;
  let flashEl;
  let enemyWrap;
  let enemyCanvas;
  let command;
  let panel;
  let escapeEl;
  let cursor;

  const slotOf = (id) => UI.party.indexOf(id);
  const enemyId = () => (UI.battle ? UI.battle.enemy.id : UI.enemy);
  const enemyDef = () => SC.DATA.slashers[enemyId()];
  // The place behind the fight (or, on the title screen, the one picked: the hallway for RANDOM).
  const placeId = () => (UI.battle ? UI.battle.place : SC.DATA.places[UI.place] ? UI.place : 'hallway');
  const placeLabel = (P) => P.name.toUpperCase() + (P.dark ? ' · DARK' : '');

  // The place's screenshot, shown as it is, and the slasher lit to match it.
  function showPlace() {
    const id = placeId();
    const P = SC.DATA.places[id];
    const bg = $('#bg');
    bg.style.backgroundImage = `url("${P.image}")`;
    bg.style.backgroundPosition = `${P.focus}% 50%`;
    enemyWrap.style.filter = P.tone || '';
    stage.dataset.place = id;
  }
  const enemyPoints = () => {
    const id = enemyId();
    if (id === 'trollge') return SC.Art.trollgePoints();
    if (id === 'dolphin') return SC.Art.dolphinPoints();
    return SC.Art.sidPoints(SidView.armed);
  };

  function cardCenter(id) {
    const [x, y] = PROFILE_XY[Math.max(0, slotOf(id))];
    return [x + 153, y + 117];
  }
  function enemyPoint(name) {
    const pts = enemyPoints();
    const p = pts[name] || pts.body;
    const box = ENEMY_BOX[enemyId()];
    return [box.left + p[0] * SCALE, box.top + p[1] * SCALE];
  }
  function stageRect(elem) {
    const r = elem.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const k = 1280 / s.width;
    return { x: (r.left - s.left) * k, y: (r.top - s.top) * k, w: r.width * k, h: r.height * k };
  }
  function pulse(elem, cls, ms) {
    if (!elem) return;
    elem.classList.remove(cls);
    void elem.offsetWidth; // restart the CSS animation
    elem.classList.add(cls);
    setTimeout(() => elem.classList.remove(cls), ms);
  }
  const T = (ms) => wait(UI.fast ? ms * 0.35 : ms);

  // ------------------------------------------------------------------ stage fit
  function fit() {
    const vp = $('#viewport');
    const w = vp.clientWidth || root.innerWidth;
    const h = vp.clientHeight || root.innerHeight;
    const s = Math.min(w / 1280, h / 960);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  // ------------------------------------------------------------------ input
  const Input = {
    stack: [],
    push(h) {
      this.stack.push(h);
      return h;
    },
    remove(h) {
      const i = this.stack.indexOf(h);
      if (i >= 0) this.stack.splice(i, 1);
    },
    top() {
      return this.stack[this.stack.length - 1];
    },
  };
  const KEYS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
    q: 'q', // the fuel check's own keys, as in SlashCo VR
    e: 'e',
    z: 'ok',
    Enter: 'ok',
    ' ': 'ok',
    x: 'back',
    Escape: 'back',
    Backspace: 'back',
    l: 'log',
    m: 'mute',
    f: 'fast',
    h: 'help',
  };
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.tagName === 'INPUT' && e.key !== 'Enter' && e.key !== 'Escape') return; // typing in a box
    const k = KEYS[e.key] || KEYS[e.key && e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    if (SC.Audio) SC.Audio.unlock();
    if (k === 'mute') return toggleMute();
    if (k === 'fast') return toggleFast();
    const open = doc.querySelector('.overlay.show');
    if (k === 'log' && !open && UI.battle) return showHistory();
    if (k === 'help' && !open && UI.battle) return showHelp();
    const h = Input.top();
    if (h && h.key) h.key(k, e);
  }

  // ------------------------------------------------------------------ SLASHERBOY (battle log)
  // Names stand out in white; the slasher's name is red.
  const NAMES = {};
  for (const [id, d] of Object.entries(SC.DATA.workers)) NAMES[d.name] = '';
  for (const [id, d] of Object.entries(SC.DATA.slashers)) NAMES[d.name] = 'foe';
  const NAME_RE = new RegExp(
    '\\b(' +
      Object.keys(NAMES)
        .sort((a, b) => b.length - a.length)
        .join('|') +
      ')\\b',
    'g'
  );
  function colorize(text) {
    return esc(text).replace(NAME_RE, (m) => (NAMES[m] ? `<b class="${NAMES[m]}">${m}</b>` : `<b>${m}</b>`));
  }
  const Log = {
    skip: false,
    history: [],
    async say(text, o) {
      o = o || {};
      this.history.push({ text, tone: o.tone || '' });
      const lines = $('#log-lines');
      lines.querySelectorAll('.line.new').forEach((l) => l.classList.remove('new'));
      const line = el('div', 'line new ' + (o.tone || ''));
      lines.appendChild(line);
      while (lines.children.length > 4) lines.firstChild.remove();
      const html = colorize(text);
      this.skip = false;
      if (UI.fast) {
        line.innerHTML = html;
        await wait(120);
        return;
      }
      const chars = Array.from(text);
      for (let i = 2; i < chars.length + 2 && !this.skip; i += 2) {
        line.textContent = chars.slice(0, i).join('');
        if (i % 4 === 0) sfx('blip');
        await wait(16);
      }
      line.innerHTML = html;
      this.skip = false;
      const box = $('#log');
      box.classList.add('waiting');
      const hold = 360 + Math.min(900, text.length * 9);
      const t0 = performance.now();
      while (performance.now() - t0 < hold && !this.skip) await wait(16);
      box.classList.remove('waiting');
    },
  };

  // ------------------------------------------------------------------ worker profiles
  function buildCard(id) {
    const d = SC.DATA.workers[id];
    const r = el('div', 'profile');
    r.dataset.slot = slotOf(id);
    r.id = 'card-' + id;
    r.innerHTML = `
      <div class="name">[${esc(d.name.toUpperCase())}]</div>
      <div class="photo"><canvas class="px" width="128" height="128"></canvas></div>
      <div class="vitals">
        <div class="heart"></div>
        <div class="state"></div>
        <div class="res"></div>
      </div>
      <div class="tags"></div>
      <div class="intent"></div>`;
    stage.insertBefore(r, $('#fx')); // below effects and menus
    const c = {
      root: r,
      canvas: $('.photo canvas', r),
      heart: $('.heart', r),
      icon: '',
      state: $('.state', r),
      res: $('.res', r),
      tags: $('.tags', r),
      intent: $('.intent', r),
      key: '',
    };
    r.addEventListener('click', () => {
      const h = Input.top();
      if (h && h.card) h.card(id);
    });
    r.addEventListener('mouseenter', () => {
      const h = Input.top();
      if (h && h.hoverCard) h.hoverCard(id);
    });
    UI.cards[id] = c;
    return c;
  }

  // One profile per worker in the squad, rebuilt whenever the squad changes.
  function buildCards() {
    stage.querySelectorAll('.profile').forEach((p) => p.remove());
    UI.cards = {};
    for (const id of UI.party) buildCard(id);
  }

  // The slasher's block on the left: name, class, danger level, condition, ANGER.
  function buildPlate() {
    const r = $('#foe');
    UI.plate = {
      root: r,
      name: $('.name', r),
      cls: $('.facts .cls', r),
      danger: $('.facts .dlvl', r),
      state: $('.state', r),
      anger: $('.anger', r),
      tags: $('.tags', r),
    };
  }

  // Put the chosen slasher in the hallway and on the left.
  function placeEnemy() {
    const id = enemyId();
    const S = enemyDef();
    const pts = enemyPoints();
    const box = ENEMY_BOX[id];
    stage.dataset.enemy = id;
    enemyCanvas.width = pts.w;
    enemyCanvas.height = pts.h;
    Object.assign(enemyWrap.style, {
      left: box.left + 'px',
      top: box.top + 'px',
      width: pts.w * SCALE + 'px',
      height: pts.h * SCALE + 'px',
    });
    const P = UI.plate;
    P.name.textContent = `[${S.title}]`;
    P.cls.textContent = S.class;
    P.danger.dataset.level = DANGER[S.danger] || 1;
    P.danger.textContent = S.danger;
    if (id === 'sid') SidView.reset();
    view().draw(performance.now(), true);
  }

  function unique(list) {
    return Array.from(new Set(list));
  }

  function workerLook(b, u) {
    const hs = b.healthState(u).id;
    let variant = u.id;
    let mood = 'neutral';
    let fx = [];
    let fade;
    if (u.id === 'mel' && u.flags.glassesOff) variant = 'mel_noglasses';
    if (u.ghost) {
      mood = 'ghost';
      if (u.status.phasing) fade = 0.28;
      else if (u.res <= 0) {
        mood = 'drained';
        fade = 0.6;
      }
    } else if (u.dead) {
      mood = 'dead';
      if (u.id === 'mel') {
        variant = 'mel_noglasses';
        fx = ['shatter', 'blood'];
      } else fx = ['blood'];
    } else if (hs === 'CRITICAL') {
      mood = 'critical';
      fx = ['blood', 'sweat'];
    } else if (hs === 'HURT') {
      mood = 'hurt';
      fx = [u.id === 'mel' ? 'cracks' : 'scratches', 'sweat'];
    } else if (hs === 'SCATHED') {
      mood = 'hurt';
      fx = [u.id === 'mel' ? 'cracks' : 'scratches'];
    } else if (hs === 'SATED' || hs === 'OVERSATED') mood = 'sated';
    if (!u.dead) {
      if (u.status.asleep) {
        mood = 'sleep';
        if (u.id === 'john') variant = 'john_asleep';
        fx.push('zzz');
      } else if (u.status.balkan && u.status.balkan.phase === 'boosted') {
        mood = 'berserk';
        fx.push('veins');
      } else if (u.status.afraid) {
        mood = 'afraid';
        fx.push('sweat');
      } else if (u.status.confused) {
        mood = 'confused';
        fx.push('swirl');
      } else if (u.status.happy) {
        mood = 'happy';
      }
    }
    if (u.possessed) {
      mood = 'ghost';
      fade = 0.8;
    }
    return { id: u.id, variant, mood, fx: unique(fx), fade, bloodAmount: u.dead ? 7 : 4 };
  }

  const ANIMATED = ['zzz', 'stars', 'sweat', 'swirl'];
  function drawPortrait(c, look) {
    const animated = look.fade != null || look.mood === 'critical' || look.mood === 'furious' || look.fx.some((f) => ANIMATED.includes(f));
    const key = JSON.stringify(look) + (animated ? '#' + UI.frame : '');
    if (key === c.key) return;
    c.key = key;
    look.frame = UI.frame;
    SC.Art.card(look).toCanvas(c.canvas);
  }

  function buffTags(b, u) {
    const net = {};
    for (const x of u.buffs) {
      const stats = x.stat === 'all' ? ['atk', 'def', 'spd'] : [x.stat];
      for (const s of stats) net[s] = (net[s] || 0) + x.amount;
    }
    const out = [];
    for (const s of ['atk', 'def', 'spd']) {
      if (!net[s]) continue;
      if (s === 'spd' && net[s] < 0 && u.has('speedAddict')) continue;
      out.push({ t: s.toUpperCase() + (net[s] > 0 ? '+' : '-'), c: net[s] > 0 ? 'good' : 'bad' });
    }
    return out;
  }

  function workerTags(b, u) {
    const tags = [];
    if (u.dead) {
      if (u.possessed) tags.push({ t: 'POSSESSED', c: 'note' });
      else if (u.carriedBy) tags.push({ t: 'CARRIED BY ' + b.unit(u.carriedBy).name.toUpperCase(), c: 'note' });
      else tags.push({ t: 'NEEDS CARRYING', c: 'bad' });
      return tags;
    }
    if (u.status.stared) tags.push({ t: 'STARED AT', c: 'bad' });
    if (u.status.seen) tags.push({ t: 'SEEN', c: 'bad' });
    if (b.hunted() === u) tags.push({ t: 'HUNTED', c: 'bad' });
    if (u.flags.guarding) tags.push({ t: u.flags.barrier ? 'BARRIER' : 'GUARD', c: 'good' });
    if (u.status.exposed) tags.push({ t: 'VULNERABLE', c: 'bad' });
    if (b.deathward || u.status.deathward) tags.push({ t: 'DEATHWARD', c: 'good' });
    if (u.status.asleep) tags.push({ t: 'ASLEEP', c: 'note' });
    if (u.status.phasing) tags.push({ t: 'PHASING', c: 'note' });
    if (u.status.afraid) tags.push({ t: 'AFRAID', c: 'bad' });
    if (u.status.confused) tags.push({ t: 'CONFUSED', c: 'bad' });
    if (u.status.poison) tags.push({ t: 'URANIUM', c: 'bad' });
    if (u.status.balkan) tags.push({ t: u.status.balkan.phase === 'pending' ? 'BALKAN...' : 'BALKAN!', c: 'good' });
    if (u.flags.glassesOff) tags.push({ t: 'NO GLASSES', c: 'bad' });
    if (u.flags.lunch) tags.push({ t: 'LUNCH BOX...', c: 'note' });
    if (u.status.trap) tags.push({ t: 'BEAR TRAP', c: 'good' });
    if (u.status.happy) tags.push({ t: 'HAPPY', c: 'good' });
    if (u.flags.proxy) tags.push({ t: 'PROXY ON', c: 'note' });
    for (const id of u.carrying) tags.push({ t: 'CARRYING ' + b.unit(id).name.toUpperCase(), c: 'note' });
    if (u.mood && !u.status.phasing) tags.push({ t: u.mood.toUpperCase(), c: { happy: 'good', angry: 'bad', sad: 'note' }[u.mood] });
    if (u.ghost && u.res <= 0 && !u.status.phasing) tags.push({ t: 'DRAINED', c: 'bad' });
    if (u.ghost && b.foresightTurns > 0) tags.push({ t: 'FORESIGHT', c: 'note' });
    if (b.uniformBonus(u)) tags.push({ t: 'NEUTRAL', c: 'note' }); // BRAVO Team Uniform is on
    return tags.concat(buffTags(b, u)).slice(0, 6);
  }

  function enemyTags(b) {
    const s = b.enemy;
    const tags = [];
    if (s.status.stunned) tags.push({ t: 'CAN’T MOVE', c: 'good' });
    if (s.status.fetal) tags.push({ t: 'FETAL POSITION', c: 'note' });
    if (s.flags.overflow) tags.push({ t: b.enemyDef.lines.overflowShort, c: 'bad' });
    if (b.hunted()) tags.push({ t: 'HUNTING ' + b.hunted().name.toUpperCase(), c: 'bad' });
    if (s.status.bleed) tags.push({ t: 'BLEEDING', c: 'good' });
    if (s.status.shards) tags.push({ t: 'GLASS', c: 'good' });
    if (s.status.chilled) tags.push({ t: 'FREEZING', c: 'good' });
    if (s.status.confused) tags.push({ t: 'CONFUSED', c: 'good' });
    if (s.status.blind) tags.push({ t: 'BLIND', c: 'good' });
    if (s.status.vulnerable) tags.push({ t: 'VULNERABLE', c: 'good' });
    if (s.flags.deagleFocus) tags.push({ t: 'AIMING', c: 'bad' });
    if (b.known()) tags.push({ t: 'INTEL', c: 'note' });
    return tags.concat(buffTags(b, s).map((t) => ({ t: t.t, c: t.c === 'good' ? 'bad' : 'good' }))).slice(0, 6);
  }

  function setTags(c, tags) {
    const html = tags.map((t) => `<span class="tag ${t.c}">${esc(t.t)}</span>`).join('');
    if (c.tags.innerHTML !== html) c.tags.innerHTML = html;
  }

  function intentText(b, u) {
    if (!b.intentKnown || b.enemyActed || !b.intent) return null;
    const k = b.intent.kind;
    const word = b.intentWord ? b.intentWord + '!' : null;
    if (k === 'stare' && b.intent.targetId === u.id) return 'STARE';
    if (k === 'scratch' && b.intent.targetId === u.id) return word || 'SCRATCH';
    if (['melee', 'gun', 'claws', 'hands', 'whip'].includes(k) && b.intent.targetId === u.id) return word || 'TARGET';
    if ((k === 'magdump' || k === 'wail') && !u.dead && !u.status.phasing) return word || 'ALL';
    if (k === 'claims' && !u.dead && !u.status.phasing) return 'RAMBLE';
    return null;
  }

  // Heart for the living, skull and crossbones when CRITICAL, SlashCo VR's red HALTED skull when
  // dead, a ghost for Purpl Lady (who has no health at all).
  function vitalIcon(u, hs) {
    if (u.ghost) return 'ghost';
    if (hs === 'DEAD') return 'halted';
    if (hs === 'CRITICAL') return 'skullBones';
    return 'heart';
  }

  function refresh() {
    const b = UI.battle;
    if (!b) return;
    for (const u of b.party) {
      const c = UI.cards[u.id];
      if (!c) continue;
      const hs = b.healthState(u).id;
      c.root.style.setProperty('--hc', HP_COLOR[hs] || HP_COLOR.OK);
      const icon = vitalIcon(u, hs);
      if (c.icon !== icon) {
        c.icon = icon;
        c.heart.innerHTML = icon === 'halted' ? `<img src="${SC.ICONS.halted}" alt="">` : SVG[icon];
      }
      const word = `[${{ NONE: 'GHOST', DEAD: 'HALTED' }[hs] || hs}]`;
      if (c.state.textContent !== word) c.state.textContent = word;
      c.state.classList.toggle('long', word.length > 9);
      const res = `${u.def.resource.short} ${Math.round(u.res)}/${u.resMax}`;
      if (c.res.textContent !== res) c.res.textContent = res;
      c.root.classList.toggle('dead', u.dead);
      c.root.classList.toggle('critical', hs === 'CRITICAL');
      c.root.classList.toggle('away', !!u.status.phasing);
      c.root.classList.toggle('tremble', !!u.status.afraid && !u.dead);
      setTags(c, workerTags(b, u));
      const it = intentText(b, u);
      c.intent.textContent = it || '';
      c.intent.classList.toggle('show', !!it);
      drawPortrait(c, workerLook(b, u));
    }
    const s = b.enemy;
    const P = UI.plate;
    const fs = b.healthState(s).id;
    P.state.style.setProperty('--hc', FOE_COLOR[fs] || 'var(--white)');
    const hp = b.known() ? ` <small>${s.hp} HP</small>` : '';
    const stateHtml = `[${esc(fs)}]${hp}`;
    if (P.state.innerHTML !== stateHtml) P.state.innerHTML = stateHtml;
    P.state.classList.toggle('run', !!s.flags.weakened);
    const A = b.enemyDef.anger;
    const anger = Math.round(s.anger);
    P.anger.textContent = `ANGER ${anger}`;
    P.anger.classList.toggle('max', anger >= A.overflow);
    P.anger.classList.toggle('hot', anger < A.overflow && anger >= A.overflow - 20);
    setTags(P, enemyTags(b));
    enemyWrap.classList.toggle('rage', !!s.flags.overflow && !s.status.chilled && !s.status.stunned);
    enemyWrap.classList.toggle('chilled', !!s.status.chilled);
    enemyWrap.classList.toggle('down', !!s.status.stunned);
    $('#turn-chip').textContent = 'TURN ' + Math.max(1, b.turn);
    $('#place-chip').textContent = placeLabel(b.placeDef);
    $('#credits-chip').textContent = b.credits + ' CR';
    const chopper = $('#chopper-chip');
    chopper.style.display = b.chopper && !b.outcome ? '' : 'none';
    chopper.classList.add('heli');
    if (b.chopper) chopper.textContent = 'HELI ' + b.chopper.turns;
    updateEscape();
    if (SC.Audio && UI.phase !== 'title') SC.Audio.music(musicFor(b)); // the title plays its own
  }

  // The chase music in desperate times: once the slasher is weakened ("Now is your time for
  // escape!"), when the team makes a run for it (that turn and the next), or when it's about to
  // lose (one worker left standing, everyone left CRITICAL, or two left and both HURT or worse).
  function musicFor(b) {
    if (b.outcome) return null;
    const alive = b.corporeal();
    const dire =
      alive.length <= 1 ||
      alive.every((u) => b.healthState(u).id === 'CRITICAL') ||
      (alive.length <= 2 && alive.every((u) => ['HURT', 'CRITICAL'].includes(b.healthState(u).id)));
    const running = b.ranOnTurn != null && b.turn - b.ranOnTurn <= 1;
    return b.enemy.flags.weakened || running || dire ? 'chase' : 'ambience';
  }

  // ------------------------------------------------------------------ escape odds
  function updateEscape(flashReason) {
    const b = UI.battle;
    if (!b) return;
    const e = b.escapeChance();
    escapeEl.classList.toggle('blocked', e.blocked);
    escapeEl.classList.toggle('ready', !e.blocked && e.chance >= 50);
    $('.pct', escapeEl).textContent = e.blocked ? '--' : e.chance + '%';
    let label = 'IF THE TEAM RUNS NOW';
    if (e.blocked) label = e.short || 'NO WAY OUT';
    else if (b.enemy.flags.weakened) label = `${b.enemyDef.title} IS WEAKENED. RUN!`;
    else if (b.chopper) label = `HELI LANDS IN ${b.chopper.turns} TURN${b.chopper.turns === 1 ? '' : 'S'}`;
    $('.label', escapeEl).textContent = flashReason || label;
    const sub = $('#command .order.escape .sub');
    if (sub) {
      sub.textContent = e.blocked ? e.short || 'BLOCKED' : e.chance + '% TO GET OUT';
      sub.parentNode.classList.toggle('disabled', e.blocked);
    }
    const tip = $('#escape-tip');
    if (tip.classList.contains('show')) fillEscapeTip(e);
  }

  function fillEscapeTip(e) {
    const tip = $('#escape-tip');
    if (e.blocked) {
      tip.innerHTML = `<div>${esc(e.reason)}</div>`;
      return;
    }
    tip.innerHTML =
      '<div class="row"><span>How the odds add up:</span><span></span></div>' +
      e.parts
        .map(([k, v]) => {
          const r = Math.round(v);
          return `<div class="row"><span>${esc(k)}</span><span class="v ${r < 0 ? 'neg' : 'pos'}">${r > 0 ? '+' : ''}${r}%</span></div>`;
        })
        .join('') +
      `<div class="row"><span>Total (max 95%)</span><span class="v pos">${e.chance}%</span></div>`;
  }

  // ------------------------------------------------------------------ slasher sprites
  // Sid: his googly eyes rattle round, his head sways, and the Desert Eagle is a layer of its own
  // (it twirls, kicks, and swings for a pistol-whip). He turns his back to draw it at 80 ANGER and
  // to put it away again.
  const SidView = {
    pupils: [
      [0, 0.5],
      [0, 0.5],
    ],
    goals: [
      [0.4, 0.2],
      [-0.4, 0.3],
    ],
    next: [0, 0],
    armed: false,
    turn: null, // { start, from } while he turns round
    kickAt: -1e9,
    aimUntil: 0,
    override: null,
    since: 0,
    until: 0,
    set(pose, ms) {
      this.override = pose;
      this.since = performance.now();
      this.until = this.since + ms;
      this.draw(this.since, true);
    },
    // He raises the gun to aim (for `ms`), and fires: it kicks up.
    aim(ms) {
      this.aimUntil = Math.max(this.aimUntil, performance.now() + ms);
    },
    kick() {
      this.aim(600);
      this.kickAt = performance.now();
    },
    // A new fight: no turning round for the gun he already has (or hasn't).
    reset() {
      const s = UI.battle && UI.battle.enemy;
      this.armed = !!(s && s.flags.overflow);
      this.turn = null;
      this.override = null;
      this.aimUntil = 0;
    },
    draw(now, force) {
      const b = UI.battle;
      const s = b && b.enemy;
      for (let i = 0; i < 2; i++) {
        if (now > this.next[i]) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.95;
          this.goals[i] = [Math.cos(a) * r, Math.sin(a) * r];
          this.next[i] = now + 300 + Math.random() * 1700;
        }
        this.pupils[i][0] += (this.goals[i][0] - this.pupils[i][0]) * 0.45;
        this.pupils[i][1] += (this.goals[i][1] - this.pupils[i][1]) * 0.45;
      }
      const armed = !!(s && s.flags.overflow);
      if (armed !== this.armed) {
        this.turn = { start: now, from: this.armed };
        this.armed = armed;
        pulse(enemyWrap, 'spin', 420);
      }
      let view = armed ? 'armed' : 'front';
      if (this.turn) {
        // In step with the spin: the front he had, his back (while he's mirrored), the new front.
        const k = (now - this.turn.start) / 420;
        if (k >= 1) this.turn = null;
        else if (k < 2 / 6) view = this.turn.from ? 'armed' : 'front';
        else if (k < 5 / 6) view = this.turn.from ? 'backGun' : 'back';
      }
      const down = !!(s && s.status.stunned);
      const pose = this.override && now < this.until ? this.override : null;
      const k = pose ? (now - this.since) / Math.max(1, this.until - this.since) : 0;
      let gun = 0;
      // The Desert Eagle: twice round his finger and slowing down, swung up for a whip, raised to
      // aim, kicking when it fires.
      if (pose === 'twirl') gun = Math.PI * 4 * (1 - (1 - k) * (1 - k));
      else if (pose === 'whip') gun = Math.sin(k * Math.PI) * 1.4;
      else if (now < this.aimUntil) gun = SC.SPRITES.sid.aim;
      const kicked = now - this.kickAt;
      if (kicked < 140) gun += 0.45 * (1 - kicked / 140);
      SC.Art.sid({
        t: now,
        view,
        gun,
        munch: pose === 'cookie',
        rant: pose === 'rant',
        down,
        pupils: this.pupils,
        angry: armed,
        dizzy: down,
      }).toCanvas(enemyCanvas);
      if (force) enemyCanvas.dataset.pose = pose || (down ? 'down' : view);
    },
  };

  // Trollge barely moves: the big head sways on its neck, freezes when it stares, and
  // jitters once it's running fast.
  const TrollgeView = {
    override: null,
    until: 0,
    set(pose, ms) {
      this.override = pose;
      this.until = performance.now() + ms;
      this.draw(performance.now(), true);
    },
    draw(now, force) {
      const b = UI.battle;
      const s = b && b.enemy;
      let pose = 'idle';
      if (s && s.status.stunned) pose = 'down';
      else if (s && s.flags.overflow) pose = 'fast';
      if (this.override && now < this.until) pose = this.override;
      const eyes = pose === 'down' ? 'dim' : s && s.flags.overflow ? 'red' : 'white';
      SC.Art.trollge({ t: now, pose, eyes }).toCanvas(enemyCanvas);
      if (force) enemyCanvas.dataset.pose = pose;
    },
  };

  // Dolphin Man moves like Trollge (the head bobs on its neck) but jerkier. He screams with his
  // beak hanging open, spins round to show his back and tail for the Tail Whip, and curls up in
  // Fetal Position (and when he's down).
  const DolphinView = {
    override: null,
    since: 0,
    until: 0,
    set(pose, ms) {
      this.override = pose;
      this.since = performance.now();
      this.until = this.since + ms;
      this.draw(this.since, true);
    },
    draw(now, force) {
      const b = UI.battle;
      const s = b && b.enemy;
      let pose = 'idle';
      if (s && s.status.stunned) pose = 'down';
      else if (s && s.status.fetal) pose = 'fetal';
      if (this.override && now < this.until) pose = this.override;
      // In step with the spin: his back shows while he's turned round (see SidView).
      const k = (now - this.since) / 420;
      if (pose === 'whip' && k >= 2 / 6 && k < 5 / 6) pose = 'back';
      const eyes = s && s.flags.overflow ? 'sharp' : 'milky';
      SC.Art.dolphin({ t: now, pose, eyes }).toCanvas(enemyCanvas);
      if (force) enemyCanvas.dataset.pose = pose;
    },
  };

  const VIEWS = { trollge: TrollgeView, dolphin: DolphinView };
  const view = () => VIEWS[enemyId()] || SidView;

  // ------------------------------------------------------------------ effects
  function pop(x, y, text, cls, ms) {
    const p = el('div', 'pop ' + (cls || ''), esc(text));
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    fxLayer.appendChild(p);
    setTimeout(() => p.remove(), ms || 950);
  }
  function flash(color) {
    flashEl.style.background = color;
    pulse(flashEl, 'go', 400);
  }
  function shake(big) {
    pulse(stage, big ? 'shake-big' : 'shake', big ? 540 : 340);
  }
  function muzzle(x, y) {
    const m = el('div', 'muzzle');
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    fxLayer.appendChild(m);
    setTimeout(() => m.remove(), 200);
  }
  function tracer(x0, y0, x1, y1) {
    const t = el('div', 'tracer');
    const len = Math.hypot(x1 - x0, y1 - y0);
    t.style.left = x0 + 'px';
    t.style.top = y0 + 'px';
    t.style.width = len + 'px';
    t.style.transform = `rotate(${Math.atan2(y1 - y0, x1 - x0)}rad)`;
    fxLayer.appendChild(t);
    setTimeout(() => t.remove(), 220);
  }
  function posOf(id) {
    if (id === enemyId()) return enemyPoint('body');
    return cardCenter(id);
  }
  // Three claw marks raked across a worker's profile.
  function slash(id, big) {
    const [x, y] = cardCenter(id);
    const s = el('div', 'slash' + (big ? ' big' : ''), '<i></i><i></i><i></i>');
    s.style.left = x + 'px';
    s.style.top = y - 10 + 'px';
    fxLayer.appendChild(s);
    setTimeout(() => s.remove(), 520);
  }
  // Lean the slasher toward a profile for a moment.
  async function lunge(id, ms, reach) {
    const [tx, ty] = cardCenter(id);
    const k = reach || 1;
    enemyWrap.style.translate = `${(tx - 500) * 0.12 * k}px ${(ty - 430) * 0.06 * k}px`;
    await T(ms);
    enemyWrap.style.translate = '';
  }

  // What a worker's blow sounds like: the weapon's own sound, or by the kind of hit.
  const HIT_SOUND = {
    stab: 'stab',
    page: 'page',
    shock: 'shock',
    explosion: 'explode',
    hex: 'hex',
    shadow: 'shadow',
    trap: 'trap',
    bleed: 'bleed',
    shards: 'shards',
    self: 'punch',
    exterminate: 'exterminate',
  };
  // A slasher's move: [the sound of it being thrown, the sound of it landing on a worker].
  const BLOW = {
    claws: ['claws', 'hurtTear'],
    lap: ['claws', 'hurtTear'],
    scratch: ['scratch', 'hurtTear'],
    melee: ['swing', 'hurtHeavy'],
    gun: ['gun', 'hurtShot'],
    hands: ['swing', 'hurtWet'],
    whip: ['whip', 'hurtCrack'],
    wail: ['wail', 'hurtSound'],
    trapped: ['trap', 'hurt'],
  };
  // Skills being cast.
  const CAST_SOUND = { hex: 'hex', chill: 'hex', shadow: 'hex', foresight: 'hex', clone: 'phase', proxy: 'zap', pages: 'item', docs: 'item' };
  // How a worker gets hurt when it isn't the slasher's last move.
  const HURT_BY_SOURCE = { gun: 'hurtShot', magdump: 'hurtShot', wail: 'hurtSound', self: 'hurt', lob: 'hurt', poison: 'hurt' };

  async function fx(e) {
    const b = UI.battle;
    const card = (id) => UI.cards[id] && UI.cards[id].root;
    switch (e.type) {
      case 'hitEnemy': {
        refresh();
        pulse(enemyWrap, 'hit', 280);
        pulse(enemyWrap, 'flash', 110);
        const [x, y] = enemyPoint('body');
        pop(x + rand(-70, 70), y - 70 + rand(-50, 30), e.amount, e.crit ? 'crit' : e.kind === 'page' || e.slipped ? 'small' : '');
        if (e.crit) pop(x, y - 190, 'CRITICAL', 'status', 800);
        else if (e.slipped && !e.quick) pop(x, y - 190, 'SLIPS', 'status', 800);
        sfx(e.sound || HIT_SOUND[e.kind] || 'punch');
        if (e.slipped) sfx('slip');
        if (e.crit) sfx('crit');
        return T(e.quick ? 110 : 320);
      }
      case 'hitWorker': {
        refresh();
        pulse(card(e.target), 'hit', e.quick ? 200 : 400);
        sfx(HURT_BY_SOURCE[e.source] || UI.impact || 'hurt');
        if (e.big) shake(false);
        return T(e.big ? 450 : e.quick ? 150 : 320);
      }
      case 'healEnemy': {
        refresh();
        const [x, y] = enemyPoint('body');
        pop(x, y - 110, '+' + e.amount, 'heal', 800);
        sfx('slurp');
        return T(300);
      }
      case 'wailPulse': {
        // Rings of sound out of his mouth, and the whole room shakes.
        const [x, y] = enemyPoint('mouth');
        const r = el('div', 'soundwave');
        r.style.left = x + 'px';
        r.style.top = y + 'px';
        fxLayer.appendChild(r);
        setTimeout(() => r.remove(), 700);
        shake(e.n === 0);
        return T(260);
      }
      case 'healWorker': {
        refresh();
        if (!e.amount) return undefined;
        pulse(card(e.target), 'heal', 450);
        const [x, y] = cardCenter(e.target);
        pop(x, y - 60, '+', 'heal', 700);
        sfx('heal');
        return T(320);
      }
      case 'miss': {
        const [x, y] = posOf(e.target);
        pop(x + rand(-30, 30), y - 80, 'MISS', 'miss', 700);
        sfx('whiff');
        return T(e.quick ? 70 : 240);
      }
      case 'death': {
        refresh();
        pulse(card(e.target), 'hit', 420);
        shake(false);
        sfx('death');
        return T(750);
      }
      case 'revive': {
        refresh();
        flash('#ffffff');
        pulse(card(e.target), 'glow', 500);
        sfx('revive');
        return T(550);
      }
      case 'block':
      case 'barrier':
        pulse(card(e.target), 'shield', 450);
        sfx('guard');
        return T(320);
      case 'ward':
        refresh();
        flash('#ffffff');
        for (const u of b.party) if (!u.dead && (e.all || u.id === e.target)) pulse(card(u.id), 'glow', 600);
        sfx('ward');
        return T(e.all ? 520 : 320);
      case 'exterminate':
        flash('#ff2a2a');
        shake(true);
        sfx('exterminate');
        return T(600);
      case 'guard':
        refresh();
        pulse(card(e.target), 'shield', 450);
        sfx('guard');
        return T(150);
      case 'enemyAttack': {
        // What a worker hit by this move will sound like (see hitWorker).
        UI.impact = e.impact || (BLOW[e.kind] || [])[1] || 'hurt';
        if (e.kind === 'stare') {
          TrollgeView.set('stare', 1600);
          pulse(stage, 'staring', 1500);
          pulse(card(e.target), 'stared', 1500);
          sfx('stare');
          return T(700);
        }
        if (e.kind === 'caught') {
          flash('#b98cff');
          pulse(card(e.target), 'hit', 380);
          sfx('crit');
          return T(380);
        }
        if (e.kind === 'glance') {
          TrollgeView.set('glance', 500);
          pulse(card(e.target), 'stared', 700);
          sfx('whiff');
          return T(380);
        }
        if (e.kind === 'claws' || e.kind === 'scratch' || e.kind === 'lap') {
          TrollgeView.set(e.kind === 'lap' ? 'fast' : 'lunge', 520);
          sfx(BLOW[e.kind][0]);
          if (e.kind === 'lap') {
            enemyWrap.style.translate = `${rand(-90, 90)}px 0px`;
            await T(140);
          }
          const hitting = lunge(e.target, e.kind === 'scratch' ? 240 : 170, e.kind === 'scratch' ? 1.5 : 1);
          slash(e.target, e.kind === 'scratch');
          if (e.kind === 'scratch') shake(false);
          await hitting;
          return T(90);
        }
        if (e.kind === 'cookie') {
          SidView.set('cookie', 1500);
          sfx('crunch');
          return T(420);
        }
        if (e.kind === 'claims') {
          SidView.set('rant', 1400);
          shake(false);
          sfx('growl');
          return T(320);
        }
        if (e.kind === 'deagle') {
          SidView.set('twirl', 900);
          sfx('spin');
          return T(260);
        }
        if (e.kind === 'magdump') {
          SidView.aim(1500);
          sfx('rack');
          return T(160);
        }
        if (e.kind === 'hands') {
          DolphinView.set('lunge', 700);
          sfx('swing');
          await lunge(e.target, 220, 1.2);
          return T(60);
        }
        if (e.kind === 'whip') {
          // He spins around, and the tail cracks across the profile.
          DolphinView.set('whip', 600);
          pulse(enemyWrap, 'spin', 420);
          sfx('whip');
          await T(200);
          const hitting = lunge(e.target, 160, 1.3);
          slash(e.target, true);
          await hitting;
          return T(60);
        }
        if (e.kind === 'wail') {
          DolphinView.set('wail', 2400);
          flash('#ffffff');
          sfx('wail');
          return T(420);
        }
        if (e.kind === 'fetal') {
          DolphinView.set('twitch', 500);
          sfx('whimper');
          return T(520);
        }
        if (e.kind === 'curled') {
          DolphinView.set('twitch', 600);
          sfx('whimper');
          return T(300);
        }
        if (e.kind === 'trapped') {
          const hitting = lunge(e.target, 150);
          await hitting;
          const [fx0, fy0] = enemyPoint('feet');
          pop(fx0, fy0 - 40, 'SNAP!', 'crit', 900);
          shake(false);
          sfx('trap');
          return T(320);
        }
        const thrown = e.sound || (BLOW[e.kind] || [])[0] || 'swing';
        if (thrown === 'gun') {
          const [mx, my] = enemyPoint('muzzle');
          muzzle(mx, my);
          SidView.kick();
        } else if (e.kind === 'gun') SidView.set('whip', 420); // a pistol-whip
        sfx(thrown);
        await lunge(e.target, 170);
        return T(90);
      }
      case 'shot': {
        const [mx, my] = enemyPoint('muzzle');
        const [tx, ty] = cardCenter(e.target);
        const jx = tx + rand(-60, 60);
        const jy = ty + rand(-80, 60);
        muzzle(mx, my);
        tracer(mx, my, jx, jy);
        SidView.kick();
        sfx('shot');
        if (e.hit) pulse(card(e.target), 'hit', 320);
        else pop(jx, jy - 20, e.ghost ? 'PASS' : 'MISS', 'miss', 600);
        return T(190);
      }
      case 'explosion':
        flash('#ffb347');
        shake(true);
        sfx('explode');
        return T(650);
      case 'shock': {
        const bolt = el('div', 'bolt');
        fxLayer.appendChild(bolt);
        setTimeout(() => bolt.remove(), 300);
        flash('#bfe6ff');
        pulse(enemyWrap, 'hit', 280);
        sfx('shock');
        return T(420);
      }
      case 'shockSelf':
        pulse(card(e.target), 'shield', 450);
        sfx('zap');
        return T(320);
      case 'status': {
        const [x, y] = posOf(e.target);
        pop(x, y - (e.target === enemyId() ? 150 : 90), e.text, 'status', 900);
        sfx('status');
        if (e.cue && SC.Audio) SC.Audio.cue(e.cue);
        return T(240);
      }
      case 'credits': {
        refresh();
        pop(560, 120, `+${e.amount} CREDITS`, 'status', 1000);
        sfx('coin');
        return T(260);
      }
      case 'carry':
        refresh();
        pulse(card(e.carrier), 'glow', 400);
        sfx('lift');
        return T(320);
      case 'possess':
        refresh();
        flash('#8a3fd1');
        pulse(card(e.target), 'glow', 500);
        sfx('hex');
        return T(480);
      case 'phase':
      case 'unphase':
        refresh();
        sfx('phase');
        return T(360);
      case 'chopper':
        flash('#ffffff');
        pop(496, 420, 'HELI ON THE PAD!', 'crit', 1400);
        sfx('chopper');
        return T(900);
      case 'run':
        if (e.success) {
          flash('#ffffff');
          sfx('run');
          return T(650);
        }
        shake(false);
        sfx('denied');
        return T(360);
      case 'lunge': {
        const c = card(e.from);
        if (!c) return undefined;
        c.classList.add('lunge');
        sfx('swing');
        await T(150);
        c.classList.remove('lunge');
        return undefined;
      }
      case 'throw': {
        const [x0, y0] = cardCenter(e.from);
        const [x1, y1] = enemyPoint('head');
        const p = el('div', 'projectile');
        p.style.left = x0 + 'px';
        p.style.top = y0 + 'px';
        fxLayer.appendChild(p);
        void p.offsetWidth;
        p.style.left = x1 + 'px';
        p.style.top = y1 + 'px';
        p.style.rotate = '540deg';
        sfx('whiff');
        await T(280);
        p.remove();
        return undefined;
      }
      case 'cast':
      case 'buff':
      case 'item':
      case 'passThrough':
        refresh();
        pulse(card(e.target || e.from), 'glow', 420);
        sfx(e.type === 'item' ? 'item' : e.type === 'passThrough' ? 'phase' : CAST_SOUND[e.kind] || 'buff');
        return T(e.type === 'passThrough' ? 150 : 240);
      case 'loot':
        sfx('coin');
        return T(200);
      case 'anger':
        refresh();
        if (e.delta >= 10) {
          sfx('growl');
          pulse(UI.plate.root, 'hit', 320);
        }
        return undefined;
      case 'turn':
        refresh();
        sfx('tick');
        return undefined;
      case 'enemyPose':
        refresh();
        view().draw(performance.now(), true);
        return undefined;
      default:
        refresh();
        return undefined;
    }
  }

  // ------------------------------------------------------------------ generator skill checks
  // The two checks SlashCo VR puts on a generator, drawn the way the game draws them. The
  // rules live in js/checks.js; this draws them and feeds in the keys.
  //  FUEL: the ▽ marker loses its balance; every press of [Q] or [E] makes it jump back.
  //  BATTERY: "[SPACE] to clip terminals." Press when both clips are level with the middle.
  // `UI.check` exposes the live state, which the browser tests read.
  function skillCheck(o) {
    return new Promise((resolve) => {
      const box = $('#skillcheck');
      const fuel = o.kind === 'fuel';
      const s = fuel ? SC.Checks.fuel(o) : SC.Checks.battery(o);
      const support = o.moralSupport ? ' Purpl Lady’s Moral Support slows it down.' : '';
      box.innerHTML = `
        <div class="sc-title">[${fuel ? 'FUEL' : 'BATTERY'}]</div>
        <div class="sc-sub">${fuel ? `${esc(o.name)} is pouring fuel. Keep the arrow out of the red.` : '[SPACE] to clip terminals.'}${support}</div>
        ${fuel ? fuelHtml() : batteryHtml()}
        <div class="sc-res">GET READY…</div>
        <div class="sc-keys">${fuel ? 'TAP Q / ← OR E / → (OR TAP A SIDE OF THIS BOX)' : 'SPACE / Z / ENTER, OR TAP'}</div>
        <div class="sc-timer"></div>`;
      const timer = $('.sc-timer', box);
      const res = $('.sc-res', box);
      box.classList.add('show');
      stage.classList.add('covered');
      const t0 = performance.now() + (UI.fast ? 250 : 650);
      let last = null;
      let done = false;
      let handler = null;
      UI.check = s;

      function finish() {
        if (done) return;
        done = true;
        Input.remove(handler);
        box.removeEventListener('pointerdown', onPointer);
        doc.removeEventListener('keydown', onTap, true);
        const msg = s.ok ? (fuel ? 'SUCCESS!' : 'CLIPPED!') : fuel ? 'SPILLED!' : s.late ? 'TOO SLOW…' : 'ZAP!';
        res.textContent = msg;
        res.className = 'sc-res ' + (s.ok ? 'ok' : 'no');
        if (!fuel) {
          if (s.ok) {
            for (const c of s.clips) c.y = 0.5;
            drawBattery();
            $('.spark', box).setAttribute('fill', '#ffe45c');
          } else {
            $('.spark', box).style.display = 'none';
            $('.warn', box).style.display = '';
            flash('#fff6a8');
          }
        }
        sfx(s.ok ? 'success' : fuel ? 'fail' : 'zap');
        setTimeout(
          () => {
            box.classList.remove('show');
            stage.classList.remove('covered');
            UI.check = null;
            resolve(s.ok);
          },
          UI.fast ? 350 : 800
        );
      }

      // ---- FUEL: one press, one jump. Holding a key down doesn't repeat.
      const SIDE = { ArrowLeft: -1, a: -1, q: -1, ArrowRight: 1, d: 1, e: 1 };
      function tap(dir) {
        if (done || performance.now() < t0) return;
        s.tap(dir);
        sfx('pump');
        // In the game the bar over [Q] turns into an arrow when it's pressed.
        const key = $(dir < 0 ? '.key.l' : '.key.r', box);
        $('.arrow', key).textContent = dir < 0 ? '<' : '>';
        pulse(key, 'on', 140);
        setTimeout(() => {
          if (!key.classList.contains('on')) $('.arrow', key).textContent = '|';
        }, 150);
        drawFuel();
        if (s.done) finish();
      }
      function onTap(ev) {
        const dir = SIDE[ev.key] || SIDE[ev.key && ev.key.toLowerCase()];
        if (!dir) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (!ev.repeat) tap(dir);
      }
      function drawFuel() {
        $('.pivot', box).style.transform = `rotate(${(s.p - 0.5) * 180}deg)`;
        $('#pump-level', box).setAttribute('y', String(72 - 72 * clamp(s.t / s.ms, 0, 1)));
      }

      // ---- BATTERY
      function drawBattery() {
        const Y = (c) => 20 + c.y * 240;
        $('.clip.l', box).style.top = Y(s.clips[0]) + 'px';
        $('.clip.r', box).style.top = Y(s.clips[1]) + 'px';
      }
      function press() {
        if (done || fuel || performance.now() < t0) return;
        s.press();
        finish();
      }

      if (fuel) {
        const deg = s.red * 180;
        $('.arch', box).style.background =
          `conic-gradient(from 270deg at 50% 100%, #ff3b30 0deg, #ff8a80 ${deg * 0.6}deg, #fff ${deg}deg ${180 - deg}deg, #ff8a80 ${180 - deg * 0.6}deg, #ff3b30 180deg, transparent 180deg)`;
        drawFuel();
      } else {
        layoutBattery(box, s.tol);
        drawBattery();
      }

      function frame(now) {
        if (done) return;
        const t = now - t0;
        if (t >= 0) {
          if (res.textContent === 'GET READY…') res.textContent = '';
          // Small fixed steps keep the physics the same at any frame rate.
          let dt = last == null ? 0 : Math.min(0.1, (now - last) / 1000);
          while (dt > 0 && !s.done) {
            s.step(Math.min(dt, 1 / 120));
            dt -= 1 / 120;
          }
          last = now;
        }
        timer.style.transform = `scaleX(${clamp(1 - s.t / s.ms, 0, 1)})`;
        if (fuel) drawFuel();
        else drawBattery();
        if (s.done) return finish();
        root.requestAnimationFrame(frame);
        return undefined;
      }
      function onPointer(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!fuel) return press();
        const r = box.getBoundingClientRect();
        return tap(ev.clientX < r.left + r.width / 2 ? -1 : 1);
      }
      handler = Input.push({
        key(k) {
          if (k === 'ok') press();
        },
      });
      box.addEventListener('pointerdown', onPointer);
      if (fuel) doc.addEventListener('keydown', onTap, true);
      root.requestAnimationFrame(frame);
    });
  }

  function fuelHtml() {
    return `
      <div class="fuel">
        <div class="arch"></div>
        <div class="pump">${SVG.pump}</div>
        <div class="pivot"><div class="marker">${SVG.marker}</div></div>
        <div class="x l">-X-</div><div class="x r">-X-</div>
        <div class="key l"><span class="arrow">|</span>[Q]</div>
        <div class="key r"><span class="arrow">|</span>[E]</div>
      </div>`;
  }

  // The terminals are two red posts with a ✱ in the middle, where the clips have to meet; the
  // ⚡ between them turns into a yellow ⚠ when the generator shocks you.
  function batteryHtml() {
    return `
      <div class="battery">
        <svg class="rig" viewBox="0 0 480 300"></svg>
        <div class="clip l">${SVG.clip}</div>
        <div class="clip r">${SVG.clip}</div>
      </div>`;
  }
  function layoutBattery(box, tol) {
    const Y = (y) => 20 + y * 240;
    const mid = Y(0.5);
    const post = (x, y) => {
      let s = '';
      for (const [w, color] of [
        [11, '#000'],
        [6, '#fff'],
      ]) {
        for (const a of [0, 45, 90, 135]) {
          const dx = Math.cos((a * Math.PI) / 180) * 17;
          const dy = Math.sin((a * Math.PI) / 180) * 17;
          s += `<line x1="${x - dx}" y1="${y - dy}" x2="${x + dx}" y2="${y + dy}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
        }
      }
      return s;
    };
    // Red posts above and below the ✱, with white marks where "lined up" starts and ends.
    const bar = (x) => {
      const seg = (a, b) =>
        `<rect x="${x - 7}" y="${a.toFixed(1)}" width="14" height="${(b - a).toFixed(1)}" fill="#ff2a1f" stroke="#000" stroke-width="3"/>`;
      const band = (y) => `<rect x="${x - 15}" y="${(y - 2).toFixed(1)}" width="30" height="4" fill="#fff"/>`;
      return seg(Y(0), mid - 26) + seg(mid + 26, Y(1)) + band(Y(0.5 - tol)) + band(Y(0.5 + tol));
    };
    $('svg.rig', box).innerHTML =
      bar(180) +
      bar(300) +
      post(180, mid) +
      post(300, mid) +
      `<polygon class="spark" points="248,${mid - 22} 229,${mid + 3} 240,${mid + 3} 234,${mid + 22} 253,${mid - 5} 242,${mid - 5} 250,${mid - 22}" fill="#fff" stroke="#000" stroke-width="2"/>` +
      `<g class="warn" style="display:none"><polygon points="240,${mid - 22} 262,${mid + 18} 218,${mid + 18}" fill="#ffd400" stroke="#000" stroke-width="3" stroke-linejoin="round"/><rect x="237.5" y="${
        mid - 9
      }" width="5" height="16" fill="#000"/><rect x="237.5" y="${mid + 10}" width="5" height="5" fill="#000"/></g>`;
  }

  // ------------------------------------------------------------------ menus
  function showCursor(x, y, down) {
    cursor.style.display = 'block';
    cursor.classList.toggle('down', !!down);
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
  }
  function hideCursor() {
    cursor.style.display = 'none';
  }
  // Point the arrowhead at an option (at its big word, if it has one), inside its left padding.
  function cursorAt(elem) {
    const word = elem.querySelector('.word') || elem;
    const r = stageRect(elem);
    const w = stageRect(word);
    const pad = parseFloat(root.getComputedStyle(elem).paddingLeft) || 0;
    showCursor(pad >= 40 ? r.x + pad - 34 : r.x - 30, w.y + w.h / 2 - 12);
  }

  // Keyboard + mouse selection over a list of option elements. Resolves the chosen
  // index, or null on BACK. `o.cancel()` is set so a caller can stop waiting.
  function choose(o) {
    return new Promise((resolve) => {
      const opts = o.opts;
      const cols = o.columns || 1;
      let i = Math.max(0, Math.min(opts.length - 1, o.initial || 0));
      const light = (n, quiet) => {
        if (n === i && !quiet && o.lit) return;
        i = n;
        opts.forEach((op, k) => op.el.classList.toggle('sel', k === i));
        if (o.noCursor) hideCursor();
        else cursorAt(opts[i].el);
        if (o.onHighlight) o.onHighlight(opts[i], i);
        o.lit = true;
      };
      const pick = () => {
        if (!opts[i].enabled) {
          sfx('denied');
          if (o.onDenied) o.onDenied(opts[i], i);
          return;
        }
        sfx('select');
        finish(i);
      };
      const finish = (v) => {
        Input.remove(handler);
        opts.forEach((op) => {
          op.el.onclick = null;
          op.el.onmouseenter = null;
        });
        if (!o.noCursor) hideCursor();
        resolve(v);
      };
      o.cancel = () => finish(undefined);
      const move = (d) => {
        let n = i + d;
        if (n < 0 || n >= opts.length) return;
        sfx('move');
        light(n);
      };
      const handler = Input.push({
        key(k) {
          if (o.scroll && (k === 'up' || k === 'down')) o.scroll.scrollTop += k === 'up' ? -90 : 90;
          else if (k === 'up') move(-cols);
          else if (k === 'down') move(cols);
          else if (k === 'left' && cols > 1 && i % cols > 0) move(-1);
          else if (k === 'right' && cols > 1 && i % cols < cols - 1) move(1);
          else if (k === 'ok') pick();
          else if (k === 'back' && o.back !== false) {
            sfx('cancel');
            finish(null);
          } else if (k === 'help' && o.onHelp) o.onHelp();
        },
      });
      opts.forEach((op, k) => {
        op.el.onmouseenter = () => {
          if (k !== i) light(k);
        };
        op.el.onclick = (ev) => {
          ev.stopPropagation();
          light(k, true);
          pick();
        };
      });
      light(i, true);
    });
  }

  // FIGHT and ESCAPE.
  function drawRoot(idle) {
    const b = UI.battle;
    command.innerHTML = '';
    const fight = el(
      'button',
      'order fight' + (idle ? ' off' : ''),
      `<span class="word">FIGHT</span><span class="sub">${b ? 'TAKE ON ' + esc(b.enemyDef.title) : 'TAKE ON THE SLASHER'}</span>`
    );
    const run = el('button', 'order escape' + (idle ? ' off' : ''), '<span class="word">ESCAPE</span><span class="sub"></span>');
    command.appendChild(fight);
    command.appendChild(run);
    updateEscape();
    return { fight, run };
  }

  async function rootMenu() {
    const b = UI.battle;
    for (;;) {
      const { fight, run } = drawRoot(false);
      const idx = await choose({
        opts: [
          { el: fight, enabled: true },
          { el: run, enabled: true },
        ],
        back: false,
      });
      if (idx === 0) return 'fight';
      const e = b.escapeChance();
      if (!e.blocked) return 'run';
      sfx('denied');
      updateEscape(e.short || 'BLOCKED');
      pulse(escapeEl, 'hit', 300);
      await wait(900);
      updateEscape();
    }
  }

  function guardNote(b, u) {
    if (b.enemy.id === 'trollge') return ' Holds still: Trollge can’t catch you moving.';
    if (b.enemy.id !== 'dolphin') return '';
    return u.has('grouchBehavior') ? ' He yells about his locker, and Dolphin Man hears it.' : ' Quiet: Dolphin Man hears nothing.';
  }
  const ACTION_HINTS = {
    attack: (b, u) => {
      const W = u.def.weapon;
      if (u.ghost) {
        const M = W.moods && u.mood && W.moods[u.mood];
        return M ? `HEX (${u.mood.toUpperCase()}): ${b.fill(M.rules)}` : `HEX: ${W.name}. No damage, a random debuff on ${b.en}.`;
      }
      return `${W.name}: ${W.rules ? b.fill(W.rules) : `${W.hits} hits (the 2nd is less accurate).`}`;
    },
    skills: (b, u) => `Use a skill. Costs ${u.def.resource.name}.`,
    items: () => 'Use something from the team bag.',
    guard: (b, u) =>
      u.ghost
        ? 'FOCUS: gather SPIRIT (+20). Keeps Freaky Doctor running.'
        : `Take half damage this turn, recover 20 STAMINA. Acts first.${guardNote(b, u)}`,
    carry: () => 'Pick up a dead ally so the team can escape. Slows the carrier.',
    back: () => 'Go back.',
  };

  async function actionMenu(b, u, first) {
    command.innerHTML = '';
    const menu = el('div', 'menu');
    menu.innerHTML = `<div class="who"><span>[${esc(u.name.toUpperCase())}]</span><span class="res">${esc(u.def.resource.short)} ${Math.round(u.res)}/${
      u.resMax
    }</span></div><div class="grid"></div><div class="hint"></div>`;
    command.appendChild(menu);
    const grid = $('.grid', menu);
    const hint = $('.hint', menu);
    const acts = b.actionsFor(u).concat([{ id: 'back', label: first ? 'BACK' : 'UNDO', enabled: true }]);
    const opts = acts.map((a) => {
      const e = el('button', 'opt' + (a.enabled ? '' : ' disabled'), esc(a.label));
      grid.appendChild(e);
      return { el: e, enabled: a.enabled, act: a };
    });
    const idx = await choose({
      opts,
      columns: 2,
      initial: UI.lastAction[u.id] || 0,
      onHighlight: (op) => {
        hint.textContent = op.enabled ? ACTION_HINTS[op.act.id](b, u) : op.act.reason || '';
      },
      onDenied: (op) => {
        hint.textContent = op.act.reason || '';
      },
    });
    if (idx == null || acts[idx].id === 'back') return null;
    UI.lastAction[u.id] = idx;
    return acts[idx].id;
  }

  async function listPanel(b, u, kind, reserved) {
    const entries = kind === 'skills' ? b.skillsFor(u) : b.itemsFor(u);
    if (kind === 'items') {
      for (const it of entries) {
        const left = it.count == null ? Infinity : it.count - (reserved[it.id] || 0);
        if (left <= 0) {
          it.enabled = false;
          it.reason = 'Someone is already using the last one this turn.';
        }
        if (it.count != null) it.count = Math.max(0, left);
      }
    }
    panel.innerHTML = `<div class="title"><span>${esc(kind === 'skills' ? `[${u.name.toUpperCase()}] SKILLS` : '[TEAM BAG]')}</span><span>${
      kind === 'skills' ? esc(u.def.resource.short + ' ' + Math.round(u.res) + '/' + u.resMax) : b.credits + ' CREDITS'
    }</span></div><div class="list"></div><div class="desc"></div>`;
    const list = $('.list', panel);
    const desc = $('.desc', panel);
    if (kind === 'skills' && entries.length <= 5) list.classList.add('one');
    panel.classList.add('show');
    stage.classList.add('covered');
    const opts = entries.map((x) => {
      const right = kind === 'skills' ? `${x.cost} ${x.resource}` : x.count == null ? '' : 'x' + x.count;
      const e = el('button', 'opt' + (x.enabled ? '' : ' disabled'), `<span>${esc(x.short || x.name)}</span><span class="cost">${esc(right)}</span>`);
      list.appendChild(e);
      return { el: e, enabled: x.enabled, x };
    });
    const show = (op) => {
      const x = op.x;
      desc.innerHTML =
        (x.short ? `<div class="full">${esc(x.name)}</div>` : '') +
        `<div class="doc">${esc(x.doc || '')}</div>` +
        `<div class="rules">${esc(x.rules || '')}</div>` +
        (x.enabled ? '' : `<div class="why">${esc(x.reason || '')}</div>`);
    };
    const idx = await choose({ opts, columns: kind === 'skills' && entries.length <= 5 ? 1 : 2, onHighlight: show, onDenied: show });
    panel.classList.remove('show');
    stage.classList.remove('covered');
    return idx == null ? null : entries[idx];
  }

  function prompt(text) {
    command.innerHTML = '';
    const menu = el('div', 'menu');
    menu.innerHTML = `<div class="who"><span>${esc(text)}</span></div><div class="hint"><span class="d"></span><span class="k">Z / TAP: OK · X: BACK</span></div>`;
    command.appendChild(menu);
    return $('.hint .d', menu);
  }

  function pickTarget(b, kind, u, title) {
    const cands = b.targetsFor(kind, u);
    if (!cands.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      if (kind === 'enemy') {
        const e = b.enemy;
        const hint = prompt(title || `TARGET: ${b.enemyDef.title}`);
        hint.textContent = `${e.name}: ${b.healthState(e).id}, ANGER ${Math.round(e.anger)}.`;
        enemyWrap.classList.add('targeted');
        const [bx, by] = enemyPoint('body');
        showCursor(bx - 150, by - 12);
        const done = (v) => {
          Input.remove(handler);
          enemyWrap.classList.remove('targeted');
          enemyWrap.onclick = null;
          hideCursor();
          resolve(v);
        };
        const handler = Input.push({
          key(k) {
            if (k === 'ok') {
              sfx('select');
              done(e.id);
            } else if (k === 'back') {
              sfx('cancel');
              done(null);
            }
          },
        });
        enemyWrap.onclick = (ev) => {
          ev.stopPropagation();
          sfx('select');
          done(e.id);
        };
        return;
      }
      const hint = prompt(title || (kind === 'body' ? 'CARRY WHO?' : 'ON WHO?'));
      let i = 0;
      if (kind === 'ally' || kind === 'otherAlly') {
        // Start on whoever is hurt the most.
        i = cands.reduce((best, c, k) => (c.hp < cands[best].hp ? k : best), 0);
      }
      const light = (n) => {
        i = (n + cands.length) % cands.length;
        cands.forEach((c, k) => UI.cards[c.id].root.classList.toggle('pick', k === i));
        const c = cands[i];
        const [x, y] = PROFILE_XY[slotOf(c.id)];
        showCursor(x + 143, y - 36, true);
        hint.textContent = c.dead ? `${c.name}’s body.` : `${c.name}: ${b.healthState(c).id}.`;
      };
      const done = (v) => {
        Input.remove(handler);
        cands.forEach((c) => UI.cards[c.id].root.classList.remove('pick'));
        hideCursor();
        resolve(v);
      };
      const handler = Input.push({
        key(k) {
          if (k === 'up' || k === 'left') {
            sfx('move');
            light(i - 1);
          } else if (k === 'down' || k === 'right') {
            sfx('move');
            light(i + 1);
          } else if (k === 'ok') {
            sfx('select');
            done(cands[i].id);
          } else if (k === 'back') {
            sfx('cancel');
            done(null);
          }
        },
        card(id) {
          const k = cands.findIndex((c) => c.id === id);
          if (k < 0) return sfx('denied');
          light(k);
          sfx('select');
          return done(id);
        },
        hoverCard(id) {
          const k = cands.findIndex((c) => c.id === id);
          if (k >= 0 && k !== i) light(k);
        },
      });
      light(i);
    });
  }

  async function chooseAction(b, u, first, reserved) {
    for (;;) {
      const act = await actionMenu(b, u, first);
      if (act == null) return null;
      if (act === 'attack') {
        const t = await pickTarget(b, 'enemy', u, `${u.ghost ? 'HEX' : 'ATTACK'}: ${b.enemyDef.title}?`);
        if (t) return { type: 'attack', target: t };
      } else if (act === 'guard') {
        return { type: u.ghost ? 'focus' : 'guard' };
      } else if (act === 'carry') {
        const t = await pickTarget(b, 'body', u);
        if (t) return { type: 'carry', target: t };
      } else if (act === 'skills') {
        const sk = await listPanel(b, u, 'skills', reserved);
        if (!sk) continue;
        if (sk.target === 'enemy' || sk.target === 'ally' || sk.target === 'otherAlly') {
          // John's Lunch Box still works with no one left to share it with.
          if (!b.targetsFor(sk.target, u).length) return { type: 'skill', skill: sk.id };
          const t = await pickTarget(b, sk.target, u, (sk.short || sk.name).toUpperCase());
          if (!t) continue;
          return { type: 'skill', skill: sk.id, target: t };
        }
        return { type: 'skill', skill: sk.id };
      } else if (act === 'items') {
        const it = await listPanel(b, u, 'items', reserved);
        if (!it) continue;
        if (it.target === 'enemy' || it.target === 'ally') {
          const t = await pickTarget(b, it.target, u, it.name.toUpperCase());
          if (!t) continue;
          return { type: 'item', item: it.id, target: t };
        }
        return { type: 'item', item: it.id };
      }
    }
  }

  function setActive(id) {
    for (const k of Object.keys(UI.cards)) {
      UI.cards[k].root.classList.toggle('active', k === id);
      UI.cards[k].root.classList.toggle('dim', !!id && k !== id);
    }
  }

  async function commandPhase(b) {
    UI.phase = 'command';
    refresh();
    for (;;) {
      const root0 = await rootMenu();
      if (root0 === 'run') {
        drawRoot(true);
        return { run: true };
      }
      const order = b.party.filter((u) => b.canCommand(u));
      const cmds = {};
      const reserved = {};
      let i = 0;
      while (i >= 0 && i < order.length) {
        const u = order[i];
        setActive(u.id);
        const cmd = await chooseAction(b, u, i === 0, reserved);
        if (cmd == null) {
          i--;
          if (i >= 0) {
            const prev = cmds[order[i].id];
            if (prev && prev.type === 'item') reserved[prev.item]--;
            delete cmds[order[i].id];
          }
          continue;
        }
        if (cmd.type === 'item') reserved[cmd.item] = (reserved[cmd.item] || 0) + 1;
        cmds[u.id] = cmd;
        i++;
      }
      setActive(null);
      if (i >= order.length) {
        drawRoot(true);
        return { commands: cmds };
      }
    }
  }

  // ------------------------------------------------------------------ while the turn plays out
  let resolvingHandler = null;
  function resolving(on) {
    if (on) UI.phase = 'resolving';
    if (on && !resolvingHandler) {
      resolvingHandler = Input.push({
        key(k) {
          if (k === 'ok' || k === 'back') Log.skip = true;
        },
      });
      drawRoot(true);
    } else if (!on && resolvingHandler) {
      Input.remove(resolvingHandler);
      resolvingHandler = null;
    }
  }

  // ------------------------------------------------------------------ SLASHERBOY windows (overlays)
  function overlay(id, cls, html) {
    const o = $('#' + id);
    o.className = 'overlay show ' + (cls || '');
    o.innerHTML = html;
    return o;
  }
  function closeOverlay(id) {
    const o = $('#' + id);
    o.className = 'overlay';
    o.innerHTML = '';
  }
  function winBar(left, right) {
    return `<div class="win-bar"><b>${esc(left)}</b><span>${esc(right || '')}</span></div>`;
  }
  function portraitCanvas(id, foe) {
    let look;
    if (foe)
      look = id === 'sid' ? { id, variant: 'sid_armed', mood: 'slasher', fx: [] } : { id, mood: id === 'dolphin' ? 'cryptid' : 'umbra', fx: [] };
    else look = { id, mood: SC.DATA.workers[id].ghost ? 'ghost' : 'neutral', fx: [] };
    const c = SC.Art.card(look).toCanvas();
    c.className = 'px';
    return c;
  }

  // `scroll`: an element the up/down keys scroll instead.
  function waitChoice(o, buttons, initial, scroll) {
    const btns = buttons.map((sel) => $(sel, o));
    const opts = btns.map((b) => ({ el: b, enabled: true }));
    return choose({ opts, columns: opts.length, back: false, initial, scroll, noCursor: true });
  }

  // How to play: the rules every fight shares, plus the chosen slasher's own.
  const HELP_FOE = {
    trollge: `
      <p><b>TROLLGE ONLY SEES WHAT MOVES.</b> When it stares at someone ([STARED AT]), anything but GUARD (FOCUS, for Purpl Lady) counts as moving: they become [SEEN] and it gets angrier. It can only <b>Scratch</b>, which hits very hard, someone who is SEEN. Its claws mostly miss whoever hasn't moved yet this turn, or is guarding, and every claw hit can leave you AFRAID.</p>
      <p><b>ANGER</b> is on the left, under its condition. At <b>80</b>, <b>Slow Walker, Fast Runner</b>: its speed jumps from 12 to 77, it moves first <i>and</i> comes back around after everyone, it marks someone SEEN every turn, and it's much harder to outrun. Get out before that, or hold on.</p>
      <p><b>READ ITS NEXT MOVE.</b> With John in the squad, his Hyperceptive flags the profile it goes for: <b>STARE</b>, <b>SCRATCH</b> or <b>TARGET</b>. Captain Jim's Confidential Documents say how hard. GUARD, heal first, or set a Bear Trap. Mysti's Tactical Stab is extremely effective against Trollge.</p>`,
    sid: `
      <p><b>ANGER</b> is on the left, under his condition. It rises every turn and whenever Sid gets hurt. From <b>60</b> he follows up with a second attack every turn. At <b>80</b> he draws his Desert Eagle, can't eat cookies to calm down anymore, and hits much harder. Anyone eating a <b>Cookie</b> makes him angrier (METH Addict).</p>
      <p><b>READ HIS NEXT MOVE.</b> With John in the squad, his Hyperceptive flags the profile Sid will hit first (<b>TARGET</b>). Captain Jim's Confidential Documents say how hard. GUARD the target, heal them first, or have Captain Jim put a Bear Trap at their feet.</p>`,
    dolphin: `
      <p><b>DOLPHIN MAN CAN BARELY SEE.</b> At low ANGER his slaps and Tail Whip miss most of the time (<b>Eyes of the Angry</b>). The angrier he gets the better he sees, and at <b>80</b> he sees everything. His slaps hit 5 times and heal him a little. His <b>Loud Wail</b> hits everyone three times (harder the angrier he is) and lowers SPEED and SMARTS, which also makes the generator checks harder. His slime makes punches, slaps and stabs slip off now and then; magic, shocks and blasts don't slip.</p>
      <p><b>HE HUNTS BY SOUND.</b> A battery going in, glass breaking, a ringing phone, a blast: loud things make him angrier (more so the angrier he is) and he goes after whoever made them for 2 turns, seeing them better (<b>HUNTED</b>), camouflage or not. GUARD and FOCUS are quiet, unless you're Captain Jim yelling about his locker.</p>
      <p><b>FETAL POSITION.</b> Now and then he curls up on the floor for a turn: he can't attack and his defense shoots up, but every noise angers him twice as much, and every hit is a noise. Use the time to heal, guard and buff, or run for it.</p>`,
  };
  function helpHtml() {
    const has = (id) => UI.party.includes(id);
    return `
    <div class="help">
      <p><b>THE JOB.</b> You can't kill a slasher. Weaken it until its condition reads <b>[WEAKENED]</b>, then pick <b>ESCAPE</b>. The odds are at the top of the menu (click them for the breakdown).</p>
      <p><b>NOBODY GETS LEFT BEHIND.</b> If a worker dies, a living worker has to <b>CARRY</b> the body before anyone can run. Carrying slows the carrier and lowers the odds.${
        has('purpl')
          ? " Purpl Lady is a ghost: she can't carry anyone, but once the slasher is weakened she <b>POSSESSES</b> a body so it walks out on its own."
          : ''
      }</p>
      ${HELP_FOE[enemyId()] || ''}
      ${
        has('purpl')
          ? "<p><b>PURPL LADY'S MOODS.</b> Every turn she feels <b>HAPPY</b>, <b>ANGRY</b> or <b>SAD</b> (it's on her profile). Her <b>HEX</b> changes with it: HAPPY calms the slasher down and heals everyone a little, ANGRY does real magic damage and lowers its DEF, SAD lowers its ATK and SPD.</p>"
          : ''
      }
      ${
        has('mysti')
          ? '<p><b>MYSTI.</b> <b>First Responder</b> patches up each teammate the first time they drop to CRITICAL. Anyone can apply the <b>DEATHWARD</b> (in the bag) to keep themselves from dying for 3 turns; when Mysti applies it (<b>Deity Swindler</b>), it covers the whole team. Her uniform gives her +10% to everything while she is <b>NEUTRAL</b> (not AFRAID, CONFUSED or HAPPY).</p>'
          : ''
      }
      ${
        has('jim')
          ? "<p><b>THE HELI.</b> Captain Jim's Helicopter Escape lands after 5 turns and gets everyone out, bodies included, as long as someone who can carry a body is still alive.</p>"
          : ''
      }
      <p><b>HEALTH</b> is a word, as in SlashCo VR: [OVERSATED], [SATED], [OK], [STABLE], [SCATHED], [HURT], [CRITICAL] (the heart turns into a skull and crossbones), and [HALTED] under SlashCo VR's red skull for a worker who is out of the fight. STA is STAMINA, which pays for skills.</p>
      <p><b>THE PLACE.</b> Each fight is somewhere in the school: the Hallway or the Cafeteria, which are lit, or the Generator Hall, the Gym or the Locker Room, which are dark. In the dark everyone's HIT RATE is lower, the slasher's too, except for anyone with <b>Shadowborn</b> (John). Pick a place on the title screen with PLACE, or leave it on RANDOM.</p>
      <p><b>THE SQUAD.</b> On the title screen, click anyone to swap them with whoever is on the bench (Purpl Lady, to start with), or press SWAP.</p>
      <p><b>GENERATOR CHECKS.</b> Mel's <b>fuel</b> check: the arrow loses its balance and falls toward the red, faster and faster. Every tap of Q / ← or E / → (or of a side of the box) makes it jump back a little; keep it out of the red until the pour is done. John's <b>battery</b> check: the clips bounce around at random speeds; press Z / Space (or tap) when both are level with the middle of the terminals, or the generator shocks him.${
        has('purpl') ? " Purpl Lady's Moral Support slows both down." : ''
      }</p>
      <p><b>CONTROLS.</b> Arrows / WASD move · Z, Enter, Space confirm · X, Esc back · L battle log · F fast text · M mute. Mouse and touch work everywhere.</p>
    </div>`;
  }

  function showHelp() {
    return new Promise((resolve) => {
      const o = overlay(
        'help',
        '',
        `<div class="box">${winBar('SLASHERBOY', 'HOW TO PLAY')}${helpHtml()}<button class="go sel" id="help-ok">GOT IT</button></div>`
      );
      waitChoice(o, ['#help-ok'], 0, $('.help', o)).then(() => {
        closeOverlay('help');
        resolve();
      });
    });
  }

  // ------------------------------------------------------------------ the squad
  // Four go in; the fifth waits on the bench. Clicking anyone on the team swaps them with the
  // bench, so Purpl Lady can take anyone's place, and they can take hers back.
  const ROSTER = SC.DATA.party.concat([SC.DATA.bench]);
  function loadSquad() {
    try {
      const s = JSON.parse(root.localStorage.getItem('sc-squad') || 'null');
      const all = s && s.party && s.party.concat([s.bench]);
      if (all && all.length === ROSTER.length && ROSTER.every((id) => all.includes(id))) {
        UI.party = s.party;
        UI.bench = s.bench;
      }
    } catch (e) {
      /* convenience only */
    }
  }
  function saveSquad() {
    try {
      root.localStorage.setItem('sc-squad', JSON.stringify({ party: UI.party, bench: UI.bench }));
    } catch (e) {
      /* convenience only */
    }
  }
  function swapWithBench(id) {
    const i = UI.party.indexOf(id);
    if (i < 0) return;
    UI.party[i] = UI.bench;
    UI.bench = id;
    saveSquad();
  }
  // The SWAP button: Purpl Lady takes the next spot along, then goes back to the bench.
  function cycleSwap() {
    const ghost = SC.DATA.bench;
    const at = UI.party.indexOf(ghost);
    if (at < 0) {
      swapWithBench(UI.party[0]);
      return;
    }
    swapWithBench(ghost); // she goes back to the bench
    if (at + 1 < UI.party.length) swapWithBench(UI.party[at + 1]);
  }

  function titleHtml() {
    const S = enemyDef();
    const P = SC.DATA.places[UI.place];
    const where = P ? 'IN THE ' + placeLabel(P) : 'SOMEWHERE IN THE SCHOOL (RANDOM)';
    const member = (id, bench) => {
      const d = SC.DATA.workers[id];
      return `<button class="member${bench ? ' bench' : ''}" data-id="${id}"><span data-p="${id}"></span><span class="nm">${esc(d.name.toUpperCase())}</span><span class="role">${
        bench ? 'ON THE BENCH' : esc(d.role || '')
      }</span></button>`;
    };
    return `<div class="box">
      ${winBar('SLASHERBOY', 'SLASHCO VR · TURN-BASED BATTLE')}
      <div class="logo">${SVG.saw}<div class="word">SLASHCO</div></div>
      <div class="tagline">WEAKEN IT. THEN RUN.</div>
      <div class="squad">${UI.party.map((id) => member(id, false)).join('')}<span class="split"></span>${member(UI.bench, true)}</div>
      <div class="swap-hint">Click anyone to swap them with the bench.</div>
      <div class="versus"><span class="vs">VS</span><span data-p="${enemyId()}" data-foe="1"></span><span class="who"><b>[${esc(S.title)}]</b><span>${esc(
        S.class
      )} · <span style="color: var(--danger-${DANGER[S.danger] || 1})">${esc(S.danger)}</span></span><span class="where">${esc(where)}</span></span></div>
      <button class="go" id="t-start">DEPLOY</button><button class="go" id="t-foe">SLASHER ▸</button><button class="go" id="t-place">PLACE ▸</button><button class="go" id="t-swap">SWAP ▸</button><button class="go" id="t-music">MUSIC</button><button class="go" id="t-help">HOW TO PLAY</button>
      <div class="keys">Z / ENTER: CONFIRM · ARROWS: MOVE · F: FAST TEXT · M: MUTE</div>
    </div>`;
  }

  async function title() {
    UI.phase = 'title';
    // Back from a fight: the title screen shows what's picked now, not the last fight.
    if (UI.battle) {
      UI.battle = null;
      placeEnemy();
      showPlace();
    }
    if (SC.Audio) {
      SC.Audio.theme('default');
      SC.Audio.music('ambience');
    }
    let at = 0;
    for (;;) {
      const o = overlay('screen', 'title', titleHtml());
      o.querySelectorAll('[data-p]').forEach((s) => s.replaceWith(portraitCanvas(s.dataset.p, !!s.dataset.foe)));
      const ask = {
        opts: ['#t-start', '#t-foe', '#t-place', '#t-swap', '#t-music', '#t-help'].map((sel) => ({ el: $(sel, o), enabled: true })),
        columns: 6,
        back: false,
        initial: at,
        noCursor: true,
      };
      const res = await new Promise((resolve) => {
        o.querySelectorAll('.member').forEach((m) => {
          m.onclick = (ev) => {
            ev.stopPropagation();
            if (ask.cancel) ask.cancel();
            resolve({ member: m.dataset.id });
          };
        });
        choose(ask).then((i) => {
          if (i !== undefined) resolve({ button: i });
        });
      });
      if (SC.Audio) SC.Audio.unlock();
      if (res.member) {
        if (UI.party.includes(res.member)) {
          swapWithBench(res.member);
          sfx('select');
        } else sfx('denied'); // the bench: click someone on the team instead
        continue;
      }
      at = res.button;
      if (at === 0) {
        closeOverlay('screen');
        return;
      }
      if (at === 1) {
        // Next slasher.
        const list = SC.DATA.enemies;
        UI.enemy = list[(list.indexOf(UI.enemy) + 1) % list.length];
        try {
          root.localStorage.setItem('sc-enemy', UI.enemy);
        } catch (e) {
          /* convenience only */
        }
        placeEnemy();
        continue;
      }
      if (at === 2) {
        // Next place: RANDOM, then each one.
        const list = ['random'].concat(Object.keys(SC.DATA.places));
        UI.place = list[(list.indexOf(UI.place) + 1) % list.length];
        try {
          root.localStorage.setItem('sc-place', UI.place);
        } catch (e) {
          /* convenience only */
        }
        showPlace();
        continue;
      }
      if (at === 3) {
        cycleSwap();
        continue;
      }
      closeOverlay('screen');
      if (at === 4) await showMusic();
      else await showHelp();
    }
  }

  // MUSIC: the SlashCo VR soundtrack, or files from this device, played exactly as they are.
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  function musicNow() {
    const s = SC.Audio.source;
    if (s.kind === 'yours') return 'YOUR FILES: ' + s.label;
    if (s.kind === 'soundtrack') return 'THE SLASHCO VR SOUNDTRACK';
    return 'BUILT-IN (made in the browser)';
  }
  function musicHtml() {
    const at = clock(SC.Audio.source.chaseAt);
    return `<div class="box">${winBar('SLASHERBOY', 'MUSIC')}
      <div class="help music">
        <p><b>NOW PLAYING:</b> <span id="m-now">${esc(musicNow())}</span></p>
        <p><b>THE SOUNDTRACK.</b> Trollge fights to <b>Weather Alert</b>, and <b>Rain?</b> plays when things get desperate (Kamija). Every other slasher fights to <b>SlashCo HQ</b>, low anger and chase (zimzbooth). A fight opens with the sting for the slasher's danger level, and ends with <b>Escape</b> or <b>Death</b> (zimzbooth).</p>
        <p>The chase plays in desperate moments: once the slasher is weakened, when the team makes a run for it, and when the team is about to lose.</p>
        <p><b>YOUR OWN FILES</b> replace the battle themes for every slasher, played exactly as they are. They stay in this browser and aren't uploaded anywhere. <b>One file</b>: everything before <input id="m-at" value="${at}" size="5" maxlength="6" spellcheck="false"> is the ambience, everything after it the chase. <b>Two files</b>: the ambience and the chase (the one with "chase" in its name). A file with "wail" in its name replaces Dolphin Man's wail.</p>
      </div>
      <input type="file" id="m-file" accept="audio/*,video/*" multiple hidden>
      <button class="go" id="m-pick">PICK FILES</button><button class="go" id="m-built">SOUNDTRACK</button><button class="go" id="m-done">DONE</button>
    </div>`;
  }
  async function showMusic() {
    const o = overlay('help', '', musicHtml());
    const input = $('#m-file', o);
    const now = $('#m-now', o);
    const chaseAt = () => {
      const v = $('#m-at', o).value.trim();
      const m = /^(\d+):(\d{1,2})$/.exec(v);
      return m ? Number(m[1]) * 60 + Number(m[2]) : Number(v) > 0 ? Number(v) : 0;
    };
    input.addEventListener('change', async () => {
      if (!input.files.length) return;
      now.textContent = 'LOADING…';
      await SC.Audio.useFiles(input.files, chaseAt());
      now.textContent = musicNow();
      input.value = '';
    });
    for (;;) {
      const i = await waitChoice(o, ['#m-pick', '#m-built', '#m-done'], 0);
      if (i === 0) {
        SC.Audio.unlock();
        input.click();
        continue;
      }
      if (i === 1) {
        await SC.Audio.useSoundtrack();
        now.textContent = musicNow();
        continue;
      }
      break;
    }
    closeOverlay('help');
  }

  async function showEnd(b) {
    UI.phase = 'end';
    const win = b.outcome === 'win';
    if (SC.Audio) SC.Audio.ending(win); // the ESCAPE or DEATH track
    const lost = b.party.filter((u) => u.dead).map((u) => u.name);
    const o = overlay(
      'screen',
      win ? 'win' : 'lose',
      `<div class="box">
        ${winBar('SLASHERBOY', 'TURN ' + b.turn)}
        <h1>${win ? 'YOU ESCAPED' : 'ASSIGNMENT FAILED'}</h1>
        <h2>${win ? `A SUCCESSFUL ESCAPE! ${esc(b.partyNames().toUpperCase())} WIN!` : `${esc(b.enemyDef.title)} GOT EVERYONE WHO COULD CARRY A BODY.`}</h2>
        <div class="stats">
          <span>Turns</span><span>${b.turn}</span>
          <span>Credits earned</span><span>${b.credits}</span>
          ${win ? `<span>EXP earned${b.secrets ? ' (Hidden Documents: +50%)' : ''}</span><span>${b.exp}</span>` : ''}
          <span>Damage dealt to ${esc(b.en)}</span><span>${b.stats.damageDealt}</span>
          <span>Workers lost</span><span>${lost.length ? esc(lost.join(', ')) : 'None'}</span>
          <span>Escape attempts</span><span>${b.stats.runs}</span>
          <span>${esc(b.en)}'s ANGER at the end</span><span>${Math.round(b.enemy.anger)}</span>
        </div>
        <button class="go" id="e-again">AGAIN</button><button class="go" id="e-log">BATTLE LOG</button>
      </div>`
    );
    for (;;) {
      const i = await waitChoice(o, ['#e-again', '#e-log']);
      if (i === 0) break;
      await showHistory();
    }
    closeOverlay('screen');
  }

  function showHistory() {
    return new Promise((resolve) => {
      const o = overlay(
        'history',
        '',
        `<div class="box">${winBar('SLASHERBOY', 'BATTLE LOG')}<div class="scroll">${Log.history
          .map((l) => `<div class="line ${esc(l.tone)}">${colorize(l.text)}</div>`)
          .join('')}</div><button class="go sel" id="h-close">CLOSE</button></div>`
      );
      const sc = $('.scroll', o);
      sc.scrollTop = sc.scrollHeight;
      const handler = Input.push({
        key(k) {
          if (k === 'up') sc.scrollTop -= 90;
          else if (k === 'down') sc.scrollTop += 90;
          else if (k === 'ok' || k === 'back') close();
        },
      });
      const close = () => {
        Input.remove(handler);
        closeOverlay('history');
        resolve();
      };
      $('#h-close', o).onclick = close;
    });
  }

  // ------------------------------------------------------------------ toggles
  function toggleMute() {
    const m = SC.Audio.toggle();
    $('#mute-btn').classList.toggle('on', m);
    $('#mute-btn').textContent = m ? 'MUTED' : 'SOUND';
  }
  function toggleFast() {
    UI.fast = !UI.fast;
    $('#fast-btn').classList.toggle('on', UI.fast);
    try {
      root.localStorage.setItem('sc-fast', UI.fast ? '1' : '0');
    } catch (e) {
      /* convenience only */
    }
  }

  // ------------------------------------------------------------------ build
  function build() {
    stage = $('#stage');
    fxLayer = $('#fx');
    flashEl = $('#flash');
    enemyWrap = $('#enemy-wrap');
    enemyCanvas = $('#enemy');
    command = $('#command');
    panel = $('#panel');
    escapeEl = $('#escape');
    cursor = $('#cursor');
    UI.lastAction = {};

    fit();
    root.addEventListener('resize', fit);
    doc.addEventListener('keydown', onKey);
    // Browsers only allow sound after a click or a key press: any one will do.
    doc.addEventListener('pointerdown', () => SC.Audio && SC.Audio.unlock(), true);

    loadSquad();
    buildCards();
    buildPlate();
    try {
      const saved = root.localStorage.getItem('sc-enemy');
      if (SC.DATA.enemies.includes(saved)) UI.enemy = saved;
      const place = root.localStorage.getItem('sc-place');
      if (SC.DATA.places[place]) UI.place = place;
    } catch (e) {
      /* convenience only */
    }
    placeEnemy();
    showPlace();

    $('#log').addEventListener('click', () => {
      Log.skip = true;
    });
    $('#log-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!doc.querySelector('.overlay.show')) showHistory();
    });
    $('#fast-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleFast();
    });
    $('#mute-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleMute();
    });
    escapeEl.addEventListener('click', () => {
      const tip = $('#escape-tip');
      tip.classList.toggle('show');
      if (UI.battle) fillEscapeTip(UI.battle.escapeChance());
    });
    try {
      UI.fast = root.localStorage.getItem('sc-fast') === '1';
    } catch (e) {
      UI.fast = false;
    }
    $('#fast-btn').classList.toggle('on', UI.fast);
    if (SC.Audio && SC.Audio.muted) {
      $('#mute-btn').classList.add('on');
      $('#mute-btn').textContent = 'MUTED';
    }
    drawRoot(true);

    // Animation loop: the slasher (Sid's wandering eyes, Trollge's head), animated
    // portraits, flickering lights.
    let last = 0;
    const loop = (now) => {
      if (now - last > 110) {
        last = now;
        UI.frame++;
        view().draw(now);
        if (UI.battle && UI.frame % 2 === 0) refresh();
        if (Math.random() < 0.012) {
          $('#flicker').classList.add('on');
          setTimeout(() => $('#flicker').classList.remove('on'), 60 + Math.random() * 120);
        }
      }
      root.requestAnimationFrame(loop);
    };
    root.requestAnimationFrame(loop);
  }

  function setBattle(b) {
    UI.battle = b;
    Log.history = [];
    $('#log-lines').innerHTML = '';
    UI.lastAction = {};
    buildCards();
    placeEnemy();
    showPlace();
    // The slasher's own themes, after the sting for its danger level.
    if (SC.Audio) {
      SC.Audio.theme(b.enemy.id);
      SC.Audio.sting(b.enemyDef.danger);
    }
    refresh();
  }

  UI.io = {
    say: (text, o) => Log.say(text, o),
    fx,
    skillCheck,
    refresh,
  };
  UI.build = build;
  UI.setBattle = setBattle;
  UI.commandPhase = commandPhase;
  UI.resolving = resolving;
  UI.title = title;
  UI.showEnd = showEnd;
  UI.refresh = refresh;
})(typeof window !== 'undefined' ? window : globalThis);
