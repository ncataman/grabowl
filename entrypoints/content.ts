/**
 * ISOLATED-world content script: receives media from the interceptor, keeps the
 * per-tab index, mounts the overlay buttons and resolves what a click should save.
 *
 * Runs at document_start so the bridge listener exists before the interceptor
 * publishes anything; the UI waits for the DOM separately.
 */
import { browser } from '../src/lib/browser';
import { log } from '../src/lib/logger';
import { MediaIndex } from '../src/core/media-index';
import {
  PAGE_BRIDGE_SOURCE,
  type BulkProgress,
  type Message,
  type MessageResult,
  type PageBridgeMessage,
} from '../src/core/messaging';
import { usernameFromProfileUrl } from '../src/core/csrf';
import { pickAdapter } from '../src/adapters/registry';
import type { MediaSurface } from '../src/adapters/selectors';
import { AnchorController } from '../src/ui/anchor';
import { mountProfileButton, type ProfileButtonHandle } from '../src/ui/profile-button';
import { loadSettings } from '../src/core/settings';
import { fetchMediaByShortcode } from '../src/fallback/info-api';
import { scrapeSurface } from '../src/fallback/dom-scrape';
import { paginateProfile } from '../src/fallback/profile-feed';
import { t } from '../src/ui/i18n-dom';
import type { MediaItem } from '../src/core/media-model';

