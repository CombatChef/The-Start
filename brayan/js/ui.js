/*
 * The HUD and the flow of Brayan's fight: the commands (FIGHT, SKILL, ACT, ITEM, FLEE) and
 * their menus, his badge and the Gunman's box, playing out each turn's events; and the parts in
 * real time: the 25 seconds to find the fuel in HALLWAY A, CLASSROOM A (the keys, the bear, and
 * what's waking up in there), an ear to its door, the DODGE when the gun comes up, the timing
 * when he tries to DISTRACT it.
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const DATA = window.BRAYAN_DATA;
  const S = () => window.SCENE;
  const A = () => window.AUDIO;
  // ?fast plays the turns quicker (for testing); the real-time parts stay real
  const SPEED = /[?&]fast/.test(location.search) ? 0.15 : 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));
  const real = (ms) => new Promise((r) => setTimeout(r, ms));

  const pixels = (rows) =>
    `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">` +
    rows.map((r, y) => [...r].map((c, x) => (c === 'X' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')).join('')).join('') +
    '</svg>';
  const ICONS = {
    heart: ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'],
    skull: ['X..XXXXX..X', '.XXXXXXXXX.', '.XX..X..XX.', '.XX..X..XX.', '..XXXXXXX..', '...X.X.X...', '.X.XXXXX.X.', 'X.........X'],
    pencil: ['XXXXXXXXXX.....', 'X.XXXXXXXXXX...', 'X.XXXXXXXXXXXX.', 'X.XXXXXXXXXXXXX', 'X.XXXXXXXXXXXX.', 'X.XXXXXXXXXX...', 'XXXXXXXXXX.....'],
    whistle: ['....XXXXXX', 'XXXXXXXXXX', 'XXXXX...XX', 'XXXXX...XX', '..XXXXXXX.', '...XXXXX..'],
    can: ['.XX.XX', 'XXXXXX', 'X.XX.X', 'XX..XX', 'X.XX.X', 'XXXXXX'],
    key: ['.XX...', 'X..X..', 'X..XXX', '.XX.XX', '......', '......'],
    bear: ['XX..XX', 'XXXXXX', '.X..X.', '.XXXX.', 'XXXXXX', '.X..X.'],
    left: ['...X', '..XX', '.XXX', 'XXXX', '.XXX', '..XX', '...X'],
  };
  const HP_COLOR = { OK: '#38f90a', STABLE: '#8dbe89', SCATHED: '#e6e7c2', HURT: '#f0a04b', CRITICAL: '#ff6b3d', DEAD: '#ff3419' };
  const FOE_COLOR = { GOOD: '#38f90a', BRUISED: '#8dbe89', WOUNDED: '#e6e7c2', WEAKENED: '#f0a04b', 'BARELY STANDING': '#ff6b3d', DEFEATED: '#ff3419' };
  const CMDS = ['fight', 'skill', 'act', 'item', 'flee'];

  const UI = { b: null, mode: 'title', sel: 0, opts: [], optSel: 0, cols: 2, typing: false, fast: false, view: null, stats: null };
  window.UI = UI;

  // ------------------------------------------------------------------ setup
  UI.init = function () {
    document.querySelectorAll('[data-px]').forEach((el) => (el.innerHTML = pixels(ICONS[el.dataset.px])));
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
    $('#lcd').addEventListener('pointerdown', () => {
      if (UI.mode === 'timing') timingPress();
    });
    // a tap on the scene, while he's looking for something
    $('#search').addEventListener('pointerdown', (e) => {
      if (UI.mode !== 'search' && UI.mode !== 'class') return;
      if (e.target.closest('button')) return;
      const r = $('#stage').getBoundingClientRect();
      tap(((e.clientX - r.left) / r.width) * 1280, ((e.clientY - r.top) / r.height) * 960);
    });
    $('#search-back').addEventListener('click', () => UI.mode === 'class' && UI.leave && UI.leave());
    $('#dodge').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (UI.dodge) UI.dodge();
    });
    $('#me-pic').src = window.BRAYAN_IMAGES.portrait;
    $('#foe-pic').src = window.BRAYAN_IMAGES.gunmanPic;
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
      `<div class="kicker">A SCHOOL NIGHT</div>
       <h1>BRAYAN<span class="vs">VS</span><span class="red">THE GUNMAN</span></h1>
       <p>6:14 PM. The kids are on Bus 13, out front, and it won’t start. Brayan’s keys are somewhere inside the school. So is the fuel. So is something else.</p>
       <button class="go" id="start">PRESS START</button>
       <div class="keys">ARROWS to choose · ENTER / Z to pick · ESC / X to go back · or tap</div>`
    );
    $('#start').addEventListener('click', start);
  }
  async function start() {
    A().unlock();
    A().play('confirm');
    A().duck(1, 0);
    A().playMusic();
    $('#screen').className = '';
    $('#hud').style.visibility = 'visible';
    $('#hud').classList.remove('away');
    UI.b = new window.BRAYAN_BATTLE.Battle(Date.now() & 0xffffff);
    UI.stats = { dealt: 0, taken: 0, t0: Date.now() };
    UI.view = null;
    S().reset();
    S().setPlace('entrance');
    $('#log').innerHTML = '';
    refresh();
    UI.mode = 'busy';
    keypadOff(true);
    await say('6:14 PM. The kids are on Bus 13, out front, and it won’t start.', 'sys');
    await say('Brayan’s keys are somewhere inside. So is the fuel.', 'sys');
    S().showGunman(true);
    await say('Something is standing in the front hallway. It’s tall. Too tall.', 'foe');
    await say('The Gunman stands between Brayan and the rest of the school!', 'foe');
    main();
  }
  // the end: black, and one line
  function calm(how) {
    const b = UI.b;
    const lines = {
      escape: `Bus 13 starts on the first try.<br>Brayan doesn’t look back at the school.<br>${b.have.bear ? 'Somewhere around the third row, a kid has their bear again.' : 'Every seat full. Everybody going home.'}`,
      win: 'The hallway is quiet again.<br>Brayan walks out to Bus 13, and the kids, and the rest of the night.',
    };
    UI.mode = 'end';
    $('#hud').style.visibility = 'hidden';
    screen('calm', `<p class="quiet">${lines[how]}</p><button class="go" id="again">PLAY AGAIN</button>`);
    $('#again').addEventListener('click', again);
  }
  function lose() {
    const b = UI.b;
    UI.mode = 'end';
    A().stopLoops(0.3);
    $('#hud').style.visibility = 'hidden';
    $('#search').hidden = true;
    const st = UI.stats;
    const secs = Math.round((Date.now() - st.t0) / 1000);
    screen(
      'lose',
      `<div class="kicker">${b.lostTo === 'root' ? 'SOMETHING WAS AWAKE IN CLASSROOM A' : 'THE LIGHTS GO OUT'}</div>
       <h1>BRAYAN HAS FALLEN</h1>
       <p>The kids are still waiting on Bus 13. Get back up.</p>
       <div class="tally">PERIOD ${String(b.round).padStart(2, '0')} · ${st.dealt} DAMAGE DEALT · ${st.taken} TAKEN · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</div>
       <button class="go" id="again">TRY AGAIN</button>`
    );
    $('#again').addEventListener('click', again);
  }
  function again() {
    A().play('confirm');
    if (A().music) A().music.currentTime = 0;
    start();
  }

  // ------------------------------------------------------------------ the HUD
  const word = (hp, max, list, gone) => (hp <= 0 ? gone : list.find((x) => (hp / max) * 100 <= x.upTo).id);
  function heroTags(b) {
    const t = b.hero.mods.map((m) => ({ text: m.label, good: true }));
    if (b.hero.ears) t.push({ text: 'SHARP EARS', good: true });
    if (b.hero.frozen) t.push({ text: 'FROZEN', good: false });
    return t;
  }
  function foeTags(b) {
    const t = b.foe.mods.map((m) => ({ text: m.label, good: false }));
    if (b.foe.stunned) t.push({ text: 'STUNNED', good: false });
    if (b.foe.distracted) t.push({ text: 'DISTRACTED', good: false });
    return t;
  }
  function snapshot(b) {
    return { hp: b.hero.hp, pat: b.hero.pat, foeHp: b.foe.hp, stun: b.stunLevel(), stunned: b.foe.stunned > 0, heroTags: heroTags(b), foeTags: foeTags(b), wind: b.hero.secondWind, round: b.round };
  }
  function refresh() {
    const b = UI.b;
    if (!b) return;
    const v = UI.view || snapshot(b);
    const h = b.hero;
    const hs = word(v.hp, h.hpMax, DATA.health, 'DEAD');
    $('#me').style.setProperty('--hc', HP_COLOR[hs]);
    $('#me').classList.toggle('critical', hs === 'CRITICAL');
    const icon = hs === 'CRITICAL' || hs === 'DEAD' ? 'skull' : 'heart';
    if ($('#heart').dataset.icon !== icon) {
      $('#heart').innerHTML = pixels(ICONS[icon]);
      $('#heart').dataset.icon = icon;
    }
    $('#hp-word').textContent = `[${hs}]`;
    $('#hp-num').textContent = `${v.hp}/${h.hpMax}`;
    $('#hp-fill').style.width = `${(v.hp / h.hpMax) * 100}%`;
    $('#pat-num').textContent = `${v.pat}/${h.patMax}`;
    $('#pat-fill').style.width = `${(v.pat / h.patMax) * 100}%`;
    $('#wind').classList.toggle('used', !v.wind);
    $('#fuel-num').textContent = `${b.have.fuel}/${DATA.fuel}`;
    $('#goal-fuel').classList.toggle('got', b.have.fuel >= DATA.fuel);
    $('#goal-keys').classList.toggle('got', b.have.keys);
    $('#goal-bear').classList.toggle('got', b.have.bear);
    $('#hero-tags').innerHTML = v.heroTags.map((t) => `<span class="tag${t.good ? '' : ' bad'}">${t.text}</span>`).join('');
    const f = b.foe;
    const fs = word(v.foeHp, f.hpMax, DATA.foeHealth, 'DEFEATED');
    $('#foe-state').textContent = `[${fs}]`;
    $('#foe-state').style.color = FOE_COLOR[fs];
    $('#stun-fill').style.width = `${v.stunned ? 100 : v.stun * 100}%`;
    $('#stun-num').textContent = v.stunned ? 'STUNNED' : `${Math.round(v.stun * 100)}%`;
    $('#foe').classList.toggle('stunned', v.stunned);
    $('#foe-tags').innerHTML = v.foeTags.map((t) => `<span class="tag bad">${t.text}</span>`).join('');
    $('#round').textContent = `PERIOD ${String(v.round).padStart(2, '0')}`;
    $('#where').textContent = `${DATA.places[S().place].where} · ${clock(v.round)}`;
  }
  // the time: a couple of minutes a turn
  function clock(round) {
    const m = 14 + (round - 1) * 2;
    return `${6 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} PM`;
  }
  UI.refresh = refresh;

  // ------------------------------------------------------------------ the log
  function markup(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\bBrayan\b/g, '<span class="n-hero">Brayan</span>')
      .replace(/The Gunman|the Gunman/g, (m) => `<span class="n-foe">${m}</span>`)
      .replace(/HALLWAY A|CLASSROOM A|THE ENTRANCE|Bus 13/g, (m) => `<span class="n-place">${m}</span>`);
  }
  async function say(text, tone = 'hero') {
    const log = $('#log');
    $('#menu').hidden = true;
    $('#timing').hidden = true;
    log.hidden = false;
    $('#desc').textContent = '';
    for (const p of log.querySelectorAll('p')) p.classList.add('old');
    const p = document.createElement('p');
    p.className = 't-' + tone;
    log.appendChild(p);
    while (log.children.length > 5) log.removeChild(log.firstChild);
    UI.typing = true;
    UI.fast = false;
    for (let i = 1; i <= text.length; i++) {
      if (UI.fast || SPEED < 1) break;
      p.textContent = text.slice(0, i);
      if (i % 3 === 0) A().play(tone === 'foe' ? 'creepyText' : 'text');
      await wait(tone === 'foe' ? 22 : 15);
    }
    p.innerHTML = markup(text);
    UI.typing = false;
    await wait(UI.fast ? 120 : 380);
  }

  // ------------------------------------------------------------------ menus
  function keypadOff(off) {
    $('#keypad').classList.toggle('off', off);
    document.querySelectorAll('#keypad button').forEach((b, i) => b.classList.toggle('sel', i === UI.sel && UI.mode === 'main'));
  }
  async function main() {
    const b = UI.b;
    if (b.over) return;
    if (b.hero.frozen) {
      UI.mode = 'busy';
      keypadOff(true);
      return run({ type: 'frozen' });
    }
    UI.mode = 'main';
    $('#menu').hidden = true;
    $('#timing').hidden = true;
    $('#log').hidden = false;
    $('#desc').textContent = `What will Brayan do?${b.canFlee() ? ' (He can FLEE.)' : ''}`;
    keypadOff(false);
  }
  const FLEE_NAMES = { hallA: 'INTO HALLWAY A', entrance: 'BACK TO THE ENTRANCE', classA: 'INTO CLASSROOM A', out: 'OUT THE FRONT DOORS, TO BUS 13' };
  const FLEE_DOCS = {
    hallA: 'Further into the school, where the fuel is. It’ll follow.',
    entrance: 'Back to the front hallway. If he has the keys and the fuel, he can get out from there.',
    classA: 'In there are his keys. And whatever’s making that sound. If it’s awake, don’t go in.',
    out: 'Keys, fuel, out the doors, onto Bus 13.',
    listen: 'Put an ear to the door of CLASSROOM A first: is it quiet in there, or is something moaning, or is it awake? (Newports make it much easier to hear.)',
  };
  function open(cmd) {
    const b = UI.b;
    const o = b.options();
    A().play('confirm');
    const btn = document.querySelectorAll('#keypad button')[CMDS.indexOf(cmd)];
    btn.classList.add('press');
    setTimeout(() => btn.classList.remove('press'), 120);
    let opts;
    let cols = 2;
    if (cmd === 'fight') {
      opts = [{ name: 'ATTACK', doc: DATA.attack.doc, ok: true, run: { type: 'attack' } }];
      cols = 1;
    } else if (cmd === 'skill') opts = o.skills.map((s) => ({ ...s, right: `${s.pat} PAT`, run: { type: 'skill', id: s.id } }));
    else if (cmd === 'act') opts = o.acts.map((a) => ({ ...a, run: { type: 'act', id: a.id } }));
    else if (cmd === 'item') opts = o.items.map((i) => ({ ...i, right: `×${i.count}`, run: { type: 'item', id: i.id } }));
    else {
      cols = 1;
      opts = o.flee.to.map((to) => ({ name: FLEE_NAMES[to], doc: FLEE_DOCS[to], ok: o.flee.ok, why: o.flee.why, special: to === 'out', run: { type: 'flee', to } }));
      if (o.flee.to.includes('classA')) opts.push({ name: 'CHECK CLASSROOM A', doc: FLEE_DOCS.listen, ok: o.flee.ok, why: o.flee.why, listen: true });
    }
    menu(cmd.toUpperCase(), opts, cols);
  }
  function menu(head, opts, cols = 2, canBack = true) {
    UI.mode = 'sub';
    UI.opts = opts;
    UI.optSel = Math.max(0, opts.findIndex((o) => o.ok));
    UI.cols = cols;
    $('#log').hidden = true;
    const m = $('#menu');
    m.hidden = false;
    m.classList.toggle('one', cols === 1);
    m.innerHTML =
      `<div class="head"><span>${head}</span>${canBack ? `<button class="back" type="button">${pixels(ICONS.left)}BACK</button>` : ''}</div>` +
      opts.map((o, i) => `<div class="opt${o.ok ? '' : ' no'}${o.special ? ' special' : ''}" data-i="${i}"><i>${pixels(ICONS.pencil)}</i><span>${o.name}</span>${o.right ? `<small>${o.right}</small>` : ''}</div>`).join('');
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
    const bk = m.querySelector('.back');
    if (bk) bk.addEventListener('click', back);
    drawMenu();
  }
  function drawMenu() {
    document.querySelectorAll('#menu .opt').forEach((el, i) => el.classList.toggle('sel', i === UI.optSel));
    const o = UI.opts[UI.optSel];
    $('#desc').textContent = o ? (o.ok ? o.doc || '' : `${o.why}. ${o.doc || ''}`) : '';
  }
  async function pick() {
    if (UI.mode !== 'sub') return;
    const o = UI.opts[UI.optSel];
    if (!o) return;
    if (!o.ok) return A().play('deny');
    A().play('confirm');
    if (o.listen) return listen();
    if (o.run.type === 'act' && o.run.id === 'distract') {
      const passed = await timing();
      return run({ ...o.run, passed });
    }
    run(o.run);
  }
  function back() {
    if (UI.mode !== 'sub') return;
    A().play('back');
    main();
  }

  // ------------------------------------------------------------------ a turn
  async function run(cmd) {
    UI.mode = 'busy';
    keypadOff(true);
    UI.view = snapshot(UI.b);
    UI.travel = null;
    const events = UI.b.command(cmd);
    await play(events);
    UI.view = null;
    refresh();
    after();
  }
  async function after() {
    const b = UI.b;
    if (b.over === 'lose') return lose();
    if (b.over === 'win') return calm('win');
    if (b.over === 'escape') {
      S().toBlack(true, 1.4);
      A().stopMusic(2.5);
      await real(1200);
      A().play('engine');
      await real(3600);
      A().play('breathOut');
      return calm('escape');
    }
    if (UI.travel) {
      const to = UI.travel;
      UI.travel = null;
      return travel(to);
    }
    main();
  }

  const FX_AT = { attack: 0.45, voice: 0.5, chair: 0.42, bec: 0.6, newports: 0.5, breath: 0.6, squint: 0.9, brace: 0.5, kids: 0.6 };
  const FOE_AT = { loom: 0.75, whisper: 0.7, faces: 0.65, lightsout: 0.7, aim: 0.85, lunge: 0.35 };
  async function play(events) {
    const b = UI.b;
    for (const e of events) {
      const v = UI.view;
      switch (e.t) {
        case 'log':
          await say(e.text, e.tone);
          break;
        case 'fx': {
          if (e.name === 'distract' && v) v.foeTags = foeTags(b);
          const ms = S().play(e.name);
          await wait(ms * (FX_AT[e.name] ?? 0.85));
          break;
        }
        case 'foe': {
          const ms = S().foeMove(e.move);
          await wait(ms * (FOE_AT[e.move] ?? 0.6));
          break;
        }
        case 'hit':
          if (e.who === 'foe') {
            if (v) v.foeHp = Math.max(0, v.foeHp - e.amount);
            UI.stats.dealt += e.amount;
            if (e.crit) window.AUDIO.play('crit');
            $('#foe').classList.remove('hit');
            void $('#foe').offsetWidth;
            $('#foe').classList.add('hit');
            const [x, y] = S().gunPoint('chest');
            S().popup(`${e.amount}`, x + (Math.random() - 0.5) * 60, y - 40, { color: e.crit ? '#e6c46a' : '#d0cabe', size: e.crit ? 42 : 32 });
          } else {
            if (v) v.hp = Math.max(0, v.hp - e.amount);
            UI.stats.taken += e.amount;
            S().hitHero(e.kind);
            A().play(e.kind === 'mind' ? 'mind' : 'hurt');
            $('#me').classList.remove('hit');
            void $('#me').offsetWidth;
            $('#me').classList.add('hit');
            S().popup(`${e.amount}`, 220, 470, { color: '#e07a6a', size: 32 });
          }
          refresh();
          await wait(420);
          break;
        case 'heal':
          if (v) v.hp = Math.min(b.hero.hpMax, v.hp + e.amount);
          if (e.amount > 0) {
            A().play('heal');
            S().popup(`+${e.amount}`, 220, 470, { color: '#8fd6a4', size: 32 });
          }
          refresh();
          await wait(380);
          break;
        case 'pat':
          if (v) v.pat = e.value;
          if (e.delta < 0) {
            A().play('patDown');
            S().popup(`-${-e.delta} PATIENCE`, 220, 520, { color: '#e0b94a', size: 22 });
          } else if (e.delta > 0) {
            A().play('patUp');
            S().popup(`+${e.delta} PATIENCE`, 220, 520, { color: '#e0b94a', size: 22 });
          }
          refresh();
          await wait(e.delta ? 300 : 0);
          break;
        case 'stunbar':
          if (v) v.stun = e.value;
          refresh();
          break;
        case 'stun':
          if (v) Object.assign(v, { stunned: true, stun: 0, foeTags: foeTags(b) });
          refresh();
          await wait(S().stun());
          break;
        case 'recover':
          if (v) Object.assign(v, { stunned: false, foeTags: foeTags(b) });
          refresh();
          await wait(S().recover());
          break;
        case 'tag':
          if (v) Object.assign(v, { heroTags: heroTags(b), foeTags: foeTags(b) });
          refresh();
          break;
        case 'gunshot': {
          const dodged = await dodgeTest();
          await play(b.shot(dodged));
          return;
        }
        case 'shot':
          await wait(S().shot(e.dodged) * 0.4);
          break;
        case 'frozen':
          A().play('frozen');
          S().hero.shake = 6;
          if (v) v.heroTags = heroTags(b);
          refresh();
          await wait(1200);
          break;
        case 'revive':
          if (v) Object.assign(v, { hp: e.hp, wind: false });
          A().play('revive');
          S().hero.gold = 1.4;
          refresh();
          await wait(1300);
          break;
        case 'round':
          if (v) Object.assign(v, snapshot(b));
          refresh();
          break;
        case 'flee':
          UI.travel = e.to;
          UI.classStage = e.stage;
          break;
        case 'win':
          A().stopMusic(3);
          await wait(S().gunDown());
          S().toBlack(true, 2);
          await real(2200);
          break;
        case 'lose':
          if (e.by === 'root') {
            await rootDeath(true);
            break;
          }
          A().stopMusic(2);
          A().play('lose');
          S().hero.down = 1;
          S().toBlack(true, 2);
          await real(2400);
          break;
        case 'escape':
          break;
      }
    }
  }

  // ------------------------------------------------------------------ going places
  async function travel(to) {
    const b = UI.b;
    UI.mode = 'travel';
    keypadOff(true);
    A().play('run');
    await real(S().toBlack(true, 0.5));
    S().setPlace(to);
    S().gun.on = false;
    S().gun.a = 0;
    refresh();
    await real(500);
    if (to === 'classA') {
      A().play('door');
      S().toBlack(false, 0.7);
      return classroom(UI.classStage || 1);
    }
    S().toBlack(false, 0.6);
    await real(600);
    if (to === 'hallA' && b.have.fuel < DATA.fuel) await searchHall();
    S().showGunman(true);
    await wait(700);
    await say(to === 'hallA' ? 'The Gunman is already there, at the far end of HALLWAY A. It was always going to be.' : 'The Gunman is back in the front hallway. Waiting.', 'foe');
    main();
  }
  function hudAway(away) {
    $('#hud').classList.toggle('away', away);
  }
  function toast(text, ms = 1500) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.hidden = true), ms);
  }
  // HALLWAY A: 25 seconds to find the can in the dark, before it's there again
  function searchHall() {
    return new Promise((resolve) => {
      UI.mode = 'search';
      hudAway(true);
      A().duck(0.4);
      $('#search').hidden = false;
      $('#search-back').hidden = true;
      $('#search-where').textContent = 'HALLWAY A';
      $('#search-what').innerHTML = 'FIND THE FUEL CAN';
      const t0 = performance.now();
      let lastTick = 99;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        $('#search').hidden = true;
        hudAway(false);
        A().duck(1);
        UI.mode = 'busy';
        resolve();
      };
      const timer = setInterval(() => {
        const left = Math.max(0, DATA.search - (performance.now() - t0) / 1000);
        const el = $('#search-time');
        el.textContent = `0:${String(Math.ceil(left)).padStart(2, '0')}`;
        el.classList.toggle('soon', left <= 5);
        if (left <= 5 && Math.ceil(left) !== lastTick) {
          lastTick = Math.ceil(left);
          A().play('tick');
        }
        if (left <= 0) {
          A().play('appear');
          finish();
        }
      }, 100);
      UI.found = (k) => {
        if (k !== 'can') return;
        UI.b.collect('can');
        refresh();
        toast(`FUEL CAN · ${UI.b.have.fuel}/${DATA.fuel}`);
        $('#search-what').innerHTML = '<span class="got">FIND THE FUEL CAN</span>';
        setTimeout(finish, 1600);
      };
    });
  }
  function tap(x, y) {
    const k = S().hitItem(x, y);
    if (!k) return;
    S().take(k);
    if (UI.found) UI.found(k);
  }

  // CLASSROOM A: the keys, and the bear one of the kids asked for. It's in there with him,
  // waking up: a root grows down out of the ceiling; then it's awake, and the roots come down
  // at him; in DATA.root.awake seconds it has him. Its sounds, all the while, lower and quieter.
  function classroom(stage) {
    const b = UI.b;
    UI.mode = 'class';
    hudAway(true);
    A().duck(0.15);
    $('#search').hidden = false;
    $('#search-back').hidden = false;
    $('#search-where').textContent = 'CLASSROOM A';
    $('#search-time').textContent = '';
    const goals = () =>
      ($('#search-what').innerHTML = `<span class="${b.have.keys ? 'got' : ''}">YOUR KEYS</span> · <span class="${b.have.bear ? 'got' : ''}">THE BEAR ONE OF THE KIDS ASKED FOR</span>`);
    goals();
    const R = DATA.root;
    let st = stage;
    let t = 0;
    let last = performance.now();
    let sound = null;
    let done = false;
    const voice = () => {
      if (sound) sound.stop(0.8);
      sound = st === 2 ? A().loop('moan2', { rate: 0.8, vol: 0.32 }) : st === 3 ? A().loop('moan3', { rate: 0.8, vol: 0.5 }) : null;
    };
    voice();
    const frame = (now) => {
      if (done) return;
      const dt = Math.min(0.5, (now - last) / 1000); // (real time: it doesn't wait for the frames)
      last = now;
      t += dt;
      if (st < 3 && t >= R.inside[st]) {
        st++;
        t = 0;
        voice();
        if (st === 3) A().play('creak');
      }
      const grow = st === 1 ? (t / R.inside[1]) * 0.3 : st === 2 ? 0.3 + (t / R.inside[2]) * 0.5 : 0.8 + (t / R.awake) * 0.2;
      S().roomState({ stage: st, grow: Math.min(1, grow), fall: st === 3 ? t / R.awake : 0, tree: st === 1 ? 0 : st === 2 ? 0.12 : 0.25 + (t / R.awake) * 0.4 });
      if (st === 3 && t >= R.awake) {
        done = true;
        if (sound) sound.stop(0.1);
        rootDeath(false).then(lose);
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    UI.found = (k) => {
      b.collect(k);
      refresh();
      goals();
      toast(k === 'keys' ? 'YOUR KEYS · BUS 13' : 'THE BEAR');
    };
    UI.leave = async () => {
      if (done) return;
      done = true;
      UI.leave = null;
      A().play('confirm');
      if (sound) sound.stop(0.6);
      $('#search').hidden = true;
      b.leaveClass();
      A().play('run');
      await real(S().toBlack(true, 0.4));
      S().roomState({ stage: 1, grow: 0, fall: 0, tree: 0 });
      S().setPlace('hallA');
      A().duck(1);
      hudAway(false);
      refresh();
      await real(400);
      S().toBlack(false, 0.6);
      S().showGunman(true);
      await real(700);
      await say('Back out in HALLWAY A. The Gunman is right where Brayan left it.', 'foe');
      main();
    };
  }
  // It has him: the frames, too fast, its sound, static. (`walkedIn`: it was awake when he went in.)
  async function rootDeath(walkedIn) {
    UI.mode = 'dead';
    const b = UI.b;
    $('#search').hidden = true;
    if (walkedIn) {
      A().play('run');
      await real(S().toBlack(true, 0.4));
      S().gun.on = false;
      S().gun.a = 0;
      S().setPlace('classA');
      hudAway(true);
      A().duck(0.1, 0.3);
      A().play('door');
      S().toBlack(false, 0.5);
      await real(900);
    }
    A().stopMusic(0.3);
    A().stopLoops(0.1);
    A().sample('moan3', { rate: 1.2, vol: 1 });
    A().play('static', 3.2);
    const ms = S().rootScare();
    await real(ms);
    S().toBlack(true, 0.01);
    if (!b.over) b.lose('root', []);
    hudAway(false);
    await real(600);
  }

  // An ear to the door of CLASSROOM A: what's in there, on a visualizer, the music down low.
  // With SHARP EARS (Newports) it's loud and clear, and he can say what it is.
  async function listen() {
    const b = UI.b;
    UI.mode = 'listen';
    keypadOff(true);
    const stage = b.rootStage();
    const ears = b.hero.ears > 0;
    A().duck(0.06, 0.5);
    const catcher = $('#listen-catch');
    catcher.hidden = false;
    $('#listen').hidden = false;
    $('#listen-text').textContent = '';
    A().play('door');
    let stop;
    const stopped = new Promise((r) => (stop = r));
    // (a tap, anywhere, or a key: it stops; the tap goes nowhere else)
    const onTap = (e) => {
      e.preventDefault();
      e.stopPropagation();
      stop();
    };
    catcher.addEventListener('pointerdown', onTap);
    UI.stopListening = stop;
    const h = stage === 2 ? A().loop('moan2', { vol: ears ? 0.6 : 0.16 }) : stage === 3 ? A().loop('moan3', { vol: ears ? 0.65 : 0.18 }) : null;
    const cv = $('#listen-bars');
    const x = cv.getContext('2d');
    const t0 = performance.now();
    let done = false;
    const draw = (now) => {
      if (done) return;
      x.fillStyle = '#05070b';
      x.fillRect(0, 0, cv.width, cv.height);
      const lv = A().levels(28);
      const n = lv.length;
      const bw = Math.floor(cv.width / n);
      for (let i = 0; i < n; i++) {
        const v = Math.min(1, lv[i] * (ears ? 1.4 : 1) + Math.random() * 0.04);
        const hgt = Math.round((v * (cv.height - 10)) / 6) * 6 + 6;
        x.fillStyle = v > 0.5 ? '#e0473c' : v > 0.2 ? '#f5b800' : '#3c6f5a';
        for (let y = cv.height - 6; y > cv.height - hgt; y -= 6) x.fillRect(i * bw + 2, y, bw - 4, 4);
      }
      if (now - t0 > 2500 && !$('#listen-text').textContent) {
        $('#listen-text').textContent = ears
          ? ['Nothing. Not a sound. It’s quiet in there.', 'Something in there is moaning, low. Half asleep, maybe.', 'It’s awake in there. It’s right against the door, breathing. Don’t go in.'][stage - 1]
          : 'Over his own heartbeat, Brayan can’t be sure what he’s hearing.';
      }
      if (now - t0 > 45000) stop(); // (he doesn't stand there forever)
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    await stopped;
    done = true;
    UI.stopListening = null;
    catcher.removeEventListener('pointerdown', onTap);
    if (h) h.stop(0.4);
    $('#listen').hidden = true;
    A().play('back');
    A().duck(1);
    // the catcher stays a moment longer, so the rest of the tap (and any second one) lands on it
    const swallow = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    catcher.addEventListener('click', swallow);
    await real(350);
    catcher.removeEventListener('click', swallow);
    catcher.hidden = true;
    open('flee');
  }

  // ------------------------------------------------------------------ in real time: the dodge, the timing
  // The gun comes up; he cocks it; DODGE shows, for a moment. In time, and he's on the floor.
  function dodgeTest() {
    return new Promise((resolve) => {
      UI.mode = 'dodge';
      S().cock();
      const WINDOW = 1000;
      let shown = 0;
      let done = false;
      const end = (dodged) => {
        if (done) return;
        done = true;
        UI.dodge = null;
        $('#dodge').hidden = true;
        UI.mode = 'busy';
        resolve(dodged);
      };
      setTimeout(() => {
        $('#dodge').hidden = false;
        shown = performance.now();
        UI.dodge = () => end(true);
        setTimeout(() => end(false), WINDOW);
      }, 650);
    });
  }
  // DISTRACT: a mark sweeping back and forth; stop it in the gap. Once.
  function timing() {
    return new Promise((resolve) => {
      UI.mode = 'timing';
      $('#menu').hidden = true;
      $('#log').hidden = true;
      const el = $('#timing');
      el.hidden = false;
      el.className = '';
      const zw = 0.085;
      const z0 = 0.15 + Math.random() * (0.7 - zw);
      $('#timing-zone').style.left = `${z0 * 100}%`;
      $('#timing-zone').style.width = `${zw * 100}%`;
      $('#desc').textContent = 'Wait for it...';
      const t0 = performance.now();
      const period = 900; // ms, one way
      let pos = 0;
      let done = false;
      const finish = (passed) => {
        if (done) return;
        done = true;
        UI.timingPress = null;
        el.classList.add(passed ? 'hit' : 'miss');
        A().play(passed ? 'pass' : 'fail');
        setTimeout(() => {
          el.hidden = true;
          $('#log').hidden = false;
          UI.mode = 'busy';
          resolve(passed);
        }, 700);
      };
      const step = (now) => {
        if (done) return;
        const q = ((now - t0) / period) % 2;
        pos = q < 1 ? q : 2 - q;
        $('#timing-mark').style.left = `${pos * 100}%`;
        if (now - t0 > 6000) return finish(false);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      UI.timingPress = () => finish(pos >= z0 - 0.01 && pos <= z0 + zw + 0.01);
    });
  }
  function timingPress() {
    if (UI.timingPress) UI.timingPress();
  }

  // ------------------------------------------------------------------ keys
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
    if (UI.mode === 'dodge') {
      if (['d', 'D', ' ', 'Enter', 'z'].includes(k) && UI.dodge) UI.dodge();
      e.preventDefault();
      return;
    }
    if (UI.mode === 'timing') {
      if ([' ', 'Enter', 'z'].includes(k)) timingPress();
      e.preventDefault();
      return;
    }
    if (UI.mode === 'class') {
      if (k === 'Escape' || k === 'x') UI.leave && UI.leave();
      return;
    }
    if (UI.mode === 'listen') {
      if (UI.stopListening) UI.stopListening();
      e.preventDefault();
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
      keypadOff(false);
      e.preventDefault();
      return;
    }
    if (UI.mode === 'sub') {
      const n = UI.opts.length;
      const cols = UI.cols;
      let i = UI.optSel;
      if (k === 'ArrowRight' && cols > 1) i = Math.min(n - 1, i + 1);
      else if (k === 'ArrowLeft' && cols > 1) i = Math.max(0, i - 1);
      else if (k === 'ArrowDown') i = Math.min(n - 1, i + cols);
      else if (k === 'ArrowUp') i = Math.max(0, i - cols);
      else if (k === 'Enter' || k === 'z' || k === ' ') return pick();
      else if (k === 'Escape' || k === 'x' || k === 'Backspace') return back();
      else return;
      if (i !== UI.optSel) A().play('move');
      UI.optSel = i;
      drawMenu();
      e.preventDefault();
    }
  }

  UI.debug = { run, open, main, play, travel, listen, classroom, searchHall, timing, dodgeTest };
})();
