import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const textExtensions = new Set(['.mjs', '.js', '.css', '.html', '.json']);

/**
 * A short fingerprint of the files that shape the dashboard.
 *
 * The kiosk compares this fingerprint on its minute-by-minute theme poll and
 * reloads once the value changes, so a deploy that restarts the service also
 * updates the browser without anyone touching the Pi.
 */
export async function computeBuildId(rootDirectory) {
  const files = [];

  async function walk(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'data' || entry.name.startsWith('.')) continue;
        await walk(path);
      } else if (textExtensions.has(extname(entry.name))) {
        files.push(path);
      }
    }
  }

  await Promise.all(['lib', 'public', 'scripts'].map((directory) => walk(join(rootDirectory, directory))));
  for (const file of ['server.mjs', 'package.json']) files.push(join(rootDirectory, file));
  files.sort();

  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(rootDirectory, file).split(sep).join('/')).update('\0');
    hash.update(await readFile(file)).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}
