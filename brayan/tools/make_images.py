"""Builds the art for Brayan's fight into brayan/js/images.js.

    pip install numpy opencv-python-headless pillow
    python3 brayan/tools/make_images.py

From brayan/assets/source/ (the photos, the portrait and the classroom's frames aren't in the
repo: put them there first):
  hallway.webp, hallway_a.webp, classroom.webp
                       -> the school after hours: the entrance hallway, the hallway further in
                          (HALLWAY A), and CLASSROOM A (darker still), every light off but one (the
                          classroom's: the smartboard, still on); the school's name and logo, and the teacher's
                          nameplate, taken off; not pixelated. And each hallway as the gunman's
                          shot lights it up, for an instant, in big pixels.
  brayan_portrait.png  -> Brayan, as pixels (12 screen pixels to each of his, on grey)
  gunman_sheet.png     -> the gunman (8 screen pixels to each of his), lit as the hall lights him,
                          and his shadow and reflection on each hallway's floor; and faces made
                          from his, for his attacks on Brayan's nerve; and his own face, with the
                          faces of the thing in Crispy's kitchen (crispy/assets/source/), for one
                          of them
  items_sheet.png      -> the fuel can, the Newports, the bacon egg & cheese, the keys (BUS 13),
                          the bear (4 screen pixels to each); and the can, the keys and the bear
                          as they sit in the dark, where they're hidden (the bear: on one of four
                          chairs, a different one each time)
  tree_sheet.png       -> the thing in CLASSROOM A (3 to each)
  roots_sheet.png      -> its roots, out of the ceiling (3 to each)
  scare_frames.jpg     -> its jumpscare: sixteen frames, four by four
"""
import base64
import io
import json
import os

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = os.path.join(ROOT, 'assets', 'source')
W, H = 1280, 960  # the stage

# Each place: the photo (upright), the band of it the stage shows (from `crop`, at k = W / its
# width), the horizon (`hz`, photo pixels: the phone was `cam` metres up), the one light left on
# (`light`), where the floor meets the far end (`end`), and what's taken off it (`scrub`).
PLACES = {
    'entrance': dict(file='hallway.webp', width=1500, crop=210, hz=574, cam=1.52, light=(726, 492), end=785,
                     pool=(220, 160), fall=190, scrub=[(568, 643, 674, 718), (534, 638, 560, 717), (608, 501, 657, 519)],
                     # the gunman: where his feet are (photo), how tall he is (metres)
                     feet=(690, 1014), tall=2.35),
    'hallA': dict(file='hallway_a.webp', width=2142, crop=632, hz=1242, cam=1.08, light=(1080, 1150), end=1290,
                  pool=(150, 120), fall=150, scrub=[],
                  feet=(1072, 1728), tall=2.12),
    'classA': dict(file='classroom.webp', width=2142, crop=560,
                   scrub=[(222, 1450, 320, 1486)]),  # (the teacher's nameplate)
}


def k_of(p):
    return W / p['width']


def stage(p, x, y):
    """A point in a place's photo, on the stage."""
    k = k_of(p)
    return (x * k, (y - p['crop']) * k)


def data_url(img, fmt='PNG', **kw):
    buf = io.BytesIO()
    img.save(buf, fmt, **kw)
    return f'data:image/{fmt.lower()};base64,' + base64.b64encode(buf.getvalue()).decode()


def photo(p):
    """A place's photo, scrubbed, cropped and scaled to the stage, as linear light."""
    im = np.asarray(Image.open(os.path.join(SRC, p['file'])).convert('RGB')).copy()
    if p['scrub']:
        mask = np.zeros(im.shape[:2], np.uint8)
        for x0, y0, x1, y1 in p['scrub']:
            mask[y0:y1, x0:x1] = 255
        im = cv2.inpaint(im, mask, 6, cv2.INPAINT_TELEA)
    k = k_of(p)
    src = Image.fromarray(im).crop((0, p['crop'], p['width'], p['crop'] + round(H / k))).resize((W, H), Image.LANCZOS)
    return (np.asarray(src).astype(np.float32) / 255) ** 2.2


