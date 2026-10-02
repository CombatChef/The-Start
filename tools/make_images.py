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

SPRITES (assets/sprites/). Trollge's and Dolphin Man's battle sprites are their renders, cut out
and kept smooth (full colour, not pixel art) so the game can light them to match the photo they
stand in. Their heads are separate layers so they can tilt and wobble on their necks, and
Trollge's eyes and grin are a glow layer that shines out of the dark rooms. Dolphin Man is made
matte and seen at eye level so he sits in the photos; his tail is a layer of its own for the
Tail Whip, and Fetal Position (sitting facing you, head down on his knees) is put together from
pieces of his front render. Sid's are green-screen renders of his model, front and back, with
and without the Desert Eagle, shrunk into dithered pixel art (the gun is a layer of its own so
it can twirl and kick).

ICONS (assets/icons/). halted.png, the red skull on a worker who is out of the fight.

Everything is also embedded in js/images.js as data URIs, so the game can read the pixels
even when index.html is opened straight from disk (file://).

Sources: lobby_npcs.webp (Mel and John), jim.png (Captain Jim), mysti.png (Bravo Team
Mysti), purpl.webp (Purpl Lady), sid_card.png (the doc's Sid art), sid_front.webp,
sid_front_gun.webp, sid_back.webp and sid_back_gun.webp (Sid's model), trollge.webp (Trollge),
dolphin_front.webp and dolphin_back.webp (Dolphin Man's model), dolphin_wail.webp (his title
card), halted.webp (the HALTED skull).
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


def smooth(rgba, s, box):
    """Area-average (alpha-premultiplied) down by `s`: a smooth cut-out, kept in full colour."""
    x0, y0, x1, y1 = box
    src = rgba[y0:y1, x0:x1].astype(float)
    w, h = int(round((x1 - x0) * s)), int(round((y1 - y0) * s))
    a = src[..., 3] / 255
    col = cv2.resize(src[..., :3] * a[..., None], (w, h), interpolation=cv2.INTER_AREA)
    a = cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA)
    col /= np.maximum(a[..., None], 1e-4)
    return np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)


def trollge():
    """Trollge's battle sprite: its render cut into a body and a head, so "the large head wobbles
    on its skinny body". It stays smooth and detailed (not pixel art) so that it can stand in the
    places' screenshots, and the game lights it to match each one (data.js places). `glow` is the
    bright part of its face (the grin, its highlights), which still shows in the dark. Also its
    title card: the head, as pixel art."""
    im = load('trollge.webp', 'RGBA')
    a = im[..., 3]
    # The head is the only thick part: opening the silhouette with a big disc erases the
    # stick limbs and leaves it.
    fig = (a > 100).astype(np.uint8)
    opened = cv2.morphologyEx(fig, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61)))
    _, lab, stats, _ = cv2.connectedComponentsWithStats(opened)
    head = cv2.dilate((lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0

    R = 3  # sprite pixels per art pixel (the stage shows art pixels at 2x, so this is a little sharper)
    S = 0.18 * R
    ys, xs = np.where(a > 20)
    X0, Y0, X1, Y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    body = im.copy()
    body[head, 3] = 0
    hd_body = smooth(body, S, (X0, Y0, X1, Y1))
    hy, hx = np.where(head & (a > 20))
    HX, HY = hx.min(), hy.min()
    hd_head = smooth(im * head[..., None], S, (HX, HY, hx.max() + 1, hy.max() + 1))
    lum = hd_head[..., :3].astype(float) @ [0.299, 0.587, 0.114] / 255
    hd_glow = hd_head.copy()
    hd_glow[..., 3] = (hd_head[..., 3] * np.clip((lum - 0.45) / 0.3, 0, 1)).astype(np.uint8)

    # One canvas, a whole number of art pixels across, with room round it.
    H, W = hd_body.shape[:2]
    pad = 12
    size = [int(np.ceil((W + pad * 2) / R)) * R, int(np.ceil((H + pad * 2) / R)) * R]
    on = lambda p: [int(round((p[0] - X0) * S)) + pad, int(round((p[1] - Y0) * S)) + pad]  # render -> sprite
    # Where its feet touch the floor: the lowest point of each foot.
    low = a[Y1 - 30:Y1] > 20
    cols = np.where(low.any(0))[0]
    gap = np.argmax(np.diff(cols)) if len(cols) > 1 else 0
    left, right = cols[:gap + 1], cols[gap + 1:]
    os.makedirs(SPRITES, exist_ok=True)
    for name, img in (('body', hd_body), ('head', hd_head), ('glow', hd_glow)):
        Image.fromarray(img).save(os.path.join(SPRITES, f'trollge_{name}.png'), optimize=True)
        print(f'wrote sprites/trollge_{name}.png', img.shape[1], 'x', img.shape[0])
    meta = {
        'res': R,
        'size': size,  # sprite pixels (art pixels x res)
        'bodyAt': [pad, pad],  # where body.png's top-left goes
        'headAt': on((HX, HY)),  # ...and head.png's (and glow.png's)
        'pivot': on((690, 398)),  # its neck: the head wobbles round this point
        'eyes': [on((484, 189)), on((576, 116))],
        'mouth': on((600, 290)),
        'face': on((565, 205)),
        'clawL': on((190, 760)),
        'clawR': on((1250, 560)),
        'chest': on((700, 560)),
        'feet': on((700, Y1)),
        'soles': [on((left.mean(), Y1)), on(((right if len(right) else left).mean(), Y1))],  # where each foot touches the floor
    }

    # The title card is pixel art, from the head with its shadows lifted a little.
    rgb = im[..., :3]
    for _ in range(2):
        rgb = cv2.bilateralFilter(rgb, 9, 40, 9)
    base = np.dstack([(255 * (rgb.astype(float) / 255) ** 0.8).astype(np.uint8), a])

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


# ---------------------------------------------------------------- Dolphin Man
# Outlines on his renders (render pixels), traced by hand.
# His head, cut off along the jaw (dolphin_front).
DOLPH_HEAD = [(1003, 52), (1030, 55), (1055, 68), (1075, 95), (1083, 130), (1083, 170), (1080, 190), (1068, 205),
              (1062, 213), (1051, 228), (1041, 245), (1033, 262), (1025, 275), (1012, 283), (1000, 282), (990, 276),
              (983, 262), (975, 245), (966, 228), (960, 213), (957, 205), (950, 190), (945, 160), (948, 120), (960, 90),
              (980, 62)]
# His tail and its flukes, from the small of his back down (dolphin_back).
DOLPH_TAIL = [(944, 560), (945, 620), (946, 660), (948, 700), (952, 730), (958, 750), (945, 757), (930, 766), (915, 776),
              (900, 790), (885, 806), (870, 825), (858, 843), (848, 858), (845, 864), (856, 864), (872, 859), (890, 855),
              (912, 852), (932, 846), (950, 839), (968, 830), (980, 815), (985, 806), (995, 817), (1010, 829),
              (1025, 836), (1040, 842), (1045, 851), (1070, 849), (1090, 849), (1110, 850), (1128, 852), (1134, 848),
              (1125, 836), (1110, 820), (1095, 805), (1080, 790), (1060, 777), (1040, 766), (1020, 757), (1000, 750),
              (998, 730), (1001, 700), (1002, 660), (1002, 620), (1001, 560)]
# For Fetal Position (dolphin_front): each forearm and hand from the elbow, with the elbow and
# the middle of the hand; and his right leg from just above the knee down to the toes.
DOLPH_FOREARMS = [([(830, 452), (905, 448), (912, 520), (925, 560), (936, 590), (936, 665), (830, 665)], (866, 455), (895, 645)),
                  ([(1188, 455), (1245, 455), (1240, 520), (1226, 565), (1205, 615), (1180, 650), (1160, 675), (1132, 692),
                    (1095, 697), (1084, 686), (1087, 662), (1098, 635), (1118, 612), (1145, 592), (1165, 550), (1180, 500)],
                   (1213, 458), (1120, 660))]
DOLPH_LEG = [(890, 740), (995, 740), (990, 800), (968, 900), (958, 1000), (950, 1060), (920, 1112), (880, 1112), (842, 1095),
             (840, 1060), (885, 1000), (895, 900), (892, 800)]


def soft_poly(shape, pts, blur=0.8):
    """An anti-aliased polygon mask (0..1), drawn at 4x and shrunk."""
    H, W = shape
    m = np.zeros((H * 4, W * 4), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts, float) * 4).astype(np.int32)], 255)
    m = cv2.resize(m, (W, H), interpolation=cv2.INTER_AREA).astype(float) / 255
    return cv2.GaussianBlur(m, (0, 0), blur) if blur else m


