# Crispy vs The Creature

A turn-based birthday battle, all in pixels. It's late, everyone's asleep upstairs, and something
is standing in Chris's living room. Crispy Soto (Level 99, from his stats doc) has to fight it with a Hard Foam Buster
Sword, a trash bag and a handheld console while it ADJUSTS through five forms, each more like a
man, until it calls itself Andy.

Open `index.html` (or the single-file build, below) and press START. Arrows choose, Enter or Z
picks, Esc or X goes back; or click.

## How it plays

- **FIGHT** swings the foam sword (and gets back a little SP). **SKILL** is Crispy's skills from
  the doc: Trash Bag (can tear: more damage, and poison), Early Bird, Authority (clear his bad
  effects, or the creature's good ones), RG 405M (can disarm it), Wine Break, Crispy Slice (stacks
  twice, for the rest of the fight) and Taste of Reality (the sword is real: triple damage for 3
  turns, once a fight). Skills cost **SP**, which comes back a little each round.
- **NUTCRACKAAAA!!!**, his special, only works at half health or less, and he can use it twice in
  one turn. Medium chance of a fatal critical hit, small chance of an instant K.O.
- **ACT**: Check it (free: doesn't use his turn), turn the lights up (it hates being seen), take a
  fearless stance, talk to it, show it the family photos, open the front door, or get the family
  out. **ITEM**: 70% dark chocolate, grilled cheese, allergy pills, car keys (the alarm makes it
  lose a turn, once).
- **Health** reads as on SlashCo VR's HUD: a coloured word under a heart. The first time it runs
  out, the **pilot light** (his willpower to protect his family) brings him back; the second time
  he falls.
- **The creature** ADJUSTS into its next form every third turn (the oven timer counts down), or
  the moment a form's health runs out; each form has its own stats from the doc. Only Andy can be
  killed.

## Three ways out

- **Fight**: beat Andy.
- **Spare**: fill its **MERCY** bar (in its box) to 100%. Talk and Show it the photos raise it,
  more the more human it gets; Open the front door adds some once. Hurting it lowers it. The fuller
  the bar, the more often it can't bring itself to attack. At 100%, MERCY > SPARE and it walks out
  of the front door.
- **Flee**: Get the family out, three times: wake them (always works), down the stairs behind its
  back (a sure thing while the car alarm has it distracted, or the lights have it EXPOSED), and out
  the back door (much likelier with the front door open). If it hears them, it lunges and Crispy
  takes the hit. The FAMILY line in his box shows where they are. Once they're in the car, MERCY >
  FLEE; with the front door shut it gets one swipe at him on the way out.

Each one ends the same way: a long, calm breath and a fade to black.

`node crispy/tests/simulate.js` plays thousands of fights with a few kinds of player to check the
balance: someone who plays normally wins about 9 times in 10, mashing ATTACK about half the time;
someone who only goes for SPARE always gets there, and FLEE works about 9 times in 10.

## Building

The family photos aren't in the repo, nor is anything made from them. Put `crispy_photo.webp` and
`living_room.webp` in `crispy/assets/source/`, then:

```
pip install numpy opencv-python-headless pillow onnxruntime
python3 crispy/tools/cutout.py u2net_human_seg.onnx   # cut Crispy out of his photo (see the script)
python3 crispy/tools/make_images.py                   # -> crispy/js/images.js
node crispy/tools/build.js                            # -> crispy/dist/index.html, one file
```

## Files

```
index.html, css/style.css   the page and its pixel HUD (black boxes, a trash-bag cursor)
js/data.js                  Crispy's stats, skills, items and acts; the creature's stages  <- tune here
js/battle.js                the turn engine (no DOM; the test runs it too)
js/creature.js              the creature: its sprites, moving
js/scene.js                 the room, Crispy's portrait, and every move's screen effect, drawn
                            at a third of the resolution so it's all the same chunky pixels
js/audio.js                 the music and the synthesized sound effects
js/ui.js, js/main.js        the HUD, the menus and the flow of a fight
tests/simulate.js           headless balance test
tools/                      builds the art, cuts Crispy out, builds the single file
assets/source/              the creature's sprite sheet, the trash bag / grilled cheese / sword
                            sheet, and references
assets/audio/               Arachnophobia (OMORI), slowed with reverb
```
