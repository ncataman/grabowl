import { describe, expect, it } from 'vitest';
import { pkToShortcode, shortcodeFromUrl, shortcodeToPk, usernameFromProfileUrl } from '../src/core/csrf';

describe('shortcode <-> pk', () => {
  it('round-trips a real media id', () => {
    const pk = '3210987654321098765';
    expect(shortcodeToPk(pkToShortcode(pk))).toBe(pk);
  });

  // Pairs taken from instagrapi's documented API dumps, where the pk, the
  // "{pk}_{user_id}" id and the live /p/{code}/ URL all appear together.
  it.each([
    ['BjNLpA1AhXM', '1787135824035452364'],
    ['B-fKL9qpeab', '2278584739065882267'],
    ['BWsP42nAHbD', '1561693048415483587'],
  ])('maps %s to %s', (shortcode, pk) => {
    expect(shortcodeToPk(shortcode)).toBe(pk);
    expect(pkToShortcode(pk)).toBe(shortcode);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => shortcodeToPk('bad!code')).toThrow();
  });
});

describe('url helpers', () => {
  it('extracts shortcodes from post, reel and tv urls', () => {
    expect(shortcodeFromUrl('/p/C1imAge01/')).toBe('C1imAge01');
    expect(shortcodeFromUrl('https://www.instagram.com/reel/C2vidEo02/?x=1')).toBe('C2vidEo02');
    expect(shortcodeFromUrl('/tv/C3tvClip3/')).toBe('C3tvClip3');
    expect(shortcodeFromUrl('/natgeo/')).toBeUndefined();
  });

  it('recognises profile urls and rejects reserved routes', () => {
    expect(usernameFromProfileUrl('https://www.instagram.com/natgeo/')).toBe('natgeo');
    expect(usernameFromProfileUrl('https://www.instagram.com/natgeo/reels/')).toBe('natgeo');
    expect(usernameFromProfileUrl('https://www.instagram.com/p/C1imAge01/')).toBeUndefined();
    expect(usernameFromProfileUrl('https://www.instagram.com/explore/')).toBeUndefined();
  });
});