def clean_edges(rgba, inner=0.97, r=3):
    """Semi-transparent edge pixels take the colour of the figure just inside them, so no pale
    green-screen fringe is left round it."""
    a = rgba[..., 3].astype(float) / 255
    core = (a >= inner).astype(float)
    col = rgba[..., :3].astype(float)
    num = cv2.blur(col * core[..., None], (2 * r + 1, 2 * r + 1))
    den = cv2.blur(core, (2 * r + 1, 2 * r + 1))[..., None]
    edge = (a < inner) & (den[..., 0] > 0.02)
    col[edge] = (num / np.maximum(den, 1e-6))[edge]
    return np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8)


def matte(rgba, smooth=True):
    """His skin as plain, matte rubber instead of the render's wet studio shine, toned into the
    rooms' flat, hazy light. The shine is the small bright streaks on top of the skin: a grey
    opening (which erases anything bright and thin) finds the skin under them, and they're
    taken off. Then the skin's texture is smoothed a little (keeping edges), and the range is
    squeezed and the colour turned down."""
    a = rgba[..., 3].astype(float) / 255
    f = rgba[..., :3].astype(float) / 255
    lum = f @ [0.299, 0.587, 0.114]
    disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    inside = a > 0.5
    lum_in = np.where(inside, lum, cv2.dilate(np.where(inside, lum, 0).astype(np.float32), disk)).astype(np.float32)
    skin = cv2.GaussianBlur(cv2.morphologyEx(lum_in, cv2.MORPH_OPEN, disk), (0, 0), 4)
    f = np.clip(f - np.clip(lum - skin - 0.015, 0, 1)[..., None], 0, 1)
    if smooth:
        f = cv2.bilateralFilter((f * 255).astype(np.uint8), 9, 24, 5).astype(float) / 255
    grey = (f @ [0.299, 0.587, 0.114])[..., None]
    f = 0.07 + (grey + (f - grey) * 0.7) * 0.66
    return np.dstack([f * 255, a * 255]).clip(0, 255).astype(np.uint8)


