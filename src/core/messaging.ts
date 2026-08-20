/** Typed message contracts between MAIN world, content script, background and UI. */
import type { MediaItem } from './media-model';

/** window.postMessage envelope, MAIN world -> ISOLATED content script. */
export const PAGE_BRIDGE_SOURCE = 'insdown';

export type PageBridgeMessage =
  | { source: typeof PAGE_BRIDGE_SOURCE; kind: 'MEDIA_FOUND'; items: MediaItem[] }
  /** Content script announcing it is listening, so the interceptor can flush. */
  | { source: typeof PAGE_BRIDGE_SOURCE; kind: 'BRIDGE_READY' };

export interface BulkOptions {
  zip: boolean;
}

export interface BulkProgress {
  username: string;
  status: 'running' | 'paused' | 'done' | 'error';
  total: number;
  done: number;
  failed: number;
  /** False for zip runs, which are built in one shot and cannot be paused. */
  pausable: boolean;
  message?: string;
}

export type Message =
  /** Slide indices to save; omit to save every slide. */
  | { t: 'DOWNLOAD'; item: MediaItem; slideIndices?: number[] }
  | { t: 'BULK_START'; username: string; items: MediaItem[]; options: BulkOptions }
  | { t: 'BULK_PAUSE' }
  | { t: 'BULK_RESUME' }
  | { t: 'BULK_CANCEL' }
  | { t: 'BULK_STATUS' }
  | { t: 'QUERY_TAB_MEDIA' }
  /**
   * Sent to the content script: gather everything downloadable for this profile.
   * Pagination has to run there so the requests carry the user's own session.
   */
  | { t: 'COLLECT_BULK'; username: string; activePagination: boolean; cap: number }
  | { t: 'ZIP_BUILD'; files: { url: string; name: string }[] };

export type MessageResult =
  | { ok: true; value?: unknown }
  | { ok: false; error: string };

export function ok(value?: unknown): MessageResult {
  return { ok: true, value };
}

export function fail(error: unknown): MessageResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}
