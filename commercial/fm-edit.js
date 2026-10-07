// Edit mode for the floating stages (open any white project page with ?edit).
// Everything stands still. Drag a picture to move it, drag its lower-right corner to resize it; in the panel
// fix its width, let it float or keep it put, hide it. Click a line of the text (title, subtitle, description,
// credit, links) to choose its font, size, weight, case, spacing and colour; drag the text to move the block.
// Every change is kept in this browser at once; "Copy for Claude" puts the whole layout on the clipboard to
// paste into the chat, and Claude bakes it into commercial/layout.json for everyone.

const PART_NAMES = { h2: 'Title', '.meta': 'Subtitle', '.fm-year': 'Year', '.body': 'Description', '.credit': 'Credit', '.subnav': 'Links' };
const fontList = (GOOGLE_FONTS) => [
  ['', 'as it is'],
  ['Arial, Arimo, Helvetica, sans-serif', 'Arial — site sans'],
  ['"Times New Roman", Times, Tinos, serif', 'Times — site serif'],
  ['"Helvetica Neue", Helvetica, Arial, sans-serif', 'Helvetica Neue'],
  ['Georgia, serif', 'Georgia'],
  ['"Courier New", monospace', 'Courier New'],
  ...Object.keys(GOOGLE_FONTS).map((f) => [`"${f}", ${/Mono/.test(f) ? 'monospace' : /Serif|Playfair|Fraunces|Bodoni|Cormorant|Italiana/.test(f) ? 'serif' : 'sans-serif'}`, f]),
];
const COLORS = [['#2a27a6', 'navy'], ['#5d8ab6', 'sky'], ['#111111', 'black'], ['#999999', 'grey'], ['#ffffff', 'white']];

