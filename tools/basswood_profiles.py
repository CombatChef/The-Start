"""Six faces from Basswood County, as SlashCo doc-style profiles: the figure lit white on
black, in flat black, grey and white, in a white frame, like the doc's Mel, John, Jim and Mysti.

    pip install numpy opencv-python-headless pillow
    python3 tools/basswood_profiles.py

reads the sheet of six ink drawings (assets/source/basswood_faces.jpg) and writes
assets/profiles/basswood_1.png .. basswood_6.png: six separate 540x540 profiles, one face each, in
reading order. Give a sheet and a folder to read and write others.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

# The six drawings on the sheet (546x366; left, top, right, bottom), in reading order.
BOXES = [(43, 26, 184, 205), (202, 28, 341, 207), (357, 26, 507, 207), (43, 211, 188, 366), (203, 212, 343, 366), (359, 211, 505, 366)]
INSET = 3  # px inside each box, clear of its border
UP = 4  # work at 4x the sheet's resolution, so the posterized shapes come out smooth
SIZE, FRAME = 540, 22  # like the doc's 540px profiles: a 22px white frame round a black square
TONES = (0, 128, 255)
CUTS = (0.40, 0.75)  # of the paper's brightness: below the first is black, above the second white


def figure_mask(g, paper):
    """The figure, not the paper: the ink lines, with their gaps closed, wall him off from the
    paper, which floods in from the top and sides (not the bottom, where he runs off the
    drawing). Whatever the flood can't reach is him, and each row of him is filled across."""
    # a margin of paper round the top and sides, so the flood gets in above a head that
    # touches the top of the drawing
    m = 40
    gp = cv2.copyMakeBorder(g, m, 0, m, m, cv2.BORDER_REPLICATE)
    gb = cv2.GaussianBlur(gp, (0, 0), UP * 0.6).astype(np.int16)
    ink = gb < paper - 18
    # The top of his head can be drawn very faintly, so look harder up there, against the
    # paper just above him (it's lit unevenly; where his hair runs up into the top of the
    # drawing, that's darker, and nothing more is found there).
    above = cv2.GaussianBlur(np.median(gb[:m + 6 * UP], axis=0).astype(np.float32)[None, :], (0, 0), 8)
    top = m + int(g.shape[0] * 0.25)
    ink[:top] |= gb[:top] < above - 7
    walls = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    open_ = (walls == 0).astype(np.uint8)
    n, lab = cv2.connectedComponents(open_, connectivity=4)
    outside = (lab == lab[0, 0]) & (open_ > 0)
    outside = outside[m:, m:-m]
    n, lab, st, _ = cv2.connectedComponentsWithStats((~outside).astype(np.uint8), connectivity=8)
    fig = lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    # Low down, his neck and shoulders only widen gradually: anything that jumps out sideways
    # is a pocket of paper trapped against the bottom of the drawing.
    h = fig.shape[0]
    left = right = None
    for y in range(h):
        xs = np.flatnonzero(fig[y])
        if not len(xs):
            continue
        if y > h * 0.7 and left is not None:
            xs = xs[(xs >= left - 4) & (xs <= right + 4)]
            fig[y] = False
            if not len(xs):
                continue
        left, right = xs[0], xs[-1]
        fig[y, left:right + 1] = True
    # Knock off the spikes and slivers where the closing caught a corner of paper, and pull in
    # a little off the paper round his outline.
    fig = cv2.morphologyEx(fig.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
    return cv2.erode(fig, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0


def profile(sheet, box):
    l, t, r, b = box
    crop = sheet[t + INSET:b - INSET, l + INSET:r - INSET]
    paper = float(np.median(crop[:15, :15]))
    g = cv2.resize(crop, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    mask = figure_mask(g, paper)
    # blurred enough that the cross-hatching runs together into the grey
    lit = cv2.GaussianBlur(g, (0, 0), UP * 1.0).astype(np.float32) / paper
    q = np.full(g.shape, TONES[0], np.uint8)
    q[lit >= CUTS[0]] = TONES[1]
    q[lit >= CUTS[1]] = TONES[2]
    q[~mask] = TONES[0]
    q = cv2.medianBlur(q, 7)
    # Small flecks of light along his edge are paper caught in a corner of his outline, not him:
    # ones lying mostly along the edge, and white ones with no line between them and the dark.
    inward = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    for tone in TONES[2], TONES[1]:
        n, lab, st, _ = cv2.connectedComponentsWithStats((q == tone).astype(np.uint8), connectivity=4)
        for i in range(1, n):
            area = st[i, cv2.CC_STAT_AREA]
            if area > q.size * 0.015:
                continue
            blob = lab == i
            if area < q.size * 0.004 and (inward[blob] < 6 * UP).mean() > 0.5 or tone == TONES[2] and inward[blob].min() < 2 * UP:
                q[blob] = TONES[0]
    # his shoulders fade into the dark where the drawing cuts them off at the sides
    h, w = q.shape
    fade = np.clip(np.minimum(np.arange(w), np.arange(w)[::-1]) / (w * 0.06), 0, 1)
    inner = SIZE - 2 * FRAME
    pw = int(round(w * inner / h))
    p = cv2.resize(q.astype(np.float32) * fade[None, :], (pw, inner), interpolation=cv2.INTER_AREA)
    out = np.full((SIZE, SIZE), 255, np.uint8)
    out[FRAME:SIZE - FRAME, FRAME:SIZE - FRAME] = 0
    x0 = FRAME + (inner - pw) // 2
    # back onto the three tones after the resize
    out[FRAME:FRAME + inner, x0:x0 + pw] = np.where(p >= 192, TONES[2], np.where(p >= 64, TONES[1], TONES[0]))
    return out


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'assets', 'source', 'basswood_faces.jpg')
    outdir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, 'assets', 'profiles')
    os.makedirs(outdir, exist_ok=True)
    sheet = np.asarray(Image.open(src).convert('L'))
    for i, box in enumerate(BOXES):
        out = profile(sheet, box)
        Image.fromarray(out).save(os.path.join(outdir, f'basswood_{i + 1}.png'))
        print(f'wrote basswood_{i + 1}.png')
