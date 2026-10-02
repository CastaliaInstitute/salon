import { NodeIO } from '@gltf-transform/core';
import { mergeDocuments, unpartition } from '@gltf-transform/functions';
import { fileURLToPath } from 'node:url';

const root = new URL('../public/worlds/villa-diodati/', import.meta.url);
const io = new NodeIO();
const file = (name) => fileURLToPath(new URL(name, root));
const target = await io.read(file('salon.glb'));
const scene = target.getRoot().getDefaultScene();

async function addCopies(path, placements) {
  for (const [x, y, z, ry, scale] of placements) {
    // Import once per placement: glTF-Transform nodes are single-parent objects.
    const source = await io.read(file(path));
    const sourceRoot = source.getRoot().getDefaultScene().listChildren()[0];
    const map = mergeDocuments(target, source);
    const node = map.get(sourceRoot);
    if (!node) throw new Error(`Could not import root node from ${path}`);
    node.setTranslation([x, y, z]);
    node.setRotation([0, Math.sin(ry / 2), 0, Math.cos(ry / 2)]);
    node.setScale([scale, scale, scale]);
    scene.addChild(node);
  }
}

await addCopies('furniture/armchair-01/ArmChair_01.gltf', [
  [-2.15, 0, 0.35, Math.PI * 0.08, 0.88],
  [2.15, 0, 0.35, -Math.PI * 0.08, 0.88],
  [-3.95, 0, 0.34, Math.PI / 2, 0.94],
  [3.95, 0, 1.02, -Math.PI / 2, 0.94],
]);
// Turn the sofa toward the fireplace on the rear wall.
// Keep the sofa behind the standing speaker, outside the speaking circle.
await addCopies('furniture/sofa-03/sofa_03.gltf', [[0, -0.02, -2.1, Math.PI, 0.8]]);
// Free downloaded props: a traditional fireplace and two mantel candelabra.
await addCopies('furniture/fireplace/traditional-cast-stone-fireplace.glb', [[0, -0.22, -3.86, 0, 1.7]]);
await addCopies('furniture/candelabrum/candelabrum.glb', [
  // This scan has very large internal coordinates; 0.0025 brings it to a
  // realistic ~0.5 m mantel prop instead of a room-sized black silhouette.
  [-0.58, 2.18, -3.55, Math.PI, 0.0025],
  [0.58, 2.18, -3.55, Math.PI, 0.0025],
]);

await target.transform(unpartition());
await io.write(file('salon.glb'), target);
console.log('Wrote salon.glb with room shell, windows, four armchairs, and one sofa.');
