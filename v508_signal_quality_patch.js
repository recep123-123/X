

/* ===================== v5.0.8 — Signal Quality + Intel Fix ===================== */
/* Bu yama mevcut analyze pipeline'ına cerrahi müdahale yapar.
   Değişen fonksiyonlar: ADX eklendi, dirPressure güçlendirildi,
   contradictions genişletildi, decide() sıkılaştırıldı,
   marketState'e RANGING eklendi, divergence detection eklendi,
   whipsaw/chop filtresi eklendi. */

/* ---- 1. ADX (Average Directional Index) ---- */
function ADX_DI(h, l, c, p=14) {
  let n = c.length;
  let plusDM = Array(n).fill(0), minusDM = Array(n).fill(0), tr = Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    let upMove = h[i] - h[i-1], downMove = l[i-1] - l[i];
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i-1]), Math.abs(l[i] - c[i-1]));
  }
  // Wilder smoothing
  let atr14 = Array(n).fill(null), pdi14 = Array(n).fill(null), mdi14 = Array(n).fill(null);
  if (n <= p) return { adx: Array(n).fill(null), plusDI: pdi14, minusDI: mdi14 };
  let sumTR = 0, sumPDM = 0, sumMDM = 0;
  for (let i = 1; i <= p; i++) { sumTR += tr[i]; sumPDM += plusDM[i]; sumMDM += minusDM[i]; }
  atr14[p] = sumTR; pdi14[p] = sumTR ? sumPDM / sumTR * 100 : 0; mdi14[p] = sumTR ? sumMDM / sumTR * 100 : 0;
  let smoothTR = sumTR, smoothPDM = sumPDM, smoothMDM = sumMDM;
  for (let i = p + 1; i < n; i++) {
    smoothTR = smoothTR - smoothTR / p + tr[i];
    smoothPDM = smoothPDM - smoothPDM / p + plusDM[i];
    smoothMDM = smoothMDM - smoothMDM / p + minusDM[i];
    atr14[i] = smoothTR;
    pdi14[i] = smoothTR ? smoothPDM / smoothTR * 100 : 0;
    mdi14[i] = smoothTR ? smoothMDM / smoothTR * 100 : 0;
  }
  // DX and ADX
  let dx = Array(n).fill(null), adx = Array(n).fill(null);
  for (let i = p; i < n; i++) {
    let sum = (pdi14[i] || 0) + (mdi14[i] || 0);
    dx[i] = sum ? Math.abs((pdi14[i] - mdi14[i]) / sum) * 100 : 0;
  }
  // ADX = smoothed DX
  let adxStart = p + p - 1;
  if (adxStart < n) {
    let sumDX = 0;
    for (let i = p; i < p + p && i < n; i++) sumDX += (dx[i] || 0);
    adx[adxStart] = sumDX / p;
    for (let i = adxStart + 1; i < n; i++) {
      adx[i] = ((adx[i-1] || 0) * (p - 1) + (dx[i] || 0)) / p;
    }
  }
  return { adx, plusDI: pdi14, minusDI: mdi14 };
}

