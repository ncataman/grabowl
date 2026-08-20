/** Rate limiting for anything that talks to Instagram on the user's session. */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random delay in [min, max] — constant intervals look automated. */
export function jitter(minMs: number, maxMs: number): Promise<void> {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

/**
 * Serializes calls and keeps at least `minGapMs` between them. Instagram soft-blocks
 * accounts that burst private-API calls, so every fallback path funnels through here.
 */
export class Throttle {
  private chain: Promise<unknown> = Promise.resolve();
  private lastRun = 0;

  constructor(private minGapMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.minGapMs - (Date.now() - this.lastRun);
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        this.lastRun = Date.now();
      }
    });
    this.chain = next.catch(() => {});
    return next as Promise<T>;
  }
}

/** Retry with exponential backoff, used when Instagram answers 429. */
export async function withBackoff<T>(
  task: () => Promise<T>,
  { attempts = 3, baseMs = 4000 } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastError;
}
