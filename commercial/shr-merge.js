// Sacred Merge — a Suika-style merge game with the low-poly models of Sacred Hyper Race.
// Aim along the top of the jar, release to drop. Two equal creatures touching merge into the next one;
// two Sun Men vanish with a bonus. Physics: matter-js circles in a fixed 400×600 world (fair on every
// screen); drawing: one three.js renderer with a screen-space orthographic camera, lit like the site
// (RoomEnvironment + NeutralToneMapping on a transparent canvas over white). Frames are DOM, like .shr-frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const M = window.Matter;

// ----- tuning (world units: the jar is W × H; 1 unit ≈ 0.8–1 css px) -----
const T = {
  W: 400, H: 600,             // jar size in world units (aspect 0.667)
  R1: 27,                     // radius of level 1 (House); ×1.5 from 18 at Polina’s request (8 Oct)
  RATIO: 1.303,               // radius × per level → Sun Man (level 7) ≈ 132 (diameter = 66% of W)
  JOKER_R_LEVEL: 3,           // the joker is as big as level 3
  DANGER_Y: 66,               // danger line, units below the jar's top edge
  OVER_TIME: 2.0,             // s a landed creature may stay above the line before OVERFLOW
  HOLD_GAP: 12,               // gap between the held creature's bottom and the jar's top edge
  COOLDOWN: 0.5,              // s between drops
  DROP_SPEED: 2,              // initial fall speed (units per 1/60 s)
  GRAVITY: 0.0013,            // matter gravity.scale (default 0.001)
  STEP_MS: 1000 / 120,        // fixed physics step
  MAX_STEPS: 4,               // per frame (keeps slow phones from spiralling)
  POS_ITER: 10, VEL_ITER: 8,  // solver iterations: stable stacks of 50+ circles
  FRICTION: 0.2, FRICTION_STATIC: 0.5, RESTITUTION: 0.12, AIR: 0.008, DENSITY: 0.001,
  GROW_TIME: 0.12,            // s for a merged body to grow from the old radius to the new one
  POP_TIME: 0.32,             // s of the visual pop-scale on merge
  SPAWN_WEIGHTS: [40, 30, 20, 10],      // chance of levels 1–4 for new pieces (small more often)
  JOKER_CHANCE: 0.04,         // per new piece once the score reaches JOKER_MIN_SCORE…
  JOKER_MIN_SCORE: 200,       // …never twice in a row
  COMBO_WINDOW: 1.0,          // s: merges closer than this build ×2, ×3…
  COMBO_MAX: 5,               // multiplier cap
  SUN_BONUS: 150,             // added to the 45 of a Sun Man pair (× combo)
  KEY_AIM_SPEED: 320,         // units / s while ← → are held
  KEY_AIM_STEP: 10,           // units per single ← → tap
  YAW: -0.42,                 // 3/4 view of every model
  FIT_QUANTILE: 0.97,         // share of vertices that fit inside the circle (spikes may poke out)
  FILL: 1.0,                  // that radius / circle radius
  IDLE_YAW: 0.22,             // ± rad slow turn around the creature's own up axis (0 = off)
  IDLE_SPEED: 0.6,            // rad/s of that sway
  RING_OPACITY: 0.28,         // faint circle around each creature (shows the real collider)
  RESTART_DELAY: 0.7,         // s after game over before a tap restarts
  MAX_DPR: 2,
};
const JOKER = 0;
const CHAIN = [   // Polina's order (9 Oct): House, Waterfall II, Tree, Church, Two Heads, Mouth Arch, Sun Man
  null,
  { file: 'shr-house.glb', name: 'House' },
  { file: 'shr-waterfall-tree-2.glb', name: 'Waterfall Tree II' },
  { file: 'shr-tree.glb', name: 'Tree' },
  { file: 'shr-church.glb', name: 'Church' },
  { file: 'shr-two-heads.glb', name: 'Two Heads' },
  { file: 'shr-mouth-arch.glb', name: 'Mouth Arch' },
  { file: 'shr-sun-man.glb', name: 'Sun Man' },
];
CHAIN[JOKER] = { file: 'shr-squad-monster.glb', name: 'Squad Monster' };
const MAX_LEVEL = 7;
const MODEL_DIR = 'models/hero/';
const BEST_KEY = 'shr-merge-best';
const DEBUG = /[?&]debug\b/.test(location.search);
const SKY = 0x5d8ab6;
const radius = (lvl) => T.R1 * Math.pow(T.RATIO, (lvl === JOKER ? T.JOKER_R_LEVEL : lvl) - 1);
const tri = (n) => n * (n + 1) / 2;   // 1, 3, 6, 10… points for merging into level n + 1

