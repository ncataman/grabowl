# 00 — Durum Özeti

## Hazır (kod tarafı bitti)
- Çekirdek indirme: feed, gönderi detayı, reels oynatıcı, profil gönderi grid'i,
  carousel (doğru kare), profil "Tümünü indir", **avatar (profil fotoğrafı) indirme**.
- Orijinal kalite garantisi (önizleme değil, gerçek dosya; grid thumbnail'ından
  asla düşük kalite inmez).
- 10 dil arayüz + RTL (Arapça) desteği.
- Tüm mağaza görselleri: 50 ekran görüntüsü (10 dil × 5), 440×280 + 1400×560 promo,
  128/300/512 ikonlar. Kaynak: `store-assets/demo/index.html` (sahte demo sayfa).
- 10 dilde gizlilik politikası sayfası (`store-assets/privacy/index.html`).
- 10 dilde mağaza metinleri (`store-assets/listing.json`), üç mağaza sınırına uygun.
- CI + yayın otomasyonu (`.github/workflows/`).
- 6 kritik hata + güvenlik denetimi bulguları düzeltildi (bkz [04-guvenlik](04-guvenlik.md)).
- 123 test geçiyor; üç tarayıcı paketi derleniyor.

## Doğrulanmadı (kod var, canlı gözle görülmedi)
- Reels sekmesi grid'i (`/{kullanıcı}/reels/`) — Instagram arka plan sekmesinde
  render etmiyor, uzaktan ölçülemedi.
- Story / öne çıkanlar indirme.
- Firefox paketi hiç yüklenip çalıştırılmadı.
Kullanıcı önplanda test etmeli; bkz [06-kalan](06-kalan.md).

## Blokaj (kullanıcıda)
- **grabowl.com alan adı** — gizlilik URL'si + manifest `homepage_url` için şart.
  Alınana kadar hiçbir mağaza başvuruyu kabul etmez.
- Firefox AMO + Edge Partner Center hesapları (ücretsiz).
- Chrome + Edge'de ilk kayıt elle (API ilk kaydı yapamaz).
- API anahtarları repo secret'larına.

## Sıradaki adım
Alan adı alınınca: gizlilik sayfasını yayınla → Firefox AMO'dan başla (en hızlı
onay + API ilk gönderimi yapabilen tek mağaza) → Edge → Chrome.
