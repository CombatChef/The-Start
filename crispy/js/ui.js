/*
 * The HUD and the flow of the fight: the menus (FIGHT, SKILL, ACT, ITEM, MERCY) on the
 * keypad and the LCD, Crispy's ID badge (his health shown as on SlashCo VR's HUD: a coloured
 * word under a heart), the creature's panel, and playing out each turn's events: the log,
 * the effects, the hits.
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

  const HEART = '<svg viewBox="0 0 32 30"><path d="M16 29C16 29 1 19.5 1 9.5 1 4.5 5 1 9.2 1c3.2 0 5.6 2 6.8 4.4C17.2 3 19.6 1 22.8 1 27 1 31 4.5 31 9.5 31 19.5 16 29 16 29Z"/></svg>';
  const SKULL = '<svg viewBox="0 0 48 44"><g stroke="currentColor" stroke-width="5" stroke-linecap="round"><line x1="8" y1="9" x2="40" y2="37"/><line x1="40" y1="9" x2="8" y2="37"/></g><circle cx="5" cy="10" r="3.6"/><circle cx="9" cy="5.5" r="3.6"/><circle cx="43" cy="10" r="3.6"/><circle cx="39" cy="5.5" r="3.6"/><circle cx="5" cy="36" r="3.6"/><circle cx="9" cy="40.5" r="3.6"/><circle cx="43" cy="36" r="3.6"/><circle cx="39" cy="40.5" r="3.6"/><path d="M24 5c-9 0-13.5 6-13.5 12.8 0 4.4 2 7 4.8 8.6V32h17.4v-5.6c2.8-1.6 4.8-4.2 4.8-8.6C37.5 11 33 5 24 5Z"/><g fill="#000"><ellipse cx="18.6" cy="18.5" rx="3.8" ry="4.2"/><ellipse cx="29.4" cy="18.5" rx="3.8" ry="4.2"/><path d="M24 22.5l-2.4 4.4h4.8Z"/></g></svg>';
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
       <p>It's late. Everyone's asleep upstairs. Something is standing in the living room.</p>
       <button class="power" id="start"><i></i>PRESS START</button>
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
    refresh();
    UI.mode = 'busy';
    $('#keypad').classList.add('off');
    await say('Crispy hears something downstairs.', 'sys');
    await say('Something is standing in the living room. It’s tall. Too tall.', 'foe');
    await say('The Creature stands between Crispy and the stairs!', 'foe');
    main();
  }
  function end(win) {
    UI.mode = 'end';
    $('#hud').style.visibility = 'hidden';
    const st = UI.stats;
    const secs = Math.round((Date.now() - st.t0) / 1000);
    const line = `ROUND ${UI.b.round} · ${st.dealt} DAMAGE DEALT · ${st.taken} TAKEN · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (win)
      screen(
        'win',
        `<div class="kicker">THE HOUSE IS QUIET AGAIN</div>
         <h1>HAPPY BIRTHDAY, DAD!</h1>
         <p>Crispy Soto stood his ground and protected his family.</p>
         <div class="tally">${line}</div>
         <button class="power" id="again"><i></i>PLAY AGAIN</button>`
      );
    else
      screen(
        'lose',
        `<div class="kicker">THE LIGHTS GO OUT</div>
         <h1>CRISPY SOTO HAS FALLEN</h1>
         <p>His family is still upstairs. Get back up.</p>
         <div class="tally">${line}</div>
         <button class="power" id="again"><i></i>TRY AGAIN</button>`
      );
    $('#again').addEventListener('click', () => {
      A().play('confirm');
      if (!A().music.paused) A().music.currentTime = 0;
      start();
    });
  }

  // ------------------------------------------------------------------ the HUD
  function refresh() {
    const b = UI.b;
    if (!b) return;
    const h = b.hero;
    const hs = b.healthWord(h);
    const vital = $('.vital');
    vital.style.setProperty('--hc', HP_COLOR[hs] || HP_COLOR.OK);
    const icon = hs === 'CRITICAL' || hs === 'DEAD' ? SKULL : HEART;
    if ($('#heart').dataset.icon !== hs) {
      $('#heart').innerHTML = icon;
      $('#heart').dataset.icon = hs;
    }
    vital.classList.toggle('beat', hs === 'HURT' || hs === 'CRITICAL');
    $('#hp-word').textContent = `[${hs}]`;
    $('#hp-num').textContent = `HP ${h.hp}/${h.hpMax}`;
    $('#sp-fill').style.width = `${(100 * h.sp) / h.spMax}%`;
    $('#sp-num').textContent = `${h.sp}`;
    $('#pilot').classList.toggle('out', !h.willpower);
    $('#pilot').lastElementChild.textContent = h.willpower ? 'PILOT LIGHT · WILLPOWER' : 'PILOT LIGHT OUT';
    S().hero.critical = hs === 'CRITICAL';
    S().hero.afraid = !!h.afraid;
    tags('#hero-tags', heroTags(b));
    // the creature
    const st = b.stage;
    $('#foe-name').textContent = st.name;
    $('#foe-tag').textContent = st.tag ? `(${st.tag})` : '';
    const pic = window.CRISPY_IMAGES.profiles[b.foe.stage];
    if ($('#foe-pic').getAttribute('src') !== pic) $('#foe-pic').src = pic;
    const fw = b.healthWord(b.foe);
    $('#foe-state').textContent = `[${fw}]`;
    $('#foe-state').style.setProperty('--fc', FOE_COLOR[fw]);
    const n = b.adjustIn();
    const timer = $('#foe-timer');
    timer.classList.toggle('final', n === null);
    timer.classList.toggle('soon', n === 1);
    $('#foe-turns').textContent = n === 1 ? 'NEXT TURN' : `${n} TURNS`;
    tags('#foe-tags', foeTags(b));
    $('#round').textContent = `ROUND ${String(b.round).padStart(2, '0')}`;
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
      const row = UI.sel < 3 ? 0 : 1;
      if (k === 'ArrowRight') UI.sel = row ? (UI.sel === 3 ? 4 : 3) : (UI.sel + 1) % 3;
      else if (k === 'ArrowLeft') UI.sel = row ? (UI.sel === 3 ? 4 : 3) : (UI.sel + 2) % 3;
      else if (k === 'ArrowDown' && !row) UI.sel = UI.sel === 2 ? 4 : 3;
      else if (k === 'ArrowUp' && row) UI.sel = UI.sel === 3 ? 0 : 2;
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
    const events = UI.b.command(cmd);
    await play(events);
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

  async function play(events) {
    for (const e of events) {
      switch (e.t) {
        case 'log':
          await say(e.text, e.tone);
          break;
        case 'fx': {
          const ms = S().play(e.name, e);
          await wait(ms * 0.85);
          break;
        }
        case 'foe': {
          const ms = Math.max(C().act(e.move), S().foeMove(e.move));
          await wait(ms * 0.7);
          break;
        }
        case 'hit': {
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
            S().popup(e.crit ? `${e.amount}!` : `${e.amount}`, x + (Math.random() - 0.5) * 60, y - 40, { color: e.crit ? '#ffd23f' : '#ffffff', size: e.crit ? 70 : 52 });
          } else {
            UI.stats.taken += e.amount;
            S().hitHero();
            A().play('hurt');
            const [x, y] = S().heroPoint('head');
            S().popup(`${e.amount}`, x + 60, y, { color: e.crit ? '#ff6b3d' : '#ff9a8a', size: e.crit ? 66 : 52 });
          }
          refresh();
          await wait(420);
          break;
        }
        case 'miss': {
          A().play('miss');
          const [x, y] = e.who === 'foe' ? C().point('chest') : S().heroPoint('head');
          S().popup('MISS', x, y - 30, { color: '#b9c2c9', size: 42 });
          await wait(380);
          break;
        }
        case 'block': {
          A().play('block');
          const [x, y] = S().heroPoint('head');
          S().popup('BLOCKED', x + 40, y, { color: '#9fdcff', size: 46 });
          await wait(420);
          break;
        }
        case 'heal': {
          if (e.amount > 0) {
            A().play('heal');
            const [x, y] = e.who === 'foe' ? C().point('chest') : S().heroPoint('head');
            S().popup(`+${e.amount}`, x + 40, y, { color: '#6dff9e', size: 50 });
          }
          refresh();
          await wait(380);
          break;
        }
        case 'sp':
          refresh();
          break;
        case 'tag': {
          refresh();
          if (e.quiet) break;
          const [x, y] = e.who === 'foe' ? C().point('head') : S().heroPoint('head');
          S().popup(e.text, x + (e.who === 'foe' ? -40 : 80), y - 90, { color: e.good ? '#8dffc4' : '#ff9a7a', size: 30, dur: 1.4 });
          await wait(260);
          break;
        }
        case 'adjust': {
          const ms = Math.max(C().adjust(e.to), S().adjust());
          setTimeout(refresh, ms * 0.5);
          await wait(ms);
          refresh();
          break;
        }
        case 'revive': {
          const ms = S().revive();
          await wait(ms * 0.55);
          refresh();
          await wait(ms * 0.45);
          break;
        }
        case 'lights':
          S().setLights(e.on);
          break;
        case 'sword':
          S().real = e.real;
          break;
        case 'round':
          refresh();
          break;
        case 'again':
          break;
        case 'win': {
          refresh();
          A().stopMusic(2.5);
          A().play('bones');
          await wait(C().die());
          S().setLights(true);
          A().play('birthday');
          S().confetti();
          await wait(600);
          end(true);
          return;
        }
        case 'lose': {
          refresh();
          A().stopMusic(2);
          A().play('lose');
          S().hero.down = 1;
          await wait(2200);
          end(false);
          return;
        }
      }
    }
    refresh();
  }

  UI.refresh = refresh;
  UI.debug = { run, open, main, play };
})();
