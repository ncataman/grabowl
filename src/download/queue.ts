/**
 * Concurrency-limited download queue running in the background context.
 *
 * CDN URLs are signed and publicly fetchable, so they go straight to
 * downloads.download without a fetch round trip — that keeps memory flat and is
 * why a bulk run of hundreds of files cannot stall the service worker.
 *
 * Completion is tracked through downloads.onChanged, not through the
 * download() promise: that promise resolves as soon as the transfer *starts*,
 * so counting it would both defeat the concurrency limit and report files as
 * saved that later failed.
 */
import { browser } from '../lib/browser';
import { log } from '../lib/logger';
import type { DownloadSpec } from '../core/media-model';

type DownloadDelta = Parameters<Parameters<typeof browser.downloads.onChanged.addListener>[0]>[0];

export interface QueueEvents {
  onProgress?(done: number, failed: number, total: number): void;
  onDrain?(): void;
}

export class DownloadQueue {
  private pending: DownloadSpec[] = [];
  /** Download ids currently transferring. */
  private active = new Set<number>();
  private done = 0;
  private failed = 0;
  private total = 0;
  private paused = false;
  /**
   * download() calls awaiting an id. The drain check must wait for these too:
   * otherwise the first one to reject fires onDrain while its siblings are still
   * starting, their ids land in a queue with no listener, and their completions
   * are never counted.
   */
  private starting = 0;
  /** Callbacks from enqueueAndWait; each returns true once its batch is done. */
  private waiters: (() => boolean)[] = [];

  constructor(private concurrency: number, private events: QueueEvents = {}) {}

  enqueue(specs: DownloadSpec[]): void {
    this.pending.push(...specs);
    this.total += specs.length;
    this.pump();
  }

  /**
   * Enqueue and resolve once these specific files have finished, with their
   * outcome. Used by single-post downloads, where the button must not claim
   * success before the transfer completes.
   */
  async enqueueAndWait(specs: DownloadSpec[]): Promise<{ done: number; failed: number }> {
    const before = { done: this.done, failed: this.failed };
    this.enqueue(specs);

    await new Promise<void>((resolve) => {
      const settled = () => this.done - before.done + (this.failed - before.failed);
      if (settled() >= specs.length) return resolve();
      this.waiters.push(() => {
        if (settled() >= specs.length) {
          resolve();
          return true;
        }
        return false;
      });
    });

    return { done: this.done - before.done, failed: this.failed - before.failed };
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.pump();
  }

  /** Drops everything queued. Transfers already under way are left to finish. */
  cancel(): void {
    this.pending = [];
    this.paused = false;
  }

  /** What has not been handed to the browser yet, for persisting a paused run. */
  remaining(): DownloadSpec[] {
    return [...this.pending];
  }

  /** True once nothing is queued, transferring, or mid-start. */
  isIdle(): boolean {
    return !this.pending.length && this.active.size === 0 && this.starting === 0;
  }

  /**
   * Fed by the single top-level downloads.onChanged listener in the background.
   * A per-queue listener registered lazily would not survive MV3 worker
   * eviction — Chrome only revives a worker for listeners bound at eval time.
   */
  handleChange(delta: DownloadDelta): void {
    if (!this.active.has(delta.id) || !delta.state) return;
    const state = delta.state.current;
    if (state !== 'complete' && state !== 'interrupted') return;

    this.active.delete(delta.id);
    if (state === 'complete') this.done++;
    else this.failed++;

    this.settle();
  }

  private settle(): void {
    this.waiters = this.waiters.filter((waiter) => !waiter());
    this.events.onProgress?.(this.done, this.failed, this.total);
    if (this.isIdle()) {
      this.events.onDrain?.();
      return;
    }
    this.pump();
  }

  private pump(): void {
    while (!this.paused && this.active.size + this.starting < this.concurrency && this.pending.length) {
      void this.start(this.pending.shift()!);
    }
  }

  private async start(spec: DownloadSpec): Promise<void> {
    this.starting++;
    try {
      const id = await browser.downloads.download({
        url: spec.url,
        filename: spec.filename,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      // A rejected download resolves with an undefined id on some browsers.
      if (typeof id !== 'number') throw new Error('download was not accepted');
      this.active.add(id);
    } catch (error) {
      this.failed++;
      log.warn('download failed', spec.filename, error);
    } finally {
      this.starting--;
      // Re-evaluate now that this start has resolved: pump the next spec, or
      // drain if this was the last one and nothing is transferring.
      this.settle();
    }
  }
}
