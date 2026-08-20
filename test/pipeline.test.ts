/**
 * End-to-end check of the path a real download takes:
 * intercepted payload -> parse -> index -> chosen slide -> download filename.
 * This is the closest we get to testing against Instagram without a live session.
 */
import { describe, expect, it } from 'vitest';
import { collectMedia } from '../src/core/parse-media';
import { MediaIndex } from '../src/core/media-index';
import { buildFilename, DEFAULT_PATTERN } from '../src/core/filename';

/** Shaped like a Polaris GraphQL response carrying a carousel post. */
const graphqlResponse = {
  data: {
    xdt_api__v1__media__shortcode__web_info: {
      items: [
        {
          pk: '3210987654321098765',
          id: '3210987654321098765_1903424587',
          code: 'C9xAmPle01',
          media_type: 8,
          taken_at: 1755561600,
          user: { username: 'natgeo' },
          carousel_media: [
            {
              pk: '3210987654321098766',
              media_type: 1,
              image_versions2: {
                candidates: [
                  { url: 'https://scontent.cdninstagram.com/v/t51/one_1080.jpg?e=1', width: 1080, height: 1350 },
                  { url: 'https://scontent.cdninstagram.com/v/t51/one_320.jpg?e=1', width: 320, height: 400 },
                ],
              },
            },
            {
              pk: '3210987654321098767',
              media_type: 2,
              image_versions2: {
                candidates: [{ url: 'https://scontent.cdninstagram.com/v/t51/two_poster.jpg', width: 1080 }],
              },
              video_versions: [
                { url: 'https://scontent.cdninstagram.com/v/t50/two_hd.mp4?e=2', width: 1080, height: 1920 },
                { url: 'https://scontent.cdninstagram.com/v/t50/two_sd.mp4?e=2', width: 480, height: 854 },
              ],
            },
          ],
        },
      ],
    },
  },
};

describe('download pipeline', () => {
  const index = new MediaIndex();
  index.upsert(collectMedia(graphqlResponse));
  const item = index.getByShortcode('C9xAmPle01')!;

  it('indexes the post by its shortcode, keeping the pk clean of the user suffix', () => {
    expect(item).toBeDefined();
    expect(item.pk).toBe('3210987654321098765');
    expect(item.type).toBe('carousel');
    expect(item.slides).toHaveLength(2);
  });

  it('saves the slide the viewer is on, at full quality', () => {
    // The user has swiped to slide 2, the video.
    const slideIndex = 1;
    const slide = item.slides[slideIndex];
    expect(slide.url).toContain('two_hd.mp4');
    expect(buildFilename(DEFAULT_PATTERN, item, slide, slideIndex)).toBe(
      'InsDown/natgeo/2025-08-19_C9xAmPle01_02.mp4',
    );
  });

  it('numbers every slide in order when downloading the whole carousel', () => {
    const paths = item.slides.map((slide, i) => buildFilename(DEFAULT_PATTERN, item, slide, i));
    expect(paths).toEqual([
      'InsDown/natgeo/2025-08-19_C9xAmPle01_01.jpg',
      'InsDown/natgeo/2025-08-19_C9xAmPle01_02.mp4',
    ]);
  });

  it('never picks a thumbnail candidate', () => {
    expect(item.slides[0].url).toContain('one_1080.jpg');
    expect(item.slides.some((s) => s.url.includes('320'))).toBe(false);
  });
});
