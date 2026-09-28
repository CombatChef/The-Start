#!/usr/bin/env python3
"""
Builds the game's bitmap art from the reference images in assets/source/.

    pip install numpy opencv-python-headless pillow
    python3 tools/make_images.py

PORTRAITS (128x128, assets/portraits/). Each worker keeps the background they were
photographed against: nothing is cut out. The background is softened (blurred, and never
brighter than light grey) so the face reads first, then everything is posterized into four
tones, the black / grey / white look of the "Slasher Statistics" doc art. Red stays red
(Captain Jim's goggles, Mysti's beret and jacket). The game fades each portrait's edges into
an OMORI-style mood backdrop at runtime and draws the status effects on top, so only a few
source edits live here:

    mel_noglasses   - Mel after Toss Glasses (glasses painted out)
    john_asleep     - John during Nap (eyes closed)
    sid / sid_armed - Sid's card from the doc, with and without the Desert Eagle
    trollge         - Trollge's head, for the title screen

SPRITES (assets/sprites/). Trollge's battle sprite is his render, shrunk into dithered pixel
art. The head is a separate layer so the game can make it wobble on the skinny body.

Everything is also embedded in js/images.js as data URIs, so the game can read the pixels
even when index.html is opened straight from disk (file://).

Sources: lobby_npcs.webp (Mel and John), jim.png (Captain Jim), mysti.png (Bravo Team
Mysti), purpl.png (Purpl Lady, art by @Shouyou97), sid_card.png (the doc's Sid art),
trollge.webp (Trollge).
"""
import base64
import json
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'portraits')
SPRITES = os.path.join(ROOT, 'assets', 'sprites')
SIZE = 128

GRAY = [(0, 0, 0), (78, 78, 82), (158, 158, 162), (255, 255, 255)]
RED = [(0, 0, 0), (96, 0, 4), (228, 18, 24)]
REDS = [(116, 13, 21), (210, 30, 39)]  # accent: dark red, red
PURPLE = [(10, 4, 20), (62, 38, 96), (156, 128, 204), (248, 242, 255)]
# Sid's card is a cut-out (the doc art is red on black); the game recolours this ring.
RING = (255, 0, 255)

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 + 1 / 32


def load(name, mode='RGB'):
    im = np.asarray(Image.open(os.path.join(SRC, name)).convert(mode)).copy()
    if mode == 'RGB':
        return cv2.cvtColor(im, cv2.COLOR_RGB2BGR)
    return im


# ---------------------------------------------------------------- portraits
def focus_weight(W, focus, soft):
    """1 inside the ellipse around the character, fading to 0 over `soft` radii outside it."""
    cx, cy, rx, ry = focus
    yy, xx = np.mgrid[0:W, 0:W] / W
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    return np.clip((1 + soft - d) / soft, 0, 1), d <= 1


def poster(bgr, crop, pcts, focus, clahe=None, accent=None, cuts=None, work=4):
    """Crop, soften the background, and split into len(pcts)+1 tones chosen by percentile
    over the focus ellipse. Returns a SIZE x SIZE array of palette indexes.

    Pass `cuts` (poster.last_cuts from the original) so an edited variant keeps exactly the
    same shading. `accent(hsv)` returns masks that get extra palette entries after the greys.
    """
    x0, y0, x1, y1 = crop
    W = SIZE * work
    shrink = (x1 - x0) > W
    im = cv2.resize(bgr[y0:y1, x0:x1], (W, W), interpolation=cv2.INTER_AREA if shrink else cv2.INTER_CUBIC)
    for _ in range(2):
        im = cv2.bilateralFilter(im, 9, 50, 9)
    w, face = focus_weight(W, focus, 0.55)
    blurred = cv2.GaussianBlur(im, (0, 0), 9)
    im = (im * w[..., None] + blurred * (1 - w[..., None])).astype(np.uint8)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    if clahe:
        g = cv2.createCLAHE(clipLimit=clahe, tileGridSize=(3, 3)).apply(g)
    g = g.astype(float) / 255
    if cuts is None:
        cuts = np.percentile(g[face], pcts)
    poster.last_cuts = cuts
    levels = np.digitize(g, cuts)
    n = len(pcts) + 1
    levels[(w < 0.25) & (levels == n - 1)] = n - 2  # nothing behind them is brighter than light grey
    if accent is not None:
        for m in accent(cv2.cvtColor(im, cv2.COLOR_BGR2HSV)):
            levels[m] = n
            n += 1
    # Down to SIZE x SIZE by majority vote, so every output pixel is one clean tone.
    blocks = levels.reshape(SIZE, work, SIZE, work).transpose(0, 2, 1, 3).reshape(SIZE, SIZE, -1)
    counts = np.stack([(blocks == k).sum(-1) for k in range(n)], -1)
    return counts.argmax(-1)


