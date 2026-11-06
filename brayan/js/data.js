/*
 * Brayan's fight: the numbers and the words. Brayan, a paraprofessional, has the kids on the
 * bus outside and needs to get it going: his keys and the fuel are inside the school, and so is
 * the Gunman. And in CLASSROOM A, something else.
 */
(function (root) {
  const DATA = {
    hero: {
      name: 'Brayan',
      hp: 240,
      pat: 100, // PATIENCE: what the Gunman's worst attacks go for; skills spend it
      atk: 60,
      def: 30,
      crit: 0.08,
      patRegen: 4, // back each round
      frozenPat: 30, // at no patience left he freezes for a turn, and comes back with this much
      secondWind: 0.3, // the first time he goes down, he gets back up with this much health
    },
    foe: {
      name: 'The Gunman',
      hp: 1400,
      atk: 56,
      def: 20,
      stun: 180, // this much damage (since he was last stunned) and he's stunned
      // the gunshot: from round `from`, a `chance` each of his turns, not again for `gap` rounds
      shot: { from: 3, chance: 0.12, gap: 4, hit: 0.45 },
    },
    attack: { name: 'ATTACK', power: 1.4, doc: 'Brayan goes at it with everything he’s got.' },
    skills: [
      { id: 'voice', name: 'Firm Voice', pat: 10, power: 0.8, stun: 70, doc: 'The voice that stops a hallway fight. Some damage; a lot nearer to stunning it.' },
      { id: 'chair', name: 'Chair Throw', pat: 18, power: 2.1, doc: 'A classroom chair, as hard as he can. Heavy damage.' },
      { id: 'brace', name: 'Brace', pat: 8, def: 0.6, turns: 3, doc: 'Feet set, shoulders down. DEF up for 3 turns.' },
      { id: 'breath', name: 'Deep Breath', pat: 0, restore: 35, heal: 0.05, doc: 'In for four, out for four. Back some PATIENCE, and a little health.' },
    ],
    acts: [
      { id: 'check', name: 'Check', doc: 'Look at it. Really look.' },
      { id: 'talk', name: 'Talk', doc: 'Say something to it.' },
      { id: 'kids', name: 'The Kids', atk: 0.75, turns: 3, doc: 'Tell it about the kids waiting on Bus 13. Its ATK down for 3 turns.' },
      { id: 'distract', name: 'Distract', doc: 'Make a noise down the other hall. Takes perfect timing: miss it and he loses his turn. Get it, and he can FLEE from the entrance.' },
      { id: 'squint', name: 'Squint', crit: 0.6, turns: 2, doc: 'Narrow it down to one thing. Much likelier to land a critical hit for 2 turns.' },
    ],
    items: [
      { id: 'bec', name: 'Bacon Egg & Cheese', count: 2, heal: 0.5, doc: 'Salt, pepper, ketchup. Heals a lot.' },
      { id: 'newports', name: 'Newports', count: 2, pat: 15, ears: 6, doc: 'A smoke to steady him: some PATIENCE, and for 6 turns he can hear everything behind a door.' },
    ],
    talk: [
      ['“Nobody else is in here. Just me.”', 'It tilts its head. It knows that isn’t true.'],
      ['“Put it down. Put it down and walk out.”', 'It pulls the trigger on nothing. Just the click.'],
      ['“What do you want?”', 'It answers in Brayan’s own voice: “Bus thirteen.”'],
      ['“I’ve had worse days than you.”', 'It laughs without moving its mouth.'],
      ['“The kids are waiting on me. I’m leaving.”', '“So am I,” it says.'],
    ],
    check: 'THE GUNMAN · ATK 56 DEF 20. Too tall for the hall. Its face doesn’t move when it talks. It has never once had to reload.',
    // His turns: mostly at Brayan's nerve (PATIENCE), now and then at him.
    moves: {
      loom: { name: 'Loom', pat: 14, line: 'The Gunman leans in, closer, without taking a step.' },
      whisper: { name: 'Whisper', pat: 18, line: 'From the dark, it whispers the kids’ names. It gets every one right.' },
      faces: { name: 'Faces', pat: 20, hp: 0.08, line: 'Faces open in the dark all around it: its own, over and over, and others. Long, grey ones, from somebody else’s house.' },
      lightsout: { name: 'Lights Out', pat: 24, hp: 0.12, line: 'The light at the end of the hall goes out. Something breathes right in front of Brayan.' },
      aim: { name: 'Aim', pat: 22, line: 'It points the gun at Brayan, and holds it there. And holds it there.' },
      // (and for `halluc` turns Brayan hears things at the door of CLASSROOM A that aren't there)
      echo: { name: 'Echo', pat: 12, halluc: 4, line: 'It turns its head toward CLASSROOM A, and something behind the door moans back. Or Brayan only thinks it does. He’s HEARING THINGS.' },
      lunge: { name: 'Lunge', power: 1.8, line: 'It comes down the hall at him all at once.' },
      gunshot: { name: 'Gunshot', line: 'It cocks the gun.' },
    },
    // how often each, early on and once it's hurt
    weights: { fresh: { loom: 3, whisper: 3, faces: 3, lightsout: 2, aim: 2, lunge: 2, echo: 2 }, hurt: { loom: 2, whisper: 2, faces: 3, lightsout: 3, aim: 2, lunge: 4, echo: 2 } },

    // Where he has to go, and what's there. FUEL: how many cans the bus needs (one, for now).
    places: {
      entrance: { name: 'THE ENTRANCE', where: 'THE FRONT HALLWAY' },
      hallA: { name: 'HALLWAY A', where: 'HALLWAY A' },
      classA: { name: 'CLASSROOM A', where: 'CLASSROOM A' },
    },
    fuel: 1,
    search: 5, // seconds to find the can in HALLWAY A before the Gunman's back
    // THE THING IN CLASSROOM A: quiet (1), moaning (2) or awake (3), a new roll every round
    // (`odds`, for each). Inside, it wakes, fast: `inside` seconds at each stage, then `awake`
    // seconds of it awake, and then it has him. Walk in while it's awake and it has him right away.
    // HEARING THINGS (the Gunman's Echo), Brayan hears it moan, or wake, when it might not have:
    // `phantom`, the chance it sounds awake (otherwise half awake), if it isn't louder already.
    root: { odds: [0.4, 0.35, 0.25], inside: [0, 4, 4], awake: 20, phantom: 0.6 },
    health: [
      { id: 'OK', upTo: 100 },
      { id: 'STABLE', upTo: 80 },
      { id: 'SCATHED', upTo: 60 },
      { id: 'HURT', upTo: 40 },
      { id: 'CRITICAL', upTo: 20 },
    ],
    foeHealth: [
      { id: 'GOOD', upTo: 100 },
      { id: 'BRUISED', upTo: 80 },
      { id: 'WOUNDED', upTo: 60 },
      { id: 'WEAKENED', upTo: 40 },
      { id: 'BARELY STANDING', upTo: 20 },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.BRAYAN_DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
