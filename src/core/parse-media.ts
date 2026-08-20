/**
 * Turns Instagram's v1/iPhone-format media JSON into MediaItem.
 *
 * Instagram delivers this shape from /api/v1/media/{pk}/info/, from the Polaris
 * GraphQL responses (xdt_api__v1__* fields) and from the RelayPrefetchedStreamCache
 * script blobs, so one parser covers every source. The legacy web shape
 * (display_url / edge_sidecar_to_children) still shows up in older caches, so it is
 * handled as a secondary branch.
 */
import {
  MEDIA_TYPE_CAROUSEL,
  MEDIA_TYPE_VIDEO,
  type MediaItem,
  type MediaSlide,
} from './media-model';

type Json = Record<string, any>;

/** True when this object looks like an Instagram media node worth parsing. */
export function isMediaNode(value: unknown): value is Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const node = value as Json;
  if (!node.image_versions2 && !node.video_versions && !node.carousel_media && !node.display_url) {
    return false;
  }
  // A node without any identity is a fragment (e.g. a bare candidate list); skip it.
  return Boolean(node.pk ?? node.id ?? node.code ?? node.shortcode);
}

/** Pixel count, so a portrait rendition is not judged by its narrow width. */
function area(v: Json): number {
  return (v.width ?? 0) * (v.height ?? 0);
}

function pickImage(node: Json): MediaSlide | undefined {
  const candidates: Json[] = node.image_versions2?.candidates ?? [];
  // Instagram sorts best-first, but sort defensively: a thumbnail slipping
  // through here is the classic "downloaded a preview" bug. Sorting is stable,
  // so equal-sized renditions keep Instagram's own preference order.
  const best = [...candidates].sort((a, b) => area(b) - area(a))[0];
  if (best?.url) {
    return { kind: 'image', url: best.url, width: best.width, height: best.height };
  }
  if (typeof node.display_url === 'string') {
    return { kind: 'image', url: node.display_url, width: node.dimensions?.width, height: node.dimensions?.height };
  }
  return undefined;
}

function pickVideo(node: Json): MediaSlide | undefined {
  const versions: Json[] = node.video_versions ?? [];
  const best = [...versions].sort((a, b) => area(b) - area(a))[0];
  const url = best?.url ?? (typeof node.video_url === 'string' ? node.video_url : undefined);
  if (!url) return undefined;
  return {
    kind: 'video',
    url,
    width: best?.width,
    height: best?.height,
    thumbUrl: pickImage(node)?.url,
  };
}

function slideOf(node: Json): MediaSlide | undefined {
  const isVideo = node.media_type === MEDIA_TYPE_VIDEO || node.is_video === true || !!node.video_versions;
  return (isVideo ? pickVideo(node) : undefined) ?? pickImage(node);
}

function usernameOf(node: Json): string | undefined {
  return node.user?.username ?? node.owner?.username ?? node.caption?.user?.username;
}

/** Parse a single media node. Returns undefined when no usable source is present. */
export function parseMediaNode(node: Json): MediaItem | undefined {
  const pk = String(node.pk ?? node.id ?? '').split('_')[0];
  const shortcode: string | undefined = node.code ?? node.shortcode;
  if (!pk && !shortcode) return undefined;

  const children: Json[] =
    node.carousel_media ?? node.edge_sidecar_to_children?.edges?.map((e: Json) => e.node) ?? [];

  const slides = (children.length ? children : [node])
    .map(slideOf)
    .filter((s): s is MediaSlide => !!s);
  if (!slides.length) return undefined;

  const isCarousel = node.media_type === MEDIA_TYPE_CAROUSEL || children.length > 1;
  const type = isCarousel ? 'carousel' : slides[0].kind;

  return {
    pk: pk || shortcode!,
    shortcode,
    type,
    username: usernameOf(node),
    takenAt: node.taken_at ?? node.taken_at_timestamp,
    slides,
  };
}

/**
 * Deep enough for prefetch blobs, which wrap the media payload in several
 * __bbox / result / array levels before the familiar `data` object begins.
 */
const MAX_DEPTH = 20;

/**
 * Walk an arbitrary parsed JSON payload and collect every media node inside it.
 * Bounded in depth and guarded against cycles so a hostile or huge payload can
 * never hang the page — this runs inside the intercepted JSON.parse.
 */
export function collectMedia(root: unknown): MediaItem[] {
  const found: MediaItem[] = [];
  const seen = new WeakSet<object>();

  const walk = (value: unknown, depth: number) => {
    if (depth > MAX_DEPTH || !value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, depth + 1);
      return;
    }

    const node = value as Json;
    if (isMediaNode(node)) {
      const item = parseMediaNode(node);
      if (item) {
        found.push(item);
        // Do not descend into the slides we just absorbed: each carousel child
        // is itself a media node, and indexing them separately would turn one
        // post into N phantom posts.
        for (const [key, entry] of Object.entries(node)) {
          if (key !== 'carousel_media' && key !== 'edge_sidecar_to_children') walk(entry, depth + 1);
        }
        return;
      }
    }
    for (const entry of Object.values(node)) walk(entry, depth + 1);
  };

  walk(root, 0);
  return found;
}
