// Floating intro: models drift in zero gravity inside the hero, each in a poster-style frame.
// Drag a model (or its frame) to move it, hover shows its tag, click a model to open its project,
// click empty space to make them all jiggle.
// floatScene(heroElement, [{ url, name, tag?, href?, weight?, pick?, tint? }, ...])
//   pick: node names to keep from the file (to show one piece of a multi-object model)
//   tint: { material, color } recolours one material of this copy
//   norm: scale a full-size file down to about one unit
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';

const VIEW_H = 10;   // world units visible vertically
const DEPTH = 2.5;   // half-depth of the box the models float in

export function floatScene(hero, MODELS) {
  const canvas = hero.querySelector('canvas');
  const ui = hero.querySelector('.shr-frames');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 20);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  world.defaultContactMaterial.friction = 0.05;
  world.defaultContactMaterial.restitution = 0.4;

  // Six walls around the visible area; resized with the window.
  const walls = [
    [0, Math.PI / 2],   // left (plane normal +x)
    [0, -Math.PI / 2],  // right
    [-Math.PI / 2, 0],  // bottom
    [Math.PI / 2, 0],   // top
    [0, 0],             // back
    [0, Math.PI],       // front
  ].map(([rx, ry]) => {
    const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    b.quaternion.setFromEuler(rx, ry, 0);
    world.addBody(b);
    return b;
  });

  let W = 1, H = VIEW_H, unit = 1;
  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    W = VIEW_H * w / h; H = VIEW_H;
    camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    walls[0].position.set(-W / 2, 0, 0);
    walls[1].position.set(W / 2, 0, 0);
    walls[2].position.set(0, -H / 2, 0);
    walls[3].position.set(0, H / 2, 0);
    walls[4].position.set(0, 0, -DEPTH);
    walls[5].position.set(0, 0, DEPTH);
    unit = Math.min(Math.sqrt(W * H / MODELS.length) * 0.62, Math.min(W, H) * 0.4);
    items.forEach(fit);
  }

  const items = [];

  // Each model drifts around its own cell of a grid that fills the screen.
  function home(i) {
    const n = MODELS.length;
    const cols = Math.max(2, Math.round(Math.sqrt(n * W / H)));
    const rows = Math.ceil(n / cols);
    const row = Math.floor(i / cols), inRow = row < rows - 1 ? cols : n - row * cols;
    return { x: ((i % cols) + 0.5) / inRow * W - W / 2, y: H / 2 - (row + 0.5) / rows * H };
  }

  function fit(it) {
    // Size each model to the screen, then rebuild its collision box.
    it.scale = unit * it.weight;
    it.group.scale.setScalar(it.scale);
    const half = it.size.clone().multiplyScalar(it.scale * 0.45);
    it.body.shapes = []; it.body.shapeOffsets = []; it.body.shapeOrientations = [];
    it.body.addShape(new CANNON.Box(new CANNON.Vec3(half.x, half.y, Math.min(half.z, DEPTH * 0.9))));
    it.body.updateMassProperties();
    // Keep it inside after a resize.
    const p = it.body.position;
    p.x = THREE.MathUtils.clamp(p.x, -W / 2 + half.x, W / 2 - half.x);
    p.y = THREE.MathUtils.clamp(p.y, -H / 2 + half.y, H / 2 - half.y);
  }

  function makeFrame(i, m) {
    const num = String(i + 1).padStart(2, '0');
    const el = document.createElement('div');
    el.className = 'shr-frame';
    el.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>' +
      `<span class="num">${num}.</span><span class="tag"></span>`;
    el.querySelector('.tag').textContent = m.tag || `${num} ${m.name}`;
    ui.appendChild(el);
    return el;
  }

  const loader = new GLTFLoader();
  MODELS.forEach((m, i) => {
    loader.load(m.url, (gltf) => {
      const model = gltf.scene;
      if (m.pick) for (const c of [...model.children]) if (!m.pick.includes(c.name)) model.remove(c);
      if (m.tint) model.traverse((o) => {
        if (o.isMesh && o.material && o.material.name === m.tint.material) { o.material = o.material.clone(); o.material.color.set(m.tint.color); }
      });
      if (m.norm) {   // full-size source files: scale to about one unit like the hero copies
        const s0 = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        model.scale.multiplyScalar(1 / Math.max(s0.x, s0.y, s0.z));
      }
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(box.getCenter(new THREE.Vector3()));   // pivot at the centre
      const group = new THREE.Group();
      group.add(model);
      scene.add(group);

      // Start at its home spot with a little push.
      const body = new CANNON.Body({ mass: 1, linearDamping: 0.35, angularDamping: 0.5 });
      const h0 = home(i);
      body.position.set(h0.x + (Math.random() - 0.5) * 0.5, h0.y + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * DEPTH);
      body.quaternion.setFromEuler(0, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.4);
      body.velocity.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0);
      world.addBody(body);

      const it = { i, name: m.name, tag: m.tag, href: m.href, group, body, size, weight: 1, frame: makeFrame(i, m), rect: null, wobble: 0, seed: Math.random() * 100 };
      // Flat, wide pieces (the fence ring) read better a bit larger.
      it.weight = (m.weight || 1) * THREE.MathUtils.clamp(1 / Math.sqrt(Math.max(size.x, size.y)), 1, 1.25);
      items.push(it);
      fit(it);
    });
  });

  // ----- pointer: hover, drag, click -----
  const pointer = { x: 0, y: 0, down: false, sx: 0, sy: 0, t: 0, moved: false };
  let hovered = null, dragged = null;

  function hit(px, py) {
    // The frame under the pointer; when frames overlap, the smallest wins.
    let best = null, area = Infinity;
    for (const it of items) {
      const r = it.rect;
      if (!r || px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
      if (r.w * r.h < area) { area = r.w * r.h; best = it; }
    }
    return best;
  }
  function toWorld(px, py) {
    return { x: (px / hero.clientWidth - 0.5) * W, y: (0.5 - py / hero.clientHeight) * H };
  }
  function local(e) {
    const r = hero.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  hero.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    pointer.x = x; pointer.y = y;
    if (pointer.down && Math.hypot(x - pointer.sx, y - pointer.sy) > 14) pointer.moved = true;
    const h = dragged || hit(x, y);
    if (h !== hovered) {
      hovered && hovered.frame.classList.remove('on');
      hovered = h;
      hovered && hovered.frame.classList.add('on');
    }
    hero.style.cursor = dragged ? 'grabbing' : hovered ? (hovered.href ? 'pointer' : 'grab') : '';
  });
  hero.addEventListener('pointerleave', () => {
    if (dragged) return;
    hovered && hovered.frame.classList.remove('on');
    hovered = null;
  });
  hero.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    Object.assign(pointer, { x, y, sx: x, sy: y, down: true, moved: false, t: performance.now() });
    dragged = hit(x, y);
    if (dragged) {
      dragged.frame.classList.add('on', 'drag');
      hero.setPointerCapture(e.pointerId);
      hero.style.cursor = 'grabbing';
    }
  });
  function release() {
    if (!pointer.down) return;
    pointer.down = false;
    const click = !pointer.moved && performance.now() - pointer.t < 900;
    const target = dragged;
    if (dragged) dragged.frame.classList.remove('drag');
    dragged = null;
    if (click && target && target.href) openProject(target);
    else if (click) jiggle();
  }
  hero.addEventListener('pointerup', release);
  hero.addEventListener('pointercancel', () => { pointer.moved = true; release(); });

  // Click on a linked object: its blue-violet frame opens to fill the screen in white, then the
  // project page opens under the same white cover, which fades away (see .cover in style.css and
  // the head script on project pages).
  let leaving = false;
  function openProject(it) {
    if (leaving) return;
    leaving = true;
    const r = it.rect || frameRect(it), hr = hero.getBoundingClientRect();
    const cover = document.createElement('div');
    cover.className = 'cover cover-grow';
    Object.assign(cover.style, { left: hr.left + r.x + 'px', top: hr.top + r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    document.body.appendChild(cover);
    cover.getBoundingClientRect();   // start the transition from the frame's box
    cover.classList.add('full');
    try { sessionStorage.setItem('cover', it.tag); } catch (e) {}
    setTimeout(() => { location.href = it.href; }, 560);
  }
  window.addEventListener('pageshow', (e) => { if (e.persisted) { leaving = false; document.querySelectorAll('.cover').forEach((n) => n.remove()); } });

  function jiggle() {
    for (const it of items) {
      const s = 7;
      it.body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.4));
      it.body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6);
      it.wobble = 1;
    }
  }

  // ----- loop -----
  const clock = new THREE.Clock();
  const corner = new THREE.Vector3();
  const bounds = new THREE.Box3();
  let running = true;

  function frameRect(it) {
    // Screen-space box around the model: project the corners of its world bounding box.
    bounds.setFromObject(it.group);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const w = hero.clientWidth, h = hero.clientHeight;
    for (let k = 0; k < 8; k++) {
      corner.set(k & 1 ? bounds.max.x : bounds.min.x, k & 2 ? bounds.max.y : bounds.min.y, k & 4 ? bounds.max.z : bounds.min.z).project(camera);
      const sx = (corner.x + 1) / 2 * w, sy = (1 - corner.y) / 2 * h;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 1 / 30);
    const t = clock.elapsedTime;

    for (const it of items) {
      const b = it.body, s = it.seed;
      // Slow wandering force + a soft spring back to its home spot and the middle layer.
      const h0 = home(it.i);
      b.applyForce(new CANNON.Vec3(
        Math.sin(t / 6 + s) * 0.5 + (h0.x - b.position.x) * 0.35,
        Math.cos(t / 7 + s * 2) * 0.5 + (h0.y - b.position.y) * 0.35,
        -b.position.z * 0.6));
      b.applyTorque(new CANNON.Vec3(Math.sin(t / 9 + s) * 0.08, Math.cos(t / 8 + s) * 0.12, Math.sin(t / 11 + s) * 0.04));
      if (it === dragged) {
        const p = toWorld(pointer.x, pointer.y);
        b.velocity.set((p.x - b.position.x) * 14, (p.y - b.position.y) * 14, -b.position.z * 4);
      }
    }
    world.step(1 / 60, dt, 3);

    for (const it of items) {
      it.group.position.copy(it.body.position);
      it.group.quaternion.copy(it.body.quaternion);
      // Squash-and-stretch after a click.
      if (it.wobble > 0.001) {
        it.wobble *= Math.pow(0.04, dt);
        const q = Math.sin(t * 28 + it.seed) * 0.22 * it.wobble;
        it.group.scale.set(it.scale * (1 - q * 0.6), it.scale * (1 + q), it.scale * (1 - q * 0.6));
      } else {
        it.group.scale.setScalar(it.scale);
      }
      const r = it.rect = frameRect(it);
      it.frame.style.transform = `translate(${r.x}px, ${r.y}px)`;
      it.frame.style.width = r.w + 'px';
      it.frame.style.height = r.h + 'px';
    }
    renderer.render(scene, camera);
  }

  // Only animate while the intro is on screen and the tab is visible.
  let inView = true;
  function setRunning() {
    const want = inView && !document.hidden;
    if (want && !running) { running = true; clock.getDelta(); tick(); }
    else if (!want) running = false;
  }
  new IntersectionObserver((e) => { inView = e[0].isIntersecting; setRunning(); }).observe(hero);
  document.addEventListener('visibilitychange', setRunning);
  new ResizeObserver(resize).observe(hero);
  resize();
  tick();
}
