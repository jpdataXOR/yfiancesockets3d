// HTML shell: <head>, CSS, body markup and the CDN <script> tags, up to (and including) the opening <script> tag of the app.
export default `<!DOCTYPE html>
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
`;
