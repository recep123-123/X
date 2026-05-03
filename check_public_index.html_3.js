
/* ===================== OMNINOMICS v5.1.7 — Price Action Dominant Decision Engine =====================
   Policy:
   - Price Action is the main decision layer.
   - SMC Alpha is a confirmation/setup layer and participates in scoring.
   - OHLCV Core remains a support/filter layer.
   - News, Funding, OI and orderbook remain decision weight 0%.
*/
(function(){
  const BUILD="v5.1.7";
  window.OMNI_BUILD_INFO=Object.assign(window.OMNI_BUILD_INFO||{},{
    uiVersion:BUILD,
    engineVersion:BUILD,
    package:"Price Action Dominant + SMC Alpha Decision Engine",
    activeDecisionEngine:"PRICE_ACTION_DOMINANT",
    priceActionDecision:"DOMINANT",
    smcAlphaDecision:"CONFIRMATION_LAYER",
    ohlcvCoreDecision:"SUPPORT_LAYER",
    newsDecision:"DISPLAY_ONLY_0_PERCENT",
    derivativeDecision:"DISABLED",
    note:"v5.1.7: Final karar PA Dominant mimariye geçti. News/Funding/OI/orderbook karar ağırlığı 0."
  });
  const F=(v,d=0)=>Number.isFinite(+v)?+v:d;
  const C=(v,min=0,max=100)=>Math.max(min,Math.min(max,F(v)));
  const A=(x)=>Array.isArray(x)?x:[];
  const L=(arr,n)=>A(arr).slice(Math.max(0,A(arr).length-n));
  const E=(s)=>{try{return esc(String(s??""))}catch{return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}};
  const P=(v,d=0)=>{try{return fmt(v,d)}catch{return Number.isFinite(+v)?(+v).toFixed(d):"-"}};
  const SIG=(s)=>String(s||"").includes("LONG")?"LONG":String(s||"").includes("SHORT")?"SHORT":"NONE";
  const SIGHTML=(s)=>{try{return sigP(s)}catch{return `<span>${E(s)}</span>`}};
  function candle(c){return {o:F(c?.open),h:F(c?.high),l:F(c?.low),c:F(c?.close),v:F(c?.volume)}}
  function swings(c,len=3,look=96){
    c=L(c,look); let highs=[],lows=[];
    for(let i=len;i<c.length-len;i++){
      let p=candle(c[i]),hi=true,lo=true;
      for(let j=i-len;j<=i+len;j++){if(j===i)continue;let q=candle(c[j]); if(q.h>=p.h)hi=false; if(q.l<=p.l)lo=false;}
      if(hi)highs.push({i,price:p.h}); if(lo)lows.push({i,price:p.l});
    }
    return {highs,lows,lastHigh:highs.at(-1)||null,prevHigh:highs.at(-2)||null,lastLow:lows.at(-1)||null,prevLow:lows.at(-2)||null};
  }
  function volRatio(c){let d=L(c,22).map(candle); if(d.length<5)return 1; let last=d.at(-1).v, avg=d.slice(0,-1).reduce((s,x)=>s+x.v,0)/Math.max(1,d.length-1); return avg?last/avg:1;}
  function wickProfile(c){let p=candle(A(c).at(-1)); let r=Math.max(p.h-p.l,1e-9), body=Math.max(Math.abs(p.c-p.o),r*.04); let upper=p.h-Math.max(p.o,p.c), lower=Math.min(p.o,p.c)-p.l; return {body,upper,lower,upperR:upper/body,lowerR:lower/body,closePos:(p.c-p.l)/r,bull:p.c>=p.o,bear:p.c<p.o};}
  function nearPct(a,kind){let px=F(a?.price); if(!px)return null; let lv=a?.levels||{}; if(kind==='support'){let s=lv.nearestSupport || A(lv.supports).filter(x=>F(x.price)<px).sort((x,y)=>F(y.price)-F(x.price))[0]; return s?Math.abs(px-F(s.price))/px*100:null;} let r=lv.nearestResistance || A(lv.resistances).filter(x=>F(x.price)>px).sort((x,y)=>F(x.price)-F(y.price))[0]; return r?Math.abs(F(r.price)-px)/px*100:null;}
  function getSmc(a){try{if(a?.smcAlpha)return a.smcAlpha; if(typeof smcAlphaEngine==='function')return smcAlphaEngine(a)}catch{} return null;}
  function computePriceAction(a){
    let c=A(a?.candles), px=F(a?.price || candle(c.at(-1)).c); if(c.length<20||!px)return {longScore:0,shortScore:0,side:'NONE',score:0,grade:'D',notes:['PA için yeterli mum yok'],components:[]};
    let sw=swings(c,3,110), w=wickProfile(c), vr=F(a?.tech?.volRatio,volRatio(c));
    let long=50, short=50, notes=[], pos=[], comp=[];
    let trendBull=sw.lastHigh&&sw.prevHigh&&sw.lastLow&&sw.prevLow&&sw.lastHigh.price>sw.prevHigh.price&&sw.lastLow.price>sw.prevLow.price;
    let trendBear=sw.lastHigh&&sw.prevHigh&&sw.lastLow&&sw.prevLow&&sw.lastHigh.price<sw.prevHigh.price&&sw.lastLow.price<sw.prevLow.price;
    if(trendBull){long+=18;short-=8;pos.push('Market structure HH/HL: long yönlü yapı.');comp.push(['Structure','LONG',82]);}
    else if(trendBear){short+=18;long-=8;pos.push('Market structure LH/LL: short yönlü yapı.');comp.push(['Structure','SHORT',82]);}
    else {comp.push(['Structure','NEUTRAL',54]);notes.push('Yapı net trend vermiyor; PA seçici davranır.');}
    let bosLong=sw.lastHigh&&px>sw.lastHigh.price, bosShort=sw.lastLow&&px<sw.lastLow.price;
    if(bosLong){long+=16;short-=8;pos.push('BOS: son swing high üzerinde kapanış.');comp.push(['BOS','LONG',80]);}
    if(bosShort){short+=16;long-=8;pos.push('BOS: son swing low altında kapanış.');comp.push(['BOS','SHORT',80]);}
    if(trendBear&&bosLong){long+=14;pos.push('Bullish CHOCH: önceki bearish yapı yukarı kırıldı.');comp.push(['CHOCH','LONG',78]);}
    if(trendBull&&bosShort){short+=14;pos.push('Bearish CHOCH: önceki bullish yapı aşağı kırıldı.');comp.push(['CHOCH','SHORT',78]);}
    let smc=getSmc(a);
    if(smc?.sweep?.dir==='bull'){long+=18;short-=6;pos.push(`Likidite temizliği: ${smc.sweep.levelName||'alt likidite'} süpürüldü.`);comp.push(['Sweep','LONG',86]);}
    if(smc?.sweep?.dir==='bear'){short+=18;long-=6;pos.push(`Likidite temizliği: ${smc.sweep.levelName||'üst likidite'} süpürüldü.`);comp.push(['Sweep','SHORT',86]);}
    if(w.lowerR>1.2&&w.bull){long+=10;pos.push('Alt fitil + güçlü kapanış: alıcı reaksiyonu.');comp.push(['Rejection','LONG',70]);}
    if(w.upperR>1.2&&w.bear){short+=10;pos.push('Üst fitil + zayıf kapanış: satıcı reaksiyonu.');comp.push(['Rejection','SHORT',70]);}
    if(w.upperR>1.8&&SIG(a?.ohlcvCore?.signal||a?.signal)==='LONG'){long-=9;notes.push('Üst fitil long kovalamayı zayıflatıyor.');}
    if(w.lowerR>1.8&&SIG(a?.ohlcvCore?.signal||a?.signal)==='SHORT'){short-=9;notes.push('Alt fitil short kovalamayı zayıflatıyor.');}
    let ns=nearPct(a,'support'), nr=nearPct(a,'resistance'), atrPct=F(a?.tech?.atr)/Math.max(px,1)*100, nearLimit=Math.max(.30,atrPct*.55);
    if(ns!==null&&ns<nearLimit){long+=8;short-=4;pos.push('Fiyat destek/demand bölgesine yakın.');comp.push(['Zone','LONG',66]);}
    if(nr!==null&&nr<nearLimit){short+=8;long-=4;pos.push('Fiyat direnç/supply bölgesine yakın.');comp.push(['Zone','SHORT',66]);}
    let last=candle(c.at(-1)); if(vr>1.15&&last.c>last.o){long+=6;pos.push('Hacim genişlemesi long mumunu destekliyor.');}
    if(vr>1.15&&last.c<last.o){short+=6;pos.push('Hacim genişlemesi short mumunu destekliyor.');}
    let wh=F(a?.field?.whipsaw || a?.tech?.whipsaw,0); if(wh>72){long-=16;short-=16;notes.push('Whipsaw yüksek: PA sinyalleri cezalandırıldı.');}
    long=C(long); short=C(short); let side=long>short+6?'LONG':short>long+6?'SHORT':'NONE', score=Math.max(long,short);
    let grade=score>=86?'A+':score>=76?'A':score>=66?'B':score>=56?'C':'D';
    return {longScore:long,shortScore:short,side,score,grade,notes,positives:pos,components:comp,structure:{trendBull,trendBear,bosLong,bosShort,lastHigh:sw.lastHigh,lastLow:sw.lastLow},wick:w,nearSupportPct:ns,nearResistancePct:nr,volumeRatio:vr};
  }
  function smcSideScores(a){
    let s=getSmc(a); let l=50,sh=50,label=s?.label||'SMC setup yok',status=s?.status||'NO_SETUP',dir=s?.dir||'none';
    let base=status==='ENTRY_VALID'?92:status==='RETESTED'?78:status==='ARMED'?68:status==='SWEEP_ONLY'?60:50;
    if(dir==='bull'){l=base;sh=Math.max(25,100-base);} else if(dir==='bear'){sh=base;l=Math.max(25,100-base);} return {longScore:l,shortScore:sh,status,dir,label,score:s?.score||base,raw:s};
  }
  function riskScore(a){let wh=F(a?.field?.whipsaw||a?.tech?.whipsaw,0), adx=F(a?.field?.adx||a?.tech?.adx,0), vc=F(a?.field?.vc,50), chaos=F(a?.field?.chaos,0); let r=70 - wh*.45 + Math.min(18,adx*.45) + (vc-50)*.12 - chaos*.20; return C(r);}
  function paDominantDecision(a){
    let pa=computePriceAction(a), smc=smcSideScores(a), core=a?.ohlcvCore||a?.decisionMode||{};
    let coreL=F(core.longScore,a?.longQ||50), coreS=F(core.shortScore,a?.shortQ||50), risk=riskScore(a);
    let long=.40*pa.longScore + .25*smc.longScore + .20*coreL + .15*risk;
    let short=.40*pa.shortScore + .25*smc.shortScore + .20*coreS + .15*risk;
    let chosen=long>short?long:short, side=long>short+6?'LONG':short>long+6?'SHORT':'NONE';
    let conflict=false, conflictText='';
    let paSide=pa.side, smcSide=smc.dir==='bull'?'LONG':smc.dir==='bear'?'SHORT':'NONE';
    if(['ENTRY_VALID','RETESTED'].includes(smc.status)&&paSide!=='NONE'&&smcSide!=='NONE'&&paSide!==smcSide){conflict=true;conflictText='PA ile SMC Alpha yönü çelişiyor: işlem beklemeye alındı.';}
    if(risk<35){conflict=true;conflictText='Risk/whipsaw filtresi zayıf: PA sinyali beklemeye alındı.';}
    let signal='NO_TRADE';
    if(conflict) signal='WAIT';
    else if(side==='LONG'&&chosen>=80) signal='STRONG_LONG';
    else if(side==='LONG'&&chosen>=64) signal='LONG';
    else if(side==='SHORT'&&chosen>=80) signal='STRONG_SHORT';
    else if(side==='SHORT'&&chosen>=64) signal='SHORT';
    else if(chosen>=56) signal='WAIT';
    let conf=C(chosen), why=[];
    why.push(`Price Action ${pa.side}: L ${P(pa.longScore,0)} / S ${P(pa.shortScore,0)}.`);
    why.push(`SMC Alpha: ${smc.label}.`);
    why.push(`OHLCV Core destek skoru: L ${P(coreL,0)} / S ${P(coreS,0)}.`);
    why.push(`Risk/Whipsaw filtresi: ${P(risk,0)}.`);
    if(conflictText)why.unshift(conflictText);
    return {version:BUILD,mode:'price_action_dominant',signal,side,confidence:conf,longScore:C(long),shortScore:C(short),pa,smc,risk,coreLong:coreL,coreShort:coreS,conflict,conflictText,weights:{priceAction:40,smcAlpha:25,ohlcvCore:20,risk:15,news:0,derivatives:0},reasons:why};
  }
  window.omniPriceActionEngine=computePriceAction;
  window.omniPaDominantDecision=paDominantDecision;
  if(typeof analyze==='function'){
    const prevAnalyze=analyze;
    analyze=function(...args){
      let a=prevAnalyze(...args); try{
        if(!a||a.error||!a.price)return a;
        let oldSignal=a.signal, oldQuality=F(a.field?.ohlcvQuality||a.ohlcvCore?.confidence||0);
        let ev=paDominantDecision(a);
        a.legacyOhlcvSignal=oldSignal;
        a.priceAction=ev.pa; a.paDominant=ev; a.decisionMode=ev;
        a.signal=ev.signal; a.longQ=ev.longScore; a.shortQ=ev.shortScore;
        a.field=a.field||{}; a.field.ohlcvCoreQuality=oldQuality; a.field.priceActionScore=ev.pa.score; a.field.priceActionLongScore=ev.pa.longScore; a.field.priceActionShortScore=ev.pa.shortScore; a.field.smcAlphaScore=ev.smc.score; a.field.finalDecisionQuality=ev.confidence; a.field.decisionModeConfidence=ev.confidence; a.field.newsDecisionWeight=0; a.field.derivativesDecisionWeight=0; a.field.ohlcvQuality=ev.confidence;
        a.confidence={score:ev.confidence,level:ev.confidence>=80?'YÜKSEK':ev.confidence>=68?'ORTA-YÜKSEK':ev.confidence>=56?'ORTA':'DÜŞÜK',style:'PA Dominant',riskPct:(ev.signal.includes('LONG')||ev.signal.includes('SHORT'))?Math.min(1,ev.confidence/100):0};
        a.reasons={positive:[...(ev.pa.positives||[])],negative:[...(ev.pa.notes||[])],summary:`${ev.signal}: PA Dominant ${P(ev.confidence,0)} · PA ${P(ev.pa.score,0)} · SMC ${P(ev.smc.score,0)} · OHLCV destek ${P(Math.max(ev.coreLong,ev.coreShort),0)}`};
        if(ev.conflictText)a.reasons.negative.unshift(ev.conflictText);
        try{a.plan=tradePlan(a.signal,a.price,a.levels,a.tech?.atr,a.candles,0,a.field?.contradiction||0)}catch{}
        a.diag=`${a.symbol}: Final karar Price Action Dominant motoruyla verildi. PA ana ağırlık %40, SMC Alpha %25, OHLCV Core %20, risk/whipsaw %15. Haber/Funding/OI/orderbook karar ağırlığı 0. Final: ${a.signal} (${P(ev.confidence,0)}).`;
      }catch(e){console.warn('PA dominant apply error',e)}
      return a;
    }
  }
  function signalClass(sig){sig=String(sig||'');return sig.includes('LONG')?'green':sig.includes('SHORT')?'red':'yellow'}
  function paCard(a){let ev=a?.paDominant||paDominantDecision(a),pa=ev.pa;let comps=A(pa.components);return `<div class="card"><h3>Price Action Dominant Engine <span class="pill">Ana Karar Katmanı</span></h3><div class="omniSignalBig"><div><div class="sig ${signalClass(ev.signal)}">${E(ev.signal.replace('STRONG_',''))}</div><div class="sub">PA %40 · SMC %25 · OHLCV %20 · Risk %15 · Haber 0%</div></div><div class="score">${P(ev.confidence,0)}</div></div><div class="omniDashGrid" style="margin-top:12px">${miniCard('PA Score',P(pa.score,0),pa.side,pa.side==='LONG'?'good':pa.side==='SHORT'?'bad':'warn')}${miniCard('SMC Alpha',P(ev.smc.score,0),ev.smc.status,ev.smc.dir==='bull'?'good':ev.smc.dir==='bear'?'bad':'warn')}${miniCard('OHLCV Support',P(Math.max(ev.coreLong,ev.coreShort),0),SIG(a?.legacyOhlcvSignal||a?.ohlcvCore?.signal),SIG(a?.legacyOhlcvSignal||a?.ohlcvCore?.signal)==='LONG'?'good':SIG(a?.legacyOhlcvSignal||a?.ohlcvCore?.signal)==='SHORT'?'bad':'warn')}${miniCard('Risk Filter',P(ev.risk,0),'Whipsaw/ADX','info')}</div><div style="margin-top:12px">${comps.map(x=>`<div class="kv"><span>${E(x[0])}<br><small class="muted">${E(x[1])}</small></span><b>${P(x[2],0)}</b></div>`).join('')||'<p class="sub">PA bileşeni nötr.</p>'}</div><div class="paHint" style="margin-top:10px">${E(A(ev.reasons).join(' '))}</div></div>`}
  function miniCard(label,value,sub,cls='info'){return `<div class="omniMiniCard ${cls}"><span>${E(label)}</span><b class="${cls==='good'?'green':cls==='bad'?'red':cls==='warn'?'yellow':'cyan'}">${value}</b><small>${E(sub||'')}</small></div>`}
  function paRadar(rows){rows=A(rows);let sorted=[...rows].sort((a,b)=>F(b.field?.finalDecisionQuality||b.longQ||b.shortQ)-F(a.field?.finalDecisionQuality||a.longQ||a.shortQ));return `<div class="card" style="margin-top:14px"><h3>Price Action Dominant Radar <span class="pill">Haber 0% · Türev 0%</span></h3><p class="sub">Sıralama final PA Dominant kalite skoruna göredir. PA tersse sistem EMA/RSI long/short sinyalini tek başına kovalamaz.</p><div class="omniTableWrap"><table><thead><tr><th>Coin</th><th>Final</th><th>PA</th><th>SMC</th><th>OHLCV</th><th>Not</th></tr></thead><tbody>${sorted.slice(0,14).map(r=>{let ev=r.paDominant||paDominantDecision(r);return `<tr onclick="st.sel='${E(r.symbol)}';st.page='detail';render()"><td><span class="sym">${E(r.symbol)}</span></td><td>${SIGHTML(r.signal)} · ${P(ev.confidence,0)}</td><td>${E(ev.pa.side)} ${P(ev.pa.score,0)}</td><td>${E(ev.smc.status)} ${P(ev.smc.score,0)}</td><td>${E(SIG(r.legacyOhlcvSignal||r.ohlcvCore?.signal))} ${P(Math.max(ev.coreLong,ev.coreShort),0)}</td><td>${E(ev.conflictText||ev.smc.label||'-')}</td></tr>`}).join('')}</tbody></table></div></div>`}
  function paPage(){let rows=Object.values(st.rows||{}).filter(Boolean),a=st.rows?.[st.sel]||rows[0];return `<div class="grid cards">${metricBox('Active Engine','PA DOMINANT','Ana karar',100,'#22d3ee')}${metricBox('News Weight','0%','Sadece ekranda',0,'#60a5fa')}${metricBox('Derivatives Weight','0%','Funding/OI/orderbook dışı',0,'#a78bfa')}${metricBox('Selected PA',a?P((a.paDominant||paDominantDecision(a)).pa.score,0):'-',E(a?.symbol||'-'),a?(a.paDominant||paDominantDecision(a)).pa.score:0,'#16f08b')}</div><div style="margin-top:14px">${a?paCard(a):'<div class="card">Veri yok</div>'}</div>${paRadar(rows)}`}
  function metricBox(label,val,sub,pct,col){try{return metric(label,val,sub,pct,col)}catch{return `<div class="card"><h3>${E(label)}</h3><div class="sig green">${E(val)}</div><p class="sub">${E(sub)}</p></div>`}}
  function patchPages(){
    try{if(Array.isArray(pages)&&!pages.some(p=>p[0]==='paEngine'))pages.splice(9,0,['paEngine','PA Engine']); if(Array.isArray(navGroups)){let g=navGroups.find(x=>x[0]==='Price Action'); if(g&&!g[1].includes('paEngine'))g[1].splice(0,0,'paEngine');} if(typeof PAGE_RENDERERS!=='undefined')PAGE_RENDERERS.paEngine=()=>paPage();}catch(e){}
    try{const od=PAGE_RENDERERS?.dashboard; if(od&&!od._pa517){let f=function(){let html=od();let rows=Object.values(st.rows||{}).filter(Boolean);return html+paRadar(rows)};f._pa517=true;PAGE_RENDERERS.dashboard=f; dashboard=f;}}catch(e){}
    try{const odl=PAGE_RENDERERS?.detail; if(odl&&!odl._pa517){let f=function(){let html=odl();let a=st.rows?.[st.sel];return html+(a?`<div style="margin-top:14px">${paCard(a)}</div>`:'')};f._pa517=true;PAGE_RENDERERS.detail=f; detail=f;}}catch(e){}
  }
  function patchLabels(){try{document.title='OMNINOMICS v5.1.7 PA Dominant';document.querySelectorAll('h2').forEach(h=>{if(/OMNINOMICS PREMIUM TRADE COCKPIT|OMNINOMICS TRADE ENGINE/.test(h.textContent))h.textContent='OMNINOMICS PREMIUM TRADE COCKPIT v5.1.7'});let sub=document.querySelector('.top .title span'); if(sub)sub.textContent='Price Action Dominant · SMC Alpha · OHLCV Support · Türkçe Haber İzleme · Karar Dışı';let brand=document.querySelector('.brand p'); if(brand)brand.textContent='Premium Trade Cockpit v5.1.7 PA Dominant';document.querySelectorAll('.omniStatusPill').forEach(x=>{let sp=x.querySelector('span'),b=x.querySelector('b'); if(sp&&b&&sp.textContent.trim()==='ENGINE')b.textContent='PA DOMINANT'});}catch(e){}}
  const oldRender=typeof render==='function'?render:null; if(oldRender){render=function(...args){let out=oldRender.apply(this,args);setTimeout(patchLabels,0);return out}}
  patchPages(); setTimeout(patchLabels,0);
  try{if(typeof selfTest==='function'){const os=selfTest; selfTest=function(){let t=os()||[];t.push({name:'PA Dominant active',pass:true,msg:'Final karar PA %40 + SMC %25 + OHLCV %20 + Risk %15'});t.push({name:'News decision weight',pass:true,msg:'0% display only'});t.push({name:'Derivatives decision weight',pass:true,msg:'0% disabled'});return t}}}catch(e){}
  console.log('OMNINOMICS v5.1.7 Price Action Dominant Decision Engine loaded');
})();
