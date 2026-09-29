/**
 * Render public/icons/icon.svg to the four manifest PNGs (192/512 "any" plus
 * padded maskable variants with an ~80% safe zone).
 *
 * macOS-safe rasterization chain: try `sips -s format png` first; if sips
 * cannot rasterize SVG, fall back to `qlmanage -t -s <size> -o <dir>` and
 * resize to exact pixels with sips. Every output is verified via
 * `sips -g pixelWidth`; any failure exits non-zero.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
const svgPath = join(outDir, 'icon.svg');
const workDir = join(tmpdir(), 'salon-icons');

const SIZES = [192, 512];
const DARK = '#1e1a16';

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

function pngWidth(path) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', path]).toString();
  return Number(out.match(/pixelWidth:\s*(\d+)/)[1]);
}

function pngHeight(path) {
  const out = execFileSync('sips', ['-g', 'pixelHeight', path]).toString();
  return Number(out.match(/pixelHeight:\s*(\d+)/)[1]);
}

function assertSize(path, expected) {
  const w = pngWidth(path);
  const h = pngHeight(path);
  if (w !== expected || h !== expected) {
    throw new Error(`generate-icons: ${path} is ${w}x${h}, expected ${expected}x${expected}`);
  }
  console.log(`generate-icons: ${path} ${w}x${h}`);
}

// Resize from the master tile to an exact square; also verifies the result.
function writeSquare(src, dest, size) {
  run('sips', ['-s', 'format', 'png', '-z', String(size), String(size), src, '--out', dest]);
  assertSize(dest, size);
}

// Rasterize an SVG to a PNG at its intrinsic size via sips, else qlmanage.
function fail(message) {
  console.error(`generate-icons: ${message}`);
  process.exit(1);
}

function rasterizeSvg(svg, outPng, renderSize) {
  try {
    run('sips', ['-s', 'format', 'png', svg, '--out', outPng]);
    if (existsSync(outPng) && pngWidth(outPng) > 0) return;
    console.error('generate-icons: sips produced no usable raster; trying qlmanage');
  } catch {
    console.error('generate-icons: sips cannot rasterize SVG; trying qlmanage');
  }
  rmSync(outPng, { force: true });
  run('qlmanage', ['-t', '-s', String(renderSize), '-o', dirname(outPng), svg]);
  // qlmanage names output `<file>.png`; rename to the requested path.
  const qlOut = `${svg}.png`;
  if (!existsSync(qlOut)) fail(`qlmanage produced no thumbnail for ${svg}`);
  execFileSync('mv', [qlOut, outPng]);
}

rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

const svg = readFileSync(svgPath, 'utf8');

// Maskable variant: full-bleed dark square with the artwork scaled to 80%
// (10% padding per side meets the ~10% safe-zone guidance; the extra ring is
// flat villa-dark so circle/keyhole crops never clip the candle).
const artStart = svg.indexOf('<g fill=');
const artEnd = svg.indexOf('</g>', artStart);
if (artStart < 0 || artEnd < 0) fail('icon.svg: artwork <g> block not found');
const art = svg.slice(artStart, artEnd + '</g>'.length);
const maskableSvg =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n` +
  `  <rect width="512" height="512" fill="${DARK}"/>\n` +
  `  <g transform="translate(51.2 51.2) scale(0.8)">\n    ${art}\n  </g>\n` +
  `</svg>\n`;
const maskableSvgPath = join(workDir, 'icon-maskable.svg');
writeFileSync(maskableSvgPath, maskableSvg);

// Master raster at the SVG's intrinsic 512px; smaller sizes resize from here.
const tilePng = join(workDir, 'tile.png');
rasterizeSvg(svgPath, tilePng, 512);
if (pngWidth(tilePng) < 256 || pngHeight(tilePng) < 256) {
  fail(`rasterized tile is too small (${pngWidth(tilePng)}x${pngHeight(tilePng)})`);
}

const maskTilePng = join(workDir, 'tile-maskable.png');
rasterizeSvg(maskableSvgPath, maskTilePng, 512);

for (const size of SIZES) {
  writeSquare(tilePng, join(outDir, `icon-${size}.png`), size);
  writeSquare(maskTilePng, join(outDir, `icon-maskable-${size}.png`), size);
}

rmSync(workDir, { recursive: true, force: true });
console.log('generate-icons: done');
