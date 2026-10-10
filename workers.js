// Live 3D price cloud - Cloudflare Worker
// Each symbol is one line radiating from the centre. Distance from the centre = time
// (oldest at the centre, newest at the tip). Height = % change since the baseline.
// Symbols are grouped into wedges (EUR, AUD, GBP, ...).

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
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Live Price Cloud</title>
<style>
  html, body { margin:0; height:100%; overflow:hidden; background:#0a0e14; color:#d5dbe3;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  canvas { display:block; }
  #ui { position:absolute; top:12px; left:12px; width:236px; padding:12px 14px; border-radius:10px;
    background:rgba(16,22,31,0.86); border:1px solid #232d3b; font-size:13px; line-height:1.4; }
  #ui h1 { margin:0 0 2px; font-size:16px; font-weight:600; color:#f1f4f8; }
  #ui .row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:9px; }
  #ui label { color:#9aa6b6; }
  #ui select, #ui button { background:#1a2332; color:#d5dbe3; border:1px solid #2c394b; border-radius:6px;
    padding:4px 8px; font:inherit; cursor:pointer; }
  #ui button:hover, #ui select:hover { border-color:#4a607c; }
  #ui input[type=range] { width:120px; }
  #ui .btns { display:flex; gap:6px; margin-top:11px; }
  #ui .btns button { flex:1; }
  #status { display:inline-block; width:8px; height:8px; border-radius:50%; background:#ff5a5f; margin-right:6px; }
  #status.on { background:#2ecc8f; }
  #clock { color:#9aa6b6; font-variant-numeric: tabular-nums; }
  #hint { margin-top:10px; color:#7d8794; font-size:12px; }
  #labels { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
  .lbl { position:absolute; left:0; top:0; white-space:nowrap; font-size:11px; color:#aab4c2;
    margin-left:7px; margin-top:-7px; text-shadow:0 0 4px #0a0e14, 0 0 4px #0a0e14; }
  .lbl.up { color:#7ee3b5; } .lbl.down { color:#ff8c90; }
  .lbl.hot { color:#fff; font-weight:600; }
  .grp { position:absolute; left:0; top:0; white-space:nowrap; font-size:14px; font-weight:600; color:#f1f4f8;
    text-shadow:0 0 6px #0a0e14, 0 0 6px #0a0e14; }
  #labels.off .lbl { display:none; }
  #tip { position:absolute; display:none; pointer-events:none; padding:7px 10px; border-radius:8px;
    background:rgba(16,22,31,0.95); border:1px solid #2c394b; font-size:12px; line-height:1.5; }
  #tip b { font-size:14px; color:#fff; }
</style>
</head>
<body>
<div id="ui">
  <h1>Live price cloud</h1>
  <div id="clock"><span id="current-time">--:--:--</span> | <span id="current-date">--/--/----</span></div>
  <div style="margin-top:6px"><span id="status"></span><span id="status-text">Connecting</span></div>
  <div id="total-data" style="color:#9aa6b6">Data received: 0.00 MB</div>
  <div class="row"><label for="mode">Height shows</label>
    <select id="mode"><option value="pct">% change</option><option value="norm">Normalised</option></select></div>
  <div class="row"><label for="scale">Height scale</label><input id="scale" type="range" min="1" max="400" value="40"></div>
  <div class="row"><label for="tipsize">Dot size</label><input id="tipsize" type="range" min="0" max="10" step="0.5" value="3"></div>
  <div class="row"><label for="labels-on">Labels</label><input id="labels-on" type="checkbox" checked></div>
  <div class="row"><label for="demo">Simulate ticks</label><input id="demo" type="checkbox"></div>
  <div class="btns"><button id="rebase">Rebase to now</button><button id="reset-view">Reset view</button></div>
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
  var CLAMP = 160;          // max height in % change mode

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
  renderer.setClearColor(0x0a0e14);
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, W / H, 1, 4000);
  function resetView() { camera.position.set(0, 230, 440); controls.target.set(0, 0, 0); controls.update(); }
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.maxDistance = 1800;
  resetView();

  // floor grid, wedge dividers, centre axis
  scene.add(new THREE.PolarGridHelper(RMAX + 12, 28, 6, 64, 0x2a3442, 0x161e2a));
  var K = GROUPS.length;
  var divPts = [];
  for (var k = 0; k < K; k++) {
    var ang = k * 2 * Math.PI / K + Math.PI / K;
    divPts.push(Math.cos(ang) * R0, 0, Math.sin(ang) * R0, Math.cos(ang) * (RMAX + 12), 0, Math.sin(ang) * (RMAX + 12));
  }
  var divGeo = new THREE.BufferGeometry();
  divGeo.setAttribute("position", new THREE.Float32BufferAttribute(divPts, 3));
  scene.add(new THREE.LineSegments(divGeo, new THREE.LineBasicMaterial({ color: 0x3a4a60 })));
  var axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, -90, 0, 0, 160, 0], 3));
  scene.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0x3a4a60 })));

  // ---- per-symbol objects ----
  var labelsEl = document.getElementById("labels");
  var state = {}, syms = [], tips = [];

  function shortName(s) {
    var n = s.replace("=X", "");
    if (n.length === 3) n = "USD" + n;
    return n;
  }

  GROUPS.forEach(function (g, gi) {
    var baseAng = gi * 2 * Math.PI / K;
    g.angle = baseAng;
    var gl = document.createElement("div");
    gl.className = "grp";
    gl.textContent = g.name;
    labelsEl.appendChild(gl);
    g.el = gl;
    g.pos = new THREE.Vector3(Math.cos(baseAng) * (RMAX + 38), 0, Math.sin(baseAng) * (RMAX + 38));

    g.symbols.forEach(function (s, j) {
      var a = baseAng + (j - (g.symbols.length - 1) / 2) * SPREAD;
      var o = {
        sym: s, name: shortName(s), group: g.name, crypto: s.indexOf("-USD") > -1,
        dx: Math.cos(a), dz: Math.sin(a),
        live: null, sim: null, latest: null, base: null, ticks: 0, curPct: 0,
        hist: [], pct: new Float32Array(N), tipPos: new THREE.Vector3()
      };

      // line
      o.pos = new Float32Array(N * 3);
      o.col = new Float32Array(N * 3);
      var lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.BufferAttribute(o.pos, 3));
      lg.setAttribute("color", new THREE.BufferAttribute(o.col, 3));
      lg.setDrawRange(0, 0);
      o.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ vertexColors: true }));
      o.line.frustumCulled = false;
      scene.add(o.line);

      // translucent curtain between the line and the floor
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
        vertexColors: true, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      o.curtain.frustumCulled = false;
      scene.add(o.curtain);

      // tip marker (also the hover target)
      o.tip = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), new THREE.MeshBasicMaterial({ color: 0x7d8794 }));
      o.tip.visible = false;
      o.tip.userData.o = o;
      scene.add(o.tip);
      tips.push(o.tip);

      // text label
      o.el = document.createElement("div");
      o.el.className = "lbl";
      o.el.textContent = o.name;
      o.el.style.display = "none";
      labelsEl.appendChild(o.el);

      state[s] = o;
      syms.push(o);
    });
  });
  var instruments = syms.map(function (o) { return o.sym; });

  function setColor(arr, off, y) {
    var c = y > 0.0001 ? UP : (y < -0.0001 ? DOWN : FLAT);
    arr[off] = c.r; arr[off + 1] = c.g; arr[off + 2] = c.b;
  }

  function rebuild(o) {
    var h = o.hist, n = h.length;
    if (n === 0 || o.base == null) return;
    var maxAbs = 0, i;
    for (i = 0; i < n; i++) {
      o.pct[i] = (h[i] / o.base - 1) * 100;
      var a = Math.abs(o.pct[i]);
      if (a > maxAbs) maxAbs = a;
    }
    var y = 0, x = 0, z = 0;
    for (i = 0; i < n; i++) {
      if (mode === "norm") y = maxAbs > 1e-9 ? o.pct[i] / maxAbs * NORM_H : 0;
      else y = Math.max(-CLAMP, Math.min(CLAMP, o.pct[i] * scale));
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
    o.tip.visible = true;
    o.el.style.display = "block";
    o.el.className = "lbl" + (o.curPct > 0 ? " up" : (o.curPct < 0 ? " down" : ""));
    o.el.textContent = o.name + " " + fmtPct(o.curPct);
  }

  function fmtPct(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }
  function fmtPrice(p) { return p >= 100 ? p.toFixed(2) : p.toFixed(5); }
  function rebuildAll() { syms.forEach(rebuild); }

  function rebase() {
    syms.forEach(function (o) {
      o.hist = []; o.base = null; o.sim = null; o.latest = null; o.ticks = 0;
      o.tip.visible = false; o.el.style.display = "none";
      o.line.geometry.setDrawRange(0, 0);
      o.curtain.geometry.setDrawRange(0, 0);
    });
  }

  // ---- once-per-second sampler ----
  function gauss() { return Math.random() + Math.random() + Math.random() - 1.5; }
  setInterval(function () {
    syms.forEach(function (o) {
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
    var ws = new WebSocket("wss://streamer.finance.yahoo.com/?version=2");
    ws.onopen = function () {
      statusDot.className = "on"; statusText.textContent = "Live";
      ws.send(JSON.stringify({ subscribe: instruments }));
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
          if (o && d.price > 0) { o.live = d.price; if (!demo) o.ticks++; }
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
  document.getElementById("demo").addEventListener("change", function (e) { demo = e.target.checked; rebase(); });
  document.getElementById("rebase").addEventListener("click", rebase);
  document.getElementById("reset-view").addEventListener("click", resetView);

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

  // ---- hover tooltip ----
  var mouse = new THREE.Vector2(-9999, -9999), mx = 0, my = 0, hovered = null;
  var tipEl = document.getElementById("tip");
  var hp = new THREE.Vector3();
  renderer.domElement.addEventListener("pointermove", function (e) { mx = e.clientX; my = e.clientY; mouse.set(mx, my); });
  renderer.domElement.addEventListener("pointerleave", function () { mouse.set(-9999, -9999); });
  function updateHover() {
    var best = null, bestD = 16;
    syms.forEach(function (o) {
      if (!o.tip.visible) return;
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
      if (!o.tip.visible) return;
      var sz = camera.position.distanceTo(o.tip.position) * pxToWorld * tipPx;
      o.tip.scale.setScalar(sz);
      o.tip.material.visible = tipPx > 0;
    });
    renderer.render(scene, camera);
    GROUPS.forEach(function (g) { place(g.el, g.pos, true); });
    syms.forEach(function (o) { if (o.tip.visible) place(o.el, o.tipPos, false); });
  }
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