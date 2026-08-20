import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The store listings are rejected for mechanical reasons far more often than for
 * editorial ones: a summary two characters too long, an Edge description under
 * its 250-character floor, or a name that no longer matches the manifest. All of
 * those are checkable here rather than in a dashboard rejection email.
 */
const ROOT = join(import.meta.dirname, '..');
const listing = JSON.parse(readFileSync(join(ROOT, 'store-assets', 'listing.json'), 'utf8'));
const locales = readdirSync(join(ROOT, 'public', '_locales')).filter((l) => !l.startsWith('.'));

const entries = locales.map((locale) => [locale, listing[locale]] as const);

function messages(locale: string) {
  return JSON.parse(
    readFileSync(join(ROOT, 'public', '_locales', locale, 'messages.json'), 'utf8'),
  );
}

describe('store listing', () => {
  it('covers every shipped locale', () => {
    for (const locale of locales) expect(listing[locale], locale).toBeTruthy();
  });

  it.each(entries)('%s name and summary match the manifest exactly', (locale, copy) => {
    // Chrome and Edge read both from the package, so a mismatch means the
    // listing shows something the dashboard cannot be edited to change.
    const bundle = messages(locale);
    expect(copy.name).toBe(bundle.extName.message);
    expect(copy.summary).toBe(bundle.extDescription.message);
  });

  it.each(entries)('%s fits the store limits', (_locale, copy) => {
    expect(copy.name.length).toBeLessThanOrEqual(75); // Chrome
    expect(copy.summary.length).toBeLessThanOrEqual(132); // Chrome summary
    expect(copy.description.length).toBeGreaterThanOrEqual(250); // Edge minimum
    expect(copy.description.length).toBeLessThanOrEqual(10000); // Edge maximum
  });

  it.each(entries)('%s search terms fit the Edge limits', (_locale, copy) => {
    expect(copy.searchTerms.length).toBeLessThanOrEqual(7);
    const words = copy.searchTerms.join(' ').split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(21);
    for (const term of copy.searchTerms) expect(term.length).toBeLessThanOrEqual(30);
  });

  it.each(entries)('%s claims the same feature set as English', (locale, copy) => {
    // Chrome auto-flags listings whose localized metadata describes a different
    // set of features, which is the one realistic rejection risk of going
    // multilingual. Bullet count is a cheap proxy for "same claims".
    const bullets = (text: string) => text.split('\n').filter((l) => l.startsWith('•')).length;
    expect(bullets(copy.description), locale).toBe(bullets(listing.en.description));
  });

  it.each(entries)('%s carries the non-affiliation disclaimer', (_locale, copy) => {
    expect(copy.description).toMatch(/Meta/);
  });
});
