"""Builds the art for Crispy's birthday battle into crispy/js/images.js.

    pip install numpy opencv-python-headless pillow
    python3 crispy/tools/make_images.py

From crispy/assets/source/ (the photos aren't in the repo: put them there first):
  living_room.webp  -> the room at night, lit faintly orange from the ceiling fan's lamp (and a
                       brighter version, for when the lights are turned up), not pixelated
  kitchen.webp      -> the kitchen behind him, when he turns around: all but pitch black (and as
                       his phone's flash shows it)
  crispy_photo.webp -> Crispy as a pixel sprite in colour, from the collar up, his face turned a
  crispy_mask.png      little to the right (the mask cuts him out of the photo: make it with
                       crispy/tools/cutout.py; the pixels are kept as crispy_pixels.png once made)
the creature's five forms from its pixel-art sprite sheet (creature_sheet.webp), the trash bag,
grilled cheese and sword from theirs (props_sheet.png), the wine glass, pills, phone, car keys
and text bubble from theirs (items_sheet.png), the alarm clock and the bird from theirs
(early_sheet.png), the RG 405M console from its own (rg_sheet.png), the speaker from its own (speaker_sheet.png), Authority's gavel (gavel_sheet.png), the white
flag (flag_sheet.png), the creature's doc profiles (the repo's
assets/profiles/) for the HUD, the family photos he sees when he falls (memory_1..4.webp, not in
the repo either), the creature's arms (arms_sheet.png) and jaw (jaw_frames.png), the killer
(killer_sheet.png), and the pictures after his jumpscares (scare_1..5 and behind_1..4, not in the repo).
"""
import base64
import io
import json
import os

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CRISPY = os.path.join(HERE, '..')
SRC = os.path.join(CRISPY, 'assets', 'source')
ROOT = os.path.join(CRISPY, '..')
W, H = 1280, 960  # the stage


def data_url(img, fmt='PNG', **kw):
    buf = io.BytesIO()
    img.save(buf, fmt, **kw)
    return f'data:image/{fmt.lower()};base64,' + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- the room at night


