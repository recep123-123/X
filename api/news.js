
// OMNINOMICS v5.1.1 — News Intelligence API
// @DeItaone / DeltaOne feed is optional through the official X API.
// Set X_BEARER_TOKEN in Vercel Environment Variables to enable live X timeline.

const DEFAULT_TIMEOUT = 5200;
function timeoutFetch(url, opts={}, ms=DEFAULT_TIMEOUT){
  const ctl = new AbortController();
  const id = setTimeout(()=>ctl.abort(), ms);
  return fetch(url,{...opts, signal: ctl.signal}).finally(()=>clearTimeout(id));
}
function cleanSymbol(s){ return String(s||"BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,24)||"BTCUSDT"; }
function baseAsset(symbol){ return cleanSymbol(symbol).replace(/USDT$|USD$|BUSD$|USDC$/g,"") || "BTC"; }
function classify(text){
  text=String(text||"").toLowerCase();
  if(/hack|exploit|lawsuit|sec|probe|sanction|war|attack|crash|liquidation|bankrupt|halt|outage|risk|bearish/.test(text)) return "bear";
  if(/approve|approved|approval|inflow|bullish|rally|surge|record|partnership|listing|upgrade/.test(text)) return "bull";
  if(/fed|cpi|inflation|rate|oil|treasury|auction|macro|warning|alert|yields/.test(text)) return "warn";
  return "info";
}
function normalizeX(t){
  const text = t.text || t.note_tweet?.text || "";
  return { id:t.id, source:"@DeItaone", provider:"X", title:text.replace(/\s+/g," ").trim(), url:t.id?`https://x.com/DeItaone/status/${t.id}`:"", created_at:t.created_at || new Date().toISOString(), severity:classify(text), metrics:t.public_metrics||{} };
}
async function xTimeline(){
  const token = process.env.X_BEARER_TOKEN;
  if(!token) return {items:[], note:"X_BEARER_TOKEN missing"};
  const headers = {"authorization":`Bearer ${token}`, "accept":"application/json", "user-agent":"Omninomics/5.1.1"};
  const u = await timeoutFetch('https://api.x.com/2/users/by/username/DeItaone?user.fields=id,name,username', {headers});
  const uj = await u.json().catch(()=>({}));
  if(!u.ok || !uj?.data?.id) throw new Error(`X user lookup failed: ${u.status}`);
  const id = uj.data.id;
  const url = `https://api.x.com/2/users/${id}/tweets?max_results=20&exclude=retweets,replies&tweet.fields=created_at,public_metrics,note_tweet`;
  const r = await timeoutFetch(url,{headers});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`X timeline failed: ${r.status}`);
  return {items:(j.data||[]).map(normalizeX), note:"live X timeline"};
}
async function gdelt(symbol){
  const base = baseAsset(symbol);
  const q = encodeURIComponent(`(${base} OR Bitcoin OR Ethereum OR crypto OR cryptocurrency) (market OR price OR ETF OR Fed OR SEC OR dollar OR treasury OR inflation OR war)`);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=12&sort=DateDesc`;
  const r = await timeoutFetch(url, {headers:{"accept":"application/json","user-agent":"Omninomics/5.1.1"}}, 4500);
  const j = await r.json().catch(()=>({}));
  return (j.articles||[]).slice(0,12).map(a=>({source:a.domain||"GDELT", provider:"GDELT", title:a.title||"", url:a.url||"", created_at:a.seendate||new Date().toISOString(), severity:classify(a.title||"")}));
}
function fallback(symbol, note){
  const base=baseAsset(symbol);
  return [
    {source:"OMNI",provider:"Fallback",title:`${base}: canlı @DeItaone akışı için Vercel'de X_BEARER_TOKEN ekle. Şu an güvenli fallback haber modu açık.`,created_at:new Date().toISOString(),severity:"info"},
    {source:"RISK",provider:"Fallback",title:"Karar motoru Funding/OI/orderbook kullanmıyor; haber akışı sadece bağlamsal uyarı katmanı.",created_at:new Date().toISOString(),severity:"warn"},
    {source:"SYSTEM",provider:"Fallback",title:note||"News adapter ready",created_at:new Date().toISOString(),severity:"info"}
  ];
}
module.exports = async function handler(req,res){
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','s-maxage=45, stale-while-revalidate=180');
  const symbol = cleanSymbol(req.query.symbol || 'BTCUSDT');
  let items=[], provider='fallback', note='';
  try{
    const x = await xTimeline();
    items = x.items; provider='X/@DeItaone'; note=x.note;
  }catch(e){ note=e.message||String(e); }
  if(!items.length){
    try{ items = await gdelt(symbol); provider = items.length ? 'GDELT fallback' : provider; }catch(e){ note = `${note}; GDELT: ${e.message||String(e)}`; }
  }
  if(!items.length) items=fallback(symbol,note);
  res.status(200).json({ok:true, symbol, provider, note, items:items.slice(0,20)});
}
