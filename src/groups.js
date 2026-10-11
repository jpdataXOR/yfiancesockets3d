// Instruments shown in the price cloud, grouped into wedges around the centre.
//
// Only symbols that exist in BOTH databases are charted: forex symbols carry a
// daily series (forex_daily_prices, "EUR/USD") and an hourly series
// (hourly_candles, "EURUSD=X"); BTC-USD has hourly data only and runs on live
// ticks. The "=X" / "-USD" names below are the Yahoo-style keys used by the
// client, the WebSocket feed and hourly_candles.
export const GROUPS = [
  { name: "Majors", symbols: ["EURUSD=X", "USDJPY=X", "GBPUSD=X", "USDCAD=X", "USDCHF=X", "AUDUSD=X", "NZDUSD=X"] },
  { name: "Crosses", symbols: ["AUDJPY=X", "AUDNZD=X", "CADJPY=X", "EURAUD=X", "EURCHF=X", "EURGBP=X", "EURJPY=X", "GBPJPY=X"] },
  { name: "Crypto", symbols: ["BTC-USD"] }
];