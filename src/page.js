// Assembles the single HTML document that is served for every request.
import shell from "./document/shell.js";
import tail from "./document/tail.js";
import { clientScript } from "./client/index.js";

// The "__GROUPS__" and "__HISTORY__" tokens are replaced with function replacers
// so that "$" characters in the JSON can never be misread as replacement patterns.
export function renderPage(groups, history) {
  const page = shell + clientScript + tail;
  return page
    .replace("__GROUPS__", () => JSON.stringify(groups))
    .replace("__HISTORY__", () => JSON.stringify(history || {}));
}