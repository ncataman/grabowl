/**
 * Single import point for extension APIs. WXT's `browser` is already the
 * promise-based, cross-browser namespace, so no polyfill is needed.
 */
import { browser } from 'wxt/browser';

export { browser };

/** Chromium needs an offscreen document for blob URLs; Firefox event pages do not. */
export const hasOffscreen = typeof (browser as any)?.offscreen !== 'undefined';
