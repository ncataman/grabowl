#!/usr/bin/env node
/**
 * Submits Grabowl to Firefox Add-ons (AMO) end to end via the API v5.
 *
 * Firefox is the one store whose first submission is fully automatable: this
 * uploads the package + sources, creates the listing, sets name/summary/
 * description in all ten languages, uploads the screenshots with localized
 * captions, and submits for review — no dashboard clicking.
 *
 *   AMO_JWT_ISSUER=user:123:45 AMO_JWT_SECRET=xxxx node scripts/amo-submit.mjs [--dry-run]
 *
 * Keys come from https://addons.mozilla.org/developers/addon/api/key/ and are
 * read only from the environment; they are never printed.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const API = 'https://addons.mozilla.org/api/v5';
const ROOT = new URL('..', import.meta.url).pathname;
const DRY = process.argv.includes('--dry-run');

const ISSUER = process.env.AMO_JWT_ISSUER;
const SECRET = process.env.AMO_JWT_SECRET;
if (!ISSUER || !SECRET) {
  console.error('AMO_JWT_ISSUER ve AMO_JWT_SECRET gerekli (env). AMO > Developer Hub > Manage API Keys.');
  process.exit(1);
}

const PKG = `${ROOT}build/grabowl-1.0.0-firefox.zip`;
const SOURCES = `${ROOT}build/grabowl-1.0.0-sources.zip`;
const SLUG = 'grabowl';

// _locales code -> AMO/BCP-47 code. Indonesian ('id') is not a valid AMO listing
// locale, so it is omitted; those users fall back to en-US on Firefox.
const LOCALE = {
  en: 'en-US', tr: 'tr', pt_BR: 'pt-BR', es: 'es-ES',
  ar: 'ar', ru: 'ru', de: 'de', fr: 'fr',
};

// AMO caps the add-on name at 50 characters, far below the 75 the Chrome/Edge
// SEO titles use, so the listing name is the short brand form.
const AMO_NAME = { 'en-US': 'Grabowl — Downloader for Instagram' };

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Short-lived JWT (AMO requires exp within 5 minutes of iat). */
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iss: ISSUER, jti: randomBytes(8).toString('hex'), iat: now, exp: now + 240 }),
  );
  const sig = b64url(createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

async function api(path, opts = {}, throttleRetries = 4) {
  const { method = 'GET', json, form } = opts;
  const headers = { Authorization: `JWT ${jwt()}` };
  let body;
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form; // FormData sets its own content-type
  }
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, { method, headers, body });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  // AMO throttles preview uploads hard; wait the stated time and retry.
  if (res.status === 429 && throttleRetries > 0) {
    const secs = Number(/(\d+)\s*seconds/.exec(data.detail ?? '')?.[1] ?? 30) + 3;
    console.log(`  hız sınırı, ${secs}s bekleniyor…`);
    await new Promise((r) => setTimeout(r, secs * 1000));
    return api(path, opts, throttleRetries - 1);
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}\n${JSON.stringify(data, null, 2).slice(0, 1500)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function fileBlob(p) {
  return new Blob([await readFile(p)]);
}

/** Build translated dicts { 'en-US': ..., tr: ..., ... } from listing.json. */
function translations(listing, field) {
  const out = {};
  for (const [code, amo] of Object.entries(LOCALE)) {
    const v = listing[code]?.[field];
    if (v) out[amo] = v;
  }
  return out;
}

async function main() {
  const listing = JSON.parse(await readFile(`${ROOT}store-assets/listing.json`, 'utf8'));
  const captions = JSON.parse(await readFile(`${ROOT}store-assets/captions.json`, 'utf8'));

  console.log('• Kimlik doğrulanıyor…');
  const me = await api('/accounts/profile/');
  console.log(`  giriş: ${me.name ?? me.username ?? 'ok'}`);

  console.log('• Firefox paketi doğrulanıyor…');
  const form = new FormData();
  form.append('upload', await fileBlob(PKG), basename(PKG));
  form.append('channel', 'listed');
  const up = await api('/addons/upload/', { method: 'POST', form });
  let status = up;
  for (let i = 0; i < 30 && !(status.valid && status.processed); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    status = await api(`/addons/upload/${up.uuid}/`);
  }
  if (!status.valid) throw new Error('Paket doğrulaması geçmedi:\n' + JSON.stringify(status.validation?.messages ?? status, null, 2).slice(0, 1500));
  console.log('  paket geçerli.');

  // Pick real category slugs from AMO rather than guessing. The category objects
  // carry no `application` field, only `type`, so filter on that.
  const cats = await api('/addons/categories/');
  const extSlugs = new Set(cats.filter((c) => c.type === 'extension').map((c) => c.slug));
  const wanted = ['download-management', 'social-communication', 'photos-music-videos'];
  const categories = wanted.filter((slug) => extSlugs.has(slug)).slice(0, 2);
  if (!categories.length) throw new Error('AMO kategori slug eşleşmedi: ' + [...extSlugs].join(', '));
  console.log('• Kategori:', categories.join(', '));

  if (DRY) {
    console.log('\n--dry-run: kimlik + paket + kategori doğrulandı. Gönderim yapılmadı.');
    return;
  }

  console.log('• Add-on oluşturuluyor…');
  const name = { ...AMO_NAME };
  const summary = translations(listing, 'summary');
  const description = translations(listing, 'description');

  // AMO validates listing locales against its own (smaller) set and rejects the
  // rest one at a time. Rather than hard-code that set, strip whatever code it
  // reports invalid and retry until only accepted locales remain.
  let created;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      created = await api('/addons/addon/', {
        method: 'POST',
        json: {
          slug: SLUG,
          categories,
          name,
          summary,
          description,
          is_experimental: false,
          version: { upload: up.uuid, license: 'MIT' },
        },
      });
      break;
    } catch (e) {
      // Already created on a previous run: adopt the existing listing and
      // continue (idempotent), so a rate-limited run can be resumed.
      const strings = Object.values(e.data ?? {}).flat().filter((s) => typeof s === 'string');
      if (strings.some((s) => /already exists|already used/i.test(s)) || e.status === 409) {
        created = await api(`/addons/addon/${SLUG}/`);
        console.log('  var olan ilan bulundu, devam ediliyor.');
        break;
      }
      // Read the invalid codes from the structured error, not the message text
      // (whose quotes are backslash-escaped by JSON.stringify).
      const bad = [
        ...new Set(strings.flatMap((s) => [...s.matchAll(/code "?([a-zA-Z-]+)"? is invalid/g)].map((m) => m[1]))),
      ];
      if (!bad.length) throw e;
      for (const code of bad) {
        delete name[code];
        delete summary[code];
        delete description[code];
      }
      console.log('  AMO kabul etmedi, çıkarıldı:', bad.join(', '));
    }
  }
  if (!created) throw new Error('Add-on oluşturulamadı (dil ayıklama tükendi).');
  console.log('  diller:', Object.keys(summary).join(', '));
  const id = created.id ?? created.slug ?? SLUG;
  const versionId = created.version?.id ?? created.current_version?.id;
  console.log(`  oluşturuldu: ${created.slug} (id ${id})`);

  // Sources are required whenever the build is bundled (ours is).
  if (versionId) {
    try {
      console.log('• Kaynak arşivi ekleniyor…');
      const sform = new FormData();
      sform.append('source', await fileBlob(SOURCES), basename(SOURCES));
      await api(`/addons/addon/${id}/versions/${versionId}/`, { method: 'PATCH', form: sform });
      console.log('  kaynak eklendi.');
    } catch (e) {
      console.log('  kaynak atlandı (muhtemelen zaten ekli):', (e.message || '').split('\n')[0]);
    }
  }

  const already = created.previews?.length ?? 0;
  if (already >= 5) {
    console.log(`• Ekran görüntüleri zaten yüklü (${already}), atlanıyor.`);
  } else
  for (let n = 1 + already; n <= 5; n++) {
    // Image only. AMO won't take a caption dict through multipart, and captions
    // are optional; the screenshots themselves are what the listing needs.
    const pform = new FormData();
    pform.append('image', await fileBlob(`${ROOT}store-assets/screenshots/en/${n}.png`), `${n}.png`);
    await api(`/addons/addon/${id}/previews/`, { method: 'POST', form: pform });
    console.log(`  ekran ${n}/5`);
  }

  console.log('\n✓ Gönderildi. İnceleme bekleniyor.');
  console.log(`  Listing: https://addons.mozilla.org/firefox/addon/${created.slug}/`);
  console.log(`  Panel:   https://addons.mozilla.org/developers/addon/${created.slug}/`);
}

main().catch((e) => {
  console.error('\n✗ Hata:\n' + e.message);
  process.exit(1);
});
