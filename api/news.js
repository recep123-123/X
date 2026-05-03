// OMNINOMICS v5.1.3 — Free News Intelligence API
// DISPLAY ONLY: News is never connected to the LONG/SHORT/WAIT decision engine.
// Primary: GDELT public DOC API (no key). Optional: FreeNewsApi and Finnhub if keys exist.
// Optional Turkish translation: title + description via Google Translate or LibreTranslate.

const DEFAULT_TIMEOUT = 5200;
const UA = 'Omninomics/5.1.3 display-only-news-tr';
const TRANSLATION_CACHE = globalThis.__OMNI_NEWS_TRANSLATION_CACHE__ || new Map();
globalThis.__OMNI_NEWS_TRANSLATION_CACHE__ = TRANSLATION_CACHE;

function timeoutFetch(url, opts = {}, ms = DEFAULT_TIMEOUT) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(id));
}

function cleanSymbol(s) {
  return String(s || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24) || 'BTCUSDT';
}

function baseAsset(symbol) {
  return cleanSymbol(symbol).replace(/USDT$|USD$|BUSD$|USDC$/g, '') || 'BTC';
}

function safeText(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function classify(text) {
  text = String(text || '').toLowerCase();
  if (/hack|exploit|breach|lawsuit|sec|probe|sanction|war|attack|missile|crash|liquidation|bankrupt|halt|outage|risk|bearish|default|depeg|delist|fraud|investigation/.test(text)) return 'bear';
  if (/approve|approved|approval|inflow|bullish|rally|surge|record|partnership|listing|upgrade|adoption|etf inflow|rate cut/.test(text)) return 'bull';
  if (/fed|fomc|cpi|pce|inflation|rate|oil|treasury|auction|macro|warning|alert|yields|jobs|payroll|tariff|dxy|dollar/.test(text)) return 'warn';
  return 'info';
}

function impactScore(text) {
  const t = String(text || '').toLowerCase();
  let s = 20;
  if (/fed|fomc|cpi|pce|nfp|payroll|treasury|yields|rate|inflation|dollar|dxy/.test(t)) s += 28;
  if (/sec|etf|blackrock|microstrategy|coinbase|binance|lawsuit|regulation|approval/.test(t)) s += 24;
  if (/hack|exploit|war|attack|oil|iran|israel|china|tariff|sanction|bankrupt|depeg|delist/.test(t)) s += 34;
  if (/bitcoin|btc|ethereum|eth|crypto|cryptocurrency/.test(t)) s += 14;
  return Math.max(0, Math.min(100, s));
}

function severityLabel(sev) {
  return ({ bear: 'RİSK', bull: 'POZİTİF', warn: 'DİKKAT', info: 'BİLGİ' })[sev] || 'BİLGİ';
}

function gdeltDateToISO(v) {
  const s = String(v || '');
  if (/^\d{14}$/.test(s)) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`;
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function defaultDescription(item) {
  const sev = severityLabel(item.severity);
  const src = item.source || item.provider || 'haber kaynağı';
  const impact = Number.isFinite(item.impact) ? item.impact : impactScore(item.title || '');
  return `${sev} başlığı · Kaynak: ${src} · Etki skoru: ${impact}/100 · Haber yalnızca ekranda gösterilir, karar motoruna etkisi 0%.`;
}

function normalizeItem(x) {
  const title = safeText(x.title || x.text || '');
  const description = safeText(x.description || x.summary || x.subtitle || x.excerpt || '');
  const raw = { ...x, title, description };
  raw.created_at = raw.created_at || new Date().toISOString();
  raw.severity = raw.severity || classify(`${title} ${description}`);
  raw.impact = Number.isFinite(raw.impact) ? raw.impact : impactScore(`${title} ${description}`);
  raw.display_only = true;
  raw.decision_weight = 0;
  raw.decision_binding = 'DISABLED';
  raw.title_original = title;
  raw.description_original = description;
  raw.title_tr = raw.title_tr || '';
  raw.description_tr = raw.description_tr || '';
  raw.title_display = raw.title_display || title;
  raw.description_display = raw.description_display || description || defaultDescription(raw);
  return raw;
}

function uniqueItems(items) {
  const seen = new Set();
  return (items || [])
    .filter(x => x && (x.title || x.text))
    .map(normalizeItem)
    .filter(x => {
      const k = (x.title_original || x.title || '').toLowerCase().replace(/[^a-z0-9ığüşöç ]/gi, '').slice(0, 120);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (b.impact || 0) - (a.impact || 0));
}

function translationProvider() {
  const forced = String(process.env.NEWS_TRANSLATION_PROVIDER || '').toLowerCase().trim();
  if (forced && forced !== 'auto') return forced;
  if (process.env.GOOGLE_TRANSLATE_API_KEY) return 'google';
  if (process.env.LIBRETRANSLATE_URL) return 'libre';
  return 'none';
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

async function translateWithGoogle(text, target) {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY || '';
  if (!key) throw new Error('GOOGLE_TRANSLATE_API_KEY yok');
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`;
  const r = await timeoutFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json', 'user-agent': UA },
    body: JSON.stringify({ q: text, target, format: 'text' })
  }, 5000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google Translate HTTP ${r.status}`);
  return decodeHtmlEntities(j?.data?.translations?.[0]?.translatedText || '');
}

async function translateWithLibre(text, target) {
  const base = String(process.env.LIBRETRANSLATE_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('LIBRETRANSLATE_URL yok');
  const body = { q: text, source: 'auto', target, format: 'text' };
  if (process.env.LIBRETRANSLATE_API_KEY) body.api_key = process.env.LIBRETRANSLATE_API_KEY;
  const r = await timeoutFetch(`${base}/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json', 'user-agent': UA },
    body: JSON.stringify(body)
  }, 5200);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`LibreTranslate HTTP ${r.status}`);
  return decodeHtmlEntities(j.translatedText || '');
}

