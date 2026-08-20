import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  // Not the default ".output": a leading dot hides the folder in Finder and in
  // Chrome's "Load unpacked" picker, which is where every build has to be selected.
  outDir: 'build',
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    author: { email: 'info@ncataman.com' },
    homepage_url: 'https://grabowl.com',
    permissions: ['downloads', 'storage', ...(browser === 'firefox' ? [] : ['offscreen'])],
    host_permissions: [
      '*://www.instagram.com/*',
      '*://i.instagram.com/*',
      '*://*.cdninstagram.com/*',
      '*://*.fbcdn.net/*',
    ],
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'grabowl@ncataman.com', strict_min_version: '121.0' } } }
      : {}),
  }),
});
