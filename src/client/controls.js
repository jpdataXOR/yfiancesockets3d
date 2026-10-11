// Keyboard panning, the hover tooltip / point marker and label projection.
export default `  // ---- keyboard panning ----
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

  // ---- hover: nearest sampled vertex across all shown lines ----
  var mouse = new THREE.Vector2(-9999, -9999), mx = 0, my = 0, hovered = null;
  var tipEl = document.getElementById("tip");
  var hp = new THREE.Vector3();
  var hoverDot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  hoverDot.visible = false;
  scene.add(hoverDot);
  renderer.domElement.addEventListener("pointermove", function (e) { mx = e.clientX; my = e.clientY; mouse.set(mx, my); });
  renderer.domElement.addEventListener("pointerleave", function () { mouse.set(-9999, -9999); });

  function fmtTime(ms) { return ms == null ? "--" : new Date(ms).toLocaleString(); }

  function updateHover() {
    if (mouse.x < -9000) {
      if (hovered) { hovered.el.classList.remove("hot"); hovered = null; }
      hoverDot.visible = false; tipEl.style.display = "none";
      return;
    }
    var best = null, bestV = -1, bestD = 14, pxToWorld = 2 * Math.tan(camera.fov * Math.PI / 360) / H;
    syms.forEach(function (o) {
      if (!o.shown) return;
      var cnt = o.vcount, v;
      for (v = 0; v < cnt; v++) {
        hp.set(o.pos[v * 3], o.pos[v * 3 + 1], o.pos[v * 3 + 2]).project(camera);
        if (hp.z > 1) continue;
        var dx = (hp.x * 0.5 + 0.5) * W - mouse.x, dy = (-hp.y * 0.5 + 0.5) * H - mouse.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestD) { bestD = d; best = o; bestV = v; }
      }
    });
    if (hovered && hovered !== best) hovered.el.classList.remove("hot");
    hovered = best;
    if (!hovered) { hoverDot.visible = false; tipEl.style.display = "none"; return; }
    hovered.el.classList.add("hot");
    var s = bestV >> 1;
    hp.set(hovered.pos[bestV * 3], hovered.pos[bestV * 3 + 1], hovered.pos[bestV * 3 + 2]);
    hoverDot.position.copy(hp);
    hoverDot.scale.setScalar(camera.position.distanceTo(hp) * pxToWorld * Math.max(2, tipPx));
    hoverDot.visible = true;
    tipEl.innerHTML = "<b>" + hovered.name + "</b> (" + hovered.group + ")<br>" +
      fmtTime(hovered.times[s]) + "<br>" + metricAt(hovered, s) + "<br>Ticks " + hovered.ticks;
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

`;