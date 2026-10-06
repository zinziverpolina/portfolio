// Scatter stage for project pages: the section's pictures and videos lie loosely around its text, each in the
// same poster-style frame as the objects on the main page. When the section comes into view they drop in one
// after another and land on their places with a small bounce, then float gently. Drag a piece to move it — it
// stays where you let go (other pieces make room). A click without dragging opens it large (videos with sound).
// scatter(stageElement): the stage holds the text (anything outside .sc-items) and .sc-items > figure.sc pieces;
//   each figure holds one <img> or <video poster>, data-tag = its caption on hover.

const rnd = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // same layout on every visit

export function scatter(stage, opts = {}) {
  const items = stage.querySelector('.sc-items');
  const figs = [...items.querySelectorAll('figure.sc')];
  if (!figs.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_PLAYING = opts.maxPlaying || 3;
  const zoomOf = () => stage.currentCSSZoom || 1;

  // ----- pieces -----
  const pieces = figs.map((fig, i) => {
    const media = fig.querySelector('img, video');
    const video = media.tagName === 'VIDEO';
    if (video) { media.muted = true; media.loop = true; media.playsInline = true; media.preload = 'none'; media.removeAttribute('controls'); }
    media.draggable = false;
    const num = String(i + 1).padStart(2, '0');
    const fr = document.createElement('div');
    fr.className = 'sc-frame';
    fr.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>' + `<span class="num">${num}.</span><span class="tag"></span>`;
    fr.querySelector('.tag').textContent = fig.dataset.tag || '';
    fig.appendChild(fr);
    return { fig, media, video, ar: 1, w: 0, h: 0, x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0,
      pinned: false, start: 0, seed: i * 1.7 + 0.3, z: 1 };
  });

  // Aspect ratios from the pictures / video posters (small jpgs), then lay out.
  const ratio = (p) => new Promise((done) => {
    const src = p.video ? p.media.getAttribute('poster') : p.media.getAttribute('src');
    const im = new Image();
    im.onload = () => { p.ar = im.naturalWidth / im.naturalHeight || 1; done(); };
    im.onerror = () => done();
    im.src = src;
  });

  // ----- layout: lanes around the text block -----
  let W = 0, H = 0;
  function textBox() {
    const sr = stage.getBoundingClientRect(), z = zoomOf();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of stage.children) {
      if (el === items) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      x0 = Math.min(x0, (r.left - sr.left) / z); x1 = Math.max(x1, (r.right - sr.left) / z);
      y0 = Math.min(y0, (r.top - sr.top) / z); y1 = Math.max(y1, (r.bottom - sr.top) / z);
    }
    return x1 > x0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
  }
  function layout() {
    const cs = getComputedStyle(stage);
    const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight), padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom);
    W = stage.clientWidth;
    const inner = W - padL - padR;
    const narrow = inner < 700;
    const L = narrow ? 2 : 4, G = narrow ? 18 : 34;
    const laneW = (inner - G * (L - 1)) / L;
    const tb = textBox();
    const r = rnd(opts.seed || 7);
    const lanes = Array.from({ length: L }, (_, k) => {
      const x = padL + k * (laneW + G);
      const underText = x < tb.x1 + G / 2 && x + laneW > tb.x0;
      return { x, bottom: underText ? tb.y1 + G * 1.4 : padT + r() * 60 };
    });
    for (const p of pieces) {
      // Shortest lane, with some chance of the next-shortest so it doesn't read as a grid.
      const order = [...lanes].sort((a, b) => a.bottom - b.bottom);
      const lane = order[r() < 0.7 || order.length < 2 ? 0 : 1];
      const big = p.fig.classList.contains('big');
      const f = big ? 0.92 + r() * 0.08 : 0.62 + r() * 0.3;
      p.w = laneW * f;
      // Wide pictures may reach a little into the next lane.
      if (p.ar > 1.3 && !narrow) p.w = Math.min(laneW * 1.35, inner - (lane.x - padL));
      p.h = p.w / p.ar;
      const hx = lane.x + r() * Math.max(0, Math.min(laneW, inner + padL - lane.x) - p.w);
      const hy = lane.bottom + 12 + r() * (narrow ? 26 : 70);
      if (!p.pinned) { p.hx = hx; p.hy = hy; }
      lane.bottom = hy + p.h + G * 0.6;
      // A wide piece also pushes the lane next to it down.
      const next = lanes[lanes.indexOf(lane) + 1];
      if (next && hx + p.w > next.x) next.bottom = Math.max(next.bottom, lane.bottom);
      p.fig.style.width = p.w + 'px';
      p.fig.style.height = p.h + 'px';
    }
    H = Math.max(tb.y1, ...pieces.map((p) => p.hy + p.h)) + padB;
    stage.style.minHeight = H + 'px';
    for (const p of pieces) { p.hx = Math.min(Math.max(p.hx, 0), W - p.w); p.hy = Math.min(Math.max(p.hy, 0), H - p.h); }
  }

  // ----- entry: drop in from above, one after another -----
  let entered = false;
  function enter() {
    if (entered) return;
    entered = true;
    const t0 = performance.now();
    pieces.forEach((p, i) => {
      p.x = p.hx; p.y = reduce ? p.hy : p.hy - 380 - (i % 3) * 90; p.vx = 0; p.vy = 0;
      p.start = t0 + (reduce ? 0 : i * 110);
    });
    stage.classList.add('sc-in');
    wake();
  }

  // ----- pointer: drag a piece, click to open it -----
  let drag = null;
  const ptr = { x: 0, y: 0, sx: 0, sy: 0, moved: false, t: 0 };
  let topZ = 10;
  function local(e) {
    const r = stage.getBoundingClientRect(), z = zoomOf();
    return [(e.clientX - r.left) / z, (e.clientY - r.top) / z];
  }
  function pieceOf(el) { return pieces.find((p) => p.fig === el.closest('figure.sc')); }
  let holdTimer = 0;
  items.addEventListener('pointerdown', (e) => {
    const p = pieceOf(e.target);
    if (!p || e.button > 0) return;
    const [x, y] = local(e);
    Object.assign(ptr, { x, y, sx: x, sy: y, moved: false, t: performance.now(), id: e.pointerId, p, ox: x - p.x, oy: y - p.y });
    const grab = () => { try { p.fig.setPointerCapture(e.pointerId); } catch (err) {} drag = p; p.z = ++topZ; p.fig.style.zIndex = p.z; p.fig.classList.add('on', 'drag'); wake(); };
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') { e.preventDefault(); grab(); }
    else holdTimer = setTimeout(() => { if (!ptr.moved) { grab(); navigator.vibrate && navigator.vibrate(8); } }, 260);   // touch: hold, then drag
  });
  items.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    ptr.x = x; ptr.y = y;
    if (Math.hypot(x - ptr.sx, y - ptr.sy) > 8) { ptr.moved = true; if (!drag) clearTimeout(holdTimer); }
  });
  // Touch: once a piece is held, the finger moves the piece instead of scrolling the page.
  items.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  function up() {
    clearTimeout(holdTimer);
    const p = ptr.p;
    if (!p) return;
    ptr.p = null;
    const click = !ptr.moved && performance.now() - ptr.t < 600;
    if (drag) {
      drag.fig.classList.remove('drag');
      if (ptr.moved) {
        // Stays where it was let go; pieces under it move their own places out of the way.
        drag.pinned = true; drag.hx = drag.x; drag.hy = drag.y;
        drag.fig.classList.add('pinned');
        for (const q of pieces) if (q !== drag) makeRoom(q, drag);
        // The stage grows if something now reaches below it.
        const bottom = Math.max(...pieces.map((q) => q.hy + q.h)) + 72;
        if (bottom > H) { H = bottom; stage.style.minHeight = H + 'px'; }
      }
      drag = null;
      wake();
    }
    if (click) open(p);
  }
  items.addEventListener('pointerup', up);
  items.addEventListener('pointercancel', () => { ptr.moved = true; up(); });
  items.addEventListener('pointerover', (e) => { const p = pieceOf(e.target); if (p) { p.fig.classList.add('on'); if (p.video) want(p); } });
  items.addEventListener('pointerout', (e) => { const p = pieceOf(e.target); if (p && p !== drag && !p.fig.contains(e.relatedTarget)) p.fig.classList.remove('on'); });

  function overlap(a, ax, ay, b, bx, by, m = 10) {
    const ox = Math.min(ax + a.w, bx + b.w) - Math.max(ax, bx) + m, oy = Math.min(ay + a.h, by + b.h) - Math.max(ay, by) + m;
    return ox > 0 && oy > 0 ? { ox, oy } : null;
  }
  function makeRoom(q, by) {
    const o = overlap(q, q.hx, q.hy, by, by.hx, by.hy, 14);
    if (!o) return;
    const cx = q.hx + q.w / 2 - (by.hx + by.w / 2), cy = q.hy + q.h / 2 - (by.hy + by.h / 2);
    if (o.ox < o.oy && q.hx + (cx < 0 ? -o.ox : o.ox) >= 0 && q.hx + q.w + (cx < 0 ? -o.ox : o.ox) <= W) q.hx += cx < 0 ? -o.ox : o.ox;
    else q.hy += cy < 0 && q.hy - o.oy >= 0 ? -o.oy : (cy < 0 ? by.hy + by.h + 14 - q.hy : o.oy);
  }

  // ----- opening a piece large -----
  const lb = document.createElement('div');
  lb.className = 'sc-lb';
  document.body.appendChild(lb);
  const close = () => { lb.classList.remove('open'); lb.innerHTML = ''; };
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  function open(p) {
    lb.innerHTML = '';
    const el = document.createElement(p.video ? 'video' : 'img');
    if (p.video) { el.src = p.media.getAttribute('src'); el.poster = p.media.getAttribute('poster'); el.controls = true; el.autoplay = true; el.loop = true; el.playsInline = true; }
    else { el.src = p.media.getAttribute('src'); el.alt = p.media.alt || ''; el.addEventListener('click', close); }
    lb.appendChild(el);
    lb.classList.add('open');
  }

  // ----- videos: only a few play at once (the latest ones in view or under the pointer) -----
  const playing = [];
  function want(p) {
    if (!p.video) return;
    const i = playing.indexOf(p);
    if (i > -1) playing.splice(i, 1);
    playing.push(p);
    while (playing.length > MAX_PLAYING) { const q = playing.shift(); q.media.pause(); }
    if (p.media.preload === 'none') p.media.preload = 'auto';
    p.media.play().catch(() => {});
  }
  const vio = new IntersectionObserver((es) => es.forEach((e) => {
    const p = pieces.find((q) => q.fig === e.target);
    if (e.isIntersecting) want(p);
    else { const i = playing.indexOf(p); if (i > -1) playing.splice(i, 1); p.media.pause(); }
  }), { threshold: 0.5 });

  // ----- motion -----
  let raf = 0, last = 0, inView = false;
  function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    const t = now / 1000;
    let busy = false;
    for (const p of pieces) {
      if (now < p.start) { busy = true; continue; }
      p.fig.classList.add('shown');
      let tx = p.hx, ty = p.hy;
      if (p === drag) { tx = ptr.x - ptr.ox; ty = ptr.y - ptr.oy; }
      else if (!p.pinned && !reduce) { tx += Math.sin(t * 0.45 + p.seed) * 5; ty += Math.cos(t * 0.37 + p.seed * 2) * 7; }   // gentle float
      // Spring towards the target: a light one gives the drop its bounce, a stiff one makes dragging direct.
      const k = p === drag ? 900 : 60, c = p === drag ? 60 : 9;
      p.vx += ((tx - p.x) * k - p.vx * c) * dt;
      p.vy += ((ty - p.y) * k - p.vy * c) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.abs(p.vx) + Math.abs(p.vy) > 2 || Math.abs(tx - p.x) + Math.abs(ty - p.y) > 1) busy = true;
    }
    // The dragged piece shoulders the others aside; they drift back once it has passed.
    if (drag) for (const q of pieces) {
      if (q === drag || now < q.start) continue;
      const o = overlap(q, q.x, q.y, drag, drag.x, drag.y, 6);
      if (!o) continue;
      const cx = q.x + q.w / 2 - (drag.x + drag.w / 2), cy = q.y + q.h / 2 - (drag.y + drag.h / 2);
      if (o.ox < o.oy) q.x += (cx < 0 ? -1 : 1) * o.ox * 0.35; else q.y += (cy < 0 ? -1 : 1) * o.oy * 0.35;
      busy = true;
    }
    // Nothing leaves the stage sideways.
    for (const p of pieces) { if (now >= p.start) p.x = Math.min(Math.max(p.x, 0), W - p.w); p.y = Math.max(p.y, p === drag ? 0 : -1e4); }
    for (const p of pieces) p.fig.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    // Keep floating while the section is on screen; otherwise stop once everything has settled.
    if (busy || drag || (inView && !reduce)) raf = requestAnimationFrame(tick);
  }

  // ----- start -----
  Promise.all(pieces.map(ratio)).then(() => {
    stage.classList.add('sc-on');
    layout();
    pieces.forEach((p) => { p.x = p.hx; p.y = p.hy; p.fig.style.transform = `translate(${p.hx}px, ${p.hy}px)`; });
    new IntersectionObserver((es) => {
      inView = es[0].isIntersecting;
      if (inView) { enter(); wake(); }
    }, { threshold: 0.12 }).observe(stage);
    pieces.forEach((p) => p.video && vio.observe(p.fig));
    let lastW = W;
    new ResizeObserver(() => { if (Math.abs(stage.clientWidth - lastW) > 2) { lastW = stage.clientWidth; layout(); wake(); } }).observe(stage);
  });
}
