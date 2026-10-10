// Subscription transport plus the instrument checkbox tree.
export default `  // ---- WebSocket and subscriptions ----
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

`;
