import { beforeEach, describe, expect, it, vi } from 'vitest';

// A controllable fake of chrome.downloads: each download() gets an id, and tests
// drive completion/failure through the registered onChanged listener.
let nextId = 1;
let changeListener: ((delta: any) => void) | undefined;
const started: { id: number; spec: any; reject: boolean }[] = [];

vi.mock('../src/lib/browser', () => ({
  browser: {
    downloads: {
      download: vi.fn(async (spec: any) => {
        const rec = { id: nextId++, spec, reject: spec.url.includes('BOOM') };
        started.push(rec);
        if (rec.reject) throw new Error('rejected');
        return rec.id;
      }),
      onChanged: {
        addListener: (fn: any) => (changeListener = fn),
        removeListener: () => (changeListener = undefined),
      },
    },
  },
}));

import { DownloadQueue } from '../src/download/queue';

function complete(id: number, ok = true) {
  changeListener?.({ id, state: { current: ok ? 'complete' : 'interrupted' } });
}

const spec = (url: string) => ({ url, filename: url });

describe('DownloadQueue', () => {
  beforeEach(() => {
    nextId = 1;
    started.length = 0;
    changeListener = undefined;
  });

  it('resolves enqueueAndWait only after every file settles', async () => {
    const q = new DownloadQueue(2);
    // background owns the listener in production; bind the fake to the instance.
    changeListener = (d) => (q as any).handleChange(d);
    const p = q.enqueueAndWait([spec('a'), spec('b'), spec('c')]);

    let resolved = false;
    void p.then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(false);

    complete(1);
    complete(2);
    await Promise.resolve();
    expect(resolved).toBe(false); // c has not finished

    complete(3);
    const result = await p;
    expect(result).toEqual({ done: 3, failed: 0 });
  });

  it('does not drain early when one start rejects while siblings are pending', async () => {
    const q = new DownloadQueue(3);
    changeListener = (d) => (q as any).handleChange(d);
    let drained = false;
    const q2 = new DownloadQueue(3, { onDrain: () => (drained = true) });
    changeListener = (d) => (q2 as any).handleChange(d);

    q2.enqueue([spec('BOOM'), spec('b'), spec('c')]);
    await Promise.resolve();
    await Promise.resolve();
    // BOOM failed synchronously; b and c are still transferring, so no drain yet.
    expect(drained).toBe(false);

    // Complete the two real downloads (ids 2 and 3; id 1 never existed).
    const ids = started.filter((s) => !s.reject).map((s) => s.id);
    ids.forEach((id) => complete(id));
    await Promise.resolve();
    expect(drained).toBe(true);
  });
});