// ----- DOM -----
const root = document.getElementById('sm');
const $ = (s) => root.querySelector(s);
const canvas = $('.sm-canvas'), jarEl = $('.sm-jar'), dangerEl = $('.sm-danger'), guideEl = $('.sm-guide');
const fxEl = $('.sm-fx'), startEl = $('.sm-start'), loadEl = $('.sm-load'), overEl = $('.sm-over');
const scoreEl = $('.sm-score'), scoreBox = scoreEl.querySelector('.sm-box'), scoreN = $('.sm-score-n'), bestN = $('.sm-best-n');
const nextEl = $('.sm-next'), nextBox = nextEl.querySelector('.sm-box'), nextTag = $('.sm-next-tag');
const legendEl = $('.sm-legend'), soundBtn = $('.sm-sound'), navEl = $('.sm-nav');
const aimSq = jarEl.children[1];   // top-middle square of the jar rides along with the aim
const SQUARES = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
const legendLis = [];
for (let l = 1; l <= MAX_LEVEL; l++) {
  const li = document.createElement('li');
  li.innerHTML = `<div class="slot">${SQUARES}</div><span class="n">${l}</span>`;
  li.title = CHAIN[l].name;
  legendEl.appendChild(li);
  legendLis[l] = li;
}

if (!M) { loadEl.textContent = 'COULD NOT LOAD THE GAME'; throw new Error('Sacred Merge: matter-js missing'); }

// ----- three (screen-space orthographic: 1 unit = 1 css px, y up = -screen y) -----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0xffffff, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 4000);
camera.position.z = 2000;
const ringGeo = new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2), Math.sin(i / 64 * Math.PI * 2), 0)));
const ringMat = new THREE.LineBasicMaterial({ color: SKY, transparent: true, opacity: T.RING_OPACITY, depthWrite: false });

// ----- storage -----
function readBest() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
function writeBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* private mode: best lives for this visit only */ } }

// ----- sound (muted by default) and haptics -----
let audio = null, soundOn = false;
function blip(f0, f1, dur, vol, type = 'sine', delay = 0) {
  if (!soundOn || !audio) return;
  const t = audio.currentTime + delay;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + dur + 0.03);
}
let touched = false;   // haptics only for people playing by touch (and only after a real tap)
function buzz(p) {
  if (!navigator.vibrate || !touched) return;
  try { navigator.vibrate(p); } catch (e) { /* not supported */ }
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  if (soundOn && !audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audio = new AC(); else soundOn = false;
  }
  if (audio && audio.state === 'suspended') audio.resume();
  soundBtn.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.blur();
  blip(520, 700, 0.08, 0.12, 'triangle');
});

// ----- models: normalised so the silhouette fits a unit circle -----
const tpl = [];   // tpl[level] = THREE.Group (unit radius) once loaded
const loader = new GLTFLoader();
const FIRST = [1, 2, 3, 4], REST = [5, 6, 7, JOKER];
let firstDone = 0, firstOk = 0;

const fitInfo = [];   // ?debug: how far each model's furthest vertex pokes out
function prepare(gltf, name) {
  const model = gltf.scene;
  model.rotation.y = T.YAW;
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(wrap, true).getCenter(new THREE.Vector3());
  // Largest distance of any vertex from the centre in the screen plane = silhouette radius.
  // A high quantile instead of the max: a lone spike may poke out, the body fills the circle.
  const d = [];
  const v = new THREE.Vector3();
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      d.push(Math.hypot(v.x - c.x, v.y - c.y));
    }
  });
  d.sort((a, b) => a - b);
  const rFit = d[Math.floor((d.length - 1) * T.FIT_QUANTILE)] || 1;
  if (DEBUG) fitInfo.push([name, +(d[d.length - 1] / rFit).toFixed(2)]);
  const s = T.FILL / rFit;
  wrap.scale.setScalar(s);
  wrap.position.copy(c).multiplyScalar(-s);
  const obj = new THREE.Group();
  obj.add(wrap);
  return obj;
}

