# 04 — Güvenlik ve Düzeltilen Kritik Hatalar

İki bağımsız denetim (güvenlik + kod kalitesi) yapıldı. Bulunanlar öncelik
sırasıyla düzeltildi. Detay: commit `1626c53`.

## P0 — Kritik hatalar (düzeltildi)
1. **Resume bozuktu** — servis-worker kapanınca kuyruk yeniden kurulmuyordu. Artık
   `restore()` kuyruğu persistli pending'den kuruyor.
2. **İndirme kuyruğu yarış koşulu** — bir başlatma reddedilince erken "drain",
   kardeş indirmeler dinleyicisiz kalıyordu → "bitti" derken dosya iniyordu.
   `starting` sayacı eklendi. Regresyon testi: `test/queue.test.ts`.
3. **Boş dosya-adı deseni ayarı siliyordu** (özellikle Firefox) → tüm indirmeler
   bozuluyordu. `loadSettings` artık `undefined` değerleri filtreliyor; options boş
   deseni patch'e koymuyor. Test: `test/settings.test.ts`.
4. **Bulk, SW eviction'da donuyordu** — `downloads.onChanged` geç kaydediliyordu.
   Tek üst-seviye dinleyiciye taşındı (MV3 worker uyanması için).
5. **Sweep tüm sayfayı tarıyordu** (her scroll'da) → Instagram yavaşlıyordu.
   `findActionBars` tek geçişe indirildi; `hasBackgroundImage` 12 elemanla sınırlı.
6. **Zip mesaj kanalını bloke ediyordu** → "message port closed". Zip artık
   fire-and-forget, ilerleme mesajla bildiriliyor.

## P1 — Güvenlik sertleştirmesi (düzeltildi)
- **Güven sınırı arka plana taşındı:** her `downloads.download` `isTrustedAsset`'ten
  geçiyor (yalnızca Instagram CDN https). dom-scrape drive-by primitifi + info-api
  ham dönüş + zip fetch tek noktada kapandı.
- Boş-URL kabulü düzeltildi (indeks zehirleme).
- Sender doğrulama (`sender.id !== runtime.id` → reddet).
- Dosya adı: Unicode bidi override strip'i + Windows ayrılmış adlar (`CON` vb.) +
  son segment de sanitize. Test: `test/filename.test.ts`.
- Firefox host izinleri opsiyonel — not düşüldü (ilk kullanımda izin akışı gerekli;
  bkz [06-kalan](06-kalan.md), açık madde).
- Offscreen zip belleği indirme sonrası serbest bırakılıyor.
- Mağaza reviewer notu `STORE.md`'ye eklendi (özel API kullanımı açıkça anlatılıyor).

## Sağlam kalan (değişmedi)
Dar izinler (`<all_urls>` yok), `externally_connectable`/`web_accessible_resources`
yok, CSP override yok, uzak kod yok, `innerHTML` yalnızca statik SVG, postMessage
URL allowlist'i bilinen bypass'lara kapalı, sıfır veri toplama.

## Bilinen kabul edilen sınırlar
- Eklenti sayfadan tespit edilebilir (`JSON.parse.toString()` native değil,
  `__grabowl_installed__` flag). Tasarım gereği, kabul edildi.
- `downloads.download` yönlendirme takip ediyor; yalnızca ilk URL denetleniyor
  (açık redirect kalıntı risk).
