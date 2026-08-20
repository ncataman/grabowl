# 02 — Mimari

## Araç
WXT + TypeScript + pnpm/npm. Tek kaynak → `wxt build -b chrome|firefox|edge`.
Popup/Options: hafif TS. Çıktı klasörü `build/` (varsayılan `.output` değil —
başında nokta olduğu için Finder/Chrome seçicisinde gizleniyordu).

## Medya yakalama — 3 katman (en sağlam → yedek)
1. **Pasif interception (birincil):** MAIN-world content script `document_start`'ta
   `JSON.parse` + `fetch` + `XHR` sarar. Instagram verileri `response.json()` ile
   okuyor → asıl veriyi **fetch/XHR hook'u** yakalar (JSON.parse tek başına neredeyse
   hiçbir şey görmez — bu erken bir hataydı, düzeltildi). doc_id rotasyonundan
   etkilenmez, ekstra istek atmaz. `entrypoints/interceptor.content.ts`.
2. **On-demand fallback:** `/api/v1/media/{pk}/info/` — sayfa oturumuyla, throttle'lı.
   `src/fallback/info-api.ts`, `src/core/csrf.ts` (shortcode→pk, header'lar).
3. **DOM scraping:** son çare, sadece foto (video blob URL). `src/fallback/dom-scrape.ts`.

## Köprü ve indeks
Interceptor → `window.postMessage({source:'grabowl',...})` → ISOLATED content
script (`entrypoints/content.ts`) → `MediaIndex` (`src/core/media-index.ts`).
**Güvenlik sınırı:** indekse yalnızca Instagram CDN (https) URL'leri girer
(`isTrustedAsset`). Arka planda da tekrar uygulanır (bkz [04-guvenlik](04-guvenlik.md)).

## Buton yerleştirme
`src/ui/anchor.ts` — SPA rota takibi (pushState patch + popstate + URL poll) +
debounce'lu MutationObserver. `src/adapters/dom-2026-08.ts` — Instagram DOM
varsayımları (eylem çubuğu bulma, grid kutucuğu, aktif kare, profil başlığı ayrımı).
Butonlar Shadow DOM içinde (CSS çakışması sıfır). `src/ui/overlay.ts` (eylem çubuğu
+ grid köşe butonu), `src/ui/profile-button.ts` (profil başlığı + avatar).

## İndirme
`entrypoints/background.ts` — indirme kuyruğu, toplu oturum, zip orkestrasyon.
`src/download/queue.ts` — eşzamanlılık limitli kuyruk; tamamlanma
`downloads.onChanged` ile sayılır (download() promise'i transfer *başladığında*
çözülür). **Tek üst-seviye `onChanged` dinleyicisi** (MV3 worker uyanması için).
Zip: MV3 SW'de `createObjectURL` yok → offscreen doküman (`src/download/zip-*.ts`).

## Dayanıklılık (Instagram DOM değişince)
Tüm DOM varsayımları `src/adapters/` içinde, tarihli adapter'larda. Değişince yeni
tarihli adapter yazıp `registry.ts` başına eklenir; gerisi el değmez. Medya
ayrıştırma DOM'a değil API payload'ına bağlı, etkilenmez.

## Kilit dosyalar
- `entrypoints/{interceptor.content,content,background}.ts`
- `src/adapters/dom-2026-08.ts`, `src/ui/{anchor,overlay,profile-button}.ts`
- `src/core/{media-index,parse-media,filename,settings,csrf,throttle}.ts`
- `src/download/{queue,zip-client,zip-worker}.ts`
- `src/fallback/{info-api,profile-feed,dom-scrape}.ts`
- Detaylı tasarım notları: repo kökü `README.md` "Design notes" bölümü.
