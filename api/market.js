// Omninomics v5.0.0 — market data API
// Vercel Hobby uyumlu: max 10s function execution
// Strateji: paralel mirror fetch (Promise.any), per-request 5s timeout
// Sıralama: önce Binance spot/futures fallback, sonra MEXC, sonra OKX, sonra CryptoCompare

const TF_MEXC = { "5m":"5m", "15m":"15m", "1h":"60m", "4h":"4h", "1d":"1d" };
const TF_OKX  = { "5m":"5m", "15m":"15m", "1h":"1H",  "4h":"4H", "1d":"1D" };
const TF_BINANCE = { "5m":"5m", "15m":"15m", "1h":"1h", "4h":"4h", "1d":"1d" };
const TF_CC = {
  "5m":  { path:"histominute", aggregate:5  },
  "15m": { path:"histominute", aggregate:15 },
  "1h":  { path:"histohour",   aggregate:1  },
  "4h":  { path:"histohour",   aggregate:4  },
  "1d":  { path:"histoday",    aggregate:1  }
};

const BINANCE_MIRRORS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com"
];

const PER_REQUEST_TIMEOUT_MS = 5000;

function baseFromSymbol(symbol) {
  return String(symbol || "").toUpperCase().replace(/USDT$/, "");
}

function okxInst(symbol) {
  return baseFromSymbol(symbol) + "-USDT";
}

async function getJson(url, timeout = PER_REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "accept": "application/json", "user-agent": "OmninomicsTradeEngine/5.0" }
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!r.ok) {
      const snippet = typeof json === "string" ? json.slice(0, 150) : JSON.stringify(json).slice(0, 150);
      throw new Error(`HTTP ${r.status}: ${snippet}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

// Paralel mirror fetch: ilk başarılı yanıtı al
async function getJsonAnyMirror(urls, timeout = PER_REQUEST_TIMEOUT_MS) {
  const tasks = urls.map(u => getJson(u, timeout));
  return await Promise.any(tasks);
}

function normalizeBinanceKlines(rows) {
  return (rows || []).map(k => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low:  Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5] || 0)
  })).filter(x => Number.isFinite(x.close));
}

function normalizeMexcKlines(rows) {
  return normalizeBinanceKlines(rows);
}

function normalizeOkxKlines(rows) {
  return (rows || []).map(k => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low:  Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5] || 0)
  })).filter(x => Number.isFinite(x.close)).reverse();
}

function normalizeCcRows(rows) {
  return (rows || []).map(k => ({
    time: Number(k.time) * 1000,
    open: Number(k.open),
    high: Number(k.high),
    low:  Number(k.low),
    close: Number(k.close),
    volume: Number(k.volumefrom || k.volumeto || 0)
  })).filter(x => Number.isFinite(x.close));
}

async function fetchBinanceSpot(symbol, tf) {
  const interval = TF_BINANCE[tf] || "1h";
  const klUrls = BINANCE_MIRRORS.map(b => `${b}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=220`);
  const tkUrls = BINANCE_MIRRORS.map(b => `${b}/api/v3/ticker/24hr?symbol=${symbol}`);
  const kl = await getJsonAnyMirror(klUrls);
  const ticker = await getJsonAnyMirror(tkUrls).catch(() => null);
  return {
    symbol,
    source: "LIVE BINANCE",
    market: "binance",
    ticker: ticker ? { price: Number(ticker.lastPrice), change: Number(ticker.priceChangePercent || 0) } : null,
    candles: normalizeBinanceKlines(kl)
  };
}

async function fetchMexc(symbol, tf) {
  const interval = TF_MEXC[tf] || "60m";
  const kl = await getJson(`https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=220`);
  const ticker = await getJson(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${symbol}`).catch(() => null);
  return {
    symbol,
    source: "LIVE MEXC",
    market: "mexc",
    ticker: ticker ? { price: Number(ticker.lastPrice), change: Number(ticker.priceChangePercent || 0) } : null,
    candles: normalizeMexcKlines(kl)
  };
}

async function fetchOkx(symbol, tf) {
  const inst = okxInst(symbol);
  const bar = TF_OKX[tf] || "1H";
  const kl = await getJson(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(inst)}&bar=${bar}&limit=220`);
  if (kl.code !== "0") throw new Error(kl.msg || "OKX candles error");
  const tk = await getJson(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(inst)}`).catch(() => null);
  let ticker = null;
  if (tk && tk.code === "0" && tk.data && tk.data[0]) {
    const d = tk.data[0];
    const last = Number(d.last);
    const open24h = Number(d.open24h);
    ticker = { price: last, change: open24h ? (last - open24h) / open24h * 100 : 0 };
  }
  return { symbol, source: "LIVE OKX", market: "okx", ticker, candles: normalizeOkxKlines(kl.data || []) };
}

async function fetchCryptoCompare(symbol, tf) {
  const base = baseFromSymbol(symbol);
  const t = TF_CC[tf] || TF_CC["1h"];
  const url = `https://min-api.cryptocompare.com/data/v2/${t.path}?fsym=${encodeURIComponent(base)}&tsym=USD&limit=220&aggregate=${t.aggregate}`;
  const j = await getJson(url);
  if (!j.Data || !j.Data.Data || !j.Data.Data.length) throw new Error(j.Message || "CryptoCompare empty");
  const price = await getJson(`https://min-api.cryptocompare.com/data/price?fsym=${encodeURIComponent(base)}&tsyms=USD`).catch(() => null);
  return {
    symbol,
    source: "LIVE CRYPTOCOMPARE",
    market: "cryptocompare",
    ticker: price && price.USD ? { price: Number(price.USD), change: 0 } : null,
    candles: normalizeCcRows(j.Data.Data)
  };
}

// Sıralı fallback ama hızlı: ilk başarılıyı al
async function fetchWithFallback(symbol, tf, errors) {
  const sources = [
    { name: "Binance",  fn: () => fetchBinanceSpot(symbol, tf) },
    { name: "MEXC",     fn: () => fetchMexc(symbol, tf) },
    { name: "OKX",      fn: () => fetchOkx(symbol, tf) },
    { name: "CryptoCompare", fn: () => fetchCryptoCompare(symbol, tf) }
  ];
  for (const src of sources) {
    try {
      const result = await src.fn();
      if (result.candles && result.candles.length) return result;
      errors.push(`${src.name}: empty candles`);
    } catch (e) {
      errors.push(`${src.name}: ${(e.message || String(e)).slice(0, 120)}`);
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=15, s-maxage=15, stale-while-revalidate=30",
    "Content-Type": "application/json"
  };

  if ((req.method || "GET") === "OPTIONS") {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(204).send("");
    return;
  }

  const symbol = String((req.query && req.query.symbol) || "BTCUSDT").toUpperCase();
  const tf = String((req.query && req.query.tf) || "1h");
  const errors = [];

  try {
    const result = await fetchWithFallback(symbol, tf, errors);
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (result) {
      res.status(200).send(JSON.stringify(result));
    } else {
      res.status(502).send(JSON.stringify({
        symbol,
        source: "DATA ERROR",
        market: "none",
        candles: [],
        ticker: null,
        error: errors.slice(0, 4).join(" | ")
      }));
    }
  } catch (e) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(502).send(JSON.stringify({
      symbol,
      source: "DATA ERROR",
      market: "none",
      candles: [],
      ticker: null,
      error: e.message || String(e)
    }));
  }
};
