/**
 * "Download this profile" button, inserted under the bio in the profile header
 * so bulk download is reachable where the user already is.
 *
 * It is styled to pass for one of Instagram's own secondary buttons. The palette
 * is derived from the page's actual background rather than `prefers-color-scheme`,
 * because Instagram has its own theme switch that can disagree with the OS.
 */
import { t } from './i18n-dom';

export interface ProfileButtonHandle {
  destroy(): void;
  /** Reflect bulk progress on the button itself. */
  setProgress(done: number, total: number): void;
  setIdle(message?: string): void;
}

const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 3v13"/><path d="m6.5 11.5 5.5 5.5 5.5-5.5"/><path d="M4 21h16"/></svg>`;

const SPINNER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" class="spin" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>`;

/** Instagram's secondary button colours, picked from the page's own background. */
function palette() {
  const bg = getComputedStyle(document.body).backgroundColor;
  const [r = 255, g = 255, b = 255] = (bg.match(/\d+/g) ?? []).map(Number);
  const dark = (r * 299 + g * 587 + b * 114) / 1000 < 128;
  return dark
    ? { face: '#363636', hover: '#4a4a4a', text: '#f5f5f5' }
    : { face: '#efefef', hover: '#dbdbdb', text: '#000000' };
}

function styles(): string {
  const c = palette();
  return `
:host { all: initial; display: block; margin-block-start: 12px; }
.row { display: inline-flex; align-items: center; gap: 8px; }
button {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  min-height: 32px;
  border-radius: 8px;
  background: ${c.face};
  color: ${c.text};
  cursor: pointer;
  font: 600 14px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  transition: background .1s ease;
}
button:hover { background: ${c.hover}; }
button:active { opacity: .7; }
button[disabled] { opacity: .6; cursor: default; }
svg { width: 16px; height: 16px; display: block; }
/* Counts stay left-to-right even in an Arabic interface. */
.label { unicode-bidi: isolate; }
button.pfp { padding: 8px; gap: 4px; }
.pfp-avatar {
  width: 16px; height: 16px; border-radius: 50%; flex: none;
  background: ${c.hover};
  box-shadow: inset 0 0 0 1.5px ${c.text};
}
.spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
}

/**
 * Under the bio: the header's last section that actually carries text. Falling
 * back to the header itself keeps the button on screen if Instagram reshuffles.
 */
function insertUnderBio(header: HTMLElement, host: HTMLElement): void {
  const sections = [...header.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && (el.textContent ?? '').trim().length > 0,
  );
  const bio = sections[sections.length - 1];
  if (bio && bio.parentElement === header) bio.after(host);
  else header.append(host);
}

export interface ProfileActions {
  /** Bulk-download the whole profile. */
  onDownloadAll(): Promise<void>;
  /** Save the account's profile picture. */
  onDownloadPfp(): Promise<void>;
}

export function mountProfileButton(header: HTMLElement, actions: ProfileActions): ProfileButtonHandle {
  const host = document.createElement('div');
  host.setAttribute('data-grabowl-profile', '');
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = styles();

  const row = document.createElement('div');
  row.className = 'row';

  const button = document.createElement('button');
  button.type = 'button';

  const icon = document.createElement('span');
  icon.innerHTML = ICON;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = t('profileDownloadAll');

  button.append(icon, label);

  // Compact icon-only button for the profile picture, beside the bulk button.
  const pfp = document.createElement('button');
  pfp.type = 'button';
  pfp.className = 'pfp';
  pfp.title = t('profileDownloadPfp');
  pfp.setAttribute('aria-label', t('profileDownloadPfp'));
  pfp.innerHTML = `<span class="pfp-avatar"></span>${ICON}`;

  row.append(button, pfp);
  shadow.append(style, row);
  insertUnderBio(header, host);

  const handle: ProfileButtonHandle = {
    destroy: () => host.remove(),
    setProgress(done, total) {
      button.disabled = true;
      icon.innerHTML = SPINNER;
      label.textContent = `${done} / ${total}`;
    },
    setIdle(message) {
      button.disabled = false;
      icon.innerHTML = ICON;
      label.textContent = message ?? t('profileDownloadAll');
    },
  };

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    icon.innerHTML = SPINNER;
    label.textContent = t('profileCollecting');
    try {
      await actions.onDownloadAll();
    } catch (error) {
      handle.setIdle(error instanceof Error ? error.message : String(error));
    }
  });

  pfp.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    pfp.disabled = true;
    try {
      await actions.onDownloadPfp();
    } catch {
      /* the error is surfaced by the caller's own toast path if any */
    } finally {
      pfp.disabled = false;
    }
  });

  return handle;
}
