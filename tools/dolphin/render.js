#!/usr/bin/env node
/*
 * Renders Dolphin Man's 3D model into the source images for his battle sprite.
 *
 *   npm i -g playwright   (or any Playwright with Chromium)
 *   node tools/dolphin/render.js
 *   python3 tools/make_images.py
 *
 * The model (render.html) is a ray-marched signed-distance model in a WebGL shader: his body,
 * dolphin head, fin and tail built from smooth shapes and posed by a skeleton (poses.js). It
 * writes assets/source/dolphin3d/:
 *
 *   stand_body.png, stand_head.png, stand_tail.png - standing, each part on its own image (the
 *       others still cast their shadows on it), all from the same camera
 *   stand.png    - all of him standing, for reference
 *   fetal.png    - Fetal Position, side on
 *   anchors.json - where each pose's named points land on its images (pixels, y down)
 */
const path = require('path');
const fs = require('fs');

function playwright() {
  for (const name of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(name);
    } catch (e) {
      /* try the next */
    }
  }
  throw new Error('Playwright not found: npm i -g playwright');
}

const OUT = path.join(__dirname, '..', '..', 'assets', 'source', 'dolphin3d');
const POSES = require('./poses.js');
const BODY = 1;
const HEAD = 2;
const TAIL = 4;
const FIN = 8;
const ALL = BODY | HEAD | TAIL | FIN;
const SS = 2; // samples per pixel, per axis

const JOBS = [
  ['stand_body', 'stand', BODY | FIN, HEAD | TAIL],
  ['stand_head', 'stand', HEAD, BODY | FIN | TAIL],
  ['stand_tail', 'stand', TAIL, BODY | FIN | HEAD],
  ['stand', 'stand', ALL, 0],
  ['fetal', 'fetal', ALL, 0],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await playwright().chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('file://' + path.join(__dirname, 'render.html'));
  for (const [name, pose, parts, shade] of JOBS) {
    const P = Object.assign({}, POSES[pose], { parts, shade, ss: SS });
    const t0 = Date.now();
    const url = await page.evaluate((P) => window.renderImage(P), P);
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`wrote ${name}.png (${P.w}x${P.h}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  const anchors = {};
  for (const pose of Object.keys(POSES)) {
    const P = POSES[pose];
    const names = Object.keys(P.anchors);
    const pts = await page.evaluate(([P, pts]) => window.project(P, pts), [P, names.map((k) => P.anchors[k])]);
    anchors[pose] = { size: [P.w, P.h], pxPerMetre: P.h / (2 * 5.0 * Math.tan((P.fov * Math.PI) / 360)) };
    names.forEach((k, i) => (anchors[pose][k] = pts[i].map((v) => Math.round(v * 10) / 10)));
  }
  fs.writeFileSync(path.join(OUT, 'anchors.json'), JSON.stringify(anchors, null, 2) + '\n');
  console.log('wrote anchors.json');
  await browser.close();
})();
