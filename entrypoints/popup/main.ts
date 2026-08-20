/** Popup: shows what the current tab has detected and drives bulk downloads. */
import { browser } from '../../src/lib/browser';
import { loadSettings } from '../../src/core/settings';
import { applyI18n, t } from '../../src/ui/i18n-dom';
import type { BulkProgress, Message } from '../../src/core/messaging';
import type { MediaItem } from '../../src/core/media-model';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  count: $('count'),
  profileLine: $('profile-line'),
  start: $<HTMLButtonElement>('start'),
  activeRow: $('active-row'),
  active: $<HTMLInputElement>('active'),
  zipRow: $('zip-row'),
  zip: $<HTMLInputElement>('zip'),
  progress: $('progress'),
  fill: $('fill'),
  progressText: $('progress-text'),
  pause: $<HTMLButtonElement>('pause'),
  cancel: $<HTMLButtonElement>('cancel'),
  error: $('error'),
  options: $('options'),
};

let tabItems: MediaItem[] = [];
let username: string | undefined;
let paused = false;

function showError(message: string) {
  els.error.textContent = message;
  els.error.hidden = false;
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function loadTabMedia() {
  const tabId = await activeTabId();
  if (tabId === undefined) return;
  try {
    const response = (await browser.tabs.sendMessage(tabId, { t: 'QUERY_TAB_MEDIA' } as Message)) as
      | { ok: true; value: { username?: string; total: number; items: MediaItem[] } }
      | undefined;
    if (!response?.ok) return;
    username = response.value.username;
    tabItems = response.value.items;
    els.count.textContent = String(response.value.total);

    if (username) {
      els.profileLine.textContent = t('popupProfileFound', [username, String(tabItems.length)]);
      els.start.textContent = t('popupStartBulk');
      els.start.hidden = false;
      els.activeRow.hidden = false;
      els.zipRow.hidden = false;
    }
  } catch {
    // No content script on this tab — the user is not on instagram.com.
    els.profileLine.textContent = t('popupOpenInstagram');
  }
}

function renderProgress(progress: BulkProgress | undefined) {
  if (!progress) {
    els.progress.hidden = true;
    return;
  }
  els.progress.hidden = false;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  els.fill.style.width = `${pct}%`;
  els.progressText.textContent = t('popupProgress', [
    String(progress.done),
    String(progress.total),
    String(progress.failed),
  ]);
  paused = progress.status === 'paused';
  els.pause.textContent = paused ? t('popupResume') : t('popupPause');
  const finished = progress.status === 'done' || progress.status === 'error';
  els.pause.disabled = finished || !progress.pausable;
  els.start.disabled = !finished && progress.status === 'running';
  if (progress.message) showError(progress.message);
}

els.options.addEventListener('click', () => browser.runtime.openOptionsPage());

els.start.addEventListener('click', async () => {
  if (!username) return;
  els.error.hidden = true;
  els.start.disabled = true;
  els.start.textContent = t('popupCollecting');

  try {
    const tabId = await activeTabId();
    if (tabId === undefined) throw new Error('no active tab');

    // The content script gathers the list — pagination needs the page's session.
    const settings = await loadSettings();
    const collected = (await browser.tabs.sendMessage(tabId, {
      t: 'COLLECT_BULK',
      username,
      activePagination: els.active.checked,
      cap: settings.bulkCap,
    } as Message)) as { ok: true; value: MediaItem[] } | { ok: false; error: string };

    if (!collected?.ok) throw new Error(collected?.error ?? 'collection failed');
    if (!collected.value.length) throw new Error(t('popupNothingFound'));

    await browser.runtime.sendMessage({
      t: 'BULK_START',
      username,
      items: collected.value,
      options: { zip: els.zip.checked },
    } as Message);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
    els.start.disabled = false;
  } finally {
    els.start.textContent = t('popupStartBulk');
  }
});

els.pause.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ t: paused ? 'BULK_RESUME' : 'BULK_PAUSE' } as Message);
});

els.cancel.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ t: 'BULK_CANCEL' } as Message);
  renderProgress(undefined);
  els.start.disabled = false;
});

browser.runtime.onMessage.addListener((message: any) => {
  if (message?.t === 'BULK_PROGRESS') renderProgress(message.progress);
});

async function init() {
  applyI18n(document);
  const settings = await loadSettings();
  els.active.checked = settings.activePagination;
  els.zip.checked = settings.zipBulk;
  await loadTabMedia();
  const status = (await browser.runtime.sendMessage({ t: 'BULK_STATUS' } as Message)) as
    | { ok: true; value?: BulkProgress }
    | undefined;
  if (status?.ok && status.value) renderProgress(status.value);
}

void init();
