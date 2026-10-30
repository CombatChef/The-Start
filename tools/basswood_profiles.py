"""Six faces from Basswood County as SlashCo doc-style profiles, each in its own 540x540 box like
the doc's Mel and John: the figure lit white on black, in flat black, grey and white, in a 22px
white frame.

    pip install numpy opencv-python-headless pillow
    python3 tools/basswood_profiles.py

cuts each face from the sheet of six ink drawings (assets/source/basswood_faces.jpg) and writes
assets/profiles/basswood_1.png .. basswood_6.png, in reading order.
"""
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SOURCE = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'profiles')

SIZE, FRAME = 540, 22  # a 22px white frame round a black square, like the doc's Mel and John
INNER = SIZE - 2 * FRAME
TONES = (0, 128, 255)

# The six drawings on the sheet (546x366; left, top, right, bottom), in reading order.
BOXES = [(43, 26, 184, 205), (202, 28, 341, 207), (357, 26, 507, 207), (43, 211, 188, 366), (203, 212, 343, 366), (359, 211, 505, 366)]
INSET = 3  # px inside each box, clear of its border
UP = 4  # cut them out at 4x the sheet's resolution


def smooth_tones(t, w, h, soften):
    """Redraw a black/grey/white picture `t` (any size) at w x h with smooth edges: each tone's
    shape is softened (by `soften` of t's pixels), enlarged to twice the size wanted and cut
    clean there, then brought down, so its edges come out smooth instead of in steps."""
    out = np.zeros((2 * h, 2 * w), np.float32)
    for lo, hi in ((TONES[0], TONES[1]), (TONES[1], TONES[2])):
        shape = (t >= (lo + hi) / 2).astype(np.float32)
        if soften:
            shape = cv2.GaussianBlur(shape, (0, 0), soften)
        shape = cv2.resize(shape, (2 * w, 2 * h), interpolation=cv2.INTER_CUBIC) >= 0.5
        out[shape] = hi
    return cv2.resize(out, (w, h), interpolation=cv2.INTER_AREA)


def framed(inner):
    out = np.full((SIZE, SIZE), 255, np.uint8)
    out[FRAME:SIZE - FRAME, FRAME:SIZE - FRAME] = 0
    x0 = FRAME + (INNER - inner.shape[1]) // 2
    out[FRAME:FRAME + INNER, x0:x0 + inner.shape[1]] = np.clip(np.round(inner), 0, 255).astype(np.uint8)
    return out


def figure_mask(g, light=150, seal=7):
    """The figure, not the paper: flood the paper in from the top and sides (not the bottom,
    where the figure runs off the drawing), with the ink lines (thickened a little to seal
    gaps) as walls. Whatever the flood can't reach is him."""
    ink = (g < light).astype(np.uint8)
    walls = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (seal, seal)))
    paper = (walls == 0).astype(np.uint8)
    n, lab = cv2.connectedComponents(paper, connectivity=4)
    edge = np.zeros_like(paper, bool)
    edge[0, :] = edge[:, 0] = edge[:, -1] = True
    outside = np.isin(lab, np.unique(lab[edge & (paper > 0)])) & (paper > 0)
    # the walls next to the outside paper belong to the paper too (they were only padding)
    grow = cv2.dilate(outside.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (seal + 2, seal + 2))) > 0
    outside = grow & (ink == 0) | outside
    fig = (~outside).astype(np.uint8)
    # keep the big piece(s)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fig, connectivity=8)
    keep = np.zeros_like(fig)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > fig.size * 0.01:
            keep[lab == i] = 1
    return keep > 0


def posterize(g, mask, cuts=(95, 160)):
    out = np.full(g.shape, TONES[0], np.uint8)
    out[(g >= cuts[0]) & mask] = TONES[1]
    out[(g >= cuts[1]) & mask] = TONES[2]
    # drop specks smaller than a few pixels in each tone
    for t in (TONES[1], TONES[2]):
        m = (out == t).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=4)
        small = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] < 12 * UP])
        out[small] = TONES[0] if t == TONES[1] else TONES[1]
    return out


def basswood(sheet, box):
    l, t, r, b = box
    crop = sheet[t + INSET:b - INSET, l + INSET:r - INSET]
    g = cv2.resize(crop, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    g = cv2.GaussianBlur(g, (0, 0), UP * 0.45)
    q = posterize(g, figure_mask(g)).astype(np.float32)
    # his shoulders fade into the dark where the drawing cuts them off at the sides
    h, w = q.shape
    q *= np.clip(np.minimum(np.arange(w), np.arange(w)[::-1]) / (w * 0.06), 0, 1)[None, :]
    return framed(smooth_tones(q, int(round(w * INNER / h)), INNER, UP * 0.25))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sheet = np.asarray(Image.open(os.path.join(SOURCE, 'basswood_faces.jpg')).convert('L'))
    for i, box in enumerate(BOXES):
        Image.fromarray(basswood(sheet, box)).save(os.path.join(OUT, f'basswood_{i + 1}.png'))
        print(f'wrote profiles/basswood_{i + 1}.png')
