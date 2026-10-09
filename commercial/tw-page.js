// Project page layout (9 Oct, after the TWKS reference): every section opens with a text head — title, a
// paler tagline, a thin rule, meta columns on the left and the text on the right (Instrument Sans).
// Sections written by hand keep their own .tw-head; the others get one built from their h2 / .meta / .body /
// .credit / .subnav. Pictures and videos have no frames. Format labels ("Vertical versions, 9:16") go;
// folded piles and the "Stills" grid become strips of small pictures with arrows ("More videos", "Stills"),
// side by side on one line; a click opens the card (float-media.js).
import { makeCard } from './float-media.js?v=12';

const FORMAT_LABEL = /^\s*(vertical|horizontal|square)\s+versions?\b/i;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

// "subtitle<br>2022" → ["subtitle", "2022"]
function splitMeta(meta) {
  if (!meta) return ['', ''];
  const parts = meta.innerHTML.split(/<br\s*\/?>/i).map((s) => s.trim());
  const yearAt = parts.findIndex((p) => /^\d{4}(\s*[–-]\s*\d{4})?$/.test(p.replace(/<[^>]+>/g, '')));
  const year = yearAt >= 0 ? parts.splice(yearAt, 1)[0] : '';
  return [parts.join(' '), year];
}

function buildHead(sec) {
  const h2 = sec.querySelector(':scope > h2');
  if (!h2) return;
  const meta = sec.querySelector(':scope > .meta'), body = sec.querySelector(':scope > .body');
  const credit = sec.querySelector(':scope > .credit'), subnav = sec.querySelector(':scope > .subnav');
  const [tag, year] = splitMeta(meta);
  const head = el('div', 'tw-head');
  const title = el('div', 'tw-title');
  title.appendChild(h2);
  if (tag) title.appendChild(el('p', 'tw-tag', tag));   // the page's own subtitle, as written
  head.appendChild(title);
  const grid = el('div', 'tw-grid');
  // first column: role / credits; second column: the year at its foot (as on every page)
  const col = el('dl', 'tw-meta'), col2 = el('dl', 'tw-meta');
  if (credit) col.innerHTML += `<dt>Credits</dt><dd>${credit.innerHTML.charAt(0).toUpperCase() + credit.innerHTML.slice(1)}</dd>`;
  if (year) col2.innerHTML += `<dt>Year</dt><dd>${year}</dd>`;
  grid.appendChild(col);
  grid.appendChild(col2);
  const text = el('div', 'tw-text');
  if (body) text.append(...body.childNodes);
  if (subnav) text.appendChild(subnav);
  grid.appendChild(text);
  head.appendChild(grid);
  sec.insertBefore(head, sec.firstChild);
  [meta, body, credit].forEach((n) => n && n.remove());
}

function strip(name, nodes, card, title) {
  const kind = nodes.every((n) => n.tagName === 'VIDEO') ? 'videos' : 'images';
  const s = el('div', 'sf-strip');
  s.innerHTML = `<p class="sf-strip-h"><span></span><i>${nodes.length} ${nodes.length === 1 ? kind.slice(0, -1) : kind}</i></p>
    <div class="sf-strip-row"><button type="button" class="sf-arrow prev" aria-label="Previous">←</button><div class="sf-track"></div><button type="button" class="sf-arrow next" aria-label="Next">→</button></div>`;
  s.querySelector('.sf-strip-h span').textContent = name;
  const track = s.querySelector('.sf-track');
  nodes.forEach((n, i) => {
    const b = el('button', 'sf-th' + (n.tagName === 'VIDEO' ? ' is-video' : ''));
    b.type = 'button';
    b.setAttribute('aria-label', (n.getAttribute('alt') || name) + ' — open');
    const img = el('img');
    img.src = n.tagName === 'VIDEO' ? n.getAttribute('poster') : n.getAttribute('src');
    img.alt = ''; img.decoding = 'async';   // eager: in a sideways strip lazy images never get a width
    b.appendChild(img);
    track.appendChild(b);
    b.addEventListener('click', () => card.open(nodes, i, title));
  });
  const prev = s.querySelector('.prev'), next = s.querySelector('.next');
  const step = (d) => track.scrollBy({ left: d * track.clientWidth * 0.7, behavior: 'smooth' });
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const ends = () => {
    prev.disabled = track.scrollLeft < 4;
    next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4;
  };
  track.addEventListener('scroll', ends, { passive: true });
  addEventListener('resize', ends);
  track.querySelectorAll('img').forEach((im) => im.addEventListener('load', ends));
  setTimeout(ends, 400);
  return s;
}

export function twPage() {
  document.body.classList.add('tw-page');
  const card = makeCard();
  document.querySelectorAll('section.slide').forEach((sec) => {
    if (!sec.querySelector(':scope > .tw-head')) buildHead(sec);
    const title = sec.querySelector('h2')?.firstChild?.textContent.trim() || '';
    // format labels go
    sec.querySelectorAll(':scope > .label').forEach((l) => { if (FORMAT_LABEL.test(l.textContent)) l.remove(); });
    const strips = [];
    // folded piles → strips
    const stacks = sec.querySelector(':scope > .stacks');
    if (stacks) {
      stacks.querySelectorAll('.stack[aria-controls]').forEach((btn) => {
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        if (!panel) return;
        const nodes = [...panel.querySelectorAll('video.clip, img.zoom')];
        if (!nodes.length) return;
        const isVideo = nodes.every((n) => n.tagName === 'VIDEO');
        strips.push(strip(isVideo ? 'More videos' : 'Stills', nodes, card, title));
        panel.hidden = true;
      });
    }
    // a grid of stills under a "Stills" label → strip
    sec.querySelectorAll(':scope > .label').forEach((l) => {
      const grid = l.nextElementSibling;
      if (!/^\s*stills\s*$/i.test(l.textContent) || !grid || !grid.matches('.media')) return;
      const nodes = [...grid.querySelectorAll('img.zoom')];
      if (!nodes.length) return;
      strips.push(strip('Stills', nodes, card, title));
      l.remove(); grid.hidden = true;
    });
    if (strips.length) {
      const row = el('div', 'sf-strips');
      (stacks || sec.lastElementChild).after(row);
      if (!stacks) sec.appendChild(row);
      row.append(...strips.sort((a, b) => (a.textContent.startsWith('More videos') ? -1 : 1)));
      stacks && stacks.remove();
    }
  });
}
