/** Console logging with a consistent prefix. Nothing is stored or transmitted. */
export const log = {
  warn: (...args: unknown[]) => console.warn('[Grabowl]', ...args),
  error: (...args: unknown[]) => console.error('[Grabowl]', ...args),
};
