// Live 3D price cloud - Cloudflare Worker
// Each symbol is one line radiating from the centre. Distance from the centre = time
// (oldest at the centre, newest at the tip). Height = % change since the baseline.
// The landscape underneath uses the eroded fbm from Inigo Quilez's "More noise" article
// (value noise with analytic derivatives, h += b * n / (1 + dot(d, d))).

const GROUPS = [
  { name: "EUR", symbols: ["EURUSD=X", "EURGBP=X", "EURJPY=X", "EURCHF=X", "EURCAD=X", "EURNZD=X", "EURAUD=X"] },
  { name: "AUD", symbols: ["AUDUSD=X", "AUDJPY=X", "AUDNZD=X", "AUDCHF=X", "AUDCAD=X"] },
  { name: "GBP", symbols: ["GBPUSD=X", "GBPJPY=X", "GBPAUD=X", "GBPCAD=X", "GBPNZD=X"] },
  { name: "JPY", symbols: ["JPY=X", "CADJPY=X", "NZDJPY=X"] },
  { name: "Minors", symbols: ["CAD=X", "CHF=X", "NZDUSD=X", "CADCHF=X", "NZDCHF=X"] },
  { name: "Nordics", symbols: ["SEK=X", "NOK=X", "DKK=X"] },
  { name: "Crypto", symbols: ["BTC-USD", "ETH-USD", "SOL-USD"] }
];

// NOTE: the client script below deliberately uses no backticks and no dollar-brace
// sequences, so it can live safely inside this template literal.
const PAGE = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Live Price Cloud</title>
<style>
  :root[data-theme="dark"] { --bg:#070a10; --panel:rgba(14,19,28,0.88); --line:#232d3b; --text:#d5dbe3;
    --muted:#8c98a8; --strong:#f1f4f8; --ctl:#1a2332; --ctlb:#2c394b; --up:#7ee3b5; --down:#ff8c90; --ok:#2ecc8f; --bad:#ff5a5f; }
  :root[data-theme="light"] { --bg:#e6edf4; --panel:rgba(255,255,255,0.9); --line:#cfd8e2; --text:#27313d;
    --muted:#667385; --strong:#0f1722; --ctl:#f0f4f8; --ctlb:#c5d0dc; --up:#0e8a5c; --down:#c62f36; --ok:#0e9f6e; --bad:#d63a40; }
  html, body { margin:0; height:100%; overflow:hidden; background:var(--bg); color:var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  canvas { display:block; }
  #ui { position:absolute; top:12px; left:12px; width:250px; max-height:calc(100% - 48px); overflow-y:auto;
    padding:12px 14px; border-radius:10px; box-sizing:border-box;
    background:var(--panel); border:1px solid var(--line); font-size:13px; line-height:1.4; }
  #ui h1 { margin:0 0 2px; font-size:16px; font-weight:600; color:var(--strong); }
  #ui .row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:9px; }
  #ui label { color:var(--muted); }
  #ui select, #ui button { background:var(--ctl); color:var(--text); border:1px solid var(--ctlb); border-radius:6px;
    padding:4px 8px; font:inherit; cursor:pointer; }
  #ui button:hover, #ui select:hover { border-color:var(--muted); }
  #ui input[type=range] { width:120px; }
  #ui .btns { display:flex; gap:6px; margin-top:11px; }
  #ui .btns button { flex:1; }
  #status { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--bad); margin-right:6px; }
  #status.on { background:var(--ok); }
  #clock, #total-data { color:var(--muted); font-variant-numeric: tabular-nums; }
  #hint { margin-top:10px; color:var(--muted); font-size:12px; }
  details { margin-top:11px; border-top:1px solid var(--line); padding-top:9px; }
  summary { cursor:pointer; color:var(--strong); font-weight:600; }
  .g { margin-top:8px; }
  .gh { display:flex; align-items:center; gap:6px; color:var(--strong) !important; font-weight:600; }
  .sy { display:grid; grid-template-columns:1fr 1fr; gap:2px 8px; margin:3px 0 0 20px; }
  .sy label { display:flex; align-items:center; gap:5px; font-size:12px; }
  #labels { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
  .lbl { position:absolute; left:0; top:0; white-space:nowrap; font-size:11px; color:var(--muted);
    margin-left:7px; margin-top:-7px; text-shadow:0 0 4px var(--bg), 0 0 4px var(--bg); }
  .lbl.up { color:var(--up); } .lbl.down { color:var(--down); }
  .lbl.hot { color:var(--strong); font-weight:600; }
  .grp { position:absolute; left:0; top:0; white-space:nowrap; font-size:14px; font-weight:600; color:var(--strong);
    text-shadow:0 0 6px var(--bg), 0 0 6px var(--bg); }
  #labels.off .lbl { display:none; }
  #tip { position:absolute; display:none; pointer-events:none; padding:7px 10px; border-radius:8px;
    background:var(--panel); border:1px solid var(--ctlb); font-size:12px; line-height:1.5; color:var(--text); }
  #tip b { font-size:14px; color:var(--strong); }