def night(exposure):
    """The living room after dark: the daylight gone from the blinds and the doorway, cold in
    the corners, and a faint orange-yellow light falling from the ceiling fan's lamp."""
    src = Image.open(os.path.join(SRC, 'living_room.webp')).convert('RGB').resize((W, H), Image.LANCZOS)
    a = (np.asarray(src).astype(np.float32) / 255) ** 2.2
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    win = np.zeros((H, W), np.float32)
    for x0, y0, x1, y1 in ((330, 268, 476, 520), (684, 262, 870, 505), (1236, 262, 1280, 770)):  # the blinds, the doorway
        win[y0:y1, x0:x1] = 1
    bright = np.clip((lum - 0.25) / 0.35, 0, 1) * cv2.GaussianBlur(win, (0, 0), 4)
    a = a * (1 - 0.93 * bright[..., None]) + bright[..., None] * np.array([0.004, 0.006, 0.014], np.float32)
    grey = (a @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    a = a * 0.55 + grey * 0.45
    lx, ly = 0.42 * W, 0.17 * H  # the fan's lamp
    glow = np.exp(-(((xx - lx) / 110) ** 2 + ((yy - ly) / 70) ** 2))
    pool = np.exp(-(((xx - 0.45 * W) / 430) ** 2 + ((yy - 0.52 * H) / 330) ** 2))
    fall = 1 / (1 + ((xx - lx) ** 2 + (yy - ly) ** 2) / 380 ** 2)
    light = np.array([0.030, 0.038, 0.070], np.float32) + np.array([1.0, 0.64, 0.27], np.float32) * (0.27 * pool ** 1.5 + 0.16 * fall ** 2 + 0.9 * glow)[..., None]
    a = a * light * exposure
    v = np.clip(1 - 0.55 * (((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.45) / (H * 0.7)) ** 2), 0.25, 1)
    a *= v[..., None]
    return Image.fromarray((np.clip(a, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8))


# ---------------------------------------------------------------- the kitchen, behind him

# Where the kitchen's light comes from: nowhere much. The fan's lamp is in the living room behind
# Crispy, so a little of its orange falls in from where he stands, onto the near things; the far
# end, by the back door, is black, but for the night through the door's glass and the sink's
# blinds, and the stove's clock.
FAR = (0.66 * W, 0.47 * H)  # the far end of the room, on the screen


def kitchen(flash=False):
    """The kitchen at night (kitchen.webp, not in the repo): all but pitch black, in the living
    room's colours (the faintest orange on the nearest things, the night just there in the back
    door's glass, the stove's clock): or, with flash=True, as a phone's flash shows it for the
    instant it goes off: cold white, blinding up close, falling away to nothing at the far end."""
    src = Image.open(os.path.join(SRC, 'kitchen.webp')).convert('RGB').resize((W, H), Image.LANCZOS)
    a = (np.asarray(src).astype(np.float32) / 255) ** 2.2
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    win = np.zeros((H, W), np.float32)
    for x0, y0, x1, y1 in ((416, 118, 548, 452), (920, 276, 1040, 456)):  # the sink's blinds, the back door's glass
        win[y0:y1, x0:x1] = 1
    win = cv2.GaussianBlur(win, (0, 0), 3)
    bright = np.clip((lum - 0.2) / 0.4, 0, 1) * win
    a = a * (1 - 0.96 * bright[..., None]) + bright[..., None] * np.array([0.006, 0.008, 0.016], np.float32)
    grey = (a @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    a = a * 0.5 + grey * 0.5
    # how near each part of the picture is, roughly: the far end at FAR, nearer outwards from it
    r = np.sqrt(((xx - FAR[0]) / (0.62 * W)) ** 2 + ((yy - FAR[1]) / (0.6 * H)) ** 2)
    if flash:
        # the flash: cold, white, falling off sharply with distance
        near = np.clip(r, 0.05, 1.6)
        light = np.array([0.92, 0.96, 1.0], np.float32) * (0.012 + 2.4 * near ** 4)[..., None]
        a = a * light
        a = a / (1 + a * 0.5)  # (blown out up close, not clipped flat)
    else:
        warm = np.array([1.0, 0.64, 0.27], np.float32)
        light = np.array([0.0006, 0.0006, 0.0009], np.float32) + warm * (0.011 * np.clip(r, 0, 1.4) ** 3)[..., None]
        a = a * light
        a += bright[..., None] * np.array([0.0012, 0.0016, 0.0036], np.float32)  # the night, in the glass
        clock = np.exp(-(((xx - 806) / 16) ** 2 + ((yy - 424) / 4) ** 2))
        a += clock[..., None] * np.array([0.0, 0.006, 0.007], np.float32)
    v = np.clip(1 - 0.6 * (((xx - W / 2) / (W * 0.6)) ** 2 + ((yy - H * 0.48) / (H * 0.68)) ** 2), 0.2, 1)
    a *= v[..., None]
    return Image.fromarray((np.clip(a, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8))


# ---------------------------------------------------------------- Crispy

TURN, CX, R = 14, 757, 118  # turn his face this many photo px to the right, about his nose
K, HEAD, NECK = 0.078, 1.3, 560  # sprite px per photo px; his head a little bigger, so his face reads
HX0, HY0, TOP = 560, 160, 6  # where his head's crop starts in the photo, and the room above it


def turn_dx(x, y):
    """How far the turn moves a point of his head: most in the middle of his face, none at the
    sides or below his neck."""
    g = np.clip(1 - ((x - CX) / R) ** 2, 0, 1)
    f = np.clip((y - 190) / 40, 0, 1) * np.clip((610 - y) / 60, 0, 1)
    return TURN * g * f


def crispy_pixels():
    """Crispy, the whole of him, as pixels: the photo cut out, his face turned a little to the
    right, flattened into areas of colour, shrunk (his head a little more than the rest), lit
    warm from above and darker towards his feet, and down to 18 colours. Kept as
    crispy_pixels.png once made, since the colours come out a little differently each time."""
    keep = os.path.join(SRC, 'crispy_pixels.png')
    if os.path.exists(keep):
        return Image.open(keep).convert('RGBA')
    im = np.asarray(Image.open(os.path.join(SRC, 'crispy_photo.webp')).convert('RGB')).copy()
    m = np.asarray(Image.open(os.path.join(SRC, 'crispy_mask.png')).convert('L')).astype(np.float32) / 255
    jug = np.zeros(m.shape, np.uint8)  # the water jug he's holding
    cv2.rectangle(jug, (478, 975), (634, 1235), 255, -1)
    im = cv2.inpaint(im, jug, 9, cv2.INPAINT_TELEA)
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]].astype(np.float32)
    dx = turn_dx(xx, yy)
    im = cv2.remap(im, xx - dx, yy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    m = cv2.remap(m, xx - dx, yy, cv2.INTER_LINEAR)
    flat = cv2.pyrMeanShiftFiltering(im, 7, 18)

    def shrink(img, k):
        return cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)

    b_rgb, b_a = shrink(flat[NECK - 40:2000, 360:1120], K), shrink(m[NECK - 40:2000, 360:1120], K)
    h_rgb, h_a = shrink(flat[HY0:NECK, HX0:960], K * HEAD), shrink(m[HY0:NECK, HX0:960], K * HEAD)
    body_y = round(TOP + (NECK - HY0) * K * HEAD - 40 * K)
    head_x = round(6 + (CX - 360) * K - (CX - HX0) * K * HEAD)
    cw, ch = b_rgb.shape[1] + 10, body_y + b_rgb.shape[0] + 6
    rgb, a = np.zeros((ch, cw, 3), np.float32), np.zeros((ch, cw), np.float32)
    for src, al, x, y in ((b_rgb, b_a, 5, body_y), (h_rgb, h_a, head_x, TOP)):
        hh, ww = al.shape
        rgb[y:y + hh, x:x + ww] = rgb[y:y + hh, x:x + ww] * (1 - al[..., None]) + src * al[..., None]
        a[y:y + hh, x:x + ww] = np.maximum(a[y:y + hh, x:x + ww], al)
    alpha = a > 0.45
    yn = np.linspace(0, 1, ch)[:, None, None]
    rgb = np.clip(rgb * (np.array([1.08, 0.96, 0.82]) * (1 - yn) + np.array([0.52, 0.56, 0.7]) * yn) * 0.92, 0, 255)
    lab = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    sel = alpha.reshape(-1)
    cv2.setRNGSeed(1)
    _, lbl, cen = cv2.kmeans(lab[sel], 18, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5), 6, cv2.KMEANS_PP_CENTERS)
    q = np.zeros_like(lab)
    q[sel] = cen[lbl.ravel()]
    out = cv2.cvtColor(q.reshape(ch, cw, 3).astype(np.uint8), cv2.COLOR_LAB2RGB)
    img = Image.fromarray(np.dstack([out, (alpha * 255).astype(np.uint8)]))
    img.save(keep)
    return img


# The battle sprite: him from the collar up, exactly as picked (sprite rows 10-57, columns 12-61).
BUST = (12, 10, 62, 58)


def crispy():
    img = crispy_pixels().crop(BUST)
    return img, {'size': list(img.size)}


# ---------------------------------------------------------------- the creature

SHEET_W = 520  # the sprite sheet is 520 pixel-art pixels across, scaled up
SHEET_OFF = 3.21  # where its pixel grid starts


def creature():
    """The creature's five forms (stages 1-4, then Andy) from the sprite sheet: back down to
    their own pixels, cut out, and measured for the game to move them: where its feet are,
    which pixels are its arms (outside its thighs, from its armpits to its fingertips), and
    where the wound in its chest is."""
    src = np.asarray(Image.open(os.path.join(SRC, 'creature_sheet.webp')).convert('RGB')).astype(int)
    h, w, _ = src.shape
    s = w / SHEET_W
    xs = np.clip(((np.arange(int((w - SHEET_OFF) / s)) + 0.5) * s + SHEET_OFF).astype(int), 0, w - 1)
    ys = np.clip(((np.arange(int((h - SHEET_OFF) / s)) + 0.5) * s + SHEET_OFF).astype(int), 0, h - 1)
    px = src[ys][:, xs]
    fig = np.abs(px - 40).sum(2) > 18  # the sheet's background is (40, 40, 40)
    cols = fig.any(0)
    spans, start = [], None
    for x, v in enumerate(list(cols) + [False]):
        if v and start is None:
            start = x
        if not v and start is not None:
            if x - start > 10:
                spans.append((start, x))
            start = None
    out = []
    for a, b in spans:
        al = fig[:, a:b].copy()
        rows = np.flatnonzero(al.any(1))
        al = al[rows[0]:rows[-1] + 1]
        rgb = px[rows[0]:rows[-1] + 1, a:b]
        al[-3:] &= rgb[-3:].sum(2) >= 75  # the shadow drawn under its feet: the game draws its own
        hh, ww = al.shape
        cx = float(np.mean(np.flatnonzero(al[hh - 10:].any(0))))
        hw = np.array([np.max(np.abs(np.flatnonzero(al[y]) - cx)) if al[y].any() else 0 for y in range(hh)])
        knee = int(hh * 0.78)
        legs = np.median(hw[knee - 5:knee + 5])
        tips = max(y for y in range(int(hh * 0.4), knee) if hw[y] > legs + 5)  # its fingertips
        core = float(np.median(hw[tips + 2:tips + 8]) + 1)  # its thighs, just under its hands
        neck = min(range(12, int(hh * 0.22)), key=lambda y: hw[y])
        shoulder = next(y for y in range(neck, hh) if hw[y] > core + 4)
        red = al & (rgb[..., 0] > 110) & (rgb[..., 1] < 60) & (rgb[..., 2] < 70)
        wound = [round(float(np.mean(np.nonzero(red)[1])), 1), round(float(np.mean(np.nonzero(red)[0])), 1)] if red.sum() > 10 else None
        img = Image.fromarray(np.dstack([rgb.astype(np.uint8), (al * 255).astype(np.uint8)]))
        out.append((img, {'w': ww, 'h': hh, 'cx': round(cx, 1), 'armpit': shoulder + int((tips - shoulder) * 0.25), 'tips': tips, 'core': core, 'wound': wound}))
    return out


def props():
    """The trash bag, the grilled cheese and the sword, from their pixel-art sheet (5 screen
    pixels to each of theirs), back down to their own pixels and cut out. The bag's blood
    pool comes off it, to go on the floor."""
    src = np.asarray(Image.open(os.path.join(SRC, 'props_sheet.png')).convert('RGB')).astype(int)
    px = src[2::5, 2::5]
    fig = (np.abs(px - 40).sum(2) > 12) & ~np.all(px == 30, axis=2)  # not the background, nor the floor line
    cols = fig.any(0)
    spans, start = [], None
    for x, v in enumerate(list(cols) + [False]):
        if v and start is None:
            start = x
        if not v and start is not None:
            if x - start > 5:
                spans.append((start, x))
            start = None
    out = {}
    for name, (a, b) in zip(('bag', 'cheese', 'sword'), spans):
        m = fig[:, a:b]
        rows = np.flatnonzero(m.any(1))
        rgb, al = px[rows[0]:rows[-1] + 1, a:b], m[rows[0]:rows[-1] + 1].copy()
        if name == 'bag':
            # the pool is the red along the bottom
            red = (rgb[..., 0] > rgb[..., 1] * 2) & (np.arange(len(rgb))[:, None] >= len(rgb) - 6)
            pool = al & red
            pr = np.flatnonzero(pool.any(1))
            out['pool'] = Image.fromarray(np.dstack([rgb[pr[0]:], (pool[pr[0]:] * 255)]).astype(np.uint8))
            al &= ~pool
            keep = np.flatnonzero(al.any(1))
            rgb, al = rgb[:keep[-1] + 1], al[:keep[-1] + 1]
        img = Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8))
        if name == 'sword':
            img = img.rotate(180)  # blade up, hilt down, like the game holds it
        out[name] = img
    return out


