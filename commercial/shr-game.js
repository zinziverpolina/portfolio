// Sacred Stack — one-tap stacking game with the low-poly models of Sacred Hyper Race.
// A model swings above the tower; tap / click / space drops it; it falls with cannon-es physics
// (locked to the screen plane, box colliders from each model's bounding box) and must stay on top.
// Lighting copies float-scene.js (RoomEnvironment + NeutralToneMapping) so the models look like on the site.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';

const MODELS = [
  { url: 'models/hero/shr-sun-man.glb', name: 'Sun Man' },
  { url: 'models/hero/shr-mouth-arch.glb', name: 'Mouth Arch' },
  { url: 'models/hero/shr-two-heads.glb', name: 'Two Heads' },
  { url: 'models/hero/shr-frog.glb', name: 'Frog' },
  { url: 'models/hero/shr-squad-monster.glb', name: 'Squad Monster' },
  { url: 'models/hero/shr-waterfall-tree-1.glb', name: 'Waterfall Tree I' },
  { url: 'models/hero/shr-waterfall-tree-2.glb', name: 'Waterfall Tree II' },
  { url: 'models/hero/shr-tree.glb', name: 'Tree' },
  { url: 'models/hero/shr-orchid.glb', name: 'Orchid' },
  { url: 'models/hero/shr-church.glb', name: 'Church' },
  { url: 'models/hero/shr-house.glb', name: 'House' },
  { url: 'models/hero/shr-fence.glb', name: 'Fence' },
];

// ----- tuning -----
const T = {
  GRAVITY: -20,          // world units / s²  (a piece is ~1.5 units tall)
  DROP_SPEED: -3,        // initial downward speed of a dropped piece
  PIECE_SIZE: 1.5,       // largest of width / height after normalising
  MIN_WIDTH: 0.95,       // thin models are scaled up to at least this width…
  MAX_HEIGHT: 2.1,       // …unless that makes them taller than this
  COLLIDER_X: 0.9,       // collider width as a share of the bounding box (less floating on edges)
  YAW: -0.42,            // 3/4 view of every model
  PEDESTAL: { w: 2.6, h: 0.7, d: 2 },
  HOLD_GAP: 1.35,        // gap between the tower top and the swinging piece's bottom
  SWING_BASE: 1.55,      // rad/s of the swing at the start
  SWING_STEP: 0.075,     // + per stacked piece
  SWING_MAX: 4.4,
  SWING_JITTER: 0.14,    // ± random share per piece
  AMP_BASE: 1.35,        // swing half-width at the start (world units)
  AMP_STEP: 0.04,
  AMP_MAX: 2.2,          // also capped so the piece stays on screen
  PERFECT_TOL: 0.13,     // |x - x of the piece below| under this = perfect (snaps to centre, +1)
  SETTLE_SPEED: 0.25,    // a landed piece counts once slower than this…
  SETTLE_SPIN: 0.35,     // …and spinning slower than this…
  SETTLE_TIME: 0.16,     // …for this long
  SETTLE_MAX: 1.2,       // or after this long anyway
  MISS_TOL: 0.4,         // settled bottom more than this share of its height under the old top = missed
  TOPPLE_DROP: 0.6,      // a stacked piece sinking this far below where it settled = toppled
  FREEZE_DEPTH: 2,       // pieces deeper than this many levels become static (stops slow creep)
  STEP: 1 / 120,         // fixed physics step (small = steadier stacks)
  FOV: 32,
  VIEW_H: 9.5,           // visible world height at the tower (landscape)
  VIEW_W_MIN: 5.6,       // visible world width at least (portrait phones)
  CAM_LIFT: 1.2,         // camera above its target: looks slightly down on the tops
  SHAKE: 0.07,
  RESTART_DELAY: 700,    // ms after game over before a tap restarts
};
const BEST_KEY = 'shr-stack-best';
const DEBUG = /[?&]debug\b/.test(location.search);
const NAVY = 0x2a27a6, SKY = 0x5d8ab6;

