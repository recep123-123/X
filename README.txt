OMNINOMICS v5.1.5 — Real Free News Fix / Display Only

Bu sürüm, v5.1.4'te görünen "sistem notlarının haber gibi akması" sorununu düzeltir.

ANA KURAL
- Haberler ekranda görünür.
- Haberler LONG / SHORT / WAIT kararını değiştirmez.
- Haberlerin karar ağırlığı: 0%.
- Karar motoru: OHLCV Core.
- Funding / OI / orderbook: panel/gözlem amaçlıdır, karar dışıdır.

HABER AKIŞI DÜZELTMESİ
- Artık fallback/system/debug satırları haber gibi ticker'da akmaz.
- Gerçek haber gelmezse ticker açıkça "HABER DURUMU" gösterir.
- Haber panelinde debug notu görünür; sahte haber üretilmez.
- /api/news artık news_available alanı döndürür.

ÜCRETSİZ / KEY'SİZ HABER KAYNAKLARI
1) CryptoCompare public news endpoint — varsa kullanılır.
2) RSS kaynakları:
   - CoinDesk RSS
   - Cointelegraph RSS
   - Yahoo Finance BTC/ETH headline RSS
3) GDELT DOC API — ücretsiz, API key gerektirmez.

OPSİYONEL KAYNAKLAR
- FREENEWS_API_KEY=...
- FINNHUB_API_KEY=...
- CRYPTOCOMPARE_API_KEY=...  (zorunlu değil, varsa daha stabil olabilir)

TÜRKÇE ÇEVİRİ
Varsayılan akış:
- GOOGLE_TRANSLATE_API_KEY varsa Google kullanılır.
- LIBRETRANSLATE_URL varsa LibreTranslate kullanılır.
- Hiçbiri yoksa MyMemory ücretsiz çeviri fallback'i denenir.

Opsiyonel ortam değişkenleri:
NEWS_LANGUAGE=tr
NEWS_TRANSLATION_PROVIDER=auto | google | libre | mymemory | none
GOOGLE_TRANSLATE_API_KEY=...
LIBRETRANSLATE_URL=https://senin-libretranslate-sunucun.com
LIBRETRANSLATE_API_KEY=...  (opsiyonel)
MYMEMORY_EMAIL=...          (opsiyonel ama yüksek kullanımda tavsiye edilir)
MYMEMORY_API_KEY=...        (opsiyonel)

VERCEL DEPLOY
- ZIP'i Vercel'e yükle.
- Ekstra key girmeden de haber kaynakları denenir.
- Haber kaynakları boş dönerse uygulama bozulmaz; panelde nedenini gösterir.

NOT
Haber başlıkları ve açıklamaları Türkçeye çevrilse bile haberler karar motoruna bağlanmaz.
