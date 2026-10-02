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

// ArmChair_01 is staged separately but not baked: its tall black back/seat
// intersects the mannequin view at mobile camera angles.
// Turn the sofa toward the fireplace on the rear wall.
// Keep the sofa behind the standing speaker, outside the speaking circle.
await addCopies('furniture/sofa-03/sofa_03.gltf', [[0, -0.02, -2.1, Math.PI, 0.8]]);
// The free fireplace remains staged in furniture/fireplace/ but is not baked
// until its imported geometry has been visually verified in this room.

await target.transform(unpartition());
await io.write(file('salon.glb'), target);
console.log('Wrote salon.glb with room shell, windows, four armchairs, and one sofa.');