export function startEditor({ apis, saved, page, TEXT_PARTS, GOOGLE_FONTS, ensureFont }) {
  const FONTS = fontList(GOOGLE_FONTS);
  document.body.classList.add('fm-editing');
  document.documentElement.classList.remove('fm-snap');
  const pageCfg = saved[page];
  let sel = null;   // { api, it } or { api, part }

  // ----- panel -----
  const panel = document.createElement('aside');
  panel.className = 'fm-ed';
  panel.innerHTML = `
    <div class="fm-ed-h"><b>EDIT MODE</b><button type="button" class="fm-ed-min" title="Fold the panel">–</button></div>
    <div class="fm-ed-in">
      <p class="fm-ed-hint">Drag a picture to move it, its lower-right corner to resize it. Click a line of text to style it, drag the text to move it.</p>
      <div class="fm-ed-sel"><p class="fm-ed-none">Nothing selected.</p></div>
      <div class="fm-ed-act">
        <button type="button" data-a="copy" class="main">Copy for Claude</button>
        <button type="button" data-a="reset">Reset this page</button>
        <button type="button" data-a="exit">Exit edit mode</button>
      </div>
      <p class="fm-ed-status">Changes are kept in this browser as you go.</p>
      <textarea class="fm-ed-out" hidden readonly></textarea>
    </div>`;
  document.body.appendChild(panel);
  const selBox = panel.querySelector('.fm-ed-sel'), status = panel.querySelector('.fm-ed-status');
  panel.querySelector('.fm-ed-min').addEventListener('click', () => panel.classList.toggle('min'));
  const say = (t) => { status.textContent = t; };

  let tSave = 0;
  function save() {
    clearTimeout(tSave);
    tSave = setTimeout(() => {
      try { localStorage.setItem('fm-layout', JSON.stringify(saved)); say('Saved in this browser. When ready: Copy for Claude.'); }
      catch (e) { say('This browser does not let the page save. Use Copy for Claude before leaving.'); }
    }, 250);
  }

  panel.querySelector('.fm-ed-act').addEventListener('click', async (e) => {
    const a = e.target.dataset.a;
    if (a === 'copy') {
      const json = JSON.stringify(clean(saved), null, 1);
      try { await navigator.clipboard.writeText(json); say('Copied. Paste it into the chat with Claude.'); }
      catch (err) {
        const out = panel.querySelector('.fm-ed-out');
        out.hidden = false; out.value = json; out.focus(); out.select();
        say('Copy the selected text below and paste it into the chat with Claude.');
      }
    } else if (a === 'reset') {
      if (panel.dataset.confirm !== 'reset') { panel.dataset.confirm = 'reset'; say('Press "Reset this page" once more to drop all its changes.'); return; }
      delete saved[page];
      try { localStorage.setItem('fm-layout', JSON.stringify(saved)); } catch (err) { /* ignore */ }
      location.reload();
    } else if (a === 'exit') {
      const u = new URL(location.href); u.searchParams.delete('edit'); location.href = u.toString();
    }
    if (a !== 'reset') delete panel.dataset.confirm;
  });

  // ----- selection panels -----
  const itemCfg = (api, it) => { api.scfg.items ||= {}; return (api.scfg.items[it.key] ||= {}); };
  const textCfg = (api) => (api.scfg.text ||= {});
  function partCfg(api, part) { const t = textCfg(api); t.styles ||= {}; return (t.styles[part] ||= {}); }

  function select(next) {
    document.querySelectorAll('.fm-sel').forEach((n) => n.classList.remove('fm-sel'));
    sel = next;
    if (!sel) { selBox.innerHTML = '<p class="fm-ed-none">Nothing selected.</p>'; return; }
    if (sel.it) { sel.it.frame.classList.add('fm-sel'); itemPanel(sel.api, sel.it); }
    else { textEl(sel.api, sel.part)?.classList.add('fm-sel'); textPanel(sel.api, sel.part); }
  }

  function itemPanel(api, it) {
    const { W } = api.size(), o = (api.scfg.items || {})[it.key] || {};
    const pct = ((o.w || it.w / W) * 100).toFixed(1);
    selBox.innerHTML = `
      <p class="fm-ed-t">${esc(api.title)} · picture</p>
      <label>Width, % of the screen <span><input type="range" min="4" max="70" step="0.5" value="${pct}" data-k="w"><input type="number" min="4" max="70" step="0.5" value="${pct}" data-k="w"></span></label>
      <label class="chk"><input type="checkbox" data-k="pin" ${o.pin ? 'checked' : ''}> stays put (does not float)</label>
      <label class="chk"><input type="checkbox" data-k="hide" ${o.hide ? 'checked' : ''}> hide on this screen</label>
      <button type="button" data-k="reset">Reset this picture</button>`;
    selBox.oninput = selBox.onchange = (e) => {
      const k = e.target.dataset.k, c = itemCfg(api, it);
      if (k === 'w') {
        c.w = Math.max(0.04, +e.target.value / 100);
        selBox.querySelectorAll('[data-k="w"]').forEach((n) => { if (n !== e.target) n.value = e.target.value; });
        if (c.x == null) { const { W: w, H } = api.size(); c.x = it.x / w; c.y = it.y / H; }
      } else if (k === 'pin') c.pin = e.target.checked;
      else if (k === 'hide') { c.hide = e.target.checked; it.el.hidden = it.frame.hidden = c.hide; }
      api.layout(); save();
    };
    selBox.onclick = (e) => {
      if (e.target.dataset.k !== 'reset') return;
      delete api.scfg.items[it.key]; it.el.hidden = it.frame.hidden = false;
      api.layout(); save(); select({ api, it });
    };
  }

  function textPanel(api, part) {
    const css = ((textCfg(api).styles || {})[part]) || {};
    const el = textEl(api, part), cs = getComputedStyle(el), t = textCfg(api);
    const fontOpts = FONTS.map(([v, n]) => `<option value='${v}' ${v === (css.fontFamily || '') ? 'selected' : ''}>${n}</option>`).join('');
    const num = (v) => parseFloat(v) || 0;
    const size = num(css.fontSize || cs.fontSize);
    const ls = css.letterSpacing ? num(css.letterSpacing) : +(num(cs.letterSpacing) / size || 0).toFixed(3);
    const lh = css.lineHeight ? num(css.lineHeight) : +(num(cs.lineHeight) / size || 1.2).toFixed(2);
    // the links line is a row of links: its alignment is where the row sits
    const curAlign = part === '.subnav' ? ({ 'flex-start': 'left', 'flex-end': 'right', 'center': 'center' }[css.justifyContent || cs.justifyContent] || 'center') : (css.textAlign || cs.textAlign);
    const width = ((t.width || api.text.getBoundingClientRect().width / api.zoomOf() / api.size().W) * 100).toFixed(0);
    selBox.innerHTML = `
      <p class="fm-ed-t">${esc(api.title)} · ${PART_NAMES[part]}</p>
      <label>Font <select data-k="fontFamily">${fontOpts}</select></label>
      <label>Size, px <span><input type="range" min="8" max="160" step="1" value="${size}" data-k="fontSize"><input type="number" min="6" max="300" step="1" value="${size}" data-k="fontSize"></span></label>
      <label>Weight <select data-k="fontWeight">${[300, 400, 500, 600, 700, 800, 900].map((w) => `<option ${String(w) === String(css.fontWeight || cs.fontWeight) ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <label>Style <select data-k="fontStyle">${['normal', 'italic'].map((v) => `<option ${v === (css.fontStyle || cs.fontStyle) ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Alignment <span class="al">${[['left', '⇤ left'], ['center', 'centre'], ['right', 'right ⇥'], ['justify', 'justify']].map(([v, n]) => `<button type="button" data-al="${v}" class="${v === curAlign ? 'on' : ''}">${n}</button>`).join('')}</span></label>
      <label>Case <select data-k="textTransform">${[['none', 'as written'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase'], ['capitalize', 'Capitalised']].map(([v, n]) => `<option value="${v}" ${v === (css.textTransform || cs.textTransform) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Letter spacing, em <span><input type="range" min="-0.1" max="0.4" step="0.005" value="${ls}" data-k="letterSpacing"><input type="number" min="-0.2" max="1" step="0.005" value="${ls}" data-k="letterSpacing"></span></label>
      <label>Line height <span><input type="range" min="0.7" max="2.4" step="0.05" value="${lh}" data-k="lineHeight"><input type="number" min="0.5" max="3" step="0.05" value="${lh}" data-k="lineHeight"></span></label>
      <label>Colour <span class="sw">${COLORS.map(([c, n]) => `<button type="button" data-c="${c}" title="${n}" style="background:${c}"></button>`).join('')}<input type="color" value="${toHex(css.color || cs.color)}" data-k="color"></span></label>
      <label>Text block width, % of the screen <span><input type="range" min="15" max="95" step="1" value="${width}" data-k="width"><input type="number" min="10" max="100" step="1" value="${width}" data-k="width"></span></label>
      <div class="row"><button type="button" data-k="reset">Reset this line</button><button type="button" data-k="center">Centre the text</button></div>`;
    const set = (k, v) => {
      if (k === 'width') { t.width = Math.max(0.1, v / 100); api.text.style.width = t.width * 100 + '%'; }
      else {
        const c = partCfg(api, part);
        if (v === '' || v == null) delete c[k];
        else c[k] = k === 'fontSize' ? v + 'px' : k === 'letterSpacing' ? v + 'em' : String(v);
        if (k === 'fontFamily' && v) ensureFont(v);
        api.applyText();
      }
      api.layout(); save();
    };
    selBox.oninput = selBox.onchange = (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      selBox.querySelectorAll(`[data-k="${k}"]`).forEach((n) => { if (n !== e.target && n.type !== 'color') n.value = e.target.value; });
      set(k, e.target.value);
    };
    selBox.onclick = (e) => {
      const c = e.target.dataset.c, k = e.target.dataset.k, al = e.target.dataset.al;
      if (c) { set('color', c); return; }
      if (al) {
        if (part === '.subnav') set('justifyContent', { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'space-between' }[al]);
        else set('textAlign', al);
        selBox.querySelectorAll('[data-al]').forEach((b) => b.classList.toggle('on', b.dataset.al === al));
        return;
      }
      if (k === 'reset') { delete (textCfg(api).styles || {})[part]; api.applyText(); api.layout(); save(); select({ api, part }); }
      if (k === 'center') { t.dx = 0; t.dy = 0; api.applyText(); api.layout(); save(); }
    };
  }

  // ----- direct manipulation on each stage -----
  const textEl = (api, part) => (part === '.fm-year' ? api.text.querySelector('.fm-year') : api.text.querySelector(`:scope > ${part}`));
  const partOf = (api, target) => TEXT_PARTS.find((p) => textEl(api, p)?.contains(target));
  for (const api of apis) {
    const el = api.el;
    for (const it of api.items) if (((api.scfg.items || {})[it.key] || {}).hide) it.el.hidden = it.frame.hidden = true;
    let drag = null;
    const corner = (it, x, y) => it.box && x > it.box.x1 - 18 && y > it.box.y1 - 18 && x < it.box.x1 + 10 && y < it.box.y1 + 10;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a')) e.preventDefault();
      const [x, y] = api.local(e), { W, H } = api.size();
      const part = partOf(api, e.target);
      if (part) {
        const t = textCfg(api);
        drag = { kind: 'text', sx: x, sy: y, dx: t.dx || 0, dy: t.dy || 0 };
        select({ api, part });
      } else {
        const it = api.items.filter((i) => !i.el.hidden).find((i) => corner(i, x, y)) || api.hit(x, y);
        if (!it || it.el.hidden) { select(null); return; }
        const c = itemCfg(api, it);
        if (c.w == null) c.w = it.w / W;
        if (c.x == null) { c.x = it.x / W; c.y = it.y / H; }
        drag = corner(it, x, y) ? { kind: 'size', it, sx: x, w0: c.w * W } : { kind: 'move', it, ox: x - c.x * W, oy: y - c.y * H };
        select({ api, it });
      }
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      const [x, y] = api.local(e), { W, H } = api.size();
      if (!drag) {
        const it = api.items.find((i) => !i.el.hidden && corner(i, x, y));
        el.style.cursor = it ? 'nwse-resize' : partOf(api, e.target) ? 'move' : api.hit(x, y) ? 'move' : '';
        return;
      }
      if (drag.kind === 'text') {
        const t = textCfg(api);
        t.dx = drag.dx + (x - drag.sx) / W; t.dy = drag.dy + (y - drag.sy) / H;
        api.applyText();
      } else if (drag.kind === 'move') {
        const c = itemCfg(api, drag.it);
        c.x = (x - drag.ox) / W; c.y = (y - drag.oy) / H;
      } else {
        const c = itemCfg(api, drag.it);
        c.w = Math.max(30, drag.w0 + (x - drag.sx) * 2) / W;
        if (sel && sel.it === drag.it) { const v = (c.w * 100).toFixed(1); selBox.querySelectorAll('[data-k="w"]').forEach((n) => { n.value = v; }); }
      }
      api.layout(); save();
    });
    const end = () => { if (drag) { drag = null; api.layout(); save(); } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); }, true);   // links do not navigate while editing
  }
  say(Object.keys(pageCfg?.stages || {}).some((k) => Object.keys(pageCfg.stages[k]).length) ? 'This page already has hand-made changes. Changes are kept in this browser as you go.' : 'Changes are kept in this browser as you go.');
}

// Only what was actually set, for the clipboard.
function clean(o) {
  if (!o || typeof o !== 'object') return o;
  const out = Array.isArray(o) ? [] : {};
  for (const [k, v] of Object.entries(o)) {
    const c = clean(v);
    if (c && typeof c === 'object' && !Object.keys(c).length) continue;
    out[k] = c;
  }
  return out;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toHex(c) {
  const m = String(c).match(/\d+/g);
  if (!m || String(c).startsWith('#')) return String(c).startsWith('#') ? c : '#2a27a6';
  return '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
}