def to_image(a):
    return Image.fromarray((np.clip(a, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8))


LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)
COLD = np.array([0.78, 0.92, 0.95], np.float32)  # a school's tubes: cold, a little green
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


# ---------------------------------------------------------------- the hallways, after hours

def hall(name):
    """A hallway after hours: every light off but the one at the far end, so the end and the
    floor before it are dimly lit and cold and everything nearer falls away into the dark; the
    polished floor still catching that light."""
    p = PLACES[name]
    a = photo(p)
    lum = a @ LUMA
    lx, ly = stage(p, *p['light'])
    hz = stage(p, 0, p['hz'])[1]
    # the ceiling's lights off (all but the far one): the tubes go grey
    fixture = (np.clip((lum - 0.55) / 0.3, 0, 1) * (yy < hz)).astype(np.float32)
    far = np.exp(-(((xx - lx) / 90) ** 2 + ((yy - ly) / 14) ** 2))
    a = a * (1 - 0.9 * (fixture * (1 - np.clip(far * 3, 0, 1)))[..., None])
    grey = (a @ LUMA)[..., None]
    a = a * 0.45 + grey * 0.55
    sx, sy = p['pool']
    pool = np.exp(-(((xx - lx) / sx) ** 2 + ((yy - (ly + 60)) / sy) ** 2))
    fall = 1 / (1 + ((xx - lx) ** 2 + (yy - ly) ** 2 * 1.4) / p['fall'] ** 2)
    a = a * (np.array([0.0009, 0.0011, 0.0017], np.float32) + COLD * (0.24 * pool + 0.06 * fall ** 1.8)[..., None])
    # the polished floor throws the light back at us: a long streak down the middle
    floor = stage(p, 0, p['end'])[1]
    d = np.clip(yy - floor, 0, None)
    streak = np.exp(-((xx - lx) / (26 + d * 0.32)) ** 2) * (yy > floor) * np.exp(-d / 260) * np.clip(d / 12, 0, 1)
    a += (streak * 0.03)[..., None] * COLD
    # the tube itself
    a += (far * 0.5)[..., None] * COLD
    a += (np.exp(-(((xx - lx) / 160) ** 2 + ((yy - ly) / 40) ** 2)) * 0.03)[..., None] * COLD
    v = np.clip(1 - 0.75 * (((xx - lx) / (W * 0.5)) ** 2 + ((yy - H * 0.42) / (H * 0.62)) ** 2), 0.1, 1)
    return a * v[..., None]


