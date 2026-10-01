import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'dist', 'deploy-version.json');
const version = process.env.GITHUB_SHA || Date.now().toString(36);
const payload = JSON.parse(readFileSync(target, 'utf8'));
payload.version = version;
writeFileSync(target, `${JSON.stringify(payload)}\n`);