function loadLevel(lvl) {
  return new Promise((resolve) => {
    loader.load(MODEL_DIR + CHAIN[lvl].file, (gltf) => { tpl[lvl] = prepare(gltf, CHAIN[lvl].name); onModel(lvl); resolve(true); },
      undefined, (err) => { console.warn('Sacred Merge: could not load', CHAIN[lvl].file, err); resolve(false); });
  });
}
Promise.all(FIRST.map((l) => loadLevel(l).then((ok) => {
  firstDone++; if (ok) firstOk++;
  loadEl.textContent = `LOADING ${firstDone}/${FIRST.length}`;
}))).then(() => {
  if (firstOk === FIRST.length) startEl.classList.add('ready');
  else loadEl.textContent = 'COULD NOT LOAD THE MODELS';
  REST.forEach((l) => loadLevel(l));   // the bigger creatures arrive in the background
});

// A visual: group (position, roll) → spin (idle yaw) → model clone; optional collider ring.
function makeVisual(lvl, withRing) {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  let ring = null;
  if (withRing && T.RING_OPACITY > 0) { ring = new THREE.LineLoop(ringGeo, ringMat); ring.renderOrder = -1; group.add(ring); }
  scene.add(group);
  const vis = { lvl, group, spin, ring, model: null, phase: Math.random() * 6.3 };
  attachModel(vis);
  return vis;
}
function attachModel(vis) {
  if (vis.model || !tpl[vis.lvl]) return;
  vis.model = tpl[vis.lvl].clone(true);   // clones share geometry, materials and textures
  vis.spin.add(vis.model);
}
function dropVisual(vis) { if (vis) scene.remove(vis.group); }
const icons = [];   // legend icons by level, next icon, start showcase
let nextVis = null, showcase = null;
function onModel(lvl) {
  if (lvl !== JOKER) icons[lvl] = makeVisual(lvl, false);
  for (const p of pieces) if (p.lvl === lvl) attachModel(p.vis);
  if (held) attachModel(held.vis);
  if (nextVis) attachModel(nextVis);
  if (lvl === MAX_LEVEL && state === 'start' && !showcase) showcase = makeVisual(MAX_LEVEL, false);
  layoutIcons();
}

// ----- physics -----
const engine = M.Engine.create({ enableSleeping: true, positionIterations: T.POS_ITER, velocityIterations: T.VEL_ITER });
engine.gravity.y = 1;
engine.gravity.scale = T.GRAVITY;
{
  const wall = (x, y, w, h) => M.Bodies.rectangle(x, y, w, h, { isStatic: true, friction: T.FRICTION, restitution: T.RESTITUTION });
  const TH = 200, TALL = T.H + 1600;   // walls reach far above the jar so nothing can roll out
  M.Composite.add(engine.world, [
    wall(T.W / 2, T.H + TH / 2, T.W + TH * 2, TH),
    wall(-TH / 2, T.H - TALL / 2, TH, TALL),
    wall(T.W + TH / 2, T.H - TALL / 2, TH, TALL),
  ]);
}
const pieces = [];
let pairsQueue = [];
function onPairs(ev) {
  for (const pair of ev.pairs) {
    const a = pair.bodyA.plugin.piece, b = pair.bodyB.plugin.piece;
    if (a) a.landed = true;
    if (b) b.landed = true;
    if (!a || !b || a.dead || b.dead) continue;
    if ((a.lvl === b.lvl && a.lvl !== JOKER) || (a.lvl === JOKER) !== (b.lvl === JOKER)) pairsQueue.push([a, b]);
  }
}
M.Events.on(engine, 'collisionStart', onPairs);
M.Events.on(engine, 'collisionActive', onPairs);

let pieceId = 0;
function addPiece(lvl, x, y, r0 = radius(lvl)) {
  const body = M.Bodies.circle(x, y, r0, {
    friction: T.FRICTION, frictionStatic: T.FRICTION_STATIC, restitution: T.RESTITUTION,
    frictionAir: T.AIR, density: T.DENSITY,
  });
  const p = { id: ++pieceId, lvl, body, r: r0, target: radius(lvl), vis: makeVisual(lvl, true),
    landed: false, dead: false, overT: 0, pop: 1, age: 0 };
  body.plugin.piece = p;
  M.Composite.add(engine.world, body);
  pieces.push(p);
  return p;
}
function removePiece(p) {
  p.dead = true;
  M.Composite.remove(engine.world, p.body);
  dropVisual(p.vis);
  const i = pieces.indexOf(p);
  if (i >= 0) pieces.splice(i, 1);
}
function wakeAll() { for (const p of pieces) M.Sleeping.set(p.body, false); }

