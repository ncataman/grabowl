# Store submission notes

Everything needed for the Chrome Web Store, Edge Add-ons and Firefox AMO listings.
Publish in the order AMO → Edge → Chrome: AMO reviews fastest, and having two live
listings means a trademark complaint against one store is not fatal.

## Naming

Use **InsDown — Downloader for Instagram**.

The brand name must come first. Listings named plainly "Instagram Downloader" are
the ones Meta files trademark complaints against, and that — not the download
functionality — is what historically removes these extensions from the stores.

Rules to keep:

- Never lead with "Instagram"; use it only descriptively, after the brand.
- Never use Instagram's camera glyph or its purple-orange gradient in the icon.
  The shipped icon is a plain blue download mark, deliberately unrelated.
- Include the disclaimer in the description: _Not affiliated with, endorsed by, or
  sponsored by Instagram or Meta._

## Single-purpose statement

> Save Instagram photos, videos, reels, carousels and stories to your computer at
> their original quality.

## Description

```
InsDown adds a small download button to Instagram photos, videos, reels and
stories, and downloads whole profiles in one go.

• Original quality — the real file, never the on-screen preview
• Carousels — save the slide you are looking at, or all of them at once
• Reels, stories and highlights
• Bulk download from any profile, including the Reels tab, with pause and resume
• Custom filenames and per-account folders, optional .zip
• English and Turkish

Completely free. No account, no sign-up, no download limits, no watermarks, no
ads, no premium tier.

Privacy: InsDown collects nothing. No analytics, no telemetry, no servers. Media
goes straight from Instagram to your computer.

Downloaded media belongs to the people who created it — please respect their
rights and Instagram's terms.

Not affiliated with, endorsed by, or sponsored by Instagram or Meta.
```

## Permission justifications

| Permission | Justification |
|---|---|
| `downloads` | Saving the selected media to the user's download folder — the extension's only purpose. |
| `storage` | Storing the user's own settings (filename pattern, concurrency, limits). No user data. |
| `offscreen` | Building a .zip archive; MV3 service workers cannot create blob URLs. Chromium only. |
| `*://www.instagram.com/*`, `*://i.instagram.com/*` | Reading the media data Instagram delivers to the page and, when needed, looking up a post's original file. |
| `*://*.cdninstagram.com/*`, `*://*.fbcdn.net/*` | Instagram's media CDN — where the actual files are downloaded from. |

## Data disclosure form

Declare **no data collected** in every category. This is accurate: nothing leaves
the browser. Chrome Web Store policy from 1 August 2026 additionally requires that
disclosures be prominent, so keep the privacy paragraph in the store description
and the privacy section on the options page.

Privacy policy URL: host `PRIVACY.md` at a stable public address and link it in
all three listings.

## Screenshots (1280×800)

1. The download button on a feed photo, hovering.
2. A carousel with the "All 5" button visible.
3. The popup mid-bulk-download, progress bar partly filled.
4. The options page showing the filename pattern with its live preview.
5. A reel with the button in the player.

## Store fees and review

| Store | Fee | Review |
|---|---|---|
| Firefox AMO | free | usually minutes, automated |
| Edge Add-ons | free | up to 7 business days |
| Chrome Web Store | $5 one-time developer registration | hours to weeks; downloaders often get manual review |

The $5 is a developer registration fee paid to Google. The extension itself is free
for users on every store.

## Install counts

No code is needed. Each store's developer dashboard reports installs, uninstalls,
weekly active users and country breakdowns, with CSV export. Chrome's is under
Developer Dashboard → the item → Analytics.
