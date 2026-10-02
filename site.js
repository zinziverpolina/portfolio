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
