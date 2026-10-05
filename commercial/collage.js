// Paper-collage stage for Posters & covers.
// Whole posters (never cropped) are layered over each other until they fill the stage. Each one
// drifts smoothly around its own place on a slow circle; now and then a poster glides over to its
// place in the next layout and lands on top, so the collage keeps rebuilding itself in a loop.
// Posters near the cursor are carried along its path, can be dragged around, and a click scrolls to that poster in
// the gallery below.
// collage(stageElement, galleryImages)
export function collage(stage, sources) {
  const LAYOUTS = 4;       // layouts the base layer loops through
  const SWAP_MS = 700;     // one poster moves to the next layout this often

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pool = [];
  let ready = false;

  // Originals at full quality; a random selection is enough for the stage.
  [...sources].sort(() => Math.random() - 0.5).slice(0, 64).forEach((img) => {
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
    const it = { el, p: null, x, y, w, tx: x, ty: y, tw: w, r: rnd(6, 16), ph: rnd(0, Math.PI * 2), sp: rnd(0.06, 0.15) * (Math.random() < 0.5 ? -1 : 1) };
    setPoster(it, p); it.el.style.zIndex = z;
    return it;
  }
  function setPoster(it, p) { if (it.p !== p) { it.p = p; it.el.src = p.thumb; } }

  let tiles = [], layouts = [];
  function buildLayouts() {
    const W = stage.clientWidth, H = stage.clientHeight;
    // Every poster gets about the same area, medium-sized, and always fits whole inside the stage.
    const S = Math.min(H * 0.55, W * 0.42) * 0.5;
    const size = (p) => {
      let w = S * Math.sqrt(p.ar) * rnd(0.94, 1.06), h = w / p.ar;
      const k = Math.min(1, (H * 0.9) / h, (W * 0.7) / w);
      return w * k;
    };
    const cols = Math.max(2, Math.round(W / (S * 0.75))), rows = Math.max(2, Math.round(H / (S * 0.75)));
    const n = cols * rows;
    layouts = [];
    for (let l = 0; l < LAYOUTS; l++) {
      const order = [...pool].sort(() => Math.random() - 0.5);
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
    if (!queue.length) { layout = (layout + 1) % LAYOUTS; queue = tiles.map((_, i) => i).sort(() => Math.random() - 0.5); }
    const i = queue.pop(), s = layouts[layout][i], t = tiles[i];
    if (!s || !t) return;
    if (t === dragged) return;
    setPoster(t, s.p); t.tx = s.x; t.ty = s.y; t.tw = s.w; t.el.style.zIndex = ++zTop;   // a poster that changes always lands on top
  }

  // Pointer: posters near the cursor are carried along its path, a poster can be
  // grabbed and dragged (it stays where it is dropped until its next turn), and a click without
  // dragging scrolls to that poster in the gallery.
  let zTop = 1000, dragged = null, grab = null, pointer = null;
  function local(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  const find = (el) => el && tiles.find((t) => t.el === el);
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    // Posters near the cursor are carried along its path, like paper swept by the hand.
    if (pointer && !dragged) {
      const mx = x - pointer[0], my = y - pointer[1];
      for (const it of tiles) {
        const d = Math.hypot(it.x + (it.px || 0) - x, it.y + (it.py || 0) - y), R = 760;
        if (d < R) { const k = (1 - d / R) * 0.55; it.ix = (it.ix || 0) + mx * k; it.iy = (it.iy || 0) + my * k; }
      }
    }
    pointer = [x, y];
    if (dragged) {
      if (Math.hypot(x - grab.sx, y - grab.sy) > 8) grab.moved = true;
      dragged.tx = x - grab.dx; dragged.ty = y - grab.dy;
    }
  });
  stage.addEventListener('pointerleave', () => { if (!dragged) pointer = null; });
  stage.addEventListener('pointerdown', (e) => {
    const it = find(e.target.closest('.cl-piece'));
    if (!it) return;
    const [x, y] = local(e);
    dragged = it;
    grab = { dx: x - it.x, dy: y - it.y, sx: x, sy: y, moved: false };
    it.el.style.zIndex = ++zTop;
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
    for (const it of tiles) {
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
    setTimeout(buildLayouts, 4000);   // posters loaded later join the next layouts
  }
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; run(visible); }).observe(stage);
  let rz;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { if (ready) buildLayouts(); }, 200); }).observe(stage);
}