def reds(min_s=110, min_v=0):
    def masks(hsv):
        h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
        red = ((h < 8) | (h > 170)) & (s > min_s) & (v > min_v)
        return [red & (v <= 130), red & (v > 130)]

    return masks


def save(levels, palette, name):
    rgb = np.array(palette, np.uint8)[levels]
    Image.fromarray(rgb).save(os.path.join(OUT, name + '.png'))
    print('wrote portraits/' + name + '.png')


def mel_and_john():
    bgr = load('lobby_npcs.webp')

    # ---- Mel: mannequin head, wire glasses, SlashCo coveralls.
    crop, pcts, focus = (245, 298, 435, 488), (28, 52, 78), (0.5, 0.42, 0.3, 0.42)
    head = np.zeros(bgr.shape[:2], np.uint8)  # only where the edits below may paint
    cv2.fillPoly(head, [np.array([(298, 300), (372, 300), (388, 330), (388, 385), (378, 410), (352, 434), (318, 432), (298, 408), (294, 360)], np.int32)], 255)
    band = np.zeros_like(head)
    cv2.rectangle(band, (288, 342), (392, 388), 255, -1)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # The wire frames are 1-2px thin in the source and would vanish at portrait size:
    # find them and draw them back in a little bolder.
    frames = np.where((gray < 130) & (band > 0) & (head > 0), 255, 0).astype(np.uint8)
    specs = bgr.copy()
    specs[cv2.dilate(frames, np.ones((3, 3), np.uint8)) > 0] = (12, 12, 14)
    save(poster(specs, crop, pcts, focus, clahe=1.6), GRAY, 'mel')
    cuts = poster.last_cuts

    # Toss Glasses: rebuild the band the glasses sit in by blending the head's colour from
    # just above to just below it (the mannequin head is smooth), then paint out any frame
    # pixels left at the edges.
    bare = bgr.copy()
    y0, y1 = 345, 385
    for x in range(290, 390):
        if head[y0 - 1, x] and head[y1 + 1, x]:
            top = bgr[y0 - 1, x].astype(float)
            bottom = bgr[y1 + 1, x].astype(float)
            for y in range(y0, y1 + 1):
                t = (y - y0) / (y1 - y0)
                bare[y, x] = (top * (1 - t) + bottom * t).astype(np.uint8)
    left = np.where((cv2.cvtColor(bare, cv2.COLOR_BGR2GRAY) < 130) & (band > 0) & (head > 0), 255, 0).astype(np.uint8)
    bare = cv2.inpaint(bare, cv2.dilate(left, np.ones((3, 3), np.uint8)), 5, cv2.INPAINT_TELEA)
    save(poster(bare, crop, pcts, focus, clahe=1.6, cuts=cuts), GRAY, 'mel_noglasses')

    # ---- John: backwards cap, SlashCo coveralls.
    crop, pcts, focus = (795, 322, 990, 517), (28, 52, 76), (0.5, 0.42, 0.3, 0.42)
    save(poster(bgr, crop, pcts, focus, clahe=1.5), GRAY, 'john')
    cuts = poster.last_cuts

    # Nap: paint the open eyes over with the surrounding skin, then draw closed lids.
    asleep = bgr.copy()
    eyes = np.zeros(bgr.shape[:2], np.uint8)
    for (cx, cy, ang) in ((887, 389, 12), (919, 398, 14)):
        cv2.ellipse(eyes, (cx, cy), (8, 4), ang, 0, 360, 255, -1)
    asleep = cv2.inpaint(asleep, eyes, 5, cv2.INPAINT_TELEA)
    for (cx, cy, ang) in ((887, 389, 12), (919, 398, 14)):
        cv2.ellipse(asleep, (cx, cy), (7, 3), ang, 0, 180, (22, 26, 34), 2, cv2.LINE_AA)
    save(poster(asleep, crop, pcts, focus, clahe=1.5, cuts=cuts), GRAY, 'john_asleep')


