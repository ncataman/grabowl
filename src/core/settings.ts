/** User settings, persisted in chrome.storage.sync. */
import { browser } from '../lib/browser';
import { DEFAULT_PATTERN } from './filename';

export interface Settings {
  version: number;
  filenamePattern: string;
  concurrency: number;
  /** Opt-in: walk the profile timeline over the network during bulk download. */
  activePagination: boolean;
  /** Hard cap on media fetched per bulk session, to protect the user's account. */
  bulkCap: number;
  zipBulk: boolean;
  /** Whether grid thumbnails show their download button only while hovered. */
  gridButton: 'hover' | 'always';
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  filenamePattern: DEFAULT_PATTERN,
  concurrency: 4,
  activePagination: false,
  bulkCap: 200,
  zipBulk: false,
  gridButton: 'hover',
};

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await browser.storage.sync.set({ settings: next });
  return next;
}