export default defineContentScript({
  matches: ['*://www.instagram.com/*'],
  runAt: 'document_start',
  main() {
    // Proof of injection, readable from the page for diagnosis.
    document.documentElement.setAttribute('data-insdown', 'ready');
    const index = new MediaIndex();

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data as PageBridgeMessage | undefined;
      if (data?.source !== PAGE_BRIDGE_SOURCE || data.kind !== 'MEDIA_FOUND') return;
      index.upsert(data.items);
    });

    // Tell the interceptor we are listening so it can flush what it captured
    // before this script existed.
    const ready: PageBridgeMessage = { source: PAGE_BRIDGE_SOURCE, kind: 'BRIDGE_READY' };
    window.postMessage(ready, location.origin);

    /**
     * Identify the media by what is currently on screen. Stories and highlights
     * expose no shortcode anywhere in the DOM, so matching the visible asset
     * against the index is the only way to name them — and their videos are
     * blob: URLs, which makes scraping useless as a fallback.
     */
    function resolveVisible(mediaEl: HTMLElement | null) {
      if (!mediaEl) return undefined;
      const asset =
        mediaEl instanceof HTMLImageElement
          ? mediaEl.currentSrc || mediaEl.src
          : mediaEl instanceof HTMLVideoElement
            ? mediaEl.poster
            : '';
      return asset ? index.findByAssetUrl(asset) : undefined;
    }

    /**
     * Three-tier resolution: whatever Instagram already sent us, then a direct
     * API call, then whatever is painted on screen.
     */
    async function resolve(surface: MediaSurface): Promise<MediaItem> {
      // Re-read everything rather than trusting what was captured at mount time:
      // Instagram recycles feed containers, so this element may hold a different
      // post, and a different <img>/<video>, than it did when the button appeared.
      const adapter = pickAdapter();
      const shortcode = adapter.shortcodeOf(surface.container) ?? surface.shortcode;
      const mediaEl = adapter.mediaElOf(surface.container) ?? surface.mediaEl;

      if (surface.kind === 'story') {
        const match = resolveVisible(mediaEl);
        if (match) return match.item;
      }

      if (shortcode) {
        const indexed = index.getByShortcode(shortcode);
        if (indexed) return indexed;

        try {
          const fetched = await fetchMediaByShortcode(shortcode);
          if (fetched) {
            index.upsert([fetched]);
            return fetched;
          }
        } catch (error) {
          log.warn('info API fallback failed', error);
        }
      }

      // Whatever is on screen, matched against the index, beats scraping the DOM:
      // it yields the original file rather than the rendered-size copy.
      const visible = resolveVisible(mediaEl);
      if (visible) return visible.item;

      // A grid tile only ever shows a small thumbnail, so scraping it would save
      // a downscaled copy. Refusing is the right answer: the promise is the
      // original file, and a silent quality downgrade is worse than an error.
      if (surface.kind === 'grid') throw new Error(t('errorThumbnailOnly'));

      const scraped = scrapeSurface(mediaEl, shortcode);
      if (scraped) return scraped;

      throw new Error(t('errorNoMedia'));
    }

    /**
     * Instagram hands out several renditions of the same post, and the copy
     * embedded in a feed or grid payload is often a preview-grade encode. When
     * what we hold looks smaller than Instagram's usual full size, ask for the
     * post directly and keep whichever is larger. The result is cached in the
     * index, so this costs at most one request per post.
     */
    const FULL_SIZE_PIXELS = 1080 * 1080;

    async function ensureBestQuality(item: MediaItem): Promise<MediaItem> {
      const code = item.shortcode;
      if (!code) return item;

      const pixels = Math.max(
        0,
        ...item.slides.map((s) => (s.width ?? 0) * (s.height ?? 0)),
      );
      if (pixels >= FULL_SIZE_PIXELS) return item;

      try {
        const fetched = await fetchMediaByShortcode(code);
        if (fetched) {
          // upsert keeps whichever record is richer, so this cannot downgrade.
          index.upsert([fetched]);
          return index.getByShortcode(code) ?? item;
        }
      } catch (error) {
        log.warn('quality upgrade failed', error);
      }
      return item;
    }

    /** Send to the background and surface its failure instead of reporting success. */
    async function download(item: MediaItem, slideIndices?: number[]) {
      const result = (await browser.runtime.sendMessage({
        t: 'DOWNLOAD',
        item,
        slideIndices,
      } as Message)) as MessageResult | undefined;

      if (!result?.ok) throw new Error(result?.error ?? t('errorDownloadFailed'));
    }

    /** The profile header button, re-mounted as the user moves between profiles. */
    let profileButton: ProfileButtonHandle | undefined;
    let profileButtonFor: string | undefined;

    function syncProfileButton() {
      const username = usernameFromProfileUrl(location.href);
      const header = username ? pickAdapter().profileHeader(document) : null;

      if (!header || !username) {
        profileButton?.destroy();
        profileButton = undefined;
        profileButtonFor = undefined;
        return;
      }

      if (profileButtonFor === username && header.querySelector('[data-insdown-profile]')) return;

      profileButton?.destroy();
      profileButtonFor = username;
      profileButton = mountProfileButton(header, async () => {
        const settings = await loadSettings();
        const items = await collectBulk(username, settings.activePagination, settings.bulkCap);
        if (!items.length) throw new Error(t('popupNothingFound'));

        const result = (await browser.runtime.sendMessage({
          t: 'BULK_START',
          username,
          items,
          options: { zip: settings.zipBulk },
        } as Message)) as MessageResult | undefined;

        if (!result?.ok) throw new Error(result?.error ?? t('errorDownloadFailed'));
      });
    }

    // Bulk progress belongs on the button the user pressed, not only in the popup.
    browser.runtime.onMessage.addListener((raw: unknown) => {
      const message = raw as { t?: string; progress?: BulkProgress };
      if (message?.t !== 'BULK_PROGRESS' || !message.progress || !profileButton) return;
      const { status, done, total } = message.progress;
      if (status === 'running') profileButton.setProgress(done, total);
      else profileButton.setIdle(status === 'done' ? t('overlaySaved') : undefined);
    });

    let gridButton: 'hover' | 'always' = 'hover';
    void loadSettings().then((s) => {
      gridButton = s.gridButton;
    });
    // Applying a settings change without a page reload.
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.settings) return;
      const next = (changes.settings.newValue as { gridButton?: 'hover' | 'always' })?.gridButton;
      if (!next || next === gridButton) return;
      gridButton = next;
      document
        .querySelectorAll('[data-insdown-button]')
        .forEach((el) => el.parentElement?.removeAttribute('data-insdown-mounted'));
      controller.sweep();
    });

    const controller = new AnchorController({
      onSweep: syncProfileButton,
      gridButtonVisibility: () => gridButton,
      actionsFor(surface) {
        const known = surface.shortcode ? index.getByShortcode(surface.shortcode) : undefined;
        const slideCount = known?.slides.length ?? 1;

        return {
          slideCount,
          async onDownload() {
            const item = await ensureBestQuality(await resolve(surface));
            // Read the active slide now, not at mount time: Instagram swaps slides
            // without recreating the container.
            const slideIndex =
              item.slides.length > 1 ? pickAdapter().activeSlideIndex(surface.container) : 0;
            await download(item, [Math.min(slideIndex, item.slides.length - 1)]);
          },
          async onDownloadAll() {
            await download(await ensureBestQuality(await resolve(surface)));
          },
        };
      },
    });

    /**
     * Gather everything for a profile. What the user has already scrolled past is
     * free — the interceptor captured it. Reaching further back means asking
     * Instagram directly, which is opt-in and deliberately slow.
     */
    async function collectBulk(username: string, activePagination: boolean, cap: number) {
      if (!activePagination) return index.byUsername(username).slice(0, cap);

      try {
        index.upsert(await paginateProfile(username, { cap }));
      } catch (error) {
        log.warn('profile pagination failed', error);
        // Fall through: whatever was scrolled past is still worth downloading.
      }
      return index.byUsername(username).slice(0, cap);
    }

    browser.runtime.onMessage.addListener(
      (raw: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
        const message = raw as Message;

        if (message?.t === 'QUERY_TAB_MEDIA') {
          const username = usernameFromProfileUrl(location.href);
          sendResponse({
            ok: true,
            value: {
              username,
              total: index.size,
              items: username ? index.byUsername(username) : [],
            },
          });
          return true;
        }

        if (message?.t === 'COLLECT_BULK') {
          collectBulk(message.username, message.activePagination, message.cap)
            .then((items) => sendResponse({ ok: true, value: items }))
            .catch((error) => sendResponse({ ok: false, error: String(error) }));
          return true;
        }

        return false;
      },
    );

    function startUi() {
      document.documentElement.setAttribute('data-insdown', 'ui');
      controller.start();

      // Mount buttons that only became possible once a payload arrived — a post
      // whose carousel slides came in a later response needs its "All N" button.
      // Debounced because the interceptor fires on every response while scrolling.
      let sweepTimer = 0;
      index.onChange(() => {
        window.clearTimeout(sweepTimer);
        sweepTimer = window.setTimeout(() => controller.sweep(), 600);
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startUi, { once: true });
    } else {
      startUi();
    }
  },
});