def jim():
    bgr = load('jim.png')
    save(poster(bgr, (122, 46, 402, 326), (30, 56, 82), (0.5, 0.5, 0.34, 0.44), clahe=1.8, accent=reds(120, 70)), GRAY + REDS, 'jim')


def mysti():
    # Bravo Team Mysti: red beret with the skull badge, white mask, white hair with a red streak.
    bgr = load('mysti.png')
    save(poster(bgr, (315, 20, 675, 380), (30, 56, 82), (0.5, 0.55, 0.3, 0.42), clahe=2.0, accent=reds()), GRAY + REDS, 'mysti')


def purpl():
    # Not in the default party (Mysti took her place), but still playable from data.js.
    bgr = load('purpl.png')
    save(poster(bgr, (62, 50, 232, 220), (38, 62, 84), (0.5, 0.45, 0.32, 0.42), clahe=1.2), PURPLE, 'purpl')


def sid():
    bgr = load('sid_card.png')
    red = bgr[..., 2].astype(np.uint8)
    # The doc art is red-on-black inside a red frame: drop the frame, keep the figure.
    m = np.where(red > 90, 255, 0).astype(np.uint8)
    m[:14, :] = 0
    m[-14:, :] = 0
    m[:, :14] = 0
    m[:, -14:] = 0
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    x0, y0, x1, y1 = 46, 12, 238, 204
    for name, drop_gun in (('sid_armed', False), ('sid', True)):
        img = bgr.copy()
        mask = m.copy()
        if drop_gun:
            gun = np.array([(170, 118), (240, 140), (240, 182), (188, 182), (168, 152)], np.int32)
            cv2.fillPoly(mask, [gun], 0)
            cv2.fillPoly(img, [gun], (0, 0, 0))
        im = cv2.resize(img[y0:y1, x0:x1], (SIZE * 4, SIZE * 4), interpolation=cv2.INTER_CUBIC)
        a = cv2.resize(mask[y0:y1, x0:x1], (SIZE * 4, SIZE * 4), interpolation=cv2.INTER_LINEAR) > 127
        for _ in range(2):
            im = cv2.bilateralFilter(im, 5, 30, 5)
        g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(float) / 255
        levels = np.digitize(g, np.percentile(g[a], (18, 55)))
        blocks = levels.reshape(SIZE, 4, SIZE, 4).transpose(0, 2, 1, 3).reshape(SIZE, SIZE, -1)
        levels = np.stack([(blocks == k).sum(-1) for k in range(3)], -1).argmax(-1)
        inside = a.reshape(SIZE, 4, SIZE, 4).transpose(0, 2, 1, 3).reshape(SIZE, SIZE, -1).mean(-1) > 0.5
        rgba = np.zeros((SIZE, SIZE, 4), np.uint8)
        ring = (cv2.dilate(inside.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~inside
        rgba[ring] = RING + (255,)
        rgba[inside, :3] = np.array(RED, np.uint8)[levels[inside]]
        rgba[inside, 3] = 255
        Image.fromarray(rgba).save(os.path.join(OUT, name + '.png'))
        print('wrote portraits/' + name + '.png')


# ---------------------------------------------------------------- Trollge
def hexes(lst):
    return np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in lst], float)