def hall_flash(name):
    """The same hallway, for the instant the gunman's shot lights it: every wall and tile there,
    white, brightest where the gun is; in big pixels."""
    p = PLACES[name]
    a = photo(p)
    grey = (a @ LUMA)[..., None]
    a = a * 0.25 + grey * 0.75
    gx, gy = gun_point(name)
    r = np.sqrt((xx - gx) ** 2 + (yy - gy) ** 2)
    a = a * (0.35 + 1.4 / (1 + (r / 260) ** 2))[..., None] * np.array([1.0, 0.97, 0.9], np.float32)
    small = to_image(a / (1 + a * 0.4)).resize((W // 5, H // 5), Image.BOX)
    return small


# ---------------------------------------------------------------- CLASSROOM A, after hours

SCREEN = (585, 1134, 808, 1300)  # the smartboard (photo pixels): still on
CLASS_DIM = 0.36  # (CLASSROOM A is darker than the halls: much)


def classroom():
    """CLASSROOM A after hours: dark but for the smartboard, still on at the front of the room,
    its cold blue on the desks in front of it and the floor, a little; and the faintest grey
    from the hall through the door, at the right."""
    p = PLACES['classA']
    a = photo(p)
    grey = (a @ LUMA)[..., None]
    a = a * 0.4 + grey * 0.6
    x0, y0 = stage(p, SCREEN[0], SCREEN[1])
    x1, y1 = stage(p, SCREEN[2], SCREEN[3])
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    screen = ((xx > x0) & (xx < x1) & (yy > y0) & (yy < y1)).astype(np.float32)
    screen = cv2.GaussianBlur(screen, (0, 0), 1.5)
    blue = np.array([0.55, 0.72, 1.0], np.float32)
    glow = np.exp(-(((xx - cx) / 360) ** 2 + ((yy - (cy + 140)) / 260) ** 2))
    fall = 1 / (1 + ((xx - cx) ** 2 + (yy - cy) ** 2) / 230 ** 2)
    door = np.exp(-(((xx - 1240) / 120) ** 2 + ((yy - 520) / 380) ** 2))
    light = (np.array([0.0007, 0.0008, 0.0012], np.float32)
             + blue * (0.042 * glow + 0.03 * fall ** 1.5)[..., None]
             + np.array([0.6, 0.7, 0.8], np.float32) * (0.012 * door)[..., None]) * CLASS_DIM
    a = a * light * (1 - screen[..., None]) + a * screen[..., None] * blue * 0.22
    v = np.clip(1 - 0.6 * (((xx - cx) / (W * 0.6)) ** 2 + ((yy - H * 0.5) / (H * 0.7)) ** 2), 0.15, 1)
    return a * v[..., None]


# ---------------------------------------------------------------- sprites

def cut(name, k, bg=None, box=None):
    """A pixel-art image at its own pixels (k screen pixels to each), as RGBA; `bg`, a flat
    background colour to make see-through; `box`, a part of it (in its own pixels)."""
    im = Image.open(os.path.join(SRC, name)).convert('RGBA')
    a = np.asarray(im)[k // 2::k, k // 2::k].copy()
    if box:
        a = a[box[1]:box[3], box[0]:box[2]].copy()
    if bg is not None:
        a[(np.abs(a[..., :3].astype(int) - bg).sum(2) < 14), 3] = 0
    ys, xs = np.nonzero(a[..., 3])
    return Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def portrait():
    """Brayan, as pixels, his grey taken away (his badge puts its own behind him); a little
    greyer and dimmer than the picture, for the dark he's standing in."""
    im = Image.open(os.path.join(SRC, 'brayan_portrait.png')).convert('RGBA')
    a = np.asarray(im)[6::12, 6::12].copy()
    a[(np.abs(a[..., :3].astype(int) - 40).sum(2) < 6), 3] = 0
    rgb = a[..., :3].astype(np.float32)
    grey = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    rgb = (rgb * 0.62 + grey[..., None] * 0.38) * 0.92 + np.array([0, 2, 6], np.float32)
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(a)


def gunman():
    return cut('gunman_sheet.png', 8)


FEET_X = 21.5  # (the middle of his feet, in his sprite: the gun arm sticks out to one side)
MUZZLE = (64, 77)  # the end of his gun, in his sprite


def gunman_pic():
    """For his box: his head and shoulders, grey, on black."""
    a = np.asarray(gunman().crop((0, 0, 44, 44))).astype(np.float32)
    grey = a[..., :3] @ np.array([0.3, 0.59, 0.11])
    g = np.clip((grey - 30) * 1.25, 0, 255) * (a[..., 3] / 255)
    return Image.fromarray(g.astype(np.uint8), 'L')


def lit_gunman():
    """The gunman as the hall shows him: the one light is behind him and above, so he's dark,
    with a thin, faint cold edge of light on his head and shoulders and down his arms (less and
    less towards his feet), and his front just readable in what the floor throws back."""
    a = np.asarray(gunman()).astype(np.float32)
    rgb, al = a[..., :3] / 255, a[..., 3] > 0
    h, w = al.shape
    pad = np.pad(al, 1)
    open_side = (~pad[1:-1, :-2]) | (~pad[1:-1, 2:])
    open_top = ~pad[:-2, 1:-1]
    up = np.clip(1.05 - np.arange(h)[:, None] / h * 1.25, 0.0, 1) ** 1.3
    rim = al * np.clip(open_side * up + open_top * 0.8 * (np.arange(h)[:, None] < h * 0.5), 0, 1)
    grey = rgb @ np.array([0.3, 0.59, 0.11])
    rgb = rgb * 0.4 + grey[..., None] * 0.6
    rgb = rgb * 0.27 + rim[..., None] * np.array([0.15, 0.19, 0.21])
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, al * 255]).astype(np.uint8), 'RGBA')