def items():
    """The wine glass, the allergy pills, the cracked phone, the car keys and the text bubble,
    from their pixel-art sheet (items_sheet.png, 4 screen pixels to each of theirs), cut out
    without the shadows under them. The bubble comes twice: as drawn ("im outside / open the
    d", read 3:33), and blank, for the game's own texts."""
    src = np.asarray(Image.open(os.path.join(SRC, 'items_sheet.png')).convert('RGB')).astype(int)
    px = src[2::4, 2::4]
    fig = (np.abs(px - 40).sum(2) > 6) & ~np.all(px == 30, axis=2)
    cols = fig.any(0)
    spans, start = [], None
    for x, v in enumerate(list(cols) + [False]):
        if v and start is None:
            start = x
        if not v and start is not None:
            spans.append((start, x))
            start = None
    out = {}
    for name, (a, b) in zip(('glass', 'pills', 'phone', 'keys', 'bubble'), spans):
        m = fig[:, a:b]
        rows = np.flatnonzero(m.any(1))
        rgb, al = px[rows[0]:rows[-1] + 1, a:b].copy(), m[rows[0]:rows[-1] + 1].copy()
        out[name] = Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8))
        if name == 'bubble':
            # blank: no "read 3:33", and the words painted over with the bubble's own speckle
            read = np.all(rgb == (88, 88, 90), axis=2)
            al = al & ~read
            rgb = rgb.copy()
            rng = np.random.default_rng(7)
            ys, xs = np.nonzero(np.all(rgb == (22, 22, 24), axis=2))
            for y, x in zip(ys, xs):
                if 4 <= y <= 22 and 5 <= x <= 52:  # the words, not the outline
                    rgb[y, x] = (206, 204, 200) if rng.random() < 0.4 else (156, 156, 160)
            keep = np.flatnonzero(al.any(1))
            out['bubbleBlank'] = Image.fromarray(np.dstack([rgb[:keep[-1] + 1], al[:keep[-1] + 1] * 255]).astype(np.uint8))
    return out


