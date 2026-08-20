/**
 * Second tier of the resolution chain: ask Instagram directly for one media item.
 *
 * Runs in the content script so the request carries the user's own cookies and
 * looks like a first-party call. Throttled hard — this is the only path that adds
 * network traffic to the user's session.
 */
import { privateApiHeaders, shortcodeToPk } from '../core/csrf';
import { collectMedia } from '../core/parse-media';
import { Throttle } from '../core/throttle';
import type { MediaItem } from '../core/media-model';

const throttle = new Throttle(1500);

export async function fetchMediaByShortcode(shortcode: string): Promise<MediaItem | undefined> {
  const pk = shortcodeToPk(shortcode);
  return throttle.run(async () => {
    const response = await fetch(`https://www.instagram.com/api/v1/media/${pk}/info/`, {
      headers: privateApiHeaders(),
      credentials: 'include',
    });
    if (response.status === 429) throw new Error('rate-limited');
    if (!response.ok) throw new Error(`info API ${response.status}`);
    const payload = await response.json();
    const items = collectMedia(payload);
    return items.find((item) => item.shortcode === shortcode || item.pk === pk) ?? items[0];
  });
}
