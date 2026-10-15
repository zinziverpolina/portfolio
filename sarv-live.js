// SARV / Drone/Ison — a small live version for the browser (Web Audio, HRTF panning).
// Same logic as the SuperCollider console: every person in the circle lowers the pitch
// (47 Hz empty → 33 Hz at 12 people), adds sub-bass and speeds the pulse up by 2.5 %.
(function () {
  var cv = document.getElementById('sarv-room');
  if (!cv) return;
  var btn = document.getElementById('sarv-play');
  var countEl = document.getElementById('sarv-count');
  var infoEl = document.getElementById('sarv-info');
  var ctx = cv.getContext('2d');
  var people = [];           // {x, y} in −1…1, y + = front
  var MAX = 20;
  var A = null;              // audio graph, built on first click

  // ── geometry ──
  var W, H, R, CX, CY;
  function size() {
    var w = cv.clientWidth, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = w * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = w; CX = W / 2; CY = H / 2; R = W * 0.42;
  }
  function toPx(x, y) { return [CX + x * R, CY - y * R]; }
  function fromPx(px, py) { return [(px - CX) / R, (CY - py) / R]; }

  // ── sound ──
  function pitchFor(n) { return 47 * Math.pow(33 / 47, Math.min(n, 12) / 12); }
  function tempoFor(n) { return 96 * (1 + n * 0.025); }

  function impulse(ac, secs, decay) {
    var len = Math.floor(ac.sampleRate * secs), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function panner(ac, x, y, z) {
    var p = ac.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 0.3;
    // listener faces −z; our y + = front → z = −y
    setPos(p, x, y, z || 0);
    return p;
  }
  function setPos(p, x, y, z, t) {
    if (p.positionX) {
      var tt = t || p.context.currentTime;
      p.positionX.setTargetAtTime(x, tt, 0.05); p.positionY.setTargetAtTime(z || 0, tt, 0.05); p.positionZ.setTargetAtTime(-y, tt, 0.05);
    } else { p.setPosition(x, z || 0, -y); }
  }

  function build() {
    var ac = new (window.AudioContext || window.webkitAudioContext)();
    var master = ac.createGain(); master.gain.value = 0;
    var comp = ac.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    var revIn = ac.createGain(); revIn.gain.value = 1;
    var rev = ac.createConvolver(); rev.buffer = impulse(ac, 3.2, 2.6);
    var revOut = ac.createGain(); revOut.gain.value = 0.55;
    revIn.connect(rev); rev.connect(revOut); revOut.connect(master);
    var g = { ac: ac, master: master, revIn: revIn };

    // drone: 4 detuned saw rotors from 4 sides, low-passed, blade hum (AM)
    var f0 = pitchFor(0);
    g.rotors = [0, 0.0045, -0.0038, 0.0071].map(function (det, i) {
      var o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0 * (1 + det);
      var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      var am = ac.createGain(); am.gain.value = 0.6;
      var amOsc = ac.createOscillator(); amOsc.frequency.value = 113; var amDepth = ac.createGain(); amDepth.gain.value = 0.25;
      amOsc.connect(amDepth); amDepth.connect(am.gain);
      var lvl = ac.createGain(); lvl.gain.value = 0.16;
      var ang = i * Math.PI / 2 + Math.PI / 4;
      var p = panner(ac, Math.sin(ang) * 1.5, Math.cos(ang) * 1.5, 0.3);
      o.connect(lp); lp.connect(am); am.connect(lvl); lvl.connect(p); p.connect(master);
      lvl.connect(revIn);
      o.start(); amOsc.start();
      return { osc: o, det: det };
    });

    // sub-bass: grows with people, no direction
    g.sub = ac.createOscillator(); g.sub.type = 'sine'; g.sub.frequency.value = f0;
    g.subGain = ac.createGain(); g.subGain.gain.value = 0;
    g.sub.connect(g.subGain); g.subGain.connect(master); g.sub.start();

    // ison: answering voice «m→o», in front, phrases come and go
    g.voice = ac.createOscillator(); g.voice.type = 'sawtooth'; g.voice.frequency.value = f0 * 2;
    var vib = ac.createOscillator(); vib.frequency.value = 4.7; var vibD = ac.createGain(); vibD.gain.value = 0.6;
    vib.connect(vibD); vibD.connect(g.voice.frequency); vib.start();
    var form = ac.createGain(); form.gain.value = 1;
    [[450, 2.2], [800, 1.4], [2830, 0.35]].forEach(function (fm) {
      var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fm[0]; bp.Q.value = 8;
      var gg = ac.createGain(); gg.gain.value = fm[1];
      g.voice.connect(bp); bp.connect(gg); gg.connect(form);
    });
    g.voiceAmp = ac.createGain(); g.voiceAmp.gain.value = 0;
    var vp = panner(ac, 0, 1.2, 0);
    form.connect(g.voiceAmp); g.voiceAmp.connect(vp); vp.connect(master); g.voiceAmp.connect(revIn);
    g.voice.start();

    // pulse: gimbri (bass, 3 hits per beat, accents 1 · 0 · 0.6) in front-low; krakebs circling
    g.gimP = panner(ac, 0, 1, -0.4);
    g.gimBus = ac.createGain(); g.gimBus.gain.value = 0.55; g.gimBus.connect(g.gimP); g.gimP.connect(master);
    g.qA = panner(ac, 1, 0, 0.2); g.qB = panner(ac, -1, 0, 0.2);
    g.qBus = [ac.createGain(), ac.createGain()];
    g.qBus[0].connect(g.qA); g.qBus[1].connect(g.qB); g.qA.connect(master); g.qB.connect(master);
    g.qBus.forEach(function (b) { b.gain.value = 0.35; var s = ac.createGain(); s.gain.value = 0.25; b.connect(s); s.connect(revIn); });
    g.noise = (function () { var len = ac.sampleRate, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return b; })();
    g.step = 0; g.nextT = ac.currentTime + 0.2; g.qPhase = 0;
    return g;
  }

  function gimbriHit(g, t, acc, f) {
    var ac = g.ac, o = ac.createOscillator(), o2 = ac.createOscillator(), e = ac.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(acc, t + 0.004); e.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(e); o2.connect(e); e.connect(g.gimBus);
    o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
  }
  function krakeb(g, t, acc, bus) {
    var ac = g.ac, src = ac.createBufferSource(); src.buffer = g.noise;
    var e = ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(acc, t + 0.0008); e.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    var out = ac.createGain(); out.gain.value = 1;
    src.connect(e);
    [2150, 3420, 5230, 7900].forEach(function (fr, i) {
      var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 30;
      var gg = ac.createGain(); gg.gain.value = [1.4, 1, 0.8, 0.5][i];
      e.connect(bp); bp.connect(gg); gg.connect(out);
    });
    out.connect(bus);
    // second hit 9–11 ms later (the pair of plates)
    src.start(t); src.stop(t + 0.1);
  }

  var accG = [1, 0, 0.6], accA = [1, 0.45, 0.75], accB = [0.5, 0.8, 0.35, 0.7], pitchSeq = [1, 1, 1.5, 1, 1, 1, 1.5, 2];
  function schedule() {
    if (!A) return;
    var ac = A.ac, n = people.length, f0 = pitchFor(n);
    var dt = 60 / tempoFor(n) / 3;
    while (A.nextT < ac.currentTime + 0.15) {
      var s = A.step, t = A.nextT;
      if (accG[s % 3] > 0) gimbriHit(A, t, accG[s % 3] * 0.9, f0 * pitchSeq[s % 8]);
      krakeb(A, t, accA[s % 3] * 0.5, A.qBus[0]);
      krakeb(A, t + 0.01, accB[s % 4] * 0.4, A.qBus[1]);
      A.step++; A.nextT += dt;
    }
  }
  function update() {
    if (!A) return;
    var ac = A.ac, t = ac.currentTime, n = people.length, f0 = pitchFor(n);
    A.rotors.forEach(function (r) { r.osc.frequency.setTargetAtTime(f0 * (1 + r.det), t, 1.2); });
    A.sub.frequency.setTargetAtTime(f0, t, 1.2);
    A.subGain.gain.setTargetAtTime(0.5 * Math.min(n, 12) / 12, t, 1.5);
    A.voice.frequency.setTargetAtTime(f0 * 2, t, 1.2);
  }
  // voice phrases + krakebs orbit
  var last = 0;
  function tick(now) {
    if (A) {
      var ac = A.ac, t = ac.currentTime;
      var ph = (t % 12.5) / 12.5;               // one phrase every 12.5 s: rise · hold · fall · gap
      var v = ph < 0.12 ? ph / 0.12 : ph < 0.44 ? 1 : ph < 0.56 ? (0.56 - ph) / 0.12 : 0;
      A.voiceAmp.gain.setTargetAtTime(v * 0.09, t, 0.15);
      A.qPhase += (tempoFor(people.length) / 60 / 8) * 2 * Math.PI * Math.min(0.1, (now - last) / 1000);
      var qa = A.qPhase;
      setPos(A.qA, Math.sin(qa) * 1.4, Math.cos(qa) * 1.4, 0.3);
      setPos(A.qB, -Math.sin(qa) * 1.4, -Math.cos(qa) * 1.4, 0.3);
      schedule();
    }
    last = now;
    draw();
    requestAnimationFrame(tick);
  }

  // ── drawing ──
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1c1925'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(217,166,77,0.35)'; ctx.lineWidth = 1;
    [0.33, 0.66, 1].forEach(function (r) { ctx.beginPath(); ctx.arc(CX, CY, r * R, 0, Math.PI * 2); ctx.stroke(); });
    // 8 speakers: corners + middles of a square around the circle
    ctx.fillStyle = '#d9a64d';
    [[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]].forEach(function (s) {
      var p = toPx(s[0] * 1.12, s[1] * 1.12); ctx.fillRect(p[0] - 5, p[1] - 5, 10, 10);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
    ctx.fillText('front', CX, CY - R - 8);
    // listener
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(CX, CY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillText('you', CX, CY + 18);
    // krakebs
    if (A) {
      var qa = A.qPhase;
      [[Math.sin(qa), Math.cos(qa)], [-Math.sin(qa), -Math.cos(qa)]].forEach(function (q) {
        var p = toPx(q[0] * 0.95, q[1] * 0.95);
        ctx.fillStyle = 'rgba(140,230,255,0.9)'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill();
      });
      var vp = toPx(0, 0.8), ph = (A.ac.currentTime % 12.5) / 12.5, on = ph < 0.56;
      ctx.fillStyle = on ? 'rgba(240,120,150,0.95)' : 'rgba(240,120,150,0.3)';
      ctx.beginPath(); ctx.arc(vp[0], vp[1], on ? 7 : 4, 0, Math.PI * 2); ctx.fill();
    }
    // people
    people.forEach(function (p) {
      var q = toPx(p.x, p.y);
      ctx.fillStyle = 'rgba(250,140,56,0.85)'; ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, Math.PI * 2); ctx.fill();
    });
    var n = people.length;
    countEl.textContent = n + (n === 1 ? ' person' : ' people') + ' in the circle';
    infoEl.textContent = 'pitch ' + pitchFor(n).toFixed(1) + ' Hz · pulse ' + Math.round(tempoFor(n)) + ' bpm · sub-bass ' + Math.round(100 * Math.min(n, 12) / 12) + ' %';
  }

  // ── interaction ──
  cv.addEventListener('click', function (ev) {
    var r = cv.getBoundingClientRect(), xy = fromPx(ev.clientX - r.left, ev.clientY - r.top);
    var hit = -1;
    people.forEach(function (p, i) { if (Math.hypot(p.x - xy[0], p.y - xy[1]) < 0.09) hit = i; });
    if (hit >= 0) people.splice(hit, 1);
    else if (Math.hypot(xy[0], xy[1]) <= 1.05 && people.length < MAX) people.push({ x: xy[0], y: xy[1] });
    update();
  });
  document.getElementById('sarv-add').addEventListener('click', function () {
    if (people.length >= MAX) return;
    var a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6;
    people.push({ x: Math.sin(a) * r, y: Math.cos(a) * r }); update();
  });
  document.getElementById('sarv-remove').addEventListener('click', function () { people.pop(); update(); });
  btn.addEventListener('click', function () {
    if (!A) { A = build(); update(); }
    var ac = A.ac;
    if (btn.dataset.on === '1') {
      A.master.gain.setTargetAtTime(0, ac.currentTime, 0.3);
      setTimeout(function () { ac.suspend(); }, 900);
      btn.dataset.on = '0'; btn.textContent = '▶ listen with headphones';
    } else {
      ac.resume(); A.nextT = ac.currentTime + 0.1;
      A.master.gain.setTargetAtTime(0.8, ac.currentTime, 0.8);
      btn.dataset.on = '1'; btn.textContent = '❚❚ pause';
    }
  });
  window.addEventListener('resize', size);
  size();
  requestAnimationFrame(tick);
})();
