/*
 * SLASHCO VR — TURN-BASED BATTLE
 * audio.js — the sound. M toggles mute.
 *
 * MUSIC is SlashCo VR's soundtrack (assets/audio/, chosen in data.js `music`): each slasher's
 * battle theme (AMBIENCE) and desperate theme (CHASE: the slasher weakened, the team running
 * for it, or about to lose), which crossfade; a sting for the slasher's danger level as a fight
 * starts; and a track for escaping or dying at the end. Files picked in the game (MUSIC on the
 * title screen) replace the battle themes, and stay in this browser. If a file can't play,
 * a synthesized version stands in.
 *
 * EFFECTS and Dolphin Man's wail are synthesized.
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  try {
    muted = root.localStorage && root.localStorage.getItem('sc-muted') === '1';
  } catch (e) {
    muted = false;
  }

  function ensure() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      applyMusic();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq || 440, t);
    if (o.slide) osc.frequency.linearRampToValueAtTime(Math.max(20, (o.freq || 440) + o.slide), t + (o.dur || 0.1));
    g.gain.setValueAtTime(o.vol == null ? 0.4 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (o.dur || 0.1));
    osc.connect(g).connect(o.to || master);
    osc.start(t);
    osc.stop(t + (o.dur || 0.1) + 0.02);
  }

  // Two seconds of white noise, shared by everything that hisses.
  function noise(loop) {
    if (!noiseBuf) {
      const len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = !!loop;
    return src;
  }

  function hiss(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const src = noise(true);
    const f = ctx.createBiquadFilter();
    f.type = o.band ? 'bandpass' : o.high ? 'highpass' : 'lowpass';
    f.frequency.value = o.filter || 1200;
    if (o.q) f.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.5 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (o.dur || 0.2));
    src
      .connect(f)
      .connect(g)
      .connect(o.to || master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + (o.dur || 0.2) + 0.02);
  }

  // A gain that follows a list of [time, level] points (seconds from `t`).
  function envelope(t, points) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const [dt, v] of points) g.gain.linearRampToValueAtTime(v, t + dt);
    return g;
  }

  // ------------------------------------------------------------------ Dolphin Man's wail
  // Written to match the sound in SlashCo VR (from its gameplay audio): a shrill band of noise
  // around 3.2 kHz that buzzes about 50 times a second and swells again and again, over a
  // hoarse, wobbling scream. Three swells, like the Loud Wail's three hits.
  function wail() {
    const t = ctx.currentTime + 0.02;
    const dur = 1.9;
    const swells = envelope(t, [
      [0.06, 1],
      [0.45, 0.45],
      [0.6, 1],
      [1.05, 0.45],
      [1.2, 1],
      [dur - 0.1, 0.35],
      [dur, 0.0001],
    ]);
    swells.connect(master);
    // The squeal: noise through a narrow band (two filters deep) that drifts up and back.
    const src = noise(true);
    let into = src;
    for (let k = 0; k < 2; k++) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 12;
      band.frequency.setValueAtTime(2900, t);
      band.frequency.linearRampToValueAtTime(3350, t + 0.35);
      band.frequency.linearRampToValueAtTime(3150, t + dur);
      into.connect(band);
      into = band;
    }
    const buzz = ctx.createGain();
    buzz.gain.value = 0.9;
    const pulse = ctx.createOscillator();
    pulse.type = 'triangle';
    pulse.frequency.value = 49;
    const depth = ctx.createGain();
    depth.gain.value = 0.8;
    pulse.connect(depth).connect(buzz.gain);
    const squeal = ctx.createGain();
    squeal.gain.value = 5.5;
    into.connect(buzz).connect(squeal).connect(swells);
    // A whistle riding on top of it, like a dolphin's.
    const whistle = ctx.createOscillator();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(2700, t);
    whistle.frequency.linearRampToValueAtTime(3500, t + 0.3);
    whistle.frequency.linearRampToValueAtTime(2950, t + 0.9);
    whistle.frequency.linearRampToValueAtTime(3300, t + dur);
    const trill = ctx.createOscillator();
    trill.frequency.value = 13;
    const trillAmt = ctx.createGain();
    trillAmt.gain.value = 90;
    trill.connect(trillAmt).connect(whistle.frequency);
    const whistleGain = ctx.createGain();
    whistleGain.gain.value = 0.06;
    whistle.connect(whistleGain).connect(swells);
    // The scream underneath: a hoarse sawtooth with a wide vibrato through two formants.
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(560, t);
    voice.frequency.linearRampToValueAtTime(700, t + 0.4);
    voice.frequency.linearRampToValueAtTime(610, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 22;
    vib.connect(vibAmt).connect(voice.frequency);
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.8;
    for (const [f, q] of [
      [950, 5],
      [2500, 6],
    ]) {
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = f;
      formant.Q.value = q;
      voice.connect(formant).connect(voiceGain);
    }
    voiceGain.connect(swells);
    for (const o of [pulse, whistle, trill, voice, vib]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const SFX = {
    blip: () => tone({ freq: 740, dur: 0.018, vol: 0.08 }),
    move: () => tone({ freq: 620, dur: 0.035, vol: 0.18 }),
    select: () => {
      tone({ freq: 880, dur: 0.05, vol: 0.2 });
      tone({ freq: 1320, dur: 0.07, vol: 0.2, delay: 0.05 });
    },
    cancel: () => tone({ freq: 330, dur: 0.08, vol: 0.2, slide: -120 }),
    denied: () => {
      tone({ freq: 180, dur: 0.08, vol: 0.25, type: 'sawtooth' });
      tone({ freq: 150, dur: 0.1, vol: 0.25, type: 'sawtooth', delay: 0.08 });
    },
    hit: () => {
      hiss({ dur: 0.12, vol: 0.55, filter: 900 });
      tone({ freq: 150, type: 'triangle', dur: 0.12, slide: -70, vol: 0.5 });
    },
    crit: () => {
      hiss({ dur: 0.2, vol: 0.7, filter: 1600 });
      tone({ freq: 220, type: 'square', dur: 0.16, slide: -150, vol: 0.35 });
    },
    hurt: () => {
      hiss({ dur: 0.16, vol: 0.6, filter: 700 });
      tone({ freq: 110, type: 'sawtooth', dur: 0.18, slide: -40, vol: 0.35 });
    },
    whiff: () => hiss({ dur: 0.12, vol: 0.25, filter: 2600, band: true }),
    gun: () => {
      hiss({ dur: 0.22, vol: 0.9, filter: 2400 });
      tone({ freq: 95, type: 'sine', dur: 0.2, slide: -55, vol: 0.9 });
    },
    heal: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.09, vol: 0.18, type: 'triangle', delay: i * 0.06 })),
    buff: () => [440, 660, 880].forEach((f, i) => tone({ freq: f, dur: 0.07, vol: 0.15, delay: i * 0.05 })),
    debuff: () => [660, 440, 330].forEach((f, i) => tone({ freq: f, dur: 0.07, vol: 0.15, delay: i * 0.05 })),
    success: () => [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.08, vol: 0.22, delay: i * 0.07 })),
    fail: () => tone({ freq: 220, dur: 0.3, vol: 0.3, type: 'sawtooth', slide: -140 }),
    tick: () => tone({ freq: 1200, dur: 0.02, vol: 0.1 }),
    coin: () => {
      tone({ freq: 988, dur: 0.06, vol: 0.2 });
      tone({ freq: 1319, dur: 0.12, vol: 0.2, delay: 0.06 });
    },
    zap: () => {
      hiss({ dur: 0.3, vol: 0.5, filter: 3500, band: true });
      tone({ freq: 60, type: 'sawtooth', dur: 0.3, vol: 0.3 });
    },
    explode: () => {
      hiss({ dur: 0.8, vol: 1, filter: 500 });
      tone({ freq: 70, type: 'sine', dur: 0.6, slide: -40, vol: 1 });
    },
    growl: () => {
      tone({ freq: 70, type: 'sawtooth', dur: 0.35, vol: 0.35, slide: 25 });
      hiss({ dur: 0.35, vol: 0.2, filter: 400 });
    },
    wail: () => {
      if (TRACKS.wail) return playOnce(TRACKS.wail, 0.9, wail);
      return wail();
    },
    // Dolphin Man curling up: a thin, falling squeak.
    whimper: () => {
      tone({ freq: 1500, type: 'triangle', dur: 0.35, slide: -520, vol: 0.18 });
      tone({ freq: 1250, type: 'triangle', dur: 0.3, slide: -420, vol: 0.12, delay: 0.3 });
    },
    death: () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.22, vol: 0.22, type: 'triangle', delay: i * 0.16 })),
    run: () => [262, 330, 392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.1, vol: 0.2, delay: i * 0.07 })),
    win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.14, vol: 0.22, type: 'triangle', delay: i * 0.12 })),
    lose: () => [330, 311, 294, 277, 262].forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.2, type: 'sawtooth', delay: i * 0.25 })),
  };

  // ------------------------------------------------------------------ music
  const LEVEL = { ambience: 0.5, chase: 1 };
  const FILE_VOLUME = 0.4; // your own music
  const FADE = 1.6; // seconds
  // How loud a bed plays: a file at its own volume (data.js evens the soundtrack out), or the
  // synthesized one.
  const levelOf = (tr, name) => (muted ? 0 : tr ? (tr.volume != null ? tr.volume : FILE_VOLUME) : LEVEL[name]);

  // Things far down the hallway, now and then: metal clanking, a heavy thud, a door creaking.
  const FAR = {
    clank(to, t) {
      const base = 380 + Math.random() * 260;
      for (const [k, a, d] of [
        [1, 0.3, 1.3],
        [2.27, 0.18, 0.9],
        [3.58, 0.12, 0.7],
        [5.18, 0.07, 0.5],
      ]) {
        tone({ freq: base * k, type: 'sine', dur: d, vol: a, to, delay: t - ctx.currentTime });
      }
    },
    thud(to, t) {
      tone({ freq: 72, type: 'sine', dur: 0.55, slide: -38, vol: 0.9, to, delay: t - ctx.currentTime });
      hiss({ dur: 0.3, vol: 0.5, filter: 220, to, delay: t - ctx.currentTime });
    },
    creak(to, t) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(95, t);
      o.frequency.linearRampToValueAtTime(150, t + 0.5);
      o.frequency.linearRampToValueAtTime(118, t + 1.1);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 720;
      f.Q.value = 9;
      const g = envelope(t, [
        [0.25, 0.5],
        [0.9, 0.35],
        [1.2, 0.0001],
      ]);
      o.connect(f).connect(g).connect(to);
      o.start(t);
      o.stop(t + 1.25);
    },
  };

  // A slow, dark drone with the strip lights buzzing, and things echoing far away.
  function ambience(out) {
    const t = ctx.currentTime;
    const running = [];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    lp.Q.value = 3;
    const drone = ctx.createGain();
    drone.gain.value = 0.5;
    lp.connect(drone).connect(out);
    for (const f of [55, 55.35, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      running.push(o);
    }
    const breathe = ctx.createOscillator();
    breathe.frequency.value = 0.07;
    const breatheAmt = ctx.createGain();
    breatheAmt.gain.value = 70;
    breathe.connect(breatheAmt).connect(lp.frequency);
    running.push(breathe);
    // Air moving through the vents.
    const air = noise(true);
    const airLp = ctx.createBiquadFilter();
    airLp.type = 'lowpass';
    airLp.frequency.value = 380;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.12;
    air.connect(airLp).connect(airGain).connect(out);
    running.push(air);
    // The strip lights.
    const hum = ctx.createOscillator();
    hum.type = 'square';
    hum.frequency.value = 120;
    const humBand = ctx.createBiquadFilter();
    humBand.type = 'bandpass';
    humBand.frequency.value = 2400;
    humBand.Q.value = 6;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.03;
    hum.connect(humBand).connect(humGain).connect(out);
    running.push(hum);
    for (const o of running) o.start(t);
    // Far away: everything goes through a dark echo.
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.29;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.4;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 1600;
    const far = ctx.createGain();
    far.gain.value = 0.6;
    far.connect(dark);
    dark.connect(echo);
    echo.connect(feedback).connect(echo);
    echo.connect(out);
    dark.connect(out);
    let timer = null;
    const next = () => {
      const kinds = Object.keys(FAR);
      FAR[kinds[Math.floor(Math.random() * kinds.length)]](far, ctx.currentTime + 0.05);
      timer = setTimeout(next, 4500 + Math.random() * 8000);
    };
    timer = setTimeout(next, 2000 + Math.random() * 2000);
    return {
      stop() {
        clearTimeout(timer);
        for (const o of running) o.stop();
      },
    };
  }

  // A heartbeat, a pounding bass and a sour stab every few bars, at 152 BPM.
  function chase(out) {
    const step = 60 / 152 / 4; // one 16th note
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const BASS = [40, 40, 0, 40, 41, 0, 40, 0, 40, 40, 0, 43, 41, 0, 40, 0]; // E2, F2, G2
    let at = ctx.currentTime + 0.08;
    let n = 0;
    // A tense drone under it all: E and B-flat, a tritone apart.
    const pad = ctx.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = 900;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.08;
    pad.connect(padGain).connect(out);
    const drones = [52, 58, 64].map((m) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(m) * (1 + (Math.random() - 0.5) * 0.004);
      o.connect(pad);
      o.start();
      return o;
    });
    const tick = () => {
      if (at < ctx.currentTime - 0.1) at = ctx.currentTime + 0.05; // the tab was asleep: skip ahead
      while (at < ctx.currentTime + 0.3) {
        const s = n % 16;
        const bar = Math.floor(n / 16) % 4;
        const d = at - ctx.currentTime;
        if (BASS[s]) {
          const m = BASS[s] + (bar === 3 && s < 8 ? 1 : 0);
          tone({ freq: midi(m), type: 'sawtooth', dur: step * 0.95, vol: 0.34, to: out, delay: d });
          tone({ freq: midi(m + 12), type: 'square', dur: step * 0.7, vol: 0.1, to: out, delay: d });
        }
        if (s === 0 || s === 8) tone({ freq: 62, type: 'sine', dur: 0.2, slide: -30, vol: 1, to: out, delay: d }); // lub
        if (s === 3 || s === 11) tone({ freq: 55, type: 'sine', dur: 0.16, slide: -25, vol: 0.7, to: out, delay: d }); // dub
        if (s % 2 === 1) hiss({ dur: 0.04, vol: s % 4 === 3 ? 0.3 : 0.15, filter: 7000, high: true, to: out, delay: d });
        if (s === 0 && bar === 0) {
          for (const m of [64, 65, 70]) tone({ freq: midi(m), type: 'square', dur: 0.5, vol: 0.12, to: out, delay: d });
        }
        if (s === 8 && bar === 2) tone({ freq: midi(76), type: 'triangle', dur: 0.9, slide: -midi(76) * 0.3, vol: 0.08, to: out, delay: d });
        at += step;
        n++;
      }
    };
    tick();
    const timer = setInterval(tick, 60);
    return {
      stop() {
        clearInterval(timer);
        for (const o of drones) o.stop();
      },
    };
  }

  const SYNTH = { ambience, chase };

  // A bed plays one of the two, faded in and out by `fade`.
  function synthBed(name) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(ctx.destination);
    const inner = SYNTH[name](g);
    return {
      fade(level, secs) {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(level * 0.16, t + secs);
      },
      stop() {
        inner.stop();
        setTimeout(() => g.disconnect(), 3000);
      },
    };
  }

  // ------------------------------------------------------------------ files
  // A track is { src, from, to, volume }: the part of an audio file a bed loops over (seconds;
  // `to` null means to the end). Played as it is: only the volume fades in and out.
  const MUSIC = SC.DATA && SC.DATA.music;
  const TRACKS = { ambience: null, chase: null, wail: null }; // files picked in the game
  const CHASE_AT = 142; // 2:22, where the chase starts in the SlashCo ambience video
  let source = { kind: MUSIC ? 'soundtrack' : 'built-in', label: '', chaseAt: CHASE_AT };
  let theme = 'default'; // whose themes play: a slasher's id, or 'default'
  const failed = new Set(); // soundtrack files that wouldn't play

  function fileInfo(file) {
    return (MUSIC && MUSIC.files[file]) || {};
  }

  // What the bed `name` ('ambience' | 'chase') plays right now, or null for the synthesized one.
  function trackFor(name) {
    if (TRACKS[name]) return TRACKS[name];
    if (!MUSIC) return null;
    const th = MUSIC.themes[theme] || MUSIC.themes.default;
    const file = th && th[name];
    if (!file || failed.has(file)) return null;
    return { src: MUSIC.dir + file, file, volume: fileInfo(file).volume };
  }
  const keyOf = (name, tr) => (tr ? `${tr.src}#${tr.from || 0}-${tr.to == null ? '' : tr.to}` : 'synth:' + name);

  // Keep the current slasher's files loading ahead of time, so a theme starts on cue.
  const preloaded = {};
  function preload(file) {
    if (!file || preloaded[file] || !root.Audio) return;
    const a = new root.Audio();
    a.preload = 'auto';
    a.src = MUSIC.dir + file;
    preloaded[file] = a;
  }

  // Played through an <audio> element (light on memory), or decoded with Web Audio when the page
  // won't play it that way (see bufferBed).
  function trackBed(tr) {
    let level = 0;
    let inner = mediaBed(tr, () => {
      if (!tr.blob) {
        // A soundtrack file that won't play: the synthesized music stands in.
        if (tr.file) failed.add(tr.file);
        return restartMusic();
      }
      if (!ctx) return;
      inner.stop();
      inner = bufferBed(tr);
      inner.fade(level, 0.3);
    });
    return {
      fade(l, secs) {
        level = l;
        inner.fade(l, secs);
      },
      stop() {
        inner.stop();
      },
    };
  }

  // Fade an <audio> element's volume (it has no gain to ramp).
  function fadeVolume(a, level, secs, done) {
    clearInterval(a.fading);
    const v0 = a.volume;
    const t0 = performance.now();
    a.fading = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      a.volume = v0 + (level - v0) * k;
      if (k < 1) return;
      clearInterval(a.fading);
      if (done) done();
    }, 50);
  }

  function mediaBed(tr, failedToPlay) {
    const a = new root.Audio();
    const from = tr.from || 0;
    a.preload = 'auto';
    a.loop = !from && tr.to == null;
    a.volume = 0;
    a.src = tr.src;
    const start = () => {
      try {
        if (from) a.currentTime = from;
      } catch (e) {
        /* not seekable until the metadata is in */
      }
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    };
    a.addEventListener('loadedmetadata', () => from && (a.currentTime = from), { once: true });
    a.addEventListener('ended', start);
    a.addEventListener('error', failedToPlay, { once: true });
    // Keep to its part of the file: back to the start of it at the end of it.
    const watch = tr.to != null ? setInterval(() => a.currentTime >= tr.to - 0.05 && (a.currentTime = from), 40) : null;
    start();
    return {
      fade(level, secs) {
        fadeVolume(a, level, secs);
      },
      stop() {
        clearInterval(watch);
        clearInterval(a.fading);
        a.pause();
      },
    };
  }

  // Some pages won't play a picked file through an <audio> element; Web Audio can still decode
  // it. Decoded once per file, and kept.
  const decoded = new Map();
  function decode(blob) {
    if (!decoded.has(blob)) {
      const Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
      decoded.set(
        blob,
        blob.arrayBuffer().then((b) => (ctx || new Offline(1, 1, 44100)).decodeAudioData(b))
      );
    }
    return decoded.get(blob);
  }

  function bufferBed(tr) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(ctx.destination);
    let node = null;
    let stopped = false;
    decode(tr.blob)
      .then((buf) => {
        if (stopped) return;
        node = ctx.createBufferSource();
        node.buffer = buf;
        node.loop = true;
        node.loopStart = tr.from || 0;
        node.loopEnd = tr.to != null ? Math.min(tr.to, buf.duration) : buf.duration;
        node.connect(g);
        node.start(0, tr.from || 0);
      })
      .catch(() => {});
    return {
      fade(level, secs) {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(level, t + secs);
      },
      stop() {
        stopped = true;
        if (node) node.stop();
        setTimeout(() => g.disconnect(), 3000);
      },
    };
  }

  // A one-off sound from a picked file (the wail), with the built-in one if it won't play.
  function playOnce(tr, volume, fallback) {
    const a = new root.Audio(tr.src);
    a.volume = volume;
    a.addEventListener(
      'error',
      () => {
        if (!tr.blob) return fallback();
        decode(tr.blob).then((buf) => {
          const n = ctx.createBufferSource();
          const g = ctx.createGain();
          g.gain.value = volume;
          n.buffer = buf;
          n.connect(g).connect(ctx.destination);
          n.start();
        }, fallback);
      },
      { once: true }
    );
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  }

  // ------------------------------------------------------------------ stings and endings
  // The danger-level sting as a fight starts (the music waits until it's over), and the escape
  // or death track at the end. One at a time.
  let shot = null;
  let hold = 0; // until when (performance.now()) the music waits for a sting
  let holdTimer = null;

  function stopShot(secs) {
    if (!shot) return;
    const a = shot.a;
    shot = null;
    fadeVolume(a, 0, secs, () => a.pause());
  }

  function playShot(file, waitForIt, fallback) {
    stopShot(0.3);
    clearTimeout(holdTimer);
    hold = 0;
    if (!MUSIC || !file || failed.has(file)) return fallback && fallback();
    const info = fileInfo(file);
    const a = new root.Audio(MUSIC.dir + file);
    a.volume = muted ? 0 : info.volume != null ? info.volume : 1;
    const me = { a, file };
    a.addEventListener(
      'error',
      () => {
        failed.add(file);
        if (shot === me) {
          shot = null;
          hold = 0;
          applyMusic();
        }
        if (fallback) fallback();
      },
      { once: true }
    );
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
    shot = me;
    if (!waitForIt) return;
    const ms = (info.end || 8) * 1000; // where the sound actually ends; the rest is silence
    hold = performance.now() + ms;
    holdTimer = setTimeout(() => {
      hold = 0;
      applyMusic();
    }, ms);
  }

  // files: [{ name, src }]. One music file: the ambience is everything before `chaseAt` and
  // the chase everything after (if the file is long enough). Two: the ambience and the chase
  // (the one with "chase" in its name, or the second). A file with "wail" in its name is
  // Dolphin Man's wail.
  async function setTracks(files, chaseAt, kind) {
    const at = chaseAt > 0 ? chaseAt : CHASE_AT;
    const wailFile = files.find((f) => /wail/i.test(f.name));
    const music = files.filter((f) => f !== wailFile);
    let chaseFile = music.length > 1 ? music.find((f) => /chase/i.test(f.name)) || music[1] : null;
    const ambFile = music.find((f) => f !== chaseFile) || null;
    TRACKS.ambience = null;
    TRACKS.chase = null;
    let parts = [];
    if (ambFile && chaseFile) {
      TRACKS.ambience = { src: ambFile.src, blob: ambFile.blob };
      TRACKS.chase = { src: chaseFile.src, blob: chaseFile.blob };
      parts = [`${ambFile.name} (ambience)`, `${chaseFile.name} (chase)`];
    } else if (ambFile) {
      const long = (await duration(ambFile)) > at + 5;
      TRACKS.ambience = { src: ambFile.src, blob: ambFile.blob, to: long ? at : null };
      if (long) TRACKS.chase = { src: ambFile.src, blob: ambFile.blob, from: at };
      const t = `${Math.floor(at / 60)}:${String(Math.round(at % 60)).padStart(2, '0')}`;
      parts = [long ? `${ambFile.name} (ambience to ${t}, chase from ${t})` : `${ambFile.name} (ambience)`];
    }
    TRACKS.wail = wailFile ? { src: wailFile.src, blob: wailFile.blob } : null;
    if (wailFile) parts.push(`${wailFile.name} (wail)`);
    source = { kind: parts.length ? kind : MUSIC ? 'soundtrack' : 'built-in', label: parts.join(', '), chaseAt: at };
    restartMusic();
    return source;
  }

  // How long a file is (seconds), or 0 if it can't be read.
  function duration(file) {
    return new Promise((resolve) => {
      const a = new root.Audio();
      a.preload = 'metadata';
      a.addEventListener('loadedmetadata', () => resolve(Number.isFinite(a.duration) ? a.duration : 0), { once: true });
      a.addEventListener(
        'error',
        () =>
          file.blob
            ? decode(file.blob).then(
                (b) => resolve(b.duration),
                () => resolve(0)
              )
            : resolve(0),
        { once: true }
      );
      a.src = file.src;
    });
  }

  function clearTracks() {
    TRACKS.ambience = TRACKS.chase = TRACKS.wail = null;
    source = { kind: MUSIC ? 'soundtrack' : 'built-in', label: '', chaseAt: source.chaseAt };
    restartMusic();
  }

  // Files picked in the game are kept in this browser (IndexedDB), never uploaded anywhere.
  const Saved = {
    open() {
      return new Promise((resolve, reject) => {
        const r = root.indexedDB.open('sc-music', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('music');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    },
    async run(mode, fn) {
      const db = await Saved.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('music', mode);
        const req = fn(tx.objectStore('music'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      });
    },
    get: () => Saved.run('readonly', (s) => s.get('tracks')),
    put: (v) => Saved.run('readwrite', (s) => s.put(v, 'tracks')),
    clear: () => Saved.run('readwrite', (s) => s.delete('tracks')),
  };
  const urls = [];
  const asFiles = (list) =>
    list.map((f) => {
      const src = URL.createObjectURL(f.blob);
      urls.push(src);
      return { name: f.name, src, blob: f.blob };
    });

  async function useFiles(fileList, chaseAt) {
    const list = Array.from(fileList || []).map((f) => ({ name: f.name, blob: f }));
    if (!list.length) return source;
    while (urls.length) URL.revokeObjectURL(urls.pop());
    const s = await setTracks(asFiles(list), chaseAt, 'yours');
    try {
      await Saved.put({ files: list, chaseAt: s.chaseAt });
    } catch (e) {
      /* no storage here: it still plays until the page is closed */
    }
    return s;
  }

  async function loadSaved() {
    try {
      if (!root.indexedDB) return;
      const v = await Saved.get();
      if (v && v.files && v.files.length) await setTracks(asFiles(v.files), v.chaseAt, 'yours');
    } catch (e) {
      /* nothing saved, or no storage here */
    }
  }

  // ------------------------------------------------------------------ the music beds
  const beds = {}; // by track key
  const stopTimers = {};
  let wanted = null; // what should be playing: 'ambience' | 'chase' | null
  let playing = null; // { name, key, tr }

  function applyMusic() {
    if (!ctx) return; // browsers won't play sound before the first click or key press
    const tr = wanted ? trackFor(wanted) : null;
    const key = wanted ? keyOf(wanted, tr) : null;
    if (playing && key === playing.key) return;
    if (key && performance.now() < hold) return; // a sting is playing: the music waits for it
    const old = playing;
    playing = key ? { name: wanted, key, tr } : null;
    if (old && beds[old.key]) {
      const k = old.key;
      beds[k].fade(0, FADE);
      clearTimeout(stopTimers[k]);
      stopTimers[k] = setTimeout(
        () => {
          if ((playing && playing.key === k) || !beds[k]) return;
          beds[k].stop();
          delete beds[k];
        },
        FADE * 1000 + 300
      );
    }
    if (!playing) return;
    stopShot(1.2); // the end-of-fight track gives way to the music
    clearTimeout(stopTimers[key]);
    if (!beds[key]) beds[key] = tr ? trackBed(tr) : synthBed(wanted);
    beds[key].fade(levelOf(tr, wanted), FADE);
  }

  // New tracks: stop what's playing and start again with them.
  function restartMusic() {
    for (const k of Object.keys(beds)) {
      clearTimeout(stopTimers[k]);
      beds[k].stop();
      delete beds[k];
    }
    playing = null;
    applyMusic();
  }

  SC.Audio = {
    play(name) {
      if (muted || !SFX[name]) return;
      if (!ensure()) return;
      try {
        SFX[name]();
      } catch (e) {
        /* sound is optional */
      }
    },
    // 'ambience', 'chase' or null. Safe to call every frame; it only acts on a change.
    music(name) {
      if (name === wanted) return;
      wanted = name;
      try {
        applyMusic();
      } catch (e) {
        /* sound is optional */
      }
    },
    // Whose battle themes play: a slasher's id, or 'default' (the title screen).
    theme(id) {
      if (id === theme) return;
      theme = id;
      if (MUSIC) {
        const th = MUSIC.themes[id] || MUSIC.themes.default;
        preload(th.ambience);
        preload(th.chase);
      }
      applyMusic();
    },
    // A fight starts: the music stops for the sting of this danger level, then comes back.
    sting(danger) {
      if (!ensure() || muted) return;
      if (playing && beds[playing.key]) {
        const k = playing.key;
        beds[k].fade(0, 0.4);
        clearTimeout(stopTimers[k]);
        stopTimers[k] = setTimeout(() => beds[k] && (!playing || playing.key !== k) && (beds[k].stop(), delete beds[k]), 800);
        playing = null;
      }
      playShot(MUSIC && MUSIC.stings[danger], true);
    },
    // The fight is over: escaping or dying.
    ending(win) {
      wanted = null;
      if (ensure()) applyMusic();
      if (muted) return;
      playShot(MUSIC && MUSIC.endings[win ? 'win' : 'lose'], false, () => SC.Audio.play(win ? 'win' : 'lose'));
    },
    get track() {
      return playing && playing.name;
    },
    // Your own music (see the top of this file). useFiles takes the files from a file picker.
    useFiles,
    useSoundtrack() {
      clearTracks();
      return Saved.clear().catch(() => {});
    },
    get source() {
      return source;
    },
    ready: loadSaved(),
    unlock() {
      ensure();
    },
    toggle() {
      muted = !muted;
      try {
        root.localStorage.setItem('sc-muted', muted ? '1' : '0');
      } catch (e) {
        /* per-browser convenience only */
      }
      if (playing && beds[playing.key]) beds[playing.key].fade(levelOf(playing.tr, playing.name), 0.3);
      if (shot) shot.a.volume = muted ? 0 : fileInfo(shot.file).volume != null ? fileInfo(shot.file).volume : 1;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
