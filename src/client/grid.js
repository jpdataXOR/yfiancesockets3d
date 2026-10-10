// Floor overlay: radial grid lines and the wedge dividers between groups.
export default `  // ---- floor lines: radial grid and wedge dividers (fog off so they stay crisp) ----
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

`;
