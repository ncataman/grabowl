/** Console logging with a consistent prefix. Nothing is stored or transmitted. */
export const log = {
  warn: (...args: unknown[]) => console.warn('[InsDown]', ...args),
  error: (...args: unknown[]) => console.error('[InsDown]', ...args),
};
