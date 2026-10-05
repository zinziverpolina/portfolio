// Paper-collage stage for Posters & covers.
// Whole posters (never cropped) are layered over each other until they fill the stage. Each one
// drifts smoothly around its own place on a slow circle; now and then a poster glides over to its
// place in the next layout, so the collage keeps rebuilding itself in a loop. Moving the pointer
// makes a few posters follow it, gliding after the cursor one behind another. Clicking a poster
// scrolls to it in the gallery below.
// collage(stageElement, galleryImages)
export function collage(stage, sources) {
  const LAYOUTS = 4;       // layouts the base layer loops through
  const SWAP_MS = 700;     // one poster moves to the next layout this often
  const TRAIL = 5;         // posters following the pointer
  const STEP = 110;         // px of pointer travel per new follower

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pool = [];
  let ready = false;

  // Originals at full quality; a random selection is enough for the stage.
  [...sources].sort(() => Math.random() - 0.5).slice(0, 36).forEach((img) => {
    const thumb = img.getAttribute('src');
    const pre = new Image();
    pre.onload = () => { pool.push({ thumb, ar: pre.naturalWidth / pre.naturalHeight, target: img }); if (!ready && pool.length >= 8) start(); };
    pre.src = thumb;
  });

  // Every poster on stage: where it is now (x, y, w), where it is heading (tx, ty, tw), and its own circle.
  function make(p, x, y, w, z) {
    const el = document.createElement('img');
    el.className = 'cl-piece'; el.alt = ''; el.draggable = false;
    stage.appendChild(el);
    const it = { el, p: null, x, y, w, tx: x, ty: y, tw: w, r: rnd(18, 60), ph: rnd(0, Math.PI * 2), sp: rnd(0.12, 0.3) * (Math.random() < 0.5 ? -1 : 1) };
    setPoster(it, p); it.el.style.zIndex = z;
    return it;
  }
  function setPoster(it, p) { if (it.p !== p) { it.p = p; it.el.src = p.thumb; } }

  let tiles = [], layouts = [];
  function buildLayouts() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const cell = Math.max(300, Math.min(520, Math.sqrt(W * H / 4.5)));
    const cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1, n = cols * rows;
    const gx = W / (cols - 1), gy = H / (rows - 1);
    layouts = [];
    for (let l = 0; l < LAYOUTS; l++) {
      const order = [...pool].sort(() => Math.random() - 0.5);
      layouts.push(Array.from({ length: n }, (_, i) => {
        const p = order[i % order.length];
        return {
          p, z: Math.floor(rnd(1, 100)),
          x: (i % cols) * gx + rnd(-cell * 0.3, cell * 0.3),
          y: Math.floor(i / cols) * gy + rnd(-cell * 0.3, cell * 0.3),
          w: cell * rnd(1.3, 1.8) * Math.min(1.3, Math.max(0.8, Math.sqrt(p.ar))),
        };
      }));
    }
    tiles.forEach((t) => t.el.remove());
    tiles = layouts[0].map((s) => make(s.p, s.x, s.y, s.w, s.z));
  }

  // The loop through layouts: one poster at a time glides to its place in the next layout.
  let layout = 0, queue = [];
  function swap() {
    if (!queue.length) { layout = (layout + 1) % LAYOUTS; queue = tiles.map((_, i) => i).sort(() => Math.random() - 0.5); }
    const i = queue.pop(), s = layouts[layout][i], t = tiles[i];
    if (!s || !t) return;
    setPoster(t, s.p); t.tx = s.x; t.ty = s.y; t.tw = s.w; t.el.style.zIndex = s.z;
  }

  // Followers glide after the pointer, each a step behind the one before.
  const trail = [];
  let path = [], last = null, zTop = 200;
  function local(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (!last) { last = [x, y]; }
    if (Math.hypot(x - last[0], y - last[1]) >= STEP || !trail.length) {
      last = [x, y];
      if (trail.length < TRAIL) {
        const p = pool[Math.floor(Math.random() * pool.length)];
        const w = Math.min(stage.clientWidth * 0.55, rnd(400, 560) * Math.min(1.2, Math.sqrt(p.ar)));
        const f = make(p, x, y, w, ++zTop);
        f.r = 0; trail.push(f);
      }
    }
    path.unshift([x, y]); path.length = Math.min(path.length, TRAIL * 6);
  });

  stage.addEventListener('click', (e) => {
    const el = e.target.closest('.cl-piece');
    const it = el && [...tiles, ...trail].find((t) => t.el === el);
    if (!it) return;
    const t = it.p.target;
    t.loading = 'eager';
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 900);
  });

  // Smooth motion: every poster eases towards its target and circles around it.
  let raf = 0, timer = null, visible = true, t0 = performance.now();
  function draw(now) {
    raf = requestAnimationFrame(draw);
    const t = (now - t0) / 1000;
    trail.forEach((f, k) => { const p = path[Math.min(path.length - 1, k * 6)]; if (p) { f.tx = p[0]; f.ty = p[1]; } });
    for (const it of [...tiles, ...trail]) {
      const ease = it.r ? 0.035 : 0.12;   // base posters glide slowly, followers keep up with the hand
      it.x += (it.tx - it.x) * ease; it.y += (it.ty - it.y) * ease; it.w += (it.tw - it.w) * ease;
      const a = t * it.sp + it.ph;
      const cx = it.x + Math.cos(a) * it.r, cy = it.y + Math.sin(a) * it.r * 0.8;
      it.el.style.width = it.w.toFixed(1) + 'px';
      it.el.style.transform = `translate(${(cx - it.w / 2).toFixed(1)}px, ${(cy - it.w / it.p.ar / 2).toFixed(1)}px)`;
    }
  }
  function run(on) {
    if (on && !raf && ready) { raf = requestAnimationFrame(draw); timer = setInterval(swap, SWAP_MS); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; clearInterval(timer); timer = null; }
  }
  function start() {
    ready = true;
    buildLayouts();
    run(visible);
    setTimeout(() => { run(false); buildLayouts(); run(visible); }, 4000);   // posters loaded later join in
  }
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; run(visible); }).observe(stage);
  let rz;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { if (ready) { run(false); buildLayouts(); run(visible); } }, 200); }).observe(stage);
}