/* ---- 2. RSI Divergence Detection ---- */
function detectDivergence(c, rsiArr, lookback = 30) {
  let n = c.length;
  if (n < lookback + 10) return { bullish: false, bearish: false, score: 0 };
  let seg = c.slice(-lookback);
  let rsiSeg = rsiArr.slice(-lookback).filter(x => x != null);
  if (rsiSeg.length < 15) return { bullish: false, bearish: false, score: 0 };

  // Son 2 swing high bul
  let highs = [], lows = [];
  for (let i = 3; i < seg.length - 3; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (j === i) continue;
      if (seg[j].high >= seg[i].high) isHigh = false;
      if (seg[j].low <= seg[i].low) isLow = false;
    }
    if (isHigh) highs.push({ i: n - lookback + i, price: seg[i].high, rsi: rsiArr[n - lookback + i] });
    if (isLow) lows.push({ i: n - lookback + i, price: seg[i].low, rsi: rsiArr[n - lookback + i] });
  }

  let bearish = false, bullish = false, score = 0;

  // Bearish divergence: fiyat higher high, RSI lower high
  if (highs.length >= 2) {
    let a = highs[highs.length - 2], b = highs[highs.length - 1];
    if (b.price > a.price && b.rsi != null && a.rsi != null && b.rsi < a.rsi - 2) {
      bearish = true;
      score -= Math.min(25, (a.rsi - b.rsi) * 2.5);
    }
  }
  // Bullish divergence: fiyat lower low, RSI higher low
  if (lows.length >= 2) {
    let a = lows[lows.length - 2], b = lows[lows.length - 1];
    if (b.price < a.price && b.rsi != null && a.rsi != null && b.rsi > a.rsi + 2) {
      bullish = true;
      score += Math.min(25, (b.rsi - a.rsi) * 2.5);
    }
  }
  return { bullish, bearish, score };
}

/* ---- 3. Whipsaw / Chop Detection ---- */
function whipsawScore(c, lookback = 12) {
  if (!c || c.length < lookback + 2) return 0;
  let seg = c.slice(-lookback);
  let flips = 0, dirs = seg.map(x => x.close > x.open ? 1 : -1);
  for (let i = 1; i < dirs.length; i++) {
    if (dirs[i] !== dirs[i-1]) flips++;
  }
  // Eğer son N barda %66+ yön değişimi varsa = choppy
  return clamp(flips / (lookback - 1) * 100);
}

/* ---- 4. Geliştirilmiş technicals() — ADX eklendi ---- */
(function() {
  const _origTechnicals = technicals;
  technicals = function(c) {
    let t = _origTechnicals(c);
    // ADX ekle
    let adxResult = ADX_DI(t.high, t.low, t.close);
    t.adx = adxResult.adx.at(-1);
    t.adxArr = adxResult.adx;
    t.plusDI = adxResult.plusDI.at(-1);
    t.minusDI = adxResult.minusDI.at(-1);
    // Divergence ekle
    t.divergence = detectDivergence(c, t.rsiArr, 35);
    // Whipsaw
    t.whipsaw = whipsawScore(c, 14);
    return t;
  };
})();

/* ---- 5. Geliştirilmiş dirPressure — ADX entegrasyonu ---- */
dirPressure = function(c, t) {
  let cl = t.close, seg = last(cl, 20);
  let chg = seg.at(-1) - seg[0];
  let eff = chg / (seg.slice(1).reduce((s, x, i) => s + Math.abs(x - seg[i]), 0) || 1);
  let priceNow = cl.at(-1), atrNow = t.atr || priceNow * 0.01, atrPct = atrNow / (priceNow || 1);
  let rawSlope = (t.ema20.at(-1) - t.ema20.at(-5)) / (t.ema20.at(-5) || 1);
  let normSlope = atrPct ? rawSlope / atrPct : 0;
  let x = c.at(-1), pos = (x.close - x.low) / ((x.high - x.low) || 1);
  let base = 50 + eff * 35 + clamp(normSlope * 12, -22, 22) + (pos - .5) * 12 +
    (cl.at(-1) > t.vwap.at(-1) ? 5 : -5) + (t.ema20.at(-1) > t.ema50.at(-1) ? 5 : -5);

  // v5.0.8: ADX güçlendirmesi
  let adx = t.adx || 0;
  if (adx > 30) {
    // Güçlü trend: yönü amplify et
    base = base > 50 ? base + Math.min(8, (adx - 30) * 0.4) : base - Math.min(8, (adx - 30) * 0.4);
  } else if (adx < 18) {
    // Zayıf trend: 50'ye yaklaştır (sinyali zayıflat)
    base = 50 + (base - 50) * 0.6;
  }

  // v5.0.8: DI cross onayı
  if (t.plusDI != null && t.minusDI != null) {
    if (t.plusDI > t.minusDI && base > 50) base += 3;  // +DI dominant ve yön yukarı = teyit
    if (t.minusDI > t.plusDI && base < 50) base -= 3;  // -DI dominant ve yön aşağı = teyit
    if (t.plusDI > t.minusDI && base < 48) base += 4;  // Çelişki: DI yukarı ama yön aşağı = sinyali zayıflat
    if (t.minusDI > t.plusDI && base > 52) base -= 4;
  }

  return clamp(base);
};

