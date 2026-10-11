// Loads the historical series that seed the inner stretch of each line.
//
//   FOREXBINDING (5fe458e1-...) : instruments + hourly_candles   keyed "EURUSD=X"
//   DB_BINDING   (85de0869-...) : forex_daily_prices             keyed "EUR/USD"
//
// Crypto and futures have no daily rows, so they run on hourly + live ticks only.
import { GROUPS } from "./groups.js";

const HIST_DAILY = 30;
const HIST_HOURLY = 72;

const SYMBOLS = [];
GROUPS.forEach((g) => g.symbols.forEach((s) => SYMBOLS.push(s)));

// "EURUSD=X" -> "EUR/USD"; null for crypto ("BTC-USD") and futures ("NQ=F").
function dailyName(sym) {
  if (sym.indexOf("=X") === -1) return null;
  const code = sym.replace("=X", "");
  return code.length === 6 ? code.slice(0, 3) + "/" + code.slice(3) : null;
}

// Coerce a candle timestamp (epoch seconds/milliseconds or a SQL datetime
// string) to epoch milliseconds. SQL "YYYY-MM-DD HH:MM:SS" is treated as UTC.
function toMs(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const num = Number(s);
  if (s !== "" && !isNaN(num)) return num > 1e12 ? num : num * 1000;
  // SQL "YYYY-MM-DD HH:MM:SS" is UTC; parse explicitly to avoid local-time drift.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

export async function loadHistory(env) {
  const out = {};
  const byDaily = {};
  SYMBOLS.forEach((s) => {
    out[s] = { daily: [], hourly: [], times: [] };
    const d = dailyName(s);
    if (d) byDaily[d] = s;
  });
  if (!env || !env.FOREXBINDING) return out;

  try {
    const sets = await Promise.all([
      env.FOREXBINDING.prepare(
        "SELECT i.symbol AS symbol, h.timestamp AS ts, h.close AS close " +
          "FROM hourly_candles h JOIN instruments i ON i.id = h.instrument_id " +
          "ORDER BY i.symbol, h.timestamp"
      ).all(),
      env.DB_BINDING
        ? env.DB_BINDING.prepare(
            "SELECT instrument, close_price FROM forex_daily_prices " +
              "ORDER BY instrument, candle_time"
          ).all()
        : Promise.resolve({ results: [] })
    ]);

    (sets[0].results || []).forEach((r) => {
      const o = out[r.symbol];
      if (o && r.close != null) { o.hourly.push(r.close); o.times.push(toMs(r.ts)); }
    });
    (sets[1].results || []).forEach((r) => {
      const s = byDaily[r.instrument];
      if (s && r.close_price != null) out[s].daily.push(r.close_price);
    });
  } catch (e) {
    // A missing table should degrade to "no history", never break the page.
  }

  SYMBOLS.forEach((s) => {
    const o = out[s];
    if (o.hourly.length > HIST_HOURLY) {
      o.hourly = o.hourly.slice(-HIST_HOURLY);
      o.times = o.times.slice(-HIST_HOURLY);
    }
    if (o.daily.length > HIST_DAILY) o.daily = o.daily.slice(-HIST_DAILY);
  });
  return out;
}