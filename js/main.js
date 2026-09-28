/*
 * SLASHCO VR — TURN-BASED BATTLE
 * main.js — title screen → battle loop → end screen, forever.
 */
(function (root) {
  'use strict';
  const SC = root.SC;

  async function battle() {
    const b = new SC.Battle({ io: SC.UI.io, enemy: SC.UI.enemy });
    SC.UI.setBattle(b);
    SC.UI.resolving(true);
    await b.start();
    while (!b.outcome) {
      await b.beginTurn();
      if (b.outcome) break;
      SC.UI.resolving(false);
      const choice = await SC.UI.commandPhase(b);
      SC.UI.resolving(true);
      if (choice.run) await b.runTurn();
      else await b.resolveTurn(choice.commands);
    }
    SC.UI.resolving(false);
    await new Promise((r) => setTimeout(r, 700));
    await SC.UI.showEnd(b);
  }

  async function boot() {
    try {
      if (root.document.fonts && root.document.fonts.load) {
        await Promise.all(
          ['34px VT323', '20px Silkscreen', 'bold 20px Silkscreen', 'bold 40px "Pixelify Sans"'].map((f) => root.document.fonts.load(f).catch(() => null))
        );
      }
    } catch (e) {
      /* the fallback fonts are fine */
    }
    await SC.Art.loadPortraits();
    SC.UI.build();
    for (;;) {
      await SC.UI.title();
      await battle();
    }
  }

  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