# Near-black purples for the stick body, lavender gloss and a pink rim on the face, white teeth.
TROLL = hexes(['#040207', '#0d0612', '#170b1e', '#23112d', '#321a40', '#4a2a5c', '#6b4585', '#9474b3',
               '#c3a9e0', '#ede2ff', '#ffffff', '#6e1d4e', '#b33d86', '#e57dbe'])
TROLL_OUTLINE = (4, 2, 7, 255)


def to_lab(rgb):
    x = np.clip(rgb, 0, 255).astype(np.uint8).reshape(-1, 1, 3)
    return cv2.cvtColor(x, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(float)


def dither(rgb, pal):
    """Nearest palette colour, with ordered (Bayer) dithering between the two closest ones
    where they are near neighbours, like the rest of the game's pixel art."""
    H, W, _ = rgb.shape
    L = to_lab(rgb.reshape(-1, 3))
    P = to_lab(pal)
    d = ((L[:, None, :] - P[None, :, :]) ** 2).sum(-1)
    order = np.argsort(d, 1)
    i1, i2 = order[:, 0], order[:, 1]
    d1 = np.sqrt(d[np.arange(len(d)), i1])
    d2 = np.sqrt(d[np.arange(len(d)), i2])
    t = d1 / np.maximum(1e-6, d1 + d2)
    yy, xx = np.mgrid[0:H, 0:W]
    thr = BAYER4[yy % 4, xx % 4].reshape(-1)
    pick = np.where(t > thr * 0.5 + 0.25, i2, i1)
    pick = np.where(d2 > (d1 + 1) * 9, i1, pick)
    return pick.reshape(H, W)


def shrink(rgba, s, box):
    """Area-average (alpha-premultiplied) down by `s`, then map onto the palette."""
    x0, y0, x1, y1 = box
    src = rgba[y0:y1, x0:x1]
    w, h = int(round((x1 - x0) * s)), int(round((y1 - y0) * s))
    a = src[..., 3].astype(float) / 255
    col = cv2.resize(src[..., :3].astype(float) * a[..., None], (w, h), interpolation=cv2.INTER_AREA)
    a = cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA)
    col /= np.maximum(a[..., None], 1e-4)
    return np.where(a > 0.33, dither(col, TROLL), -1)


