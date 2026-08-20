/**
 * Background context. Owns the download queue and the bulk session so a job keeps
 * running while the user scrolls away or closes the popup.
 */
import { browser } from '../src/lib/browser';
import { log } from '../src/lib/logger';
import { buildFilename, sanitizeSegment } from '../src/core/filename';
import { loadSettings } from '../src/core/settings';
import { isTrustedAsset } from '../src/core/media-index';
import { DownloadQueue } from '../src/download/queue';
import { buildZip, releaseZip } from '../src/download/zip-client';
import { fail, ok, type BulkProgress, type Message } from '../src/core/messaging';
import type { DownloadSpec, MediaItem } from '../src/core/media-model';

export default defineBackground(() => {
  let queue: DownloadQueue | undefined;
  let adhoc: DownloadQueue | undefined;
  let bulk: BulkProgress | undefined;
  /** The tab whose profile button (if any) started the current bulk run. */
  let bulkTabId: number | undefined;

  // Single, eval-time downloads listener. A per-queue listener registered later
  // would not revive an evicted MV3 worker; this one does, and forwards each
  // change to whichever queue owns that download.
  browser.downloads.onChanged.addListener((delta) => {
    queue?.handleChange(delta);
    adhoc?.handleChange(delta);
  });

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

  /**
   * Reads the persisted run. Unlike a guard on `bulk`, it always returns the
   * stored state so Resume can rebuild the queue even after the popup already
   * repopulated `bulk` via BULK_STATUS.
   */
  async function restore(): Promise<{ progress: BulkProgress; pending: DownloadSpec[] } | undefined> {
    const stored = await browser.storage.session.get(SESSION_KEY);
    const state = stored[SESSION_KEY] as { progress: BulkProgress; pending: DownloadSpec[] } | undefined;
    if (!state?.progress) return undefined;
    bulk ??= state.progress;
    return state;
  }

  function publishProgress() {
    if (!bulk) return;
    // Reaches the popup (an extension page). A closed popup rejects — harmless.
    browser.runtime.sendMessage({ t: 'BULK_PROGRESS', progress: bulk }).catch(() => {});
    // runtime.sendMessage does not reach content scripts, so the profile button's
    // progress must be delivered to its tab explicitly.
    if (bulkTabId !== undefined) {
      browser.tabs.sendMessage(bulkTabId, { t: 'BULK_PROGRESS', progress: bulk }).catch(() => {});
    }
    void persist();
  }

  /**
   * On worker startup, resume a bulk run that was still running when the
   * previous worker was evicted. In-flight files (ids lost with the worker) are
   * re-downloaded — uniquify keeps them from clobbering — the rest continue.
   */
  async function resumeIfRunning() {
    if (queue) return;
    const state = await restore();
    if (state?.progress.status === 'running' && state.pending.length) {
      queue = await rebuildQueue(state.pending);
      queue.resume();
    }
  }
  void resumeIfRunning();

  /** Expand every slide of every item into concrete download specs. */
  function specsFor(items: MediaItem[], pattern: string): DownloadSpec[] {
    return items.flatMap((item) =>
      item.slides
        .filter((slide) => isTrustedAsset(slide.url))
        .map((slide, index) => ({
          url: slide.url,
          filename: buildFilename(pattern, item, slide, index),
        })),
    );
  }

  async function startBulk(
    username: string,
    items: MediaItem[],
    useZip: boolean,
    tabId: number | undefined,
  ) {
    const settings = await loadSettings();
    const specs = specsFor(items, settings.filenamePattern);
    // Bail before mutating any shared state, so a no-op start cannot strand the
    // previous run's bulk object with a cancelled queue.
    if (!specs.length) return fail('nothing to download');

    // Retire any previous run.
    queue?.cancel();
    const mine = ++session;
    bulkTabId = tabId;
    baseDone = 0;
    baseFailed = 0;

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
      // Fire-and-forget: awaiting the whole archive here would hold the
      // BULK_START message channel open for minutes and Chrome would tear it
      // down. Completion is reported through publishProgress instead.
      void runZip(specs, username, mine);
      return ok(bulk);
    }

    queue = makeQueue(settings.concurrency, mine);
    queue.enqueue(specs);
    return ok(bulk);
  }

  async function runZip(specs: DownloadSpec[], username: string, mine: number) {
    try {
      const url = await buildZip({
        files: specs.map((spec) => ({ url: spec.url, name: spec.filename.split('/').pop()! })),
      });
      // A superseded run must not still write its archive to disk.
      if (session !== mine) {
        await releaseZip(url);
        return;
      }
      await browser.downloads.download({
        url,
        filename: `Grabowl/${sanitizeSegment(username)}.zip`,
        conflictAction: 'uniquify',
      });
      // Free the archive once the browser has taken it, so it does not sit in
      // the offscreen document's memory for the rest of the session.
      await releaseZip(url);
      if (session === mine && bulk) bulk = { ...bulk, status: 'done', done: specs.length };
    } catch (error) {
      log.error('zip bulk failed', error);
      if (session === mine && bulk) bulk = { ...bulk, status: 'error', message: String(error) };
    }
    if (session === mine) publishProgress();
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
    (
      raw: unknown,
      sender: { id?: string; tab?: { id?: number } },
      sendResponse: (r: unknown) => void,
    ) => {
      // Only our own content scripts and pages may drive downloads. Nothing
      // external is reachable today, but this keeps the RPC closed if a broader
      // match or externally_connectable is ever added.
      if (sender.id !== browser.runtime.id) return false;

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
              .filter((i) => item.slides[i] && isTrustedAsset(item.slides[i].url))
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
            return await startBulk(
              message.username,
              message.items,
              message.options.zip,
              sender.tab?.id,
            );
          case 'BULK_PAUSE':
            if (!queue || !bulk) return fail('nothing to pause');
            queue.pause();
            bulk = { ...bulk, status: 'paused' };
            publishProgress();
            return ok(bulk);
          case 'BULK_RESUME': {
            // The worker was probably evicted while paused, taking the queue
            // with it; rebuild it from what was persisted.
            if (!queue) {
              const restored = await restore();
              if (restored && restored.pending.length) queue = await rebuildQueue(restored.pending);
            }
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
