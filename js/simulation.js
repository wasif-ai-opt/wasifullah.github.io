
// Wasif Ullah — Academic Website
// Dynamic manufacturing scheduling simulation.
//
// The shop floor is dispatched by a COMPOSITE dispatching rule (CDR)
// combining SPT + EDD + CR with learned weights. The fitness panel is a
// REAL genetic algorithm: every generation it evaluates a population of
// candidate weight vectors on a fresh simulated scenario (common random
// numbers for fair comparison) and deploys the best weights to the live
// shop on the left. The rule genuinely improves as you watch.

(function () {
  "use strict";

  var ganttCanvas = document.getElementById("sim-gantt");
  if (!ganttCanvas) return;

  var fitnessCanvas = document.getElementById("sim-fitness");
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

  var MACHINES = 4;
  var WIN = 64;
  var SPEED = 7;

  // ---------- Seeded RNG (mulberry32) ----------
  // Used so every candidate rule in a generation faces the SAME scenario.

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

  // ---------- Shop-floor simulation factory ----------

  function makeSim(rand) {
    var sim = {
      t: 0,
      nextJobId: 1,
      machines: [],
      nextArrival: 1.5,
      completed: 0,
      flowSum: 0,
      flowWindow: [],
      // Composite rule weights — evolved by the GA below.
      weights: { spt: 0.45, edd: 0.35, cr: 0.20 }
    };

    function randRange(a, b) {
      return a + rand() * (b - a);
    }

    function randInt(a, b) {
      return Math.floor(randRange(a, b + 1));
    }

    function remainingWork(job) {
      var sum = 0;
      for (var i = job.opIndex; i < job.ops.length; i++) {
        sum += job.ops[i].remaining;
      }
      return sum;
    }

    // Composite dispatching rule: lower score = higher priority.
    // Queue-relative min-max normalisation; all criteria minimised.
    function selectJob(queue, currentTime) {
      if (!queue.length) return null;

      var w = sim.weights;
      var sptMin = Infinity, sptMax = -Infinity;
      var eddMin = Infinity, eddMax = -Infinity;
      var crMin = Infinity, crMax = -Infinity;

      var feats = queue.map(function (job) {
        var work = remainingWork(job);
        var f = {
          job: job,
          spt: job.ops[job.opIndex].remaining,
          edd: job.dueDate,
          cr: (job.dueDate - currentTime) / Math.max(work, 0.001)
        };
        if (f.spt < sptMin) sptMin = f.spt;
        if (f.spt > sptMax) sptMax = f.spt;
        if (f.edd < eddMin) eddMin = f.edd;
        if (f.edd > eddMax) eddMax = f.edd;
        if (f.cr < crMin) crMin = f.cr;
        if (f.cr > crMax) crMax = f.cr;
        return f;
      });

      function norm(v, lo, hi) {
        return hi === lo ? 0.5 : (v - lo) / (hi - lo);
      }

      var best = null;
      var bestScore = Infinity;

      feats.forEach(function (f) {
        var score =
          w.spt * norm(f.spt, sptMin, sptMax) +
          w.edd * norm(f.edd, eddMin, eddMax) +
          w.cr * norm(f.cr, crMin, crMax);

        if (score < bestScore) {
          bestScore = score;
          best = f.job;
        }
      });

      return best;
    }

    function makeJob(t) {
      var pool = [];
      for (var i = 0; i < MACHINES; i++) pool.push(i);

      var n = randInt(2, MACHINES);
      var ops = [];
      var totalWork = 0;

      for (var k = 0; k < n; k++) {
        var m = pool.splice(Math.floor(rand() * pool.length), 1)[0];
        var p = randRange(3, 9);
        totalWork += p;
        ops.push({ m: m, p: p, done: false, remaining: p });
      }

      return {
        id: sim.nextJobId++,
        color: COLORS.jobs[Math.floor(rand() * COLORS.jobs.length)],
        arrival: t,
        dueDate: t + totalWork * randRange(1.5, 2.5),
        ops: ops,
        opIndex: 0,
        done: false
      };
    }

    function initMachines() {
      sim.machines = [];
      for (var i = 0; i < MACHINES; i++) {
        sim.machines.push({
          queue: [],
          current: null,
          downUntil: -1,
          nextDown: randRange(18, 45),
          downStart: -1,
          busy: 0,
          history: []
        });
      }
    }

    function isDown(m, t) {
      return t < m.downUntil;
    }

    function step(dt) {
      var t0 = sim.t;
      var t1 = sim.t + dt;

      while (sim.nextArrival <= t1) {
        var job = makeJob(sim.nextArrival);
        sim.machines[job.ops[0].m].queue.push(job);
        sim.nextArrival += randRange(2.2, 5.2);
      }

      sim.machines.forEach(function (m) {
        if (m.nextDown > t0 && m.nextDown <= t1 && !isDown(m, m.nextDown)) {
          m.downStart = m.nextDown;
          m.downUntil = m.nextDown + randRange(3, 7);
          m.nextDown += randRange(26, 55);
          m.history.push({
            kind: "down",
            start: m.downStart,
            end: m.downUntil
          });
        }

        if (isDown(m, t1)) return;

        if (!m.current && m.queue.length) {
          var job2 = selectJob(m.queue, t1);
          var idx = m.queue.indexOf(job2);
          m.queue.splice(idx, 1);

          var op2 = job2.ops[job2.opIndex];
          m.current = { job: job2, op: op2, start: t1 };
          m.history.push({
            kind: "op",
            color: job2.color,
            id: job2.id,
            start: t1,
            end: null
          });
        }

        if (m.current) {
          var current = m.current;
          current.op.remaining -= dt;
          m.busy += dt;

          if (current.op.remaining <= 0) {
            var seg = m.history[m.history.length - 1];
            if (seg && seg.end === null) seg.end = t1;

            var job3 = current.job;
            current.op.done = true;
            job3.opIndex++;

            if (job3.opIndex >= job3.ops.length) {
              job3.done = true;
              sim.completed++;
              var flow = t1 - job3.arrival;
              sim.flowSum += flow;
              sim.flowWindow.push(flow);
              if (sim.flowWindow.length > 40) sim.flowWindow.shift();
            } else {
              sim.machines[job3.ops[job3.opIndex].m].queue.push(job3);
            }

            m.current = null;
          }
        }
      });

      sim.t = t1;
    }

    initMachines();
    sim.step = step;
    return sim;
  }

  // The live, visible shop floor.
  var sim = makeSim(Math.random);

  // ---------- Genetic algorithm over rule weights ----------
  // Population of weight vectors (spt, edd, cr), normalised to sum 1.
  // Fitness = mean flow time on a shared simulated scenario (lower better).

  var GA = {
    pop: [],
    gen: 0,
    run: 1,
    runSeed: 12345,
    bestHist: [],
    meanHist: [],
    timer: 0
  };

  var POP_SIZE = 14;
  var ELITE = 2;
  var GEN_STEP = 2.0;
  var MAXGENS = 60;
  var EVAL_HORIZON = 220;
  var EVAL_DT = 0.5;

  function normaliseWeights(w) {
    var sum = w.spt + w.edd + w.cr;
    return { spt: w.spt / sum, edd: w.edd / sum, cr: w.cr / sum };
  }

  function randomWeights() {
    return normaliseWeights({
      spt: 0.05 + Math.random() * 0.9,
      edd: 0.05 + Math.random() * 0.9,
      cr: 0.05 + Math.random() * 0.9
    });
  }

  // Evaluate one candidate on a seeded scenario shared by the generation.
  function evaluate(w, seed) {
    var s = makeSim(mulberry32(seed));
    s.weights = w;
    var steps = Math.round(EVAL_HORIZON / EVAL_DT);
    for (var i = 0; i < steps; i++) s.step(EVAL_DT);
    if (!s.completed) return 999;
    // Mean flow time, with a small penalty for work left stuck in queues.
    var wip = 0;
    s.machines.forEach(function (m) { wip += m.queue.length; });
    return s.flowSum / s.completed + wip * 0.15;
  }

  function tournament(k) {
    var best = null;
    for (var i = 0; i < k; i++) {
      var c = GA.pop[Math.floor(Math.random() * GA.pop.length)];
      if (!best || c.fit < best.fit) best = c;
    }
    return best;
  }

  function crossover(a, b) {
    var alpha = Math.random();
    return normaliseWeights({
      spt: alpha * a.w.spt + (1 - alpha) * b.w.spt,
      edd: alpha * a.w.edd + (1 - alpha) * b.w.edd,
      cr: alpha * a.w.cr + (1 - alpha) * b.w.cr
    });
  }

  function mutate(w) {
    var sigma = 0.08;
    function n() {
      // Approximate gaussian noise.
      return (Math.random() + Math.random() + Math.random() - 1.5) * 2;
    }
    return normaliseWeights({
      spt: Math.max(0.03, w.spt + n() * sigma),
      edd: Math.max(0.03, w.edd + n() * sigma),
      cr: Math.max(0.03, w.cr + n() * sigma)
    });
  }

  function initRun() {
    GA.gen = 0;
    GA.timer = 0;
    GA.runSeed = 1000 + GA.run * 7919;
    GA.bestHist.length = 0;
    GA.meanHist.length = 0;
    GA.pop = [];
    for (var i = 0; i < POP_SIZE; i++) {
      GA.pop.push({ w: randomWeights(), fit: null });
    }
  }

  function stepGeneration() {
    var seed = GA.runSeed + GA.gen;

    GA.pop.forEach(function (ind) {
      ind.fit = evaluate(ind.w, seed);
    });

    GA.pop.sort(function (a, b) { return a.fit - b.fit; });

    var bestFit = GA.pop[0].fit;
    var meanFit = GA.pop.reduce(function (s, ind) {
      return s + ind.fit;
    }, 0) / GA.pop.length;

    GA.bestHist.push(bestFit);
    GA.meanHist.push(meanFit);

    // Deploy the best rule found so far to the live shop floor.
    sim.weights = {
      spt: GA.pop[0].w.spt,
      edd: GA.pop[0].w.edd,
      cr: GA.pop[0].w.cr
    };

    // Breed the next generation.
    var next = [];
    for (var e = 0; e < ELITE; e++) {
      next.push({ w: GA.pop[e].w, fit: null });
    }
    while (next.length < POP_SIZE) {
      var child = crossover(tournament(3), tournament(3));
      if (Math.random() < 0.85) child = mutate(child);
      next.push({ w: child, fit: null });
    }
    GA.pop = next;
    GA.gen++;

    if (GA.gen >= MAXGENS) {
      GA.run++;
      initRun();
    }
  }

  function stepGA(dt) {
    GA.timer += dt;
    if (GA.timer >= GEN_STEP) {
      GA.timer = 0;
      stepGeneration();
    }
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

  // ---------- Gantt chart ----------

  var GW = 760;
  var GH = 320;
  var gctx = setupCanvas(ganttCanvas, GW, GH);

  function drawGantt() {
    var labelW = 52;
    var queueW = 96;
    var top = 26;
    var rowH = 56;
    var gap = 12;
    var x0 = labelW;
    var x1 = GW - queueW;
    var span = WIN;
    var tEnd = Math.max(sim.t, span);
    var tStart = tEnd - span;

    function X(t) {
      return x0 + (x1 - x0) * (t - tStart) / span;
    }

    gctx.clearRect(0, 0, GW, GH);
    gctx.fillStyle = COLORS.bg;
    gctx.fillRect(0, 0, GW, GH);
    gctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    gctx.textBaseline = "middle";

    for (var i = 0; i < MACHINES; i++) {
      var y = top + i * (rowH + gap);
      var m = sim.machines[i];

      gctx.fillStyle = COLORS.text;
      gctx.textAlign = "right";
      gctx.fillText("M" + (i + 1), x0 - 12, y + rowH / 2);

      gctx.strokeStyle = COLORS.panelLine;
      gctx.lineWidth = 1;
      gctx.beginPath();
      gctx.moveTo(x0, y + rowH + gap / 2);
      gctx.lineTo(GW - 16, y + rowH + gap / 2);
      gctx.stroke();

      m.history.forEach(function (seg) {
        var a = Math.max(seg.start, tStart);
        var b = seg.end === null ? sim.t : seg.end;
        if (b <= tStart || a >= tEnd) return;

        var xa = X(a);
        var xb = X(Math.min(b, tEnd));

        if (seg.kind === "down") {
          gctx.strokeStyle = COLORS.text;
          gctx.globalAlpha = 0.75;
          gctx.strokeRect(xa, y, Math.max(xb - xa, 2), rowH);
          gctx.beginPath();
          for (var d = xa - rowH; d < xb; d += 7) {
            gctx.moveTo(Math.max(d, xa), y + rowH);
            gctx.lineTo(Math.min(d + rowH, xb), y);
          }
          gctx.stroke();
          gctx.globalAlpha = 1;
        } else {
          gctx.globalAlpha = 0.24;
          gctx.fillStyle = seg.color;
          gctx.fillRect(xa, y, xb - xa, rowH);
          gctx.globalAlpha = 1;
          gctx.strokeStyle = seg.color;
          gctx.strokeRect(xa + 0.5, y + 0.5, xb - xa - 1, rowH - 1);
          if (xb - xa > 26) {
            gctx.fillStyle = seg.color;
            gctx.textAlign = "left";
            gctx.fillText("J" + seg.id, xa + 6, y + rowH / 2);
          }
        }
      });

      var qx = x1 + 14;
      var qy = y + rowH / 2;

      gctx.fillStyle = COLORS.text;
      gctx.textAlign = "left";

      if (m.queue.length === 0) {
        gctx.globalAlpha = 0.5;
        gctx.fillText("·", qx, qy);
        gctx.globalAlpha = 1;
      }

      m.queue.slice(0, 4).forEach(function (job, qi) {
        var sxx = qx + qi * 20;
        gctx.strokeStyle = job.color;
        gctx.strokeRect(sxx, qy - 7, 13, 13);
        gctx.globalAlpha = 0.35;
        gctx.fillStyle = job.color;
        gctx.fillRect(sxx, qy - 7, 13, 13);
        gctx.globalAlpha = 1;
      });

      if (m.queue.length > 4) {
        gctx.fillStyle = COLORS.text;
        gctx.fillText("+" + (m.queue.length - 4), qx + 4 * 20 + 2, qy);
      }
    }

    var nx = X(Math.min(sim.t, tEnd));
    gctx.strokeStyle = COLORS.paper;
    gctx.setLineDash([2, 4]);
    gctx.beginPath();
    gctx.moveTo(nx, top - 14);
    gctx.lineTo(nx, top + MACHINES * (rowH + gap) - gap + 6);
    gctx.stroke();
    gctx.setLineDash([]);

    gctx.fillStyle = COLORS.paper;
    gctx.textAlign = "left";
    gctx.fillText("now", nx - 22, top - 18);
    gctx.fillStyle = COLORS.text;
    gctx.fillText("queue", x1 + 14, top - 18);
  }

  // ---------- Fitness panel (real GA output) ----------

  var FW = 380;
  var FH = 320;
  var fctx = fitnessCanvas ? setupCanvas(fitnessCanvas, FW, FH) : null;

  function drawFitness() {
    if (!fctx) return;

    var padL = 46;
    var padR = 14;
    var padT = 40;
    var padB = 46;
    var w = FW - padL - padR;
    var h = FH - padT - padB;

    fctx.clearRect(0, 0, FW, FH);
    fctx.fillStyle = COLORS.bg;
    fctx.fillRect(0, 0, FW, FH);
    fctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    fctx.fillStyle = COLORS.paper;
    fctx.textAlign = "left";
    fctx.textBaseline = "middle";
    fctx.fillText("GA rule search · run " + GA.run, padL, 20);

    var all = GA.bestHist.concat(GA.meanHist);
    var vmax = 140;
    var vmin = 20;

    if (all.length) {
      vmax = -Infinity;
      vmin = Infinity;
      all.forEach(function (v) {
        if (v > vmax) vmax = v;
        if (v < vmin) vmin = v;
      });
      var pad = Math.max((vmax - vmin) * 0.15, 4);
      vmax += pad;
      vmin -= pad;
    }

    function Y(v) {
      return padT + h - (v - vmin) / (vmax - vmin) * h;
    }

    fctx.strokeStyle = COLORS.panelLine;
    fctx.lineWidth = 1;

    for (var g = 0; g <= 3; g++) {
      var gv = vmax - (vmax - vmin) * (g + 0.5) / 3.5;
      var gy = padT + h * (g + 0.5) / 3.5;
      fctx.beginPath();
      fctx.moveTo(padL, gy);
      fctx.lineTo(padL + w, gy);
      fctx.stroke();
      fctx.fillStyle = COLORS.text;
      fctx.textAlign = "right";
      fctx.fillText(String(Math.round(gv)), padL - 8, gy);
    }

    function plot(hist, color, width) {
      if (hist.length < 2) return;
      fctx.strokeStyle = color;
      fctx.lineWidth = width;
      fctx.beginPath();
      hist.forEach(function (v, i) {
        var x = padL + (i / (MAXGENS - 1)) * w;
        if (i === 0) fctx.moveTo(x, Y(v));
        else fctx.lineTo(x, Y(v));
      });
      fctx.stroke();
      fctx.lineWidth = 1;
    }

    plot(GA.meanHist, COLORS.jobs[2], 1);
    plot(GA.bestHist, COLORS.jobs[1], 1.6);

    var best = GA.bestHist.length
      ? GA.bestHist[GA.bestHist.length - 1]
      : 0;

    fctx.fillStyle = COLORS.text;
    fctx.textAlign = "left";
    fctx.fillText("gen " + GA.gen, padL, FH - 28);
    fctx.textAlign = "right";
    fctx.fillText("best " + best.toFixed(1), padL + w, FH - 28);

    // Deployed weights.
    fctx.textAlign = "left";
    fctx.fillStyle = COLORS.paper;
    fctx.fillText(
      "w · spt " + sim.weights.spt.toFixed(2) +
      "  edd " + sim.weights.edd.toFixed(2) +
      "  cr " + sim.weights.cr.toFixed(2),
      padL,
      FH - 12
    );
  }

  // ---------- Statistics ----------

  var statEls = {
    done: document.querySelector('[data-sim="done"]'),
    flow: document.querySelector('[data-sim="flow"]'),
    util: document.querySelector('[data-sim="util"]'),
    weights: document.querySelector('[data-sim="weights"]')
  };

  function updateStats() {
    if (!statEls.done) return;

    var meanFlow = sim.flowWindow.length
      ? sim.flowWindow.reduce(function (a, b) { return a + b; }, 0) /
        sim.flowWindow.length
      : 0;

    var util = sim.t > 0
      ? sim.machines.reduce(function (a, m) { return a + m.busy; }, 0) /
        (MACHINES * sim.t) * 100
      : 0;

    statEls.done.textContent = sim.completed;
    statEls.flow.textContent = meanFlow.toFixed(1);
    statEls.util.textContent = util.toFixed(0) + "%";

    if (statEls.weights) {
      statEls.weights.textContent =
        sim.weights.spt.toFixed(2) + " / " +
        sim.weights.edd.toFixed(2) + " / " +
        sim.weights.cr.toFixed(2);
    }
  }

  // ---------- Main animation loop ----------

  var running = !reduceMotion;
  var last = null;

  function frame(ts) {
    if (!running) return;
    if (last === null) last = ts;
    var dt = Math.min((ts - last) / 1000, 0.1) * SPEED;
    last = ts;

    sim.step(dt);
    stepGA(dt);
    drawGantt();
    drawFitness();
    updateStats();

    requestAnimationFrame(frame);
  }

  // ---------- Warm start ----------

  initRun();

  for (var i = 0; i < 240; i++) sim.step(0.25);
  for (var g = 0; g < 8; g++) stepGeneration();

  drawGantt();
  drawFitness();
  updateStats();

  if (running) requestAnimationFrame(frame);

  // ---------- Play / Pause ----------

  var btn = document.querySelector(".sim-toggle");

  if (btn) {
    btn.textContent = running ? "Pause" : "Play";
    btn.addEventListener("click", function () {
      running = !running;
      btn.textContent = running ? "Pause" : "Play";
      if (running) {
        last = null;
        requestAnimationFrame(frame);
      }
    });
  }

})();
