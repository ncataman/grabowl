/** Filename pattern expansion for downloads. */
import type { MediaItem, MediaSlide } from './media-model';

export const DEFAULT_PATTERN = 'InsDown/{username}/{date}_{shortcode}_{index}.{ext}';

/** Strip characters Chrome rejects in downloads.filename, keeping the path separators. */
function sanitizeSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'unknown';
}

function extensionOf(slide: MediaSlide): string {
  const path = (() => {
    try {
      return new URL(slide.url).pathname;
    } catch {
      return slide.url;
    }
  })();
  const match = /\.(jpe?g|png|webp|heic|mp4|mov|webm)(?=$|\?)/i.exec(path);
  if (match) return match[1].toLowerCase();
  return slide.kind === 'video' ? 'mp4' : 'jpg';
}

function isoDate(takenAt?: number): string {
  const ms = takenAt ? takenAt * 1000 : Date.now();
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Expand a pattern into a download path.
 * Tokens: {username} {shortcode} {pk} {date} {index} {ext}
 * `index` is 1-based and only meaningful for carousels.
 */
export function buildFilename(
  pattern: string,
  item: MediaItem,
  slide: MediaSlide,
  slideIndex: number,
): string {
  const tokens: Record<string, string> = {
    username: sanitizeSegment(item.username ?? 'instagram'),
    shortcode: sanitizeSegment(item.shortcode ?? item.pk),
    pk: sanitizeSegment(item.pk),
    date: isoDate(item.takenAt),
    index: String(slideIndex + 1).padStart(2, '0'),
    ext: extensionOf(slide),
  };

  const expanded = pattern.replace(/\{(\w+)\}/g, (whole, key: string) => tokens[key] ?? whole);

  // Sanitize each path segment but keep the folder structure the pattern asked for.
  return expanded
    .split('/')
    .filter(Boolean)
    .map((segment, i, all) => (i === all.length - 1 ? segment.replace(/[<>:"\\|?*\x00-\x1f]/g, '_') : sanitizeSegment(segment)))
    .join('/');
}
