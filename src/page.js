// Assembles the single HTML document that is served for every request.
import shell from "./document/shell.js";
import tail from "./document/tail.js";
import { clientScript } from "./client/index.js";

// The "__GROUPS__" token is replaced with a function replacer so that "$"
// characters in the JSON can never be misread as replacement patterns.
export function renderPage(groups) {
  const page = shell + clientScript + tail;
  return page.replace("__GROUPS__", () => JSON.stringify(groups));
}
