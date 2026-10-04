// Photo selection mode for reviewing pages: on draft pages it starts by itself, on any other page add ?pick to the address.
// Click a photo to tick it (= keep it on the site); unticked photos will be removed. The choice is remembered in this
// browser per page; "copy list" / "download" export every page reviewed here, to send back.
(function () {
  var imgs = Array.prototype.filter.call(document.querySelectorAll('section.slide img'), function (i) { return !i.closest('.projects'); });
  if (!imgs.length) return;
  var page = location.pathname.replace(/^.*\/portfolio\//, '').replace(/^\//, '');
  var KEY = 'pick:' + page, PAGES = 'pick:pages';
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var src = function (i) { return i.getAttribute('src'); };
  var label = function (i) { var c = i.closest('figure') && i.closest('figure').querySelector('figcaption'); return c ? c.textContent.split(' · ')[0] : src(i).split('/').pop(); };
  var keep = new Set(load(KEY, []));
  var on = true;

  var bar = document.createElement('div');
  bar.className = 'pick-bar';
  bar.innerHTML = '<span class="n"></span>' +
    '<button type="button" data-a="all">tick all</button><button type="button" data-a="none">untick all</button>' +
    '<button type="button" data-a="mode">view photos</button>' +
    '<button type="button" data-a="copy">copy list</button><button type="button" data-a="dl">download</button>' +
    '<span class="msg"></span>';
  document.body.appendChild(bar);
  var n = bar.querySelector('.n'), msg = bar.querySelector('.msg'), modeBtn = bar.querySelector('[data-a="mode"]');

  function save() {
    store(KEY, Array.from(keep));
    var pages = load(PAGES, {});
    pages[page] = { title: document.title.replace(/ — Polina Zinziver$/, ''), total: imgs.length };
    store(PAGES, pages);
  }
  function paint() {
    document.documentElement.classList.toggle('picking', on);
    imgs.forEach(function (i) { i.classList.toggle('kept', keep.has(src(i))); });
    n.textContent = keep.size + ' of ' + imgs.length + ' ticked to keep';
    modeBtn.textContent = on ? 'view photos' : 'back to ticking';
  }
  // Capture phase, so in ticking mode a click selects instead of opening the lightbox.
  document.addEventListener('click', function (e) {
    if (!on) return;
    var i = e.target.closest && e.target.closest('img');
    if (!i || imgs.indexOf(i) < 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    keep.has(src(i)) ? keep.delete(src(i)) : keep.add(src(i));
    save(); paint();
  }, true);

  function exportText() {
    var pages = load(PAGES, {}), out = [];
    Object.keys(pages).forEach(function (p) {
      var kept = load('pick:' + p, []);
      var here = p === page;
      out.push({ page: p, title: pages[p].title, total: pages[p].total, kept: kept.length,
                 ids: here ? imgs.filter(function (i) { return keep.has(src(i)); }).map(label) : undefined, keep: kept });
    });
    return JSON.stringify(out, null, 1);
  }
  bar.addEventListener('click', function (e) {
    var a = e.target.getAttribute('data-a');
    if (!a) return;
    if (a === 'all') imgs.forEach(function (i) { keep.add(src(i)); });
    if (a === 'none') keep.clear();
    if (a === 'mode') on = !on;
    if (a === 'copy') {
      var t = exportText();
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg.textContent = 'copied — paste it into the chat'; },
        function () { window.prompt('Copy this and paste it into the chat:', t); });
    }
    if (a === 'dl') {
      var b = new Blob([exportText()], { type: 'application/json' }), u = URL.createObjectURL(b), l = document.createElement('a');
      l.href = u; l.download = 'photo-selection.json'; document.body.appendChild(l); l.click(); l.remove(); URL.revokeObjectURL(u);
    }
    save(); paint();
  });
  save(); paint();
})();
