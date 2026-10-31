/*
 * The scene: the living room at night (grainy, the lights able to come up), Crispy on the left,
 * the creature on the rug, and a screen effect for every move, item and act, drawn with little
 * pixel-art props (a trash bag, the Buster Sword, a gavel, the RG 405M, a wine glass...).
 */
(function () {
  const W = 1280;
  const H = 960;
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
    hero: { x: 40, y: 422, scale: 7, shake: 0, flash: 0, dx: 0, gold: 0, afraid: false, critical: false, down: 0 },
  };
  window.SCENE = S;

  // ------------------------------------------------------------------ pixel props
  // Little pixel-art sprites: rows of characters, one colour each.
  const PROPS = {
    bag: {
      pal: { k: '#15171a', g: '#4a5058', h: '#6b737d', y: '#f2c230', Y: '#b88c18' },
      rows: ['......yy........', '.....yYYy.......', '......kk........', '.....kkkk.......', '....kkkkkk......', '...kkkgkkkk.....', '..kkkgkkkkkk....', '.kkkhkkkkkkkk...', '.kkgkkkkkkkkk...', 'kkkgkkkkkkkkkk..', 'kkkkkkkkkkkkkk..', 'kkkkkkkkkkkgkk..', 'kkkkkkkkkkgkkk..', '.kkkkkkkkgkkkk..', '.kkkkkkkkkkkkk..', '..kkkkkkkkkkk...', '...kkkkkkkkk....', '.....kkkkk......'],
    },
    gavel: {
      pal: { b: '#8a5a2e', d: '#5e3b1d', l: '#b07a45', y: '#d9b04a' },
      rows: ['..llllllll....', '.lbbbbbbbbd...', 'ylbbbbbbbbdy..', 'ylbbbbbbbbdy..', '.lbbbbbbbbd...', '..dddddddd....', '.....bd.......', '.....bd.......', '.....bd.......', '.....bd.......', '.....bd.......', '.....dd.......'],
    },
    rg: {
      pal: { k: '#26282d', e: '#4b4e55', s: '#9fe6ff', S: '#e6fbff', d: '#0d0e10', r: '#e34b4b', g: '#4bd17a', b: '#4b8ae3', w: '#e8c53a', t: '#7d828a' },
      rows: ['.eeeeeeeeeeeeeeeeeeee.', 'ekkkkkkkkkkkkkkkkkkkke', 'ekkkkdddddddddddkkkkke', 'ekdkksSssssssssskkkwke', 'edddksssssssssskkbkrke', 'ekdkksssssssssskkkgkke', 'ekkkksssssssssskkkkkke', 'ekkkkdddddddddddkkkkke', 'ekkkkkkkkttkkkkkkkkkke', '.eeeeeeeeeeeeeeeeeeee.'],
    },
    glass: {
      pal: { c: '#d8e1e8', C: '#9fb0bd', w: '#7a0f24', W: '#b81d45' },
      rows: ['c........c', 'c........c', 'c........c', 'cWWWWWWWWc', 'cwwwwwwwwc', 'cwwwwwwwwc', '.cwwwwwwc.', '..cwwwwc..', '...cCCc...', '....cc....', '....cc....', '....cc....', '....cc....', '..cccccc..'],
    },
    choc: {
      pal: { f: '#d0d3d6', F: '#9da2a7', b: '#4a2a18', B: '#6b3d22', h: '#86502c' },
      rows: ['ffffbbbbbbbbbb', 'FffFbBhbBhbBhb', 'ffffbBBbBBbBBb', 'FffFbbbbbbbbbb', 'ffffbBhbBhbBhb', 'FffFbBBbBBbBBb', 'ffffbbbbbbbbbb'],
    },
    cheese: {
      pal: { c: '#a8661f', b: '#d9a441', B: '#e8bd5c', y: '#ffd34d', Y: '#ffe68a' },
      rows: ['cccccccccccccc', 'cbbbBbbbbbBbbc', 'cbBbbbbBbbbbbc', 'yyyyyyyyyyyyyy', 'yYyyyyYyyyyYyy', 'cbbbbBbbbbbbbc', 'cbBbbbbbbBbbbc', 'cccccccccccccc', '..y....y...y..', '..y.........y.'],
    },
    pill: {
      pal: { w: '#f4f4f4', o: '#f08a2e', O: '#c96a1a', g: '#c9c9c9' },
      rows: ['.wwwoo.', 'wwwwooo', 'gwwwOOO', '.ggOO..'],
    },
    keys: {
      pal: { r: '#c0c4c8', y: '#d4af37', Y: '#a8862a', k: '#1b1c1f', e: '#e34b4b' },
      rows: ['..rrr.........', '.r...r........', '.r...ryyyyyy.y.', '.r...rYYYYYYyY.', '..rrr.........', '...r..........', '..kkkk........', '.kkekkk.......', '.kkkkkk.......', '..kkkk........'],
    },
    clock: {
      pal: { r: '#c62d2d', R: '#8f1e1e', w: '#f2f2f2', k: '#1b1c1f', s: '#e0e0e0' },
      rows: ['.ss......ss.', 'sss.rrrr.sss', '.s.rrrrrr.s.', '..rrwwwwrr..', '.rrwwwkwwwr.', '.rwwwwkwwwwr', '.rwwwwkkkwwr', '.rwwwwwwwwwr', '.rrwwwwwwwr.', '..rrwwwwrr..', '...RRRRRR...', '..R......R..'],
    },
    bird: {
      pal: { b: '#7a5136', o: '#f08a2e', k: '#15171a', y: '#f2c230' },
      rows: ['...bb.....', '..bkbbb...', 'ybbbbbbbb.', '..oooobbbb', '..ooobb...', '...b.b....'],
    },
    bird2: {
      pal: { b: '#7a5136', o: '#f08a2e', k: '#15171a', y: '#f2c230' },
      rows: ['......bb..', '...bbbb...', '..bkbbb...', 'ybbbbbbbb.', '..oooobbbb', '...b.b....'],
    },
    flag: {
      pal: { p: '#8a6a4a', w: '#f2f2f2', W: '#c9ccd0' },
      rows: ['pwwwwwwwww', 'pwwwwwwwwW', 'pwwwwwwwWW', 'pwwwwwwwww', 'pWwwwwwwww', 'pWWwwwwwwW', 'p.........', 'p.........', 'p.........', 'p.........', 'p.........', 'p.........'],
    },
  };
  const sprites = {};
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
  // The Hard Foam Buster Sword (or the real one): pointing up, its hilt at the bottom.
  function swordSprite(real) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 64;
    const x = c.getContext('2d');
    const P = real ? { o: '#0f1114', m: '#9fb0c2', l: '#dfe8f1', h: '#ffffff', e: '#6f8195' } : { o: '#15171a', m: '#8f959c', l: '#bcc1c6', h: '#dfe2e5', e: '#6d7278' };
    const px = (cx, cy, col) => {
      x.fillStyle = col;
      x.fillRect(cx, cy, 1, 1);
    };
    for (let y = 0; y < 46; y++) {
      // the broad blade, cut off at a slant for its tip
      const left = 3;
      const right = y < 8 ? 3 + Math.round((12 - 3) * (y / 8)) : 12;
      for (let i = left; i <= right; i++) {
        let col = P.m;
        if (i === left || i === right || y === 0) col = P.o;
        else if (i === left + 1) col = P.h;
        else if (i <= left + 4) col = P.l;
        else if (i === right - 1) col = P.e;
        px(i, y, col);
      }
    }
    // the two holes near the guard
    for (const hy of [34, 39]) for (let i = 5; i <= 7; i++) for (let j = hy; j <= hy + 2; j++) px(i, j, '#0b0c0e');
    for (let i = 0; i < 16; i++) for (let j = 46; j <= 48; j++) px(i, j, j === 46 || i === 0 || i === 15 ? '#15171a' : real ? '#b7c2cc' : '#7c8288');
    for (let j = 49; j <= 59; j++) for (let i = 6; i <= 9; i++) px(i, j, i === 6 || i === 9 ? '#121214' : j % 3 ? '#2b2b2e' : '#4a4a50');
    for (let i = 5; i <= 10; i++) for (let j = 60; j <= 62; j++) px(i, j, '#5b6066');
    return c;
  }

  // ------------------------------------------------------------------ setup
  S.init = function (images) {
    S.bg = new Image();
    S.bg.src = images.night;
    S.bgLit = new Image();
    S.bgLit.src = images.nightLit;
    S.me = new Image();
    S.me.src = images.crispy;
    S.me.onload = () => {
      // his silhouette in red (hurt) and gold (fearless, willpower)
      S.meRed = tinted(S.me, '#ff2b2b');
      S.meGold = tinted(S.me, '#ffcf4a');
    };
    for (const k in PROPS) sprites[k] = pixelSprite(PROPS[k]);
    sprites.sword = swordSprite(false);
    sprites.swordReal = swordSprite(true);
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
  function tinted(im, color) {
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ------------------------------------------------------------------ positions
  const C = () => window.CREATURE;
  S.heroPoint = (k) => ({ head: [210, 560], chest: [210, 700], eyes: [215, 610], side: [330, 640] }[k] || [210, 620]);
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
    ctx.font = `${o.weight || 800} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (o.rot) {
      ctx.translate(x, y);
      ctx.rotate(o.rot);
      x = y = 0;
    }
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
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
  function clawMarks(ctx, x, y, p, n = 3, color = '#e0262c') {
    const q = clamp(p * 3, 0, 1);
    const fade = 1 - clamp((p - 0.5) * 2, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ox = x - 60 + i * 34;
      ctx.strokeStyle = '#1a0003';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(ox, y - 90);
      ctx.lineTo(ox + 70 * q, y - 90 + 170 * q);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.stroke();
    }
    ctx.restore();
  }

  // The swing of the sword: its grip off to the left of the creature, the blade sweeping from
  // up over the shoulder, across its chest, down to the floor.
  function swingFx(real) {
    const [cx, cy] = S.foePoint('chest');
    const px = cx - 270;
    const py = cy - 10;
    sfx(real ? 'realSlash' : 'swing');
    return add(700, (ctx, p) => {
      const a = -0.9 + ease(clamp(p / 0.6, 0, 1)) * 3.0; // 0 = blade straight up, clockwise
      const fade = 1 - clamp((p - 0.7) / 0.3, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.4 * fade;
      ctx.strokeStyle = real ? '#cfe8ff' : '#ffffff';
      ctx.lineWidth = 60;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(px, py, 300, Math.max(-0.9, a - 1.3) - Math.PI / 2, a - Math.PI / 2);
      ctx.stroke();
      ctx.restore();
      drawSprite(ctx, real ? 'swordReal' : 'sword', px, py, 7, { rot: a, ax: 0.5, ay: 0.85, alpha: fade });
      if (real && p > 0.3 && p < 0.6) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.shadowColor = '#7fd0ff';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(cx - 170, cy - 170);
        ctx.lineTo(cx + 170, cy + 150);
        ctx.stroke();
        ctx.restore();
      }
      if (p > 0.32 && p < 0.62) star(ctx, cx, cy, 80 * (1 - (p - 0.32) * 3), real ? '#e6f6ff' : '#fffbe8');
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
        drawSprite(ctx, 'bag', x, y, 8, { rot: q * 4.2, sx: 1 / squash, sy: squash, alpha: fade });
      });
    },
    tear() {
      const [cx, cy] = S.foePoint('chest');
      sfx('tear');
      sfx('poison', 350);
      const junk = particles(26, cx, cy, (i, a, b, c) => ({ vx: (a - 0.5) * 900, vy: -300 - b * 600, kind: i % 5, spin: (c - 0.5) * 12 }));
      return add(1100, (ctx, p) => {
        const tt = p * 1.1;
        for (const j of junk) {
          const x = j.x + j.vx * tt;
          const y = j.y + j.vy * tt + 900 * tt * tt;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(j.spin * tt);
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = ['#f2d34b', '#b9bec4', '#f2f2f2', '#4fb34a', '#7a5a3a'][j.kind];
          if (j.kind === 0) ctx.fillRect(-12, -4, 24, 8); // banana peel
          else if (j.kind === 1) ctx.fillRect(-6, -10, 12, 20); // can
          else if (j.kind === 2) ctx.fillRect(-10, -8, 20, 14); // paper
          else ctx.fillRect(-6, -6, 12, 12);
          ctx.restore();
        }
        // garbage juice bubbling on it
        ctx.fillStyle = 'rgba(110, 220, 80, 0.75)';
        for (let i = 0; i < 9; i++) {
          const by = cy + 60 - ((p * 260 + i * 40) % 220);
          ctx.beginPath();
          ctx.arc(cx - 70 + i * 18, by, 6 + (i % 3) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    early() {
      sfx('early');
      const [hx, hy] = S.heroPoint('head');
      const [fx, fy] = S.foePoint('head');
      return add(1800, (ctx, p) => {
        const a = Math.sin(Math.PI * p);
        // sunrise
        const g = ctx.createLinearGradient(0, H, 0, H * (0.9 - 0.7 * ease(Math.min(1, p * 1.5))));
        g.addColorStop(0, `rgba(255,170,60,${0.5 * a})`);
        g.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // the alarm clock, ringing
        const shake = Math.sin(S.t * 80) * 6 * (p < 0.6 ? 1 : 0);
        drawSprite(ctx, 'clock', 640 + shake, 170, 8, { alpha: a });
        // a bird, flying across
        const bx = -60 + p * (W + 120);
        drawSprite(ctx, Math.floor(S.t * 10) % 2 ? 'bird' : 'bird2', bx, 260 + Math.sin(p * 9) * 30, 6, { alpha: Math.min(1, a * 2) });
        // up for Crispy, down for it
        for (let i = 0; i < 3; i++) {
          const yy = ((p * 220 + i * 70) % 220);
          bigText(ctx, '▲', hx - 80 + i * 80, hy + 60 - yy, 40, '#ff5a3c', { alpha: a });
          bigText(ctx, '▼', fx - 70 + i * 70, fy + 40 + yy, 40, '#4aa8ff', { alpha: a });
        }
      });
    },
    authority(o = {}) {
      const onFoe = o.target === 'foe';
      const [x, y] = onFoe ? S.foePoint('head') : S.heroPoint('head');
      sfx('gavel', 380);
      return add(1400, (ctx, p) => {
        const drop = ease(clamp(p / 0.3, 0, 1));
        const lift = p > 0.4 && p < 0.55 ? Math.sin(((p - 0.4) / 0.15) * Math.PI) * 0.5 : 0;
        const ang = -1.2 + drop * 1.2 - lift;
        drawSprite(ctx, 'gavel', x + 40, y - 40, 9, { rot: ang, ax: 0.45, ay: 0.95, alpha: 1 - clamp((p - 0.85) / 0.15, 0, 1) });
        if (p > 0.28) {
          const q = (p - 0.28) / 0.72;
          ctx.save();
          ctx.globalAlpha = 1 - q;
          ctx.strokeStyle = '#ffe28a';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.ellipse(x, y + 40, 60 + q * 260, 20 + q * 80, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          if (p < 0.34) S.shake = Math.max(S.shake, 14);
          bigText(ctx, 'AUTHORITY', 640, 300, 110, '#ffffff', { stroke: '#b3121b', rot: -0.08, alpha: Math.min(1, (p - 0.28) * 6) * (1 - clamp((p - 0.8) / 0.2, 0, 1)) });
        }
      });
    },
    rg() {
      sfx('rg');
      const [cx, cy] = S.foePoint('chest');
      const ox = 400;
      const oy = 640;
      return add(1700, (ctx, p) => {
        const rise = ease(clamp(p / 0.25, 0, 1));
        drawSprite(ctx, 'rg', ox, oy + 80 - 80 * rise, 7, { alpha: 1 - clamp((p - 0.88) / 0.12, 0, 1) });
        if (p > 0.18 && p < 0.3) {
          ctx.fillStyle = `rgba(160,235,255,${0.5 - (p - 0.18) * 4})`;
          ctx.fillRect(ox - 60, oy - 30, 120, 50);
        }
        if (p > 0.28 && p < 0.85) {
          ctx.save();
          ctx.shadowColor = '#5fd8ff';
          ctx.shadowBlur = 24;
          for (let k = 0; k < 3; k++) bolt(ctx, ox, oy - 10, cx + (Math.random() - 0.5) * 80, cy + (Math.random() - 0.5) * 160, 90, k ? 3 : 7, k ? '#9feaff' : '#ffffff');
          // crackling round it
          for (let k = 0; k < 4; k++) {
            const a = Math.random() * Math.PI * 2;
            bolt(ctx, cx, cy, cx + Math.cos(a) * 120, cy + Math.sin(a) * 200, 40, 2, '#c8f4ff');
          }
          ctx.restore();
          if (Math.random() < 0.3) {
            ctx.fillStyle = 'rgba(180,240,255,0.25)';
            ctx.fillRect(0, 0, W, H);
          }
          // scanlines, like it's coming through a screen
          ctx.fillStyle = 'rgba(0,30,40,0.18)';
          for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
          S.shake = Math.max(S.shake, 4);
        }
      });
    },
    wine() {
      sfx('wine');
      const x = 390;
      const y = 600;
      return add(1600, (ctx, p) => {
        const fill = clamp((p - 0.15) / 0.45, 0, 1);
        const tilt = p > 0.65 ? -Math.sin(((p - 0.65) / 0.35) * Math.PI) * 0.9 : 0;
        // the glass, filled from the bottom up with wine
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        ctx.imageSmoothingEnabled = false;
        const sp = sprites.glass;
        const sc = 9;
        ctx.globalAlpha = 1 - clamp((p - 0.9) / 0.1, 0, 1);
        // empty glass (wine rows hidden above the fill line)
        const rows = Math.round(4 * fill);
        ctx.drawImage(sp, -sp.width * sc * 0.5, -sp.height * sc * 0.5, sp.width * sc, sp.height * sc);
        ctx.fillStyle = 'rgba(20,24,30,1)';
        ctx.fillRect(-sp.width * sc * 0.5 + sc, -sp.height * sc * 0.5 + 3 * sc, (sp.width - 2) * sc, (5 - rows) * sc);
        ctx.restore();
        if (p > 0.12 && p < 0.55) {
          ctx.fillStyle = '#a8153a';
          ctx.fillRect(x - 4, y - 220, 8, 160);
        }
        S.wobble = p > 0.6 ? Math.sin(((p - 0.6) / 0.4) * Math.PI) * 10 : 0;
      });
    },
    slice() {
      sfx('slice');
      const [cx, cy] = S.foePoint('chest');
      const crumbs = particles(30, cx, cy, (i, a, b) => ({ vx: (a - 0.5) * 800, vy: (b - 0.7) * 700, s: 4 + (i % 3) * 3 }));
      return add(1000, (ctx, p) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.shadowColor = '#ffb347';
        ctx.shadowBlur = 18;
        for (const [k, t0] of [[0, 0], [1, 0.18]]) {
          const q = clamp((p - t0) / 0.15, 0, 1);
          const fade = 1 - clamp((p - t0 - 0.25) / 0.3, 0, 1);
          if (q <= 0 || fade <= 0) continue;
          ctx.globalAlpha = fade;
          ctx.strokeStyle = '#fff6dc';
          ctx.lineWidth = 9;
          ctx.beginPath();
          const s = k ? 1 : -1;
          ctx.moveTo(cx - 180 * s, cy - 200);
          ctx.lineTo(cx - 180 * s + 360 * s * q, cy - 200 + 380 * q);
          ctx.stroke();
        }
        ctx.restore();
        if (p > 0.25) {
          const tt = (p - 0.25) * 1.2;
          for (const c of crumbs) {
            ctx.fillStyle = c.s > 6 ? '#e09a2c' : '#f7c75a';
            ctx.globalAlpha = 1 - p;
            ctx.fillRect(c.x + c.vx * tt, c.y + c.vy * tt + 700 * tt * tt, c.s, c.s);
          }
          ctx.globalAlpha = 1;
          bigText(ctx, 'CRISPY!', cx, cy - 250, 70, '#ffcf4a', { alpha: 1 - clamp((p - 0.7) / 0.3, 0, 1), rot: -0.12 });
        }
      });
    },
    taste() {
      sfx('taste');
      return add(2400, (ctx, p) => {
        const a = Math.sin(Math.PI * p);
        ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`;
        ctx.fillRect(0, 0, W, H);
        const real = p > 0.45;
        drawSprite(ctx, real ? 'swordReal' : 'sword', 640, 470, 9, { alpha: Math.min(1, a * 2.5) });
        // a shine runs up the blade
        if (p > 0.12 && p < 0.45) {
          const q = (p - 0.12) / 0.33;
          const y = 470 + 288 - q * 576;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(640 - 50, y - 12, 100, 24);
          ctx.restore();
        }
        if (p > 0.43 && p < 0.52) {
          ctx.fillStyle = `rgba(255,255,255,${1 - (p - 0.43) / 0.09})`;
          ctx.fillRect(0, 0, W, H);
        }
        if (real) {
          star(ctx, 640 + 8, 470 - 280, 30 + Math.sin(S.t * 20) * 8, '#ffffff');
          bigText(ctx, 'TASTE OF REALITY', 640, 820 - 30 * ease(clamp((p - 0.45) * 4, 0, 1)), 80, '#dff1ff', { stroke: '#10304a', alpha: Math.min(1, (p - 0.45) * 5) * (1 - clamp((p - 0.85) / 0.15, 0, 1)) });
        }
      });
    },
    nut() {
      // a shout, a little shine... that grows into an explosion, and a CRACK
      const [cx, cy0] = S.foePoint('chest');
      const cy = cy0 + 70; // right where it hurts
      sfx('nutShine', 600);
      sfx('boom', 1750);
      sfx('crack', 2250);
      const fire = particles(40, cx, cy, (i, a, b) => ({ a: a * Math.PI * 2, v: 200 + b * 600, r: 20 + (i % 5) * 14 }));
      const cracks = [];
      for (let i = 0; i < 9; i++) {
        let x = cx;
        let y = cy;
        const pts = [[x, y]];
        let a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
        for (let k = 0; k < 7; k++) {
          a += (Math.random() - 0.5) * 0.9;
          x += Math.cos(a) * (60 + Math.random() * 70);
          y += Math.sin(a) * (60 + Math.random() * 70);
          pts.push([x, y]);
        }
        cracks.push(pts);
      }
      return add(3800, (ctx, p) => {
        const T = p * 3.8;
        if (T < 0.9) {
          const q = ease(Math.min(1, T / 0.25));
          bigText(ctx, 'NUTCRACKAAAA!!!', 640, 200, 96 + (1 - q) * 80, '#ffd23f', { stroke: '#7a1010', rot: -0.06, alpha: q });
          if (T < 0.3) S.shake = Math.max(S.shake, 8);
        }
        if (T > 0.6 && T < 1.8) {
          // the shine: small, then bigger, pulsing
          const q = (T - 0.6) / 1.2;
          const r = 10 + q * q * 90 + Math.sin(S.t * 30) * 6 * q;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
          g.addColorStop(0, `rgba(255,255,230,${0.9})`);
          g.addColorStop(1, 'rgba(255,220,120,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          star(ctx, cx, cy, r, '#ffffff', 0.12);
          if (q > 0.6) S.shake = Math.max(S.shake, 4 * q);
        }
        if (T > 1.75 && T < 3.4) {
          const q = (T - 1.75) / 1.65;
          if (q < 0.08) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
          }
          if (q < 0.15) S.shake = 26;
          // the fireball: smoke behind, then fire, then a white-hot core, cooling as it spreads
          ctx.globalAlpha = 1 - clamp((q - 0.7) / 0.3, 0, 1);
          const layers = [
            [1.25, q < 0.3 ? '#7a1c10' : '#2e2220'],
            [1.0, q < 0.5 ? '#e2541f' : '#5a2a1c'],
            [0.72, q < 0.6 ? '#ffb03a' : '#a8461e'],
            [0.42, q < 0.35 ? '#fff4c2' : q < 0.6 ? '#ffd76a' : '#e2741f'],
          ];
          for (const [k, col] of layers) {
            ctx.fillStyle = col;
            for (const f of fire) {
              const d = f.v * Math.min(q, 0.45);
              const r = f.r * (1 + q * 2) * (1 - q * 0.6) * k;
              ctx.beginPath();
              ctx.arc(cx + Math.cos(f.a) * d, cy + Math.sin(f.a) * d * 0.7 - q * 80 * k, Math.max(0, r), 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
          ctx.strokeStyle = `rgba(255,240,200,${1 - q})`;
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 80 + q * 700, 30 + q * 260, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (T > 2.25) {
          // CRACK, and the screen cracks with it
          const q = (T - 2.25) / 1.55;
          ctx.save();
          ctx.globalAlpha = 1 - clamp((q - 0.65) / 0.35, 0, 1);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          for (const pts of cracks) {
            ctx.beginPath();
            const n = Math.ceil(pts.length * Math.min(1, q * 4));
            pts.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
          ctx.restore();
          const s = 1 + (1 - ease(Math.min(1, q * 5))) * 0.8;
          bigText(ctx, 'CRACK', cx, cy - 40, 170 * s, '#ffffff', { stroke: '#2a0a0a', rot: 0.1, alpha: 1 - clamp((q - 0.7) / 0.3, 0, 1) });
        }
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
      return add(1300, (ctx, p) => {
        const a = Math.sin(Math.PI * p);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 12; i++) {
          const xx = x - 180 + i * 32 + Math.sin(S.t * 3 + i) * 6;
          const g = ctx.createLinearGradient(0, 800, 0, 300);
          g.addColorStop(0, `rgba(255,200,80,${0.35 * a})`);
          g.addColorStop(1, 'rgba(255,200,80,0)');
          ctx.fillStyle = g;
          ctx.fillRect(xx, 300 + ((i * 53) % 120), 10, 500);
        }
        ctx.restore();
        bigText(ctx, 'FEARLESS', x, y - 160, 76, '#ffd86b', { stroke: '#4a2a00', alpha: a });
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
          ctx.fillStyle = creepy ? '#1b0b0d' : '#f4f1ea';
          ctx.strokeStyle = creepy ? '#b8232b' : '#15171a';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.roundRect(x - w / 2, y - 40, w, 80, 16);
          ctx.fill();
          ctx.stroke();
          ctx.font = `700 ${creepy ? 38 : 44}px "Share Tech Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = creepy ? '#ff5a5f' : '#15171a';
          ctx.fillText(txt, x + (creepy ? (Math.random() - 0.5) * 4 : 0), y + (creepy ? (Math.random() - 0.5) * 4 : 0));
          ctx.restore();
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
        drawSprite(ctx, 'choc', 400, 600 - ease(Math.min(1, p * 4)) * 30, 9, { alpha: a });
        if (p > 0.38) {
          // the bite out of it
          ctx.fillStyle = '#14161a';
          ctx.beginPath();
          ctx.arc(400 + 63, 570, 26, 0, Math.PI * 2);
          ctx.globalAlpha = a;
          ctx.fill();
          const tt = p - 0.38;
          ctx.fillStyle = '#4a2a18';
          for (const c of crumbs) ctx.fillRect(c.x + 60 + c.vx * tt, c.y - 30 + c.vy * tt + 900 * tt * tt, 6, 6);
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
        drawSprite(ctx, 'cheese', 400, y, 9, { alpha: a });
        // steam
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
        ctx.lineWidth = 6;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          for (let k = 0; k < 10; k++) ctx.lineTo(370 + i * 30 + Math.sin(S.t * 5 + k * 0.8 + i) * 8, y - 60 - k * 12);
          ctx.stroke();
        }
        // the cheese pull
        if (p > 0.45) {
          const q = Math.min(1, (p - 0.45) * 3);
          ctx.fillStyle = `rgba(255,211,77,${a})`;
          ctx.fillRect(330, y - 10, 10, 10 + q * 90);
        }
      });
    },
    pills() {
      sfx('pills');
      const [x, y] = S.heroPoint('head');
      return add(1200, (ctx, p) => {
        const a = 1 - clamp((p - 0.8) / 0.2, 0, 1);
        drawSprite(ctx, 'pill', x - 30, y - 60 - Math.sin(p * Math.PI) * 120, 8, { rot: p * 8, alpha: a });
        drawSprite(ctx, 'pill', x + 50, y - 50 - Math.sin(p * Math.PI) * 140, 8, { rot: -p * 9, alpha: a });
        for (let i = 0; i < 6; i++) {
          const an = (i / 6) * Math.PI * 2 + S.t * 2;
          star(ctx, x + Math.cos(an) * 150 * p, y + Math.sin(an) * 110 * p, 16 * a, '#fff6c2');
        }
      });
    },
    keys() {
      sfx('keys');
      sfx('alarm', 700);
      C().act('distracted');
      return add(2100, (ctx, p) => {
        const a = 1 - clamp((p - 0.85) / 0.15, 0, 1);
        drawSprite(ctx, 'keys', 400 + Math.sin(S.t * 40) * (p < 0.3 ? 6 : 0), 600, 8, { alpha: a, rot: Math.sin(S.t * 30) * 0.15 });
        if (p > 0.3) windowsFlash(ctx, p);
        if (p > 0.35) bigText(ctx, 'WEE-OOO WEE-OOO', 760, 300, 64, Math.floor(S.t * 6) % 2 ? '#ff6a3c' : '#ffd23f', { alpha: a, rot: -0.04 });
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
    spare() {
      sfx('spare');
      return add(1500, (ctx, p) => {
        const a = Math.sin(Math.PI * p);
        drawSprite(ctx, 'flag', 400, 560, 9, { alpha: a, sx: 1 + Math.sin(S.t * 8) * 0.06 });
      });
    },
  };
  function windowsFlash(ctx, p) {
    // the car alarm's lights through the blinds
    const on = Math.floor(S.t * 6) % 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = on ? 'rgba(255,120,30,0.35)' : 'rgba(255,40,30,0.25)';
    for (const [x0, y0, x1, y1] of [[330, 268, 476, 520], [684, 262, 870, 505]]) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const g = ctx.createRadialGradient(560, 380, 20, 560, 380, 700);
    g.addColorStop(0, on ? 'rgba(255,120,30,0.18)' : 'rgba(255,40,30,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    void p;
  }

  // The creature's moves.
  const FOE = {
    claw: () => (sfx('claw', 200), heroClaw(700, 3)),
    rake: () => (sfx('claw', 120), sfx('claw', 330), heroClaw(800, 2)),
    reach: () => (sfx('reach'), sfx('claw', 650), heroClaw(1200, 3, 0.5)),
    screech: () => (sfx('screech'), waves(1300, '#ffffff')),
    scream: () => (sfx('scream'), waves(1300, '#ff4d4d')),
    twitch: () => (sfx('twitch'), glitch(1100)),
    lash: () => (sfx('lash'), whips(1000, 2)),
    lash3: () => (sfx('lash'), whips(1100, 3)),
    weep: () => (sfx('weep'), tears(1600)),
    lengthen: () => (sfx('bones'), glitch(1200, 0.4)),
    lunge: () => (sfx('lunge'), heroClaw(700, 3, 0.35)),
    stare: () => (sfx('stare'), stareFx(1500)),
    harden: () => (sfx('harden'), hardenFx(1100)),
    mimic: () => (sfx('swing'), darkSwing(800)),
    grab: () => (sfx('grab', 500), hands(1200)),
    smile: () => (sfx('smile'), stareFx(1700, true)),
    pat: () => (sfx('pat'), patFx(1000)),
  };
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
        ctx.globalAlpha = (1 - q) * 0.6;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x, y, 30 + q * 600, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      S.shake = Math.max(S.shake, 6 * Math.sin(Math.PI * p));
      S.wobble = Math.sin(Math.PI * p) * 6;
    });
  }
  function glitch(dur, k = 1) {
    return add(dur, (ctx, p) => {
      if (Math.random() < 0.5 * k) {
        for (let i = 0; i < 6; i++) {
          const y = Math.random() * H;
          const h = 4 + Math.random() * 30;
          ctx.drawImage(ctx.canvas, 0, y, W, h, (Math.random() - 0.5) * 60 * k, y, W, h);
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
      drawSprite(ctx, 'sword', x + 200, y - 260, 7, { rot: a, ay: 0.98, alpha: 1 - clamp((p - 0.7) / 0.3, 0, 1) });
      ctx.restore();
    });
  }
  function hands(dur) {
    const [x, y] = S.heroPoint('chest');
    return add(dur, (ctx, p) => {
      const q = ease(clamp(p / 0.4, 0, 1));
      ctx.fillStyle = '#a58f7c';
      for (const s of [-1, 1]) {
        const hx = x + s * (420 - 260 * q);
        ctx.fillRect(hx - 60, y - 140, 120, 34);
        for (let k = 0; k < 4; k++) ctx.fillRect(hx - s * 60 - (s > 0 ? 0 : 0), y - 140 + k * 9, -s * 50 * q, 6);
      }
      if (p > 0.4 && p < 0.7) S.hero.shake = 6;
    });
  }
  function patFx(dur) {
    const [x, y] = S.heroPoint('head');
    return add(dur, (ctx, p) => {
      const bob = Math.abs(Math.sin(p * Math.PI * 2)) * 30;
      ctx.fillStyle = '#b39a85';
      ctx.fillRect(x + 70, y + 70 - bob, 110, 36);
      ctx.fillStyle = `rgba(120,170,255,${0.15 * Math.sin(Math.PI * p)})`;
      ctx.fillRect(0, 0, W, H);
    });
  }

  S.play = (name, o) => (FX[name] ? FX[name](o) : 0);
  S.foeMove = (name) => (FOE[name] ? FOE[name]() : 0);

  // ADJUST: the screen shakes and bleeds while it changes.
  S.adjust = function () {
    sfx('adjust');
    S.splats = [];
    for (let i = 0; i < 9; i++) {
      const side = i % 4;
      S.splats.push({ x: side === 0 ? 0 : side === 1 ? W : Math.random() * W, y: side === 2 ? 0 : side === 3 ? H : Math.random() * H, r: 60 + Math.random() * 120, at: 0.9 + Math.random() * 1.5, drops: Math.floor(4 + Math.random() * 6), seed: Math.random() * 100 });
    }
    return add(3800, (ctx, p) => {
      const T = p * 3.8;
      if (T > 0.3 && T < 2.6 && Math.random() < 0.12) {
        ctx.fillStyle = 'rgba(160,0,10,0.28)';
        ctx.fillRect(0, 0, W, H);
      }
      S.shake = Math.max(S.shake, T < 2.6 ? 3 + Math.random() * 5 : 0);
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

  // WILLPOWER: down, a heartbeat, and back up in a golden light.
  S.revive = function () {
    sfx('revive');
    return add(3400, (ctx, p) => {
      const T = p * 3.4;
      const dark = T < 2 ? Math.min(1, T * 2) : Math.max(0, 1 - (T - 2) * 1.5);
      ctx.fillStyle = `rgba(40,0,0,${0.85 * dark})`;
      ctx.fillRect(0, 0, W, H);
      if (T < 2) {
        const beat = Math.max(0, Math.sin(T * Math.PI * 1.43)) ** 6;
        const g = ctx.createRadialGradient(640, 480, 100, 640, 480, 800);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(200,0,20,${0.5 * beat})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        S.hero.down = 1;
      } else {
        S.hero.down = Math.max(0, 1 - (T - 2) * 2);
        S.hero.gold = 1;
        const q = T - 2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, H, 0, 0);
        g.addColorStop(0, `rgba(255,190,70,${0.55 * (1 - q / 1.4)})`);
        g.addColorStop(1, 'rgba(255,190,70,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        bigText(ctx, 'WILLPOWER', 640, 300, 120, '#ffd86b', { stroke: '#4a2400', alpha: Math.min(1, q * 3) * (1 - clamp((q - 1.1) / 0.3, 0, 1)) });
      }
    }, { top: true });
  };

  S.setLights = (on) => (S.lightsTarget = on ? 1 : 0);

  // Confetti, for the birthday.
  S.confetti = function () {
    const bits = [];
    for (let i = 0; i < 160; i++) bits.push({ x: Math.random() * W, y: -Math.random() * H, vy: 120 + Math.random() * 160, vx: (Math.random() - 0.5) * 60, s: 8 + Math.random() * 8, c: ['#ffd23f', '#ff5a8a', '#4ad6ff', '#7dff6b', '#ffffff', '#ff8a3c'][i % 6], spin: Math.random() * 6 });
    return add(30000, (ctx, p) => {
      const tt = p * 30;
      for (const b of bits) {
        const y = ((b.y + b.vy * tt) % (H + 40)) - 20;
        const x = b.x + b.vx * tt + Math.sin(tt * 2 + b.spin) * 20;
        ctx.fillStyle = b.c;
        ctx.fillRect(x, y, b.s, b.s * (0.4 + 0.6 * Math.abs(Math.sin(tt * 4 + b.spin))));
      }
    }, { top: true });
  };

  // ------------------------------------------------------------------ every frame
  S.update = function (dt) {
    S.t += dt;
    S.lights += (S.lightsTarget - S.lights) * Math.min(1, dt * 3);
    C().lights = S.lights;
    S.shake *= Math.pow(0.02, dt);
    if (S.shake < 0.3) S.shake = 0;
    S.wobble *= Math.pow(0.1, dt);
    const h = S.hero;
    h.shake *= Math.pow(0.01, dt);
    h.flash = Math.max(0, h.flash - dt * 3);
    h.gold = Math.max(0, h.gold - dt * 0.6);
    S.effects = S.effects.filter((e) => S.t - e.t0 < e.dur);
    S.popups = S.popups.filter((q) => S.t - q.t0 < q.dur);
    if (!S.effects.length) S.flicker = 0;
  };

  S.draw = function (ctx) {
    ctx.save();
    if (S.shake) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    if (S.wobble) ctx.translate(Math.sin(S.t * 7) * S.wobble, Math.cos(S.t * 5) * S.wobble * 0.5);
    // the room, and the lights when they're up (or flickering)
    ctx.drawImage(S.bg, -8, -8, W + 16, H + 16);
    const lit = Math.max(S.lights, S.flicker);
    if (lit > 0.01) {
      ctx.globalAlpha = lit;
      ctx.drawImage(S.bgLit, -8, -8, W + 16, H + 16);
      ctx.globalAlpha = 1;
    }
    // the lamp's light breathes a little
    const breathe = 0.04 + Math.max(0, Math.sin(S.t * 0.7) * Math.sin(S.t * 2.3)) * 0.05;
    ctx.fillStyle = `rgba(0,0,0,${breathe})`;
    ctx.fillRect(0, 0, W, H);

    C().draw(ctx);
    drawHero(ctx);
    for (const e of S.effects) if (!e.top) e.draw(ctx, clamp((S.t - e.t0) / e.dur, 0, 1));
    for (const q of S.popups) {
      const p = (S.t - q.t0) / q.dur;
      bigText(ctx, q.text, q.x, q.y - ease(Math.min(1, p * 2)) * 60, q.size * (p < 0.1 ? 1 + (0.1 - p) * 4 : 1), q.color, { alpha: 1 - clamp((p - 0.7) / 0.3, 0, 1) });
    }
    for (const e of S.effects) if (e.top) e.draw(ctx, clamp((S.t - e.t0) / e.dur, 0, 1));
    ctx.restore();
    // film grain over everything
    const g = S.grain[Math.floor(Math.random() * S.grain.length)];
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    const ox = Math.floor(Math.random() * 256);
    const oy = Math.floor(Math.random() * 256);
    for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) ctx.drawImage(g, x, y);
    ctx.restore();
  };

  function drawHero(ctx) {
    const h = S.hero;
    if (!S.me.complete) return;
    const sc = h.scale;
    const w = S.me.width * sc;
    const hh = S.me.height * sc;
    // he breathes: up a pixel, down a pixel
    const bob = Math.sin(S.t * 2.4) > 0.3 ? -sc : 0;
    let x = h.x + h.dx;
    let y = h.y + bob + h.down * 140;
    if (h.shake > 0.5) x += (Math.random() - 0.5) * h.shake * 2;
    if (h.afraid) x += Math.round((Math.random() - 0.5) * 3) * 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (h.gold > 0.01 && S.meGold) {
      ctx.globalAlpha = Math.min(1, h.gold) * 0.8;
      for (const [dx, dy] of [[-sc, 0], [sc, 0], [0, -sc], [0, sc]]) ctx.drawImage(S.meGold, x + dx, y + dy, w, hh);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(S.me, x, y, w, hh);
    const red = Math.max(h.flash, h.critical ? 0.18 + Math.sin(S.t * 4) * 0.12 : 0);
    if (red > 0.01 && S.meRed) {
      ctx.globalAlpha = Math.min(0.75, red);
      ctx.drawImage(S.meRed, x, y, w, hh);
    }
    ctx.restore();
  }

  S.hitHero = function () {
    S.hero.shake = 10;
    S.hero.flash = 1;
  };
  S.reset = function () {
    S.effects = [];
    S.popups = [];
    S.lights = S.lightsTarget = 0;
    S.hero.gold = S.hero.flash = S.hero.down = S.hero.dx = 0;
  };
})();