async function translateText(text, target = 'tr') {
  text = safeText(text);
  if (!text || target === 'en') return { text, provider: 'none', translated: false };
  const provider = translationProvider();
  if (provider === 'none' || provider === 'off' || provider === 'disabled') return { text, provider: 'none', translated: false };
  const cacheKey = `${provider}:${target}:${text}`;
  if (TRANSLATION_CACHE.has(cacheKey)) return { text: TRANSLATION_CACHE.get(cacheKey), provider, translated: true, cached: true };
  let translated = '';
  if (provider === 'google') translated = await translateWithGoogle(text, target);
  else if (provider === 'libre') translated = await translateWithLibre(text, target);
  else throw new Error(`Bilinmeyen çeviri sağlayıcı: ${provider}`);
  translated = safeText(translated) || text;
  TRANSLATION_CACHE.set(cacheKey, translated);
  // Prevent unbounded growth on serverless warm instances.
  if (TRANSLATION_CACHE.size > 700) {
    const firstKey = TRANSLATION_CACHE.keys().next().value;
    TRANSLATION_CACHE.delete(firstKey);
  }
  return { text: translated, provider, translated: true };
}

async function translateItems(items, lang) {
  const target = String(lang || process.env.NEWS_LANGUAGE || 'tr').toLowerCase().slice(0, 5);
  const provider = translationProvider();
  const errors = [];
  const out = [];
  for (const raw of items) {
    const item = normalizeItem(raw);
    const descOriginal = item.description_original || defaultDescription(item);
    item.language = target;
    item.translation_provider = provider;
    item.translated = false;
    if (target === 'tr' && provider !== 'none' && provider !== 'off' && provider !== 'disabled') {
      try {
        const titleRes = await translateText(item.title_original, 'tr');
        const descRes = await translateText(descOriginal, 'tr');
        item.title_tr = titleRes.text;
        item.description_tr = descRes.text;
        item.title_display = item.title_tr;
        item.description_display = item.description_tr;
        item.translated = Boolean(titleRes.translated || descRes.translated);
        item.translation_provider = titleRes.provider || descRes.provider || provider;
      } catch (e) {
        errors.push(e.message || String(e));
        item.title_display = item.title_original;
        item.description_display = descOriginal;
        item.translation_provider = 'translation_failed';
      }
    } else {
      item.title_display = target === 'tr' ? item.title_tr || item.title_original : item.title_original;
      item.description_display = target === 'tr' ? item.description_tr || descOriginal : descOriginal;
    }
    out.push(item);
  }
  return { items: out, errors: [...new Set(errors)].slice(0, 3), provider };
}

async function gdelt(symbol) {
  const base = baseAsset(symbol);
  const q = encodeURIComponent(`(${base} OR Bitcoin OR Ethereum OR crypto OR cryptocurrency OR Nasdaq OR S&P OR dollar OR Treasury OR Fed OR SEC OR ETF OR oil OR Iran OR Israel) (market OR price OR inflation OR rate OR war OR regulation OR hack OR stocks OR risk)`);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=20&sort=DateDesc&timespan=3h`;
  const r = await timeoutFetch(url, { headers: { accept: 'application/json', 'user-agent': UA } }, 4800);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GDELT HTTP ${r.status}`);
  return (j.articles || []).slice(0, 20).map(a => ({
    source: a.domain || a.sourceCountry || 'GDELT',
    provider: 'GDELT',
    title: a.title || '',
    description: a.description || a.summary || '',
    url: a.url || '',
    created_at: gdeltDateToISO(a.seendate || a.date),
    severity: classify(`${a.title || ''} ${a.description || ''}`),
    impact: impactScore(`${a.title || ''} ${a.description || ''}`)
  }));
}

