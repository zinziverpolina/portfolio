// Floating media stages for the white project pages, in the manner of the 3D objects on the main page.
// Every section of the page becomes a full-screen stage: its text (title, subtitle, description, credit,
// links) in the middle, its videos, stills and 3D-model posters floating around it, tumbling slowly in 3D,
// in the main page's frames (screen-space boxes). The stages follow one another as you scroll.
// Hover: the frame turns navy and shows its tag. Drag: throw an item. Click on empty space or on the text:
// everything jiggles and spins. Click on an item: a card opens with the video (sound on), the still or the
// rotatable 3D model and its caption; ← → step through the section, Esc / × / a click outside closes it.
// floatMedia() — no arguments: it reads the page itself.
const MEDIA = 'img.zoom, video.clip, model-viewer[poster]';
const MAX = 14;          // items on one stage
const MAX_PLAY = 2;      // of them, videos playing as muted loops (the rest show their poster)
const PERSP = 1400;      // stage perspective (px), as .fm-stage in style.css
const TUMBLE = 18;       // degrees of the slow 3D wobble
const rnd = (a, b) => a + Math.random() * (b - a);

export function floatMedia() {
  const sections = [...document.querySelectorAll('section.slide')];
  const allMedia = [...document.querySelectorAll(`section.slide :is(${MEDIA})`)];
  if (!sections.length || !allMedia.length) return;
  document.body.classList.add('fm-page');
  document.documentElement.classList.add('fm-snap');
  const card = makeCard();
  sections.forEach((sec) => {
    const own = [...sec.querySelectorAll(MEDIA)];
    // A section without pictures of its own (LOEWE's opening) floats a mix from the whole page.
    stage(sec, own.length ? own : [...allMedia].sort(() => Math.random() - 0.5), card);
  });
  const fitAll = () => {
    const nav = document.querySelector('.topnav'), h = nav ? nav.offsetHeight : 0;
    document.querySelectorAll('.fm-stage').forEach((s) => {
      s.style.height = `calc(100svh / var(--z, 1) - ${h}px)`;
      s.style.scrollMarginTop = h + 'px';
    });
  };
  fitAll();
  addEventListener('resize', fitAll);
}

// Short caption of a media node: its alt after the dash, its pile's title, the label above its grid, or its kind.
function kindOf(node) { return node.tagName === 'VIDEO' ? 'video' : node.tagName === 'MODEL-VIEWER' ? '3d model' : 'still'; }
function captionOf(node) {
  const alt = node.getAttribute('alt');
  if (alt) return alt.includes('—') ? alt.split('—').pop().trim() : alt;
  const panel = node.closest('.stack-panel');
  const btn = panel && document.querySelector(`.stack[aria-controls="${panel.id}"] .stack-t`);
  if (btn) return btn.firstChild.textContent.trim();
  const grid = node.closest('.media'), prev = grid && grid.previousElementSibling;
  if (prev && prev.matches('.label')) return prev.textContent.trim();
  return kindOf(node);
}
function stillOf(node) { return node.tagName === 'IMG' ? node.getAttribute('src') : node.getAttribute('poster'); }

