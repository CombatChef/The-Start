#!/usr/bin/env python3
"""
Builds the OMORI-style battle portraits from the reference images in assets/source/.

    pip install numpy opencv-python-headless pillow
    python3 tools/make_portraits.py

Each portrait is cut out of its background (GrabCut, steered by a few hand-placed
"definitely character" / "definitely background" shapes), smoothed into flat areas,
and posterized into four tones (the black / grey / white look of the "Slasher
Statistics" doc art). It is saved as a 128x128 PNG with a transparent background and a
one-pixel outline in the marker colour RING. The game draws the coloured backdrop and
status effects (sweat, blood, cracks...) on top at runtime, so only a few source edits
live here:

    mel_noglasses   - Mel after Toss Glasses (glasses painted out)
    john_asleep     - John during Nap (eyes closed)
    sid / sid_armed - Sid's card from the doc, with and without the Desert Eagle

Sources: lobby_npcs.webp (Mel and John), purpl.png (Purpl Lady, art by @Shouyou97),
jim.png (Captain Jim), sid_card.png (the doc's Sid art).
"""
import base64
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
ACCENT_RED = (214, 28, 38)
# The outline ring is written in this marker colour; the game repaints it to suit the
# backdrop behind the portrait (light on dark backdrops, dark on light ones).
RING = (255, 0, 255)


def load(name):
    im = np.asarray(Image.open(os.path.join(SRC, name)).convert('RGBA'))
    return cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2BGR), im[..., 3].copy()


def smooth_mask(m, k=9):
    return np.where(cv2.GaussianBlur(m, (k, k), 0) > 127, 255, 0).astype(np.uint8)


