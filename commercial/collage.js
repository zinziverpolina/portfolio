// Paper-collage stage for Posters & covers.
// Whole posters (never cropped) are layered over each other until they fill the stage. Like the
// paper-collage reference, the stage loops through a few layouts stop-motion style (about 12 fps,
// hard cuts): one poster at a time jumps to its place in the next layout. Moving the pointer makes
// posters follow it, landing under the cursor one after another. Clicking a poster scrolls to it
// in the gallery below.
// collage(stageElement, galleryImages)
export function collage(stage, sources) {
  const FPS = 12;
  const LAYOUTS = 4;     // layouts the base layer loops through
  const TRAIL = 10;      // posters following the pointer
  const STEP = 55;       // px of pointer travel per new follower

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pool = [];       // loaded posters: { thumb, ar, target }
  let ready = false;

  sources.forEach((img) => {
    const thumb = img.getAttribute('src').replace('img/', 'img/collage/');
    const pre = new Image();
    pre.onload = () => { pool.push({ thumb, ar: pre.naturalWidth / pre.naturalHeight, target: img }); if (!ready && pool.length >= 12) start(); };
    pre.src = thumb;
  });

  function place(el, p, x, y, w, z) {
    if (el._p !== p) { el.src = p.thumb; el._p = p; }
    el.style.width = w + 'px';
    el.style.left = Math.round(x - w / 2) + 'px';
    el.style.top = Math.round(y - w / p.ar / 2) + 'px';
    el.style.zIndex = z;
  }
  function make() {
    const el = document.createElement('img');
    el.className = 'cl-piece';
    el.alt = '';
    el.draggable = false;
    stage.appendChild(el);
    return el;
  }

  // A layout covers the stage: a jittered grid of cells, each poster wider than its cell so the
  // edges overlap and no background shows through.
  let tiles = [], layouts = [];
  function buildLayouts() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const cell = Math.max(150, Math.min(260, Math.sqrt(W * H / 18)));
    const cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
    const n = cols * rows;
    layouts = [];
    for (let l = 0; l < LAYOUTS; l++) {
      const order = [...pool].sort(() => Math.random() - 0.5);
      const L = [];
      for (let i = 0; i < n; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const p = order[i % order.length];
        const w = cell * rnd(1.25, 1.75) * Math.min(1.3, Math.max(0.8, Math.sqrt(p.ar)));
        L.push({ p, x: (c + 0.5) * (W / (cols - 1)) - W / (cols - 1) / 2 + rnd(-cell * 0.3, cell * 0.3), y: (r + 0.5) * (H / (rows - 1)) - H / (rows - 1) / 2 + rnd(-cell * 0.3, cell * 0.3), w, z: Math.floor(rnd(1, 100)) });
      }
      layouts.push(L);
    }
    while (tiles.length < n) tiles.push(make());
    while (tiles.length > n) tiles.pop().remove();
    tiles.forEach((el, i) => { const s = layouts[0][i]; place(el, s.p, s.x, s.y, s.w, s.z); });
  }

  // Stop-motion loop: in each frame a couple of tiles jump to the next layout, in a shuffled order;
  // when every tile has moved, hold for a moment and start on the following layout.
  let layout = 0, queue = [], hold = 0;
  function nextLayout() {
    layout = (layout + 1) % LAYOUTS;
    queue = tiles.map((_, i) => i).sort(() => Math.random() - 0.5);
  }

  // Followers: posters that land under the pointer.
  const trail = [];
  let pending = [], last = null, zTop = 200;
  function local(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (!last) { last = [x, y]; return; }
    if (Math.hypot(x - last[0], y - last[1]) >= STEP) { pending.push([x, y]); last = [x, y]; if (pending.length > 2) pending.shift(); }
  });
  stage.addEventListener('pointerleave', () => { last = null; });
  function follow([x, y]) {
    const p = pool[Math.floor(Math.random() * pool.length)];
    const el = trail.length < TRAIL ? make() : trail.shift();
    place(el, p, x + rnd(-20, 20), y + rnd(-20, 20), Math.min(stage.clientWidth * 0.32, rnd(200, 300) * Math.min(1.2, Math.sqrt(p.ar))), ++zTop);
    trail.push(el);
  }

  stage.addEventListener('click', (e) => {
    const el = e.target.closest('.cl-piece');
    if (!el || !el._p) return;
    const t = el._p.target;
    t.loading = 'eager';
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 900);
    t.classList.remove('cl-found'); void t.offsetWidth; t.classList.add('cl-found');
  });

  function frame() {
    if (pending.length) follow(pending.shift());
    if (queue.length) {
      for (let k = 0; k < 2 && queue.length; k++) {
        const i = queue.pop(), s = layouts[layout][i];
        if (s && tiles[i]) place(tiles[i], s.p, s.x, s.y, s.w, s.z);
      }
      if (!queue.length) hold = FPS * 0.6;
    } else if (hold > 0) hold--;
    else nextLayout();
  }

  let timer = null, visible = true;
  function run(on) {
    if (on && !timer && ready) timer = setInterval(frame, 1000 / FPS);
    if (!on && timer) { clearInterval(timer); timer = null; }
  }
  function start() {
    ready = true;
    buildLayouts();
    nextLayout();
    run(visible);
    // Posters that finish loading later join the next rebuilds.
    setTimeout(buildLayouts, 4000);
  }
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; run(visible); }).observe(stage);
  let rz;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => ready && buildLayouts(), 200); }).observe(stage);
}
