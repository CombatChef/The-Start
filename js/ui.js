/*
 * SLASHCO VR — TURN-BASED BATTLE
 * ui.js — the OMORI-style HUD: corner cards, battle log, escape bar, FIGHT!/RUN...,
 * action menus, targeting, the skill-check mini-game, and every animation.
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

  const SLOT = { mel: 'tl', john: 'tr', purpl: 'bl', sid: 'br' };
  const CARD_XY = { tl: [28, 8], tr: [1024, 8], bl: [28, 608], br: [1024, 608] };
  const SID_BOX = { left: 450, top: 178, scale: 2 };

  const UI = {
    battle: null,
    fast: false,
    cards: {},
    frame: 0,
    phase: 'boot', // boot | title | command | resolving | end — handy for tests
  };
  SC.UI = UI;

  let stage;
  let fxLayer;
  let flashEl;
  let sidWrap;
  let sidCanvas;
  let command;
  let panel;
  let escapeEl;
  let hand;

  function cardCenter(id) {
    const [x, y] = CARD_XY[SLOT[id]];
    return [x + 114, y + 152];
  }
  function sidPoint(name) {
    const p = SC.Art.SID_POINTS[name];
    return [SID_BOX.left + p[0] * SID_BOX.scale, SID_BOX.top + p[1] * SID_BOX.scale];
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
    const s = Math.min(root.innerWidth / 1280, root.innerHeight / 960);
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

  // ------------------------------------------------------------------ battle log
  function colorize(text) {
    return esc(text).replace(/\b(Purpl Lady|Mel|John|Sid)\b/g, (m) => {
      const id = m === 'Purpl Lady' ? 'purpl' : m.toLowerCase();
      return `<b class="n-${id}">${m}</b>`;
    });
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

  // ------------------------------------------------------------------ cards
  function iconCanvas(name, scale) {
    const px = SC.Art.icon(name);
    const c = px.toCanvas();
    c.className = 'px';
    c.style.width = px.w * scale + 'px';
    c.style.height = px.h * scale + 'px';
    return c;
  }

  function buildCard(id, enemy) {
    const r = el('div', 'card' + (enemy ? ' enemy' : ''));
    r.dataset.slot = SLOT[id];
    r.id = 'card-' + id;
    r.innerHTML = `
      <div class="frame"></div>
      <div class="head"></div>
      <div class="portrait"><canvas class="px" width="128" height="128"></canvas><div class="tags"></div></div>
      <div class="bar heart"><div class="icon"></div><div class="pill"><div class="fill"></div><div class="over"></div><div class="txt"></div></div></div>
      <div class="bar juice"><div class="icon"></div><div class="pill"><div class="fill"></div><div class="txt"></div></div></div>
      <div class="intent"></div>`;
    $('.bar.heart .icon', r).appendChild(iconCanvas('heart', 3));
    $('.bar.juice .icon', r).appendChild(iconCanvas(enemy ? 'anger' : 'drop', 3));
    stage.insertBefore(r, $('#fx')); // above the scene, below effects and menus
    const c = {
      root: r,
      head: $('.head', r),
      canvas: $('.portrait canvas', r),
      tags: $('.tags', r),
      heartFill: $('.bar.heart .fill', r),
      heartOver: $('.bar.heart .over', r),
      heartTxt: $('.bar.heart .txt', r),
      juiceFill: $('.bar.juice .fill', r),
      juiceTxt: $('.bar.juice .txt', r),
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
      }
    }
    if (u.possessed) {
      mood = 'ghost';
      fade = 0.8;
    }
    return { id: u.id, variant, mood, fx: unique(fx), fade, bloodAmount: u.dead ? 7 : 4 };
  }

  function sidLook(b) {
    const s = b.enemy;
    const fx = [];
    let mood = 'slasher';
    if (s.anger >= b.sidDef.anger.overflow) mood = 'furious';
    if (s.status.chilled) mood = 'frozen';
    if (s.status.stunned) fx.push('stars');
    if (s.status.confused) fx.push('swirl');
    if (s.anger >= 50) fx.push('veins');
    if (s.status.bleed) fx.push('blood');
    if (s.hasBuff('jumboCookie')) fx.push('cookie');
    return { id: 'sid', variant: s.flags.gun ? 'sid_armed' : 'sid', mood, fx, bloodAmount: 3 };
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
    if (u.flags.guarding) tags.push({ t: u.flags.barrier ? 'BARRIER' : 'GUARD', c: 'good' });
    if (u.status.asleep) tags.push({ t: 'ASLEEP', c: 'info' });
    if (u.status.phasing) tags.push({ t: 'PHASING', c: 'info' });
    if (u.status.afraid) tags.push({ t: 'AFRAID', c: 'bad' });
    if (u.status.confused) tags.push({ t: 'CONFUSED', c: 'bad' });
    if (u.status.poison) tags.push({ t: 'URANIUM', c: 'bad' });
    if (u.status.balkan) tags.push({ t: u.status.balkan.phase === 'pending' ? 'BALKAN...' : 'BALKAN!', c: 'good' });
    if (u.flags.glassesOff) tags.push({ t: 'NO GLASSES', c: 'bad' });
    if (u.flags.lunch) tags.push({ t: 'LUNCH BOX...', c: 'info' });
    for (const id of u.carrying) tags.push({ t: 'CARRYING ' + b.unit(id).name.toUpperCase(), c: 'info' });
    if (u.ghost && u.res <= 0 && !u.status.phasing) tags.push({ t: 'DRAINED', c: 'bad' });
    if (u.ghost && b.foresightTurns > 0) tags.push({ t: 'FORESIGHT', c: 'info' });
    return tags.concat(buffTags(b, u)).slice(0, 5);
  }

  function sidTags(b) {
    const s = b.enemy;
    const tags = [];
    if (s.status.stunned) tags.push({ t: 'CAN’T MOVE', c: 'good' });
    if (s.flags.gun) tags.push({ t: 'DESERT EAGLE', c: 'bad' });
    if (s.status.bleed) tags.push({ t: 'BLEEDING', c: 'good' });
    if (s.status.shards) tags.push({ t: 'GLASS', c: 'good' });
    if (s.status.chilled) tags.push({ t: 'FREEZING', c: 'good' });
    if (s.status.confused) tags.push({ t: 'CONFUSED', c: 'good' });
    if (s.status.blind) tags.push({ t: 'BLIND', c: 'good' });
    if (s.flags.deagleFocus) tags.push({ t: 'AIMING', c: 'bad' });
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
    if ((k === 'melee' || k === 'gun') && b.intent.targetId === u.id) return word || 'TARGET';
    if (k === 'magdump' && !u.dead && !u.status.phasing) return word || 'ALL';
    if (k === 'claims' && !u.dead && !u.status.phasing) return 'RAMBLE';
    return null;
  }

  function refresh() {
    const b = UI.battle;
    if (!b) return;
    for (const u of b.party) {
      const c = UI.cards[u.id];
      c.head.textContent = u.name.toUpperCase();
      const hs = b.healthState(u).id;
      if (u.ghost) {
        c.heartFill.style.width = '100%';
        c.heartFill.style.backgroundColor = '#9a7fd1';
        c.heartOver.style.width = '0';
        c.heartTxt.textContent = 'NONE';
      } else {
        c.heartFill.style.width = Math.max(0, Math.min(100, u.hp)) + '%';
        c.heartOver.style.width = Math.max(0, Math.min(100, ((u.hp - 100) / 50) * 100)) + '%';
        c.heartTxt.textContent = hs;
      }
      c.juiceFill.style.width = (u.res / u.resMax) * 100 + '%';
      c.juiceTxt.textContent = `${Math.round(u.res)}/${u.resMax}`;
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
    const c = UI.cards.sid;
    c.head.textContent = 'SID';
    c.heartFill.style.width = (s.hp / s.maxHp) * 100 + '%';
    c.heartTxt.textContent = b.healthState(s).id;
    c.juiceFill.style.width = (s.anger / b.sidDef.anger.max) * 100 + '%';
    c.juiceTxt.textContent = 'ANGER ' + Math.round(s.anger);
    setTags(c, sidTags(b));
    drawPortrait(c, sidLook(b));
    sidWrap.classList.toggle('rage', s.anger >= b.sidDef.anger.overflow && !s.status.chilled);
    sidWrap.classList.toggle('chilled', !!s.status.chilled);
    $('#turn-chip').textContent = 'TURN ' + Math.max(1, b.turn);
    $('#credits-chip').textContent = 'CREDITS ' + b.credits;
    updateEscape();
  }

  function updateEscape(flashReason) {
    const b = UI.battle;
    if (!b) return;
    const e = b.escapeChance();
    escapeEl.classList.toggle('blocked', e.blocked);
    escapeEl.classList.toggle('ready', !e.blocked && e.chance >= 50);
    $('.fill', escapeEl).style.width = (e.blocked ? 0 : e.chance) + '%';
    $('.pct', escapeEl).textContent = e.blocked ? '--' : e.chance + '%';
    $('.label', escapeEl).textContent = flashReason || (e.blocked ? e.short || 'NO WAY OUT' : b.enemy.flags.weakened ? 'SID IS WEAKENED — RUN!' : 'ESCAPE CHANCE');
    const sub = $('#command .banner.run .sub');
    if (sub) {
      sub.textContent = e.blocked ? e.short || 'BLOCKED' : e.chance + '% TO ESCAPE';
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
      '<div class="row"><span>How the escape chance adds up:</span><span></span></div>' +
      e.parts
        .map(([k, v]) => {
          const r = Math.round(v);
          return `<div class="row"><span>${esc(k)}</span><span class="v ${r < 0 ? 'neg' : 'pos'}">${r > 0 ? '+' : ''}${r}%</span></div>`;
        })
        .join('') +
      `<div class="row"><span>Total (max 95%)</span><span class="v pos">${e.chance}%</span></div>`;
  }

  // ------------------------------------------------------------------ Sid sprite
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
      else if (s && s.flags.gun) pose = 'gun';
      if (this.override && now < this.until) pose = this.override;
      const px = SC.Art.sid({
        pose,
        breathe: this.breathe,
        pupils: this.pupils,
        angry: !!s && s.anger >= (b ? b.sidDef.anger.overflow : 80),
        frame: UI.frame,
      });
      px.toCanvas(sidCanvas);
      if (force) sidCanvas.dataset.pose = pose;
    },
  };

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
    if (id === 'sid') return sidPoint('body');
    return cardCenter(id);
  }

  async function fx(e) {
    const b = UI.battle;
    const card = (id) => UI.cards[id] && UI.cards[id].root;
    switch (e.type) {
      case 'hitSid': {
        refresh();
        pulse(sidWrap, 'hit', 280);
        pulse(sidWrap, 'flash', 110);
        const [x, y] = sidPoint('body');
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
      case 'guard':
        refresh();
        pulse(card(e.target), 'shield', 450);
        return T(150);
      case 'sidAttack': {
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
        const [tx, ty] = cardCenter(e.target);
        sidWrap.style.translate = `${(tx - 640) * 0.14}px ${(ty - 430) * 0.08}px`;
        if (e.kind === 'gun') {
          const [mx, my] = sidPoint('muzzle');
          muzzle(mx, my);
          sfx('gun');
        } else sfx('growl');
        await T(170);
        sidWrap.style.translate = '';
        return T(90);
      }
      case 'shot': {
        const [mx, my] = sidPoint('muzzle');
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
        pulse(sidWrap, 'hit', 280);
        sfx('zap');
        return T(420);
      }
      case 'shockSelf':
        pulse(card(e.target), 'shield', 450);
        sfx('zap');
        return T(320);
      case 'status': {
        const [x, y] = posOf(e.target);
        pop(x, y - (e.target === 'sid' ? 150 : 90), e.text, 'status', 900);
        sfx('debuff');
        return T(240);
      }
      case 'credits': {
        refresh();
        pop(470, 215, `+${e.amount} CREDITS`, 'status', 1000);
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
        const [x1, y1] = sidPoint('head');
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
          pulse(UI.cards.sid.root, 'hit', 320);
        }
        return undefined;
      case 'turn':
        refresh();
        sfx('tick');
        return undefined;
      case 'sidPose':
        refresh();
        SidView.draw(performance.now(), true);
        return undefined;
      default:
        refresh();
        return undefined;
    }
  }

  // ------------------------------------------------------------------ skill check
  function skillCheck(o) {
    return new Promise((resolve) => {
      const box = $('#skillcheck');
      const verb = o.kind === 'fuel' ? `${o.name} is pouring fuel into the generator.` : `${o.name} is slotting a battery into the generator.`;
      box.innerHTML = `
        <div class="t">${esc(o.title)}</div>
        <div class="s">${esc(verb)} Press Z / SPACE or tap when the needle is in the green!${o.moralSupport ? '<br>Purpl Lady’s Moral Support makes it easier.' : ''}</div>
        <div class="track"><div class="zone"></div><div class="needle"></div></div>
        <div class="timer"></div>
        <div class="res">GET READY…</div>`;
      const zone = $('.zone', box);
      const needle = $('.needle', box);
      const timer = $('.timer', box);
      const res = $('.res', box);
      const start = 0.14 + Math.random() * Math.max(0, 0.86 - o.zone - 0.14);
      zone.style.left = start * 100 + '%';
      zone.style.width = o.zone * 100 + '%';
      needle.style.left = '0%';
      box.classList.add('show');
      const lead = UI.fast ? 250 : 550;
      const t0 = performance.now() + lead;
      let done = false;
      const at = (t) => {
        const ph = (Math.max(0, t) / o.sweepMs) % 2;
        return ph < 1 ? ph : 2 - ph;
      };
      function frame(now) {
        if (done) return;
        const t = now - t0;
        if (t >= 0 && res.textContent) res.textContent = '';
        needle.style.left = at(t) * 100 + '%';
        timer.style.transform = `scaleX(${Math.max(0, Math.min(1, 1 - t / o.timeLimitMs))})`;
        if (t >= o.timeLimitMs) return finish(false, 'TOO SLOW…');
        root.requestAnimationFrame(frame);
        return undefined;
      }
      function press() {
        if (done) return;
        const t = performance.now() - t0;
        if (t < 0) return; // not started yet
        const p = at(t);
        finish(p >= start && p <= start + o.zone);
      }
      function finish(ok, msg) {
        done = true;
        Input.remove(handler);
        stage.removeEventListener('pointerdown', onPointer, true);
        res.textContent = ok ? 'SUCCESS!' : msg || 'MISSED!';
        res.className = 'res ' + (ok ? 'ok' : 'no');
        sfx(ok ? 'success' : 'fail');
        setTimeout(() => {
          box.classList.remove('show');
          resolve(ok);
        }, UI.fast ? 350 : 700);
      }
      const onPointer = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        press();
      };
      const handler = Input.push({ key: (k) => k === 'ok' && press() });
      stage.addEventListener('pointerdown', onPointer, true);
      root.requestAnimationFrame(frame);
    });
  }

  // ------------------------------------------------------------------ menus
  let handSrc = null;
  function showHand(x, y, down) {
    if (!handSrc) {
      handSrc = iconCanvas('hand', 3);
      hand.appendChild(handSrc);
    }
    hand.style.display = 'block';
    hand.classList.toggle('down', !!down);
    hand.style.left = x + 'px';
    hand.style.top = y + 'px';
  }
  function hideHand() {
    hand.style.display = 'none';
  }
  function handAt(elem) {
    const r = stageRect(elem);
    showHand(r.x - 4, r.y + r.h / 2 - 13);
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
        handAt(opts[i].el);
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
        hideHand();
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
          if (k === 'up') move(-cols);
          else if (k === 'down') move(cols);
          else if (k === 'left' && cols > 1 && i % cols > 0) move(-1);
          else if (k === 'right' && cols > 1 && i % cols < cols - 1) move(1);
          else if (k === 'left' && cols === 1 && o.leftRight) move(-1);
          else if (k === 'right' && cols === 1 && o.leftRight) move(1);
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

  let bannerCache = null;
  function bannerCanvas(kind) {
    bannerCache = bannerCache || { fight: SC.Art.banner('fight'), run: SC.Art.banner('run') };
    const c = bannerCache[kind].toCanvas();
    c.className = 'px';
    return c;
  }

  function drawRoot(idle) {
    const b = UI.battle;
    command.innerHTML = '';
    const fight = el('button', 'banner fight' + (idle ? ' off' : ''));
    fight.appendChild(bannerCanvas('fight'));
    fight.appendChild(el('div', 'word', 'FIGHT!'));
    const run = el('button', 'banner run' + (idle ? ' off' : ''));
    run.appendChild(bannerCanvas('run'));
    run.appendChild(el('div', 'word', 'RUN...'));
    if (b) {
      const e = b.escapeChance();
      run.appendChild(el('div', 'sub', e.blocked ? esc(e.short || 'BLOCKED') : e.chance + '% TO ESCAPE'));
      if (e.blocked) run.classList.add('disabled');
    }
    command.appendChild(fight);
    command.appendChild(run);
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
    attack: (b, u) =>
      u.ghost ? `HEX — ${u.def.weapon.name}: no damage, a random debuff on Sid.` : `${u.def.weapon.name}: ${u.def.weapon.hits} hits (the 2nd is less accurate).`,
    skills: (b, u) => `Use a skill. Costs ${u.def.resource.name}.`,
    items: () => 'Use something from the team bag.',
    guard: (b, u) =>
      u.ghost ? 'FOCUS — gather SPIRIT (+20). Keeps Freaky Doctor running.' : 'Take half damage this turn, recover 20 STAMINA. Acts first.',
    carry: () => 'Pick up a dead ally so the team can escape. Slows the carrier.',
    back: () => 'Go back.',
  };

  async function actionMenu(b, u, first) {
    command.innerHTML = '';
    const menu = el('div', 'menu');
    menu.innerHTML = `<div class="who"><span>${esc(u.name.toUpperCase())}</span><span class="res">${u.def.resource.name} ${Math.round(u.res)}/${u.resMax}</span></div><div class="grid"></div><div class="hint"></div>`;
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
      columns: 3,
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
      kind === 'skills' ? esc(u.def.resource.name + ' ' + Math.round(u.res) + '/' + u.resMax) : 'CREDITS ' + b.credits
    }</span></div><div class="list"></div><div class="desc"></div>`;
    const list = $('.list', panel);
    const desc = $('.desc', panel);
    if (kind === 'skills') list.classList.add('one');
    panel.classList.add('show');
    const opts = entries.map((x) => {
      const right = kind === 'skills' ? `${x.cost} ${x.resource}` : x.count == null ? '' : 'x' + x.count;
      const e = el('button', 'opt' + (x.enabled ? '' : ' disabled'), `<span>${esc(x.name)}</span><span class="cost">${esc(right)}</span>`);
      list.appendChild(e);
      return { el: e, enabled: x.enabled, x };
    });
    const show = (op) => {
      const x = op.x;
      desc.innerHTML =
        `<div class="doc">${esc(x.doc || '')}</div>` +
        `<div class="rules">${esc(x.rules || '')}</div>` +
        (x.enabled ? '' : `<div class="why">${esc(x.reason || '')}</div>`);
    };
    const idx = await choose({ opts, columns: kind === 'skills' ? 1 : 2, onHighlight: show, onDenied: show });
    panel.classList.remove('show');
    return idx == null ? null : entries[idx];
  }

  function prompt(text) {
    command.innerHTML = '';
    const menu = el('div', 'menu');
    menu.innerHTML = `<div class="who"><span>${esc(text)}</span><span class="res">Z: OK · X: BACK</span></div><div class="hint"></div>`;
    command.appendChild(menu);
    return $('.hint', menu);
  }

  function pickTarget(b, kind, u, title) {
    const cands = b.targetsFor(kind, u);
    if (!cands.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      if (kind === 'enemy') {
        const hint = prompt(title || 'TARGET: SID');
        hint.textContent = `Sid — ${b.healthState(b.enemy).id}, ANGER ${Math.round(b.enemy.anger)}.`;
        sidWrap.classList.add('targeted');
        const [hx, hy] = sidPoint('head');
        showHand(hx - 24, hy - 110, true);
        const done = (v) => {
          Input.remove(handler);
          sidWrap.classList.remove('targeted');
          sidWrap.onclick = null;
          hideHand();
          resolve(v);
        };
        const handler = Input.push({
          key(k) {
            if (k === 'ok') {
              sfx('select');
              done('sid');
            } else if (k === 'back') {
              sfx('cancel');
              done(null);
            }
          },
        });
        sidWrap.onclick = (ev) => {
          ev.stopPropagation();
          sfx('select');
          done('sid');
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
        const [x, y] = CARD_XY[SLOT[c.id]];
        showHand(x - 46, y + 150);
        hint.textContent = c.dead ? `${c.name}’s body.` : `${c.name} — ${b.healthState(c).id}.`;
      };
      const done = (v) => {
        Input.remove(handler);
        cands.forEach((c) => UI.cards[c.id].root.classList.remove('pick'));
        hideHand();
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
        const t = await pickTarget(b, 'enemy', u, u.ghost ? 'HEX: SID?' : 'ATTACK: SID?');
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
          const t = await pickTarget(b, sk.target, u, sk.name.toUpperCase());
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
      UI.cards[k].root.classList.toggle('dim', !!id && k !== id && k !== 'sid');
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

  // ------------------------------------------------------------------ overlays
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

  function lineupHtml() {
    return '<div class="lineup"><span data-p="mel"></span><span data-p="john"></span><span data-p="purpl"></span><span class="vs">VS</span><span data-p="sid"></span></div>';
  }
  function fillLineup(o) {
    o.querySelectorAll('[data-p]').forEach((s) => {
      const id = s.dataset.p;
      const look = id === 'sid' ? { id, variant: 'sid_armed', mood: 'slasher', fx: [] } : { id, mood: id === 'purpl' ? 'ghost' : 'neutral', fx: [] };
      const c = SC.Art.card(look).toCanvas();
      c.className = 'px';
      s.replaceWith(c);
    });
  }

  function waitChoice(o, buttons) {
    return new Promise((resolve) => {
      const btns = buttons.map((sel) => $(sel, o));
      const opts = btns.map((b) => ({ el: b, enabled: true }));
      choose({ opts, columns: opts.length, back: false }).then((i) => resolve(i));
    });
  }

  const HELP = `
    <div class="help">
      <p><b>GOAL.</b> You can't kill a slasher. Weaken Sid until his bar reads <b>WEAKENED</b>, then pick <b>RUN...</b>. The bar above the buttons shows your odds of getting away (click it for the breakdown).</p>
      <p><b>NOBODY GETS LEFT BEHIND.</b> If a worker dies, a living worker has to <b>CARRY</b> the body before anyone can run. Carrying slows the carrier and lowers the escape chance. Purpl Lady is a ghost: she can't carry anyone, but once Sid is weakened she <b>POSSESSES</b> a body so it walks out on its own.</p>
      <p><b>ANGER.</b> Sid's second bar. It rises every turn and whenever he gets hurt. At <b>80</b> he draws his Desert Eagle, can't eat cookies to calm down anymore, and hits much harder. Anyone eating a <b>Cookie</b> makes him angrier (METH Addict).</p>
      <p><b>READ HIS NEXT MOVE.</b> John's Hyperceptive marks who Sid will hit (<b>TARGET</b>). Purpl Lady's Foresight says how hard. GUARD the target, or heal them first.</p>
      <p><b>HEALTH</b> is shown as condition, not numbers: CRITICAL, HURT, SCATHED, STABLE, OK, SATED, OVERSATED. The gold stripe is health above 100%.</p>
      <p><b>SKILL CHECKS</b> (Mel's Fuel, John's Battery): press Z / Space, or tap, while the needle is in the green.</p>
      <p><b>CONTROLS.</b> Arrows / WASD move · Z, Enter, Space confirm · X, Esc back · F fast text · M mute. Mouse and touch work everywhere.</p>
    </div>`;

  function showHelp() {
    return new Promise((resolve) => {
      const o = overlay('help', '', `<div class="box"><h2>HOW TO PLAY</h2>${HELP}<button class="go" id="help-ok">GOT IT</button></div>`);
      waitChoice(o, ['#help-ok']).then(() => {
        closeOverlay('help');
        resolve();
      });
    });
  }

  async function title() {
    UI.phase = 'title';
    for (;;) {
      const o = overlay(
        'screen',
        'title',
        `<div class="box">
          <h1>SLASHCO <span class="red">VR</span></h1>
          <h2>TURN-BASED BATTLE</h2>
          ${lineupHtml()}
          <p>Weaken Sid, then run for it. Nobody gets left behind.</p>
          <button class="go" id="t-start">START</button><button class="go alt" id="t-help">HOW TO PLAY</button>
          <div class="keys">Z / Enter: confirm · X / Esc: back · Arrows: move · F: fast text · M: mute</div>
        </div>`
      );
      fillLineup(o);
      const i = await waitChoice(o, ['#t-start', '#t-help']);
      if (SC.Audio) SC.Audio.unlock();
      if (i === 0) {
        closeOverlay('screen');
        return;
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
        <h1>${win ? 'YOU ESCAPED!' : 'NO ONE MADE IT OUT…'}</h1>
        <h2>${win ? `A SUCCESSFUL ESCAPE! ${esc(b.partyNames().toUpperCase())} WIN!` : 'SID GOT EVERYONE WHO COULD CARRY A BODY.'}</h2>
        <div class="stats">
          <span>Turns</span><span>${b.turn}</span>
          <span>Credits earned</span><span>${b.credits}</span>
          <span>Damage dealt to Sid</span><span>${b.stats.damageDealt}</span>
          <span>Workers lost</span><span>${lost.length ? esc(lost.join(', ')) : 'None'}</span>
          <span>Escape attempts</span><span>${b.stats.runs}</span>
          <span>Sid's ANGER at the end</span><span>${Math.round(b.enemy.anger)}</span>
        </div>
        <button class="go" id="e-again">${win ? 'PLAY AGAIN' : 'TRY AGAIN'}</button><button class="go alt" id="e-log">BATTLE LOG</button>
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
        `<div class="box"><h2>BATTLE LOG</h2><div class="scroll">${Log.history
          .map((l) => `<div class="line ${esc(l.tone)}">${colorize(l.text)}</div>`)
          .join('')}</div><button class="go" id="h-close">CLOSE</button></div>`
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
    sidWrap = $('#sid-wrap');
    sidCanvas = $('#sid');
    command = $('#command');
    panel = $('#panel');
    escapeEl = $('#escape');
    hand = $('#hand');
    UI.lastAction = {};

    fit();
    root.addEventListener('resize', fit);
    doc.addEventListener('keydown', onKey);

    SC.Art.hallway().toCanvas($('#bg'));
    for (const id of ['mel', 'john', 'purpl']) buildCard(id, false);
    const sc = buildCard('sid', true);
    addNotch($('.bar.heart .pill', sc.root), SC.DATA.slashers.sid.weakenedAt, 'Weakened');
    addNotch($('.bar.juice .pill', sc.root), SC.DATA.slashers.sid.anger.overflow / SC.DATA.slashers.sid.anger.max, 'Desert Eagle');

    $('#log').addEventListener('click', () => {
      Log.skip = true;
    });
    $('#log-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!Input.top() || !Input.top().modal) showHistory();
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

    // Animation loop: Sid's wandering eyes and breathing, animated portraits, lights.
    let last = 0;
    const loop = (now) => {
      if (now - last > 110) {
        last = now;
        UI.frame++;
        SidView.draw(now);
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
