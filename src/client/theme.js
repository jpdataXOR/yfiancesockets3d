// applyTheme(): recolours scene, terrain, lines and curtains for the active theme.
export default `  // ---- theme ----
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

`;
