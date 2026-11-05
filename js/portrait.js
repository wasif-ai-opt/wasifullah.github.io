// Wasif Ullah — Academic Website
// Portrait entrance: the photograph "develops" out of blue signal blocks
// (dark blocks first, in a luminance + noise order), then tears through
// horizontal slice slips and locks into the clean photo.
(function () {
  "use strict";

  var figure = document.querySelector("[data-glitch]");
  if (!figure) return;
  var img = figure.querySelector("img");
  if (!img) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  // duotone palette (ink -> signal blue), as used across the site
  var DARK = [7, 12, 21];
  var LIGHT = [153, 184, 227];

  var COLS = 48, ROWS = 60;
  var DEVELOP_MS = 1500;   // blocks resolving
  var HOLD_MS = 220;       // pause on the duotone image
  var SLICE_MS = 950;      // horizontal slice tear
  var SETTLE_SPLIT = 2 / 3;

  function valueNoise(seed) {
    var cache = new Map();
    function h(x, y) {
      var k = x * 4096 + y;
      var v = cache.get(k);
      if (v === undefined) {
        var s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
        v = s - Math.floor(s);
        cache.set(k, v);
      }
      return v;
    }
    function sm(t) { return t * t * (3 - 2 * t); }
    function n(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = sm(x - xi), yf = sm(y - yi);
      var a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * xf;
      var b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * xf;
      return a + (b - a) * yf;
    }
    return function (x, y) {
      return n(x, y) * 0.55 + n(x * 2.1, y * 2.1) * 0.3 + n(x * 4.3, y * 4.3) * 0.15;
    };
  }

  function start() {
    var rect = figure.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(rect.width * dpr);
    var H = Math.round(rect.height * dpr);
    if (!W || !H) return;

    // ---- offscreen: block-resolution luminance map ----
    var bw = Math.max(1, Math.floor(W / COLS));
    var bh = Math.max(1, Math.floor(H / ROWS));
    var cols = Math.max(1, Math.round(W / bw));
    var rows = Math.max(1, Math.round(H / bh));

    var small = document.createElement("canvas");
    small.width = cols; small.height = rows;
    var sctx = small.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, cols, rows);
    var data;
    try {
      data = sctx.getImageData(0, 0, cols, rows).data;
    } catch (e) {
      return; // canvas tainted or unreadable: leave the plain photo
    }

    var lum = new Float32Array(cols * rows);
    for (var i = 0; i < cols * rows; i++) {
      lum[i] = (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722) / 255;
    }

    // order of appearance: darker blocks first, perturbed by noise
    var noise = valueNoise(Math.random() * 1000);
    var order = [];
    for (var b = 0; b < cols * rows; b++) {
      var bx = b % cols, by = Math.floor(b / cols);
      order.push({ i: b, x: bx, y: by, score: 0.68 * (1 - lum[b]) + 0.32 * noise(bx * 0.35, by * 0.5) });
    }
    order.sort(function (a, c) { return a.score - c.score; });

    // ---- offscreen: full-res photo + duotone "ink" version ----
    var photo = document.createElement("canvas");
    photo.width = W; photo.height = H;
    photo.getContext("2d").drawImage(img, 0, 0, W, H);

    var ink = document.createElement("canvas");
    ink.width = W; ink.height = H;
    var ictx = ink.getContext("2d", { willReadFrequently: true });
    ictx.drawImage(img, 0, 0, W, H);
    var idata = ictx.getImageData(0, 0, W, H);
    var px = idata.data;
    for (var p = 0; p < px.length; p += 4) {
      var l = (px[p] * 0.2126 + px[p + 1] * 0.7152 + px[p + 2] * 0.0722) / 255;
      px[p]     = (DARK[0] + l * (LIGHT[0] - DARK[0]));
      px[p + 1] = (DARK[1] + l * (LIGHT[1] - DARK[1]));
      px[p + 2] = (DARK[2] + l * (LIGHT[2] - DARK[2]));
    }
    ictx.putImageData(idata, 0, 0);

    // ---- overlay canvas ----
    var canvas = document.createElement("canvas");
    canvas.className = "portrait-develop";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = W; canvas.height = H;
    figure.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgb(" + DARK[0] + " " + DARK[1] + " " + DARK[2] + ")";
    ctx.fillRect(0, 0, W, H);

    var t0 = null;
    var totalBlocks = order.length;

    function drawDevelop(now) {
      if (t0 === null) t0 = now;
      var t = (now - t0) / DEVELOP_MS;
      if (t >= 1) { drawInkFull(); setTimeout(function () { t0 = null; requestAnimationFrame(drawSlices); }, HOLD_MS); return; }
      // ease the reveal so it accelerates like a signal locking in
      var eased = 1 - Math.pow(1 - t, 2.2);
      var count = Math.floor(eased * totalBlocks);
      for (var k = 0; k < count; k++) {
        var blk = order[k];
        var l = lum[blk.i];
        ctx.fillStyle = "rgb(" +
          Math.round(DARK[0] + l * (LIGHT[0] - DARK[0])) + " " +
          Math.round(DARK[1] + l * (LIGHT[1] - DARK[1])) + " " +
          Math.round(DARK[2] + l * (LIGHT[2] - DARK[2])) + ")";
        ctx.fillRect(blk.x * bw, blk.y * bh, bw + 1, bh + 1);
      }
      requestAnimationFrame(drawDevelop);
    }

    function drawInkFull() {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(ink, 0, 0);
    }

    // ---- slice tear: horizontal bands slip, flash, and settle ----
    var BANDS = 14;
    function bandHash(n) {
      var s = Math.sin(n * 91.7 + 17.3) * 43758.5453;
      return s - Math.floor(s);
    }

    function drawSlices(now) {
      if (t0 === null) t0 = now;
      var t = (now - t0) / SLICE_MS;
      if (t >= 1) { finish(); return; }

      ctx.clearRect(0, 0, W, H);
      var bandH = H / BANDS;
      // envelope: violent at first, decaying to zero
      var mag = W * 0.16 * Math.pow(1 - t, 1.6);
      // two "tear" windows where some bands flash the duotone ink version
      var tearing = (t > 0.12 && t < 0.3) || (t > 0.52 && t < 0.66);

      for (var b = 0; b < BANDS; b++) {
        var y0 = Math.round(b * bandH);
        var h = Math.round((b + 1) * bandH) - y0;
        var belowSplit = (b + 0.5) / BANDS > SETTLE_SPLIT;
        var dir = (b % 2 === 0 ? 1 : -1) * (belowSplit ? -1 : 1);
        var jitter = bandHash(b) * 0.6 + 0.7;
        var dx = Math.round(dir * mag * jitter);

        var useInk = tearing && bandHash(b * 3 + Math.floor(t * 20)) > 0.72;
        var src = useInk ? ink : photo;

        ctx.drawImage(src, 0, y0, W, h, dx, y0, W, h);
        // faint signal line on some moving bands
        if (dx !== 0 && bandHash(b * 7) > 0.5) {
          ctx.fillStyle = "rgba(142, 175, 217, 0.25)";
          ctx.fillRect(0, y0, W, 1);
        }
      }
      requestAnimationFrame(drawSlices);
    }

    function finish() {
      ctx.clearRect(0, 0, W, H);
      canvas.style.transition = "opacity 180ms ease-out";
      canvas.style.opacity = "0";
      setTimeout(function () { canvas.remove(); }, 220);
    }

    requestAnimationFrame(drawDevelop);
  }

  function ready(fn) {
    if (img.complete && img.naturalWidth) fn();
    else img.addEventListener("load", fn, { once: true });
  }

  // slight delay so the entrance reads intentionally
  ready(function () { setTimeout(start, 300); });
})();