def eye_level(rgba, m, box):
    """The renders look down at him from above; the rooms are seen at eye level. Re-aim: the
    bottom of the figure's box is made m times as wide as its top (and the bottom of him taller
    to match), keeping its top and bottom. Returns the image and render point -> new point."""
    x0, y0, x1, y1 = box
    cx, w = (x0 + x1) / 2, x1 - x0
    b = 2 * (m - 1) / (2 + m)  # the bottom grows by b, the top shrinks by b / 2
    src = np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    dst = np.float32([[cx - w / 2 * (1 - b / 2), y0], [cx + w / 2 * (1 - b / 2), y0], [cx + w / 2 * (1 + b), y1], [cx - w / 2 * (1 + b), y1]])
    Hm = cv2.getPerspectiveTransform(src, dst)
    out = cv2.warpPerspective(premul(rgba), Hm, (rgba.shape[1], rgba.shape[0]), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))

    def on(p):
        v = Hm @ np.array([p[0], p[1], 1.0])
        return (v[0] / v[2], v[1] / v[2])
    return to_u8(out), on


def premul(rgba, mask=None):
    """uint8 RGBA (and an optional 0..1 mask) -> float RGBA, premultiplied."""
    f = rgba.astype(float) / 255
    if mask is not None:
        f[..., 3] *= mask
    f[..., :3] *= f[..., 3:4]
    return f


def warp(p, src, dst, size, ang=0.0, sx=1.0, sy=1.0, flip=False):
    """Move a premultiplied piece so its point `src` lands on `dst` in a canvas of `size`, turned
    `ang` degrees (anticlockwise on screen) and scaled (sx, sy) round that point."""
    if flip:
        p = p[:, ::-1]
        src = (p.shape[1] - 1 - src[0], src[1])
    c, s = np.cos(np.radians(ang)), np.sin(np.radians(ang))
    R = np.array([[c, s], [-s, c]]) @ np.diag([sx, sy])
    t = np.array(dst, float) - R @ np.array(src, float)
    return cv2.warpAffine(p, np.hstack([R, t[:, None]]), size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT,
                          borderValue=(0, 0, 0, 0))


def over(dst, src):
    dst[...] = src + dst * (1 - src[..., 3:4])


def shade(dst, front, k, blur, dx=0, dy=0):
    """What's already drawn darkens just round the piece about to go on top of it."""
    h, w = dst.shape[:2]
    a = cv2.warpAffine(front[..., 3], np.float32([[1, 0, dx], [0, 1, dy]]), (w, h))
    dst[..., :3] *= 1 - cv2.GaussianBlur(a, (0, 0), blur)[..., None] * k


def to_u8(p):
    """Premultiplied float RGBA -> straight uint8 RGBA."""
    a = p[..., 3:4]
    return (np.dstack([p[..., :3] / np.maximum(a, 1e-6), a]).clip(0, 1) * 255).round().astype(np.uint8)


