// Dolphin Man's skeleton in each pose, for tools/dolphin/render.html (metres; y up; standing,
// he faces +z, towards the camera). Each pose also names points to find on its images
// (`anchors`), for the game's effects and for where he stands.
const JOINTS = [
  'pelvis',
  'waist',
  'chest',
  'neck',
  'skull',
  'beak',
  'shL',
  'elL',
  'wrL',
  'hnL',
  'shR',
  'elR',
  'wrR',
  'hnR',
  'hipL',
  'knL',
  'anL',
  'toeL',
  'hipR',
  'knR',
  'anR',
  'toeR',
  't0',
  't1',
  't2',
  't3',
  'fin0',
  'fin1',
];
const list = (o) =>
  JOINTS.map((k) => {
    if (!o[k]) throw new Error('missing joint ' + k);
    return o[k];
  });
// The right side (-x) mirrors the left, unless it's given.
const mirror = (o) => {
  const out = Object.assign({}, o);
  for (const [l, r] of [
    ['shL', 'shR'],
    ['elL', 'elR'],
    ['wrL', 'wrR'],
    ['hnL', 'hnR'],
    ['hipL', 'hipR'],
    ['knL', 'knR'],
    ['anL', 'anR'],
    ['toeL', 'toeR'],
  ]) {
    if (!out[r]) out[r] = [-o[l][0], o[l][1], o[l][2]];
  }
  return out;
};
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);

// Standing normally: upright, arms hanging loose a little out from his sides, feet apart, his
// head forward with the beak hanging down over his throat, and his tail curled out behind him
// to one side with its flukes on the floor.
const stand = mirror({
  pelvis: [0, 1.0, 0],
  waist: [0, 1.17, 0.005],
  chest: [0, 1.4, 0],
  neck: [0, 1.6, 0.0],
  skull: [0, 1.87, 0.03],
  beak: [0, 1.64, 0.22],
  shL: [0.215, 1.53, -0.01],
  elL: [0.27, 1.25, -0.01],
  wrL: [0.3, 1.0, 0.03],
  hnL: [0.31, 0.9, 0.05],
  hipL: [0.1, 0.98, 0.0],
  knL: [0.12, 0.53, 0.03],
  anL: [0.13, 0.09, -0.02],
  toeL: [0.16, 0.02, 0.15],
  t0: [0, 1.02, -0.1],
  t1: [0.04, 0.62, -0.3],
  t2: [0.14, 0.26, -0.42],
  t3: [0.3, 0.05, -0.5],
  fin0: [0, 1.52, -0.1],
  fin1: [0, 1.31, -0.25],
});

// Fetal Position, side on (he faces -x, his left side towards you): sitting on the floor, his
// knees drawn up to his chest, his arms wrapped round his shins and his head bowed onto his
// knees, the fin on his rounded back, and his tail curled round behind him on the floor.
const fetal = {
  pelvis: [0.05, 0.14, 0],
  waist: [0.0, 0.31, 0],
  chest: [-0.08, 0.49, 0],
  neck: [-0.17, 0.6, 0],
  skull: [-0.25, 0.65, 0],
  beak: [-0.37, 0.48, 0],
  shL: [-0.1, 0.56, 0.17],
  elL: [-0.27, 0.42, 0.24],
  wrL: [-0.47, 0.38, 0.12],
  hnL: [-0.5, 0.37, 0.02],
  shR: [-0.1, 0.56, -0.17],
  elR: [-0.27, 0.42, -0.24],
  wrR: [-0.47, 0.39, -0.12],
  hnR: [-0.5, 0.4, -0.02],
  hipL: [0.03, 0.15, 0.1],
  knL: [-0.34, 0.49, 0.16],
  anL: [-0.42, 0.085, 0.13],
  toeL: [-0.57, 0.02, 0.14],
  hipR: [0.03, 0.15, -0.1],
  knR: [-0.34, 0.49, -0.16],
  anR: [-0.42, 0.085, -0.13],
  toeR: [-0.57, 0.02, -0.14],
  t0: [0.12, 0.15, 0],
  t1: [0.26, 0.045, -0.2],
  t2: [0.02, 0.035, -0.4],
  t3: [-0.36, 0.03, -0.42],
  fin0: [0.0, 0.6, 0],
  fin1: [0.18, 0.47, 0],
};

// The cameras: the same distance and scale for both (433 image pixels to the metre at him).
module.exports = {
  stand: {
    joints: list(stand),
    headUp: [0, 0.64, 0.77],
    bodyFwd: [0, 0, 1],
    palmL: [-1, 0, 0.2],
    palmR: [1, 0, 0.2],
    curl: 0.6,
    flukeSide: [1, 0, 0.4],
    cam: [0, 1.15, 5.0],
    target: [0, 1.0, 0],
    fov: 26,
    w: 640,
    h: 1000,
    anchors: {
      pivot: lerp(stand.neck, stand.skull, 0.65), // the head turns round here
      top: add(stand.skull, [0, 0.14, 0]),
      face: add(stand.skull, [0, -0.03, 0.09]),
      mouth: stand.beak,
      chest: add(stand.chest, [0, 0, 0.11]),
      feet: [0, 0, (stand.anL[2] + stand.anR[2]) / 2],
      soleL: [stand.anL[0] * 0.5 + stand.toeL[0] * 0.5, 0, stand.anL[2] * 0.6 + stand.toeL[2] * 0.4],
      soleR: [stand.anR[0] * 0.5 + stand.toeR[0] * 0.5, 0, stand.anR[2] * 0.6 + stand.toeR[2] * 0.4],
      flukes: [stand.t3[0] + 0.05, 0, stand.t3[2]],
      clawL: stand.hnL,
      clawR: stand.hnR,
      tail: stand.t0, // the tail swings round here
    },
  },
  fetal: {
    joints: list(fetal),
    headUp: [-0.8, 0.6, 0],
    bodyFwd: [-1, 0, 0],
    palmL: [0, 0, -1],
    palmR: [0, 0, 1],
    curl: 0.9,
    flukeSide: [0, 0, 1],
    cam: [-0.05, 0.5, 5.0],
    target: [-0.05, 0.36, 0],
    fov: 15.8,
    w: 960,
    h: 600,
    anchors: {
      floor: [-0.22, 0, 0], // the middle of him on the floor, from his seat to his toes
      seat: [0.08, 0, 0],
      toes: [-0.6, 0, 0],
      curled: [-0.12, 0.38, 0.12],
      head: fetal.skull,
      top: add(fetal.skull, [0, 0.12, 0]),
    },
  },
};
