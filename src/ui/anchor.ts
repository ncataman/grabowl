/**
 * Keeps download buttons attached as Instagram mutates the page.
 *
 * Instagram is a client-routed SPA that recycles DOM nodes aggressively, so a
 * one-shot injection disappears within seconds. A debounced MutationObserver
 * covers feed scrolling and dialog opens; a URL poll covers client-side routing.
 */
import { log } from '../lib/logger';
import { pickAdapter, resetAdapter } from '../adapters/registry';
import type { MediaSurface } from '../adapters/selectors';
import { mountCornerButton, mountOverlay, type OverlayActions, type OverlayHandle } from './overlay';

const MOUNTED_ATTR = 'data-grabowl-mounted';

export interface AnchorControllerOptions {
  /** Builds the click handlers for a surface; return undefined to skip mounting. */
  actionsFor(surface: MediaSurface): (OverlayActions & { slideCount: number }) | undefined;
  onRouteChange?(): void;
  /** Called after each sweep, for anchors that are not media surfaces. */
  onSweep?(): void;
  /** Whether grid buttons appear only on hover. */
  gridButtonVisibility?(): 'hover' | 'always';
}

export class AnchorController {
  private observer?: MutationObserver;
  private mounted = new WeakMap<HTMLElement, OverlayHandle>();
  private sweepQueued = false;
  private lastUrl = location.href;
  private disposers: (() => void)[] = [];

  constructor(private options: AnchorControllerOptions) {}

  start(): void {
    this.observer = new MutationObserver(() => this.queueSweep());
    this.observer.observe(document.body, { childList: true, subtree: true });

    const onPop = () => this.handleRouteChange();
    window.addEventListener('popstate', onPop);
    this.disposers.push(() => window.removeEventListener('popstate', onPop));

    // Instagram routes with pushState from the page's own world, which an
    // isolated content script cannot hook, so the URL is polled instead.
    const poll = window.setInterval(() => {
      if (location.href !== this.lastUrl) this.handleRouteChange();
    }, 700);
    this.disposers.push(() => window.clearInterval(poll));

    this.sweep();
  }

  stop(): void {
    this.observer?.disconnect();
    this.disposers.forEach((fn) => fn());
    this.disposers = [];
  }

  /**
   * Look for anchors that need buttons. Safe to call at any time — mounting is
   * idempotent unless the surface itself changed.
   */
  sweep(): void {
    let surfaces: MediaSurface[];
    try {
      surfaces = pickAdapter().findSurfaces(document);
    } catch (error) {
      // Silence here once cost hours of debugging: an adapter that throws looks
      // exactly like an adapter that finds nothing.
      log.warn('findSurfaces failed', error);
      return;
    }

    for (const surface of surfaces) {
      // The button hangs off the action bar where there is one, and off the tile
      // itself on grids; whichever it is carries the mount marker.
      const anchor = surface.actionBar?.element ?? surface.container;

      const actions = this.options.actionsFor(surface);
      if (!actions) continue;

      // The marker records the slide count the buttons were built for. A bar
      // Instagram recycled for a different post needs new buttons, so compare
      // rather than just checking for presence.
      const stamp = `${surface.kind}:${actions.slideCount}`;
      if (
        anchor.getAttribute(MOUNTED_ATTR) === stamp &&
        anchor.querySelector('[data-grabowl-button]')
      ) {
        continue;
      }

      // Detaching our own node would retrigger the observer; the marker and the
      // debounce keep that from looping.
      this.mounted.get(anchor)?.destroy();
      const handle = surface.actionBar
        ? mountOverlay(surface.actionBar, actions, actions.slideCount)
        : mountCornerButton(surface.container, actions, this.options.gridButtonVisibility?.() ?? 'hover');
      this.mounted.set(anchor, handle);
      anchor.setAttribute(MOUNTED_ATTR, stamp);
    }

    this.options.onSweep?.();
  }

  private handleRouteChange() {
    this.lastUrl = location.href;
    resetAdapter();
    this.options.onRouteChange?.();
    this.queueSweep();
  }

  private queueSweep() {
    if (this.sweepQueued) return;
    this.sweepQueued = true;
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        this.sweepQueued = false;
        this.sweep();
      }, 150);
    });
  }

}