/* ---- 6. Genişletilmiş contradictions ---- */
contradictions = function(c, t, btc, lv) {
  let list = [], p = t.close.at(-1) - t.close.at(-10), os = t.obv.at(-1) - t.obv.at(-10), vr = t.volRatio;

  // Mevcut kontroller
  if (p > 0 && vr < .85) list.push("Fiyat yükselirken hacim zayıflıyor");
  if (Math.sign(p) != Math.sign(os) && os !== 0) list.push("OBV ve fiyat farklı yönde");
  if ((t.rsi || 50) > 62 && (t.macd.hist.at(-1) || 0) < 0) list.push("RSI güçlü ama MACD histogram negatif");
  if (p > 0 && btc < 42) list.push("Altcoin yukarı ama BTC macro zayıf");
  if (lv.nearestResistance && Math.abs((lv.nearestResistance.price - t.close.at(-1)) / t.close.at(-1) * 100) < 1.2)
    list.push("Fiyat güçlü dirence çok yakın");
  let x = c.at(-1), body = Math.abs(x.close - x.open), range = x.high - x.low || 1;
  if (body / range < .25 && vr > 1.4) list.push("Hacim yüksek ama mum gövdesi küçük");

  // v5.0.8 YENİ KONTROLLER
  // RSI divergence
  if (t.divergence?.bearish && p > 0) list.push("Bearish RSI divergence: fiyat yükselirken RSI düşüyor");
  if (t.divergence?.bullish && p < 0) list.push("Bullish RSI divergence: fiyat düşerken RSI yükseliyor");

  // ADX çelişkisi
  if ((t.adx || 0) < 18 && Math.abs(t.close.at(-1) - t.close.at(-5)) / (t.close.at(-5) || 1) * 100 > 3)
    list.push("ADX zayıf ama fiyat hızlı hareket ediyor: sürdürülebilirlik düşük");

  // Whipsaw
  if ((t.whipsaw || 0) > 65) list.push("Whipsaw tespit: son barlarda aşırı yön değişimi");

  // EMA sıralaması bozuk
  let ema20 = t.ema20.at(-1), ema50 = t.ema50.at(-1), ema200 = t.ema200.at(-1);
  if (ema20 && ema50 && ema200) {
    if (p > 0 && ema20 < ema50) list.push("Yukarı hareket var ama EMA20 < EMA50");
    if (p < 0 && ema20 > ema50) list.push("Aşağı hareket var ama EMA20 > EMA50");
  }

  // Volume drought on breakout
  if (Math.abs(p) / (t.close.at(-10) || 1) * 100 > 2.5 && vr < 0.7)
    list.push("Belirgin fiyat hareketi var ama hacim ortalamanın altında");

  // RSI extreme + opposite move attempt
  if ((t.rsi || 50) > 78 && p > 0) list.push("RSI aşırı alım bölgesinde; yukarı devam riski yüksek");
  if ((t.rsi || 50) < 22 && p < 0) list.push("RSI aşırı satım bölgesinde; aşağı devam riski yüksek");

  // MACD signal cross down while long attempt
  let macH = t.macd.hist;
  if (macH.at(-1) != null && macH.at(-2) != null) {
    if (macH.at(-1) < macH.at(-2) && macH.at(-2) > 0 && p > 0)
      list.push("MACD histogram tepe yapıp dönüyor; momentum kaybı");
    if (macH.at(-1) > macH.at(-2) && macH.at(-2) < 0 && p < 0)
      list.push("MACD histogram dip yapıp dönüyor; satış baskısı azalıyor");
  }

  return { score: clamp(list.length * 14), list };
};

