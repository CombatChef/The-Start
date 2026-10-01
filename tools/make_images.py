#!/usr/bin/env python3
"""
Builds the game's bitmap art from the reference images in assets/source/.

    pip install numpy opencv-python-headless pillow
    python3 tools/make_images.py

PORTRAITS (128x128, assets/portraits/). Each worker keeps the background they were
photographed against: nothing is cut out. The background is softened (blurred, and never
brighter than light grey) so the face reads first, then everything is posterized into four
tones, the black / grey / white look of the "Slasher Statistics" doc art. Red stays red
(Captain Jim's goggles, Mysti's beret and jacket) and violet stays violet (Purpl Lady's hair).
The game fades each portrait's edges into a dark backdrop at runtime and draws the status
effects on top, so only a few source edits live here:

    mel_noglasses   - Mel after Toss Glasses (glasses painted out)
    john_asleep     - John during Nap (eyes closed)
    sid / sid_armed - Sid's card from the doc, with and without the Desert Eagle
    trollge         - Trollge's head, for the title screen

SPRITES (assets/sprites/). Trollge's battle sprite is his render, shrunk into dithered pixel
art. The head is a separate layer so the game can make it wobble on the skinny body. Sid's are
green-screen renders of his model, front and back, with and without the Desert Eagle, made the
same way; the gun is a layer of its own so it can twirl and kick.

Everything is also embedded in js/images.js as data URIs, so the game can read the pixels
even when index.html is opened straight from disk (file://).

Sources: lobby_npcs.webp (Mel and John), jim.png (Captain Jim), mysti.png (Bravo Team
Mysti), purpl.webp (Purpl Lady), sid_card.png (the doc's Sid art), sid_front.webp,
sid_front_gun.webp, sid_back.webp and sid_back_gun.webp (Sid's model), trollge.webp (Trollge),
dolphin.webp and dolphin_wail.webp (Dolphin Man).
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
VIOLETS = [(84, 38, 140), (170, 96, 255)]  # accent: Purpl Lady's hair streaks and eye
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


def purples(min_s=120, min_v=110):
    """Masks for the vivid violet in Purpl Lady's hair and eye, but not the navy shading."""

    def masks(hsv):
        h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
        violet = (h >= 120) & (h <= 160) & (s > min_s) & (v > min_v)
        return [violet & (v <= 190), violet & (v > 190)]

    return masks


def purpl():
    # Purpl Lady: black hair with violet streaks, glasses, one violet eye. She sits on the bench
    # by default and can swap in for anyone on the title screen.
    bgr = load('purpl.webp')
    # Her whole head, the hand at her glasses and her shoulders, not just the face.
    crop, pcts, focus = (150, 24, 550, 424), (28, 54, 80), (0.49, 0.58, 0.42, 0.5)
    save(poster(bgr, crop, pcts, focus, clahe=1.4, accent=purples()), GRAY + VIOLETS, 'purpl')


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


def shrink(rgba, s, box, pal=None):
    """Area-average (alpha-premultiplied) down by `s`, then map onto the palette."""
    pal = TROLL if pal is None else pal
    x0, y0, x1, y1 = box
    src = rgba[y0:y1, x0:x1]
    w, h = int(round((x1 - x0) * s)), int(round((y1 - y0) * s))
    a = src[..., 3].astype(float) / 255
    col = cv2.resize(src[..., :3].astype(float) * a[..., None], (w, h), interpolation=cv2.INTER_AREA)
    a = cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA)
    col /= np.maximum(a[..., None], 1e-4)
    return np.where(a > 0.33, dither(col, pal), -1)