def placement(name):
    """Where the gunman stands in a hallway: his feet on the stage, and screen pixels to each of
    his (so he's as tall as he is, there)."""
    p = PLACES[name]
    fx, fy = stage(p, *p['feet'])
    tall = (p['feet'][1] - p['hz']) * p['tall'] / p['cam'] * k_of(p)
    return fx, fy, tall / gunman().height


def gun_point(name):
    fx, fy, s = placement(name)
    h = gunman().height
    return fx + (MUZZLE[0] - FEET_X) * s, fy - (h - MUZZLE[1]) * s


def with_shadow(name, bg):
    """A hallway with the gunman's shadow and reflection on its floor (he's drawn over it, and
    sways; they stay): his shadow thrown down the hall towards Brayan (the light's behind him),
    cutting across the light the floor throws back; his reflection in it, soft, gone in a few
    feet of floor."""
    p = PLACES[name]
    sp = lit_gunman()
    fx, fy, scale = placement(name)
    big = sp.resize((round(sp.width * scale), round(sp.height * scale)), Image.NEAREST)
    x0 = round(fx - FEET_X * scale)
    Y = yy[:, :1]
    X = xx[:1, :]
    body = 10 * scale
    t = np.clip((Y - fy) / (H - fy), 0, 1)
    half = body * (0.55 + 1.6 * t)
    centre = fx + (fx - stage(p, *p['light'])[0]) * 0.6 * t
    shadow = np.exp(-(np.abs(X - centre) / half) ** 4) * (Y >= fy) * (1 - t) ** 0.7
    shadow = cv2.GaussianBlur(shadow.astype(np.float32), (0, 0), 3)
    contact = np.zeros((H, W), np.float32)
    cv2.ellipse(contact, (round(fx), round(fy)), (round(body * 1.1), 6), 0, 0, 360, 1, -1)
    contact = cv2.GaussianBlur(contact, (0, 0), 3)
    refl = np.zeros((H, W), np.float32)
    rimg = np.zeros((H, W, 3), np.float32)
    ra = np.asarray(big.transpose(Image.FLIP_TOP_BOTTOM)).astype(np.float32)
    rh = min(ra.shape[0], H - round(fy))
    xs0, xs1 = max(0, x0), min(W, x0 + big.width)
    refl[round(fy):round(fy) + rh, xs0:xs1] = ra[:rh, xs0 - x0:xs1 - x0, 3] / 255
    rimg[round(fy):round(fy) + rh, xs0:xs1] = ra[:rh, xs0 - x0:xs1 - x0, :3]
    fade = np.clip(1 - (Y - fy) / 150, 0, 1) ** 1.5
    refl = cv2.GaussianBlur(refl, (0, 0), sigmaX=1.0, sigmaY=4) * fade
    rimg = cv2.GaussianBlur(rimg, (0, 0), sigmaX=1.0, sigmaY=4)
    dark = np.clip(0.8 * shadow + 0.7 * contact + 0.55 * refl, 0, 0.92)
    b = np.asarray(bg).astype(np.float32)
    b = b * (1 - dark[..., None]) + rimg * (refl * 0.35)[..., None]
    return Image.fromarray(np.clip(b, 0, 255).astype(np.uint8))


# his attacks on Brayan's nerve: faces, made from his, in the dark