</style>
</head>
<body>
<div id="ui">
  <h1>Live price cloud</h1>
  <div id="clock"><span id="current-time">--:--:--</span> | <span id="current-date">--/--/----</span></div>
  <div style="margin-top:6px"><span id="status"></span><span id="status-text">Connecting</span></div>
  <div id="total-data">Data received: 0.00 MB</div>
  <div class="row"><label for="mode">Height shows</label>
    <select id="mode"><option value="pct">% change</option><option value="norm">Normalised</option></select></div>
  <div class="row"><label for="scale">Height scale</label><input id="scale" type="range" min="1" max="400" value="40"></div>
  <div class="row"><label for="tipsize">Dot size</label><input id="tipsize" type="range" min="0" max="10" step="0.5" value="3"></div>
  <div class="row"><label for="labels-on">Labels</label><input id="labels-on" type="checkbox" checked></div>
  <div class="row"><label for="terrain-on">Landscape</label><input id="terrain-on" type="checkbox" checked></div>
  <div class="row"><label for="demo">Simulate ticks</label><input id="demo" type="checkbox"></div>
  <div class="btns"><button id="theme">Light theme</button><button id="rebase">Rebase to now</button></div>
  <div class="btns"><button id="reset-view">Reset view</button></div>
  <details open>
    <summary>Instruments (<span id="sel-count">0</span>/<span id="sel-total">0</span>)</summary>
    <div class="btns"><button id="sel-all">All</button><button id="sel-none">None</button></div>
    <div id="groups"></div>
  </details>
  <div id="hint">Drag to orbit. Right-drag or W A S D to pan. Q and E for down and up. Scroll to zoom.</div>
