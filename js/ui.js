/*
 * SLASHCO VR — TURN-BASED BATTLE
 * ui.js — the HUD, set up like a SlashCo monitor room: the hallway camera feed, the field
 * radio (battle log), SLASHERBOY's threat file on the slasher, the employee ID badges, the
 * field console (orders and extraction odds), targeting, the generator skill checks, and
 * every animation.
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

  // Party order = badge order along the bottom of the console. Must match .badge in the CSS.
  const BADGE_XY = [
    [16, 714],
    [330, 714],
    [644, 714],
    [958, 714],
  ];
  const slotOf = (id) => SC.DATA.party.indexOf(id);
  // Where each slasher's sprite sits on the stage (it is drawn at 2x).
  const ENEMY_BOX = {
    sid: { left: 438, top: 252 },
    trollge: { left: 390, top: 256 },
  };
  const SCALE = 2;
  // SlashCo's danger levels, colour-coded 1 (yellow) to 3 (red).
  const DANGER = { MODERATE: 1, CONSIDERABLE: 2, DEVASTATING: 3 };
  // Colour of each health state's chip on a badge.
  const STATE_COLOR = {
    CRITICAL: '#c91c25',
    HURT: '#d9621a',
    SCATHED: '#b98a00',
    STABLE: '#3f9b52',
    OK: '#2f9e5d',
    SATED: '#a8830b',
    OVERSATED: '#c79500',
    DEAD: '#16181b',
    NONE: '#6b5a8f',
  };

  const UI = {
    battle: null,
    enemy: SC.DATA.enemy, // the slasher picked on the title screen
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
  let clockStart = 0;

  const enemyId = () => (UI.battle ? UI.battle.enemy.id : UI.enemy);
  const enemyDef = () => SC.DATA.slashers[enemyId()];
  const enemyPoints = () => (enemyId() === 'trollge' ? SC.Art.trollgePoints() : SC.Art.SID_POINTS);

  function cardCenter(id) {
    const [x, y] = BADGE_XY[slotOf(id)];
    return [x + 152, y + 104];
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

  // ------------------------------------------------------------------ field radio (battle log)
  // Every worker's and slasher's name gets its own colour in the log.
  const NAMES = {};
  for (const [id, d] of Object.entries(SC.DATA.workers).concat(Object.entries(SC.DATA.slashers))) NAMES[d.name] = id;
  const NAME_RE = new RegExp(
    '\\b(' +
      Object.keys(NAMES)
        .sort((a, b) => b.length - a.length)
        .join('|') +
      ')\\b',
    'g'
  );
  function colorize(text) {
    return esc(text).replace(NAME_RE, (m) => `<b class="n-${NAMES[m]}">${m}</b>`);
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
      const radio = $('#radio');
      radio.classList.add('rx'); // the receive light flickers while a line comes in
      const chars = Array.from(text);
      for (let i = 2; i < chars.length + 2 && !this.skip; i += 2) {
        line.textContent = chars.slice(0, i).join('');
        if (i % 4 === 0) sfx('blip');
        await wait(16);
      }
      radio.classList.remove('rx');
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

  // ------------------------------------------------------------------ employee ID badges
  function iconCanvas(name, scale) {
    const px = SC.Art.icon(name);
    const c = px.toCanvas();
    c.className = 'px';
    c.style.width = px.w * scale + 'px';
    c.style.height = px.h * scale + 'px';
    return c;
  }

  function buildCard(id) {
    const d = SC.DATA.workers[id];
    const r = el('div', 'badge' + (d.ghost ? ' spirit' : ''));
    r.dataset.slot = slotOf(id);
    r.id = 'card-' + id;
    r.innerHTML = `
      <div class="strip"><span class="brand">SLASHCO</span><span class="emp">${esc(d.badge || '')}</span></div>
      <div class="clip"></div>
      <div class="photo"><canvas class="px" width="128" height="128"></canvas></div>
      <div class="ident">
        <div class="name"></div>
        <div class="role">${esc(d.role || '')}</div>
        <div class="row"><span>HEALTH</span><span class="state"></span></div>
        <div class="vital"><div class="fill"></div><div class="over"></div></div>
        <div class="row"><span>${esc(d.resource.name)}</span></div>
        <div class="batt"><div class="cell"><div class="fill"></div></div><span class="txt"></span></div>
      </div>
      <div class="tags"></div>
      <div class="intent"></div>
      <div class="stamp">DECEASED</div>`;
    stage.insertBefore(r, $('#fx')); // above the console, below effects and menus
    const c = {
      root: r,
      name: $('.name', r),
      canvas: $('.photo canvas', r),
      tags: $('.tags', r),
      state: $('.state', r),
      vitalFill: $('.vital .fill', r),
      vitalOver: $('.vital .over', r),
      cellFill: $('.cell .fill', r),
      resTxt: $('.batt .txt', r),
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

  // SLASHERBOY's file on the slasher: its health and ANGER, class and danger level.
  function buildPlate() {
    const r = $('#enemy-plate');
    UI.plate = {
      root: r,
      name: $('.name', r),
      cls: $('.facts .cls', r),
      danger: $('.facts .dlvl', r),
      dangerTxt: $('.facts .dlvl b', r),
      hpPill: $('.hp .pill', r),
      angerPill: $('.anger .pill', r),
      hpFill: $('.hp .fill', r),
      hpTxt: $('.hp .txt', r),
      angerFill: $('.anger .fill', r),
      angerTxt: $('.anger .txt', r),
      tags: $('.tags', r),
    };
  }

  // Put the chosen slasher on the feed and in SLASHERBOY's file.
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
    P.name.textContent = S.title;
    P.cls.textContent = S.class;
    P.danger.dataset.level = DANGER[S.danger] || 1;
    P.dangerTxt.textContent = S.danger;
    P.root.querySelectorAll('.notch').forEach((n) => n.remove());
    addNotch(P.hpPill, S.weakenedAt, 'Weakened: run!');
    addNotch(P.angerPill, S.anger.overflow / S.anger.max, S.lines.overflowShort);
    view().draw(performance.now(), true);
  }

  function addNotch(pill, pct, title) {
    const n = el('div', 'notch');
    n.style.left = `calc(${pct * 100}% - 1px)`;
    n.title = title;
    pill.appendChild(n);
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
      if (u.possessed) tags.push({ t: 'POSSESSED', c: 'info' });
      else if (u.carriedBy) tags.push({ t: 'CARRIED BY ' + b.unit(u.carriedBy).name.toUpperCase(), c: 'info' });
      else tags.push({ t: 'NEEDS CARRYING', c: 'bad' });
      return tags;
    }
    if (u.status.stared) tags.push({ t: 'STARED AT', c: 'bad' });
    if (u.status.seen) tags.push({ t: 'SEEN', c: 'bad' });
    if (u.flags.guarding) tags.push({ t: u.flags.barrier ? 'BARRIER' : 'GUARD', c: 'good' });
    if (u.status.exposed) tags.push({ t: 'VULNERABLE', c: 'bad' });
    if (b.deathward) tags.push({ t: 'DEATHWARD', c: 'good' });
    if (u.status.asleep) tags.push({ t: 'ASLEEP', c: 'info' });
    if (u.status.phasing) tags.push({ t: 'PHASING', c: 'info' });
    if (u.status.afraid) tags.push({ t: 'AFRAID', c: 'bad' });
    if (u.status.confused) tags.push({ t: 'CONFUSED', c: 'bad' });
    if (u.status.poison) tags.push({ t: 'URANIUM', c: 'bad' });
    if (u.status.balkan) tags.push({ t: u.status.balkan.phase === 'pending' ? 'BALKAN...' : 'BALKAN!', c: 'good' });
    if (u.flags.glassesOff) tags.push({ t: 'NO GLASSES', c: 'bad' });
    if (u.flags.lunch) tags.push({ t: 'LUNCH BOX...', c: 'info' });
    if (u.status.trap) tags.push({ t: 'BEAR TRAP', c: 'good' });
    if (u.status.happy) tags.push({ t: 'HAPPY', c: 'good' });
    if (u.flags.proxy) tags.push({ t: 'PROXY ON', c: 'info' });
    for (const id of u.carrying) tags.push({ t: 'CARRYING ' + b.unit(id).name.toUpperCase(), c: 'info' });
    if (u.ghost && u.res <= 0 && !u.status.phasing) tags.push({ t: 'DRAINED', c: 'bad' });
    if (u.ghost && b.foresightTurns > 0) tags.push({ t: 'FORESIGHT', c: 'info' });
    if (b.uniformBonus(u)) tags.push({ t: 'NEUTRAL', c: 'info' }); // BRAVO Team Uniform is on
    return tags.concat(buffTags(b, u)).slice(0, 6);
  }

  function enemyTags(b) {
    const s = b.enemy;
    const tags = [];
    if (s.status.stunned) tags.push({ t: 'CAN’T MOVE', c: 'good' });
    if (s.flags.overflow) tags.push({ t: b.enemyDef.lines.overflowShort, c: 'bad' });
    if (s.status.bleed) tags.push({ t: 'BLEEDING', c: 'good' });
    if (s.status.shards) tags.push({ t: 'GLASS', c: 'good' });
    if (s.status.chilled) tags.push({ t: 'FREEZING', c: 'good' });
    if (s.status.confused) tags.push({ t: 'CONFUSED', c: 'good' });
    if (s.status.blind) tags.push({ t: 'BLIND', c: 'good' });
    if (s.status.vulnerable) tags.push({ t: 'VULNERABLE', c: 'good' });
    if (s.flags.deagleFocus) tags.push({ t: 'AIMING', c: 'bad' });
    if (b.known()) tags.push({ t: 'INTEL', c: 'info' });
    return tags.concat(buffTags(b, s).map((t) => ({ t: t.t, c: t.c === 'good' ? 'bad' : 'good' }))).slice(0, 5);
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
    if ((k === 'melee' || k === 'gun' || k === 'claws') && b.intent.targetId === u.id) return word || 'TARGET';
    if (k === 'magdump' && !u.dead && !u.status.phasing) return word || 'ALL';
    if (k === 'claims' && !u.dead && !u.status.phasing) return 'RAMBLE';
    return null;
  }

  function refresh() {
    const b = UI.battle;
    if (!b) return;
    for (const u of b.party) {
      const c = UI.cards[u.id];
      c.name.textContent = u.name.toUpperCase();
      c.name.classList.toggle('long', u.name.length > 9);
      const hs = b.healthState(u).id;
      c.state.textContent = hs;
      c.state.style.background = STATE_COLOR[hs] || STATE_COLOR.OK;
      if (u.ghost) {
        c.vitalFill.style.width = '100%';
        c.vitalOver.style.width = '0';
      } else {
        c.vitalFill.style.width = clamp(u.hp, 0, 100) + '%';
        c.vitalOver.style.width = clamp(((u.hp - 100) / 50) * 100, 0, 100) + '%';
      }
      c.vitalFill.style.setProperty('--vc', STATE_COLOR[hs] || STATE_COLOR.OK);
      c.cellFill.style.width = (u.res / u.resMax) * 100 + '%';
      c.resTxt.textContent = `${Math.round(u.res)}/${u.resMax}`;
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
    const plate = UI.plate;
    plate.hpFill.style.width = (s.hp / s.maxHp) * 100 + '%';
    plate.hpTxt.textContent = b.healthState(s).id + (b.known() ? ` ${s.hp}` : '');
    plate.angerFill.style.width = (s.anger / b.enemyDef.anger.max) * 100 + '%';
    plate.angerTxt.textContent = String(Math.round(s.anger));
    setTags(plate, enemyTags(b));
    plate.root.classList.toggle('armed', !!s.flags.overflow);
    enemyWrap.classList.toggle('rage', !!s.flags.overflow && !s.status.chilled && !s.status.stunned);
    enemyWrap.classList.toggle('chilled', !!s.status.chilled);
    enemyWrap.classList.toggle('down', !!s.status.stunned);
    $('#turn-chip').textContent = 'TURN ' + Math.max(1, b.turn);
    $('#credits-chip').textContent = b.credits + ' CR';
    const chopper = $('#chopper-chip');
    chopper.style.display = b.chopper && !b.outcome ? '' : 'none';
    if (b.chopper) chopper.textContent = 'HELI ETA ' + b.chopper.turns;
    updateEscape();
  }

  // ------------------------------------------------------------------ extraction gauge
  function updateEscape(flashReason) {
    const b = UI.battle;
    if (!b) return;
    const e = b.escapeChance();
    escapeEl.classList.toggle('blocked', e.blocked);
    escapeEl.classList.toggle('ready', !e.blocked && e.chance >= 50);
    $('.fill', escapeEl).style.width = (e.blocked ? 0 : e.chance) + '%';
    $('.pct', escapeEl).textContent = e.blocked ? '--' : e.chance + '%';
    let label = 'ODDS IF THE TEAM RUNS NOW';
    if (e.blocked) label = e.short || 'NO WAY OUT';
    else if (b.enemy.flags.weakened) label = `${b.enemyDef.title} IS WEAKENED — RUN!`;
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
      '<div class="row"><span>How the extraction odds add up:</span><span></span></div>' +
      e.parts
        .map(([k, v]) => {
          const r = Math.round(v);
          return `<div class="row"><span>${esc(k)}</span><span class="v ${r < 0 ? 'neg' : 'pos'}">${r > 0 ? '+' : ''}${r}%</span></div>`;
        })
        .join('') +
      `<div class="row"><span>Total (max 95%)</span><span class="v pos">${e.chance}%</span></div>`;
  }

  // ------------------------------------------------------------------ slasher sprites
  const SidView = {
    pupils: [
      [0, 0],
      [0, 0],
    ],
    goals: [
      [0.4, 0.2],
      [-0.4, 0.3],
    ],
    next: [0, 0],
    breathe: 0,
    lastBreathe: 0,
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
      if (now - this.lastBreathe > 700) {
        this.breathe ^= 1;
        this.lastBreathe = now;
      }
      let pose = 'idle';
      if (s && s.status.stunned) pose = 'down';
      else if (s && s.flags.overflow) pose = 'gun';
      if (this.override && now < this.until) pose = this.override;
      const px = SC.Art.sid({
        pose,
        breathe: this.breathe,
        pupils: this.pupils,
        angry: !!s && s.flags.overflow,
        frame: UI.frame,
      });
      px.toCanvas(enemyCanvas);
      if (force) enemyCanvas.dataset.pose = pose;
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

  const view = () => (enemyId() === 'trollge' ? TrollgeView : SidView);

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
  // Three claw marks raked across a worker's badge.
  function slash(id, big) {
    const [x, y] = cardCenter(id);
    const s = el('div', 'slash' + (big ? ' big' : ''), '<i></i><i></i><i></i>');
    s.style.left = x + 'px';
    s.style.top = y - 10 + 'px';
    fxLayer.appendChild(s);
    setTimeout(() => s.remove(), 520);
  }
  // Lean the slasher toward a badge for a moment.
  async function lunge(id, ms, reach) {
    const [tx, ty] = cardCenter(id);
    const k = reach || 1;
    enemyWrap.style.translate = `${(tx - 500) * 0.12 * k}px ${(ty - 430) * 0.06 * k}px`;
    await T(ms);
    enemyWrap.style.translate = '';
  }

  async function fx(e) {
    const b = UI.battle;
    const card = (id) => UI.cards[id] && UI.cards[id].root;
    switch (e.type) {
      case 'hitEnemy': {
        refresh();
        pulse(enemyWrap, 'hit', 280);
        pulse(enemyWrap, 'flash', 110);
        const [x, y] = enemyPoint('body');
        pop(x + rand(-70, 70), y - 70 + rand(-50, 30), e.amount, e.crit ? 'crit' : e.kind === 'page' ? 'small' : '');
        if (e.crit) pop(x, y - 190, 'CRITICAL', 'status', 800);
        sfx(e.crit ? 'crit' : 'hit');
        return T(e.quick ? 110 : 320);
      }
      case 'hitWorker': {
        refresh();
        pulse(card(e.target), 'hit', 400);
        sfx('hurt');
        if (e.big) shake(false);
        return T(e.big ? 450 : 320);
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
        sfx('success');
        return T(550);
      }
      case 'block':
      case 'barrier':
        pulse(card(e.target), 'shield', 450);
        sfx('buff');
        return T(320);
      case 'ward':
        refresh();
        flash('#ffe9a8');
        for (const u of b.party) if (!u.dead && (e.all || u.id === e.target)) pulse(card(u.id), 'glow', 600);
        sfx('success');
        return T(e.all ? 520 : 320);
      case 'exterminate':
        flash('#ff2a2a');
        shake(true);
        sfx('crit');
        return T(600);
      case 'guard':
        refresh();
        pulse(card(e.target), 'shield', 450);
        return T(150);
      case 'enemyAttack': {
        if (e.kind === 'stare') {
          TrollgeView.set('stare', 1600);
          pulse(stage, 'staring', 1500);
          pulse(card(e.target), 'stared', 1500);
          sfx('growl');
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
          sfx(e.kind === 'scratch' ? 'crit' : 'growl');
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
          sfx('growl');
          return T(420);
        }
        if (e.kind === 'claims') {
          shake(false);
          sfx('growl');
          return T(320);
        }
        if (e.kind === 'deagle') {
          SidView.set('gun', 900);
          sfx('growl');
          return T(260);
        }
        if (e.kind === 'magdump') {
          SidView.set('gun', 2600);
          return T(160);
        }
        if (e.kind === 'trapped') {
          const hitting = lunge(e.target, 150);
          await hitting;
          const [fx0, fy0] = enemyPoint('feet');
          pop(fx0, fy0 - 40, 'SNAP!', 'crit', 900);
          shake(false);
          sfx('crit');
          return T(320);
        }
        if (e.kind === 'gun') {
          const [mx, my] = enemyPoint('muzzle');
          muzzle(mx, my);
          sfx('gun');
        } else sfx('growl');
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
        sfx('gun');
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
        sfx('zap');
        return T(420);
      }
      case 'shockSelf':
        pulse(card(e.target), 'shield', 450);
        sfx('zap');
        return T(320);
      case 'status': {
        const [x, y] = posOf(e.target);
        pop(x, y - (e.target === enemyId() ? 150 : 90), e.text, 'status', 900);
        sfx('debuff');
        return T(240);
      }
      case 'credits': {
        refresh();
        pop(560, 100, `+${e.amount} CREDITS`, 'status', 1000);
        sfx('coin');
        return T(260);
      }
      case 'carry':
        refresh();
        pulse(card(e.carrier), 'glow', 400);
        sfx('hurt');
        return T(320);
      case 'possess':
        refresh();
        flash('#8a3fd1');
        pulse(card(e.target), 'glow', 500);
        sfx('buff');
        return T(480);
      case 'phase':
      case 'unphase':
        refresh();
        sfx('buff');
        return T(360);
      case 'chopper':
        flash('#ffffff');
        pop(496, 420, 'HELI ON THE PAD!', 'crit', 1400);
        sfx('run');
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
        sfx('whiff');
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
        sfx(e.type === 'item' ? 'select' : 'buff');
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
  // The two checks SlashCo VR puts on a generator: FUEL (keep the needle out of the red while
  // you pour) and BATTERY (connect when the clamps line up with the terminals).
  function skillCheck(o) {
    return new Promise((resolve) => {
      const box = $('#skillcheck');
      const fuel = o.kind === 'fuel';
      const support = o.moralSupport ? ' Purpl Lady’s Moral Support makes it easier.' : '';
      box.innerHTML = `
        <div class="gen"><span>GENERATOR · ${fuel ? 'FUEL' : 'BATTERY'}</span></div>
        <div class="t">${esc(o.title)}</div>
        <div class="s">${
          fuel
            ? `${esc(o.name)} is pouring fuel. Hold <b>Q / ←</b> or <b>E / →</b> (or press a side) to keep the needle out of the red.`
            : `${esc(o.name)} is connecting the battery. Press <b>Z / SPACE</b> or tap when the clamps line up with the terminals.`
        }${support}</div>
        ${
          fuel
            ? '<div class="dial"><div class="needle"></div></div>'
            : '<div class="rail"><div class="terminals"></div><div class="clamp"></div></div>'
        }
        <div class="timer"></div>
        <div class="res">GET READY…</div>
        ${fuel ? '<div class="nudge l">◀</div><div class="nudge r">▶</div>' : ''}`;
      const timer = $('.timer', box);
      const res = $('.res', box);
      box.classList.add('show');
      const lead = UI.fast ? 250 : 650;
      const t0 = performance.now() + lead;
      let done = false;
      let handler = null;

      function finish(ok, msg) {
        if (done) return;
        done = true;
        Input.remove(handler);
        box.removeEventListener('pointerdown', onPointer);
        doc.removeEventListener('keydown', onHold, true);
        doc.removeEventListener('keyup', onHold, true);
        root.removeEventListener('pointerup', release);
        res.textContent = ok ? 'SUCCESS!' : msg;
        res.className = 'res ' + (ok ? 'ok' : 'no');
        sfx(ok ? 'success' : 'fail');
        setTimeout(
          () => {
            box.classList.remove('show');
            resolve(ok);
          },
          UI.fast ? 350 : 750
        );
      }

      // ---- FUEL: the needle drifts one way, then another; hold a side to push it back
      // before it touches the red.
      const safe = clamp(0.38 + o.zone * 1.2, 0.45, 0.85);
      const red = (1 - safe) / 2;
      let p = 0.5;
      let force = (Math.random() < 0.5 ? -1 : 1) * rand(0.85, 1);
      let goal = force;
      let nextGoal = 0;
      let last = null;
      const keysDown = { l: false, r: false };
      let pointerSide = 0;
      const held = () => (keysDown.r || pointerSide > 0 ? 1 : 0) - (keysDown.l || pointerSide < 0 ? 1 : 0);
      const SIDE = { ArrowLeft: 'l', a: 'l', q: 'l', ArrowRight: 'r', d: 'r', e: 'r' };
      function onHold(ev) {
        const side = SIDE[ev.key] || SIDE[ev.key && ev.key.toLowerCase()];
        if (!side) return;
        keysDown[side] = ev.type === 'keydown';
        showHeld();
      }
      function release() {
        pointerSide = 0;
        showHeld();
      }
      function showHeld() {
        const h = held();
        const l = $('.nudge.l', box);
        const r = $('.nudge.r', box);
        if (l) l.classList.toggle('on', h < 0);
        if (r) r.classList.toggle('on', h > 0);
      }
      // ---- BATTERY: the clamps sweep back and forth over the rail.
      const start = 0.12 + Math.random() * Math.max(0, 0.88 - o.zone - 0.12);
      const at = (t) => {
        const ph = (Math.max(0, t) / o.sweepMs) % 2;
        return ph < 1 ? ph : 2 - ph;
      };
      function press() {
        if (done || fuel) return;
        const t = performance.now() - t0;
        if (t < 0) return; // not started yet
        const x = at(t);
        finish(x >= start && x <= start + o.zone, 'ZAP!');
      }

      if (fuel) {
        const deg = red * 180;
        $('.dial', box).style.background =
          `conic-gradient(from -90deg at 50% 100%, #c91c25 0deg ${deg}deg, #2f9e5d ${deg}deg ${180 - deg}deg, #c91c25 ${
            180 - deg
          }deg 180deg, transparent 180deg)`;
      } else {
        const term = $('.terminals', box);
        term.style.left = start * 100 + '%';
        term.style.width = o.zone * 100 + '%';
      }

      function frame(now) {
        if (done) return;
        const t = now - t0;
        if (t >= 0 && res.textContent === 'GET READY…') res.textContent = '';
        timer.style.transform = `scaleX(${clamp(1 - t / o.timeLimitMs, 0, 1)})`;
        if (fuel) {
          const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
          last = now;
          if (t >= 0) {
            if (!nextGoal) nextGoal = now + 1600 + Math.random() * 800;
            if (now > nextGoal) {
              goal = (Math.random() < 0.5 ? -1 : 1) * rand(0.85, 1);
              nextGoal = now + 1600 + Math.random() * 800;
            }
            force += (goal - force) * Math.min(1, dt * 5);
            const drift = 0.22 * (1 + (t / o.timeLimitMs) * 0.3); // it gets a little harder to hold
            p = clamp(p + (force * drift + held() * 0.45) * dt, 0, 1);
          }
          $('.needle', box).style.transform = `rotate(${(p - 0.5) * 180}deg)`;
          if (p < red || p > 1 - red) return finish(false, 'SPILLED!');
          if (t >= o.timeLimitMs) return finish(true);
        } else {
          $('.clamp', box).style.left = at(t) * 100 + '%';
          if (t >= o.timeLimitMs) return finish(false, 'TOO SLOW…');
        }
        root.requestAnimationFrame(frame);
        return undefined;
      }
      function onPointer(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!fuel) return press();
        const r = box.getBoundingClientRect();
        pointerSide = ev.clientX < r.left + r.width / 2 ? -1 : 1;
        return showHeld();
      }
      handler = Input.push({
        key(k) {
          if (k === 'ok') press();
        },
      });
      box.addEventListener('pointerdown', onPointer);
      if (fuel) {
        doc.addEventListener('keydown', onHold, true);
        doc.addEventListener('keyup', onHold, true);
        root.addEventListener('pointerup', release);
      }
      root.requestAnimationFrame(frame);
    });
  }

  // ------------------------------------------------------------------ menus
  let cursorSrc = null;
  function showCursor(x, y, down) {
    if (!cursorSrc) {
      cursorSrc = iconCanvas('knife', 2);
      cursor.appendChild(cursorSrc);
    }
    cursor.style.display = 'block';
    cursor.classList.toggle('down', !!down);
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
  }
  function hideCursor() {
    cursor.style.display = 'none';
  }
  // Point the knife at an option: inside its left padding if it has room, otherwise
  // just outside its left edge.
  function cursorAt(elem) {
    const r = stageRect(elem);
    const pad = parseFloat(root.getComputedStyle(elem).paddingLeft) || 0;
    showCursor(pad >= 40 ? r.x + pad - 46 : r.x - 52, r.y + r.h / 2 - 5);
  }

  // Keyboard + mouse selection over a list of option elements. Resolves the chosen
  // index, or null on BACK.
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
        hideCursor();
        resolve(v);
      };
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

  // The two big buttons on the field console.
  function drawRoot(idle) {
    const b = UI.battle;
    command.innerHTML = '';
    const fight = el('button', 'order fight' + (idle ? ' off' : ''));
    fight.innerHTML = `<span class="ico"></span><span class="word">FIGHT</span><span class="sub">${
      b ? 'ENGAGE ' + esc(b.enemyDef.title) : 'ENGAGE THE SLASHER'
    }</span>`;
    $('.ico', fight).appendChild(iconCanvas('knife', 2));
    const run = el('button', 'order escape' + (idle ? ' off' : ''));
    run.innerHTML = '<span class="ico"></span><span class="word">ESCAPE</span><span class="sub"></span>';
    $('.ico', run).appendChild(iconCanvas('heli', 2));
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
        noCursor: true,
        onHighlight: (op, k) => {
          fight.classList.toggle('off', k !== 0);
          run.classList.toggle('off', k !== 1);
        },
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

  const ACTION_HINTS = {
    attack: (b, u) => {
      const W = u.def.weapon;
      if (u.ghost) return `HEX — ${W.name}: no damage, a random debuff on ${b.en}.`;
      return `${W.name}: ${W.rules ? b.fill(W.rules) : `${W.hits} hits (the 2nd is less accurate).`}`;
    },
    skills: (b, u) => `Use a skill. Costs ${u.def.resource.name}.`,
    items: () => 'Use something from the team bag.',
    guard: (b, u) =>
      u.ghost
        ? 'FOCUS — gather SPIRIT (+20). Keeps Freaky Doctor running.'
        : `Take half damage this turn, recover 20 STAMINA. Acts first.${b.enemy.id === 'trollge' ? ' Holds still: Trollge can’t catch you moving.' : ''}`,
    carry: () => 'Pick up a dead ally so the team can escape. Slows the carrier.',
    back: () => 'Go back.',
  };

  async function actionMenu(b, u, first) {
    command.innerHTML = '';
    const menu = el('div', 'menu');
    menu.innerHTML = `<div class="who"><span>${esc(u.name.toUpperCase())}</span><span class="res">${esc(u.def.resource.short)} ${Math.round(u.res)}/${
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
    panel.innerHTML = `<div class="title"><span>${esc(kind === 'skills' ? u.name.toUpperCase() + ' — SKILLS' : 'TEAM BAG')}</span><span>${
      kind === 'skills' ? esc(u.def.resource.name + ' ' + Math.round(u.res) + '/' + u.resMax) : b.credits + ' CREDITS'
    }</span></div><div class="list"></div><div class="desc"></div>`;
    const list = $('.list', panel);
    const desc = $('.desc', panel);
    if (kind === 'skills' && entries.length <= 5) list.classList.add('one');
    panel.classList.add('show');
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
        hint.textContent = `${e.name} — ${b.healthState(e).id}, ANGER ${Math.round(e.anger)}.`;
        enemyWrap.classList.add('targeted');
        const [bx, by] = enemyPoint('body');
        showCursor(bx - 170, by - 5);
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
        const [x, y] = BADGE_XY[slotOf(c.id)];
        showCursor(x + 130, y - 44, true);
        hint.textContent = c.dead ? `${c.name}’s body.` : `${c.name} — ${b.healthState(c).id}.`;
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

  // ------------------------------------------------------------------ SlashCo paperwork (overlays)
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
  function docHead(kind, ref) {
    return `<div class="doc-head"><span class="brand">SLASHCO</span><span class="kind">${esc(kind)}</span><span class="ref">${esc(ref)}</span></div>`;
  }
  function dangerHtml(S) {
    return `<span class="dlvl" data-level="${DANGER[S.danger] || 1}"><i></i><i></i><i></i><b>${esc(S.danger)}</b></span>`;
  }

  function lineupHtml() {
    const party = SC.DATA.party
      .map((id) => `<figure><span data-p="${id}"></span><figcaption>${esc(SC.DATA.workers[id].name.toUpperCase())}</figcaption></figure>`)
      .join('');
    const S = enemyDef();
    return `<div class="lineup">${party}<span class="vs">VS</span><figure class="foe"><span data-p="${enemyId()}" data-foe="1"></span><figcaption>${esc(
      S.title
    )}</figcaption></figure></div>`;
  }
  function fillLineup(o) {
    o.querySelectorAll('[data-p]').forEach((s) => {
      const id = s.dataset.p;
      let look;
      if (s.dataset.foe) look = id === 'sid' ? { id, variant: 'sid_armed', mood: 'slasher', fx: [] } : { id, mood: 'umbra', fx: [] };
      else look = { id, mood: SC.DATA.workers[id].ghost ? 'ghost' : 'neutral', fx: [] };
      const c = SC.Art.card(look).toCanvas();
      c.className = 'px';
      s.replaceWith(c);
    });
  }

  // `scroll`: an element the up/down keys scroll instead.
  function waitChoice(o, buttons, initial, scroll) {
    return new Promise((resolve) => {
      const btns = buttons.map((sel) => $(sel, o));
      const opts = btns.map((b) => ({ el: b, enabled: true }));
      choose({ opts, columns: opts.length, back: false, initial, scroll, noCursor: true }).then((i) => resolve(i));
    });
  }

  // The field manual: the rules every fight shares, plus the chosen slasher's own.
  const HELP_FOE = {
    trollge: `
      <p><b>TROLLGE ONLY SEES WHAT MOVES.</b> When it stares at someone (<b>STARED AT</b>), anything but GUARD counts as moving: they become <b>SEEN</b> and it gets angrier. It can only <b>Scratch</b>, which hits very hard, someone who is SEEN. Its claws mostly miss whoever hasn't moved yet this turn, or is guarding, and every claw hit can leave you AFRAID.</p>
      <p><b>ANGER</b> is on SLASHERBOY's file, top right. At <b>80</b>, <b>Slow Walker, Fast Runner</b>: its speed jumps from 12 to 77, it moves first <i>and</i> comes back around after everyone, it marks someone SEEN every turn, and it's much harder to outrun. Get out before that, or hold on.</p>
      <p><b>READ ITS NEXT MOVE.</b> John's Hyperceptive flags the badge it goes for: <b>STARE</b>, <b>SCRATCH</b> or <b>TARGET</b>. Captain Jim's Confidential Documents say how hard. GUARD, heal first, or set a Bear Trap. Mysti's Tactical Stab is extremely effective against Trollge.</p>`,
    sid: `
      <p><b>ANGER</b> is on SLASHERBOY's file, top right. It rises every turn and whenever Sid gets hurt. From <b>60</b> he follows up with a second attack every turn. At <b>80</b> he draws his Desert Eagle, can't eat cookies to calm down anymore, and hits much harder. Anyone eating a <b>Cookie</b> makes him angrier (METH Addict).</p>
      <p><b>READ HIS NEXT MOVE.</b> John's Hyperceptive flags the badge Sid will hit first (<b>TARGET</b>). Captain Jim's Confidential Documents say how hard. GUARD the target, heal them first, or have Captain Jim put a Bear Trap at their feet.</p>`,
  };
  function helpHtml() {
    const has = (id) => SC.DATA.party.includes(id);
    return `
    <div class="help">
      <p><b>ASSIGNMENT.</b> You can't kill a slasher. Weaken it until SLASHERBOY reads <b>WEAKENED</b>, then hit <b>ESCAPE</b> on the field console. The <b>EXTRACTION</b> gauge above it shows your odds of getting out (click it for the breakdown).</p>
      <p><b>NOBODY GETS LEFT BEHIND.</b> If a worker dies, a living worker has to <b>CARRY</b> the body before anyone can run. Carrying slows the carrier and lowers the odds.${
        has('purpl')
          ? " Purpl Lady is a ghost: she can't carry anyone, but once the slasher is weakened she <b>POSSESSES</b> a body so it walks out on its own."
          : ''
      }</p>
      ${HELP_FOE[enemyId()] || ''}
      ${
        has('mysti')
          ? '<p><b>MYSTI.</b> <b>First Responder</b> patches up each teammate the first time they drop to CRITICAL. Her <b>DEATHWARD</b> (in the bag) keeps the whole team from dying for 3 turns. Her uniform gives her +10% to everything while she is <b>NEUTRAL</b> (not AFRAID, CONFUSED or HAPPY).</p>'
          : ''
      }
      <p><b>THE HELI.</b> Captain Jim's Helicopter Escape lands after 5 turns and gets everyone out, bodies included, as long as someone who can carry a body is still alive.</p>
      <p><b>BADGES.</b> HEALTH is a condition, not a number: CRITICAL, HURT, SCATHED, STABLE, OK, SATED, OVERSATED (the gold stripe is health over 100%). The battery is STAMINA, which pays for skills.</p>
      <p><b>GENERATOR CHECKS.</b> Mel's <b>Fuel</b> check: the needle drifts, so hold Q / ← or E / → (or press and hold a side of the panel) to keep it out of the red until the timer runs out. John's <b>Battery</b> check: press Z / Space, or tap, when the clamps line up with the terminals, or the generator shocks him.</p>
      <p><b>CONTROLS.</b> Arrows / WASD move · Z, Enter, Space confirm · X, Esc back · L radio log · F fast text · M mute. Mouse and touch work everywhere.</p>
    </div>`;
  }

  function showHelp() {
    return new Promise((resolve) => {
      const o = overlay(
        'help',
        '',
        `<div class="box">${docHead('FIELD MANUAL', 'REV. 3')}${helpHtml()}<button class="go primary" id="help-ok">GOT IT</button></div>`
      );
      waitChoice(o, ['#help-ok'], 0, $('.help', o)).then(() => {
        closeOverlay('help');
        resolve();
      });
    });
  }

  async function title() {
    UI.phase = 'title';
    let at = 0;
    for (;;) {
      const S = enemyDef();
      const o = overlay(
        'screen',
        'title',
        `<div class="box">
          ${docHead('ASSIGNMENT BRIEFING', 'SLASHCO VR · TURN-BASED BATTLE')}
          <h1>WEAKEN IT. THEN RUN.</h1>
          <h2>PERSONNEL ASSIGNED</h2>
          ${lineupHtml()}
          <div class="file-line"><span>SLASHER: ${esc(S.title)}</span><span>CLASS: ${esc(S.class)}</span>${dangerHtml(S)}</div>
          <p>Weaken ${esc(S.name)}, then get out. Nobody gets left behind.</p>
          <button class="go primary" id="t-start">DEPLOY</button><button class="go foe" id="t-foe">SLASHER ▸</button><button class="go" id="t-help">FIELD MANUAL</button>
          <div class="keys">Z / Enter: confirm · X / Esc: back · Arrows: move · F: fast text · M: mute</div>
        </div>`
      );
      fillLineup(o);
      at = await waitChoice(o, ['#t-start', '#t-foe', '#t-help'], at);
      if (SC.Audio) SC.Audio.unlock();
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
      closeOverlay('screen');
      await showHelp();
    }
  }

  async function showEnd(b) {
    UI.phase = 'end';
    const win = b.outcome === 'win';
    sfx(win ? 'win' : 'lose');
    const lost = b.party.filter((u) => u.dead).map((u) => u.name);
    const o = overlay(
      'screen',
      win ? 'win' : 'lose',
      `<div class="box">
        ${docHead('EXTRACTION REPORT', 'TURN ' + b.turn)}
        <h1>${win ? 'EXTRACTION SUCCESSFUL' : 'ASSIGNMENT FAILED'}</h1>
        <h2>${win ? `A SUCCESSFUL ESCAPE! ${esc(b.partyNames().toUpperCase())} WIN!` : `${esc(b.enemyDef.title)} GOT EVERYONE WHO COULD CARRY A BODY.`}</h2>
        <div class="stats">
          <span>Turns</span><span>${b.turn}</span>
          <span>Credits earned</span><span>${b.credits}</span>
          ${win ? `<span>EXP earned${b.secrets ? ' (Hidden Documents: +50%)' : ''}</span><span>${b.exp}</span>` : ''}
          <span>Damage dealt to ${esc(b.en)}</span><span>${b.stats.damageDealt}</span>
          <span>Personnel lost</span><span>${lost.length ? esc(lost.join(', ')) : 'None'}</span>
          <span>Escape attempts</span><span>${b.stats.runs}</span>
          <span>${esc(b.en)}'s ANGER at the end</span><span>${Math.round(b.enemy.anger)}</span>
        </div>
        <button class="go primary" id="e-again">REDEPLOY</button><button class="go" id="e-log">RADIO LOG</button>
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
        `<div class="box">${docHead('RADIO LOG', 'FIELD RADIO · CH 04')}<div class="scroll">${Log.history
          .map((l) => `<div class="line ${esc(l.tone)}">${colorize(l.text)}</div>`)
          .join('')}</div><button class="go primary" id="h-close">CLOSE</button></div>`
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

  // The camera's clock: the middle of the night, counting up.
  function tickClock(now) {
    const s = 3 * 3600 + 13 * 60 + Math.floor((now - clockStart) / 1000);
    const two = (n) => String(n).padStart(2, '0');
    const text = `${two(Math.floor(s / 3600) % 24)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
    const c = $('#cam-clock');
    if (c.textContent !== text) c.textContent = text;
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

    SC.Art.hallway().toCanvas($('#bg'));
    for (const id of SC.DATA.party) buildCard(id);
    buildPlate();
    $('#escape .icon').appendChild(iconCanvas('heli', 2));
    try {
      const saved = root.localStorage.getItem('sc-enemy');
      if (SC.DATA.enemies.includes(saved)) UI.enemy = saved;
    } catch (e) {
      /* convenience only */
    }
    placeEnemy();

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
    // portraits, the camera clock, flickering lights.
    let last = 0;
    clockStart = performance.now();
    const loop = (now) => {
      if (now - last > 110) {
        last = now;
        UI.frame++;
        view().draw(now);
        tickClock(now);
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
    clockStart = performance.now();
    placeEnemy();
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
