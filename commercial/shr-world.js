// Sacred Hyper Race, walkable: a rough web rebuild of the Fortnite race map.
// The track loops over water past the map's models; walk it in first person.
// Desktop: click Enter, WASD / arrows to walk, mouse to look, Shift to run, Esc to leave.
// Touch: left thumb walks, right thumb looks, × leaves.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

const EYE = 2.4, WALK = 11, RUN = 32, LIMIT = 560;

// Rough layout read off the gameplay video: start gate by the temple island, tentacle trees
// over the road, the mouth-arch tunnel, creatures at the roadside, the Sun Man arch before the finish.
const TRACK = [[0, -260], [180, -235], [300, -120], [315, 40], [235, 175], [85, 215], [-40, 140],
  [-150, 225], [-290, 175], [-335, 10], [-265, -145], [-140, -245]];

const MODELS = {
  sunMan: ['shr-sun-man', 'Sun Man'], mouth: ['shr-mouth-arch', 'Mouth Arch'], heads: ['shr-two-heads', 'Two Heads'],
  frog: ['shr-frog', 'Frog'], squad: ['shr-squad-monster', 'Squad Monster'], wt1: ['shr-waterfall-tree-1', 'Waterfall Tree'],
  wt2: ['shr-waterfall-tree-2', 'Waterfall Tree'], tree: ['shr-tree', 'Tree'], orchid: ['shr-orchid', 'Orchid'],
  church: ['shr-church', 'Church'], house: ['shr-house', 'House'], fence: ['shr-fence', 'Fence'],
};

// [model, track position 0..1, side (-1 left, 1 right, 0 on the road), distance from the centre line, height, extra]
const PLACES = [
  ['mouth', 0.46, 0, 0, 60, { arch: true }],
  ['sunMan', 0.93, 0, 0, 70, { arch: true }],
  ['wt1', 0.17, -1, 13, 34, { tilt: 0.35 }], ['wt2', 0.2, 1, 14, 38, { tilt: 0.35 }], ['heads', 0.235, -1, 15, 40, { tilt: 0.25 }],
  ['wt2', 0.27, -1, 13, 32, { tilt: 0.35 }], ['wt1', 0.3, 1, 15, 36, { tilt: 0.3 }], ['heads', 0.335, 1, 16, 36, { tilt: 0.25 }],
  ['orchid', 0.39, -1, 34, 26], ['tree', 0.41, 1, 30, 30], ['frog', 0.52, -1, 26, 20], ['squad', 0.56, 1, 26, 22],
  ['wt1', 0.6, -1, 14, 30, { tilt: 0.3 }], ['heads', 0.63, 1, 15, 34, { tilt: 0.3 }], ['orchid', 0.67, 1, 32, 24],
  ['frog', 0.71, 1, 24, 18], ['squad', 0.74, -1, 24, 20], ['tree', 0.78, -1, 30, 28], ['wt2', 0.82, 1, 14, 34, { tilt: 0.35 }],
  ['orchid', 0.86, -1, 30, 22], ['tree', 0.12, 1, 36, 26], ['orchid', 0.08, 1, 40, 20],
  // temple island inside the loop, next to the start
  ['fence', 0.03, 1, 95, 16, { width: 90 }], ['church', 0.03, 1, 85, 34], ['church', 0.03, 1, 108, 28, { yaw: 1.2 }],
  ['house', 0.06, 1, 92, 24], ['house', 0.0, 1, 100, 20, { yaw: 2.4 }],
];
const ROCKS = [[0.14, 1, 90, 1], [0.24, 1, 70, 3], [0.36, -1, 80, 2], [0.43, 1, 60, 4], [0.5, -1, 70, 1], [0.58, -1, 85, 3],
  [0.66, -1, 75, 5], [0.7, 1, 80, 2], [0.8, 1, 85, 4], [0.88, 1, 70, 1], [0.97, -1, 80, 3], [0.33, 1, 120, 5], [0.62, 1, 130, 3]];
