/**
 * Background context. Owns the download queue and the bulk session so a job keeps
 * running while the user scrolls away or closes the popup.
 */
import { browser } from '../src/lib/browser';
import { log } from '../src/lib/logger';
import { buildFilename } from '../src/core/filename';
import { loadSettings } from '../src/core/settings';
import { DownloadQueue } from '../src/download/queue';
import { buildZip } from '../src/download/zip-client';
import { fail, ok, type BulkProgress, type Message } from '../src/core/messaging';
import type { DownloadSpec, MediaItem } from '../src/core/media-model';

export default defineBackground(() => {
  let queue: DownloadQueue | undefined;
  let adhoc: DownloadQueue | undefined;
  let bulk: BulkProgress | undefined;

  /**
   * Identifies the current bulk run. A cancelled queue's in-flight downloads
   * keep settling afterwards, and without this their callbacks would write stale
   * counters into the next session.
   */
  let session = 0;

  /** Progress carried over from a previous worker, added to the live queue's counts. */
  let baseDone = 0;
  let baseFailed = 0;

  /**
   * A paused run leaves the service worker idle, and Chrome evicts it within
   * about 30 seconds. Session storage is what lets Resume still mean something
   * after that; it is cleared when the browser closes, which is the right
   * lifetime for a download job.
   */
  const SESSION_KEY = 'bulkSession';

  async function persist() {
    const state = bulk ? { progress: bulk, pending: queue?.remaining() ?? [] } : undefined;
    await browser.storage.session.set({ [SESSION_KEY]: state });
  }

  async function restore(): Promise<{ progress: BulkProgress; pending: DownloadSpec[] } | undefined> {
    if (bulk) return undefined;
    const stored = await browser.storage.session.get(SESSION_KEY);
    const state = stored[SESSION_KEY] as { progress: BulkProgress; pending: DownloadSpec[] } | undefined;
    if (!state?.progress) return undefined;
    bulk = state.progress;
    return state;
  }

  function publishProgress() {
    if (!bulk) return;
    // The popup may be closed; a rejected sendMessage here is expected and harmless.
    browser.runtime.sendMessage({ t: 'BULK_PROGRESS', progress: bulk }).catch(() => {});
    void persist();
  }

  /** Expand every slide of every item into concrete download specs. */
  function specsFor(items: MediaItem[], pattern: string): DownloadSpec[] {
    return items.flatMap((item) =>
      item.slides.map((slide, index) => ({
        url: slide.url,
        filename: buildFilename(pattern, item, slide, index),
      })),
    );
  }

  async function startBulk(username: string, items: MediaItem[], useZip: boolean) {
    // Retire any previous run before touching shared state.
    queue?.cancel();
    const mine = ++session;
    baseDone = 0;
    baseFailed = 0;

    const settings = await loadSettings();
    const specs = specsFor(items, settings.filenamePattern);
    if (!specs.length) return fail('nothing to download');

    bulk = {
      username,
      status: 'running',
      total: specs.length,
      done: 0,
      failed: 0,
      // A zip is built in one shot; there is nothing meaningful to pause.
      pausable: !useZip,
    };
    publishProgress();

    if (useZip) {
      queue = undefined;
      try {
        const url = await buildZip({
          files: specs.map((spec) => ({ url: spec.url, name: spec.filename.split('/').pop()! })),
        });
        await browser.downloads.download({
          url,
          filename: `Grabowl/${username}.zip`,
          conflictAction: 'uniquify',
        });
        if (session === mine) bulk = { ...bulk, status: 'done', done: specs.length };
      } catch (error) {
        log.error('zip bulk failed', error);
        if (session === mine) bulk = { ...bulk, status: 'error', message: String(error) };
      }
      if (session === mine) publishProgress();
      return ok(bulk);
    }

    queue = makeQueue(settings.concurrency, mine);
    queue.enqueue(specs);
    return ok(bulk);
  }

  function makeQueue(concurrency: number, mine: number): DownloadQueue {
    return new DownloadQueue(concurrency, {
      onProgress: (done, failed) => {
        if (!bulk || session !== mine) return;
        // Counters are relative to this queue, so a rebuilt one continues from
        // what the persisted progress already recorded.
        bulk = { ...bulk, done: baseDone + done, failed: baseFailed + failed };
        publishProgress();
      },
      onDrain: () => {
        if (!bulk || session !== mine) return;
        bulk = { ...bulk, status: 'done' };
        publishProgress();
      },
    });
  }

  /** Restart a persisted run in a fresh service worker, keeping its progress. */
  async function rebuildQueue(pending: DownloadSpec[]): Promise<DownloadQueue> {
    const settings = await loadSettings();
    baseDone = bulk?.done ?? 0;
    baseFailed = bulk?.failed ?? 0;
    const rebuilt = makeQueue(settings.concurrency, session);
    rebuilt.pause();
    rebuilt.enqueue(pending);
    return rebuilt;
  }

  browser.runtime.onMessage.addListener(
    (raw: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
      const message = raw as Message;
      // The offscreen document answers ZIP_BUILD itself.
      if (!message?.t || message.t === 'ZIP_BUILD') return false;

      (async () => {
        switch (message.t) {
          case 'DOWNLOAD': {
            const settings = await loadSettings();
            const { item, slideIndices } = message;
            const chosen = slideIndices ?? item.slides.map((_, i) => i);
            const specs = chosen
              .filter((i) => item.slides[i])
              .map((i) => ({
                url: item.slides[i].url,
                filename: buildFilename(settings.filenamePattern, item, item.slides[i], i),
              }));
            if (!specs.length) return fail('no media to download');

            adhoc ??= new DownloadQueue(settings.concurrency);
            // Report the real outcome: the overlay says "Saved" on success, so
            // answering before the transfer finishes would be a lie.
            const { done, failed } = await adhoc.enqueueAndWait(specs);
            return failed ? fail(`${failed} of ${specs.length} downloads failed`) : ok(done);
          }
          case 'BULK_START':
            return await startBulk(message.username, message.items, message.options.zip);
          case 'BULK_PAUSE':
            if (!queue || !bulk) return fail('nothing to pause');
            queue.pause();
            bulk = { ...bulk, status: 'paused' };
            publishProgress();
            return ok(bulk);
          case 'BULK_RESUME': {
            // The worker was probably evicted while paused, taking the queue
            // with it; rebuild it from what was persisted.
            const restored = await restore();
            if (restored && restored.pending.length) queue = await rebuildQueue(restored.pending);
            if (!queue || !bulk) return fail('nothing to resume');
            queue.resume();
            bulk = { ...bulk, status: 'running' };
            publishProgress();
            return ok(bulk);
          }
          case 'BULK_CANCEL':
            session++;
            queue?.cancel();
            queue = undefined;
            bulk = undefined;
            await browser.storage.session.remove(SESSION_KEY);
            return ok();
          case 'BULK_STATUS':
            await restore();
            return ok(bulk);
          default:
            return fail(`unhandled message: ${(message as any).t}`);
        }
      })()
        .then(sendResponse)
        .catch((error) => {
          log.error(error);
          sendResponse(fail(error));
        });

      return true;
    },
  );
});
