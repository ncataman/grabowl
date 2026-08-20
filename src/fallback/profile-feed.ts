/**
 * Opt-in active pagination for bulk download.
 *
 * The default bulk path uses only what the interceptor already captured while the
 * user scrolled — zero extra requests, zero account risk. When the user explicitly
 * enables active pagination we walk the profile feed ourselves, slowly.
 */
import { privateApiHeaders } from '../core/csrf';
import { collectMedia } from '../core/parse-media';
import { jitter, withBackoff } from '../core/throttle';
import type { MediaItem } from '../core/media-model';

interface FeedPage {
  items: MediaItem[];
  nextMaxId?: string;
}

export async function fetchUserId(username: string): Promise<string> {
  const response = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    { headers: privateApiHeaders(), credentials: 'include' },
  );
  if (!response.ok) throw new Error(`profile lookup failed (${response.status})`);
  const payload = await response.json();
  const id = payload?.data?.user?.id;
  if (!id) throw new Error('profile id not found');
  return String(id);
}

/**
 * The account's profile picture at the largest size Instagram exposes. Uses the
 * same web_profile_info endpoint and the user's own session — no extra HTTP path.
 */
export async function fetchProfilePicUrl(username: string): Promise<string> {
  const response = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    { headers: privateApiHeaders(), credentials: 'include' },
  );
  if (!response.ok) throw new Error(`profile lookup failed (${response.status})`);
  const payload = await response.json();
  const user = payload?.data?.user;
  const url: unknown = user?.hd_profile_pic_url_info?.url ?? user?.profile_pic_url_hd;
  if (typeof url !== 'string' || !url) throw new Error('profile picture not found');
  return url;
}

async function fetchFeedPage(userId: string, maxId?: string): Promise<FeedPage> {
  const params = new URLSearchParams({ count: '12' });
  if (maxId) params.set('max_id', maxId);
  const response = await fetch(
    `https://www.instagram.com/api/v1/feed/user/${userId}/?${params}`,
    { headers: privateApiHeaders(), credentials: 'include' },
  );
  if (response.status === 429) throw new Error('rate-limited');
  if (!response.ok) throw new Error(`feed page failed (${response.status})`);
  const payload = await response.json();
  return {
    items: collectMedia(payload),
    nextMaxId: payload?.more_available ? payload?.next_max_id : undefined,
  };
}

export interface PaginateOptions {
  cap: number;
  onProgress?(count: number): void;
  shouldStop?(): boolean;
}

/**
 * Walk a profile timeline until the cap is reached. Deliberately slow: 3-6s
 * between pages with jitter, and it stops on the first hard failure rather than
 * hammering an account into a soft block.
 */
export async function paginateProfile(
  username: string,
  { cap, onProgress, shouldStop }: PaginateOptions,
): Promise<MediaItem[]> {
  const userId = await fetchUserId(username);
  const collected = new Map<string, MediaItem>();
  let maxId: string | undefined;

  while (collected.size < cap) {
    if (shouldStop?.()) break;
    const page = await withBackoff(() => fetchFeedPage(userId, maxId));
    for (const item of page.items) {
      if (collected.size >= cap) break;
      collected.set(item.pk, item);
    }
    onProgress?.(collected.size);
    if (!page.nextMaxId) break;
    maxId = page.nextMaxId;
    await jitter(3000, 6000);
  }

  return [...collected.values()];
}