// ----- DOM -----
const root = document.getElementById('sg');
const canvas = root.querySelector('.sg-canvas');
const framesEl = root.querySelector('.sg-frames');
const rulerEl = root.querySelector('.sg-ruler');
const startEl = root.querySelector('.sg-start');
const loadEl = root.querySelector('.sg-load');
const overEl = root.querySelector('.sg-over');
const scoreEl = root.querySelector('.sg-score');
const scoreBox = scoreEl.querySelector('.sg-box');
const scoreN = scoreEl.querySelector('.sg-score-n');
const bestN = scoreEl.querySelector('.sg-best-n');
const flashEl = root.querySelector('.sg-flash');
const popEl = root.querySelector('.sg-pop');
const soundBtn = root.querySelector('.sg-sound');

// ----- three -----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0xffffff, 0);   // transparent: the measuring scale shows behind the models
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(T.FOV, 1, 0.1, 500);

// ----- physics -----
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, T.GRAVITY, 0), allowSleep: true });
world.solver.iterations = 30;
world.defaultContactMaterial.friction = 1;
world.defaultContactMaterial.restitution = 0;
world.defaultContactMaterial.contactEquationStiffness = 1e8;
world.defaultContactMaterial.contactEquationRelaxation = 4;
world.defaultContactMaterial.frictionEquationStiffness = 1e8;

// Pedestal: white block with thin frame-blue edges.
const P = T.PEDESTAL;
{
  const geo = new THREE.BoxGeometry(P.w, P.h, P.d);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  mesh.position.y = -P.h / 2;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: SKY, transparent: true, opacity: 0.8 })));
  scene.add(mesh);
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(P.w / 2, P.h / 2, P.d / 2)) });
  body.position.set(0, -P.h / 2, 0);
  world.addBody(body);
}

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

// ----- models -----
const templates = [];   // { name, obj, size } per loaded model
let loaded = 0, failed = 0;
const loader = new GLTFLoader();
const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3(), tmpC = new THREE.Vector3();

function prepare(gltf, m) {
  // Turn to a 3/4 view, normalise the size, put the bounding-box centre at the origin.
  const model = gltf.scene;
  model.rotation.y = T.YAW;
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.updateMatrixWorld(true);
  tmpBox.setFromObject(wrap, true);
  const size = tmpBox.getSize(new THREE.Vector3()), c = tmpBox.getCenter(tmpC);
  let s = T.PIECE_SIZE / Math.max(size.x, size.y);
  if (size.x * s < T.MIN_WIDTH) s = Math.min(T.MIN_WIDTH / size.x, T.MAX_HEIGHT / size.y);
  wrap.scale.setScalar(s);
  wrap.position.copy(c).multiplyScalar(-s);
  const obj = new THREE.Group();
  obj.add(wrap);
  return { name: m.name, obj, size: size.multiplyScalar(s) };
}

MODELS.forEach((m) => {
  loader.load(m.url, (gltf) => {
    templates.push(prepare(gltf, m));
    loaded++;
    onLoadProgress();
  }, undefined, (err) => {
    console.warn('Sacred Stack: could not load', m.url, err);
    failed++;
    onLoadProgress();
  });
});

function onLoadProgress() {
  loadEl.textContent = `LOADING ${loaded}/${MODELS.length}`;
  if (loaded === 1) showShowcase();
  const done = loaded + failed === MODELS.length;
  if (loaded >= 4 || (done && loaded > 0)) startEl.classList.add('ready');
  if (done && loaded === 0) loadEl.textContent = 'COULD NOT LOAD THE MODELS';
}

// A piece: group follows the body (box centre); squash pivots at the piece's bottom.
function makePiece(t) {
  const group = new THREE.Group();
  const squash = new THREE.Group();
  squash.position.y = -t.size.y / 2;
  const inner = t.obj.clone(true);
  inner.position.y = t.size.y / 2;
  squash.add(inner);
  group.add(squash);
  scene.add(group);
  return { t, group, squash, inner, half: t.size.clone().multiplyScalar(0.5), body: null, restY: 0, frozen: false,
    landed: false, landAge: 0, landT: 0, impact: 0, calm: 0, dropT: 0, age: 0, perfect: false, prevTop: 0 };
}

