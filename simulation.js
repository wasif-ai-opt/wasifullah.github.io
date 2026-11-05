// Wasif Ullah — Academic Website
// Live visual: dynamic job-shop scheduling with a dispatching rule (SPT),
// stochastic arrivals and machine breakdowns + GP-style fitness evolution.
(function () {
  "use strict";

  var ganttCanvas = document.getElementById("sim-gantt");
  if (!ganttCanvas) return;
  var fitnessCanvas = document.getElementById("sim-fitness");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var COLORS = {
    bg: "#14161a",
    panelLine: "#212427",
    rule: "#2c3035",
    text: "#a3a7ad",
    paper: "#eeeef0",
    jobs: ["#6e8db8", "#8eafd9", "#6183a9", "#93a3b8", "#4a6787", "#7d9cc4"]
  };

  var MACHINES = 4;
  var WIN = 64;             // visible time window (time units)
  var SPEED = 7;            // time units per real second

  // ---------- Simulation state ----------
  var sim = {
    t: 0,
    nextJobId: 1,
    jobs: [],               // all jobs
    machines: [],           // {queue:[], current:null, downUntil:0, nextDown: t, busy:0, history:[]}
    nextArrival: 1.5,
    completed: 0,
    flowSum: 0,
    flowWindow: []
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function makeJob(t) {
    var route = [];
    var n = randInt(2, MACHINES);
    var pool = [];
    for (var i = 0; i < MACHINES; i++) pool.push(i);
    for (var k = 0; k < n; k++) {
      route.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    var ops = route.map(function (m) {
      return { m: m, p: rand(3, 9), done: false, remaining: 0 };
    });
    ops.forEach(function (op) { op.remaining = op.p; });
    return {
      id: sim.nextJobId++,
      color: pick(COLORS.jobs),
      arrival: t,
      route: route,
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
        current: null,       // {job, op}
        downUntil: -1,
        nextDown: rand(18, 45),
        downStart: -1,
        busy: 0,
        history: []          // {kind:'op'|'down', color, start, end}
      });
    }
  }

  function isDown(m, t) { return t < m.downUntil; }

  function step(dt) {
    var t0 = sim.t;
    sim.t += dt;
    var t1 = sim.t;

    // arrivals
    while (sim.nextArrival <= t1) {
      var job = makeJob(sim.nextArrival);
      sim.jobs.push(job);
      var m0 = sim.machines[job.ops[0].m];
      m0.queue.push(job);
      sim.nextArrival += rand(2.2, 5.2);
    }

    sim.machines.forEach(function (m) {
      // breakdown scheduling
      if (m.nextDown > t0 && m.nextDown <= t1 && !isDown(m, m.nextDown)) {
        m.downStart = m.nextDown;
        m.downUntil = m.nextDown + rand(3, 7);
        m.nextDown = m.nextDown + rand(26, 55);
        m.history.push({ kind: "down", start: m.downStart, end: m.downUntil });
      }

      if (isDown(m, t1)) return; // machine halted; current op freezes

      // start new op if idle
      if (!m.current && m.queue.length) {
        // dispatching rule: shortest processing time (SPT)
        var bestIdx = 0, bestP = Infinity;
        m.queue.forEach(function (job, idx) {
          var op = job.ops[job.opIndex];
          if (op.remaining < bestP) { bestP = op.remaining; bestIdx = idx; }
        });
        var job2 = m.queue.splice(bestIdx, 1)[0];
        var op2 = job2.ops[job2.opIndex];
        m.current = { job: job2, op: op2, start: t1 };
        m.history.push({ kind: "op", color: job2.color, id: job2.id, start: t1, end: null });
      }

      // process current
      if (m.current) {
        m.current.op.remaining -= dt;
        m.busy += dt;
        if (m.current.op.remaining <= 0) {
          var seg = m.history[m.history.length - 1];
          if (seg && seg.end === null) seg.end = t1;
          var job3 = m.current.job;
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
  }

  // ---------- Drawing ----------
  function setupCanvas(canvas, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.aspectRatio = w + " / " + h;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  var GW = 760, GH = 320;
  var gctx = setupCanvas(ganttCanvas, GW, GH);

  function drawGantt() {
    var labelW = 52, queueW = 96;
    var top = 26, rowH = 56, gap = 12;
    var x0 = labelW, x1 = GW - queueW;
    var span = WIN;
    var tEnd = Math.max(sim.t, span);
    var tStart = tEnd - span;
    function X(t) { return x0 + (x1 - x0) * (t - tStart) / span; }

    gctx.clearRect(0, 0, GW, GH);
    gctx.fillStyle = COLORS.bg;
    gctx.fillRect(0, 0, GW, GH);

    gctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    gctx.textBaseline = "middle";

    for (var i = 0; i < MACHINES; i++) {
      var y = top + i * (rowH + gap);
      var m = sim.machines[i];

      // label + lane
      gctx.fillStyle = COLORS.text;
      gctx.textAlign = "right";
      gctx.fillText("M" + (i + 1), x0 - 12, y + rowH / 2);
      gctx.strokeStyle = COLORS.panelLine;
      gctx.lineWidth = 1;
      gctx.beginPath();
      gctx.moveTo(x0, y + rowH + gap / 2);
      gctx.lineTo(GW - 16, y + rowH + gap / 2);
      gctx.stroke();

      // history segments
      m.history.forEach(function (seg) {
        var a = Math.max(seg.start, tStart);
        var b = seg.end === null ? sim.t : seg.end;
        if (b <= tStart || a >= tEnd) return;
        var xa = X(a), xb = X(Math.min(b, tEnd));
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

      // queue strip
      var qx = x1 + 14, qy = y + rowH / 2;
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

    // "now" line
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

    // queue header
    gctx.fillStyle = COLORS.text;
    gctx.fillText("queue", x1 + 14, top - 18);
  }

  // ---------- Fitness panel ----------
  var FW = 380, FH = 320;
  var fctx = fitnessCanvas ? setupCanvas(fitnessCanvas, FW, FH) : null;
  var gen = 0, best = 100, mean = 130, FLOOR = 34, run = 1;
  var MAXGENS = 90;         // every run lasts exactly 90 generations,
                            // so a convergence curve always fills the panel width
  var GEN_STEP = 2.2;       // sim-time per generation (dt arrives pre-scaled ×SPEED)
  var bestHist = [], meanHist = [];
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
      // gentle decay: convergence takes most of the 90-generation run
      best = Math.max(FLOOR, best - (best - FLOOR) * rand(0.018, 0.055) - rand(0, 0.35));
      mean = Math.max(best + 3, mean - (mean - best - 3) * rand(0.025, 0.07));
      bestHist.push(best);
      meanHist.push(mean);
      // run finished: start a fresh evolutionary run so the
      // convergence is always visible, never a flat line
      if (gen >= MAXGENS) resetRun();
    }
  }

  function drawFitness() {
    if (!fctx) return;
    var padL = 46, padR = 14, padT = 40, padB = 34;
    var w = FW - padL - padR, h = FH - padT - padB;
    fctx.clearRect(0, 0, FW, FH);
    fctx.fillStyle = COLORS.bg;
    fctx.fillRect(0, 0, FW, FH);

    fctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    fctx.fillStyle = COLORS.paper;
    fctx.textAlign = "left";
    fctx.textBaseline = "middle";
    fctx.fillText("rule evolution — GP fitness · run " + run, padL, 20);

    // auto-scale the y-axis to the visible data so the
    // convergence shape is always readable
    var all = bestHist.concat(meanHist);
    var vmax = 140, vmin = 20;
    if (all.length) {
      vmax = -Infinity; vmin = Infinity;
      all.forEach(function (v) { if (v > vmax) vmax = v; if (v < vmin) vmin = v; });
      var pad = Math.max((vmax - vmin) * 0.15, 6);
      vmax += pad; vmin -= pad;
    }
    function Y(v) { return padT + h - (v - vmin) / (vmax - vmin) * h; }

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
    plot(meanHist, COLORS.jobs[2], 1);
    plot(bestHist, COLORS.jobs[1], 1.6);

    fctx.fillStyle = COLORS.text;
    fctx.textAlign = "left";
    fctx.fillText("gen " + gen, padL, FH - 16);
    fctx.textAlign = "right";
    fctx.fillText("best " + best.toFixed(1), padL + w, FH - 16);
  }

  // ---------- Stats ----------
  var statEls = {
    done: document.querySelector('[data-sim="done"]'),
    flow: document.querySelector('[data-sim="flow"]'),
    util: document.querySelector('[data-sim="util"]')
  };

  function updateStats() {
    if (!statEls.done) return;
    var meanFlow = sim.flowWindow.length
      ? sim.flowWindow.reduce(function (a, b) { return a + b; }, 0) / sim.flowWindow.length
      : 0;
    var util = sim.t > 0
      ? sim.machines.reduce(function (a, m) { return a + m.busy; }, 0) / (MACHINES * sim.t) * 100
      : 0;
    statEls.done.textContent = sim.completed;
    statEls.flow.textContent = meanFlow.toFixed(1);
    statEls.util.textContent = util.toFixed(0) + "%";
  }

  // ---------- Main loop ----------
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

  // warm start the shop floor so the first frame is already alive,
  // but keep the fitness panel young so visitors watch it converge live
  initMachines();
  for (var i = 0; i < 240; i++) { step(0.25); }
  for (var j = 0; j < 6; j++) { stepFitness(GEN_STEP); }
  drawGantt();
  drawFitness();
  updateStats();

  if (running) requestAnimationFrame(frame);

  var btn = document.querySelector(".sim-toggle");
  if (btn) {
    btn.textContent = running ? "Pause" : "Play";
    btn.addEventListener("click", function () {
      running = !running;
      btn.textContent = running ? "Pause" : "Play";
      if (running) { last = null; requestAnimationFrame(frame); }
    });
  }
})();