function growBodies(dt) {
  for (const p of pieces) {
    if (p.r >= p.target) continue;
    const step = (p.target - p.r0) * dt / T.GROW_TIME;
    const r = Math.min(p.target, p.r + step);
    M.Body.scale(p.body, r / p.r, r / p.r);
    p.r = r;
  }
}

// ----- game state -----
let state = 'start';   // start | play | over
let score = 0, best = readBest(), combo = 0, lastMergeT = -9, maxLevel = 0, gt = 0, overAt = 0;
let held = null, nextLvl = 1, lastRolled = -1, readyAt = 0, aimX = T.W / 2, keyDir = 0;
bestN.textContent = best;

function rollLevel() {
  const jokerOk = tpl[JOKER] && score >= T.JOKER_MIN_SCORE && lastRolled !== JOKER;
  if (jokerOk && Math.random() < T.JOKER_CHANCE) return (lastRolled = JOKER);
  const w = T.SPAWN_WEIGHTS;
  let t = Math.random() * w.reduce((a, b) => a + b, 0), lvl = 1;
  for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0) { lvl = i + 1; break; } }
  return (lastRolled = lvl);
}
function setNext(lvl) {
  nextLvl = lvl;
  dropVisual(nextVis);
  nextVis = makeVisual(lvl, false);
  nextEl.classList.toggle('joker', lvl === JOKER);
  nextTag.textContent = lvl === JOKER ? 'NEXT · JOKER' : 'NEXT';
  layoutIcons();
}
function takeNext() {
  held = { lvl: nextLvl, vis: makeVisual(nextLvl, true), age: 0 };
  setNext(rollLevel());
}

function setMaxLevel(lvl) {
  if (lvl === JOKER || lvl <= maxLevel) return;
  maxLevel = lvl;
  legendLis.forEach((li, l) => { if (!li) return; li.classList.toggle('got', l <= maxLevel); li.classList.toggle('top', l === maxLevel); });
}

function startGame() {
  state = 'play';
  root.classList.remove('is-start');
  startEl.hidden = true;
  scoreEl.hidden = false;
  nextEl.hidden = false;
  if (showcase) { dropVisual(showcase); showcase = null; }
  layout();
  resetRound();
}
function resetRound() {
  for (const p of pieces.slice()) removePiece(p);
  pairsQueue = [];
  for (const f of flashes) { f.el.classList.remove('go'); f.t = 9; }
  score = 0; combo = 0; lastMergeT = -9; maxLevel = 0;
  legendLis.forEach((li) => li && li.classList.remove('got', 'top'));
  scoreN.textContent = '0';
  if (held) dropVisual(held.vis);
  held = null; lastRolled = -1;
  setNext(rollLevel());
  takeNext();
  readyAt = gt;
  overEl.hidden = true;
  state = 'play';
}

function drop() {
  if (state !== 'play' || !held || gt < readyAt) return;
  const r = radius(held.lvl);
  const x = THREE.MathUtils.clamp(aimX, r, T.W - r);
  const p = addPiece(held.lvl, x, -T.HOLD_GAP - r);
  M.Body.setVelocity(p.body, { x: 0, y: T.DROP_SPEED });
  setMaxLevel(held.lvl);
  dropVisual(held.vis);
  held = null;
  readyAt = gt + T.COOLDOWN;
  blip(330, 190, 0.07, 0.1, 'triangle');
  buzz(6);
}

// ----- merging -----
function processMerges() {
  const q = pairsQueue;
  pairsQueue = [];
  for (const [a, b] of q) {
    if (a.dead || b.dead) continue;
    if (a.lvl === JOKER || b.lvl === JOKER) {
      const t = a.lvl === JOKER ? b : a;   // the joker turns what it touches into its next level
      merge(t.lvl + 1, [a, b], t.body.position, M.Body.getVelocity(t.body), t.r);
    } else {
      const pa = a.body.position, pb = b.body.position, va = M.Body.getVelocity(a.body), vb = M.Body.getVelocity(b.body);
      merge(a.lvl + 1, [a, b], { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 }, a.r);
    }
  }
}

