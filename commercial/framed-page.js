// Static project page in frames (Nina Ricci, 8 Oct): the text block and every video sit in the main page's
// frames (thin line + small squares, navy on hover); each folded pile (.stacks) becomes a strip of three small
// framed pictures with arrows, laid out side by side under the video row; a click on a picture opens the card
// (video with sound / still, prev–next) from float-media.js.
import { makeCard, splitYear } from './float-media.js?v=12';

const HANDLES = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';

function frame(el, cls = '') {
  const box = document.createElement('div');
  box.className = 'sf-frm ' + cls;
  el.before(box);
  box.appendChild(el);
  const f = document.createElement('div');
  f.className = 'shr-frame sf-f';
  f.innerHTML = HANDLES;
  box.appendChild(f);
  return box;
}

export function framedPage() {
  const sec = document.querySelector('section.slide');
  if (!sec) return;
  document.body.classList.add('sf-page');
  const card = makeCard();
  const title = sec.querySelector('h2')?.firstChild?.textContent.trim() || '';

  // the text block
  const parts = [...sec.children].filter((c) => c.matches('h2, .meta, .body, .credit'));
  if (parts.length) {
    const tb = document.createElement('div');
    tb.className = 'sf-text';
    parts[0].before(tb);
    tb.append(...parts);
    splitYear(tb.querySelector('.meta'));
    frame(tb, 'sf-frm-text');
  }

  // the videos (and stills) shown on the page
  sec.querySelectorAll('.media video.clip, .media img.zoom').forEach((m) => {
    if (!m.closest('.stack-panel')) frame(m);
  });

  // piles → strips of three with arrows
  const stacks = sec.querySelector('.stacks');
  if (!stacks) return;
  const row = document.createElement('div');
  row.className = 'sf-strips';
  stacks.before(row);
  stacks.querySelectorAll('.stack[aria-controls]').forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    const nodes = [...panel.querySelectorAll('video.clip, img.zoom')];
    const head = btn.querySelector('.stack-t');
    const name = head?.firstChild?.textContent.trim() || '';
    const count = head?.querySelector('i')?.textContent.trim() || '';
    const strip = document.createElement('div');
    strip.className = 'sf-strip';
    strip.innerHTML = `<p class="sf-strip-h"><span></span><i></i></p>
      <div class="sf-strip-row"><button type="button" class="sf-arrow prev" aria-label="Previous">←</button><div class="sf-track"></div><button type="button" class="sf-arrow next" aria-label="Next">→</button></div>`;
    strip.querySelector('.sf-strip-h span').textContent = name;
    strip.querySelector('.sf-strip-h i').textContent = count;
    const track = strip.querySelector('.sf-track');
    nodes.forEach((n, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sf-th' + (n.tagName === 'VIDEO' ? ' is-video' : '');
      b.setAttribute('aria-label', (n.getAttribute('alt') || name) + ' — open');
      const img = document.createElement('img');
      img.src = n.tagName === 'VIDEO' ? n.getAttribute('poster') : n.getAttribute('src');
      img.alt = ''; img.loading = 'lazy';
      b.appendChild(img);
      track.appendChild(b);
      frame(b, 'sf-frm-th');
      b.addEventListener('click', () => card.open(nodes, i, title));
    });
    const step = (d) => {
      const th = track.querySelector('.sf-frm-th');
      const w = th ? th.getBoundingClientRect().width / (track.currentCSSZoom || 1) + 14 : track.clientWidth / 3;
      track.scrollBy({ left: d * w, behavior: 'smooth' });
    };
    strip.querySelector('.prev').addEventListener('click', () => step(-1));
    strip.querySelector('.next').addEventListener('click', () => step(1));
    const ends = () => {
      strip.querySelector('.prev').disabled = track.scrollLeft < 4;
      strip.querySelector('.next').disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4;
    };
    track.addEventListener('scroll', ends, { passive: true });
    addEventListener('resize', ends);
    setTimeout(ends, 300);
    row.appendChild(strip);
    panel.hidden = true;
  });
  stacks.remove();
}