// Dense filler like on the map: seeded, so the layout is always the same.
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(7);
const NEAR = ['wt1', 'wt2', 'heads', 'orchid', 'tree', 'wt1', 'wt2', 'heads', 'frog', 'squad'];
const FAR = ['heads', 'wt2', 'squad', 'orchid', 'frog', 'tree', 'wt1'];
const busy = [0.0, 0.03, 0.06, 0.46, 0.93];   // keep the landmarks clear
for (let t = 0.01; t < 1; t += 0.021) {
  if (busy.some((b) => Math.abs(b - t) < 0.025)) continue;
  const key = NEAR[Math.floor(rand() * NEAR.length)], side = rand() < 0.5 ? -1 : 1;
  const tall = key === 'frog' || key === 'squad' ? 26 : 44;
  PLACES.push([key, t + rand() * 0.01, side, 15 + rand() * 22, tall * (0.8 + rand() * 0.6), { tilt: key.startsWith('w') || key === 'heads' ? 0.3 : 0, yaw: rand() * 6.28 }]);
}
for (let t = 0; t < 1; t += 0.045) {   // giant silhouettes on the horizon
  PLACES.push([FAR[Math.floor(rand() * FAR.length)], t, rand() < 0.5 ? -1 : 1, 140 + rand() * 120, 80 + rand() * 60, { yaw: rand() * 6.28, far: true }]);
}
for (let t = 0.02; t < 1; t += 0.07) ROCKS.push([t, rand() < 0.5 ? -1 : 1, 55 + rand() * 25, 1 + Math.floor(rand() * 5)]);
const RINGS = [[0.0, 0x3dff7a], [0.15, 0xff4fd8], [0.55, 0xff4fd8], [0.75, 0x3dff7a]];

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
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.Fog(0xb8c2ff, 260, 1500);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 6000);
  camera.rotation.order = 'YXZ';

  // Sky, light, water
  const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 3; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(200));
  su.sunPosition.value.copy(sun);
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a2a7a, 1.1));
  const sunLight = new THREE.DirectionalLight(0xfff1e6, 1.6); sunLight.position.copy(sun).multiplyScalar(500); scene.add(sunLight);
  const water = new THREE.Mesh(new THREE.CircleGeometry(5000, 64), new THREE.MeshStandardMaterial({ color: 0x3340d8, metalness: 0.7, roughness: 0.12 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.6; scene.add(water);

  const tex = new THREE.TextureLoader();
  const rockTex = [1, 2, 3, 4, 5].map((i) => { const t = tex.load(`${base}world/rock-${i}.jpg`); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });

  // Island under the track, a little ragged at the shore
  const noise = new SimplexNoise();
  const islandGeo = new THREE.CircleGeometry(1, 128, 0, Math.PI * 2);
  const ip = islandGeo.attributes.position;
  for (let i = 1; i < ip.count; i++) {
    const a = Math.atan2(ip.getY(i), ip.getX(i));
    const r = 470 + noise.noise(Math.cos(a) * 2, Math.sin(a) * 2) * 60;
    ip.setXY(i, Math.cos(a) * r, Math.sin(a) * r);
  }
  const islandUv = islandGeo.attributes.uv;
  for (let i = 0; i < ip.count; i++) islandUv.setXY(i, ip.getX(i) / 60, ip.getY(i) / 60);
  const ground = new THREE.Mesh(islandGeo, new THREE.MeshStandardMaterial({ map: rockTex[1], color: 0x8b8fff, roughness: 0.55, metalness: 0.15 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  // Track
  const curve = new THREE.CatmullRomCurve3(TRACK.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const frame = (t) => {
    const p = curve.getPointAt(((t % 1) + 1) % 1);
    const tan = curve.getTangentAt(((t % 1) + 1) % 1);
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();   // points to the right of travel
    return { p, tan, nrm };
  };
  const roadCanvas = document.createElement('canvas'); roadCanvas.width = 256; roadCanvas.height = 512;
  const g = roadCanvas.getContext('2d');
  g.fillStyle = '#3b3c44'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2); }
  g.fillStyle = '#f2f2f2'; g.fillRect(10, 0, 6, 512); g.fillRect(240, 0, 6, 512);
  for (const x of [85, 168]) for (let y = 0; y < 512; y += 128) g.fillRect(x, y, 5, 70);
  const roadTex = new THREE.CanvasTexture(roadCanvas); roadTex.wrapT = THREE.RepeatWrapping; roadTex.colorSpace = THREE.SRGBColorSpace; roadTex.anisotropy = 8;
  const N = 900, HALF = 9, len = curve.getLength();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const { p, nrm } = frame(i / N);
    for (const s of [-1, 1]) { const q = p.clone().addScaledVector(nrm, s * HALF); pos.push(q.x, 0.15, q.z); uv.push(s < 0 ? 0 : 1, (i / N) * len / 18); }
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roadGeo.setIndex(idx); roadGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.8, side: THREE.DoubleSide })));
  // Rails: yellow-orange barriers on both sides
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i < 300; i++) { const { p, nrm } = frame(i / 300); pts.push(p.clone().addScaledVector(nrm, s * (HALF + 0.4)).setY(1.0)); }
    const rail = new THREE.CatmullRomCurve3(pts, true);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(rail, 900, 0.45, 8, true), new THREE.MeshStandardMaterial({ color: 0xffb21f, emissive: 0x7a3a00, roughness: 0.35, metalness: 0.3 })));
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(rail, 900, 0.2, 6, true).translate(0, -0.6, 0), new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.3, metalness: 0.8 })));
  }
  // Neon ring gates over the road
  for (const [t, color] of RINGS) {
    const { p, tan } = frame(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 1.1, 16, 64), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 }));
    ring.position.copy(p).setY(9); ring.rotation.y = Math.atan2(tan.x, tan.z); scene.add(ring);
  }

  // Rocks: glossy noisy blobs wearing the map's textures
  const blockers = [];   // {x, z, r} circles the walker can't enter
  ROCKS.forEach(([t, side, off, ti], k) => {
    const geo = new THREE.IcosahedronGeometry(1, 5);
    const a = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      const n = noise.noise3d(v.x * 1.4 + k, v.y * 1.4, v.z * 1.4) * 0.35 + noise.noise3d(v.x * 4, v.y * 4 + k, v.z * 4) * 0.08;
      v.multiplyScalar(1 + n); a.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const { p, nrm } = frame(t);
    const r = 30 + (k % 4) * 10, h = 30 + (k % 3) * 18;
    off = Math.max(off, r * 1.3 + HALF + 6);   // never on the road
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: rockTex[ti - 1], roughness: 0.28, metalness: 0.25 }));
    m.scale.set(r, h, r * 0.85); m.position.copy(p).addScaledVector(nrm, side * off).setY(h * 0.25);
    m.rotation.y = k; scene.add(m);
    blockers.push({ x: m.position.x, z: m.position.z, r: r * 0.95 });
  });

  // Models
  const targets = [];   // meshes the crosshair can name
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
    const src = cache[key];
    const obj = src.clone(true);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const s = o.width ? o.width / Math.max(size.x, size.z) : h / size.y;
    obj.scale.setScalar(s);
    const { p, tan, nrm } = frame(t);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.copy(p).addScaledVector(nrm, side * off);
    holder.rotation.y = Math.atan2(tan.x, tan.z) + (o.yaw || 0);
    if (o.tilt) holder.rotateOnWorldAxis(tan.clone().normalize(), side * o.tilt);   // lean over the road
    scene.add(holder);
    holder.traverse((c) => { if (c.isMesh) { c.userData.name = MODELS[key][1]; targets.push(c); } });
    // Roadside pieces block only up to the kerb, so the road always stays walkable.
    if (!o.arch && !o.far) blockers.push({ x: holder.position.x, z: holder.position.z, r: Math.min(Math.max(size.x, size.z) * s * 0.3, Math.max(0, off - HALF - 3)) });
  }

  // ----- walking -----
  const keys = {};
  let playing = false, yaw = 0, pitch = 0;
  const player = new THREE.Vector3();
  let tour = 0.97;   // attract mode: the camera drives the loop until someone enters
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
    for (const b of blockers) {   // slide around rocks and creatures
      const dx = player.x - b.x, dz = player.z - b.z, d = Math.hypot(dx, dz);
      if (d < b.r) { player.x = b.x + dx / d * b.r; player.z = b.z + dz / d * b.r; }
    }
    const r = Math.hypot(player.x, player.z);
    if (r > LIMIT) { player.x *= LIMIT / r; player.z *= LIMIT / r; }
    camera.position.set(player.x, EYE + Math.sin(performance.now() / 160) * (l > 0 ? 0.08 : 0), player.z);
    camera.rotation.set(pitch, yaw, 0);
  }

  // Name whatever is in the middle of the view.
  const ray = new THREE.Raycaster(); ray.far = 160;
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
      tour = (tour + dt * 0.004) % 1;
      const { p, tan } = frame(tour), ahead = frame(tour + 0.02).p;
      camera.position.copy(p).setY(7); camera.lookAt(ahead.x, 6, ahead.z);
      yaw = Math.atan2(-tan.x, -tan.z);
    }
    renderer.render(scene, camera);
  });
}
