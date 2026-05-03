
/* ===================== OMNINOMICS v5.1.6 Premium Cockpit + Real Turkish News Patch ===================== */
(function(){
  const UIKEY="omni_v511_premium_ui";
  const DEFAULT_UI={mode:"pro",overlays:{zones:true,sr:true,vwap:true,ema:true,bb:false,plan:true,volume:true,labels:true},newsSource:"free-tr",newsLang:"tr"};
  function ui(){
    if(!st.ui){try{st.ui={...DEFAULT_UI,...JSON.parse(localStorage.getItem(UIKEY)||"{}")};st.ui.overlays={...DEFAULT_UI.overlays,...(st.ui.overlays||{})}}catch{st.ui=JSON.parse(JSON.stringify(DEFAULT_UI));}}
    return st.ui;
  }
  function saveUi(){try{localStorage.setItem(UIKEY,JSON.stringify(st.ui||DEFAULT_UI))}catch{}}
  function cssClassSignal(sig){sig=String(sig||"");return sig.includes("LONG")?"good":sig.includes("SHORT")?"bad":sig.includes("WAIT")?"warn":"info"}
  function niceSig(sig){sig=String(sig||"NO_TRADE");return sig.replace("STRONG_","").replace("NO_TRADE","WAIT").replace("_"," ")}
  function statusPill(label,value,cls="info"){return `<div class="omniStatusPill ${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`}
  function mini(label,value,sub,cls="info"){return `<div class="omniMiniCard ${cls}"><span>${esc(label)}</span><b class="${cls==='good'?'green':cls==='bad'?'red':cls==='warn'?'yellow':'cyan'}">${value}</b><small>${esc(sub||"")}</small></div>`}
  function rowClassFromText(t){t=String(t||"").toLowerCase(); if(/war|attack|sanction|hack|exploit|halt|liquidation|crash|short|bearish|risk|sec|probe|lawsuit/.test(t))return"bear"; if(/approve|approval|etf inflow|bullish|rally|surge|long|record|partnership|listing/.test(t))return"bull"; if(/fed|cpi|inflation|rate|oil|treasury|auction|macro|warning|alert/.test(t))return"warn"; return"info";}
  function getRows(){return Object.values(st.rows||{}).filter(Boolean)}
  function getBtc(){return st.rows?.BTCUSDT||getRows()[0]}
  function marketBreadth(){let rows=getRows(); if(!rows.length)return 0; return rows.filter(r=>(r.change||0)>0).length/rows.length*100}
  function buildStatusBar(){
    let btc=getBtc(), rows=getRows(), live=rows.filter(r=>String(r.source||"").startsWith("LIVE")).length, b=marketBreadth();
    let sig=btc?.signal||"NO_TRADE", conf=Math.max(btc?.longQ||0,btc?.shortQ||0,btc?.field?.ohlcvQuality||0);
    let reg=btc?.state||"-", px=btc?.price?"$"+fmt(btc.price):"-", ch=pct(btc?.change||0);
    return `<div class="omniStatusBar" id="omniStatusBar">
      ${statusPill("BTC",px,btc?.change>=0?"good":"bad")}
      ${statusPill("24H",ch,btc?.change>=0?"good":"bad")}
      ${statusPill("REGIME",reg,reg==="RANGING"||reg==="COMPRESSION"?"warn":"info")}
      ${statusPill("SIGNAL",niceSig(sig),cssClassSignal(sig))}
      ${statusPill("CONFIDENCE",fmt(conf,0)+" / 100",conf>70?"good":conf>55?"warn":"info")}
      ${statusPill("BREADTH",fmt(b,0)+"%",b>55?"good":b<45?"bad":"warn")}
      ${statusPill("DATA",`${live}/${rows.length} LIVE`,live===rows.length?"good":live?"warn":"bad")}
      ${statusPill("ENGINE","OHLCV CORE","info")}
    </div>`;
  }
  function newsUnavailableItem(){
    return [{
      source:"DURUM",
      provider:"Status",
      title:"Canlı haber alınamadı veya kaynaklar boş döndü.",
      description: st.newsNote || "Bu satır haber değildir; yalnızca veri durumu bilgisidir. Haber akışı karar motoruna bağlı değildir.",
      created_at:new Date().toISOString(),
      severity:"warn",
      display_only:true,
      decision_weight:0,
      status_only:true
    }];
  }
  async function loadNews(force=false){
    if(st.newsLoading&&!force)return; let now=Date.now(); if(!force&&st.newsLoadedAt&&now-st.newsLoadedAt<90000)return;
    st.newsLoading=true;
    try{
      let r=await fetch(`/api/news?source=free&displayOnly=1&lang=tr&symbol=${encodeURIComponent(st.sel||"BTCUSDT")}`);
      let j=await r.json();
      if(!r.ok||j.error)throw new Error(j.error||"news error");
      st.newsAvailable=!!j.news_available;
      st.premiumNews=(Array.isArray(j.items)?j.items:[]).filter(n=>!n.status_only).slice(0,18);
      st.newsProvider=j.provider||"none"; st.newsLang=j.language||"tr"; st.newsTranslationProvider=j.translation_provider||"none"; st.newsTranslationEnabled=!!j.translation_enabled; st.newsNote=j.note||"";
    }catch(e){st.newsAvailable=false; st.premiumNews=[]; st.newsProvider="error"; st.newsNote=e.message||String(e);}
    st.newsLoadedAt=now; st.newsLoading=false; premiumPostRender();
  }
  function newsTitle(n){return n.title_display||n.title_tr||n.title||n.text||""}
  function newsDesc(n){return n.description_display||n.description_tr||n.description||n.summary||""}
  function newsTicker(){
    let real=(st.premiumNews&&st.premiumNews.length)?st.premiumNews:[];
    let items=real.length?real:newsUnavailableItem();
    let label=real.length?"● TÜRKÇE HABER":"● HABER DURUMU";
    let doubled=items.concat(items).map(n=>`<span class="omniTickerItem ${n.status_only?'warn':rowClassFromText((n.title_original||n.title||n.text||"")+" "+(n.description_original||n.description||""))}"><span class="src">${esc(n.source||n.provider||"HABER")}</span>${esc(newsTitle(n))}</span>`).join("");
    return `<div class="omniNewsTicker" id="omniNewsTicker"><div class="label">${label}</div><div class="omniTickerTrack">${doubled}</div></div>`;
  }
  function mountShell(){
    ui();
    let top=document.querySelector(".top"); if(top){let h=top.querySelector(".title h2"); if(h)h.textContent="OMNINOMICS PREMIUM TRADE COCKPIT v5.1.7"; let s=top.querySelector(".title span"); if(s)s.textContent="Price Action Dominant · SMC Alpha · OHLCV Support · Türkçe Haber İzleme · Karar Dışı · Başlık + Açıklama · Karar Dışı";}
    let brand=document.querySelector(".brand p"); if(brand)brand.textContent="Premium Trade Cockpit v5.1.7 PA Dominant";
    let rb=document.getElementById("refresh"); if(rb&&window.refresh) rb.onclick=window.refresh;
    let main=document.querySelector("main"); if(!main)return;
    if(!document.getElementById("omniStatusMount")){let d=document.createElement("div");d.id="omniStatusMount";main.insertBefore(d,document.getElementById("view"));}
    if(!document.getElementById("omniTickerMount")){let d=document.createElement("div");d.id="omniTickerMount";main.insertBefore(d,document.getElementById("view"));}
  }
  function premiumPostRender(){
    mountShell(); let sm=document.getElementById("omniStatusMount"), tm=document.getElementById("omniTickerMount");
    if(sm)sm.innerHTML=buildStatusBar(); if(tm)tm.innerHTML=newsTicker();
  }
  const oldRender=render;
  render=function(){oldRender(); premiumPostRender(); if(!st.newsLoadedAt)loadNews(false);};
  const oldRefresh=window.refresh || refresh;
  if(typeof oldRefresh==="function"){
    window.refresh=async function(...args){let out=await oldRefresh(...args); loadNews(true); return out;};
    try{refresh=window.refresh}catch{}
  }
  window.omniToggleOverlay=function(k){let u=ui();u.overlays[k]=!u.overlays[k];saveUi();render();};
  window.omniSetChartMode=function(m){ui().mode=m;saveUi();render();};
  function toggles(){let u=ui(), o=u.overlays; let labs=[['zones','Zones'],['sr','S/R'],['vwap','VWAP'],['ema','EMA'],['bb','BB'],['plan','Plan'],['volume','Volume'],['labels','Labels']]; return `<div class="omniToggleRow">${labs.map(x=>`<button class="omniToggle ${o[x[0]]?'active':''}" onclick="omniToggleOverlay('${x[0]}')">${x[1]}</button>`).join("")}<span style="width:8px"></span>${['clean','pro','full'].map(m=>`<button class="omniModeBtn ${u.mode===m?'active':''}" onclick="omniSetChartMode('${m}')">${m.toUpperCase()}</button>`).join("")}</div>`}
  function signalReasons(a){
    let f=a?.field||{}, rs=[];
    if((a.signal||"").includes("LONG"))rs.push(["good","Yön long lehine; momentum ve yapı yukarı tarafa baskı veriyor."]); else if((a.signal||"").includes("SHORT"))rs.push(["bad","Yön short lehine; fiyat yapısı aşağı baskıyı destekliyor."]); else rs.push(["warn","Net trade yok; sistem beklemeyi daha sağlıklı görüyor."]);
    if((f.adx||0)>25)rs.push(["good",`ADX ${fmt(f.adx,0)}: trend gücü yeterli.`]); else rs.push(["warn",`ADX ${fmt(f.adx||0,0)}: trend zayıf/kararsız olabilir.`]);
    if((f.whipsaw||0)>65)rs.push(["bad",`Whipsaw ${fmt(f.whipsaw,0)}: fake hareket riski yüksek.`]); else rs.push(["good",`Whipsaw ${fmt(f.whipsaw||0,0)}: grafik okunabilirliği makul.`]);
    if((f.vc||0)>55)rs.push(["good",`Hacim skoru ${fmt(f.vc,0)}: teyit fena değil.`]); else rs.push(["warn",`Hacim skoru ${fmt(f.vc||0,0)}: teyit zayıf kalabilir.`]);
    if((f.contradiction||0)>55)rs.push(["bad",`Çelişki ${fmt(f.contradiction,0)}: sinyal boyutu düşürülmeli.`]);
    return rs.slice(0,6).map(r=>`<div class="omniReason ${r[0]}">${esc(r[1])}</div>`).join("");
  }
  function zonesHtml(a){let ns=a?.levels?.nearestSupport, nr=a?.levels?.nearestResistance, p=a?.price||0; let arr=[]; if(nr)arr.push(["Direnç Bölgesi",`$${fmt(nr.price)} · %${fmt((nr.price-p)/p*100,2)} yukarı`,"bad"]); if(ns)arr.push(["Destek Bölgesi",`$${fmt(ns.price)} · %${fmt((p-ns.price)/p*100,2)} aşağı`,"good"]); if(a?.plan){arr.push(["Stop",`$${fmt(a.plan.stop)}`,"bad"]);arr.push(["TP1 / TP2",`$${fmt(a.plan.tp1)} / $${fmt(a.plan.tp2)}`,"good"])} return `<div class="omniZoneList">${arr.map(x=>`<div class="omniZoneItem"><b class="${x[2]==='good'?'green':'red'}">${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join("")||'<div class="sub">Seviye yok.</div>'}</div>`}
  function newsPanel(limit=7){let real=(st.premiumNews&&st.premiumNews.length)?st.premiumNews:[];let items=(real.length?real:newsUnavailableItem()).slice(0,limit);let tp=st.newsTranslationEnabled?`çeviri: ${st.newsTranslationProvider||"aktif"}`:`çeviri: kapalı/anahtar yok`;let provider=st.newsProvider||"none";let status=real.length?`Kaynak: ${esc(provider)}`:`Canlı haber yok / kaynaklar boş`;return `<div class="paHint" style="margin-bottom:10px">Haber akışı <b>karar dışı</b>: LONG/SHORT/WAIT skoruna etkisi 0%. Sadece gerçek haber kaynaklarından gelen başlıklar gösterilir; sistem notları haber gibi akmaz. ${status} · ${esc(tp)}</div><div class="omniNewsPanel">${items.map(n=>{let original=(n.title_original&&n.title_original!==newsTitle(n))?`<div class="original">Orijinal: ${esc(n.title_original)}</div>`:"";let cls=n.status_only?'warn':rowClassFromText((n.title_original||n.title||n.text||"")+" "+(n.description_original||n.description||""));let when=n.created_at?new Date(n.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}):'';let link=n.url?`<a href="${esc(n.url)}" target="_blank" rel="noreferrer" class="title">${esc(newsTitle(n)||'-')}</a>`:`<div class="title">${esc(newsTitle(n)||'-')}</div>`;return `<div class="omniNewsRow ${cls}"><div class="meta"><span>${esc(n.source||n.provider||'HABER')}</span><span>${esc(when)} · karar 0%</span></div>${link}<div class="desc">${esc(newsDesc(n)||'Açıklama yok.')}</div>${original}</div>`}).join("")}</div>${!real.length?`<div class="paHint" style="margin-top:10px">Debug: ${esc(st.newsNote||'Haber endpointi gerçek başlık döndürmedi. Vercel Functions loglarını kontrol et.')}</div>`:''}`}
  function premiumDetail(){let a=st.rows[st.sel]; if(!a)return `<div class="card">Veri yok.</div>`; setTimeout(()=>drawChart("premiumChart",a,true),60);let sig=niceSig(a.signal), q=Math.max(a.longQ||0,a.shortQ||0,a.field?.ohlcvQuality||0);return `<div class="omniCockpit"><div class="card"><div class="omniChartHeader"><div class="omniChartTitle"><b>${esc(a.symbol)} · ${esc(st.tf)} Premium Chart</b><span>Clean zones + OHLCV karar motoru · Funding/OI/orderbook karar dışı</span></div>${toggles()}</div><div class="chart omniHeroChart"><canvas id="premiumChart"></canvas></div></div><div class="grid"><div class="card omniWhyCard"><h3>Karar Özeti</h3><div class="omniSignalBig"><div><div class="sig ${cssClassSignal(a.signal)==='good'?'green':cssClassSignal(a.signal)==='bad'?'red':'yellow'}">${esc(sig)}</div><div class="sub">${esc(a.state||'-')} · ${a.price?'$'+fmt(a.price):'-'} · ${pct(a.change||0)}</div></div><div class="score">${fmt(q,0)}</div></div><h3 style="margin-top:14px">Neden?</h3>${signalReasons(a)}<h3 style="margin-top:14px">Trade Bölgeleri</h3>${zonesHtml(a)}</div><div class="card"><h3>Türkçe Haber Akışı <span class="pill">Karar Dışı · 0%</span></h3>${newsPanel(6)}</div></div></div><div class="omniDashGrid" style="margin-top:14px">${mini('OHLCV Q',fmt(a.field?.ohlcvQuality||q,0),'Final kalite','info')}${mini('ADX',fmt(a.field?.adx||0,0),'Trend gücü',(a.field?.adx||0)>25?'good':'warn')}${mini('Whipsaw',fmt(a.field?.whipsaw||0,0),'Fake hareket riski',(a.field?.whipsaw||0)>65?'bad':'good')}${mini('Volume',fmt(a.field?.vc||0,0),'Hacim teyidi',(a.field?.vc||0)>55?'good':'warn')}${mini('Long Q',fmt(a.longQ||0,0),'Long skor','good')}${mini('Short Q',fmt(a.shortQ||0,0),'Short skor','bad')}</div>`}
  detail=premiumDetail; if(typeof PAGE_RENDERERS!=="undefined")PAGE_RENDERERS.detail=()=>premiumDetail();
  function premiumDashboard(){let rows=getRows(), a=st.rows[st.sel]||getBtc(); if(a)setTimeout(()=>drawChart("dashPremiumChart",a,true),60); let live=rows.filter(r=>String(r.source||"").startsWith("LIVE")).length, bestL=[...rows].sort((x,y)=>(y.longQ||0)-(x.longQ||0))[0], bestS=[...rows].sort((x,y)=>(y.shortQ||0)-(x.shortQ||0))[0];return `<div class="omniDashGrid">${mini('Live Data',`${live}/${rows.length}`,'Veri sağlığı',live===rows.length?'good':live?'warn':'bad')}${mini('BTC Regime',esc(getBtc()?.state||'-'),'Ana piyasa fazı','info')}${mini('Market Breadth',fmt(marketBreadth(),0)+'%','Pozitif coin oranı',marketBreadth()>55?'good':marketBreadth()<45?'bad':'warn')}${mini('Best Long',esc(bestL?.symbol||'-'),fmt(bestL?.longQ||0,0)+' skor','good')}${mini('Best Short',esc(bestS?.symbol||'-'),fmt(bestS?.shortQ||0,0)+' skor','bad')}${mini('Selected',esc(st.sel),esc(st.tf),'info')}</div><div class="omniCockpit"><div class="card"><div class="omniChartHeader"><div class="omniChartTitle"><b>${esc(st.sel)} Live Decision Chart</b><span>En kritik 3 şey: rejim · yön · seviye</span></div>${toggles()}</div><div class="chart omniHeroChart"><canvas id="dashPremiumChart"></canvas></div></div><div class="grid"><div class="card omniWhyCard"><h3>Karar Motoru</h3>${a?`<div class="omniSignalBig"><div><div class="sig ${cssClassSignal(a.signal)==='good'?'green':cssClassSignal(a.signal)==='bad'?'red':'yellow'}">${esc(niceSig(a.signal))}</div><div class="sub">${esc(a.symbol)} · ${pct(a.change||0)} · ${esc(a.state||'-')}</div></div><div class="score">${fmt(Math.max(a.longQ||0,a.shortQ||0,a.field?.ohlcvQuality||0),0)}</div></div>${signalReasons(a)}<h3 style="margin-top:14px">Bölgeler</h3>${zonesHtml(a)}`:'Veri yok'}</div><div class="card"><h3>Türkçe Haber İzleme · Karar Dışı</h3>${newsPanel(7)}</div></div></div><div class="split" style="margin-top:14px"><div class="card"><h3>Coin Tablosu</h3><div class="omniTableWrap">${table(rows.sort((x,y)=>(y.field?.ohlcvQuality||0)-(x.field?.ohlcvQuality||0)))}</div></div><div class="card"><h3>Fırsat Radar</h3>${opportunityMini()}</div></div>`;}
  dashboard=premiumDashboard; if(typeof PAGE_RENDERERS!=="undefined")PAGE_RENDERERS.dashboard=()=>premiumDashboard();
  function enhancedHline(ctx,y,w,col,txt,alpha=.95){ctx.save();ctx.strokeStyle=col;ctx.globalAlpha=alpha;ctx.setLineDash([6,7]);ctx.beginPath();ctx.moveTo(42,y);ctx.lineTo(w-54,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="rgba(3,7,12,.72)";let tw=ctx.measureText(txt).width+14;ctx.fillRect(w-54-tw,y-10,tw,20);ctx.fillStyle=col;ctx.font="10px ui-monospace,Consolas,monospace";ctx.fillText(txt,w-48-tw,y+4);ctx.restore();}
  drawChart=function(id,a,rich=false){let cn=$(id);if(!cn||!a?.candles?.length)return;let c=a.candles,ctx=cn.getContext("2d"),r=cn.getBoundingClientRect(),d=window.devicePixelRatio||1;cn.width=r.width*d;cn.height=r.height*d;ctx.scale(d,d);ctx.clearRect(0,0,r.width,r.height);let u=ui(), mode=u.mode||"pro", o=u.overlays||{};let count=mode==="clean"?96:mode==="full"?180:130;let data=last(c,count),off=c.length-data.length,t=a.tech||technicals(c);let supports=(a.levels?.supports||[]).slice(0,mode==="clean"?1:3),res=(a.levels?.resistances||[]).slice(0,mode==="clean"?1:3);let plan=a.plan||{};let hi=Math.max(...data.map(x=>x.high),...res.map(x=>x.price),plan.tp2||0,plan.tp3||0);let lo=Math.min(...data.map(x=>x.low),...supports.map(x=>x.price),plan.stop||Infinity);let spread=(hi-lo)||1;hi+=spread*.08;lo-=spread*.08;let padL=46,padR=72,padT=26,padB=46,volH=o.volume?56:0;let x=i=>padL+i*(r.width-padL-padR)/(Math.max(1,data.length-1)), y=v=>r.height-padB-volH-(v-lo)/(hi-lo||1)*(r.height-padT-padB-volH);let grad=ctx.createLinearGradient(0,0,0,r.height);grad.addColorStop(0,"#07131e");grad.addColorStop(1,"#03070d");ctx.fillStyle=grad;ctx.fillRect(0,0,r.width,r.height);ctx.strokeStyle="rgba(120,160,210,.10)";ctx.lineWidth=1;for(let i=0;i<6;i++){let yy=padT+i*(r.height-padT-padB-volH)/5;ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(r.width-padR,yy);ctx.stroke();let val=hi-(hi-lo)*i/5;ctx.fillStyle="rgba(190,210,235,.55)";ctx.font="10px ui-monospace,Consolas,monospace";ctx.fillText("$"+fmt(val),r.width-padR+8,yy+4)}for(let i=0;i<6;i++){let xx=padL+i*(r.width-padL-padR)/5;ctx.beginPath();ctx.moveTo(xx,padT);ctx.lineTo(xx,r.height-padB);ctx.stroke()}
    if(rich&&o.zones){let atr=a.levels?.atr||((hi-lo)*.015);supports.forEach(l=>{let y1=y(l.price+atr*.35),y2=y(l.price-atr*.35);ctx.fillStyle="rgba(22,240,139,.075)";ctx.fillRect(padL,Math.min(y1,y2),r.width-padL-padR,Math.abs(y2-y1));});res.forEach(l=>{let y1=y(l.price+atr*.35),y2=y(l.price-atr*.35);ctx.fillStyle="rgba(255,77,103,.075)";ctx.fillRect(padL,Math.min(y1,y2),r.width-padL-padR,Math.abs(y2-y1));});}
    if(o.volume){let maxV=Math.max(...data.map(p=>p.volume||0),1);data.forEach((p,i)=>{let xx=x(i),bw=Math.max(2,(r.width-padL-padR)/data.length*.55),vh=(p.volume||0)/maxV*volH;ctx.fillStyle=p.close>=p.open?"rgba(22,240,139,.20)":"rgba(255,77,103,.20)";ctx.fillRect(xx-bw/2,r.height-padB-vh,bw,vh);});}
    data.forEach((p,i)=>{let xx=x(i),up=p.close>=p.open,col=up?"#16f08b":"#ff4d67",bw=Math.max(2,(r.width-padL-padR)/data.length*.58);ctx.strokeStyle=col;ctx.globalAlpha=.95;ctx.beginPath();ctx.moveTo(xx,y(p.low));ctx.lineTo(xx,y(p.high));ctx.stroke();ctx.fillStyle=col;let yo=y(Math.max(p.open,p.close)),hh=Math.max(1,Math.abs(y(p.open)-y(p.close)));ctx.fillRect(xx-bw/2,yo,bw,hh);});ctx.globalAlpha=1;
    function slice(arr){return (arr||[]).slice(off)}
    if(rich&&o.bb&&mode!=="clean"){drawLine(ctx,slice(t.boll?.up||[]),x,y,"rgba(99,135,190,.56)",1);drawLine(ctx,slice(t.boll?.lo||[]),x,y,"rgba(99,135,190,.56)",1)}
    if(rich&&o.ema&&mode!=="clean"){drawLine(ctx,slice(t.ema20||[]),x,y,"#22d3ee",1.5);drawLine(ctx,slice(t.ema50||[]),x,y,"#a78bfa",1.2);if(mode==="full")drawLine(ctx,slice(t.ema200||[]),x,y,"#ffd166",1.15)}
    if(rich&&o.vwap)drawLine(ctx,slice(t.vwap||[]),x,y,"#f8d36a",1.5);
    if(rich&&o.sr){supports.forEach(l=>enhancedHline(ctx,y(l.price),r.width,"#16f08b",`S ${fmt(l.price)}`,.9));res.forEach(l=>enhancedHline(ctx,y(l.price),r.width,"#ff4d67",`R ${fmt(l.price)}`,.9));}
    if(rich&&o.plan&&plan.stop){enhancedHline(ctx,y(plan.stop),r.width,"#ff4d67","SL",.88);enhancedHline(ctx,y(plan.tp1),r.width,"#16f08b","TP1",.88);if(mode!=="clean")enhancedHline(ctx,y(plan.tp2),r.width,"#16f08b","TP2",.72)}
    let lastP=data.at(-1)?.close; if(lastP){ctx.strokeStyle="rgba(255,255,255,.42)";ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(padL,y(lastP));ctx.lineTo(r.width-padR,y(lastP));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="rgba(34,211,238,.92)";ctx.fillRect(r.width-padR+6,y(lastP)-11,62,22);ctx.fillStyle="#031018";ctx.font="11px ui-monospace,Consolas,monospace";ctx.fillText(fmt(lastP),r.width-padR+10,y(lastP)+4)}
    ctx.fillStyle="rgba(230,242,255,.82)";ctx.font="12px ui-monospace,Consolas,monospace";ctx.fillText(`${a.symbol} · ${st.tf} · ${niceSig(a.signal)} · Q ${fmt(a.field?.ohlcvQuality||Math.max(a.longQ||0,a.shortQ||0),0)}`,padL,padT-8);
  };
  setInterval(()=>loadNews(false),120000);
  window.loadNews=loadNews;
  console.log("OMNINOMICS v5.1.6 Premium Cockpit UI + Turkish News loaded");
})();