def lit_from_above(rgba, top, bottom, lo=0.72):
    """Lit by the ceiling lights: full at `top` (a row), down to `lo` at `bottom`, where the
    floor is dark."""
    out = rgba.copy()
    yy = np.arange(rgba.shape[0], dtype=float)[:, None, None]
    out[..., :3] = (rgba[..., :3] * (1 - (1 - lo) * np.clip((yy - top) / (bottom - top), 0, 1))).astype(np.uint8)
    return out


def fetal_pose(front):
    """Fetal Position, facing you: sitting on the floor with his knees up, his forearms crossed
    over them and his head bowed down onto his arms. Built from pieces of the (matte) front
    render on a canvas whose floor point, under the middle of him, is FP."""
    FW, FH, FP = 1100, 760, (550, 700)
    H, W = front.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    at = lambda x, y: (FP[0] + x, FP[1] + y)
    put = lambda p, src, dst, **k: warp(p, src, at(*dst), (FW, FH), **k)
    head_m = soft_poly((H, W), DOLPH_HEAD)
    fore_m = [soft_poly((H, W), poly) for poly, _, _ in DOLPH_FOREARMS]
    out = np.zeros((FH, FW, 4))

    # Behind his shins, in the shadow under his arms: his thighs and hips, down to the floor.
    hips = np.zeros((FH, FW, 4))
    cv2.fillPoly(hips, [np.array([at(-48, -230), at(48, -230), at(96, -6), at(80, 0), at(-80, 0), at(-96, -6)], np.int32)], (1, 1, 1, 1))
    hips = cv2.GaussianBlur(hips, (0, 0), 5)
    up = np.clip((np.arange(FH) - (FP[1] - 230)) / 230, 0, 1)[:, None, None]
    hips[..., :3] = np.array([0.2, 0.21, 0.24]) * (0.8 + 0.4 * up) * hips[..., 3:4]
    over(out, hips)

    # His shoulders and the tops of his arms (pointing forwards, round his knees), each arm
    # rounded off where it turns towards you; darker down in the hollow under them.
    sh = np.clip((340 - yy) / 16, 0, 1)
    for ex, ey in ((872, 345), (1190, 350)):
        cap = np.clip((1 - (((xx - ex) / 36) ** 2 + ((yy - ey) / 34) ** 2)) * 4, 0, 1)
        sh = np.maximum(sh, cap * (yy > 310))
    torso = premul(front, sh * (1 - head_m) * (1 - fore_m[0]) * (1 - fore_m[1]))
    torso[..., :3] *= (1 - 0.6 * np.clip((yy - 285) / 60, 0, 1))[..., None]
    over(out, put(torso, (1030, 270), (0, -300), sx=0.84, sy=0.8))

    # His head, bowed: the top of it over his arms, his face down against his knees.
    hd = put(premul(front, head_m * np.clip((300 - yy) / 12, 0, 1)), (1012, 165), (0, -276), sx=0.98, sy=0.98 * 0.84)
    shade(out, hd, 0.4, 10, dy=8)
    over(out, hd)

    # Knees up: his leg from just above the knee (the top rounded off) to the toes, twice.
    cap = ((xx - 938) / 50) ** 2 + ((yy - 790) / 40) ** 2
    leg = premul(front, soft_poly((H, W), DOLPH_LEG) * np.where(yy >= 790, 1.0, np.clip((1 - cap) * 5, 0, 1)))
    legs = np.zeros_like(out)
    for flip, x in ((False, -55), (True, 55)):
        lp = put(leg, (900, 1106), (x, 0), ang=-4 if flip else 4, sy=0.76, flip=flip)
        if flip:
            shade(legs, lp, 0.3, 6, dx=-4)
        over(legs, lp)
    shade(out, legs, 0.5, 12, dy=-8)
    over(out, legs)

    # His forearms crossed over his knees, the hands hanging over them: each turned to point
    # across (degrees on screen, 0 = right) from its elbow, mirrored so the fingers curl down.
    (_, elbow_l, hand_l), (_, elbow_r, hand_r) = DOLPH_FOREARMS
    for m, elbow, hand, dst, aim in ((fore_m[1], elbow_r, hand_r, (134, -244), 172), (fore_m[0], elbow_l, hand_l, (-133, -244), 8)):
        d = np.array(hand, float) - np.array(elbow, float)
        ang = np.degrees(np.arctan2(d[1], -d[0])) - aim
        fa = put(premul(front, m), elbow, dst, ang=ang, sx=0.95, sy=0.95, flip=True)
        shade(out, fa, 0.5, 8, dy=8)
        over(out, fa)
    return to_u8(out), FP


