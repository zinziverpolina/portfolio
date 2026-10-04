  // Lightweight YouTube embed: show the cover, load the player on click.
  document.querySelectorAll('.video[data-yt]').forEach(function (el) {
    var id = el.dataset.yt;
    var hi = 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg';
    var lo = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    var probe = new Image();
    probe.onload = function () { el.style.backgroundImage = 'url(' + (probe.naturalWidth > 120 ? hi : lo) + ')'; };
    probe.onerror = function () { el.style.backgroundImage = 'url(' + lo + ')'; };
    probe.src = hi;
    var btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Play: ' + (el.dataset.title || 'video'));
    el.appendChild(btn);
    btn.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
      f.title = el.dataset.title || 'YouTube video';
      f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      el.innerHTML = '';
      el.appendChild(f);
    });
  });

  // Performance clips: play silently while on screen, pause when scrolled away.
  var clipObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(function () {}); }
      else if (!v.dataset.user) v.pause();
    });
  }, { threshold: 0.35 });
  document.querySelectorAll('video.clip').forEach(function (v) {
    clipObserver.observe(v);
    v.addEventListener('volumechange', function () { if (!v.muted) v.dataset.user = '1'; });
  });

  // Photo lightbox
  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = '<img alt="">';
  document.body.appendChild(lb);
  lb.addEventListener('click', function () { lb.classList.remove('open'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.classList.remove('open'); });
  document.querySelectorAll('.gallery img, img.zoom').forEach(function (img) {
    img.addEventListener('click', function () { lb.firstChild.src = img.src; lb.firstChild.alt = img.alt; lb.classList.add('open'); });
  });

  // Project tabs: on narrow screens scroll the current tab into view.
  var tabs = document.querySelector('.topnav .tabs');
  var cur = tabs && tabs.querySelector('a.on');
  if (cur) tabs.scrollLeft = cur.offsetLeft - (tabs.clientWidth - cur.offsetWidth) / 2;

  // 3D model cards: zoom with the +/− buttons, ctrl/⌘ + wheel or a two-finger pinch.
  // The plain wheel keeps scrolling the page.
  document.querySelectorAll('.models model-viewer').forEach(function (mv) {
    var ctl = document.createElement('div');
    ctl.className = 'zoom-ctl';
    ctl.innerHTML = '<button type="button" aria-label="Zoom in">+</button><button type="button" aria-label="Zoom out">−</button>';
    mv.parentNode.insertBefore(ctl, mv.nextSibling);
    function zoom(f) {
      var o = mv.getCameraOrbit();
      mv.cameraOrbit = o.theta + 'rad ' + o.phi + 'rad ' + (o.radius * f) + 'm';
    }
    ctl.children[0].addEventListener('click', function () { zoom(0.75); });
    ctl.children[1].addEventListener('click', function () { zoom(1 / 0.75); });
    mv.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 0.9 : 1 / 0.9);
    }, { passive: false });
    var pinch = null;
    mv.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }, { passive: true });
    mv.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || !pinch) return;
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoom(pinch / d);
      pinch = d;
    }, { passive: true });
    mv.addEventListener('touchend', function () { pinch = null; });
  });
