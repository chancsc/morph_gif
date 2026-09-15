// Keeps public/gif.worker.js in sync with the installed gif.js version, so
// the worker gif.js spawns at runtime always matches the encoder it ships
// with. Runs automatically via the "postinstall" npm script.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules', 'gif.js', 'dist', 'gif.worker.js');
const destDir = join(root, 'public');
const dest = join(destDir, 'gif.worker.js');

if (!existsSync(src)) {
  console.warn(`sync-gif-worker: source not found at ${src}, skipping`);
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('sync-gif-worker: copied gif.worker.js to public/');
