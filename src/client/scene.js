// Three.js renderer, scene, camera, orbit controls and lights.
export default `  // ---- three.js scene ----
  var W = window.innerWidth, H = window.innerHeight;
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070a10, 500, 1700);
  var camera = new THREE.PerspectiveCamera(55, W / H, 1, 5000);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.maxDistance = 1500;
  function resetView() { camera.position.set(0, 230, 440); controls.target.set(0, 0, 0); controls.update(); }
  resetView();

  var hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  var sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-350, 420, 220);
  scene.add(hemi); scene.add(sun);

`;
