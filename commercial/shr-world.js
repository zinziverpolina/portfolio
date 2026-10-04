// Sacred Hyper Race, walkable: the map's sculptures in a small park under a lavender dusk.
// A lavender path loops round; more sculptures stand on the lawn inside it, so you can wander in.
// Desktop: click Enter, WASD / arrows to walk, mouse to look, Shift to run, Esc to leave.
// Touch: left thumb walks, right thumb looks, × leaves.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const EYE = 1.8, WALK = 5.5, RUN = 13, LIMIT = 120;
const LAVENDER = 0xcbb8ec, VIOLET = 0x5a1fc0, NIGHT = 0x22095c;   // path colour; the sky going up

// The path: a soft closed loop, about 320 m round.
const PATH = [[0, -52], [33, -44], [52, -17], [49, 16], [30, 40], [4, 49], [-26, 39], [-47, 18], [-52, -12], [-33, -39]];
const HALF = 2.4;   // half the path width

const MODELS = {
  sunMan: ['shr-sun-man', 'Sun Man'], mouth: ['shr-mouth-arch', 'Mouth Arch'], heads: ['shr-two-heads', 'Two Heads'],
  frog: ['shr-frog', 'Frog'], squad: ['shr-squad-monster', 'Squad Monster'], wt1: ['shr-waterfall-tree-1', 'Waterfall Tree I'],
  wt2: ['shr-waterfall-tree-2', 'Waterfall Tree II'], tree: ['shr-tree', 'Tree'], orchid: ['shr-orchid', 'Orchid'],
  church: ['shr-church', 'Church'], house: ['shr-house', 'House'], fence: ['shr-fence', 'Fence'],
};