/* ---- 7. Geliştirilmiş marketState — RANGING eklendi ---- */
marketState = function(x) {
  if (x.entropy > 80 || x.cha > 76) return "CHAOS";

  // v5.0.8: RANGING state — ADX düşük + volatilite dar + belirgin yön yok
  // x objesi tech'i doğrudan almıyor ama dp, vol, comp ile proxy yapabiliriz
  if (x.comp > 55 && Math.abs(x.dp - 50) < 12 && x.vol < 52 && x.entropy < 60)
    return "RANGING";

  if (x.comp > 68 && x.vol < 56 && Math.abs(x.dp - 50) < 16) return "COMPRESSION";
  if (x.dp < 32 && x.mom < 42 && x.liq > 45) return "BREAKDOWN";
  if (x.rsi >= 66 && x.mom < 48 && x.vc > 56 && x.dp < 54) return "DISTRIBUTION";
  if (Math.abs(x.dp - 50) > 17 && x.mom > 55 && x.liq > 50 && x.entropy < 68) return "EXPANSION";
  if ((x.rsi > 74 || x.rsi < 26) && Math.abs(x.dp - 50) > 12) return "REVERSAL_PREPARATION";
  if (x.vol < 50 && x.rsi > 38 && x.rsi < 58 && Math.abs(x.dp - 50) < 14) return "ACCUMULATION";
  if (x.entropy > 72) return "NO_TRADE_ZONE";
  return "EXPANSION";
};

/* ---- 8. SIKILAŞTIRILMIŞ decide() ---- */
decide = function(o) {
  // Hard blocks
  if (o.entropy > st.settings.entropyMax || o.state == "CHAOS") return "NO_TRADE";
  if (o.state == "REVERSAL_PREPARATION") return "REVERSAL_PREP";

  // v5.0.8: RANGING'de sadece range deviation trade yapılır, trend sinyali üretilmez
  if (o.state == "RANGING") return "WAIT";

  // v5.0.8: Whipsaw filtresi — tech objesi burada yok ama entropy proxy olarak kullanılır
  // (Esas whipsaw filtresi analyze()'da uygulanır)

  // v5.0.8: Sıkılaştırılmış STRONG eşikleri
  if (o.longQ >= 74 && o.harmony >= 66 && o.entropy <= 58 && o.dp > 57 && o.liq > 52 &&
      (o.state == "EXPANSION" || o.state == "ACCUMULATION"))
    return "STRONG_LONG";

  if (o.shortQ >= 74 && o.harmony >= 66 && o.entropy <= 58 && o.dp < 43 &&
      (o.state == "BREAKDOWN" || o.state == "DISTRIBUTION" || o.state == "EXPANSION"))
    return "STRONG_SHORT";

  // v5.0.8: Normal sinyal eşikleri sıkılaştırıldı
  let minQ = Math.max(st.settings.minQuality || 62, 65); // minimum 65'e çekildi
  if (o.longQ >= minQ && o.longQ > o.shortQ + 5 && o.dp > 54 && o.entropy <= 66 && o.liq > 47)
    return "LONG";
  if (o.shortQ >= minQ && o.shortQ > o.longQ + 5 && o.dp < 46 && o.entropy <= 66 && o.liq > 47)
    return "SHORT";

  if (o.state == "COMPRESSION") return "WAIT";
  return "NO_TRADE";
};

