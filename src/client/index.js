// The browser script, split into logical chunks.
//
// These fragments are concatenated, in the order imported below, into a single
// inline <script> by ../page.js. They share one function scope, so the order
// matters and the code must stay free of backticks and "${" so it survives
// living inside a template literal.
import bootstrap from "./bootstrap.js";
import config from "./config.js";
import scene from "./scene.js";
import terrain from "./terrain.js";
import grid from "./grid.js";
import symbols from "./symbols.js";
import theme from "./theme.js";
import instruments from "./instruments.js";
import stream from "./stream.js";
import ui from "./ui.js";
import controls from "./controls.js";
import loop from "./loop.js";

export const clientScript =
  bootstrap +
  config +
  scene +
  terrain +
  grid +
  symbols +
  theme +
  instruments +
  stream +
  ui +
  controls +
  loop;
