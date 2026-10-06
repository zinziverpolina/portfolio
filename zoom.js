// Screen-relative scale: the layout is tuned on a MacBook Air 13" (a 1470 px wide window).
// Wider windows show the same layout, proportionally larger, via CSS zoom on <html>;
// --z carries the factor for the few rules sized in viewport units (100vh / --z = one screen).
// Only browsers with standard CSS zoom (currentCSSZoom) get it, so pointer maths stays consistent.
(function () {
  var REF = 1470, root = document.documentElement;
  if (!('currentCSSZoom' in root)) return;
  function apply() {
    var z = Math.max(1, window.innerWidth / REF);
    root.style.zoom = z > 1 ? String(z) : '';
    root.style.setProperty('--z', String(z));
  }
  apply();
  window.addEventListener('resize', apply);
})();