def outlined(idx, pal=None, line=None):
    """Palette indexes -> RGBA with a 1px margin holding a dark outline."""
    pal = TROLL if pal is None else pal
    line = TROLL_OUTLINE if line is None else line
    H, W = idx.shape
    full = np.full((H + 2, W + 2), -1, int)
    full[1:-1, 1:-1] = idx
    solid = full >= 0
    out = np.zeros((H + 2, W + 2, 4), np.uint8)
    out[solid, :3] = pal[full[solid]].astype(np.uint8)
    out[solid, 3] = 255
    out[(cv2.dilate(solid.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~solid] = line
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


# Dolphin Man: blue-grey dolphin skin from near-black to pale, the white of his belly, and the
# reds of his open mouth.
DOLPH = hexes(['#05070a', '#10141b', '#1b212b', '#272e3b', '#343c4b', '#444d5e', '#586274', '#707a8c', '#8e97a7',
               '#b1b8c4', '#d3d8df', '#eef1f4', '#ffffff', '#3a0a0e', '#6e1419', '#a3272c', '#d0585a'])
DOLPH_OUTLINE = (2, 3, 5, 255)
# His skin, dark to light, for the parts that are drawn (sampled from his arms).
DOLPH_SKIN = np.array([(6, 8, 11), (16, 20, 27), (30, 35, 45), (48, 55, 68), (74, 82, 98)], float)
DOLPH_BELLY = np.array([(96, 100, 108), (160, 165, 174), (212, 216, 224)], float)


def dolphin():
    """Dolphin Man, from two small screenshots: dolphin.webp (standing, cut off at the thighs)
    and dolphin_wail.webp (his mouth wide open). His head, torso and arms are cut out of the
    first; the second gives the wailing head, and his title card as a full frame. His legs and
    his fetal position aren't in either picture, so they are drawn here in his colours and
    dithered the same way."""
    S = 4  # work at 4x the screenshots' size
    cv2.setRNGSeed(7)
    rng = np.random.default_rng(3)
    Hs, Ws = load('dolphin.webp').shape[:2]
    big_bgr = cv2.resize(load('dolphin.webp'), (Ws * S, Hs * S), interpolation=cv2.INTER_CUBIC)
    big = big_bgr[..., ::-1].astype(float)

    def at(pts):
        return np.array([(x * S, y * S) for x, y in pts], np.int32)

    # ---- cut him out: a rough outline, refined by GrabCut, then minus the olive-grey wall
    outline = [(172, 70), (182, 72), (190, 82), (192, 96), (191, 110), (186, 117), (196, 121), (208, 126), (214, 134), (216, 148),
               (220, 162), (224, 178), (226, 195), (227, 210), (224, 218), (218, 220), (212, 212), (210, 196), (207, 180), (203, 165),
               (200, 172), (199, 195), (199, 221), (150, 221), (149, 195), (148, 172), (145, 165), (141, 180), (137, 196), (133, 210),
               (126, 218), (116, 216), (114, 205), (118, 190), (124, 172), (128, 155), (132, 140), (137, 128), (147, 122), (159, 118),
               (155, 110), (153, 96), (156, 82), (163, 73)]
    gc = np.full(big.shape[:2], cv2.GC_BGD, np.uint8)
    cv2.fillPoly(gc, [at(outline)], cv2.GC_PR_FGD)
    gc[cv2.erode((gc == cv2.GC_PR_FGD).astype(np.uint8), np.ones((31, 31), np.uint8)) > 0] = cv2.GC_FGD
    cv2.grabCut(big_bgr, gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    fig = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
    r, g, b = big[..., 0], big[..., 1], big[..., 2]
    wall = (g - b > 2) & (0.3 * r + 0.59 * g + 0.11 * b < 185)
    wall = cv2.morphologyEx(wall.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    fig = (fig & ~wall).astype(np.uint8)
    fig = cv2.morphologyEx(fig, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    fig = cv2.morphologyEx(fig, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    _, lab, st, _ = cv2.connectedComponentsWithStats(fig)
    fig = lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    _, lab, st, _ = cv2.connectedComponentsWithStats((~fig).astype(np.uint8))
    for k in range(1, len(st)):
        x, y, w, h, area = st[k]
        if x > 0 and y > 0 and x + w < fig.shape[1] and y + h < fig.shape[0] and area < 4000:
            fig[lab == k] = True  # fill small holes

    # ---- a limb painter: rounded shading from the distance to the edge, lit from the front-left
    def ramp(t, tones):
        t = np.clip(t, 0, 1) * (len(tones) - 1)
        i = np.floor(t).astype(int)
        f = (t - i)[..., None]
        return tones[i] * (1 - f) + tones[np.minimum(i + 1, len(tones) - 1)] * f

    def painter(canvas, alpha):
        yy, xx = np.mgrid[0:canvas.shape[0], 0:canvas.shape[1]]

        def paint(mask, lift=0.0, tones=DOLPH_SKIN, per_row=False, gain=0.45):
            mask = mask > 0
            if not mask.any():
                return
            d = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
            if per_row:  # legs: thin shins shade like thick thighs
                t = (d / np.maximum(1, d.max(axis=1, keepdims=True))) ** 0.55 * 0.8 + 0.08
            else:
                ys, xs = np.where(mask)
                t = np.clip(d / max(1.0, np.percentile(d[mask], 97)), 0, 1) ** 0.5 * 0.75 + 0.1
                t = t + (-0.3 * (xx - xs.mean()) - 0.6 * (yy - ys.mean())) / max(np.ptp(ys), np.ptp(xs), 1) * gain
            t = t + lift + cv2.GaussianBlur(rng.normal(0, 1, t.shape), (0, 0), 2.0) * 0.07
            canvas[mask] = ramp(t, tones)[mask]
            alpha[mask] = 255

        return paint

    def chain(shape, pts, radii):
        m = np.zeros(shape, np.uint8)
        for (p0, p1), (r0, r1) in zip(zip(pts[:-1], pts[1:]), zip(radii[:-1], radii[1:])):
            for k in range(17):
                f = k / 16
                c = (int((p0[0] + (p1[0] - p0[0]) * f) * S), int((p0[1] + (p1[1] - p0[1]) * f) * S))
                cv2.circle(m, c, int((r0 + (r1 - r0) * f) * S), 1, -1)
        return m

    def ellipse(shape, c, axes, angle):
        m = np.zeros(shape, np.uint8)
        cv2.ellipse(m, (int(c[0] * S), int(c[1] * S)), (int(axes[0] * S), int(axes[1] * S)), angle, 0, 360, 1, -1)
        return m

    # ---- standing: the cut-out over drawn legs
    ext = 120 * S
    canvas = np.zeros((big.shape[0] + ext, big.shape[1], 3), float)
    alpha = np.zeros(canvas.shape[:2], np.uint8)
    paint = painter(canvas, alpha)
    legs = [
        [(152, 204), (175, 204), (175, 222), (172, 240), (166, 265), (164, 285), (162, 300), (160, 318), (151, 318), (150, 305), (147, 285),
         (149, 265), (147, 255), (145, 230), (148, 216)],
        [(175, 204), (198, 204), (202, 216), (205, 230), (203, 255), (201, 265), (203, 285), (200, 305), (199, 318), (190, 318), (188, 300),
         (186, 285), (184, 265), (178, 240), (175, 222)],
    ]
    for pts, lift in zip(legs, (0, -0.04)):
        m = np.zeros(canvas.shape[:2], np.uint8)
        cv2.fillPoly(m, [at(pts)], 1)
        paint(cv2.GaussianBlur(m.astype(float), (0, 0), 1.2) > 0.5, lift, per_row=True)
    for cx, ang in ((155, -6), (195, 6)):
        paint(ellipse(canvas.shape[:2], (cx, 320), (8, 4), ang), -0.05)
    top = fig.copy()
    top[218 * S:, :] = False  # soften the cut-out's flat bottom into his hips
    soft = np.clip(cv2.GaussianBlur(top.astype(float), (0, 0), 3), 0, 1)
    H0 = big.shape[0]
    canvas[:H0] = canvas[:H0] * (1 - soft[..., None]) + big * soft[..., None]
    alpha[:H0] = np.maximum(alpha[:H0], np.where(soft > 0.5, 255, 0).astype(np.uint8))
    stand = np.dstack([np.clip(canvas, 0, 255).astype(np.uint8), alpha])

    ys, xs = np.where(alpha > 20)
    X0, Y0, X1, Y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    scale = 196 / (Y1 - Y0)  # 196 art pixels tall (392 on screen)
    yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
    head = (alpha > 20) & (yy < 117 * S) & (xx > 148 * S) & (xx < 198 * S)
    body = stand.copy()
    body[head, 3] = 0
    B = outlined(shrink(body, scale, (X0, Y0, X1, Y1), DOLPH), DOLPH, DOLPH_OUTLINE)
    hy, hx = np.where(head)
    HX, HY = hx.min(), hy.min()
    Hd = outlined(shrink(stand * head[..., None], scale, (HX, HY, hx.max() + 1, hy.max() + 1), DOLPH), DOLPH, DOLPH_OUTLINE)

    def on_body(p):
        return [int(v) + 1 for v in np.round((np.array(p, float) * S - [X0, Y0]) * scale)]

    def on_head(p):
        return [int(v) + 1 for v in np.round((np.array(p, float) * S - [HX, HY]) * scale)]

    # ---- the wailing head, from the open-mouth picture: the head and the red of the mouth
    bgr18 = load('dolphin_wail.webp')
    h18, w18 = bgr18.shape[:2]
    big18 = cv2.resize(bgr18, (w18 * S, h18 * S), interpolation=cv2.INTER_CUBIC)[..., ::-1].astype(int)
    m = np.zeros(big18.shape[:2], np.uint8)
    cv2.fillPoly(m, [at([(226, 13), (240, 15), (252, 25), (258, 44), (257, 64), (255, 76), (203, 76), (200, 62), (200, 40), (206, 24)])], 1)
    jaw = np.zeros_like(m)
    cv2.fillPoly(jaw, [at([(202, 70), (257, 70), (250, 100), (243, 126), (238, 146), (220, 146), (214, 126), (207, 100)])], 1)
    red = (big18[..., 0] > big18[..., 1] + 12) & (big18[..., 0] > big18[..., 2] + 8)
    teeth = (big18.sum(-1) > 480) & (jaw > 0)
    teeth[125 * S:, :] = False  # the upper teeth only
    mouth = cv2.morphologyEx(((red | teeth) & (jaw > 0)).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    m = cv2.dilate(((m > 0) | (mouth > 0)).astype(np.uint8), np.ones((5, 5), np.uint8))
    _, lab, st, _ = cv2.connectedComponentsWithStats(m)
    m = cv2.GaussianBlur((lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(float), (0, 0), 2) > 0.5
    skin = ~((red & (jaw > 0)) | (big18.sum(-1) > 600))  # darker, bluer skin to match; the mouth and eyes stay
    col = np.where(skin[..., None], big18 * np.array([0.52, 0.55, 0.68]), big18)
    wail = np.dstack([np.clip(col, 0, 255), m * 255]).astype(np.uint8)
    wy, wx = np.where(m)
    ratio = 1.2 * (hx.max() - HX) / (wx.max() - wx.min())  # a little bigger than his normal head: he opens right up
    Wl = outlined(shrink(wail, scale * ratio, (wx.min(), wy.min(), wx.max() + 1, wy.max() + 1), DOLPH), DOLPH, DOLPH_OUTLINE)

    # ---- fetal position: lying on his side facing us, curled up, head on the left
    fc = np.zeros((100 * S, 200 * S, 3), float)
    fa = np.zeros(fc.shape[:2], np.uint8)
    fpaint = painter(fc, fa)
    torso = chain(fa.shape, [(64, 62), (92, 52), (124, 50), (150, 60), (164, 76)], [15, 19, 20, 19, 17])
    fpaint(torso)
    fpaint(chain(fa.shape, [(70, 66), (96, 62), (126, 62), (148, 70)], [5, 7, 7, 6]) & torso, 0.05, DOLPH_BELLY, gain=0.25)
    fpaint(chain(fa.shape, [(160, 74), (112, 66)], [12, 10]), -0.2)  # far thigh
    fpaint(chain(fa.shape, [(112, 66), (148, 84)], [9, 7]), -0.22)  # far shin
    turned = cv2.rotate(stand[70 * S:118 * S, 150 * S:198 * S].copy(), cv2.ROTATE_90_COUNTERCLOCKWISE)
    on = turned[..., 3] > 127
    oy, ox = 44 * S, 18 * S
    fc[oy:oy + turned.shape[0], ox:ox + turned.shape[1]][on] = turned[..., :3][on]
    fa[oy:oy + turned.shape[0], ox:ox + turned.shape[1]][on] = 255
    fpaint(chain(fa.shape, [(164, 80), (104, 74)], [14, 11]))  # near thigh, up to his chest
    fpaint(chain(fa.shape, [(104, 76), (150, 88)], [10, 7]))  # near shin, folded back
    fpaint(ellipse(fa.shape, (158, 89), (10, 4.5), -6), -0.05)  # foot
    fpaint(chain(fa.shape, [(80, 62), (76, 82)], [8, 7]), 0.05)  # arm, wrapped round his shins
    fpaint(chain(fa.shape, [(76, 82), (118, 84)], [7, 6]), 0.08)
    fpaint(ellipse(fa.shape, (122, 84), (6, 5), 0), 0.1)  # hand
    fa[95 * S:, :] = 0  # flat on the floor
    fetal = np.dstack([np.clip(fc, 0, 255).astype(np.uint8), fa])
    fy, fx = np.where(fa > 20)
    fscale = scale * 1.15
    F = outlined(shrink(fetal, fscale, (fx.min(), fy.min(), fx.max() + 1, fy.max() + 1), DOLPH), DOLPH, DOLPH_OUTLINE)

    # ---- one canvas every pose fits in: standing in the middle, the fetal pose on the same floor
    pad = 8  # room above his head for the wailing jaw and the wobble
    Wc = max(B.shape[1], F.shape[1]) + 4
    Hc = B.shape[0] + pad
    body_at = [(Wc - B.shape[1]) // 2, pad]
    head_at = [body_at[0] + int(round((HX - X0) * scale)), body_at[1] + int(round((HY - Y0) * scale))]
    fetal_at = [(Wc - F.shape[1]) // 2, Hc - F.shape[0]]

    def pt(p):
        q = on_body(p)
        return [body_at[0] + q[0], body_at[1] + q[1]]

    os.makedirs(SPRITES, exist_ok=True)
    for name, img in (('body', B), ('head', Hd), ('wail', Wl), ('fetal', F)):
        Image.fromarray(img).save(os.path.join(SPRITES, f'dolphin_{name}.png'))
        print(f'wrote sprites/dolphin_{name}.png', img.shape[1], 'x', img.shape[0])

    # Title-screen card: the open-mouth picture as a full frame, head to chest, posterized
    # like the workers' portraits. The room behind him is black; a faint smudge of it that
    # isn't joined to him is dropped.
    card = poster(bgr18, (140, 0, 360, 220), (30, 56, 82), (0.5, 0.45, 0.32, 0.46), clahe=1.2, accent=reds(90, 40))
    _, lab, st, _ = cv2.connectedComponentsWithStats((card > 0).astype(np.uint8), connectivity=4)
    card[(lab != 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])) & (card > 0)] = 0
    save(card, GRAY + REDS, 'dolphin')
    return {
        'size': [Wc, Hc],
        'bodyAt': body_at,
        'headAt': head_at,  # where head.png's top-left goes
        'wailAt': [head_at[0] + (Hd.shape[1] - Wl.shape[1]) // 2, head_at[1] - 4],  # ...and wail.png's
        'fetalAt': fetal_at,
        'pivot': pt((174, 119)),  # his head wobbles around his neck
        'eyes': [on_head((164, 95)), on_head((182, 95))],  # on head.png
        'mouth': pt((173, 110)),
        'chest': pt((174, 160)),
        'feet': pt((175, 322)),
        'handL': pt((118, 208)),
        'handR': pt((224, 212)),
        # his face when curled up, on the canvas
        'fetalFace': [fetal_at[0] + int(round((30 * S - fx.min()) * fscale)), fetal_at[1] + int(round((60 * S - fy.min()) * fscale))],
    }


# ---------------------------------------------------------------- Sid
# Sid's fur from deep shadow to highlight, dried and wet blood, the Desert Eagle's steel, his
# googly eyes and the dark band of his mouth.
SID = hexes(['#141c2b', '#1e2a40', '#2a3a57', '#36496c', '#435a80', '#4e6c95', '#5a7faa', '#6893c0', '#77a8d6', '#8cc0e9',
             '#b3dcf6', '#24100f', '#3e1414', '#5c1d1c', '#7d2a26', '#4a3438', '#66545a', '#16181b', '#2e3237', '#4c5258',
             '#737a82', '#a3aab1', '#d3d8dc', '#f4f8fa', '#0a0a0c'])
SID_OUTLINE = (8, 10, 16, 255)


def green_screen(name):
    """A render on a green screen -> RGBA: the green keyed out with a soft edge, and the green
    that spilled onto the edges taken back out."""
    rgb = load(name)[..., ::-1].astype(float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    a = np.clip(1 - (g - np.maximum(r, b) - 30) / 90, 0, 1)
    rgb[..., 1] = np.minimum(g, np.maximum(r, b) + 8)
    return np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8)


def sid_sprite():
    """Sid's battle sprite, from green-screen renders of his model: front and back, with and
    without the Desert Eagle. Each view is shrunk into dithered pixel art like Trollge's, and
    they share one canvas with his torso in the middle and his planted foot on the floor. The gun
    comes off the armed front view as a layer of its own, so it can twirl round his finger and
    kick when he fires; the back views are for turning round to draw it or put it away."""
    S = 0.185
    views = {  # layer: (render, the floor in it: where his planted foot is)
        'front': ('sid_front.webp', 1134),  # his foot runs off the bottom of this one
        'armed': ('sid_front_gun.webp', 1051),
        'back': ('sid_back.webp', 1084),
        'backGun': ('sid_back_gun.webp', 1134),
    }
    renders = {k: green_screen(f) for k, (f, _) in views.items()}

    def torso_x(rgba):  # the middle of his torso
        a = rgba[..., 3] > 128
        ys = np.where(a)[0]
        y0, y1 = ys.min(), ys.max()
        return float(np.median(np.where(a[y0 + (y1 - y0) * 3 // 10:y0 + (y1 - y0) // 2])[1]))

    anchors = {k: (torso_x(renders[k]), views[k][1]) for k in views}

    # ---- the gun: the steel inside a rough outline of it. Where the grip sat in his fist, the
    # fist is filled back in with fur.
    armed = renders['armed']
    c = armed[..., :3].astype(int)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    near = np.zeros(armed.shape[:2], np.uint8)
    cv2.fillPoly(near, [np.array([(762, 548), (872, 392), (902, 392), (968, 440), (968, 506), (905, 512), (800, 568), (762, 568)], np.int32)], 1)
    steel = (np.abs(r - g) < 26) & (np.abs(g - b) < 30) & (np.maximum(np.maximum(r, g), b) < 205) & (armed[..., 3] > 40)
    gun = cv2.morphologyEx((steel & (near > 0)).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    _, lab, st, _ = cv2.connectedComponentsWithStats(gun)
    gun = cv2.dilate((lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    gun &= armed[..., 3] > 0
    fist = np.zeros_like(near)
    fur = np.argwhere((armed[400:520, 880:980, 3] > 128) & ~gun[400:520, 880:980])
    cv2.fillPoly(fist, [cv2.convexHull(np.array([(x + 880, y + 400) for y, x in fur], np.int32))], 1)
    hole = gun & (fist > 0)
    body = armed.copy()
    body[..., :3] = cv2.inpaint(armed[..., :3], hole.astype(np.uint8) * 255, 6, cv2.INPAINT_TELEA)
    body[gun & ~hole, 3] = 0
    renders['armed'] = body
    renders['gun'] = armed.copy()
    renders['gun'][~gun, 3] = 0
    anchors['gun'] = anchors['armed']

    # ---- shrink every layer, then lay them out on one canvas
    layers = {}
    for k, rgba in renders.items():
        rgb = rgba[..., :3].copy()
        for _ in range(2):
            rgb = cv2.bilateralFilter(rgb, 9, 40, 9)
        rgb = (255 * (rgb.astype(float) / 255) ** 1.15).astype(np.uint8)  # into the hallway's dimmer light
        ys, xs = np.where(rgba[..., 3] > 20)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        idx = shrink(np.dstack([rgb, rgba[..., 3]]), S, box, SID)
        layers[k] = {'img': outlined(idx, SID, SID_OUTLINE), 'box': box, 'f': idx.shape[1] / (box[2] - box[0])}
    rel = lambda k, x, y: ((x - anchors[k][0]) * S, (y - anchors[k][1]) * S)  # from his anchor
    left = min(rel(k, L['box'][0], 0)[0] for k, L in layers.items()) - 1
    right = max(rel(k, L['box'][2], 0)[0] for k, L in layers.items()) + 1
    top = min(rel(k, 0, L['box'][1])[1] for k, L in layers.items()) - 1
    pad = 4
    cx = int(np.ceil(-left)) + pad + 26  # room on the left for the gun to twirl
    floor = int(np.ceil(-top)) + pad
    at = {k: [int(round(rel(k, *L['box'][:2])[0] + cx)) - 1, int(round(rel(k, *L['box'][:2])[1] + floor)) - 1] for k, L in layers.items()}

    def on(k, p):  # a point in render k -> canvas pixels (+1: the outline's margin)
        L = layers[k]
        return [int(round(at[k][i] + 1 + (p[i] - L['box'][i]) * L['f'])) for i in (0, 1)]

    os.makedirs(SPRITES, exist_ok=True)
    for k, L in layers.items():
        Image.fromarray(L['img']).save(os.path.join(SPRITES, f'sid_{k}.png'))
        print(f'wrote sprites/sid_{k}.png', L['img'].shape[1], 'x', L['img'].shape[0])
    r_eye = lambda rad: round(rad * S, 1)
    return {
        'size': [cx + int(np.ceil(right)) + pad, floor + 6],
        'at': at,  # where each layer's top-left goes on the canvas
        'cx': cx,
        'floor': floor,
        # Where things are on each front view. His head sways above `neck`, and his legs fold below
        # `hips` when he drops to one knee (canvas rows).
        'face': {
            'front': {'eyes': [on('front', (868, 81)) + [r_eye(22)], on('front', (918, 83)) + [r_eye(23)]], 'mouth': on('front', (885, 186)),
                      'neck': on('front', (880, 238))[1], 'top': on('front', (895, 42))[1], 'hand': on('front', (1045, 610)),
                      'chest': on('front', (960, 380)), 'hips': on('front', (950, 745))[1]},
            'armed': {'eyes': [on('armed', (1028, 142)) + [r_eye(22)], on('armed', (1077, 141)) + [r_eye(23)]], 'mouth': on('armed', (1062, 238)),
                      'neck': on('armed', (1060, 290))[1], 'top': on('armed', (1060, 88))[1], 'hand': on('armed', (1115, 630)),
                      'chest': on('armed', (1110, 420)), 'hips': on('armed', (1110, 720))[1]},
        },
        'muzzle': on('gun', (772, 548)),  # the end of the barrel
        'grip': on('gun', (912, 470)),  # the gun twirls round his finger here
    }


def uri(path):
    with open(path, 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')


def bundle(sprites):
    """sprites: {name: {'layers': {key: file in assets/sprites}, 'meta': {...}}}"""
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
    lines += ['  };', '  SC.SPRITES = {']
    for name, sp in sprites.items():
        lines.append(f'    {name}: {{')
        for key, file in sp['layers'].items():
            lines.append(f"      {key}: '{uri(os.path.join(SPRITES, file))}',")
        for k, v in sp['meta'].items():
            lines.append(f'      {k}: {json.dumps(v)},')
        lines.append('    },')
    lines += ['  };', "})(typeof window !== 'undefined' ? window : globalThis);", '']
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
    bundle({
        'sid': {'layers': {k: f'sid_{k}.png' for k in ('front', 'armed', 'gun', 'back', 'backGun')}, 'meta': sid_sprite()},
        'trollge': {'layers': {'body': 'trollge_body.png', 'head': 'trollge_head.png'}, 'meta': trollge()},
        'dolphin': {'layers': {'body': 'dolphin_body.png', 'head': 'dolphin_head.png', 'wail': 'dolphin_wail.png', 'fetal': 'dolphin_fetal.png'}, 'meta': dolphin()},
    })
