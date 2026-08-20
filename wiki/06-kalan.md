# 06 — Kalan İşler (açık maddeler)

## Kullanıcıda (kod dışı, yayın için şart)
1. **grabowl.com alan adı al** — gizlilik URL'si + manifest `homepage_url`. TEK ANA
   BLOKAJ. `grabowl.app`'i de kapatması önerildi. Manifestte şu an yer tutucu.
2. Firefox AMO hesabı aç (ücretsiz).
3. Edge Partner Center hesabı aç (ücretsiz).
4. Chrome + Edge'de ilk ürün kaydını elle aç.
5. API anahtarlarını repo secret'larına ekle (`.github/workflows/release.yml` başında liste).

## Canlı doğrulama gerekli (kod var, gözle görülmedi)
Eklentiyi yenile (`chrome://extensions` → Grabowl → yenile), sonra:
- Reels sekmesi grid'i (`/{kullanıcı}/reels/`) — kutucuğa gelince buton çıkmalı.
- Story / öne çıkanlar indirme.
- Avatar butonu — profil başlığında "Tümünü indir" yanında, HD profil fotoğrafı inmeli.
- Firefox — `about:debugging` ile bir kez tam akış.
Not: Bunlar arka plan sekmesinde Instagram render etmediği için uzaktan doğrulanamadı.

## Açık teknik maddeler (v1.1'e ertelenebilir)
- **Firefox host izin akışı:** Firefox MV3'te host izinleri opsiyonel; kod
  `permissions.request()` çağırmıyor → Firefox'ta indirmeler sessizce başarısız
  olabilir. İlk kullanımda izin-isteği akışı eklenmeli (güvenlik denetiminden P1-E).
- Kalan ölü kod ve test boşlukları kısmen kapatıldı; `dom-2026-08.ts` adapter'ı için
  jsdom testleri hâlâ yok (IG redesign'da kırılacak en olası dosya).

## Ertelenen ürün kararları
- Landing page / grabowl.com sitesi (kullanıcı şimdilik istemedi; SEO için değerli).
- DM medya indirme (kapsam dışı).
