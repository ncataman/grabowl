/**
 * "Download this profile" button, inserted into the profile header so bulk
 * download is reachable where the user already is, rather than only in the popup.
 */
import { t } from './i18n-dom';

export interface ProfileButtonHandle {
  destroy(): void;
  /** Reflect bulk progress on the button itself. */
  setProgress(done: number, total: number): void;
  setIdle(message?: string): void;
}

const STYLE = `
:host { all: initial; display: block; margin-top: 12px; }
button {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 10px;
  background: #0095f6;
  color: #fff;
  font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  transition: background .12s ease, transform .1s ease;
}
button:hover { background: #1877f2; }
button:active { transform: scale(.98); }
button[disabled] { background: #4a5568; cursor: default; }
svg { width: 16px; height: 16px; display: block; }
.spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;

const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 3v13"/><path d="m6.5 11.5 5.5 5.5 5.5-5.5"/><path d="M4 21h16"/>
</svg>`;

const SPINNER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
  stroke-linecap="round" class="spin" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>`;

export function mountProfileButton(
  header: HTMLElement,
  onClick: () => Promise<void>,
): ProfileButtonHandle {
  const host = document.createElement('div');
  host.setAttribute('data-insdown-profile', '');
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;

  const button = document.createElement('button');
  button.type = 'button';

  const label = document.createElement('span');
  label.textContent = t('profileDownloadAll');

  const icon = document.createElement('span');
  icon.innerHTML = ICON;

  button.append(icon, label);
  shadow.append(style, button);
  header.append(host);

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
      await onClick();
    } catch (error) {
      handle.setIdle(error instanceof Error ? error.message : String(error));
    }
  });

  return handle;
}