def faces():
    """Five faces from the gunman's own (his head, his greys): stretched long; its mouth hanging
    open; its eyes gone to holes with a pinprick of light in each; a grin too wide for it; and
    turned on its side."""
    head = np.asarray(gunman().crop((8, 0, 40, 34))).copy()
    dark = np.array([16, 14, 14, 255], np.uint8)
    pale = np.array([214, 208, 200, 255], np.uint8)
    out = []
    # long: below the brow, twice as long
    top, rest = head[:11], head[11:]
    long_ = np.concatenate([top, np.repeat(rest, 2, axis=0)[::1]], 0)
    out.append(long_)
    # gaping: the jaw dropped too far, a ragged black hole of a mouth, teeth along its top
    g = np.concatenate([head[:26], np.repeat(head[26:27], 9, axis=0), head[26:]], 0)
    mouth = np.zeros(g.shape[:2], np.uint8)
    cv2.ellipse(mouth, (16, 30), (6, 8), 0, 0, 360, 1, -1)
    rng = np.random.default_rng(7)
    for yk in range(22, 40):  # (a ragged edge)
        row = np.nonzero(mouth[yk])[0]
        if len(row):
            mouth[yk, max(0, row[0] - rng.integers(0, 2)):row[-1] + 1 + rng.integers(0, 2)] = 1
    g[mouth > 0] = dark
    top = [np.nonzero(mouth[:, xk])[0] for xk in range(32)]
    for xk in range(11, 22, 2):
        if len(top[xk]):
            g[top[xk][0], xk] = pale
    out.append(g)
    # hollow: the eyes holes, a point of light in each
    hl = head.copy()
    for ex in (12, 21):
        cv2.ellipse(hl, (ex, 15), (3, 3), 0, 0, 360, dark.tolist(), -1)
        hl[15, ex] = pale
    out.append(hl)
    # grin: from ear to ear
    gr = head.copy()
    for xk in range(3, 30):
        yk = int(round(27 - 5 * ((xk - 16) / 13) ** 2))
        gr[yk:yk + 2, xk] = dark
        if xk % 2 == 0 and 5 < xk < 28:
            gr[yk - 1, xk] = pale
    out.append(gr)
    # on its side
    out.append(np.rot90(hl, 1).copy())
    return [Image.fromarray(f) for f in out]


