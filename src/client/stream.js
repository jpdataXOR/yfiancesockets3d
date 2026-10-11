// Once-per-second sampler and the Yahoo finance WebSocket feed.
export default `  // ---- once-per-second sampler ----
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
      if (o.hist.length > NPTS) { o.hist.shift(); if (o.nHist > 0) o.nHist--; }
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

`;
