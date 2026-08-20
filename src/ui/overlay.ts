/**
 * The download control, inserted into Instagram's own action bar so it sits
 * alongside like, comment, share and save rather than floating over the media.
 *
 * It lives in a shadow root: Instagram's stylesheet and ours can never affect
 * each other, which is how competing extensions end up breaking the page layout.
 */
import { t } from './i18n-dom';
import type { ActionBar } from '../adapters/selectors';

export interface OverlayActions {
  /** Download whatever is on screen right now. */
  onDownload(): void | Promise<void>;
  /** Present when the surface is a carousel; downloads every slide. */
  onDownloadAll?(count: number): void | Promise<void>;
}

const STYLE = `
:host { all: initial; display: inline-flex; }
.bar { display: inline-flex; align-items: center; gap: 2px; }
button {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-radius: 50%;
  cursor: pointer;
  color: currentColor;
  font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  transition: opacity .12s ease, transform .1s ease;
}
button:hover { opacity: .55; }
button:active { transform: scale(0.92); }
button[disabled] { opacity: .4; cursor: default; }
button.all { border-radius: 999px; padding: 6px 9px; }
svg { width: 24px; height: 24px; display: block; }
.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.tick { color: #22c55e; }
.warn { color: #ef4444; font-size: 11px; max-width: 130px; }
`;

/** Stroke weights and sizing chosen to sit naturally next to Instagram's icons. */
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 3v13"/><path d="m6.5 11.5 5.5 5.5 5.5-5.5"/><path d="M4 21h16"/>
</svg>`;

const ICON_BUSY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" class="spin" aria-hidden="true">
  <path d="M12 3a9 9 0 1 0 9 9" />
</svg>`;

const ICON_DONE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
  stroke-linecap="round" stroke-linejoin="round" class="tick" aria-hidden="true">
  <path d="m4 12.5 5.5 5.5L20 7"/>
</svg>`;

export interface OverlayHandle {
  host: HTMLElement;
  destroy(): void;
}

/**
 * Grid tiles have no action bar, so they get a corner button that appears when
 * the tile is hovered — downloading without opening the post.
 */
const CORNER_STYLE = `
:host { all: initial; }
.corner {
  position: absolute;
  top: 8px;
  /* Logical, so the button lands on the correct side in right-to-left locales. */
  inset-inline-end: 8px;
  opacity: 0;
  transition: opacity .12s ease;
  pointer-events: auto;
}
:host(.visible) .corner { opacity: 1; }
button {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(4px);
  color: #fff;
  cursor: pointer;
  transition: background .12s ease, transform .1s ease;
}
button:hover { background: rgba(0,0,0,.8); }
button:active { transform: scale(.92); }
button[disabled] { opacity: .6; cursor: default; }
svg { width: 18px; height: 18px; display: block; }
.spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.tick { color: #4ade80; }
`;

export function mountCornerButton(
  tile: HTMLElement,
  actions: OverlayActions,
  visibility: 'hover' | 'always' = 'hover',
): OverlayHandle {
  const host = document.createElement('div');
  host.setAttribute('data-grabowl-button', '');
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = CORNER_STYLE;

  const wrap = document.createElement('div');
  wrap.className = 'corner';

  const button = document.createElement('button');
  button.type = 'button';
  button.title = t('overlayDownload');
  button.setAttribute('aria-label', t('overlayDownload'));
  button.innerHTML = ICON_DOWNLOAD;
  wrap.append(button);
  shadow.append(style, wrap);

  const show = () => host.classList.add('visible');
  const hide = () => host.classList.remove('visible');

  if (visibility === 'always') {
    show();
  } else {
    tile.addEventListener('mouseenter', show);
    tile.addEventListener('mouseleave', hide);
  }

  button.addEventListener('click', async (event) => {
    // The tile is a link; without this the click opens the post.
    event.preventDefault();
    event.stopPropagation();

    button.disabled = true;
    button.innerHTML = ICON_BUSY;
    try {
      await actions.onDownload();
      button.innerHTML = ICON_DONE;
    } catch (error) {
      button.innerHTML = ICON_DOWNLOAD;
      button.title = error instanceof Error ? error.message : String(error);
    } finally {
      button.disabled = false;
      window.setTimeout(() => {
        button.innerHTML = ICON_DOWNLOAD;
        // Clear any error left in the tooltip, back to the plain label.
        button.title = t('overlayDownload');
      }, 1800);
    }
  });

  if (getComputedStyle(tile).position === 'static') tile.style.position = 'relative';
  tile.append(host);

  return {
    host,
    destroy() {
      tile.removeEventListener('mouseenter', show);
      tile.removeEventListener('mouseleave', hide);
      host.remove();
    },
  };
}

export function mountOverlay(
  bar: ActionBar,
  actions: OverlayActions,
  slideCount: number,
): OverlayHandle {
  const host = document.createElement('div');
  host.setAttribute('data-grabowl-button', '');
  host.style.display = 'inline-flex';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;

  const wrap = document.createElement('div');
  wrap.className = 'bar';

  const main = document.createElement('button');
  main.type = 'button';
  main.title = t('overlayDownload');
  main.setAttribute('aria-label', t('overlayDownload'));
  main.innerHTML = ICON_DOWNLOAD;
  wrap.append(main);

  let allButton: HTMLButtonElement | undefined;
  if (slideCount > 1 && actions.onDownloadAll) {
    allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = 'all';
    allButton.textContent = `${t('overlayDownloadAll')} ${slideCount}`;
    allButton.title = t('overlayDownloadAllTitle');
    wrap.append(allButton);
  }

  const note = document.createElement('span');
  note.className = 'warn';
  wrap.append(note);

  shadow.append(style, wrap);

  const handle: OverlayHandle = {
    host,
    destroy: () => host.remove(),
  };

  const run = async (fn: () => void | Promise<void>) => {
    main.disabled = true;
    if (allButton) allButton.disabled = true;
    main.innerHTML = ICON_BUSY;
    note.textContent = '';

    try {
      await fn();
      main.innerHTML = ICON_DONE;
    } catch (error) {
      main.innerHTML = ICON_DOWNLOAD;
      note.textContent = error instanceof Error ? error.message : String(error);
      window.setTimeout(() => (note.textContent = ''), 4000);
    } finally {
      main.disabled = false;
      if (allButton) allButton.disabled = false;
      window.setTimeout(() => {
        if (!main.disabled) main.innerHTML = ICON_DOWNLOAD;
      }, 1800);
    }
  };

  const bind = (el: HTMLElement, fn: () => void | Promise<void>) => {
    el.addEventListener('click', (event) => {
      // Instagram treats clicks anywhere in the bar as post interactions.
      event.preventDefault();
      event.stopPropagation();
      void run(fn);
    });
  };

  bind(main, () => actions.onDownload());
  if (allButton) bind(allButton, () => actions.onDownloadAll!(slideCount));

  if (bar.placement === 'start') bar.element.prepend(host);
  else bar.element.append(host);

  return handle;
}
