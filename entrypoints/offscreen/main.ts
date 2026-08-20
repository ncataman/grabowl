/** Offscreen document: builds zip archives on behalf of the service worker. */
import { browser } from '../../src/lib/browser';
import { zipFiles } from '../../src/download/zip-worker';
import { fail, ok, type Message } from '../../src/core/messaging';

browser.runtime.onMessage.addListener((raw: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
  const message = raw as Message;
  if (message?.t !== 'ZIP_BUILD') return false;
  zipFiles(message.files)
    .then((url) => sendResponse(ok(url)))
    .catch((error) => sendResponse(fail(error)));
  return true;
});