def early_bird():
    """The alarm clock (cracked, dripping) and the bird, for Early Bird, from their pixel-art sheet
    (early_sheet.png, 6 screen pixels to each of theirs), without the shadow, and the bird without
    the crumbs round its feet."""
    src = np.asarray(Image.open(os.path.join(SRC, 'early_sheet.png')).convert('RGB')).astype(int)
    px = src[3::6, 3::6]
    fig = (np.abs(px - 40).sum(2) > 6) & ~np.all(px == 30, axis=2)
    cols = fig.any(0)
    spans, start = [], None
    for x, v in enumerate(list(cols) + [False]):
        if v and start is None:
            start = x
        if not v and start is not None:
            spans.append((start, x))
            start = None
    out = {}
    for name, (a, b) in zip(('clock', 'bird'), spans):
        m = fig[:, a:b].copy()
        if name == 'bird':
            n, lab, stats, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
            m = lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        rows = np.flatnonzero(m.any(1))
        cs = np.flatnonzero(m.any(0))
        rgb = px[rows[0]:rows[-1] + 1, a + cs[0]:a + cs[-1] + 1]
        al = m[rows[0]:rows[-1] + 1, cs[0]:cs[-1] + 1]
        out[name] = Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8))
    return out


def rg_console():
    """The RG 405M, the handheld console (with something standing on its screen), from its
    pixel-art sheet (rg_sheet.png, 7 screen pixels to each of its), without the shadow."""
    src = np.asarray(Image.open(os.path.join(SRC, 'rg_sheet.png')).convert('RGB')).astype(int)
    px = src[3::7, 3::7]
    m = (np.abs(px - 40).sum(2) > 6) & ~np.all(px == 30, axis=2)
    rows, cols = np.flatnonzero(m.any(1)), np.flatnonzero(m.any(0))
    rgb = px[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    al = m[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    return {'rg': Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8))}


