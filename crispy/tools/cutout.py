"""Cuts Crispy out of his photo: writes crispy/assets/source/crispy_mask.png for make_images.py.

    pip install numpy opencv-python-headless pillow onnxruntime
    curl -LO https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx
    python3 crispy/tools/cutout.py u2net_human_seg.onnx

U^2-Net's person model finds him in the photo; the mask is white where he is.
"""
import os
import sys

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'source')

if __name__ == '__main__':
    sess = ort.InferenceSession(sys.argv[1], providers=['CPUExecutionProvider'])
    im = Image.open(os.path.join(SRC, 'crispy_photo.webp')).convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255
    x = cv2.resize(a, (320, 320), interpolation=cv2.INTER_LANCZOS4)
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    out = (out - out.min()) / (out.max() - out.min())
    mask = cv2.resize(out, im.size, interpolation=cv2.INTER_CUBIC)
    Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8)).save(os.path.join(SRC, 'crispy_mask.png'))
    print('wrote crispy/assets/source/crispy_mask.png')