function removePiece(p) {
  scene.remove(p.group);
  if (p.body) world.removeBody(p.body);
}

// ----- frames (screen-space, like .shr-frame) -----
function makeFrame() {
  const el = document.createElement('div');
  el.className = 'sg-frame fade';
  el.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><span class="num"></span><span class="tag"></span>';
  framesEl.appendChild(el);
  return { el, num: el.querySelector('.num'), tag: el.querySelector('.tag') };
}
const frame = makeFrame();
function setFrame(name, n) {
  frame.tag.textContent = name.toUpperCase();
  frame.num.textContent = String(n).padStart(2, '0') + '.';
  frame.el.classList.remove('fade', 'perfect');
}

const corner = new THREE.Vector3();
let vw = 1, vh = 1;
function screenRect(group, hx, hy, hz) {
  // Project the corners of the piece's box to the screen.
  group.updateMatrixWorld();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < 8; k++) {
    corner.set(k & 1 ? hx : -hx, k & 2 ? hy : -hy, k & 4 ? hz : -hz).applyMatrix4(group.matrixWorld).project(camera);
    const sx = (corner.x + 1) / 2 * vw, sy = (1 - corner.y) / 2 * vh;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function placeFrame(p, pad = 8) {
  const r = screenRect(p.group, p.fx || p.half.x, p.half.y, p.half.z);
  frame.el.style.transform = `translate(${r.x - pad}px, ${r.y - pad}px)`;
  frame.el.style.width = r.w + pad * 2 + 'px';
  frame.el.style.height = r.h + pad * 2 + 'px';
  return r;
}

// ----- measuring scale -----
const rulerPool = Array.from({ length: 48 }, () => {
  const d = document.createElement('div');
  d.appendChild(document.createElement('span'));
  rulerEl.appendChild(d);
  return d;
});
function drawRuler() {
  const step = cam.h > 40 ? 10 : cam.h > 20 ? 5 : 1;
  const yBottom = Math.max(0, Math.floor((cam.y - cam.h * 0.7) / step) * step);
  let i = 0;
  for (let y = yBottom; i < rulerPool.length; y += step, i++) {
    const d = rulerPool[i];
    corner.set(0, y, 0).project(camera);
    const sy = (1 - corner.y) / 2 * vh;
    if (sy < -10 || sy > vh + 10) { d.style.display = 'none'; continue; }
    d.style.display = '';
    d.style.transform = `translateY(${sy}px)`;
    const label = String(y).padStart(2, '0');
    if (d.firstChild.textContent !== label) d.firstChild.textContent = label;
  }
}

// ----- game state -----
let state = 'start';          // start | swing | drop | over
let stack = [], current = null, falling = null, showcase = null;
let score = 0, best = readBest(), topY = 0, topX = 0, phase = 0, omega = T.SWING_BASE, amp = T.AMP_BASE;
let overAt = 0, bag = [], lastPick = -1, shake = 0;
bestN.textContent = best;

const view = { h: T.VIEW_H, w: T.VIEW_W_MIN };   // target visible size at the tower
const cam = { y: 2, h: T.VIEW_H };                // smoothed camera target / visible height

function nextTemplate() {
  if (!bag.length) {
    bag = templates.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    if (bag.length > 1 && bag[bag.length - 1] === lastPick) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  lastPick = bag.pop();
  return templates[lastPick];
}

function showShowcase() {
  if (state !== 'start' || showcase || !templates.length) return;
  showcase = makePiece(templates[Math.floor(Math.random() * templates.length)]);
  showcase.group.position.set(0, showcase.half.y, 0);
  showcase.fx = Math.max(showcase.half.x, showcase.half.z);   // it turns: keep the frame wide enough
  setFrame(showcase.t.name, 1);
  frame.el.classList.add('on');
}

function spawn() {
  current = makePiece(nextTemplate());
  const lvl = stack.length;
  omega = Math.min(T.SWING_MAX, T.SWING_BASE + T.SWING_STEP * lvl) * (1 + (Math.random() * 2 - 1) * T.SWING_JITTER);
  amp = Math.min(T.AMP_BASE + T.AMP_STEP * lvl, T.AMP_MAX, view.w / 2 - current.half.x - 0.15);
  setFrame(current.t.name, lvl + 1);
  frame.el.classList.add('on');
  state = 'swing';
}

function startGame() {
  if (showcase) { removePiece(showcase); showcase = null; }
  startEl.hidden = true;
  root.classList.remove('is-start');
  scoreEl.hidden = false;
  phase = Math.random() < 0.5 ? 0 : Math.PI;
  spawn();
}

function restart() {
  for (const p of stack) removePiece(p);
  if (current) removePiece(current);
  if (falling) removePiece(falling);
  stack = []; current = null; falling = null;
  score = 0; topY = 0; topX = 0;
  scoreN.textContent = '0';
  overEl.hidden = true;
  scoreEl.hidden = false;
  phase = Math.random() < 0.5 ? 0 : Math.PI;
  spawn();
}

function drop() {
  const p = current;
  current = null;
  let x = p.group.position.x;
  p.perfect = Math.abs(x - topX) < T.PERFECT_TOL;
  if (p.perfect) x = topX;
  const body = new CANNON.Body({ mass: 1, linearDamping: 0.04, angularDamping: 0.25, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.25 });
  body.addShape(new CANNON.Box(new CANNON.Vec3(p.half.x * T.COLLIDER_X, p.half.y, p.half.z)));
  body.linearFactor.set(1, 1, 0);    // physics stays in the screen plane: stable and fair
  body.angularFactor.set(0, 0, 1);
  body.position.set(x, p.group.position.y, 0);
  body.velocity.set(0, T.DROP_SPEED, 0);
  body.addEventListener('collide', (e) => {
    if (p.landed) return;
    p.landed = true;
    p.impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
  });
  world.addBody(body);
  p.body = body;
  p.prevTop = topY;
  p.group.scale.setScalar(1);
  falling = p;
  state = 'drop';
}

function onLand(p) {
  // Squash, shake, click, buzz; the perfect drop also flashes navy.
  const k = THREE.MathUtils.clamp(p.impact / 7, 0.35, 1);
  shake = T.SHAKE * k * (p.perfect ? 1.6 : 1);
  blip(420 + Math.min(stack.length, 30) * 9, 150, 0.09, 0.22, 'triangle');
  buzz(p.perfect ? 20 : 10);
  if (p.perfect) {
    blip(880, 1320, 0.14, 0.1, 'sine', 0.04);
    frame.el.classList.add('perfect');
    scoreBox.classList.add('perfect');
    restartAnim(flashEl, 'go');
    const r = screenRect(p.group, p.half.x, p.half.y, p.half.z);
    popEl.style.left = r.x + r.w / 2 + 'px';
    popEl.style.top = Math.max(60, r.y - 30) + 'px';
    restartAnim(popEl, 'go');
    setTimeout(() => { frame.el.classList.remove('perfect'); scoreBox.classList.remove('perfect'); }, 420);
  }
}

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;   // restart the CSS animation
  el.classList.add(cls);
}

function settle(p) {
  const b = p.body;
  b.updateAABB();
  if (b.aabb.lowerBound.y < p.prevTop - p.half.y * 2 * T.MISS_TOL) { gameOver('MISSED'); return; }
  p.restY = b.position.y;
  b.linearDamping = 0.6;    // settled pieces resist creeping; a real overhang still tips
  b.angularDamping = 0.85;
  stack.push(p);
  falling = null;
  score += 1 + (p.perfect ? 1 : 0);
  topY = Math.max(topY, b.aabb.upperBound.y);
  topX = b.position.x;
  scoreN.textContent = score;
  restartAnim(scoreN, 'bump');
  freezeDeep();
  spawn();
}

function freezeDeep() {
  // Deep pieces become static so the physics stays cheap and the base can't wobble forever.
  for (let i = 0; i < stack.length - T.FREEZE_DEPTH; i++) {
    const p = stack[i];
    if (p.frozen) continue;
    const b = p.body;
    b.type = CANNON.Body.STATIC;
    b.mass = 0;
    b.updateMassProperties();
    b.velocity.setZero(); b.angularVelocity.setZero();
    p.frozen = true;
  }
}

function gameOver(cause) {
  if (state === 'over') return;
  // A miss that knocked the tower over reads better as a topple.
  if (cause === 'MISSED' && stack.some((p) => !p.frozen && p.body.position.y < p.restY - 0.3)) cause = 'TOPPLED';
  state = 'over';
  overAt = performance.now();
  if (current) { removePiece(current); current = null; }
  frame.el.classList.add('fade');
  frame.el.classList.remove('on');
  const isNew = score > best;
  if (isNew) { best = score; writeBest(best); }
  bestN.textContent = best;
  if (DEBUG) console.info('Sacred Stack: game over', cause, { score, topY, falling: falling && falling.body.position });
  overEl.querySelector('.sg-over-cause').textContent = cause;
  overEl.querySelector('.sg-over-n').textContent = score;
  const bestEl = overEl.querySelector('.sg-over-best');
  bestEl.textContent = isNew && score > 0 ? `NEW BEST ${best}` : `BEST ${best}`;
  bestEl.classList.toggle('new', isNew && score > 0);
  scoreEl.hidden = true;
  overEl.hidden = false;
  shake = T.SHAKE * 2;
  blip(240, 70, 0.45, 0.25, 'sine');
  buzz([30, 40, 30]);
}

// ----- input -----
function action() {
  if (state === 'start') { if (startEl.classList.contains('ready')) startGame(); }
  else if (state === 'swing') drop();
  else if (state === 'over' && performance.now() - overAt > T.RESTART_DELAY) restart();
}
root.addEventListener('pointerdown', (e) => {
  if (e.target.closest('a, button')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.pointerType === 'touch' && e.isTrusted) touched = true;
  e.preventDefault();
  action();
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'ArrowDown') return;
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('a, button')) return;
  e.preventDefault();
  if (!e.repeat) action();
});