// ----- one stage -----
function stage(sec, sources, card) {
  const el = document.createElement('div');
  el.className = 'fm-stage';
  const text = document.createElement('div');
  text.className = 'fm-text';
  [...sec.children].filter((c) => c.matches('h2, .meta, .body, .credit, .subnav')).forEach((c) => text.appendChild(c));
  const frames = document.createElement('div');
  frames.className = 'fm-frames';
  el.append(text, frames);
  sec.before(el);
  sec.classList.add('fm-src');   // the old grid stays in the page (the cards read from it) but out of sight
  const title = text.querySelector('h2')?.firstChild?.textContent.trim() || '';
  const list = sources.filter((n) => stillOf(n));   // the card steps through these

  const picks = list.slice(0, MAX);
  const items = [];
  let playing = 0, ready = false;
  picks.forEach((node, i) => {
    const pre = new Image();
    pre.onload = () => {
      const play = node.tagName === 'VIDEO' && playing < MAX_PLAY;
      if (play) playing++;
      const box = document.createElement('div');
      box.className = 'fm-item';
      const media = document.createElement(play ? 'video' : 'img');
      media.className = 'fm-media';
      media.draggable = false;
      if (play) {
        Object.assign(media, { muted: true, loop: true, playsInline: true, autoplay: true, poster: stillOf(node) });
        media.setAttribute('muted', '');
        media.src = node.getAttribute('src');
      } else { media.src = stillOf(node); media.alt = ''; }
      box.appendChild(media);
      el.appendChild(box);
      const frame = document.createElement('div');
      frame.className = 'shr-frame fm-frame';
      frame.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>' +
        `<span class="num">${String(i + 1).padStart(2, '0')}.</span><span class="tag"></span>`;
      frame.querySelector('.tag').textContent = captionOf(node);
      frames.appendChild(frame);
      items.push({ el: box, media, frame, node, ar: pre.naturalWidth / pre.naturalHeight, x: 0, y: 0, vx: 0, vy: 0,
        w: 1, h: 1, spinX: 0, spinY: 0, wX: 0, wY: 0, box: null, seed: rnd(0, 100), placed: false });
      if (ready) layout();
    };
    pre.src = stillOf(node);
  });

  // ----- layout: sizes from the free area, a home cell for each item off the text -----
  let W = 1, H = 1, K = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const zoomOf = () => el.currentCSSZoom || 1;
  function textBox() {
    const sr = el.getBoundingClientRect(), r = text.getBoundingClientRect(), z = zoomOf(), pad = 18;
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
      if (sides.length) { const b = sides.sort((a, c) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(c.x - p.x, c.y - p.y))[0]; p.x = b.x; p.y = b.y; }
    }
    p.x = Math.min(Math.max(p.x, hw), W - hw); p.y = Math.min(Math.max(p.y, hh), H - hh);
    return p;
  }
  function layout() {
    W = el.clientWidth; H = el.clientHeight; K = textBox();
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
  new ResizeObserver(() => { if (ready) layout(); }).observe(el);

  // ----- pointer -----
  const pointer = { x: 0, y: 0, down: false, moved: false, sx: 0, sy: 0, t: 0 };
  let hovered = null, dragged = null;
  function local(e) { const r = el.getBoundingClientRect(), z = zoomOf(); return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; }
  function hit(x, y) {
    let best = null, area = Infinity;
    for (const it of items) {
      const b = it.box || { x0: it.x - it.w / 2, y0: it.y - it.h / 2, x1: it.x + it.w / 2, y1: it.y + it.h / 2 };
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      const a = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (a < area) { area = a; best = it; }
    }
    return best;
  }
  const onText = (e) => text.contains(e.target);
  function setHover(h) {
    if (h === hovered) return;
    if (hovered) { hovered.frame.classList.remove('on'); hovered.el.classList.remove('hot'); }
    hovered = h;
    if (hovered) { hovered.frame.classList.add('on'); hovered.el.classList.add('hot'); }
  }
  el.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (pointer.down && Math.hypot(x - pointer.sx, y - pointer.sy) > 8) pointer.moved = true;
    pointer.x = x; pointer.y = y;
    setHover(dragged || (onText(e) ? null : hit(x, y)));
    el.style.cursor = dragged ? 'grabbing' : hovered ? 'pointer' : '';
  });
  el.addEventListener('pointerleave', () => { if (!dragged) setHover(null); });
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a')) return;   // links in the text work as links
    const [x, y] = local(e);
    Object.assign(pointer, { x, y, sx: x, sy: y, down: true, moved: false, t: performance.now() });
    dragged = onText(e) ? null : hit(x, y);
    if (dragged) { dragged.frame.classList.add('on', 'drag'); el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; e.preventDefault(); }
  });
  function release() {
    if (!pointer.down) return;
    pointer.down = false;
    const click = !pointer.moved && performance.now() - pointer.t < 900, target = dragged;
    if (dragged) dragged.frame.classList.remove('drag');
    dragged = null; el.style.cursor = '';
    if (!click) return;
    if (target) card.open(list, list.indexOf(target.node), title);
    else jiggle();   // empty space and the text alike
  }
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', () => { pointer.moved = true; release(); });
  function jiggle() {
    for (const it of items) {
      it.vx += rnd(-1, 1) * 420; it.vy += rnd(-1, 1) * 420;
      it.wX += rnd(-1, 1) * 420; it.wY += rnd(-1, 1) * 560;   // a spin (deg/s) that springs back
    }
  }

  // ----- motion: wander + spring home, bounce off each other, the text and the edges; slow 3D tumble -----
  let raf = 0, last = 0, visible = false;
  function step(now) {
    raf = requestAnimationFrame(step);
    const dt = Math.min(0.033, (now - (last || now)) / 1000); last = now;
    const t = now / 1000, kx = (K.x0 + K.x1) / 2, ky = (K.y0 + K.y1) / 2, bounce = 0.6;
    items.forEach((it, i) => {
      if (it === dragged) { it.vx = (pointer.x - it.x) * 14; it.vy = (pointer.y - it.y) * 14; }
      else {
        const p = home(i, it);
        it.vx += (Math.sin(t / 6 + it.seed) * 22 + (p.x - it.x) * 0.9) * dt * 2;
        it.vy += (Math.cos(t / 7 + it.seed * 2) * 22 + (p.y - it.y) * 0.9) * dt * 2;
        it.vx *= 1 - 1.2 * dt; it.vy *= 1 - 1.2 * dt;
      }
      it.x += it.vx * dt; it.y += it.vy * dt;
    });
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const ox = (a.w + b.w) / 2 + 6 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + 6 - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        const ma = a === dragged ? 0 : b === dragged ? 1 : 0.5;
        if (ox < oy) {
          const s = a.x < b.x ? -1 : 1; a.x += s * ox * ma; b.x -= s * ox * (1 - ma);
          const v = a.vx - b.vx; if (v * s < 0) { a.vx -= v * (1 + bounce) * 0.5; b.vx += v * (1 + bounce) * 0.5; }
        } else {
          const s = a.y < b.y ? -1 : 1; a.y += s * oy * ma; b.y -= s * oy * (1 - ma);
          const v = a.vy - b.vy; if (v * s < 0) { a.vy -= v * (1 + bounce) * 0.5; b.vy += v * (1 + bounce) * 0.5; }
        }
      }
    }
    for (const it of items) {
      // the text block
      const tx = Math.min(it.x + it.w / 2 - K.x0, K.x1 - (it.x - it.w / 2)), ty = Math.min(it.y + it.h / 2 - K.y0, K.y1 - (it.y - it.h / 2));
      if (tx > 0 && ty > 0) {
        if (tx < ty) { const s = it.x < kx ? -1 : 1; it.x += s * tx; if (it.vx * s < 0) it.vx *= -bounce; }
        else { const s = it.y < ky ? -1 : 1; it.y += s * ty; if (it.vy * s < 0) it.vy *= -bounce; }
      }
      // the edges
      const hw = it.w / 2, hh = it.h / 2;
      if (it.x < hw) { it.x = hw; it.vx = Math.abs(it.vx) * bounce; } else if (it.x > W - hw) { it.x = W - hw; it.vx = -Math.abs(it.vx) * bounce; }
      if (it.y < hh) { it.y = hh; it.vy = Math.abs(it.vy) * bounce; } else if (it.y > H - hh) { it.y = H - hh; it.vy = -Math.abs(it.vy) * bounce; }
      draw(it, t, dt);
    }
  }
  // Slow tumble in 3D: an own wobble per item, plus a spin from jiggles that springs back; then the frame
  // as the screen box of the turned item (same maths as the CSS perspective from the stage centre).
  function draw(it, t, dt) {
    it.wX += -it.spinX * 9 * dt; it.wY += -it.spinY * 9 * dt;
    it.wX *= 1 - 2.2 * dt; it.wY *= 1 - 2.2 * dt;
    it.spinX += it.wX * dt; it.spinY += it.wY * dt;
    const rx = Math.sin(t / 4.3 + it.seed) * TUMBLE * 0.7 + it.spinX;
    const ry = Math.sin(t / 3.7 + it.seed * 1.7) * TUMBLE + it.spinY;
    const rz = Math.sin(t / 5 + it.seed) * 2.2 + Math.max(-8, Math.min(8, it.vx * 0.01));
    const tz = Math.sin(t / 6.1 + it.seed * 2.3) * 70;
    it.el.style.transform = `translate3d(${(it.x - it.w / 2).toFixed(1)}px, ${(it.y - it.h / 2).toFixed(1)}px, ${tz.toFixed(1)}px) ` +
      `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
    const d = Math.PI / 180, cX = Math.cos(rx * d), sX = Math.sin(rx * d), cY = Math.cos(ry * d), sY = Math.sin(ry * d), cZ = Math.cos(rz * d), sZ = Math.sin(rz * d);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // rotateX · rotateY · rotateZ on the corner (CSS order: the rightmost acts first)
      let px = u * it.w / 2, py = v * it.h / 2, pz = 0;
      [px, py] = [px * cZ - py * sZ, px * sZ + py * cZ];
      [px, pz] = [px * cY + pz * sY, -px * sY + pz * cY];
      [py, pz] = [py * cX - pz * sX, py * sX + pz * cX];
      const k = PERSP / (PERSP - (pz + tz));
      const sx = W / 2 + (it.x + px - W / 2) * k, sy = H / 2 + (it.y + py - H / 2) * k;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    it.box = { x0, y0, x1, y1 };
    const f = it.frame.style, pad = 7;
    f.transform = `translate(${(x0 - pad).toFixed(1)}px, ${(y0 - pad).toFixed(1)}px)`;
    f.width = (x1 - x0 + pad * 2).toFixed(1) + 'px'; f.height = (y1 - y0 + pad * 2).toFixed(1) + 'px';
  }
  function run() {
    const want = ready && visible && !document.hidden;
    if (want && !raf) { last = 0; raf = requestAnimationFrame(step); }
    else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    // loops play only while their stage is on screen
    items.forEach((it) => { if (it.media.tagName === 'VIDEO') { if (want) it.media.play().catch(() => {}); else it.media.pause(); } });
  }
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; run(); }).observe(el);
  document.addEventListener('visibilitychange', run);
}

// ----- the card: one for the page -----
function makeCard() {
  const root = document.createElement('div');
  root.className = 'fm-card';
  root.hidden = true;
  root.innerHTML = `
    <div class="fm-card-box" role="dialog" aria-modal="true" aria-label="Work">
      <button class="fm-card-x" type="button" aria-label="Close">×</button>
      <div class="fm-card-media"></div>
      <div class="fm-card-info">
        <div class="fm-card-t"></div>
        <div class="fm-card-c"></div>
        <div class="fm-card-nav"><button type="button" class="prev">← prev</button><span class="n"></span><button type="button" class="next">next →</button></div>
      </div>
    </div>`;
  document.body.appendChild(root);
  const box = root.querySelector('.fm-card-box'), mediaBox = root.querySelector('.fm-card-media');
  let list = [], i = 0, title = '';
  function show() {
    const node = list[i];
    mediaBox.innerHTML = '';
    let m;
    if (node.tagName === 'VIDEO') {
      m = document.createElement('video');
      Object.assign(m, { src: node.getAttribute('src'), poster: node.getAttribute('poster'), controls: true, loop: true, playsInline: true });
      m.play().catch(() => { m.muted = true; m.play().catch(() => {}); });
      // A video has no size until it loads: fit its poster's proportions into the card right away.
      const pre = new Image(), video = m;
      pre.onload = () => {
        const z = document.documentElement.currentCSSZoom || 1, ar = pre.naturalWidth / pre.naturalHeight;
        const maxW = Math.min(innerWidth / z - 84, 1064), maxH = innerHeight / z - 190;
        const w = Math.min(maxW, maxH * ar);
        video.style.width = w + 'px'; video.style.height = w / ar + 'px';
      };
      pre.src = node.getAttribute('poster');
    } else if (node.tagName === 'MODEL-VIEWER') {
      m = document.createElement('model-viewer');
      ['src', 'poster', 'alt', 'camera-orbit', 'field-of-view'].forEach((a) => node.hasAttribute(a) && m.setAttribute(a, node.getAttribute(a)));
      m.setAttribute('camera-controls', ''); m.setAttribute('auto-rotate', ''); m.setAttribute('touch-action', 'pan-y');
    } else {
      m = document.createElement('img');
      m.src = node.getAttribute('src'); m.alt = node.getAttribute('alt') || '';
    }
    m.className = 'fm-card-m';
    mediaBox.appendChild(m);
    root.querySelector('.fm-card-t').textContent = title;
    const cap = captionOf(node), kind = kindOf(node);
    root.querySelector('.fm-card-c').textContent = cap === kind ? kind : `${cap} · ${kind}`;
    root.querySelector('.n').textContent = `${i + 1} / ${list.length}`;
    root.querySelector('.fm-card-nav').hidden = list.length < 2;
  }
  const step = (d) => { i = (i + d + list.length) % list.length; show(); };
  function close() {
    root.hidden = true; mediaBox.innerHTML = '';
    document.removeEventListener('keydown', key);
  }
  function key(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  }
  root.addEventListener('click', (e) => { if (!box.contains(e.target) || e.target.closest('.fm-card-x')) close(); });
  root.querySelector('.prev').addEventListener('click', () => step(-1));
  root.querySelector('.next').addEventListener('click', () => step(1));
  return {
    open(l, at, t) {
      list = l; i = Math.max(0, at); title = t;
      root.hidden = false; show();
      document.addEventListener('keydown', key);
      root.querySelector('.fm-card-x').focus({ preventScroll: true });
    },
  };
}
