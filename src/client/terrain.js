// Eroded fbm landscape (Inigo Quilez, "More noise") and its vertex-colour painting.
export default `  // ---- landscape: eroded fbm with analytic derivatives (Inigo Quilez, "More noise") ----
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

`;