// ----- per-frame updates -----
function updateSwing(dt) {
  const p = current;
  p.age += dt;
  phase += omega * dt;
  const s = Math.min(1, p.age / 0.18);
  p.group.scale.setScalar(1 - Math.pow(1 - s, 3));   // pop in
  p.group.position.set(amp * Math.sin(phase), topY + T.HOLD_GAP + p.half.y + Math.sin(p.age * 3) * 0.05, 0);
  placeFrame(p);
}

function updateDrop(dt) {
  const p = falling, b = p.body;
  p.dropT += dt;
  if (b.position.y + p.half.y < p.prevTop - 0.4 && !p.landed) { gameOver('MISSED'); return; }
  if (b.position.y < -P.h - 1) { gameOver('MISSED'); return; }
  if (p.landed) {
    if (!p.landT) onLand(p);
    p.landT += dt;
    const calm = b.velocity.length() < T.SETTLE_SPEED && Math.abs(b.angularVelocity.z) < T.SETTLE_SPIN;
    p.calm = calm ? p.calm + dt : 0;
    if (p.calm > T.SETTLE_TIME || p.landT > T.SETTLE_MAX || b.sleepState === CANNON.Body.SLEEPING) settle(p);
  } else if (p.dropT > 5) gameOver('MISSED');
}

