/*
 * SLASHCO VR — TURN-BASED BATTLE
 * art.js — everything drawn in code: the locker hallway, Sid, Trollge's moving head, the effect
 * icons, and the portrait cards (backdrop + portrait + status effects).
 *
 * Coordinates are in art pixels; the page shows them at 2x (the hallway is 640x480
 * art pixels on a 1280x960 stage).
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  const { Pix, hex, ramp, noise, bayer, clamp01 } = SC.Pixel;

  const R = (list) => list.map((c) => hex(c));

  // ------------------------------------------------------------------ palettes
  const PAL = {
    wall: R(['#2e281c', '#4a4030', '#6d5f45', '#958363', '#bba77e', '#d6c497', '#e9dbb0']),
    wainscot: R(['#2a2217', '#433726', '#655339', '#8b7450', '#ad9267', '#c4a878']),
    stripe: R(['#0d2015', '#183b26', '#255a37', '#347a49', '#46985b']),
    trim: R(['#1f1b14', '#383126', '#544a39', '#6e634d']),
    greenDoor: R(['#07110c', '#0f2218', '#193725', '#244d34', '#306545', '#3d7c55']),
    vent: R(['#101315', '#1f2427', '#343b3f', '#4d565b', '#6c767b']),
    maroon: R(['#140607', '#260c0e', '#3d1416', '#561e20', '#6f2a29', '#883733']),
    locker: R(['#08090b', '#121417', '#1d2024', '#2a2e33', '#393e45', '#4b5159']),
    blueDoor: R(['#05080f', '#0b1226', '#131e3d', '#1c2b57', '#273b73', '#344c8f']),
    paper: R(['#2e2e2b', '#4f4f4b', '#76766f', '#9c9c94', '#bcbcb2', '#d8d8ce']),
    ink: R(['#151514', '#262624']),
    metal: R(['#1d2023', '#3d4247', '#6a7178', '#a2a9b0', '#d2d8dd']),
    ceiling: R(['#121210', '#1f1e1b', '#2f2e2a', '#43423c', '#58574f', '#6d6c63']),
    floor: R(['#15181a', '#23282b', '#343a3e', '#475055', '#5d676d', '#737e84', '#8b969c', '#a3aeb3']),
    grout: R(['#0b0d0e', '#16191b', '#22272a']),
    tube: R(['#9fb3bf', '#dbe9f0', '#f6fcff']),
  };

  // ------------------------------------------------------------------ perspective
  // Maps the unit square (s, t) onto a screen quad [p(0,0), p(1,0), p(1,1), p(0,1)].
  function homography(q) {
    const [x0, y0] = q[0];
    const [x1, y1] = q[1];
    const [x2, y2] = q[2];
    const [x3, y3] = q[3];
    const dx1 = x1 - x2;
    const dx2 = x3 - x2;
    const dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2;
    const dy2 = y3 - y2;
    const dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (dx3 * dy2 - dx2 * dy3) / den;
    const h = (dx1 * dy3 - dx3 * dy1) / den;
    const m = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
    // Inverse of the 3x3 matrix, for screen → (s, t).
    const [a, b, c, d, e, f, gg, hh, i] = m;
    const A = e * i - f * hh;
    const B = -(d * i - f * gg);
    const C = d * hh - e * gg;
    const det = a * A + b * B + c * C;
    const inv = [
      A / det,
      -(b * i - c * hh) / det,
      (b * f - c * e) / det,
      B / det,
      (a * i - c * gg) / det,
      -(a * f - c * d) / det,
      C / det,
      -(a * hh - b * gg) / det,
      (a * e - b * d) / det,
    ];
    return {
      toScreen(s, t) {
        const w = gg * s + hh * t + i;
        return [(a * s + b * t + c) / w, (d * s + e * t + f) / w];
      },
      toPlane(x, y) {
        const w = inv[6] * x + inv[7] * y + inv[8];
        return [(inv[0] * x + inv[1] * y + inv[2]) / w, (inv[3] * x + inv[4] * y + inv[5]) / w];
      },
    };
  }

  // A tiny 3x5 font for the NOTICE poster.
  const MINI = {
    N: ['101', '111', '111', '111', '101'],
    O: ['111', '101', '101', '101', '111'],
    T: ['111', '010', '010', '010', '010'],
    I: ['111', '010', '010', '010', '111'],
    C: ['111', '100', '100', '100', '111'],
    E: ['111', '100', '110', '100', '111'],
  };

  // ------------------------------------------------------------------ the hallway
  const WALL_LEN = 12; // metres along the wall
  const WALL_H = 3; // metres floor to ceiling
  const LIGHTS = [2.4, 8.2]; // where the ceiling lights are, along the wall

  // Things on the wall, in metres: u0..u1 along it, v0..v1 up it.
  const PROPS = [
    { kind: 'door', mat: 'greenDoor', u0: 0.3, u1: 1.45, v0: 0, v1: 2.1, side: 0.1 },
    { kind: 'notice', u0: 1.95, u1: 2.95, v0: 1.12, v1: 1.95 },
    { kind: 'door', mat: 'maroon', u0: 3.05, u1: 3.95, v0: 0, v1: 2.2, side: 0.14, cabinet: true },
    { kind: 'lockers', u0: 5.35, u1: 7.25, v0: 0, v1: 1.9, side: 0.12, count: 3 },
    { kind: 'door', mat: 'blueDoor', u0: 8.35, u1: 9.3, v0: 0, v1: 2.05, side: 0.12, cabinet: true },
  ];

  function lightAt(u) {
    let l = 0.3;
    for (const c of LIGHTS) l += 0.62 * Math.exp(-(((u - c) / 2.3) ** 2));
    return l;
  }

  function wallShade(u, v, x, y) {
    // Ambient + the two fluorescent lights, brighter up high, darker by the floor.
    let b = lightAt(u) * (0.78 + 0.22 * (v / WALL_H));
    b *= 0.62 + 0.38 * clamp01(v / 0.5);
    // Grime and water stains.
    const n = noise(Math.floor(u * 22), Math.floor(v * 22), 3);
    const stain = noise(Math.floor(u * 3), Math.floor(v * 2.5), 9);
    b -= n * 0.07 + (stain > 0.82 ? 0.08 : 0);
    let mat;
    if (v > WALL_H - 0.06) mat = PAL.trim;
    else if (v < 0.09) {
      mat = PAL.trim;
      b *= 0.8;
    } else if (v < 1.0) mat = PAL.wainscot;
    else if (v < 1.08) mat = PAL.stripe;
    else mat = PAL.wall;
    // Props override the wall.
    for (const p of PROPS) {
      if (u < p.u0 - (p.side || 0) || u > p.u1 || v < p.v0 || v > p.v1) continue;
      const c = propColor(p, u, v, x, y, b);
      if (c) return c;
    }
    return ramp(mat, b * 0.92, x, y);
  }

  function propColor(p, u, v, x, y, light) {
    const lu = (u - p.u0) / (p.u1 - p.u0); // 0..1 across the prop
    const lv = (v - p.v0) / (p.v1 - p.v0); // 0..1 up the prop
    const mat = p.mat ? PAL[p.mat] : PAL.locker;
    // Cabinets stick out of the wall: we see their left side face.
    if (u < p.u0) {
      if (!p.side) return null;
      return ramp(mat, light * 0.35, x, y);
    }
    if (p.kind === 'notice') {
      const px = Math.floor(lu * 48);
      const py = Math.floor((1 - lv) * 34);
      let b = light * (0.75 + 0.1 * noise(px, py, 4));
      if (px < 1 || px > 46 || py < 1 || py > 32) return ramp(PAL.paper, b * 0.55, x, y);
      // "NOTICE" title
      const word = 'NOTICE';
      if (py >= 3 && py < 8 && px >= 3 && px < 3 + word.length * 4) {
        const ch = MINI[word[Math.floor((px - 3) / 4)]];
        const cx = (px - 3) % 4;
        if (cx < 3 && ch[py - 3][cx] === '1') return PAL.ink[0];
      }
      // Lines of small print.
      if (py >= 11 && py <= 30 && py % 3 === 0 && px >= 3 && px <= 44) {
        if (noise(Math.floor(px / 3), py, 12) > 0.18) return PAL.ink[1];
      }
      if (px >= 30 && px <= 44 && py >= 3 && py <= 7 && py % 2 === 1 && noise(px, py, 5) > 0.3) return PAL.ink[1];
      b -= noise(Math.floor(px / 6), Math.floor(py / 5), 8) * 0.12;
      return ramp(PAL.paper, b, x, y);
    }
    if (p.kind === 'lockers') {
      const n = p.count;
      const which = Math.min(n - 1, Math.floor(lu * n));
      const cu = lu * n - which; // 0..1 inside one locker
      let b = light * 0.95;
      if (cu < 0.04 || cu > 0.96) return ramp(PAL.locker, b * 0.25, x, y); // gaps between lockers
      if (lv > 0.985 || lv < 0.02) return ramp(PAL.locker, b * 0.35, x, y);
      // Top vents: short horizontal slits.
      if (lv > 0.8 && lv < 0.93 && cu > 0.2 && cu < 0.8) {
        const slit = Math.floor(lv * 95) % 2 === 0;
        return ramp(PAL.locker, slit ? b * 0.15 : b * 0.7, x, y);
      }
      if (lv > 0.1 && lv < 0.18 && cu > 0.2 && cu < 0.8) {
        const slit = Math.floor(lv * 95) % 2 === 0;
        return ramp(PAL.locker, slit ? b * 0.15 : b * 0.65, x, y);
      }
      // Handle.
      if (cu > 0.72 && cu < 0.84 && lv > 0.5 && lv < 0.6) return ramp(PAL.metal, 0.35 + light * 0.4, x, y);
      // Panel edge highlight and dents.
      const edge = cu < 0.1 ? 0.2 : cu > 0.9 ? -0.15 : 0;
      b += edge - noise(Math.floor(cu * 12) + which * 30, Math.floor(lv * 40), 6) * 0.1;
      return ramp(PAL.locker, b * 0.9, x, y);
    }
    // Doors (and door-like cabinets).
    let b = light * 0.95;
    const frame = lu < 0.06 || lu > 0.94 || lv > 0.965;
    if (frame) return ramp(mat, b * (lu < 0.06 ? 0.75 : 0.45), x, y);
    // Vents near the top and bottom.
    const ventTop = lv > 0.72 && lv < 0.86 && lu > 0.16 && lu < 0.84;
    const ventBot = lv > 0.08 && lv < 0.2 && lu > 0.16 && lu < 0.84;
    if (ventTop || ventBot) {
      const band = ventTop ? (lv - 0.72) / 0.14 : (lv - 0.08) / 0.12;
      const slit = Math.floor(band * 9) % 2 === 0;
      return ramp(PAL.vent, slit ? 0.1 : 0.35 + light * 0.3, x, y);
    }
    // Handle.
    if (lu > 0.8 && lu < 0.9 && lv > 0.44 && lv < 0.5) return ramp(PAL.metal, 0.4 + light * 0.45, x, y);
    b += (lu < 0.14 ? 0.12 : 0) - noise(Math.floor(lu * 14), Math.floor(lv * 30), p.u0 * 7) * 0.12;
    if (p.cabinet && lv < 0.03) b *= 0.5;
    return ramp(mat, b * 0.88, x, y);
  }

  function hallway() {
    const W = 640;
    const H = 480;
    const px = new Pix(W, H);
    const wall = homography([
      [-40, 322],
      [680, 282],
      [680, 118],
      [-40, 38],
    ]);
    const floor = homography([
      [-40, 322],
      [680, 282],
      [860, 560],
      [-380, 600],
    ]);
    const ceiling = homography([
      [-40, 38],
      [680, 118],
      [860, -60],
      [-380, -120],
    ]);
    const topY = (x) => 38 + ((x + 40) / 720) * 80;
    const botY = (x) => 322 - ((x + 40) / 720) * 40;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let c;
        if (y >= topY(x) && y <= botY(x)) {
          const [s, t] = wall.toPlane(x + 0.5, y + 0.5);
          c = wallShade(s * WALL_LEN, t * WALL_H, x, y);
        } else if (y > botY(x)) {
          const [s, t] = floor.toPlane(x + 0.5, y + 0.5);
          c = floorShade(s * WALL_LEN, t * 5, x, y);
        } else {
          const [s, t] = ceiling.toPlane(x + 0.5, y + 0.5);
          c = ceilingShade(s * WALL_LEN, t * 4, x, y);
        }
        px.set(x, y, c);
      }
    }
    // Vignette: fade the edges into the dark with dithering.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / (W / 2);
        const dy = (y - H * 0.55) / (H / 2);
        const d = Math.sqrt(dx * dx * 0.8 + dy * dy);
        const dark = clamp01((d - 0.72) * 1.4);
        if (dark > bayer(x, y)) {
          const c = px.get(x, y);
          px.set(x, y, [c[0] * 0.35, c[1] * 0.35, c[2] * 0.4, 255]);
        }
      }
    }
    return px;
  }

  function floorShade(u, w, x, y) {
    // w = metres out from the wall toward the viewer.
    const tile = 0.6;
    const tu = u / tile;
    const tw = w / tile;
    const fu = tu - Math.floor(tu);
    const fw = tw - Math.floor(tw);
    const gw = 0.06;
    let b = lightAt(u) * (1 - Math.min(0.55, w * 0.12));
    if (fu < gw || fw < gw) return ramp(PAL.grout, b * 0.9, x, y);
    const id = Math.floor(tu) * 31 + Math.floor(tw) * 17;
    b *= 0.82 + noise(Math.floor(tu), Math.floor(tw), 21) * 0.18;
    b -= noise(Math.floor(u * 25), Math.floor(w * 25), id) * 0.1;
    // Soft reflection of the lights near the wall.
    for (const c of LIGHTS) b += 0.18 * Math.exp(-(((u - c) / 0.8) ** 2) - ((w - 0.8) / 0.7) ** 2);
    return ramp(PAL.floor, b * 0.8, x, y);
  }

  function ceilingShade(u, w, x, y) {
    let b = 0.35 + 0.25 * lightAt(u) - w * 0.04;
    for (const c of LIGHTS) {
      // A long fixture running away from the wall.
      if (Math.abs(u - c) < 0.16 && w > 0.4 && w < 2.6) {
        if (Math.abs(u - c) < 0.08) return ramp(PAL.tube, 0.8, x, y);
        return ramp(PAL.metal, 0.3, x, y);
      }
      b += 0.25 * Math.exp(-(((u - c) / 0.9) ** 2));
    }
    b -= noise(Math.floor(u * 18), Math.floor(w * 18), 2) * 0.08;
    return ramp(PAL.ceiling, b, x, y);
  }

  // ------------------------------------------------------------------ Sid
  // A big man in a filthy, blood-stained blue Cookie Monster bodysuit, drawn to the
  // proportions of assets/source/sid_reference.png: a small costume head with googly eyes,
  // broad shoulders, a long torso, and a wide stance.
  const SID_W = 224;
  const SID_H = 210;
  const FUR = R(['#020409', '#060c1a', '#0b152d', '#111f42', '#192c58', '#223a6e', '#2d4984', '#3c5b9a', '#4f70ae']);
  const STAIN = R(['#0d0304', '#1f0707', '#330d0b', '#4a1712', '#5c2217']);
  const EYE = R(['#6f6f63', '#a9a99b', '#d8d8cb', '#f5f5ec']);
  const MOUTH = R(['#030204', '#0e070b', '#1d0e15', '#361b22']);
  const GUN = R(['#0b0c0e', '#26292d', '#474c52', '#747a82', '#b0b7be']);
  const COOKIE = R(['#2a1606', '#5a3410', '#8a5620', '#b98038']);
  const OUTLINE = hex('#020309');

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

  // Fur shading: `light` in 0..1 from the shape's lighting, plus strands and grime.
  function fur(x, y, light, seed) {
    const strand = noise(x, Math.floor(y / 3) + ((x * 7) % 3), seed) - 0.5;
    const clump = vnoise(x, y, 5, seed + 1) - 0.5;
    const grime = vnoise(x, y, 14, seed + 2) - 0.5;
    return clamp01(light * 0.86 + strand * 0.2 + clump * 0.2 + grime * 0.16);
  }

  // Dried blood: organic splotches with a few drips running down from them.
  function stained(x, y, amount) {
    const v = vnoise(x, y, 9, 77) * 0.7 + vnoise(x, y, 3.5, 78) * 0.3;
    if (v > 1 - amount) return true;
    // Drips: thin vertical runs under a splotch.
    if (noise(x, 0, 79) > 0.86) {
      for (let k = 1; k < 12; k++) {
        const above = vnoise(x, y - k, 9, 77) * 0.7 + vnoise(x, y - k, 3.5, 78) * 0.3;
        if (above > 1 - amount) return k < 4 + noise(x, 1, 80) * 8;
      }
    }
    return false;
  }

  function limb(px, x0, y0, x1, y1, r0, r1, seed, shadeMul) {
    px.stroke(x0, y0, x1, y1, r0, r1, (x, y, nx) => {
      // Cylinder lighting across the limb, light from the left.
      const l = clamp01(0.62 - nx * 0.42) * (shadeMul || 1);
      if (noise(x, y, seed + 9) > 0.93 && Math.abs(nx) > 0.7) return null; // ragged fur edge
      return ramp(FUR, fur(x, y, l, seed), x, y);
    });
  }

  function blob(px, cx, cy, rx, ry, seed, opts) {
    opts = opts || {};
    const lx = opts.lx == null ? -0.5 : opts.lx;
    const ly = opts.ly == null ? -0.55 : opts.ly;
    px.ellipse(cx, cy, rx + 1.5, ry + 1.5, (x, y, nx, ny) => {
      // Furry, ragged silhouette: jitter the edge.
      const edge = nx * nx + ny * ny;
      const jag = (noise(x, y, seed + 4) - 0.5) * 0.22;
      if (edge > 0.86 + jag) return null;
      let l = SC.Pixel.sphere(nx * 0.95, ny * 0.95, lx, ly);
      l = 0.12 + l * 0.85;
      if (opts.stain && stained(x, y, opts.stain)) return ramp(STAIN, l * 0.9, x, y);
      return ramp(FUR, fur(x, y, l * (opts.mul || 1), seed), x, y);
    });
  }

  function drawGun(px, hx, hy) {
    // Desert Eagle, side view, pointing right from the hand at (hx, hy): a long boxy
    // slide, a chunky grip going down through the fist, a small trigger guard.
    const slide = [
      [hx - 4, hy - 10],
      [hx + 34, hy - 10],
      [hx + 35, hy - 9],
      [hx + 35, hy - 2],
      [hx - 4, hy - 2],
    ];
    px.poly(slide, (x, y, nx, ny) => {
      let l = 0.62 - ny * 0.28;
      if (y === hy - 10) l += 0.3; // top edge catches the light
      if (x > hx + 8 && x < hx + 30 && y === hy - 6) l -= 0.3; // slide groove
      return ramp(GUN, l, x, y);
    });
    px.rect(hx - 4, hy - 2, 14, 3, (x, y) => ramp(GUN, 0.35, x, y)); // frame under the slide
    px.poly(
      [
        [hx - 3, hy],
        [hx + 7, hy],
        [hx + 4, hy + 14],
        [hx - 6, hy + 13],
      ],
      (x, y, nx) => ramp(GUN, 0.22 - nx * 0.08 + (noise(x, y, 70) > 0.8 ? 0.12 : 0), x, y)
    );
    px.rect(hx + 7, hy + 1, 5, 1, GUN[1]); // trigger guard
    px.rect(hx + 11, hy + 1, 1, 4, GUN[1]);
    px.rect(hx + 7, hy + 4, 5, 1, GUN[1]);
    px.rect(hx + 33, hy - 8, 2, 4, GUN[0]); // muzzle
  }

  function drawCookie(px, cx, cy, r) {
    r = r || 8;
    px.ellipse(cx, cy, r, r, (x, y, nx, ny) => {
      if (noise(x, y, 55) > 0.8 && nx * nx + ny * ny > 0.72) return null; // bitten, crumbly edge
      if (vnoise(x, y, 2.2, 56) > 0.74) return COOKIE[0]; // chocolate chips
      return ramp(COOKIE, 0.8 - ny * 0.25 - nx * 0.1 - (nx * nx + ny * ny) * 0.2, x, y);
    });
  }

  function mitten(px, x, y, rx, ry, light, seed) {
    px.ellipse(x, y, rx, ry, (xx, yy, nx, ny) => ramp(FUR, fur(xx, yy, light - nx * 0.2 - ny * 0.15, seed), xx, yy));
  }

  // pose: 'idle' | 'gun' | 'cookie' | 'down'
  function sidBody(pose, breathe) {
    const px = new Pix(SID_W, SID_H);
    const cx = 101;
    const down = pose === 'down';
    const drop = down ? 22 : 0; // the whole body sinks when he's down on one knee
    const top = drop + (breathe ? 1 : 0); // breathing lifts only the upper body
    const T = (y) => y + top;

    // Shadow on the floor.
    px.ellipse(cx, 204, 66, 5.5, (x, y, nx, ny) => (0.6 - (nx * nx + ny * ny) * 0.55 > bayer(x, y) ? [0, 0, 0, 150] : null));

    // ---- Legs: a wide, planted stance, or down on one knee.
    const foot = (x, y, light, seed) => mitten(px, x, y, 13, 5.5, light, seed);
    if (!down) {
      limb(px, cx - 14, 134, cx - 25, 170, 12.5, 10, 11);
      limb(px, cx - 25, 170, cx - 31, 198, 10, 8, 11);
      limb(px, cx + 14, 134, cx + 27, 170, 12.5, 10, 12, 0.85);
      limb(px, cx + 27, 170, cx + 33, 198, 10, 8, 12, 0.85);
      foot(cx - 35, 202, 0.42, 13);
      foot(cx + 37, 202, 0.32, 14);
    } else {
      limb(px, cx - 14, 134 + drop, cx - 27, 194, 12.5, 10, 11); // knee on the floor
      limb(px, cx - 27, 194, cx - 10, 200, 9.5, 8, 11);
      limb(px, cx + 14, 134 + drop, cx + 32, 174, 12.5, 10, 12, 0.85); // other foot planted
      limb(px, cx + 32, 174, cx + 34, 198, 10, 8, 12, 0.85);
      foot(cx + 38, 202, 0.32, 14);
    }

    // ---- Torso: broad shoulders, a thick chest and belly, narrower hips.
    const torso = [
      [cx - 12, T(38)],
      [cx + 12, T(38)],
      [cx + 30, T(44)],
      [cx + 38, T(53)],
      [cx + 36, T(72)],
      [cx + 31, T(94)],
      [cx + 27, T(114)],
      [cx + 29, T(130)],
      [cx + 20, 143 + drop],
      [cx, 147 + drop],
      [cx - 20, 143 + drop],
      [cx - 29, T(130)],
      [cx - 27, T(114)],
      [cx - 31, T(94)],
      [cx - 36, T(72)],
      [cx - 38, T(53)],
      [cx - 30, T(44)],
    ];
    px.poly(torso, (x, y, nx, ny) => {
      const round = 1 - nx * nx;
      let l = 0.24 + 0.5 * round - nx * 0.26 - Math.max(0, ny) * 0.1;
      if (ny < -0.82) l += 0.1; // shoulders catch the ceiling light
      if (ny > -0.42 && ny < -0.3 && Math.abs(nx) < 0.6) l -= 0.12; // shadow under the chest
      if (ny > 0.62 && Math.abs(nx) < 0.12) l -= 0.1; // crotch seam
      if (stained(x, y, 0.3)) return ramp(STAIN, clamp01(l * 1.05), x, y);
      return ramp(FUR, fur(x, y, clamp01(l), 32), x, y);
    });
    blob(px, cx - 33, T(55), 11, 11, 35, { stain: 0.22 });
    blob(px, cx + 33, T(55), 11, 11, 36, { stain: 0.22, mul: 0.85 });

    // ---- Head: a small costume head on a thick furry neck.
    const hx = cx + (down ? -8 : 1);
    const hy = 22 + top + (down ? 10 : 0);
    limb(px, cx, T(42), hx, hy + 8, 10.5, 10, 50);
    blob(px, hx, hy, 18, 14.5, 51, { ly: -0.75 });
    const open = pose === 'cookie' ? 1.2 : down ? 0.7 : 1;
    px.ellipse(hx + 1, hy + 5, 12, 4.8 * open, (x, y, nx, ny) => (ny > 0.45 ? ramp(MOUTH, 0.7, x, y) : ramp(MOUTH, 0.05 + (ny + 1) * 0.18, x, y)));
    px.ellipse(hx + 1, hy + 5 + 4.3 * open, 9.5, 1.6, (x, y, nx) => ramp(FUR, fur(x, y, 0.55 - nx * 0.2, 52), x, y));
    for (let i = 0; i < 7; i++) {
      px.set(hx - 10 + Math.floor(noise(i, 1, 57) * 22), hy + 8 + Math.floor(noise(i, 2, 57) * 4), COOKIE[1 + (i % 2)]);
    }

    // ---- Arms.
    const arm = (sx, sy, ex, ey, hx2, hy2, seed, mul, hand) => {
      limb(px, sx, sy, ex, ey, 9.5, 8.5, seed, mul);
      limb(px, ex, ey, hx2, hy2, 8.5, 7.2, seed + 1, mul);
      if (hand) mitten(px, hx2, hy2 + 2, 7, 7.5, hand, seed + 2);
    };
    if (pose === 'cookie') {
      // Both hands hold a huge cookie up to his mouth, elbows out, like in the game.
      arm(cx - 34, T(55), cx - 56, T(70), cx - 21, hy + 12, 41, 1.05, 0);
      arm(cx + 34, T(55), cx + 58, T(70), cx + 23, hy + 12, 21, 0.9, 0);
      drawCookie(px, hx + 1, hy + 11, 22);
      mitten(px, cx - 21, hy + 13, 7, 7.5, 0.6, 43);
      mitten(px, cx + 23, hy + 13, 7, 7.5, 0.45, 23);
    } else if (pose === 'gun') {
      arm(cx - 34, T(57), cx - 45, T(96), cx - 42, T(132), 41, 1.05, 0.58);
      arm(cx + 34, T(55), cx + 58, T(64), cx + 81, T(70), 21, 0.95, 0);
      drawGun(px, cx + 84, T(73));
      mitten(px, cx + 83, T(73), 7, 7, 0.5, 23);
    } else {
      const sag = down ? 10 : 0;
      arm(cx - 34, T(57), cx - 45, T(96), cx - 42, T(132) + sag, 41, 1.05, 0.58);
      arm(cx + 34, T(57), cx + 46, T(96), cx + 43, T(132) + sag, 21, 0.85, 0.4);
    }

    px.outline(OUTLINE);
    return { px, eyes: [[hx - 7, hy - 12], [hx + 8, hy - 13]], eyeR: 5.4, down };
  }

  // Eyes are drawn every frame so the pupils can wander.
  function sidEyes(px, body, opts) {
    opts = opts || {};
    body.eyes.forEach(([ex, ey], i) => {
      const r = body.eyeR - (i ? 0.5 : 0);
      px.ellipse(ex, ey, r + 1, r + 1, OUTLINE);
      px.ellipse(ex, ey, r, r, (x, y, nx, ny) => {
        const l = SC.Pixel.sphere(nx, ny, -0.4, -0.6);
        if (opts.angry && noise(x, y, 60 + i) > 0.84 && nx * nx + ny * ny > 0.3) return hex('#9e1b1b');
        return ramp(EYE, 0.3 + l * 0.75, x, y);
      });
      const p = (opts.pupils && opts.pupils[i]) || [0, 0];
      const pr = r * (opts.angry ? 0.3 : 0.42);
      if (opts.dizzy) {
        // Spiral-ish dizzy eyes.
        for (let a = 0; a < 14; a++) {
          const t = a / 14;
          const ang = t * Math.PI * 3 + (opts.frame || 0) * 0.6 + i;
          px.set(Math.round(ex + Math.cos(ang) * t * (r - 2)), Math.round(ey + Math.sin(ang) * t * (r - 2)), OUTLINE);
        }
      } else {
        px.ellipse(ex + p[0] * (r - pr - 1), ey + p[1] * (r - pr - 1), pr, pr, OUTLINE);
        px.set(Math.round(ex + p[0] * (r - pr - 1) - 1), Math.round(ey + p[1] * (r - pr - 1) - 1), hex('#3a3a3a'));
      }
    });
  }

  const sidCache = {};
  function sid(opts) {
    opts = opts || {};
    const pose = opts.pose || 'idle';
    const key = pose + (opts.breathe ? 1 : 0);
    const body = sidCache[key] || (sidCache[key] = sidBody(pose, opts.breathe));
    const px = body.px.clone();
    sidEyes(px, body, { pupils: opts.pupils, angry: opts.angry, dizzy: pose === 'down' || opts.dizzy, frame: opts.frame });
    return px;
  }
  // Where the gun's muzzle and Sid's mouth are, for effects (art pixels in the sprite).
  const SID_POINTS = { cx: 101, muzzle: [220, 67], mouth: [102, 27], head: [102, 20], body: [101, 92], feet: [101, 204], w: SID_W, h: SID_H };

  // ------------------------------------------------------------------ Trollge
  // Made from its render by tools/make_images.py: a body layer and a separate head layer, so
  // "the large head wobbles on its skinny body". Rows of the head slide sideways more the
  // further they are above the neck, which swings it like a heavy pendulum.
  const TROLL_EYES = {
    white: [hex('#ffffff'), hex('#b8a8e8')],
    red: [hex('#ff4040'), hex('#9a1020')],
    dim: [hex('#8a8098'), hex('#3a3346')],
  };

  // o: { t (ms), pose: 'idle' | 'stare' | 'fast' | 'glance' | 'lunge' | 'down', eyes: 'white' | 'red' | 'dim' }
  function trollge(o) {
    const S = SC.SPRITES.trollge;
    const layers = spritePix.trollge;
    const px = new Pix(layers.body.w, layers.body.h);
    px.blit(layers.body, 0, 0);
    const head = layers.head;
    const t = o.t || 0;
    let amp = Math.sin(t / 430) * 2.6;
    let dy = Math.round(Math.sin(t / 900) * 0.8);
    if (o.pose === 'stare') {
      amp = 0; // it goes perfectly still
      dy = 0;
    } else if (o.pose === 'fast') amp = Math.sin(t / 90) * 3.2;
    else if (o.pose === 'glance') amp = -7;
    else if (o.pose === 'lunge') amp = 5;
    else if (o.pose === 'down') {
      amp = 9 + Math.sin(t / 700);
      dy = 4;
    }
    const [hx, hy] = S.headAt;
    const span = Math.max(1, S.pivot[1] - hy);
    const shift = (row) => Math.round(amp * clamp01((S.pivot[1] - row) / span));
    for (let y = 0; y < head.h; y++) {
      const dx = shift(hy + y);
      for (let x = 0; x < head.w; x++) {
        const i = (y * head.w + x) * 4;
        if (head.d[i + 3]) px.set(hx + x + dx, hy + y + dy, [head.d[i], head.d[i + 1], head.d[i + 2], 255]);
      }
    }
    // The glints in its big black eyes.
    const [c0, c1] = TROLL_EYES[o.eyes] || TROLL_EYES.white;
    for (const [ex, ey] of S.eyes) {
      const x = hx + ex + shift(hy + ey);
      const y = hy + ey + dy;
      if (o.pose === 'stare') {
        px.rect(x - 1, y - 1, 4, 4, c1);
        px.rect(x, y, 2, 2, c0);
      } else {
        px.rect(x, y, 2, 2, c0);
        px.set(x + 2, y - 1, c1);
      }
    }
    return px;
  }

  // Anchor points on the Trollge sprite (in sprite pixels), for effects and targeting.
  function trollgePoints() {
    const S = SC.SPRITES.trollge;
    const b = spritePix.trollge.body;
    const face = [S.headAt[0] + S.mouth[0], S.headAt[1] + S.mouth[1] - 8];
    return { w: b.w, h: b.h, head: face, body: S.chest, feet: S.feet, clawL: S.clawL, clawR: S.clawR, muzzle: S.clawR };
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
          Object.keys(sprites).map((name) =>
            Promise.all([loadPix(sprites[name].body), loadPix(sprites[name].head)]).then(([body, head]) => {
              if (body && head) spritePix[name] = { body, head };
            })
          )
        )
    );
  }

  // Where things sit on each 128x128 portrait, for the status effects.
  const ANCHORS = {
    mel: { head: [63, 43], brow: [63, 42], cheek: [78, 69], top: [63, 3] },
    john: { head: [64, 44], brow: [66, 38], cheek: [79, 64], top: [63, 9] },
    mysti: { head: [64, 70], brow: [64, 58], cheek: [80, 84], top: [60, 6] },
    purpl: { head: [72, 72], brow: [76, 60], cheek: [88, 92], top: [64, 6] },
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
  SC.Art.hallway = hallway;
  SC.Art.sid = sid;
  SC.Art.trollge = trollge;
  SC.Art.trollgePoints = trollgePoints;
  SC.Art.icon = icon;
  SC.Art.card = card;
  SC.Art.loadPortraits = loadPortraits;
  SC.Art.MOODS = MOODS;
  SC.Art.SID_POINTS = SID_POINTS;
  SC.Art.PAL = PAL;
  SC.Art.homography = homography;
})(typeof window !== 'undefined' ? window : globalThis);
