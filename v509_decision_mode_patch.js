
/* ===================== v5.0.9 — Decision Mode A/B Tester ===================== */
/*
  Modlar:
  1) classic              : Mevcut OMNINOMICS zinciri. Harmony/Entropy aktif kalır.
  2) pa_dominant          : Karar skoru PA/ADX/DI/SR/Volume/Retest/Wick/MTF/Intel ile verilir. Harmony/Entropy kullanılmaz.
  3) pure_pa_intel        : Daha saf ve daha seçici PA + Intelligence. Harmony/Entropy kullanılmaz; DP etkisi de azaltılır.
*/
window.OMNI_BUILD_INFO = Object.assign(window.OMNI_BUILD_INFO || {}, {
  uiVersion: "v5.0.9",
  engineVersion: "v5.0.9",
  package: "Decision Mode A/B Tester",
  decisionModes: "ACTIVE",
  paDominantHarmonyEntropy: "DISABLED",
  note: "v5.0.9: Classic / PA Dominant / Pure PA + Intelligence modları. PA Dominant içinde Harmony ve Entropy ağırlığı sıfırdır."
});

function omniDecisionModeGet(){
  st.settings = st.settings || {};
  if(!st.settings.decisionMode) st.settings.decisionMode = localStorage.getItem("omni_decision_mode_v509") || "classic";
  return st.settings.decisionMode || "classic";
}
function omniDecisionModeSet(mode){
  st.settings = st.settings || {};
  st.settings.decisionMode = mode;
  localStorage.setItem("omni_decision_mode_v509", mode);
  if(typeof save === "function") try{ save(); }catch(e){}
  if(typeof refresh === "function") refresh(); else render();
}
function omniDecisionModeName(mode){
  return mode==="pa_dominant" ? "PA Dominant" : mode==="pure_pa_intel" ? "Pure PA + Intelligence" : "Classic OMNINOMICS";
}
function omniModeSide(sig){
  sig=String(sig||"");
  if(sig.includes("LONG"))return"LONG";
  if(sig.includes("SHORT"))return"SHORT";
  return"NONE";
}
function omniModeSrDistance(a,side){
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
function omniModeRetestLite(a,side){
  try{
    if(typeof omniRetestCheck==="function"){
      let oldRaw=a.rawSignal;
      a.rawSignal=side;
      let r=omniRetestCheck(a);
      a.rawSignal=oldRaw;
      return r;
    }
  }catch(e){}
  return {required:false,passed:true,note:"Retest kontrolü yok"};
}
function omniModeWickLite(a,side){
  try{
    if(typeof omniWickQuality==="function"){
      let oldRaw=a.rawSignal;
      a.rawSignal=side;
      let r=omniWickQuality(a);
      a.rawSignal=oldRaw;
      return r;
    }
  }catch(e){}
  let c=a?.candles?.at(-1);
  if(!c)return{penalty:0,reasons:[]};
  let o=+c.open,h=+c.high,l=+c.low,cl=+c.close,range=(h-l)||1,body=Math.abs(cl-o)||range*.05;
  let upper=h-Math.max(o,cl), lower=Math.min(o,cl)-l, closePos=(cl-l)/range, penalty=0, reasons=[];
  if(side==="LONG"){
    if(upper>body*1.6&&closePos<.62){penalty+=12;reasons.push("Üst fitil long için riskli");}
    if(closePos<.42){penalty+=8;reasons.push("LONG kapanış konumu zayıf");}
  }
  if(side==="SHORT"){
    if(lower>body*1.6&&closePos>.38){penalty+=12;reasons.push("Alt fitil short için riskli");}
    if(closePos>.58){penalty+=8;reasons.push("SHORT kapanış konumu zayıf");}
  }
  return{penalty,reasons,closePos,upperPct:upper/range*100,lowerPct:lower/range*100};
}
function omniModeMtfScore(a,side){
  try{
    let d=st.mtf?.[a.symbol]?.data;
    if(!d)return{score:0,note:"MTF yok",block:false,status:"Yok"};
    let tfs=Object.keys(d),votes=0,total=0,block=false;
    for(let tf of tfs){
      let r=d[tf]; if(!r||!r.signal)continue;
      total++;
      let sd=omniModeSide(r.signal);
      if(sd===side)votes++;
      if(side==="LONG"&&(r.state==="CHAOS"||r.state==="BREAKDOWN"))block=true;
      if(side==="SHORT"&&r.state==="ACCUMULATION")block=true;
    }
    return{score:total?votes/total:0,note:total?`${votes}/${total}`:"MTF yok",block,status:total?`${votes}/${total}`:"Yok"};
  }catch(e){return{score:0,note:"MTF hata",block:false,status:"Hata"}}
}
function omniPaScoreSide(a,side,mode){
  let f=a.field||{}, t=a.tech||{}, reasons=[], positives=[], score=50;
  let isPure=mode==="pure_pa_intel";
  let dp=f.dp??50, mom=f.mom??50, liq=f.liq??50, vc=f.vc??50;
  let adx=f.adx ?? t.adx ?? 0, plus=t.plusDI ?? f.plusDI, minus=t.minusDI ?? f.minusDI;
  let whipsaw=f.whipsaw ?? t.whipsaw ?? 0, rsi=t.rsi ?? 50;
  let div=f.divergence || t.divergence || {};
  let sr=omniModeSrDistance(a,side);
  let retest=omniModeRetestLite(a,side);
  let wick=omniModeWickLite(a,side);
  let mtf=omniModeMtfScore(a,side);
  let intel=a.intelDecision || (a.intel?.overlay ? {action:a.intel.overlay.action, score:a.intel.overlay.score, sizeScale:a.intel.overlay.sizeScale, hardBlock:a.intel.overlay.hardBlock, reasons:a.intel.overlay.reasons||[]} : null);

  /*
    PA Dominant ve Pure PA içinde harmony/entropy kullanılmaz.
    Bilerek f.harmony ve f.entropy hiçbir yerde okunmaz.
  */
  if(side==="LONG"){
    score += (dp-50) * (isPure ? .18 : .34);
    score += (mom-50) * .28;
    score += (liq-50) * .18;
    score += (vc-50) * .16;
    if(plus!=null && minus!=null){
      if(plus>minus){score+=6; positives.push("+DI long yönünü teyit ediyor");}
      else {score-=8; reasons.push("+DI/-DI long ile uyumsuz");}
    }
    if(rsi>82){score-=22; reasons.push("RSI aşırı alım: yeni long kovalanmaz");}
    if(div.bearish){score-=18; reasons.push("Bearish divergence long'a karşı");}
  }else if(side==="SHORT"){
    score += (50-dp) * (isPure ? .18 : .34);
    score += (50-mom) * .28;
    score += (liq-50) * .18;
    score += (vc-50) * .16;
    if(plus!=null && minus!=null){
      if(minus>plus){score+=6; positives.push("-DI short yönünü teyit ediyor");}
      else {score-=8; reasons.push("+DI/-DI short ile uyumsuz");}
    }
    if(rsi<18){score-=22; reasons.push("RSI aşırı satım: yeni short kovalanmaz");}
    if(div.bullish){score-=18; reasons.push("Bullish divergence short'a karşı");}
  }

  if(adx<15){score-=35; reasons.push("ADX < 15: trend gücü yetersiz");}
  else if(adx<20){score-=12; reasons.push("ADX zayıf");}
  else if(adx>28){score+=8; positives.push("ADX trend gücünü teyit ediyor");}

  if(whipsaw>70){score-=30; reasons.push("Whipsaw/chop çok yüksek");}
  else if(whipsaw>58){score-=12; reasons.push("Whipsaw orta-yüksek");}

  if(sr!=null){
    let atrPct=((t.atr||0)/(a.price||1))*100;
    let minDist=Math.max(.35, atrPct*.55);
    if(sr<minDist){score-=18; reasons.push((side==="LONG"?"Direnç":"Destek")+" çok yakın");}
    else if(sr>minDist*1.8){score+=5; positives.push("S/R alanı yeterli");}
  }

  if((t.volRatio||1)<.75){score-=10; reasons.push("Hacim teyidi zayıf");}
  else if((t.volRatio||1)>1.15){score+=5; positives.push("Hacim teyidi var");}

  if(retest.required&&!retest.passed){score-=isPure?18:12; reasons.push(retest.note||"Retest teyidi yok");}
  else if(retest.required&&retest.passed){score+=8; positives.push(retest.note||"Retest teyidi var");}

  if(wick.penalty){score-=wick.penalty; (wick.reasons||[]).forEach(x=>reasons.push(x));}

  if(mtf.block){score-=25; reasons.push("MTF blokajı var");}
  else if(mtf.score>=.5){score+=6; positives.push("MTF uyumu var");}
  else if(mtf.status!=="Yok"){score-=6; reasons.push("MTF uyumu zayıf");}

  if(intel){
    if(intel.hardBlock){score=0; reasons.push("Market Intelligence hard-block");}
    else if(intel.action==="SIZE_DOWN"){score-=isPure?10:6; reasons.push("Market Intelligence size-down / dikkat");}
    else if(intel.action==="CAUTION"){score-=4; reasons.push("Market Intelligence caution");}
    if((intel.score??50)>62){score+=3; positives.push("Market Intelligence nötr/olumlu");}
  }

  if(isPure){
    /* Pure PA + Intelligence daha seçici olsun */
    if(adx<18) score-=12;
    if(!retest.required || !retest.passed) score-=6;
    if((t.volRatio||1)<.95) score-=6;
  }

  score=Math.max(0,Math.min(100,score));
  return{score,reasons,positives,adx,whipsaw,rsi,sr,retest,wick,mtf,intel};
}
function omniDecisionModeEvaluate(a,mode=omniDecisionModeGet()){
  if(!a||a.error)return{mode,signal:"NO_TRADE",confidence:0,reasons:["Veri yok"],positives:[]};
  if(mode==="classic"){
    return{mode,signal:a.signal,confidence:a.verification?.confidence||a.calibration?.confidence||a.confidence||Math.max(a.longQ||0,a.shortQ||0),reasons:["Classic mod: mevcut OMNINOMICS zinciri"],positives:["Harmony/Entropy aktif"],classic:true};
  }
  let long=omniPaScoreSide(a,"LONG",mode), short=omniPaScoreSide(a,"SHORT",mode);
  let minQ=mode==="pure_pa_intel"?70:64, strongQ=mode==="pure_pa_intel"?84:78;
  let gap=mode==="pure_pa_intel"?8:5;
  let signal="NO_TRADE", confidence=Math.max(long.score,short.score), side="NONE";
  if(long.score>=minQ && long.score>short.score+gap){side="LONG";signal=long.score>=strongQ?"STRONG_LONG":"LONG";}
  else if(short.score>=minQ && short.score>long.score+gap){side="SHORT";signal=short.score>=strongQ?"STRONG_SHORT":"SHORT";}
  else if(confidence>=56){signal="WAIT";}
  let chosen=side==="SHORT"?short:long.score>=short.score?long:short;

  /* Market Intelligence hard-block son sözü söyler */
  if(chosen.intel?.hardBlock){signal="NO_TRADE";confidence=0;}

  return{
    mode, signal, side, confidence,
    longScore:long.score, shortScore:short.score,
    chosen,
    reasons:chosen.reasons,
    positives:chosen.positives,
    note: mode==="pa_dominant"
      ? "PA Dominant: Harmony/Entropy ağırlığı sıfırdır."
      : "Pure PA + Intelligence: Harmony/Entropy sıfır, PA ve intelligence daha seçici."
  };
}
function omniInstallDecisionModesV509(){
  if(window.__omniDecisionModesInstalled)return;
  window.__omniDecisionModesInstalled=true;
  window.__omniAnalyzeBeforeDecisionMode = analyze;
  analyze=function(...args){
    let a=window.__omniAnalyzeBeforeDecisionMode(...args);
    if(args[0]==="BT")return a;
    let mode=omniDecisionModeGet();
    if(!a||a.error||mode==="classic"){
      if(a)a.decisionMode={mode,signal:a?.signal,classic:true};
      return a;
    }
    let classicSignal=a.signal;
    let ev=omniDecisionModeEvaluate(a,mode);
    a.classicSignal=classicSignal;
    a.signal=ev.signal;
    a.decisionMode=ev;
    a.field=a.field||{};
    a.field.decisionModeConfidence=ev.confidence;
    a.field.paLongScore=ev.longScore||0;
    a.field.paShortScore=ev.shortScore||0;
    /* plan'ı yeni sinyale göre tazele */
    try{
      if(typeof tradePlan==="function" && a.price && a.levels && a.tech){
        a.plan=tradePlan(a.signal,a.price,a.levels,a.tech.atr,a.candles,0,0);
      }
    }catch(e){}
    return a;
  };
}
function decisionModeBadge(){
  let m=omniDecisionModeGet();
  return `<div class="verifyHero">
    <div class="buildBadge">Decision Mode ${omniDecisionModeName(m)}</div>
    <div class="buildBadge">PA Dominant H/E DISABLED</div>
    <div class="buildBadge">Engine ${OMNI_BUILD_INFO.engineVersion}</div>
  </div>`;
}
function decisionModeSelectorCard(){
  let m=omniDecisionModeGet();
  return `<div class="card"><h3>Karar Modu</h3>
    <p class="sub">PA Dominant modunda Harmony ve Entropy karar ağırlığı <b>sıfırdır</b>. Pure PA + Intelligence modunda da sıfırdır ve sistem daha seçicidir.</p>
    <div class="actions">
      <button class="btn ${m==='classic'?'primary':''}" onclick="omniDecisionModeSet('classic')">Classic OMNINOMICS</button>
      <button class="btn ${m==='pa_dominant'?'primary':''}" onclick="omniDecisionModeSet('pa_dominant')">PA Dominant</button>
      <button class="btn ${m==='pure_pa_intel'?'primary':''}" onclick="omniDecisionModeSet('pure_pa_intel')">Pure PA + Intelligence</button>
    </div>
    <div class="calibGrid" style="margin-top:12px">
      <div class="calibMetric"><span>Classic</span><b>H/E Aktif</b></div>
      <div class="calibMetric"><span>PA Dominant</span><b>H/E 0%</b></div>
      <div class="calibMetric"><span>Pure PA + Intel</span><b>H/E 0%</b></div>
    </div>
  </div>`;
}
function decisionModePageV509(){
  let rows=Object.values(st.rows||{}).filter(r=>r&&r.price);
  return `${decisionModeBadge()}${decisionModeSelectorCard()}<div class="card"><h3>Mevcut Coinlerde 3 Mod Karşılaştırması</h3>
  <p class="sub">Bu tablo aynı anlık analizi üç farklı karar modundan geçirir. PA Dominant ve Pure PA + Intelligence içinde Harmony/Entropy okunmaz.</p>
  <div style="overflow:auto"><table><thead><tr><th>Coin</th><th>Classic</th><th>PA Dominant</th><th>Pure PA + Intel</th><th>PA Long</th><th>PA Short</th><th>Not</th></tr></thead><tbody>
  ${rows.map(a=>{let c=omniDecisionModeEvaluate(a,'classic'),p=omniDecisionModeEvaluate(a,'pa_dominant'),q=omniDecisionModeEvaluate(a,'pure_pa_intel');return `<tr onclick="st.sel='${a.symbol}';st.page='detail';render()" style="cursor:pointer">
    <td><b>${a.symbol}</b></td><td>${sigP(c.signal)}</td><td>${sigP(p.signal)} <span class="muted mini">${fmt(p.confidence,0)}</span></td><td>${sigP(q.signal)} <span class="muted mini">${fmt(q.confidence,0)}</span></td><td>${fmt(p.longScore||0,0)}</td><td>${fmt(p.shortScore||0,0)}</td><td>${esc((p.reasons||[])[0]||(p.positives||[])[0]||'Temiz')}</td>
  </tr>`}).join("")}</tbody></table></div></div>`;
}
function omniModeBacktestFor(a,mode){
  if(!a?.candles?.length||a.candles.length<120)return{mode,trades:0,win:0,pf:0,ev:0,pnl:0};
  let c=a.candles, trades=[], cash=0;
  let base=window.__omniAnalyzeBeforeDecisionMode || analyze;
  for(let i=95;i<c.length-8;i+=4){
    let h;
    try{ h=base("BT",c.slice(0,i),{dp:50,entropy:50,state:"EXPANSION",isChaotic:false},"MODE_BT",null,"bt",null,{}) }catch(e){continue}
    h.symbol=a.symbol; h.candles=c.slice(0,i);
    let ev=omniDecisionModeEvaluate(h,mode);
    let side=omniModeSide(ev.signal);
    if(side==="NONE")continue;
    let entry=c[i].open, atr=h.tech?.atr||entry*.01, stop=side==="LONG"?entry-atr*1.35:entry+atr*1.35, tp=side==="LONG"?entry+atr*1.85:entry-atr*1.85;
    let r=0;
    for(let j=i;j<Math.min(c.length,i+8);j++){
      let b=c[j];
      if(side==="LONG"){
        if(b.low<=stop){r=-1;break}
        if(b.high>=tp){r=Math.abs(tp-entry)/Math.abs(entry-stop);break}
      }else{
        if(b.high>=stop){r=-1;break}
        if(b.low<=tp){r=Math.abs(entry-tp)/Math.abs(entry-stop);break}
      }
    }
    if(r===0){let last=c[Math.min(c.length-1,i+7)].close;r=side==="LONG"?(last-entry)/Math.abs(entry-stop):(entry-last)/Math.abs(entry-stop)}
    trades.push(r); cash+=r;
  }
  let wins=trades.filter(x=>x>0),loss=trades.filter(x=>x<=0),gw=wins.reduce((s,x)=>s+x,0),gl=Math.abs(loss.reduce((s,x)=>s+x,0));
  return{mode,trades:trades.length,win:trades.length?wins.length/trades.length:0,pf:gw/(gl||1),ev:trades.length?cash/trades.length:0,pnl:cash};
}
function decisionModeBacktestPageV509(){
  let a=st.rows?.[st.sel]||Object.values(st.rows||{})[0];
  if(!a)return `<div class="card"><h3>Decision Mode Backtest</h3><p class="sub">Veri bekleniyor.</p></div>`;
  let rows=["classic","pa_dominant","pure_pa_intel"].map(m=>omniModeBacktestFor(a,m));
  return `${decisionModeBadge()}<div class="card"><h3>Decision Mode Mini A/B Backtest</h3>
  <p class="sub">Seçili coin için hafif test. Profesyonel backtest değildir; mod farkını hızlı görmek içindir.</p>
  <div class="actions"><select class="sel" onchange="st.sel=this.value;render()">${st.settings.symbols.map(s=>`<option ${s===st.sel?'selected':''}>${s}</option>`).join("")}</select></div></div>
  <div class="card"><h3>${a.symbol} Mod Sonuçları</h3><div style="overflow:auto"><table><thead><tr><th>Mod</th><th>İşlem</th><th>Win</th><th>PF</th><th>EV</th><th>Toplam R</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${omniDecisionModeName(r.mode)}</b></td><td>${r.trades}</td><td>${fmt(r.win*100,1)}%</td><td>${fmt(r.pf,2)}</td><td class="${r.ev>=0?'green':'red'}">${fmt(r.ev,2)}R</td><td class="${r.pnl>=0?'green':'red'}">${fmt(r.pnl,2)}R</td></tr>`).join("")}</tbody></table></div></div>`;
}
function enhanceDecisionModePagesV509(){
  try{
    if(!pages.some(p=>p[0]==="decisionMode"))pages.push(["decisionMode","Karar Modu"],["modebt","Mod A/B Test"]);
    if(typeof navGroups!=="undefined"){
      let sg=navGroups.find(g=>g[0]==="Sinyal ve Karar");
      if(sg){["decisionMode","modebt"].forEach(x=>{if(!sg[1].includes(x))sg[1].push(x)})}
    }
    if(typeof PAGE_RENDERERS!=="undefined"){
      PAGE_RENDERERS.decisionMode=()=>decisionModePageV509();
      PAGE_RENDERERS.modebt=()=>decisionModeBacktestPageV509();
    }
    const oldBuild=typeof omniBuildInfoStrip==="function"?omniBuildInfoStrip:null;
    if(oldBuild){
      omniBuildInfoStrip=function(){return decisionModeBadge()+oldBuild()};
    }
    const oldSettings=typeof settings==="function"?settings:null;
    if(oldSettings){
      settings=function(){return decisionModeSelectorCard()+oldSettings()};
      if(typeof PAGE_RENDERERS!=="undefined")PAGE_RENDERERS.settings=()=>settings();
    }
    const oldDetail=typeof detail==="function"?detail:null;
    if(oldDetail){
      detail=function(){
        let out=oldDetail();
        let a=st.rows?.[st.sel];
        if(a?.decisionMode){
          let d=a.decisionMode;
          out+=`<div class="card"><h3>${a.symbol} Decision Mode Raporu</h3>
          <div class="verifyHero"><b>${omniDecisionModeName(d.mode)}</b> · Final ${sigP(a.signal)} · Confidence ${fmt(d.confidence||0,0)} · Classic ${sigP(a.classicSignal||a.signal)}</div>
          <div class="calibGrid"><div class="calibMetric"><span>PA Long</span><b>${fmt(d.longScore||0,0)}</b></div><div class="calibMetric"><span>PA Short</span><b>${fmt(d.shortScore||0,0)}</b></div><div class="calibMetric"><span>Harmony/Entropy</span><b>${d.mode==='classic'?'AKTİF':'0%'}</b></div></div>
          ${(d.positives||[]).map(x=>`<div class="noTradeReason good">✓ ${esc(x)}</div>`).join("")}
          ${(d.reasons||[]).map(x=>`<div class="noTradeReason warn">• ${esc(x)}</div>`).join("")}</div>`;
        }
        return out;
      };
      if(typeof PAGE_RENDERERS!=="undefined")PAGE_RENDERERS.detail=()=>detail();
    }
    const oldSelf=typeof omniRunSelfTest==="function"?omniRunSelfTest:null;
    if(oldSelf){
      omniRunSelfTest=function(){
        let tests=oldSelf();
        tests.push({name:"Decision modes",pass:true,msg:"Classic / PA Dominant / Pure PA + Intel aktif"});
        tests.push({name:"PA Dominant H/E disabled",pass:true,msg:"PA Dominant içinde Harmony/Entropy ağırlığı 0"});
        tests.push({name:"Current decision mode",pass:true,msg:omniDecisionModeName(omniDecisionModeGet())});
        st.selfTest=tests;return tests;
      };
    }
  }catch(e){console.warn("Decision mode pages failed",e)}
}
omniInstallDecisionModesV509();
enhanceDecisionModePagesV509();
console.log("OMNINOMICS v5.0.9 Decision Mode A/B Tester yüklendi.");
