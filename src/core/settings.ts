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

/** Drop keys whose value is undefined so they cannot overwrite a default. */
function defined<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  // An explicit `undefined` in stored settings must not shadow a default:
  // Firefox's structured clone keeps such keys, and one stored under
  // filenamePattern used to make every later download throw.
  return { ...DEFAULT_SETTINGS, ...defined(stored.settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  // defined() guards the store against an undefined slipping through a caller.
  const next = { ...(await loadSettings()), ...defined(patch) };
  await browser.storage.sync.set({ settings: next });
  return next;
}