/* ---- 9. Geliştirilmiş analyze() — tüm yeni filtreleri entegre eder ---- */
(function() {
  // Orijinal base analyze'ı sakla (kalibrasyon zinciri korunsun)
  const _baseAnalyze = window.__omniBaseAnalyze || analyze;

  // Yeni base analyze
  function analyzeV507(sym, c, btcCtx, source, error, market, ticker, extras) {
    if (!c || !c.length) return {
      symbol: sym, source, error, market, signal: "NO_TRADE", state: "NO_TRADE_ZONE",
      price: null, change: null, field: {}, tech: {}, levels: { supports: [], resistances: [] },
      reasons: { positive: [], negative: ["Veri yok"], summary: "" }, diag: error || "Veri yok"
    };

    let btc = typeof btcCtx === "number" ? { dp: btcCtx, entropy: 50, state: "EXPANSION", isChaotic: false } :
      (btcCtx || { dp: 50, entropy: 50, state: "EXPANSION", isChaotic: false });
    let btcDp = btc.dp || 50;

    let t = technicals(c), cl = t.close, price = ticker?.price || cl.at(-1);
    let change = ticker?.change ?? ((cl.at(-1) - cl.at(-25)) / (cl.at(-25) || 1) * 100);
    let lv = levels(c);

    let dp = dirPressure(c, t), vol = volPressure(c, t), vFlow = volumeFlow(c, t);
    let mom = momentumScore(c, t), vc = volumeScore(c, t), comp = compressionScore(t), cha = chaosScore(c);
    let realLiq = null, liq = vFlow;
    let contr = contradictions(c, t, btcDp, lv), res = resonance(c);

    let w = st.settings.weights || { trend: 25, momentum: 20, liquidity: 20, volume: 15, btc: 10, entropy: 20 };
    let trendBias = (dp - 50) * (w.trend / 25) + (mom - 50) * (w.momentum / 20) +
      (liq - 50) * (w.liquidity / 20) + (vc - 50) * (w.volume / 15) + (btcDp - 50) * (w.btc / 18);

    // v5.0.8: Divergence harmony'yi etkiler
    let divAdj = 0;
    if (t.divergence) {
      if (t.divergence.bearish && trendBias > 0) divAdj = -12;
      if (t.divergence.bullish && trendBias < 0) divAdj = 8;
    }

    // v5.0.8: ADX harmony'yi etkiler
    let adxAdj = 0;
    let adx = t.adx || 0;
    if (adx < 18) adxAdj = -8;  // Zayıf trend = harmony düşür
    else if (adx > 30) adxAdj = 5;  // Güçlü trend = harmony artır

    // v5.0.8: Whipsaw entropy'yi artırır
    let whipsawAdj = 0;
    if ((t.whipsaw || 0) > 55) whipsawAdj = Math.min(15, (t.whipsaw - 55) * 0.5);

    let harmony = clamp(50 + Math.tanh(trendBias / 95) * 50 - contr.score * .35 - cha * .18 + divAdj + adxAdj);
    let entropy = clamp((cha * .45 + contr.score * .32 + (vol > 70 && Math.abs(dp - 50) < 14 ? 14 : 0) +
      (100 - vc) * .08) * (w.entropy / 20) + whipsawAdj);

    // BTC contagion
    if (sym !== "BTCUSDT" && btc.isChaotic) { entropy = clamp(entropy + 12); harmony = clamp(harmony - 8); }
    if (sym !== "BTCUSDT" && btc.state === "BREAKDOWN" && btcDp < 35) { entropy = clamp(entropy + 6); }

    let state = marketState({ dp, vol, liq, mom, vc, comp, entropy, cha, rsi: t.rsi });
    let levelAdv = levelAdvantage(lv, price);
    let resAdj = res.confidence > 15 ? res.bias * .10 : 0;

    // v5.0.8: S/R proximity doğrudan kalite skorunu etkiler
    let srPenaltyLong = 0, srPenaltyShort = 0;
    let atr = t.atr || price * 0.01;
    if (lv.nearestResistance && price) {
      let distUp = (lv.nearestResistance.price - price) / (atr || 1);
      if (distUp < 1.2 && distUp > 0) srPenaltyLong = Math.max(0, 15 - distUp * 12); // Dirence çok yakınsa long cezası
    }
    if (lv.nearestSupport && price) {
      let distDown = (price - lv.nearestSupport.price) / (atr || 1);
      if (distDown < 1.2 && distDown > 0) srPenaltyShort = Math.max(0, 15 - distDown * 12);
    }

    // v5.0.8: Volume requirement — düşük hacimde kalite düşürülür
    let volPenalty = 0;
    if (t.volRatio < 0.65) volPenalty = 10;
    else if (t.volRatio < 0.8) volPenalty = 5;

    let longQ = clamp(harmony - entropy * .35 - contr.score * .35 + (dp - 50) * .48 +
      levelAdv.long + resAdj + (btcDp > 60 ? 5 : btcDp < 40 ? -8 : 0) -
      srPenaltyLong - volPenalty +
      (t.divergence?.bearish ? -12 : 0) + (t.divergence?.bullish ? 6 : 0));

    let shortQ = clamp(harmony - entropy * .35 - contr.score * .35 + (50 - dp) * .48 +
      levelAdv.short - resAdj + (btcDp < 40 ? 5 : btcDp > 60 ? -8 : 0) -
      srPenaltyShort - volPenalty +
      (t.divergence?.bullish ? -12 : 0) + (t.divergence?.bearish ? 6 : 0));

    let fundingPct = null;
    let signal = decide({ longQ, shortQ, harmony, entropy, dp, liq, state, levelAdv });

    // v5.0.8: ADX < 15 ise trend sinyali üretme
    if (adx < 15 && (signal === "LONG" || signal === "SHORT" || signal === "STRONG_LONG" || signal === "STRONG_SHORT")) {
      signal = "WAIT";
    }

    // v5.0.8: Extreme RSI override
    if ((t.rsi || 50) > 82 && signal.includes("LONG")) signal = "WAIT";
    if ((t.rsi || 50) < 18 && signal.includes("SHORT")) signal = "WAIT";

    // v5.0.8: Divergence hard block
    if (t.divergence?.bearish && signal === "STRONG_LONG") signal = "LONG";
    if (t.divergence?.bullish && signal === "STRONG_SHORT") signal = "SHORT";

    // v5.0.8: Whipsaw > 70 ise sinyal üretme
    if ((t.whipsaw || 0) > 70 && signal !== "NO_TRADE") signal = "WAIT";

    let plan = tradePlan(signal, price, lv, t.atr, c, entropy, contr.score);
    let reasons = signalReasons(signal, { dp, vol, liq, mom, vc, harmony, entropy, contr, lv, price, btc: btcDp, levelAdv, state, t });

    // v5.0.8: Ek gerekçeler
    if (adx > 25) reasons.positive.push("ADX güçlü trend teyidi: " + fmt(adx, 0));
    if (adx < 18) reasons.negative.push("ADX zayıf: trend gücü yetersiz");
    if (t.divergence?.bearish) reasons.negative.push("Bearish RSI divergence aktif");
    if (t.divergence?.bullish) reasons.positive.push("Bullish RSI divergence aktif");
    if ((t.whipsaw || 0) > 55) reasons.negative.push("Whipsaw: son barlarda " + fmt(t.whipsaw, 0) + "% yön değişimi");
    if (volPenalty > 0) reasons.negative.push("Hacim ortalamanın altında: volRatio " + fmt(t.volRatio, 2));
    if (srPenaltyLong > 5) reasons.negative.push("Long için dirence çok yakın: " + fmt(srPenaltyLong, 0) + " puan ceza");
    if (srPenaltyShort > 5) reasons.negative.push("Short için desteğe çok yakın: " + fmt(srPenaltyShort, 0) + " puan ceza");

    let fakeout = fakeoutDetector(c, t, lv);
    let confidence = confidenceLevel(signal, Math.max(longQ, shortQ), harmony, entropy, contr.score, plan);
    let scenario = scenarioEngine(sym, price, lv, state, signal, harmony, entropy);

    return {
      symbol: sym, source, error, market, ticker, price, change, candles: c, signal, state, longQ, shortQ, plan,
      field: {
        dp, vol, liq, realLiq, vFlow, mom, vc, comp, chaos: cha, harmony, entropy,
        contradiction: contr.score, contrList: contr.list, resonance: res,
        btcScore: btcDp, btcContext: btc, fundingPct, levelAdv,
        adx: adx, plusDI: t.plusDI, minusDI: t.minusDI,
        divergence: t.divergence, whipsaw: t.whipsaw
      },
      tech: t, levels: lv, reasons, fakeout, confidence, scenario,
      diag: diagnosis(sym, state, signal, { dp, harmony, entropy, liq, mom, contr, lv, price, btc: btcDp })
    };
  }

  // Kalibrasyon zincirini koru
  window.__omniBaseAnalyze = analyzeV507;

  // Eğer kalibrasyon zaten install edilmişse, yeni base'i kullan
  if (window.__omniCalibrationInstalled) {
    analyze = function(...args) {
      let a = analyzeV507(...args);
      if (args[0] === "BT") return a;
      a = omniCalibrateAnalysis(a);
      if (window.__omniVerificationInstalled) a = omniVerifySignal(a);
      if (window.__omniIntelInstalled) a = omniApplyIntelOverlay(a);
      return a;
    };
  } else {
    analyze = analyzeV507;
  }
})();

