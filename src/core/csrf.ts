/** Shortcode <-> primary key conversion and the headers Instagram's private API expects. */

/** Instagram's base64 alphabet for shortcodes. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** instagram.com/p/{shortcode}/ -> numeric media pk. */
export function shortcodeToPk(shortcode: string): string {
  let value = 0n;
  for (const char of shortcode) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`Invalid shortcode character: ${char}`);
    value = value * 64n + BigInt(digit);
  }
  return value.toString();
}

export function pkToShortcode(pk: string): string {
  let value = BigInt(pk);
  if (value === 0n) return ALPHABET[0];
  let out = '';
  while (value > 0n) {
    out = ALPHABET[Number(value % 64n)] + out;
    value /= 64n;
  }
  return out;
}

/** Extract /p/, /reel/ or /tv/ shortcode from an Instagram URL or path. */
export function shortcodeFromUrl(url: string): string | undefined {
  return /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url)?.[1];
}

export function usernameFromProfileUrl(url: string): string | undefined {
  const path = (() => {
    try {
      return new URL(url, 'https://www.instagram.com').pathname;
    } catch {
      return url;
    }
  })();
  const match = /^\/([A-Za-z0-9._]+)(?:\/(?:reels|tagged|saved)?)?\/?$/.exec(path);
  const reserved = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'direct', 'accounts']);
  const username = match?.[1];
  return username && !reserved.has(username) ? username : undefined;
}

/** Instagram's public web app id; required on every private-API call. */
export const IG_APP_ID = '936619743392459';

export function readCsrfToken(): string {
  return /csrftoken=([^;]+)/.exec(document.cookie)?.[1] ?? '';
}

export function privateApiHeaders(): Record<string, string> {
  return {
    'x-ig-app-id': IG_APP_ID,
    'x-csrftoken': readCsrfToken(),
    'x-requested-with': 'XMLHttpRequest',
  };
}
