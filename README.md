# InsDown — Downloader for Instagram

Free browser extension that saves Instagram photos, videos, reels, carousels and
stories at original quality. No account, no limits, no paywall, and nothing is
collected about you.

Not affiliated with, endorsed by, or sponsored by Instagram or Meta.

## How it works

Instagram already sends your browser everything it displays. InsDown reads that
data as it arrives instead of scraping the page or calling Instagram's API on its
own, which is why it keeps working when Instagram rotates its internal query ids.

Resolution happens in three tiers, best first:

1. **Passive interception** — a `MAIN`-world content script wraps `JSON.parse` and
   `fetch` at `document_start` and indexes every media object Instagram delivers.
   Zero extra requests.
2. **Direct media lookup** — `api/v1/media/{pk}/info/` from the page's own session,
   throttled, only when the index misses a post.
3. **DOM scraping** — the last resort, and photos only: Instagram serves video
   through MediaSource, so `<video src>` is a `blob:` URL with nothing to fetch.

## Development

```bash
npm install
```

```bash
npm run dev
```

This starts a watcher that rebuilds and hot-reloads on save. Load
`build/chrome-mv3-dev` once via `chrome://extensions` → Developer mode → Load
unpacked; after that every change reaches the browser on its own.

Chrome removed the `--load-extension` command-line switch (gone as of Chrome
151) and blocks extensions from scripting `chrome://` pages, so that first load
cannot be automated by any tool — WXT prints the same instruction. For Firefox
use `npm run dev:firefox`.

Verify everything before shipping:

```bash
npm run check
```

That runs the type check, the unit tests and a production build.

### Building for the stores

```bash
npm run build:all
```

Outputs to `build/chrome-mv3`, `build/firefox-mv3` and `build/edge-mv3`.
Use `npm run zip`, `npm run zip:firefox` and `npm run zip:edge` for upload-ready
archives.

## Manual test plan

Automated end-to-end testing against instagram.com is not practical — it requires
a logged-in session and trips anti-bot defences. The pure logic (media parsing,
filename expansion, shortcode conversion, locale parity) is covered by
`npm test`; everything below is checked by hand against your own account.

| Surface | Steps | Expected |
|---|---|---|
| Feed photo | Click the download icon in the post's action row | Saves at full resolution, not the on-screen preview |
| Grid thumbnail | Hover a tile on a profile grid, click the corner button | Saves the original without opening the post |
| Reels tab grid | Same on `/{user}/reels/` | Buttons appear on reel tiles too |
| Profile header | Click "Download all" | Bulk starts, the button itself shows progress |
| Feed video / reel | Same on a video post and in the reels player's right-hand rail | Saves the highest `video_versions` entry as `.mp4` |
| Carousel, one slide | Swipe to slide 3, click download | Saves **slide 3**, not slide 1 |
| Carousel, all slides | Click "All N" | Saves every slide, numbered in order |
| Stories / highlights | Open a story, click download | Saves the visible segment |
| Post detail dialog | Open a post from the grid | Button appears in the dialog too |
| SPA navigation | Move feed → profile → post → back | Buttons keep appearing without a reload |
| Bulk | Scroll a profile, open the popup, start | Progress advances, pause/resume works, files land in a per-username folder |
| Bulk with reels | Do the same on the profile's Reels tab | Reels are included |
| Fallback | Disable the interceptor script, reload, download a post | Still works via the media lookup |
| Rate limiting | Enable "fetch older posts" and watch the network panel | Requests are 3–6s apart, never bursts |

## Layout

```
entrypoints/
  interceptor.content.ts  MAIN world — captures media from Instagram's own traffic
  content.ts              ISOLATED — index, overlay buttons, bulk collection
  background.ts           download queue, bulk session, zip orchestration
  offscreen/              zip building (Chromium only; Firefox does it in-place)
  popup/  options/        UI
src/
  core/       parsing, filename patterns, settings, throttling, shortcode math
  adapters/   every Instagram DOM assumption, versioned by date
  fallback/   media lookup, DOM scraping, profile pagination
  download/   queue and zip
  ui/         overlay button, anchoring, i18n helper
```

### Design notes worth knowing before changing things

- **The bridge handshake matters.** The interceptor buffers what it captures until
  the content script posts `BRIDGE_READY`. Two content scripts at `document_start`
  have no guaranteed order, and without the buffer everything from a
  server-rendered page load is lost.
- **Nothing captured at mount time is trusted at click time.** Instagram recycles
  feed containers, so the shortcode, the media element and the carousel slide
  index are all re-read when the button is pressed. This is what prevents the
  "downloaded the wrong post/slide" bugs that competing extensions are known for.
- **Only Instagram CDN URLs enter the index.** The interceptor talks over
  `window.postMessage`, which any script on the page can also post to, so
  `MediaIndex` rejects anything that is not https on an Instagram host.
- **Downloads are counted on completion, not on start.** `downloads.download`
  resolves when a transfer begins, so the queue tracks `downloads.onChanged` —
  otherwise the concurrency limit would do nothing and failures would be reported
  as successes.
- **The button lives in Instagram's own action bar**, found structurally by
  looking for a cluster of four or more icon buttons. Matching on aria-labels
  would break for every interface language; matching on class names would break
  on every deploy.
- **Grid tiles never fall back to scraping.** A tile only shows a thumbnail, so
  when the original cannot be resolved the button reports an error instead of
  saving a downscaled copy.
- **Instagram serves several renditions of the same post.** Feed and grid
  payloads often carry a preview-grade encode, so before saving anything below
  1080px the extension asks for the post directly and keeps the larger file.
- **A paused bulk run survives worker eviction.** MV3 kills an idle service
  worker in about 30 seconds, so the remaining files and the progress are
  persisted to session storage and the queue is rebuilt on resume.

### When Instagram changes its layout

Buttons stop appearing when Instagram's markup shifts. Every DOM assumption lives
in `src/adapters/`; add a new dated adapter implementing `SelectorSet`, register it
at the front of the list in `src/adapters/registry.ts`, and the rest of the code is
untouched. Media parsing is unaffected — that follows the API payloads, not the DOM.

## Privacy

See [PRIVACY.md](PRIVACY.md). Short version: no telemetry, no analytics, no
servers, no accounts. Install counts come from the store dashboards, which report
aggregates without any code in the extension.
