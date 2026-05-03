
const CG_IDS = {
  BTCUSDT:"bitcoin",ETHUSDT:"ethereum",SOLUSDT:"solana",BNBUSDT:"binancecoin",XRPUSDT:"ripple",ADAUSDT:"cardano",
  AVAXUSDT:"avalanche-2",LINKUSDT:"chainlink",DOGEUSDT:"dogecoin",TONUSDT:"the-open-network",AAVEUSDT:"aave",
  PLUMEUSDT:"plume",TURBOUSDT:"turbo",AIXBTUSDT:"aixbt",ETHFIUSDT:"ether-fi",TIAUSDT:"celestia",ORDIUSDT:"ordi",
  TAOUSDT:"bittensor",MOVRUSDT:"moonriver",NEIROUSDT:"neiro-on-eth"
};
const DUNE_ALIAS = {
  BTC:["WBTC","BTC"], ETH:["ETH","WETH"], SOL:["SOL"], BNB:["BNB"], XRP:["XRP"], ADA:["ADA"], AVAX:["AVAX"],
  LINK:["LINK"], DOGE:["DOGE"], TON:["TON"], AAVE:["AAVE"], TIA:["TIA"], ORDI:["ORDI"], TAO:["TAO"]
};
const cache = new Map();
function num(v,d=null){v=Number(v);return Number.isFinite(v)?v:d}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
async function jfetch(url,opts={},timeout=15000){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const r=await fetch(url,{...opts,signal:ctrl.signal});
    const txt=await r.text(); let j; try{j=JSON.parse(txt)}catch{j=txt}
    if(!r.ok) throw new Error(`HTTP ${r.status}: ${typeof j==="string"?j.slice(0,180):JSON.stringify(j).slice(0,180)}`);
    return j;
  }finally{clearTimeout(t)}
}
function cgHeaders(req){
  const key=req.headers["x-omni-cg-key"] || "";
  const h={"accept":"application/json","user-agent":"Omninomics/1.0"};
  if(key) h["x-cg-demo-api-key"]=key;
  return h;
}
function scoreCoin(m,trendingRank,detail=null){
  const vol=num(m.total_volume,0),mc=num(m.market_cap,0),rank=num(m.market_cap_rank,9999);
  const vmp=mc?vol/mc*100:0;
  const ch24=num(m.price_change_percentage_24h,0), ch7=num(m.price_change_percentage_7d_in_currency,0), ch30=num(m.price_change_percentage_30d_in_currency,0);
  const trendScore=trendingRank?clamp(100-(trendingRank-1)*8):35;
  const rankScore=rank?clamp(100-rank/4):20;
  const volScore=clamp(vmp*13);
  const momScore=clamp(50+ch24*2+ch7*.9+ch30*.25);
  let communityScore=detail?.community_score!=null?num(detail.community_score,0):50;
  let devScore=detail?.developer_score!=null?num(detail.developer_score,0):50;
  const score=clamp(trendScore*.28+rankScore*.18+volScore*.24+momScore*.22+communityScore*.04+devScore*.04);
  let quality="B";
  if(!mc||!vol) quality="C";
  if(trendingRank||rank<100) quality="A";
  return {score,volumeMcapPct:vmp,rankScore,volScore,momScore,communityScore,devScore,quality};
}
async function getCoingecko(symbols,req,errors){
  const ids=[...new Set(symbols.map(s=>CG_IDS[s]).filter(Boolean))];
  if(!ids.length) return symbols.map(s=>({symbol:s,attentionScore:0,quality:"YOK",source:"no CoinGecko mapping"}));
  const key="cg:"+ids.join(",");
  const cached=cache.get(key);
  if(cached && Date.now()-cached.ts<90000) return cached.data;
  const headers=cgHeaders(req);
  const qs=ids.join(",");
  const [markets,trending] = await Promise.all([
    jfetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(qs)}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d`,{headers}).catch(e=>{errors.push("CoinGecko markets: "+e.message);return []}),
    jfetch(`https://api.coingecko.com/api/v3/search/trending`,{headers}).catch(e=>{errors.push("CoinGecko trending: "+e.message);return {coins:[]}})
  ]);
  const trendMap={};
  (trending.coins||[]).forEach((x,i)=>{if(x.item?.id)trendMap[x.item.id]=i+1});
  const byId={};
  (markets||[]).forEach(m=>byId[m.id]=m);
  const out=symbols.map(sym=>{
    const id=CG_IDS[sym],m=byId[id];
    if(!id||!m)return {symbol:sym,id:id||null,attentionScore:0,quality:"YOK",source:"CoinGecko: no map/no data"};
    const sc=scoreCoin(m,trendMap[id]||null);
    return {
      symbol:sym,id,name:m.name,source:"CoinGecko",
      price:num(m.current_price), marketCap:num(m.market_cap), marketCapRank:num(m.market_cap_rank),
      volume24h:num(m.total_volume), volumeMcapPct:sc.volumeMcapPct,
      priceChange1h:num(m.price_change_percentage_1h_in_currency),
      priceChange24h:num(m.price_change_percentage_24h),
      priceChange7d:num(m.price_change_percentage_7d_in_currency),
      priceChange30d:num(m.price_change_percentage_30d_in_currency),
      trendingRank:trendMap[id]||null,
      attentionScore:sc.score, rankScore:sc.rankScore, volumeScore:sc.volScore, momentumScore:sc.momScore,
      communityScore:sc.communityScore, developerScore:sc.devScore, quality:sc.quality
    };
  });
  cache.set(key,{ts:Date.now(),data:out});
  return out;
}
function sqlForSymbol(sym){
  const base=sym.replace(/USDT$/,"");
  const aliases=(DUNE_ALIAS[base]||[base]).map(x=>`'${String(x).replace(/'/g,"''")}'`).join(",");
  return `
WITH t AS (
  SELECT
    blockchain,
    amount_usd,
    upper(token_bought_symbol) AS bought,
    upper(token_sold_symbol) AS sold
  FROM dex.trades
  WHERE block_time > now() - interval '1' day
    AND amount_usd IS NOT NULL
    AND amount_usd > 0
    AND (
      upper(token_bought_symbol) IN (${aliases})
      OR upper(token_sold_symbol) IN (${aliases})
    )
)
SELECT
  sum(amount_usd) AS dex_volume_usd,
  sum(CASE WHEN bought IN (${aliases}) THEN amount_usd ELSE 0 END) AS buy_usd,
  sum(CASE WHEN sold IN (${aliases}) THEN amount_usd ELSE 0 END) AS sell_usd,
  sum(CASE WHEN bought IN (${aliases}) THEN amount_usd ELSE 0 END) - sum(CASE WHEN sold IN (${aliases}) THEN amount_usd ELSE 0 END) AS net_buy_usd,
  count(*) AS trade_count,
  count(distinct blockchain) AS chain_count
FROM t
`.trim();
}
async function duneQuery(sym,key,force,errors){
  const ckey="dune:"+sym;
  const cached=cache.get(ckey);
  if(!force && cached && Date.now()-cached.ts<1000*60*60*6) return cached.data;
  if(!key) return null;
  const headers={"Content-Type":"application/json","X-Dune-Api-Key":key,"user-agent":"Omninomics/1.0"};
  const sql=sqlForSymbol(sym);
  try{
    const ex=await jfetch("https://api.dune.com/api/v1/sql/execute",{method:"POST",headers,body:JSON.stringify({sql,performance:"small"})},15000);
    const id=ex.execution_id;
    let status=ex.state || "QUERY_STATE_PENDING";
    for(let i=0;i<7;i++){
      if(status==="QUERY_STATE_COMPLETED")break;
      if(status==="QUERY_STATE_FAILED"||status==="QUERY_STATE_CANCELED")throw new Error(`Dune ${status}`);
      await new Promise(r=>setTimeout(r,1200));
      const st=await jfetch(`https://api.dune.com/api/v1/execution/${id}/status`,{headers},12000);
      status=st.state;
    }
    if(status!=="QUERY_STATE_COMPLETED"){
      const pending={symbol:sym,status:"pending",executionId:id,message:"Dune sorgusu henüz tamamlanmadı; tekrar deneyince sonuç gelebilir."};
      cache.set(ckey,{ts:Date.now(),data:pending});return pending;
    }
    const res=await jfetch(`https://api.dune.com/api/v1/execution/${id}/results?limit=1`,{headers},15000);
    const row=res?.result?.rows?.[0] || {};
    const buy=num(row.buy_usd,0), sell=num(row.sell_usd,0), net=num(row.net_buy_usd,0), vol=num(row.dex_volume_usd,0);
    const ratio=sell>0?buy/sell:(buy>0?9.99:null);
    const onchainScore=clamp(50 + (vol>0?Math.log10(vol+1)*3:0) + (ratio?((ratio-1)*18):0) + Math.min(num(row.chain_count,0)*3,12));
    const out={symbol:sym,status:"completed",dexVolumeUsd:vol,buyUsd:buy,sellUsd:sell,netBuyUsd:net,buySellRatio:ratio,tradeCount:num(row.trade_count,0),chainCount:num(row.chain_count,0),onchainScore,executionId:id,sql};
    cache.set(ckey,{ts:Date.now(),data:out});return out;
  }catch(e){errors.push("Dune: "+(e.message||String(e)));return {symbol:sym,status:"error",message:e.message||String(e),sql};}
}
module.exports = async function handler(req,res){
  const errors=[];
  try{
    const symbols=String(req.query.symbols||req.query.symbol||"BTCUSDT").split(",").map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0,40);
    const includeDune=String(req.query.includeDune||"0")==="1";
    const force=String(req.query.force||"0")==="1";
    const duneKey=req.headers["x-omni-dune-key"] || "";
    const coins=await getCoingecko(symbols,req,errors);
    let dune=null;
    if(includeDune && duneKey && symbols.length===1){
      dune=await duneQuery(symbols[0],duneKey,force,errors);
      if(dune){
        const c=coins.find(x=>x.symbol===symbols[0]);
        if(c){ c.dune=dune; c.attentionScore=clamp((c.attentionScore||0)*0.78+(dune.onchainScore||50)*0.22); }
      }
    }
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({source:"CoinGecko"+(dune?"+Dune":""),coins,dune,errors,updatedAt:Date.now()});
  }catch(e){res.status(502).json({error:e.message||String(e),errors});}
}
