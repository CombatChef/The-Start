/*
 * Sound for Crispy's birthday battle: the music (Arachnophobia, slowed with reverb) and a
 * synthesized sound for everything that happens, each matched to what's on screen: a foam
 * sword's thump, a trash bag's crinkle and rip, an alarm clock and birdsong, a gavel, the RG
 * 405M's start-up chime and an electric crackle, a cork and a pour, a shine that becomes an
 * explosion and a CRACK, a car alarm, bones snapping as the creature ADJUSTS...
 */
(function () {
  const A = { ctx: null, master: null, sfxOn: true, musicOn: true, music: null };
  window.AUDIO = A;

  A.init = function (musicSrc) {
    A.music = new Audio(musicSrc);
    A.music.loop = true;
    A.music.volume = 0.55;
  };
  // Browsers only allow sound after a click: the title screen's START does this.
  A.unlock = function () {
    if (!A.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.7;
      // a little room reverb under everything
      A.verb = A.ctx.createConvolver();
      A.verb.buffer = impulse(1.6, 2.4);
      A.wet = A.ctx.createGain();
      A.wet.gain.value = 0.22;
      A.master.connect(A.ctx.destination);
      A.master.connect(A.verb);
      A.verb.connect(A.wet);
      A.wet.connect(A.ctx.destination);
      A.noiseBuf = noiseBuffer(2);
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
  };
  A.playMusic = function () {
    if (!A.music || !A.musicOn) return;
    A.music.volume = 0.55;
    A.music.play().catch(() => {});
  };
  A.stopMusic = function (fade = 1.5) {
    if (!A.music) return;
    const m = A.music;
    const v0 = m.volume;
    const t0 = performance.now();
    const step = () => {
      const p = (performance.now() - t0) / (fade * 1000);
      if (p >= 1) {
        m.pause();
        m.volume = v0;
        return;
      }
      m.volume = v0 * (1 - p);
      requestAnimationFrame(step);
    };
    step();
  };
  A.toggleMusic = function () {
    A.musicOn = !A.musicOn;
    if (A.musicOn) A.playMusic();
    else if (A.music) A.music.pause();
    return A.musicOn;
  };
  A.toggleSfx = function () {
    A.sfxOn = !A.sfxOn;
    return A.sfxOn;
  };

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

  // ------------------------------------------------------------------ building blocks
  // A tone: type, frequency (or [from, to] for a slide), start offset, length, volume.
  function tone(type, f, at, dur, vol = 0.3, o = {}) {
    const ctx = A.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    const [f0, f1] = Array.isArray(f) ? f : [f, f];
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * (o.slideTime || 1));
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
    const attack = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
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
    g.connect(o.dest || A.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  // Noise through a filter, with its cutoff swept from one frequency to another.
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
  const crack = (at, vol = 0.4) => {
    noise(at, 0.06, vol, { type: 'highpass', f: 1800 });
    tone('square', [900, 120], at, 0.05, vol * 0.4);
  };
  function chime(at, freqs, step = 0.07, vol = 0.12, type = 'sine', dur = 0.5) {
    freqs.forEach((f, i) => tone(type, f, at + i * step, dur, vol));
  }

  // ------------------------------------------------------------------ the sounds
  const S = {
    // menus: an appliance's beeps
    move: () => tone('square', 1320, 0, 0.035, 0.05),
    confirm: () => {
      tone('square', 1760, 0, 0.06, 0.07);
      tone('square', 2350, 0.06, 0.07, 0.06);
    },
    back: () => tone('square', [1200, 700], 0, 0.08, 0.06),
    deny: () => tone('sawtooth', 160, 0, 0.18, 0.12, { filter: ['lowpass', 900] }),
    text: () => tone('square', 520 + Math.random() * 60, 0, 0.025, 0.025),
    creepyText: () => tone('sawtooth', 110 + Math.random() * 30, 0, 0.05, 0.05, { filter: ['lowpass', 700] }),

    // ATTACK: the foam sword
    swing: () => whoosh(0, 0.32, 0.35, true),
    foam: () => {
      thump(0, 130, 0.55, 0.22);
      noise(0, 0.12, 0.25, { f: 600 });
      tone('sine', [300, 520], 0.04, 0.16, 0.06); // a little foamy boing
    },
    realSlash: () => {
      whoosh(0, 0.18, 0.4, true);
      noise(0.15, 0.5, 0.18, { type: 'bandpass', f: 6000, q: 8 });
      tone('sine', 2490, 0.15, 0.9, 0.08);
      tone('sine', 3730, 0.15, 0.7, 0.05);
      thump(0.15, 90, 0.5);
    },
    // Trash Bag: a heavy swing, plastic crinkling, a wet thud; the rip; garbage juice
    trash: () => {
      whoosh(0, 0.45, 0.32);
      for (let i = 0; i < 6; i++) noise(0.05 + i * 0.05, 0.04, 0.08, { type: 'highpass', f: 4000 + Math.random() * 3000 });
    },
    thud: () => {
      thump(0, 85, 0.75, 0.35);
      noise(0, 0.2, 0.3, { f: [1200, 200] });
    },
    tear: () => {
      noise(0, 0.35, 0.35, { type: 'bandpass', f: [5000, 900], q: 3 });
      for (let i = 0; i < 7; i++) click(0.1 + i * 0.04 + Math.random() * 0.03, 0.15, 1500 + Math.random() * 2000);
    },
    poison: () => {
      for (let i = 0; i < 6; i++) tone('sine', [300 + Math.random() * 300, 700 + Math.random() * 300], i * 0.08, 0.07, 0.07);
    },
    // Early Bird: a ringing alarm clock, then birdsong
    early: () => {
      for (let i = 0; i < 22; i++) tone('square', i % 2 ? 1760 : 1568, i * 0.035, 0.03, 0.05);
      for (let k = 0; k < 3; k++) {
        tone('sine', [3200, 5200], 0.9 + k * 0.22, 0.08, 0.08);
        tone('sine', [5000, 3600], 0.98 + k * 0.22, 0.07, 0.06);
      }
      chime(0.85, [784, 988, 1175, 1568], 0.06, 0.06, 'triangle', 0.4);
    },
    // Authority: the gavel
    gavel: () => {
      tone('triangle', [220, 140], 0, 0.12, 0.5);
      noise(0, 0.05, 0.4, { type: 'bandpass', f: 1800, q: 3 });
      thump(0, 70, 0.6, 0.4);
      tone('triangle', [220, 140], 0.28, 0.12, 0.45);
      noise(0.28, 0.05, 0.35, { type: 'bandpass', f: 1800, q: 3 });
    },
    // RG 405M: the console starting up, then lightning
    rg: () => {
      chime(0, [523, 659, 784, 1047, 1319], 0.06, 0.07, 'square', 0.12);
      for (let i = 0; i < 9; i++) noise(0.45 + i * 0.07 + Math.random() * 0.04, 0.09, 0.25, { type: 'bandpass', f: 1500 + Math.random() * 4000, q: 4 });
      tone('sawtooth', [60, 120], 0.45, 0.8, 0.12, { filter: ['lowpass', 1200], vibrato: [30, 40] });
      crack(0.55, 0.45);
      crack(0.85, 0.4);
    },
    // Wine Break: a cork, a pour
    wine: () => {
      noise(0, 0.025, 0.4, { type: 'bandpass', f: 2200, q: 2 });
      tone('sine', [500, 1200], 0, 0.08, 0.2);
      noise(0.3, 1.0, 0.12, { type: 'bandpass', f: [700, 1300], q: 6, attack: 0.1 });
      for (let i = 0; i < 6; i++) tone('sine', [400 + i * 60, 520 + i * 60], 0.35 + i * 0.13, 0.08, 0.05);
    },
    heal: () => chime(0, [784, 988, 1175, 1568, 1976], 0.055, 0.08, 'triangle', 0.35),
    // Crispy Slice: two quick cuts, and a crunch (crispy!)
    slice: () => {
      whoosh(0, 0.14, 0.35, true);
      whoosh(0.16, 0.14, 0.35, true);
      noise(0.1, 0.3, 0.12, { type: 'bandpass', f: 7000, q: 6 });
      for (let i = 0; i < 9; i++) click(0.3 + i * 0.025, 0.18, 3000 + Math.random() * 4000);
    },
    // Taste of Reality: the foam turning to steel, ringing up
    taste: () => {
      tone('sine', [220, 880], 0, 1.0, 0.1);
      tone('sine', [330, 1320], 0.05, 1.0, 0.06);
      noise(0, 1.1, 0.06, { type: 'bandpass', f: [800, 8000], q: 6, attack: 0.6 });
      tone('sine', 2637, 1.0, 1.6, 0.1);
      tone('sine', 3951, 1.0, 1.4, 0.06);
      noise(1.0, 0.25, 0.25, { type: 'highpass', f: 5000 });
    },
    // NUTCRACKAAAA!!!: a shine that grows... into a huge explosion, and a CRACK
    nutShine: () => {
      tone('sine', [1800, 4200], 0, 1.1, 0.07, { attack: 0.6 });
      chime(0, [2093, 2637, 3136, 4186], 0.18, 0.05, 'sine', 0.5);
      tone('sine', [200, 1200], 0.2, 1.0, 0.05, { attack: 0.8 });
    },
    boom: () => {
      noise(0, 2.2, 0.9, { f: [3000, 60], attack: 0.01 });
      tone('sine', [90, 28], 0, 1.6, 0.9);
      tone('sawtooth', [70, 30], 0, 0.8, 0.25, { filter: ['lowpass', 300] });
      noise(0.05, 1.4, 0.3, { type: 'bandpass', f: [1200, 200], q: 0.8 });
    },
    crack: () => {
      crack(0, 0.8);
      noise(0.02, 0.25, 0.5, { type: 'highpass', f: [6000, 2000] });
      tone('square', [2400, 200], 0, 0.12, 0.2);
    },
    // ACT
    lights: () => {
      click(0, 0.4, 2500);
      tone('sawtooth', [55, 120], 0.05, 0.9, 0.06, { filter: ['lowpass', 600] });
      tone('sine', 120, 0.1, 1.2, 0.04);
    },
    lightsFail: () => {
      click(0, 0.4, 2500);
      for (let i = 0; i < 4; i++) tone('sawtooth', 120, 0.1 + i * 0.16, 0.08, 0.08, { filter: ['lowpass', 900] });
    },
    stance: () => {
      whoosh(0, 0.4, 0.25, true);
      chime(0.1, [392, 523, 659, 784], 0.08, 0.09, 'square', 0.2);
      thump(0.4, 80, 0.6);
    },
    talk: () => {
      for (let i = 0; i < 7; i++) tone('square', 240 + ((i * 37) % 80), i * 0.07, 0.05, 0.04);
    },
    reply: () => {
      for (let i = 0; i < 7; i++) tone('sawtooth', [140 - i * 6, 90], i * 0.09, 0.08, 0.06, { filter: ['lowpass', 800] });
    },
    // ITEM
    bite: () => {
      for (let i = 0; i < 5; i++) noise(i * 0.06, 0.05, 0.25, { type: 'bandpass', f: 2500 + Math.random() * 2000, q: 1.5 });
    },
    sizzle: () => noise(0, 0.9, 0.1, { type: 'highpass', f: 5000, attack: 0.1 }),
    pills: () => {
      tone('sine', [600, 1400], 0, 0.05, 0.2);
      tone('sine', [700, 1500], 0.15, 0.05, 0.2);
      chime(0.3, [1047, 1319, 1568, 2093, 2637], 0.04, 0.06, 'triangle', 0.25);
    },
    keys: () => {
      for (let i = 0; i < 10; i++) tone('sine', 3000 + Math.random() * 3000, i * 0.04 + Math.random() * 0.02, 0.12, 0.05);
      tone('square', 1800, 0.5, 0.06, 0.08);
      tone('square', 1800, 0.62, 0.06, 0.08);
    },
    alarm: () => {
      // the car alarm: a siren, then honks
      tone('square', [700, 1400], 0, 0.35, 0.1, { filter: ['lowpass', 2500] });
      tone('square', [1400, 700], 0.35, 0.35, 0.1, { filter: ['lowpass', 2500] });
      tone('square', [700, 1400], 0.7, 0.35, 0.1, { filter: ['lowpass', 2500] });
      for (let i = 0; i < 3; i++) tone('sawtooth', 420, 1.1 + i * 0.22, 0.14, 0.12, { filter: ['lowpass', 1600] });
    },
    // MERCY
    flee: () => {
      for (let i = 0; i < 4; i++) thump(i * 0.16, 120, 0.4, 0.1);
    },
    spare: () => {
      chime(0, [523, 659, 784], 0.15, 0.08, 'sine', 0.8);
      tone('sawtooth', [60, 45], 0.9, 1.0, 0.1, { filter: ['lowpass', 300] });
    },
    // hits
    hurt: () => {
      thump(0, 100, 0.7, 0.3);
      noise(0, 0.15, 0.35, { f: [3000, 400] });
    },
    block: () => {
      thump(0, 160, 0.45, 0.2);
      tone('sine', [350, 600, 350], 0, 0.25, 0.08);
      tone('triangle', [400, 900], 0.02, 0.12, 0.06);
    },
    miss: () => whoosh(0, 0.25, 0.2),
    // the creature
    claw: () => {
      noise(0, 0.22, 0.4, { type: 'bandpass', f: [6000, 1200], q: 2 });
      noise(0.06, 0.18, 0.25, { type: 'bandpass', f: [5000, 900], q: 2 });
      noise(0.1, 0.25, 0.2, { f: 700 }); // wet
    },
    reach: () => {
      for (let i = 0; i < 6; i++) click(i * 0.08, 0.25, 900 + Math.random() * 600);
      whoosh(0.4, 0.4, 0.3);
    },
    screech: () => {
      for (const d of [-25, 0, 31]) tone('sawtooth', [900, 1500], 0, 1.1, 0.06, { detune: d, vibrato: [11, 90], filter: ['bandpass', 1800, 2] });
      noise(0, 1.0, 0.12, { type: 'bandpass', f: [2500, 4000], q: 4 });
    },
    scream: () => {
      for (const d of [-40, 0, 37]) tone('sawtooth', [300, 700], 0, 1.2, 0.07, { detune: d, vibrato: [7, 60], filter: ['bandpass', 1100, 1.5] });
      noise(0, 1.1, 0.12, { type: 'bandpass', f: 1500, q: 2 });
    },
    lash: () => {
      for (let i = 0; i < 3; i++) {
        whoosh(i * 0.18, 0.12, 0.25, true);
        crack(i * 0.18 + 0.11, 0.3);
      }
    },
    weep: () => {
      for (let i = 0; i < 6; i++) tone('sine', [900 - i * 40, 300], 0.1 + i * 0.22, 0.12, 0.08);
      tone('sine', [220, 180], 0, 1.4, 0.05, { vibrato: [5, 8] });
    },
    bones: () => {
      for (let i = 0; i < 8; i++) crack(i * 0.09 + Math.random() * 0.05, 0.3);
    },
    stare: () => tone('sawtooth', [55, 52], 0, 1.4, 0.12, { filter: ['lowpass', 260], attack: 0.4 }),
    harden: () => {
      noise(0, 0.8, 0.2, { type: 'bandpass', f: [300, 900], q: 3, attack: 0.2 });
      for (let i = 0; i < 4; i++) click(0.2 + i * 0.12, 0.25, 600);
    },
    lunge: () => {
      whoosh(0, 0.3, 0.4, true);
      tone('sawtooth', [180, 90], 0.05, 0.4, 0.12, { filter: ['lowpass', 900] });
    },
    grab: () => {
      thump(0, 90, 0.6);
      thump(0.08, 90, 0.5);
      noise(0.2, 0.6, 0.1, { f: 500, attack: 0.2 });
    },
    smile: () => {
      tone('sine', [300, 1200], 0, 1.4, 0.07, { vibrato: [6, 25], attack: 0.4 });
      tone('sine', [302, 1190], 0, 1.4, 0.05, { vibrato: [5, 20], attack: 0.4 });
    },
    pat: () => {
      thump(0, 140, 0.3, 0.12);
      thump(0.28, 140, 0.3, 0.12);
      tone('sine', 1760, 0.5, 0.6, 0.03);
    },
    twitch: () => {
      for (let i = 0; i < 10; i++) click(i * 0.06 + Math.random() * 0.03, 0.2, 400 + Math.random() * 800);
    },
    distracted: () => S.alarm(),
    // ADJUST: bones snapping, wet tearing, a groan bending lower
    // ADJUST: under it, a groan and something wet; each of its snaps is its own sound (snap)
    adjust: () => {
      noise(0.8, 1.4, 0.3, { type: 'bandpass', f: [400, 1400], q: 2, attack: 0.3 });
      noise(1.0, 1.2, 0.2, { f: 500, attack: 0.2 });
      for (const d of [-30, 0, 20]) tone('sawtooth', [160, 55], 0.3, 2.8, 0.08, { detune: d, filter: ['lowpass', 700], vibrato: [4, 10], attack: 0.5 });
      thump(1.9, 70, 0.7, 0.5);
      noise(1.9, 0.4, 0.3, { f: [800, 200] }); // squelch
    },
    // a bone, snapping out of place
    snap: () => {
      crack(0, 0.5 + Math.random() * 0.2);
      thump(0, 140 + Math.random() * 60, 0.35, 0.07);
      noise(0.01, 0.08, 0.2, { type: 'bandpass', f: 1800 + Math.random() * 1500, q: 3 });
    },
    // when Crispy's health runs out the first time: he hits the floor; his heart, slow; a memory
    // at a time, like a music box running down; then he gets back up
    fall: () => {
      thump(0, 60, 0.9, 0.5);
      noise(0, 0.5, 0.3, { f: [900, 120] });
      tone('sine', [220, 110], 0.1, 1.6, 0.05, { attack: 0.2 });
    },
    heartbeat: () => {
      for (let i = 0; i < 6; i++) {
        thump(i * 0.85, 58, 0.7, 0.16);
        thump(i * 0.85 + 0.2, 52, 0.5, 0.16);
      }
    },
    memory: () => {
      const f = [523, 587, 659, 784][Math.floor(Math.random() * 4)];
      tone('sine', f, 0, 1.4, 0.05, { detune: -25, vibrato: [5, 6] });
      tone('triangle', f / 2, 0.02, 1.0, 0.03, { detune: -30 });
      noise(0, 0.6, 0.03, { type: 'bandpass', f: 3000, q: 0.5, attack: 0.2 });
    },
    rise: () => {
      for (const [f, d] of [[110, 0], [165, 4], [220, -3], [277, 6]]) tone('sawtooth', f, 0, 2.6, 0.035, { detune: d, attack: 0.9, filter: ['lowpass', 700] });
      thump(0.1, 70, 0.5, 0.4);
    },
    // a blink: the room goes away for a second
    blink: () => {
      noise(0, 0.4, 0.05, { type: 'bandpass', f: [600, 200], q: 0.8, attack: 0.15 });
      tone('sine', [70, 60], 0.3, 1.4, 0.08, { attack: 0.3 });
    },
    lose: () => {
      [392, 349, 311, 262, 196].forEach((f, i) => tone('triangle', f, i * 0.35, 0.6, 0.1));
      tone('sawtooth', [80, 40], 1.6, 2, 0.08, { filter: ['lowpass', 300] });
    },
    // MERCY going up (a soft rising pair) or down (a dull drop)
    mercyUp: () => chime(0, [659, 988], 0.09, 0.06, 'triangle', 0.5),
    mercyDown: () => tone('triangle', [330, 196], 0, 0.25, 0.07),
    // ACT: Check, a thermostat's beep
    check: () => {
      tone('square', 2093, 0, 0.05, 0.05);
      tone('square', 2093, 0.1, 0.05, 0.05);
      tone('sine', [700, 1400], 0.2, 0.3, 0.04);
    },
    // the family photos: a quiet music box
    photos: () => chime(0, [784, 659, 523, 587, 659], 0.22, 0.05, 'sine', 1.1),
    // the front door: the latch, the hinge, the night outside
    door: () => {
      click(0, 0.35, 1800);
      tone('sawtooth', [180, 260], 0.12, 0.9, 0.05, { filter: ['bandpass', 900, 6], vibrato: [11, 30] });
      noise(0.3, 2.4, 0.08, { type: 'bandpass', f: [300, 700], q: 0.8, attack: 0.8 });
    },
    // a phone buzzing upstairs, then a reply
    phone: () => {
      for (let i = 0; i < 2; i++) tone('sawtooth', 150, i * 0.32, 0.22, 0.08, { filter: ['lowpass', 400] });
      chime(1.1, [1568, 2093], 0.08, 0.05, 'sine', 0.25);
    },
    // footsteps, trying to be quiet
    sneak: () => {
      for (let i = 0; i < 5; i++) thump(i * 0.28, 90, 0.18, 0.09);
    },
    // a stair creaking
    creak: () => {
      tone('sawtooth', [220, 140], 0, 0.6, 0.09, { filter: ['bandpass', 700, 7], vibrato: [17, 25] });
      tone('sawtooth', [160, 120], 0.15, 0.45, 0.05, { filter: ['bandpass', 500, 5], vibrato: [9, 18] });
    },
    // the creature can't bring itself to do it
    hesitate: () => tone('sine', [196, 185], 0, 1.2, 0.06, { attack: 0.3 }),
    // the car starting, the headlights, driving away
    engine: () => {
      for (let i = 0; i < 3; i++) noise(i * 0.12, 0.1, 0.18, { type: 'bandpass', f: 300, q: 3 }); // the starter
      tone('sawtooth', [40, 55], 0.4, 1.4, 0.12, { filter: ['lowpass', 220], attack: 0.1 });
      tone('sawtooth', [55, 90], 1.6, 2.2, 0.1, { filter: ['lowpass', 260], attack: 0.2 });
      noise(1.6, 2.4, 0.08, { f: [500, 150], attack: 0.3 });
    },
    // the basement door's hinges
    groan: () => tone('sawtooth', [120, 80], 0, 0.9, 0.08, { filter: ['bandpass', 450, 6], vibrato: [7, 20] }),
    // Show it who he is: their names; a 4 AM alarm clock; bags landing; a stare-down; holding the line
    names: () => chime(0, [523, 659, 784], 0.36, 0.06, 'sine', 0.9),
    fourAm: () => {
      for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) tone('square', 1976, k * 0.5 + i * 0.07, 0.05, 0.05);
    },
    hands: () => {
      for (let i = 0; i < 3; i++) thump(0.2 + i * 0.28, 95, 0.35, 0.18);
      chime(1.0, [784, 1175], 0.1, 0.05, 'triangle', 0.6);
    },
    noBlink: () => {
      tone('sine', [65, 60], 0, 2.0, 0.12, { attack: 0.5 });
      for (let i = 0; i < 3; i++) thump(0.3 + i * 0.45, 55, 0.4, 0.15);
      click(1.3, 0.2, 900); // it blinks
    },
    // its new moves
    chomp: () => {
      thump(0, 150, 0.55, 0.15);
      noise(0, 0.12, 0.4, { type: 'bandpass', f: 1300, q: 2 });
      for (let i = 0; i < 4; i++) click(0.04 + i * 0.03, 0.18, 2500 + Math.random() * 1500);
    },
    flicker: () => {
      for (const at of [0.1, 0.2, 0.3, 0.55]) click(at, 0.3, 1200);
      tone('sawtooth', 60, 0, 0.6, 0.06, { filter: ['lowpass', 400] });
    },
    bile: () => {
      noise(0, 0.35, 0.3, { f: [300, 1400], q: 3, attack: 0.15 }); // the retch
      noise(0.45, 0.2, 0.35, { f: [900, 200] }); // the splash
      noise(0.5, 0.8, 0.08, { type: 'highpass', f: 5000, attack: 0.1 }); // it burns
    },
    lure: () => {
      // a voice, almost
      tone('sawtooth', [210, 240], 0, 0.35, 0.05, { filter: ['bandpass', 1100, 5], vibrato: [6, 9], attack: 0.05 });
      tone('sawtooth', [250, 170], 0.42, 0.55, 0.05, { filter: ['bandpass', 800, 5], vibrato: [5, 12], attack: 0.05 });
    },
    drop: () => {
      whoosh(0, 0.45, 0.25, true);
      whoosh(0.5, 0.15, 0.4);
      thump(0.62, 70, 0.9, 0.45);
      noise(0.62, 0.4, 0.35, { f: [1500, 150] });
    },
    rimshot: () => {
      thump(0, 200, 0.35, 0.1);
      thump(0.16, 160, 0.35, 0.1);
      noise(0.42, 0.5, 0.2, { type: 'highpass', f: 6000 });
    },
    slam: () => {
      thump(0, 80, 0.9, 0.35);
      noise(0, 0.15, 0.4, { f: [2000, 300] });
      click(0.35, 0.3, 2500);
    },
    // the end: one long, calm breath in, and out
    breath: () => {
      noise(0, 1.9, 0.09, { type: 'bandpass', f: [280, 900], q: 0.9, attack: 1.5 });
      noise(2.1, 2.9, 0.1, { type: 'bandpass', f: [800, 220], q: 0.8, attack: 0.25 });
      for (const [f, d] of [[131, 0], [196, 4], [262, -3]]) tone('sine', f, 0.6, 5, 0.04, { detune: d, attack: 2 });
    },
  };
  A.S = S;
  A.play = function (name) {
    if (!A.ctx || !A.sfxOn || !S[name]) return;
    try {
      S[name]();
    } catch (e) {
      /* a sound never stops the game */
    }
  };
})();