function checkTopple() {
  for (const p of stack) {
    if (p.frozen) continue;
    if (p.body.position.y < p.restY - T.TOPPLE_DROP) { gameOver('TOPPLED'); return; }
  }
}

function syncPieces(dt) {
  const all = falling ? stack.concat(falling) : stack;
  for (const p of all) {
    if (!p.body) continue;
    p.group.position.copy(p.body.position);
    p.group.quaternion.copy(p.body.quaternion);
    if (p.landed && p.landAge < 0.7) {
      p.landAge += dt;
      const k = 0.16 * THREE.MathUtils.clamp(p.impact / 7, 0.35, 1) * (p.perfect ? 1.3 : 1);
      const q = k * Math.exp(-p.landAge * 9) * Math.cos(p.landAge * 30);
      p.squash.scale.set(1 + q * 0.5, 1 - q, 1 + q * 0.5);
    } else p.squash.scale.set(1, 1, 1);
  }
}

function updateCamera(dt) {
  view.h = Math.max(T.VIEW_H, T.VIEW_W_MIN * vh / vw);
  view.w = view.h * vw / vh;
  let targetH = view.h, targetY;
  if (state === 'start') {
    targetH = Math.max(5.5, view.h * 0.6);   // closer on the showcase model
    targetY = 0.9 + targetH * 0.12;
  } else if (state === 'over') {
    targetH = Math.max(view.h, (topY + P.h + 2.6) / 0.6);
    targetY = -P.h - 1.1 - 0.06 * targetH + targetH / 2;
  } else {
    // Keep the swinging piece just under the score (its box bottom in px, as a share of the view).
    const hud = THREE.MathUtils.clamp((hudBottom + 18) / vh, 0.2, 0.45);
    const pieceTop = topY + T.HOLD_GAP + 1.6;
    targetY = Math.max(pieceTop - (0.5 - hud) * view.h, -P.h - 1.0 + view.h * 0.4);
  }
  const k = 1 - Math.exp(-dt * (state === 'over' ? 2.2 : 4));
  cam.y += (targetY - cam.y) * k;
  cam.h += (targetH - cam.h) * k;
  shake *= Math.exp(-dt * 14);
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  const dist = cam.h / 2 / Math.tan(THREE.MathUtils.degToRad(T.FOV / 2));
  camera.position.set(sx, cam.y + T.CAM_LIFT + sy, dist);
  camera.lookAt(sx, cam.y + sy, 0);
  camera.updateMatrixWorld();
}

