// Paper-collage stage for Posters & covers.
// Moving the pointer drops cut-out pieces of the posters under it, stop-motion style (about 12 fps,
// hard cuts, no fades); pieces already on the stage keep swapping one by one. When nobody moves,
// the collage keeps rebuilding itself slowly. Clicking a piece scrolls to that image in the gallery.
// collage(stageElement, galleryImages)
export function collage(stage, sources) {
  const FPS = 12, MAX = 26, STEP = 38;   // frame rate, pieces kept on stage, px of travel per new piece
  const pool = [];                        // { thumb, target } for images whose light copy has loaded
  sources.forEach((img) => {
    const thumb = img.getAttribute('src').replace('img/', 'img/collage/');
    const pre = new Image();
    pre.onload = () => pool.push({ thumb, target: img, ar: pre.naturalWidth / pre.naturalHeight });
    pre.src = thumb;
  });

  const pieces = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = () => pool[Math.floor(Math.random() * pool.length)];

  // A cut-out: a rectangle of some poster, magnified, slightly rotated, with ragged paper edges.
  function dress(el, src) {
    const w = el.offsetWidth || 160;
    const zoom = rnd(1.3, 3);
    el.style.backgroundImage = `url("${src.thumb}")`;
    el.style.backgroundSize = `${Math.round(w * zoom)}px auto`;
    el.style.backgroundPosition = `${rnd(0, 100).toFixed(0)}% ${rnd(0, 100).toFixed(0)}%`;
    const j = () => rnd(0, 3).toFixed(1) + '%';
    el.style.clipPath = `polygon(${j()} ${j()}, ${50 + rnd(-2, 2)}% 0, calc(100% - ${j()}) ${j()}, 100% ${50 + rnd(-3, 3)}%, calc(100% - ${j()}) calc(100% - ${j()}), ${50 + rnd(-2, 2)}% 100%, ${j()} calc(100% - ${j()}), 0 ${50 + rnd(-3, 3)}%)`;
    el._src = src;
  }

  function drop(x, y) {
    const src = pick();
    if (!src) return;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cl-piece';
    el.setAttribute('aria-label', 'Show this image in the gallery');
    const big = Math.random() < 0.18;
    const w = Math.round(big ? rnd(220, 380) : rnd(90, 230));
    const h = Math.round(w * rnd(0.45, 1.5));
    Object.assign(el.style, {
      width: w + 'px', height: h + 'px',
      left: Math.round(x - w / 2 + rnd(-30, 30)) + 'px', top: Math.round(y - h / 2 + rnd(-30, 30)) + 'px',
      transform: `rotate(${rnd(-4, 4).toFixed(1)}deg)`,
    });
    stage.appendChild(el);
    dress(el, src);
    pieces.push(el);
    while (pieces.length > MAX) pieces.shift().remove();
  }

  // Pointer: queue a piece every STEP px of travel; the frame clock decides when it lands.
  let queued = [], last = null;
  function local(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (!last) { last = [x, y]; return; }
    const d = Math.hypot(x - last[0], y - last[1]);
    if (d >= STEP) { queued.push([x, y]); last = [x, y]; if (queued.length > 3) queued.shift(); }
    idle = 0;
  });
  stage.addEventListener('pointerleave', () => { last = null; });

  stage.addEventListener('click', (e) => {
    const p = e.target.closest('.cl-piece');
    if (!p || !p._src) return;
    const t = p._src.target;
    t.loading = 'eager';
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Images above it may still be loading and shift the layout: settle on it once more.
    setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 900);
    t.classList.remove('cl-found'); void t.offsetWidth; t.classList.add('cl-found');
  });

  // Stop-motion clock.
  let idle = 0, running = true;
  function frame() {
    if (!running) return;
    idle++;
    if (queued.length) drop(...queued.shift());
    else if (idle > FPS * 1.5 && Math.random() < 0.35) {   // nobody moving: keep building on its own
      drop(rnd(0, stage.clientWidth), rnd(0, stage.clientHeight));
    }
    // Like the paper reference: a couple of existing pieces swap their picture each frame.
    for (let k = 0; k < 2; k++) {
      const p = pieces[Math.floor(Math.random() * pieces.length)];
      if (p && Math.random() < 0.5) dress(p, pick());
    }
  }
  let timer = setInterval(frame, 1000 / FPS);
  // First layout so the stage is never empty.
  const seed = setInterval(() => {
    if (pool.length < 6) return;
    clearInterval(seed);
    for (let i = 0; i < 14; i++) drop(rnd(0, stage.clientWidth), rnd(0, stage.clientHeight));
  }, 100);

  // Pause off screen.
  new IntersectionObserver((en) => {
    const want = en[0].isIntersecting;
    if (want && !running) { running = true; timer = setInterval(frame, 1000 / FPS); }
    else if (!want && running) { running = false; clearInterval(timer); }
  }).observe(stage);
}