def speaker():
    """The speaker, from its pixel-art sheet (speaker_sheet.png, 7 screen pixels to each of its),
    with its cable but without its shadow."""
    src = np.asarray(Image.open(os.path.join(SRC, 'speaker_sheet.png')).convert('RGB')).astype(int)
    px = src[3::7, 3::7]
    m = (np.abs(px - 40).sum(2) > 6) & ~np.all(px == 30, axis=2)
    rows, cols = np.flatnonzero(m.any(1)), np.flatnonzero(m.any(0))
    rgb = px[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    al = m[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    return {'speaker': Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8))}


def cut(path, k, off, bg=40):
    """A pixel-art sheet back down to its own pixels (k screen pixels to each), and what's drawn."""
    im = Image.open(os.path.join(SRC, path))
    if im.mode == 'RGBA':
        src = np.asarray(im).astype(int)[off::k, off::k]
        return src[..., :3], src[..., 3] > 128
    px = np.asarray(im.convert('RGB')).astype(int)[off::k, off::k]
    return px, (np.abs(px - bg).sum(2) > 6) & ~np.all(px == 30, axis=2)


def crop(rgb, m):
    rows, cols = np.flatnonzero(m.any(1)), np.flatnonzero(m.any(0))
    return rgb[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1], m[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]


def rgba(rgb, m):
    return Image.fromarray(np.dstack([rgb, m * 255]).astype(np.uint8))


