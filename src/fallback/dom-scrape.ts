/**
 * Last resort: read what is already painted on screen.
 *
 * Only useful for photos. Instagram serves reels and feed video through
 * MediaSource, so <video src> is a blob: URL with no downloadable origin — in that
 * case we return nothing and the caller tells the user to open the post directly.
 */
import type { MediaItem, MediaSlide } from '../core/media-model';

/** Pick the widest entry of a srcset. */
function widestFromSrcset(srcset: string): { url: string; width?: number } | undefined {
  const entries = srcset
    .split(',')
    .map((part) => part.trim())
    .map((part) => {
      const [url, descriptor] = part.split(/\s+/);
      const width = descriptor?.endsWith('w') ? parseInt(descriptor, 10) : undefined;
      return { url, width };
    })
    .filter((entry) => entry.url);
  return entries.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
}

export function scrapeSurface(
  mediaEl: HTMLElement | null,
  shortcode: string | undefined,
): MediaItem | undefined {
  if (!mediaEl) return undefined;

  if (mediaEl instanceof HTMLVideoElement) {
    const src = mediaEl.currentSrc || mediaEl.src;
    if (!src || src.startsWith('blob:')) return undefined;
    const slide: MediaSlide = { kind: 'video', url: src };
    return { pk: shortcode ?? src, shortcode, type: 'video', slides: [slide] };
  }

  if (mediaEl instanceof HTMLImageElement) {
    const best = mediaEl.srcset ? widestFromSrcset(mediaEl.srcset) : undefined;
    const url = best?.url ?? (mediaEl.currentSrc || mediaEl.src);
    if (!url) return undefined;
    const slide: MediaSlide = { kind: 'image', url, width: best?.width };
    return { pk: shortcode ?? url, shortcode, type: 'image', slides: [slide] };
  }

  return undefined;
}