async function freeNewsApi(symbol) {
  const token = process.env.FREENEWS_API_KEY || process.env.FREE_NEWS_API_KEY || '';
  if (!token) return [];
  const base = baseAsset(symbol).toLowerCase();
  const terms = encodeURIComponent(`${base} bitcoin ethereum crypto fed cpi sec etf oil nasdaq dollar`);
  const params = `language=en&order_by=archive&page_size=20&in_title=${terms}`;
  const hosts = [
    `https://api.freenewsapi.io/v1/news?${params}`,
    `https://freenewsapi.io/v1/news?${params}`
  ];
  const headers = { accept: 'application/json', 'user-agent': UA, authorization: `Bearer ${token}`, 'x-api-key': token };
  let lastErr = '';
  for (const url of hosts) {
    try {
      const r = await timeoutFetch(url, { headers }, 4600);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { lastErr = `FreeNewsApi HTTP ${r.status}`; continue; }
      const data = Array.isArray(j.data) ? j.data : [];
      return data.map(a => ({
        source: a.publisher || a.source || 'FreeNewsApi',
        provider: 'FreeNewsApi',
        title: a.title || a.subtitle || '',
        description: a.description || a.summary || a.subtitle || '',
        url: a.url || a.link || a.original_url || '',
        created_at: a.published_at || a.publishedAt || new Date().toISOString(),
        severity: classify(`${a.title || ''} ${a.subtitle || ''} ${a.description || ''}`),
        impact: impactScore(`${a.title || ''} ${a.subtitle || ''} ${a.description || ''}`)
      }));
    } catch (e) { lastErr = e.message || String(e); }
  }
  throw new Error(lastErr || 'FreeNewsApi unavailable');
}

async function finnhub() {
  const token = process.env.FINNHUB_API_KEY || '';
  if (!token) return [];
  const url = `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(token)}`;
  const r = await timeoutFetch(url, { headers: { accept: 'application/json', 'user-agent': UA } }, 4200);
  const j = await r.json().catch(() => ([]));
  if (!r.ok) throw new Error(`Finnhub HTTP ${r.status}`);
  return (Array.isArray(j) ? j : []).slice(0, 15).map(a => ({
    source: a.source || 'Finnhub',
    provider: 'Finnhub',
    title: a.headline || '',
    description: a.summary || '',
    url: a.url || '',
    created_at: a.datetime ? new Date(a.datetime * 1000).toISOString() : new Date().toISOString(),
    severity: classify(`${a.headline || ''} ${a.summary || ''}`),
    impact: impactScore(`${a.headline || ''} ${a.summary || ''}`)
  }));
}

function fallback(symbol, note) {
  const base = baseAsset(symbol);
  return [
    { source: 'OMNI', provider: 'Fallback', title: `${base}: haber akışı karar motoruna bağlı değil.`, description: 'Bu panel yalnızca hızlı piyasa takibi içindir. LONG/SHORT/WAIT kararına etkisi 0%.', created_at: new Date().toISOString(), severity: 'info', impact: 40, display_only: true, decision_weight: 0 },
    { source: 'SYSTEM', provider: 'Fallback', title: 'Ücretsiz haber omurgası: GDELT.', description: 'Opsiyonel genişletme için FREENEWS_API_KEY ve FINNHUB_API_KEY eklenebilir. Türkçe çeviri için GOOGLE_TRANSLATE_API_KEY veya LIBRETRANSLATE_URL kullanılabilir.', created_at: new Date().toISOString(), severity: 'warn', impact: 35, display_only: true, decision_weight: 0 },
    { source: 'NOTE', provider: 'Fallback', title: 'Haber çevirisi başlık + açıklama alanlarını destekler.', description: note || 'Çeviri anahtarı yoksa başlık ve açıklama orijinal dilde gösterilir; sistem çalışmaya devam eder.', created_at: new Date().toISOString(), severity: 'info', impact: 20, display_only: true, decision_weight: 0 }
  ].map(normalizeItem);
}

module.exports = async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=240');
  const symbol = cleanSymbol(req.query.symbol || 'BTCUSDT');
  const lang = String(req.query.lang || process.env.NEWS_LANGUAGE || 'tr').toLowerCase().slice(0, 5);
  const errors = [];
  const settled = await Promise.allSettled([gdelt(symbol), freeNewsApi(symbol), finnhub()]);
  const [g, f, h] = settled;
  const items = [];
  for (const x of settled) {
    if (x.status === 'fulfilled') items.push(...(x.value || []));
    else errors.push(x.reason?.message || String(x.reason));
  }
  const merged = uniqueItems(items).slice(0, 24);
  const providerBits = [];
  if (g.status === 'fulfilled' && (g.value || []).length) providerBits.push('GDELT');
  if (f.status === 'fulfilled' && (f.value || []).length) providerBits.push('FreeNewsApi');
  if (h.status === 'fulfilled' && (h.value || []).length) providerBits.push('Finnhub');
  const rawFinalItems = merged.length ? merged : fallback(symbol, errors.join('; '));
  const translated = await translateItems(rawFinalItems, lang);
  errors.push(...translated.errors.map(e => `translation: ${e}`));
  res.status(200).json({
    ok: true,
    symbol,
    language: lang,
    translation_provider: translated.provider,
    translation_enabled: translated.provider !== 'none' && translated.provider !== 'off' && translated.provider !== 'disabled',
    provider: providerBits.join(' + ') || 'fallback',
    note: errors.filter(Boolean).slice(0, 4).join(' | '),
    display_only: true,
    decision_binding: 'DISABLED',
    decision_weight: 0,
    items: translated.items
  });
};
