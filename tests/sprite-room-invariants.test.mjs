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
  ];
  await Promise.all(assets.map((asset) => access(new URL(`../${asset}`, import.meta.url))));
});
