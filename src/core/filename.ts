/** Filename pattern expansion for downloads. */
import type { MediaItem, MediaSlide } from './media-model';

export const DEFAULT_PATTERN = 'Grabowl/{username}/{date}_{shortcode}_{index}.{ext}';

/** Windows refuses these as file or directory names, with or without extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * Make one path segment safe for downloads.filename.
 * Also strips Unicode bidi overrides: a username or shortcode comes straight
 * from the (possibly forged) payload, and an embedded RTL override could spoof
 * how the name reads on the download shelf.
 */
export function sanitizeSegment(value: string): string {
  const cleaned = value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '_')
    .replace(/[. ]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  if (!cleaned) return 'unknown';
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
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
    .map((segment) => sanitizeSegment(segment))
    .join('/');
}