def dolphin():
    """Dolphin Man's battle sprite, from green-screen renders of his model, made like Trollge's:
    kept smooth (not pixel art), in layers the game moves and lights to match each place. His
    skin is made plain and matte, and the renders' high camera is brought down to eye level, so
    that he looks like he's standing in the rooms' photos.

        body  - him standing, without his head; a neck is filled in behind his jaw so nothing
                shows through when the head tilts
        head  - his head, which sways and twitches on his neck
        tail  - his tail and flukes (from the back view), hanging behind him between his legs
                and on the floor; it swings out for the Tail Whip
        fetal - Fetal Position: facing you, sitting on the floor curled up over his knees with
                his head down, built from pieces of the front view

    His title card is the open-mouth screenshot, posterized like the workers' portraits."""
    R = 3
    S = 0.22 * R  # front render -> sprite pixels
    SB = S * 1.15 * 1.1  # the back view was shot from further away (and his tail is low down, nearer you)

    raw = clean_edges(green_screen('dolphin_front.webp'))
    H, W = raw.shape[:2]
    head_m0 = soft_poly((H, W), DOLPH_HEAD)
    front = matte(raw)
    face = matte(raw, smooth=False)  # his face keeps its detail
    front[..., :3] = (front[..., :3] * (1 - head_m0[..., None]) + face[..., :3] * head_m0[..., None]).astype(np.uint8)
    fetal, FP = fetal_pose(front)
    fetal = lit_from_above(fetal, FP[1] - 460, FP[1], 0.78)

    # ---- standing, seen at eye level and lit from above
    box = (840, 55, 1250, 1110)
    front, on = eye_level(front, 1.3, box)
    top, floor = on((1010, 60))[1], on((1010, 1105))[1]
    front = lit_from_above(front, top, floor)
    yy = np.mgrid[0:H, 0:W][0]
    a = front[..., 3].astype(float) / 255
    head_m = soft_poly((H, W), [on(p) for p in DOLPH_HEAD])
    head = front.copy()
    head[..., 3] = (a * head_m * 255).astype(np.uint8)
    ramp = np.clip((yy - on((1012, 196))[1]) / 10, 0, 1)  # above this, only the room is behind his head
    body = front.copy()
    body[..., 3] = (a * (1 - head_m * (1 - ramp)) * 255).astype(np.uint8)
    hole = ((head_m > 0.02) & (ramp > 0) & (a > 0.5)).astype(np.uint8)
    filled = cv2.inpaint(front[..., :3], hole, 14, cv2.INPAINT_TELEA)
    k = (head_m * ramp)[..., None]
    body[..., :3] = (front[..., :3] * (1 - k) + filled * k).astype(np.uint8)

    # ---- the tail, off the back view: turned round to face the same way, and in his shadow
    back = matte(clean_edges(green_screen('dolphin_back.webp')))
    Hb, Wb = back.shape[:2]
    tail = back.copy()
    tail[..., 3] = (back[..., 3] * soft_poly((Hb, Wb), DOLPH_TAIL)).astype(np.uint8)
    tail[..., :3] = (tail[..., :3] * 0.72).astype(np.uint8)

    # ---- everything shrunk to sprite pixels
    def crop(img, s):
        ys, xs = np.where(img[..., 3] > 0)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        return smooth(img, s, box), box

    layers = {name: crop(img, s) for name, img, s in (('body', body, S), ('head', head, S), ('tail', tail[:, ::-1].copy(), SB), ('fetal', fetal, S))}

    # One canvas round them all, with room at the sides for the tail to swing out and above his
    # head for him to rear up. Front-render pixels (after re-aiming) -> sprite pixels:
    X0, Y0, pad = 600, -30, 6
    to = lambda p: [int(round((p[0] - X0) * S)) + pad, int(round((p[1] - Y0) * S)) + pad]
    feet = to(on((1010, 1105)))  # the floor under him (his front foot's sole)
    fx0, fy0 = layers['fetal'][1][:2]
    fetal_at = [int(round(feet[0] - (FP[0] - fx0) * S)), int(round(feet[1] - (FP[1] - fy0) * S))]
    tx0, ty0 = layers['tail'][1][:2]  # (the tail was turned round: its x is mirrored)
    tail_origin = [int(round(((Wb - 1 - 973) - tx0) * SB)), int(round((566 - ty0) * SB))]
    bottom = max(to((0, H))[1], fetal_at[1] + layers['fetal'][0].shape[0])
    size = [int(np.ceil(((1420 - X0) * S + 2 * pad) / R)) * R, int(np.ceil((bottom + pad) / R)) * R]
    os.makedirs(SPRITES, exist_ok=True)
    for name, (img, _) in layers.items():
        Image.fromarray(img).save(os.path.join(SPRITES, f'dolphin_{name}.png'), optimize=True)
        print(f'wrote sprites/dolphin_{name}.png', img.shape[1], 'x', img.shape[0])
    at = lambda name: to(layers[name][1][:2])
    sole = lambda x, y, rx, ry, k: to(on((x, y))) + [round(rx * S), round(ry * S), k]

    # Title-screen card: the open-mouth picture as a full frame, head to chest, posterized
    # like the workers' portraits. The room behind him is black; a faint smudge of it that
    # isn't joined to him is dropped.
    card = poster(load('dolphin_wail.webp'), (140, 0, 360, 220), (30, 56, 82), (0.5, 0.45, 0.32, 0.46), clahe=1.2, accent=reds(90, 40))
    _, lab, st, _ = cv2.connectedComponentsWithStats((card > 0).astype(np.uint8), connectivity=4)
    card[(lab != 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])) & (card > 0)] = 0
    save(card, GRAY + REDS, 'dolphin')
    return {
        'res': R,
        'size': size,  # sprite pixels (art pixels x res)
        'bodyAt': at('body'),  # where each layer's top-left goes
        'headAt': at('head'),
        'fetalAt': fetal_at,
        'pivot': to(on((1012, 225))),  # his neck: the head turns round this point
        'tailPivot': to(on((1010, 600))),  # where his tail starts, behind his hips...
        'tailOrigin': tail_origin,  # ...and that point on tail.png
        'seat': feet,  # the floor under him when he's curled up
        'face': to(on((1012, 175))),
        'mouth': to(on((1008, 278))),  # the tip of his beak
        'chest': to(on((1030, 400))),
        'feet': feet,
        'clawL': to(on((890, 620))),
        'clawR': to(on((1120, 665))),
        'curled': [feet[0], feet[1] - int(round(200 * S))],  # the middle of him, curled up
        # Shadows on the floor, [x, y, rx, ry, darkness] (sprite pixels): standing, and curled up.
        'shadows': {
            'stand': [sole(905, 1102, 80, 16, 0.55), sole(1100, 958, 62, 13, 0.5), sole(1010, 1040, 230, 45, 0.3)],
            'fetal': [[feet[0], feet[1] - round(5 * S), round(170 * S), round(26 * S), 0.6], [feet[0], feet[1], round(260 * S), round(40 * S), 0.3]],
        },
    }


