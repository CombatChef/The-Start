/*
 * SLASHCO VR — TURN-BASED BATTLE
 * art.js — everything drawn in code: the slashers' sprites moving (Sid's googly eyes and gun,
 * Trollge's and Dolphin Man's heads), the effect icons, and the portrait cards (backdrop +
 * portrait + status effects). The places behind the fight are screenshots (data.js `places`).
 *
 * Coordinates are in art pixels; the page shows them at 2x on a 1280x960 stage.
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  const { Pix, hex, ramp, noise, bayer, clamp01 } = SC.Pixel;

  const R = (list) => list.map((c) => hex(c));

  // ------------------------------------------------------------------ Sid
  // Made by tools/make_images.py from green-screen renders of his model: the front and back of
  // him, with and without the Desert Eagle, each a layer on one canvas (SC.SPRITES.sid). His
  // head sways on his neck, his googly eyes are drawn every frame so the pupils can rattle
  // round, and the gun is a layer of its own: it twirls round his finger, kicks when he fires
  // and swings up when he pistol-whips. He turns his back to draw it or put it away.
  const COOKIE = R(['#2a1606', '#5a3410', '#8a5620', '#b98038']);
  const GOOGLY = { white: hex('#f4f8fa'), shade: hex('#b4bec8'), pupil: hex('#0a0a0c'), vein: hex('#c4161f') };

  // Smooth value noise (bilinear between hashed grid points), for organic shapes.
  function vnoise(x, y, scale, seed) {
    const gx = x / scale;
    const gy = y / scale;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = noise(x0, y0, seed);
    const b = noise(x0 + 1, y0, seed);
    const c = noise(x0, y0 + 1, seed);
    const d = noise(x0 + 1, y0 + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  function drawCookie(px, cx, cy, r) {
    r = r || 8;
    px.ellipse(cx, cy, r, r, (x, y, nx, ny) => {
      if (noise(x, y, 55) > 0.8 && nx * nx + ny * ny > 0.72) return null; // bitten, crumbly edge
      if (vnoise(x, y, 2.2, 56) > 0.74) return COOKIE[0]; // chocolate chips
      return ramp(COOKIE, 0.8 - ny * 0.25 - nx * 0.1 - (nx * nx + ny * ny) * 0.2, x, y);
    });
  }

  // How a standing view is bent this frame, as canvas rows: the head (above F.neck) slid
  // sideways, more the higher it is, and moved up or down by `dy`; down on one knee (Sid),
  // everything above the hips sinks by `drop` and the legs fold into the space left.
  function neckBend(S, F, amp, dy, drop) {
    const span = Math.max(1, F.neck - F.top);
    const floor = S.floor;
    return {
      // canvas row → [source row, x shift], or null for nothing
      row(Y) {
        if (drop && Y >= F.hips + drop) return [Math.round(F.hips + ((Y - F.hips - drop) * (floor - F.hips)) / Math.max(1, floor - F.hips - drop)), 0];
        const y = Y - drop;
        if (y >= F.neck) return [y, 0];
        const r = y - dy;
        return [r, Math.round(amp * clamp01((F.neck - r) / span))];
      },
      // where a point of the head ends up
      point(x, y) {
        const dx = y < F.neck ? Math.round(amp * clamp01((F.neck - y) / span)) : 0;
        return [x + dx, y + (y < F.neck ? dy : 0) + drop];
      },
    };
  }

  function blitBent(px, src, x0, y0, bend) {
    for (let Y = 0; Y < px.h; Y++) {
      const [r, dx] = bend.row(Y);
      const sy = r - y0;
      if (sy < 0 || sy >= src.h) continue;
      for (let x = 0; x < src.w; x++) {
        const i = (sy * src.w + x) * 4;
        if (src.d[i + 3]) px.set(x0 + x + dx, Y, [src.d[i], src.d[i + 1], src.d[i + 2], 255]);
      }
    }
  }

  // Draw a layer turned by `ang` (radians, clockwise on screen) round its pixel (sx, sy), which
  // lands on (ax, ay).
  function blitTurned(px, src, sx, sy, ax, ay, ang) {
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const R = Math.ceil(Math.hypot(Math.max(sx, src.w - sx), Math.max(sy, src.h - sy))) + 1;
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const u = Math.round(sx + x * cos + y * sin);
        const v = Math.round(sy - x * sin + y * cos);
        if (u < 0 || v < 0 || u >= src.w || v >= src.h) continue;
        const i = (v * src.w + u) * 4;
        if (src.d[i + 3]) px.set(ax + x, ay + y, [src.d[i], src.d[i + 1], src.d[i + 2], 255]);
      }
    }
  }

  // His googly eyes: the pupils roll round inside (o.pupils, -1..1), spin when he's dizzy, and
  // shrink with red veins round them when he's angry.
  function sidEyes(px, F, bend, o) {
    F.eyes.forEach(([x0, y0, r], i) => {
      const [ex, ey] = bend.point(x0 + 0.5, y0 + 0.5);
      px.ellipse(ex, ey, r, r, (x, y, nx, ny) => {
        if (o.angry && nx * nx + ny * ny > 0.55 && noise(x, y, 61 + i) > 0.86) return GOOGLY.vein;
        return nx * 0.6 + ny > 0.75 ? GOOGLY.shade : GOOGLY.white;
      });
      const pr = o.angry ? 1.05 : 1.55;
      let p = (o.pupils && o.pupils[i]) || [0, 0.5];
      if (o.dizzy) {
        const a = (o.t || 0) / 150 + i * 2.4;
        p = [Math.cos(a), Math.sin(a)];
      }
      const reach = Math.max(0, r - pr - 0.6);
      px.ellipse(ex + p[0] * reach, ey + p[1] * reach, pr, pr, GOOGLY.pupil);
    });
  }

  // A jumbo cookie in his mouth, crumbs falling off it.
  function sidMunch(px, F, bend, t) {
    const [cx, cy] = bend.point(F.mouth[0], F.mouth[1] + 1);
    drawCookie(px, cx + 1, cy, 7.5);
    for (let i = 0; i < 7; i++) {
      const life = (t / 700 + noise(i, 3, 91)) % 1;
      px.set(cx - 7 + Math.floor(noise(i, 4, 91) * 16), cy + 6 + Math.floor(life * 34), COOKIE[1 + (i % 3)]);
    }
  }

  // o: { t (ms), view: 'front' | 'armed' | 'back' | 'backGun', gun (radians the Desert Eagle is
  //      turned by), munch, rant, down, pupils, angry, dizzy }
  function sid(o) {
    const S = SC.SPRITES.sid;
    const L = spritePix.sid;
    const px = new Pix(S.size[0], S.size[1]);
    if (!L) return px;
    const t = o.t || 0;
    const view = o.view || 'front';
    if (view === 'back' || view === 'backGun') {
      px.blit(L[view], S.at[view][0], S.at[view][1]);
      return px;
    }
    const F = S.face[view];
    // His head sways and bobs as he breathes; it nods as he chews, and hangs when he's down.
    let amp = Math.sin(t / 610) * 1.3;
    let dy = Math.sin(t / 900) > 0.55 ? -1 : 0;
    if (o.munch) {
      amp *= 0.4;
      dy = Math.floor(t / 110) % 2;
    }
    if (o.rant) amp = Math.sin(t / 45) * 2.2; // shaking his head as he rambles
    if (o.down) {
      amp = 3 + Math.sin(t / 800) * 0.7;
      dy = 1;
    }
    const bend = neckBend(S, F, amp, dy, o.down ? 13 : 0);
    blitBent(px, L[view], S.at[view][0], S.at[view][1], bend);
    if (view === 'armed') {
      const [gx, gy] = S.at.gun;
      const [ax, ay] = S.grip;
      if (o.down) blitTurned(px, L.gun, ax - gx, ay - gy, ax, ay + 13, -0.5); // hanging from his hand
      else if (o.gun) blitTurned(px, L.gun, ax - gx, ay - gy, ax, ay, o.gun);
      else px.blit(L.gun, gx, gy);
    }
    sidEyes(px, F, bend, o);
    if (o.munch) sidMunch(px, F, bend, t);
    return px;
  }

  // Where things are on the Sid sprite (canvas pixels), for effects and targeting. Armed, he
  // crouches lower with the gun out.
  function sidPoints(armed) {
    const S = SC.SPRITES.sid;
    const F = S.face[armed ? 'armed' : 'front'];
    return {
      w: S.size[0],
      h: S.size[1],
      cx: S.cx,
      muzzle: S.muzzleAimed, // he aims before he fires
      mouth: F.mouth,
      head: [F.mouth[0], F.mouth[1] - 12],
      body: F.chest,
      feet: [S.cx, S.floor],
    };
  }

  // ------------------------------------------------------------------ Trollge
  // Its render, cut by tools/make_images.py into a body, a head and the glow of its face, and
  // kept smooth so that it stands in the places' screenshots: it's lit to match each one
  // (data.js places, `light`) and casts a shadow on the floor. "The large head wobbles on its
  // skinny body": the head turns on its neck like a heavy pendulum.
  const TROLL_EYES = {
    white: ['rgba(255,255,255,1)', 'rgba(200,186,255,0.45)'],
    red: ['rgba(255,70,70,1)', 'rgba(220,20,40,0.6)'],
    dim: ['rgba(150,140,165,0.8)', 'rgba(70,62,84,0.3)'],
  };
  let trollgeKit = null; // its layers as canvases, and two more to light it on
  function trollgeCanvases() {
    if (trollgeKit) return trollgeKit;
    const L = spritePix.trollge;
    if (!L) return null;
    const S = SC.SPRITES.trollge;
    const blank = () => {
      const c = root.document.createElement('canvas');
      c.width = S.size[0];
      c.height = S.size[1];
      return c;
    };
    trollgeKit = { body: L.body.toCanvas(), head: L.head.toCanvas(), glow: L.glow.toCanvas(), shape: blank(), lit: blank() };
    return trollgeKit;
  }

  // Draws Trollge onto its canvas (SC.SPRITES.trollge.size).
  // o: { t (ms), pose: 'idle' | 'stare' | 'fast' | 'glance' | 'lunge' | 'down', eyes: 'white' | 'red' | 'dim', light }
  function trollge(cv, o) {
    const S = SC.SPRITES.trollge;
    const K = trollgeCanvases();
    const ctx = cv.getContext('2d');
    const w = cv.width;
    const h = cv.height;
    ctx.clearRect(0, 0, w, h);
    if (!K) return;
    const t = o.t || 0;
    // How far its head is turned on its neck (radians), and how far it sinks.
    let turn = Math.sin(t / 430) * 0.05;
    let sink = Math.round(Math.sin(t / 900) * 1.5);
    if (o.pose === 'stare') {
      turn = 0; // it goes perfectly still
      sink = 0;
    } else if (o.pose === 'fast') turn = Math.sin(t / 90) * 0.07;
    else if (o.pose === 'glance') turn = -0.14;
    else if (o.pose === 'lunge') turn = 0.1;
    else if (o.pose === 'down') {
      turn = 0.18 + Math.sin(t / 700) * 0.02;
      sink = 12;
    }
    const [px, py] = S.pivot;
    const withHead = (g, img) => {
      g.save();
      g.translate(px, py + sink);
      g.rotate(turn);
      g.drawImage(img, S.headAt[0] - px, S.headAt[1] - py);
      g.restore();
    };
    // Its shape...
    const shape = K.shape.getContext('2d');
    shape.clearRect(0, 0, w, h);
    shape.drawImage(K.body, S.bodyAt[0], S.bodyAt[1]);
    withHead(shape, K.head);
    // ...lit like the place: the colour of its light, a lamp to one side, the haze, then cut back
    // to its shape. Its grin and the highlights on its face still show in the dark.
    const L = o.light || {};
    const lit = K.lit.getContext('2d');
    lit.globalCompositeOperation = 'source-over';
    lit.globalAlpha = 1;
    lit.fillStyle = '#000'; // on black, so its soft edges don't pick up the light's colour
    lit.fillRect(0, 0, w, h);
    lit.drawImage(K.shape, 0, 0);
    if (L.mult) {
      lit.globalCompositeOperation = 'multiply';
      lit.fillStyle = L.mult;
      lit.fillRect(0, 0, w, h);
    }
    if (L.rim) {
      const [color, side, k] = L.rim;
      const g = lit.createLinearGradient(side === 'left' ? 0 : w, 0, side === 'left' ? w : 0, 0);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lit.globalCompositeOperation = 'screen';
      lit.globalAlpha = k;
      lit.fillStyle = g;
      lit.fillRect(0, 0, w, h);
    }
    if (L.fog) {
      lit.globalCompositeOperation = 'source-over';
      lit.globalAlpha = L.fog[1];
      lit.fillStyle = L.fog[0];
      lit.fillRect(0, 0, w, h);
    }
    lit.globalAlpha = 1;
    lit.globalCompositeOperation = 'destination-in';
    lit.drawImage(K.shape, 0, 0);
    lit.globalCompositeOperation = 'source-over';
    if (L.glow) {
      lit.globalAlpha = L.glow;
      withHead(lit, K.glow);
      lit.globalAlpha = 1;
    }
    // On the floor: its shadow, then it.
    const [a, b] = S.soles;
    const rx = (b[0] - a[0]) / 2 + 60;
    ctx.save();
    ctx.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    ctx.scale(1, 13 / rx);
    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    sh.addColorStop(0, `rgba(0,0,0,${L.shadow == null ? 0.5 : L.shadow})`);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
    ctx.drawImage(K.lit, 0, 0);
    // The glints in its big black eyes, turning with its head.
    const [c0, c1] = TROLL_EYES[o.eyes] || TROLL_EYES.white;
    const r = o.pose === 'stare' ? 6 : 4;
    for (const [ex, ey] of S.eyes) {
      const dx = ex - px;
      const dy = ey - py;
      const x = px + dx * Math.cos(turn) - dy * Math.sin(turn);
      const y = py + sink + dx * Math.sin(turn) + dy * Math.cos(turn);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, c0);
      g.addColorStop(0.4, c0);
      g.addColorStop(0.55, c1);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    }
  }

  // Anchor points on the Trollge sprite in art pixels (the sprite is `res` times finer), for
  // effects, targeting and where it stands.
  function trollgePoints() {
    const S = SC.SPRITES.trollge;
    const A = (p) => [p[0] / S.res, p[1] / S.res];
    return {
      w: S.size[0] / S.res,
      h: S.size[1] / S.res,
      res: S.res,
      smooth: true,
      head: A(S.face),
      body: A(S.chest),
      feet: A(S.feet),
      clawL: A(S.clawL),
      clawR: A(S.clawR),
      muzzle: A(S.clawR),
    };
  }

  // ------------------------------------------------------------------ Dolphin Man
  // Made by tools/make_images.py from green-screen renders of his model, like Sid: him standing,
  // his back (the dorsal fin and tail, while he spins round for the Tail Whip), and Fetal
  // Position, folded down into a crouch. His head bobs on his neck the way Trollge's does (but
  // twitchier), and his beak gapes open while he wails.
  const DOLPH_EYES = {
    milky: [hex('#8f9ba2'), hex('#4d5960')], // "eyesight will begin extremely bad"
    sharp: [hex('#ffffff'), hex('#cfeeff')], // Eyes of the Angry
    dim: [hex('#3e474d'), hex('#20262a')],
  };
  const MAW = R(['#1a0306', '#3a0a0e', '#6e1419', '#a3272c']);
  const BEAK = R(['#272e3b', '#586274', '#8e97a7']);

  // Copy a layer, sliding each row sideways by shift(row) pixels.
  function blitRows(px, src, x0, y0, shift) {
    for (let y = 0; y < src.h; y++) {
      const dx = Math.round(shift(y));
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        if (src.d[i + 3]) px.set(x0 + x + dx, y0 + y, [src.d[i], src.d[i + 1], src.d[i + 2], 255]);
      }
    }
  }

  // His beak hanging wide open from under his eyes: the dark red of his throat, teeth along the
  // top, and the lower jaw dropped and shaking under it. (x, y) is the tip of his beak.
  function dolphinMaw(px, x, y, t) {
    const drop = 7 + Math.round(Math.sin(t / 70) * 1.2);
    const cx = x + 0.5;
    const top = y - 9;
    const bottom = y + drop;
    const ry = (bottom - top) / 2;
    px.ellipse(cx, top + ry, 6.2, ry + 0.5, BEAK[0]);
    px.ellipse(cx, top + ry, 5.2, ry - 0.5, (xx, yy, nx, ny) => ramp(MAW, 0.8 - ny * 0.5 - Math.abs(nx) * 0.35, xx, yy));
    for (let i = -4; i <= 4; i += 2) px.set(x + i, top + 1 + (Math.abs(i) > 3 ? 1 : 0), hex('#e8e4dc')); // teeth
    px.ellipse(cx, bottom + 1, 5.6, 2.2, (xx, yy, nx, ny) => ramp(BEAK, 0.75 - ny * 0.45 - nx * 0.2, xx, yy)); // lower jaw
    for (let i = -3; i <= 3; i += 2) px.set(x + i, bottom - 1, hex('#d8d4cc')); // lower teeth
  }

  // o: { t (ms), pose: 'idle' | 'lunge' | 'whip' | 'back' | 'wail' | 'fetal' | 'twitch' | 'down', eyes: 'milky' | 'sharp' | 'dim' }
  function dolphin(o) {
    const S = SC.SPRITES.dolphin;
    const L = spritePix.dolphin;
    const px = new Pix(S.size[0], S.size[1]);
    if (!L) return px;
    const t = o.t || 0;
    const pose = o.pose || 'idle';

    if (pose === 'fetal' || pose === 'twitch' || pose === 'down') {
      // Curled up, rocking. He flinches at every sound ('twitch').
      const f = L.fetal;
      let amp = Math.sin(t / 520) * 1.2;
      if (pose === 'twitch') amp = Math.sin(t / 40) * 2.5;
      else if (pose === 'down') amp = Math.sin(t / 1100) * 0.7;
      blitRows(px, f, S.at.fetal[0], S.at.fetal[1], (y) => amp * (1 - y / f.h));
      return px;
    }
    if (pose === 'back') {
      // Spun round: his back, the fin and the tail.
      px.blit(L.back, S.at.back[0], S.at.back[1]);
      return px;
    }

    // Standing. He breathes (his head lifts a pixel), and his head sways on his neck and every
    // few seconds jerks sideways, like something listening.
    let amp = Math.sin(t / 470) * 2.2;
    const beat = (t % 2900) / 2900;
    if (beat < 0.05) amp += 5 * Math.sin(beat * 20 * Math.PI);
    let dy = Math.sin(t / 760) > 0.3 ? -1 : 0;
    if (pose === 'lunge') amp = 5;
    else if (pose === 'whip') amp = -6;
    else if (pose === 'wail') {
      amp = Math.sin(t / 35) * 1.5; // shaking with the scream
      dy = Math.round(Math.sin(t / 60)) - 1;
    }
    const bend = neckBend(S, S, amp, dy, 0);
    blitBent(px, L.body, S.at.body[0], S.at.body[1], bend);
    if (pose === 'wail') {
      const [mx, my] = bend.point(S.mouth[0], S.mouth[1]);
      dolphinMaw(px, mx, my, t);
    }
    // His eyes: milky and dull, or glowing once his ANGER sharpens them.
    const [c0, c1] = DOLPH_EYES[pose === 'wail' ? 'sharp' : o.eyes] || DOLPH_EYES.milky;
    for (const [ex, ey] of S.eyes) {
      const [x, y] = bend.point(ex, ey);
      px.rect(x - 1, y, 3, 1, c0);
      if (o.eyes === 'sharp' || pose === 'wail') {
        px.set(x - 2, y, c1);
        px.set(x + 2, y, c1);
      }
    }
    return px;
  }

  function dolphinPoints() {
    const S = SC.SPRITES.dolphin;
    const face = [Math.round((S.eyes[0][0] + S.eyes[1][0]) / 2), S.eyes[0][1] + 6];
    return { w: S.size[0], h: S.size[1], head: face, mouth: S.mouth, body: S.chest, feet: [S.cx, S.floor], clawL: S.handL, clawR: S.handR, muzzle: S.mouth, tail: S.tail, curled: S.fetalFace };
  }

  // ------------------------------------------------------------------ icons
  const K = hex('#000000');
  const W = hex('#ffffff');
  const ICON_KEYS = {
    k: K,
    w: W,
    r: hex('#e8202a'),
    R: hex('#9c0c14'),
    y: hex('#f2c12e'),
    Y: hex('#b38400'),
    g: hex('#9aa3ab'),
    G: hex('#5b636b'),
    s: hex('#dfe5ea'),
    b: hex('#6fb6ff'),
    B: hex('#2a64c8'),
  };
  // Small overlays for the portrait effects.
  const ICONS = {
    anger: [
      '.rr.....rr.',
      'rRr.....rRr',
      'rR.......Rr',
      '...........',
      '...........',
      '...........',
      'rR.......Rr',
      'rRr.....rRr',
      '.rr.....rr.',
    ],
    star: ['..y..', '.yYy.', 'yyyyy', '.yYy.', 'y...y'],
  };
  function icon(name) {
    const rows = ICONS[name];
    const px = new Pix(rows[0].length, rows.length);
    px.stamp(rows, 0, 0, ICON_KEYS);
    return px;
  }

  // ------------------------------------------------------------------ portrait cards
  // Backdrop behind a portrait. The HUD is black and white, so most moods are greys (the
  // profile's tags say AFRAID, HAPPY and so on); CRITICAL goes red and the ghost violet.
  const GREY = R(['#050505', '#1c1c1f', '#3a3a3f', '#5c5c63']);
  const DARK = R(['#000000', '#0a0a0a', '#161616', '#222222']);
  const MOODS = {
    neutral: GREY,
    sated: R(['#060606', '#222224', '#48484c', '#707076']),
    happy: R(['#060606', '#222224', '#48484c', '#707076']),
    hurt: R(['#040404', '#161618', '#2c2c30', '#44444a']),
    critical: R(['#0c0000', '#3a0305', '#7a0910', '#b3141b']),
    afraid: R(['#020203', '#101014', '#222228', '#34343c']),
    confused: GREY,
    berserk: R(['#0c0100', '#4a0600', '#9a1400', '#e8420a']),
    sleep: R(['#020203', '#101014', '#222228', '#34343c']),
    drained: DARK,
    ghost: R(['#05020a', '#1d0f33', '#3b2166', '#5f3d9a']),
    dead: DARK,
    slasher: R(['#000000', '#1c0000', '#420000', '#6e0303']),
    umbra: R(['#000000', '#12051c', '#2c0d42', '#4f1a6e']),
    cryptid: R(['#000000', '#03101a', '#0b2233', '#15384f']),
    furious: R(['#050000', '#3d0000', '#8c0000', '#d10a0a']),
    frozen: GREY,
  };

  function loadPix(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const cv = root.document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const px = new Pix(img.width, img.height);
        px.d.set(ctx.getImageData(0, 0, img.width, img.height).data);
        resolve(px);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Portraits and sprite layers come from js/images.js (made by tools/make_images.py).
  const portraitPix = {};
  const spritePix = {};
  function loadPortraits() {
    const srcs = SC.PORTRAITS || {};
    const sprites = SC.SPRITES || {};
    return Promise.all(
      Object.keys(srcs)
        .map((name) =>
          loadPix(srcs[name]).then((px) => {
            if (!px) return;
            // Full-frame portraits keep their photo background; cut-outs (Sid's doc card,
            // Trollge's head) are transparent around the figure.
            px.full = px.d.every((v, i) => i % 4 !== 3 || v === 255);
            portraitPix[name] = px;
          })
        )
        .concat(
          // Every image layer of each sprite (body, head, and Dolphin Man's wail and fetal).
          Object.keys(sprites).map((name) => {
            const keys = Object.keys(sprites[name]).filter((k) => typeof sprites[name][k] === 'string');
            return Promise.all(keys.map((k) => loadPix(sprites[name][k]))).then((layers) => {
              if (layers.some((l) => !l)) return;
              spritePix[name] = {};
              keys.forEach((k, i) => (spritePix[name][k] = layers[i]));
            });
          })
        )
    );
  }

  // Where things sit on each 128x128 portrait, for the status effects.
  const ANCHORS = {
    mel: { head: [63, 43], brow: [63, 42], cheek: [78, 69], top: [63, 3] },
    john: { head: [64, 44], brow: [66, 38], cheek: [79, 64], top: [63, 9] },
    mysti: { head: [64, 70], brow: [64, 58], cheek: [80, 84], top: [60, 6] },
    purpl: { head: [70, 72], brow: [74, 63], cheek: [83, 88], top: [64, 4] },
    jim: { head: [64, 60], brow: [64, 52], cheek: [79, 82], top: [64, 6] },
    sid: { head: [60, 18], brow: [60, 18], cheek: [66, 30], top: [58, 4] },
    trollge: { head: [62, 60], brow: [58, 40], cheek: [84, 70], top: [60, 10] },
  };

  // Full-frame portraits take on a colour only when it's urgent: red when CRITICAL or
  // berserk. Everything else stays black and white.
  const TINT = {
    critical: hex('#ff5a5a'),
    berserk: hex('#ff8a3a'),
    furious: hex('#ff5a5a'),
  };

  const BLOOD = R(['#3d0006', '#7a000c', '#c0101c']);
  const SWEAT = R(['#1b4f8c', '#7fc0ff', '#dff1ff']);

  function sweat(px, x, y) {
    px.stamp(['...k...', '..kbk..', '..kbk..', '.kbwbk.', 'kbwbbbk', 'kbbbbBk', 'kbbbBBk', '.kbBBk.', '..kkk..'], x, y, ICON_KEYS);
  }
  function blood(px, a, amount, seed) {
    for (let i = 0; i < amount; i++) {
      const x = Math.round(a[0] - 26 + noise(i, 3, seed) * 52);
      const y0 = Math.round(a[1] - 6 + noise(i, 4, seed) * 16);
      const len = 6 + Math.floor(noise(i, 5, seed) * 22);
      for (let y = y0; y < y0 + len; y++) {
        px.set(x, y, BLOOD[y > y0 + len - 3 ? 2 : 1]);
        if (noise(i, y, seed) > 0.7) px.set(x + 1, y, BLOOD[0]);
      }
      px.ellipse(x + 0.5, y0 + len, 1.3, 1.6, BLOOD[1]);
    }
  }
  function crack(px, x, y, len, seed, color) {
    let cx = x;
    let cy = y;
    for (let i = 0; i < len; i++) {
      px.set(cx, cy, color || K);
      cx += noise(i, 1, seed) > 0.5 ? 1 : -1;
      cy += 1;
      if (noise(i, 2, seed) > 0.8) {
        px.set(cx + 1, cy, color || K);
        cx += 2;
      }
    }
  }
  function zzz(px, x, y) {
    const key = { w: hex('#dfe7ff'), k: K };
    px.stamp(['kkkkkkkk', 'kwwwwwwk', 'kkkkwwkk', '.kkwwkk.', 'kkwwkkkk', 'kwwwwwwk', 'kkkkkkkk'], x, y, key);
    px.stamp(['kkkkkk', 'kwwwwk', 'kkwwkk', 'kwwwwk', 'kkkkkk'], x + 10, y - 9, key);
  }
  function swirl(px, x, y, color) {
    for (let a = 0; a < 26; a++) {
      const t = a / 26;
      const ang = t * Math.PI * 4;
      px.set(Math.round(x + Math.cos(ang) * t * 6), Math.round(y + Math.sin(ang) * t * 6), color);
    }
  }

  // state: { id, variant, mood, fx: ['sweat','blood','cracks','zzz','swirl','veins','stars','frost','cookie','shatter'], fade, frame }
  function card(state) {
    const px = new Pix(128, 128);
    const mood = MOODS[state.mood] || MOODS.neutral;
    const f = state.frame || 0;
    // Dithered glow behind the character.
    px.fill((x, y) => {
      const dx = (x - 64) / 64;
      const dy = (y - 58) / 64;
      const t = 0.95 - Math.sqrt(dx * dx + dy * dy) * 0.95 + (state.mood === 'critical' || state.mood === 'furious' ? Math.sin(f * 0.5) * 0.08 : 0);
      return ramp(mood, t, x, y);
    });
    const src = portraitPix[state.variant || state.id];
    const light = state.mood === 'neutral' || state.mood === 'hurt' || state.mood === 'dead' || state.mood === 'drained';
    const ring = state.id === 'sid' ? hex('#ff5a5a') : state.id === 'purpl' ? hex('#d8c2ff') : light ? W : K;
    const tint = TINT[state.mood];
    if (src) {
      const fade = state.fade == null ? 1 : state.fade;
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const i = (y * src.w + x) * 4;
          if (!src.d[i + 3]) continue;
          if (fade < 1 && fade < bayer(x + f, y)) continue; // ghostly fade
          // A full-frame portrait keeps its own background, but its edges dissolve into the
          // mood backdrop so the picture sits in the card instead of looking pasted on.
          let edge = 0;
          if (src.full) {
            const ex = Math.abs(x - 63.5) / 64;
            const ey = Math.abs(y - 63.5) / 64;
            edge = clamp01((Math.pow(ex ** 5 + ey ** 5, 0.2) - 0.76) / 0.24);
            if (edge > 1 - bayer(x, y)) continue;
          }
          let c = [src.d[i], src.d[i + 1], src.d[i + 2], 255];
          if (c[0] === 255 && c[1] === 0 && c[2] === 255) c = ring;
          else if (state.mood === 'dead') c = [c[0] * 0.45, c[1] * 0.45, c[2] * 0.5, 255];
          else if (state.mood === 'drained') c = [c[0] * 0.7, c[1] * 0.7, c[2] * 0.72, 255];
          else if (tint && src.full) {
            const a = 0.4 + 0.35 * edge;
            c = c.map((v, k) => (k === 3 ? 255 : v * (1 - a) + ((v * tint[k]) / 255) * a + tint[k] * 0.12 * a));
          }
          px.set(x, y, c);
        }
      }
    }
    const a = ANCHORS[state.id] || ANCHORS.john;
    const fx = state.fx || [];
    if (fx.includes('cracks')) {
      crack(px, a.top[0] + 8, a.top[1] + 6, 22, 5);
      crack(px, a.top[0] - 10, a.top[1] + 14, 14, 6);
    }
    if (fx.includes('shatter')) {
      // Half of the mannequin head, gone (doc: "nearly half of his skull being shattered").
      px.poly(
        [
          [a.top[0] - 4, a.top[1] - 6],
          [a.top[0] + 34, a.top[1] - 6],
          [a.top[0] + 34, a.top[1] + 30],
          [a.top[0] + 18, a.top[1] + 22],
          [a.top[0] + 10, a.top[1] + 30],
          [a.top[0] + 4, a.top[1] + 14],
        ],
        K
      );
      crack(px, a.top[0] + 2, a.top[1] + 14, 30, 7);
      crack(px, a.top[0] + 12, a.top[1] + 28, 24, 8);
    }
    if (fx.includes('scratches')) {
      for (let i = 0; i < 3; i++) px.line(a.cheek[0] - 6 + i * 4, a.cheek[1] - 6, a.cheek[0] + i * 4, a.cheek[1] + 4, BLOOD[1]);
    }
    if (fx.includes('blood')) blood(px, a.brow, state.bloodAmount || 4, 31);
    if (fx.includes('sweat')) {
      sweat(px, a.brow[0] + 22, a.brow[1] - 18 + (f % 4 < 2 ? 0 : 1));
      sweat(px, a.brow[0] - 28, a.brow[1] - 10 + (f % 4 < 2 ? 1 : 0));
    }
    if (fx.includes('zzz')) zzz(px, 96, 26 - (f % 6));
    if (fx.includes('swirl')) {
      swirl(px, 18, 18, hex('#e7d4ff'));
      swirl(px, 108, 26, hex('#e7d4ff'));
    }
    if (fx.includes('veins')) px.blit(icon('anger'), 104, 10);
    if (fx.includes('stars')) {
      for (let i = 0; i < 4; i++) {
        const ang = f * 0.35 + (i * Math.PI) / 2;
        px.blit(icon('star'), Math.round(a.head[0] + Math.cos(ang) * 22 - 2), Math.round(a.head[1] - 4 + Math.sin(ang) * 6));
      }
    }
    if (fx.includes('frost')) {
      px.fill((x, y) => {
        const edge = Math.min(x, y, 127 - x, 127 - y);
        return edge < 10 && noise(x, y, 97) > 0.55 + edge * 0.04 ? hex('#bfe8ff') : null;
      });
    }
    if (fx.includes('cookie')) drawCookie(px, 100, 104);
    return px;
  }

  SC.Art = SC.Art || {};
  SC.Art.sid = sid;
  SC.Art.trollge = trollge;
  SC.Art.trollgePoints = trollgePoints;
  SC.Art.dolphin = dolphin;
  SC.Art.dolphinPoints = dolphinPoints;
  SC.Art.icon = icon;
  SC.Art.card = card;
  SC.Art.loadPortraits = loadPortraits;
  SC.Art.MOODS = MOODS;
  SC.Art.sidPoints = sidPoints;
})(typeof window !== 'undefined' ? window : globalThis);
