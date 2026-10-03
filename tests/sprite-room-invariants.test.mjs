import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/worlds/villa-diodati/sprite-room/room.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/worlds/villa-diodati/sprite-room/index.html", import.meta.url), "utf8");
const cacheBustScript = await readFile(new URL("../scripts/cache-bust-world.mjs", import.meta.url), "utf8");

test("viewer keeps Map upright and rotation-locked", () => {
  assert.match(source, /controls\.enableRotate = normalizedMode === "room"/);
  assert.match(source, /controls\.minPolarAngle = \.25/);
  assert.match(source, /controls\.maxPolarAngle = Math\.PI \/ 2 - \.08/);
  assert.doesNotMatch(source, /controls\.addEventListener\("start", \(\) => \{ controls\.enableRotate/);
});

test("viewer bounds pan and keeps the target on the active floor", () => {
  assert.match(source, /controls\.target\.x = THREE\.MathUtils\.clamp/);
  assert.match(source, /controls\.target\.z = THREE\.MathUtils\.clamp/);
  assert.match(source, /controls\.target\.y = topDown \? floorY : floorY \+ \.8/);
});

test("exterior glazing is modeled as openings with physical glass", () => {
  assert.match(source, /replaceSquareVillaWallsWithOpenings/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial\(\{ color: 0xffffff/);
  assert.match(source, /square villa facade opening/);
});

test("viewer has a restrictive content security policy", () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /frame-ancestors 'none'/);
  assert.match(html, /connect-src 'self' https:\/\/matrix\.castalia\.institute/);
});

test("viewer has a keyboard-focusable canvas and no-script fallback", () => {
  assert.match(html, /<canvas id="room" role="img" tabindex="0"/);
  assert.match(html, /<noscript class="no-script-message">/);
});

test("weather respects reduced-motion preferences", () => {
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /const count = reducedMotion \? 0 : 850/);
  assert.match(source, /if \(reducedMotion\) return;/);
});

test("viewer shares one map contract request during startup", () => {
  assert.equal((source.match(/fetch\("\.\.\/isometric-map\.json"/g) || []).length, 1);
  assert.match(source, /const mapContractPromise = fetch\("\.\.\/isometric-map\.json"/);
});

test("viewer reports recoverable WebGL context loss", () => {
  assert.match(source, /webglcontextlost/);
  assert.match(source, /webglcontextrestored/);
  assert.match(source, /Graphics restored — reload the viewer to resume rendering/);
});

test("deploy cache bust covers the sprite-room module", () => {
  assert.match(cacheBustScript, /worlds', 'villa-diodati', 'sprite-room', 'index\.html/);
  assert.match(cacheBustScript, /room\\\.js\\\?v=\[\^\"'\]\+/);
});

test("viewer asset contract is present in the repository", async () => {
  const assets = [
    "public/worlds/villa-diodati/isometric-map.json",
    "public/worlds/villa-diodati/terrain/topography.json",
    "public/worlds/villa-diodati/textures/painted-plaster-wall.jpg",
    "public/worlds/villa-diodati/art/wall-triptych-v1.png",
    "public/worlds/villa-diodati/art/fireplace-v1.png",
    "public/worlds/villa-diodati/furniture/rug-01/rug.glb",
    "public/worlds/villa-diodati/furniture/sofa-03/sofa_03.gltf",
    "public/worlds/villa-diodati/furniture/armchair-01/ArmChair_01.gltf",
    "public/worlds/villa-diodati/furniture/antique-table-01/table.glb",
    "public/worlds/villa-diodati/sprites/dressup-v1/byron.png",
    "public/worlds/villa-diodati/sprites/dressup-v1/mary-godwin.png",
    "public/worlds/villa-diodati/sprites/dressup-v1/claire-clairmont.png",
    "public/worlds/villa-diodati/sprites/dressup-v1/percy-shelley.png",
    "public/worlds/villa-diodati/sprites/dressup-v1/john-polidori.png",
    "public/worlds/villa-diodati/sprites/animals/sheets/monkey-directional-v1.png",
    "public/worlds/villa-diodati/sprites/animals/sheets/peacock-directional-v1.png",
    "public/worlds/villa-diodati/sprites/animals/sheets/dog-directional-v1.png",
    "public/worlds/villa-diodati/sprites/animals/sheets/cat-directional-v1.png",
    "public/worlds/villa-diodati/sprites/animals/sheets/crow-directional-v1.png",
    "public/worlds/villa-diodati/sprites/animals/sheets/falcon-directional-v1.png",
  ];
  await Promise.all(assets.map((asset) => access(new URL(`../${asset}`, import.meta.url))));
});
