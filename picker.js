// Photo selection mode for reviewing pages: on draft pages it starts by itself, on any other page add ?pick to the address.
// Every photo gets a checkbox in its corner: ticked = keep it on the site, unticked = remove. Clicking the photo itself
// still opens it large. Ticks are remembered in this browser per page; "copy list" / "download" export every page
// reviewed here, to send back.
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
  document.documentElement.classList.add('picking');

  // Checkboxes live in one layer on top of the page, placed over each photo's corner, so the layout isn't touched.
  var layer = document.createElement('div');
  layer.className = 'pick-layer';
  document.body.appendChild(layer);
  var boxes = imgs.map(function (img) {
    var box = document.createElement('label');
    box.className = 'pick-box';
    box.title = 'keep this photo';
    box.innerHTML = '<input type="checkbox"><span></span>';
    var input = box.firstChild;
    input.checked = keep.has(src(img));
    input.addEventListener('change', function () {
      input.checked ? keep.add(src(img)) : keep.delete(src(img));
      save(); paint();
    });
    layer.appendChild(box);
    return { img: img, box: box, input: input };
  });
  function place() {
    boxes.forEach(function (b) {
      var r = b.img.getBoundingClientRect();
      var shown = r.width > 20 && r.height > 20;
      b.box.style.display = shown ? '' : 'none';
      if (shown) { b.box.style.left = (r.left + window.scrollX + 8) + 'px'; b.box.style.top = (r.top + window.scrollY + 8) + 'px'; }
    });
  }
  var ro = window.ResizeObserver ? new ResizeObserver(place) : null;
  imgs.forEach(function (i) { if (ro) ro.observe(i); i.addEventListener('load', place); });
  window.addEventListener('resize', place);
  window.addEventListener('load', place);

  var bar = document.createElement('div');
  bar.className = 'pick-bar';
  bar.innerHTML = '<span class="n"></span>' +
    '<button type="button" data-a="all">tick all</button><button type="button" data-a="none">untick all</button>' +
    '<button type="button" data-a="copy">copy list</button><button type="button" data-a="dl">download</button>' +
    '<span class="msg"></span>';
  document.body.appendChild(bar);
  var n = bar.querySelector('.n'), msg = bar.querySelector('.msg');

  function save() {
    store(KEY, Array.from(keep));
    var pages = load(PAGES, {});
    pages[page] = { title: document.title.replace(/ — Polina Zinziver$/, ''), total: imgs.length };
    store(PAGES, pages);
  }
  function paint() {
    boxes.forEach(function (b) { var k = keep.has(src(b.img)); b.input.checked = k; b.img.classList.toggle('kept', k); b.box.classList.toggle('on', k); });
    n.textContent = keep.size + ' of ' + imgs.length + ' ticked to keep';
  }
  function exportText() {
    var pages = load(PAGES, {}), out = [];
    Object.keys(pages).forEach(function (p) {
      var kept = load('pick:' + p, []);
      out.push({ page: p, title: pages[p].title, total: pages[p].total, kept: kept.length,
                 ids: p === page ? imgs.filter(function (i) { return keep.has(src(i)); }).map(label) : undefined, keep: kept });
    });
    return JSON.stringify(out, null, 1);
  }
  bar.addEventListener('click', function (e) {
    var a = e.target.getAttribute('data-a');
    if (!a) return;
    if (a === 'all') imgs.forEach(function (i) { keep.add(src(i)); });
    if (a === 'none') keep.clear();
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
  save(); paint(); place();
  setTimeout(place, 500); setTimeout(place, 2000);
})();
