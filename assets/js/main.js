/* ==========================================================================
   Monash VISTA — site scripts
   1. Mobile menu
   2. Footer year
   3. Tracking-frame reveal on scroll
   4. Hero point field: drifting "LiDAR returns" with tracked people
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Mobile menu ------------------------------------------------------- */
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close' : 'Menu';
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = 'Menu';
      }
    });
  }

  /* 2. Footer year -------------------------------------------------------- */
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  /* 3. Tracking-frame reveal --------------------------------------------- */
  var reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.35 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* 4. Hero point field --------------------------------------------------- */
  var hero = document.querySelector('.hero');
  var canvas = document.querySelector('.hero__field');
  var boxLayer = document.querySelector('.hero__boxes');
  if (!hero || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var MINT = '5, 242, 175';
  var W = 0, H = 0, dpr = 1;
  var ambient = [];   // scattered background returns
  var people = [];    // walking clusters
  var running = false, visible = true, last = 0;

  // Small seeded random so the layout is the same on every load
  var seed = 11;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  function makePerson(i, count) {
    // A person = head + shoulders + torso + legs, as a loose cloud of points
    var pts = [];
    var parts = [
      { cx: 0, cy: -0.42, rx: 0.10, ry: 0.08, n: 7 },   // head
      { cx: 0, cy: -0.18, rx: 0.22, ry: 0.16, n: 12 },  // shoulders / chest
      { cx: 0, cy: 0.06, rx: 0.16, ry: 0.12, n: 8 },    // hips
      { cx: -0.07, cy: 0.32, rx: 0.06, ry: 0.16, n: 6 },// legs
      { cx: 0.07, cy: 0.32, rx: 0.06, ry: 0.16, n: 6 }
    ];
    parts.forEach(function (p) {
      for (var k = 0; k < p.n; k++) {
        var a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
        pts.push({ x: p.cx + Math.cos(a) * p.rx * r, y: p.cy + Math.sin(a) * p.ry * r, s: rnd() * 1.4 + 1.6, ph: rnd() * 6.28 });
      }
    });
    var tag = document.createElement('span');
    tag.className = 'track';
    tag.innerHTML = '<span class="track__tag"></span>';
    boxLayer.appendChild(tag);
    return {
      pts: pts,
      // spread starting positions along the walk
      t: i / count,
      lane: W < 860 ? 0.9 : [0.36, 0.58, 0.8][i % 3],   // on phones: below the buttons, clear of the text
      speed: 0.010 + rnd() * 0.006,      // fraction of path per second
      dir: i % 2 === 0 ? 1 : -1,
      conf: 0.88 + rnd() * 0.1,
      el: tag,
      label: tag.firstChild
    };
  }

  function build() {
    seed = 11;
    var rect = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var phone = W < 860;
    var n = phone ? 90 : 220;
    ambient = [];
    for (var i = 0; i < n; i++) {
      var x = rnd() * W, y = rnd() * H;
      // quieter behind the wordmark (left side), brighter to the right
      var base = x < W * 0.5 ? 0.06 + rnd() * 0.12 : 0.12 + rnd() * 0.3;
      ambient.push({ x: x, y: y, s: rnd() * 1.4 + 1.2, a: base, ph: rnd() * 6.28, vx: (rnd() - 0.5) * 3, vy: (rnd() - 0.5) * 2 });
    }

    boxLayer.innerHTML = '';
    people = [];
    var count = phone ? 1 : 3;
    for (var j = 0; j < count; j++) people.push(makePerson(j, count));
  }

  function personFrame(p, time) {
    var phone = W < 860;
    var h = phone ? 84 : 150;              // person height in px
    var x0 = phone ? W * 0.1 : W * 0.5;    // walk zone (right half on desktop)
    var x1 = phone ? W * 0.9 : W * 0.95;
    var u = p.t % 1;
    var x = p.dir > 0 ? x0 + (x1 - x0) * u : x1 - (x1 - x0) * u;
    var y = H * p.lane + Math.sin(time * 0.0006 + p.lane * 10) * 10;
    // fade in/out at the ends of the walk
    var edge = Math.min(u, 1 - u) / 0.12;
    var alpha = Math.max(0, Math.min(1, edge));
    return { x: x, y: y, h: h, alpha: alpha };
  }

  function draw(time) {
    ctx.clearRect(0, 0, W, H);

    // ambient returns: slow drift + gentle flicker
    for (var i = 0; i < ambient.length; i++) {
      var d = ambient[i];
      var a = d.a * (0.75 + 0.25 * Math.sin(time * 0.0012 + d.ph));
      ctx.fillStyle = 'rgba(' + MINT + ',' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, 6.283); ctx.fill();
    }

    // people + their tracking boxes
    for (var j = 0; j < people.length; j++) {
      var p = people[j];
      var f = personFrame(p, time);
      var stride = Math.sin(time * 0.006 + j) * 0.04;
      for (var k = 0; k < p.pts.length; k++) {
        var q = p.pts[k];
        var legSwing = q.y > 0.2 ? stride * (q.x < 0 ? 1 : -1) : 0;
        var px = f.x + (q.x + legSwing) * f.h;
        var py = f.y + q.y * f.h;
        var pa = f.alpha * (0.65 + 0.35 * Math.sin(time * 0.004 + q.ph));
        ctx.fillStyle = 'rgba(' + MINT + ',' + pa.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, q.s, 0, 6.283); ctx.fill();
      }
      var bw = f.h * 0.62, bh = f.h * 1.08;
      p.el.style.transform = 'translate(' + (f.x - bw / 2).toFixed(1) + 'px,' + (f.y - bh / 2 - f.h * 0.04).toFixed(1) + 'px)';
      p.el.style.width = bw.toFixed(0) + 'px';
      p.el.style.height = bh.toFixed(0) + 'px';
      p.el.style.opacity = f.alpha.toFixed(2);
      // confidence wobbles a little, like a real detector
      if (Math.random() < 0.02) p.conf = Math.min(0.99, Math.max(0.84, p.conf + (Math.random() - 0.5) * 0.04));
      p.label.textContent = 'person · ' + p.conf.toFixed(2);
    }
  }

  function step(time) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
    last = time;
    for (var i = 0; i < ambient.length; i++) {
      var d = ambient[i];
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < 0) d.x += W; if (d.x > W) d.x -= W;
      if (d.y < 0) d.y += H; if (d.y > H) d.y -= H;
    }
    for (var j = 0; j < people.length; j++) people[j].t += people[j].speed * dt;
    draw(time);
    requestAnimationFrame(step);
  }

  function start() {
    if (running || reduceMotion || !visible || document.hidden) return;
    running = true; last = 0;
    requestAnimationFrame(step);
  }
  function stop() { running = false; }

  build();
  draw(4000); // a still frame straight away (and the only frame with reduced motion)

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      visible ? start() : stop();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { build(); draw(performance.now()); }, 150);
  });

  start();
})();
