/*
 * Sound for Brayan's fight: the music (Ripple), the sounds from CLASSROOM A (decoded here, so
 * they can be played lower and quieter, and drawn at the door), and a synthesized sound for
 * everything else: the gun cocking, the shot, and the ringing after it; whispers, faces,
 * footsteps down a dark hall, a lighter, a sandwich.
 */
(function () {
  const A = { ctx: null, master: null, sfxOn: true, musicOn: true, music: null, buffers: {}, loops: [] };
  window.AUDIO = A;
  const MUSIC_VOL = 0.5;

  A.init = function (musicSrc, samples = {}) {
    A.music = new Audio(musicSrc);
    A.music.loop = true;
    A.music.volume = MUSIC_VOL;
    A.samples = samples;
  };
  // Browsers only allow sound after a click: the title screen's START does this.
  A.unlock = function () {
    if (!A.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.7;
      A.verb = A.ctx.createConvolver();
      A.verb.buffer = impulse(2.2, 2.2); // (a long, hard hallway)
      A.wet = A.ctx.createGain();
      A.wet.gain.value = 0.3;
      A.master.connect(A.ctx.destination);
      A.master.connect(A.verb);
      A.verb.connect(A.wet);
      A.wet.connect(A.ctx.destination);
      A.noiseBuf = noiseBuffer(2);
      // what's in CLASSROOM A, through an analyser for the door
      A.analyser = A.ctx.createAnalyser();
      A.analyser.fftSize = 2048;
      A.analyser.smoothingTimeConstant = 0.7;
      A.sampleOut = A.ctx.createGain();
      A.sampleOut.connect(A.analyser);
      A.analyser.connect(A.ctx.destination);
      A.bins = new Uint8Array(A.analyser.frequencyBinCount);
      // (from the text of them, here: a page can be kept from fetching even its own data: URLs,
      // and some browsers only take the callbacks)
      for (const [k, src] of Object.entries(A.samples || {})) {
        if (!src) continue;
        try {
          const done = (b) => (A.buffers[k] = b);
          const p = A.ctx.decodeAudioData(bytes(src), done, () => {});
          if (p && p.catch) p.catch(() => {});
        } catch (e) {
          /* (no sound from the classroom, then) */
        }
      }
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
  };

  function bytes(dataUrl) {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  // ------------------------------------------------------------------ music
  A.playMusic = function () {
    if (!A.music || !A.musicOn) return;
    A.music.volume = MUSIC_VOL * (A.duckLevel ?? 1);
    A.music.play().catch(() => {});
  };
  function fadeEl(el, to, sec, then) {
    const v0 = el.volume;
    const t0 = performance.now();
    cancelAnimationFrame(el._fade);
    const step = () => {
      const p = sec > 0 ? (performance.now() - t0) / (sec * 1000) : 1;
      el.volume = Math.max(0, Math.min(1, v0 + (to - v0) * Math.min(1, p)));
      if (p < 1) el._fade = requestAnimationFrame(step);
      else if (then) then();
    };
    step();
  }
  A.stopMusic = function (fade = 1.5) {
    if (!A.music) return;
    const m = A.music;
    fadeEl(m, 0, fade, () => m.pause());
  };
  // the music down to `level` of itself (1: all the way back), over `sec`
  A.duck = function (level, sec = 0.6) {
    A.duckLevel = level;
    if (A.music && !A.music.paused) fadeEl(A.music, MUSIC_VOL * level, sec);
  };
  A.toggleMusic = function () {
    A.musicOn = !A.musicOn;
    if (A.musicOn) A.playMusic();
    else if (A.music) A.music.pause();
    return A.musicOn;
  };
  A.toggleSfx = function () {
    A.sfxOn = !A.sfxOn;
    if (!A.sfxOn) A.stopLoops(0.2);
    return A.sfxOn;
  };

  // ------------------------------------------------------------------ CLASSROOM A's sounds
  // A loop of one of them (`rate` below 1 is lower), till it's stopped; and how loud whatever's
  // playing is, in bands, for the door's visualizer.
  A.loop = function (name, { rate = 1, vol = 0.5 } = {}) {
    if (!A.ctx || !A.buffers[name]) return null;
    const src = A.ctx.createBufferSource();
    src.buffer = A.buffers[name];
    src.loop = true;
    src.playbackRate.value = rate;
    const g = A.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(A.sfxOn ? vol : 0.0001, A.ctx.currentTime + 0.6);
    src.connect(g);
    g.connect(A.sampleOut);
    src.start();
    const h = {
      name,
      src,
      rate,
      stop(fade = 0.6) {
        const t = A.ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
        src.stop(t + fade + 0.05);
        A.loops = A.loops.filter((x) => x !== h);
      },
    };
    A.loops.push(h);
    return h;
  };
  A.stopLoops = (fade) => [...A.loops].forEach((h) => h.stop(fade));
  // (`dur`: just a piece of it, that long, from somewhere in it, faded in and out)
  A.sample = function (name, { rate = 1, vol = 0.8, dur = 0 } = {}) {
    if (!A.ctx || !A.buffers[name] || !A.sfxOn) return;
    const buf = A.buffers[name];
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = A.ctx.createGain();
    src.connect(g);
    g.connect(A.sampleOut);
    const t = A.ctx.currentTime;
    if (!dur) {
      g.gain.value = vol;
      src.start();
      return;
    }
    const at = Math.random() * Math.max(0, buf.duration - dur * rate);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.6, dur / 3));
    g.gain.setValueAtTime(vol, t + dur - Math.min(0.8, dur / 3));
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.start(t, at);
    src.stop(t + dur + 0.05);
  };
  // (in bands spaced as the ear hears them: 50 Hz to 6 kHz)
  A.levels = function (n = 24) {
    if (!A.analyser) return new Array(n).fill(0);
    A.analyser.getByteFrequencyData(A.bins);
    const hz = A.ctx.sampleRate / 2 / A.bins.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const lo = Math.floor((50 * Math.pow(120, i / n)) / hz);
      const hi = Math.max(lo + 1, Math.floor((50 * Math.pow(120, (i + 1) / n)) / hz));
      let s = 0;
      for (let j = lo; j < hi; j++) s += A.bins[j];
      out.push(Math.pow(s / (hi - lo) / 255, 1.3));
    }
    return out;
  };

  // ------------------------------------------------------------------ building blocks
  function impulse(sec, decay) {
    const ctx = A.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }
  function noiseBuffer(sec) {
    const ctx = A.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function tone(type, f, at, dur, vol = 0.3, o = {}) {
    const ctx = A.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    const [f0, f1] = Array.isArray(f) ? f : [f, f];
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibrato[0];
      lg.gain.value = o.vibrato[1];
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    if (o.detune) osc.detune.value = o.detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.filter) {
      const fl = ctx.createBiquadFilter();
      fl.type = o.filter[0];
      fl.frequency.value = o.filter[1];
      fl.Q.value = o.filter[2] || 1;
      node.connect(fl);
      node = fl;
    }
    node.connect(g);
    g.connect(o.dry ? ctx.destination : A.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  function noise(at, dur, vol = 0.3, o = {}) {
    const ctx = A.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = A.noiseBuf;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = o.type || 'lowpass';
    const [f0, f1] = Array.isArray(o.f) ? o.f : [o.f || 2000, o.f || 2000];
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    fl.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.004));
    if (o.hold) g.gain.setValueAtTime(vol, t + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl);
    fl.connect(g);
    g.connect(A.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }
  const thump = (at, f = 110, vol = 0.6, dur = 0.25) => tone('sine', [f, f * 0.4], at, dur, vol);
  const click = (at, vol = 0.3, f = 3000) => noise(at, 0.03, vol, { type: 'bandpass', f, q: 2 });
  const whoosh = (at, dur = 0.3, vol = 0.3, up = false) => noise(at, dur, vol, { type: 'bandpass', f: up ? [400, 3000] : [2500, 300], q: 1.2, attack: dur * 0.4 });
  const chime = (at, freqs, step = 0.07, vol = 0.12, type = 'sine', dur = 0.5) => freqs.forEach((f, i) => tone(type, f, at + i * step, dur, vol));
  const step = (at, vol = 0.25) => {
    thump(at, 70, vol, 0.12);
    noise(at, 0.06, vol * 0.4, { type: 'bandpass', f: 900, q: 1.5 });
  };

  // ------------------------------------------------------------------ the sounds
  const S = {
    move: () => tone('square', 1320, 0, 0.035, 0.05),
    confirm: () => {
      tone('square', 880, 0, 0.06, 0.07);
      tone('square', 1320, 0.05, 0.08, 0.07);
    },
    back: () => tone('square', [1200, 700], 0, 0.08, 0.06),
    deny: () => tone('sawtooth', 160, 0, 0.18, 0.12, { filter: ['lowpass', 900] }),
    text: () => tone('square', 520 + Math.random() * 60, 0, 0.025, 0.025),
    creepyText: () => tone('sawtooth', 90 + Math.random() * 25, 0, 0.06, 0.05, { filter: ['lowpass', 600] }),
    // Brayan's
    hit: () => {
      thump(0, 120, 0.7, 0.2);
      noise(0, 0.12, 0.3, { f: [2500, 300] });
    },
    crit: () => {
      thump(0, 90, 0.8, 0.3);
      noise(0, 0.2, 0.4, { type: 'highpass', f: 1500 });
      tone('square', [600, 1400], 0.02, 0.12, 0.05);
    },
    swing: () => whoosh(0, 0.25, 0.3, true),
    voice: () => {
      tone('sawtooth', [180, 140], 0, 0.5, 0.18, { filter: ['bandpass', 700, 3], vibrato: [6, 8] });
      tone('sawtooth', [270, 210], 0, 0.5, 0.08, { filter: ['bandpass', 1400, 4] });
    },
    chair: () => {
      whoosh(0, 0.4, 0.3, true);
      for (let i = 0; i < 4; i++) noise(0.38 + i * 0.05, 0.12, 0.35, { type: 'bandpass', f: 600 + i * 300, q: 2 });
      thump(0.38, 80, 0.6, 0.3);
    },
    brace: () => thump(0, 90, 0.5, 0.25),
    breath: () => {
      noise(0, 1.6, 0.1, { f: [500, 1600], attack: 1.2 });
      noise(1.7, 1.8, 0.09, { f: [1600, 400], attack: 0.2 });
    },
    eat: () => {
      noise(0, 0.25, 0.15, { type: 'highpass', f: 3000 }); // the foil
      for (let i = 0; i < 4; i++) noise(0.4 + i * 0.28, 0.1, 0.18, { type: 'bandpass', f: 700, q: 2 });
    },
    lighter: () => {
      click(0, 0.4, 4000);
      noise(0.03, 0.4, 0.12, { type: 'bandpass', f: 2500, q: 0.8 });
      noise(0.8, 1.6, 0.08, { f: [1200, 300], attack: 0.3 }); // the drag
      noise(2.6, 1.8, 0.08, { f: [900, 200], attack: 0.2 }); // and out
    },
    heal: () => chime(0, [523, 659, 784, 1047], 0.07, 0.07, 'triangle', 0.4),
    patUp: () => chime(0, [392, 523], 0.09, 0.05, 'sine', 0.5),
    patDown: () => tone('sine', [220, 196], 0, 0.6, 0.08, { detune: 30 }),
    kids: () => chime(0, [523, 659, 784, 659], 0.25, 0.05, 'sine', 0.9),
    squint: () => tone('sine', [70, 60], 0, 1.2, 0.12, { attack: 0.4 }),
    talk: () => tone('sine', [150, 120], 0, 0.4, 0.04),
    // the distraction: a clatter, a long way down the other hall
    distract: () => {
      for (let i = 0; i < 7; i++) click(0.1 + i * 0.07 + Math.random() * 0.05, 0.12 - i * 0.012, 2500 + Math.random() * 2500);
    },
    tick: () => tone('square', 2000, 0, 0.02, 0.05),
    pass: () => chime(0, [784, 1175], 0.08, 0.08, 'triangle', 0.4),
    fail: () => tone('sawtooth', [200, 90], 0, 0.4, 0.1, { filter: ['lowpass', 800] }),
    // his
    loom: () => tone('sawtooth', [45, 38], 0, 2.2, 0.16, { filter: ['lowpass', 220], attack: 0.8 }),
    whisper: () => {
      for (let i = 0; i < 6; i++) noise(i * 0.28 + Math.random() * 0.1, 0.25, 0.09, { type: 'bandpass', f: 2200 + Math.random() * 1800, q: 3, attack: 0.08 });
    },
    faces: () => {
      for (const f of [98, 104, 147, 156]) tone('sawtooth', f, 0, 2, 0.05, { filter: ['lowpass', 900], attack: 0.5, vibrato: [5, 4] });
    },
    lightsOut: () => {
      click(0, 0.4, 1200);
      tone('sine', [180, 40], 0, 0.6, 0.15);
      noise(0.8, 1.4, 0.08, { f: [700, 400], attack: 0.5 }); // breathing, close
    },
    aim: () => {
      for (let i = 0; i < 4; i++) thump(i * 0.75, 55, 0.5, 0.15), thump(i * 0.75 + 0.2, 50, 0.35, 0.12);
      tone('sine', 62, 0, 3, 0.07, { attack: 0.8 });
    },
    lunge: () => {
      whoosh(0, 0.3, 0.35, true);
      thump(0.28, 70, 0.8, 0.3);
    },
    hurt: () => {
      thump(0, 100, 0.6, 0.2);
      noise(0, 0.15, 0.25, { f: [1800, 200] });
    },
    mind: () => tone('sine', [330, 240], 0, 0.5, 0.06, { detune: 40 }),
    stun: () => {
      thump(0, 60, 0.7, 0.4);
      tone('triangle', 660, 0.1, 1.2, 0.05, { vibrato: [7, 40] });
    },
    recover: () => tone('sawtooth', [50, 70], 0, 0.6, 0.1, { filter: ['lowpass', 300] }),
    frozen: () => {
      for (let i = 0; i < 6; i++) thump(i * 0.34, 58, 0.45, 0.12);
    },
    revive: () => chime(0, [262, 330, 392, 523], 0.18, 0.08, 'triangle', 0.8),
    // the gun: cocking it, the shot, and the ringing after
    cock: () => {
      noise(0, 0.04, 0.5, { type: 'bandpass', f: 3200, q: 4 });
      tone('square', 2400, 0, 0.03, 0.05);
      noise(0.16, 0.05, 0.6, { type: 'bandpass', f: 2100, q: 3 });
      tone('square', 1700, 0.16, 0.04, 0.05);
    },
    gunshot: () => {
      noise(0, 0.5, 1.0, { f: [9000, 300], attack: 0.001 });
      thump(0, 55, 1.0, 0.45);
      noise(0, 0.08, 0.9, { type: 'highpass', f: 2500, attack: 0.001 });
    },
    // (the ringing in the ears: dry, not in the hall)
    ring: () => {
      tone('sine', 4100, 0.05, 4.2, 0.07, { attack: 0.05, dry: true });
      tone('sine', 4180, 0.05, 3.6, 0.03, { attack: 0.05, dry: true });
    },
    // going places
    run: () => {
      for (let i = 0; i < 9; i++) step(i * 0.21, 0.28 - i * 0.02);
    },
    door: () => tone('sawtooth', [140, 95], 0, 1, 0.07, { filter: ['bandpass', 500, 6], vibrato: [9, 18] }),
    find: () => chime(0, [659, 880, 1319], 0.08, 0.08, 'triangle', 0.6),
    appear: () => {
      noise(0, 0.6, 0.12, { type: 'highpass', f: 3000 });
      tone('sawtooth', [40, 52], 0.1, 1.2, 0.1, { filter: ['lowpass', 200], attack: 0.3 });
    },
    creak: () => tone('sawtooth', [210, 150], 0, 0.7, 0.06, { filter: ['bandpass', 650, 7], vibrato: [15, 22] }),
    static: (dur = 1.6) => {
      noise(0, dur, 0.25, { type: 'highpass', f: 1500, hold: dur - 0.2 });
      noise(0, dur, 0.15, { type: 'bandpass', f: 600, q: 0.5, hold: dur - 0.2 });
    },
    lose: () => tone('sine', [196, 98], 0, 2.4, 0.12),
    engine: () => {
      for (let i = 0; i < 3; i++) noise(i * 0.12, 0.1, 0.18, { type: 'bandpass', f: 300, q: 3 });
      tone('sawtooth', [38, 52], 0.4, 1.6, 0.14, { filter: ['lowpass', 220], attack: 0.1 });
      tone('sawtooth', [52, 80], 1.8, 2.6, 0.12, { filter: ['lowpass', 260], attack: 0.2 });
    },
    fall: () => {
      thump(0, 70, 0.8, 0.5);
      for (let i = 0; i < 5; i++) click(0.1 + i * 0.06, 0.2, 800 + i * 200);
    },
    breathOut: () => noise(0, 3.5, 0.1, { f: [1400, 300], attack: 1.2 }),
  };
  A.S = S;
  A.play = function (name, ...args) {
    if (!A.ctx || !A.sfxOn || !S[name]) return;
    S[name](...args);
  };
})();
