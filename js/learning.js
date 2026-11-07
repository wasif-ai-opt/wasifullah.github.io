
// Wasif Ullah — Academic Website
// Simulations page, part 2: learning-based scheduling demonstrations.
//
//   04  Supervised machine learning — linear regression (gradient descent)
//       learns to predict job flow time from shop-floor features.
//   05  Deep learning — a small neural network trained with backpropagation
//       learns the nonlinear version of the same mapping.
//   06  Reinforcement learning — a Q-learning agent learns WHICH dispatching
//       rule to fire, by trial and error, on a dynamic single machine.
//
// Everything is computed live in the browser. Illustrative, not
// experimental data.

(function () {
  "use strict";

  var mlCanvas = document.getElementById("ml-scatter");
  if (!mlCanvas) return;

  var reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  var COLORS = {
    bg: "#14161a",
    panelLine: "#212427",
    rule: "#2c3035",
    text: "#a3a7ad",
    paper: "#eeeef0",
    jobs: [
      "#6e8db8", "#8eafd9", "#6183a9",
      "#93a3b8", "#4a6787", "#7d9cc4"
    ]
  };

  var PANEL_W = 560;
  var CHART_W = 380;
  var PANEL_H = 340;

  // ---------- Seeded RNG ----------

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Canvas helpers ----------

  function setupCanvas(canvas, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.aspectRatio = w + " / " + h;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function chartFrame(ctx, W, H, title) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    ctx.fillStyle = COLORS.paper;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(title, 46, 20);
    return { padL: 46, padR: 14, padT: 40, padB: 34 };
  }

  function fmtTick(v) {
    var a = Math.abs(v);
    if (a > 0 && a < 0.01) return v.toExponential(1);
    if (a < 1) return (Math.round(v * 1000) / 1000).toString();
    return String(Math.round(v * 100) / 100);
  }

  function drawGrid(ctx, scales, padL, padR, padT, padB, W, H) {
    ctx.strokeStyle = COLORS.panelLine;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var gv = scales.vmax - (scales.vmax - scales.vmin) * (g + 0.5) / 3.5;
      var gy = padT + (H - padT - padB) * (g + 0.5) / 3.5;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(W - padR, gy);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(fmtTick(gv), padL - 8, gy);
    }
  }

  function makeScales(values, padT, padB, H) {
    var vmax = -Infinity;
    var vmin = Infinity;
    var allPos = true;
    values.forEach(function (v) {
      if (v > vmax) vmax = v;
      if (v < vmin) vmin = v;
      if (v < 0) allPos = false;
    });
    if (vmax === vmin) { vmax += 1; vmin -= 1; }
    var pad = Math.max((vmax - vmin) * 0.15, 1e-6);
    vmax += pad;
    vmin -= pad;
    if (allPos && vmin < 0) vmin = 0; // losses never go below zero
    return {
      vmin: vmin,
      vmax: vmax,
      Y: function (v) {
        return padT + (H - padT - padB) -
          (v - vmin) / (vmax - vmin) * (H - padT - padB);
      }
    };
  }

  // ---------- Dataset generators ----------
  // Features (normalised 0..1): processing time, operation count, slack.
  // Target: flow time of the job once through the shop (normalised).

  var N_SAMPLES = 220;
  var N_TRAIN = 180;

  function makeDataset(seed, nonlinear) {
    var rng = mulberry32(seed);
    var data = [];

    for (var i = 0; i < N_SAMPLES; i++) {
      var p = rng();
      var ops = rng();
      var slack = rng();

      var flow =
        0.42 * p +
        0.30 * ops +
        0.28 * Math.exp(-2.2 * slack);

      if (nonlinear) {
        // Interaction terms a linear model cannot represent.
        flow += 0.45 * p * (1 - slack) + 0.3 * Math.sin(3.1 * p * ops);
      }

      flow += (rng() + rng() - 1) * 0.05; // shop noise
      data.push({ x: [p, ops, slack], y: flow });
    }

    return {
      train: data.slice(0, N_TRAIN),
      test: data.slice(N_TRAIN)
    };
  }

  function r2Score(model, test) {
    var mean = 0;
    test.forEach(function (d) { mean += d.y; });
    mean /= test.length;

    var ssRes = 0;
    var ssTot = 0;
    test.forEach(function (d) {
      var e = d.y - model(d.x);
      ssRes += e * e;
      var v = d.y - mean;
      ssTot += v * v;
    });

    return ssTot > 0 ? 1 - ssRes / ssTot : 0;
  }

  // ============================================================
  // Panel 04 — Supervised ML: linear regression with SGD
  // ============================================================

  var mlScatterCtx = setupCanvas(mlCanvas, PANEL_W, PANEL_H);
  var mlChartCanvas = document.getElementById("ml-chart");
  var mlChartCtx = mlChartCanvas
    ? setupCanvas(mlChartCanvas, CHART_W, PANEL_H)
    : null;

  var ml = {
    data: null,
    w: [0, 0, 0],
    b: 0,
    epoch: 0,
    run: 1,
    cursor: 0,
    lossHist: [],
    running: true
  };

  var mlEls = {
    epoch: document.querySelector('[data-ml="epoch"]'),
    loss: document.querySelector('[data-ml="loss"]'),
    r2: document.querySelector('[data-ml="r2"]')
  };

  function mlPredict(x) {
    return ml.w[0] * x[0] + ml.w[1] * x[1] + ml.w[2] * x[2] + ml.b;
  }

  function mlReset() {
    ml.data = makeDataset(4000 + ml.run * 131, false);
    ml.w = [0, 0, 0];
    ml.b = 0;
    ml.epoch = 0;
    ml.cursor = 0;
    ml.lossHist = [];
  }

  var ML_BATCH = 16;
  var ML_LR = 0.35;
  var ML_MAX_EPOCHS = 60;

  function mlTick() {
    // One mini-batch SGD step per tick.
    var dw = [0, 0, 0];
    var db = 0;

    for (var n = 0; n < ML_BATCH; n++) {
      var d = ml.data.train[ml.cursor];
      ml.cursor = (ml.cursor + 1) % ml.data.train.length;

      var err = mlPredict(d.x) - d.y;
      for (var k = 0; k < 3; k++) dw[k] += err * d.x[k];
      db += err;
    }

    for (var k2 = 0; k2 < 3; k2++) {
      ml.w[k2] -= ML_LR * dw[k2] / ML_BATCH;
    }
    ml.b -= ML_LR * db / ML_BATCH;

    if (ml.cursor === 0) {
      // Epoch finished: record training MSE.
      var mse = 0;
      ml.data.train.forEach(function (d) {
        var e = mlPredict(d.x) - d.y;
        mse += e * e;
      });
      mse /= ml.data.train.length;
      ml.lossHist.push(mse);
      ml.epoch++;

      if (ml.epoch >= ML_MAX_EPOCHS) {
        ml.run++;
        mlReset();
      }
    }
  }

  function mlDraw() {
    // Left: predicted vs actual scatter on the held-out test set.
    var ctx = mlScatterCtx;
    var fr = chartFrame(ctx, PANEL_W, PANEL_H,
      "supervised learning · predicted vs actual · run " + ml.run);

    var all = ml.data.test.map(function (d) { return d.y; })
      .concat(ml.data.test.map(function (d) { return mlPredict(d.x); }));
    var lo = Math.min.apply(null, all);
    var hi = Math.max.apply(null, all);
    var pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;

    var x0 = fr.padL;
    var x1 = PANEL_W - fr.padR;
    var y0 = fr.padT;
    var y1 = PANEL_H - fr.padB;

    function X(v) { return x0 + (v - lo) / (hi - lo) * (x1 - x0); }
    function Y(v) { return y1 - (v - lo) / (hi - lo) * (y1 - y0); }

    // Diagonal = perfect prediction.
    ctx.strokeStyle = COLORS.paper;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(X(lo), Y(lo));
    ctx.lineTo(X(hi), Y(hi));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.fillText("actual flow time →", (x0 + x1) / 2, PANEL_H - 12);
    ctx.save();
    ctx.translate(14, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("predicted →", 0, 0);
    ctx.restore();

    ctx.fillStyle = COLORS.jobs[1];
    ml.data.test.forEach(function (d) {
      ctx.globalAlpha = 0.55;
      ctx.fillRect(X(d.y) - 2, Y(mlPredict(d.x)) - 2, 4, 4);
    });
    ctx.globalAlpha = 1;

    // Right: training loss.
    if (!mlChartCtx) return;
    var fr2 = chartFrame(mlChartCtx, CHART_W, PANEL_H, "training loss (MSE)");

    if (ml.lossHist.length > 1) {
      var scales = makeScales(ml.lossHist, fr2.padT, fr2.padB, PANEL_H);
      drawGrid(mlChartCtx, scales, fr2.padL, fr2.padR,
        fr2.padT, fr2.padB, CHART_W, PANEL_H);

      var w = CHART_W - fr2.padL - fr2.padR;
      mlChartCtx.strokeStyle = COLORS.jobs[1];
      mlChartCtx.lineWidth = 1.6;
      mlChartCtx.beginPath();
      ml.lossHist.forEach(function (v, i) {
        var x = fr2.padL + (i / (ML_MAX_EPOCHS - 1)) * w;
        if (i === 0) mlChartCtx.moveTo(x, scales.Y(v));
        else mlChartCtx.lineTo(x, scales.Y(v));
      });
      mlChartCtx.stroke();
      mlChartCtx.lineWidth = 1;
    }

    mlChartCtx.fillStyle = COLORS.text;
    mlChartCtx.textAlign = "left";
    mlChartCtx.fillText("epoch " + ml.epoch, fr2.padL, PANEL_H - 16);

    var r2 = r2Score(mlPredict, ml.data.test);
    var mseNow = ml.lossHist.length
      ? ml.lossHist[ml.lossHist.length - 1]
      : 0;

    if (mlEls.epoch) mlEls.epoch.textContent = ml.epoch;
    if (mlEls.loss) mlEls.loss.textContent = mseNow.toFixed(4);
    if (mlEls.r2) mlEls.r2.textContent = r2.toFixed(3);
  }

  // ============================================================
  // Panel 05 — Deep learning: tiny MLP with backpropagation
  // ============================================================

  var dlNetCanvas = document.getElementById("dl-net");
  var dlChartCanvas = document.getElementById("dl-chart");
  var dlNetCtx = dlNetCanvas ? setupCanvas(dlNetCanvas, PANEL_W, PANEL_H) : null;
  var dlChartCtx = dlChartCanvas ? setupCanvas(dlChartCanvas, CHART_W, PANEL_H) : null;

  var DL_LAYERS = [3, 8, 8, 1];

  var dl = {
    data: null,
    W1: null, b1: null,
    W2: null, b2: null,
    W3: null, b3: null,
    iter: 0,
    run: 1,
    lossHist: [],
    sampleIdx: 0,
    sampleTimer: 0,
    lastActs: null,
    running: true
  };

  var dlEls = {
    iter: document.querySelector('[data-dl="iter"]'),
    loss: document.querySelector('[data-dl="loss"]'),
    r2: document.querySelector('[data-dl="r2"]')
  };

  function dlInitWeights() {
    var rng = mulberry32(9000 + dl.run * 37);
    function matrix(rows, cols) {
      var m = [];
      for (var i = 0; i < rows; i++) {
        var row = [];
        for (var j = 0; j < cols; j++) {
          row.push((rng() * 2 - 1) * 0.7);
        }
        m.push(row);
      }
      return m;
    }
    function vec(n) {
      var v = [];
      for (var i = 0; i < n; i++) v.push(0);
      return v;
    }
    dl.W1 = matrix(8, 3); dl.b1 = vec(8);
    dl.W2 = matrix(8, 8); dl.b2 = vec(8);
    dl.W3 = matrix(1, 8); dl.b3 = vec(1);
  }

  function tanh(v) { return Math.tanh(v); }

  function dlForward(x) {
    var a1 = [];
    for (var i = 0; i < 8; i++) {
      var s = dl.b1[i];
      for (var j = 0; j < 3; j++) s += dl.W1[i][j] * x[j];
      a1.push(tanh(s));
    }
    var a2 = [];
    for (var i2 = 0; i2 < 8; i2++) {
      var s2 = dl.b2[i2];
      for (var j2 = 0; j2 < 8; j2++) s2 += dl.W2[i2][j2] * a1[j2];
      a2.push(tanh(s2));
    }
    var y = dl.b3[0];
    for (var j3 = 0; j3 < 8; j3++) y += dl.W3[0][j3] * a2[j3];

    return { a1: a1, a2: a2, y: y };
  }

  function dlPredict(x) {
    return dlForward(x).y;
  }

  function dlReset() {
    dl.data = makeDataset(7000 + dl.run * 173, true);
    dlInitWeights();
    dl.iter = 0;
    dl.lossHist = [];
  }

  var DL_BATCH = 32;
  var DL_LR = 0.06;
  var DL_STEPS_PER_TICK = 24;
  var DL_MAX_ITERS = 6000;

  function dlStep() {
    var gW1 = [], gb1 = [], gW2 = [], gb2 = [], gW3 = [0], gb3 = 0;
    for (var i = 0; i < 8; i++) {
      gW1.push([0, 0, 0]);
      gb1.push(0);
      gW2.push([0, 0, 0, 0, 0, 0, 0, 0]);
      gb2.push(0);
    }
    gW3 = [[0, 0, 0, 0, 0, 0, 0, 0]];

    var loss = 0;

    for (var n = 0; n < DL_BATCH; n++) {
      var d = dl.data.train[Math.floor(Math.random() * dl.data.train.length)];
      var f = dlForward(d.x);
      var err = f.y - d.y;
      loss += err * err;

      // Backprop.
      var dy = 2 * err;
      for (var j = 0; j < 8; j++) gW3[0][j] += dy * f.a2[j];
      gb3 += dy;

      var dz2 = [];
      for (var j2 = 0; j2 < 8; j2++) {
        var da2 = dy * dl.W3[0][j2];
        dz2.push(da2 * (1 - f.a2[j2] * f.a2[j2]));
      }
      for (var i2 = 0; i2 < 8; i2++) {
        for (var j3 = 0; j3 < 8; j3++) gW2[i2][j3] += dz2[i2] * f.a1[j3];
        gb2[i2] += dz2[i2];
      }

      var dz1 = [];
      for (var j4 = 0; j4 < 8; j4++) {
        var da1 = 0;
        for (var k = 0; k < 8; k++) da1 += dl.W2[k][j4] * dz2[k];
        dz1.push(da1 * (1 - f.a1[j4] * f.a1[j4]));
      }
      for (var i3 = 0; i3 < 8; i3++) {
        for (var j5 = 0; j5 < 3; j5++) gW1[i3][j5] += dz1[i3] * d.x[j5];
        gb1[i3] += dz1[i3];
      }
    }

    var scale = DL_LR / DL_BATCH;
    for (var a = 0; a < 8; a++) {
      for (var b = 0; b < 3; b++) dl.W1[a][b] -= scale * gW1[a][b];
      dl.b1[a] -= scale * gb1[a];
      for (var c = 0; c < 8; c++) {
        dl.W2[a][c] -= scale * gW2[a][c];
        if (a === 0) dl.W3[0][c] -= scale * gW3[0][c];
      }
      dl.b2[a] -= scale * gb2[a];
    }
    dl.b3[0] -= scale * gb3;

    dl.iter++;
    return loss / DL_BATCH;
  }

  function dlTick(dt) {
    var loss = 0;
    for (var s = 0; s < DL_STEPS_PER_TICK; s++) loss = dlStep();
    dl.lossHist.push(loss);
    if (dl.lossHist.length > 400) dl.lossHist.shift();

    dl.sampleTimer += dt;
    if (dl.sampleTimer > 0.5) {
      dl.sampleTimer = 0;
      dl.sampleIdx = (dl.sampleIdx + 1) % dl.data.test.length;
    }
    var sample = dl.data.test[dl.sampleIdx];
    dl.lastActs = dlForward(sample.x);

    if (dl.iter >= DL_MAX_ITERS) {
      dl.run++;
      dlReset();
    }
  }

  function dlDraw() {
    // Left: network diagram with live activations.
    if (dlNetCtx) {
      var ctx = dlNetCtx;
      chartFrame(ctx, PANEL_W, PANEL_H,
        "deep network · 3–8–8–1 · backpropagation · run " + dl.run);

      var cols = [90, 230, 370, 510];
      var area = { top: 56, bottom: PANEL_H - 44 };

      function nodePos(layer, idx, count) {
        var span = area.bottom - area.top;
        var y = count === 1
          ? (area.top + area.bottom) / 2
          : area.top + span * idx / (count - 1);
        return { x: cols[layer], y: y };
      }

      // Edges, alpha by weight magnitude.
      function drawEdges(W, l) {
        var maxW = 0.001;
        W.forEach(function (row) {
          row.forEach(function (w) {
            if (Math.abs(w) > maxW) maxW = Math.abs(w);
          });
        });
        W.forEach(function (row, i) {
          row.forEach(function (w, j) {
            var a = nodePos(l + 1, i, DL_LAYERS[l + 1]);
            var b = nodePos(l, j, DL_LAYERS[l]);
            ctx.strokeStyle = COLORS.jobs[1];
            ctx.globalAlpha = 0.08 +
              0.5 * Math.min(Math.abs(w) / maxW, 1);
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(a.x, a.y);
            ctx.stroke();
          });
        });
        ctx.globalAlpha = 1;
      }

      drawEdges(dl.W1, 0);
      drawEdges(dl.W2, 1);
      drawEdges(dl.W3, 2);

      // Nodes with activation brightness.
      var acts = dl.lastActs;
      var inputLabels = ["proc", "ops", "slack"];

      DL_LAYERS.forEach(function (count, l) {
        for (var i = 0; i < count; i++) {
          var p = nodePos(l, i, count);
          var act = 0;
          if (acts) {
            if (l === 0) {
              var sample = dl.data.test[dl.sampleIdx];
              act = sample.x[i];
            } else if (l === 1) act = (acts.a1[i] + 1) / 2;
            else if (l === 2) act = (acts.a2[i] + 1) / 2;
            else act = Math.min(Math.max(acts.y, 0), 1);
          }
          ctx.fillStyle = COLORS.jobs[1];
          ctx.globalAlpha = 0.15 + 0.75 * act;
          ctx.beginPath();
          ctx.arc(p.x, p.y, l === 3 ? 7 : 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = COLORS.rule;
          ctx.stroke();

          if (l === 0) {
            ctx.fillStyle = COLORS.text;
            ctx.textAlign = "right";
            ctx.fillText(inputLabels[i], p.x - 12, p.y);
          }
          if (l === 3) {
            ctx.fillStyle = COLORS.paper;
            ctx.textAlign = "left";
            ctx.fillText("floŵ", p.x + 14, p.y);
          }
        }
      });

      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "center";
      ctx.fillText("input features", cols[0], PANEL_H - 22);
      ctx.fillText("hidden layers", (cols[1] + cols[2]) / 2, PANEL_H - 22);
      ctx.fillText("output", cols[3], PANEL_H - 22);
    }

    // Right: loss curve.
    if (!dlChartCtx) return;
    var fr = chartFrame(dlChartCtx, CHART_W, PANEL_H, "training loss");

    if (dl.lossHist.length > 1) {
      var scales = makeScales(dl.lossHist, fr.padT, fr.padB, PANEL_H);
      drawGrid(dlChartCtx, scales, fr.padL, fr.padR,
        fr.padT, fr.padB, CHART_W, PANEL_H);

      var w = CHART_W - fr.padL - fr.padR;
      dlChartCtx.strokeStyle = COLORS.jobs[1];
      dlChartCtx.lineWidth = 1.6;
      dlChartCtx.beginPath();
      dl.lossHist.forEach(function (v, i) {
        var x = fr.padL + (i / (dl.lossHist.length - 1)) * w;
        if (i === 0) dlChartCtx.moveTo(x, scales.Y(v));
        else dlChartCtx.lineTo(x, scales.Y(v));
      });
      dlChartCtx.stroke();
      dlChartCtx.lineWidth = 1;
    }

    dlChartCtx.fillStyle = COLORS.text;
    dlChartCtx.textAlign = "left";
    dlChartCtx.fillText("iter " + dl.iter, fr.padL, PANEL_H - 16);

    var r2 = r2Score(dlPredict, dl.data.test);
    var lossNow = dl.lossHist.length
      ? dl.lossHist[dl.lossHist.length - 1]
      : 0;

    if (dlEls.iter) dlEls.iter.textContent = dl.iter;
    if (dlEls.loss) dlEls.loss.textContent = lossNow.toFixed(4);
    if (dlEls.r2) dlEls.r2.textContent = r2.toFixed(3);
  }

  // ============================================================
  // Panel 06 — Reinforcement learning: Q-learning dispatcher
  // ============================================================
  // A single machine with stochastic arrivals. At every decision point the
  // agent observes the shop state and picks WHICH rule to dispatch with
  // (SPT / EDD / LPT). Reward punishes waiting work and tardy completions.
  // Q(s,a) is updated by temporal-difference learning; nothing about the
  // rules is known in advance.

  var rlShopCanvas = document.getElementById("rl-shop");
  var rlChartCanvas = document.getElementById("rl-chart");
  var rlShopCtx = rlShopCanvas ? setupCanvas(rlShopCanvas, PANEL_W, PANEL_H) : null;
  var rlChartCtx = rlChartCanvas ? setupCanvas(rlChartCanvas, CHART_W, PANEL_H) : null;

  var RL_ACTIONS = ["SPT", "EDD", "LPT"];
  var RL_QBINS = 4; // queue length bins
  var RL_SBINS = 3; // slack bins
  var RL_NSTATES = RL_QBINS * RL_SBINS;
  var RL_ALPHA = 0.25;
  var RL_GAMMA = 0.9;
  var RL_EPISODE_LEN = 120;

  var rl = {
    rng: mulberry32(5150),
    Q: [],
    env: null,
    episode: 0,
    epsilon: 0.6,
    lastState: -1,
    lastAction: -1,
    pendingReward: 0,
    lastDecisionState: -1,
    lastDecisionAction: -1,
    epTardiness: 0,
    tardHist: [],
    running: true
  };

  var rlEls = {
    episode: document.querySelector('[data-rl="episode"]'),
    eps: document.querySelector('[data-rl="eps"]'),
    tard: document.querySelector('[data-rl="tard"]')
  };

  function rlInitQ() {
    rl.Q = [];
    for (var s = 0; s < RL_NSTATES; s++) {
      rl.Q.push([0, 0, 0]);
    }
  }

  function rlNewEnv() {
    var env = {
      t: 0,
      nextArrival: 1,
      nextJobId: 1,
      queue: [],
      current: null,
      completed: 0,
      tardy: 0
    };
    // Warm the queue a little so decisions start immediately.
    for (var i = 0; i < 3; i++) {
      env.queue.push(rlMakeJob(env, 0));
    }
    return env;
  }

  function rlMakeJob(env, t) {
    var p = 3 + rl.rng() * 6;
    return {
      id: env.nextJobId++,
      p: p,
      remaining: p,
      arrival: t,
      dueDate: t + p * (1.6 + rl.rng() * 2.2),
      color: COLORS.jobs[(env.nextJobId - 1) % COLORS.jobs.length]
    };
  }

  function rlState(env) {
    var q = env.queue.length;
    var qbin = q <= 1 ? 0 : q <= 3 ? 1 : q <= 6 ? 2 : 3;

    var minSlack = Infinity;
    env.queue.forEach(function (j) {
      var s = j.dueDate - env.t - j.remaining;
      if (s < minSlack) minSlack = s;
    });
    var sbin = minSlack < 2 ? 0 : minSlack < 8 ? 1 : 2;

    return qbin * RL_SBINS + sbin;
  }

  function rlPickByRule(env, action) {
    var best = null;
    var bestKey = Infinity;
    env.queue.forEach(function (j) {
      var key;
      if (action === 0) key = j.remaining;                 // SPT
      else if (action === 1) key = j.dueDate;              // EDD
      else key = -j.remaining;                             // LPT
      if (key < bestKey) {
        bestKey = key;
        best = j;
      }
    });
    return best;
  }

  function rlGreedyAction(s) {
    var best = 0;
    for (var a = 1; a < 3; a++) {
      if (rl.Q[s][a] > rl.Q[s][best]) best = a;
    }
    return best;
  }

  function rlEnvStep(dt) {
    var env = rl.env;
    env.t += dt;

    // Arrivals.
    while (env.nextArrival <= env.t) {
      env.queue.push(rlMakeJob(env, env.nextArrival));
      env.nextArrival += 2.5 + rl.rng() * 3.5;
    }

    // Waiting-work penalty accumulates between decisions.
    rl.pendingReward -= 0.012 * env.queue.length * dt;

    // Decision point: machine idle with work waiting.
    if (!env.current && env.queue.length) {
      var s = rlState(env);

      // Close the previous (s,a,r,s') transition.
      if (rl.lastState >= 0) {
        var target = rl.pendingReward +
          RL_GAMMA * Math.max.apply(null, rl.Q[s]);
        rl.Q[rl.lastState][rl.lastAction] += RL_ALPHA *
          (target - rl.Q[rl.lastState][rl.lastAction]);
      }

      // ε-greedy action.
      var greedy = rlGreedyAction(s);
      var explore = rl.rng() < rl.epsilon;
      var a = explore ? Math.floor(rl.rng() * 3) : greedy;
      rl.lastWasGreedy = !explore;

      var job = rlPickByRule(env, a);
      env.queue.splice(env.queue.indexOf(job), 1);
      env.current = job;

      rl.lastState = s;
      rl.lastAction = a;
      rl.lastDecisionState = s;
      rl.lastDecisionAction = a;
      rl.pendingReward = 0;
    }

    // Processing.
    if (env.current) {
      env.current.remaining -= dt;
      if (env.current.remaining <= 0) {
        var tard = Math.max(0, env.t - env.current.dueDate);
        rl.pendingReward -= tard * 0.5;
        rl.epTardiness += tard;
        env.completed++;
        if (tard > 0) env.tardy++;
        env.current = null;
      }
    }
  }

  function rlTick() {
    var env = rl.env;
    var dt = 0.5;
    var stepsPerTick = 4;

    for (var i = 0; i < stepsPerTick; i++) {
      rlEnvStep(dt);

      if (env.t >= RL_EPISODE_LEN) {
        rl.tardHist.push(rl.epTardiness);
        if (rl.tardHist.length > 48) rl.tardHist.shift();

        rl.episode++;
        rl.epsilon = Math.max(0.05, rl.epsilon * 0.96);
        rl.epTardiness = 0;
        rl.lastState = -1;
        rl.pendingReward = 0;
        rl.env = rlNewEnv();
        env = rl.env;
      }
    }
  }

  function rlDraw() {
    var env = rl.env;

    // Left: the agent's shop floor.
    if (rlShopCtx) {
      var ctx = rlShopCtx;
      chartFrame(ctx, PANEL_W, PANEL_H,
        "Q-learning dispatcher · episode " + (rl.episode + 1));

      // Machine box.
      var mx = 70;
      var my = 90;
      var mw = 190;
      var mh = 90;

      ctx.strokeStyle = COLORS.paper;
      ctx.strokeRect(mx + 0.5, my + 0.5, mw, mh);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.fillText("machine", mx, my - 14);

      if (env.current) {
        var job = env.current;
        var prog = 1 - job.remaining / job.p;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = job.color;
        ctx.fillRect(mx + 1, my + 1, mw * prog, mh - 1);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = job.color;
        ctx.strokeRect(mx + 1, my + 1, Math.max(mw * prog, 2), mh - 1);
        ctx.fillStyle = COLORS.paper;
        ctx.fillText(
          "J" + job.id + "  " + job.remaining.toFixed(1) + " left",
          mx + 10, my + mh / 2
        );
      } else {
        ctx.fillStyle = COLORS.text;
        ctx.fillText("idle", mx + 10, my + mh / 2);
      }

      // Queue.
      ctx.fillStyle = COLORS.text;
      ctx.fillText("queue (" + env.queue.length + ")", 300, my - 14);
      env.queue.slice(0, 8).forEach(function (j, i) {
        var qx = 300 + (i % 4) * 56;
        var qy = my + Math.floor(i / 4) * 46;
        var slack = j.dueDate - env.t - j.remaining;
        ctx.strokeStyle = j.color;
        ctx.strokeRect(qx + 0.5, qy + 0.5, 46, 36);
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = j.color;
        ctx.fillRect(qx + 1, qy + 1, 45, 35);
        ctx.globalAlpha = 1;
        ctx.fillStyle = COLORS.paper;
        ctx.textAlign = "left";
        ctx.fillText("J" + j.id, qx + 5, qy + 11);
        ctx.fillStyle = slack < 2 ? "#d98e8e" : COLORS.text;
        ctx.fillText("s" + slack.toFixed(0), qx + 5, qy + 26);
      });

      // Current decision readout.
      var readY = my + mh + 60;
      if (rl.lastDecisionState >= 0) {
        var s = rl.lastDecisionState;
        var qb = Math.floor(s / RL_SBINS);
        var sb = s % RL_SBINS;
        var qTxt = ["empty–low", "low", "medium", "high"][qb];
        var sTxt = ["tight", "medium", "loose"][sb];

        ctx.fillStyle = COLORS.text;
        ctx.fillText("state:  queue " + qTxt + " · slack " + sTxt, 70, readY);
        ctx.fillStyle = COLORS.paper;
        ctx.fillText(
          "action: dispatch by " + RL_ACTIONS[rl.lastDecisionAction] +
          (rl.lastWasGreedy ? "  (greedy)" : "  (exploring)"),
          70, readY + 26
        );
      }

      ctx.fillStyle = COLORS.text;
      ctx.fillText(
        "completed " + env.completed + " · tardy " + env.tardy,
        70, readY + 60
      );
    }

    // Right: Q-table heatmap + learning curve.
    if (!rlChartCtx) return;
    var ctx2 = rlChartCtx;
    var fr = chartFrame(ctx2, CHART_W, PANEL_H, "Q-table (12 states × 3 rules)");

    // Heatmap.
    var hx0 = fr.padL + 44;
    var hy0 = fr.padT + 6;
    var cellW = 52;
    var cellH = 11;
    var gap = 1;

    var qMin = Infinity;
    var qMax = -Infinity;
    rl.Q.forEach(function (row) {
      row.forEach(function (v) {
        if (v < qMin) qMin = v;
        if (v > qMax) qMax = v;
      });
    });
    var span = Math.max(qMax - qMin, 0.001);

    RL_ACTIONS.forEach(function (name, a) {
      ctx2.fillStyle = COLORS.text;
      ctx2.textAlign = "center";
      ctx2.fillText(name, hx0 + a * (cellW + gap) + cellW / 2, hy0 - 8);
    });

    for (var s2 = 0; s2 < RL_NSTATES; s2++) {
      for (var a2 = 0; a2 < 3; a2++) {
        var v = (rl.Q[s2][a2] - qMin) / span;
        var cx = hx0 + a2 * (cellW + gap);
        var cy = hy0 + s2 * (cellH + gap);

        ctx2.fillStyle = COLORS.jobs[1];
        ctx2.globalAlpha = 0.10 + 0.65 * v;
        ctx2.fillRect(cx, cy, cellW, cellH);
        ctx2.globalAlpha = 1;

        if (rlGreedyAction(s2) === a2) {
          ctx2.strokeStyle = COLORS.paper;
          ctx2.strokeRect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1);
        }
      }
    }

    // Learning curve (tardiness per episode).
    var curveTop = hy0 + RL_NSTATES * (cellH + gap) + 26;
    ctx2.fillStyle = COLORS.paper;
    ctx2.textAlign = "left";
    ctx2.fillText("tardiness per episode", fr.padL, curveTop - 8);

    if (rl.tardHist.length > 1) {
      var scales = makeScales(rl.tardHist, curveTop + 6, 20, PANEL_H);
      var w = CHART_W - fr.padL - fr.padR;
      ctx2.strokeStyle = COLORS.jobs[1];
      ctx2.lineWidth = 1.6;
      ctx2.beginPath();
      rl.tardHist.forEach(function (v, i) {
        var x = fr.padL + (i / (rl.tardHist.length - 1)) * w;
        if (i === 0) ctx2.moveTo(x, scales.Y(v));
        else ctx2.lineTo(x, scales.Y(v));
      });
      ctx2.stroke();
      ctx2.lineWidth = 1;
    }

    var lastTard = rl.tardHist.length
      ? rl.tardHist[rl.tardHist.length - 1]
      : 0;

    if (rlEls.episode) rlEls.episode.textContent = rl.episode + 1;
    if (rlEls.eps) rlEls.eps.textContent = rl.epsilon.toFixed(2);
    if (rlEls.tard) rlEls.tard.textContent = lastTard.toFixed(1);
  }

  // ============================================================
  // Main loop
  // ============================================================

  mlReset();
  dlReset();
  rlInitQ();
  rl.env = rlNewEnv();

  // Warm start so nothing opens empty.
  var w;
  for (w = 0; w < 120; w++) mlTick();
  for (w = 0; w < 120; w++) dlTick(0.1);
  for (w = 0; w < 60; w++) rlTick();

  mlDraw();
  dlDraw();
  rlDraw();

  var running = !reduceMotion;
  var last = null;

  function frame(ts) {
    if (!running) return;
    if (last === null) last = ts;
    var dt = Math.min((ts - last) / 1000, 0.1);
    last = ts;

    if (ml.running) mlTick();
    if (dl.running) dlTick(dt);
    if (rl.running) rlTick();

    mlDraw();
    dlDraw();
    rlDraw();

    requestAnimationFrame(frame);
  }

  if (running) requestAnimationFrame(frame);

  var panels = { ml: ml, dl: dl, rl: rl };

  document.querySelectorAll(".sim-toggle[data-panel]").forEach(function (btn) {
    var panel = panels[btn.getAttribute("data-panel")];
    if (!panel) return;

    panel.running = running;
    btn.textContent = running ? "Pause" : "Play";

    btn.addEventListener("click", function () {
      panel.running = !panel.running;
      btn.textContent = panel.running ? "Pause" : "Play";

      if (panel.running && !running) {
        running = true;
        last = null;
        requestAnimationFrame(frame);
      }
    });
  });

})();
