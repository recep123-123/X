

/* ===================== OMNINOMICS v5.1.6 SMC Alpha Engine =====================
   Decision binding policy:
   - News: display only, decision weight 0%.
   - Funding/OI/orderbook: panel only, decision weight 0%.
   - SMC Alpha: OHLCV-derived setup confirmation layer. It does NOT overwrite OHLCV Core final signal.
*/
(function(){
  const BUILD='v5.1.6';
  function safeArr(x){return Array.isArray(x)?x:[]}
  function num(x,d=0){x=Number(x);return Number.isFinite(x)?x:d}
  function candleDay(t){try{return new Date(t||0).toISOString().slice(0,10)}catch{return ''}}
  function candleHour(t){try{return new Date(t||0).getUTCHours()}catch{return 0}}
  function body(p){return Math.abs(num(p.close)-num(p.open))}
  function upperWick(p){return num(p.high)-Math.max(num(p.open),num(p.close))}
  function lowerWick(p){return Math.min(num(p.open),num(p.close))-num(p.low)}
  function atrApprox(c,p=14,idx=null){
    if(!c||c.length<3)return 0;
    let end=idx==null?c.length-1:Math.max(1,idx), start=Math.max(1,end-p+1), tr=[];
    for(let i=start;i<=end;i++){let x=c[i],prev=c[i-1];tr.push(Math.max(num(x.high)-num(x.low),Math.abs(num(x.high)-num(prev.close)),Math.abs(num(x.low)-num(prev.close))))}
    return avg(tr)||((num(c[end].close)||1)*.01);
  }
  function sessionLevels(c){
    let out={pdh:null,pdl:null,asianHigh:null,asianLow:null,asianDate:null};
    c=safeArr(c); if(c.length<20)return out;
    let lastDay=candleDay(c.at(-1).time), days=[...new Set(c.map(x=>candleDay(x.time)).filter(Boolean))];
    let prevDay=days.filter(d=>d<lastDay).at(-1);
    let prev=prevDay?c.filter(x=>candleDay(x.time)===prevDay):[];
    if(prev.length>=2){out.pdh=Math.max(...prev.map(x=>num(x.high)));out.pdl=Math.min(...prev.map(x=>num(x.low)));}
    else {let n=Math.min(24,c.length-2),seg=c.slice(-n-1,-1);out.pdh=Math.max(...seg.map(x=>num(x.high)));out.pdl=Math.min(...seg.map(x=>num(x.low)));}
    let today=c.filter(x=>candleDay(x.time)===lastDay), asian=today.filter(x=>{let h=candleHour(x.time);return h>=0&&h<8});
    if(asian.length>=2){out.asianHigh=Math.max(...asian.map(x=>num(x.high)));out.asianLow=Math.min(...asian.map(x=>num(x.low)));out.asianDate=lastDay;}
    else {let seg=c.slice(-24,-12); if(seg.length>=2){out.asianHigh=Math.max(...seg.map(x=>num(x.high)));out.asianLow=Math.min(...seg.map(x=>num(x.low)));}}
    return out;
  }
  function levelsToSweepMap(lv){
    let arr=[];
    if(Number.isFinite(lv.pdh))arr.push({name:'PDH',price:lv.pdh,side:'high'});
    if(Number.isFinite(lv.asianHigh))arr.push({name:'Asian High',price:lv.asianHigh,side:'high'});
    if(Number.isFinite(lv.pdl))arr.push({name:'PDL',price:lv.pdl,side:'low'});
    if(Number.isFinite(lv.asianLow))arr.push({name:'Asian Low',price:lv.asianLow,side:'low'});
    return arr;
  }
  function detectSmcSweeps(c,lv,lookback=80){
    let out=[],levels=levelsToSweepMap(lv),start=Math.max(1,c.length-lookback);
    for(let i=start;i<c.length;i++){
      let p=c[i],b=Math.max(body(p), (num(p.high)-num(p.low))*0.08, 1e-12), up=upperWick(p), lo=lowerWick(p);
      for(let L of levels){
        if(L.side==='high' && num(p.high)>L.price && num(p.close)<L.price && up>b*1.2){
          out.push({dir:'bear',i,levelName:L.name,level:L.price,wickRatio:up/b,extreme:num(p.high),close:num(p.close),time:p.time,ok:true});
        }
        if(L.side==='low' && num(p.low)<L.price && num(p.close)>L.price && lo>b*1.2){
          out.push({dir:'bull',i,levelName:L.name,level:L.price,wickRatio:lo/b,extreme:num(p.low),close:num(p.close),time:p.time,ok:true});
        }
      }
    }
    return out.sort((a,b)=>a.i-b.i);
  }
  function detectSmcFvgs(c,sweep,window=5){
    let out=[]; if(!sweep)return out;
    let start=Math.max(2,sweep.i+1),end=Math.min(c.length-1,sweep.i+window);
    for(let i=start;i<=end;i++){
      let a=c[i-2],m=c[i-1],d=c[i],atr=atrApprox(c,14,i),mb=body(m),range=num(m.high)-num(m.low),impulse=atr?Math.max(mb/atr,range/atr):0;
      if(sweep.dir==='bear' && num(a.low)>num(d.high) && num(m.close)<num(m.open) && (mb>atr*.45 || range>atr*.9)){
        out.push({dir:'bear',i,low:num(d.high),high:num(a.low),mid:(num(d.high)+num(a.low))/2,impulse,createdAfter:i-sweep.i,quality:clamp(45+impulse*22+Math.min(25,Math.abs(num(a.low)-num(d.high))/(atr||1)*35))});
      }
      if(sweep.dir==='bull' && num(a.high)<num(d.low) && num(m.close)>num(m.open) && (mb>atr*.45 || range>atr*.9)){
        out.push({dir:'bull',i,low:num(a.high),high:num(d.low),mid:(num(a.high)+num(d.low))/2,impulse,createdAfter:i-sweep.i,quality:clamp(45+impulse*22+Math.min(25,Math.abs(num(d.low)-num(a.high))/(atr||1)*35))});
      }
    }
    return out.sort((a,b)=>b.quality-a.quality);
  }
  function retestInfo(c,fvg,lookback=40){
    if(!fvg)return {hit:false,bar:null,rejected:false,where:'Yok'};
    let start=Math.max(fvg.i+1,c.length-lookback),hits=[];
    for(let i=start;i<c.length;i++){let p=c[i],touch=num(p.high)>=fvg.low&&num(p.low)<=fvg.high;if(touch)hits.push({i,p});}
    if(!hits.length)return {hit:false,bar:null,rejected:false,where:'Retest bekleniyor'};
    let h=hits.at(-1),p=h.p,px=num(c.at(-1).close),rejected=false;
    if(fvg.dir==='bear')rejected=num(p.high)>=fvg.mid && num(p.close)<fvg.mid && px<=fvg.mid;
    if(fvg.dir==='bull')rejected=num(p.low)<=fvg.mid && num(p.close)>fvg.mid && px>=fvg.mid;
    return {hit:true,bar:h.i,rejected,where:rejected?'Retest + rejection':'FVG içine retest'};
  }
  function chochProxy(c,dir,lookback=18){
    if(!c||c.length<12)return {ok:false,text:'Yetersiz veri',level:null};
    let seg=c.slice(-lookback),piv=pivots(seg.map(x=>x.high),seg.map(x=>x.low),2),lastClose=num(c.at(-1).close);
    if(dir==='bear'){
      let lows=piv.lo.map(x=>x.price);let lvl=lows.length?lows.at(-1):Math.min(...seg.slice(0,-1).map(x=>num(x.low)));
      let ok=Number.isFinite(lvl)&&lastClose<lvl;
      return {ok,text:ok?'Proxy CHOCH aşağı teyitli':'LTF CHOCH bekleniyor',level:lvl};
    }
    let highs=piv.hi.map(x=>x.price);let lvl=highs.length?highs.at(-1):Math.max(...seg.slice(0,-1).map(x=>num(x.high)));
    let ok=Number.isFinite(lvl)&&lastClose>lvl;
    return {ok,text:ok?'Proxy CHOCH yukarı teyitli':'LTF CHOCH bekleniyor',level:lvl};
  }
  function smcRiskPlan(c,lv,sweep,fvg,rt,choch){
    let price=num(c.at(-1).close),dir=fvg?.dir||sweep?.dir,entry=fvg?fvg.mid:price,stop=null,tp1=null,tp2=null;
    if(dir==='bear'){
      stop=sweep?.extreme || (fvg?.high||price)*1.003;
      tp1=Number.isFinite(lv.pdl)?lv.pdl:(price-(stop-price));
      tp2=Number.isFinite(lv.asianLow)?Math.min(tp1,lv.asianLow):tp1;
      let risk=Math.max(1e-12,stop-entry),reward=Math.max(0,entry-tp1),rr=reward/risk;
      return {entry,stop,tp1,tp2,rr,valid:rr>=1.5};
    }
    if(dir==='bull'){
      stop=sweep?.extreme || (fvg?.low||price)*.997;
      tp1=Number.isFinite(lv.pdh)?lv.pdh:(price+(price-stop));
      tp2=Number.isFinite(lv.asianHigh)?Math.max(tp1,lv.asianHigh):tp1;
      let risk=Math.max(1e-12,entry-stop),reward=Math.max(0,tp1-entry),rr=reward/risk;
      return {entry,stop,tp1,tp2,rr,valid:rr>=1.5};
    }
    return {entry:price,stop:null,tp1:null,tp2:null,rr:0,valid:false};
  }
  function smcStatus(sweep,fvg,rt,choch,plan){
    if(!sweep)return {status:'NO_SETUP',label:'Kurulum yok',score:25,cls:'info'};
    if(!fvg)return {status:'SWEEP_ONLY',label:'Likidite temizliği var · FVG bekleniyor',score:42,cls:'warn'};
    if(!rt.hit)return {status:'ARMED',label:(fvg.dir==='bull'?'LONG':'SHORT')+' setup armed · Retest bekleniyor',score:62,cls:'warn'};
    if(!choch.ok)return {status:'RETESTED',label:'Retest geldi · CHOCH bekleniyor',score:72,cls:'warn'};
    if(!plan.valid)return {status:'RR_BLOCK',label:'CHOCH var ama R/R yetersiz',score:68,cls:'bad'};
    return {status:'ENTRY_VALID',label:(fvg.dir==='bull'?'LONG':'SHORT')+' ENTRY VALID',score:88,cls:fvg.dir==='bull'?'good':'bad'};
  }
  window.smcAlphaEngine=function(a){
    try{
      let c=safeArr(a?.candles); if(c.length<35)return {error:'Yeterli mum yok',status:'NO_DATA',label:'SMC için veri yetersiz',score:0};
      let lv=sessionLevels(c),sweeps=detectSmcSweeps(c,lv),sweep=sweeps.at(-1)||null,fvgs=sweep?detectSmcFvgs(c,sweep,5):[],fvg=fvgs[0]||null,rt=retestInfo(c,fvg),choch=chochProxy(c,fvg?.dir||sweep?.dir),plan=smcRiskPlan(c,lv,sweep,fvg,rt,choch),stat=smcStatus(sweep,fvg,rt,choch,plan);
      let dir=fvg?.dir||sweep?.dir||'none';
      let steps=[
        {name:'HTF Likidite',ok:!!(lv.pdh&&lv.pdl),text:`PDH ${lv.pdh?'$'+fmt(lv.pdh):'-'} · PDL ${lv.pdl?'$'+fmt(lv.pdl):'-'} · Asian ${lv.asianHigh?'$'+fmt(lv.asianHigh):'-'} / ${lv.asianLow?'$'+fmt(lv.asianLow):'-'}`},
        {name:'Liquidity Sweep',ok:!!sweep,text:sweep?`${sweep.dir==='bear'?'Bearish':'Bullish'} sweep · ${sweep.levelName} · wick ${fmt(sweep.wickRatio,1)}x`:'Son 80 mumda geçerli sweep yok'},
        {name:'Displacement + FVG',ok:!!fvg,text:fvg?`${fvg.dir==='bear'?'Bearish':'Bullish'} FVG · $${fmt(fvg.low)} - $${fmt(fvg.high)} · kalite ${fmt(fvg.quality,0)}`:'Sweep sonrası 1-5 mumda güçlü FVG yok'},
        {name:'POI Retest',ok:!!rt.hit,text:rt.where},
        {name:'LTF CHOCH',ok:!!choch.ok,text:choch.text},
        {name:'R/R Filtresi',ok:!!plan.valid,text:`R/R ${fmt(plan.rr,2)} · minimum 1.5`}
      ];
      return {version:BUILD,levels:lv,sweeps,sweep,fvgs,fvg,retest:rt,choch,plan,...stat,dir,steps,decision_binding:'CONFIRMATION_LAYER',decision_weight:0,news_decision_weight:0,derivatives_decision_weight:0};
    }catch(e){return {error:e.message||String(e),status:'ERROR',label:'SMC hesaplama hatası',score:0,steps:[]}}
  };
  function smcOf(a){ if(!a)return null; if(!a.smcAlpha || a.smcAlpha._lastTime!==a.candles?.at(-1)?.time){a.smcAlpha=smcAlphaEngine(a);a.smcAlpha._lastTime=a.candles?.at(-1)?.time;} return a.smcAlpha; }
  function smcPill(s){let cls=s?.cls||'info';return `<span class="pill ${cls==='good'?'long':cls==='bad'?'short':cls==='warn'?'wait':''}">${esc(s?.label||'-')}</span>`}
  function smcMiniCard(a){let s=smcOf(a);return `<div class="card"><h3>SMC Alpha Engine <span class="pill">OHLCV · Karar Onay Katmanı</span></h3><div class="omniSignalBig"><div><div class="sig ${s.cls==='good'?'green':s.cls==='bad'?'red':'yellow'}">${esc(s.status||'-')}</div><div class="sub">${esc(s.label||'-')}</div></div><div class="score">${fmt(s.score||0,0)}</div></div><div style="margin-top:10px">${safeArr(s.steps).map(x=>`<div class="kv"><span>${esc(x.name)}<br><small class="muted">${esc(x.text)}</small></span><b class="${x.ok?'green':'yellow'}">${x.ok?'OK':'WAIT'}</b></div>`).join('')}</div>${s.fvg?`<div class="paHint" style="margin-top:10px">POI: ${s.fvg.dir==='bull'?'Bullish':'Bearish'} FVG $${fmt(s.fvg.low)} - $${fmt(s.fvg.high)} · Entry $${fmt(s.plan.entry)} · Stop $${fmt(s.plan.stop)} · TP1 $${fmt(s.plan.tp1)} · R/R ${fmt(s.plan.rr,2)}</div>`:''}<p class="sub" style="margin-top:8px">SMC Alpha final LONG/SHORT kararını override etmez. OHLCV Core ile aynı yönde ise setup kalitesi güçlenir; ters yönde ise ekranda conflict olarak izlenir.</p></div>`}
  function smcConflictText(a){let s=smcOf(a); if(!s||!s.dir||s.dir==='none')return 'SMC setup yok.'; let core=String(a.signal||''); let same=(s.dir==='bull'&&core.includes('LONG'))||(s.dir==='bear'&&core.includes('SHORT')); if(s.status==='ENTRY_VALID'&&same)return 'OHLCV Core ve SMC Alpha aynı yönde: güçlü teyit.'; if(s.status==='ENTRY_VALID'&&!same)return 'SMC Alpha ile OHLCV Core yönü çelişiyor: dikkat / bekle.'; return s.label||'-';}
  function smcTable(rows){rows=safeArr(rows);let cols=[
    {key:'symbol',label:'Coin',val:r=>r.symbol,html:r=>`<span class="sym">${esc(r.symbol)}</span>`},
    {key:'status',label:'SMC Durum',val:r=>smcOf(r)?.score||0,html:r=>smcPill(smcOf(r))},
    {key:'dir',label:'Yön',val:r=>smcOf(r)?.dir||'',html:r=>{let d=smcOf(r)?.dir;return d==='bull'?'<span class="green">LONG</span>':d==='bear'?'<span class="red">SHORT</span>':'-'}},
    {key:'sweep',label:'Sweep',val:r=>smcOf(r)?.sweep?.levelName||'',html:r=>{let s=smcOf(r)?.sweep;return s?`${esc(s.levelName)} · ${fmt(s.wickRatio,1)}x`:'-'}},
    {key:'fvg',label:'FVG',val:r=>smcOf(r)?.fvg?.quality||0,html:r=>{let s=smcOf(r);return s?.fvg?`$${fmt(s.fvg.low)} - $${fmt(s.fvg.high)} · Q${fmt(s.fvg.quality,0)}`:'-'}},
    {key:'choch',label:'CHOCH',val:r=>smcOf(r)?.choch?.ok?1:0,html:r=>smcOf(r)?.choch?.ok?'<span class="green">OK</span>':'<span class="yellow">Bekliyor</span>'},
    {key:'rr',label:'R/R',val:r=>smcOf(r)?.plan?.rr||0,html:r=>fmt(smcOf(r)?.plan?.rr||0,2)},
    {key:'core',label:'OHLCV Core',val:r=>r.signal||'',html:r=>sigP(r.signal)},
    {key:'conflict',label:'Not',val:r=>smcConflictText(r),html:r=>esc(smcConflictText(r))}
  ];
  return smartTable?smartTable(rows,cols,'smc_alpha_table','status','desc',(r)=>`st.sel='${r.symbol}';st.page='smc';render()`):`<table><tbody>${rows.map(r=>`<tr><td>${r.symbol}</td><td>${smcOf(r)?.label}</td></tr>`).join('')}</tbody></table>`;
  }
  function smcPage(){
    let rows=getRows?getRows():Object.values(st.rows||{}),a=st.rows?.[st.sel]||rows[0]; if(a)setTimeout(()=>drawChart('smcChart',a,true),60);
    let valid=rows.filter(r=>smcOf(r)?.status==='ENTRY_VALID'),armed=rows.filter(r=>['ARMED','RETESTED'].includes(smcOf(r)?.status));
    return `<div class="grid cards">${metric('Entry Valid',valid.length,'CHOCH + R/R teyitli',rows.length?valid.length/rows.length*100:0,'#16f08b')}${metric('Armed / Retest',armed.length,'POI bekleyen setup',rows.length?armed.length/rows.length*100:0,'#ffd166')}${metric('Selected SMC',esc(smcOf(a)?.status||'-'),esc(a?.symbol||'-'),smcOf(a)?.score||0,'#22d3ee')}${metric('News Weight','0%','Haber karar dışı',0,'#60a5fa')}${metric('Derivatives Weight','0%','Funding/OI/orderbook dışı',0,'#a78bfa')}</div><div class="split" style="margin-top:14px"><div class="card"><h3>${esc(a?.symbol||'-')} SMC Alpha Chart</h3><div class="chart omniHeroChart"><canvas id="smcChart"></canvas></div></div><div>${a?smcMiniCard(a):'<div class="card">Veri yok</div>'}</div></div><div class="card" style="margin-top:14px"><h3>SMC Alpha Radar</h3><p class="sub">Sıralama: liquidity sweep → FVG/displacement → retest → CHOCH → R/R. Final OHLCV Core kararını bozmaz; setup onay katmanı olarak çalışır.</p>${smcTable(rows)}</div>`;
  }
  function ensureSmcMenu(){
    try{
      if(Array.isArray(pages)&&!pages.some(p=>p[0]==='smc'))pages.splice(10,0,['smc','SMC Alpha']);
      if(Array.isArray(navGroups)){
        let g=navGroups.find(x=>x[0]==='Price Action');
        if(g&&!g[1].includes('smc'))g[1].splice(1,0,'smc');
      }
      if(typeof PAGE_RENDERERS!=='undefined')PAGE_RENDERERS.smc=()=>smcPage();
    }catch(e){console.warn('SMC menu patch',e)}
  }
  const _oldApplyOhlcv = window.applyOhlcvCore;
  if(typeof analyze==='function'){
    const _prevAnalyze=analyze;
    analyze=function(...args){let a=_prevAnalyze(...args);try{a.smcAlpha=smcAlphaEngine(a);a.field=a.field||{};a.field.smcAlphaScore=a.smcAlpha.score||0;a.field.smcAlphaStatus=a.smcAlpha.status||'NO_SETUP';if(a.smcAlpha.status==='ENTRY_VALID'){let same=(a.smcAlpha.dir==='bull'&&String(a.signal).includes('LONG'))||(a.smcAlpha.dir==='bear'&&String(a.signal).includes('SHORT'));(same?a.reasons.positive:a.reasons.negative).unshift(`SMC Alpha: ${a.smcAlpha.label}`)}}catch(e){}return a;}
  }
  // Dashboard and detail cards: wrap existing renderers without breaking premium cockpit.
  function patchPages(){
    ensureSmcMenu();
    if(typeof PAGE_RENDERERS==='undefined')return;
    const oldDash=PAGE_RENDERERS.dashboard;
    PAGE_RENDERERS.dashboard=()=>{
      let html=oldDash?oldDash():'';
      let rows=Object.values(st.rows||{}); let valid=rows.filter(r=>smcOf(r)?.status==='ENTRY_VALID').slice(0,5); let armed=rows.filter(r=>['ARMED','RETESTED'].includes(smcOf(r)?.status)).slice(0,5);
      let box=`<div class="card" style="margin-top:14px"><h3>SMC Alpha Radar <span class="pill">OHLCV · Haber 0%</span></h3><div class="split2"><div><b class="green">Entry Valid</b>${valid.map(r=>`<div class="kv"><span>${esc(r.symbol)}<br><small class="muted">${esc(smcOf(r).label)}</small></span><b>${fmt(smcOf(r).score,0)}</b></div>`).join('')||'<div class="sub">Yok</div>'}</div><div><b class="yellow">Armed / Retest</b>${armed.map(r=>`<div class="kv"><span>${esc(r.symbol)}<br><small class="muted">${esc(smcOf(r).label)}</small></span><b>${fmt(smcOf(r).score,0)}</b></div>`).join('')||'<div class="sub">Yok</div>'}</div></div><button class="btn" onclick="go('smc')" style="margin-top:10px">SMC Alpha Panelini Aç</button></div>`;
      return html+box;
    };
    const oldDetail=PAGE_RENDERERS.detail;
    PAGE_RENDERERS.detail=()=>{let html=oldDetail?oldDetail():'';let a=st.rows?.[st.sel];return html+(a?`<div style="margin-top:14px">${smcMiniCard(a)}</div>`:'');};
  }
  const _oldDraw=typeof drawChart==='function'?drawChart:null;
  drawChart=function(id,a,rich=false){
    if(_oldDraw)_oldDraw(id,a,rich); if(!rich||!a?.candles?.length)return;
    try{
      let s=smcOf(a),cn=document.getElementById(id); if(!cn||!s)return; let ctx=cn.getContext('2d'),r=cn.getBoundingClientRect(),c=a.candles,u=st.ui?.mode||'pro',count=u==='clean'?96:u==='full'?180:130,data=last(c,count),levels=a.levels||{},plan=a.plan||{};
      let extras=[s.levels?.pdh,s.levels?.pdl,s.levels?.asianHigh,s.levels?.asianLow,s.fvg?.low,s.fvg?.high,s.plan?.entry,s.plan?.stop,s.plan?.tp1,...(levels.resistances||[]).slice(0,3).map(x=>x.price),...(levels.supports||[]).slice(0,3).map(x=>x.price),plan.tp2,plan.stop].filter(v=>Number.isFinite(+v));
      let hi=Math.max(...data.map(x=>num(x.high)),...extras),lo=Math.min(...data.map(x=>num(x.low)),...extras),spread=(hi-lo)||1;hi+=spread*.08;lo-=spread*.08;let padL=46,padR=72,padT=26,padB=46,volH=st.ui?.overlays?.volume?56:0;let y=v=>r.height-padB-volH-(v-lo)/(hi-lo||1)*(r.height-padT-padB-volH);let x0=padL,x1=r.width-padR;
      function line(v,col,label){if(!Number.isFinite(+v))return;let yy=y(v);if(yy<padT||yy>r.height-padB) return;ctx.save();ctx.strokeStyle=col;ctx.setLineDash([4,5]);ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(2,6,12,.78)';let tw=ctx.measureText(label).width+12;ctx.fillRect(x0+4,yy-10,tw,18);ctx.fillStyle=col;ctx.font='10px ui-monospace,Consolas,monospace';ctx.fillText(label,x0+10,yy+3);ctx.restore();}
      line(s.levels?.pdh,'#ff4d67','PDH'); line(s.levels?.pdl,'#16f08b','PDL'); line(s.levels?.asianHigh,'#f59e0b','Asian H'); line(s.levels?.asianLow,'#22d3ee','Asian L');
      if(s.fvg){let y1=y(s.fvg.high),y2=y(s.fvg.low);ctx.save();ctx.fillStyle=s.fvg.dir==='bull'?'rgba(22,240,139,.12)':'rgba(255,77,103,.12)';ctx.strokeStyle=s.fvg.dir==='bull'?'rgba(22,240,139,.6)':'rgba(255,77,103,.6)';ctx.fillRect(x0,Math.min(y1,y2),x1-x0,Math.abs(y2-y1));ctx.strokeRect(x0,Math.min(y1,y2),x1-x0,Math.abs(y2-y1));ctx.fillStyle='#e5eefb';ctx.font='10px ui-monospace,Consolas,monospace';ctx.fillText('SMC FVG',x0+8,Math.min(y1,y2)+13);ctx.restore();}
    }catch(e){}
  };
  // Build labels
  try{document.querySelectorAll('h2').forEach(h=>{if(h.textContent.includes('OMNINOMICS PREMIUM TRADE COCKPIT'))h.textContent='OMNINOMICS PREMIUM TRADE COCKPIT v5.1.6';});}catch{}
  patchPages();
  console.log('OMNINOMICS v5.1.6 SMC Alpha Engine loaded');
})();

