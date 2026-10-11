// Per-symbol geometry (step line, curtain, dot, label) plus the rebuild helpers.
//
// Each line is drawn as a STEP line: from every sample the height holds flat out
// to the next radius, then jumps vertically to the next sample height. That needs
// two vertices per sample, hence the doubled buffers below. Radius = time.
export default `  // ---- per-symbol objects ----
  var labelsEl = document.getElementById("labels");
  var state = {}, syms = [], tips = [], curtains = [];
  var saved2 = null;
  try { saved2 = JSON.parse(localStorage.getItem("cloud-sel")); } catch (e2) {}

  // Historical series injected by the Worker (src/history.js).
  var HIST = (typeof HISTORY === "object" && HISTORY) ? HISTORY : {};
  function hourSeries(s) { return (HIST[s] && HIST[s].hourly) ? HIST[s].hourly : []; }
  function timeSeries(s) { return (HIST[s] && HIST[s].times) ? HIST[s].times : []; }
  function daySeries(s) { return (HIST[s] && HIST[s].daily) ? HIST[s].daily : []; }

  function shortName(s) {
    var n = s.replace("=X", "");
    if (n.length === 3) n = "USD" + n;
    return n;
  }

  GROUPS.forEach(function (g, gi) {
    var baseAng = gi * 2 * Math.PI / K;
    var gl = document.createElement("div");
    gl.className = "grp";
    gl.textContent = g.name;
    labelsEl.appendChild(gl);
    g.el = gl;
    g.pos = new THREE.Vector3(Math.cos(baseAng) * (RMAX + 38), 0, Math.sin(baseAng) * (RMAX + 38));
    g.list = [];

    g.symbols.forEach(function (s, j) {
      var a = baseAng + (j - (g.symbols.length - 1) / 2) * SPREAD;
      var o = {
        sym: s, name: shortName(s), group: g.name, grp: g, crypto: s.indexOf("-USD") > -1,
        enabled: !Array.isArray(saved2) || saved2.indexOf(s) > -1,
        dx: Math.cos(a), dz: Math.sin(a),
        live: null, sim: null, latest: null, base: null, ticks: 0, curLabel: "", vcount: 0,
        daily: daySeries(s), hourly: hourSeries(s), htimes: timeSeries(s), hist: [], times: [], nHist: 0,
        pct: new Float32Array(NPTS), rsi: new Float32Array(NPTS), tipPos: new THREE.Vector3(), shown: false
      };

      o.pos = new Float32Array(2 * NPTS * 3);
      o.col = new Float32Array(2 * NPTS * 3);
      var lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.BufferAttribute(o.pos, 3));
      lg.setAttribute("color", new THREE.BufferAttribute(o.col, 3));
      lg.setDrawRange(0, 0);
      o.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ vertexColors: true, fog: false }));
      o.line.frustumCulled = false;
      scene.add(o.line);

      o.cpos = new Float32Array(2 * NPTS * 2 * 3);
      o.ccol = new Float32Array(2 * NPTS * 2 * 3);
      var cg = new THREE.BufferGeometry();
      cg.setAttribute("position", new THREE.BufferAttribute(o.cpos, 3));
      cg.setAttribute("color", new THREE.BufferAttribute(o.ccol, 3));
      var idx = new Uint16Array((2 * NPTS - 2) * 6);
      for (var q = 0; q < 2 * NPTS - 2; q++) {
        var A = 2 * q, B = 2 * q + 1, C = 2 * q + 2, D = 2 * q + 3;
        idx.set([A, B, C, B, D, C], q * 6);
      }
      cg.setIndex(new THREE.BufferAttribute(idx, 1));
      cg.setDrawRange(0, 0);
      o.curtain = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      o.curtain.frustumCulled = false;
      scene.add(o.curtain);
      curtains.push(o.curtain);

      o.tip = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), new THREE.MeshBasicMaterial({ color: 0x7d8794, fog: false }));
      o.tip.visible = false;
      scene.add(o.tip);

      o.el = document.createElement("div");
      o.el.className = "lbl";
      o.el.textContent = o.name;
      o.el.style.display = "none";
      labelsEl.appendChild(o.el);

      state[s] = o;
      syms.push(o);
      g.list.push(o);
    });
  });
  var allSymbols = syms.map(function (o) { return o.sym; });

  function setColor(arr, off, y) {
    var c = y > 0.0001 ? UP : (y < -0.0001 ? DOWN : FLAT);
    arr[off] = c.r; arr[off + 1] = c.g; arr[off + 2] = c.b;
  }

  // Append one line+curtain vertex and return the next vertex index.
  function emit(o, v, x, y, z) {
    o.pos[v * 3] = x; o.pos[v * 3 + 1] = y; o.pos[v * 3 + 2] = z;
    setColor(o.col, v * 3, y);
    var t = v * 6;
    o.cpos[t] = x; o.cpos[t + 1] = y; o.cpos[t + 2] = z;
    o.cpos[t + 3] = x; o.cpos[t + 4] = 0; o.cpos[t + 5] = z;
    setColor(o.ccol, t, y);
    setColor(o.ccol, t + 3, y);
    return v + 1;
  }

  function hideSym(o) {
    o.shown = false;
    o.vcount = 0;
    o.tip.visible = false;
    o.el.style.display = "none";
    o.line.geometry.setDrawRange(0, 0);
    o.curtain.geometry.setDrawRange(0, 0);
  }

  // Seed the inner stretch of the line from the D1 history: hourly closes (and
  // their timestamps) first, then live ticks keep appending at the tip.
  function seed(o) {
    o.hist = o.hourly.slice();
    o.times = o.htimes.slice();
    o.nHist = o.hist.length;
    o.base = o.hist.length ? o.hist[0] : null;
  }
  syms.forEach(seed);

  // Wilder RSI over h[from..to), written into out[from..to). The first period
  // samples repeat the first computable value so lines start flat.
  function rsiValue(gain, loss) {
    if (loss === 0) return gain === 0 ? 50 : 100;
    if (gain === 0) return 0;
    return 100 - 100 / (1 + gain / loss);
  }
  function computeRSI(h, from, to, out) {
    var period = RSI_PERIOD, n = to - from, i;
    if (n <= period) { for (i = from; i < to; i++) out[i] = 50; return; }
    var gain = 0, loss = 0;
    for (i = from + 1; i <= from + period; i++) {
      var d = h[i] - h[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    gain /= period; loss /= period;
    var first = rsiValue(gain, loss);
    for (i = from; i <= from + period; i++) out[i] = first;
    for (i = from + period + 1; i < to; i++) {
      var e = h[i] - h[i - 1];
      gain = (gain * (period - 1) + (e > 0 ? e : 0)) / period;
      loss = (loss * (period - 1) + (e < 0 ? -e : 0)) / period;
      out[i] = rsiValue(gain, loss);
    }
  }

  // Rate of change (%) over h[from..to), written into out[]. Returns the max
  // absolute value in the segment so callers can normalise it to [-1, 1].
  function rocSeg(h, from, to, out) {
    var maxAbs = 1e-9, i;
    for (i = from; i < to; i++) {
      var prev = h[i - 1];
      var r = (i > from && prev > 0) ? (h[i] / prev - 1) * 100 : 0;
      out[i] = r;
      if (Math.abs(r) > maxAbs) maxAbs = Math.abs(r);
    }
    return maxAbs;
  }

  // Day-over-day close change (%), normalised by the largest daily move of the
  // window so the "slow" term stays in [-1, 1]. Returns 0 when there is no daily.
  function dailyNorm(o) {
    var d = o.daily;
    if (!d || d.length < 2) return 0;
    var maxAbs = 1e-9, last = 0, i;
    for (i = 1; i < d.length; i++) {
      var r = d[i - 1] > 0 ? (d[i] / d[i - 1] - 1) * 100 : 0;
      last = r;
      if (Math.abs(r) > maxAbs) maxAbs = Math.abs(r);
    }
    return Math.max(-1, Math.min(1, last / maxAbs));
  }

  // Height (world Y) of sample i for the active mode.
  function heightAt(o, i) {
    if (mode === "rsi") return (o.rsi[i] - 50) * (RSI_H / 50);
    if (mode === "hourly") return o.rsi[i] * NORM_H;
    return o.rsi[i] * ROC_H;
  }

  // modes:
  //   hourly   - normalised price line, hourly closes then live ticks
  //   rsi      - hourly RSI then live-tick RSI
  //   roc      - hourly rate of change then live-tick rate of change
  //   combined - weighted daily + hourly + tick ROC (see config.js weights)
  function rebuild(o) {
    var h = o.hist, n = h.length;
    if (!o.enabled || n === 0) return;
    var b = Math.min(o.nHist, n), i;

    if (mode === "hourly") {
      var maxAbs = 0;
      if (o.base != null) {
        for (i = 0; i < n; i++) {
          o.pct[i] = (h[i] / o.base - 1) * 100;
          var a = Math.abs(o.pct[i]);
          if (a > maxAbs) maxAbs = a;
        }
      }
      for (i = 0; i < n; i++) o.rsi[i] = maxAbs > 1e-9 ? o.pct[i] / maxAbs : 0;
    } else if (mode === "rsi") {
      computeRSI(h, 0, b, o.rsi);
      computeRSI(h, b, n, o.rsi);
    } else if (mode === "roc") {
      var m = rocSeg(h, 0, n, o.pct);
      for (i = 0; i < n; i++) o.rsi[i] = m > 1e-9 ? o.pct[i] / m : 0;
    } else {
      var hmax = rocSeg(h, 0, b, o.pct);
      var tmax = rocSeg(h, b, n, o.rsi);
      var dNorm = dailyNorm(o);
      var wsum = (W_DAILY + W_HOURLY + W_TICK) || 1;
      for (i = 0; i < b; i++) o.pct[i] = hmax > 1e-9 ? o.pct[i] / hmax : 0;
      var lastH = b > 0 ? o.pct[b - 1] : 0;
      for (i = 0; i < b; i++) o.rsi[i] = Math.max(-1, Math.min(1, (W_DAILY * dNorm + W_HOURLY * o.pct[i]) / wsum));
      for (i = b; i < n; i++) {
        var tv = tmax > 1e-9 ? o.rsi[i] / tmax : 0;
        o.rsi[i] = Math.max(-1, Math.min(1, (W_DAILY * dNorm + W_HOURLY * lastH + W_TICK * tv) / wsum));
      }
    }

    // Emit the step line: flat run to the next radius, then the vertical jump.
    var v = 0, lastY = 0;
    for (i = 0; i < n; i++) {
      lastY = heightAt(o, i);
      var r = R0 + i * DR;
      v = emit(o, v, o.dx * r, lastY, o.dz * r);
      if (i < n - 1) {
        var r2 = R0 + (i + 1) * DR;
        v = emit(o, v, o.dx * r2, lastY, o.dz * r2);
      }
    }
    o.line.geometry.attributes.position.needsUpdate = true;
    o.line.geometry.attributes.color.needsUpdate = true;
    o.line.geometry.setDrawRange(0, v);
    o.curtain.geometry.attributes.position.needsUpdate = true;
    o.curtain.geometry.attributes.color.needsUpdate = true;
    o.curtain.geometry.setDrawRange(0, Math.max(0, (v - 1) * 6));

    var lv = v - 1;
    var x = o.pos[lv * 3], y = o.pos[lv * 3 + 1], z = o.pos[lv * 3 + 2];
    var up = lastY > 0.0001, down = lastY < -0.0001;
    o.vcount = v;
    o.tipPos.set(x, y, z);
    o.tip.position.copy(o.tipPos);
    o.tip.material.color.copy(up ? UP : (down ? DOWN : FLAT));
    o.shown = true;
    o.tip.visible = true;
    o.el.style.display = "block";
    o.el.className = "lbl" + (up ? " up" : (down ? " down" : ""));
    o.curLabel = metricAt(o, n - 1);
    o.el.textContent = o.name + " " + o.curLabel;
  }

  // Formatted metric value at sample index s (s may be any point, for the hover).
  function metricAt(o, s) {
    if (mode === "rsi") return "RSI " + o.rsi[s].toFixed(1);
    if (mode === "roc") return "ROC " + fmtSigned(o.pct[s], 3) + "%";
    if (mode === "combined") return "CROC " + fmtSigned(o.rsi[s] * 100, 1);
    return fmtPrice(o.hist[s]);
  }
  function fmtSigned(v, d) { return (v >= 0 ? "+" : "") + v.toFixed(d); }
  function fmtPrice(p) { return p == null ? "--" : (p >= 100 ? p.toFixed(2) : p.toFixed(5)); }
  function rebuildAll() { syms.forEach(rebuild); }

  function clearSym(o) {
    seed(o);
    o.sim = null; o.latest = null; o.ticks = 0;
    hideSym(o);
  }
  function rebase() { syms.forEach(clearSym); }

  rebuildAll();

`;