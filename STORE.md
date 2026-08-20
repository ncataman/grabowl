# Store submission

Everything needed to publish InsDown to the Chrome Web Store, Microsoft Edge
Add-ons and Firefox AMO. All copy and artwork already exists in `store-assets/`;
this file says where each piece goes and in what order.

## Order of publication

**Firefox → Edge → Chrome.**

Firefox reviews fastest and its API can create the listing itself, so the first
live listing comes from there. Edge takes up to seven business days. Chrome is
slowest — `downloads` plus broad host permissions both trigger manual review, and
Google has had a submission backlog since April 2026 — so start it early and let
it run in parallel. Having two live listings also means a trademark complaint
against one store does not take the extension off the market.

## What is automatable, and what is not

| | First submission | Version updates | Listing text & images |
|---|---|---|---|
| Chrome | manual (v2 API removed item creation) | `wxt submit` | manual, dashboard only |
| Edge | manual (`CreateNotAllowed`) | `wxt submit` | manual, dashboard only |
| Firefox | `wxt submit` can do it | `wxt submit` | API or dashboard |

So: create the Chrome and Edge listings by hand once, add the secrets listed in
`.github/workflows/release.yml`, and every later version publishes from a git tag.

## Naming — the rule that matters most

Use **InsDown — Downloader for Instagram** (localized names are in
`store-assets/listing.json` and must stay byte-identical to `extName` in each
`public/_locales/<locale>/messages.json`; a test enforces this).

The brand must come first. What historically removes downloader extensions from
these stores is not the download feature — it is a Meta trademark complaint about
listings that lead with "Instagram" or reuse Instagram's iconography. So:

- Never lead with "Instagram"; use it only descriptively, after the brand.
- Never use Instagram's camera glyph or its purple-orange gradient. The shipped
  icon is a plain blue download mark, deliberately unrelated.
- Keep the disclaimer in every description: _Not affiliated with, endorsed by, or
  sponsored by Instagram or Meta._

## Assets

Regenerate any of these with `./store-assets/generate.sh --all` (screenshots) —
they are gitignored because they are reproducible.

| File | Size | Used by |
|---|---|---|
| `store-assets/screenshots/<locale>/1..5.png` | 1280×800 | Chrome (max 5), Edge (max 6), Firefox. Chrome and Firefox both accept per-locale sets. |
| `store-assets/promo/out/small-440x280.png` | 440×280 | Chrome small tile (listings without one are shown less prominently), Edge |
| `store-assets/promo/out/marquee-1400x560.png` | 1400×560 | Chrome marquee (featuring eligibility), Edge large tile |
| `store-assets/icons/store-icon-128.png` | 128×128, artwork 96×96 with 16px transparent padding | Chrome store icon, Firefox |
| `store-assets/icons/edge-logo-300.png` | 300×300 | Edge logo — required for **every** listing language |
| `store-assets/icons/amo-icon-512.png` | 512×512 | Firefox marketing icon |

Do not produce a 920×680 tile; that spec is retired.

The screenshots come from `store-assets/demo/index.html`, a reproduction of
Instagram's layout with invented accounts and generated artwork. Publishing
captures of real posts would put other people's photos and handles in our listing.

## Text

`store-assets/listing.json` holds, per locale: name, summary, long description
and Edge search terms. Limits already checked by `test/listing.test.ts`:

- **Name** ≤ 75 characters (Chrome; also drives the Edge name)
- **Summary** ≤ 132 characters — comes from the manifest, so it localizes
  automatically from `_locales`
- **Description** 250–10,000 characters — Edge enforces the 250 minimum, which is
  the binding constraint; Chrome and Firefox accept the same text
- **Edge search terms** ≤ 7 terms, ≤ 21 words total, ≤ 30 characters each

Feature claims are identical across languages on purpose: Chrome automatically
flags listings whose localized metadata describes a different feature set, and
that is the one realistic rejection risk of shipping ten languages.

## Languages

Ten: `en` (default), `tr`, `pt_BR`, `es`, `id`, `hi`, `ar`, `ru`, `de`, `fr`.

Edge enumerates a listing's languages from the package's `_locales` folders and
requires a description **and a logo** for each one. Chrome takes name and summary
from the manifest automatically and lets you add a localized description and
screenshots per locale in the dashboard. Firefox keeps one global screenshot set
with localizable captions.

## Permission justifications

Paste these into the Chrome privacy tab and the Edge certification notes.

| Permission | Justification |
|---|---|
| `downloads` | Saving the selected media to the user's download folder — the extension's only purpose. Used in `src/download/queue.ts`. |
| `storage` | Storing the user's own settings (filename pattern, concurrency, limits) and the paused state of a bulk download, so it survives service-worker eviction. `src/core/settings.ts`, `entrypoints/background.ts`. |
| `offscreen` | Building a .zip archive; MV3 service workers cannot create blob URLs. Chromium only. `src/download/zip-client.ts`. |
| `*://www.instagram.com/*`, `*://i.instagram.com/*` | Reading the media data Instagram already delivers to the page, and looking up a post's original file when that data is missing. `entrypoints/interceptor.content.ts`, `src/fallback/info-api.ts`. |
| `*://*.cdninstagram.com/*`, `*://*.fbcdn.net/*` | Instagram's media CDN — the hosts the actual files are downloaded from. |

## Data disclosure

Declare **no data collected** in every category. That is accurate: nothing leaves
the browser and there is no backend. Chrome's 1 August 2026 rules additionally
require the disclosure to be prominent, which is why the privacy paragraph
appears in the store description and on the options page as well.

Privacy policy: publish `store-assets/privacy/index.html` at
`https://<domain>/privacy/` and use that URL in all three listings. It carries the
policy in all ten languages, so one URL serves every localized listing.

## Fees and review

| Store | Fee | Review |
|---|---|---|
| Firefox AMO | free | usually minutes; demands the sources archive, which `npm run zip:firefox` produces |
| Edge Add-ons | free | up to 7 business days |
| Chrome Web Store | $5 one-time developer registration | days to weeks for this permission profile |

The $5 is a developer registration fee paid to Google. The extension is free for
users on every store.

## Install counts

No code needed, and none is shipped. Each store's dashboard reports installs,
uninstalls, weekly active users and country breakdowns with CSV export — Chrome's
is under Developer Dashboard → the item → Analytics.

## Still needed from the developer

1. A domain, for the privacy policy URL and `homepage_url` (currently the
   placeholder `https://insdown.app` in `wxt.config.ts` and `package.json`).
2. Edge Partner Center and Firefox AMO accounts — both free.
3. The one-time manual listing creation on Chrome and Edge.
4. API credentials added as repository secrets; see `.github/workflows/release.yml`.
