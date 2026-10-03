import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(new URL('.', import.meta.url).pathname, '..');
const version = process.env.GITHUB_SHA?.slice(0, 12) || Date.now().toString(36);
const targets = [
  [join(root, 'dist', 'worlds', 'villa-diodati', 'index.html'), /viewer\.js\?v=[^"']+/, `viewer.js?v=${version}`],
  [join(root, 'dist', 'worlds', 'villa-diodati', 'sprite-room', 'index.html'), /room\.js\?v=[^"']+/, `room.js?v=${version}`],
];

for (const [indexPath, pattern, replacement] of targets) {
  let html = readFileSync(indexPath, 'utf8');
  html = html.replace(pattern, replacement);
  writeFileSync(indexPath, html);
  console.log(`cache-bust-world: ${replacement}`);
}
