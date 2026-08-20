/**
 * In-memory index of every media object Instagram has delivered to this tab.
 * Populated passively by the MAIN-world interceptor, read by the overlay buttons
 * and by bulk download.
 */
import type { MediaItem } from './media-model';

const CAPACITY = 800;

/**
 * Only Instagram's own CDNs may become download URLs. The interceptor
 * communicates over window.postMessage, which any script on the page can also
 * post to, so this is what stops a hostile page from getting arbitrary URLs
 * into the download queue.
 */
const ALLOWED_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com)$/;

function isTrustedAsset(url: string | undefined): boolean {
  if (!url) return true; // optional fields (thumbnails) may be absent
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.test(parsed.hostname);
  } catch {
    return false;
  }
}

function isTrusted(item: MediaItem): boolean {
  return item.slides.length > 0 && item.slides.every((s) => isTrustedAsset(s.url));
}

export class MediaIndex {
  private byPk = new Map<string, MediaItem>();
  private shortcodeToPk = new Map<string, string>();
  private listeners = new Set<() => void>();

  upsert(items: MediaItem[]): number {
    let changed = 0;
    for (const item of items) {
      if (!isTrusted(item)) continue;

      const existing = this.byPk.get(item.pk);
      const merged = existing ? mergeItems(existing, item) : item;
      if (existing && !differs(existing, merged)) continue;

      this.byPk.set(item.pk, merged);
      if (merged.shortcode) this.shortcodeToPk.set(merged.shortcode, item.pk);
      changed++;
    }

    while (this.byPk.size > CAPACITY) {
      const oldest = this.byPk.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const evicted = this.byPk.get(oldest);
      this.byPk.delete(oldest);
      // Drop the alias too, or this map grows unbounded for the tab's lifetime.
      if (evicted?.shortcode) this.shortcodeToPk.delete(evicted.shortcode);
    }

    // Notify on any change, not just new posts: a post whose carousel slides
    // only arrive in a later payload is exactly when the UI needs to re-render.
    if (changed) this.listeners.forEach((fn) => fn());
    return changed;
  }

  getByPk(pk: string): MediaItem | undefined {
    return this.byPk.get(pk);
  }

  getByShortcode(shortcode: string): MediaItem | undefined {
    const pk = this.shortcodeToPk.get(shortcode);
    return pk ? this.byPk.get(pk) : undefined;
  }

  /**
   * Find the item that owns a CDN asset already painted on screen.
   *
   * Stories and highlights carry no shortcode in the DOM, so this is how a story
   * is identified: match the visible image (or a video's poster) against the
   * assets Instagram delivered. CDN URLs keep a stable path while their query
   * signature changes, so only the pathname is compared.
   */
  findByAssetUrl(assetUrl: string): { item: MediaItem; slideIndex: number } | undefined {
    const key = pathnameOf(assetUrl);
    if (!key) return undefined;

    for (const item of this.byPk.values()) {
      const slideIndex = item.slides.findIndex(
        (slide) => pathnameOf(slide.url) === key || pathnameOf(slide.thumbUrl) === key,
      );
      if (slideIndex >= 0) return { item, slideIndex };
    }
    return undefined;
  }

  /** Every item belonging to a username, newest first — the bulk download source. */
  byUsername(username: string): MediaItem[] {
    const lower = username.toLowerCase();
    return [...this.byPk.values()]
      .filter((item) => item.username?.toLowerCase() === lower)
      .sort((a, b) => (b.takenAt ?? 0) - (a.takenAt ?? 0));
  }

  get size(): number {
    return this.byPk.size;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

function pathnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

/** Pixel count, so a portrait reel is not judged by its narrow width. */
function bestPixels(item: MediaItem): number {
  return Math.max(0, ...item.slides.map((s) => (s.width ?? 0) * (s.height ?? 0)));
}

/**
 * Payloads arrive partial and in any order, so keep whichever record is richer
 * rather than whichever arrived last: more slides wins, then higher resolution.
 */
function mergeItems(a: MediaItem, b: MediaItem): MediaItem {
  const bIsRicher =
    b.slides.length > a.slides.length ||
    (b.slides.length === a.slides.length && bestPixels(b) > bestPixels(a));

  const richer = bIsRicher ? b : a;
  return {
    ...a,
    ...b,
    type: richer.type,
    slides: richer.slides,
    username: b.username ?? a.username,
    shortcode: b.shortcode ?? a.shortcode,
    takenAt: b.takenAt ?? a.takenAt,
  };
}

/** Whether a merge actually produced something new worth notifying about. */
function differs(before: MediaItem, after: MediaItem): boolean {
  return (
    before.slides !== after.slides ||
    before.username !== after.username ||
    before.shortcode !== after.shortcode ||
    before.type !== after.type
  );
}
