// OMNINOMICS v5.0.7 — Market Intelligence API Stabilized

const BINANCE_F = ["https://fapi.binance.com","https://fapi1.binance.com","https://fapi2.binance.com","https://fapi3.binance.com"];

function cleanSymbol(s){ return String(s||"BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,20) || "BTCUSDT"; }
function baseAsset(symbol){ return symbol.replace(/USDT$|USD$|BUSD$|USDC$/,""); }
function num(x,d=6){ x=Number(x); return Number.isFinite(x)?+x.toFixed(d):null; }
function avg(a){ a=(a||[]).map(Number).filter(Number.isFinite); return a.length?a.reduce((s,x)=>s+x,0)/a.length:0; }
function stdev(a){ a=(a||[]).map(Number).filter(Number.isFinite); const m=avg(a); return a.length?Math.sqrt(avg(a.map(x=>(x-m)**2))):0; }
function pct(a,b){ a=Number(a); b=Number(b); return Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a-b)/b*100:null; }
function clamp(v,a=0,b=100){ v=Number(v); return Math.max(a,Math.min(b,Number.isFinite(v)?v:0)); }

async function fetchTimeout(url, ms=4200, opts={}){
  const ctl = new AbortController();
  const id = setTimeout(()=>ctl.abort(), ms);
  try{
    const r = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: {"user-agent":"OMNINOMICS/5.0.7 (+vercel)","accept":"application/json,text/plain,*/*",...(opts.headers||{})}
    });
    const txt = await r.text();
    if(!r.ok) throw new Error(`${r.status} ${txt.slice(0,100)}`);
    try{ return JSON.parse(txt); }catch{ throw new Error(`Non-JSON response: ${txt.slice(0,80)}`); }
  }finally{ clearTimeout(id); }
}
async function firstOk(urls, errors){
  const results = await Promise.allSettled(urls.map(u=>fetchTimeout(u,3800)));
  for(const r of results) if(r.status==="fulfilled") return r.value;
  for(const r of results) errors.push(r.reason?.message || String(r.reason));
  return null;
}
async function safe(label, fn, fallback, errors){
  try{ return await fn(); }catch(e){ errors.push(`${label}: ${e.message||String(e)}`); return fallback; }
}
function deriveFundingStats(hist){
  hist = Array.isArray(hist)?hist:[];
  const vals = hist.map(x=>Number(x.fundingRate)*100).filter(Number.isFinite);
  const last = vals.at(-1), m = avg(vals), sd = stdev(vals);
  return {lastFundingRatePct:num(last,5), avgFundingPct:num(m,5), fundingZ:num(sd?(last-m)/sd:0,2), fundingTrendPct:num(vals.length>=4?last-vals.at(-4):0,5), samples:vals.length};
}
function deriveOiStats(hist,current){
  hist = Array.isArray(hist)?hist:[];
  const vals = hist.map(x=>Number(x.sumOpenInterest)).filter(Number.isFinite);
  const now = Number(current?.openInterest) || vals.at(-1) || null;
  return {openInterest:num(now,2), oi1hPct:num(vals.length>=2?pct(vals.at(-1),vals.at(-2)):null,2), oi4hPct:num(vals.length>=5?pct(vals.at(-1),vals.at(-5)):null,2), oi24hPct:num(vals.length>=20?pct(vals.at(-1),vals.at(-20)):null,2), samples:vals.length};
}
function derivativesRisk(f,oi){
  let score=50, flags=[], action="NEUTRAL", sizeScale=1;
  const fr=f.lastFundingRatePct, z=f.fundingZ, oi4=oi.oi4hPct, oi24=oi.oi24hPct;
  if(fr!=null && fr>0.05){score-=12; flags.push("Funding pozitif yüksek: long crowding riski"); sizeScale=Math.min(sizeScale,.7);}
  if(fr!=null && fr<-0.05){score-=6; flags.push("Funding negatif yüksek: short crowding / squeeze riski");}
  if(z!=null && z>2){score-=10; flags.push("Funding z-score aşırı pozitif"); sizeScale=Math.min(sizeScale,.65);}
  if(z!=null && z<-2){score-=4; flags.push("Funding z-score aşırı negatif; short kalabalığı olabilir");}
  if(oi4!=null && oi4>7){score-=8; flags.push("OI 4s hızlı artıyor: kaldıraç birikimi"); sizeScale=Math.min(sizeScale,.75);}
  if(oi24!=null && oi24>15){score-=8; flags.push("OI 24s hızlı artıyor: tasfiye riski yükseldi");}
  if(oi4!=null && oi4<-8){score-=3; flags.push("OI düşüyor: deleveraging / trend devam gücü zayıflayabilir");}
  score=clamp(score);
  if(score<38){action="SIZE_DOWN"; sizeScale=Math.min(sizeScale,.5);}
  else if(score<48){action="CAUTION"; sizeScale=Math.min(sizeScale,.75);}
  return {score, flags, action, sizeScale};
}
function classifyNews(text){
  text=String(text||"").toLowerCase();
  const hard=["hack","exploit","drain","stolen","delist","delisting","depeg","halt","suspended","rug pull","insolvent","bankrupt"];
  const risk=["lawsuit","sec","cftc","investigation","regulation","probe","sanction","outage","bridge","vulnerability"];
  const positive=["etf inflow","approved","approval","partnership","upgrade","mainnet","listing","institutional","adoption"];
  const hardHits=hard.filter(k=>text.includes(k)), riskHits=risk.filter(k=>text.includes(k)), posHits=positive.filter(k=>text.includes(k));
  return {hardHits,riskHits,posHits,score:-hardHits.length*35-riskHits.length*12+posHits.length*8};
}
async function gdeltNews(base){
  const q=encodeURIComponent(`(${base} OR ${base.toLowerCase()} OR ${base}USDT) (crypto OR cryptocurrency OR bitcoin OR blockchain)`);
  const url=`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=10&sort=DateDesc`;
  const j=await fetchTimeout(url,4200);
  return (j.articles||[]).slice(0,10).map(a=>({title:a.title||"",url:a.url||"",source:a.domain||a.sourceCountry||"GDELT",published:a.seendate||"",provider:"GDELT"}));
}
async function cryptoCompareNews(base){
  const url=`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${encodeURIComponent(base)}`;
  const j=await fetchTimeout(url,4200);
  return (j.Data||[]).slice(0,10).map(a=>({title:a.title||"",url:a.url||"",source:a.source_info?.name||"CryptoCompare",published:a.published_on?new Date(a.published_on*1000).toISOString():"",provider:"CryptoCompare"}));
}
async function cryptoPanic(base,token){
  if(!token) return [];
  const url=`https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(token)}&currencies=${encodeURIComponent(base)}&kind=news&public=true`;
  const j=await fetchTimeout(url,4200);
  return (j.results||[]).slice(0,10).map(a=>({title:a.title||"",url:a.url||"",source:a.source?.title||"CryptoPanic",published:a.published_at||"",provider:"CryptoPanic",votes:a.votes||{}}));
}
async function redditSearch(base){
  const q=encodeURIComponent(`${base} crypto OR ${base}USDT`);
  const url=`https://www.reddit.com/search.json?q=${q}&sort=new&t=day&limit=10`;
  const j=await fetchTimeout(url,4200);
  return (j.data?.children||[]).map(x=>x.data||{}).slice(0,10).map(p=>({title:p.title||"",subreddit:p.subreddit||"",score:p.score||0,comments:p.num_comments||0,url:p.permalink?`https://reddit.com${p.permalink}`:""}));
}
function socialStats(items){
  const text=items.map(x=>x.title||"").join(" ").toLowerCase();
  const eup=["moon","100x","pump","lambo","send it","ath","breakout","ape"];
  const panic=["scam","crash","dump","rekt","rug","hack","exploit","dead"];
  const eupHits=eup.filter(k=>text.includes(k)).length, panicHits=panic.filter(k=>text.includes(k)).length;
  const attention=clamp((items.length*7)+items.reduce((s,x)=>s+Math.min(25,(x.score||0)/15+(x.comments||0)/5),0));
  return {attentionScore:num(attention,1), euphoriaScore:num(clamp(eupHits*18+attention*.25),1), panicScore:num(clamp(panicHits*22+attention*.18),1), mentions:items.length, eupHits, panicHits};
}
function buildOverlay(symbol, derivatives, news, social){
  let reasons=[], hardFlags=[], action="NEUTRAL", sizeScale=1, score=50;
  if(derivatives?.risk){
    score+=(derivatives.risk.score-50)*.45;
    reasons.push(...(derivatives.risk.flags||[]));
    sizeScale=Math.min(sizeScale,derivatives.risk.sizeScale||1);
    if(derivatives.risk.action==="SIZE_DOWN") action="SIZE_DOWN";
    else if(derivatives.risk.action==="CAUTION" && action==="NEUTRAL") action="CAUTION";
  }
  const nc=(news.items||[]).map(n=>classifyNews(`${n.title} ${n.source}`));
  const hard=nc.flatMap(x=>x.hardHits), risk=nc.flatMap(x=>x.riskHits), pos=nc.flatMap(x=>x.posHits);
  score += nc.reduce((s,x)=>s+x.score,0)*.35;
  if(hard.length){hardFlags.push(...hard); reasons.push("Kırmızı haber: "+[...new Set(hard)].join(", ")); action="HARD_BLOCK"; sizeScale=0;}
  if(risk.length){reasons.push("Haber risk kelimeleri: "+[...new Set(risk)].slice(0,5).join(", ")); sizeScale=Math.min(sizeScale,.75); if(action==="NEUTRAL")action="CAUTION";}
  if(pos.length) reasons.push("Pozitif haber/narrative: "+[...new Set(pos)].slice(0,4).join(", "));
  if(social?.stats){
    if(social.stats.euphoriaScore>65){reasons.push("Sosyal euphoria yüksek: chase etme / retest bekle"); sizeScale=Math.min(sizeScale,.65); if(action==="NEUTRAL")action="SIZE_DOWN";}
    if(social.stats.panicScore>65){reasons.push("Sosyal panik yüksek: volatilite riski"); sizeScale=Math.min(sizeScale,.7); if(action==="NEUTRAL")action="CAUTION";}
  }
  score=clamp(score);
  if(action==="NEUTRAL" && score<40){action="SIZE_DOWN"; sizeScale=Math.min(sizeScale,.7);}
  return {symbol, score:num(score,1), action, sizeScale:num(sizeScale,2), hardBlock:action==="HARD_BLOCK", hardFlags:[...new Set(hardFlags)], reasons:reasons.slice(0,12)};
}
module.exports = async (req,res) => {
  const started=Date.now(), errors=[];
  const symbol=cleanSymbol(req.query.symbol), base=baseAsset(symbol);
  res.setHeader("Content-Type","application/json");
  res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=120");
  try{
    const fundingPath=`/fapi/v1/fundingRate?symbol=${symbol}&limit=30`;
    const oiPath=`/fapi/v1/openInterest?symbol=${symbol}`;
    const oiHistPath=`/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=30`;
    const [fundingHist, oiNow, oiHist, gdelt, cc, cp, reddit] = await Promise.all([
      safe("funding",()=>firstOk(BINANCE_F.map(b=>b+fundingPath),errors),[],errors),
      safe("openInterest",()=>firstOk(BINANCE_F.map(b=>b+oiPath),errors),null,errors),
      safe("openInterestHist",()=>firstOk(BINANCE_F.map(b=>b+oiHistPath),errors),[],errors),
      safe("gdelt",()=>gdeltNews(base),[],errors),
      safe("cryptocompare",()=>cryptoCompareNews(base),[],errors),
      safe("cryptopanic",()=>cryptoPanic(base, req.headers["x-omni-cryptopanic-key"]||req.query.cryptopanic||""),[],errors),
      safe("reddit",()=>redditSearch(base),[],errors)
    ]);
    const funding=deriveFundingStats(fundingHist);
    const openInterest=deriveOiStats(oiHist,oiNow);
    const risk=derivativesRisk(funding,openInterest);
    const newsItems=[...(cp||[]),...(gdelt||[]),...(cc||[])].slice(0,18);
    const social={reddit:reddit||[],stats:socialStats(reddit||[])};
    const derivatives={funding,openInterest,risk};
    const news={items:newsItems,source:{gdelt:(gdelt||[]).length,cryptoCompare:(cc||[]).length,cryptoPanic:(cp||[]).length}};
    const overlay=buildOverlay(symbol,derivatives,news,social);
    res.status(200).json({ok:true,version:"5.0.7",symbol,base,derivatives,news,social,overlay,errors:errors.slice(0,20),latencyMs:Date.now()-started,updatedAt:Date.now()});
  }catch(e){
    res.status(200).json({ok:false,version:"5.0.7",symbol,base,error:String(e.message||e),errors:errors.slice(0,20),derivatives:{funding:{},openInterest:{},risk:{score:50,flags:["Endpoint hata verdi"],action:"ERROR",sizeScale:1}},news:{items:[],source:{}},social:{reddit:[],stats:{}},overlay:{symbol,score:50,action:"ERROR",sizeScale:1,hardBlock:false,reasons:[String(e.message||e)]},latencyMs:Date.now()-started,updatedAt:Date.now()});
  }
};
