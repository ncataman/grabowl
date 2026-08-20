# 01 — Ürün ve Özellikler

## Ne yapar
Instagram medyasını indirir. Buton Instagram'ın **kendi eylem çubuğunun içinde**
durur (beğen/yorum/paylaş/kaydet sırasında), yüzen bir katman değil. Yerini sınıf
adından veya "Beğen" gibi etiketlerden değil **yapıdan** bulur (4+ ikon buton kümesi),
bu yüzden her dilde ve Instagram güncellemelerine karşı dayanıklı.

## Yüzey yüzey davranış
| Yüzey | Buton | Not |
|---|---|---|
| Feed fotoğraf/video | Eylem çubuğunda indirme ikonu | Orijinal çözünürlük |
| Reels oynatıcı | Sağ dikey rayda en üstte | En yüksek `video_versions` |
| Carousel | "Bu kare" + "Tümü N" | Aktif kare tıklama anında okunur (yanlış kare hatası yok) |
| Profil gönderi grid'i | Kutucuğa gelince sağ üstte köşe butonu | Gönderiyi açmadan indirir; thumbnail değil orijinal çözülür |
| Reels sekmesi grid'i | Aynı köşe butonu | Kutucuklar `<img>` değil CSS background-image kullanıyor (özel ele alındı) |
| Profil başlığı | Bio altında "Tümünü indir" + avatar butonu | İnstagram ikincil buton stili, tema sayfadan okunuyor |
| Story / öne çıkanlar | Story eylem satırında | Kod var, canlı doğrulanmadı |

## Kalite
Foto = `image_versions2.candidates[0]`; video = `video_versions[0]`; carousel =
her kare kendi versiyonlarıyla. Feed/grid önizleme kalitesinde olabildiği için,
1080px'in altındaysa indirmeden önce gönderi doğrudan sorgulanıp büyük olan seçilir
(`ensureBestQuality`, uzun-kenar eşiği).

## Toplu indirme
Varsayılan: kullanıcının scroll ile gördüğü gönderiler (sıfır ek istek, hesap riski
yok). Opt-in: aktif sayfalama (GraphQL timeline, 3-6 sn throttle, oturum başı ~200
limit, 429'da backoff). Duraklat/devam/iptal + ilerleme. Zip opsiyonel.

## Ücretsiz / gizlilik
Hesap yok, sınır yok, filigran yok, reklam yok, premium yok. Veri toplanmaz,
sunucu yok, telemetri yok. Kurulum sayısı mağaza panelinden görülür (kod gerekmez).

## Ayarlar (options sayfası)
Dosya adı deseni (canlı önizleme), eşzamanlı indirme, toplu limit, zip, grid buton
görünürlüğü (üstüne gelince / her zaman). Varsayılan desen:
`Grabowl/{username}/{date}_{shortcode}_{index}.{ext}`.
