#!/usr/bin/env python3
"""
Builds the OMORI-style battle portraits from the reference images in assets/source/.

    pip install numpy opencv-python-headless pillow
    python3 tools/make_portraits.py

Each portrait is cut out of its background, smoothed into flat areas, and posterized
into four tones (the black / grey / white look of the "Slasher Statistics" doc art),
then saved as a 128x128 PNG with a transparent background and a one-pixel outline in
the marker colour RING.
The game draws the coloured backdrop and status effects (sweat, blood, cracks...) on
top at runtime, so only a handful of source edits live here:

    mel_noglasses  - Mel after Toss Glasses (glasses painted out)
    john_asleep    - John during Nap (eyes closed)
    sid / sid_armed - Sid's card, with and without the Desert Eagle
"""
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'portraits')
SIZE = 128

GRAY = [(0, 0, 0), (78, 78, 82), (158, 158, 162), (255, 255, 255)]
PURPLE = [(10, 4, 20), (62, 38, 96), (156, 128, 204), (248, 242, 255)]
RED = [(0, 0, 0), (96, 0, 4), (228, 18, 24)]
# The outline ring is written in this marker colour; the game repaints it to suit the
# backdrop behind the portrait (light on dark backdrops, dark on light ones).
RING = (255, 0, 255)


def load(name):
    im = np.asarray(Image.open(os.path.join(SRC, name)).convert('RGBA'))
    return cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2BGR), im[..., 3].copy()


def smooth_mask(m, k=9):
    return np.where(cv2.GaussianBlur(m, (k, k), 0) > 127, 255, 0).astype(np.uint8)


def posterize(bgr, alpha, crop, pcts, clahe=None, work=4, bilateral=(9, 50, 9), cuts=None):
    """Crop, flatten, and split into len(pcts)+1 tone levels chosen by percentile.

    Pass `cuts` (returned as posterize.last_cuts) to reuse another image's tone split,
    so an edited variant keeps exactly the same shading as the original.
    """
    x0, y0, x1, y1 = crop
    im = cv2.resize(bgr[y0:y1, x0:x1], (SIZE * work, SIZE * work), interpolation=cv2.INTER_CUBIC)
    a = cv2.resize(alpha[y0:y1, x0:x1], (SIZE * work, SIZE * work), interpolation=cv2.INTER_LINEAR)
    for _ in range(2):
        im = cv2.bilateralFilter(im, *bilateral)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    if clahe:
        g = cv2.createCLAHE(clipLimit=clahe, tileGridSize=(3, 3)).apply(g)
    g = g.astype(float) / 255
    inside = a > 127
    if cuts is None:
        cuts = np.percentile(g[inside], pcts)
    posterize.last_cuts = cuts
    levels = np.digitize(g, cuts)
    # Down to SIZE x SIZE by majority vote, so every output pixel is one clean tone.
    blocks = levels.reshape(SIZE, work, SIZE, work).transpose(0, 2, 1, 3).reshape(SIZE, SIZE, -1)
    counts = np.stack([(blocks == k).sum(-1) for k in range(len(pcts) + 1)], -1)
    amask = inside.reshape(SIZE, work, SIZE, work).transpose(0, 2, 1, 3).reshape(SIZE, SIZE, -1).mean(-1) > 0.5
    return counts.argmax(-1), amask