</div>
<div id="labels"></div>
<div id="tip"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/protobufjs/7.2.3/protobuf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script>
(function () {
  var GROUPS = __GROUPS__;

  // ---- tunables ----
  var N = 300;              // samples kept per symbol (N x SAMPLE_MS = window length)
  var SAMPLE_MS = 1000;     // one point per symbol per second
  var R0 = 18, RMAX = 260;  // inner and outer radius of the lines
  var DR = (RMAX - R0) / (N - 1);
  var SPREAD = 0.085;       // angle between lines inside a wedge (radians)
  var NORM_H = 70;          // height of a normalised line
  var CLAMP_UP = 160, CLAMP_DOWN = 95;  // keep lines clear of the landscape
  var T_SIZE = 2600, T_SEG = 170, T_BASE = -150, T_HEIGHT = 55, T_FREQ = 1 / 520;

  // ---- themes ----
  var THEMES = {
    dark: {
      bg: 0x070a10, up: 0x2ecc8f, down: 0xff5a5f, flat: 0x7d8794, grid: 0x232e3d, div: 0x3a4a60,
      hemiSky: 0x7d93b8, hemiGround: 0x0a0d12, hemiI: 0.9, dirC: 0xaec4e6, dirI: 0.85, curtain: 0.16,
      stops: [[0, 0x0b1119], [0.4, 0x131c28], [0.75, 0x253246], [1, 0x7f94b0]], rock: 0x0f1620
    },
    light: {
      bg: 0xe6edf4, up: 0x0e9f6e, down: 0xd63a40, flat: 0x6b7480, grid: 0xb4c2d1, div: 0x8c9fb5,
      hemiSky: 0xffffff, hemiGround: 0xa9b39c, hemiI: 1.0, dirC: 0xfff3dc, dirI: 0.75, curtain: 0.22,
      stops: [[0, 0x9fb39a], [0.4, 0xc4c8a6], [0.75, 0xd9d2c3], [1, 0xf6f8fa]], rock: 0x8d8579
    }
  };
  var themeName = "dark";
  try {
    var saved = localStorage.getItem("cloud-theme");
    if (saved === "light" || saved === "dark") themeName = saved;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) themeName = "light";
  } catch (e) {}

  var UP = new THREE.Color(0x2ecc8f), DOWN = new THREE.Color(0xff5a5f), FLAT = new THREE.Color(0x7d8794);
  var mode = "pct", scale = 40, demo = false, totalBytes = 0, tipPx = 3;

  // ---- protobuf schema (unchanged from the original dashboard) ----
  var protoJSON = { nested: { PricingData: { fields: {
    id: { type: "string", id: 1 }, price: { type: "float", id: 2 }, time: { type: "sint64", id: 3 }
  } } } };
  var PricingData = protobuf.Root.fromJSON(protoJSON).lookupType("PricingData");

  // ---- three.js scene ----
  var W = window.innerWidth, H = window.innerHeight;
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070a10, 500, 1700);
  var camera = new THREE.PerspectiveCamera(55, W / H, 1, 5000);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.maxDistance = 1500;
  function resetView() { camera.position.set(0, 230, 440); controls.target.set(0, 0, 0); controls.update(); }
  resetView();

  var hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  var sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-350, 420, 220);
  scene.add(hemi); scene.add(sun);

  // ---- landscape: eroded fbm with analytic derivatives (Inigo Quilez, "More noise") ----
  function hash(ix, iz) {
    var h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }
  var nz = [0, 0, 0];
  // 2D value noise (cubic fade) returning value in nz[0] and derivatives in nz[1], nz[2]
  function noised(x, y) {
    var px = Math.floor(x), py = Math.floor(y);
    var wx = x - px, wy = y - py;
    var ux = wx * wx * (3 - 2 * wx), uy = wy * wy * (3 - 2 * wy);
    var dux = 6 * wx * (1 - wx), duy = 6 * wy * (1 - wy);
    var a = hash(px, py), b = hash(px + 1, py), c = hash(px, py + 1), d = hash(px + 1, py + 1);
    var k1 = b - a, k2 = c - a, k4 = a - b - c + d;
    nz[0] = -1 + 2 * (a + k1 * ux + k2 * uy + k4 * ux * uy);
    nz[1] = 2 * dux * (k1 + k4 * uy);
    nz[2] = 2 * duy * (k2 + k4 * ux);
  }
  function terrainH(x, z) {
    var a = 0, b = 1, dx = 0, dy = 0, px = x, pz = z;
    for (var i = 0; i < 10; i++) {
      noised(px, pz);
      dx += nz[1]; dy += nz[2];
      a += b * nz[0] / (1 + dx * dx + dy * dy);
      b *= 0.5;
      var t = px;
      px = (0.8 * t + 0.6 * pz) * 2;
      pz = (-0.6 * t + 0.8 * pz) * 2;
    }
    return a;
  }

  var tGeo = new THREE.PlaneGeometry(T_SIZE, T_SIZE, T_SEG, T_SEG);
  tGeo.rotateX(-Math.PI / 2);
  var tPos = tGeo.attributes.position;
  var raw = new Float32Array(tPos.count), rmin = 1e9, rmax = -1e9, vi;
  for (vi = 0; vi < tPos.count; vi++) {
    var hv = terrainH(tPos.getX(vi) * T_FREQ, tPos.getZ(vi) * T_FREQ);
    raw[vi] = hv;
    if (hv < rmin) rmin = hv;
    if (hv > rmax) rmax = hv;
  }
  for (vi = 0; vi < tPos.count; vi++) tPos.setY(vi, T_BASE + (raw[vi] - rmin) / (rmax - rmin) * T_HEIGHT);
  tGeo.computeVertexNormals();
  var tCol = new Float32Array(tPos.count * 3);
  tGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3));
  var terrain = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(terrain);

  var cA = new THREE.Color(), cB = new THREE.Color(), cRock = new THREE.Color();
  function paintTerrain(th) {
    var nrm = tGeo.attributes.normal;
    cRock.setHex(th.rock);
    for (var i = 0; i < tPos.count; i++) {
      var t = (tPos.getY(i) - T_BASE) / T_HEIGHT;
      var s = th.stops, k = 0;
      while (k < s.length - 2 && t > s[k + 1][0]) k++;
      var f = Math.max(0, Math.min(1, (t - s[k][0]) / (s[k + 1][0] - s[k][0])));
      cA.setHex(s[k][1]); cB.setHex(s[k + 1][1]); cA.lerp(cB, f);
      var slope = 1 - nrm.getY(i);
      var rk = Math.max(0, Math.min(1, (slope - 0.12) * 3.2));
      cA.lerp(cRock, rk);
      tCol[i * 3] = cA.r; tCol[i * 3 + 1] = cA.g; tCol[i * 3 + 2] = cA.b;
    }
    tGeo.attributes.color.needsUpdate = true;
  }

  // ---- floor lines: radial grid and wedge dividers (fog off so they stay crisp) ----
  var K = GROUPS.length;
  var radPts = [], divPts = [], q;
  for (q = 0; q < 28; q++) {
    var qa = q * 2 * Math.PI / 28;
    radPts.push(0, 0, 0, Math.cos(qa) * (RMAX + 12), 0, Math.sin(qa) * (RMAX + 12));
  }
  for (q = 0; q < K; q++) {
    var ang = q * 2 * Math.PI / K + Math.PI / K;
    divPts.push(Math.cos(ang) * R0, 0, Math.sin(ang) * R0, Math.cos(ang) * (RMAX + 12), 0, Math.sin(ang) * (RMAX + 12));
  }
  var radGeo = new THREE.BufferGeometry();
  radGeo.setAttribute("position", new THREE.Float32BufferAttribute(radPts, 3));
  var radMat = new THREE.LineBasicMaterial({ color: 0x232e3d, fog: false });
  scene.add(new THREE.LineSegments(radGeo, radMat));
  var divGeo = new THREE.BufferGeometry();
  divGeo.setAttribute("position", new THREE.Float32BufferAttribute(divPts, 3));
  var divMat = new THREE.LineBasicMaterial({ color: 0x3a4a60, fog: false });
  scene.add(new THREE.LineSegments(divGeo, divMat));

  // ---- per-symbol objects ----
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
        live: null, sim: null, latest: null, base: null, ticks: 0, curPct: 0,
        hist: [], pct: new Float32Array(N), tipPos: new THREE.Vector3(), shown: false
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

  function rebuild(o) {
    var h = o.hist, n = h.length;
    if (!o.enabled || n === 0 || o.base == null) return;
    var maxAbs = 0, i;
    for (i = 0; i < n; i++) {
      o.pct[i] = (h[i] / o.base - 1) * 100;
      var a = Math.abs(o.pct[i]);
      if (a > maxAbs) maxAbs = a;
    }
    var y = 0, x = 0, z = 0;
    for (i = 0; i < n; i++) {
      if (mode === "norm") y = maxAbs > 1e-9 ? o.pct[i] / maxAbs * NORM_H : 0;
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

    o.curPct = o.pct[n - 1];
    o.tipPos.set(x, y, z);
    o.tip.position.copy(o.tipPos);
    o.tip.material.color.copy(y > 0.0001 ? UP : (y < -0.0001 ? DOWN : FLAT));
    o.shown = true;
    o.tip.visible = true;
    o.el.style.display = "block";
    o.el.className = "lbl" + (o.curPct > 0 ? " up" : (o.curPct < 0 ? " down" : ""));
    o.el.textContent = o.name + " " + fmtPct(o.curPct);
  }

  function fmtPct(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }
  function fmtPrice(p) { return p >= 100 ? p.toFixed(2) : p.toFixed(5); }
  function rebuildAll() { syms.forEach(rebuild); }

  function clearSym(o) {
    o.hist = []; o.base = null; o.sim = null; o.latest = null; o.ticks = 0;
    hideSym(o);
  }
  function rebase() { syms.forEach(clearSym); }

  // ---- theme ----
  function applyTheme(name) {
    themeName = name;
    var th = THEMES[name];
    document.documentElement.setAttribute("data-theme", name);
    renderer.setClearColor(th.bg);
    scene.fog.color.setHex(th.bg);
    UP.setHex(th.up); DOWN.setHex(th.down); FLAT.setHex(th.flat);
    radMat.color.setHex(th.grid);
    divMat.color.setHex(th.div);
    hemi.color.setHex(th.hemiSky); hemi.groundColor.setHex(th.hemiGround); hemi.intensity = th.hemiI;
    sun.color.setHex(th.dirC); sun.intensity = th.dirI;
    curtains.forEach(function (c) { c.material.opacity = th.curtain; });
    paintTerrain(th);
    rebuildAll();
    document.getElementById("theme").textContent = name === "dark" ? "Light theme" : "Dark theme";
    try { localStorage.setItem("cloud-theme", name); } catch (e) {}
  }

  // ---- WebSocket and subscriptions ----
  var ws = null;
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function enabledList() { return syms.filter(function (o) { return o.enabled; }).map(function (o) { return o.sym; }); }

  // ---- instrument checkboxes ----
  var groupsEl = document.getElementById("groups");
  var groupBoxes = [];
  function saveSel() { try { localStorage.setItem("cloud-sel", JSON.stringify(enabledList())); } catch (e) {} }
  function refreshChecks() {
    var on = 0;
    GROUPS.forEach(function (g, gi) {
      var c = 0;
      g.list.forEach(function (o) { if (o.enabled) c++; o.box.checked = o.enabled; });
      on += c;
      var gb = groupBoxes[gi];
      gb.checked = c === g.list.length;
      gb.indeterminate = c > 0 && c < g.list.length;
      g.anyOn = c > 0;
    });
    document.getElementById("sel-count").textContent = on;
    document.getElementById("sel-total").textContent = syms.length;
  }
  function setEnabled(list, on) {
    var changed = [];
    list.forEach(function (o) {
      if (o.enabled === on) return;
      o.enabled = on;
      clearSym(o);
      o.live = null;
      changed.push(o.sym);
    });
    if (changed.length) send(on ? { subscribe: changed } : { unsubscribe: changed });
    refreshChecks();
    saveSel();
  }
  GROUPS.forEach(function (g) {
    var wrap = document.createElement("div"); wrap.className = "g";
    var head = document.createElement("label"); head.className = "gh";
    var gb = document.createElement("input"); gb.type = "checkbox";
    head.appendChild(gb); head.appendChild(document.createTextNode(g.name));
    wrap.appendChild(head);
    groupBoxes.push(gb);
    gb.addEventListener("change", function () { setEnabled(g.list, gb.checked); });
    var grid = document.createElement("div"); grid.className = "sy";
    g.list.forEach(function (o) {
      var l = document.createElement("label");
      var b = document.createElement("input"); b.type = "checkbox";
      o.box = b;
      l.appendChild(b); l.appendChild(document.createTextNode(o.name));
      grid.appendChild(l);
      b.addEventListener("change", function () { setEnabled([o], b.checked); });
    });
    wrap.appendChild(grid);
    groupsEl.appendChild(wrap);
  });
  document.getElementById("sel-all").addEventListener("click", function () { setEnabled(syms, true); });
  document.getElementById("sel-none").addEventListener("click", function () { setEnabled(syms, false); });
  refreshChecks();

  // ---- once-per-second sampler ----
  function gauss() { return Math.random() + Math.random() + Math.random() - 1.5; }
  setInterval(function () {
    syms.forEach(function (o) {
      if (!o.enabled) return;
      if (demo) {
        if (o.sim == null) o.sim = o.live || 1;
        o.sim = o.sim * (1 + gauss() * (o.crypto ? 0.0009 : 0.00018));
        o.latest = o.sim;
        o.ticks++;
      } else {
        o.latest = o.live;
      }
      if (o.latest == null) return;
      if (o.base == null) o.base = o.latest;
      o.hist.push(o.latest);
      if (o.hist.length > N) o.hist.shift();
      rebuild(o);
    });
  }, SAMPLE_MS);

  // ---- Yahoo WebSocket ----
  var statusDot = document.getElementById("status");
  var statusText = document.getElementById("status-text");
  var totalEl = document.getElementById("total-data");

  function connect() {
    ws = new WebSocket("wss://streamer.finance.yahoo.com/?version=2");
    ws.onopen = function () {
      statusDot.className = "on"; statusText.textContent = "Live";
      var list = enabledList();
      if (list.length) ws.send(JSON.stringify({ subscribe: list }));
    };
    ws.onmessage = function (event) {
      totalBytes += event.data.length;
      totalEl.textContent = "Data received: " + (totalBytes / (1024 * 1024)).toFixed(2) + " MB";
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === "pricing") {
          var bytes = Uint8Array.from(atob(msg.message), function (c) { return c.charCodeAt(0); });
          var d = PricingData.decode(bytes);
          var o = state[d.id];
          if (o && o.enabled && d.price > 0) { o.live = d.price; if (!demo) o.ticks++; }
        }
      } catch (e) { console.warn("Decode error:", e); }
    };
    ws.onerror = function (err) { console.error("WebSocket error", err); };
    ws.onclose = function () {
      statusDot.className = ""; statusText.textContent = "Reconnecting";
      setTimeout(connect, 2000);
    };
  }
  connect();

  // ---- UI wiring ----
  document.getElementById("mode").addEventListener("change", function (e) { mode = e.target.value; rebuildAll(); });
  document.getElementById("scale").addEventListener("input", function (e) { scale = Number(e.target.value); rebuildAll(); });
  document.getElementById("tipsize").addEventListener("input", function (e) { tipPx = Number(e.target.value); });
  document.getElementById("labels-on").addEventListener("change", function (e) {
    labelsEl.className = e.target.checked ? "" : "off";
  });
  document.getElementById("terrain-on").addEventListener("change", function (e) { terrain.visible = e.target.checked; });
  document.getElementById("demo").addEventListener("change", function (e) { demo = e.target.checked; rebase(); });
  document.getElementById("rebase").addEventListener("click", rebase);
  document.getElementById("reset-view").addEventListener("click", resetView);
  document.getElementById("theme").addEventListener("click", function () { applyTheme(themeName === "dark" ? "light" : "dark"); });

  function updateClock() {
    var now = new Date();
    function p(v) { return String(v).padStart(2, "0"); }
    document.getElementById("current-time").textContent = p(now.getHours()) + ":" + p(now.getMinutes()) + ":" + p(now.getSeconds());
    document.getElementById("current-date").textContent = p(now.getDate()) + "/" + p(now.getMonth() + 1) + "/" + now.getFullYear();
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ---- keyboard panning ----
  var keys = {};
  window.addEventListener("keydown", function (e) { keys[e.code] = true; });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });
  var fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
  var UPV = new THREE.Vector3(0, 1, 0);
  function keyPan(dt) {
    move.set(0, 0, 0);
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    right.crossVectors(fwd, UPV).normalize();
    if (keys.KeyW || keys.ArrowUp) move.add(fwd);
    if (keys.KeyS || keys.ArrowDown) move.sub(fwd);
    if (keys.KeyD || keys.ArrowRight) move.add(right);
    if (keys.KeyA || keys.ArrowLeft) move.sub(right);
    if (keys.KeyE) move.y += 1;
    if (keys.KeyQ) move.y -= 1;
    if (move.lengthSq() === 0) return;
    var speed = camera.position.distanceTo(controls.target) * 0.9 * dt * (keys.ShiftLeft ? 2.5 : 1);
    move.normalize().multiplyScalar(speed);
    camera.position.add(move);
    controls.target.add(move);
  }

  // ---- hover tooltip (nearest tip on screen) ----
  var mouse = new THREE.Vector2(-9999, -9999), mx = 0, my = 0, hovered = null;
  var tipEl = document.getElementById("tip");
  var hp = new THREE.Vector3();
  renderer.domElement.addEventListener("pointermove", function (e) { mx = e.clientX; my = e.clientY; mouse.set(mx, my); });
  renderer.domElement.addEventListener("pointerleave", function () { mouse.set(-9999, -9999); });
  function updateHover() {
    var best = null, bestD = 16;
    syms.forEach(function (o) {
      if (!o.shown) return;
      hp.copy(o.tipPos).project(camera);
      if (hp.z > 1) return;
      var dx = (hp.x * 0.5 + 0.5) * W - mouse.x, dy = (-hp.y * 0.5 + 0.5) * H - mouse.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = o; }
    });
    if (hovered && hovered !== best) hovered.el.classList.remove("hot");
    hovered = best;
    if (!hovered) { tipEl.style.display = "none"; return; }
    hovered.el.classList.add("hot");
    tipEl.innerHTML = "<b>" + hovered.name + "</b> (" + hovered.group + ")<br>Price " + fmtPrice(hovered.latest) +
      "<br>Change " + fmtPct(hovered.curPct) + "<br>Ticks " + hovered.ticks;
    tipEl.style.display = "block";
    tipEl.style.left = (mx + 14) + "px";
    tipEl.style.top = (my + 14) + "px";
  }

  // ---- label projection ----
  var tmp = new THREE.Vector3();
  function place(el, v, centre) {
    tmp.copy(v).project(camera);
    if (tmp.z > 1) { el.style.visibility = "hidden"; return; }
    el.style.visibility = "visible";
    el.style.transform = "translate(" + ((tmp.x * 0.5 + 0.5) * W) + "px," + ((-tmp.y * 0.5 + 0.5) * H) + "px)" +
      (centre ? " translate(-50%,-50%)" : "");
  }

  // ---- render loop ----
  var last = performance.now();
  function animate(t) {
    requestAnimationFrame(animate);
    var dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    keyPan(dt);
    controls.update();
    updateHover();
    var pxToWorld = 2 * Math.tan(camera.fov * Math.PI / 360) / H;
    syms.forEach(function (o) {
      if (!o.shown) return;
      var sz = camera.position.distanceTo(o.tip.position) * pxToWorld * tipPx;
      o.tip.scale.setScalar(sz);
      o.tip.material.visible = tipPx > 0;
    });
    renderer.render(scene, camera);
    GROUPS.forEach(function (g) {
      g.el.style.display = g.anyOn ? "block" : "none";
      if (g.anyOn) place(g.el, g.pos, true);
    });
    syms.forEach(function (o) { if (o.shown) place(o.el, o.tipPos, false); });
  }

  applyTheme(themeName);
  requestAnimationFrame(animate);

  window.addEventListener("resize", function () {
    W = window.innerWidth; H = window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });
})();
</script>
</body>
</html>`;

export default {
  async fetch(req) {
    // Function replacer so "$" characters in the JSON can never be misread as patterns.
    const html = PAGE.replace("__GROUPS__", () => JSON.stringify(GROUPS));
    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
};