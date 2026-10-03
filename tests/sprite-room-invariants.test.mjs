import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/worlds/villa-diodati/sprite-room/room.js", import.meta.url), "utf8");

test("viewer keeps Map upright and rotation-locked", () => {
  assert.match(source, /controls\.enableRotate = !pov && !topDown/);
  assert.match(source, /cameraButton\.value !== "pov" && cameraButton\.value !== "map"/);
  assert.match(source, /if \(!pov && !topDown\) controls\.enableRotate = true/);
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
