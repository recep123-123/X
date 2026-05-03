OMNINOMICS v5.1.0 — OHLCV Core Decision Engine

Bu sürüm, kullanıcının son talebine göre v5.0.9 Decision Mode paketinin üzerine temiz karar motoru düzeltmesi getirir.

Ana kararlar:
1. Harmony / Entropy final karar motorundan çıkarıldı.
   - Karar ağırlığı: 0%.
   - Ana tablo ve karar modu ekranı artık H/E üzerinden okunmaz.
   - H/E eski hesaplar bazı legacy alanlarda kalsa bile final LONG/SHORT/WAIT/NO_TRADE üretiminde kullanılmaz.

2. Funding / Open Interest / orderbook final karara eklenmedi.
   - Karar ağırlığı: 0%.
   - Türev ve orderbook endpointleri varsa sadece panel/gözlem amaçlı kalır.
   - Market Intelligence overlay artık sinyali WAIT/NO_TRADE yapmaz, size değiştirmez, yön çevirmez.

3. Yeni aktif karar motoru: OHLCV Core.
   Ücretsiz ve daha stabil verilerden hesaplanır:
   - OHLCV mum verisi
   - Hacim / volume ratio
   - EMA20 / EMA50 / EMA200
   - VWAP
   - RSI
   - MACD histogram eğimi
   - ATR tabanlı destek/direnç mesafesi
   - ADX
   - +DI / -DI
   - RSI divergence
   - Whipsaw / chop skoru
   - Compression / range / expansion rejimi
   - Mum fitil kalitesi
   - Destek / direnç yakınlık filtresi

4. Arayüz değişiklikleri:
   - Başlık v5.1.0 OHLCV Core olarak güncellendi.
   - Ana tablo H/E sütunları yerine OHLCV Q, ADX, Whipsaw ve Volume gösterir.
   - Decision Mode ekranı tek aktif motor olarak OHLCV Core gösterir.
   - Build badge: H/E removed, Derivatives panel-only.
   - Self-Test içine OHLCV Core, H/E disabled ve Funding/OI/orderbook excluded kontrolleri eklendi.

Yükleme:
1. ZIP'i aç.
2. GitHub repo köküne tüm dosyaları yükle.
3. public/index.html dosyasının güncel olduğundan emin ol.
4. Commit changes.
5. Vercel deploy sonrası Ctrl+F5 yap.
6. Sistem → Build Info bölümünde v5.1.0 gör.
7. Sistem → Self-Test çalıştır.
8. Sinyal ve Karar → Karar Modu ekranında OHLCV Core aktif görünmeli.

Önemli:
- Bu sürüm daha az “fantezi veri”, daha fazla stabil teknik karar mantığı kullanır.
- Funding/OI/orderbook hâlâ ilgili panel sayfalarında görünebilir; bu normaldir. Karara girmezler.
- Harmony/Entropy bazı eski isimli localStorage/legacy alanlarda kalabilir; final karar ağırlıkları sıfırdır.

--- Önceki paket notu ---
OMNINOMICS v5.0.9 — Decision Mode A/B Tester
Classic / PA Dominant / Pure PA + Intelligence modları içeriyordu. v5.1.0 bu mod karmaşasını sadeleştirip tek aktif karar motorunu OHLCV Core yapar.


=== v5.1.1 PREMIUM COCKPIT UI ===
- Premium cockpit layout: sticky global status bar, breaking news ticker, clean/pro/full chart modes.
- Chart upgraded: support/resistance zones, right-side labels, current price tag, overlay toggles, volume layer.
- Dashboard upgraded: selected coin chart + decision WHY panel + @DeItaone/news panel.
- Harmony/Entropy remains out of final decision. Funding/OI/orderbook remain panel-only and do not affect decisions.
- News feed: /api/news added. To enable live @DeItaone X feed, add X_BEARER_TOKEN in Vercel Environment Variables. Without token, the app falls back to GDELT/system news so the UI still works.
