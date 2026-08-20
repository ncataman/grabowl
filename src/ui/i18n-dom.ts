/** Applies _locales strings to elements carrying data-i18n. */
import { browser } from '../lib/browser';

/** WXT derives this union from _locales/en/messages.json, so typos fail the build. */
export type MessageKey = Parameters<typeof browser.i18n.getMessage>[0];

export function t(key: MessageKey, substitutions?: string[]): string {
  return browser.i18n.getMessage(key, substitutions as any) || key;
}

export function applyI18n(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const message = t(el.dataset.i18n as MessageKey);
    if (message) el.textContent = message;
  }

  // Arabic and Persian read right-to-left. Setting dir on <html> rather than
  // <body> also flips the scrollbar side and native form controls.
  if (root instanceof Document) {
    root.documentElement.dir = browser.i18n.getMessage('@@bidi_dir') || 'ltr';
  }
}