def save(levels, inside, palette, name):
    rgba = np.zeros((SIZE, SIZE, 4), np.uint8)
    ring = (cv2.dilate(inside.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~inside
    rgba[ring] = RING + (255,)
    pal = np.array(palette, np.uint8)
    rgba[inside, :3] = pal[levels[inside]]
    rgba[inside, 3] = 255
    Image.fromarray(rgba).save(os.path.join(OUT, name + '.png'))
    print('wrote', name + '.png')


def john():
    bgr, _ = load('john.png')
    m = np.zeros(bgr.shape[:2], np.uint8)
    cv2.ellipse(m, (116, 58), (27, 47), 0, 0, 360, 255, -1)
    cv2.fillPoly(m, [np.array([(92, 70), (141, 70), (136, 100), (118, 113), (99, 103)], np.int32)], 255)
    cv2.rectangle(m, (101, 95), (129, 130), 255, -1)
    cv2.fillPoly(m, [np.array([(50, 136), (76, 114), (101, 109), (129, 109), (160, 114), (184, 136), (184, 160), (50, 160)], np.int32)], 255)
    m = smooth_mask(m)
    crop = (62, 6, 170, 114)
    pcts = (30, 55, 80)
    save(*posterize(bgr, m, crop, pcts, clahe=2.0), GRAY, 'john')
    cuts = posterize.last_cuts

    # Nap: paint over the open eyes with the surrounding skin, then draw closed lids.
    asleep = bgr.copy()
    eyes = np.zeros(bgr.shape[:2], np.uint8)
    for cx in (103, 124):
        cv2.ellipse(eyes, (cx, 65), (6, 3), 0, 0, 360, 255, -1)
    asleep = cv2.inpaint(asleep, eyes, 4, cv2.INPAINT_TELEA)
    for cx in (103, 124):
        cv2.ellipse(asleep, (cx, 64), (6, 3), 0, 0, 180, (12, 14, 18), 2, cv2.LINE_AA)
    save(*posterize(asleep, m, crop, pcts, clahe=2.0, cuts=cuts), GRAY, 'john_asleep')


def mel():
    bgr, _ = load('mel.png')
    m = smooth_mask(np.asarray(Image.open(os.path.join(SRC, 'mel_mask.png')).convert('L')).copy())
    crop = (58, 0, 208, 150)
    pcts = (25, 50, 78)
    save(*posterize(bgr, m, crop, pcts), GRAY, 'mel')
    cuts = posterize.last_cuts

    # Toss Glasses: rebuild the band the glasses sit in by blending the head's colour
    # from just above to just below it (the mannequin head is smooth), then clean up
    # any frame pixels left at the edges.
    bare = bgr.copy()
    y0, y1 = 36, 78
    for x in range(84, 176):
        if m[y0 - 1, x] and m[y1 + 1, x]:
            top = bgr[y0 - 1, x].astype(float)
            bottom = bgr[y1 + 1, x].astype(float)
            for y in range(y0, y1 + 1):
                if m[y, x]:
                    t = (y - y0) / (y1 - y0)
                    bare[y, x] = (top * (1 - t) + bottom * t).astype(np.uint8)
    gray = cv2.cvtColor(bare, cv2.COLOR_BGR2GRAY)
    region = np.zeros_like(gray)
    cv2.rectangle(region, (84, 36), (180, 78), 255, -1)
    frames = np.where((gray < 125) & (region > 0) & (m > 0), 255, 0).astype(np.uint8)
    bare = cv2.inpaint(bare, cv2.dilate(frames, np.ones((3, 3), np.uint8)), 5, cv2.INPAINT_TELEA)
    save(*posterize(bare, m, crop, pcts, cuts=cuts), GRAY, 'mel_noglasses')


def purpl():
    bgr, alpha = load('purpl.webp')
    save(*posterize(bgr, alpha, (222, 58, 342, 178), (40, 66, 86), clahe=1.5), PURPLE, 'purpl')


def sid():
    bgr, _ = load('sid_card.png')
    red = bgr[..., 2].astype(np.uint8)
    # The doc art is red-on-black inside a red frame: drop the frame, keep the figure.
    m = np.where(red > 90, 255, 0).astype(np.uint8)
    m[:14, :] = 0
    m[-14:, :] = 0
    m[:, :14] = 0
    m[:, -14:] = 0
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    crop = (46, 12, 238, 204)
    for name, drop_gun in (('sid_armed', False), ('sid', True)):
        img = bgr.copy()
        mask = m.copy()
        if drop_gun:
            gun = np.array([(170, 118), (240, 140), (240, 182), (188, 182), (168, 152)], np.int32)
            cv2.fillPoly(mask, [gun], 0)
            cv2.fillPoly(img, [gun], (0, 0, 0))
        levels, inside = posterize(img, mask, crop, (18, 55), bilateral=(5, 30, 5))
        save(levels, inside, RED, name)


def bundle():
    """Also embed every portrait in js/portraits.js as data URIs, so the game can read
    their pixels even when index.html is opened straight from disk (file://)."""
    import base64

    lines = [
        '/* Generated by tools/make_portraits.py — do not edit by hand. */',
        '(function (root) {',
        "  'use strict';",
        '  const SC = (root.SC = root.SC || {});',
        '  SC.PORTRAITS = {',
    ]
    for name in sorted(os.listdir(OUT)):
        if not name.endswith('.png'):
            continue
        with open(os.path.join(OUT, name), 'rb') as f:
            data = base64.b64encode(f.read()).decode('ascii')
        lines.append(f"    {name[:-4]}: 'data:image/png;base64,{data}',")
    lines += ['  };', "})(typeof window !== 'undefined' ? window : globalThis);", '']
    with open(os.path.join(ROOT, 'js', 'portraits.js'), 'w') as f:
        f.write('\n'.join(lines))
    print('wrote js/portraits.js')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    john()
    mel()
    purpl()
    sid()
    bundle()