// ----- loop -----
const clock = new THREE.Clock();
let running = true;
function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 1 / 30);

  if (state === 'drop' || state === 'swing' || state === 'over') world.step(T.STEP, dt, 6);
  syncPieces(dt);
  if (state === 'swing') { checkTopple(); if (state === 'swing') updateSwing(dt); }
  else if (state === 'drop') { checkTopple(); if (state === 'drop') updateDrop(dt); }
  updateCamera(dt);

  if (state === 'drop' && falling) placeFrame(falling);
  if (state === 'start' && showcase) {
    showcase.inner.rotation.y += dt * 0.5;
    showcase.group.position.y = showcase.half.y + Math.sin(clock.elapsedTime * 1.4) * 0.06;
    placeFrame(showcase, 10);
  }
  drawRuler();
  renderer.render(scene, camera);
}

let hudBottom = 150;
function resize() {
  vw = root.clientWidth; vh = root.clientHeight;
  const wasHidden = scoreEl.hidden;
  scoreEl.hidden = false;
  hudBottom = scoreEl.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
  scoreEl.hidden = wasHidden;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(root);
resize();

// Pause while the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) running = false;
  else if (!running) { running = true; clock.getDelta(); tick(); }
});
tick();

// ?debug: a read-only peek at the state for testing.
if (DEBUG) window.sgDebug = () => ({ state, score, topY, topX, stacked: stack.length, phase, omega, amp,
  current: current && { name: current.t.name, x: current.group.position.x, y: current.group.position.y, size: current.t.size.toArray() },
  falling: falling && { name: falling.t.name, p: falling.body.position.toArray(), landed: falling.landed },
  stack: stack.map((p) => ({ name: p.t.name, x: +p.body.position.x.toFixed(2), y: +p.body.position.y.toFixed(2), restY: +p.restY.toFixed(2),
    rot: +(2 * Math.atan2(p.body.quaternion.z, p.body.quaternion.w)).toFixed(2), half: p.half.toArray().map((v) => +v.toFixed(2)) })),
  sizes: templates.map((t) => [t.name, t.size.toArray().map((v) => +v.toFixed(2))]) });
