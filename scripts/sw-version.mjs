/**
 * Stamp dist/sw.js after `astro build` (salon-pwa-shell design.md).
 *
 * - `__CACHE_VERSION__` → an ISO build timestamp, so every deploy installs a
 *   fresh service-worker cache and sweeps the previous one on activate.
 * - `__MAIN_CSS__` → the hashed main stylesheet href extracted from
 *   dist/index.html (Astro emits content-hashed asset URLs that cannot be
 *   guessed by hand). If no stylesheet link is found, the placeholder stays
 *   put and sw.js filters it out at install — runtime cache-first still
 *   covers hashed assets.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const swPath = join(root, 'dist', 'sw.js');
const indexPath = join(root, 'dist', 'index.html');

function fail(message) {
  console.error(`sw-version: ${message}`);
  process.exit(1);
}

function mainCssHref(indexHtml) {
  const links = [...indexHtml.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)];
  for (const { 0: tag } of links) {
    const href = tag.match(/href="([^"]+\.css)"/)?.[1];
    if (href) return href;
  }
  return null;
}

let sw;
let indexHtml;
try {
  sw = readFileSync(swPath, 'utf8');
  indexHtml = readFileSync(indexPath, 'utf8');
} catch (error) {
  fail(`missing build output: ${error.message}`);
}

sw = sw.replace("'__CACHE_VERSION__'", `'${new Date().toISOString()}'`);

const mainCss = mainCssHref(indexHtml);
if (mainCss) sw = sw.replace("'__MAIN_CSS__'", `'${mainCss}'`);
writeFileSync(swPath, sw);

if (sw.includes("'__CACHE_VERSION__'")) {
  fail('failed to stamp __CACHE_VERSION__ in dist/sw.js');
}
console.log(mainCss
  ? `sw-version: stamped ${swPath} (main css: ${mainCss})`
  : 'sw-version: stamped cache version; no stylesheet link found in dist/index.html (runtime caching will cover CSS)');