function merge(lvl, olds, pos, vel, r0) {
  const x = pos.x, y = pos.y;
  for (const o of olds) removePiece(o);
  combo = gt - lastMergeT < T.COMBO_WINDOW ? Math.min(combo + 1, T.COMBO_MAX) : 1;
  lastMergeT = gt;
  wakeAll();
  if (lvl > MAX_LEVEL) { sunClear(x, y); return; }
  const r = radius(lvl);
  const p = addPiece(lvl, THREE.MathUtils.clamp(x, r, T.W - r), Math.min(y, T.H - r), Math.min(r0, r));
  p.r0 = p.r;
  p.landed = true;
  p.pop = 0;
  M.Body.setVelocity(p.body, vel);
  const pts = tri(lvl - 1) * combo;
  if (DEBUG) mergeLog.push({ t: +gt.toFixed(2), lvl, combo, pts });
  addScore(pts);
  setMaxLevel(lvl);
  flashFrame(p);
  popText(combo > 1 ? `COMBO ×${combo} · +${pts}` : `+${pts}`, x, y - r - 4);
  const f = 220 * Math.pow(1.12, lvl);
  blip(f, f * 1.5, 0.13, 0.16, 'triangle');
  if (combo > 1) blip(f * 1.5, f * 2, 0.1, 0.08, 'sine', 0.06);
  buzz(10 + lvl * 2);
}

function sunClear(x, y) {
  const pts = (tri(MAX_LEVEL) + T.SUN_BONUS) * combo;
  if (DEBUG) mergeLog.push({ t: +gt.toFixed(2), lvl: 'sun', combo, pts });
  addScore(pts);
  restartAnim(jarEl, 'flash');
  setTimeout(() => jarEl.classList.remove('flash'), 900);
  popText(`SUN MAN · +${pts}`, T.W / 2, T.H * 0.4, true);
  [523, 659, 784, 1047].forEach((f, i) => blip(f, f * 1.01, 0.22, 0.14, 'triangle', i * 0.07));
  buzz([30, 40, 60]);
}

function addScore(pts) {
  score += pts;
  scoreN.textContent = score;
  restartAnim(scoreN, 'bump');
  scoreBox.classList.add('hot');
  clearTimeout(addScore.t);
  addScore.t = setTimeout(() => scoreBox.classList.remove('hot'), 350);
}

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;   // restart the CSS animation
  el.classList.add(cls);
}

// Merge flash: a navy frame with level number + name that follows the new creature for a second.
const mergeLog = [];
const flashes = Array.from({ length: 6 }, () => {
  const el = document.createElement('div');
  el.className = 'sm-fr';
  el.innerHTML = SQUARES + '<span class="num"></span><span class="tag"></span>';
  fxEl.appendChild(el);
  return { el, num: el.querySelector('.num'), tag: el.querySelector('.tag'), piece: null, t: 9, x: 0, y: 0 };
});
let flashIdx = 0;
function flashFrame(p) {
  const f = flashes[flashIdx++ % flashes.length];
  f.piece = p; f.t = 0;
  f.num.textContent = String(p.lvl).padStart(2, '0') + '.';
  f.tag.textContent = CHAIN[p.lvl].name;
  restartAnim(f.el, 'go');
  placeFlash(f);
}
function placeFlash(f) {
  const p = f.piece;
  f.x = p.body.position.x; f.y = p.body.position.y;
  const half = p.target * view.s + 7;
  const sx = view.x + f.x * view.s, sy = view.y + f.y * view.s;
  f.el.style.transform = `translate(${sx - half}px, ${sy - half}px)`;
  f.el.style.width = f.el.style.height = half * 2 + 'px';
}
const pops = Array.from({ length: 6 }, () => {
  const el = document.createElement('div');
  el.className = 'sm-pop';
  fxEl.appendChild(el);
  return el;
});
let popIdx = 0;
function popText(text, x, y, big = false) {
  const el = pops[popIdx++ % pops.length];
  el.textContent = text;
  el.classList.toggle('big', big);
  el.style.left = view.x + x * view.s + 'px';
  el.style.top = Math.max(view.y - 20, view.y + y * view.s - 14) + 'px';
  restartAnim(el, 'go');
}

// ----- danger line and game over -----
function checkDanger(dt) {
  let warn = false;
  for (const p of pieces) {
    if (!p.landed) continue;
    if (p.body.position.y - p.r < T.DANGER_Y) {
      p.overT += dt;
      warn = true;
      if (p.overT > T.OVER_TIME) { gameOver(); return; }
    } else p.overT = 0;
  }
  dangerEl.classList.toggle('warn', warn);
}

