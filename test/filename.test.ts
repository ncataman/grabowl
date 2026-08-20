import { describe, expect, it } from 'vitest';
import { buildFilename, DEFAULT_PATTERN } from '../src/core/filename';
import type { MediaItem } from '../src/core/media-model';

const item: MediaItem = {
  pk: '3100000000000000001',
  shortcode: 'C1imAge01',
  type: 'carousel',
  username: 'natgeo',
  takenAt: 1755561600,
  slides: [
    { kind: 'image', url: 'https://cdn/v/t51/photo_n.jpg?_nc_ht=x' },
    { kind: 'video', url: 'https://cdn/v/t50/clip.mp4?efg=y' },
  ],
};

describe('buildFilename', () => {
  it('expands every token with the default pattern', () => {
    expect(buildFilename(DEFAULT_PATTERN, item, item.slides[0], 0)).toBe(
      'Grabowl/natgeo/2025-08-19_C1imAge01_01.jpg',
    );
  });

  it('derives the extension from the URL, ignoring query strings', () => {
    expect(buildFilename('{shortcode}_{index}.{ext}', item, item.slides[1], 1)).toBe(
      'C1imAge01_02.mp4',
    );
  });

  it('falls back to a sane extension when the URL has none', () => {
    const slide = { kind: 'video' as const, url: 'https://cdn/stream?id=1' };
    expect(buildFilename('{shortcode}.{ext}', item, slide, 0)).toBe('C1imAge01.mp4');
  });

  it('strips characters the downloads API rejects', () => {
    const hostile = { ...item, username: 'bad:na/me*?' };
    const path = buildFilename('{username}/{shortcode}.{ext}', hostile, item.slides[0], 0);
    expect(path).toBe('bad_na_me__/C1imAge01.jpg');
  });

  it('cannot escape the download folder via a hostile username', () => {
    // downloads.download rejects absolute paths and "..", so a username taken
    // straight from a payload must never survive into the path.
    for (const username of ['../../etc', '/root', '..']) {
      const path = buildFilename('{username}/{shortcode}.{ext}', { ...item, username }, item.slides[0], 0);
      expect(path.startsWith('/')).toBe(false);
      expect(path.split('/')).not.toContain('..');
    }
  });

  it('leaves unknown tokens untouched rather than emptying the name', () => {
    expect(buildFilename('{nope}_{shortcode}.{ext}', item, item.slides[0], 0)).toBe(
      '{nope}_C1imAge01.jpg',
    );
  });
});