# ---------------------------------------------------------------- Sid
# Sid's fur from deep shadow to highlight, dried and wet blood, the Desert Eagle's steel, his
# googly eyes and the dark band of his mouth.
SID = hexes(['#141c2b', '#1e2a40', '#2a3a57', '#36496c', '#435a80', '#4e6c95', '#5a7faa', '#6893c0', '#77a8d6', '#8cc0e9',
             '#b3dcf6', '#24100f', '#3e1414', '#5c1d1c', '#7d2a26', '#4a3438', '#66545a', '#16181b', '#2e3237', '#4c5258',
             '#737a82', '#a3aab1', '#d3d8dc', '#f4f8fa', '#0a0a0c'])
SID_OUTLINE = (8, 10, 16, 255)


def green_screen(name):
    """A render on a green screen -> RGBA: the green keyed out with a soft edge, the green that
    spilled onto the edges taken back out, and only the figure kept (not a card or menu that
    was left on the screen)."""
    rgb = load(name)[..., ::-1].astype(float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    a = np.clip(1 - (g - np.maximum(r, b) - 30) / 90, 0, 1)
    rgb[..., 1] = np.minimum(g, np.maximum(r, b) + 8)
    _, lab, st, _ = cv2.connectedComponentsWithStats((a > 0.5).astype(np.uint8))
    figure = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    a[cv2.dilate(figure, np.ones((51, 51), np.uint8)) == 0] = 0
    return np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8)


