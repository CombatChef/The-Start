/*
 * What's on the screen in Brayan's fight: the school after hours (the front hallway, HALLWAY A,
 * CLASSROOM A), smooth; the Gunman standing in it, swaying, a row of his pixels at a time; and
 * everything that happens, at a third of the resolution and dithered: his attacks on Brayan's
 * nerve (the dark, faces made of his own), the flash of his gun, Brayan's eyes narrowing, the
 * roots in CLASSROOM A, and what's in there.
 */
(function () {
  const W = 1280;
  const H = 960;
  const PX = 3; // screen pixels to each of the effects'
  const LW = Math.ceil(W / PX);
  const LH = H / PX;
  const FONT = '"Pixelify Sans", "Courier New", monospace';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const A = () => window.AUDIO;

  const S = {
    t: 0,
    place: 'entrance',
    shake: 0,
    dark: 0, // the hall going dark round Brayan (his attacks), 0..1
    darkTarget: 0,
    black: 0, // all the way black: travelling, the endings
    blackTarget: 0,
    effects: [],
    popups: [],
    // the Gunman: there or not (a: how much), and how he is
    gun: { on: false, a: 0, stunned: 0, away: 0, lunge: 0, lungeTarget: 0, hit: 0, glint: 0, down: 0 },
    found: {}, // the hidden things he's taken
    // CLASSROOM A: how awake it is, how far its root has grown, the roots coming down at him,
    // and it, at the back
    room: { stage: 1, grow: 0, fall: 0, tree: 0 },
    hero: { shake: 0, flash: 0, down: 0, gold: 0 },
  };
  window.SCENE = S;

  const sprites = {};
  let I = null;
  S.init = function (images) {
    I = images;
    // (`dim`: darker, once, here: not every frame)
    const load = (key, src, dim) => {
      if (!src) return;
      const im = new Image();
      im.onload = () => {
        if (!dim) return (sprites[key] = im);
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = im.height;
        const x = c.getContext('2d');
        x.filter = `brightness(${dim})`;
        x.drawImage(im, 0, 0);
        sprites[key] = c;
      };
      im.src = src;
    };
    for (const [name, p] of Object.entries(images.places)) {
      load(name + ':bg', p.bg);
      load(name + ':shadow', p.shadow);
      load(name + ':flash', p.flash);
      for (const [k, h] of Object.entries(p.hidden || {})) load(name + ':' + k, h.src);
    }
    load('gunman', images.gunman);
    images.faces.forEach((src, i) => load('face' + i, src));
    for (const [k, src] of Object.entries(images.items)) load('item:' + k, src);
    load('tree', images.tree, 0.45);
    images.roots.forEach((src, i) => load('root' + i, src, 0.55));
    images.scare.forEach((src, i) => load('scare' + i, src));
    // the low layers: under the HUD, over it
    const layer = () => {
      const c = document.createElement('canvas');
      c.width = LW;
      c.height = LH;
      return { c, x: c.getContext('2d', { willReadFrequently: true }) };
    };
    S.low = layer();
    S.lowFx = layer();
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
    S.gunCanvas = document.createElement('canvas');
  };
  S.ready = () => !!sprites['entrance:bg'];
  const P = () => I.places[S.place];

  // ------------------------------------------------------------------ places, and him
  S.setPlace = function (name) {
    S.place = name;
    S.dark = S.darkTarget = 0;
  };
  // He's there (or not): in a flicker, out of the dark.
  S.showGunman = function (on) {
    S.gun.on = on;
    if (on) {
      S.gun.stunned = S.gun.away = S.gun.down = 0;
      A().play('appear');
    }
    return 900;
  };
  S.setGunState = function ({ stunned, away } = {}) {
    if (stunned !== undefined) S.gun.stunTarget = stunned ? 1 : 0;
    if (away !== undefined) S.gun.awayTarget = away ? 1 : 0;
  };
  // where on the stage a part of him is (head, chest, gun)
  S.gunPoint = function (part) {
    const g = P().gunman;
    if (!g) return [640, 400];
    const im = sprites.gunman;
    const h = im ? im.height : 228;
    const rows = { head: 18, chest: 70, gun: I.muzzle[1], feet: h };
    const x = part === 'gun' ? I.muzzle[0] - I.gunmanFeetX : 2;
    return [g.x + x * g.scale, g.y - (h - rows[part]) * g.scale];
  };
  S.heroPoint = () => [160, 640];

  // Black, all the way (a run down a hall; the end), and back.
  S.toBlack = function (on, sec = 0.5) {
    S.blackTarget = on ? 1 : 0;
    S.blackSpeed = 1 / sec;
    return sec * 1000;
  };

  // ------------------------------------------------------------------ effects
  function add(dur, draw, o = {}) {
    S.effects.push({ t0: S.t, dur: dur / 1000, draw, top: !!o.top });
    return dur;
  }
  S.popup = function (text, x, y, o = {}) {
    S.popups.push({ text, x, y, t0: S.t, dur: o.dur || 1, color: o.color || '#d9d2c4', size: o.size || 30 });
  };
  function bigText(l, text, x, y, size, fill, o = {}) {
    l.save();
    l.globalAlpha = o.alpha ?? 1;
    l.font = `600 ${size}px ${FONT}`;
    l.textAlign = 'center';
    l.textBaseline = 'middle';
    l.lineWidth = 6;
    l.strokeStyle = '#000';
    l.strokeText(text, x, y);
    l.fillStyle = fill;
    l.fillText(text, x, y);
    l.restore();
  }
  function star(l, x, y, r, color, thin = 0.18) {
    l.fillStyle = color;
    l.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? r * thin : r;
      l.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    l.fill();
  }
  // a face of his, at x, y (its middle), k screen pixels to each of its own
  function face(l, i, x, y, k, alpha = 1, jitter = 0) {
    const im = sprites['face' + i];
    if (!im) return;
    l.save();
    l.globalAlpha = alpha;
    l.filter = 'brightness(0.6)';
    const jx = jitter ? Math.round((Math.random() - 0.5) * jitter) * k : 0;
    l.drawImage(im, x - (im.width * k) / 2 + jx, y - (im.height * k) / 2, im.width * k, im.height * k);
    l.restore();
  }
  // a little school chair, in pixels, for throwing
  const CHAIR = ['..XXXXXX..', '..X....X..', '..XXXXXX..', '...X..X...', '.XXXXXXXX.', '.XXXXXXXX.', '.X......X.', '.X......X.', 'X........X'];
  function chair(l, x, y, k, rot) {
    l.save();
    l.translate(x, y);
    l.rotate(rot);
    l.fillStyle = '#6d5a48';
    CHAIR.forEach((r, j) => [...r].forEach((c, i) => c === 'X' && l.fillRect((i - 5) * k, (j - 4) * k, k, k)));
    l.restore();
  }
  function drawItem(l, key, x, y, k, alpha = 1) {
    const im = sprites['item:' + key];
    if (!im) return;
    l.save();
    l.globalAlpha = alpha;
    l.drawImage(im, x - (im.width * k) / 2, y - (im.height * k) / 2, im.width * k, im.height * k);
    l.restore();
  }

  const FX = {
    attack() {
      A().play('swing');
      setTimeout(() => A().play('hit'), 260);
      const [x, y] = S.gunPoint('chest');
      setTimeout(() => (S.gun.hit = 1), 260);
      return add(700, (l, p) => {
        if (p < 0.35) {
          const q = p / 0.35;
          l.strokeStyle = '#d8d2c6';
          l.lineWidth = 6;
          l.beginPath();
          l.moveTo(x - 140 + q * 60, y - 120 + q * 40);
          l.lineTo(x + 80 * q, y + 60 * q);
          l.stroke();
        } else star(l, x, y, 60 * (1 - (p - 0.35) / 0.65) + 20, '#e8e2d6');
      });
    },
    voice() {
      A().play('voice');
      S.shake = 6;
      const [x, y] = S.gunPoint('chest');
      setTimeout(() => (S.gun.hit = 1), 450);
      return add(1000, (l, p) => {
        for (let i = 0; i < 4; i++) {
          const q = clamp(p * 1.4 - i * 0.12, 0, 1);
          if (q <= 0 || q >= 1) continue;
          l.strokeStyle = `rgba(220,214,200,${1 - q})`;
          l.lineWidth = 6;
          l.beginPath();
          const cx = 640 + (x - 640) * q;
          const cy = 940 + (y - 940) * q;
          l.ellipse(cx, cy, 60 + 160 * (1 - q), 30 + 90 * (1 - q), 0, Math.PI * 1.1, Math.PI * 1.9);
          l.stroke();
        }
      });
    },
    chair() {
      A().play('chair');
      const [x, y] = S.gunPoint('chest');
      setTimeout(() => (S.gun.hit = 1), 380);
      return add(1000, (l, p) => {
        if (p < 0.4) {
          const q = p / 0.4;
          chair(l, 200 + (x - 200) * q, 900 - (900 - y) * q - Math.sin(q * Math.PI) * 120, 12 - 5 * q, q * 9);
        } else {
          const q = (p - 0.4) / 0.6;
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + 0.3;
            l.fillStyle = `rgba(109,90,72,${1 - q})`;
            l.fillRect(x + Math.cos(a) * 140 * q, y + Math.sin(a) * 100 * q + 120 * q * q, 12, 9);
          }
        }
      });
    },
    brace() {
      A().play('brace');
      S.hero.gold = 1;
      return add(800, (l, p) => {
        l.fillStyle = `rgba(150,180,230,${0.5 * (1 - p)})`;
        for (let i = 0; i < 6; i++) l.fillRect(0, H - 40 - i * 30 - p * 80, W, 6);
      });
    },
    breath() {
      A().play('breath');
      S.darkTarget = 0;
      return add(2600, (l, p, ctx) => {
        const r = Math.sin(p * Math.PI);
        const g = ctx.createRadialGradient(640, 960, 40, 640, 960, 500 * r + 220);
        g.addColorStop(0, `rgba(160,190,220,${0.22 * r})`);
        g.addColorStop(1, 'rgba(160,190,220,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
    },
    bec() {
      A().play('eat');
      return add(1800, (l, p) => {
        const y = 760 - ease(Math.min(1, p * 3)) * 240;
        const bites = Math.floor(p * 4);
        drawItem(l, 'bec', 640, y, 4, p > 0.85 ? (1 - p) / 0.15 : 1);
        // bites out of it
        l.fillStyle = '#000';
        l.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < bites; i++) {
          l.beginPath();
          l.arc(640 + 150 - i * 40, y - 30 + (i % 2) * 20, 34, 0, Math.PI * 2);
          l.fill();
        }
        l.globalCompositeOperation = 'source-over';
      }, { top: true });
    },
    newports() {
      A().play('lighter');
      const puffs = [];
      for (let i = 0; i < 40; i++) puffs.push({ x: 600 + Math.random() * 80, d: Math.random(), s: 0.5 + Math.random() });
      return add(3600, (l, p) => {
        drawItem(l, 'newports', 560, 700 - ease(Math.min(1, p * 4)) * 120, 3, p > 0.4 ? Math.max(0, 1 - (p - 0.4) * 4) : 1);
        // smoke, curling up
        for (const pf of puffs) {
          const q = (p * 1.4 - pf.d * 0.5) % 1;
          if (q < 0 || p < 0.25) continue;
          l.fillStyle = `rgba(190,196,200,${0.35 * (1 - q)})`;
          const r = 6 + q * 30 * pf.s;
          l.fillRect(pf.x + Math.sin(q * 6 + pf.d * 9) * 50 * q, 760 - q * 520 * pf.s, r, r);
        }
      }, { top: true });
    },
    kids() {
      A().play('kids');
      return add(2200, (l, p, ctx) => {
        // warm, faint: the bus's lights through the doors at the front, for a moment
        const r = Math.sin(p * Math.PI);
        ctx.fillStyle = `rgba(255,214,140,${0.1 * r})`;
        ctx.fillRect(0, 0, W, H);
        l.fillStyle = `rgba(255,214,140,${0.5 * r})`;
        for (let i = 0; i < 12; i++) {
          const x = ((i * 157) % W) + Math.sin(S.t + i) * 10;
          const y = 900 - ((p * 400 + i * 70) % 700);
          l.fillRect(x, y, 6, 6);
        }
      });
    },
    distract() {
      A().play('distract');
      S.setGunState({ away: true });
      return 900;
    },
    // his eyes narrowing: the lids come in, from above and below, to a slit; there's a mark on
    // it, the chest; and they open again
    squint() {
      A().play('squint');
      const [x, y] = S.gunPoint('chest');
      return add(2000, (l, p) => {
        const c = p < 0.35 ? ease(p / 0.35) : p < 0.75 ? 1 : 1 - ease((p - 0.75) / 0.25);
        const gap = 480 - c * 400;
        l.fillStyle = '#000';
        l.fillRect(0, 0, W, Math.max(0, y - gap / 2));
        l.fillRect(0, y + gap / 2, W, H);
        // (the lids' edges, a little lighter)
        l.fillStyle = 'rgba(40,30,30,0.9)';
        l.fillRect(0, y - gap / 2 - 6, W, 6);
        l.fillRect(0, y + gap / 2, W, 6);
        if (c > 0.8) {
          l.strokeStyle = '#d6c7a3';
          l.lineWidth = 3;
          l.strokeRect(x - 24, y - 24, 48, 48);
        }
      }, { top: true });
    },
    talk() {
      A().play('talk');
      return 300;
    },
  };

  // His.
  const FOE = {
    loom() {
      A().play('loom');
      S.darkTarget = 0.55;
      S.gun.lungeTarget = 0.35;
      setTimeout(() => {
        S.gun.lungeTarget = 0;
        S.darkTarget = 0;
      }, 2000);
      return 2400;
    },
    whisper() {
      A().play('whisper');
      S.darkTarget = 0.6;
      setTimeout(() => (S.darkTarget = 0), 2000);
      return add(2300, (l, p) => {
        const a = Math.sin(p * Math.PI) * 0.3;
        face(l, 2, 640, 380, 16, a, p > 0.4 && Math.random() < 0.2 ? 3 : 0);
      });
    },
    faces() {
      A().play('faces');
      S.darkTarget = 0.8;
      const fs = [];
      for (let i = 0; i < 8; i++) fs.push({ i: Math.floor(Math.random() * 5), x: 120 + Math.random() * 1040, y: 90 + Math.random() * 560, k: 4 + Math.floor(Math.random() * 5), d: Math.random() * 0.4 });
      setTimeout(() => (S.darkTarget = 0), 2300);
      return add(2700, (l, p) => {
        for (const f of fs) {
          const q = (p - f.d) / 0.5;
          if (q <= 0 || q > 1.2) continue;
          const a = Math.min(1, q * 3) * (q > 1 ? (1.2 - q) / 0.2 : 1) * 0.75;
          face(l, f.i, f.x, f.y, f.k, a, Math.random() < 0.25 ? 2 : 0);
        }
      });
    },
    lightsout() {
      A().play('lightsOut');
      S.darkTarget = 1;
      S.dark = 0.6;
      setTimeout(() => (S.darkTarget = 0), 1900);
      // (just the dark, and the breathing: no face at the screen. Only the thing in CLASSROOM A
      // gets one of those.)
      return 2200;
    },
    aim() {
      A().play('aim');
      S.darkTarget = 0.5;
      S.gun.glint = 1;
      setTimeout(() => {
        S.darkTarget = 0;
        S.gun.glint = 0;
      }, 3000);
      const [x, y] = S.gunPoint('gun');
      return add(3200, (l, p, ctx) => {
        const beat = Math.abs(Math.sin(p * Math.PI * 4));
        ctx.fillStyle = `rgba(120,10,10,${0.12 * beat})`;
        ctx.fillRect(0, 0, W, H);
        l.fillStyle = '#e8d8c8';
        l.fillRect(x - 3, y - 3, 6, 6);
      });
    },
    lunge() {
      A().play('lunge');
      S.gun.lungeTarget = 1;
      setTimeout(() => {
        S.gun.lungeTarget = 0;
        S.shake = 16;
      }, 280);
      return 900;
    },
  };
  S.play = (name, o) => (FX[name] ? FX[name](o) : 0);
  S.foeMove = (name, o) => (FOE[name] ? FOE[name](o) : 0);

  // The gun comes up, and he cocks it: dark round the edges, a glint at the end of it.
  S.cock = function () {
    A().play('cock');
    S.darkTarget = 0.65;
    S.gun.glint = 1;
    return 600;
  };
  // The shot: the hall lit up for an instant, white, in big pixels; and if Brayan didn't get
  // down, red. Then the ringing.
  S.shot = function (dodged) {
    A().play('gunshot');
    setTimeout(() => A().play('ring'), 120);
    A().duck(0.12, 0.1);
    setTimeout(() => A().duck(1, 2.5), 3000);
    S.gun.glint = 0;
    S.darkTarget = 0;
    S.dark = 0;
    S.shake = 22;
    const [gx, gy] = S.gunPoint('gun');
    if (dodged) S.drop = 1;
    return add(3200, (l, p, ctx) => {
      // (drawn at full size: the flash's own big pixels)
      const T = p * 3.2;
      const fl = T < 0.08 ? 1 : Math.max(0, 1 - (T - 0.08) / 0.55);
      if (fl > 0 && sprites[S.place + ':flash']) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = fl;
        ctx.drawImage(sprites[S.place + ':flash'], 0, 0, W, H);
        // and him in it, black against it
        ctx.filter = 'brightness(0.15)';
        drawGunman(ctx, 0, 0);
        ctx.restore();
      }
      if (T < 0.12) star(l, gx, gy, 140, '#fff8e8', 0.25);
      // the ringing: everything a little washed out
      const haze = Math.max(0, 0.18 * (1 - T / 3.2));
      ctx.fillStyle = `rgba(230,230,235,${haze})`;
      ctx.fillRect(0, 0, W, H);
      if (!dodged && T < 1.4) {
        const r = 1 - T / 1.4;
        const g = ctx.createRadialGradient(640, 480, 300, 640, 480, 820);
        g.addColorStop(0, 'rgba(150,10,10,0)');
        g.addColorStop(1, `rgba(150,10,10,${0.7 * r})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }, { top: true });
  };
  S.stun = function () {
    A().play('stun');
    S.setGunState({ stunned: true });
    S.shake = 12;
    return 900;
  };
  S.recover = function () {
    A().play('recover');
    S.setGunState({ stunned: false, away: false });
    return 600;
  };
  S.hitHero = function (kind) {
    S.hero.shake = 10;
    S.hero.flash = 1;
    if (kind !== 'mind') S.shake = Math.max(S.shake, 8);
  };
  // He's beaten: he folds up, and he's gone.
  S.gunDown = function () {
    S.gun.downTarget = 1;
    A().play('fall');
    return 2000;
  };

  // ------------------------------------------------------------------ CLASSROOM A
  // where its root hangs from the ceiling, and where it is, at the back
  const HANG = [640, 40];
  const BACK = [790, 556];
  S.roomState = function (o) {
    Object.assign(S.room, o);
  };
  function drawRoom(ctx) {
    const r = S.room;
    // it, at the back of the room, in the dark: barely, then more
    const tr = sprites.tree;
    if (tr && r.tree > 0.01) {
      ctx.save();
      ctx.globalAlpha = r.tree;
      ctx.imageSmoothingEnabled = false;
      const k = 1;
      ctx.drawImage(tr, BACK[0] - (tr.width * k) / 2, BACK[1] - tr.height * k, tr.width * k, tr.height * k);
      ctx.restore();
    }
    ctx.save();
    // its root, hanging from the ceiling, growing, writhing
    const n = I.roots.length;
    const i = Math.min(n - 1, Math.floor(r.grow * n));
    const rt = sprites['root' + i];
    if (rt && r.grow > 0) {
      const k = 3;
      const wob = 0.6 + r.stage * 0.9;
      for (let y = 0; y < rt.height; y++) {
        const s = Math.round(Math.sin(S.t * (1 + r.stage * 0.8) + y * 0.15) * wob * (y / rt.height) + (r.stage > 2 && Math.random() < 0.02 ? (Math.random() - 0.5) * 6 : 0));
        ctx.drawImage(rt, 0, y, rt.width, 1, HANG[0] - (rt.width * k) / 2 + s * k, HANG[1] + y * k, rt.width * k, k);
      }
    }
    // and, awake, the roots coming down at him: bigger, closer, till they're all there is
    if (r.fall > 0) {
      const big = [n - 1, n - 2, n - 4];
      big.forEach((ri, j) => {
        const im = sprites['root' + ri];
        if (!im) return;
        const q = clamp(r.fall * 1.2 - j * 0.1, 0, 1);
        const k = 3 + q * q * 16;
        const x = [520, 820, 660][j] + (640 - [520, 820, 660][j]) * q * 0.5;
        const y = -im.height * k + (im.height * k * 0.35 + q * (H * 0.9));
        for (let row = 0; row < im.height; row++) {
          const s = Math.sin(S.t * 2.2 + row * 0.2 + j) * 1.2 * (row / im.height);
          ctx.drawImage(im, 0, row, im.width, 1, x - (im.width * k) / 2 + s * k, y + row * k, im.width * k, k + 1);
        }
      });
    }
    ctx.restore();
  }
  // It had him: the frames, too fast, through static.
  S.rootScare = function () {
    const order = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const each = [0.3, 0.3, 0.3, 0.3, 0.12, 0.25, 0.3, 0.25, 0.2, 0.14, 0.12, 0.12, 0.16, 0.1, 0.12, 0.3, 0.6];
    const total = each.reduce((a, b) => a + b, 0);
    return add(total * 1000, (l, p, ctx) => {
      let T = p * total;
      let i = 0;
      while (i < each.length - 1 && T > each[i]) T -= each[i++];
      const im = sprites['scare' + order[i]];
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      if (im) {
        const jx = i > 7 ? (Math.random() - 0.5) * 30 : 0;
        ctx.drawImage(im, jx, 0, W, H);
      }
      ctx.restore();
      S.shake = i > 7 ? 14 : 0;
    }, { top: true });
  };

  // ------------------------------------------------------------------ every frame
  S.update = function (dt) {
    S.t += dt;
    const g = S.gun;
    g.a += ((g.on ? 1 : 0) - g.a) * Math.min(1, dt * 3);
    g.stunned += ((g.stunTarget || 0) - g.stunned) * Math.min(1, dt * 5);
    g.away += ((g.awayTarget || 0) - g.away) * Math.min(1, dt * 6);
    g.lunge += (g.lungeTarget - g.lunge) * Math.min(1, dt * (g.lungeTarget > g.lunge ? 9 : 3));
    g.down += ((g.downTarget || 0) - g.down) * Math.min(1, dt * 1.5);
    g.hit = Math.max(0, g.hit - dt * 4);
    S.dark += (S.darkTarget - S.dark) * Math.min(1, dt * 3);
    S.black += clamp(S.blackTarget - S.black, -dt * (S.blackSpeed || 2), dt * (S.blackSpeed || 2));
    S.drop = Math.max(0, (S.drop || 0) - dt * 2);
    S.shake *= Math.pow(0.02, dt);
    if (S.shake < 0.3) S.shake = 0;
    const h = S.hero;
    h.shake *= Math.pow(0.01, dt);
    h.flash = Math.max(0, h.flash - dt * 3);
    h.gold = Math.max(0, h.gold - dt * 0.8);
    S.effects = S.effects.filter((e) => S.t - e.t0 < e.dur);
    S.popups = S.popups.filter((q) => S.t - q.t0 < q.dur);
  };

  // the see-through parts of the effects, dithered to solid or nothing; and their colour
  // mostly gone, and a grain
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) * 16);
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
        const n = (Math.random() - 0.5) * 18;
        px[k] = (l + (px[k] - l) * 0.75) * 0.94 + n;
        px[k + 1] = (l + (px[k + 1] - l) * 0.75) * 0.94 + n;
        px[k + 2] = (l + (px[k + 2] - l) * 0.75) * 0.94 + n;
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

  // The Gunman, swaying: each row of his pixels a little to one side, more the higher up he
  // is (his feet stay where they are); breathing; staggered when he's stunned, turned away when
  // he's looking down the other hall; at Brayan when he lunges; folding up when he's beaten.
  function drawGunman(ctx, ox, oy) {
    const g = S.gun;
    const pl = P().gunman;
    const sp = sprites.gunman;
    if (!pl || !sp || g.a < 0.01) return;
    const pad = 8;
    const c = S.gunCanvas;
    if (c.width !== sp.width + pad * 2) {
      c.width = sp.width + pad * 2;
      c.height = sp.height;
    }
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    const amp = 1.6 + g.stunned * 2.5;
    for (let y = 0; y < sp.height; y++) {
      const up = Math.pow(1 - y / sp.height, 1.5);
      const s = Math.round((Math.sin(S.t * 1.15 + y * 0.03) * amp + Math.sin(S.t * 0.5) * 1.2) * up);
      x.drawImage(sp, 0, y, sp.width, 1, pad + s, y, sp.width, 1);
    }
    const k = pl.scale * (1 + g.lunge * 0.5);
    const breathe = 1 + Math.sin(S.t * 1.7) * 0.004;
    ctx.save();
    ctx.globalAlpha = g.a * (g.a < 0.95 && Math.random() < 0.25 ? 0.4 : 1);
    ctx.imageSmoothingEnabled = false;
    ctx.translate(pl.x + ox + (g.hit ? Math.round((Math.random() - 0.5) * 8) : 0), pl.y + oy + g.lunge * 60);
    ctx.rotate(g.stunned * -0.12 + g.down * -0.5);
    const flip = g.away > 0.5 ? -1 : 1;
    ctx.scale(k * flip, k * breathe * (1 - g.down * 0.55));
    if (g.stunned > 0.05) ctx.filter = `brightness(${1 - g.stunned * 0.25})`;
    if (g.down > 0.01) ctx.globalAlpha *= 1 - g.down;
    ctx.drawImage(c, -(I.gunmanFeetX + pad), -sp.height);
    ctx.restore();
    // the glint at the end of the gun, when it's on Brayan
    if (g.glint) {
      const [gx, gy] = S.gunPoint('gun');
      const tw = 0.5 + 0.5 * Math.sin(S.t * 9);
      ctx.fillStyle = `rgba(240,236,220,${0.6 + 0.4 * tw})`;
      ctx.fillRect(Math.round(gx + ox) - 3, Math.round(gy + oy) - 3, 6, 6);
    }
  }

  S.draw = function (ctx) {
    const sx = S.shake ? Math.round(((Math.random() - 0.5) * S.shake) / PX) * PX : 0;
    const sy = (S.shake ? Math.round(((Math.random() - 0.5) * S.shake) / PX) * PX : 0) + Math.round(Math.sin((S.drop || 0) * Math.PI) * 70);
    const p = P();
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // the place (with his shadow on the floor, while he's there)
    const bg = sprites[S.place + ':bg'];
    const sh = sprites[S.place + ':shadow'];
    if (bg) ctx.drawImage(bg, sx, sy, W, H);
    if (sh && S.gun.a > 0.01) {
      ctx.globalAlpha = S.gun.a * (1 - S.gun.down);
      ctx.drawImage(sh, sx, sy, W, H);
      ctx.globalAlpha = 1;
    }
    // what's hidden here, where it is, till he takes it
    for (const [k, h] of Object.entries(p.hidden || {})) {
      if (S.found[k]) continue;
      const im = sprites[S.place + ':' + k];
      if (im) ctx.drawImage(im, h.x + sx, h.y + sy, h.w, h.h);
    }
    if (S.place === 'classA') drawRoom(ctx);
    drawGunman(ctx, sx, sy);
    ctx.restore();
    // the dark coming in round him (his attacks): the middle last
    if (S.dark > 0.01) {
      const g = ctx.createRadialGradient(640, 420, 80, 640, 420, 760);
      g.addColorStop(0, `rgba(0,0,0,${S.dark * 0.75})`);
      g.addColorStop(1, `rgba(0,0,0,${Math.min(1, S.dark * 1.15)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // the effects that go under the HUD
    const l = begin(S.low, 0, 0);
    let any = false;
    for (const e of S.effects) if (!e.top) { e.draw(l, Math.min(1, (S.t - e.t0) / e.dur), ctx); any = true; }
    if (any) blowUp(ctx, S.low, true);
    // film grain over everything
    const gr = S.grain[Math.floor(Math.random() * S.grain.length)];
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.globalCompositeOperation = 'overlay';
    const gx = Math.floor(Math.random() * 256);
    const gy = Math.floor(Math.random() * 256);
    for (let y = -gy; y < H; y += 256) for (let x = -gx; x < W; x += 256) ctx.drawImage(gr, x, y);
    ctx.restore();
    portrait();
  };

  // over the HUD: the numbers, the effects that go over it, and black
  S.drawFx = function (ctx) {
    ctx.clearRect(0, 0, W, H);
    const tops = S.effects.filter((e) => e.top);
    if (tops.length || S.popups.length) {
      const l = begin(S.lowFx, 0, 0);
      for (const q of S.popups) {
        const p = (S.t - q.t0) / q.dur;
        bigText(l, q.text, q.x, q.y - ease(Math.min(1, p * 2)) * 30, q.size, q.color, { alpha: 1 - clamp((p - 0.7) / 0.3, 0, 1) });
      }
      for (const e of tops) e.draw(l, Math.min(1, (S.t - e.t0) / e.dur), ctx);
      blowUp(ctx, S.lowFx, true);
    }
    if (S.black > 0.003) {
      ctx.fillStyle = `rgba(0,0,0,${S.black})`;
      ctx.fillRect(0, 0, W, H);
    }
  };

  // ------------------------------------------------------------------ the searches
  // Did a tap (stage pixels) land on something hidden here (and not taken yet)?
  S.hitItem = function (x, y) {
    for (const [k, h] of Object.entries(P().hidden || {})) {
      if (S.found[k]) continue;
      const [hx, hy, hw, hh] = h.hit;
      if (x >= hx && x <= hx + hw && y >= hy && y <= hy + hh) return k;
    }
    return null;
  };
  // taken: it lifts out of the dark, and it's gone
  S.take = function (k) {
    const h = P().hidden[k];
    S.found[k] = true;
    A().play('find');
    const key = { can: 'can', keys: 'keys', bear: 'bear' }[k];
    const x = h.x + h.w / 2;
    const y = h.y + h.h / 2;
    return add(1200, (l, p) => {
      const q = ease(p);
      drawItem(l, key, x + (640 - x) * q, y + (440 - y) * q, 1 + q * 1.5, p > 0.8 ? (1 - p) / 0.2 : 1);
    }, { top: true });
  };

  // ------------------------------------------------------------------ Brayan's picture
  let pic;
  function portrait() {
    pic = pic || document.getElementById('me-pic');
    if (!pic) return;
    const h = S.hero;
    const k = 4;
    let x = 0;
    const y = (Math.sin(S.t * 2.2) > 0.3 ? -k : 0) + h.down * 240;
    if (h.shake > 0.5) x += Math.round(((Math.random() - 0.5) * h.shake * 2) / k) * k;
    pic.style.transform = `translate(${x}px, ${y}px)`;
    const f = [];
    if (h.flash > 0.02) f.push(`sepia(${h.flash}) saturate(${1 + h.flash * 5}) hue-rotate(-${h.flash * 40}deg)`);
    if (h.gold > 0.02) {
      const c = `rgba(150,190,255,${Math.min(1, h.gold)})`;
      f.push(`drop-shadow(${k}px 0 0 ${c}) drop-shadow(-${k}px 0 0 ${c})`);
    }
    pic.style.filter = f.join(' ') || 'none';
  }

  S.reset = function () {
    S.effects = [];
    S.popups = [];
    S.found = {};
    S.dark = S.darkTarget = 0;
    S.black = S.blackTarget = 0;
    S.gun = { on: false, a: 0, stunned: 0, away: 0, lunge: 0, lungeTarget: 0, hit: 0, glint: 0, down: 0 };
    S.room = { stage: 1, grow: 0, fall: 0, tree: 0 };
    S.hero = { shake: 0, flash: 0, down: 0, gold: 0 };
    S.setPlace('entrance');
  };
})();
