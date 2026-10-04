// Sacred Hyper Race, walkable: the map's sculptures in a small park at sunset.
// A lavender path loops past every piece, so a stroll round takes about a minute.
// Desktop: click Enter, WASD / arrows to walk, mouse to look, Shift to run, Esc to leave.
// Touch: left thumb walks, right thumb looks, × leaves.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

const EYE = 1.8, WALK = 5.5, RUN = 13, LIMIT = 150;

// The path: a soft closed loop, about 300 m round.
const PATH = [[0, -62], [38, -52], [62, -20], [58, 18], [36, 48], [4, 58], [-30, 46], [-56, 22], [-62, -14], [-38, -46]].map(([x, z]) => [x * 0.8, z * 0.8]);
const HALF = 2.6;   // half the path width

const MODELS = {
  sunMan: ['shr-sun-man', 'Sun Man'], mouth: ['shr-mouth-arch', 'Mouth Arch'], heads: ['shr-two-heads', 'Two Heads'],
  frog: ['shr-frog', 'Frog'], squad: ['shr-squad-monster', 'Squad Monster'], wt1: ['shr-waterfall-tree-1', 'Waterfall Tree I'],
  wt2: ['shr-waterfall-tree-2', 'Waterfall Tree II'], tree: ['shr-tree', 'Tree'], orchid: ['shr-orchid', 'Orchid'],
  church: ['shr-church', 'Church'], house: ['shr-house', 'House'], fence: ['shr-fence', 'Fence'],
};

// [model, position along the path 0..1, side (1 towards the middle of the loop, -1 outside), distance from the path, height, extra]
// One of each, alternating sides, close enough to see the next one from the last.
const PLACES = [
  ['sunMan', 0.02, 1, 14, 32], ['wt1', 0.1, -1, 11, 25], ['frog', 0.18, 1, 9, 13], ['mouth', 0.27, -1, 14, 28],
  ['orchid', 0.36, 1, 10, 18], ['heads', 0.45, -1, 11, 27], ['squad', 0.54, 1, 9, 14], ['wt2', 0.63, -1, 11, 25],
  ['tree', 0.72, 1, 11, 22],
  // the temple: church and house inside the fence ring
  ['fence', 0.84, -1, 22, 0, { width: 32 }], ['church', 0.84, -1, 26, 21], ['house', 0.84, -1, 16, 14, { yaw: 2.4 }],
];