def torso_x(rgba):
    """The middle of a figure's torso (x), in a render."""
    a = rgba[..., 3] > 128
    ys = np.where(a)[0]
    y0, y1 = ys.min(), ys.max()
    return float(np.median(np.where(a[y0 + (y1 - y0) * 3 // 10:y0 + (y1 - y0) // 2])[1]))


def lay_out(views, pal, line, room=(0, 0)):
    """Shrink several views of a figure into dithered pixel art on one canvas.

    views: {name: (rgba render, (x, floor y) in it, scale[, palette])}. Each view's x lands on the canvas's
    middle column and its floor on the canvas's floor row, so switching views keeps him in
    place. `room` is extra space (left, right) for things that swing out. Returns the layers
    (name -> RGBA image), where each one's top-left goes, the canvas size, the middle column,
    the floor row, and on(name, point): a point in a render -> canvas pixels."""
    layers = {}
    for k, (rgba, anchor, S, *own) in views.items():
        P = own[0] if own else pal
        rgb = rgba[..., :3].copy()
        for _ in range(2):
            rgb = cv2.bilateralFilter(rgb, 9, 40, 9)
        rgb = (255 * (rgb.astype(float) / 255) ** 1.15).astype(np.uint8)  # into the dimmer light of the game
        ys, xs = np.where(rgba[..., 3] > 20)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        idx = shrink(np.dstack([rgb, rgba[..., 3]]), S, box, P)
        layers[k] = {'img': outlined(idx, P, line), 'box': box, 'f': idx.shape[1] / (box[2] - box[0]), 'anchor': anchor, 'S': S}
    rel = lambda L, x, y: ((x - L['anchor'][0]) * L['S'], (y - L['anchor'][1]) * L['S'])  # from the anchor
    left = min(rel(L, L['box'][0], 0)[0] for L in layers.values()) - 1
    right = max(rel(L, L['box'][2], 0)[0] for L in layers.values()) + 1
    top = min(rel(L, 0, L['box'][1])[1] for L in layers.values()) - 1
    bottom = max(rel(L, 0, L['box'][3])[1] for L in layers.values()) + 1
    pad = 4
    cx = int(np.ceil(-left)) + pad + room[0]
    floor = int(np.ceil(-top)) + pad
    at = {k: [int(round(rel(L, *L['box'][:2])[i] + (cx, floor)[i])) - 1 for i in (0, 1)] for k, L in layers.items()}
    size = [cx + int(np.ceil(right)) + pad + room[1], floor + max(6, int(np.ceil(bottom)) + pad)]

    def on(k, p):  # +1: the outline's margin
        L = layers[k]
        return [int(round(at[k][i] + 1 + (p[i] - L['box'][i]) * L['f'])) for i in (0, 1)]

    return {k: L['img'] for k, L in layers.items()}, at, size, cx, floor, on


def save_sprites(prefix, layers):
    os.makedirs(SPRITES, exist_ok=True)
    for k, img in layers.items():
        Image.fromarray(img).save(os.path.join(SPRITES, f'{prefix}_{k}.png'))
        print(f'wrote sprites/{prefix}_{k}.png', img.shape[1], 'x', img.shape[0])


def sid_sprite():
    """Sid's battle sprite, from green-screen renders of his model: standing in front of you with
    and without the Desert Eagle, and from behind. Each view is shrunk into dithered pixel art,
    on one canvas. The gun comes off the armed view as a layer of its own, so it
    can twirl round his finger, come up to aim and kick when he fires; the back views are for
    turning round to draw it or put it away."""
    S = 0.24
    B = S * 0.81  # the back views were shot from closer
    renders = {k: green_screen(f'sid_{f}.webp') for k, f in (('front', 'front'), ('armed', 'front_gun'), ('back', 'back'), ('backGun', 'back_gun'))}
    floors = {'front': 994, 'armed': 990, 'back': 1084, 'backGun': 1134}  # his planted foot (off the bottom of back_gun)

    # ---- the gun, hanging from his right hand: the steel inside a rough outline of it. Where the
    # grip sat in his fist, the fist is filled back in with fur.
    armed = renders['armed']
    c = armed[..., :3].astype(int)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    near = np.zeros(armed.shape[:2], np.uint8)
    cv2.fillPoly(near, [np.array([(772, 548), (826, 422), (868, 422), (878, 470), (880, 528), (842, 534), (803, 576), (772, 576)], np.int32)], 1)
    steel = (np.abs(r - g) < 26) & (np.abs(g - b) < 30) & (np.maximum(np.maximum(r, g), b) < 205) & (armed[..., 3] > 40)
    gun = cv2.morphologyEx((steel & (near > 0)).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    _, lab, st, _ = cv2.connectedComponentsWithStats(gun)
    gun = cv2.dilate((lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    gun &= armed[..., 3] > 0
    fist = np.zeros_like(near)
    fur = np.argwhere((armed[455:540, 815:890, 3] > 128) & ~gun[455:540, 815:890])
    cv2.fillPoly(fist, [cv2.convexHull(np.array([(x + 815, y + 455) for y, x in fur], np.int32))], 1)
    hole = gun & (fist > 0)
    body = armed.copy()
    body[..., :3] = cv2.inpaint(armed[..., :3], hole.astype(np.uint8) * 255, 6, cv2.INPAINT_TELEA)
    body[gun & ~hole, 3] = 0
    renders['armed'] = body
    renders['gun'] = armed.copy()
    renders['gun'][~gun, 3] = 0
    floors['gun'] = floors['armed']

    anchors = {k: torso_x(renders['armed' if k == 'gun' else k]) for k in renders}
    views = {k: (rgba, (anchors[k], floors[k]), B if k.startswith('back') else S) for k, rgba in renders.items()}
    views['gun'] += (SID[17:23],)  # nothing but steel for the gun
    layers, at, size, cx, floor, on = lay_out(views, SID, SID_OUTLINE, room=(8, 0))
    save_sprites('sid', layers)

    # Aiming, the gun comes up this far round his finger (radians, clockwise on screen).
    aim = 0.6
    grip, muzzle = on('gun', (848, 492)), on('gun', (783, 557))
    d = np.subtract(muzzle, grip)
    aimed = [int(round(grip[0] + d[0] * np.cos(aim) - d[1] * np.sin(aim))), int(round(grip[1] + d[0] * np.sin(aim) + d[1] * np.cos(aim)))]
    eye = lambda k, x, y, rad: on(k, (x, y)) + [round(rad * S, 1)]
    return {
        'size': size,
        'at': at,  # where each layer's top-left goes on the canvas
        'cx': cx,
        'floor': floor,
        # Where things are on each front view. His head sways above `neck`, and his legs fold below
        # `hips` when he drops to one knee (canvas rows).
        'face': {
            'front': {'eyes': [eye('front', 1091, 184, 15), eye('front', 1123, 191, 16)], 'mouth': on('front', (1083, 255)),
                      'neck': on('front', (1080, 290))[1], 'top': on('front', (1080, 164))[1], 'chest': on('front', (1063, 430)),
                      'hips': on('front', (1063, 680))[1]},
            'armed': {'eyes': [eye('armed', 1014, 232, 15), eye('armed', 1047, 234, 15)], 'mouth': on('armed', (1027, 300)),
                      'neck': on('armed', (1027, 338))[1], 'top': on('armed', (1027, 207))[1], 'chest': on('armed', (1000, 460)),
                      'hips': on('armed', (1000, 690))[1]},
        },
        'grip': grip,  # the gun turns round his finger here
        'muzzle': muzzle,  # the end of the barrel, hanging
        'aim': aim,
        'muzzleAimed': aimed,  # ...and aimed
    }


# ---------------------------------------------------------------- icons
ICONS = os.path.join(ROOT, 'assets', 'icons')


def halted_icon():
    """A worker who is out of the fight: SlashCo VR's red skull with the lightning bolt
    (halted.webp, red on black). The black is see-through, so the holes in it are too."""
    rgb = load('halted.webp')[..., ::-1].astype(float)
    a = np.clip((rgb[..., 0] - 12) / 230, 0, 1)  # how red: the skull, its soft edge, or nothing
    ys, xs = np.where(a > 0.05)
    x0, y0, x1, y1 = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3
    col = np.array([255, 52, 25], float)  # the skull's red
    rgba = np.dstack([np.broadcast_to(col, a.shape + (3,)), a * 255])[y0:y1, x0:x1]
    h = 96  # twice the size it's shown at
    w = int(round(rgba.shape[1] * h / rgba.shape[0]))
    small = cv2.resize(rgba, (w, h), interpolation=cv2.INTER_AREA)
    os.makedirs(ICONS, exist_ok=True)
    Image.fromarray(small.clip(0, 255).astype(np.uint8)).save(os.path.join(ICONS, 'halted.png'))
    print('wrote icons/halted.png', w, 'x', h)


def uri(path):
    kind = 'webp' if path.endswith('.webp') else 'png'
    with open(path, 'rb') as f:
        return f'data:image/{kind};base64,' + base64.b64encode(f.read()).decode('ascii')


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
    lines += ['  };', '  SC.ICONS = {']
    for name in sorted(os.listdir(ICONS)):
        if name.endswith('.png'):
            lines.append(f"    {name[:-4]}: '{uri(os.path.join(ICONS, name))}',")
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
    halted_icon()
    bundle({
        'sid': {'layers': {k: f'sid_{k}.png' for k in ('front', 'armed', 'gun', 'back', 'backGun')}, 'meta': sid_sprite()},
        'trollge': {'layers': {k: f'trollge_{k}.png' for k in ('body', 'head', 'glow')}, 'meta': trollge()},
        'dolphin': {'layers': {k: f'dolphin_{k}.png' for k in ('body', 'head', 'tail', 'fetal')}, 'meta': dolphin()},
    })
