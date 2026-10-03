import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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

test("focused salon restores solid west and south enclosure walls", () => {
  assert.match(source, /focused salon cannot read as detached wall cards/);
  assert.match(source, /\["front wall left of veranda door", "front wall right of veranda door", "veranda door lintel"\]/);
  assert.match(source, /wall\.material\.transparent = false/);
  assert.match(source, /wall\.material\.opacity = 1/);
  assert.match(source, /const southElevation = focusedSalon && name === "front"/);
  assert.match(source, /const westCutaway = focusedSalon && name === "left"/);
  assert.match(source, /const westSouthOpening = \/\(villa facade window\|facade window\|west veranda door\|south veranda door\|front door\)\/i/);
  assert.match(source, /southWallSegment\("front wall between veranda openings"/);
  assert.match(source, /verandaWallLeft\.visible = false/);
  assert.match(source, /addFacadeWindow\(-7\.75, 2\.25/);
  assert.match(source, /\[x, 1\.32, 4\.78\]/);
});

test("focused salon starts in a readable elevated diagonal composition", () => {
  assert.match(source, /isoCamera\.position\.set\(focusX \+ 1\.6, floorY \+ 6, focusZ - 1\.1\)/);
  assert.match(source, /isoCamera\.lookAt\(focusX, floorY \+ 1, focusZ \+ \.65\)/);
  assert.match(source, /isoCamera\.zoom = 1\.35/);
});

test("floating dialogue bubbles stay out of the default Room composition", () => {
  assert.match(source, /if \(topDown \|\| renderEverything \|\| !pov\) \{ dialogueLayer\?\.replaceChildren\(\); return; \}/);
});

test("focused salon has deterministic furnishing geometry", () => {
  assert.match(source, /function addSalonFurnitureFallback\(\)/);
  assert.match(source, /salon fallback sofa base/);
  assert.match(source, /salon fallback armchair seat/);
  assert.match(source, /salon fallback sofa cushion/);
  assert.match(source, /salon fallback armchair cushion/);
  assert.match(source, /addSalonFurnitureFallback\(\);/);
  assert.match(source, /salonFallbackLayer\.visible = !renderEverything && !topDown && floorLevel === 1/);
  assert.match(source, /salonFallbackLayer\.position\.copy\(salonRoot\.position\)/);
  assert.match(source, /child === salonRoot \|\| child === salonFallbackLayer/);
  assert.match(source, /mesh\.renderOrder = 5; mesh\.material\.depthTest = false/);
});

test("viewer has a restrictive content security policy", () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'self' blob: https:\/\/matrix\.castalia\.institute/);
  assert.match(html, /sha256-4HMW5NQmmSV3oHC6ajO3hk1Oj3mUDvGXHThmkVld42w=/);
});

test("viewer CSP hash matches the inline import map", () => {
  const importMap = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(importMap, "inline import map is present");
  const hash = `sha256-${createHash("sha256").update(importMap).digest("base64")}`;
  assert.match(html, new RegExp(hash.replace(/[+/=]/g, "\\$&")));
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
  assert.equal((source.match(/fetchWithTimeout\("\.\.\/isometric-map\.json"/g) || []).length, 1);
  assert.match(source, /const mapContractPromise = fetchWithTimeout\("\.\.\/isometric-map\.json"/);
});

test("network-backed viewer requests have bounded failure behavior", () => {
  assert.match(source, /const NETWORK_TIMEOUT_MS = 8000/);
  assert.match(source, /async function fetchWithTimeout\(input, options = \{\}, timeout = NETWORK_TIMEOUT_MS\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.doesNotMatch(source, /await fetch\("https:\/\/matrix\.castalia\.institute/);
});

test("viewer reports recoverable WebGL context loss", () => {
  assert.match(source, /webglcontextlost/);
  assert.match(source, /webglcontextrestored/);
  assert.match(source, /Graphics restored — reload the viewer to resume rendering/);
});

test("viewer pauses background weather while hidden", () => {
  assert.match(source, /if \(document\.hidden\) return; updateWeather/);
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

test("GLTF furniture assets resolve every external URI", async () => {
  const files = [
    "../public/worlds/villa-diodati/furniture/sofa-03/sofa_03.gltf",
    "../public/worlds/villa-diodati/furniture/armchair-01/ArmChair_01.gltf",
  ];
  for (const file of files) {
    const url = new URL(file, import.meta.url);
    const document = JSON.parse(await readFile(url, "utf8"));
    const uris = [...(document.buffers || []), ...(document.images || [])]
      .map((entry) => entry.uri)
      .filter((uri) => uri && !uri.startsWith("data:"));
    await Promise.all(uris.map((uri) => access(resolve(dirname(url.pathname), uri))));
  }
});