function gameOver() {
  if (state === 'over') return;
  state = 'over';
  overAt = gt;
  dangerEl.classList.add('warn');
  if (held) { dropVisual(held.vis); held = null; }
  guideEl.classList.remove('on');
  const isNew = score > best;
  if (isNew) { best = score; writeBest(best); }
  bestN.textContent = best;
  overEl.querySelector('.sm-over-n').textContent = score;
  const bestEl = overEl.querySelector('.sm-over-best');
  bestEl.textContent = isNew && score > 0 ? `NEW BEST ${best}` : `BEST ${best}`;
  bestEl.classList.toggle('new', isNew && score > 0);
  overEl.hidden = false;
  blip(240, 70, 0.45, 0.25, 'sine');
  buzz([30, 40, 30]);
}

// ----- input -----
let pointerAiming = false;
function aimAtClient(clientX) {
  aimX = (clientX - view.x) / view.s;
}
root.addEventListener('pointerdown', (e) => {
  if (e.target.closest('a, button')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.pointerType === 'touch' && e.isTrusted) touched = true;
  e.preventDefault();
  if (state === 'start') { if (startEl.classList.contains('ready')) startGame(); return; }
  if (state === 'over') { if (gt - overAt > T.RESTART_DELAY) resetRound(); return; }
  pointerAiming = true;
  try { root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  aimAtClient(e.clientX);
});
root.addEventListener('pointermove', (e) => {
  if (state === 'play' && (pointerAiming || e.pointerType === 'mouse')) aimAtClient(e.clientX);
});
root.addEventListener('pointerup', (e) => {
  if (!pointerAiming) return;
  pointerAiming = false;
  if (state !== 'play') return;
  aimAtClient(e.clientX);
  drop();
});
root.addEventListener('pointercancel', () => { pointerAiming = false; });
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    e.preventDefault();
    if (!e.repeat && state === 'play') aimX += (e.code === 'ArrowRight' ? 1 : -1) * T.KEY_AIM_STEP;
    keys.add(e.code);
    return;
  }
  if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'ArrowDown') return;
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('a, button')) return;
  e.preventDefault();
  if (e.repeat) return;
  if (state === 'start') { if (startEl.classList.contains('ready')) startGame(); }
  else if (state === 'over') { if (gt - overAt > T.RESTART_DELAY) resetRound(); }
  else drop();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ----- layout (css px) -----
