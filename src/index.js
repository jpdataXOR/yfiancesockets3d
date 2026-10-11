// Live 3D price cloud - Cloudflare Worker.
//
// Assembles the page and seeds each line with history pulled from the two D1
// databases (hourly candles + daily forex prices). The client script lives in
// ./client and is inlined into the served HTML; the markup lives in ./document.
import { GROUPS } from "./groups.js";
import { renderPage } from "./page.js";
import { loadHistory } from "./history.js";

export default {
  async fetch(request, env) {
    const history = await loadHistory(env);
    const html = renderPage(GROUPS, history);
    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
};