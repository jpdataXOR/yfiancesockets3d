// UI wiring (mode, ROC weights, dot size, labels, terrain, demo, theme, view) and the clock.
export default `  // ---- UI wiring ----
  document.getElementById("mode").addEventListener("change", function (e) { mode = e.target.value; rebuildAll(); });
  document.getElementById("wd").addEventListener("input", function (e) { W_DAILY = Number(e.target.value); rebuildAll(); });
  document.getElementById("wh").addEventListener("input", function (e) { W_HOURLY = Number(e.target.value); rebuildAll(); });
  document.getElementById("wt").addEventListener("input", function (e) { W_TICK = Number(e.target.value); rebuildAll(); });
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

`;