const view = { x: 0, y: 0, s: 1, vw: 1, vh: 1, wide: false };
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)';
root.appendChild(safeProbe);
function layout() {
  const vw = root.clientWidth, vh = root.clientHeight;
  view.vw = vw; view.vh = vh;
  const pad = 16;
  const navBottom = navEl.getBoundingClientRect().bottom;
  const safeBottom = parseFloat(getComputedStyle(safeProbe).paddingBottom) || 0;
  // legend along the bottom
  const lw = Math.min(vw - pad * 2, 540), slot = lw / MAX_LEVEL;
  const legendH = slot + 18;
  const legendTop = vh - safeBottom - 16 - legendH;
  legendEl.style.width = lw + 'px';
  legendEl.style.left = (vw - lw) / 2 + 'px';
  legendEl.style.top = legendTop + 'px';
  // score + next: a row above the jar (narrow) or beside it (wide)
  const hid = [scoreEl.hidden, nextEl.hidden];
  scoreEl.hidden = nextEl.hidden = false;   // measure even before the game starts
  const sw = scoreEl.offsetWidth, sh = scoreEl.offsetHeight, nw = nextEl.offsetWidth;
  [scoreEl.hidden, nextEl.hidden] = hid;
  const aimWorld = T.HOLD_GAP + radius(5) * 2 + 6;   // room above the jar for the held creature
  const hudTop = Math.round(navBottom + 16);
  let top = hudTop;
  const wide = vw >= 760 && vw > vh * 0.95;
  if (!wide) top += sh + 6;
  const availH = legendTop - 20 - top;
  const availW = vw - pad * 2 - (wide ? (Math.max(sw, nw, 170) + 48) * 2 : 0);
  const s = Math.max(0.2, Math.min(availW / T.W, availH / (T.H + aimWorld)));
  const jw = T.W * s, jh = T.H * s;
  const blockH = (T.H + aimWorld) * s;
  view.s = s;
  view.x = Math.round((vw - jw) / 2);
  view.y = Math.round(top + Math.max(0, (availH - blockH) / 2) + aimWorld * s);
  view.wide = wide;
  Object.assign(jarEl.style, { left: view.x + 'px', top: view.y + 'px', width: jw + 'px', height: jh + 'px' });
  dangerEl.style.top = T.DANGER_Y * s + 'px';
  root.style.setProperty('--jw', jw + 'px');
  for (const el of [startEl, overEl]) Object.assign(el.style, { left: view.x + 'px', top: view.y + 'px', width: jw + 'px', height: jh + 'px' });
  // The score is anchored by its centre (narrow) or right edge (wide) so a growing number stays put.
  if (wide) {
    scoreEl.style.left = view.x - 48 + 'px';
    scoreEl.style.transform = 'translateX(-100%)';
    scoreEl.style.top = view.y + 'px';
    nextEl.style.left = view.x + jw + 48 + 'px';
    nextEl.style.top = view.y + 'px';
  } else {
    scoreEl.style.left = Math.round(vw / 2) + 'px';
    scoreEl.style.transform = 'translateX(-50%)';
    scoreEl.style.top = hudTop + 'px';
    nextEl.style.left = Math.round(view.x + jw - nw) + 'px';
    nextEl.style.top = hudTop + 'px';
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, T.MAX_DPR));
  renderer.setSize(vw, vh, false);
  camera.right = vw; camera.bottom = -vh;
  camera.updateProjectionMatrix();
  layoutIcons();
}
const iconPos = [];   // [level] → {x, y, r} in css px
function layoutIcons() {
  const lr = legendEl.getBoundingClientRect();
  const slot = lr.width / MAX_LEVEL;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    iconPos[l] = { x: lr.left + slot * (l - 0.5), y: lr.top + slot / 2, r: slot * 0.4 * (0.62 + 0.38 * (l - 1) / 8) };
  }
  const nb = nextBox.getBoundingClientRect();
  iconPos.next = { x: nb.left + nb.width / 2, y: nb.top + nb.height / 2, r: nb.width * 0.36 };
}

// ----- per-frame drawing -----
function place(vis, sx, sy, rpx, angle = 0, yaw = 0) {
  vis.group.position.set(sx, -sy, 0);
  vis.group.rotation.z = -angle;
  vis.group.scale.setScalar(Math.max(rpx, 0.001));
  vis.spin.rotation.y = yaw;
}
const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function draw(dt, time) {
  const s = view.s;
  for (const p of pieces) {
    p.age += dt;
    if (p.pop < 1) p.pop = Math.min(1, p.pop + dt / T.POP_TIME);
    const k = p.pop < 1 ? 0.75 + 0.25 * easeOutBack(p.pop) : 1;
    const b = p.body.position;
    place(p.vis, view.x + b.x * s, view.y + b.y * s, p.target * s * k, p.body.angle,
      T.IDLE_YAW * Math.sin(time * T.IDLE_SPEED + p.vis.phase));
    if (p.vis.ring) p.vis.ring.scale.setScalar(p.r / p.target / k);
  }
  // held creature + guide line + the sliding square on the jar's opening
  if (held && state === 'play') {
    held.age += dt;
    const r = radius(held.lvl);
    const x = THREE.MathUtils.clamp(aimX, r, T.W - r);
    const ready = gt >= readyAt;
    const k = ready ? Math.min(1, held.age / 0.18) : 0;
    place(held.vis, view.x + x * s, view.y + (-T.HOLD_GAP - r) * s, r * s * (1 - Math.pow(1 - k, 3)), 0,
      T.IDLE_YAW * Math.sin(time * T.IDLE_SPEED));
    guideEl.style.transform = `translate(${Math.round(view.x + x * s)}px, ${view.y - T.HOLD_GAP * s}px)`;
    guideEl.style.height = (T.H + T.HOLD_GAP) * s + 'px';
    guideEl.classList.toggle('on', ready);
    aimSq.style.left = (x / T.W) * 100 + '%';
  } else {
    guideEl.classList.remove('on');
    if (held) held.age = 0;
  }
  // next, legend, showcase
  if (nextVis && iconPos.next) {
    const n = iconPos.next;
    place(nextVis, n.x, n.y, n.r * (nextLvl === JOKER ? 1 : 0.78 + 0.22 * (nextLvl - 1) / 4), 0, time * 0.8);
  }
  for (let l = 1; l <= MAX_LEVEL; l++) {
    const v = icons[l], ip = iconPos[l];
    if (v && ip) place(v, ip.x, ip.y, ip.r, 0, l === maxLevel ? time * 0.9 : 0);
  }
  if (showcase) {
    const r = T.W * 0.27 * s;
    place(showcase, view.x + T.W * s / 2, view.y + T.H * s * 0.56 + Math.sin(time * 1.3) * 4, r, 0, time * 0.5);
  }
  for (const f of flashes) {
    if (!f.piece || f.t > 1) continue;
    if (f.piece.dead) { f.el.classList.remove('go'); f.t = 9; continue; }   // merged on: its frame goes with it
    f.t += dt;
    placeFlash(f);
  }
}

