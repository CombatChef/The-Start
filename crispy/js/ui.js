/*
 * The HUD and the flow of the fight: the commands (FIGHT, SKILL, ACT, ITEM, MERCY) and their
 * menus in the battle box, Crispy's box (his portrait, and his health shown as on SlashCo VR's
 * HUD: a coloured word under a heart), the creature's box, and playing out each turn's events:
 * the log, the effects, the hits.
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const DATA = window.CRISPY_DATA;
  const S = () => window.SCENE;
  const C = () => window.CREATURE;
  const A = () => window.AUDIO;
  // ?fast plays everything quicker (for testing)
  const SPEED = /[?&]fast/.test(location.search) ? 0.15 : 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));

  // A heart for his health, a skull and crossbones when he's CRITICAL, as on SlashCo VR's HUD,
  // in pixels.
  const pixels = (rows) =>
    `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">` +
    rows.map((r, y) => [...r].map((c, x) => (c === 'X' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')).join('')).join('') +
    '</svg>';
  const HEART = pixels(['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....']);
  const SKULL = pixels(['X..XXXXX..X', '.XXXXXXXXX.', '.XX..X..XX.', '.XX..X..XX.', '..XXXXXXX..', '...X.X.X...', '.X.XXXXX.X.', 'X.........X']);
  const HP_COLOR = { OK: 'var(--hp-ok)', STABLE: 'var(--hp-stable)', SCATHED: 'var(--hp-scathed)', HURT: 'var(--hp-hurt)', CRITICAL: 'var(--hp-critical)', DEAD: 'var(--hp-dead)' };
  const FOE_COLOR = { GOOD: 'var(--hp-ok)', BRUISED: 'var(--hp-stable)', WOUNDED: 'var(--hp-scathed)', WEAKENED: 'var(--hp-hurt)', 'BARELY STANDING': 'var(--hp-critical)', DEFEATED: 'var(--hp-dead)' };
  const CMDS = ['fight', 'skill', 'act', 'item', 'mercy'];
  // the sound of each kind of hit landing on the creature
  const IMPACT = { foam: 'foam', real: 'thud', trash: 'thud', garbage: 'thud', elec: 'hurt', slice: 'hurt', nut: 'thud', ko: 'boom', poison: 'poison' };

  const UI = { b: null, mode: 'title', sel: 0, opts: [], optSel: 0, sub: null, typing: null, fast: false, stats: null };
  window.UI = UI;

  // ------------------------------------------------------------------ setup
  UI.init = function () {
    document.querySelectorAll('#keypad button').forEach((btn, i) =>
      btn.addEventListener('click', () => {
        if (UI.mode !== 'main') return;
        UI.sel = i;
        open(CMDS[i]);
      })
    );
    $('#btn-music').addEventListener('click', () => $('#btn-music').classList.toggle('off', !A().toggleMusic()));
    $('#btn-sfx').addEventListener('click', () => $('#btn-sfx').classList.toggle('off', !A().toggleSfx()));
    document.addEventListener('keydown', key);
    $('#lcd').addEventListener('click', () => {
      if (UI.typing) UI.fast = true;
    });
    $('#cine').addEventListener('click', () => {
      if (UI.typing) UI.fast = true;
    });
    title();
  };

  // ------------------------------------------------------------------ screens
  function screen(cls, html) {
    const el = $('#screen');
    el.className = 'on ' + cls;
    el.innerHTML = html;
  }
  function title() {
    UI.mode = 'title';
    $('#hud').style.visibility = 'hidden';
    screen(
      'title',
      `<div class="kicker">A BIRTHDAY BATTLE</div>
       <h1>CRISPY SOTO<span class="vs">VS</span><span class="red">THE CREATURE</span></h1>
       <p>It's late. Everyone's asleep. Something is standing in Chris's living room.</p>
       <button class="go" id="start">PRESS START</button>
       <div class="keys">ARROWS to choose · ENTER / Z to pick · ESC / X to go back · or click</div>`
    );
    $('#start').addEventListener('click', start);
  }
  async function start() {
    A().unlock();
    A().play('confirm');
    A().playMusic();
    $('#screen').className = '';
    $('#hud').style.visibility = 'visible';
    UI.b = new window.CRISPY_BATTLE.Battle(Date.now() & 0xffffff);
    UI.stats = { dealt: 0, taken: 0, t0: Date.now() };
    C().reset();
    S().reset();
    $('#log').innerHTML = '';
    $('#me-pic').src = window.CRISPY_IMAGES.crispy;
    refresh();
    UI.mode = 'busy';
    $('#keypad').classList.add('off');
    await say('2:47 AM. Crispy hears something downstairs.', 'sys');
    await say('Something is standing in his living room. It’s tall. Too tall.', 'foe');
    await say('The Creature stands between Crispy and the stairs!', 'foe');
    main();
  }
  // The three good endings close the same way: a breath, black, and one quiet line.
  const QUIET = {
    win: 'The house is quiet again.',
    spare: 'The door clicks shut. The house is quiet again.',
    flee: 'They watch the sun come up from the car.',
  };
  function end(how) {
    UI.mode = 'end';
    $('#hud').style.visibility = 'hidden';
    if (how === 'lose') {
      const st = UI.stats;
      const secs = Math.round((Date.now() - st.t0) / 1000);
      const line = `ROUND ${UI.b.round} · ${st.dealt} DAMAGE DEALT · ${st.taken} TAKEN · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      screen(
        'lose',
        `<div class="kicker">THE LIGHTS GO OUT</div>
         <h1>CRISPY SOTO HAS FALLEN</h1>
         <p>Veranda, Justin and Erik are still in the house. Get back up.</p>
         <div class="tally">${line}</div>
         <button class="go" id="again">TRY AGAIN</button>`
      );
    } else screen('calm', `<p class="quiet">${QUIET[how] || QUIET.win}</p><button class="go" id="again">PLAY AGAIN</button>`);
    $('#again').addEventListener('click', () => {
      A().play('confirm');
      if (!A().music.paused) A().music.currentTime = 0;
      start();
    });
  }
  // A calming breath, and everything fades to black.
  async function calm(how) {
    A().stopMusic(2.5);
    await wait(500);
    A().play('breath');
    await wait(S().fadeOut(4200) + 600);
    end(how);
  }

  // ------------------------------------------------------------------ WILLPOWER
  // The first time he falls: the screen goes red, the family flashes past, he says it, and he
  // gets back up.
  const LINE = "N-No... You won't take this house... Not this man, and not this man's family.";
  async function willpower(e) {
    const cine = $('#cine');
    const pic = $('#cine-pic');
    const box = $('#cine-box');
    A().play('fall');
    S().hitHero();
    S().hero.down = 1;
    await wait(S().redOut(900));
    cine.className = '';
    cine.hidden = false;
    box.hidden = true;
    A().play('heartbeat');
    for (const src of window.CRISPY_IMAGES.memories || []) {
      pic.src = src;
      pic.className = '';
      void pic.offsetWidth;
      pic.className = 'on';
      A().play('memory');
      await wait(1150);
    }
    pic.className = '';
    box.hidden = false;
    await type($('#cine-text'), LINE);
    await wait(1800);
    // he gets back up: his health comes back with him
    if (UI.view) Object.assign(UI.view, { hp: e.hp, willpower: false, heroTags: heroTags(UI.b) });
    refresh();
    A().play('rise');
    cine.className = 'up';
    await wait(S().rise());
    cine.hidden = true;
    cine.className = '';
    $('#cine-text').textContent = '';
  }
  // Typing, with a beat at every pause.
  async function type(el, text) {
    el.textContent = '';
    UI.typing = true;
    UI.fast = false;
    for (let i = 1; i <= text.length; i++) {
      if (UI.fast || SPEED < 1) break;
      el.textContent = text.slice(0, i);
      const ch = text[i - 1];
      if (i % 2 === 0 && ch !== ' ') A().play('text');
      await wait(ch === '.' ? 170 : ch === ',' ? 160 : 42);
    }
    el.textContent = text;
    UI.typing = false;
  }

  // ------------------------------------------------------------------ the HUD
  // What the HUD shows. The engine works out a whole turn at once, so during a turn the HUD
  // follows the turn's events as they play instead (UI.view): a heal shows when he eats, a hit
  // when it lands. Between turns it shows the engine as it is.
  function snapshot(b) {
    const h = b.hero;
    const f = b.foe;
    return { hp: h.hp, sp: h.sp, willpower: h.willpower, afraid: h.afraid, heroTags: heroTags(b), stage: f.stage, foeHp: f.hp, foeMax: f.hpMax, foeTags: foeTags(b), adjustIn: b.adjustIn(), mercy: b.mercy, family: b.family, round: b.round };
  }
  const word = (hp, max, list, gone) => (hp <= 0 ? gone : list.find((x) => (hp / max) * 100 <= x.upTo).id);
  function refresh() {
    const b = UI.b;
    if (!b) return;
    const v = UI.view || snapshot(b);
    const h = b.hero;
    const hs = word(v.hp, h.hpMax, DATA.health, 'DEAD');
    const box = $('#me');
    box.style.setProperty('--hc', HP_COLOR[hs] || HP_COLOR.OK);
    const icon = hs === 'CRITICAL' || hs === 'DEAD' ? SKULL : HEART;
    if ($('#heart').dataset.icon !== hs) {
      $('#heart').innerHTML = icon;
      $('#heart').dataset.icon = hs;
    }
    box.classList.toggle('beat', hs === 'HURT' || hs === 'CRITICAL');
    $('#hp-word').textContent = `[${hs}]`;
    $('#hp-num').textContent = `${v.hp}/${h.hpMax}`;
    $('#hp-fill').style.width = `${(100 * v.hp) / h.hpMax}%`;
    $('#sp-fill').style.width = `${(100 * v.sp) / h.spMax}%`;
    $('#sp-num').textContent = `${v.sp}/${h.spMax}`;
    $('#pilot').classList.toggle('out', !v.willpower);
    $('#pilot').lastElementChild.textContent = v.willpower ? 'PILOT LIGHT · WILLPOWER' : 'PILOT LIGHT OUT';
    S().hero.critical = hs === 'CRITICAL';
    S().hero.afraid = !!v.afraid;
    tags('#hero-tags', v.heroTags);
    // the creature
    const st = DATA.foe.stages[v.stage];
    $('#foe-name').textContent = st.name;
    $('#foe-tag').textContent = st.tag ? `(${st.tag})` : '';
    const pic = thumb(v.stage);
    if (pic && $('#foe-pic').getAttribute('src') !== pic) $('#foe-pic').src = pic;
    const fw = word(v.foeHp, v.foeMax, DATA.foeHealth, 'DEFEATED');
    $('#foe-state').textContent = `[${fw}]`;
    $('#foe-state').style.setProperty('--fc', FOE_COLOR[fw]);
    const n = v.adjustIn;
    const timer = $('#foe-timer');
    timer.classList.toggle('final', n === null);
    timer.classList.toggle('soon', n === 1);
    $('#foe-turns').textContent = n === 1 ? 'NEXT TURN' : `${n} TURNS`;
    tags('#foe-tags', v.foeTags);
    $('#mercy-fill').style.width = `${v.mercy}%`;
    $('#mercy-num').textContent = `${v.mercy}%`;
    $('#foe').classList.toggle('spareable', v.mercy >= DATA.mercyRules.full);
    DATA.family.forEach((p, i) => $(`#fam-${i}`).classList.toggle('out', v.family > i));
    $('#family').classList.toggle('safe', v.family >= 3);
    $('#round').textContent = `ROUND ${String(v.round).padStart(2, '0')}`;
  }
  // The stage's doc profile, made small so it shows in pixels like everything else.
  const thumbs = [];
  function thumb(i) {
    if (thumbs[i]) return thumbs[i];
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 56;
      c.getContext('2d').drawImage(im, 0, 0, 56, 56);
      thumbs[i] = c.toDataURL();
      refresh();
    };
    im.src = window.CRISPY_IMAGES.profiles[i];
    return null;
  }
  function heroTags(b) {
    const out = b.hero.mods.map((m) => [m.label, m.good ? '' : 'bad']);
    if (b.hero.afraid) out.push(['AFRAID', 'bad']);
    if (b.hero.real) out.push([`REAL SWORD ${b.hero.real}`, '']);
    return out;
  }
  function foeTags(b) {
    const f = b.foe;
    const out = f.mods.map((m) => [m.label, m.good ? 'bad' : '']);
    if (f.slices) out.push([`SLICED ×${f.slices}`, '']);
    if (f.poison) out.push(['POISONED', '']);
    if (f.disarmed) out.push(['DISARMED', '']);
    if (f.distracted) out.push(['DISTRACTED', '']);
    return out;
  }
  function tags(sel, list) {
    $(sel).innerHTML = list.map(([t, c]) => `<span class="tag ${c}">${t}</span>`).join('');
  }

  // ------------------------------------------------------------------ the log
  function markup(text) {
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return esc.replace(/\b(Crispy)\b/g, '<span class="n-hero">$1</span>').replace(/\b(The Creature|Andy)\b/g, '<span class="n-foe">$1</span>');
  }
  async function say(text, tone = 'hero') {
    const log = $('#log');
    $('#menu').hidden = true;
    log.hidden = false;
    $('#desc').textContent = '';
    for (const p of log.querySelectorAll('p')) p.classList.add('old');
    const p = document.createElement('p');
    p.className = 't-' + tone;
    log.appendChild(p);
    while (log.children.length > 5) log.removeChild(log.firstChild);
    // type it out
    UI.typing = true;
    UI.fast = false;
    const html = markup(text);
    const plain = text.length;
    for (let i = 1; i <= plain; i++) {
      if (UI.fast || SPEED < 1) break;
      p.textContent = text.slice(0, i);
      if (i % 3 === 0) A().play(tone === 'foe' ? 'creepyText' : 'text');
      await wait(tone === 'foe' ? 22 : 15);
    }
    p.innerHTML = html;
    UI.typing = false;
    await wait(UI.fast ? 120 : 380);
  }

  // ------------------------------------------------------------------ menus
  function main() {
    UI.mode = 'main';
    UI.sub = null;
    $('#keypad').classList.remove('off');
    $('#menu').hidden = true;
    $('#log').hidden = false;
    $('#desc').textContent = 'What will Crispy do?';
    keypad();
  }
  function keypad() {
    document.querySelectorAll('#keypad button').forEach((b, i) => b.classList.toggle('sel', i === UI.sel && UI.mode === 'main'));
  }
  function open(cmd) {
    const b = UI.b;
    const o = b.options();
    A().play('confirm');
    pressKey(CMDS.indexOf(cmd));
    let opts;
    if (cmd === 'fight') opts = [{ id: 'attack', name: 'ATTACK', doc: DATA.attack.doc, ok: true, run: { type: 'attack' } }];
    else if (cmd === 'skill')
      opts = o.skills.map((s) => ({ ...s, right: `${s.sp} SP`, run: s.special ? { type: 'special' } : { type: 'skill', id: s.id }, target: s.target }));
    else if (cmd === 'act') opts = o.acts.map((a) => ({ ...a, run: { type: 'act', id: a.id } }));
    else if (cmd === 'item') opts = o.items.map((i) => ({ ...i, right: `×${i.count}`, run: { type: 'item', id: i.id } }));
    else opts = o.mercy.map((m) => ({ ...m, run: { type: 'mercy', id: m.id } }));
    menu(cmd.toUpperCase(), opts, cmd === 'fight' || cmd === 'mercy' ? 1 : 2);
  }
  function menu(head, opts, cols = 2) {
    UI.mode = 'sub';
    UI.opts = opts;
    UI.optSel = Math.max(0, opts.findIndex((o) => o.ok));
    UI.cols = cols;
    $('#log').hidden = true;
    const m = $('#menu');
    m.hidden = false;
    m.classList.toggle('one', cols === 1);
    m.innerHTML = `<div class="head">${head}</div>` + opts.map((o, i) => `<div class="opt${o.ok ? '' : ' no'}${o.special ? ' special' : ''}" data-i="${i}"><span>${o.name}</span>${o.right ? `<small>${o.right}</small>` : ''}</div>`).join('');
    m.querySelectorAll('.opt').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        UI.optSel = +el.dataset.i;
        drawMenu();
      });
      el.addEventListener('click', () => {
        UI.optSel = +el.dataset.i;
        pick();
      });
    });
    drawMenu();
  }
  function drawMenu() {
    document.querySelectorAll('#menu .opt').forEach((el, i) => el.classList.toggle('sel', i === UI.optSel));
    const o = UI.opts[UI.optSel];
    $('#desc').textContent = o ? (o.ok ? o.doc || '' : `${o.why}. ${o.doc || ''}`) : '';
  }
  function pick() {
    const o = UI.opts[UI.optSel];
    if (!o) return;
    if (!o.ok) {
      A().play('deny');
      return;
    }
    A().play('confirm');
    if (o.target) {
      // Authority: on himself, or on the creature?
      menu('AUTHORITY: ON WHO?', [
        { name: 'YOURSELF', doc: 'Cancel every bad effect on Crispy.', ok: true, run: { ...o.run, target: 'hero' } },
        { name: 'THE CREATURE', doc: 'Cancel every good effect on the creature.', ok: true, run: { ...o.run, target: 'foe' } },
      ], 1);
      UI.mode = 'target';
      return;
    }
    run(o.run);
  }
  function back() {
    if (UI.mode === 'sub' || UI.mode === 'target') {
      A().play('back');
      if (UI.mode === 'target') return open('skill');
      main();
    }
  }
  function pressKey(i) {
    const btn = document.querySelectorAll('#keypad button')[i];
    if (!btn) return;
    btn.classList.add('press');
    setTimeout(() => btn.classList.remove('press'), 120);
  }

  function key(e) {
    const k = e.key;
    if (UI.mode === 'title') {
      if (k === 'Enter' || k === 'z' || k === ' ') start();
      return;
    }
    if (UI.mode === 'end') {
      if (k === 'Enter' || k === 'z') $('#again') && $('#again').click();
      return;
    }
    if (UI.typing && (k === 'Enter' || k === 'z' || k === ' ')) {
      UI.fast = true;
      return;
    }
    if (UI.mode === 'main') {
      if (k === 'ArrowDown' || k === 'ArrowRight') UI.sel = (UI.sel + 1) % CMDS.length;
      else if (k === 'ArrowUp' || k === 'ArrowLeft') UI.sel = (UI.sel + CMDS.length - 1) % CMDS.length;
      else if (k === 'Enter' || k === 'z' || k === ' ') return open(CMDS[UI.sel]);
      else return;
      A().play('move');
      keypad();
      e.preventDefault();
      return;
    }
    if (UI.mode === 'sub' || UI.mode === 'target' || UI.mode === 'again') {
      const n = UI.opts.length;
      const cols = UI.cols;
      let i = UI.optSel;
      if (k === 'ArrowRight' && cols > 1) i = Math.min(n - 1, i + 1);
      else if (k === 'ArrowLeft' && cols > 1) i = Math.max(0, i - 1);
      else if (k === 'ArrowDown') i = Math.min(n - 1, i + cols);
      else if (k === 'ArrowUp') i = Math.max(0, i - cols);
      else if (k === 'Enter' || k === 'z' || k === ' ') return pick();
      else if ((k === 'Escape' || k === 'x' || k === 'Backspace') && UI.mode !== 'again') return back();
      else return;
      if (i !== UI.optSel) A().play('move');
      UI.optSel = i;
      drawMenu();
      e.preventDefault();
    }
  }

  // ------------------------------------------------------------------ a turn
  async function run(cmd) {
    UI.mode = 'busy';
    $('#keypad').classList.add('off');
    keypad();
    UI.view = snapshot(UI.b);
    const events = UI.b.command(cmd);
    await play(events);
    UI.view = null;
    refresh();
    if (UI.b.over) return;
    if (UI.b.awaiting === 'again') return again();
    main();
  }
  function again() {
    menu('ONE MORE?', [
      { name: 'NUTCRACKAAAA!!! AGAIN', doc: 'He has it in him for one more. (Twice per turn.)', ok: UI.b.canNut(), why: 'Not enough SP', special: true, run: { type: 'special' } },
      { name: 'THAT’S ENOUGH', doc: 'End his turn.', ok: true, run: { type: 'pass' } },
    ], 1);
    UI.mode = 'again';
  }

  // How far into each effect its hit (or heal, or buff) lands, so the HUD moves with it.
  const FX_AT = { speaker: 0.4, swing: 0.45, realSlash: 0.45, trash: 0.6, tear: 0.35, early: 0.75, authority: 0.35, rg: 0.5, wine: 0.6, slice: 0.3, taste: 0.6, nut: 0.32, choc: 0.42, cheese: 0.45, pills: 0.7, keys: 0.5, stance: 0.5 };
  const FOE_AT = { claw: 0.3, rake: 0.3, reach: 0.55, screech: 0.4, scream: 0.4, lash: 0.4, lash3: 0.4, lunge: 0.4, mimic: 0.45, grab: 0.45, pat: 0.45, bite: 0.32, flicker: 0.55, bile: 0.45, drop: 0.5, joke: 0.55 };

  async function play(events) {
    for (const e of events) {
      const v = UI.view; // (null outside a turn: then the HUD just shows the engine)
      switch (e.t) {
        case 'log':
          await say(e.text, e.tone);
          break;
        case 'fx': {
          const ms = S().play(e.name, e);
          await wait(ms * (FX_AT[e.name] || 0.85));
          break;
        }
        case 'foe': {
          const ms = Math.max(C().act(e.move), S().foeMove(e.move, e));
          await wait(ms * (FOE_AT[e.move] || 0.7));
          break;
        }
        case 'hit': {
          if (v) {
            if (e.who === 'foe') v.foeHp = Math.max(0, v.foeHp - e.amount);
            else v.hp = Math.max(0, v.hp - e.amount);
          }
          if (e.who === 'foe') {
            UI.stats.dealt += e.amount;
            C().act('hurt');
            const snd = IMPACT[e.kind];
            if (snd) A().play(snd);
            else A().play('hurt');
            $('#foe').classList.remove('hit');
            void $('#foe').offsetWidth;
            $('#foe').classList.add('hit');
            const [x, y] = C().point('chest');
            S().popup(`${e.amount}`, x + (Math.random() - 0.5) * 60, y - 40, { color: e.crit ? '#b89a52' : '#b8b2a6', size: e.crit ? 40 : 32 });
          } else {
            UI.stats.taken += e.amount;
            S().hitHero();
            A().play('hurt');
            const [x, y] = S().heroPoint('head');
            S().popup(`${e.amount}`, x + 60, y, { color: e.crit ? '#a8443a' : '#8a5a52', size: e.crit ? 40 : 32 });
          }
          refresh();
          await wait(420);
          break;
        }
        // (words from attacks go in the log, not on screen)
        case 'miss':
          A().play('miss');
          await wait(300);
          break;
        case 'block':
          A().play('block');
          S().hero.shake = 4;
          await wait(320);
          break;
        case 'heal': {
          if (v) {
            if (e.who === 'foe') v.foeHp = Math.min(v.foeMax, v.foeHp + e.amount);
            else v.hp = Math.min(UI.b.hero.hpMax, v.hp + e.amount);
          }
          if (e.amount > 0) {
            A().play('heal');
            const [x, y] = e.who === 'foe' ? C().point('chest') : S().heroPoint('head');
            S().popup(`+${e.amount}`, x + 40, y, { color: '#7e9a84', size: 32 });
          }
          refresh();
          await wait(380);
          break;
        }
        case 'sp':
          if (v) v.sp = e.value;
          refresh();
          break;
        case 'tag':
          if (v) {
            v.heroTags = heroTags(UI.b);
            v.foeTags = foeTags(UI.b);
            v.afraid = UI.b.hero.afraid;
          }
          refresh(); // (it shows in the boxes' tags)
          break;
        case 'adjust': {
          const ms = Math.max(C().adjust(e.to), S().adjust());
          // halfway through, it's the new body
          wait(ms * 0.5).then(() => {
            if (v) Object.assign(v, { stage: e.to, foeHp: e.hp, foeMax: e.hpMax, foeTags: [], adjustIn: DATA.foe.stages[e.to].final ? null : DATA.foe.adjustOn });
            refresh();
          });
          await wait(ms);
          refresh();
          break;
        }
        case 'revive':
          await willpower(e);
          refresh();
          break;
        case 'lights':
          S().setLights(e.on);
          break;
        case 'sword':
          S().real = e.real;
          break;
        case 'round':
          // the end of the round: the HUD catches up with everything (SP back, effects worn off)
          if (v) Object.assign(v, snapshot(UI.b));
          refresh();
          break;
        case 'again':
          break;
        case 'mercy': {
          if (v) v.mercy = e.value;
          refresh();
          if (e.quiet) break; // creeping up by itself at the end of a round
          const up = e.delta > 0;
          A().play(up ? 'mercyUp' : 'mercyDown');
          const [x, y] = C().point('head');
          S().popup(`MERCY ${up ? '+' : ''}${e.delta}%`, x - 30, y - 130, { color: up ? '#a8975a' : '#6e6658', size: 24, dur: 1.3 });
          await wait(up ? 420 : 200);
          break;
        }
        case 'family':
          // (crossed off the checklist, in the effect, and in his box)
          if (v) v.family = e.value;
          refresh();
          break;
        case 'door':
          S().setDoor(e.open !== false);
          break;
        // the speaker: a song instead of the battle music, till it ends or it's torn apart
        case 'speaker':
          if (e.on) A().playSong();
          else A().stopSong(e.broken ? 0.05 : 1.5);
          S().setSpeaker(e.on, e.broken);
          break;
        // the endings: Andy falls, it walks out of the front door, or they drive away
        case 'win':
          refresh();
          A().stopMusic(2.5);
          A().play('bones');
          await wait(C().die());
          break;
        case 'spare':
          // he blinks, and it's gone
          refresh();
          A().stopMusic(4);
          S().setDoor(true);
          await wait(S().blink() + 400);
          break;
        case 'flee':
          refresh();
          A().stopMusic(4);
          await wait(S().escape());
          break;
        case 'lose': {
          refresh();
          A().stopMusic(2);
          A().play('lose');
          S().hero.down = 1;
          await wait(2200);
          end('lose');
          return;
        }
      }
    }
    refresh();
    if (UI.b.over) await calm(UI.b.over);
  }

  UI.refresh = refresh;
  UI.debug = { run, open, main, play };
})();
