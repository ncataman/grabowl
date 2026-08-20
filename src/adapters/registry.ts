/**
 * Adapter selection. Newest first: the first adapter whose selfTest passes wins,
 * so shipping a new dated adapter is all that's needed after an Instagram redesign.
 */
import { adapter202608 } from './dom-2026-08';
import type { SelectorSet } from './selectors';

const ADAPTERS: SelectorSet[] = [adapter202608];

let cached: SelectorSet | undefined;

export function pickAdapter(root: ParentNode = document): SelectorSet {
  if (cached) return cached;
  cached = ADAPTERS.find((a) => a.selfTest(root)) ?? ADAPTERS[ADAPTERS.length - 1];
  return cached;
}

/** Re-run selection, e.g. after an SPA route change moved us to a new surface. */
export function resetAdapter(): void {
  cached = undefined;
}
