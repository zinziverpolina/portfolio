// Paper-collage stage for Posters & covers.
// Whole posters (never cropped) are layered over each other until they fill the stage. Each one
// drifts smoothly around its own place on a slow circle; now and then a poster glides over to its
// place in the next layout and lands on top, so the collage keeps rebuilding itself in a loop.
// Posters near the cursor are carried along its path, can be dragged around, and a click scrolls to that poster in
// the gallery below.
// Scrolling dives in: the stage stays pinned while the posters fold into a round tunnel — small, like particles,
// on a spiral that streams off into the distance — and the camera travels through it, the tunnel slowly
// turning; at its far end the page carries on to the gallery below.
// collage(stageElement, galleryImages)
export function collage(stage, sources) {
  const LAYOUTS = 4;       // layouts the base layer loops through
  const SWAP_MS = 700;     // one poster moves to the next layout this often

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pool = [];

  // ----- dive-in corridor (scroll-driven) -----
  const deep = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ui = stage.querySelector('.cl-ui');
  let wrap = null, depthM = 0, slots = false, corridorLen = 1;
  if (deep) {
    wrap = document.createElement('div');
    wrap.className = 'cl-scroll';
    stage.before(wrap); wrap.appendChild(stage);
    stage.classList.add('cl-deep');
    const fit = () => {
      const nav = document.querySelector('.topnav'), h = nav ? nav.offsetHeight : 0;
      stage.style.top = h + 'px';
      stage.style.height = `calc(100svh / var(--z, 1) - ${h}px)`;
      wrap.style.height = `calc(100svh / var(--z, 1) * 3.6 - ${h}px)`;
    };
    fit(); addEventListener('resize', fit);
    const hint = ui && ui.querySelector('.br');
    if (hint) hint.textContent += ' · scroll to go inside';
  }
  // 0 at the top of the pinned stretch, 1 at its end.
  function progress() {
    if (!wrap) return 0;
    const r = wrap.getBoundingClientRect(), s = stage.getBoundingClientRect(), span = r.height - s.height;
    return span > 0 ? Math.min(1, Math.max(0, (s.top - r.top) / span)) : 0;
  }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // The tunnel: rings of pictures laid around the inside of a round tube, overlapping so that no background
  // shows between them. About ten times as many pictures as the collage: the posters on stage take the first
  // places, clones of every image (video posters for videos) fill the rest. Made when the dive starts.
  const RING = 12;          // pictures around the tube
  const TUN_R = 0.6;        // tube radius, share of the stage's smaller side
  let tunPlaces = [], clones = [];
  function sizeFor(place, ar) {
    // whole pictures (never cropped), scaled to overlap their neighbours around (h) and along (w) the tube
    let h = place.cell * 1.32, w = h * ar;
    if (w < place.cell * 1.12) { w = place.cell * 1.12; h = w / ar; }
    return { a: place.a, z: place.z, w, h };
  }
  function corridor() {
    if (tunPlaces.length) return;
    const W = stage.clientWidth, H = stage.clientHeight, R = Math.min(W, H) * TUN_R;
    const cell = 2 * Math.PI * R / RING;
    const total = Math.max(180, Math.min(320, tiles.length * 10));
    let z = -H * 0.05;
    for (let r = 0; tunPlaces.length < total; r++) {
      for (let k = 0; k < RING; k++) {
        tunPlaces.push({ a: (k + (r % 2) * 0.5) / RING * Math.PI * 2 + rnd(-0.07, 0.07), z: z - cell * 0.5 + rnd(-0.12, 0.12) * cell, cell });
      }
      z -= cell * 0.82;
    }
    corridorLen = -z;
    tiles.forEach((it, i) => { it.tun = sizeFor(tunPlaces[i], it.p.ar); });
    const images = pool.map((q) => ({ src: q.video ? q.target.getAttribute('poster') : q.thumb, ar: q.ar })).sort(() => Math.random() - 0.5);
    for (let i = tiles.length; i < tunPlaces.length; i++) {
      const q = images[i % images.length], el = document.createElement('img');
      el.className = 'cl-piece cl-tun'; el.alt = ''; el.draggable = false; el.decoding = 'async'; el.src = q.src;
      el.style.width = '200px'; el.style.height = (200 / q.ar).toFixed(1) + 'px';
      stage.appendChild(el);
      clones.push({ el, ar: q.ar, tun: sizeFor(tunPlaces[i], q.ar), delay: Math.random() * 0.5 });
    }
  }
  function dropTunnel() {
    clones.forEach((c) => c.el.remove()); clones = []; tunPlaces = [];
    tiles.forEach((t) => { t.tun = null; });
  }
  // Where a tunnel place is now: on the tunnel wall at its angle, turned by the twist that grows as you go in.
  // Width along the tunnel (U), height around it (V), facing the axis.
  function tunnelAt(s, twist, W, H) {
    const R = Math.min(W, H) * TUN_R, a = s.a + twist;
    return { x: W / 2 + R * Math.cos(a), y: H / 2 + R * Math.sin(a), z: s.z, w: s.w, h: s.h,
      U: [0, 0, -1], V: [Math.sin(a), -Math.cos(a), 0] };
  }
  // matrix3d that draws an element's w x h box as the rectangle with top-left corner C and edge vectors
  // U*sw, V*sh, seen through a perspective P from the stage centre (O). Returns null if it reaches the camera.
  function project(C, U, V, w, h, sw, sh, P, O) {
    const ux = U[0] * sw / w, uy = U[1] * sw / w, uz = U[2] * sw / w;
    const vx = V[0] * sh / h, vy = V[1] * sh / h, vz = V[2] * sh / h;
    const corners = [C[2], C[2] + uz * w, C[2] + vz * h, C[2] + uz * w + vz * h];
    const near = Math.min(...corners.map((z) => 1 - z / P));
    if (near < 0.06) return null;
    const m = [
      ux - O[0] * uz / P, uy - O[1] * uz / P, 0, -uz / P,
      vx - O[0] * vz / P, vy - O[1] * vz / P, 0, -vz / P,
      0, 0, 1, 0,
      C[0] - O[0] * C[2] / P, C[1] - O[1] * C[2] / P, 0, 1 - C[2] / P,
    ];
    return { css: `matrix3d(${m.join(',')})`, near, depth: 1 - (C[2] + (uz * w + vz * h) / 2) / P };
  }
  const total = Math.min(sources.length, 64);   // posters this page will have once loaded
  let ready = false;

  // Originals at full quality; a random selection is enough for the stage.
  // Originals at full quality; a random selection is enough for the stage. Videos join as muted
  // loops (their poster frame gives the size); only a few play on stage at once.
  const MAX_VIDEOS = 4;
  [...sources].sort(() => Math.random() - 0.5).slice(0, 64).forEach((node) => {
    const video = node.tagName === 'VIDEO';
    const thumb = node.getAttribute('src');
    const pre = new Image();
    pre.onload = () => { pool.push({ thumb, video, ar: pre.naturalWidth / pre.naturalHeight, target: node }); if (!ready && pool.length >= Math.min(total, 28)) start(); };
    pre.src = video ? node.getAttribute('poster') : thumb;
  });
  const playing = () => tiles.filter((t) => t.p && t.p.video).length;
  // A video poster only when there is room for one more playing loop.
  const usable = (p, it) => !p.video || (it && it.p && it.p.video) || playing() < MAX_VIDEOS;

  // Every poster on stage: where it is now (x, y, w), where it is heading (tx, ty, tw), and its own circle.
  function element(p) {
    const el = document.createElement(p.video ? 'video' : 'img');
    el.className = 'cl-piece'; el.draggable = false;
    if (p.video) { el.muted = true; el.loop = true; el.playsInline = true; el.autoplay = true; el.setAttribute('muted', ''); el.poster = p.target.getAttribute('poster'); }
    else el.alt = '';
    return el;
  }
  function make(p, x, y, w, z) {
    const el = element(p);
    stage.appendChild(el);
    const it = { el, p: null, x, y, w, tx: x, ty: y, tw: w, r: rnd(6, 16), ph: rnd(0, Math.PI * 2), sp: rnd(0.06, 0.15) * (Math.random() < 0.5 ? -1 : 1) };
    setPoster(it, p); it.zi = z; it.el.style.zIndex = z;
    return it;
  }
  function setPoster(it, p) {
    if (it.p === p) return;
    if (!it.p || it.p.video !== p.video) {   // image ↔ video: swap the element, keep its place on stage
      const el = element(p);
      el.style.cssText = it.el.style.cssText;
      if (it.el.parentNode) it.el.replaceWith(el);
      if (it.el.tagName === 'VIDEO') it.el.removeAttribute('src');
      it.el = el;
    }
    it.p = p; it.el.src = p.thumb;
    if (p.video) it.el.play().catch(() => {});
  }

  let tiles = [], layouts = [];
  function buildLayouts() {
    const W = stage.clientWidth, H = stage.clientHeight;
    // Every poster gets about the same area, medium-sized, and always fits whole inside the stage.
    let S = Math.min(H * 0.55, W * 0.42) * 0.5;
    // Few images on the page: fewer, larger posters instead of the same ones repeating.
    const want = Math.max(2, Math.round(W / (S * 0.75))) * Math.max(2, Math.round(H / (S * 0.75)));
    if (total < want) S *= Math.sqrt(want / Math.max(total, 4));
    const size = (p) => {
      let w = S * Math.sqrt(p.ar) * rnd(0.94, 1.06), h = w / p.ar;
      const k = Math.min(1, (H * 0.9) / h, (W * 0.7) / w);
      return w * k;
    };
    let cols = Math.max(2, Math.round(W / (S * 0.75))), rows = Math.max(2, Math.round(H / (S * 0.75)));
    // Every tile a different image: with fewer images than grid cells, a smaller grid of larger tiles.
    const distinct = pool.filter((q) => !q.video).length + Math.min(MAX_VIDEOS, pool.filter((q) => q.video).length);
    if (cols * rows > distinct) {
      cols = Math.max(1, Math.round(Math.sqrt(distinct * W / H))); rows = Math.max(1, Math.ceil(distinct / cols));
      S = Math.min(W / cols, H / rows) / 0.75;
    }
    const n = Math.min(cols * rows, distinct);
    layouts = [];
    for (let l = 0; l < LAYOUTS; l++) {
      // Each layout: shuffled images with at most a few videos mixed in.
      const imgs = pool.filter((q) => !q.video).sort(() => Math.random() - 0.5);
      const vids = pool.filter((q) => q.video).sort(() => Math.random() - 0.5).slice(0, MAX_VIDEOS);
      const order = imgs.length ? imgs : [...vids];
      vids.forEach((v) => order.splice(Math.floor(Math.random() * Math.min(order.length, n)), 0, v));
      layouts.push(Array.from({ length: n }, (_, i) => {
        const p = order[i % order.length], w = size(p), h = w / p.ar;
        const cx = ((i % cols) + 0.5) / cols * W + rnd(-S * 0.2, S * 0.2);
        const cy = (Math.floor(i / cols) + 0.5) / rows * H + rnd(-S * 0.2, S * 0.2);
        return {
          p, w, z: Math.floor(rnd(1, 100)),
          x: Math.min(Math.max(cx, w / 2 + 6), W - w / 2 - 6),
          y: Math.min(Math.max(cy, h / 2 + 6), H - h / 2 - 6),
        };
      }));
    }
    // First time: put posters straight into the first layout. Later rebuilds (more posters loaded,
    // window resized) only change the targets, so the posters glide there instead of jumping.
    if (!tiles.length) { tiles = layouts[0].map((s) => make(s.p, s.x, s.y, s.w, s.z)); return; }
    while (tiles.length < n) { const s = layouts[0][tiles.length]; tiles.push(make(s.p, s.x, s.y, s.w, s.z)); }
    while (tiles.length > n) tiles.pop().el.remove();
    queue = [];
  }

  // The loop through layouts: one poster at a time glides to its place in the next layout.
  let layout = 0, queue = [];
  function swap() {
    if (depthM > 0 || slots) return;   // the collage stays put while you are inside the corridor
    if (!queue.length) { layout = (layout + 1) % LAYOUTS; queue = tiles.map((_, i) => i).sort(() => Math.random() - 0.5); }
    const i = queue.pop(), s = layouts[layout][i], t = tiles[i];
    if (!s || !t) return;
    if (t === dragged) return;
    if (!usable(s.p, t)) return;   // too many loops playing: this one waits for its next turn
    setPoster(t, s.p); t.tx = s.x; t.ty = s.y; t.tw = s.w; t.zi = ++zTop; t.el.style.zIndex = t.zi;   // a poster that changes always lands on top
  }

  // Pointer: posters near the cursor are carried along its path, a poster can be
  // grabbed and dragged (it stays where it is dropped until its next turn), and a click without
  // dragging scrolls to that poster in the gallery.
  let zTop = 1000, dragged = null, grab = null, pointer = null;
  // Pointer in stage px; divides out the page zoom of zoom.js on wide screens.
  function local(e) { const r = stage.getBoundingClientRect(), z = stage.currentCSSZoom || 1; return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; }
  const find = (el) => el && tiles.find((t) => t.el === el);
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    // Posters near the cursor are carried along its path, like paper swept by the hand.
    if (pointer && !dragged && depthM < 0.05) {
      const mx = x - pointer[0], my = y - pointer[1];
      for (const it of tiles) {
        const d = Math.hypot(it.x + (it.px || 0) - x, it.y + (it.py || 0) - y), R = 760;
        if (d < R) { const k = (1 - d / R) * 0.55; it.ix = (it.ix || 0) + mx * k; it.iy = (it.iy || 0) + my * k; }
      }
    }
    pointer = [x, y];
    if (dragged) {
      if (Math.hypot(x - grab.sx, y - grab.sy) > 8) grab.moved = true;
      if (depthM < 0.05) { dragged.tx = x - grab.dx; dragged.ty = y - grab.dy; }
    }
  });
  stage.addEventListener('pointerleave', () => { if (!dragged) pointer = null; });
  stage.addEventListener('pointerdown', (e) => {
    const it = find(e.target.closest('.cl-piece'));
    if (!it) return;
    const [x, y] = local(e);
    dragged = it;
    grab = { dx: x - it.x, dy: y - it.y, sx: x, sy: y, moved: false };
    it.zi = ++zTop; it.el.style.zIndex = it.zi;
    stage.setPointerCapture(e.pointerId);
    stage.style.cursor = 'grabbing';
    e.preventDefault();
  });
  function release() {
    if (!dragged) return;
    const it = dragged, click = !grab.moved;
    dragged = null; stage.style.cursor = '';
    if (click) {
      const t = it.p.target;
      t.loading = 'eager';
      t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 900);
    }
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // Smooth motion: every poster eases towards its target and circles around it.
  let raf = 0, timer = null, visible = true, t0 = performance.now();
  function draw(now) {
    raf = requestAnimationFrame(draw);
    const t = (now - t0) / 1000;
    // Scroll position -> fold-out (depthM, first fifth of the way) and camera travel (the rest).
    const pr = progress();
    depthM = smooth(0, 0.2, pr);
    const travel = smooth(0.12, 1, pr);
    if (pr === 0) { if (slots) { dropTunnel(); slots = false; } }   // back at the top: a fresh tunnel next time
    else { slots = true; corridor(); }
    const W = stage.clientWidth, H = stage.clientHeight, P = H * 1.05, O = [W / 2, H / 2];
    const cam = travel * (corridorLen + P * 0.7);
    if (ui) ui.style.opacity = (1 - depthM).toFixed(3);
    tiles.forEach((it, i) => {
      const ease = it === dragged ? 0.35 : 0.035;   // a grabbed poster keeps up with the hand
      it.x += (it.tx - it.x) * ease; it.y += (it.ty - it.y) * ease; it.w += (it.tw - it.w) * ease;
      // Carried along the cursor's path, then slowly drifting back home.
      // The hand's push arrives gradually (ix → vx), so posters ease into motion instead of jerking.
      const ix = it.ix || 0, iy = it.iy || 0;
      it.vx = (it.vx || 0) + ix * 0.06; it.vy = (it.vy || 0) + iy * 0.06; it.ix = ix * 0.94; it.iy = iy * 0.94;
      it.px = (it.px || 0) + it.vx * 0.2; it.py = (it.py || 0) + it.vy * 0.2;
      it.vx *= 0.9; it.vy *= 0.9;
      it.px *= 0.988; it.py *= 0.988;
      const a = t * it.sp + it.ph, r = it === dragged ? 0 : it.r;
      const cx = it.x + it.px + Math.cos(a) * r, cy = it.y + it.py + Math.sin(a) * r * 0.8;
      const w = it.w, h = it.w / it.p.ar;
      it.el.style.width = w.toFixed(1) + 'px'; it.el.style.height = h.toFixed(1) + 'px';
      const s = slots && it.tun && tunnelAt(it.tun, travel * 1.4, W, H);
      if (slots && !it.tun) { it.el.style.visibility = 'hidden'; return; }   // loaded after the tunnel was laid out
      if (!s || (depthM === 0 && cam === 0)) {
        it.el.style.transform = `translate(${(cx - w / 2).toFixed(1)}px, ${(cy - h / 2).toFixed(1)}px)`;
        it.el.style.zIndex = it.zi; it.el.style.opacity = ''; it.el.style.visibility = '';
        return;
      }
      // Fold from the flat collage (centre cx, cy, facing you) to the corridor place, then move the camera in.
      const m = depthM, mix = (a, b) => a + (b - a) * m;
      const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      const U = norm([mix(1, s.U[0]), mix(0, s.U[1]), mix(0, s.U[2])]);
      const V = norm([mix(0, s.V[0]), mix(1, s.V[1]), mix(0, s.V[2])]);
      const sw = mix(w, s.w), sh = mix(h, s.h);
      const c = [mix(cx, s.x), mix(cy, s.y), mix(0, s.z) + cam];
      const C = [c[0] - U[0] * sw / 2 - V[0] * sh / 2, c[1] - U[1] * sw / 2 - V[1] * sh / 2, c[2] - U[2] * sw / 2 - V[2] * sh / 2];
      const q = project(C, U, V, w, h, sw, sh, P, O);
      if (!q) { it.el.style.visibility = 'hidden'; return; }
      it.el.style.visibility = '';
      it.el.style.transform = q.css;
      it.el.style.opacity = Math.min(1, (q.near - 0.06) / 0.25).toFixed(3);
      // Stacking: the collage order while folding out, then nearer surfaces over farther ones.
      it.el.style.zIndex = m < 0.35 ? it.zi : 100000 - Math.round(q.depth * 100);
    });
    // The clones fly in from the depth while the collage folds, then stay on the tube's wall.
    for (const c of clones) {
      const k = smooth(c.delay * 0.4, c.delay * 0.4 + 0.6, depthM);
      const sp = tunnelAt(c.tun, travel * 1.4, W, H);
      const U = sp.U, V = sp.V, w = 200, h = 200 / c.ar;
      const z = sp.z - (1 - k) * 2600 + cam;
      const C = [sp.x - U[0] * sp.w / 2 - V[0] * sp.h / 2, sp.y - U[1] * sp.w / 2 - V[1] * sp.h / 2, z - U[2] * sp.w / 2 - V[2] * sp.h / 2];
      const q = k > 0.001 && project(C, U, V, w, h, sp.w, sp.h, P, O);
      if (!q) { c.el.style.visibility = 'hidden'; continue; }
      c.el.style.visibility = '';
      c.el.style.transform = q.css;
      c.el.style.opacity = Math.min(k * 1.5, 1, (q.near - 0.06) / 0.25).toFixed(3);
      c.el.style.zIndex = depthM < 0.35 ? 0 : 100000 - Math.round(q.depth * 100);
    }
  }
  function run(on) {
    if (on && !raf && ready) { raf = requestAnimationFrame(draw); timer = setInterval(swap, SWAP_MS); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; clearInterval(timer); timer = null; }
  }
  setTimeout(() => { if (!ready && pool.length) start(); }, 2500);   // slow network: start with what has arrived
  function start() {
    if (ready) return;
    ready = true;
    buildLayouts();
    run(visible);
    setTimeout(buildLayouts, 4000);   // posters loaded later join the next layouts
  }
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; run(visible); }).observe(stage);
  let rz;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { if (ready) buildLayouts(); }, 200); }).observe(stage);
}
