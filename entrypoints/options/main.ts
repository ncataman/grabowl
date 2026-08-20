/** Options page: filename pattern with live preview, plus bulk safety limits. */
import { buildFilename, DEFAULT_PATTERN } from '../../src/core/filename';
import { loadSettings, saveSettings } from '../../src/core/settings';
import { applyI18n } from '../../src/ui/i18n-dom';
import type { MediaItem } from '../../src/core/media-model';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const pattern = $<HTMLInputElement>('pattern');
const concurrency = $<HTMLInputElement>('concurrency');
const cap = $<HTMLInputElement>('cap');
const activePagination = $<HTMLInputElement>('activePagination');
const zipBulk = $<HTMLInputElement>('zipBulk');
const gridButton = $<HTMLSelectElement>('gridButton');
const preview = $('preview');
const saved = $('saved');

const SAMPLE: MediaItem = {
  pk: '3210987654321098765',
  shortcode: 'C9xAmPle01',
  type: 'carousel',
  username: 'natgeo',
  takenAt: 1755561600,
  slides: [{ kind: 'image', url: 'https://scontent.cdninstagram.com/v/t51/sample_n.jpg' }],
};

function renderPreview() {
  try {
    preview.textContent = buildFilename(pattern.value, SAMPLE, SAMPLE.slides[0], 0);
  } catch {
    preview.textContent = '—';
  }
}

pattern.addEventListener('input', renderPreview);

$('save').addEventListener('click', async () => {
  const trimmed = pattern.value.trim();
  await saveSettings({
    // Omit the pattern entirely when the field is blank, so the stored default
    // survives instead of being overwritten with an empty (or undefined) value.
    ...(trimmed ? { filenamePattern: trimmed } : {}),
    concurrency: Math.min(8, Math.max(1, Number(concurrency.value) || 4)),
    bulkCap: Math.min(1000, Math.max(10, Number(cap.value) || 200)),
    activePagination: activePagination.checked,
    zipBulk: zipBulk.checked,
    gridButton: gridButton.value === 'always' ? 'always' : 'hover',
  });
  if (!trimmed) pattern.value = DEFAULT_PATTERN;
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 2000);
});

async function init() {
  applyI18n(document);
  const settings = await loadSettings();
  pattern.value = settings.filenamePattern;
  concurrency.value = String(settings.concurrency);
  cap.value = String(settings.bulkCap);
  activePagination.checked = settings.activePagination;
  zipBulk.checked = settings.zipBulk;
  gridButton.value = settings.gridButton;
  renderPreview();
}

void init();
