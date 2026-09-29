/**
 * Build-time validation for the salon season data (see
 * .opencode/specs/salon-weekend-schedule). Exits non-zero on any violation so
 * the site never ships an invented season state.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'src/data/villa-diodati/season-2026-10.json');

function fail(message) {
  console.error(`validate-season: ${message}`);
  process.exit(1);
}

let season;
try {
  season = JSON.parse(readFileSync(path, 'utf8'));
} catch (err) {
  fail(`cannot parse ${path}: ${err.message}`);
}

if (season.timezone !== 'Europe/Zurich') fail(`timezone must be Europe/Zurich, got ${season.timezone}`);
if (!Array.isArray(season.windows) || season.windows.length !== 5) {
  fail('exactly five windows required');
}

const iso = /^\d{4}-\d{2}-\d{2}$/;
let prev = null;
for (const w of season.windows) {
  if (!iso.test(w.start) || !iso.test(w.end)) fail(`window ${w.id ?? '?'} has non-ISO dates`);
  if (w.end < w.start) fail(`window ${w.id} ends before it starts`);
  if (prev && w.start <= prev.end) fail(`window ${w.id} overlaps window before it`);
  if (Number.isNaN(Date.parse(`${w.start}T00:00:00Z`))) fail(`window ${w.id} start is not a real date`);
  prev = w;
}

const mapKeys = Object.keys(season.replayDayMapping ?? {}).sort();
if (JSON.stringify(mapKeys) !== JSON.stringify(['Friday', 'Saturday', 'Sunday'])) {
  fail('replayDayMapping must cover Friday, Saturday, Sunday exactly');
}

console.log(`validate-season: ${season.windows.length} windows (${season.season}, ${season.timezone}) — OK`);
