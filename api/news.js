// OMNINOMICS v5.1.5 — Real Free News API
// DISPLAY ONLY: News is never connected to the LONG/SHORT/WAIT decision engine.
// Goal: no fake/system messages as news. If real feeds fail, return empty items + diagnostic note.
// Sources: GDELT public DOC API, CryptoCompare public news if available, RSS feeds, optional FreeNewsApi/Finnhub.
// Optional Turkish translation: Google / LibreTranslate / MyMemory fallback.

const DEFAULT_TIMEOUT = 6200;
const UA = 'Omninomics/5.1.5 real-news-display-only';
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
  return decodeHtmlEntities(String(v || '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
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
  let s = 15;
  if (/fed|fomc|cpi|pce|nfp|payroll|treasury|yields|rate|inflation|dollar|dxy/.test(t)) s += 30;
  if (/sec|etf|blackrock|microstrategy|coinbase|binance|lawsuit|regulation|approval/.test(t)) s += 26;
  if (/hack|exploit|war|attack|oil|iran|israel|china|tariff|sanction|bankrupt|depeg|delist/.test(t)) s += 35;
  if (/bitcoin|btc|ethereum|eth|crypto|cryptocurrency|blockchain/.test(t)) s += 18;
  return Math.max(0, Math.min(100, s));
}

function severityLabel(sev) {
  return ({ bear: 'RİSK', bull: 'POZİTİF', warn: 'DİKKAT', info: 'BİLGİ' })[sev] || 'BİLGİ';
}

function gdeltDateToISO(v) {
  const s = String(v || '');
  if (/^\d{14}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`;
  if (/^\d{8}T\d{6}Z?$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}Z`;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function defaultDescription(item) {
  const sev = severityLabel(item.severity);
  const src = item.source || item.provider || 'haber kaynağı';
  const impact = Number.isFinite(item.impact) ? item.impact : impactScore(item.title || '');
  return `${sev} · Kaynak: ${src} · Etki skoru: ${impact}/100 · Haber yalnızca ekranda gösterilir, karar motoruna etkisi 0%.`;
}

function isProbablySystemMessage(x) {
  const src = String(x.source || x.provider || '').toLowerCase();
  const t = String(x.title || '').toLowerCase();
  return /fallback|system|omni|note/.test(src) || /haber akışı karar motoruna|ücretsiz haber omurgası|karar ağırlığı|çeviri anahtarı/.test(t);
}

function isMarketRelevant(x) {
  const t = `${x.title || ''} ${x.description || ''}`.toLowerCase();
  if (isProbablySystemMessage(x)) return false;
  return /bitcoin|btc|ethereum|eth|crypto|cryptocurrency|blockchain|binance|coinbase|etf|sec|fed|fomc|cpi|pce|inflation|rates?|treasury|nasdaq|s&p|dollar|dxy|oil|iran|israel|china|tariff|stocks|market|liquidation|hack|exploit|microstrategy|blackrock/.test(t);
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
    .filter(isMarketRelevant)
    .filter(x => {
      const k = (x.title_original || x.title || '').toLowerCase().replace(/[^a-z0-9ığüşöç ]/gi, '').slice(0, 130);
      if (!k || k.length < 8 || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => {
      const bd = new Date(b.created_at || 0).getTime() || 0;
      const ad = new Date(a.created_at || 0).getTime() || 0;
      return (bd - ad) || ((b.impact || 0) - (a.impact || 0));
    });
}

function translationProvider() {
  const forced = String(process.env.NEWS_TRANSLATION_PROVIDER || '').toLowerCase().trim();
  if (forced && forced !== 'auto') return forced;
  if (process.env.GOOGLE_TRANSLATE_API_KEY) return 'google';
  if (process.env.LIBRETRANSLATE_URL) return 'libre';
  // Free fallback; rate-limited but better than pretending TR translation exists.
  return 'mymemory';
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
  return safeText(j?.data?.translations?.[0]?.translatedText || '');
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
  return safeText(j.translatedText || '');
}

async function translateWithMyMemory(text, target) {
  // MyMemory free endpoint supports short segments; keep under 500 bytes as documented.
  text = safeText(text).slice(0, 430);
  if (!text) return '';
  const email = process.env.MYMEMORY_EMAIL || process.env.NEWS_TRANSLATION_EMAIL || '';
  const key = process.env.MYMEMORY_API_KEY || '';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${encodeURIComponent(target)}&mt=1${email ? `&de=${encodeURIComponent(email)}` : ''}${key ? `&key=${encodeURIComponent(key)}` : ''}`;
  const r = await timeoutFetch(url, { headers: { accept: 'application/json', 'user-agent': UA } }, 4200);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`MyMemory HTTP ${r.status}`);
  return safeText(j?.responseData?.translatedText || '');
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
  else if (provider === 'mymemory') translated = await translateWithMyMemory(text, target);
  else throw new Error(`Bilinmeyen çeviri sağlayıcı: ${provider}`);
  translated = safeText(translated) || text;
  TRANSLATION_CACHE.set(cacheKey, translated);
  if (TRANSLATION_CACHE.size > 700) TRANSLATION_CACHE.delete(TRANSLATION_CACHE.keys().next().value);
  return { text: translated, provider, translated: translated !== text };
}

async function translateItems(items, lang) {
  const target = String(lang || process.env.NEWS_LANGUAGE || 'tr').toLowerCase().slice(0, 5);
  const provider = translationProvider();
  const errors = [];
  const out = [];
  // Translate fewer items to keep free quota/rate-limits safe.
  for (const raw of (items || []).slice(0, 18)) {
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

async function gdeltQuery(query, label) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=30&sort=DateDesc&timespan=24h`;
  const r = await timeoutFetch(url, { headers: { accept: 'application/json', 'user-agent': UA } }, 5400);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GDELT ${label} HTTP ${r.status}`);
  return (j.articles || []).slice(0, 30).map(a => ({
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

async function gdelt(symbol) {
  const base = baseAsset(symbol);
  const queries = [
    '(bitcoin OR btc OR ethereum OR eth OR crypto OR cryptocurrency OR blockchain)',
    '(Federal Reserve OR Fed OR FOMC OR CPI OR PCE OR inflation OR Treasury OR Nasdaq OR dollar OR oil)',
  ];
  if (!['BTC','ETH'].includes(base)) queries.unshift(`(${base} OR ${base.toLowerCase()} OR crypto)`);
  const settled = await Promise.allSettled(queries.map((q, i) => gdeltQuery(q, `q${i + 1}`)));
  const out = [];
  const errors = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') out.push(...s.value);
    else errors.push(s.reason?.message || String(s.reason));
  }
  if (!out.length && errors.length) throw new Error(errors.join('; '));
  return out;
}

async function cryptoCompareNews() {
  const url = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH,Market,Regulation,Blockchain&excludeCategories=Sponsored';
  const headers = { accept: 'application/json', 'user-agent': UA };
  if (process.env.CRYPTOCOMPARE_API_KEY) headers.authorization = `Apikey ${process.env.CRYPTOCOMPARE_API_KEY}`;
  const r = await timeoutFetch(url, { headers }, 4800);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.Response === 'Error') throw new Error(`CryptoCompare ${r.status} ${j.Message || ''}`.trim());
  const data = Array.isArray(j.Data) ? j.Data : [];
  return data.slice(0, 30).map(a => ({
    source: a.source_info?.name || a.source || 'CryptoCompare',
    provider: 'CryptoCompare',
    title: a.title || '',
    description: a.body || '',
    url: a.url || '',
    created_at: a.published_on ? new Date(a.published_on * 1000).toISOString() : new Date().toISOString(),
    severity: classify(`${a.title || ''} ${a.body || ''}`),
    impact: impactScore(`${a.title || ''} ${a.body || ''}`)
  }));
}

function tag(xml, name) {
  const m = String(xml || '').match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return safeText(m ? m[1] : '');
}

async function rssFeed(url, provider) {
  const r = await timeoutFetch(url, { headers: { accept: 'application/rss+xml, application/xml, text/xml, */*', 'user-agent': UA } }, 5200);
  const xml = await r.text();
  if (!r.ok) throw new Error(`${provider} RSS HTTP ${r.status}`);
  const chunks = xml.split(/<item\b/i).slice(1).map(x => '<item' + x.split(/<\/item>/i)[0] + '</item>');
  return chunks.slice(0, 18).map(it => ({
    source: provider,
    provider: 'RSS',
    title: tag(it, 'title'),
    description: tag(it, 'description') || tag(it, 'content:encoded'),
    url: tag(it, 'link') || tag(it, 'guid'),
    created_at: new Date(tag(it, 'pubDate') || Date.now()).toISOString(),
    severity: classify(`${tag(it, 'title')} ${tag(it, 'description')}`),
    impact: impactScore(`${tag(it, 'title')} ${tag(it, 'description')}`)
  }));
}

async function rssNews(symbol) {
  const base = baseAsset(symbol);
  const feeds = [
    ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
    ['Cointelegraph', 'https://cointelegraph.com/rss'],
    ['Yahoo Finance BTC', 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD&region=US&lang=en-US'],
    ['Yahoo Finance ETH', 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=ETH-USD&region=US&lang=en-US']
  ];
  if (!['BTC','ETH'].includes(base)) feeds.push([`Yahoo Finance ${base}`, `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(base)}-USD&region=US&lang=en-US`]);
  const settled = await Promise.allSettled(feeds.map(([name, url]) => rssFeed(url, name)));
  const out = [];
  const errors = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') out.push(...s.value);
    else errors.push(s.reason?.message || String(s.reason));
  }
  if (!out.length && errors.length) throw new Error(errors.join('; '));
  return out;
}

async function freeNewsApi(symbol) {
  const token = process.env.FREENEWS_API_KEY || process.env.FREE_NEWS_API_KEY || '';
  if (!token) return [];
  const base = baseAsset(symbol).toLowerCase();
  const terms = encodeURIComponent(`${base} bitcoin ethereum crypto fed cpi sec etf oil nasdaq dollar`);
  const params = `language=en&order_by=archive&page_size=20&search=${terms}`;
  const hosts = [`https://api.freenewsapi.io/v1/news?${params}`, `https://freenewsapi.io/v1/news?${params}`];
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

module.exports = async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=240');
  const symbol = cleanSymbol(req.query.symbol || 'BTCUSDT');
  const lang = String(req.query.lang || process.env.NEWS_LANGUAGE || 'tr').toLowerCase().slice(0, 5);
  const errors = [];
  const sources = [
    ['CryptoCompare', cryptoCompareNews()],
    ['RSS', rssNews(symbol)],
    ['GDELT', gdelt(symbol)],
    ['FreeNewsApi', freeNewsApi(symbol)],
    ['Finnhub', finnhub()]
  ];
  const settled = await Promise.allSettled(sources.map(x => x[1]));
  const items = [];
  const providerBits = [];
  settled.forEach((x, i) => {
    const name = sources[i][0];
    if (x.status === 'fulfilled') {
      const value = x.value || [];
      if (value.length) providerBits.push(name);
      items.push(...value);
    } else {
      errors.push(`${name}: ${x.reason?.message || String(x.reason)}`);
    }
  });
  const merged = uniqueItems(items).slice(0, 24);
  const translated = await translateItems(merged, lang);
  errors.push(...translated.errors.map(e => `translation: ${e}`));
  const newsAvailable = translated.items.length > 0;
  res.status(200).json({
    ok: true,
    symbol,
    language: lang,
    translation_provider: translated.provider,
    translation_enabled: translated.provider !== 'none' && translated.provider !== 'off' && translated.provider !== 'disabled',
    provider: providerBits.join(' + ') || 'none',
    note: errors.filter(Boolean).slice(0, 6).join(' | '),
    news_available: newsAvailable,
    display_only: true,
    decision_binding: 'DISABLED',
    decision_weight: 0,
    items: translated.items
  });
};
