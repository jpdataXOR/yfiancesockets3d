// Client tunables, themes, live UI state and the Protobuf pricing schema.
export default `  // ---- tunables ----
  var N = 300;              // samples kept per symbol (N x SAMPLE_MS = window length)
  var SAMPLE_MS = 1000;     // one point per symbol per second
  var R0 = 18, RMAX = 260;  // inner and outer radius of the lines
  var DR = (RMAX - R0) / (N - 1);
  var SPREAD = 0.085;       // angle between lines inside a wedge (radians)
  var NORM_H = 70;          // height of a normalised line
  var CLAMP_UP = 160, CLAMP_DOWN = 95;  // keep lines clear of the landscape
  var T_SIZE = 2600, T_SEG = 170, T_BASE = -150, T_HEIGHT = 55, T_FREQ = 1 / 520;

  // ---- themes ----
  var THEMES = {
    dark: {
      bg: 0x070a10, up: 0x2ecc8f, down: 0xff5a5f, flat: 0x7d8794, grid: 0x232e3d, div: 0x3a4a60,
      hemiSky: 0x7d93b8, hemiGround: 0x0a0d12, hemiI: 0.9, dirC: 0xaec4e6, dirI: 0.85, curtain: 0.16,
      stops: [[0, 0x0b1119], [0.4, 0x131c28], [0.75, 0x253246], [1, 0x7f94b0]], rock: 0x0f1620
    },
    light: {
      bg: 0xe6edf4, up: 0x0e9f6e, down: 0xd63a40, flat: 0x6b7480, grid: 0xb4c2d1, div: 0x8c9fb5,
      hemiSky: 0xffffff, hemiGround: 0xa9b39c, hemiI: 1.0, dirC: 0xfff3dc, dirI: 0.75, curtain: 0.22,
      stops: [[0, 0x9fb39a], [0.4, 0xc4c8a6], [0.75, 0xd9d2c3], [1, 0xf6f8fa]], rock: 0x8d8579
    }
  };
  var themeName = "dark";
  try {
    var saved = localStorage.getItem("cloud-theme");
    if (saved === "light" || saved === "dark") themeName = saved;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) themeName = "light";
  } catch (e) {}

  var UP = new THREE.Color(0x2ecc8f), DOWN = new THREE.Color(0xff5a5f), FLAT = new THREE.Color(0x7d8794);
  var mode = "pct", scale = 40, demo = false, totalBytes = 0, tipPx = 3;

  // ---- protobuf schema (unchanged from the original dashboard) ----
  var protoJSON = { nested: { PricingData: { fields: {
    id: { type: "string", id: 1 }, price: { type: "float", id: 2 }, time: { type: "sint64", id: 3 }
  } } } };
  var PricingData = protobuf.Root.fromJSON(protoJSON).lookupType("PricingData");

`;
