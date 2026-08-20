import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal in-memory chrome.storage.sync stub.
const store: Record<string, unknown> = {};
vi.mock('../src/lib/browser', () => ({
  browser: {
    storage: {
      sync: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (obj: Record<string, unknown>) => Object.assign(store, obj),
      },
    },
  },
}));

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/core/settings';

describe('settings', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('returns defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('an undefined filenamePattern in storage never shadows the default', async () => {
    // The bug that broke every download on Firefox: a stored key whose value is
    // undefined must not win over the default.
    store.settings = { ...DEFAULT_SETTINGS, filenamePattern: undefined };
    expect((await loadSettings()).filenamePattern).toBe(DEFAULT_SETTINGS.filenamePattern);
  });

  it('saveSettings drops undefined values from a patch', async () => {
    await saveSettings({ concurrency: 6 });
    await saveSettings({ filenamePattern: undefined });
    const s = await loadSettings();
    expect(s.filenamePattern).toBe(DEFAULT_SETTINGS.filenamePattern);
    expect(s.concurrency).toBe(6);
  });
});
