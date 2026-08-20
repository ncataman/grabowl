# Grabowl — Proje Wiki (Brifing Merkezi)

> Bu wiki, Grabowl tarayıcı eklentisinin tüm hikâyesini, kararlarını ve durumunu
> tutar. Yeni bir oturuma başlarken veya "wiki oku" dendiğinde **önce bu index'i,
> sonra ilgili sayfayı** okuyarak doğru brifingi al. Tarih: son güncelleme 2026-08-20.

## Bir cümlede

Grabowl = Instagram medya indirme tarayıcı eklentisi (Manifest V3; Chrome, Edge,
Firefox). Fotoğraf/video/reels/carousel/story'yi **orijinal kalitede**, Instagram'ın
kendi eylem çubuğuna gömülü bir butonla indirir. Ücretsiz, hesap gerekmez, veri
toplamaz. **1.0.0 kod olarak hazır; mağazaya gönderim alan adı bekliyor.**

## Sayfalar

- [00 — Durum özeti](00-durum.md) — şu an ne hazır, ne bekliyor (BURADAN BAŞLA)
- [01 — Ürün ve özellikler](01-urun.md) — ne yapıyor, hangi yüzeyler
- [02 — Mimari](02-mimari.md) — nasıl çalışıyor, kilit dosyalar, tasarım notları
- [03 — Kararlar](03-kararlar.md) — isim (Grabowl), trademark, diller, SEO/ASO
- [04 — Güvenlik](04-guvenlik.md) — denetim bulguları ve düzeltmeler
- [05 — Mağaza gönderimi](05-magaza.md) — adım adım yayın süreci
- [06 — Kalan işler](06-kalan.md) — açık maddeler, doğrulanmamış yüzeyler
- [07 — Değişiklik günlüğü](07-degisiklik.md) — kronolojik, commit'lerle

## Depo gerçekleri (hızlı referans)

- Konum: `/Users/ncataman/Desktop/insdown/` (tarihsel klasör adı "insdown"; ürün adı **Grabowl**)
- Sürüm: 1.0.0 · Diller: en, tr, pt_BR, es, id, hi, ar, ru, de, fr (10)
- Test: 123 geçiyor (`npm test`) · `npm run check` = tip + test + üç derleme
- Paketler: `build/grabowl-1.0.0-{chrome,edge,firefox,sources}.zip`
- Marka/gizlilik alan adı: **grabowl.com (henüz alınmadı — tek blokaj)**
- Detaylı geliştirici belgeleri: repo kökünde `README.md`, `STORE.md`, `PRIVACY.md`

## Kurallar (bu wiki'yi güncel tut)

Her önemli değişiklikten sonra ilgili sayfayı ve [07-degisiklik](07-degisiklik.md)'i
güncelle. Kod gerçeğiyle çelişen bir şey görürsen kodu esas al ve wiki'yi düzelt.
