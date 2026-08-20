/**
 * Instagram DOM adapter, August 2026.
 *
 * Buttons anchor to Instagram's own action bar — the row (or rail) holding like,
 * comment, share and save — found structurally by looking for a cluster of icon
 * buttons. That survives class-name churn and works in every interface language.
 * Grid tiles have no action bar, so they get a corner button instead.
 *
 * Verified live against the feed, the reels player and profile grids.
 */
import { shortcodeFromUrl, usernameFromProfileUrl } from '../core/csrf';
import type { ActionBar, MediaSurface, SelectorSet } from './selectors';

/** Buttons Instagram renders as an icon: `[role=button]`/`button` wrapping an svg. */
function iconButtons(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="button"], button')].filter((b) =>
    b.querySelector('svg[aria-label]'),
  );
}

function onStoryRoute(): boolean {
  return location.pathname.startsWith('/stories/');
}

/**
 * Minimum icons for a cluster to count as an action bar. Four separates the real
 * bar (like, comment, share, save — or more) from the video control overlay,
 * which only ever holds mute and play. The story viewer's row is smaller, so it
 * needs a lower bar; its controls are disambiguated by document order below.
 */
function minActionIcons(): number {
  return onStoryRoute() ? 2 : 4;
}

function findActionBars(root: ParentNode): HTMLElement[] {
  const candidates = new Set<HTMLElement>();
  const minimum = minActionIcons();

  for (const button of iconButtons(root)) {
    let node = button.parentElement;
    for (let depth = 0; node && depth < 7; depth++) {
      if (iconButtons(node).length >= minimum) {
        candidates.add(node);
        break;
      }
      node = node.parentElement;
    }
  }

  // Keep the innermost cluster of any nested pair, otherwise a container holding
  // every reel on the page would qualify as one enormous bar.
  const bars = [...candidates];
  return bars.filter((bar) => !bars.some((other) => other !== bar && bar.contains(other)));
}

function visibleMediaIn(container: HTMLElement): HTMLElement | null {
  const video = container.querySelector<HTMLVideoElement>('video');
  if (video) return video;

  // naturalWidth rather than layout size: a background tab reports every box as
  // zero, and it is also what separates the post from the author's avatar.
  const images = [...container.querySelectorAll('img')].filter((img) => img.naturalWidth > 200);
  return images.sort((a, b) => b.naturalWidth - a.naturalWidth)[0] ?? null;
}

/**
 * The post, reel or story an action bar belongs to: the nearest ancestor that
 * actually contains the media. The test has to be "real media", not "any image" —
 * the author's avatar sits much closer to the bar than the photo does, and
 * stopping there finds a container with nothing downloadable in it.
 */
function ownerOf(bar: HTMLElement): { container: HTMLElement; mediaEl: HTMLElement } | null {
  let node: HTMLElement | null = bar;
  for (let depth = 0; node && depth < 12; depth++) {
    const mediaEl = visibleMediaIn(node);
    if (mediaEl) return { container: node, mediaEl };
    node = node.parentElement;
  }
  return null;
}

/** True when this element is the one the viewer is actually looking at. */
function isCentredInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (!rect.height) return false;
  const centre = window.innerHeight / 2;
  return rect.top <= centre && rect.bottom >= centre;
}

function shortcodeOf(container: HTMLElement): string | undefined {
  const link = container.querySelector<HTMLAnchorElement>(
    'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
  );
  const fromLink = link?.getAttribute('href');
  if (fromLink) return shortcodeFromUrl(fromLink);

  // The reels player puts no permalink in the DOM and keeps the scrolled-past
  // reel's code in the address bar, so the URL may only be trusted for whichever
  // reel is currently on screen.
  const single = /\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/.test(location.pathname);
  if (single && isCentredInViewport(container)) return shortcodeFromUrl(location.pathname);
  return undefined;
}

/**
 * Whether a tile paints its thumbnail through CSS instead of an <img>.
 * Bounded to the tile's own subtree and stops at the first hit, so this stays
 * cheap even though it reads computed style.
 */
function hasBackgroundImage(tile: HTMLElement): boolean {
  for (const el of tile.querySelectorAll<HTMLElement>('*')) {
    if (getComputedStyle(el).backgroundImage !== 'none') return true;
  }
  return false;
}