def arms():
    """The creature's arm at each of its five stages (arms_sheet.png, 5 screen pixels to each of
    theirs), torn off at the shoulder, for the attacks that reach for Crispy. With each, where its
    shoulder is (the pivot) and how far its fingers go."""
    px, m = cut('arms_sheet.png', 5, 2)
    out, meta = [], []
    rows = m.any(1)
    spans, start = [], None
    for y, v in enumerate(list(rows) + [False]):
        if v and start is None:
            start = y
        if not v and start is not None:
            spans.append((start, y))
            start = None
    for a, b in spans[:5]:
        rgb, mm = crop(px[a:b], m[a:b])
        h = mm.sum(0)
        x0 = int(np.argmax(h > h.max() * 0.6))  # where the arm (not its torn bits) starts
        ys = np.flatnonzero(mm[:, x0])
        meta.append({'w': int(mm.shape[1]), 'h': int(mm.shape[0]), 'px': x0 + 2, 'py': int((ys[0] + ys[-1]) / 2)})
        out.append(rgba(rgb, mm))
    return out, meta


def jaw_frames():
    """The jaw opening, in ten frames from shut to wide open (jaw_frames.png, 3 screen pixels to
    each of theirs, five to a row), each with its hinge (the back of the jaw) to line them up."""
    px, m = cut('jaw_frames.png', 3, 1)
    H, W = m.shape
    ch, cw = H // 2, W // 5
    frames, meta = [], []
    for r in range(2):
        for c in range(5):
            rgb, mm = crop(px[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], m[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw])
            ys = np.flatnonzero(mm[:, :3].any(1))
            frames.append(rgba(rgb, mm))
            meta.append({'w': int(mm.shape[1]), 'h': int(mm.shape[0]), 'hx': 1, 'hy': int((ys[0] + ys[-1]) / 2)})
    return frames, meta


def killer():
    """The killer (killer_sheet.png, 8 screen pixels to each of his)."""
    rgb, m = cut('killer_sheet.png', 8, 4)
    rgb, m = crop(rgb, m)
    return rgba(rgb, m)


