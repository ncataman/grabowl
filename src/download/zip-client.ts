/**
 * Zip orchestration.
 *
 * MV3 service workers have no URL.createObjectURL, so Chromium builds the archive
 * in an offscreen document. Firefox's background is an event page with full DOM
 * access, so it zips in place and skips the offscreen dance entirely.
 */
import { browser, hasOffscreen } from '../lib/browser';
import type { Message } from '../core/messaging';

const OFFSCREEN_PATH = 'offscreen.html';

let creating: Promise<void> | undefined;

async function ensureOffscreen(): Promise<void> {
  const offscreen = (browser as any).offscreen;
  const existing = await (browser.runtime as any).getContexts?.({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existing?.length) return;
  if (!creating) {
    creating = offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['BLOBS'],
        justification: 'Bundle downloaded media into a zip archive.',
      })
      .finally(() => {
        creating = undefined;
      });
  }
  await creating;
}

export interface ZipRequest {
  files: { url: string; name: string }[];
}

/** Builds the archive and returns an object URL that downloads.download can consume. */
export async function buildZip({ files }: ZipRequest): Promise<string> {
  if (hasOffscreen) {
    await ensureOffscreen();
    const message: Message = { t: 'ZIP_BUILD', files };
    const result = (await browser.runtime.sendMessage(message)) as
      | { ok: true; value: string }
      | { ok: false; error: string };
    if (!result?.ok) throw new Error(result?.error ?? 'zip failed');
    return result.value;
  }

  // Firefox: the event page can do this itself.
  const { zipFiles } = await import('./zip-worker');
  return zipFiles(files);
}

/**
 * Release the archive after the download has taken it. On Chromium, closing the
 * offscreen document tears down every object URL it created; on Firefox the blob
 * URL was made in this context, so revoke it here.
 */
export async function releaseZip(url: string): Promise<void> {
  if (hasOffscreen) {
    await (browser as any).offscreen?.closeDocument?.().catch?.(() => {});
    return;
  }
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* already gone */
  }
}
