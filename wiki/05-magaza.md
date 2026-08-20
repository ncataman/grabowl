# 05 — Mağaza Gönderimi (adım adım)

Detaylı sürüm: repo kökü `STORE.md`. Bu sayfa özet + sıra.

## Yayın sırası: Firefox (AMO) → Edge → Chrome
- **Firefox** en hızlı onaylıyor ve API'si ilk gönderimi de yapabiliyor → ilk canlı
  ilan oradan.
- **Edge** ≤7 iş günü.
- **Chrome** en yavaş (`downloads` + geniş host = elle inceleme; Nisan 2026'dan beri
  yığılma) → erken başlat, paralel ilerlesin.
- İki mağazada canlı olmak, Chrome'da trademark şikâyeti gelirse dağıtımı korur.

## Otomasyon gerçeği
| | İlk gönderim | Sürüm güncellemesi | İlan metni/görsel |
|---|---|---|---|
| Chrome | elle (API öğe oluşturamaz) | `wxt submit` API v2 | elle (panel) |
| Edge | elle (`CreateNotAllowed`) | API v1.1 | elle (panel) |
| Firefox | API yapabilir | API | API veya panel |

İlk kayıtlar Chrome+Edge'de elle açılır; sonrası git tag ile otomatik yayınlanır
(`.github/workflows/release.yml`).

## Hazır varlıklar (nereye gider)
- Ekran görüntüleri `store-assets/screenshots/<dil>/1..5.png` (1280×800) — üç mağaza.
- Promo `store-assets/promo/out/` — 440×280 (Chrome küçük kart, Edge), 1400×560 (marquee).
- İkonlar `store-assets/icons/` — 128 (Chrome/FF), 300 (Edge), 512 (FF pazarlama).
- Metinler `store-assets/listing.json` (10 dil, isim/özet/açıklama/Edge arama terimleri).
- Gizlilik `store-assets/privacy/index.html` → grabowl.com/privacy adresine yüklenecek.
- İzin gerekçeleri + reviewer notu `STORE.md`'de.

## İzinler (gerekçeleriyle STORE.md'de)
`downloads`, `storage`, `offscreen` + 4 host: www/i.instagram.com, *.cdninstagram.com,
*.fbcdn.net.

## Ücretler
Chrome $5 tek seferlik (Google'a, kullanıcıyla ilgisi yok) · Edge ve Firefox ücretsiz.

## Bloklar (kullanıcıda) — bkz [06-kalan](06-kalan.md)
grabowl.com alan adı, Firefox/Edge hesapları, ilk kayıt, API anahtarları.
