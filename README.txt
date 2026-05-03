OMNINOMICS v5.1.2 — Premium Cockpit / Free News Watch

Bu sürümde haber akışı karar motoruna bağlanmadı.

ANA KURAL
- Haberler ekranda görünür.
- Haberler LONG / SHORT / WAIT kararını değiştirmez.
- Haberlerin karar ağırlığı: 0%.
- Karar motoru: OHLCV Core.
- Funding / OI / orderbook: panel/gözlem amaçlıdır, karar dışıdır.

HABER KAYNAKLARI
1) GDELT: varsayılan, ücretsiz, API key gerektirmez.
2) FreeNewsApi: opsiyonel ücretsiz kaynak. Vercel Environment Variable:
   FREENEWS_API_KEY=...
3) Finnhub: opsiyonel finans haber kaynağı. Vercel Environment Variable:
   FINNHUB_API_KEY=...

NOT
- X / @DeItaone entegrasyonu bu sürümde ana kaynak değildir; ücretli API bağımlılığı istemediğimiz için ücretsiz haber mimarisine geçildi.
- /api/news endpoint'i display_only=true ve decision_weight=0 döndürür.

Vercel deploy:
- ZIP'i Vercel'e yükle.
- Ekstra key girmesen de GDELT ile çalışır.
- FreeNewsApi veya Finnhub key eklersen haber havuzu genişler.


================ OMNINOMICS v5.1.3 — TÜRKÇE HABER GÜNCELLEMESİ ================

Bu sürümde haber akışı karar motoruna bağlanmadan ekranda gösterilir.
Karar ağırlığı: 0%
Decision binding: DISABLED

Yeni özellikler:
- Haber başlığı için Türkçe gösterim alanı: title_display / title_tr
- Haber açıklaması için Türkçe gösterim alanı: description_display / description_tr
- Orijinal başlık korunur: title_original
- Orijinal açıklama korunur: description_original
- Haber panelinde Türkçe başlık + Türkçe açıklama gösterilir.
- Ticker Türkçe başlığı kullanır.
- Çeviri anahtarı yoksa uygulama bozulmaz; orijinal dil gösterilir.

Opsiyonel ortam değişkenleri:
NEWS_LANGUAGE=tr
NEWS_TRANSLATION_PROVIDER=auto | google | libre | none
GOOGLE_TRANSLATE_API_KEY=...
LIBRETRANSLATE_URL=https://senin-libretranslate-sunucun.com
LIBRETRANSLATE_API_KEY=...  (opsiyonel)

Ücretsiz haber omurgası:
- GDELT varsayılan ve key gerektirmez.

Opsiyonel haber kaynakları:
FREENEWS_API_KEY=...
FINNHUB_API_KEY=...

Not:
Başlık ve açıklama Türkçeye çevrilse bile haberler LONG/SHORT/WAIT kararına bağlanmaz.
Haberler yalnızca ekranda hızlı piyasa istihbaratı olarak gösterilir.
===============================================================================