// All sculptures roughly the size of the biggest ones (about 20 m), the wide frog and squad a touch lower.
// Along the outside of the path: [model, position on the path 0..1, height, yaw]; each stands just clear of the path.
const OUTSIDE = [
  ['sunMan', 0.05, 26, 0.2], ['wt2', 0.19, 21, -0.5], ['heads', 0.32, 21, 0.7], ['tree', 0.45, 20, -0.3],
  ['orchid', 0.57, 20, 0.9], ['wt1', 0.69, 21, -0.8], ['frog', 0.8, 18, 0.4], ['squad', 0.9, 18, -0.6],
];
// On the lawn inside the loop: [model, x, z, height, yaw]
const INSIDE = [
  ['mouth', 0, -8, 22, 0.3], ['church', 18, 17, 22, -0.4], ['house', 8, 27, 17, 2.4], ['wt1', -20, -18, 20, 1.1],
  ['tree', -26, 22, 20, -1.6], ['squad', 25, -16, 18, 2.2], ['orchid', -4, -32, 20, 0.6], ['frog', -36, -4, 18, -2.4],
  ['heads', 31, 3, 21, -1.2], ['wt2', -6, 13, 20, 2.9],
];
const FENCE = [13, 22, 34];   // [x, z, width]: the ring of figures round the church and house

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
  scene.environmentIntensity = 0.6;
  scene.fog = new THREE.Fog(LAVENDER, 70, 420);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.2, 6000);
  camera.rotation.order = 'YXZ';

  // Sky: light lavender at the horizon, darkening quickly upwards: violet by mid-height, deep night violet overhead.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { bottom: { value: new THREE.Color(LAVENDER) }, mid: { value: new THREE.Color(VIOLET) }, top: { value: new THREE.Color(NIGHT) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 bottom; uniform vec3 mid; uniform vec3 top; varying vec3 vDir;
      void main() { float y = max(vDir.y, 0.0);
        vec3 c = mix(bottom, mid, pow(smoothstep(0.0, 0.42, y), 0.8));
        gl_FragColor = vec4(mix(c, top, smoothstep(0.3, 0.9, y)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMat);
  skyDome.renderOrder = -1; scene.add(skyDome);
  // Stars: brighter towards the top, softly twinkling.
  const STARS = 1400, sp = new Float32Array(STARS * 3), ss = new Float32Array(STARS);
  for (let i = 0; i < STARS; i++) {
    const y = 0.12 + Math.random() * 0.88, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    sp.set([Math.cos(a) * r * 3500, y * 3500, Math.sin(a) * r * 3500], i * 3); ss[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('seed', new THREE.BufferAttribute(ss, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { time: { value: 0 }, px: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float seed; uniform float time; uniform float px; varying float vA;
      void main() { vec3 d = normalize(position); vA = smoothstep(0.15, 0.75, d.y) * (0.55 + 0.45 * sin(time * (1.0 + seed * 2.0) + seed * 40.0));
        gl_PointSize = (1.2 + seed * 2.2) * px; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: 'varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 0.98, 1.0, vA * smoothstep(0.5, 0.1, d)); }',
  });
  scene.add(new THREE.Points(starGeo, starMat));

  scene.add(new THREE.HemisphereLight(0xeee2ff, 0x5a3f8a, 1.25));
  const key = new THREE.DirectionalLight(0xffe6f4, 1.1); key.position.set(-120, 160, 80); scene.add(key);
  const water = new THREE.Mesh(new THREE.CircleGeometry(5000, 64), new THREE.MeshStandardMaterial({ color: 0x7a63d0, metalness: 0.6, roughness: 0.18 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.6; scene.add(water);

  // Island under the park, ragged at the shore: its pattern stays, but it shines like shallow water,
  // mirroring the sky and sculptures through slow ripples.
  const tex = new THREE.TextureLoader();
  const lawnTex = tex.load(`${base}world/rock-2.jpg`); lawnTex.colorSpace = THREE.SRGBColorSpace; lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
  const noise = new SimplexNoise();
  const islandGeo = new THREE.CircleGeometry(1, 128);
  const ip = islandGeo.attributes.position, iuv = islandGeo.attributes.uv;
  for (let i = 1; i < ip.count; i++) {
    const a = Math.atan2(ip.getY(i), ip.getX(i));
    const r = 112 + noise.noise(Math.cos(a) * 2, Math.sin(a) * 2) * 14;
    ip.setXY(i, Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i < ip.count; i++) iuv.setXY(i, ip.getX(i) / 30, ip.getY(i) / 30);
  const lawn = new Reflector(islandGeo, { textureWidth: 512, textureHeight: 512, clipBias: 0.003 });
  const reflectMatrix = lawn.material.uniforms.textureMatrix.value;
  lawn.material.dispose();
  const waterTime = { value: 0 };
  lawn.material = new THREE.MeshStandardMaterial({ map: lawnTex, color: 0xb7a9ff, roughness: 0.45, metalness: 0.1 });
  lawn.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { time: waterTime, tReflect: { value: lawn.getRenderTarget().texture }, reflectMatrix: { value: reflectMatrix } });
    sh.vertexShader = 'uniform mat4 reflectMatrix; varying vec4 vReflect; varying vec2 vWorld;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nvReflect = reflectMatrix * vec4(transformed, 1.0); vWorld = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = `uniform float time; uniform sampler2D tReflect; varying vec4 vReflect; varying vec2 vWorld;
      vec2 wave(vec2 p, vec2 d, float k, float w, float t) { return d * cos(dot(p, d) * k + t * w); }
      vec2 ripple(vec2 p, float t) {   // slope of a few crossing swells
        return 0.35 * (wave(p, vec2(0.8, 0.6), 0.9, 1.3, t) + wave(p, vec2(-0.5, 0.866), 1.4, 1.7, t)
          + 0.6 * wave(p, vec2(0.2, -0.98), 2.3, 2.1, t) + 0.4 * wave(p, vec2(-0.93, -0.37), 3.7, 2.9, t));
      }\n` + sh.fragmentShader
      .replace('#include <map_fragment>', 'vec2 rip = ripple(vWorld, time);\ndiffuseColor *= texture2D(map, vMapUv + rip * 0.006);')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(normal + (viewMatrix * vec4(rip.x, 0.0, rip.y, 0.0)).xyz * 0.12);')
      .replace('#include <opaque_fragment>', `vec3 mirrored = texture2D(tReflect, vReflect.xy / vReflect.w + rip * 0.02).rgb;
        float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
        outgoingLight = mix(outgoingLight, mirrored, 0.08 + 0.37 * fres);
        #include <opaque_fragment>`);
  };
  lawn.rotation.x = -Math.PI / 2; scene.add(lawn);

  // The path: soft lavender asphalt, no markings
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const frame = (t) => {
    const u = ((t % 1) + 1) % 1;
    const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();   // points into the loop
    return { p, tan, nrm };
  };
  const samples = Array.from({ length: 400 }, (_, i) => ({ t: i / 400, p: curve.getPointAt(i / 400) }));
  const nearest = (x, z) => samples.reduce((a, b) => (Math.hypot(b.p.x - x, b.p.z - z) < Math.hypot(a.p.x - x, a.p.z - z) ? b : a));
  const pc = document.createElement('canvas'); pc.width = pc.height = 256;
  const g = pc.getContext('2d');
  g.fillStyle = '#cbb8ec'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * 0.25})` : `rgba(70,40,110,${Math.random() * 0.18})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const pathTex = new THREE.CanvasTexture(pc); pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping; pathTex.colorSpace = THREE.SRGBColorSpace; pathTex.anisotropy = 8;
  const N = 500, len = curve.getLength();
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
  const spots = [
    // Outside ones need their size first, so they get their distance from the path when placed.
    ...OUTSIDE.map(([k, t, h, yaw]) => [k, (r) => { const { p, nrm } = frame(t); const off = HALF + 1.2 + r; return [p.x - nrm.x * off, p.z - nrm.z * off]; }, null, h, yaw]),
    ...INSIDE,
  ];
  const loader = new GLTFLoader();
  const cache = {};
  const ids = Object.keys(MODELS);
  let loaded = 0;
  ids.forEach((k) => {
    loader.load(`${base}models/hero/${MODELS[k][0]}.glb`, (gltf) => {
      cache[k] = gltf.scene;
      loadEl.textContent = `loading ${Math.round(++loaded / ids.length * 100)}%`;
      spots.filter((s) => s[0] === k).forEach(place);
      if (k === 'fence') place(['fence', FENCE[0], FENCE[1], 0, 0.5], FENCE[2]);
      if (loaded === ids.length) root.classList.add('ready');
    });
  });
  function place([k, x, z, h, yaw], width) {
    const obj = cache[k].clone(true);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    const s = width ? width / Math.max(size.x, size.z) : h / size.y;
    if (typeof x === 'function') [x, z] = x(Math.max(size.x, size.z) * s / 2);
    obj.scale.setScalar(s);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.set(x, 0, z);
    // Roughly face the nearest bit of path, then turn a little for a looser arrangement.
    const near = nearest(x, z);
    holder.rotation.y = Math.atan2(near.p.x - x, near.p.z - z) + yaw;
    scene.add(holder);
    stops.push({ t: near.t, at: holder.position.clone().setY(Math.min((h || 4) * 0.35, 7)) });
    holder.traverse((c) => { if (c.isMesh) { c.userData.name = MODELS[k][1]; targets.push(c); } });
    // Solid up to its footprint, but never over the path; the fence ring lets you step inside.
    const gap = Math.hypot(near.p.x - x, near.p.z - z) - HALF - 0.8;
    if (k !== 'fence') blockers.push({ x, z, r: Math.max(0, Math.min(Math.max(size.x, size.z) * s * 0.33, gap)) });
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
    const pr = renderer.getPixelRatio() * 0.5;   // the water's mirror image at half resolution, blurred by the ripples anyway
    lawn.getRenderTarget().setSize(Math.round(w * pr), Math.round(h * pr));
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
    starMat.uniforms.time.value += dt; waterTime.value += dt;
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
