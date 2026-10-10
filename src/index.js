// Live 3D price cloud - Cloudflare Worker
// Each symbol is one line radiating from the centre. Distance from the centre = time
// (oldest at the centre, newest at the tip). Height = % change since the baseline.
// The landscape underneath uses the eroded fbm from Inigo Quilez's "More noise" article
// (value noise with analytic derivatives, h += b * n / (1 + dot(d, d))).
//
// This entry only assembles the page; the client script lives in ./client and is
// inlined into the served HTML, while the markup lives in ./document.
import { GROUPS } from "./groups.js";
import { renderPage } from "./page.js";

export default {
  async fetch() {
    const html = renderPage(GROUPS);
    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
}
