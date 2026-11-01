/*
 * The scene: Chris's living room at night (grainy, darker, the lights able to come up), the
 * creature standing in it, and a screen effect for every move, item and act. Everything but the
 * room is drawn at a third of the resolution and blown up, so the effects, the numbers and the
 * creature are all the same chunky pixels; even their see-through parts are dithered, and the
 * effects are muted and grainy, like the item sheet: nothing bright, nothing cheerful. The props
 * are pixel art: the trash bag, the grilled cheese and the sword from one sheet; the wine glass,
 * the pills, the cracked phone, the car keys and the text bubble from another; the alarm clock and
 * the bird from a third; the RG 405M from its own; and little ones drawn here (a gavel...). Words from attacks go in the battle log,
 * not on screen.
 */
(function () {
  const W = 1280;
  const H = 960;
  const PX = 3; // screen pixels to each of the effects' pixels
  const LW = Math.ceil(W / PX);
  const LH = H / PX;
  const FONT = '"Pixelify Sans", "Courier New", monospace';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const A = () => window.AUDIO;
  const sfx = (name, ms = 0) => (ms ? setTimeout(() => A().play(name), ms) : A().play(name));

  const S = {
    t: 0,
    lights: 0, // how far the lights are up, 0..1
    lightsTarget: 0,
    flicker: 0,
    shake: 0,
    wobble: 0,
    effects: [],
    popups: [],
    splats: [], // blood on the screen while it ADJUSTS
    real: false, // the sword is real
    black: 0, // the room's lights cut out (the creature's Flicker)
    speaker: null, // the speaker on the floor: { on, fade, broken, debris }
    door: 0, // the front door, 0 shut .. 1 open: the night comes in
    beam: 0, // the car's headlights through the blinds, when they get away
    beamX: 0,
    doorTarget: 0,
    hero: { shake: 0, flash: 0, dx: 0, gold: 0, afraid: false, critical: false, down: 0, away: 0 }, // his portrait's state
  };
  window.SCENE = S;

  // ------------------------------------------------------------------ pixel props
  // Little pixel-art sprites: rows of characters, one colour each.
  const PROPS = {
    gavel: {
      pal: { b: '#5e4a36', d: '#3a2c20', l: '#7a6448', y: '#8a7440' },
      rows: ['..llllllll....', '.lbbbbbbbbd...', 'ylbbbbbbbbdy..', 'ylbbbbbbbbdy..', '.lbbbbbbbbd...', '..dddddddd....', '.....bd.......', '.....bd.......', '.....bd.......', '.....bd.......', '.....bd.......', '.....dd.......'],
    },
    choc: {
      pal: { f: '#8e9094', F: '#6a6d72', b: '#2a170e', B: '#3e2416', h: '#55341e' },
      rows: ['ffffbbbbbbbbbb', 'FffFbBhbBhbBhb', 'ffffbBBbBBbBBb', 'FffFbbbbbbbbbb', 'ffffbBhbBhbBhb', 'FffFbBBbBBbBBb', 'ffffbbbbbbbbbb'],
    },
    // the family's shapes in the dark, for the creature's Lure (lit at the edges by the windows)
    adult: {
      pal: { k: '#1d222b', r: '#7d8ea6' },
      rows: ['..rrr..', '.rkkkr.', '.rkkkr.', '..rkr..', '.rkkkr.', 'rkkkkkr', 'rkkkkkr', 'rkkkkkr', 'rkkkkkr', '.kkkkk.', '.kkkkk.', '.kk.kk.', '.kk.kk.', '.kk.kk.', '.kk.kk.', '.rr.rr.'],
    },
    veranda: {
      pal: { k: '#1d222b', r: '#7d8ea6' },
      rows: ['..rrr..', '.rkkkr.', 'rkkkkkr', 'rkkkkkr', 'rkkkkkr', 'rkkkkkr', 'rkkkkkr', '.kkkkk.', '.kkkkk.', '.kkkkk.', '.kkkkk.', '.kk.kk.', '.kk.kk.', '.kk.kk.', '.kk.kk.', '.rr.rr.'],
    },
    heart: {
      pal: { r: '#8a5a52', R: '#6a2a26' },
      rows: ['.rr.rr.', 'rRRrRRr', 'rRRRRRr', '.rRRRr.', '..rRr..', '...r...'],
    },
    flag: {
      pal: { p: '#5e4a36', w: '#a8a298', W: '#7e7a72' },
      rows: ['pwwwwwwwww', 'pwwwwwwwwW', 'pwwwwwwwWW', 'pwwwwwwwww', 'pWwwwwwwww', 'pWWwwwwwwW', 'p.........', 'p.........', 'p.........', 'p.........', 'p.........', 'p.........'],
    },
  };
  const sprites = {};
  // 3x5 letters, like the ones in the item sheet's text bubble
  const GLYPHS = {
    a: ['...', '.XX', 'X.X', 'X.X', '.XX'], b: ['X..', 'XX.', 'X.X', 'X.X', 'XX.'], c: ['...', '.XX', 'X..', 'X..', '.XX'],
    d: ['..X', '.XX', 'X.X', 'X.X', '.XX'], e: ['...', '.X.', 'XXX', 'X..', '.XX'], f: ['.XX', 'X..', 'XX.', 'X..', 'X..'],
    g: ['...', '.XX', 'X.X', '.XX', 'XX.'], h: ['X..', 'XX.', 'X.X', 'X.X', 'X.X'], i: ['.X.', '...', '.X.', '.X.', '.X.'],
    j: ['..X', '...', '..X', 'X.X', '.X.'], k: ['X..', 'X.X', 'XX.', 'X.X', 'X.X'], l: ['.X.', '.X.', '.X.', '.X.', '.X.'],
    m: ['...', 'X.X', 'XXX', 'X.X', 'X.X'], n: ['...', 'XX.', 'X.X', 'X.X', 'X.X'], o: ['...', '.X.', 'X.X', 'X.X', '.X.'],
    p: ['...', 'XX.', 'X.X', 'XX.', 'X..'], q: ['...', '.XX', 'X.X', '.XX', '..X'], r: ['...', 'X.X', 'XX.', 'X..', 'X..'],
    s: ['.XX', 'X..', '.X.', '..X', 'XX.'], t: ['.X.', 'XXX', '.X.', '.X.', '..X'], u: ['...', 'X.X', 'X.X', 'X.X', '.XX'],
    v: ['...', 'X.X', 'X.X', 'X.X', '.X.'], w: ['...', 'X.X', 'X.X', 'XXX', 'X.X'], x: ['...', 'X.X', '.X.', '.X.', 'X.X'],
    y: ['...', 'X.X', 'X.X', '.XX', 'XX.'], z: ['...', 'XXX', '..X', '.X.', 'XXX'],
    0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], 1: ['.X.', 'XX.', '.X.', '.X.', 'XXX'], 2: ['XX.', '..X', '.X.', 'X..', 'XXX'],
    3: ['XX.', '..X', '.X.', '..X', 'XX.'], 4: ['X.X', 'X.X', 'XXX', '..X', '..X'], 5: ['XXX', 'X..', 'XX.', '..X', 'XX.'],
    6: ['.XX', 'X..', 'XX.', 'X.X', '.X.'], 7: ['XXX', '..X', '.X.', '.X.', '.X.'], 8: ['.X.', 'X.X', '.X.', 'X.X', '.X.'],
    9: ['.X.', 'X.X', '.XX', '..X', 'XX.'], '.': ['...', '...', '...', '...', '.X.'], ',': ['...', '...', '...', '.X.', 'X..'],
    '?': ['XX.', '..X', '.X.', '...', '.X.'], '!': ['.X.', '.X.', '.X.', '...', '.X.'], ':': ['...', '.X.', '...', '.X.', '...'],
    "'": ['.X.', '.X.', '...', '...', '...'], '-': ['...', '...', 'XXX', '...', '...'],
  };
  // Writes in those letters, at one canvas pixel to each of theirs.
  function pixText(x, str, x0, y0, col) {
    x.fillStyle = col;
    [...str].forEach((ch, i) => (GLYPHS[ch] || []).forEach((row, yy) => [...row].forEach((v, xx) => v === 'X' && x.fillRect(x0 + i * 4 + xx, y0 + yy, 1, 1))));
  }
  // The item sheet's blank text bubble, with lines of text in it and a "read" time under it.
  function textBubble(lines, read) {
    const key = 'msg:' + lines.join('|') + '|' + read;
    if (sprites[key]) return key;
    const base = sprites.bubbleBlank;
    if (!base || !base.width) return null;
    const c = document.createElement('canvas');
    c.width = base.width;
    c.height = base.height + 8;
    const x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    lines.forEach((l, i) => pixText(x, l, 6, 5 + i * 7, '#161618'));
    if (read) pixText(x, read, base.width - read.length * 4, base.height + 2, '#58585a');
    sprites[key] = c;
    return key;
  }
  // The family checklist: a scrap of paper, with the ones already out crossed off.
  const FAMILY = ['veranda', 'justin', 'erik'];
  const LIST = { w: 44, h: 34, row: (i) => 11 + i * 7, name: 11 };
  function checklist(done) {
    const key = 'list:' + done;
    if (sprites[key]) return key;
    const c = document.createElement('canvas');
    c.width = LIST.w;
    c.height = LIST.h;
    const x = c.getContext('2d');
    for (let yy = 0; yy < LIST.h; yy++) {
      for (let xx = 0; xx < LIST.w; xx++) {
        if (yy >= LIST.h - 3 && (xx * 7 + yy * 3) % 5 < yy - (LIST.h - 4)) continue; // torn along the bottom
        const n = ((xx * 73856093) ^ (yy * 19349663)) & 7;
        x.fillStyle = n < 2 ? '#86817a' : n < 6 ? '#9a958a' : '#aaa59a';
        x.fillRect(xx, yy, 1, 1);
      }
    }
    pixText(x, 'get out', 3, 3, '#161618');
    FAMILY.forEach((nm, i) => {
      const y = LIST.row(i);
      x.fillStyle = '#161618';
      x.fillRect(3, y, 5, 1);
      x.fillRect(3, y + 4, 5, 1);
      x.fillRect(3, y, 1, 5);
      x.fillRect(7, y, 1, 5);
      pixText(x, nm, LIST.name, y, i < done ? '#4a4844' : '#161618');
      if (i < done) {
        x.fillStyle = '#5a1414';
        x.fillRect(LIST.name - 1, y + 2, nm.length * 4 + 1, 1); // crossed off
        x.fillRect(4, y + 1, 1, 1);
        x.fillRect(5, y + 2, 1, 1);
        x.fillRect(6, y + 3, 1, 1);
        x.fillRect(6, y + 1, 1, 1);
        x.fillRect(4, y + 3, 1, 1);
      }
    });
    sprites[key] = c;
    return key;
  }
  function pixelSprite({ pal, rows }) {
    const c = document.createElement('canvas');
    c.width = rows[0].length;
    c.height = rows.length;
    const x = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, i) => {
      if (pal[ch]) {
        x.fillStyle = pal[ch];
        x.fillRect(i, y, 1, 1);
      }
    }));
    return c;
  }
  // ------------------------------------------------------------------ setup
  S.init = function (images) {
    S.bg = new Image();
    S.bg.src = images.night;
    S.bgLit = new Image();
    S.bgLit.src = images.nightLit;
    for (const k in PROPS) sprites[k] = pixelSprite(PROPS[k]);
    // the trash bag, the grilled cheese and the sword, from their sheet. The game's sword is
    // foam, so it's the sheet's sword greyed and lightened, until Taste of Reality makes it real.
    for (const [k, src] of Object.entries(images.props)) {
      const im = new Image();
      im.onload = () => {
        sprites[k] = im;
        if (k === 'sword') {
          const c = document.createElement('canvas');
          c.width = im.width;
          c.height = im.height;
          const x = c.getContext('2d');
          x.filter = 'grayscale(0.85) brightness(1.3) contrast(0.85)';
          x.drawImage(im, 0, 0);
          sprites.swordReal = im;
          sprites.sword = c;
        }
      };
      im.src = src;
    }
    // the creature's arms (one for each stage), its jaw (in halves), the killer, and the
    // pictures after his jumpscare
    const load = (key, src) => {
      const im = new Image();
      im.onload = () => (sprites[key] = im);
      im.src = src;
    };
    (images.arms || []).forEach((src, i) => load('arm' + i, src));
    ARM_META = images.armMeta || [];
    (images.jaw || []).forEach((src, i) => load('jaw' + i, src));
    JAW_META = images.jawMeta || [];
    if (images.killer) load('killer', images.killer);
    (images.scares || []).forEach((src, i) => load('scare' + i, src));
    SCARES = (images.scares || []).length;
    // the layers everything but the room is drawn on, small: the creature (under the HUD), and
    // the effects (over it)
    const layer = () => {
      const c = document.createElement('canvas');
      c.width = LW;
      c.height = LH;
      return { c, x: c.getContext('2d', { willReadFrequently: true }) };
    };
    S.low = layer();
    S.lowFx = layer();
    // film grain, a few frames of it to cycle through
    S.grain = [];
    for (let k = 0; k < 6; k++) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d');
      const d = x.createImageData(256, 256);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.random() * 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      S.grain.push(c);
    }
  };

  // ------------------------------------------------------------------ positions
  const C = () => window.CREATURE;
  // Crispy's portrait, in his box at the bottom left
  let ARM_META = [];
  let JAW_META = [];
  let SCARES = 0;
  const SPEAKER = [1000, 734]; // where the speaker sits on the floor (its base)
  S.heroPoint = (k) => ({ head: [160, 600], chest: [160, 690], eyes: [165, 620], side: [330, 640] }[k] || [160, 640]);
  S.foePoint = (k) => C().point(k);

  // ------------------------------------------------------------------ effects
  function add(dur, draw, o = {}) {
    S.effects.push({ t0: S.t, dur: dur / 1000, draw, top: o.top });
    return dur;
  }
  S.popup = function (text, x, y, o = {}) {
    S.popups.push({ text, x, y, t0: S.t, color: o.color || '#fff', size: o.size || 44, dur: o.dur || 1.1 });
  };
  function drawSprite(ctx, key, x, y, scale, o = {}) {
    const sp = sprites[key];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    const sx = scale * (o.sx || 1);
    const sy = scale * (o.sy || 1);
    const ax = o.ax != null ? o.ax : 0.5;
    const ay = o.ay != null ? o.ay : 0.5;
    ctx.drawImage(sp, -sp.width * sx * ax, -sp.height * sy * ay, sp.width * sx, sp.height * sy);
    ctx.restore();
  }
  function bigText(ctx, text, x, y, size, fill, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || 700} ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (o.rot) {
      ctx.translate(x, y);
      ctx.rotate(o.rot);
      x = y = 0;
    }
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(PX * 2, size * 0.18);
    ctx.strokeStyle = o.stroke || '#0b0b0d';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function particles(n, x, y, f) {
    const list = [];
    for (let i = 0; i < n; i++) list.push(f(i, Math.random(), Math.random(), Math.random()));
    return list.map((q) => ({ x, y, ...q }));
  }
  function bolt(ctx, x0, y0, x1, y1, jag, w, color) {
    const n = 10;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ctx.lineTo(x0 + (x1 - x0) * t + (Math.random() - 0.5) * jag, y0 + (y1 - y0) * t + (Math.random() - 0.5) * jag);
    }
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  function star(ctx, x, y, r, color, thin = 0.18) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * thin : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  }
  function clawMarks(ctx, x, y, p, n = 3, color = '#5e1014') {
    const q = clamp(p * 3, 0, 1);
    const fade = 1 - clamp((p - 0.5) * 2, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ox = x - 60 + i * 34;
      ctx.strokeStyle = '#0a0102';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(ox, y - 90);
      ctx.lineTo(ox + 70 * q, y - 90 + 170 * q);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // The swing of the sword: its grip off to the left of the creature, the blade sweeping from
  // up over the shoulder, across its chest, down to the floor. A faint trail, a puff of dust.
  function swingFx(real) {
    const [cx, cy] = S.foePoint('chest');
    const px = cx - 270;
    const py = cy - 10;
    sfx(real ? 'realSlash' : 'swing');
    const dust = particles(10, cx, cy, (i, a, b) => ({ vx: (a - 0.5) * 300, vy: -b * 200 }));
    return add(700, (ctx, p) => {
      const a = -0.9 + ease(clamp(p / 0.6, 0, 1)) * 3.0; // 0 = blade straight up, clockwise
      const fade = 1 - clamp((p - 0.7) / 0.3, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.16 * fade;
      ctx.strokeStyle = real ? '#8a9aa4' : '#8a8478';
      ctx.lineWidth = 40;
      ctx.beginPath();
      ctx.arc(px, py, 300, Math.max(-0.9, a - 1.1) - Math.PI / 2, a - Math.PI / 2);
      ctx.stroke();
      ctx.restore();
      drawSprite(ctx, real ? 'swordReal' : 'sword', px, py, PX, { rot: a, ax: 0.5, ay: 0.9, alpha: fade });
      if (real && p > 0.3 && p < 0.6) {
        // a thin, dark cut where the real blade went through
        ctx.strokeStyle = '#2a0608';
        ctx.lineWidth = PX * 2;
        ctx.beginPath();
        ctx.moveTo(cx - 150, cy - 150);
        ctx.lineTo(cx - 150 + 300 * clamp((p - 0.3) / 0.15, 0, 1), cy - 150 + 280 * clamp((p - 0.3) / 0.15, 0, 1));
        ctx.stroke();
      }
      if (p > 0.32) {
        const tt = (p - 0.32) * 0.7;
        ctx.fillStyle = `rgba(90,84,76,${0.8 * (1 - p)})`;
        for (const d of dust) ctx.fillRect(d.x + d.vx * tt, d.y + d.vy * tt + 300 * tt * tt, PX * 3, PX * 3);
      }
    });
  }

  const FX = {
    swing: () => swingFx(false),
    realSlash: () => swingFx(true),

    trash() {
      const [cx, cy] = S.foePoint('chest');
      sfx('trash');
      return add(950, (ctx, p) => {
        const q = ease(clamp(p / 0.55, 0, 1));
        // round in an arc from Crispy, overhead, down onto it
        const x = 330 + (cx - 330) * q;
        const y = 600 - Math.sin(q * Math.PI) * 330 + (cy - 600) * q;
        const squash = p > 0.55 && p < 0.75 ? 1 - Math.sin(((p - 0.55) / 0.2) * Math.PI) * 0.3 : 1;
        const fade = 1 - clamp((p - 0.82) / 0.18, 0, 1);
        drawSprite(ctx, 'bag', x, y, PX, { rot: q * 2.6, sx: 1 / squash, sy: squash, alpha: fade });
      });
    },
    tear() {
      const [cx, cy] = S.foePoint('chest');
      sfx('tear');
      sfx('poison', 350);
      const junk = particles(22, cx, cy, (i, a, b, c) => ({ vx: (a - 0.5) * 800, vy: -250 - b * 500, kind: i % 5, spin: (c - 0.5) * 10 }));
      return add(1100, (ctx, p) => {
        const tt = p * 1.1;
        for (const j of junk) {
          ctx.save();
          ctx.translate(j.x + j.vx * tt, j.y + j.vy * tt + 900 * tt * tt);
          ctx.rotate(j.spin * tt);
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = ['#6e6232', '#5e6268', '#8a867c', '#3a4422', '#3e3024'][j.kind];
          if (j.kind === 0) ctx.fillRect(-12, -4, 24, 8);
          else if (j.kind === 1) ctx.fillRect(-6, -10, 12, 20);
          else if (j.kind === 2) ctx.fillRect(-10, -8, 20, 14);
          else ctx.fillRect(-6, -6, 12, 12);
          ctx.restore();
        }
        // garbage juice, seeping down it
        ctx.fillStyle = 'rgba(58,74,34,0.8)';
        for (let i = 0; i < 7; i++) ctx.fillRect(cx - 70 + i * 22, cy - 20 + ((i * 37) % 50), PX * 2, 30 + p * 140 * (0.5 + (i % 3) / 3));
      });
    },
    early() {
      // the cracked alarm clock rattles; the bird lands on it, pecks, and goes for the creature
      sfx('early');
      const [fx, fy] = S.foePoint('head');
      return add(2000, (ctx, p) => {
        const fade = 1 - clamp((p - 0.88) / 0.12, 0, 1);
        const shake = p > 0.12 && p < 0.6 ? Math.round(Math.sin(S.t * 70) * 1.5) * PX : 0;
        drawSprite(ctx, 'clock', 470 + shake, 470 + 30 * (1 - ease(Math.min(1, p / 0.15))), PX * 1.5, { alpha: Math.min(1, p / 0.12) * fade, rot: shake ? Math.sin(S.t * 50) * 0.03 : 0 });
        let bx;
        let by;
        let rot = 0;
        if (p < 0.45) {
          // it flies in from the dark and lands on top of the clock
          const q = ease(clamp((p - 0.18) / 0.27, 0, 1));
          bx = -80 + (470 + 80) * q;
          by = 140 + (300 - 140) * q - Math.sin(q * Math.PI) * 60;
        } else if (p < 0.7) {
          // two pecks at it
          bx = 470;
          by = 300;
          rot = Math.max(0, Math.sin(((p - 0.45) / 0.25) * Math.PI * 2)) * 0.5;
        } else {
          // and off, at the creature
          const q = (p - 0.7) / 0.3;
          bx = 470 + (fx - 470) * ease(q);
          by = 300 + (fy - 300) * ease(q) - Math.sin(q * Math.PI) * 60;
        }
        if (p > 0.18) drawSprite(ctx, 'bird', bx, by, PX * 1.1, { sx: -1, ay: 1, rot, alpha: fade });
      });
    },
    authority(o = {}) {
      const onFoe = o.target === 'foe';
      const [x, y] = onFoe ? S.foePoint('head') : S.heroPoint('head');
      sfx('gavel', 380);
      return add(1300, (ctx, p) => {
        const drop = ease(clamp(p / 0.3, 0, 1));
        const lift = p > 0.4 && p < 0.55 ? Math.sin(((p - 0.4) / 0.15) * Math.PI) * 0.5 : 0;
        drawSprite(ctx, 'gavel', x + 40, y - 40, PX * 3, { rot: -1.2 + drop * 1.2 - lift, ax: 0.45, ay: 0.95, alpha: 1 - clamp((p - 0.85) / 0.15, 0, 1) });
        if (p > 0.28) {
          const q = (p - 0.28) / 0.72;
          ctx.save();
          ctx.globalAlpha = 0.6 * (1 - q);
          ctx.strokeStyle = '#2a2420';
          ctx.lineWidth = PX * 2;
          ctx.beginPath();
          ctx.ellipse(x, y + 40, 60 + q * 200, 20 + q * 60, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          if (p < 0.34) S.shake = Math.max(S.shake, 6);
        }
      });
    },
    rg() {
      // the RG 405M comes up; its screen (something is standing in it) fizzes with static, and
      // thin, cold arcs leave the screen for the creature
      sfx('rg');
      const [cx, cy] = S.foePoint('chest');
      const ox = 500;
      const oy = 620;
      const k = PX * 1.2; // screen pixels to each of the console's
      return add(1800, (ctx, p) => {
        const rise = ease(clamp(p / 0.25, 0, 1));
        const y = oy + 90 * (1 - rise);
        const a = 1 - clamp((p - 0.88) / 0.12, 0, 1);
        drawSprite(ctx, 'rg', ox, y, k, { alpha: a });
        const sx = ox + 1.5 * k;
        const sy = y - 3 * k;
        if (p > 0.2 && p < 0.88) {
          // static over its screen
          ctx.fillStyle = `rgba(150,170,154,${0.12 + Math.random() * 0.25})`;
          ctx.fillRect(sx - 17 * k, sy - 14 * k, 34 * k, 28 * k);
          ctx.fillStyle = 'rgba(20,26,22,0.6)';
          for (let i = 0; i < 4; i++) ctx.fillRect(sx - 17 * k, sy - 14 * k + Math.floor(Math.random() * 28) * k, 34 * k, k);
        }
        if (p > 0.32 && p < 0.85) {
          for (let i = 0; i < 2; i++) bolt(ctx, sx, sy, cx + (Math.random() - 0.5) * 80, cy + (Math.random() - 0.5) * 160, 70, PX, i ? '#4e5e66' : '#8a9ca4');
          for (let i = 0; i < 3; i++) {
            const an = Math.random() * Math.PI * 2;
            bolt(ctx, cx, cy, cx + Math.cos(an) * 100, cy + Math.sin(an) * 160, 30, PX, '#5e7480');
          }
          ctx.fillStyle = 'rgba(150,158,162,0.35)';
          for (let i = 0; i < 46; i++) ctx.fillRect(cx - 160 + Math.random() * 320, cy - 260 + Math.random() * 520, PX * (1 + Math.floor(Math.random() * 5)), PX);
          S.shake = Math.max(S.shake, 2);
        }
      });
    },
    wine() {
      sfx('wine');
      const x = 410;
      const y = 560;
      const drops = particles(5, 0, 0, (i, a) => ({ at: 0.45 + i * 0.07, dx: (a - 0.5) * 24 }));
      return add(1600, (ctx, p) => {
        const up = ease(clamp(p / 0.25, 0, 1));
        const tilt = p > 0.35 && p < 0.85 ? -Math.sin(((p - 0.35) / 0.5) * Math.PI) * 0.8 : 0;
        drawSprite(ctx, 'glass', x, y + 60 * (1 - up), PX * 1.2, { rot: tilt, alpha: 1 - clamp((p - 0.88) / 0.12, 0, 1) });
        // a few drops, dark as blood
        ctx.fillStyle = '#3a0a0e';
        for (const d of drops) {
          const q = p - d.at;
          if (q > 0 && q < 0.35) ctx.fillRect(x - 40 + d.dx, y - 70 + q * 900, PX * 2, PX * 3);
        }
        S.wobble = p > 0.6 ? Math.sin(((p - 0.6) / 0.4) * Math.PI) * 6 : 0;
      });
    },
    slice() {
      sfx('slice');
      const [cx, cy] = S.foePoint('chest');
      const bits = particles(16, cx, cy, (i, a, b) => ({ vx: (a - 0.5) * 600, vy: (b - 0.7) * 500, s: PX * (1 + (i % 2)) }));
      return add(1000, (ctx, p) => {
        ctx.save();
        ctx.lineCap = 'butt';
        for (const [k, t0] of [[0, 0], [1, 0.18]]) {
          const q = clamp((p - t0) / 0.15, 0, 1);
          const fade = 1 - clamp((p - t0 - 0.25) / 0.3, 0, 1);
          if (q <= 0 || fade <= 0) continue;
          ctx.globalAlpha = fade;
          const s = k ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(cx - 180 * s, cy - 200);
          ctx.lineTo(cx - 180 * s + 360 * s * q, cy - 200 + 380 * q);
          ctx.strokeStyle = '#140405';
          ctx.lineWidth = PX * 3;
          ctx.stroke();
          ctx.strokeStyle = '#a49a86';
          ctx.lineWidth = PX;
          ctx.stroke();
        }
        ctx.restore();
        if (p > 0.25) {
          const tt = (p - 0.25) * 1.2;
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = '#4a1012';
          for (const b of bits) ctx.fillRect(b.x + b.vx * tt, b.y + b.vy * tt + 700 * tt * tt, b.s, b.s);
          ctx.globalAlpha = 1;
        }
      });
    },
    taste() {
      sfx('taste');
      return add(2400, (ctx, p) => {
        const a = Math.sin(Math.PI * p);
        ctx.fillStyle = `rgba(0,0,0,${0.6 * a})`;
        ctx.fillRect(0, 0, W, H);
        const real = p > 0.5;
        drawSprite(ctx, real ? 'swordReal' : 'sword', 640, 440, PX + 1, { alpha: Math.min(1, a * 2.5) });
        // a cold glint runs up the blade... and it's real
        if (p > 0.15 && p < 0.5) {
          const q = (p - 0.15) / 0.35;
          ctx.fillStyle = 'rgba(176,184,188,0.55)';
          ctx.fillRect(640 - 30, 440 + 290 - q * 580 - 4, 60, PX * 2);
        }
        if (real && p < 0.6) S.shake = Math.max(S.shake, 3);
      });
    },
    nut() {
      // a dull glint that swells... and goes off: a heavy, dark blast, and it cracks
      const [cx, cy0] = S.foePoint('chest');
      const cy = cy0 + 70; // right where it hurts
      sfx('nutShine', 300);
      sfx('boom', 1450);
      sfx('crack', 1900);
      const smoke = particles(34, cx, cy, (i, a, b) => ({ a: a * Math.PI * 2, v: 140 + b * 420, r: 18 + (i % 5) * 12 }));
      const embers = particles(24, cx, cy, (i, a, b) => ({ vx: (a - 0.5) * 900, vy: -200 - b * 500 }));
      const cracks = [];
      for (let i = 0; i < 7; i++) {
        let x = cx;
        let y = cy;
        const pts = [[x, y]];
        let a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
        for (let k = 0; k < 6; k++) {
          a += (Math.random() - 0.5) * 0.9;
          x += Math.cos(a) * (50 + Math.random() * 60);
          y += Math.sin(a) * (50 + Math.random() * 60);
          pts.push([x, y]);
        }
        cracks.push(pts);
      }
      return add(3200, (ctx, p) => {
        const T = p * 3.2;
        if (T > 0.2 && T < 1.45) {
          // the glint: small, dull, swelling, flickering
          const q = (T - 0.2) / 1.25;
          if (Math.random() < 0.85) star(ctx, cx, cy, 6 + q * q * 40, '#b8b0a0', 0.14);
          if (q > 0.6) S.shake = Math.max(S.shake, 2 * q);
        }
        if (T > 1.45 && T < 3.1) {
          const q = (T - 1.45) / 1.65;
          if (q < 0.12) S.shake = Math.max(S.shake, 12);
          // dark smoke round a dull red heart, going out
          ctx.globalAlpha = 1 - clamp((q - 0.6) / 0.4, 0, 1);
          for (const [k, col] of [[1.2, '#120e0e'], [0.9, '#241412'], [0.55, q < 0.3 ? '#5a2014' : '#321612']]) {
            ctx.fillStyle = col;
            for (const f of smoke) {
              const d = f.v * Math.min(q, 0.5);
              const r = f.r * (1 + q * 1.6) * (1 - q * 0.5) * k;
              ctx.beginPath();
              ctx.arc(cx + Math.cos(f.a) * d, cy + Math.sin(f.a) * d * 0.7 - q * 60 * k, Math.max(0, r), 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = '#7a3a22';
          for (const e of embers) ctx.fillRect(e.x + e.vx * q * 0.8, e.y + e.vy * q * 0.8 + 600 * q * q, PX * 2, PX * 2);
          ctx.globalAlpha = 0.6 * (1 - q);
          ctx.strokeStyle = '#3a3632';
          ctx.lineWidth = PX * 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 80 + q * 500, 30 + q * 180, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (T > 1.9) {
          // and it cracks
          const q = (T - 1.9) / 1.3;
          ctx.save();
          ctx.globalAlpha = 1 - clamp((q - 0.7) / 0.3, 0, 1);
          for (const [w, col] of [[PX * 3, '#0a0506'], [PX, '#5a1414']]) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            for (const pts of cracks) {
              ctx.beginPath();
              const n = Math.ceil(pts.length * Math.min(1, q * 4));
              pts.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      });
    },
    // ITEM: the speaker, set down on the floor at the right of the room
    speaker() {
      sfx('speakerOn');
      const [x, y] = SPEAKER;
      const dust = particles(10, x, y, (i, a, b) => ({ vx: (a - 0.5) * 360, vy: -b * 120 }));
      return add(1300, (ctx, p) => {
        if (p < 0.45) drawSprite(ctx, 'speaker', x, y - 160 * (1 - ease(Math.min(1, p / 0.3))), PX * 0.9, { ay: 1 });
        if (p > 0.25) {
          const tt = (p - 0.25) * 1.3;
          ctx.fillStyle = `rgba(90,84,76,${0.7 * (1 - p)})`;
          for (const d of dust) ctx.fillRect(d.x + d.vx * tt, d.y - 6 + d.vy * tt + 400 * tt * tt, PX * 2, PX * 2);
        }
        if (p > 0.25 && p < 0.3) S.shake = Math.max(S.shake, 4);
      });
    },
    lights() {
      sfx('lights');
      C().act('shield');
      return add(1100, (ctx, p) => {
        // the bulbs stutter on
        S.flicker = p < 0.5 ? (Math.floor(p * 20) % 2 ? 1 : 0) : 0;
        if (p >= 0.5) S.lightsTarget = 1;
      });
    },
    lightsFail() {
      sfx('lightsFail');
      return add(1100, (ctx, p) => {
        S.flicker = p < 0.8 ? (Math.floor(p * 14) % 2 ? 0.8 : 0) : 0;
      });
    },
    stance() {
      sfx('stance');
      S.hero.gold = 1;
      const [x, y] = S.heroPoint('head');
      return add(1200, (ctx, p) => {
        bigText(ctx, 'FEARLESS', x + 170, y - 150, 34, '#b8975a', { alpha: Math.sin(Math.PI * p) * 0.9 });
      });
    },
    talk() {
      sfx('talk');
      sfx('reply', 800);
      const [hx, hy] = S.heroPoint('head');
      const [fx, fy] = S.foePoint('head');
      return add(1700, (ctx, p) => {
        const bubble = (x, y, w, txt, creepy, a) => {
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = creepy ? '#120708' : '#a8a296';
          ctx.fillRect(x - w / 2, y - 36, w, 72);
          ctx.fillStyle = creepy ? '#5a1414' : '#161618';
          for (const [rx, ry, rw, rh] of [[x - w / 2, y - 36, w, PX * 2], [x - w / 2, y + 36 - PX * 2, w, PX * 2], [x - w / 2, y - 36, PX * 2, 72], [x + w / 2 - PX * 2, y - 36, PX * 2, 72]]) ctx.fillRect(rx, ry, rw, rh);
          ctx.restore();
          bigText(ctx, txt, x + (creepy ? (Math.random() - 0.5) * 4 : 0), y, 36, creepy ? '#8a3a3a' : '#161618', { alpha: a, stroke: creepy ? '#000' : '#a8a296' });
        };
        const dots = '.'.repeat(1 + (Math.floor(S.t * 6) % 3));
        if (p < 0.6) bubble(hx + 150, hy - 110, 150, dots, false, Math.min(1, p * 8));
        if (p > 0.45) bubble(fx - 120, fy - 40, 190, ['...', 'w h o', 'y o u', 'M Y', 'h i'][Math.floor(S.t * 4) % 5], true, Math.min(1, (p - 0.45) * 8) * (1 - clamp((p - 0.9) * 10, 0, 1)));
      });
    },
    choc() {
      sfx('bite', 450);
      const crumbs = particles(14, 400, 600, (i, a, b) => ({ vx: (a - 0.5) * 300, vy: -b * 300 }));
      return add(1200, (ctx, p) => {
        const a = 1 - clamp((p - 0.85) / 0.15, 0, 1);
        drawSprite(ctx, 'choc', 400, 600 - ease(Math.min(1, p * 4)) * 30, PX * 3, { alpha: a });
        if (p > 0.38) {
          ctx.fillStyle = '#0e0f12';
          ctx.globalAlpha = a;
          ctx.fillRect(400 + 40, 548, 44, 44); // the bite out of it
          const tt = p - 0.38;
          ctx.fillStyle = '#2a170e';
          for (const c of crumbs) ctx.fillRect(c.x + 60 + c.vx * tt, c.y - 30 + c.vy * tt + 900 * tt * tt, PX * 2, PX * 2);
          ctx.globalAlpha = 1;
        }
      });
    },
    cheese() {
      sfx('sizzle');
      sfx('bite', 600);
      return add(1400, (ctx, p) => {
        const a = 1 - clamp((p - 0.85) / 0.15, 0, 1);
        const y = 600 - ease(Math.min(1, p * 4)) * 30;
        drawSprite(ctx, 'cheese', 430, y, PX, { alpha: a });
        // a little steam
        ctx.fillStyle = `rgba(150,146,138,${0.45 * a})`;
        for (let i = 0; i < 3; i++) for (let k = 0; k < 8; k++) ctx.fillRect(400 + i * 30 + Math.round(Math.sin(S.t * 5 + k * 0.8 + i) * 2) * PX, y - 80 - k * 14, PX * 2, PX * 2);
        if (p > 0.45) {
          ctx.fillStyle = `rgba(150,124,52,${a})`;
          ctx.fillRect(345, y + 20, PX * 2, 10 + Math.min(1, (p - 0.45) * 3) * 90);
        }
      });
    },
    pills() {
      sfx('pills');
      const [x, y] = S.heroPoint('head');
      return add(1300, (ctx, p) => {
        const a = 1 - clamp((p - 0.82) / 0.18, 0, 1);
        const bx = x + 260;
        drawSprite(ctx, 'pills', bx, y + 20 - ease(Math.min(1, p * 4)) * 20, PX * 1.3, { alpha: a, rot: -0.12 });
        // two press out of the foil, and he takes them
        ctx.fillStyle = '#7a3448';
        for (let i = 0; i < 2; i++) {
          const q = clamp((p - 0.3 - i * 0.1) / 0.4, 0, 1);
          if (q <= 0 || q >= 1) continue;
          ctx.fillRect(bx + (i ? 20 : -20) + (x + 40 - bx) * q, y - Math.sin(Math.PI * q) * 110, PX * 3, PX * 2);
        }
      });
    },
    keys() {
      sfx('keys');
      sfx('alarm', 700);
      C().act('distracted');
      return add(2100, (ctx, p) => {
        const a = 1 - clamp((p - 0.85) / 0.15, 0, 1);
        drawSprite(ctx, 'keys', 430 + (p < 0.3 ? Math.round(Math.sin(S.t * 40)) * PX : 0), 600, PX * 1.4, { alpha: a, rot: Math.sin(S.t * 18) * 0.08 });
        if (p > 0.3) windowsFlash(ctx, p);
      });
    },
    distracted() {
      sfx('alarm');
      C().act('distracted');
      return add(1600, (ctx, p) => windowsFlash(ctx, p));
    },
    flee() {
      sfx('flee');
      return add(900, (ctx, p) => {
        S.hero.dx = -Math.sin(Math.PI * p) * 140;
      });
    },
    // ACT: Check. A thermostat's read-out: brackets close in round it and a line scans it.
    check() {
      sfx('check');
      const [, hy] = C().point('head');
      const [fx, fy] = C().point('feet');
      const top = hy - 90;
      return add(1100, (ctx, p) => {
        const a = 1 - clamp((p - 0.8) / 0.2, 0, 1);
        const k = 1 - ease(Math.min(1, p * 3.5));
        const x0 = fx - 150 - k * 120;
        const x1 = fx + 150 + k * 120;
        const y0 = top - k * 60;
        const y1 = Math.min(fy, 740) + k * 30;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#7e9aa4';
        const L = 42;
        const T = PX * 2;
        for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
          ctx.fillRect(sx > 0 ? x : x - L, sy > 0 ? y : y - T, L, T);
          ctx.fillRect(sx > 0 ? x : x - T, sy > 0 ? y : y - L, T, L);
        }
        if (p > 0.25) {
          const yy = y0 + (y1 - y0) * ((p - 0.25) / 0.75);
          ctx.globalAlpha = a * 0.7;
          ctx.fillRect(x0, yy, x1 - x0, PX);
          ctx.globalAlpha = a * 0.18;
          ctx.fillRect(x0, y0, x1 - x0, yy - y0);
        }
        ctx.restore();
        bigText(ctx, 'CHECK', x0 + 64, y0 + 30, 28, '#7e9aa4', { alpha: a });
      });
    },
    // ACT: Show it the photos. The frames on the wall glow, and it looks.
    photos() {
      sfx('photos');
      C().act('distracted');
      const frames = [[930, 270, 1000, 350], [1060, 268, 1185, 398]];
      const hearts = particles(6, 0, 0, (i, a, b) => ({ f: i % 2, dx: (a - 0.5) * 70, at: b * 0.4 }));
      return add(1800, (ctx, p) => {
        const a = Math.sin(Math.PI * p);
        ctx.save();
        for (const [x0, y0, x1, y1] of frames) {
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#8a7a52';
          ctx.lineWidth = PX * 2;
          const g = PX * 3 + Math.round(Math.sin(S.t * 6)) * PX;
          ctx.strokeRect(x0 - g, y0 - g, x1 - x0 + g * 2, y1 - y0 + g * 2);
        }
        ctx.restore();
        for (const h of hearts) {
          const q = clamp((p - h.at) / 0.5, 0, 1);
          if (!q) continue;
          const [x0, y0, x1, y1] = frames[h.f];
          drawSprite(ctx, 'heart', (x0 + x1) / 2 + h.dx * 0.6, (y0 + y1) / 2 - q * 80, PX * 2, { alpha: 1 - q });
        }
      });
    },
    // ACT: Open the front door (at the right of the room). Cold air and leaves blow in.
    door() {
      sfx('door');
      C().act('distracted');
      S.doorTarget = 1;
      const leaves = particles(14, W, 0, (i, a, b, c) => ({ y0: 480 + a * 280, vx: -(500 + b * 600), wob: c * 6, at: i * 0.04 }));
      return add(1600, (ctx, p) => {
        for (const l of leaves) {
          const q = p - l.at;
          if (q <= 0) continue;
          const x = W + 20 + l.vx * q;
          const y = l.y0 + Math.sin(q * 8 + l.wob) * 30 + q * 80;
          ctx.fillStyle = l.wob > 3 ? '#6b4a2a' : '#8a6a3a';
          ctx.fillRect(x, y, PX * 3, PX * 2);
        }
      });
    },
    // ACT: Get the family out: Veranda, then Justin, then Erik. Crispy texts one of them, and
    // the checklist: crossed off if they got out unheard, shaking if it heard them.
    family(o = {}) {
      // he texts the next one, then the checklist: crossed off if they got out
      const step = o.step || 0;
      const ok = o.ok !== false;
      const msg = [
        ['somethings in', 'the house. out', 'the back. now'],
        ['basement stairs', 'slow. out the', 'back. to the car'],
        ['erik. shoes on', 'dont look at it', 'go when i say'],
      ][step];
      const k = PX * 1.3; // screen pixels to each of the list's
      const nx = 600;
      const ny = 520;
      sfx('phone');
      if (ok) sfx('scratch', 1650);
      else sfx(step === 1 ? 'groan' : 'creak', 1500);
      return add(2700, (ctx, p) => {
        const a = 1 - clamp((p - 0.9) / 0.1, 0, 1);
        // the text: his cracked phone, and the message
        if (p < 0.42) {
          const fa = 1 - clamp((p - 0.36) / 0.06, 0, 1);
          const buzz = p < 0.1 ? Math.round(Math.sin(S.t * 60)) * PX : 0;
          drawSprite(ctx, 'phone', 390 + buzz, 610, PX, { alpha: fa });
          const key = textBubble(msg, p > 0.22 ? `read 2:${49 + step * 3}` : '');
          if (key && p > 0.05) drawSprite(ctx, key, 600, 520, PX, { alpha: fa });
          return;
        }
        // the list, with the ones already out crossed off
        const shake = !ok && p > 0.55 && p < 0.7 ? Math.round(Math.sin(S.t * 50)) * PX : 0;
        drawSprite(ctx, checklist(step), nx + shake, ny, k, { alpha: Math.min(1, (p - 0.42) * 10) * a });
        const x0 = nx - (LIST.w / 2) * k + shake;
        const y0 = ny - (LIST.h / 2) * k + (LIST.row(step) + 2) * k;
        if (ok && p > 0.6) {
          // and this one, crossed off now
          const q = clamp((p - 0.6) / 0.14, 0, 1);
          ctx.globalAlpha = a;
          ctx.fillStyle = '#5a1414';
          ctx.fillRect(x0 + (LIST.name - 1) * k, y0, (FAMILY[step].length * 4 + 1) * k * q, k);
          if (q >= 1) for (const [dx, dy] of [[4, -1], [5, 0], [6, 1], [6, -1], [4, 1]]) ctx.fillRect(x0 + dx * k, y0 + dy * k, k, k);
          ctx.globalAlpha = 1;
        }
      });
    },
    // ACT: Show it who he is, a step at a time (the first is the photos, above).
    names() {
      sfx('names');
      const [x, y] = S.heroPoint('head');
      return add(2000, (ctx, p) => {
        const a = 1 - clamp((p - 0.85) / 0.15, 0, 1);
        ['VERANDA', 'JUSTIN', 'ERIK'].forEach((n, i) => {
          const q = clamp((p - i * 0.18) / 0.4, 0, 1);
          if (!q) return;
          bigText(ctx, n, x + 290 + i * 50, y - 30 - i * 80 - ease(q) * 20, 34, '#a8a296', { alpha: Math.min(1, q * 4) * a });
        });
      });
    },
    fourAm() {
      sfx('fourAm');
      return add(1800, (ctx, p) => {
        const a = 1 - clamp((p - 0.85) / 0.15, 0, 1);
        const shake = Math.round(Math.sin(S.t * 50) * 2) * PX;
        drawSprite(ctx, 'clock', 470 + shake, 470, PX * 1.3, { alpha: a, rot: Math.sin(S.t * 40) * 0.04 });
        if (Math.floor(S.t * 3) % 2) bigText(ctx, '4:00 AM', 470, 290, 40, '#8a3a32', { alpha: a });
      });
    },
    hands() {
      sfx('hands');
      S.hero.gold = 1.2;
      return add(2000, (ctx, p) => {
        const a = 1 - clamp((p - 0.85) / 0.15, 0, 1);
        for (let i = 0; i < 3; i++) {
          const q = clamp((p - i * 0.14) / 0.22, 0, 1);
          if (!q) continue;
          drawSprite(ctx, 'bag', 430 + i * 120, 680 - (1 - q * q) * 300, PX * 0.6, { ay: 1, alpha: a });
        }
        if (p > 0.45) bigText(ctx, 'every can. every route.', 600, 390, 30, '#a8a296', { alpha: a });
      });
    },
    noBlink() {
      sfx('noBlink');
      const [fx, fy] = C().point('head');
      let blinked = false;
      return add(2100, (ctx, p) => {
        const k = ease(Math.min(1, p / 0.3)) * (1 - clamp((p - 0.85) / 0.15, 0, 1));
        // everything goes dark but its eyes and his
        ctx.fillStyle = `rgba(0,0,0,${0.85 * k})`;
        ctx.fillRect(0, 0, W, H);
        ctx.clearRect(fx - 110, fy - 50, 220, 100);
        ctx.clearRect(30, 575, 260, 95);
        if (p > 0.62 && !blinked) {
          blinked = true;
          C().act('twitch');
        }
        bigText(ctx, p < 0.62 ? 'don’t blink' : 'it blinked', 640, 470, 34, '#a8a296', { alpha: k });
      });
    },
    hold() {
      sfx('stance');
      S.hero.gold = 1;
      const [x, y] = S.heroPoint('head');
      return add(1300, (ctx, p) => {
        bigText(ctx, 'still here', x + 180, y - 150, 34, '#b8975a', { alpha: Math.sin(Math.PI * p) });
      });
    },
    spare() {
      sfx('spare');
      return add(1500, (ctx, p) => {
        const a = Math.sin(Math.PI * p);
        drawSprite(ctx, 'flag', 400, 560, PX * 3, { alpha: a, sx: 1 + Math.sin(S.t * 8) * 0.06 });
      });
    },
  };
  function windowsFlash(ctx, p) {
    // the car alarm's lights, dull, through the blinds
    const on = Math.floor(S.t * 3) % 2;
    ctx.fillStyle = on ? 'rgba(130,64,30,0.3)' : 'rgba(80,22,22,0.16)';
    for (const [x0, y0, x1, y1] of [[330, 268, 476, 520], [684, 262, 870, 505]]) for (let yy = y0; yy < y1; yy += 12) ctx.fillRect(x0, yy, x1 - x0, 6);
    void p;
  }

  // The creature's moves.
  const FOE = {
    claw: () => (sfx('claw', 200), heroClaw(700, 3)),
    rake: () => (sfx('claw', 120), sfx('claw', 330), heroClaw(800, 2)),
    reach: () => (sfx('reach'), sfx('claw', 650), armFx(1200, 'reach')),
    screech: () => (sfx('screech'), waves(1300, '#6a6660')),
    scream: () => (sfx('scream'), waves(1300, '#4a1414')),
    twitch: () => (sfx('twitch'), glitch(1100)),
    lash: () => (sfx('lash'), whips(1000, 2)),
    lash3: () => (sfx('lash'), whips(1100, 3)),
    weep: () => (sfx('weep'), tears(1600)),
    lengthen: () => (sfx('bones'), glitch(1200, 0.4)),
    lunge: () => (sfx('lunge'), heroClaw(700, 3, 0.35)),
    stare: () => (sfx('stare'), stareFx(1500)),
    harden: () => (sfx('harden'), hardenFx(1100)),
    mimic: () => (sfx('swing'), darkSwing(800)),
    grab: () => (sfx('grab', 500), armFx(1200, 'grab')),
    smile: () => (sfx('smile'), stareFx(1700, true)),
    pat: () => (sfx('pat'), armFx(1000, 'pat')),
    hesitate: () => (sfx('hesitate'), dots(1500)),
    smash: () => (sfx('smash', 300), smashFx(1200)),
    bite: () => (sfx('chomp', 430), jawFx(900)),
    flicker: () => (sfx('flicker'), blackout(1000)),
    bile: () => (sfx('bile'), spit(1000)),
    lure: (o = {}) => (sfx('lure'), voiceFx(1600, o.voice || 0)),
    drop: () => (sfx('drop'), dropFx(1300)),
    joke: () => (sfx('rimshot', 300), jokeFx(1300)),
    lock: () => (sfx('slam'), lockFx(900)),
  };
  // Bite: the jaw (its ten frames, shut to wide open) opens wide... and snaps shut on Crispy,
  // and holds on. It comes from its side of him, facing back at him.
  function jawFx(dur) {
    const [x, y] = S.heroPoint('head');
    const k = PX * 1.3;
    const hx = x + 150; // the hinge
    const hy = y + 10;
    const n = JAW_META.length;
    return add(dur, (ctx, p) => {
      if (!n) return;
      let f; // which frame: 0 shut .. n-1 wide open
      if (p < 0.34) f = (p / 0.34) * (n - 1); // opening
      else if (p < 0.42) f = n - 1; // wide
      else if (p < 0.48) f = (1 - (p - 0.42) / 0.06) * (n - 1); // SNAP
      else f = 0; // and it holds on
      const i = Math.max(0, Math.min(n - 1, Math.round(f)));
      const img = sprites['jaw' + i];
      const m = JAW_META[i];
      if (!img) return;
      if (p > 0.48 && p < 0.78) S.hero.shake = Math.max(S.hero.shake, 5);
      const jit = p > 0.48 && p < 0.78 ? Math.round((Math.random() - 0.5) * 2) * PX : 0;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = Math.min(1, p / 0.08) * (1 - clamp((p - 0.82) / 0.18, 0, 1));
      ctx.translate(hx + jit, hy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -m.hx * k, -m.hy * k, m.w * k, m.h * k);
      ctx.restore();
    });
  }
  // Flicker: the room goes black (the HUD doesn't), and when it comes back, so does it, closer.
  function blackout(dur) {
    let hit = false;
    return add(dur, (ctx, p) => {
      S.black = (p > 0.1 && p < 0.2) || (p > 0.3 && p < 0.55) ? 1 : 0;
      if (p > 0.55 && !hit) {
        hit = true;
        S.shake = 12;
      }
    });
  }
  // Bile: a black glob, arcing over, and the splash.
  function spit(dur) {
    const [fx, fy] = C().point('head');
    const [hx, hy] = S.heroPoint('head');
    return add(dur, (ctx, p) => {
      if (p < 0.45) {
        const q = p / 0.45;
        const x = fx + (hx - fx) * q;
        const y = fy + 40 + (hy - fy - 40) * q - Math.sin(Math.PI * q) * 180;
        ctx.fillStyle = '#1d2a12';
        ctx.fillRect(x - 21, y - 15, 42, 30);
        ctx.fillStyle = '#6b8f2e';
        ctx.fillRect(x - 12, y - 9, 12, 9);
        return;
      }
      const q = (p - 0.45) / 0.55;
      ctx.save();
      ctx.globalAlpha = 1 - q;
      for (let i = 0; i < 12; i++) {
        const an = i * 0.52;
        const r = (35 + (i % 3) * 30) * ease(Math.min(1, q * 4));
        ctx.fillStyle = i % 3 ? '#1d2a12' : '#4a6a22';
        ctx.fillRect(hx + Math.cos(an) * r - 12, hy + Math.sin(an) * r * 0.7 + q * 30, 24, 24 + q * 50);
      }
      ctx.restore();
    });
  }
  // Lure: one of them, in the dark, somewhere else in the house: Veranda by the kitchen, Erik
  // on the stairs, Justin at the basement door. It isn't them; the shape glitches and is gone.
  // Or a text from Veranda that was sent from inside the house.
  function voiceFx(dur, voice) {
    if (voice === 3) {
      sfx('phone');
      return add(dur + 600, (ctx, p) => {
        const a = Math.min(1, p * 8) * (1 - clamp((p - 0.85) / 0.15, 0, 1));
        drawSprite(ctx, 'phone', 390, 610, PX, { alpha: a });
        drawSprite(ctx, 'bubble', 600, 520, PX, { alpha: a });
      });
    }
    const [x, y, k] = [[1200, 700, 'veranda'], [300, 430, 'adult'], [392, 478, 'adult']][voice];
    return add(dur, (ctx, p) => {
      const a = Math.min(1, p * 3) * (1 - clamp((p - 0.7) / 0.3, 0, 1)) * (Math.random() < 0.85 ? 1 : 0.2);
      const jit = p > 0.6 && Math.random() < 0.4 ? (Math.random() - 0.5) * 40 : 0;
      drawSprite(ctx, k, x + jit, y, PX * 2, { ay: 1, alpha: a * 0.8, sy: voice === 1 ? 0.94 : 1 });
    });
  }
  // Ceiling Drop: it goes up out of sight, then lands on him.
  function dropFx(dur) {
    const [x, y] = S.heroPoint('chest');
    let hit = false;
    const dust = particles(16, 0, 0, (i, a, b) => ({ vx: (a - 0.5) * 900, vy: -b * 400 }));
    return add(dur, (ctx, p) => {
      if (p < 0.5) return;
      if (!hit) {
        hit = true;
        S.shake = 16;
      }
      const q = (p - 0.5) / 0.5;
      clawMarks(ctx, x, y - 80, q, 4);
      ctx.fillStyle = `rgba(150,140,125,${0.8 * (1 - q)})`;
      for (const d of dust) ctx.fillRect(x + 160 + d.vx * q, y + 60 + d.vy * q + 700 * q * q, 12, 12);
    });
  }
  // Steal the Joke: his grin, and the elbow on the punchline.
  function jokeFx(dur) {
    stareFx(dur, true);
    return heroClaw(dur, 1, 0.55);
  }
  // Lock the Door: it slams, and the night light's gone.
  function lockFx(dur) {
    S.door = S.doorTarget = 0;
    S.shake = 6;
    return add(dur, () => {});
  }
  // It goes for the speaker instead, and tears it apart: the pieces fly, and lie on the floor.
  function smashFx(dur) {
    const [x, y] = SPEAKER;
    let hit = false;
    const bits = particles(9, x, y - 110, (i, a, b, c) => ({ sx: (i % 3) / 3, sy: Math.floor(i / 3) / 3, vx: (a - 0.4) * 700, vy: -150 - b * 450, spin: (c - 0.5) * 9 }));
    return add(dur, (ctx, p) => {
      if (p < 0.3) return;
      if (!hit) {
        hit = true;
        S.shake = Math.max(S.shake, 10);
        if (S.speaker) S.speaker.broken = true;
      }
      const sp = sprites.speaker;
      if (!sp) return;
      const q = (p - 0.3) / 0.7;
      const k = PX * 0.9;
      const w = sp.width / 3;
      const h = sp.height / 3;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const b of bits) {
        ctx.save();
        ctx.globalAlpha = 1 - clamp((q - 0.7) / 0.3, 0, 1);
        ctx.translate(b.x - sp.width * k * 0.5 + (b.sx + 1 / 6) * sp.width * k + b.vx * q * 0.6, b.y - sp.height * k * 0.5 + (b.sy + 1 / 6) * sp.height * k + b.vy * q * 0.6 + 700 * q * q);
        ctx.rotate(b.spin * q);
        ctx.drawImage(sp, b.sx * sp.width, b.sy * sp.height, w, h, (-w * k) / 2, (-h * k) / 2, w * k, h * k);
        ctx.restore();
      }
      ctx.restore();
    });
  }
  // it stops short: a '...' over its head
  function dots(dur) {
    const [x, y] = C().point('head');
    return add(dur, (ctx, p) => {
      const n = Math.min(3, 1 + Math.floor(p * 5));
      bigText(ctx, '.'.repeat(n).padEnd(3, ' '), x + 70, y - 80, 44, '#8a8478', { alpha: 1 - clamp((p - 0.8) / 0.2, 0, 1) });
    });
  }
  function heroClaw(dur, n, at = 0.2) {
    const [x, y] = S.heroPoint('chest');
    return add(dur, (ctx, p) => {
      if (p > at) clawMarks(ctx, x, y - 80, (p - at) / (1 - at), n);
    });
  }
  function waves(dur, color) {
    const [x, y] = S.foePoint('head');
    return add(dur, (ctx, p) => {
      ctx.save();
      ctx.strokeStyle = color;
      for (let i = 0; i < 5; i++) {
        const q = (p * 2 + i * 0.2) % 1;
        ctx.globalAlpha = (1 - q) * 0.45;
        ctx.lineWidth = PX * 2;
        ctx.beginPath();
        ctx.arc(x, y, 30 + q * 600, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      S.shake = Math.max(S.shake, 3 * Math.sin(Math.PI * p));
      S.wobble = Math.sin(Math.PI * p) * 5;
    });
  }
  function glitch(dur, k = 1) {
    return add(dur, (ctx, p) => {
      if (Math.random() < 0.5 * k) {
        for (let i = 0; i < 6; i++) {
          const y = Math.floor(Math.random() * LH);
          const h = 1 + Math.floor(Math.random() * 10);
          // a slice of the room and the creature, slipped sideways
          ctx.drawImage(document.getElementById('scene'), 0, y * PX, W, h * PX, (Math.random() - 0.5) * 60 * k, y * PX, W, h * PX);
        }
      }
      void p;
    });
  }
  function whips(dur, n) {
    const [fx, fy] = S.foePoint('chest');
    const [hx, hy] = S.heroPoint('chest');
    return add(dur, (ctx, p) => {
      ctx.save();
      ctx.lineCap = 'round';
      for (let k = 0; k < n; k++) {
        const q = clamp((p - k * 0.2) / 0.35, 0, 1);
        const fade = 1 - clamp((p - k * 0.2 - 0.35) / 0.3, 0, 1);
        if (q <= 0 || fade <= 0) continue;
        ctx.globalAlpha = fade;
        ctx.strokeStyle = '#2a1f1c';
        ctx.lineWidth = 9;
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const t = (i / 20) * q;
          const x = fx + (hx - fx) * t;
          const y = fy - 60 + (hy - 80 + k * 40 - fy + 60) * t + Math.sin(t * 12 + k + S.t * 10) * 30 * (1 - t);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    });
  }
  function tears(dur) {
    const [x, y] = S.foePoint('head');
    return add(dur, (ctx, p) => {
      ctx.fillStyle = '#0b0809';
      for (let i = 0; i < 4; i++) {
        const yy = y + 10 + ((p * 300 + i * 70) % 260);
        ctx.fillRect(x - 24 + (i % 2) * 40, yy, 6, 14);
      }
    });
  }
  function stareFx(dur, smile) {
    const [x, y] = S.foePoint('head');
    return add(dur, (ctx, p) => {
      const a = Math.sin(Math.PI * p);
      const g = ctx.createRadialGradient(x, y, 80, x, y, 900);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${0.75 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (!smile) {
        ctx.fillStyle = `rgba(255,30,30,${a})`;
        ctx.fillRect(x - 18, y - 6, 6, 6);
        ctx.fillRect(x + 10, y - 6, 6, 6);
      } else {
        ctx.strokeStyle = `rgba(240,230,210,${a * 0.8})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y - 40 + a * 10, 60 + a * 20, 0.25 * Math.PI, 0.75 * Math.PI);
        ctx.stroke();
      }
    });
  }
  function hardenFx(dur) {
    const [x, y] = S.foePoint('chest');
    return add(dur, (ctx, p) => {
      const a = Math.sin(Math.PI * p);
      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = '#c9c2b5';
      ctx.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(i * 7) * 60, y - 200 + i * 40);
        ctx.lineTo(x + Math.sin(i * 3) * 60, y - 180 + i * 40);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
  function darkSwing(dur) {
    const [x, y] = S.heroPoint('chest');
    return add(dur, (ctx, p) => {
      const a = 2.3 - ease(clamp(p / 0.6, 0, 1)) * 2.9;
      ctx.save();
      ctx.filter = 'brightness(0.15) sepia(1) hue-rotate(-50deg) saturate(3)';
      drawSprite(ctx, 'swordReal', x + 220, y - 260, PX, { rot: a, ay: 0.9, alpha: 1 - clamp((p - 0.7) / 0.3, 0, 1) });
      ctx.restore();
    });
  }
  // Its arms: torn off at the shoulder (the arm of the stage it's at), from its shoulder to
  // Crispy, stretched far too long to get there, and drawn over the HUD so the attack lands on
  // him. reach: one arm, claws at him; grab: both, by the shoulders, squeezing; pat: one hand on
  // his shoulder, patting.
  function drawArm(ctx, from, to, reach) {
    const i = Math.min(4, C().stage);
    const sp = sprites['arm' + i];
    const m = ARM_META[i];
    if (!sp || !m || reach <= 0.01) return;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const k = PX; // its thickness, in its own pixels
    const along = (Math.hypot(dx, dy) * reach) / ((m.w - m.px) * k);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(from[0], from[1]);
    const ang = Math.atan2(dy, dx);
    ctx.rotate(ang);
    if (Math.abs(ang) > Math.PI / 2) ctx.scale(1, -1); // (not upside down)
    ctx.drawImage(sp, -m.px * k * along, -m.py * k, m.w * k * along, m.h * k);
    ctx.restore();
  }
  function armFx(dur, kind) {
    const [hx, hy] = S.heroPoint('chest');
    return add(dur, (ctx, p) => {
      const sL = C().point('shoulderL');
      const sR = C().point('shoulderR');
      let reach;
      if (kind === 'pat') reach = p < 0.3 ? ease(p / 0.3) : p < 0.75 ? 1 : 1 - ease((p - 0.75) / 0.25);
      else reach = p < 0.42 ? ease(p / 0.42) : p < 0.72 ? 1 : 1 - ease((p - 0.72) / 0.28);
      if (kind === 'grab') {
        const sq = p > 0.42 && p < 0.72 ? Math.round(Math.sin(S.t * 40)) * PX : 0;
        drawArm(ctx, sR, [hx + 70 + sq, hy - 10], reach);
        drawArm(ctx, sL, [hx - 40 - sq, hy - 20], reach);
        if (p > 0.42 && p < 0.72) S.hero.shake = Math.max(S.hero.shake, 6);
      } else if (kind === 'pat') {
        const bob = p > 0.3 && p < 0.75 ? -Math.abs(Math.sin(((p - 0.3) / 0.45) * Math.PI * 2)) * 34 : 0;
        drawArm(ctx, sL, [hx + 60, hy - 10 + bob], reach);
      } else {
        drawArm(ctx, sL, [hx + 30, hy - 60], reach);
        if (p > 0.5) clawMarks(ctx, hx, hy - 80, (p - 0.5) / 0.5, 3);
      }
    });
  }

  // ------------------------------------------------------------------ the killer
  // Not part of the fight. While Crispy is deciding what to do, he comes up out of a corner of
  // the screen, slowly, breathing quick and shallow. Click him and he sinks back out of sight.
  // If he gets all the way in: the jumpscare (ui.js plays it, and what he does to Crispy).
  const CORNERS = [
    { from: [-110, 1010], to: [280, 540], rot: 0.35 }, // rising out of the bottom left, leaning in
    { from: [1390, 1010], to: [1000, 540], rot: -0.35 }, // the bottom right
    { from: [-110, -60], to: [290, 360], rot: Math.PI - 0.4 }, // hanging down from the top left
    { from: [1390, -60], to: [990, 360], rot: Math.PI + 0.4 }, // the top right
  ];
  const KK = PX * 2.2; // screen pixels to each of his
  S.spawnKiller = function () {
    S.killer = { corner: Math.floor(Math.random() * CORNERS.length), a: 0, state: 'in', phase: 0, br: 0, puffs: [] };
  };
  function killerAt(kl) {
    const c = CORNERS[kl.corner];
    const e = kl.a; // steadily
    return { x: c.from[0] + (c.to[0] - c.from[0]) * e, y: c.from[1] + (c.to[1] - c.from[1]) * e, rot: c.rot, k: KK * (1 + 0.2 * kl.a) };
  }
  // Did a click (in stage pixels) land on him? Then he goes.
  S.killerHit = function (x, y) {
    const kl = S.killer;
    if (!kl || kl.state !== 'in' || kl.a < 0.02) return false;
    const at = killerAt(kl);
    const ux = -Math.sin(at.rot);
    const uy = Math.cos(at.rot);
    // along his body from the top of his head: how far, and how far off it
    const t = (x - at.x) * ux + (y - at.y) * uy;
    const off = Math.abs((x - at.x) * uy - (y - at.y) * ux);
    if (t < -20 || t > 160 * at.k || off > 32 * at.k) return false;
    kl.state = 'back';
    return true;
  };
  function updateKiller(dt) {
    const kl = S.killer;
    if (!kl) return;
    const D = window.CRISPY_DATA.killer;
    if (kl.state === 'back') {
      kl.a -= dt * 2.2;
      if (kl.a <= 0) return (S.killer = null);
    } else if (kl.state === 'in' && S.killerCanMove && S.killerCanMove()) {
      kl.a += dt / D.approach;
      if (kl.a >= 1) {
        kl.a = 1;
        kl.state = 'strike';
        if (S.onKiller) S.onKiller();
      }
    }
    // quick, shallow breaths: faster the closer he is
    kl.phase += dt * (2.4 + kl.a * 1.8);
    if (kl.phase >= 1) {
      kl.phase -= 1;
      for (let i = 0; i < 3; i++) kl.puffs.push({ x: 26 + (Math.random() - 0.5) * 4, y: 33, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 8, age: 0 });
      if (kl.state === 'in') A().play('pant', 0.25 + 0.75 * kl.a);
    }
    kl.br = 0.5 - 0.5 * Math.cos(kl.phase * Math.PI * 2);
    for (const pf of kl.puffs) pf.age += dt;
    kl.puffs = kl.puffs.filter((pf) => pf.age < 0.6);
  }
  function drawKiller(l) {
    const kl = S.killer;
    const sp = sprites.killer;
    if (!kl || !sp) return;
    const at = killerAt(kl);
    const k = at.k;
    l.save();
    l.imageSmoothingEnabled = false;
    l.translate(at.x, at.y);
    l.rotate(at.rot);
    // the chest heaves, a pixel at a time
    const lift = kl.br > 0.5 ? -k : 0;
    l.drawImage(sp, (-sp.width * k) / 2, lift, sp.width * k, sp.height * k * (1 + 0.012 * kl.br));
    // and his breath, in pixels
    for (const pf of kl.puffs) {
      l.fillStyle = `rgba(150,150,156,${0.7 * (1 - pf.age / 0.6)})`;
      l.fillRect((pf.x - sp.width / 2 + pf.vx * pf.age) * k, (pf.y + pf.vy * pf.age) * k + lift, k, k);
    }
    l.restore();
  }
  // If he gets all the way in: his face, right up against the screen, then the pictures, very
  // fast, dim; then back to the room.
  S.jumpscare = function () {
    S.killer = null;
    const order = [...Array(SCARES).keys()].sort(() => Math.random() - 0.5);
    const FACE = 1.0;
    const EACH = 0.16;
    const total = FACE + order.length * EACH + 0.3;
    return add(total * 1000, (ctx, p) => {
      const T = p * total;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const sp = sprites.killer;
      if (T < FACE) {
        if (!sp || Math.random() < 0.1) return; // it flickers
        const rows = 58;
        const s = ((H * 1.3) / rows) * (1 + T * 0.18);
        const jx = (Math.random() - 0.5) * 50;
        const jy = (Math.random() - 0.5) * 40;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sp, 0, 0, sp.width, rows, W / 2 - (sp.width * s) / 2 + jx, H / 2 - (rows * s) / 2 + jy, sp.width * s, rows * s);
        S.shake = 16;
        return;
      }
      const t = T - FACE;
      const i = Math.floor(t / EACH);
      if (i < order.length && t - i * EACH < EACH * 0.7) {
        const img = sprites['scare' + order[i]];
        if (img) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, W, H);
        }
      }
    }, { top: true });
  };

  S.play = (name, o) =>  S.play = (name, o) => (FX[name] ? FX[name](o) : 0);
  S.foeMove = (name, o) => (FOE[name] ? FOE[name](o) : 0);

  // ADJUST: its body snaps into the wrong shapes, one crack at a time (see creature.js); the
  // screen jolts with each snap, and bleeds.
  S.adjust = function () {
    sfx('adjust');
    S.splats = [];
    for (let i = 0; i < 9; i++) {
      const side = i % 4;
      S.splats.push({ x: side === 0 ? 0 : side === 1 ? W : Math.random() * W, y: side === 2 ? 0 : side === 3 ? H : Math.random() * H, r: 60 + Math.random() * 120, at: 0.9 + Math.random() * 1.5, drops: Math.floor(4 + Math.random() * 6), seed: Math.random() * 100 });
    }
    const snaps = (C().snaps || []).map((n) => n.t);
    let next = 0;
    return add(3800, (ctx, p) => {
      const T = p * 3.8;
      while (next < snaps.length && T >= snaps[next]) {
        sfx('snap');
        S.shake = Math.max(S.shake, 9);
        next++;
      }
      for (const sp of S.splats) {
        if (T < sp.at) continue;
        const a = 1 - clamp((T - 3.2) / 0.6, 0, 1);
        ctx.fillStyle = `rgba(110,0,8,${0.85 * a})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r * Math.min(1, (T - sp.at) * 6), 0, Math.PI * 2);
        ctx.fill();
        for (let d = 0; d < sp.drops; d++) {
          const an = sp.seed + d * 2.4;
          const rr = sp.r * (1.1 + ((d * 37) % 10) / 12);
          ctx.beginPath();
          ctx.arc(sp.x + Math.cos(an) * rr, sp.y + Math.sin(an) * rr + (T - sp.at) * 20, 6 + (d % 3) * 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(sp.x + Math.cos(an) * sp.r * 0.8 - 4, sp.y + Math.sin(an) * sp.r * 0.8, 8, (T - sp.at) * 60);
        }
      }
    }, { top: true });
  };

  // WILLPOWER: while he's down the screen goes red and dark (the family photos flash over it,
  // in the page: see ui.js), then it lifts as he gets back up, in a dull gold light.
  S.redOut = function (ms) {
    const red = { t0: S.t, ms: ms / 1000, up: null };
    S.red = red;
    add(600000, (ctx) => {
      if (S.red !== red) return;
      let a = Math.min(1, (S.t - red.t0) / red.ms);
      if (red.up !== null) a *= Math.max(0, 1 - (S.t - red.up) / 1.2);
      if (a <= 0) return;
      ctx.fillStyle = `rgba(30,0,2,${a})`;
      ctx.fillRect(0, 0, W, H);
      // its pulse, at the edges
      const beat = Math.max(0, Math.sin(S.t * Math.PI * 1.4)) ** 6;
      const g = ctx.createRadialGradient(640, 480, 200, 640, 480, 820);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(90,0,8,${0.6 * beat * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }, { top: true });
    return ms;
  };
  S.rise = function () {
    if (S.red) S.red.up = S.t;
    S.hero.gold = 1.6;
    S.hero.rising = true;
    return 1200;
  };

  // SPARED: Crispy blinks. When his eyes open again, it's gone.
  S.blink = function () {
    sfx('blink');
    let gone = false;
    return add(2800, (ctx, p) => {
      let c; // 0 open .. 1 shut
      if (p < 0.16) c = ease(p / 0.16);
      else if (p < 0.5) c = 1;
      else if (p < 0.62) c = 1 - 0.3 * Math.sin(((p - 0.5) / 0.12) * Math.PI); // a flutter
      else c = 1 - ease((p - 0.62) / 0.38);
      if (p > 0.3 && !gone) {
        gone = true;
        C().gone = true;
      }
      if (c <= 0.001) return;
      const half = (H / 2) * c;
      const lid = (edge, bulge, alpha) => {
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(W, 0);
        ctx.lineTo(W, edge);
        ctx.quadraticCurveTo(W / 2, edge + bulge, 0, edge);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(W, H);
        ctx.lineTo(W, H - edge);
        ctx.quadraticCurveTo(W / 2, H - edge - bulge, 0, H - edge);
        ctx.closePath();
        ctx.fill();
      };
      lid(half + 50 * c, 140 * c, 0.45 * c); // the shadow of the lids
      lid(half, 140 * c, 1);
    }, { top: true });
  };

  S.setLights = (on) => (S.lightsTarget = on ? 1 : 0);

  S.setDoor = (open) => (S.doorTarget = open ? 1 : 0);
  // The speaker: on (thumping), switched off when its song ends (it fades away), or smashed
  // (its pieces stay on the floor).
  S.setSpeaker = function (on, broken) {
    if (on) S.speaker = { on: true, fade: 1, broken: false };
    else if (S.speaker) {
      S.speaker.on = false;
      if (broken) S.speaker.broken = true;
    }
  };
  function drawSpeaker(l) {
    const s = S.speaker;
    if (!s) return;
    const [x, y] = SPEAKER;
    if (s.broken) {
      if (!s.debris) s.debris = particles(16, x, y, (i, a, b) => ({ dx: (a - 0.5) * 200, w: PX * (1 + (i % 3)), c: ['#1e1c1c', '#3a2614', '#2a2a2e', '#5a3a1e'][i % 4], dy: -b * 8 }));
      for (const d of s.debris) {
        l.fillStyle = d.c;
        l.fillRect(d.x + d.dx, d.y + d.dy - d.w, d.w * 2, d.w);
      }
      return;
    }
    if (!s.on) s.fade = Math.max(0, s.fade - 0.03);
    if (s.fade <= 0) return (S.speaker = null);
    // it thumps with the bass: on the jumps above the song's running level
    const raw = s.on ? A().level() : 0;
    s.avg = s.avg === undefined ? raw : s.avg * 0.92 + raw * 0.08;
    const lv = clamp((raw - s.avg) * 5, 0, 1);
    drawSprite(l, 'speaker', x, y, PX * 0.9 * (1 + lv * 0.05), { ay: 1, alpha: s.fade });
    if (lv > 0.35) {
      l.save();
      l.globalAlpha = (lv - 0.35) * 0.9;
      l.strokeStyle = '#4a4a50';
      l.lineWidth = PX;
      for (const r of [70, 110]) {
        l.beginPath();
        l.arc(x, y - 120, r * (0.9 + lv * 0.2), -0.6, 0.6);
        l.stroke();
        l.beginPath();
        l.arc(x, y - 120, r * (0.9 + lv * 0.2), Math.PI - 0.6, Math.PI + 0.6);
        l.stroke();
      }
      l.restore();
    }
  }

  // FLEE, with the family safe: Crispy is out of the frame, then the car's headlights sweep
  // the blinds and the engine pulls away. The creature turns to watch.
  S.escape = function () {
    sfx('flee');
    sfx('engine', 700);
    return add(4200, (ctx, p) => {
      const T = p * 4.2;
      S.hero.away = ease(Math.min(1, T / 0.7));
      if (T > 1.2 && !S.turned) {
        S.turned = true;
        C().act('distracted');
      }
      if (T < 1.2) return;
      // the headlights sweep across the room (drawn with the room, in S.draw)
      const q = (T - 1.2) / 3;
      S.beam = Math.sin(Math.PI * Math.min(1, q));
      S.beamX = 1150 - q * 1000;
    });
  };

  // The end: everything fades to black, in pixels.
  S.fadeOut = function (ms) {
    const total = 600000;
    return add(total, (ctx, p) => {
      ctx.fillStyle = `rgba(0,0,0,${clamp((p * total) / ms, 0, 1)})`;
      ctx.fillRect(0, 0, W, H);
    }, { top: true }) && ms;
  };
  // ------------------------------------------------------------------ every frame
  S.update = function (dt) {
    S.t += dt;
    S.lights += (S.lightsTarget - S.lights) * Math.min(1, dt * 3);
    S.door += (S.doorTarget - S.door) * Math.min(1, dt * 1.5);
    S.beam = Math.max(0, S.beam - dt * 0.3); // (the escape keeps it up while it runs)
    C().lights = S.lights;
    S.shake *= Math.pow(0.02, dt);
    if (S.shake < 0.3) S.shake = 0;
    S.wobble *= Math.pow(0.1, dt);
    const h = S.hero;
    h.shake *= Math.pow(0.01, dt);
    h.flash = Math.max(0, h.flash - dt * 3);
    h.gold = Math.max(0, h.gold - dt * 0.6);
    if (h.rising) {
      h.down = Math.max(0, h.down - dt * 1.4);
      if (!h.down) h.rising = false;
    }
    updateKiller(dt);
    S.effects = S.effects.filter((e) => S.t - e.t0 < e.dur);
    S.popups = S.popups.filter((q) => S.t - q.t0 < q.dur);
    if (!S.effects.length) S.flicker = S.black = 0;
  };

  // The see-through parts of the effects layer, dithered to solid or nothing, like old pixel art.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) * 16);
  // The effects also lose most of their colour and get a grain, like the item sheet.
  function dither(lctx, grit) {
    const d = lctx.getImageData(0, 0, LW, LH);
    const px = d.data;
    for (let y = 0; y < LH; y++) {
      const row = (y & 3) * 4;
      for (let x = 0; x < LW; x++) {
        const k = (y * LW + x) * 4;
        const a = px[k + 3];
        if (a === 0) continue;
        if (a !== 255) {
          px[k + 3] = a > BAYER[row + (x & 3)] ? 255 : 0;
          if (!px[k + 3]) continue;
        }
        if (!grit) continue;
        const l = px[k] * 0.3 + px[k + 1] * 0.59 + px[k + 2] * 0.11;
        const n = (Math.random() - 0.5) * 22;
        px[k] = (l + (px[k] - l) * 0.7) * 0.92 + n;
        px[k + 1] = (l + (px[k + 1] - l) * 0.7) * 0.92 + n;
        px[k + 2] = (l + (px[k + 2] - l) * 0.7) * 0.92 + n;
      }
    }
    lctx.putImageData(d, 0, 0);
  }
  function begin(layer, ox, oy) {
    const l = layer.x;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, LW, LH);
    l.setTransform(1 / PX, 0, 0, 1 / PX, ox / PX, oy / PX);
    l.imageSmoothingEnabled = false;
    return l;
  }
  function blowUp(ctx, layer, grit) {
    dither(layer.x, grit);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer.c, 0, 0, LW * PX, LH * PX);
    ctx.restore();
  }

  S.draw = function (ctx) {
    const sx = S.shake ? Math.round(((Math.random() - 0.5) * S.shake) / PX) * PX : 0;
    const sy = S.shake ? Math.round(((Math.random() - 0.5) * S.shake) / PX) * PX : 0;
    const wx = S.wobble ? Math.round((Math.sin(S.t * 7) * S.wobble) / PX) * PX : 0;
    const wy = S.wobble ? Math.round((Math.cos(S.t * 5) * S.wobble * 0.5) / PX) * PX : 0;
    // the room (darker still), and the lights when they're up (or flickering)
    ctx.save();
    ctx.translate(sx + wx, sy + wy);
    ctx.drawImage(S.bg, -8, -8, W + 16, H + 16);
    const lit = Math.max(S.lights, S.flicker);
    if (lit > 0.01) {
      ctx.globalAlpha = lit;
      ctx.drawImage(S.bgLit, -8, -8, W + 16, H + 16);
      ctx.globalAlpha = 1;
    }
    // the lamp's light breathes a little
    const dark = 0.42 * (1 - 0.65 * lit) + Math.max(0, Math.sin(S.t * 0.7) * Math.sin(S.t * 2.3)) * 0.05;
    ctx.fillStyle = `rgba(0,0,0,${dark})`;
    ctx.fillRect(-8, -8, W + 16, H + 16);
    // the front door open: cold night light from the doorway at the right, across the floor
    if (S.door > 0.01) {
      const d = S.door * (0.9 + Math.sin(S.t * 1.3) * 0.05);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(1290, 516);
      ctx.scale(0.42, 1);
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 300);
      g.addColorStop(0, `rgba(90,120,170,${0.4 * d})`);
      g.addColorStop(1, 'rgba(90,120,170,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-300, -300, 600, 600);
      ctx.restore();
      const f = ctx.createRadialGradient(1260, 790, 10, 1260, 790, 420);
      f.addColorStop(0, `rgba(80,110,160,${0.28 * d})`);
      f.addColorStop(1, 'rgba(80,110,160,0)');
      ctx.fillStyle = f;
      ctx.beginPath();
      ctx.ellipse(1180, 800, 420, 110, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    // the headlights, through the blinds and across the walls
    if (S.beam > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const a = S.beam;
      for (const [x0, y0, x1, y1] of [[330, 268, 476, 520], [684, 262, 870, 505]]) {
        const g = ctx.createLinearGradient(S.beamX - 300, 0, S.beamX + 300, 0);
        g.addColorStop(0, 'rgba(255,240,200,0)');
        g.addColorStop(0.5, `rgba(255,240,200,${0.6 * a})`);
        g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g;
        for (let yy = y0; yy < y1; yy += 12) ctx.fillRect(x0, yy, x1 - x0, 6);
      }
      const g = ctx.createRadialGradient(S.beamX, 420, 20, S.beamX, 420, 560);
      g.addColorStop(0, `rgba(255,236,190,${0.24 * a})`);
      g.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-8, -8, W + 16, H + 16);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // the speaker, if it's out, and the creature, at a third of the resolution
    const low = begin(S.low, sx + wx, sy + wy);
    drawSpeaker(low);
    C().draw(low);
    blowUp(ctx, S.low);
    if (S.black) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }

    // film grain over everything
    const g = S.grain[Math.floor(Math.random() * S.grain.length)];
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    const ox = Math.floor(Math.random() * 256);
    const oy = Math.floor(Math.random() * 256);
    for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) ctx.drawImage(g, x, y);
    ctx.restore();
    portrait();
    S.shakeAt = [sx + wx, sy + wy];
  };

  // The effects and the numbers, over the HUD, at a third of the resolution.
  S.drawFx = function (ctx) {
    ctx.clearRect(0, 0, W, H);
    if (!S.effects.length && !S.popups.length && !S.killer) return;
    const [ox, oy] = S.shakeAt || [0, 0];
    const l = begin(S.lowFx, ox, oy);
    for (const e of S.effects) if (!e.top) e.draw(l, clamp((S.t - e.t0) / e.dur, 0, 1));
    for (const q of S.popups) {
      const p = (S.t - q.t0) / q.dur;
      bigText(l, q.text, q.x, q.y - ease(Math.min(1, p * 2)) * 30, q.size, q.color, { alpha: 1 - clamp((p - 0.7) / 0.3, 0, 1) });
    }
    for (const e of S.effects) if (e.top) e.draw(l, clamp((S.t - e.t0) / e.dur, 0, 1));
    drawKiller(l);
    blowUp(ctx, S.lowFx, true);
  };

  // Crispy's portrait in his box: it shakes and flashes red when he's hit, trembles when he's
  // AFRAID, glows gold when he's FEARLESS or gets back up, pulses red when he's CRITICAL, and
  // drops when he falls. He breathes: up a pixel, down a pixel.
  let pic;
  function portrait() {
    pic = pic || document.getElementById('me-pic');
    if (!pic) return;
    const h = S.hero;
    const k = 5; // his pixels, on screen
    let x = h.dx - h.away * 300;
    const y = (Math.sin(S.t * 2.4) > 0.3 ? -k : 0) + h.down * 240;
    if (h.shake > 0.5) x += Math.round(((Math.random() - 0.5) * h.shake * 2) / k) * k;
    if (h.afraid) x += Math.round(Math.random() - 0.5) * k;
    pic.style.transform = `translate(${x}px, ${y}px)`;
    const red = Math.max(h.flash, h.critical ? 0.25 + Math.sin(S.t * 4) * 0.15 : 0);
    const f = [];
    if (red > 0.02) f.push(`sepia(${red}) saturate(${1 + red * 5}) hue-rotate(-${red * 40}deg) brightness(${1 + red * 0.3})`);
    if (h.gold > 0.02) {
      const c = `rgba(255,207,74,${Math.min(1, h.gold)})`;
      f.push(`drop-shadow(${k}px 0 0 ${c}) drop-shadow(-${k}px 0 0 ${c}) drop-shadow(0 ${k}px 0 ${c}) drop-shadow(0 -${k}px 0 ${c})`);
    }
    pic.style.filter = f.join(' ') || 'none';
  }

  S.hitHero = function () {
    S.hero.shake = 10;
    S.hero.flash = 1;
  };
  S.reset = function () {
    S.effects = [];
    S.popups = [];
    S.lights = S.lightsTarget = 0;
    S.hero.gold = S.hero.flash = S.hero.down = S.hero.dx = S.hero.away = 0;
    S.hero.rising = false;
    S.red = null;
    S.door = S.doorTarget = S.beam = S.black = 0;
    S.speaker = null;
    S.killer = null;
    S.turned = false;
  };
})();
