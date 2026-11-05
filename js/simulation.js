
// Wasif Ullah — Academic Website
// Dynamic Manufacturing Scheduling Simulation
// Composite Dispatching Rule (CDR): SPT + EDD + CR
// Stochastic arrivals, machine breakdowns and illustrative GP fitness.

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

  // ---------- Composite Dispatching Rule ----------

  // Lower score = higher dispatching priority.
  // These are illustrative fixed weights, not GP-evolved weights.
  var CDR_WEIGHTS = {
    spt: 0.45,
    edd: 0.35,
    cr: 0.20
  };

  function remainingWork(job) {
    return job.ops.slice(job.opIndex).reduce(function (sum, op) {
      return sum + op.remaining;
    }, 0);
  }

  function compositePriority(queue, currentTime) {
    if (!queue.length) return [];

    var features = queue.map(function (job) {
      var work = remainingWork(job);
      var currentOp = job.ops[job.opIndex];

      return {
        job: job,
        spt: currentOp.remaining,
        edd: job.dueDate,
        cr: (job.dueDate - currentTime) / Math.max(work, 0.001)
      };
    });

    // Queue-relative min-max normalisation.
    // All criteria are minimised.
    function normalise(key, value) {
      var values = features.map(function (f) {
        return f[key];
      });

      var min = Math.min.apply(null, values);
      var max = Math.max.apply(null, values);

      return max === min ? 0.5 : (value - min) / (max - min);
    }

    return features.map(function (f) {
      var score =
        CDR_WEIGHTS.spt * normalise("spt", f.spt) +
        CDR_WEIGHTS.edd * normalise("edd", f.edd) +
        CDR_WEIGHTS.cr * normalise("cr", f.cr);

      return {
        job: f.job,
        score: score
      };
    });
  }

  function selectCDRJob(queue, currentTime) {
    var priorities = compositePriority(queue, currentTime);

    priorities.sort(function (a, b) {
      return a.score - b.score || a.job.id - b.job.id;
    });

    return priorities.length ? priorities[0].job : null;
  }

  // ---------- Simulation state ----------

  var sim = {
    t: 0,
    nextJobId: 1,
    jobs: [],
    machines: [],
    nextArrival: 1.5,
    completed: 0,
    flowSum: 0,
    flowWindow: []
  };

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function randInt(a, b) {
    return Math.floor(rand(a, b + 1));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---------- Job generation ----------

  function makeJob(t) {
    var route = [];
    var n = randInt(2, MACHINES);
    var pool = [];

    for (var i = 0; i < MACHINES; i++) {
      pool.push(i);
    }

    for (var k = 0; k < n; k++) {
      route.push(
        pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
      );
    }

    var ops = route.map(function (m) {
      var p = rand(3, 9);

      return {
        m: m,
        p: p,
        done: false,
        remaining: p
      };
    });

    var totalWork = ops.reduce(function (sum, op) {
      return sum + op.p;
    }, 0);

    return {
      id: sim.nextJobId++,
      color: pick(COLORS.jobs),
      arrival: t,
      dueDate: t + totalWork * rand(1.5, 2.5),
      route: route,
      ops: ops,
      opIndex: 0,
      done: false
    };
  }

  // ---------- Machine initialisation ----------

  function initMachines() {
    sim.machines = [];

    for (var i = 0; i < MACHINES; i++) {
      sim.machines.push({
        queue: [],
        current: null,
        downUntil: -1,
        nextDown: rand(18, 45),
        downStart: -1,
        busy: 0,
        history: []
      });
    }
  }

  function isDown(m, t) {
    return t < m.downUntil;
  }

  // ---------- Simulation engine ----------

  function step(dt) {
    var t0 = sim.t;
    var t1 = sim.t + dt;

    // Stochastic job arrivals.
    while (sim.nextArrival <= t1) {
      var job = makeJob(sim.nextArrival);

      sim.jobs.push(job);

      var firstMachine = sim.machines[job.ops[0].m];
      firstMachine.queue.push(job);

      sim.nextArrival += rand(2.2, 5.2);
    }

    sim.machines.forEach(function (m) {

      // Machine breakdown scheduling.
      if (
        m.nextDown > t0 &&
        m.nextDown <= t1 &&
        !isDown(m, m.nextDown)
      ) {
        m.downStart = m.nextDown;
        m.downUntil = m.nextDown + rand(3, 7);

        m.nextDown += rand(26, 55);

        m.history.push({
          kind: "down",
          start: m.downStart,
          end: m.downUntil
        });
      }

      // Machine halted: current operation is frozen.
      if (isDown(m, t1)) return;

      // Dispatch when machine is idle.
      if (!m.current && m.queue.length) {

        // Composite dispatching rule.
        var selectedJob = selectCDRJob(m.queue, t1);

        var bestIdx = m.queue.indexOf(selectedJob);
        var job2 = m.queue.splice(bestIdx, 1)[0];

        var op2 = job2.ops[job2.opIndex];

        m.current = {
          job: job2,
          op: op2,
          start: t1
        };

        m.history.push({
          kind: "op",
          color: job2.color,
          id: job2.id,
          start: t1,
          end: null
        });
      }

      // Process current operation.
      if (m.current) {
        var current = m.current;

        current.op.remaining -= dt;
        m.busy += dt;

        if (current.op.remaining <= 0) {

          var seg = m.history[m.history.length - 1];

          if (seg && seg.end === null) {
            seg.end = t1;
          }

          var job3 = current.job;

          current.op.done = true;
          job3.opIndex++;

          if (job3.opIndex >= job3.ops.length) {
            job3.done = true;
            sim.completed++;

            var flow = t1 - job3.arrival;

            sim.flowSum += flow;
            sim.flowWindow.push(flow);

            if (sim.flowWindow.length > 40) {
              sim.flowWindow.shift();
            }

          } else {
            var nextMachine = sim.machines[
              job3.ops[job3.opIndex].m
            ];

            nextMachine.queue.push(job3);
          }

          m.current = null;
        }
      }
    });

    sim.t = t1;
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

      // Historical operation and breakdown segments.
      m.history.forEach(function (seg) {
        var a = Math.max(seg.start, tStart);

        var b = seg.end === null ? sim.t : seg.end;

        if (b <= tStart || a >= tEnd) return;

        var xa = X(a);
        var xb = X(Math.min(b, tEnd));

        if (seg.kind === "down") {
          gctx.strokeStyle = COLORS.text;
          gctx.globalAlpha = 0.75;

          gctx.strokeRect(
            xa, y, Math.max(xb - xa, 2), rowH
          );

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

          gctx.strokeRect(
            xa + 0.5,
            y + 0.5,
            xb - xa - 1,
            rowH - 1
          );

          if (xb - xa > 26) {
            gctx.fillStyle = seg.color;
            gctx.textAlign = "left";

            gctx.fillText(
              "J" + seg.id,
              xa + 6,
              y + rowH / 2
            );
          }
        }
      });

      // Machine queue display.
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

        gctx.fillText(
          "+" + (m.queue.length - 4),
          qx + 4 * 20 + 2,
          qy
        );
      }
    }

    // Current simulation time.
    var nx = X(Math.min(sim.t, tEnd));

    gctx.strokeStyle = COLORS.paper;
    gctx.setLineDash([2, 4]);

    gctx.beginPath();
    gctx.moveTo(nx, top - 14);

    gctx.lineTo(
      nx,
      top + MACHINES * (rowH + gap) - gap + 6
    );

    gctx.stroke();
    gctx.setLineDash([]);

    gctx.fillStyle = COLORS.paper;
    gctx.textAlign = "left";

    gctx.fillText("now", nx - 22, top - 18);

    gctx.fillStyle = COLORS.text;

    gctx.fillText("queue", x1 + 14, top - 18);
  }

  // ---------- Illustrative GP fitness panel ----------

  var FW = 380;
  var FH = 320;

  var fctx = fitnessCanvas
    ? setupCanvas(fitnessCanvas, FW, FH)
    : null;

  var gen = 0;
  var best = 100;
  var mean = 130;
  var FLOOR = 34;
  var run = 1;

  var MAXGENS = 90;
  var GEN_STEP = 2.2;

  var bestHist = [];
  var meanHist = [];
  var genTimer = 0;

  function resetRun() {
    gen = 0;
    run++;

    best = rand(92, 108);
    mean = best + rand(22, 38);

    bestHist.length = 0;
    meanHist.length = 0;
  }

  function stepFitness(dt) {
    genTimer += dt;

    if (genTimer >= GEN_STEP) {
      genTimer = 0;
      gen++;

      best = Math.max(
        FLOOR,
        best - (best - FLOOR) * rand(0.018, 0.055) - rand(0, 0.35)
      );

      mean = Math.max(
        best + 3,
        mean - (mean - best - 3) * rand(0.025, 0.07)
      );

      bestHist.push(best);
      meanHist.push(mean);

      if (gen >= MAXGENS) {
        resetRun();
      }
    }
  }

  function drawFitness() {
    if (!fctx) return;

    var padL = 46;
    var padR = 14;
    var padT = 40;
    var padB = 34;

    var w = FW - padL - padR;
    var h = FH - padT - padB;

    fctx.clearRect(0, 0, FW, FH);

    fctx.fillStyle = COLORS.bg;
    fctx.fillRect(0, 0, FW, FH);

    fctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    fctx.fillStyle = COLORS.paper;
    fctx.textAlign = "left";
    fctx.textBaseline = "middle";

    fctx.fillText(
      "rule evolution — GP fitness · run " + run,
      padL,
      20
    );

    var all = bestHist.concat(meanHist);

    var vmax = 140;
    var vmin = 20;

    if (all.length) {
      vmax = -Infinity;
      vmin = Infinity;

      all.forEach(function (v) {
        if (v > vmax) vmax = v;
        if (v < vmin) vmin = v;
      });

      var pad = Math.max((vmax - vmin) * 0.15, 6);

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

        if (i === 0) {
          fctx.moveTo(x, Y(v));
        } else {
          fctx.lineTo(x, Y(v));
        }
      });

      fctx.stroke();
      fctx.lineWidth = 1;
    }

    plot(meanHist, COLORS.jobs[2], 1);
    plot(bestHist, COLORS.jobs[1], 1.6);

    fctx.fillStyle = COLORS.text;
    fctx.textAlign = "left";

    fctx.fillText("gen " + gen, padL, FH - 16);

    fctx.textAlign = "right";

    fctx.fillText(
      "best " + best.toFixed(1),
      padL + w,
      FH - 16
    );
  }

  // ---------- Statistics ----------

  var statEls = {
    done: document.querySelector('[data-sim="done"]'),
    flow: document.querySelector('[data-sim="flow"]'),
    util: document.querySelector('[data-sim="util"]')
  };

  function updateStats() {
    if (!statEls.done) return;

    var meanFlow = sim.flowWindow.length
      ? sim.flowWindow.reduce(function (a, b) {
          return a + b;
        }, 0) / sim.flowWindow.length
      : 0;

    var util = sim.t > 0
      ? sim.machines.reduce(function (a, m) {
          return a + m.busy;
        }, 0) / (MACHINES * sim.t) * 100
      : 0;

    statEls.done.textContent = sim.completed;
    statEls.flow.textContent = meanFlow.toFixed(1);
    statEls.util.textContent = util.toFixed(0) + "%";
  }

  // ---------- Main animation loop ----------

  var running = !reduceMotion;
  var last = null;

  function frame(ts) {
    if (!running) return;

    if (last === null) last = ts;

    var dt = Math.min((ts - last) / 1000, 0.1) * SPEED;

    last = ts;

    step(dt);
    stepFitness(dt);

    drawGantt();
    drawFitness();
    updateStats();

    requestAnimationFrame(frame);
  }

  // ---------- Warm start ----------

  initMachines();

  for (var i = 0; i < 240; i++) {
    step(0.25);
  }

  for (var j = 0; j < 6; j++) {
    stepFitness(GEN_STEP);
  }

  drawGantt();
  drawFitness();
  updateStats();

  if (running) {
    requestAnimationFrame(frame);
  }

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
