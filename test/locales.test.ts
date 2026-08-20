import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A missing translation silently falls back to English, which looks like a bug
 * rather than a missing string — so parity is asserted for every shipped locale,
 * automatically, as locales are added.
 */
const LOCALES_DIR = join(import.meta.dirname, '..', 'public', '_locales');

type Message = { message: string; placeholders?: Record<string, unknown> };
type Bundle = Record<string, Message>;

function load(locale: string): Bundle {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf8'));
}

const locales = readdirSync(LOCALES_DIR).filter((name) => !name.startsWith('.'));
const en = load('en');
const translated = locales.filter((l) => l !== 'en');

describe('locales', () => {
  it('ships the ten planned languages', () => {
    expect(locales.sort()).toEqual(
      ['ar', 'de', 'en', 'es', 'fr', 'hi', 'id', 'pt_BR', 'ru', 'tr'].sort(),
    );
  });

  it.each(translated)('%s defines exactly the English keys', (locale) => {
    expect(Object.keys(load(locale)).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(translated)('%s declares the same placeholders', (locale) => {
    const bundle = load(locale);
    for (const [key, value] of Object.entries(en)) {
      expect(Object.keys(bundle[key].placeholders ?? {}).sort(), key).toEqual(
        Object.keys(value.placeholders ?? {}).sort(),
      );
    }
  });

  /**
   * Strings that are legitimately identical to English, so the
   * forgotten-translation check below does not flag them.
   * `popupTitle` is the brand name; "Pause" happens to be the real German and
   * French word too.
   */
  const SAME_AS_ENGLISH = new Set(['popupTitle', 'de/popupPause', 'fr/popupPause']);

  it.each(translated)('%s leaves no message empty or untranslated', (locale) => {
    const bundle = load(locale);
    for (const [key, value] of Object.entries(bundle)) {
      expect(value.message?.trim(), key).toBeTruthy();
      // Byte-identical to English usually means a string was never translated.
      if (SAME_AS_ENGLISH.has(key) || SAME_AS_ENGLISH.has(`${locale}/${key}`)) continue;
      expect(value.message === en[key].message, `${locale}/${key} is still English`).toBe(false);
    }
  });

  it('keeps the store name and summary inside Chrome Web Store limits', () => {
    for (const locale of locales) {
      const bundle = load(locale);
      expect(bundle.extName.message.length, `${locale} name`).toBeLessThanOrEqual(75);
      expect(bundle.extDescription.message.length, `${locale} summary`).toBeLessThanOrEqual(132);
    }
  });

  it('leads every name with the brand, never with Instagram', () => {
    // Meta trademark complaints, not the download feature, are what historically
    // removes these extensions from the stores.
    for (const locale of locales) {
      expect(load(locale).extName.message.startsWith('InsDown'), locale).toBe(true);
    }
  });
});