def outlined(idx):
    """Palette indexes -> RGBA with a 1px margin holding a dark outline."""
    H, W = idx.shape
    full = np.full((H + 2, W + 2), -1, int)
    full[1:-1, 1:-1] = idx
    solid = full >= 0
    out = np.zeros((H + 2, W + 2, 4), np.uint8)
    out[solid, :3] = TROLL[full[solid]].astype(np.uint8)
    out[solid, 3] = 255
    out[(cv2.dilate(solid.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~solid] = TROLL_OUTLINE
    return out


def trollge():
    im = load('trollge.webp', 'RGBA')
    rgb = im[..., :3]
    for _ in range(2):
        rgb = cv2.bilateralFilter(rgb, 9, 40, 9)
    a = im[..., 3]
    # Lift the shadows a touch so the near-black body still reads against the hallway.
    rgb = (255 * (rgb.astype(float) / 255) ** 0.8).astype(np.uint8)
    base = np.dstack([rgb, a])
    # The head is the only thick part: opening the silhouette with a big disc erases the
    # stick limbs and leaves it.
    fig = (a > 100).astype(np.uint8)
    opened = cv2.morphologyEx(fig, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61)))
    _, lab, stats, _ = cv2.connectedComponentsWithStats(opened)
    head = cv2.dilate((lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0

    scale, head_scale, pad = 0.18, 0.225, 4  # the head is drawn a little larger: it is heavy
    ys, xs = np.where(a > 20)
    X0, Y0 = xs.min(), ys.min()
    body = base.copy()
    body[head, 3] = 0
    b = shrink(body, scale, (X0, Y0, xs.max() + 1, ys.max() + 1))
    hy, hx = np.where(head & (a > 20))
    HX, HY = hx.min(), hy.min()
    h = shrink(base * head[..., None], head_scale, (HX, HY, hx.max() + 1, hy.max() + 1))

    # Place the head so the neck stays put, growing the canvas if the head sticks out.
    neck = np.array([690.0, 398.0])
    head_at = np.round((neck - [X0, Y0]) * scale + pad - (neck - [HX, HY]) * head_scale).astype(int)
    grow = np.maximum(0, 2 - head_at)
    H, W = b.shape
    canvas = np.full((H + pad * 2 + grow[1], W + pad * 2 + grow[0]), -1, int)
    canvas[pad + grow[1]:pad + grow[1] + H, pad + grow[0]:pad + grow[0] + W] = b
    head_at += grow

    # Anchor points for the game (+1 for the outline margin added by outlined()).
    on_body = lambda p: [int(v) + 1 for v in np.round((np.array(p, float) - [X0, Y0]) * scale + pad + grow)]
    on_head = lambda p: [int(v) + 1 for v in np.round((np.array(p, float) - [HX, HY]) * head_scale)]
    body_img, head_img = outlined(canvas), outlined(h)
    meta = {
        'headAt': [int(v) for v in head_at],  # where head.png's top-left goes on body.png
        'pivot': on_body(neck),  # the head wobbles around this point
        'eyes': [on_head((484, 189)), on_head((576, 116))],  # on head.png
        'mouth': on_head((600, 290)),
        'face': on_body((565, 205)),
        'clawL': on_body((190, 760)),
        'clawR': on_body((1250, 560)),
        'chest': on_body((700, 560)),
        'feet': on_body((700, 1070)),
    }
    os.makedirs(SPRITES, exist_ok=True)
    Image.fromarray(body_img).save(os.path.join(SPRITES, 'trollge_body.png'))
    Image.fromarray(head_img).save(os.path.join(SPRITES, 'trollge_head.png'))
    print('wrote sprites/trollge_body.png', body_img.shape[1], 'x', body_img.shape[0])
    print('wrote sprites/trollge_head.png', head_img.shape[1], 'x', head_img.shape[0])

    # Title-screen card: just the head, a little bigger, with its eyes lit.
    s = 118 / max(hx.max() + 1 - HX, hy.max() + 1 - HY)
    card = outlined(shrink(base * head[..., None], s, (HX, HY, hx.max() + 1, hy.max() + 1)))
    out = np.zeros((SIZE, SIZE, 4), np.uint8)
    ch, cw = card.shape[:2]
    ox, oy = (SIZE - cw) // 2, (SIZE - ch) // 2 + 2
    out[oy:oy + ch, ox:ox + cw] = card
    for ex, ey in ((484, 189), (576, 116)):
        x, y = int(round((ex - HX) * s)) + 1 + ox, int(round((ey - HY) * s)) + 1 + oy
        out[y:y + 2, x:x + 2] = (255, 255, 255, 255)
    Image.fromarray(out).save(os.path.join(OUT, 'trollge.png'))
    print('wrote portraits/trollge.png')
    return meta


def uri(path):
    with open(path, 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')


def bundle(troll_meta):
    lines = [
        '/* Generated by tools/make_images.py — do not edit by hand. */',
        '(function (root) {',
        "  'use strict';",
        '  const SC = (root.SC = root.SC || {});',
        '  SC.PORTRAITS = {',
    ]
    for name in sorted(os.listdir(OUT)):
        if name.endswith('.png'):
            lines.append(f"    {name[:-4]}: '{uri(os.path.join(OUT, name))}',")
    lines += ['  };', '  SC.SPRITES = {', '    trollge: {']
    lines.append(f"      body: '{uri(os.path.join(SPRITES, 'trollge_body.png'))}',")
    lines.append(f"      head: '{uri(os.path.join(SPRITES, 'trollge_head.png'))}',")
    for k, v in troll_meta.items():
        lines.append(f'      {k}: {json.dumps(v)},')
    lines += ['    },', '  };', "})(typeof window !== 'undefined' ? window : globalThis);", '']
    with open(os.path.join(ROOT, 'js', 'images.js'), 'w') as f:
        f.write('\n'.join(lines))
    print('wrote js/images.js')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    mel_and_john()
    jim()
    mysti()
    purpl()
    sid()
    bundle(trollge())
