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

export async function loadHistory(env) {
  const out = {};
  const byDaily = {};
  SYMBOLS.forEach((s) => {
    out[s] = { daily: [], hourly: [] };
    const d = dailyName(s);
    if (d) byDaily[d] = s;
  });
  if (!env || !env.FOREXBINDING) return out;

  try {
    const sets = await Promise.all([
      env.FOREXBINDING.prepare(
        "SELECT i.symbol AS symbol, h.close AS close " +
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
      if (o && r.close != null) o.hourly.push(r.close);
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
    if (o.hourly.length > HIST_HOURLY) o.hourly = o.hourly.slice(-HIST_HOURLY);
    if (o.daily.length > HIST_DAILY) o.daily = o.daily.slice(-HIST_DAILY);
  });
  return out;
}