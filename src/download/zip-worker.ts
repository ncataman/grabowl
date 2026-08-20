/**
 * Zip building. Runs in a DOM context (offscreen document on Chromium, event page
 * on Firefox) because it needs fetch + Blob + URL.createObjectURL.
 */
import { zip } from 'fflate';

/** Fetch each file, archive it, and return an object URL for downloads.download. */
export async function zipFiles(files: { url: string; name: string }[]): Promise<string> {
  const entries: Record<string, Uint8Array> = {};

  // Sequential on purpose: a bulk zip of hundreds of files must not hold hundreds
  // of responses in memory at once.
  for (const file of files) {
    try {
      const response = await fetch(file.url);
      if (!response.ok) continue;
      entries[file.name] = new Uint8Array(await response.arrayBuffer());
    } catch {
      // Skip unreachable media rather than failing the whole archive.
    }
  }

  if (!Object.keys(entries).length) throw new Error('nothing to archive');

  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    // level 0: media is already compressed; deflating it wastes seconds for nothing.
    zip(entries, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data)));
  });

  return URL.createObjectURL(new Blob([archive as BlobPart], { type: 'application/zip' }));
}