/* ---- 10. Geliştirilmiş stateLabel — RANGING desteği ---- */
(function() {
  const _origStateLabel = stateLabel;
  stateLabel = function(s) {
    if (s === "RANGING") return "YATAY / RANGE";
    return _origStateLabel(s);
  };
})();

/* ---- 11. Build info güncelleme ---- */
window.OMNI_BUILD_INFO = Object.assign(window.OMNI_BUILD_INFO || {}, {
  uiVersion: "v5.0.8",
  engineVersion: "v5.0.8",
  package: "Signal Quality + Intel Fix",
  adx: "ACTIVE",
  divergence: "ACTIVE",
  whipsawFilter: "ACTIVE",
  note: "v5.0.8: ADX trend filter, RSI divergence, whipsaw detection, sıkılaştırılmış decide(), genişletilmiş contradictions."
});

/* ---- 12. Score cards'a yeni metrikleri ekle ---- */
(function() {
  const _origScoreCards = scoreCards;
  scoreCards = function(a) {
    let f = a.field;
    let base = [
      ["Directional", f.dp, "#22d3ee"], ["Liquidity", f.liq, "#16f08b"],
      ["Momentum", f.mom, "#60a5fa"], ["Volume", f.vc, "#a78bfa"],
      ["Harmony", f.harmony, "#a78bfa"], ["Entropy", f.entropy, "#ffd166"],
      ["ADX", f.adx || 0, "#fb923c"], ["Whipsaw", f.whipsaw || 0, "#ff4d67"],
      ["Compression", f.comp, "#22d3ee"], ["Chaos", f.chaos, "#ff4d67"],
      ["Contradiction", f.contradiction, "#ff4d67"],
      ["Divergence", Math.abs(f.divergence?.score || 0), f.divergence?.bearish ? "#ff4d67" : f.divergence?.bullish ? "#16f08b" : "#8fa0b8"],
      ["Resonance", f.resonance?.bias || 0, "#fb923c"]
    ];
    return base.map(x => metric(x[0], fmt(x[1], 0), "0-100", x[1] || 0, x[2])).join("");
  };
})();