def grabcut(img, rect, keep=(), drop=(), iters=8):
    """Cut the character out of `img`. `keep`/`drop` are polygons that are certainly
    character / certainly background."""
    mask = np.zeros(img.shape[:2], np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, rect, bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)
    for poly in keep:
        cv2.fillPoly(mask, [np.array(poly, np.int32)], cv2.GC_FGD)
    for poly in drop:
        cv2.fillPoly(mask, [np.array(poly, np.int32)], cv2.GC_BGD)
    if keep or drop:
        cv2.grabCut(img, mask, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    m = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return smooth_mask(m, 7)


def posterize(bgr, alpha, crop, pcts, clahe=None, work=4, bilateral=(9, 50, 9), cuts=None, accent=None):
    """Crop, flatten, and split into len(pcts)+1 tone levels chosen by percentile.

    Pass `cuts` (returned as posterize.last_cuts) to reuse another image's tone split,
    so an edited variant keeps exactly the same shading as the original. `accent` is a
    function (hsv image) -> bool mask of pixels that get the extra accent colour.
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
    n = len(pcts) + 1
    if accent is not None:
        levels[accent(cv2.cvtColor(im, cv2.COLOR_BGR2HSV)) & inside] = n
        n += 1
    # Down to SIZE x SIZE by majority vote, so every output pixel is one clean tone.
    blocks = levels.reshape(SIZE, work, SIZE, work).transpose(0, 2, 1, 3).reshape(SIZE, SIZE, -1)
    counts = np.stack([(blocks == k).sum(-1) for k in range(n)], -1)
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


def mel_and_john():
    bgr, _ = load('lobby_npcs.webp')
    label = [(180, 250), (1080, 250), (1080, 300), (180, 300)]  # the "[ NAME SLASHCO ]" captions

    # ---- Mel: mannequin head, wire glasses, SlashCo coveralls.
    face = [(300, 304), (365, 304), (380, 340), (377, 400), (350, 438), (306, 428), (297, 380)]
    body = [(250, 470), (330, 447), (420, 452), (470, 480), (470, 560), (240, 560)]
    wall = [(200, 300), (296, 300), (292, 420), (240, 460), (200, 460)]
    poster = [(430, 300), (520, 300), (520, 430), (420, 430), (392, 330)]
    m = grabcut(bgr, (220, 296, 280, 264), keep=[face, body], drop=[label, wall, poster])
    crop = (240, 292, 440, 492)
    pcts = (22, 45, 70)
    # The wire frames are 1-2px thin in the source and would vanish at portrait size:
    # find them and draw them back in a little bolder.
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    band = np.zeros_like(gray)
    cv2.rectangle(band, (288, 342), (392, 388), 255, -1)
    frames = np.where((gray < 130) & (band > 0) & (m > 0), 255, 0).astype(np.uint8)
    specs = bgr.copy()
    specs[cv2.dilate(frames, np.ones((3, 3), np.uint8)) > 0] = (12, 12, 14)
    save(*posterize(specs, m, crop, pcts, clahe=1.6), GRAY, 'mel')
    cuts = posterize.last_cuts

    # Toss Glasses: rebuild the band the glasses sit in by blending the head's colour
    # from just above to just below it (the mannequin head is smooth), then paint out
    # any frame pixels left at the edges.
    bare = bgr.copy()
    y0, y1 = 345, 385
    for x in range(290, 390):
        if m[y0 - 1, x] and m[y1 + 1, x]:
            top = bgr[y0 - 1, x].astype(float)
            bottom = bgr[y1 + 1, x].astype(float)
            for y in range(y0, y1 + 1):
                if m[y, x]:
                    t = (y - y0) / (y1 - y0)
                    bare[y, x] = (top * (1 - t) + bottom * t).astype(np.uint8)
    left = np.where((cv2.cvtColor(bare, cv2.COLOR_BGR2GRAY) < 130) & (band > 0) & (m > 0), 255, 0).astype(np.uint8)
    bare = cv2.inpaint(bare, cv2.dilate(left, np.ones((3, 3), np.uint8)), 5, cv2.INPAINT_TELEA)
    save(*posterize(bare, m, crop, pcts, clahe=1.6, cuts=cuts), GRAY, 'mel_noglasses')

    # ---- John: backwards cap, SlashCo coveralls.
    face = [(855, 345), (930, 345), (940, 400), (925, 445), (880, 455), (850, 420), (845, 380)]
    body = [(800, 482), (870, 467), (960, 472), (1000, 502), (1000, 580), (790, 580)]
    poster_left = [(770, 330), (842, 330), (838, 440), (770, 440)]
    poster_right = [(944, 330), (1000, 330), (1000, 455), (948, 440)]
    m = grabcut(bgr, (770, 325, 260, 255), keep=[face, body], drop=[label, poster_left, poster_right])
    crop = (792, 318, 992, 518)
    pcts = (25, 50, 76)
    save(*posterize(bgr, m, crop, pcts, clahe=1.5), GRAY, 'john')
    cuts = posterize.last_cuts

    # Nap: paint the open eyes over with the surrounding skin, then draw closed lids.
    asleep = bgr.copy()
    eyes = np.zeros(bgr.shape[:2], np.uint8)
    for (cx, cy, ang) in ((887, 389, 12), (919, 398, 14)):
        cv2.ellipse(eyes, (cx, cy), (8, 4), ang, 0, 360, 255, -1)
    asleep = cv2.inpaint(asleep, eyes, 5, cv2.INPAINT_TELEA)
    for (cx, cy, ang) in ((887, 389, 12), (919, 398, 14)):
        cv2.ellipse(asleep, (cx, cy), (7, 3), ang, 0, 180, (22, 26, 34), 2, cv2.LINE_AA)
    save(*posterize(asleep, m, crop, pcts, clahe=1.5, cuts=cuts), GRAY, 'john_asleep')


def purpl():
    bgr, _ = load('purpl.png')
    face = [(110, 70), (190, 70), (190, 170), (110, 170)]
    skull = [(215, 130), (262, 130), (262, 178), (215, 178)]
    m = grabcut(bgr, (20, 0, 280, 330), keep=[face], drop=[skull])
    save(*posterize(bgr, m, (62, 50, 232, 220), (38, 62, 84), clahe=1.2), PURPLE, 'purpl')


def jim():
    bgr, _ = load('jim.png')
    face = [(200, 140), (320, 140), (330, 220), (300, 285), (230, 285), (195, 230)]
    body = [(150, 340), (380, 340), (420, 500), (110, 500)]
    m = grabcut(bgr, (100, 35, 340, 465), keep=[face, body])

    def goggles(hsv):
        h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
        return ((h < 8) | (h > 170)) & (s > 120) & (v > 70)

    save(*posterize(bgr, m, (122, 46, 402, 326), (30, 56, 82), clahe=1.8, accent=goggles), GRAY + [ACCENT_RED], 'jim')


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
    mel_and_john()
    purpl()
    jim()
    sid()
    bundle()
