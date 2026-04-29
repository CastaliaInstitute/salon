/**
 * GitHub Pages has no server rewrite for client routes. Copy the /live/ shell to 404.html
 * so deep links like /live/%21room%3Aserver load the SPA bundle.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist', 'live', 'index.html');
const dest = join(root, 'dist', '404.html');

if (!existsSync(src)) {
  console.error('copy-404: missing', src);
  process.exit(1);
}
copyFileSync(src, dest);
console.log('copy-404: wrote', dest);