def crowd():
    """The faces for his worst one: his own (as it is), and the faces of the thing in Crispy's
    kitchen, all five of them (from its sheet, in the repo), greyed a little for the dark."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('crispy_art', os.path.join(ROOT, '..', 'crispy', 'tools', 'make_images.py'))
    crispy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(crispy)
    out = [gunman().crop((8, 0, 40, 34))]
    for (img, m), tall in zip(crispy.creature(), (37, 39, 34, 34, 36)):  # (to just under the chin)
        a = np.asarray(img).copy()
        x0 = max(0, int(m['cx'] - 11))
        head = a[:tall, x0:x0 + 23].copy()
        for k in range(4):  # (gone into the dark at the neck, in a dither)
            row = head[tall - 4 + k, :, 3]
            row[(np.arange(row.size) + k) % 4 < k + 1] = 0
        rgb = head[..., :3].astype(np.float32)
        grey = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
        head[..., :3] = np.clip(rgb * 0.6 + grey[..., None] * 0.4, 0, 255).astype(np.uint8)
        out.append(Image.fromarray(head))
    return out


# ---------------------------------------------------------------- the items, and where they're hidden

ITEM_BOXES = {  # (in the sheet's own pixels)
    'can': (10, 10, 72, 80), 'newports': (82, 10, 144, 86), 'bec': (154, 26, 238, 85),
    'keys': (249, 14, 337, 78), 'bear': (347, 18, 403, 86), 'bottle': (413, 20, 453, 86),
}


def items():
    return {k: cut('items_sheet.png', 4, bg=(40, 40, 40), box=b) for k, b in ITEM_BOXES.items()}


# Where each hidden thing is, on the stage. The keys and the bear: where they sit (`x`, `y`: the
# middle of their bottom edge) and their size there (the keys lie flat on the desk: squashed).
# The can stands on the floor of HALLWAY A, in a doorway: each of its faces as four corners on the
# stage (top left, top right, bottom right, bottom left).
HIDDEN = {
    # the can, standing in a doorway of HALLWAY A, turned to Brayan: its big face (the X, the
    # handles on top) square on, its side going off down the hall towards the far end, its top
    'hallA': {'can': dict(front=[(446, 503), (499, 500), (499, 569), (446, 572)], side=[(499, 500), (510, 490), (510, 555), (499, 569)],
                          top=[(446, 503), (499, 500), (510, 490), (459, 493)], color=(21, 11, 10))},
    # the keys flat on the teacher's desk; the bear on a chair: one of these, a different one
    # each time (`seats`)
    'classA': {'keys': dict(x=253, y=537, w=30, h=14, color=(20, 19, 15)),
               'bear': dict(seats=[dict(x=887, y=682, w=42, h=51), dict(x=654, y=689, w=44, h=53), dict(x=474, y=572, w=30, h=36),
                                   dict(x=1140, y=551, w=32, h=38)], color=(13, 11, 9))},
}
# (`color`: how they come out in the dark, on average: a deep, dull red; grey and a little
# brass; brown)


def warp(img, quad, size, off):
    """An RGBA image (floats) warped onto a four-cornered shape on the stage (corners as above),
    in a canvas `size` big whose top left is at `off`."""
    h, w = img.shape[:2]
    big = cv2.resize(img, (w * 4, h * 4), interpolation=cv2.INTER_NEAREST)
    src = np.float32([[0, 0], [w * 4, 0], [w * 4, h * 4], [0, h * 4]])
    dst = np.float32([(x - off[0], y - off[1]) for x, y in quad])
    m = cv2.getPerspectiveTransform(src, dst)
    pre = big.copy()
    pre[..., :3] *= pre[..., 3:4]  # (so the edges don't bleed dark)
    out = cv2.warpPerspective(pre, m, size, flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    rgb = out[..., :3] / np.maximum(out[..., 3:4], 1e-4)
    return np.dstack([np.clip(rgb, 0, 1), np.clip(out[..., 3], 0, 1)])


def can_standing(sp, at):
    """The fuel can, standing, turned to us: its big face (the sprite: the X, the handles and the
    spout on top) square on, a little darker (the light's behind it, at the far end); its side,
    going off towards that light, lighter, with a cold edge; its top, from a little above."""
    a = np.asarray(sp).astype(np.float32) / 255
    widths = (a[..., 3] > 0.5).sum(1)
    full = widths > widths.max() * 0.85
    top = next(y for y in range(len(full)) if full[y:y + 6].all())  # (where the can starts, under its handles)
    TL, TR, BR, BL = (np.array(c, np.float32) for c in at['front'])
    ext = top / (a.shape[0] - top)
    cols = np.flatnonzero((a[top:top + 40, :, 3] > 0.5).sum(0) > 20)  # (its body, left to right: the spout sticks out)
    bw = cols[-1] + 1 - cols[0]
    left, right = cols[0] / bw, (a.shape[1] - cols[-1] - 1) / bw
    TL, BL, TR, BR = TL - (TR - TL) * left, BL - (BR - BL) * left, TR + (TR - TL) * right, BR + (BR - BL) * right
    front = [tuple(TL + (TL - BL) * ext), tuple(TR + (TR - BR) * ext), tuple(BR), tuple(BL)]
    pts = np.array(front + at['side'] + at['top'], np.float32)
    x0, y0 = np.floor(pts.min(0)).astype(int) - 2
    x1, y1 = np.ceil(pts.max(0)).astype(int) + 2
    size = (x1 - x0, y1 - y0)
    body = a.copy()
    body[..., :3] *= 0.88
    face = warp(body, front, size, (x0, y0))
    strip = a[top:, 4:14].copy()
    strip[..., :3] *= 1.12
    strip[..., 3] = 1
    strip[:, -1, :3] = np.clip(strip[:, -1, :3] * 1.5 + 0.06, 0, 1)  # (the far edge, catching the light)
    side = warp(strip, at['side'], size, (x0, y0))
    solid = a[top:][a[top:, :, 3] > 0.5, :3]
    patch = np.ones((10, 24, 4), np.float32)
    patch[..., :3] = np.median(solid, 0) * 1.1  # (plain painted metal, a little lighter: it faces up)
    patch[:, :, :3] *= np.linspace(0.9, 1.15, 10)[:, None, None]  # (lighter going back, towards the light)
    patch[::2, ::2, :3] *= 0.9  # (worn)
    lid = warp(patch, at['top'], size, (x0, y0))
    out = lid
    for layer in (side, face):
        al = layer[..., 3:4]
        out = np.dstack([layer[..., :3] * al + out[..., :3] * (1 - al), al + out[..., 3:4] * (1 - al)])
    return out, int(x0), int(y0)


def hidden(place, bg):
    """The hidden things as they sit in the dark: their size and angle there, lit only as much as
    what's around them (a touch more, so there's something to find), the colour of that light;
    a soft shadow where each meets what it's on. Each with where it goes and the box to tap."""
    sprites = items()
    out = {}
    b = np.asarray(bg).astype(np.float32) / 255
    for name, spec in HIDDEN[place].items():
      spots = [{**seat, 'color': spec['color']} for seat in spec['seats']] if 'seats' in spec else [spec]
      made = []
      for at in spots:
        sp = sprites[name]
        if 'front' in at:
            small, x0, y0 = can_standing(sp, at)
            h, w = small.shape[:2]
            base = np.array([at['front'][3], at['front'][2], at['side'][2]], np.float32)  # its bottom edge
        else:
            w, h = at['w'], at['h']
            small = np.asarray(sp.resize((w, h), Image.BOX)).astype(np.float32) / 255
            small[..., 3] = (small[..., 3] > 0.45).astype(np.float32)  # (crisp, like its pixels)
            x0, y0 = round(at['x'] - w / 2), round(at['y'] - h)
            base = np.array([(x0, at['y'] - 1), (x0 + w, at['y'] - 1)], np.float32)
        around = b[max(0, y0 - h // 2):min(H, y0 + h + h // 2), max(0, x0 - w):min(W, x0 + 2 * w)].reshape(-1, 3)
        rgb = small[..., :3]
        lum = rgb @ np.array([0.3, 0.59, 0.11])
        rgb = rgb * 0.6 + lum[..., None] * 0.4
        solid = small[..., 3] > 0.5
        rgb = rgb * (np.array(at['color'], np.float32) / 255) / np.maximum(rgb[solid].mean(0), 1e-3)
        alpha = small[..., 3]
        # a soft shadow along where it meets the floor (or the desk, or the seat)
        pad = 6
        canvas = np.zeros((h + pad * 2, w + pad * 2, 4), np.float32)
        sh = np.zeros(canvas.shape[:2], np.float32)
        line = (base - [x0 - pad, y0 - pad]).astype(np.int32)
        cv2.polylines(sh, [line], False, 1, max(2, int(h * 0.08)))
        sh = cv2.GaussianBlur(sh, (0, 0), 2) * 0.65
        canvas[..., 3] = sh
        region = canvas[pad:pad + h, pad:pad + w]
        a = alpha[..., None]
        region[..., :3] = rgb * a
        region[..., 3:4] = a + region[..., 3:4] * (1 - a)
        img = Image.fromarray((np.clip(canvas, 0, 1) * 255).astype(np.uint8), 'RGBA')
        made.append({'src': data_url(img), 'x': x0 - pad, 'y': y0 - pad, 'w': img.width, 'h': img.height,
                     'hit': [x0 - 12, y0 - 12, w + 24, h + 24]})
      out[name] = made if 'seats' in spec else made[0]
    return out


# ---------------------------------------------------------------- the thing in CLASSROOM A

def tree():
    return cut('tree_sheet.png', 3, bg=(40, 40, 40))


def roots():
    """Its roots, each with its clod of ceiling at the top, smallest first (as they grow)."""
    a = np.asarray(Image.open(os.path.join(SRC, 'roots_sheet.png')).convert('RGBA'))[1::3, 1::3].copy()
    rgb = a[..., :3].astype(int)
    a[(np.abs(rgb - 40).sum(2) < 14) | (np.abs(rgb - np.array([26, 22, 20])).sum(2) < 8), 3] = 0
    a[:11, :, 3] = 0
    fg = (a[..., 3] > 0).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(fg, np.ones((5, 5), np.uint8)), 8)
    boxes = sorted([s for s in st[1:] if s[4] > 60], key=lambda s: s[0])
    out = []
    for x, y, w, h, _ in boxes:
        part = a[y:y + h, x:x + w].copy()
        part[..., 3] *= (lab[y:y + h, x:x + w] > 0)
        out.append(Image.fromarray(part))
    out.sort(key=lambda im: int((np.asarray(im)[..., 3] > 0).sum()))
    return out


def scare_frames():
    """Its jumpscare, frame by frame."""
    im = Image.open(os.path.join(SRC, 'scare_frames.jpg')).convert('RGB')
    out = []
    for row in range(4):
        for col in range(4):
            x0, y0 = 8 + col * 397 + 3, 8 + row * 301 + 3
            out.append(im.crop((x0, y0, x0 + 380, y0 + 284)))
    return out


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    entrance, hall_a, class_a = to_image(hall('entrance')), to_image(hall('hallA')), to_image(classroom())
    shaded = {'entrance': with_shadow('entrance', entrance), 'hallA': with_shadow('hallA', hall_a)}
    for k, im in [('entrance', entrance), ('hallA', hall_a), ('classA', class_a)] + [(k + '_shadow', v) for k, v in shaded.items()]:
        im.save(os.path.join(ROOT, 'build', k + '.png'))
    jpg = lambda im, q=86: data_url(im.convert('RGB'), 'JPEG', quality=q)
    sprites = items()
    images = {
        'places': {
            'entrance': {'bg': jpg(entrance), 'shadow': jpg(shaded['entrance']), 'flash': jpg(hall_flash('entrance'), 80),
                         'gunman': dict(zip(('x', 'y', 'scale'), placement('entrance'))), 'gun': gun_point('entrance')},
            'hallA': {'bg': jpg(hall_a), 'shadow': jpg(shaded['hallA']), 'flash': jpg(hall_flash('hallA'), 80),
                      'gunman': dict(zip(('x', 'y', 'scale'), placement('hallA'))), 'gun': gun_point('hallA'),
                      'hidden': hidden('hallA', hall_a)},
            'classA': {'bg': jpg(class_a), 'hidden': hidden('classA', class_a)},
        },
        'portrait': data_url(portrait()),
        'gunman': data_url(lit_gunman()),
        'gunmanFeetX': FEET_X,
        'muzzle': MUZZLE,
        'gunmanPic': data_url(gunman_pic()),
        'faces': [data_url(f) for f in faces()],
        'crowd': [data_url(f) for f in crowd()],
        'items': {k: data_url(v) for k, v in sprites.items()},
        'tree': data_url(tree()),
        'roots': [data_url(r) for r in roots()],
        'scare': [jpg(f, 82) for f in scare_frames()],
    }
    with open(os.path.join(ROOT, 'js', 'images.js'), 'w') as f:
        f.write('// Generated by brayan/tools/make_images.py: the school after hours, Brayan, the gunman, the thing in CLASSROOM A.\n')
        f.write('window.BRAYAN_IMAGES = ' + json.dumps(images) + ';\n')
    print('wrote brayan/js/images.js', f'({os.path.getsize(os.path.join(ROOT, "js", "images.js")) // 1024} KB)')
