// Project page layout (9 Oct, after the TWKS reference): every section opens with a text head — title, a
// paler tagline, a thin rule, meta columns on the left and the text on the right (Instrument Sans).
// Sections written by hand keep their own .tw-head; the others get one built from their h2 / .meta / .body /
// .credit / .subnav. Pictures and videos have no frames. Format labels ("Vertical versions, 9:16") go;
// folded piles and the "Stills" grid become folds ("More videos", "Stills"),
// one under the other; a click opens them in their usual grid.

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
  // the same columns on every page: Role (as in the project menu) | Credits, Year
  const col = el('dl', 'tw-meta'), col2 = el('dl', 'tw-meta');
  const role = document.querySelector('.dd-panel .projects li.on .w');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (role) col.innerHTML += `<dt>Role</dt><dd>${role.textContent.split(/,\s*/).map(cap).join('<br>')}</dd>`;
  if (credit) col2.innerHTML += `<dt>Credits</dt><dd>${cap(credit.innerHTML)}</dd>`;
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

// A fold: a thin rule with the name and the count; a click opens the pictures below it in their usual grid.
function fold(name, media) {
  const nodes = [...media.querySelectorAll('video.clip, img.zoom')];
  const kind = nodes.every((n) => n.tagName === 'VIDEO') ? 'videos' : 'images';
  const d = el('details', 'tw-fold');
  d.innerHTML = '<summary><span></span><b aria-hidden="true">↓</b><i></i></summary>';
  d.querySelector('summary span').textContent = name;
  d.querySelector('summary i').textContent = `${nodes.length} ${nodes.length === 1 ? kind.slice(0, -1) : kind}`;
  media.hidden = false;
  d.appendChild(media);
  return d;
}

export function twPage() {
  document.body.classList.add('tw-page');
  document.querySelectorAll('section.slide').forEach((sec) => {
    if (!sec.querySelector(':scope > .tw-head')) buildHead(sec);
    // format labels go
    sec.querySelectorAll(':scope > .label').forEach((l) => { if (FORMAT_LABEL.test(l.textContent)) l.remove(); });
    const folds = [];
    // folded piles → folds
    const stacks = sec.querySelector(':scope > .stacks');
    if (stacks) {
      stacks.querySelectorAll('.stack[aria-controls]').forEach((btn) => {
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        const media = panel && panel.querySelector('.media');
        if (!media) return;
        const nodes = [...media.querySelectorAll('video.clip, img.zoom')];
        if (!nodes.length) return;
        folds.push(fold(nodes.every((n) => n.tagName === 'VIDEO') ? 'More videos' : 'Stills', media));
        panel.remove();
      });
    }
    // a grid of stills under a "Stills" label → fold
    sec.querySelectorAll(':scope > .label').forEach((l) => {
      const grid = l.nextElementSibling;
      if (!/^\s*stills\s*$/i.test(l.textContent) || !grid || !grid.matches('.media')) return;
      if (!grid.querySelector('img.zoom')) return;
      l.remove();
      folds.push(fold('Stills', grid));
    });
    if (folds.length) {
      const box = el('div', 'tw-folds');
      box.append(...folds.sort((a, b) => (a.textContent.startsWith('More videos') ? -1 : 1)));
      if (stacks) stacks.replaceWith(box); else sec.appendChild(box);
    }
  });
}