export function shrWorld(root, base) {
  const canvas = root.querySelector('canvas');
  const ui = (s) => root.querySelector(s);
  const startEl = ui('.world-start'), labelEl = ui('.world-label'), loadEl = ui('.world-loading');
  const stick = ui('.world-stick'), knob = stick.querySelector('i'), exitBtn = ui('.world-exit');
  const touch = matchMedia('(pointer: coarse)').matches;
  root.classList.toggle('touch', touch);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog(0xb07ab8, 90, 520);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.2, 6000);
  camera.rotation.order = 'YXZ';

  // Dusk: the sun just under the horizon, pink and violet haze, warm low light.
  const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 9; su.rayleigh.value = 3.2; su.mieCoefficient.value = 0.008; su.mieDirectionalG.value = 0.93;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(89.2), THREE.MathUtils.degToRad(210));
  su.sunPosition.value.copy(sun);
  scene.add(new THREE.HemisphereLight(0xb9a2ff, 0x40245e, 1.15));
  const sunLight = new THREE.DirectionalLight(0xffa77a, 1.5);
  sunLight.position.setFromSphericalCoords(300, THREE.MathUtils.degToRad(78), THREE.MathUtils.degToRad(210)); scene.add(sunLight);
  const water = new THREE.Mesh(new THREE.CircleGeometry(5000, 64), new THREE.MeshStandardMaterial({ color: 0x4b3a9c, metalness: 0.7, roughness: 0.15 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.6; scene.add(water);

  // Island lawn under the park, ragged at the shore
  const tex = new THREE.TextureLoader();
  const lawnTex = tex.load(`${base}world/rock-2.jpg`); lawnTex.colorSpace = THREE.SRGBColorSpace; lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
  const noise = new SimplexNoise();
  const islandGeo = new THREE.CircleGeometry(1, 128);
  const ip = islandGeo.attributes.position, iuv = islandGeo.attributes.uv;
  for (let i = 1; i < ip.count; i++) {
    const a = Math.atan2(ip.getY(i), ip.getX(i));
    const r = 140 + noise.noise(Math.cos(a) * 2, Math.sin(a) * 2) * 18;
    ip.setXY(i, Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i < ip.count; i++) iuv.setXY(i, ip.getX(i) / 30, ip.getY(i) / 30);
  const lawn = new THREE.Mesh(islandGeo, new THREE.MeshStandardMaterial({ map: lawnTex, color: 0x9b8cff, roughness: 0.6, metalness: 0.1 }));
  lawn.rotation.x = -Math.PI / 2; scene.add(lawn);

  // The path: soft lavender asphalt, no markings
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const frame = (t) => {
    const u = ((t % 1) + 1) % 1;
    const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();   // points into the loop
    return { p, tan, nrm };
  };
  const pc = document.createElement('canvas'); pc.width = pc.height = 256;
  const g = pc.getContext('2d');
  g.fillStyle = '#cbb8ec'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * 0.25})` : `rgba(70,40,110,${Math.random() * 0.18})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const pathTex = new THREE.CanvasTexture(pc); pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping; pathTex.colorSpace = THREE.SRGBColorSpace; pathTex.anisotropy = 8;
  const N = 600, len = curve.getLength();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const { p, nrm } = frame(i / N);
    for (const s of [-1, 1]) { const q = p.clone().addScaledVector(nrm, s * HALF); pos.push(q.x, 0.06, q.z); uv.push(s < 0 ? 0 : 1, (i / N) * len / (HALF * 2)); }
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pathGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  pathGeo.setIndex(idx); pathGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(pathGeo, new THREE.MeshStandardMaterial({ map: pathTex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })));

  // Sculptures
  const blockers = [];   // {x, z, r} circles the walker can't enter
  const targets = [];    // meshes the crosshair can name
  const stops = [];      // where each sculpture stands, for the preview camera
  const loader = new GLTFLoader();
  const cache = {};
  const ids = [...new Set(PLACES.map((p) => p[0]))];
  let loaded = 0;
  ids.forEach((key) => {
    loader.load(`${base}models/hero/${MODELS[key][0]}.glb`, (gltf) => {
      cache[key] = gltf.scene;
      loadEl.textContent = `loading ${Math.round(++loaded / ids.length * 100)}%`;
      PLACES.filter((p) => p[0] === key).forEach(place);
      if (loaded === ids.length) root.classList.add('ready');
    });
  });
  function place([key, t, side, off, h, o = {}]) {
    const obj = cache[key].clone(true);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    const s = o.width ? o.width / Math.max(size.x, size.z) : h / size.y;
    obj.scale.setScalar(s);
    const { p, nrm } = frame(t);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.copy(p).addScaledVector(nrm, side * off);
    // Face the path, so the front is what you see walking up.
    holder.rotation.y = Math.atan2(-nrm.x * side, -nrm.z * side) + (o.yaw || 0);
    scene.add(holder);
    stops.push({ t, at: holder.position.clone().setY(Math.min(h * 0.35, 7)) });
    holder.traverse((c) => { if (c.isMesh) { c.userData.name = MODELS[key][1]; targets.push(c); } });
    // Solid up to its footprint, but never over the path; the fence ring lets you step inside.
    if (key !== 'fence') blockers.push({ x: holder.position.x, z: holder.position.z, r: Math.min(Math.max(size.x, size.z) * s * 0.35, off - HALF - 1) });
  }

  // ----- walking -----
  const keys = {};
  let playing = false, yaw = 0, pitch = 0;
  const player = new THREE.Vector3();
  let tour = 0.95;   // attract mode: the camera strolls the loop until someone enters
  let gaze = null;
  function startAt(t) {
    const { p, tan } = frame(t);
    player.copy(p); yaw = Math.atan2(-tan.x, -tan.z); pitch = 0;
  }
  function enter() {
    playing = true; root.classList.add('playing');
    startAt(tour);
    if (!touch) canvas.requestPointerLock?.();
  }
  function leave() {
    playing = false; root.classList.remove('playing');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  startEl.querySelector('button').addEventListener('click', enter);
  exitBtn.addEventListener('click', leave);
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && playing && !touch) leave(); });
  document.addEventListener('mousemove', (e) => {
    if (!playing || document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0022; pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.3, 1.3);
  });
  addEventListener('keydown', (e) => {
    if (!playing) return;
    keys[e.code] = true;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  // Touch: left half is a joystick, right half looks around.
  const joy = { id: null, x: 0, y: 0, sx: 0, sy: 0 }, look = { id: null, x: 0, y: 0 };
  canvas.addEventListener('touchstart', (e) => {
    if (!playing) return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth / 2 && joy.id === null) {
        Object.assign(joy, { id: t.identifier, sx: t.clientX, sy: t.clientY, x: 0, y: 0 });
        stick.style.left = t.clientX + 'px'; stick.style.top = (t.clientY - root.getBoundingClientRect().top) + 'px'; stick.classList.add('on');
      } else if (look.id === null) Object.assign(look, { id: t.identifier, x: t.clientX, y: t.clientY });
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!playing) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        const dx = t.clientX - joy.sx, dy = t.clientY - joy.sy, d = Math.min(1, Math.hypot(dx, dy) / 50), a = Math.atan2(dy, dx);
        joy.x = Math.cos(a) * d; joy.y = Math.sin(a) * d;
        knob.style.transform = `translate(${joy.x * 34}px, ${joy.y * 34}px)`;
      } else if (t.identifier === look.id) {
        yaw -= (t.clientX - look.x) * 0.005; pitch = THREE.MathUtils.clamp(pitch - (t.clientY - look.y) * 0.005, -1.3, 1.3);
        look.x = t.clientX; look.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; stick.classList.remove('on'); }
      if (t.identifier === look.id) look.id = null;
    }
  };
  canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);

  function walk(dt) {
    let fx = 0, fz = 0;
    if (keys.KeyW || keys.ArrowUp) fz -= 1;
    if (keys.KeyS || keys.ArrowDown) fz += 1;
    if (keys.KeyA || keys.ArrowLeft) fx -= 1;
    if (keys.KeyD || keys.ArrowRight) fx += 1;
    fx += joy.x; fz += joy.y;
    const l = Math.hypot(fx, fz);
    if (l > 0) {
      const speed = (keys.ShiftLeft || keys.ShiftRight || Math.hypot(joy.x, joy.y) > 0.95 ? RUN : WALK) * dt / Math.max(1, l);
      const s = Math.sin(yaw), c = Math.cos(yaw);
      player.x += (fx * c + fz * s) * speed;
      player.z += (-fx * s + fz * c) * speed;
    }
    for (const b of blockers) {   // slide around the sculptures
      const dx = player.x - b.x, dz = player.z - b.z, d = Math.hypot(dx, dz);
      if (d < b.r) { player.x = b.x + dx / d * b.r; player.z = b.z + dz / d * b.r; }
    }
    const r = Math.hypot(player.x, player.z);
    if (r > LIMIT) { player.x *= LIMIT / r; player.z *= LIMIT / r; }
    camera.position.set(player.x, EYE + Math.sin(performance.now() / 160) * (l > 0 ? 0.08 : 0), player.z);
    camera.rotation.set(pitch, yaw, 0);
  }

  // Name whatever is in the middle of the view.
  const ray = new THREE.Raycaster(); ray.far = 90;
  let lastPick = 0, shown = '';
  function pick(now) {
    if (now - lastPick < 150) return;
    lastPick = now;
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hit = ray.intersectObjects(targets, false)[0];
    const name = hit ? hit.object.userData.name : '';
    if (name !== shown) { shown = name; labelEl.textContent = name; labelEl.classList.toggle('on', !!name); }
  }

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(root); resize();

  // Jump the preview flight to a point of the loop (handy for checking the layout).
  root.setTour = (t) => { tour = t; };

  const clock = new THREE.Clock();
  let inView = true;
  new IntersectionObserver((e) => { inView = e[0].isIntersecting; }).observe(root);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!inView || document.hidden) return;
    if (playing) { walk(dt); pick(performance.now()); }
    else {
      tour = (tour + dt * 0.008) % 1;
      const { p, tan } = frame(tour);
      // Stroll the path, turning towards the next sculpture.
      const ahead = (x) => (x.t - tour + 0.995) % 1;   // how far along the path the sculpture is
      const next = stops.length ? stops.reduce((a, b) => (ahead(b) < ahead(a) ? b : a)) : null;
      const goal = next ? next.at : frame(tour + 0.04).p.setY(4);
      gaze = gaze ? gaze.lerp(goal, Math.min(1, dt * 1.5)) : goal.clone();
      camera.position.copy(p).setY(3.2); camera.lookAt(gaze);
      yaw = Math.atan2(-tan.x, -tan.z);
    }
    renderer.render(scene, camera);
  });
}
