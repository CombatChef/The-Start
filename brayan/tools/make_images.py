"""Builds the art for Brayan's fight into brayan/js/images.js (and a mockup of the scene).

    pip install numpy opencv-python-headless pillow
    python3 brayan/tools/make_images.py

From brayan/assets/source/ (the photo and the portrait aren't in the repo: put them there first):
  hallway.webp         -> the school hallway after hours: all the lights off but one at the far
                          end, the school's name and logo taken off the doors, the chair in the
                          corner of the photo cropped away; not pixelated
  brayan_portrait.png  -> Brayan, as pixels (12 screen pixels to each of his, on grey)
  gunman_sheet.png     -> the gunman (8 screen pixels to each of his)
  tree_sheet.png       -> (not used yet)
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

# The photo is 1500 x 2000, upright: the stage is the band of it from CROP_Y down (which leaves
# the chair at the bottom out), scaled by K.
CROP_Y = 210
K = W / 1500
# Where things are in the photo: the horizon (the phone was about CAM_H metres up; the ceiling is
# CEIL metres), and the one light left on, at the far end.
HZ = 574
CAM_H = 1.52
CEIL = 2.41
LIGHT = (726, 492)


def stage(x, y):
    """A point in the photo, on the stage."""
    return (x * K, (y - CROP_Y) * K)


def data_url(img, fmt='PNG', **kw):
    buf = io.BytesIO()
    img.save(buf, fmt, **kw)
    return f'data:image/{fmt.lower()};base64,' + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- the hallway, after hours

# the school's name and logo, taken off the doors at the end (photo pixels)
SCRUB = [(568, 643, 674, 718), (534, 638, 560, 717), (608, 501, 657, 519)]


def hallway():
    """The hallway after hours: every light off but the one at the far end, so the end wall and
    the floor before it are dimly lit and cold, and everything nearer falls away into the dark;
    the glossy floor still catching that light."""
    photo = np.asarray(Image.open(os.path.join(SRC, 'hallway.webp')).convert('RGB')).copy()
    mask = np.zeros(photo.shape[:2], np.uint8)
    for x0, y0, x1, y1 in SCRUB:
        mask[y0:y1, x0:x1] = 255
    photo = cv2.inpaint(photo, mask, 6, cv2.INPAINT_TELEA)
    src = Image.fromarray(photo).crop((0, CROP_Y, 1500, CROP_Y + round(H / K))).resize((W, H), Image.LANCZOS)
    a = (np.asarray(src).astype(np.float32) / 255) ** 2.2
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    lx, ly = stage(*LIGHT)
    hz = stage(0, HZ)[1]
    # the ceiling's lights off (all but the far one): the tubes go grey
    fixture = (np.clip((lum - 0.55) / 0.3, 0, 1) * (yy < hz)).astype(np.float32)
    far = np.exp(-(((xx - lx) / 90) ** 2 + ((yy - ly) / 14) ** 2))
    off = fixture * (1 - np.clip(far * 3, 0, 1))
    a = a * (1 - 0.9 * off[..., None])
    grey = (a @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    a = a * 0.45 + grey * 0.55
    # the light: a pool around the far end, cold and a little green, as a school's tubes are;
    # and next to nothing nearer
    pool = np.exp(-(((xx - lx) / 220) ** 2 + ((yy - (ly + 60)) / 160) ** 2))
    fall = 1 / (1 + ((xx - lx) ** 2 + (yy - ly) ** 2 * 1.4) / 190 ** 2)
    cold = np.array([0.78, 0.92, 0.95], np.float32)
    light = np.array([0.0009, 0.0011, 0.0017], np.float32) + cold * (0.24 * pool + 0.06 * fall ** 1.8)[..., None]
    a = a * light
    # the polished floor throws the light back at us: a long streak down the middle of the hall
    floor = stage(0, 785)[1]  # (where the floor meets the end wall)
    d = np.clip(yy - floor, 0, None)
    streak = np.exp(-((xx - lx) / (26 + d * 0.32)) ** 2) * (yy > floor) * np.exp(-d / 260) * np.clip(d / 12, 0, 1)
    a += (streak * 0.03)[..., None] * cold
    # the tube itself
    a += (far * 0.5)[..., None] * cold
    a += (np.exp(-(((xx - lx) / 160) ** 2 + ((yy - ly) / 40) ** 2)) * 0.03)[..., None] * cold
    v = np.clip(1 - 0.75 * (((xx - lx) / (W * 0.5)) ** 2 + ((yy - H * 0.42) / (H * 0.62)) ** 2), 0.1, 1)
    a *= v[..., None]
    return Image.fromarray((np.clip(a, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8))


# ---------------------------------------------------------------- sprites

def cut(name, k, bg=None):
    """A pixel-art image at its own pixels (k screen pixels to each), as RGBA; `bg`, a flat
    background colour to make see-through."""
    im = Image.open(os.path.join(SRC, name)).convert('RGBA')
    a = np.asarray(im)[k // 2::k, k // 2::k].copy()
    if bg is not None:
        a[(np.abs(a[..., :3].astype(int) - bg).sum(2) < 6), 3] = 0
    ys, xs = np.nonzero(a[..., 3])
    return Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def portrait():
    """Brayan, as pixels, his grey taken away (his badge puts its own behind him)."""
    im = Image.open(os.path.join(SRC, 'brayan_portrait.png')).convert('RGBA')
    a = np.asarray(im)[6::12, 6::12].copy()
    a[(np.abs(a[..., :3].astype(int) - 40).sum(2) < 6), 3] = 0
    return Image.fromarray(a)


def gunman():
    return cut('gunman_sheet.png', 8)


def gunman_pic():
    """For his box: his head and shoulders, grey, on black."""
    sp = gunman()
    head = sp.crop((0, 0, 44, 44))
    a = np.asarray(head).astype(np.float32)
    grey = a[..., :3] @ np.array([0.3, 0.59, 0.11])
    g = np.clip((grey - 30) * 1.25, 0, 255) * (a[..., 3] / 255)
    return Image.fromarray(g.astype(np.uint8), 'L')


# ---------------------------------------------------------------- the mockup: him, in the hall

GUN_TALL = 2.35  # metres: his head all but at the ceiling tiles


FEET_X = 21.5  # (the middle of his feet, in his sprite: the gun arm sticks out to one side)


def lit_gunman(sp):
    """The gunman as the hall shows him: the one light is behind him and above, so he's dark,
    with a thin, faint cold edge of light on his head and shoulders and down his arms (less and
    less towards his feet), and his front just readable in what the floor throws back."""
    a = np.asarray(sp).astype(np.float32)
    rgb, al = a[..., :3] / 255, a[..., 3] > 0
    h, w = al.shape
    # the edge: his pixels with see-through beside or above them
    pad = np.pad(al, 1)
    open_side = (~pad[1:-1, :-2]) | (~pad[1:-1, 2:])
    open_top = ~pad[:-2, 1:-1]
    up = np.clip(1.05 - np.arange(h)[:, None] / h * 1.25, 0.0, 1) ** 1.3
    rim = al * np.clip(open_side * up + open_top * 0.8 * (np.arange(h)[:, None] < h * 0.5), 0, 1)
    grey = rgb @ np.array([0.3, 0.59, 0.11])
    rgb = rgb * 0.4 + grey[..., None] * 0.6
    rgb = rgb * 0.27 + rim[..., None] * np.array([0.15, 0.19, 0.21])
    out = np.dstack([np.clip(rgb, 0, 1) * 255, al * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def mockup_scene():
    """The hallway with the gunman standing in it: on the floor, part way down, in front of the
    one light; his shadow thrown down the hall towards Brayan, cutting across the light the
    polished floor throws back, and his reflection in it."""
    bg = np.asarray(hallway()).astype(np.float32)
    sp = lit_gunman(gunman())
    feet_photo = (690, 1014)  # where he stands, in the photo
    fx, fy = stage(*feet_photo)
    tall_px = (feet_photo[1] - HZ) * GUN_TALL / CAM_H * K  # how tall he is on the stage
    scale = tall_px / sp.height
    big = sp.resize((round(sp.width * scale), round(sp.height * scale)), Image.NEAREST)
    x0 = round(fx - FEET_X * scale)
    y0 = round(fy - big.height)
    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    # his shadow, down the hall towards us (the light's behind him): as wide as he is at his
    # feet, wider as it comes, fading
    body = 10 * scale  # (how wide his legs are, on the stage)
    t = np.clip((yy - fy) / (H - fy), 0, 1)
    half = body * (0.55 + 1.6 * t)
    centre = fx + (fx - stage(*LIGHT)[0]) * 0.6 * t
    shadow = np.exp(-(np.abs(xx - centre) / half) ** 4) * (yy >= fy) * (1 - t) ** 0.7
    shadow = cv2.GaussianBlur(shadow.astype(np.float32), (0, 0), 3)
    contact = np.zeros((H, W), np.float32)
    cv2.ellipse(contact, (round(fx), round(fy)), (round(body * 1.1), 6), 0, 0, 360, 1, -1)
    contact = cv2.GaussianBlur(contact, (0, 0), 3)
    # his reflection: upside down below his feet, soft, gone in a few feet of floor
    refl = np.zeros((H, W), np.float32)
    rimg = np.zeros((H, W, 3), np.float32)
    ra = np.asarray(big.transpose(Image.FLIP_TOP_BOTTOM)).astype(np.float32)
    rh = min(ra.shape[0], H - round(fy))
    xs0, xs1 = max(0, x0), min(W, x0 + big.width)
    refl[round(fy):round(fy) + rh, xs0:xs1] = ra[:rh, xs0 - x0:xs1 - x0, 3] / 255
    rimg[round(fy):round(fy) + rh, xs0:xs1] = ra[:rh, xs0 - x0:xs1 - x0, :3]
    fade = np.clip(1 - (yy - fy) / 150, 0, 1) ** 1.5
    refl = cv2.GaussianBlur(refl, (0, 0), sigmaX=1.0, sigmaY=4) * fade
    rimg = cv2.GaussianBlur(rimg, (0, 0), sigmaX=1.0, sigmaY=4)
    dark = np.clip(0.8 * shadow + 0.7 * contact + 0.55 * refl, 0, 0.92)
    bg = bg * (1 - dark[..., None]) + rimg * (refl * 0.35)[..., None]
    out = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert('RGBA')
    out.alpha_composite(big, (x0, y0))
    return out.convert('RGB'), {'feet': [fx, fy], 'tall': tall_px, 'scale': scale}


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    scene, where = mockup_scene()
    scene.save(os.path.join(ROOT, 'build', 'scene.png'))
    images = {
        'hallway': data_url(hallway(), 'JPEG', quality=88),
        'scene': data_url(scene, 'JPEG', quality=90),
        'portrait': data_url(portrait()),
        'gunman': data_url(gunman()),
        'gunmanPic': data_url(gunman_pic()),
        'where': where,
    }
    with open(os.path.join(ROOT, 'js', 'images.js'), 'w') as f:
        f.write('// Generated by brayan/tools/make_images.py: the hallway, Brayan, the gunman.\n')
        f.write('window.BRAYAN_IMAGES = ' + json.dumps(images) + ';\n')
    print('wrote brayan/js/images.js', f'({os.path.getsize(os.path.join(ROOT, "js", "images.js")) // 1024} KB)', where)
