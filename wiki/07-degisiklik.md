# 07 — Değişiklik Günlüğü (kronolojik)

Hepsi 2026-08-20. Commit'lerle.

## `54e872d` — InsDown 1.0.0 ilk sürüm
İlk çalışan eklenti: WXT scaffold, interceptor, media index, feed/detay butonları,
tek gönderi indirme, temel dosya adı. (O anda ad "InsDown".)

## Canlı hata ayıklama (commit'ler arası)
- **Kritik keşif:** Instagram `response.json()` kullanıyor → `JSON.parse` hook'u
  neredeyse hiçbir şey yakalamıyordu. Fetch + XHR hook'u eklendi, yakalama çalıştı
  (30 medya indekslendi).
- `ownerOf` avatar'a takılıyordu → "anlamlı medya" ölçütüne bağlandı.
- Buton yüzen katmandan Instagram'ın kendi eylem çubuğuna taşındı (yapısal bulma).
- Grid köşe butonu + profil "Tümünü indir" eklendi.
- Reels sekmesi grid'i: kutucuklar `<img>` değil CSS background-image → süzgeç düzeltildi.
- Kalite: uzun-kenar eşiğine göre orijinal doğrulama.

## `493702a` — Mağaza varlıkları, 10 dil, RTL, otomasyon
50 ekran görüntüsü, promo, ikonlar, gizlilik sayfası, mağaza metinleri, CI + release
workflow, RTL altyapısı, Firefox paketi + kaynak arşivi ilk kez.

## `eae02ed` — Grabowl'a yeniden adlandırma + SEO başlıkları
Marka InsDown→Grabowl (trademark riski). Başlıklar 61-71 karakter, dile göre farklı
anahtar kelime. Açıklamalarda "Instagram" 6→4. Alan adı grabowl.com kararlaştırıldı.

## `9c7d4ea` — Ekran görüntüsü sahne 5 vurgu düzeltmesi
Vurgu halkası ilerleme çubuğu yerine ana butona (sayıları kapatıyordu).

## `1626c53` — Kritik hatalar + güvenlik + avatar
İki denetim (güvenlik + kod kalitesi) → 6 P0 hatası (resume, kuyruk yarışı, boş
desen, SW eviction, sweep performansı, zip bloke) + güvenlik sertleştirmesi
(isTrustedAsset arka planda, sender doğrulama, dosya adı bidi/reserved, offscreen
serbest bırakma). Avatar indirme eklendi. Debug işaretleri silindi, iç işaretler
grabowl'a çevrildi. Test 115→123. Bkz [04-guvenlik](04-guvenlik.md).

## Sonraki (bekliyor)
Alan adı → mağaza gönderimi. Bkz [05-magaza](05-magaza.md), [06-kalan](06-kalan.md).
