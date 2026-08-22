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

// _locales code -> AMO/BCP-47 code.
const LOCALE = {
  en: 'en-US', tr: 'tr', pt_BR: 'pt-BR', es: 'es-ES', id: 'id',
  hi: 'hi-IN', ar: 'ar', ru: 'ru', de: 'de', fr: 'fr',
};

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

async function api(path, { method = 'GET', json, form } = {}) {
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
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}\n${JSON.stringify(data, null, 2).slice(0, 1500)}`);
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

  // Pick real Firefox category slugs from AMO rather than guessing.
  const cats = await api('/addons/categories/');
  const ffExt = cats.filter((c) => c.application === 'firefox' && c.type === 'extension');
  const pick = ['download-management', 'social-communication', 'photos-music']
    .filter((slug) => ffExt.some((c) => c.slug === slug))
    .slice(0, 2);
  const categories = pick.length ? pick : [ffExt[0]?.slug].filter(Boolean);
  console.log('• Kategori:', categories.join(', '));

  if (DRY) {
    console.log('\n--dry-run: kimlik + paket + kategori doğrulandı. Gönderim yapılmadı.');
    return;
  }

  console.log('• Add-on oluşturuluyor (10 dil metin)…');
  const created = await api('/addons/addon/', {
    method: 'POST',
    json: {
      slug: SLUG,
      categories,
      name: translations(listing, 'name'),
      summary: translations(listing, 'summary'),
      description: translations(listing, 'description'),
      is_experimental: false,
      version: { upload: up.uuid, license: 'MIT' },
    },
  });
  const id = created.id ?? created.slug ?? SLUG;
  const versionId = created.version?.id ?? created.current_version?.id;
  console.log(`  oluşturuldu: ${created.slug} (id ${id})`);

  // Sources are required whenever the build is bundled (ours is).
  if (versionId) {
    console.log('• Kaynak arşivi ekleniyor…');
    const sform = new FormData();
    sform.append('source', await fileBlob(SOURCES), basename(SOURCES));
    await api(`/addons/addon/${id}/versions/${versionId}/`, { method: 'PATCH', form: sform });
    console.log('  kaynak eklendi.');
  }

  console.log('• Ekran görüntüleri yükleniyor…');
  for (let n = 1; n <= 5; n++) {
    const pform = new FormData();
    pform.append('image', await fileBlob(`${ROOT}store-assets/screenshots/en/${n}.png`), `${n}.png`);
    // AMO keeps one screenshot set; caption localizes per language.
    const caption = {};
    for (const [code, amo] of Object.entries(LOCALE)) {
      const c = captions[code]?.[String(n)];
      if (c) caption[amo] = c[0];
    }
    pform.append('caption', JSON.stringify(caption));
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
