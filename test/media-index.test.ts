import { describe, expect, it } from 'vitest';
import { MediaIndex } from '../src/core/media-index';
import type { MediaItem } from '../src/core/media-model';

const photo: MediaItem = {
  pk: '1',
  shortcode: 'AAA',
  type: 'image',
  username: 'natgeo',
  takenAt: 100,
  slides: [{ kind: 'image', url: 'https://scontent.cdninstagram.com/v/t51/photo_n.jpg?sig=1' }],
};

const story: MediaItem = {
  pk: '2',
  type: 'video',
  username: 'natgeo',
  takenAt: 200,
  slides: [
    {
      kind: 'video',
      url: 'https://scontent.cdninstagram.com/v/t50/story.mp4?sig=2',
      thumbUrl: 'https://scontent.cdninstagram.com/v/t51/story_poster.jpg?sig=3',
    },
  ],
};

describe('MediaIndex', () => {
  it('looks items up by pk and shortcode', () => {
    const index = new MediaIndex();
    index.upsert([photo]);
    expect(index.getByPk('1')).toBe(photo);
    expect(index.getByShortcode('AAA')).toBe(photo);
    expect(index.getByShortcode('missing')).toBeUndefined();
  });

  it('keeps the richer record when a fuller payload arrives later', () => {
    const index = new MediaIndex();
    index.upsert([{ ...photo, username: undefined }]);
    index.upsert([{ ...photo, slides: [...photo.slides, photo.slides[0]] }]);
    const merged = index.getByPk('1')!;
    expect(merged.slides).toHaveLength(2);
    expect(merged.username).toBe('natgeo');
  });

  it('matches a story by its poster, ignoring the CDN signature', () => {
    const index = new MediaIndex();
    index.upsert([photo, story]);
    const match = index.findByAssetUrl(
      'https://scontent-lhr8-1.cdninstagram.com/v/t51/story_poster.jpg?sig=DIFFERENT&oh=x',
    );
    expect(match?.item.pk).toBe('2');
    expect(match?.slideIndex).toBe(0);
  });

  it('returns nothing for an asset it has never seen', () => {
    const index = new MediaIndex();
    index.upsert([photo]);
    expect(index.findByAssetUrl('https://cdn/other.jpg')).toBeUndefined();
    expect(index.findByAssetUrl('blob:https://www.instagram.com/abc')).toBeUndefined();
  });

  it('notifies listeners when a merge enriches an existing item', () => {
    // The interceptor communicates over postMessage, which anything on the page
    // can also post to, so URLs are the trust boundary.
    const index = new MediaIndex();
    const notifications: number[] = [];
    index.onChange(() => notifications.push(index.size));

    index.upsert([photo]);
    expect(notifications).toHaveLength(1);

    // Same post, now known to be a carousel — the UI must hear about this or the
    // "All N" button never appears.
    index.upsert([{ ...photo, type: 'carousel', slides: [...photo.slides, photo.slides[0]] }]);
    expect(notifications).toHaveLength(2);
    expect(index.getByPk('1')!.slides).toHaveLength(2);

    // An identical repeat is not a change and must not churn the UI.
    index.upsert([index.getByPk('1')!]);
    expect(notifications).toHaveLength(2);
  });

  it('refuses media whose URLs are not Instagram CDNs', () => {
    const index = new MediaIndex();
    index.upsert([
      { ...photo, pk: '99', slides: [{ kind: 'image', url: 'https://evil.example/x.jpg' }] },
      { ...photo, pk: '98', slides: [{ kind: 'image', url: 'javascript:alert(1)' }] },
      { ...photo, pk: '97', slides: [{ kind: 'image', url: 'http://scontent.cdninstagram.com/x.jpg' }] },
    ]);
    expect(index.size).toBe(0);
  });

  it('drops the shortcode alias when its item is evicted', () => {
    const index = new MediaIndex();
    index.upsert([photo]);
    // Overflow the 800-entry capacity so the first item is evicted.
    index.upsert(
      Array.from({ length: 800 }, (_, i) => ({ ...photo, pk: `filler-${i}`, shortcode: `S${i}` })),
    );
    expect(index.getByShortcode('AAA')).toBeUndefined();
  });

  it('orders a profile’s media newest first', () => {
    const index = new MediaIndex();
    index.upsert([photo, story]);
    expect(index.byUsername('NatGeo').map((i) => i.pk)).toEqual(['2', '1']);
  });
});
