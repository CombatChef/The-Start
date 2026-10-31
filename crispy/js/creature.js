/*
 * The creature: its five forms (stages 1-4, then Andy) as pixel-art sprites, brought to life a
 * pixel at a time. It sways from its ankles, breathes, swings its arms, twitches its head; the
 * wound in its chest pulses and drips; it reaches for Crispy with an arm that stretches far too
 * long; it convulses and tears itself apart to ADJUST into the next form. Spared, it's simply
 * not there any more when Crispy opens his eyes (`gone`). It's lit by the lamp
 * above it and falls into the dark towards its feet.
 *
 * Each frame is drawn into a small buffer (one pixel per sprite pixel) and scaled up with no
 * smoothing.
 */
(function () {
  const BW = 240; // the buffer, in sprite pixels: room round it to reach out
  const BH = 300;
  const FX = 150; // where its feet go in the buffer
  const FY = 294;
  const SCALE = 3; // screen pixels to each of its pixels
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const C = {
    stage: 0,
    t: 0,
    action: null, // { type, t0, dur }
    twitchAt: 2,
    twitch: { x: 0, y: 0, until: 0 },
    blood: [], // drops in the air, in buffer pixels
    stains: [], // on the floor
    dissolve: null,
    lights: 0,
    ready: false,
    x: 702, // its feet, on the stage (behind the battle box: it's close)
    y: 906,
    forms: [],
  };
  window.CREATURE = C;

  let canvas, bctx, img, buf;

  C.init = function (images) {
    canvas = document.createElement('canvas');
    canvas.width = BW;
    canvas.height = BH;
    bctx = canvas.getContext('2d');
    img = bctx.createImageData(BW, BH);
    buf = img.data;
    let n = 0;
    images.creature.forEach((src, i) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = im.height;
        const x = c.getContext('2d');
        x.drawImage(im, 0, 0);
        const m = images.creatureMeta[i];
        const data = x.getImageData(0, 0, im.width, im.height).data;
        // which of its pixels are arms (left -1, right 1), and which are the wound
        const arm = new Int8Array(m.w * m.h);
        const red = new Uint8Array(m.w * m.h);
        for (let y = 0; y < m.h; y++) {
          for (let xx = 0; xx < m.w; xx++) {
            const k = y * m.w + xx;
            if (data[k * 4 + 3] < 128) continue;
            if (y >= m.armpit && y <= m.tips && Math.abs(xx - m.cx) > m.core) arm[k] = xx < m.cx ? -1 : 1;
            if (data[k * 4] > 110 && data[k * 4 + 1] < 60 && data[k * 4 + 2] < 70) red[k] = 1;
          }
        }
        C.forms[i] = { ...m, data, arm, red, head: Math.round(m.h * 0.15) };
        if (++n === images.creature.length) C.ready = true;
      };
      im.src = src;
    });
  };

  // ------------------------------------------------------------------ how it moves, this frame
  function pose() {
    const t = C.t;
    const o = {
      sway: Math.sin(t * 0.9) * 2.2, // at the top of its head, in pixels
      breathe: Math.sin(t * 1.7) * 0.8,
      // its arms, in radians: + swings out from its side (its left arm towards Crispy), - in across it
      armL: Math.sin(t * 1.1) * 0.05,
      armR: Math.sin(t * 1.1 + 2.1) * 0.05,
      stretchL: 1,
      lean: 0, // its top half towards Crispy (pixels, at its head)
      dx: 0,
      dy: 0, // up off the floor (the ceiling drop)
      scale: 1,
      shake: 0,
      flash: 0, // 1 white, 2 red
      glitch: 0,
      tear: 0, // 0..1: its body coming apart in rows, when it ADJUSTS
    };
    const a = C.action;
    if (!a) return o;
    const p = clamp((C.t - a.t0) / a.dur, 0, 1);
    const out = Math.sin(Math.PI * p); // out and back
    const snap = p < 0.35 ? p / 0.35 : Math.max(0, 1 - (p - 0.35) / 0.65); // fast out, slow back
    switch (a.type) {
      // its basic attacks: it doesn't move, the claws just land
      case 'claw':
      case 'rake':
      case 'mimic':
      case 'pat':
        break;
      case 'reach':
      case 'grab':
        // an arm far too long for its body
        o.armL = 1.45 * out;
        o.stretchL = 1 + 1.3 * out;
        o.lean = -18 * out;
        if (a.type === 'grab') o.armR = -0.9 * out;
        break;
      case 'lunge':
        o.lean = -26 * snap;
        o.dx = -80 * snap;
        o.scale = 1 + 0.16 * snap;
        o.armL = 0.8 * snap;
        break;
      case 'lash':
      case 'lash3':
        o.shake = 2 * out;
        o.lean = -8 * out;
        o.armL = 0.5 * out;
        o.armR = 0.5 * out;
        break;
      case 'screech':
      case 'scream':
        o.shake = 3 * out;
        o.glitch = 0.6 * out;
        o.armL = 0.3 * out;
        o.armR = 0.3 * out;
        break;
      case 'twitch':
        o.shake = 4 * (Math.sin(p * 40) > 0 ? 1 : 0) * (1 - p);
        o.glitch = 0.5;
        break;
      case 'weep':
        o.lean = 6 * out;
        o.breathe = Math.sin(C.t * 9) * 1.5 * out;
        break;
      case 'lengthen':
        o.armL = 0.35 * out;
        o.armR = 0.35 * out;
        o.stretchL = 1 + 0.4 * out;
        o.shake = 2 * out;
        break;
      case 'stare':
      case 'smile':
        o.lean = -12 * out;
        break;
      case 'harden':
        o.shake = 1.5 * out;
        o.scale = 1 + 0.03 * out;
        break;
      case 'hurt':
        o.dx = 12 * (1 - p);
        o.lean = 8 * (1 - p);
        o.shake = 3 * (1 - p);
        o.flash = p < 0.2 ? 1 : 0;
        break;
      case 'shield': // the lights come up: it throws its arms over its face
        o.armL = -2.5 * out;
        o.armR = -2.5 * out;
        o.lean = 8 * out;
        break;
      case 'distracted':
        o.lean = 14 * out;
        o.sway = 0;
        break;
      case 'bite':
        o.lean = -20 * snap;
        o.dx = -50 * snap;
        o.scale = 1 + 0.06 * snap;
        break;
      case 'flicker': {
        // while the lights are out, it moves in
        const near = p > 0.3 && p < 0.8 ? 1 : 0;
        o.scale = 1 + 0.18 * near;
        o.dx = -70 * near;
        o.lean = -10 * near;
        break;
      }
      case 'bile':
        o.lean = -10 * out;
        o.shake = 1.5 * out;
        o.breathe = Math.sin(C.t * 14) * 1.5 * out;
        break;
      case 'lure':
        o.lean = 6 * out;
        o.sway = 0;
        o.shake = 0.6 * out;
        break;
      case 'drop': {
        // up onto the ceiling, out of sight... and down on him
        const up = p < 0.42 ? 1 - Math.pow(1 - p / 0.42, 3) : Math.max(0, 1 - (p - 0.42) / 0.08);
        o.dy = -260 * up;
        o.dx = p > 0.42 && p < 0.85 ? -70 : 0;
        o.armL = 0.9 * up;
        o.armR = 0.9 * up;
        break;
      }
      case 'joke':
        o.breathe = Math.sin(C.t * 22) * 1.2 * out;
        o.lean = 5 * out;
        break;
      case 'lock':
        o.lean = 16 * out;
        o.sway = 0;
        break;
      case 'hesitate': {
        // it raises its claws... and lets them down again, slowly
        const rise = p < 0.25 ? p / 0.25 : Math.max(0, 1 - (p - 0.25) / 0.75);
        o.armL = 0.75 * rise;
        o.armR = 0.4 * rise;
        o.lean = -6 * rise + 8 * Math.max(0, p - 0.4);
        break;
      }
      case 'adjust': {
        const conv = p < 0.75 ? Math.min(1, p / 0.4) : Math.max(0, 1 - (p - 0.75) / 0.25);
        o.shake = 5 * conv;
        o.glitch = 1.2 * conv;
        o.armL = Math.sin(C.t * 23) * 0.6 * conv;
        o.armR = Math.sin(C.t * 19 + 1) * 0.6 * conv;
        o.lean = Math.sin(C.t * 13) * 14 * conv;
        o.tear = p > 0.3 && p < 0.7 ? Math.sin(((p - 0.3) / 0.4) * Math.PI) : 0;
        o.flash = p > 0.3 && p < 0.7 && Math.random() < 0.3 ? 2 : 0;
        break;
      }
    }
    return o;
  }

  C.act = function (type) {
    const dur = { claw: 0.55, rake: 0.42, pat: 0.8, mimic: 0.7, reach: 1.1, grab: 1.1, lunge: 0.6, lash: 0.9, lash3: 1.0, screech: 1.2, scream: 1.2, twitch: 1.2, weep: 1.6, lengthen: 1.2, stare: 1.4, smile: 1.6, harden: 1.0, hurt: 0.45, shield: 1.4, distracted: 1.6, hesitate: 1.6, bite: 0.6, flicker: 1.0, bile: 1.0, lure: 1.6, drop: 1.3, joke: 1.3, lock: 0.9, adjust: 3.6 }[type] || 0.8;
    C.action = { type, t0: C.t, dur };
    return dur * 1000;
  };
  // ADJUST: the gruesome change from one form to the next.
  C.adjust = function (to) {
    C.from = C.stage;
    C.adjustTo = to;
    return C.act('adjust');
  };
  C.die = function () {
    C.action = null;
    C.dissolve = { t0: C.t, bits: null };
    return 3000;
  };
  C.reset = function () {
    C.stage = 0;
    C.action = null;
    C.dissolve = null;
    C.gone = false;
    C.blood = [];
    C.stains = [];
    C.lights = 0;
  };

  C.update = function (dt) {
    C.t += dt;
    const a = C.action;
    if (a && C.t - a.t0 > a.dur) {
      if (a.type === 'adjust') C.stage = C.adjustTo;
      C.action = null;
    }
    if (a && a.type === 'adjust') {
      const p = (C.t - a.t0) / a.dur;
      if (p >= 0.5) C.stage = C.adjustTo;
      // it tears: blood sprays from it
      if (p > 0.25 && p < 0.8 && C.blood.length < 280) for (let k = 0; k < 5; k++) C.blood.push(spray());
    }
    if (C.t > C.twitchAt) {
      const andy = C.stage === 4;
      const k = andy ? 1.5 : 3;
      C.twitch = { x: (Math.random() - 0.5) * k * 2, y: (Math.random() - 0.5) * k, until: C.t + 0.1 + Math.random() * 0.12 };
      C.twitchAt = C.t + (andy ? 4 : 1.8) + Math.random() * 4;
    }
    if (C.t > C.twitch.until) C.twitch.x = C.twitch.y = 0;
    // the wound drips
    const f = C.forms[C.stage];
    if (f && f.wound && Math.random() < 0.04 && C.blood.length < 100) C.blood.push({ x: FX - f.cx + f.wound[0] + (Math.random() - 0.5) * 8, y: FY - f.h + f.wound[1] + 10, vx: 0, vy: 0.3 });
    for (const b of C.blood) {
      b.vy += 0.09;
      b.x += b.vx;
      b.y += b.vy;
      if (b.y >= FY) {
        b.dead = true;
        if (C.stains.length < 160) C.stains.push({ x: b.x - FX, w: 1 + Math.random() * 3, d: (Math.random() - 0.5) * 6 });
      }
    }
    C.blood = C.blood.filter((b) => !b.dead && b.x > 0 && b.x < BW);
  };
  function spray() {
    const f = C.forms[C.stage] || { h: 250 };
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const v = 1 + Math.random() * 2.6;
    return { x: FX + (Math.random() - 0.5) * 30, y: FY - f.h * (0.45 + Math.random() * 0.25), vx: Math.cos(a) * v, vy: Math.sin(a) * v };
  }

  // Where things are on the stage, for the effects to aim at.
  C.point = function (name) {
    const f = C.forms[C.stage] || { h: 250, armpit: 60, tips: 170, core: 18, head: 38 };
    const art = {
      head: [0, -f.h + f.head * 0.55],
      chest: [0, -f.h + f.armpit],
      feet: [0, 0],
      hand: [-f.core - 6, -f.h + f.tips - 6],
    }[name] || [0, -f.h * 0.6];
    return [C.x + art[0] * SCALE, C.y + art[1] * SCALE];
  };

  // ------------------------------------------------------------------ drawing
  // One form into the buffer, posed. `rowFilter` (while it tears) picks the rows to draw.
  function render(f, o, rowFilter) {
    const lit0 = 1 + C.lights * 0.6;
    const pivots = { [-1]: [f.cx - f.core, f.armpit - 14], [1]: [f.cx + f.core, f.armpit - 14] };
    // turned on screen by +armL (out to the left) and -armR (out to the right)
    const ang = { [-1]: o.armL, [1]: -o.armR };
    const cos = { [-1]: Math.cos(-ang[-1]), [1]: Math.cos(-ang[1]) };
    const sin = { [-1]: Math.sin(-ang[-1]), [1]: Math.sin(-ang[1]) };
    const top = FY - f.h;
    const pulse = 0.85 + Math.sin(C.t * 3) * 0.15;
    const reachL = o.armL > 0.3 ? Math.ceil(80 * o.stretchL) : 0;
    const x0 = Math.max(0, Math.floor(FX - f.cx - 6 - reachL - Math.abs(o.lean) - 30));
    const x1 = Math.min(BW, Math.ceil(FX - f.cx + f.w + 30 + Math.abs(o.lean)));
    for (let y = Math.max(0, top - 30); y < FY + 1; y++) {
      if (rowFilter && !rowFilter(y)) continue;
      const sy0 = y - top; // the row in the sprite
      const up = clamp(1 - sy0 / f.h, 0, 1); // 1 at its head, 0 at its feet
      // the lamp above it, the dark at its feet
      const lit = (0.42 + 0.62 * Math.pow(up, 1.1)) * lit0;
      // the whole body bends from its ankles
      const bend = (o.sway + o.lean) * Math.pow(up, 1.6);
      const glitchShift = o.glitch && Math.random() < o.glitch * 0.06 ? Math.round((Math.random() - 0.5) * 10 * o.glitch) : 0;
      for (let x = x0; x < x1; x++) {
        let sx = x - (FX - f.cx) - bend - glitchShift;
        let sy = sy0;
        if (sy < f.head + 6) {
          const k = clamp((f.head + 6 - sy) / 6, 0, 1);
          sx -= C.twitch.x * k;
          sy -= C.twitch.y * k;
        }
        if (sy > f.armpit - 30 && sy < f.armpit + 20) sy += o.breathe * Math.sin(((sy - f.armpit + 30) / 50) * Math.PI);
        // arms first: is an arm, turned (and stretched) about its shoulder, over this pixel?
        let src = -1;
        for (const side of [-1, 1]) {
          const a = ang[side];
          if (Math.abs(a) < 0.001 && (side === 1 || o.stretchL === 1)) continue;
          const [px, py] = pivots[side];
          const dx = sx - px;
          const dy = sy - py;
          const rx = dx * cos[side] - dy * sin[side];
          let ry = dx * sin[side] + dy * cos[side];
          if (side === -1 && o.stretchL !== 1) ry /= o.stretchL;
          const ax = Math.round(px + rx);
          const ay = Math.round(py + ry);
          if (ax < 0 || ay < 0 || ax >= f.w || ay >= f.h) continue;
          if (f.arm[ay * f.w + ax] === side) {
            src = ay * f.w + ax;
            break;
          }
        }
        if (src < 0) {
          const bx = Math.round(sx);
          const by = Math.round(sy);
          if (bx < 0 || by < 0 || bx >= f.w || by >= f.h) continue;
          const k = by * f.w + bx;
          // an arm that's moved away leaves its place empty (unless it's barely moved)
          if (f.arm[k] && (Math.abs(ang[f.arm[k]]) > 0.08 || (f.arm[k] === -1 && o.stretchL !== 1))) continue;
          src = k;
        }
        if (f.data[src * 4 + 3] < 128) continue;
        let r = f.data[src * 4];
        let g = f.data[src * 4 + 1];
        const b = f.data[src * 4 + 2];
        if (f.red[src]) {
          // the wound pulses
          r *= pulse * 1.15;
          g *= pulse;
        }
        const l = o.flash === 1 ? 1.5 : lit;
        const k = (y * BW + x) * 4;
        buf[k] = clamp(r * l * (o.flash === 2 ? 1.6 : 1), 0, 255);
        buf[k + 1] = clamp(g * l * (o.flash === 2 ? 0.5 : 0.97), 0, 255);
        buf[k + 2] = clamp(b * l * (o.flash === 2 ? 0.5 : 0.93), 0, 255);
        buf[k + 3] = 255;
      }
    }
  }

  C.draw = function (ctx) {
    if (!C.ready) return;
    const o = pose();
    buf.fill(0);
    const a = C.action;
    if (a && a.type === 'adjust' && o.tear > 0) {
      // tearing between the two bodies: rows of the old one and the new one, shuffled
      const seed = Math.floor(C.t * 20);
      const pick = (y) => ((y * 7 + seed * 13) % 11) / 11 < o.tear * 0.8;
      render(C.forms[C.from], o, (y) => !pick(y));
      render(C.forms[C.adjustTo], o, pick);
    } else render(C.forms[C.stage], o);
    // blood in the air
    for (const b of C.blood) {
      const x = b.x | 0;
      const y = b.y | 0;
      if (x < 0 || y < 0 || x >= BW || y >= BH) continue;
      const k = (y * BW + x) * 4;
      buf[k] = 150 + ((x * 7) % 40);
      buf[k + 1] = 14;
      buf[k + 2] = 18;
      buf[k + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);

    // on whole pixels of its own, so it stays crisp
    const snap = (v) => Math.round(v / SCALE) * SCALE;
    const sx = snap(C.x + o.dx + (o.shake ? (Math.random() - 0.5) * o.shake * SCALE : 0));
    const floorY = snap(C.y);
    const sy = snap(C.y + o.dy + (o.shake ? (Math.random() - 0.5) * o.shake * SCALE * 0.5 : 0));
    const sc = SCALE * o.scale;
    ctx.save();
    if (C.gone) {
      // only the blood it left on the floor
      ctx.fillStyle = 'rgba(70, 4, 8, 0.85)';
      for (const st of C.stains) ctx.fillRect(Math.round(C.x + st.x * SCALE), Math.round(C.y + st.d), Math.round(st.w * SCALE), 3);
      ctx.restore();
      return;
    }
    // its shadow on the floor, and the blood it's left there
    const sh = o.scale;
    const g = ctx.createRadialGradient(sx, floorY + 2, 4, sx, floorY + 2, 160 * sh);
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(sx, floorY + 2, 160 * sh, 32 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(70, 4, 8, 0.85)';
    for (const st of C.stains) ctx.fillRect(Math.round(C.x + st.x * SCALE), Math.round(C.y + st.d), Math.round(st.w * SCALE), 3);
    ctx.imageSmoothingEnabled = false;
    if (C.dissolve) drawDissolve(ctx, sx, sy, sc);
    else ctx.drawImage(canvas, Math.round(sx - FX * sc), Math.round(sy - FY * sc), BW * sc, BH * sc);
    ctx.restore();
  };

  // Its death: the pixels come apart and fall.
  function drawDissolve(ctx, sx, sy, sc) {
    const d = C.dissolve;
    const p = (C.t - d.t0) / 3;
    if (!d.bits) {
      d.bits = [];
      for (let y = 0; y < BH; y++) {
        for (let x = 0; x < BW; x++) {
          const k = (y * BW + x) * 4;
          if (buf[k + 3] > 200 && Math.random() < 0.7) d.bits.push({ x, y, c: `rgb(${buf[k]},${buf[k + 1]},${buf[k + 2]})`, vx: (Math.random() - 0.5) * 0.6, vy: -Math.random() * 0.8, delay: (1 - y / BH) * 0.5 + Math.random() * 0.25 });
        }
      }
    }
    for (const b of d.bits) {
      const tt = Math.max(0, p - b.delay) * 60;
      const x = b.x + b.vx * tt;
      const y = Math.min(FY, b.y + b.vy * tt + 0.02 * tt * tt);
      const al = clamp(1 - Math.max(0, p - b.delay) * 1.4, 0, 1);
      if (al <= 0) continue;
      ctx.globalAlpha = al;
      ctx.fillStyle = b.c;
      ctx.fillRect(Math.round(sx + (x - FX) * sc), Math.round(sy + (y - FY) * sc), sc, sc);
    }
    ctx.globalAlpha = 1;
  }
})();
