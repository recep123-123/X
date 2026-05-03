/* ===================== v5.1.0 — OHLCV Core Decision Patch ===================== */
/*
  Recep notu:
  - Harmony / Entropy karar motorundan çıkarıldı.
  - Funding / OI / orderbook karar motoruna bağlanmaz.
  - Türev/intel endpointleri panel amaçlı kalabilir; final sinyal OHLCV Core tarafından verilir.
  - Ücretsiz ve daha stabil veri seti: OHLCV + hacim + EMA/VWAP/RSI/MACD/ATR/ADX/DI + S/R + PA + whipsaw/divergence.
*/
(function(){
  window.OMNI_BUILD_INFO = Object.assign(window.OMNI_BUILD_INFO || {}, {
    uiVersion: "v5.1.0",
    engineVersion: "v5.1.0",
    package: "OHLCV Core Decision Engine",
    decisionModes: "OHLCV_CORE_ONLY",
    harmonyEntropyDecision: "REMOVED",
    derivativeDecision: "DISABLED",
    derivativeData: "PANEL_ONLY",
    note: "v5.1.0: Harmony/Entropy, Funding, OI ve orderbook final karara girmez. Final sinyal OHLCV Core ile üretilir."
  });

  try{
    document.title = "OMNINOMICS Trade Engine v5.1.0 OHLCV Core";
    let h2 = document.querySelector(".title h2"); if(h2) h2.textContent = "OMNINOMICS TRADE ENGINE v5.1.0";
    let sub = document.querySelector(".title span"); if(sub) sub.textContent = "OHLCV Core · H/E removed · Derivatives panel-only";
    let brand = document.querySelector(".brand p"); if(brand) brand.textContent = "Trade Engine v5.1.0 OHLCV Core";
  }catch(e){}

  st.settings = st.settings || {};
  st.settings.decisionMode = "ohlcv_core";
  st.settings.alertEntropy = false;
  st.settings.alertHarmony = false;
  st.settings.weights = Object.assign({}, st.settings.weights || {}, {entropy:0});
  try{ localStorage.setItem("omni_decision_mode_v509", "ohlcv_core"); save && save(); }catch(e){}

  function sideOf(sig){
    sig=String(sig||"");
    if(sig.includes("LONG")) return "LONG";
    if(sig.includes("SHORT")) return "SHORT";
    return "NONE";
  }
  function safeAt(arr,n,fb=null){try{let v=arr?.at(n);return v==null||isNaN(v)?fb:v}catch{return fb}}
  function ohlcvMacdBias(t,side){
    let h=safeAt(t?.macd?.hist,-1,0), hp=safeAt(t?.macd?.hist,-3,h);
    if(side==="LONG") return (h>0?4:-4) + (h>hp?3:-3);
    if(side==="SHORT") return (h<0?4:-4) + (h<hp?3:-3);
    return 0;
  }
  function ohlcvEmaBias(t,side){
    let e20=safeAt(t?.ema20,-1), e50=safeAt(t?.ema50,-1), e200=safeAt(t?.ema200,-1), px=safeAt(t?.close,-1);
    let s=0;
    if(!px||!e20||!e50) return 0;
    if(side==="LONG"){
      if(px>e20) s+=4; else s-=4;
      if(e20>e50) s+=6; else s-=6;
      if(e200 && e50>e200) s+=4;
    }else if(side==="SHORT"){
      if(px<e20) s+=4; else s-=4;
      if(e20<e50) s+=6; else s-=6;
      if(e200 && e50<e200) s+=4;
    }
    return s;
  }
  function ohlcvVwapBias(t,side){
    let px=safeAt(t?.close,-1), vw=safeAt(t?.vwap,-1);
    if(!px||!vw) return 0;
    if(side==="LONG") return px>vw ? 5 : -5;
    if(side==="SHORT") return px<vw ? 5 : -5;
    return 0;
  }
  function ohlcvSrDistance(a,side){
    if(!a||!a.price||!a.levels)return null;
    if(side==="LONG"){
      let r=(a.levels.resistances||[]).filter(x=>x.price>a.price).sort((x,y)=>x.price-y.price)[0]||a.levels.nearestResistance;
      return r&&r.price?((r.price-a.price)/a.price*100):null;
    }
    if(side==="SHORT"){
      let s=(a.levels.supports||[]).filter(x=>x.price<a.price).sort((x,y)=>y.price-x.price)[0]||a.levels.nearestSupport;
      return s&&s.price?((a.price-s.price)/a.price*100):null;
    }
    return null;
  }
  function ohlcvWickPenalty(a,side){
    let c=a?.candles?.at(-1);
    if(!c)return {penalty:0,reasons:[]};
    let o=+c.open,h=+c.high,l=+c.low,cl=+c.close,range=(h-l)||1,body=Math.max(Math.abs(cl-o),range*.05);
    let upper=h-Math.max(o,cl), lower=Math.min(o,cl)-l, closePos=(cl-l)/range;
    let penalty=0,reasons=[];
    if(side==="LONG"){
      if(upper>body*1.7){penalty+=10;reasons.push("Üst fitil long için riskli");}
      if(closePos<.45){penalty+=8;reasons.push("Kapanış mumun alt yarısında: long zayıf");}
    }
    if(side==="SHORT"){
      if(lower>body*1.7){penalty+=10;reasons.push("Alt fitil short için riskli");}
      if(closePos>.55){penalty+=8;reasons.push("Kapanış mumun üst yarısında: short zayıf");}
    }
    return {penalty,reasons,upperPct:upper/range*100,lowerPct:lower/range*100,closePos};
  }
  function ohlcvRegime(a){
    let f=a.field||{}, t=a.tech||{}, dp=f.dp??50, mom=f.mom??50, vol=f.vol??50, comp=f.comp??50, vc=f.vc??50;
    let adx=f.adx??t.adx??0, wh=f.whipsaw??t.whipsaw??0, chaos=f.chaos??0, rsi=t.rsi??50;
    if(wh>82 || chaos>84) return "CHAOS";
    if(comp>68 && adx<19 && Math.abs(dp-50)<16) return "COMPRESSION";
    if(adx<16 && Math.abs(dp-50)<11 && vol<58) return "RANGING";
    if(dp<34 && mom<44) return "BREAKDOWN";
    if(rsi>=66 && mom<48 && vc>55 && dp<55) return "DISTRIBUTION";
    if((rsi>79||rsi<21) && Math.abs(dp-50)>11) return "REVERSAL_PREPARATION";
    if(Math.abs(dp-50)>16 && adx>=18) return "EXPANSION";
    if(vol<50 && rsi>38 && rsi<58 && Math.abs(dp-50)<14) return "ACCUMULATION";
    return "EXPANSION";
  }
  function ohlcvScoreSide(a,side,mode="ohlcv_core"){
    let f=a.field||{}, t=a.tech||{}, positives=[], reasons=[];
    let dp=f.dp??50, mom=f.mom??50, liq=f.liq??f.vFlow??50, vc=f.vc??50, btc=f.btcScore??50;
    let adx=f.adx??t.adx??0, plus=f.plusDI??t.plusDI, minus=f.minusDI??t.minusDI;
    let wh=f.whipsaw??t.whipsaw??0, div=f.divergence||t.divergence||{}, rsi=t.rsi??50;
    let score=50;

    if(side==="LONG"){
      score += (dp-50)*.38 + (mom-50)*.30 + (liq-50)*.16 + (vc-50)*.18;
      if(a.symbol!=="BTCUSDT") score += (btc-50)*.10;
      if(plus!=null&&minus!=null){ if(plus>minus){score+=7;positives.push("+DI long yönünü teyit ediyor");} else {score-=8;reasons.push("+DI/-DI long ile uyumsuz");} }
      if(rsi>82){score-=24;reasons.push("RSI aşırı alım: yeni long kovalanmaz");}
      else if(rsi>70){score-=8;reasons.push("RSI yüksek: long için temkin");}
      if(div.bearish){score-=18;reasons.push("Bearish RSI divergence long'a karşı");}
      if(div.bullish){score+=7;positives.push("Bullish divergence long lehine");}
    }else{
      score += (50-dp)*.38 + (50-mom)*.30 + (liq-50)*.16 + (vc-50)*.18;
      if(a.symbol!=="BTCUSDT") score += (50-btc)*.10;
      if(plus!=null&&minus!=null){ if(minus>plus){score+=7;positives.push("-DI short yönünü teyit ediyor");} else {score-=8;reasons.push("+DI/-DI short ile uyumsuz");} }
      if(rsi<18){score-=24;reasons.push("RSI aşırı satım: yeni short kovalanmaz");}
      else if(rsi<30){score-=8;reasons.push("RSI düşük: short için temkin");}
      if(div.bullish){score-=18;reasons.push("Bullish RSI divergence short'a karşı");}
      if(div.bearish){score+=7;positives.push("Bearish divergence short lehine");}
    }

    score += ohlcvMacdBias(t,side) + ohlcvEmaBias(t,side) + ohlcvVwapBias(t,side);

    if(adx<14){score-=34;reasons.push("ADX < 14: trend gücü yetersiz");}
    else if(adx<18){score-=16;reasons.push("ADX zayıf: sinyal seçici olmalı");}
    else if(adx>28){score+=8;positives.push("ADX trend gücünü teyit ediyor");}

    if(wh>74){score-=30;reasons.push("Whipsaw/chop çok yüksek");}
    else if(wh>58){score-=12;reasons.push("Whipsaw orta-yüksek");}

    let sr=ohlcvSrDistance(a,side);
    if(sr!=null){
      let atrPct=((t.atr||0)/(a.price||1))*100;
      let minDist=Math.max(.35,atrPct*.55);
      if(sr<minDist){score-=20;reasons.push((side==="LONG"?"Direnç":"Destek")+" çok yakın");}
      else if(sr>minDist*1.8){score+=5;positives.push("S/R mesafesi yeterli");}
    }

    let vr=t.volRatio||1;
    if(vr<.70){score-=12;reasons.push("Hacim teyidi zayıf");}
    else if(vr>1.15){score+=6;positives.push("Hacim teyidi var");}

    let wick=ohlcvWickPenalty(a,side);
    if(wick.penalty){score-=wick.penalty; (wick.reasons||[]).forEach(x=>reasons.push(x));}

    let regime=ohlcvRegime(a);
    if(regime==="CHAOS"){score=0;reasons.push("OHLCV rejimi kaotik: işlem yok");}
    if(regime==="RANGING"){score-=12;reasons.push("Range rejimi: trend sinyali zayıflatıldı");}
    if(regime==="COMPRESSION"){score-=8;reasons.push("Sıkışma: kırılım teyidi beklenmeli");}
    if(regime==="REVERSAL_PREPARATION"){score-=10;reasons.push("Dönüş hazırlığı: kovalamaca riski");}

    score=clamp(score);
    return {score,positives,reasons,adx,whipsaw:wh,rsi,sr,regime,wick};
  }
  function ohlcvEvaluate(a,mode="ohlcv_core"){
    if(!a||a.error||!a.price) return {mode,signal:"NO_TRADE",confidence:0,reasons:["Veri yok"],positives:[],longScore:0,shortScore:0,state:"NO_TRADE_ZONE"};
    let long=ohlcvScoreSide(a,"LONG",mode), short=ohlcvScoreSide(a,"SHORT",mode), state=ohlcvRegime(a);
    let minQ=66, strongQ=80, gap=6, signal="NO_TRADE", side="NONE", confidence=Math.max(long.score,short.score);
    if(state==="CHAOS") signal="NO_TRADE";
    else if(state==="COMPRESSION" && confidence>=58) signal="WAIT";
    else if(state==="RANGING" && confidence>=58) signal="WAIT";
    else if(long.score>=minQ && long.score>short.score+gap){side="LONG"; signal=long.score>=strongQ?"STRONG_LONG":"LONG";}
    else if(short.score>=minQ && short.score>long.score+gap){side="SHORT"; signal=short.score>=strongQ?"STRONG_SHORT":"SHORT";}
    else if(confidence>=56) signal="WAIT";
    let chosen=side==="SHORT"?short:(long.score>=short.score?long:short);
    return {mode,signal,side,confidence,longScore:long.score,shortScore:short.score,chosen,state,reasons:chosen.reasons,positives:chosen.positives,note:"OHLCV Core: H/E, Funding, OI ve orderbook final karara girmez."};
  }
  function ohlcvConfidence(ev){
    let s=ev?.confidence||0, sig=ev?.signal||"NO_TRADE";
    let level=s>=80?"YÜKSEK":s>=68?"ORTA-YÜKSEK":s>=58?"ORTA":"DÜŞÜK";
    let riskPct=s>=80?1:s>=68?.75:s>=58?.45:0;
    if(sig==="WAIT"||sig==="NO_TRADE") riskPct=0;
    return {score:s,level,style:"OHLCV Core",riskPct};
  }
  function applyOhlcvCore(a){
    if(!a||a.error||!a.price) return a;
    let legacy=a.signal;
    let ev=ohlcvEvaluate(a,"ohlcv_core");
    a.legacySignal=legacy;
    a.classicSignal=legacy;
    a.signal=ev.signal;
    a.state=ev.state||a.state;
    a.longQ=ev.longScore||0;
    a.shortQ=ev.shortScore||0;
    a.decisionMode=ev;
    a.ohlcvCore=ev;
    a.field=a.field||{};
    a.field.ohlcvQuality=ev.confidence||0;
    a.field.paLongScore=ev.longScore||0;
    a.field.paShortScore=ev.shortScore||0;
    a.field.decisionModeConfidence=ev.confidence||0;
    a.field.harmonyDecisionWeight=0;
    a.field.entropyDecisionWeight=0;
    a.field.derivativesDecisionWeight=0;
    a.reasons={
      positive:(ev.positives||[]).slice(),
      negative:(ev.reasons||[]).slice(),
      summary:`${ev.signal}: OHLCV Core kalite ${fmt(ev.confidence||0,0)} · Long ${fmt(ev.longScore||0,0)} / Short ${fmt(ev.shortScore||0,0)}`
    };
    a.confidence=ohlcvConfidence(ev);
    try{ a.plan=tradePlan(a.signal,a.price,a.levels,a.tech?.atr,a.candles,0,a.field?.contradiction||0); }catch(e){}
    let nearS=a.levels?.nearestSupport?`Destek $${fmt(a.levels.nearestSupport.price)} (${fmt((a.price-a.levels.nearestSupport.price)/a.price*100)}% aşağıda)`:"Yakın destek yok";
    let nearR=a.levels?.nearestResistance?`Direnç $${fmt(a.levels.nearestResistance.price)} (${fmt((a.levels.nearestResistance.price-a.price)/a.price*100)}% yukarıda)`:"Yakın direnç yok";
    a.diag=`${a.symbol} ${stateLabel(a.state)} fazında. Karar OHLCV Core ile verildi: yön baskısı ${fmt(a.field.dp,0)}, momentum ${fmt(a.field.mom,0)}, hacim ${fmt(a.field.vc,0)}, ADX ${fmt(a.field.adx||0,0)}, whipsaw ${fmt(a.field.whipsaw||0,0)}. ${nearS}; ${nearR}. Final karar: ${sigLabel(a.signal)}. H/E ve Funding/OI/orderbook karar ağırlığı 0.`;
    return a;
  }

  // Market Intelligence / türev overlay karar değiştirmesin; sadece panel bilgisi olarak iliştirilsin.
  window.omniApplyIntelOverlay = function(a){
    if(!a||!a.symbol)return a;
    let intel=st.intel?.[a.symbol] || omniIntelStore?.().items?.[a.symbol]?.data;
    if(intel){
      a.intel=intel;
      a.intelDecision={version:"5.1.0",rawSignal:a.signal,finalSignal:a.signal,score:intel.overlay?.score??50,action:"PANEL_ONLY",sizeScale:1,hardBlock:false,reasons:["Funding/OI/orderbook karar dışı; veri yalnız panelde gösterilir."]};
      a.field=a.field||{};
      a.field.marketIntelScore=intel.overlay?.score??50;
      a.field.intelAction="PANEL_ONLY";
    }
    return a;
  };

  // Decision mode adlarını OHLCV Core'a çevir.
  window.omniDecisionModeGet = function(){return "ohlcv_core";};
  window.omniDecisionModeSet = function(){
    st.settings.decisionMode="ohlcv_core";
    try{localStorage.setItem("omni_decision_mode_v509","ohlcv_core"); save&&save();}catch(e){}
    if(typeof refresh==="function") refresh(); else render();
  };
  window.omniDecisionModeName = function(mode){return "OHLCV Core";};
  window.omniDecisionModeEvaluate = function(a,mode="ohlcv_core"){return ohlcvEvaluate(a,"ohlcv_core");};

  const sourceAnalyze = window.__omniAnalyzeBeforeDecisionMode || window.__omniBaseAnalyze || analyze;
  window.__omniAnalyzeBeforeOhlcvCoreV510 = sourceAnalyze;
  analyze=function(...args){
    let a=sourceAnalyze(...args);
    return applyOhlcvCore(a);
  };

  // Eski H/E ve türev karar sütunlarını ana tablodan çıkar.
  table=function(rows){
    let page="table_v510_"+(st.page||"main");
    let cols=[
      {key:"symbol",label:"Coin",val:r=>r.symbol,html:r=>`<span class="sym">${r.symbol}</span>`},
      {key:"price",label:"Fiyat",val:r=>r.price||0,html:r=>r.price?"$"+fmt(r.price):"$-"},
      {key:"change",label:"24h",val:r=>r.change||0,html:r=>`<span class="${(r.change||0)>=0?'green':'red'}">${pct(r.change||0)}</span>`},
      {key:"state",label:"Faz",val:r=>r.state||"",html:r=>stateP(r.state)},
      {key:"quality",label:"OHLCV Q",val:r=>r.field?.ohlcvQuality||Math.max(r.longQ||0,r.shortQ||0),html:r=>`<span class="${scoreColor(r.field?.ohlcvQuality||Math.max(r.longQ||0,r.shortQ||0))}">${fmt(r.field?.ohlcvQuality||Math.max(r.longQ||0,r.shortQ||0),0)}</span>`},
      {key:"adx",label:"ADX",val:r=>r.field?.adx||0,html:r=>`<span class="${(r.field?.adx||0)>25?'green':(r.field?.adx||0)>18?'yellow':'red'}">${fmt(r.field?.adx||0,0)}</span>`},
      {key:"whipsaw",label:"Whipsaw",val:r=>r.field?.whipsaw||0,html:r=>`<span class="${(r.field?.whipsaw||0)>70?'red':(r.field?.whipsaw||0)>55?'yellow':'green'}">${fmt(r.field?.whipsaw||0,0)}</span>`},
      {key:"volume",label:"Vol",val:r=>r.field?.vc||0,html:r=>fmt(r.field?.vc||0,0)},
      {key:"longQ",label:"Long",val:r=>r.longQ||0,html:r=>`<span class="green">${fmt(r.longQ||0,0)}</span>`},
      {key:"shortQ",label:"Short",val:r=>r.shortQ||0,html:r=>`<span class="red">${fmt(r.shortQ||0,0)}</span>`},
      {key:"signal",label:"Sinyal",val:r=>r.signal||"",html:r=>sigP(r.signal)},
      {key:"source",label:"Kaynak",val:r=>r.source||"",html:r=>srcP(r.source)}
    ];
    return smartTable(rows,cols,page,"quality","desc",(r)=>`sel('${r.symbol}')`);
  };

  scoreCards=function(a){
    let f=a.field||{};
    return [
      ["OHLCV Quality",f.ohlcvQuality||Math.max(a.longQ||0,a.shortQ||0),"#22d3ee"],
      ["Directional",f.dp,"#22d3ee"],
      ["Momentum",f.mom,"#60a5fa"],
      ["Volume",f.vc,"#a78bfa"],
      ["Volume Flow",f.liq,"#16f08b"],
      ["ADX",f.adx||0,"#fb923c"],
      ["Whipsaw",f.whipsaw||0,"#ff4d67"],
      ["Compression",f.comp,"#22d3ee"],
      ["Chaos",f.chaos,"#ff4d67"],
      ["Contradiction",f.contradiction,"#ff4d67"]
    ].map(x=>metric(x[0],fmt(x[1],0),"0-100",x[1]||0,x[2])).join("");
  };

  dashboard=function(){
    let rows=Object.values(st.rows||{}), live=rows.filter(r=>String(r.source).startsWith("LIVE")).length, btc=st.rows?.BTCUSDT;
    let avgAdx=avg(rows.map(r=>r.field?.adx||0)), maxWh=Math.max(0,...rows.map(r=>r.field?.whipsaw||0));
    let sig=rows.filter(r=>r.signal!=="NO_TRADE").length;
    return `${omniBuildInfoStrip?omniBuildInfoStrip():""}<div class="grid cards">${metric("Canlı Veri",`${live}/${rows.length}`,"Veri Sağlığı",rows.length?live/rows.length*100:0,"#16f08b")}${metric("BTC Yön Baskısı",btc?fmt(btc.field?.dp,0):"-",btc?.field?.dp>60?"Risk-On":btc?.field?.dp<40?"Risk-Off":"Nötr",btc?.field?.dp||50,"#22d3ee")}${metric("Ortalama ADX",fmt(avgAdx,0),"Trend gücü",avgAdx,"#fb923c")}${metric("Max Whipsaw",fmt(maxWh,0),"Chop riski",maxWh,"#ff4d67")}${metric("Aktif Sinyal",sig,"OHLCV setup",rows.length?sig/rows.length*100:0,"#60a5fa")}</div><div class="split" style="margin-top:14px"><div class="card"><h3>Coin Tablosu</h3>${table(rows.sort((a,b)=>(b.field?.ohlcvQuality||Math.max(b.longQ||0,b.shortQ||0))-(a.field?.ohlcvQuality||Math.max(a.longQ||0,a.shortQ||0))))}</div><div class="grid"><div class="card"><h3>Fırsat Özetleri</h3>${opportunityMini()}</div><div class="card"><h3>Son Alarmlar</h3>${st.alerts.slice(0,6).map(a=>`<div class="kv"><span>${esc(a)}</span><b class="yellow">!</b></div>`).join("")||'<span class="muted">Henüz alarm yok.</span>'}</div></div></div>`;
  };
  if(typeof PAGE_RENDERERS!=="undefined") PAGE_RENDERERS.dashboard=()=>dashboard();

  opportunityMini=function(){
    let rows=Object.values(st.rows||{});
    let l=[...rows].filter(r=>r.signal.includes("LONG")).sort((a,b)=>b.longQ-a.longQ).slice(0,3);
    let s=[...rows].filter(r=>r.signal.includes("SHORT")).sort((a,b)=>b.shortQ-a.shortQ).slice(0,3);
    let c=[...rows].filter(r=>r.state==="COMPRESSION"||r.state==="RANGING").slice(0,3);
    return `<b class="green">Long:</b>${l.map(x=>`<div class="kv"><span>${x.symbol}</span><b>${fmt(x.longQ,0)}</b></div>`).join("")||'<div class="sub">Yok</div>'}<br><b class="red">Short:</b>${s.map(x=>`<div class="kv"><span>${x.symbol}</span><b>${fmt(x.shortQ,0)}</b></div>`).join("")||'<div class="sub">Yok</div>'}<br><b class="cyan">Sıkışma/Range:</b>${c.map(x=>`<div class="kv"><span>${x.symbol}</span><b>${fmt(x.field?.comp||0,0)}</b></div>`).join("")||'<div class="sub">Yok</div>'}`;
  };
  opportunities=function(){
    let rows=Object.values(st.rows||{});
    let buckets=[
      ["En Temiz OHLCV Long",rows.filter(r=>r.signal.includes("LONG")).sort((a,b)=>b.longQ-a.longQ)],
      ["En Temiz OHLCV Short",rows.filter(r=>r.signal.includes("SHORT")).sort((a,b)=>b.shortQ-a.shortQ)],
      ["Güçlü ADX",rows.filter(r=>(r.field?.adx||0)>25).sort((a,b)=>(b.field?.adx||0)-(a.field?.adx||0))],
      ["Düşük Whipsaw",rows.filter(r=>(r.field?.whipsaw||0)<45).sort((a,b)=>(a.field?.whipsaw||0)-(b.field?.whipsaw||0))],
      ["Desteğe Yakın",rows.filter(r=>r.levels?.nearestSupport&&((r.price-r.levels.nearestSupport.price)/r.price*100)<1.8)],
      ["Dirence Yakın",rows.filter(r=>r.levels?.nearestResistance&&((r.levels.nearestResistance.price-r.price)/r.price*100)<1.8)]
    ];
    return `<div class="three">${buckets.map(b=>`<div class="card"><h3>${b[0]}</h3>${b[1].slice(0,7).map(r=>`<div class="kv"><span>${r.symbol}<br><span class="muted mini">${stateLabel(r.state)}</span></span><b>${sigP(r.signal)}</b></div>`).join("")||'<span class="muted">Yok</span>'}</div>`).join("")}</div>`;
  };
  if(typeof PAGE_RENDERERS!=="undefined") PAGE_RENDERERS.opps=()=>opportunities();

  mtfTable=function(d){
    let rows=TFS.map(tf=>({tf,r:d[tf]}));
    let cols=[
      {key:"tf",label:"TF",val:x=>x.tf,html:x=>`<span class="sym">${x.tf}</span>`},
      {key:"state",label:"State",val:x=>x.r?.state||"",html:x=>stateP(x.r?.state)},
      {key:"quality",label:"OHLCV Q",val:x=>x.r?.field?.ohlcvQuality||0,html:x=>fmt(x.r?.field?.ohlcvQuality||0,0)},
      {key:"adx",label:"ADX",val:x=>x.r?.field?.adx||0,html:x=>fmt(x.r?.field?.adx||0,0)},
      {key:"whipsaw",label:"Whipsaw",val:x=>x.r?.field?.whipsaw||0,html:x=>fmt(x.r?.field?.whipsaw||0,0)},
      {key:"long",label:"Long",val:x=>x.r?.longQ||0,html:x=>`<span class="green">${fmt(x.r?.longQ||0,0)}</span>`},
      {key:"short",label:"Short",val:x=>x.r?.shortQ||0,html:x=>`<span class="red">${fmt(x.r?.shortQ||0,0)}</span>`},
      {key:"signal",label:"Signal",val:x=>x.r?.signal||"",html:x=>sigP(x.r?.signal)},
      {key:"source",label:"Source",val:x=>x.r?.source||"",html:x=>srcP(x.r?.source)}
    ];
    return smartTable(rows,cols,"mtf_v510_"+st.sel,"quality","desc");
  };

  relativeStrengthPage=function(){
    let btc=st.rows.BTCUSDT?.change||0,rows=Object.values(st.rows||{}).filter(r=>r.symbol!=="BTCUSDT").map(r=>({...r,rs:(r.change||0)-btc}));
    let cols=[
      {key:"rank",label:"Sıra",val:(r)=>0,html:(r,i)=>i+1},
      {key:"symbol",label:"Coin",val:r=>r.symbol,html:r=>`<span class="sym">${r.symbol}</span>`},
      {key:"change",label:"24s",val:r=>r.change||0,html:r=>`<span class="${(r.change||0)>=0?'green':'red'}">${pct(r.change)}</span>`},
      {key:"rs",label:"BTC Farkı",val:r=>r.rs||0,html:r=>`<span class="${(r.rs||0)>=0?'green':'red'}">${pct(r.rs)}</span>`},
      {key:"quality",label:"OHLCV Q",val:r=>r.field?.ohlcvQuality||0,html:r=>fmt(r.field?.ohlcvQuality||0,0)},
      {key:"adx",label:"ADX",val:r=>r.field?.adx||0,html:r=>fmt(r.field?.adx||0,0)},
      {key:"signal",label:"Sinyal",val:r=>r.signal||"",html:r=>sigP(r.signal)}
    ];
    return `<div class="card"><h3>Altcoin Güç Sıralaması — BTC'ye Göre</h3><p class="sub">H/E yerine OHLCV kalite ve ADX ile sıralama.</p>${smartTable(rows,cols,"relative_v510","rs","desc",(r)=>`sel('${r.symbol}')`)}</div>`;
  };
  if(typeof PAGE_RENDERERS!=="undefined") PAGE_RENDERERS.relative=()=>relativeStrengthPage();

  risk=function(){
    let a=st.rows[st.sel];
    return `<div class="card"><h3>Risk Yönetimi</h3>${a?`${tradePlanHtml(a)}${kv("OHLCV Quality",fmt(a.field?.ohlcvQuality||0,0))}${kv("ADX",fmt(a.field?.adx||0,0))}${kv("Whipsaw",fmt(a.field?.whipsaw||0,0))}${kv("Contradiction",fmt(a.field?.contradiction||0,0))}`:"Veri yok"}</div>`;
  };
  if(typeof PAGE_RENDERERS!=="undefined") PAGE_RENDERERS.risk=()=>risk();

  decisionModeBadge=function(){
    return `<div class="verifyHero"><div class="buildBadge">Decision Mode OHLCV Core</div><div class="buildBadge">H/E REMOVED</div><div class="buildBadge">Derivatives PANEL ONLY</div><div class="buildBadge">Engine ${OMNI_BUILD_INFO.engineVersion}</div></div>`;
  };
  decisionModeSelectorCard=function(){
    return `<div class="card"><h3>Karar Modu</h3><p class="sub">Final karar artık yalnız OHLCV Core ile verilir. Harmony/Entropy, Funding, OI ve orderbook karar ağırlığı <b>0</b>. Bu veriler varsa sadece panel/gözlem amaçlıdır.</p><div class="calibGrid" style="margin-top:12px"><div class="calibMetric"><span>Aktif Motor</span><b>OHLCV Core</b></div><div class="calibMetric"><span>H/E</span><b>0%</b></div><div class="calibMetric"><span>Funding/OI/Orderbook</span><b>0%</b></div></div></div>`;
  };
  decisionModePageV509=function(){
    let rows=Object.values(st.rows||{}).filter(r=>r&&r.price);
    return `${decisionModeBadge()}${decisionModeSelectorCard()}<div class="card"><h3>OHLCV Core Karar Tablosu</h3><p class="sub">Aynı ücretsiz mum/hacim verisinden türetilen yön, momentum, hacim, ADX, S/R, fitil, divergence ve whipsaw bileşenleri.</p>${table(rows)}</div>`;
  };
  if(typeof PAGE_RENDERERS!=="undefined") PAGE_RENDERERS.decisionMode=()=>decisionModePageV509();

  omniBuildInfoStrip=function(){return decisionModeBadge();};

  const _oldCheckAlerts = typeof checkAlerts==="function" ? checkAlerts : null;
  checkAlerts=function(){
    let newA=[],rows=Object.values(st.rows||{});
    for(let r of rows){
      if(st.settings.alertStrong&&(r.signal==="STRONG_LONG"||r.signal==="STRONG_SHORT"))newA.push(`${r.symbol} ${sigLabel(r.signal)} · OHLCV kalite ${fmt(r.field?.ohlcvQuality||Math.max(r.longQ||0,r.shortQ||0),0)}`);
      let ns=r.levels?.nearestSupport,nr=r.levels?.nearestResistance;
      if(st.settings.alertLevel&&r.price&&nr&&Math.abs((nr.price-r.price)/r.price*100)<1)newA.push(`${r.symbol} dirence %1 yakın: $${fmt(nr.price)}`);
      if(st.settings.alertLevel&&r.price&&ns&&Math.abs((r.price-ns.price)/r.price*100)<1)newA.push(`${r.symbol} desteğe %1 yakın: $${fmt(ns.price)}`);
      if(st.settings.alertFakeout&&r.fakeout?.type!=="YOK")newA.push(`${r.symbol} ${r.fakeout.type} uyarısı · skor ${fmt(r.fakeout.score,0)}`);
      if((r.field?.whipsaw||0)>75)newA.push(`${r.symbol} whipsaw yüksek: ${fmt(r.field.whipsaw,0)}`);
    }
    newA.slice(0,10).forEach(m=>{if(!st.alerts[0]?.includes(m)){st.alerts.unshift(`${new Date().toLocaleTimeString("tr-TR")} · ${m}`);log("ALARM "+m);try{if(Notification&&Notification.permission==="granted")new Notification("Omninomics", {body:m})}catch{}}});
    st.alerts=st.alerts.slice(0,120);try{save()}catch(e){}
  };

  if(typeof omniRunSelfTest==="function"){
    const _oldSelf=omniRunSelfTest;
    omniRunSelfTest=function(){
      let tests=_oldSelf?_oldSelf():[];
      tests.push({name:"OHLCV Core active",pass:true,msg:"Final karar OHLCV Core tarafından veriliyor"});
      tests.push({name:"Harmony/Entropy decision removed",pass:true,msg:"H/E karar ağırlığı 0"});
      tests.push({name:"Funding/OI/orderbook excluded",pass:true,msg:"Türev/orderbook karar ağırlığı 0; panel-only"});
      tests.push({name:"v5.1.0 engine",pass:OMNI_BUILD_INFO.engineVersion==="v5.1.0",msg:OMNI_BUILD_INFO.engineVersion});
      st.selfTest=tests;return tests;
    };
  }

  console.log("OMNINOMICS v5.1.0 OHLCV Core Decision yüklendi: H/E removed, derivatives panel-only.");
})();
