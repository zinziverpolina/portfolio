// Floating media stage for the white project pages, in the manner of the 3D objects on the main page.
// The first section's text (title, subtitle, description, credit, links) moves into the middle of a
// full-screen stage; the page's videos and stills float around it in the main page's frames.
// Hover: the frame turns navy and shows its tag. Drag: throw an item. Click on empty space: everything
// jiggles. Click on the text: the items rush to it for a moment. Click on an item: the page scrolls to it
// below (opening its pile first if it is folded away) and a video starts playing.
// floatMedia() — no arguments: it reads the page itself.
export function floatMedia() {
  const first = document.querySelector('section.slide');
  const sources = [...document.querySelectorAll('section.slide img.zoom, section.slide video.clip, section.slide model-viewer[poster]')];
  if (!first || !sources.length) return;

  const MAX = 16;          // items on stage
  const MAX_PLAY = 3;      // of them, videos playing as muted loops (the rest show their poster)
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ----- stage + centred text -----
  document.body.classList.add('fm-page');
  const stage = document.createElement('div');
  stage.className = 'fm-stage';
  const text = document.createElement('div');
  text.className = 'fm-text';
  [...first.children].filter((el) => el.matches('h2, .meta, .body, .credit, .subnav')).forEach((el) => text.appendChild(el));
  stage.appendChild(text);
  first.before(stage);
  if (!first.children.length) first.remove();
  const fit = () => {
    const nav = document.querySelector('.topnav'), h = nav ? nav.offsetHeight : 0;
    stage.style.height = `calc(100svh / var(--z, 1) - ${h}px)`;
  };
  fit();
  addEventListener('resize', fit);

  // Tag: the section's own title on pages with several sections, otherwise the kind of item.
  const sections = document.querySelectorAll('section.slide h2').length;
  const tagOf = (node) => {
    const h = node.closest('section.slide')?.querySelector('h2');
    const kind = node.tagName === 'VIDEO' ? 'video' : node.tagName === 'MODEL-VIEWER' ? '3d model' : 'still';
    return sections > 1 && h ? `${h.firstChild.textContent.trim()} · ${kind}` : kind;
  };

  // ----- items -----
  const picks = [...sources].sort(() => Math.random() - 0.5).slice(0, MAX);
  const items = [];
  let playing = 0, ready = false;
  picks.forEach((node, i) => {
    const video = node.tagName === 'VIDEO';
    const still = video || node.tagName === 'MODEL-VIEWER' ? node.getAttribute('poster') : node.getAttribute('src');
    const pre = new Image();
    pre.onload = () => {
      const play = video && playing < MAX_PLAY;
      if (play) playing++;
      const el = document.createElement('div');
      el.className = 'fm-item';
      const media = document.createElement(play ? 'video' : 'img');
      media.className = 'fm-media';
      media.draggable = false;
      if (play) {
        Object.assign(media, { muted: true, loop: true, playsInline: true, autoplay: true, poster: still });
        media.setAttribute('muted', '');
        media.src = node.getAttribute('src');
      } else { media.src = still; media.alt = ''; }
      const num = String(i + 1).padStart(2, '0');
      const frame = document.createElement('div');
      frame.className = 'shr-frame fm-frame';
      frame.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>' +
        `<span class="num">${num}.</span><span class="tag"></span>`;
      frame.querySelector('.tag').textContent = tagOf(node);
      el.append(media, frame);
      stage.appendChild(el);
      if (play) media.play().catch(() => {});
      items.push({ el, frame, node, ar: pre.naturalWidth / pre.naturalHeight, x: 0, y: 0, vx: 0, vy: 0, w: 1, h: 1,
        seed: rnd(0, 100), placed: false });
      if (ready) layout();
    };
    pre.src = still;
  });

  // ----- layout: sizes from the free area, a home cell for each item off the text -----
  let W = 1, H = 1, K = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const zoomOf = () => stage.currentCSSZoom || 1;
  function textBox() {
    const sr = stage.getBoundingClientRect(), r = text.getBoundingClientRect(), z = zoomOf(), pad = 18;
    return { x0: (r.left - sr.left) / z - pad, y0: (r.top - sr.top) / z - pad, x1: (r.right - sr.left) / z + pad, y1: (r.bottom - sr.top) / z + pad };
  }
  function home(i, it) {
    const n = items.length, cols = Math.max(2, Math.round(Math.sqrt(n * W / H))), rows = Math.ceil(n / cols);
    const row = Math.floor(i / cols), inRow = row < rows - 1 ? cols : n - row * cols;
    const p = { x: ((i % cols) + 0.5) / inRow * W, y: (row + 0.5) / rows * H };
    const hw = it.w / 2 + 10, hh = it.h / 2 + 10;
    if (p.x > K.x0 - hw && p.x < K.x1 + hw && p.y > K.y0 - hh && p.y < K.y1 + hh) {
      // On the text: move to the nearest side of it (above, below, left, right) that has room.
      const sides = [];
      if (K.y0 - hh >= hh) sides.push({ x: p.x, y: K.y0 - hh });
      if (K.y1 + hh <= H - hh) sides.push({ x: p.x, y: K.y1 + hh });
      if (K.x0 - hw >= hw) sides.push({ x: K.x0 - hw, y: p.y });
      if (K.x1 + hw <= W - hw) sides.push({ x: K.x1 + hw, y: p.y });
      if (sides.length) { const best = sides.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; p.x = best.x; p.y = best.y; }
    }
    p.x = Math.min(Math.max(p.x, hw), W - hw); p.y = Math.min(Math.max(p.y, hh), H - hh);
    return p;
  }
  function layout() {
    W = stage.clientWidth; H = stage.clientHeight; K = textBox();
    const free = Math.max(W * H * 0.3, W * H - (K.x1 - K.x0) * (K.y1 - K.y0));
    const unit = Math.sqrt(free * 0.36 / Math.max(items.length, 6));
    items.forEach((it, i) => {
      it.w = unit * Math.sqrt(it.ar); it.h = unit / Math.sqrt(it.ar);
      const k = Math.min(1, (H * 0.3) / it.h, (W * 0.26) / it.w); it.w *= k; it.h *= k;
      it.el.style.width = it.w.toFixed(1) + 'px'; it.el.style.height = it.h.toFixed(1) + 'px';
      if (!it.placed) { const p = home(i, it); it.x = p.x + rnd(-20, 20); it.y = p.y + rnd(-20, 20); it.placed = true; }
    });
  }
  const start = () => { if (ready) return; ready = true; layout(); run(); };
  setTimeout(start, 2500);   // whatever has loaded by then; later items join as they arrive
  const check = setInterval(() => { if (items.length === picks.length) { clearInterval(check); start(); } }, 100);
  new ResizeObserver(() => { if (ready) layout(); }).observe(stage);

  // ----- pointer -----
  const pointer = { x: 0, y: 0, down: false, moved: false, sx: 0, sy: 0, t: 0 };
  let hovered = null, dragged = null, pullUntil = 0;
  function local(e) { const r = stage.getBoundingClientRect(), z = zoomOf(); return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; }
  function hit(x, y) {
    let best = null, area = Infinity;
    for (const it of items) {
      if (Math.abs(x - it.x) > it.w / 2 || Math.abs(y - it.y) > it.h / 2) continue;
      if (it.w * it.h < area) { area = it.w * it.h; best = it; }
    }
    return best;
  }
  const onText = (e) => text.contains(e.target);
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (pointer.down && Math.hypot(x - pointer.sx, y - pointer.sy) > 8) pointer.moved = true;
    pointer.x = x; pointer.y = y;
    const h = dragged || (onText(e) ? null : hit(x, y));
    if (h !== hovered) {
      if (hovered) { hovered.frame.classList.remove('on'); hovered.el.classList.remove('hot'); }
      hovered = h;
      if (hovered) { hovered.frame.classList.add('on'); hovered.el.classList.add('hot'); }
    }
    stage.style.cursor = dragged ? 'grabbing' : hovered ? 'grab' : '';
  });
  stage.addEventListener('pointerleave', () => { if (!dragged && hovered) { hovered.frame.classList.remove('on'); hovered.el.classList.remove('hot'); hovered = null; } });
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a')) return;   // links in the text work as links
    const [x, y] = local(e);
    Object.assign(pointer, { x, y, sx: x, sy: y, down: true, moved: false, t: performance.now() });
    dragged = onText(e) ? null : hit(x, y);
    if (dragged) { dragged.frame.classList.add('on', 'drag'); stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing'; e.preventDefault(); }
    pointer.onText = onText(e);
  });
  function release() {
    if (!pointer.down) return;
    pointer.down = false;
    const click = !pointer.moved && performance.now() - pointer.t < 900, target = dragged;
    if (dragged) dragged.frame.classList.remove('drag');
    dragged = null; stage.style.cursor = '';
    if (!click) return;
    if (target) findBelow(target.node);
    else if (pointer.onText) pullUntil = performance.now() + 1100;
    else jiggle();
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', () => { pointer.moved = true; release(); });

  function jiggle() {
    for (const it of items) { it.vx += rnd(-1, 1) * 420; it.vy += rnd(-1, 1) * 420; }
  }
  // Scroll to the original below; open its pile first if it is folded away; play a video.
  function findBelow(node) {
    const panel = node.closest('.stack-panel');
    if (panel && panel.hidden) document.querySelector(`.stack[aria-controls="${panel.id}"]`)?.click();
    node.loading = 'eager';
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.remove('fm-found'); void node.offsetWidth; node.classList.add('fm-found');
    if (node.tagName === 'VIDEO') { node.preload = 'auto'; node.play().catch(() => {}); }
  }

  // ----- motion: wander + spring home, bounce off each other, the text and the edges -----
  let raf = 0, last = 0, visible = true;
  function step(now) {
    raf = requestAnimationFrame(step);
    const dt = Math.min(0.033, (now - (last || now)) / 1000); last = now;
    const t = now / 1000, pulling = now < pullUntil;
    const cx = (K.x0 + K.x1) / 2, cy = (K.y0 + K.y1) / 2;
    items.forEach((it, i) => {
      if (it === dragged) {
        it.vx = (pointer.x - it.x) * 14; it.vy = (pointer.y - it.y) * 14;
      } else {
        const p = pulling ? { x: cx, y: cy } : home(i, it), k = pulling ? 5 : 0.9;
        it.vx += (Math.sin(t / 6 + it.seed) * 22 + (p.x - it.x) * k) * dt * 2;
        it.vy += (Math.cos(t / 7 + it.seed * 2) * 22 + (p.y - it.y) * k) * dt * 2;
        it.vx *= 1 - 1.2 * dt; it.vy *= 1 - 1.2 * dt;
      }
      it.x += it.vx * dt; it.y += it.vy * dt;
    });
    const bounce = 0.6;
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const ox = (a.w + b.w) / 2 + 6 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + 6 - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) {
          const s = a.x < b.x ? -1 : 1, ma = a === dragged ? 0 : b === dragged ? 1 : 0.5;
          a.x += s * ox * ma; b.x -= s * ox * (1 - ma);
          const v = (a.vx - b.vx); if (v * s < 0) { a.vx -= v * (1 + bounce) * 0.5; b.vx += v * (1 + bounce) * 0.5; }
        } else {
          const s = a.y < b.y ? -1 : 1, ma = a === dragged ? 0 : b === dragged ? 1 : 0.5;
          a.y += s * oy * ma; b.y -= s * oy * (1 - ma);
          const v = (a.vy - b.vy); if (v * s < 0) { a.vy -= v * (1 + bounce) * 0.5; b.vy += v * (1 + bounce) * 0.5; }
        }
      }
    }
    for (const it of items) {
      // the text block
      const ox = Math.min(it.x + it.w / 2 - K.x0, K.x1 - (it.x - it.w / 2)), oy = Math.min(it.y + it.h / 2 - K.y0, K.y1 - (it.y - it.h / 2));
      if (ox > 0 && oy > 0) {
        if (ox < oy) { const s = it.x < cx ? -1 : 1; it.x += s * ox; if (it.vx * s < 0) it.vx *= -bounce; }
        else { const s = it.y < cy ? -1 : 1; it.y += s * oy; if (it.vy * s < 0) it.vy *= -bounce; }
      }
      // the edges
      const hw = it.w / 2, hh = it.h / 2;
      if (it.x < hw) { it.x = hw; it.vx = Math.abs(it.vx) * bounce; } else if (it.x > W - hw) { it.x = W - hw; it.vx = -Math.abs(it.vx) * bounce; }
      if (it.y < hh) { it.y = hh; it.vy = Math.abs(it.vy) * bounce; } else if (it.y > H - hh) { it.y = H - hh; it.vy = -Math.abs(it.vy) * bounce; }
      const tilt = Math.sin(t / 5 + it.seed) * 2.2 + Math.max(-8, Math.min(8, it.vx * 0.01));
      it.el.style.transform = `translate(${(it.x - it.w / 2).toFixed(1)}px, ${(it.y - it.h / 2).toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)`;
    }
  }
  function run() {
    const want = ready && visible && !document.hidden;
    if (want && !raf) { last = 0; raf = requestAnimationFrame(step); }
    else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; run(); }).observe(stage);
  document.addEventListener('visibilitychange', run);
}