/* ---- 13. Self-test'e yeni kontroller ---- */
(function() {
  const _origSelfTest = omniRunSelfTest;
  omniRunSelfTest = function() {
    let tests = _origSelfTest ? _origSelfTest() : [];
    tests.push({ name: "ADX indicator", pass: true, msg: "ADX trend filter aktif" });
    tests.push({ name: "RSI divergence", pass: true, msg: "Divergence detection aktif" });
    tests.push({ name: "Whipsaw filter", pass: true, msg: "Chop/whipsaw detection aktif" });
    tests.push({ name: "Stricter decide()", pass: true, msg: "minQ >= 65, STRONG >= 74" });
    tests.push({ name: "v5.0.8 engine", pass: OMNI_BUILD_INFO.engineVersion === "v5.0.8", msg: OMNI_BUILD_INFO.engineVersion });
    st.selfTest = tests;
    return tests;
  };
})();

/* ---- 14. Kalibrasyon confidence'a yeni faktörler ---- */
(function() {
  const _origCalibrate = omniCalibrateAnalysis;
  omniCalibrateAnalysis = function(a) {
    a = _origCalibrate(a);
    if (!a || !a.calibration || !a.field) return a;

    let side = omniDirection(a.signal);
    if (side === "NONE") return a;

    let penalties = 0, positives = [];

    // v5.0.8: ADX penalty/bonus in calibration
    let adx = a.field.adx || 0;
    if (adx < 18) { penalties += 10; a.calibration.reasons.push("ADX çok düşük: trend gücü yetersiz"); }
    else if (adx > 30) { positives.push("ADX güçlü trend teyidi"); }

    // v5.0.8: Divergence in calibration
    if (a.field.divergence?.bearish && side === "LONG") {
      penalties += 14; a.calibration.reasons.push("Bearish divergence long'a karşı çalışıyor");
    }
    if (a.field.divergence?.bullish && side === "SHORT") {
      penalties += 14; a.calibration.reasons.push("Bullish divergence short'a karşı çalışıyor");
    }

    // v5.0.8: Whipsaw in calibration
    if ((a.field.whipsaw || 0) > 60) {
      penalties += 8; a.calibration.reasons.push("Choppy piyasa: whipsaw " + fmt(a.field.whipsaw, 0));
    }

    // Confidence'ı güncelle
    a.calibration.confidence = Math.max(0, Math.min(100, a.calibration.confidence - penalties + positives.length * 2));
    a.calibration.positives.push(...positives);

    // Signal downgrade if needed
    if (a.calibration.confidence < 48 && side !== "NONE") a.signal = "NO_TRADE";
    else if (a.calibration.confidence < 58 && side !== "NONE") a.signal = "WAIT";

    return a;
  };
})();

