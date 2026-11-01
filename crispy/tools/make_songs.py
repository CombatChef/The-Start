"""The speaker's songs: slowed down and drowned in reverb, a little creepy but still a jam.

    python3 crispy/tools/make_songs.py

Takes the three songs from crispy/assets/audio/songs/ (they aren't in the repo: put them there
first) and writes crispy/assets/audio/song_1.mp3 .. song_3.mp3 (nor are these): the first
minute and a half of each, slowed to 0.82 (and so lower, like a record played too slow), with a
long room reverb, the top end rolled off, mono, small enough to go inside the page.
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, '..', 'assets', 'audio')
SONGS = ['clint_eastwood', 'feel_good_inc', 'on_melancholy_hill']
SPEED = 0.82
TAKE = 92  # seconds of the song (about 112 once slowed)
RATE = 44100


def impulse(path, seconds=2.6):
    """A room: a few early reflections, then a long, dark tail."""
    rng = np.random.default_rng(1)
    n = int(RATE * seconds)
    t = np.arange(n) / RATE
    tail = rng.normal(0, 1, n) * np.exp(-t * 2.4)
    tail = np.convolve(tail, np.ones(6) / 6, mode='same')  # darker
    ir = tail * 0.35
    ir[0] = 1.0
    for d, g in ((0.023, 0.5), (0.041, 0.4), (0.067, 0.3), (0.089, 0.25)):
        ir[int(d * RATE)] += g
    ir /= np.abs(ir).sum() / 40
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(ir / np.abs(ir).max(), -1, 1) * 32767).astype(np.int16).tobytes())


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as tmp:
        ir = os.path.join(tmp, 'room.wav')
        impulse(ir)
        for i, name in enumerate(SONGS, 1):
            src = os.path.join(AUDIO, 'songs', name + '.mp3')
            out = os.path.join(AUDIO, f'song_{i}.mp3')
            dur = TAKE / SPEED
            chain = (
                f'[0:a]aresample={RATE},aformat=channel_layouts=mono,asetrate={RATE}*{SPEED},aresample={RATE},'
                'lowpass=f=7500,highpass=f=35,asplit[dry][w];'
                '[w][1:a]afir[wet];'
                '[dry][wet]amix=inputs=2:weights=1 0.55:normalize=0,'
                f'afade=t=in:d=1.2,afade=t=out:st={dur - 5:.1f}:d=5,loudnorm=I=-17:TP=-1.5'
            )
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-t', str(TAKE), '-i', src, '-i', ir, '-filter_complex', chain, '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', str(RATE), '-b:a', '64k', out], check=True)
            print('wrote', os.path.relpath(out, os.path.join(HERE, '..')), f'{os.path.getsize(out) // 1024} KB')
