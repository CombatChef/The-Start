"""Builds the art for Crispy's birthday battle into crispy/js/images.js.

    pip install numpy opencv-python-headless pillow
    python3 crispy/tools/make_images.py

From crispy/assets/source/ (the photos aren't in the repo: put them there first):
  living_room.webp  -> the room at night, lit faintly orange from the ceiling fan's lamp (and a
                       brighter version, for when the lights are turned up), not pixelated
  crispy_photo.webp -> Crispy as a pixel sprite in colour, from the collar up, his face turned a
  crispy_mask.png      little to the right (the mask cuts him out of the photo: make it with
                       crispy/tools/cutout.py; the pixels are kept as crispy_pixels.png once made)
the creature's five forms from its pixel-art sprite sheet (creature_sheet.webp), the trash bag,
grilled cheese and sword from theirs (props_sheet.png), the wine glass, pills, phone, car keys
and text bubble from theirs (items_sheet.png), the alarm clock and the bird from theirs
(early_sheet.png), the creature's doc profiles (the repo's
assets/profiles/) for the HUD, and the family photos he sees when he falls (memory_1..4.webp,
not in the repo either).
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
    images = {
        'night': data_url(night(1.0), 'JPEG', quality=86),
        'nightLit': data_url(night(2.6), 'JPEG', quality=86),
        'crispy': data_url(sprite),
        'crispyAnchors': anchors,
        'creature': [data_url(f) for f, _ in forms],
        'creatureMeta': [m for _, m in forms],
        'props': {**{k: data_url(v) for k, v in things.items()}, **{k: data_url(v) for k, v in items().items()}, **{k: data_url(v) for k, v in early_bird().items()}},
        'memories': [data_url(m) for m in memories()],
        'profiles': [data_url(p) for p in profiles()],
    }
    with open(os.path.join(CRISPY, 'js', 'images.js'), 'w') as f:
        f.write('// Generated by crispy/tools/make_images.py: the room at night, Crispy, the creature.\n')
        f.write('window.CRISPY_IMAGES = ' + json.dumps(images) + ';\n')
    print('wrote crispy/js/images.js', f'({os.path.getsize(os.path.join(CRISPY, "js", "images.js")) // 1024} KB)')
