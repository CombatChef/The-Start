// Starts Crispy's birthday battle: fits the stage to the window and runs the frames.
(function () {
  const stage = document.getElementById('stage');
  function fit() {
    const k = Math.min(window.innerWidth / 1280, window.innerHeight / 960);
    stage.style.transform = `scale(${k})`;
  }
  window.addEventListener('resize', fit);
  fit();

  const I = window.CRISPY_IMAGES;
  window.AUDIO.init('assets/audio/arachnophobia-slowed-reverb.mp3');
  window.CREATURE.init(I);
  window.SCENE.init(I);
  window.UI.init();

  const ctx = document.getElementById('scene').getContext('2d');
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    window.CREATURE.update(dt);
    window.SCENE.update(dt);
    if (window.SCENE.bg.complete) window.SCENE.draw(ctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