def scares():
    """The pictures that flash past after the killer's jumpscare (scare_1..5 in assets/source,
    not in the repo): small, dim, a little washed of colour, but clear."""
    out = []
    for i in range(1, 6):
        path = next((os.path.join(SRC, f'scare_{i}.{e}') for e in ('png', 'webp', 'jpg') if os.path.exists(os.path.join(SRC, f'scare_{i}.{e}'))), None)
        if not path:
            continue
        im = Image.open(path).convert('RGB')
        im.thumbnail((160, 120), Image.LANCZOS)
        canvas = Image.new('RGB', (160, 120))
        canvas.paste(im, ((160 - im.width) // 2, (120 - im.height) // 2))
        a = np.asarray(canvas).astype(float)
        grey = a @ [0.3, 0.59, 0.11]
        a = grey[..., None] * 0.35 + a * 0.65
        a = a * 0.62
        out.append(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
    return out


def gavel():
    """Authority's gavel (gavel_sheet.png, 6 screen pixels to each of its): on its own, raised,
    and striking its block."""
    px, m = cut('gavel_sheet.png', 6, 3)
    cols = m.any(0)
    spans, start = [], None
    for x, v in enumerate(list(cols) + [False]):
        if v and start is None:
            start = x
        if not v and start is not None:
            spans.append((start, x))
            start = None
    return {k: rgba(*crop(px[:, a:b], m[:, a:b])) for k, (a, b) in zip(('gavel', 'gavelHit'), spans)}


def flag():
    """The white flag, torn and bloodied, for SPARE (flag_sheet.png, 6 screen pixels to each of
    its)."""
    px, m = cut('flag_sheet.png', 6, 3)
    return {'flag': rgba(*crop(px, m))}


def scare_face():
    """The face that flashes up close in the killer's jumpscare (scare_face.png, not in the
    repo): pixelated, a little dim, still clear."""
    path = os.path.join(SRC, 'scare_face.png')
    if not os.path.exists(path):
        return None
    im = Image.open(path).convert('RGB')
    im = im.resize((im.width // 3, im.height // 3), Image.LANCZOS)
    return Image.fromarray(np.clip(np.asarray(im).astype(float) * 0.8, 0, 255).astype(np.uint8))


def behind():
    """The pictures that flash when the killer behind Crispy gets all the way in (behind_1..4 in
    assets/source, not in the repo): cropped clear of their borders (and the arrows and dots of
    the screenshots), to fill the screen, small, dim."""
    crops = {1: (0, 6, 508, 387), 2: (0, 6, 508, 387), 3: (0, 60, 715, 596), 4: (34, 0, 867, 625)}
    out = []
    for i in range(1, 5):
        path = next((os.path.join(SRC, f'behind_{i}.{e}') for e in ('png', 'webp', 'jpg') if os.path.exists(os.path.join(SRC, f'behind_{i}.{e}'))), None)
        if not path:
            continue
        im = Image.open(path).convert('RGB').crop(crops[i]).resize((160, 120), Image.LANCZOS)
        a = np.asarray(im).astype(float)
        a = (a @ [0.3, 0.59, 0.11])[..., None].repeat(3, 2) * 0.6 + a * 0.4
        out.append(Image.fromarray(np.clip(a * 0.6, 0, 255).astype(np.uint8)))
    return out


def memories():
    """The family photos Crispy sees when he falls, as faded, grainy pixel pictures, like the
    item sheet: small, mostly grey, washed out, speckled. (memory_1..4 in assets/source, not in
    the repo.)"""
    crops = {1: (50, 100, 1950, 1525), 2: (0, 20, 647, 505), 3: (25, 470, 725, 995), 4: (0, 420, 1500, 1545)}
    out = []
    rng = np.random.default_rng(3)
    for i in range(1, 5):
        path = os.path.join(SRC, f'memory_{i}.webp')
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert('RGB').crop(crops[i]).resize((176, 132), Image.LANCZOS)
        a = np.asarray(im).astype(float)
        grey = a @ [0.3, 0.59, 0.11]
        a = grey[..., None] * 0.78 + a * 0.22  # mostly grey: a little of the colour left
        a = (a - a.mean()) * 1.15 + a.mean()  # faces readable
        a = 48 + (np.clip(a, 0, 255) / 255) ** 0.9 * 178  # washed out: no real black, no real white
        a += rng.normal(0, 6, a.shape[:2])[..., None]  # a little speckle
        a = np.round(a / 16) * 16  # a few tones, like the sheet
        # a little darker towards the edges
        yy, xx = np.mgrid[0:132, 0:176]
        v = 1 - 0.35 * (((xx - 88) / 88) ** 2 + ((yy - 66) / 66) ** 2) ** 2
        a *= np.clip(v, 0.45, 1)[..., None]
        out.append(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
    return out


def profiles():
    """The doc's profile of each stage, small, for the HUD."""
    return [Image.open(os.path.join(ROOT, 'assets', 'profiles', f'basswood_{i}.png')).convert('L').resize((216, 216), Image.LANCZOS) for i in range(1, 6)]


if __name__ == '__main__':
    sprite, anchors = crispy()
    forms = creature()
    things = props()
    arm_imgs, arm_meta = arms()
    jaw_imgs, jaw_meta = jaw_frames()
    images = {
        'night': data_url(night(1.0), 'JPEG', quality=86),
        'nightLit': data_url(night(2.6), 'JPEG', quality=86),
        **({'kitchen': data_url(kitchen(), 'JPEG', quality=90), 'kitchenFlash': data_url(kitchen(True), 'JPEG', quality=86)} if os.path.exists(os.path.join(SRC, 'kitchen.webp')) else {}),
        'crispy': data_url(sprite),
        'crispyAnchors': anchors,
        'creature': [data_url(f) for f, _ in forms],
        'creatureMeta': [m for _, m in forms],
        'props': {**{k: data_url(v) for k, v in things.items()}, **{k: data_url(v) for k, v in items().items()}, **{k: data_url(v) for k, v in early_bird().items()}, **{k: data_url(v) for k, v in rg_console().items()}, **{k: data_url(v) for k, v in speaker().items()}, **{k: data_url(v) for k, v in gavel().items()}, **{k: data_url(v) for k, v in flag().items()}},
        'memories': [data_url(m) for m in memories()],
        'arms': [data_url(a) for a in arm_imgs],
        'armMeta': arm_meta,
        'jaw': [data_url(f) for f in jaw_imgs],
        'jawMeta': jaw_meta,
        'killer': data_url(killer()),
        'scares': [data_url(x) for x in scares()],
        'scareFace': data_url(face) if (face := scare_face()) else None,
        'behind': [data_url(x) for x in behind()],
        'profiles': [data_url(p) for p in profiles()],
    }
    with open(os.path.join(CRISPY, 'js', 'images.js'), 'w') as f:
        f.write('// Generated by crispy/tools/make_images.py: the room at night, Crispy, the creature.\n')
        f.write('window.CRISPY_IMAGES = ' + json.dumps(images) + ';\n')
    print('wrote crispy/js/images.js', f'({os.path.getsize(os.path.join(CRISPY, "js", "images.js")) // 1024} KB)')
