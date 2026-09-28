/*
 * SLASHCO VR — TURN-BASED BATTLE
 * pixel.js — a tiny software rasterizer for the pixel art.
 *
 * Everything is drawn pixel by pixel into small buffers (64x64 portraits, a 320x240
 * hallway, a 104x120 Sid) with no anti-aliasing, then shaded with ordered (Bayer)
 * dithering between palette colors. The browser scales the result up with
 * `image-rendering: pixelated`, which keeps every pixel crisp.
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});

  const BAYER8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];
  const bayer = (x, y) => (BAYER8[y & 7][x & 7] + 0.5) / 64;

  function hex(c, a) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a == null ? 255 : a];
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // Dithered pick between neighbouring colors of a ramp. t = 0 → ramp[0], t = 1 → last.
  function ramp(colors, t, x, y) {
    const n = colors.length - 1;
    const p = clamp01(t) * n;
    let i = Math.floor(p);
    if (i >= n) return colors[n];
    return p - i > bayer(x, y) ? colors[i + 1] : colors[i];
  }

  // Lambert shading on an ellipsoid; nx, ny in [-1, 1]. Light comes from the upper left.
  function sphere(nx, ny, lx, ly) {
    lx = lx == null ? -0.45 : lx;
    ly = ly == null ? -0.6 : ly;
    const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return clamp01(nx * lx + ny * ly + nz * lz);
  }

  // Deterministic hash noise so the art never changes between redraws.
  function noise(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + (seed || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  class Pix {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.d = new Uint8ClampedArray(w * h * 4);
    }
    inside(x, y) {
      return x >= 0 && y >= 0 && x < this.w && y < this.h;
    }
    set(x, y, c) {
      x |= 0;
      y |= 0;
      if (!c || !this.inside(x, y)) return;
      const i = (y * this.w + x) * 4;
      const a = c[3] == null ? 255 : c[3];
      if (a >= 255) {
        this.d[i] = c[0];
        this.d[i + 1] = c[1];
        this.d[i + 2] = c[2];
        this.d[i + 3] = 255;
      } else if (a > 0) {
        const k = a / 255;
        this.d[i] = this.d[i] * (1 - k) + c[0] * k;
        this.d[i + 1] = this.d[i + 1] * (1 - k) + c[1] * k;
        this.d[i + 2] = this.d[i + 2] * (1 - k) + c[2] * k;
        this.d[i + 3] = Math.max(this.d[i + 3], a);
      }
    }
    get(x, y) {
      if (!this.inside(x, y)) return null;
      const i = (y * this.w + x) * 4;
      return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
    }
    alpha(x, y) {
      return this.inside(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0;
    }
    clear(x, y) {
      if (!this.inside(x, y)) return;
      this.d.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
    }
    // `paint` is a color, or fn(x, y, nx, ny) returning a color (or null to skip).
    _paint(paint, x, y, nx, ny) {
      const c = typeof paint === 'function' ? paint(x, y, nx, ny) : paint;
      if (c) this.set(x, y, c);
    }
    fill(paint) {
      this.rect(0, 0, this.w, this.h, paint);
    }
    rect(x0, y0, w, h, paint) {
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      for (let y = Math.max(0, y0); y < Math.min(this.h, y0 + h); y++) {
        for (let x = Math.max(0, x0); x < Math.min(this.w, x0 + w); x++) {
          this._paint(paint, x, y, ((x - x0 + 0.5) / w) * 2 - 1, ((y - y0 + 0.5) / h) * 2 - 1);
        }
      }
    }
    ellipse(cx, cy, rx, ry, paint) {
      const x0 = Math.floor(cx - rx - 1);
      const x1 = Math.ceil(cx + rx + 1);
      const y0 = Math.floor(cy - ry - 1);
      const y1 = Math.ceil(cy + ry + 1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const nx = (x + 0.5 - cx) / rx;
          const ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny <= 1) this._paint(paint, x, y, nx, ny);
        }
      }
    }
    // Even-odd scanline polygon fill. nx/ny are relative to the bounding box.
    poly(pts, paint) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [x, y] of pts) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        const sy = y + 0.5;
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i];
          const [bx, by] = pts[(i + 1) % pts.length];
          if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) {
            this._paint(paint, x, y, ((x - minX) / bw) * 2 - 1, ((y - minY) / bh) * 2 - 1);
          }
        }
      }
    }
    line(x0, y0, x1, y1, paint) {
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      x1 = Math.round(x1);
      y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this._paint(paint, x0, y0, 0, 0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    }
    // A capsule between two points; nx/ny describe position across (nx) and along (ny) it.
    stroke(x0, y0, x1, y1, r0, r1, paint) {
      r1 = r1 == null ? r0 : r1;
      const minX = Math.floor(Math.min(x0 - r0, x1 - r1)) - 1;
      const maxX = Math.ceil(Math.max(x0 + r0, x1 + r1)) + 1;
      const minY = Math.floor(Math.min(y0 - r0, y1 - r1)) - 1;
      const maxY = Math.ceil(Math.max(y0 + r0, y1 + r1)) + 1;
      const vx = x1 - x0;
      const vy = y1 - y0;
      const len2 = vx * vx + vy * vy || 1;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5 - x0;
          const py = y + 0.5 - y0;
          const t = clamp01((px * vx + py * vy) / len2);
          const r = r0 + (r1 - r0) * t;
          const dx = px - vx * t;
          const dy = py - vy * t;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= r) {
            const side = (vx * dy - vy * dx) / Math.sqrt(len2) / (r || 1);
            this._paint(paint, x, y, side, t * 2 - 1);
          }
        }
      }
    }
    // Draw every opaque pixel of `src` at (dx, dy).
    blit(src, dx, dy, tint) {
      for (let y = 0; y < src.h; y++) {
        for (let x = 0; x < src.w; x++) {
          const i = (y * src.w + x) * 4;
          if (!src.d[i + 3]) continue;
          const c = tint ? tint(src.d[i], src.d[i + 1], src.d[i + 2], x, y) : [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]];
          this.set(dx + x, dy + y, c);
        }
      }
    }
    // One-pixel outline around everything already drawn.
    outline(color, diagonal) {
      const add = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.alpha(x, y)) continue;
          if (
            this.alpha(x - 1, y) ||
            this.alpha(x + 1, y) ||
            this.alpha(x, y - 1) ||
            this.alpha(x, y + 1) ||
            (diagonal && (this.alpha(x - 1, y - 1) || this.alpha(x + 1, y - 1) || this.alpha(x - 1, y + 1) || this.alpha(x + 1, y + 1)))
          ) {
            add.push(x, y);
          }
        }
      }
      for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], color);
    }
    // Replace every opaque pixel through fn(r, g, b, x, y) → color.
    map(fn) {
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const i = (y * this.w + x) * 4;
          if (!this.d[i + 3]) continue;
          const c = fn(this.d[i], this.d[i + 1], this.d[i + 2], x, y);
          if (c) {
            this.d[i] = c[0];
            this.d[i + 1] = c[1];
            this.d[i + 2] = c[2];
            if (c[3] != null) this.d[i + 3] = c[3];
          }
        }
      }
    }
    // Pixel-map text: rows of characters, `key` maps a character to a color.
    stamp(rows, x0, y0, key) {
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const c = key[row[x]];
          if (c) this.set(x0 + x, y0 + y, c);
        }
      });
    }
    clone() {
      const p = new Pix(this.w, this.h);
      p.d.set(this.d);
      return p;
    }
    toCanvas(canvas) {
      const cv = canvas || root.document.createElement('canvas');
      cv.width = this.w;
      cv.height = this.h;
      const ctx = cv.getContext('2d');
      ctx.putImageData(new ImageData(new Uint8ClampedArray(this.d), this.w, this.h), 0, 0);
      return cv;
    }
  }

  SC.Pixel = { Pix, hex, ramp, sphere, noise, bayer, clamp01 };
})(typeof window !== 'undefined' ? window : globalThis);
