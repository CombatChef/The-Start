# Brayan vs The Gunman

A pixel-art battle, like Crispy's, for Brayan, a paraprofessional. It's 6:14 PM. The kids are on
Bus 13 out front, and it won't start. Brayan's keys are somewhere inside the school, and so is
the fuel. So is the Gunman. And in CLASSROOM A, something else.

Open `index.html` (after making its art and sounds: see below), or build it into one file.

## How it plays

- **The Gunman** sways in the hall, too tall for it. Most of his turns go for Brayan's nerve
  (PATIENCE): the hall goes dark around him; faces open in the dark (his own, and the faces of
  the thing in Crispy's kitchen); the one light goes out and something breathes right there; he
  whispers the kids' names; he aims and holds it; he turns his head toward CLASSROOM A and
  something moans back (**HEARING THINGS**, for 4 turns: now and then something moans down the
  hall, and at the classroom door Brayan hears all of it at once, its moaning and the other one
  over each other, the bars flashing red and yellow, and can't tell what's really in there).
  Some go for Brayan himself. Now and then (from round 3, never two close together)
  he cocks the gun: a **DODGE** button comes up for a moment. Tap it in time (or D / SPACE) and
  Brayan's on the floor when it fires; miss it and it takes nearly half his health. Either way,
  the hall lights up white for an instant, in big pixels, and his ears ring.
- **PATIENCE** pays for SKILLs (Firm Voice, Chair Throw, Brace, Deep Breath). If it runs out,
  Brayan freezes and loses a turn.
- **ACT**: Check; Talk; The Kids (his ATK down); Distract (a timing test: stop the mark in the
  gap; miss and the turn's gone; land it and he's DISTRACTED); Squint (his eyes narrow to a
  slit; critical hits much likelier for 2 turns).
- **ITEM**: Bacon Egg & Cheese (heals a lot), Newports (some PATIENCE, and SHARP EARS: listening
  at a door is loud and clear).
- **Kill him** and it's over: Brayan walks out to the bus.

## Getting out

The bus needs the fuel (one can, for now) and the keys.

1. **The front hallway.** Stun the Gunman (damage fills his STUN bar) or distract him, then
   **FLEE**, into HALLWAY A.
2. **HALLWAY A.** Five seconds to find the fuel can in the dark and tap it, then he's back (miss
   it, and it's another trip). Here he has to be stunned to FLEE: back to the entrance, into
   CLASSROOM A, or **CHECK CLASSROOM A** first.
3. **CLASSROOM A.** Something in there makes the sounds, and every round it's a new roll how
   awake it is. Checking the door shows them on a visualizer, with the music turned right down:
   nothing (it's quiet), moaning (it's half awake), or the other one (it's awake: walk in and it
   has him). Unless he's HEARING THINGS: then he hears all of it, and can't tell.
   Inside, in the dark, there are the keys, and the bear one of the kids asked for (on a
   different chair, most games). It wakes fast while he looks: its sounds, lower and quieter; a
   root grows down out of the ceiling; a few seconds later it's awake, and the roots come down
   all across the ceiling at his face. Twenty seconds of that and it has him. **BACK TO THE
   DOOR** gets him out, back to the fight in HALLWAY A.
4. **Out.** With the fuel and the keys: stun him in HALLWAY A, FLEE back to the entrance, stun or
   distract him there, and FLEE out the front doors to Bus 13. (The bear's for the ending.)

Brayan gets one SECOND WIND: the first time he goes down, he gets back up.

## Making it

The photos (the three places, from the school), Brayan's portrait, the classroom's jumpscare
frames and the sounds aren't in the repo, nor is anything made from them. (The faces from
Crispy's fight come from its creature sheet, which is.) Put `hallway.webp`,
`hallway_a.webp`, `classroom.webp`, `brayan_portrait.png` and `scare_frames.jpg` in
`brayan/assets/source/`, and `ripple.mp3` (the music), `moan_2.mp3` and `moan_3.mp3` (what's in
CLASSROOM A, half awake and awake) in `brayan/assets/audio/`. Then:

    python3 brayan/tools/make_images.py   # the places, after hours; the sprites; brayan/js/images.js
    node brayan/tools/make_sounds.js      # brayan/js/sounds.js
    node brayan/tools/build.js            # brayan/dist/index.html: one file, everything in it
    node brayan/tests/simulate.js         # the numbers, over many fights

The school's name and logo are taken off its doors, and the teacher's nameplate off the desk;
the chair in the corner of the first photo is cropped away. The fuel can, the keys and the bear
are drawn into the dark where they'd really be: the can standing in a doorway of HALLWAY A, the
keys flat on the teacher's desk, the bear on one of four chairs.

    js/data.js     the numbers and the words
    js/battle.js   the rules: each command's events
    js/scene.js    the school, the Gunman, the effects, CLASSROOM A
    js/audio.js    the music, the sounds (synthesized, and CLASSROOM A's)
    js/ui.js       the HUD, the menus, and the real-time parts
