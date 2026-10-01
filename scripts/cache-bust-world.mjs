import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(new URL('.', import.meta.url).pathname, '..');
const indexPath = join(root, 'dist', 'worlds', 'villa-diodati', 'index.html');
const version = process.env.GITHUB_SHA?.slice(0, 12) || Date.now().toString(36);

let html = readFileSync(indexPath, 'utf8');
html = html.replace(/viewer\.js\?v=[^"']+/, `viewer.js?v=${version}`);
writeFileSync(indexPath, html);
console.log(`cache-bust-world: viewer.js?v=${version}`);
