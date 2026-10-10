// Per-symbol geometry (line, curtain, dot, label) plus the rebuild helpers.
export default `  // ---- per-symbol objects ----
  var labelsEl = document.getElementById("labels");
  var state = {}, syms = [], tips = [], curtains = [];
  var saved2 = null;
  try { saved2 = JSON.parse(localStorage.getItem("cloud-sel")); } catch (e2) {}

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
        live: null, sim: null, latest: null, base: null, ticks: 0, curPct: 0, curRsi: 50,
        hist: [], pct: new Float32Array(N), rsi: new Float32Array(N), tipPos: new THREE.Vector3(), shown: false
      };

      o.pos = new Float32Array(N * 3);
      o.col = new Float32Array(N * 3);
      var lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.BufferAttribute(o.pos, 3));
      lg.setAttribute("color", new THREE.BufferAttribute(o.col, 3));
      lg.setDrawRange(0, 0);
      o.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ vertexColors: true, fog: false }));
      o.line.frustumCulled = false;
      scene.add(o.line);

      o.cpos = new Float32Array(N * 2 * 3);
      o.ccol = new Float32Array(N * 2 * 3);
      var cg = new THREE.BufferGeometry();
      cg.setAttribute("position", new THREE.BufferAttribute(o.cpos, 3));
      cg.setAttribute("color", new THREE.BufferAttribute(o.ccol, 3));
      var idx = new Uint16Array((N - 1) * 6);
      for (var i = 0; i < N - 1; i++) {
        var A = 2 * i, B = 2 * i + 1, C = 2 * i + 2, D = 2 * i + 3;
        idx.set([A, B, C, B, D, C], i * 6);
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

  function hideSym(o) {
    o.shown = false;
    o.tip.visible = false;
    o.el.style.display = "none";
    o.line.geometry.setDrawRange(0, 0);
    o.curtain.geometry.setDrawRange(0, 0);
  }

  // Wilder's RSI over the rolling price window. The first RSI_PERIOD samples
  // repeat the first computable value so lines start flat instead of ramping.
  function rsiValue(gain, loss) {
    if (loss === 0) return gain === 0 ? 50 : 100;
    if (gain === 0) return 0;
    return 100 - 100 / (1 + gain / loss);
  }
  function computeRSI(h, n, out) {
    var period = RSI_PERIOD, i;
    if (n <= period) { for (i = 0; i < n; i++) out[i] = 50; return; }
    var gain = 0, loss = 0;
    for (i = 1; i <= period; i++) {
      var d = h[i] - h[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    gain /= period; loss /= period;
    var first = rsiValue(gain, loss);
    for (i = 0; i <= period; i++) out[i] = first;
    for (i = period + 1; i < n; i++) {
      var e = h[i] - h[i - 1];
      gain = (gain * (period - 1) + (e > 0 ? e : 0)) / period;
      loss = (loss * (period - 1) + (e < 0 ? -e : 0)) / period;
      out[i] = rsiValue(gain, loss);
    }
  }

  function rebuild(o) {
    var h = o.hist, n = h.length;
    if (!o.enabled || n === 0) return;
    var useRsi = mode === "rsi";
    if (!useRsi && o.base == null) return;
    var maxAbs = 0, i;
    if (o.base != null) {
      for (i = 0; i < n; i++) {
        o.pct[i] = (h[i] / o.base - 1) * 100;
        var a = Math.abs(o.pct[i]);
        if (a > maxAbs) maxAbs = a;
      }
      o.curPct = o.pct[n - 1];
    }
    if (useRsi) computeRSI(h, n, o.rsi);
    var y = 0, x = 0, z = 0;
    for (i = 0; i < n; i++) {
      if (useRsi) y = (o.rsi[i] - 50) * (RSI_H / 50);
      else if (mode === "norm") y = maxAbs > 1e-9 ? o.pct[i] / maxAbs * NORM_H : 0;
      else y = Math.max(-CLAMP_DOWN, Math.min(CLAMP_UP, o.pct[i] * scale));
      var r = R0 + i * DR;
      x = o.dx * r; z = o.dz * r;
      o.pos[i * 3] = x; o.pos[i * 3 + 1] = y; o.pos[i * 3 + 2] = z;
      setColor(o.col, i * 3, y);
      var t = i * 6;
      o.cpos[t] = x; o.cpos[t + 1] = y; o.cpos[t + 2] = z;
      o.cpos[t + 3] = x; o.cpos[t + 4] = 0; o.cpos[t + 5] = z;
      setColor(o.ccol, t, y);
      setColor(o.ccol, t + 3, y);
    }
    o.line.geometry.attributes.position.needsUpdate = true;
    o.line.geometry.attributes.color.needsUpdate = true;
    o.line.geometry.setDrawRange(0, n);
    o.curtain.geometry.attributes.position.needsUpdate = true;
    o.curtain.geometry.attributes.color.needsUpdate = true;
    o.curtain.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));

    if (useRsi) o.curRsi = o.rsi[n - 1];
    var up = useRsi ? o.curRsi > 50 : o.curPct > 0;
    var down = useRsi ? o.curRsi < 50 : o.curPct < 0;
    o.tipPos.set(x, y, z);
    o.tip.position.copy(o.tipPos);
    o.tip.material.color.copy(y > 0.0001 ? UP : (y < -0.0001 ? DOWN : FLAT));
    o.shown = true;
    o.tip.visible = true;
    o.el.style.display = "block";
    o.el.className = "lbl" + (up ? " up" : (down ? " down" : ""));
    o.el.textContent = o.name + " " + (useRsi ? "RSI " + o.curRsi.toFixed(1) : fmtPct(o.curPct));
  }

  function fmtPct(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }
  function fmtPrice(p) { return p >= 100 ? p.toFixed(2) : p.toFixed(5); }
  function rebuildAll() { syms.forEach(rebuild); }

  function clearSym(o) {
    o.hist = []; o.base = null; o.sim = null; o.latest = null; o.ticks = 0;
    hideSym(o);
  }
  function rebase() { syms.forEach(clearSym); }

`;