// ----- loop -----
const clock = new THREE.Clock();
let running = true, acc = 0, fpsAvg = 60;
function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  const rawDt = clock.getDelta();
  fpsAvg += (1 / Math.max(rawDt, 1e-3) - fpsAvg) * 0.05;
  update(Math.min(rawDt, 1 / 20));
  renderer.render(scene, camera);
}
function update(dt) {
  gt += dt;
  if (state === 'play') {
    if (keys.size) aimX += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * T.KEY_AIM_SPEED * dt;
    if (held) { const r = radius(held.lvl); aimX = THREE.MathUtils.clamp(aimX, r, T.W - r); }
    else if (gt >= readyAt) takeNext();
    acc += dt * 1000;
    let n = 0;
    while (acc >= T.STEP_MS && n < T.MAX_STEPS) {
      M.Engine.update(engine, T.STEP_MS);
      growBodies(T.STEP_MS / 1000);
      processMerges();
      acc -= T.STEP_MS; n++;
    }
    if (n === T.MAX_STEPS) acc = 0;
    checkDanger(dt);
  }
  draw(dt, gt);
}

new ResizeObserver(layout).observe(root);
layout();
document.fonts && document.fonts.ready.then(layout);

// Pause while the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) running = false;
  else if (!running) { running = true; clock.getDelta(); acc = 0; tick(); }
});
tick();

// ?debug: a read-only peek at the state, plus helpers to drop / place creatures for testing.
if (DEBUG) {
  window.smDebug = {
    state: () => ({ state, score, best, combo, maxLevel, gt: +gt.toFixed(2), fps: Math.round(fpsAvg),
      held: held && held.lvl, next: nextLvl, aimX: +aimX.toFixed(1), ready: gt >= readyAt,
      loaded: tpl.map((t, l) => (t ? l : null)).filter((l) => l !== null),
      view: { ...view }, radii: CHAIN.map((_, l) => +radius(l).toFixed(1)),
      pieces: pieces.map((p) => ({ id: p.id, lvl: p.lvl, x: +p.body.position.x.toFixed(1), y: +p.body.position.y.toFixed(1),
        r: +p.r.toFixed(1), landed: p.landed, overT: +p.overT.toFixed(2), sleeping: p.body.isSleeping })) }),
    // Drop the held creature at x (0..1 of the jar width); optional level forces it (0 = joker). Ignores the cooldown.
    dropAt(xFrac, lvl) {
      if (state !== 'play') return false;
      if (!held) takeNext();
      if (lvl !== undefined && lvl !== held.lvl) { dropVisual(held.vis); held = { lvl, vis: makeVisual(lvl, true), age: 1 }; }
      aimX = xFrac * T.W;
      readyAt = gt;
      drop();
      return true;
    },
    // Place a creature directly at (x, y) as shares of the jar (for setting up Sun Man pairs).
    place(lvl, xFrac, yFrac) { const p = addPiece(lvl, xFrac * T.W, yFrac * T.H); p.landed = true; setMaxLevel(lvl); return p.id; },
    merges: () => mergeLog.slice(),
    // Run the game for `sec` seconds at 60 fps without waiting (works while the tab is hidden), then render once.
    advance(sec) { for (let t = 0; t < sec; t += 1 / 60) update(1 / 60); renderer.render(scene, camera); return this.state().state; },
    fit: () => fitInfo.slice(),
    setScore(n) { score = n; scoreN.textContent = n; },
    start() { if (state === 'start') startGame(); else resetRound(); },
  };
}
