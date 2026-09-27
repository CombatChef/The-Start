/*
 * SLASHCO VR — TURN-BASED BATTLE
 * audio.js — small synthesized sound effects (no audio files). M toggles mute.
 */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  let ctx = null;
  let master = null;
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
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + (o.dur || 0.1) + 0.02);
  }

  function hiss(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const len = Math.floor(ctx.sampleRate * (o.dur || 0.2));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = o.band ? 'bandpass' : 'lowpass';
    f.frequency.value = o.filter || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.5 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (o.dur || 0.2));
    src.connect(f).connect(g).connect(master);
    src.start(t);
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
    death: () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.22, vol: 0.22, type: 'triangle', delay: i * 0.16 })),
    run: () => [262, 330, 392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.1, vol: 0.2, delay: i * 0.07 })),
    win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.14, vol: 0.22, type: 'triangle', delay: i * 0.12 })),
    lose: () => [330, 311, 294, 277, 262].forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.2, type: 'sawtooth', delay: i * 0.25 })),
  };

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
      return muted;
    },
    get muted() {
      return muted;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