/** Thumbnail tiles on profile grids, explore and tag pages. */
function findGridTiles(root: ParentNode): MediaSurface[] {
  const tiles = [...root.querySelectorAll<HTMLAnchorElement>('main a[href*="/p/"], main a[href*="/reel/"], main a[href*="/tv/"]')];

  return tiles
    // A tile shows a thumbnail; the bare permalink on a feed post's timestamp
    // does not, and must not sprout a download button. The reels tab paints its
    // covers with CSS background-image rather than <img>, so element type alone
    // is not enough of a test.
    .filter((tile) => tile.querySelector('img, video, canvas') || hasBackgroundImage(tile))
    .map((tile) => ({
      container: tile as HTMLElement,
      kind: 'grid' as const,
      // Deliberately null: the tile's own image is a low-resolution thumbnail and
      // must never be what gets saved.
      mediaEl: null,
      shortcode: shortcodeFromUrl(tile.getAttribute('href') ?? ''),
    }))
    .filter((surface) => !!surface.shortcode);
}

export const adapter202608: SelectorSet = {
  id: 'dom-2026-08',

  selfTest(root) {
    return (
      findActionBars(root).length > 0 ||
      Boolean(root.querySelector('article, main video, main a[href*="/p/"]'))
    );
  },

  findSurfaces(root) {
    const surfaces: MediaSurface[] = [];
    const byContainer = new Map<HTMLElement, MediaSurface>();

    for (const bar of findActionBars(root)) {
      const owner = ownerOf(bar);
      if (!owner) continue;
      const { container, mediaEl } = owner;

      const surface: MediaSurface = {
        container,
        kind: onStoryRoute() ? 'story' : mediaEl.tagName === 'VIDEO' ? 'reel' : 'post',
        mediaEl,
        shortcode: shortcodeOf(container),
        actionBar: describeBar(bar),
      };

      // The story viewer has two icon clusters — playback controls on top, the
      // actions underneath. Later in document order is the one we want.
      const existing = byContainer.get(container);
      if (existing && !onStoryRoute()) continue;
      byContainer.set(container, surface);
    }

    surfaces.push(...byContainer.values());
    surfaces.push(...findGridTiles(root));
    return surfaces;
  },

  shortcodeOf,

  mediaElOf: visibleMediaIn,

  profileHeader(root) {
    if (!usernameFromProfileUrl(location.href)) return null;
    return root.querySelector<HTMLElement>('main header') ?? root.querySelector<HTMLElement>('header');
  },

  activeSlideIndex(container) {
    // Instagram renders one dot per slide; read it at click time, because
    // caching it is what makes other extensions save the wrong slide.
    const dotLists = [...container.querySelectorAll<HTMLElement>('div')].filter((el) => {
      const children = [...el.children] as HTMLElement[];
      return (
        children.length > 1 &&
        children.length <= 20 &&
        children.every((c) => c.tagName === 'DIV' && c.clientWidth > 0 && c.clientWidth <= 12)
      );
    });

    for (const list of dotLists) {
      const children = [...list.children] as HTMLElement[];
      const activeIndex = children.findIndex((dot) => {
        const style = getComputedStyle(dot);
        return dot.getAttribute('aria-current') === 'true' || parseFloat(style.opacity) > 0.9;
      });
      if (activeIndex >= 0) return activeIndex;
    }

    // Fallback: whichever slide sits closest to the horizontal centre.
    const slides = [...container.querySelectorAll<HTMLElement>('li')];
    if (slides.length > 1) {
      const centre = container.getBoundingClientRect().left + container.clientWidth / 2;
      let bestIndex = 0;
      let bestDistance = Infinity;
      slides.forEach((slide, i) => {
        const rect = slide.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - centre);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      });
      return bestIndex;
    }

    return 0;
  },
};

function describeBar(bar: HTMLElement): ActionBar {
  // The reels rail is a column and reads top-down, so our button belongs at the
  // top; a feed row reads left-to-right, so it belongs at the end.
  const vertical = getComputedStyle(bar).flexDirection.startsWith('column');
  return { element: bar, placement: vertical ? 'start' : 'end' };
}