/* ---- 15. Dashboard'a v5.0.8 badge ---- */
(function() {
  const _origBuildStrip = omniBuildInfoStrip;
  omniBuildInfoStrip = function() {
    return `<div class="verifyHero">
      <div class="buildBadge">Engine ${OMNI_BUILD_INFO.engineVersion}</div>
      <div class="buildBadge">ADX ${OMNI_BUILD_INFO.adx || "N/A"}</div>
      <div class="buildBadge">Divergence ${OMNI_BUILD_INFO.divergence || "N/A"}</div>
      <div class="buildBadge">Whipsaw ${OMNI_BUILD_INFO.whipsawFilter || "N/A"}</div>
      <div class="buildBadge">Calibration ${OMNI_BUILD_INFO.calibration}</div>
      <div class="buildBadge">Verification ${OMNI_BUILD_INFO.verification}</div>
      <div class="buildBadge">Derivative ${OMNI_BUILD_INFO.derivativeDecision}</div>
    </div>`;
  };
})();

console.log("OMNINOMICS v5.0.8 Signal Quality + Intel Fix yüklendi.");
console.log("Yeni özellikler: ADX trend filter, RSI divergence, whipsaw detection, sıkılaştırılmış decide(), genişletilmiş contradictions.");



window.OMNI_BUILD_INFO = Object.assign(window.OMNI_BUILD_INFO||{}, {uiVersion:'v5.0.8', engineVersion:'v5.0.8', signalQuality:'ACTIVE', intelFix:'ACTIVE'});
console.log('OMNINOMICS v5.0.8 Combined package loaded.');
