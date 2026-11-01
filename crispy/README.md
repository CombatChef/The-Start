# Crispy vs The Creature

A turn-based birthday battle, all in pixels. It's late, everyone's asleep, and something
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
  fearless stance, talk to it, show it who he is (a different ACT each time), open the front door,
  or get the family out. **ITEM**: 70% dark chocolate, grilled cheese, allergy pills, car keys
  (the alarm makes it lose a turn, once), and the **speaker**: it plays one of three songs,
  slowed down and drenched in reverb, instead of the battle music. For 3 turns the music
  distracts the creature (its aim drops), halves its hits on Crispy, and makes sure anyone he
  gets out makes it; but each turn it might go for the speaker instead, and tear it apart.
- **Health** reads as on SlashCo VR's HUD: a coloured word under a heart. The first time it runs
  out, the screen goes red, photos of his family flash past, and he says: *"N-No... You won't
  take this house... Not this man, and not this man's family."* The **pilot light** (his
  willpower) brings him back with his defense sharply up for a few turns; the second time he
  falls.
- **The creature** ADJUSTS (snapping, a crack at a time, into shapes a body shouldn't make, as the
  new body replaces the old in chunks) into its next form every third turn (the oven timer counts down), or
  the moment a form's health runs out; each form has its own stats from the doc and six attacks
  (bites, ceiling drops, the lights cutting out, black bile, calling to Crispy in his family's
  voices, Andy stealing his jokes and locking the front door...). When it reaches for Crispy (to
  claw, grab his shoulders, pat him on the back) its arm comes off at the shoulder, far too long,
  over his box: a different arm for each stage. When it bites, a jaw clamps shut on him. Andy's
  **Mimic** does whatever Crispy did last, darker: his own trash bag, his own Crispy Slice, his
  own NUTCRACKAAAA come back at Crispy, and his Early Bird, grilled cheese, pills (and so on)
  help Andy as much as they helped Crispy. Only Andy can be killed.
- **The killer** isn't part of the fight. From round 2, while Crispy is deciding what to do, he
  often starts coming up out of a corner of the screen, breathing quick and shallow; more often,
  and faster, the further the creature has gone (6 seconds to click him at first, 3.6 against
  Andy). Click him and he sinks back out of sight. If he gets all the way in: he's right
  in front of the screen, a face flashes up close, more pictures flash past, all through static,
  and he takes a chunk of Crispy's health. (Not again for a couple of rounds.)
- **And the one behind him.** All the while, he's in the kitchen behind Crispy, in the dark,
  coming across the floor from the back door in five steps (a minute from the door to right
  there at first, 34 seconds against Andy). The portrait shows how close he is: the closer, the
  more he fades in behind Crispy. **TURN AROUND** (the button on the portrait, or T) whenever
  Crispy's deciding: it isn't a turn. The HUD goes, the kitchen's all but pitch black, and
  there's only a big **FLASH** button (F) and a little TURN BACK in the corner. The phone's flash
  shows him, standing on the floor where he's got to, and sends him back two steps (if he was
  close, it's a scream); then it needs 10 seconds, and flashing before that only brings him a
  step closer. While a turn plays out he waits just short of Crispy; if he ever gets all the
  way there, it's over: no WILLPOWER, four more pictures, and Crispy has fallen.

## Three ways out

- **Fight**: beat Andy.
- **Spare**: it wants Crispy's life. Show it what that life costs until it loses interest, then
  call a truce, and it's the one that decides to let him live. Its **MERCY** bar (in its box) goes
  up a little with each **Show it who he is** (a new ACT each time: the photos, their names, 4 AM,
  his hands, a staring contest, then holding the line), with **Talk**, and once with **Open the
  front door**, and 5% each time he tries **SPARE** before it's ready; after three Shows it
  creeps up on its own every round. Hurting it lowers it. At
  100%, MERCY > SPARE: Crispy blinks, and when he opens his eyes it's gone. It's the long way:
  about 20 rounds.
- **Flee**: get the family out, one at a time: **Veranda** (his wife, upstairs), then **Justin**
  (in the basement), then **Erik** (his younger son, in his room upstairs). Each is a risk: if it
  hears them, it lunges and Crispy takes the hit. The car alarm or the lights make it a sure thing;
  an open front door helps. His text to each shows up on his cracked phone, then a scrap of paper
  checklist: their name is crossed off if they got out (and in his box too). Once all three are
  out, MERCY > FLEE; with the front door shut it gets one swipe at him on the way out.

Each one ends the same way: a long, calm breath and a fade to black.

The effects are kept dark and quiet, in the grainy, washed-out style of the item sheets (the wine
glass, the pills, the cracked phone, the car keys and the text bubble are from one; Early Bird's
cracked alarm clock and bird from another; the RG 405M console from its own). Words from attacks (NUTCRACKAAAA!!!, CRACK...) are in
the battle log, not on screen. Health and SP move when the animation does: a heal when he takes
the bite, a hit when the claws land, not when the button is pressed.

`node crispy/tests/simulate.js` plays thousands of fights with a few kinds of player to check the
balance: someone who plays normally wins about 9 times in 10, mashing ATTACK about half the time;
someone who only goes for SPARE or FLEE gets there almost every time.

## Building

The family photos aren't in the repo, nor is anything made from them. Put `crispy_photo.webp`,
`living_room.webp`, `kitchen.webp` and the four photos he sees when he falls (`memory_1.webp` to `memory_4.webp`)
in `crispy/assets/source/`; nor are the pictures that flash after the killer's jumpscare
(`scare_face.png`, `scare_1` to `scare_5` and `behind_1` to `behind_4`, png or webp, also in
`crispy/assets/source/`), nor
its sound (`crispy/assets/audio/jumpscare.mp3`). The speaker's songs aren't either: put `clint_eastwood.mp3`,
`feel_good_inc.mp3` and `on_melancholy_hill.mp3` in `crispy/assets/audio/songs/` (without them
the speaker still works, silently). Then:

```
pip install numpy opencv-python-headless pillow onnxruntime
python3 crispy/tools/cutout.py u2net_human_seg.onnx   # cut Crispy out of his photo (see the script)
python3 crispy/tools/make_images.py                   # -> crispy/js/images.js
python3 crispy/tools/make_songs.py                    # -> the speaker's songs, slowed (needs ffmpeg)
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
                            sheet, the wine / pills / phone / keys / text bubble sheet, the
                            Early Bird clock and bird sheet, the RG 405M console, the
                            speaker, Authority's gavel, the white flag, the creature's arms
                            and jaw, the killer, and references
assets/audio/               Arachnophobia (OMORI), slowed with reverb; the speaker's songs
```
