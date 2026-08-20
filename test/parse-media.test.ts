import { describe, expect, it } from 'vitest';
import { collectMedia, parseMediaNode } from '../src/core/parse-media';

const imagePost = {
  pk: '3100000000000000001',
  code: 'C1imAge01',
  media_type: 1,
  taken_at: 1755561600,
  user: { username: 'natgeo' },
  image_versions2: {
    candidates: [
      { url: 'https://cdn/small.jpg', width: 320, height: 320 },
      { url: 'https://cdn/large.jpg', width: 1440, height: 1440 },
    ],
  },
};

const videoReel = {
  pk: '3100000000000000002',
  code: 'C2vidEo02',
  media_type: 2,
  user: { username: 'someone' },
  image_versions2: { candidates: [{ url: 'https://cdn/poster.jpg', width: 640, height: 1136 }] },
  video_versions: [
    { url: 'https://cdn/low.mp4', width: 480, height: 852 },
    { url: 'https://cdn/hd.mp4', width: 1080, height: 1920 },
  ],
};

const carousel = {
  pk: '3100000000000000003',
  code: 'C3carSel3',
  media_type: 8,
  user: { username: 'traveller' },
  carousel_media: [
    { pk: 'a', media_type: 1, image_versions2: { candidates: [{ url: 'https://cdn/1.jpg', width: 1080 }] } },
    {
      pk: 'b',
      media_type: 2,
      image_versions2: { candidates: [{ url: 'https://cdn/2poster.jpg', width: 1080 }] },
      video_versions: [{ url: 'https://cdn/2.mp4', width: 1080 }],
    },
    { pk: 'c', media_type: 1, image_versions2: { candidates: [{ url: 'https://cdn/3.jpg', width: 1080 }] } },
  ],
};

describe('parseMediaNode', () => {
  it('picks the widest image candidate, never a thumbnail', () => {
    const item = parseMediaNode(imagePost)!;
    expect(item.type).toBe('image');
    expect(item.slides[0].url).toBe('https://cdn/large.jpg');
    expect(item.username).toBe('natgeo');
    expect(item.shortcode).toBe('C1imAge01');
  });

  it('prefers the highest-bitrate video and keeps the poster as thumbnail', () => {
    const item = parseMediaNode(videoReel)!;
    expect(item.type).toBe('video');
    expect(item.slides[0].url).toBe('https://cdn/hd.mp4');
    expect(item.slides[0].thumbUrl).toBe('https://cdn/poster.jpg');
  });

  it('expands a carousel into one slide per child, in order', () => {
    const item = parseMediaNode(carousel)!;
    expect(item.type).toBe('carousel');
    expect(item.slides.map((s) => s.url)).toEqual([
      'https://cdn/1.jpg',
      'https://cdn/2.mp4',
      'https://cdn/3.jpg',
    ]);
    expect(item.slides[1].kind).toBe('video');
  });

  it('handles the legacy web shape', () => {
    const item = parseMediaNode({
      id: '3100000000000000004',
      shortcode: 'C4legacy4',
      display_url: 'https://cdn/legacy.jpg',
      dimensions: { width: 1080, height: 1080 },
      edge_sidecar_to_children: {
        edges: [
          { node: { id: 'x', display_url: 'https://cdn/legacy1.jpg' } },
          { node: { id: 'y', is_video: true, video_url: 'https://cdn/legacy2.mp4' } },
        ],
      },
    })!;
    expect(item.slides.map((s) => s.url)).toEqual([
      'https://cdn/legacy1.jpg',
      'https://cdn/legacy2.mp4',
    ]);
  });

  it('ignores fragments with no identity', () => {
    expect(parseMediaNode({ image_versions2: { candidates: [{ url: 'x' }] } })).toBeUndefined();
  });
});

describe('collectMedia', () => {
  it('finds media nested anywhere in an API payload', () => {
    const payload = { data: { xdt_api__v1__feed: { items: [{ media: imagePost }, videoReel] } } };
    const found = collectMedia(payload);
    expect(found.map((f) => f.shortcode).sort()).toEqual(['C1imAge01', 'C2vidEo02']);
  });

  it('survives cyclic payloads', () => {
    const cyclic: any = { items: [imagePost] };
    cyclic.self = cyclic;
    expect(collectMedia(cyclic)).toHaveLength(1);
  });

  it('counts a carousel as one post, not one per slide', () => {
    // Each carousel child is itself a media node; indexing them separately would
    // inflate the detected count and evict real posts from the index.
    const found = collectMedia({ items: [carousel] });
    expect(found).toHaveLength(1);
    expect(found[0].slides).toHaveLength(3);
  });

  it('returns nothing for unrelated JSON', () => {
    expect(collectMedia({ status: 'ok', friendship: { following: true } })).toEqual([]);
  });
});
