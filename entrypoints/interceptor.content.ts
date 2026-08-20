/**
 * MAIN-world interceptor.
 *
 * Instagram parses every API response through JSON.parse, so wrapping it captures
 * media for whatever query the app happens to run — including GraphQL doc_ids that
 * rotate every few weeks. Wrapping fetch as well covers the case where the JSON
 * hook could not be installed. Both must be in place before Instagram's SES
 * lockdown freezes intrinsics, hence run_at: document_start.
 *
 * Everything here is defensive: a throw in this file would break instagram.com.
 */
import { collectMedia } from '../src/core/parse-media';
import { PAGE_BRIDGE_SOURCE, type PageBridgeMessage } from '../src/core/messaging';
import type { MediaItem } from '../src/core/media-model';

const INSTALLED_FLAG = '__grabowl_installed__';

/** Whichever JSON.parse existed before we touched it. */
const nativeParse = JSON.parse;

/**
 * The content script may not have its listener attached yet — two content
 * scripts at document_start have no guaranteed order — so hold early captures
 * until it says hello. Without this, everything from the server-rendered page
 * is lost and the first post always falls through to the slower API lookup.
 */
let bridgeReady = false;
const pending: MediaItem[] = [];
const PENDING_LIMIT = 400;

function post(items: MediaItem[]) {
  const message: PageBridgeMessage = { source: PAGE_BRIDGE_SOURCE, kind: 'MEDIA_FOUND', items };
  window.postMessage(message, location.origin);
}

function publish(items: MediaItem[]) {
  if (!items.length) return;
  if (bridgeReady) {
    post(items);
    return;
  }
  pending.push(...items);
  if (pending.length > PENDING_LIMIT) pending.splice(0, pending.length - PENDING_LIMIT);
}

/** Cheap pre-filter: skip the walk unless the raw text mentions a media field. */
function looksLikeMedia(text: string): boolean {
  return (
    text.includes('image_versions2') ||
    text.includes('video_versions') ||
    text.includes('carousel_media') ||
    text.includes('display_url')
  );
}

function scan(value: unknown) {
  try {
    publish(collectMedia(value));
  } catch {
    /* never let parsing break the page */
  }
}

function installJsonHook() {
  const patched: typeof JSON.parse = function (this: unknown, text: any, reviver?: any) {
    const result = nativeParse.call(this, text, reviver);
    try {
      if (typeof text === 'string' && text.length > 200 && looksLikeMedia(text)) scan(result);
    } catch {
      /* ignore */
    }
    return result;
  };
  try {
    JSON.parse = patched;
  } catch {
    // JSON was already frozen by SES; the fetch hook and the info-API fallback carry us.
  }
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request | undefined)?.url ?? '';
}

function installFetchHook() {
  const originalFetch = window.fetch;
  if (typeof originalFetch !== 'function') return;

  const patched: typeof window.fetch = async function (this: unknown, ...args) {
    const response = await originalFetch.apply(this as any, args as any);
    try {
      // This is the path that actually carries Instagram's data: Response.json()
      // decodes natively and never touches JSON.parse, so the JSON hook alone
      // sees almost nothing. Duplicates are harmless — the index ignores them.
      if (!response.ok) return response;
      if (!/\/api\/v1\/|\/graphql/.test(urlOf(args[0]))) return response;

      response
        .clone()
        .text()
        .then((text) => {
          if (looksLikeMedia(text)) scan(nativeParse(text));
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
    return response;
  };

  try {
    window.fetch = patched;
  } catch {
    /* ignore */
  }
}

/** Instagram still issues some requests over XHR, which the fetch hook never sees. */
function installXhrHook() {
  const proto = XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  if (typeof originalOpen !== 'function') return;

  const URL_KEY = '__grabowlUrl';
  try {
    proto.open = function (this: any, ...args: any[]) {
      this[URL_KEY] = urlOf(args[1]);
      return (originalOpen as any).apply(this, args);
    };
  } catch {
    return;
  }

  const originalSend = proto.send;
  try {
    proto.send = function (this: any, ...args: any[]) {
      this.addEventListener('load', () => {
        try {
          const url: string = this[URL_KEY] ?? '';
          if (!/\/api\/v1\/|\/graphql/.test(url)) return;
          const text = typeof this.responseText === 'string' ? this.responseText : '';
          if (text.length > 200 && looksLikeMedia(text)) scan(nativeParse(text));
        } catch {
          /* ignore */
        }
      });
      return originalSend.apply(this, args as []);
    };
  } catch {
    /* ignore */
  }
}

/** Server-rendered pages embed the first post in RelayPrefetchedStreamCache script tags. */
function scanEmbeddedJson() {
  try {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      const text = script.textContent ?? '';
      if (text.length > 200 && looksLikeMedia(text)) scan(nativeParse(text));
    }
  } catch {
    /* ignore */
  }
}

export default defineContentScript({
  matches: ['*://www.instagram.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const w = window as any;
    if (w[INSTALLED_FLAG]) return;
    w[INSTALLED_FLAG] = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if ((event.data as any)?.source !== PAGE_BRIDGE_SOURCE) return;
      if ((event.data as any)?.kind !== 'BRIDGE_READY') return;
      bridgeReady = true;
      if (pending.length) post(pending.splice(0, pending.length));
    });

    installJsonHook();
    installFetchHook();
    installXhrHook();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scanEmbeddedJson, { once: true });
    } else {
      scanEmbeddedJson();
    }
  },
});
