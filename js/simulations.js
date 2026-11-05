
// Wasif Ullah — Academic Website
// Simulations page: three small, self-contained browser demonstrations.
//
//   01  NEH construction for a static hybrid flow shop (HFS)
//   02  Simulated annealing — single-solution metaheuristic search
//   03  Genetic algorithm — population-based evolutionary search
//
// All three share the same HFS machinery and run entirely in the browser.
// Illustrative, not experimental data.

(function () {
  "use strict";

  var hfsCanvas = document.getElementById("hfs-gantt");
  if (!hfsCanvas) return;

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
      "#93a3b8", "#4a6787", "#7d9cc4",
      "#5b7ba3", "#a3b8cf"
    ]
  };

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

  var rng = mulberry32(20261105);

  function randRange(a, b) { return a + rng() * (b - a); }
  function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }

  // ---------- Hybrid flow shop machinery ----------

  var STAGE_MACHINES = [2, 3, 2]; // machines per stage

  function makeInstance(nJobs) {
    var jobs = [];
    for (var i = 0; i < nJobs; i++) {
      var p = [];
      var total = 0;
      for (var s = 0; s < STAGE_MACHINES.length; s++) {
        var pt = randRange(3, 11);
        p.push(pt);
        total += pt;
      }
      jobs.push({
        id: i,
        p: p,
        total: total,
        color: COLORS.jobs[i % COLORS.jobs.length]
      });
    }
    return { jobs: jobs, n: nJobs };
  }

  // Serial schedule generation: jobs in permutation order, each assigned
  // at every stage to the machine that lets it finish earliest.
  function schedule(perm, inst) {
    var avail = STAGE_MACHINES.map(function (k) {
      var arr = [];
      for (var i = 0; i < k; i++) arr.push(0);
      return arr;
    });

    var ops = [];
    var makespan = 0;

    perm.forEach(function (jid) {
      var job = inst.jobs[jid];
      var prev = 0;

      for (var s = 0; s < STAGE_MACHINES.length; s++) {
        var bestM = 0;
        var bestStart = 0;
        var bestEnd = Infinity;

        for (var m = 0; m < avail[s].length; m++) {
          var st = Math.max(avail[s][m], prev);
          var en = st + job.p[s];
          if (en < bestEnd) {
            bestEnd = en;
            bestStart = st;
            bestM = m;
          }
        }

        avail[s][bestM] = bestEnd;
        prev = bestEnd;
        if (bestEnd > makespan) makespan = bestEnd;

        ops.push({
          job: jid,
          stage: s,
          machine: bestM,
          start: bestStart,
          end: bestEnd
        });
      }
    });

    return { ops: ops, makespan: makespan };
  }

  // ---------- Canvas setup ----------

  function setupCanvas(canvas, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.aspectRatio = w + " / " + h;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // ---------- Shared HFS Gantt drawing ----------

  var ROW_H = 30;
  var ROW_GAP = 6;
  var STAGE_GAP = 16;

  function machineRows() {
    // Flattened row list: [{stage, machine}] with y offsets.
    var rows = [];
    var y = 34;
    STAGE_MACHINES.forEach(function (count, s) {
      for (var m = 0; m < count; m++) {
        rows.push({ stage: s, machine: m, y: y });
        y += ROW_H + ROW_GAP;
      }
      y += STAGE_GAP - ROW_GAP;
    });
    return { rows: rows, height: y + 24 };
  }

  var ROWS = machineRows();
  var GANTT_H = Math.round(ROWS.height);

  function drawHfsGantt(ctx, W, inst, sched, highlightJob) {
    var labelW = 64;
    var padR = 18;
    var padT = 34;
    var x1 = W - padR;
    var mk = Math.max(sched.makespan, 1);

    function X(t) {
      return labelW + (x1 - labelW) * t / (mk * 1.04);
    }

    ctx.clearRect(0, 0, W, GANTT_H);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, GANTT_H);
    ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";

    // Time gridlines.
    var tickStep = mk > 90 ? 20 : 10;
    ctx.strokeStyle = COLORS.panelLine;
    ctx.fillStyle = COLORS.text;
    ctx.lineWidth = 1;

    for (var t = 0; t <= mk; t += tickStep) {
      var gx = X(t);
      ctx.beginPath();
      ctx.moveTo(gx, padT - 10);
      ctx.lineTo(gx, GANTT_H - 22);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(t)), gx, padT - 18);
    }

    // Machine rows with stage labels.
    var lastStage = -1;
    ROWS.rows.forEach(function (row) {
      if (row.stage !== lastStage) {
        lastStage = row.stage;
        ctx.fillStyle = COLORS.paper;
        ctx.textAlign = "left";
        ctx.fillText("S" + (row.stage + 1), 8, row.y + ROW_H / 2);
      }
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.fillText("M" + (row.machine + 1), 30, row.y + ROW_H / 2);

      ctx.strokeStyle = COLORS.panelLine;
      ctx.beginPath();
      ctx.moveTo(labelW, row.y + ROW_H + ROW_GAP / 2);
      ctx.lineTo(x1, row.y + ROW_H + ROW_GAP / 2);
      ctx.stroke();
    });

    // Operations.
    sched.ops.forEach(function (op) {
      var row = null;
      for (var i = 0; i < ROWS.rows.length; i++) {
        var r = ROWS.rows[i];
        if (r.stage === op.stage && r.machine === op.machine) {
          row = r;
          break;
        }
      }
      if (!row) return;

      var job = inst.jobs[op.job];
      var xa = X(op.start);
      var xb = X(op.end);

      var dim = highlightJob !== null &&
        highlightJob !== undefined && op.job !== highlightJob;

      ctx.globalAlpha = dim ? 0.10 : 0.30;
      ctx.fillStyle = job.color;
      ctx.fillRect(xa, row.y, xb - xa, ROW_H);
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.strokeStyle = job.color;
      ctx.strokeRect(xa + 0.5, row.y + 0.5, xb - xa - 1, ROW_H - 1);
      ctx.globalAlpha = 1;

      if (xb - xa > 24 && !dim) {
        ctx.fillStyle = job.color;
        ctx.textAlign = "left";
        ctx.fillText("J" + (op.job + 1), xa + 5, row.y + ROW_H / 2);
      }
    });

    // Makespan marker.
    var mx = X(mk);
    ctx.strokeStyle = COLORS.paper;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(mx, padT - 8);
    ctx.lineTo(mx, GANTT_H - 24);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.paper;
    ctx.textAlign = "right";
    ctx.fillText("makespan " + mk.toFixed(1), x1, GANTT_H - 10);
  }

  // ---------- Shared fitness-chart drawing ----------

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

  function chartScales(values, padT, padB, H) {
    var vmax = -Infinity;
    var vmin = Infinity;
    values.forEach(function (v) {
      if (v > vmax) vmax = v;
      if (v < vmin) vmin = v;
    });
    if (vmax === vmin) { vmax += 1; vmin -= 1; }
    var pad = Math.max((vmax - vmin) * 0.15, 2);
    vmax += pad;
    vmin -= pad;
    return {
      vmin: vmin,
      vmax: vmax,
      Y: function (v) {
        return padT + (H - padT - padB) -
          (v - vmin) / (vmax - vmin) * (H - padT - padB);
      }
    };
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
      ctx.fillText(String(Math.round(gv)), padL - 8, gy);
    }
  }

  // ============================================================
  // Panel 01 — NEH construction
  // ============================================================

  var HFS_W = 760;
  var hfsCtx = setupCanvas(hfsCanvas, HFS_W, GANTT_H);

  var hfs = {
    inst: null,
    steps: [],
    order: [],
    k: 0,
    timer: 0,
    hold: 0,
    running: true
  };

  var hfsEls = {
    msg: document.getElementById("hfs-msg"),
    step: document.querySelector('[data-hfs="step"]'),
    ms: document.querySelector('[data-hfs="ms"]')
  };

  function nehSteps(inst) {
    var order = inst.jobs.slice().sort(function (a, b) {
      return b.total - a.total;
    }).map(function (j) { return j.id; });

    var seq = [];
    var steps = [];

    order.forEach(function (jid) {
      var bestPos = 0;
      var bestMs = Infinity;
      var bestSeq = null;

      for (var pos = 0; pos <= seq.length; pos++) {
        var cand = seq.slice();
        cand.splice(pos, 0, jid);
        var ms = schedule(cand, inst).makespan;
        if (ms < bestMs) {
          bestMs = ms;
          bestPos = pos;
          bestSeq = cand;
        }
      }

      seq = bestSeq;
      steps.push({ job: jid, pos: bestPos, ms: bestMs, seq: seq.slice() });
    });

    return { order: order, steps: steps };
  }

  function hfsReset() {
    hfs.inst = makeInstance(8);
    var r = nehSteps(hfs.inst);
    hfs.order = r.order;
    hfs.steps = r.steps;
    hfs.k = 0;
    hfs.timer = 0;
    hfs.hold = 0;

    if (hfsEls.msg) {
      hfsEls.msg.textContent =
        "construction order (largest total work first): " +
        r.order.map(function (j) { return "J" + (j + 1); }).join(" ");
    }
  }

  var HFS_STEP_T = 1.5;
  var HFS_HOLD_T = 5.0;

  function hfsTick(dt) {
    if (hfs.k < hfs.steps.length) {
      hfs.timer += dt;
      if (hfs.timer >= HFS_STEP_T) {
        hfs.timer = 0;
        hfs.k++;
      }
    } else {
      hfs.hold += dt;
      if (hfs.hold >= HFS_HOLD_T) hfsReset();
    }
  }

  function hfsDraw() {
    var done = hfs.k >= hfs.steps.length;
    var k = Math.max(hfs.k, 1);
    var st = hfs.steps[k - 1];

    if (!st) {
      drawHfsGantt(hfsCtx, HFS_W, hfs.inst, { ops: [], makespan: 1 }, null);
      return;
    }

    var sched = schedule(st.seq, hfs.inst);
    drawHfsGantt(hfsCtx, HFS_W, hfs.inst, sched, done ? null : st.job);

    if (hfsEls.step) {
      hfsEls.step.textContent = k + " / " + hfs.steps.length;
    }
    if (hfsEls.ms) {
      hfsEls.ms.textContent = st.ms.toFixed(1);
    }
    if (hfsEls.msg) {
      if (done) {
        hfsEls.msg.textContent =
          "construction complete — final sequence " +
          st.seq.map(function (j) { return "J" + (j + 1); }).join(" ") +
          " · restarting with a new instance…";
      } else {
        hfsEls.msg.textContent =
          "inserting J" + (st.job + 1) +
          " — best position " + (st.pos + 1) +
          " of " + st.seq.length +
          " · partial makespan " + st.ms.toFixed(1);
      }
    }
  }

  // ============================================================
  // Panel 02 — Simulated annealing
  // ============================================================

  var saGanttCanvas = document.getElementById("sa-gantt");
  var saChartCanvas = document.getElementById("sa-chart");
  var SA_GW = 560;
  var SA_CW = 380;
  var saGctx = saGanttCanvas ? setupCanvas(saGanttCanvas, SA_GW, GANTT_H) : null;
  var saCctx = saChartCanvas ? setupCanvas(saChartCanvas, SA_CW, GANTT_H) : null;

  var sa = {
    inst: null,
    perm: [],
    fit: 0,
    bestPerm: [],
    bestFit: 0,
    initFit: 0,
    T: 0,
    iter: 0,
    accepted: 0,
    bestHist: [],
    worsePts: [],
    running: true
  };

  var saEls = {
    iter: document.querySelector('[data-sa="iter"]'),
    temp: document.querySelector('[data-sa="temp"]'),
    best: document.querySelector('[data-sa="best"]'),
    gain: document.querySelector('[data-sa="gain"]')
  };

  function saReset() {
    sa.inst = makeInstance(10);
    sa.perm = [];
    for (var i = 0; i < sa.inst.n; i++) sa.perm.push(i);
    // Shuffle.
    for (var k = sa.perm.length - 1; k > 0; k--) {
      var j = Math.floor(rng() * (k + 1));
      var tmp = sa.perm[k];
      sa.perm[k] = sa.perm[j];
      sa.perm[j] = tmp;
    }
    sa.fit = schedule(sa.perm, sa.inst).makespan;
    sa.bestPerm = sa.perm.slice();
    sa.bestFit = sa.fit;
    sa.initFit = sa.fit;
    sa.T = sa.fit * 0.10;
    sa.iter = 0;
    sa.accepted = 0;
    sa.bestHist = [];
    sa.worsePts = [];
  }

  var SA_ITERS_PER_TICK = 3;
  var SA_COOLING = 0.996;

  function saNeighbor(perm) {
    // Insertion move.
    var p = perm.slice();
    var i = Math.floor(rng() * p.length);
    var j = Math.floor(rng() * p.length);
    var v = p.splice(i, 1)[0];
    p.splice(j, 0, v);
    return p;
  }

  function saTick() {
    for (var n = 0; n < SA_ITERS_PER_TICK; n++) {
      if (sa.T < sa.initFit * 0.0006) {
        saReset();
        return;
      }

      var cand = saNeighbor(sa.perm);
      var f = schedule(cand, sa.inst).makespan;
      var d = f - sa.fit;

      if (d <= 0 || rng() < Math.exp(-d / sa.T)) {
        sa.perm = cand;
        sa.fit = f;
        sa.accepted++;
        if (d > 0.001) {
          sa.worsePts.push({ i: sa.iter, f: f });
        }
        if (f < sa.bestFit) {
          sa.bestFit = f;
          sa.bestPerm = cand.slice();
        }
      }

      sa.bestHist.push(sa.bestFit);
      if (sa.worsePts.length > 240) sa.worsePts.shift();
      if (sa.bestHist.length > 900) sa.bestHist.shift();

      sa.T *= SA_COOLING;
      sa.iter++;
    }
  }

  function saDraw() {
    if (saGctx) {
      var sched = schedule(sa.bestPerm, sa.inst);
      drawHfsGantt(saGctx, SA_GW, sa.inst, sched, null);
    }

    if (!saCctx) return;
    var W = SA_CW;
    var H = GANTT_H;
    var fr = chartFrame(saCctx, W, H, "simulated annealing · makespan");
    var w = W - fr.padL - fr.padR;

    var values = sa.bestHist.concat(sa.worsePts.map(function (p) {
      return p.f;
    }));
    if (!values.length) return;

    var scales = chartScales(values, fr.padT, fr.padB, H);
    drawGrid(saCctx, scales, fr.padL, fr.padR, fr.padT, fr.padB, W, H);

    var i0 = Math.max(0, sa.iter - sa.bestHist.length);

    function X(iter) {
      var span = Math.max(sa.bestHist.length - 1, 1);
      return fr.padL + ((iter - i0) / span) * w;
    }

    // Accepted worse moves (exploration dots).
    saCctx.fillStyle = COLORS.text;
    sa.worsePts.forEach(function (p) {
      if (p.i < i0) return;
      saCctx.globalAlpha = 0.55;
      saCctx.fillRect(X(p.i) - 1, scales.Y(p.f) - 1, 2.5, 2.5);
    });
    saCctx.globalAlpha = 1;

    // Best-so-far line.
    if (sa.bestHist.length > 1) {
      saCctx.strokeStyle = COLORS.jobs[1];
      saCctx.lineWidth = 1.6;
      saCctx.beginPath();
      sa.bestHist.forEach(function (v, i) {
        var x = X(i0 + i);
        if (i === 0) saCctx.moveTo(x, scales.Y(v));
        else saCctx.lineTo(x, scales.Y(v));
      });
      saCctx.stroke();
      saCctx.lineWidth = 1;
    }

    saCctx.fillStyle = COLORS.text;
    saCctx.textAlign = "left";
    saCctx.fillText("iter " + sa.iter, fr.padL, H - 16);
    saCctx.textAlign = "right";
    saCctx.fillStyle = COLORS.paper;
    saCctx.fillText("best " + sa.bestFit.toFixed(1), fr.padL + w, H - 16);

    if (saEls.iter) saEls.iter.textContent = sa.iter;
    if (saEls.temp) saEls.temp.textContent = sa.T.toFixed(2);
    if (saEls.best) saEls.best.textContent = sa.bestFit.toFixed(1);
    if (saEls.gain) {
      var gain = (1 - sa.bestFit / sa.initFit) * 100;
      saEls.gain.textContent = gain.toFixed(1) + "%";
    }
  }

  // ============================================================
  // Panel 03 — Genetic algorithm (population search)
  // ============================================================

  var gaGanttCanvas = document.getElementById("ga-gantt");
  var gaChartCanvas = document.getElementById("ga-chart");
  var GA_GW = 560;
  var GA_CW = 380;
  var gaGctx = gaGanttCanvas ? setupCanvas(gaGanttCanvas, GA_GW, GANTT_H) : null;
  var gaCctx = gaChartCanvas ? setupCanvas(gaChartCanvas, GA_CW, GANTT_H) : null;

  var ga = {
    inst: null,
    pop: [],
    gen: 0,
    run: 1,
    bestEver: null,
    bestFit: Infinity,
    initFit: 0,
    scatter: [],
    bestHist: [],
    meanHist: [],
    timer: 0,
    running: true
  };

  var gaEls = {
    gen: document.querySelector('[data-ga="gen"]'),
    best: document.querySelector('[data-ga="best"]'),
    mean: document.querySelector('[data-ga="mean"]'),
    gain: document.querySelector('[data-ga="gain"]')
  };

  var GA_POP = 24;
  var GA_ELITE = 2;
  var GA_MAXGENS = 45;
  var GA_GEN_T = 0.65;

  function randomPerm(n) {
    var p = [];
    for (var i = 0; i < n; i++) p.push(i);
    for (var k = n - 1; k > 0; k--) {
      var j = Math.floor(rng() * (k + 1));
      var tmp = p[k];
      p[k] = p[j];
      p[j] = tmp;
    }
    return p;
  }

  // Order crossover (OX1).
  function ox(p1, p2) {
    var n = p1.length;
    var i = randInt(0, n - 1);
    var j = randInt(0, n - 1);
    if (i > j) { var t = i; i = j; j = t; }

    var child = new Array(n).fill(-1);
    var inSeg = {};
    for (var k = i; k <= j; k++) {
      child[k] = p1[k];
      inSeg[p1[k]] = true;
    }
    var pos = (j + 1) % n;
    for (var k2 = 0; k2 < n; k2++) {
      var g = p2[(j + 1 + k2) % n];
      if (!inSeg[g]) {
        child[pos] = g;
        pos = (pos + 1) % n;
      }
    }
    return child;
  }

  function swapMutate(p) {
    var c = p.slice();
    var i = Math.floor(rng() * c.length);
    var j = Math.floor(rng() * c.length);
    var t = c[i];
    c[i] = c[j];
    c[j] = t;
    return c;
  }

  function gaReset() {
    ga.inst = makeInstance(10);
    ga.pop = [];
    for (var i = 0; i < GA_POP; i++) {
      ga.pop.push({ perm: randomPerm(ga.inst.n), fit: null });
    }
    ga.gen = 0;
    ga.bestEver = null;
    ga.bestFit = Infinity;
    ga.initFit = 0;
    ga.scatter = [];
    ga.bestHist = [];
    ga.meanHist = [];
  }

  function gaTournament(scored) {
    var best = null;
    for (var i = 0; i < 3; i++) {
      var c = scored[Math.floor(rng() * scored.length)];
      if (!best || c.fit < best.fit) best = c;
    }
    return best;
  }

  function gaGeneration() {
    var scored = ga.pop.map(function (ind) {
      ind.fit = schedule(ind.perm, ga.inst).makespan;
      return ind;
    });

    scored.sort(function (a, b) { return a.fit - b.fit; });

    var mean = scored.reduce(function (s, ind) {
      return s + ind.fit;
    }, 0) / scored.length;

    scored.forEach(function (ind) {
      ga.scatter.push({ g: ga.gen, f: ind.fit });
    });
    if (ga.scatter.length > GA_POP * GA_MAXGENS) {
      ga.scatter.splice(0, GA_POP);
    }

    ga.bestHist.push(scored[0].fit);
    ga.meanHist.push(mean);

    if (ga.gen === 0) ga.initFit = scored[0].fit;

    if (scored[0].fit < ga.bestFit) {
      ga.bestFit = scored[0].fit;
      ga.bestEver = scored[0].perm.slice();
    }

    // Breed next generation.
    var next = [];
    for (var e = 0; e < GA_ELITE; e++) {
      next.push({ perm: scored[e].perm.slice(), fit: null });
    }
    while (next.length < GA_POP) {
      var child = ox(
        gaTournament(scored).perm,
        gaTournament(scored).perm
      );
      if (rng() < 0.3) child = swapMutate(child);
      next.push({ perm: child, fit: null });
    }
    ga.pop = next;
    ga.gen++;

    if (ga.gen >= GA_MAXGENS) {
      ga.run++;
      gaReset();
    }
  }

  function gaTick(dt) {
    ga.timer += dt;
    if (ga.timer >= GA_GEN_T) {
      ga.timer = 0;
      gaGeneration();
    }
  }

  function gaDraw() {
    if (gaGctx && ga.bestEver) {
      var sched = schedule(ga.bestEver, ga.inst);
      drawHfsGantt(gaGctx, GA_GW, ga.inst, sched, null);
    }

    if (!gaCctx) return;
    var W = GA_CW;
    var H = GANTT_H;
    var fr = chartFrame(gaCctx, W, H, "genetic algorithm · run " + ga.run);
    var w = W - fr.padL - fr.padR;

    var values = ga.bestHist.concat(ga.meanHist);
    if (!values.length) return;

    var scales = chartScales(values, fr.padT, fr.padB, H);
    drawGrid(gaCctx, scales, fr.padL, fr.padR, fr.padT, fr.padB, W, H);

    var g0 = Math.max(0, ga.gen - GA_MAXGENS);

    function X(gen) {
      var span = Math.max(GA_MAXGENS - 1, 1);
      return fr.padL + ((gen - g0) / span) * w;
    }

    // Population scatter.
    gaCctx.fillStyle = COLORS.jobs[2];
    ga.scatter.forEach(function (p) {
      if (p.g < g0) return;
      gaCctx.globalAlpha = 0.30;
      gaCctx.fillRect(X(p.g) - 1, scales.Y(p.f) - 1, 2.5, 2.5);
    });
    gaCctx.globalAlpha = 1;

    function line(hist, color, width) {
      if (hist.length < 2) return;
      gaCctx.strokeStyle = color;
      gaCctx.lineWidth = width;
      gaCctx.beginPath();
      hist.forEach(function (v, i) {
        var x = X(g0 + i);
        if (i === 0) gaCctx.moveTo(x, scales.Y(v));
        else gaCctx.lineTo(x, scales.Y(v));
      });
      gaCctx.stroke();
      gaCctx.lineWidth = 1;
    }

    line(ga.meanHist, COLORS.text, 1);
    line(ga.bestHist, COLORS.jobs[1], 1.6);

    gaCctx.fillStyle = COLORS.text;
    gaCctx.textAlign = "left";
    gaCctx.fillText("gen " + ga.gen, fr.padL, H - 16);
    gaCctx.textAlign = "right";
    gaCctx.fillStyle = COLORS.paper;
    gaCctx.fillText("best " + ga.bestFit.toFixed(1), fr.padL + w, H - 16);

    var meanNow = ga.meanHist.length
      ? ga.meanHist[ga.meanHist.length - 1]
      : 0;

    if (gaEls.gen) gaEls.gen.textContent = ga.gen;
    if (gaEls.best) gaEls.best.textContent = ga.bestFit.toFixed(1);
    if (gaEls.mean) gaEls.mean.textContent = meanNow.toFixed(1);
    if (gaEls.gain) {
      var gain = ga.initFit > 0
        ? (1 - ga.bestFit / ga.initFit) * 100
        : 0;
      gaEls.gain.textContent = gain.toFixed(1) + "%";
    }
  }

  // ============================================================
  // Main loop — one clock drives all three panels
  // ============================================================

  hfsReset();
  saReset();
  gaReset();

  // Warm start so the page never opens empty.
  var w;
  for (w = 0; w < 3; w++) hfsTick(HFS_STEP_T);
  for (w = 0; w < 220; w++) saTick();
  for (w = 0; w < 10; w++) gaGeneration();

  hfsDraw();
  saDraw();
  gaDraw();

  var running = !reduceMotion;
  var last = null;

  function frame(ts) {
    if (!running) return;
    if (last === null) last = ts;
    var dt = Math.min((ts - last) / 1000, 0.1);
    last = ts;

    if (hfs.running) hfsTick(dt * 1.0);
    if (sa.running) saTick();
    if (ga.running) gaTick(dt);

    hfsDraw();
    saDraw();
    gaDraw();

    requestAnimationFrame(frame);
  }

  if (running) requestAnimationFrame(frame);

  // Per-panel play / pause buttons.
  var panels = { hfs: hfs, sa: sa, ga: ga };

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
