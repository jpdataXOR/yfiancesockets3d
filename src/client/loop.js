// Render loop, theme application, resize handling and first-frame kick-off.
export default `  // ---- render loop ----
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
`;
