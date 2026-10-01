import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "public/worlds/villa-diodati/saloon.glb");
const objects = [];
const materials = [];
const materialByName = new Map();
const geometryByName = new Map();
const meshByKey = new Map();
const nodes = [];
const meshes = [];
const cameras = [];
const punctualLights = [];
const binaryParts = [];
let binaryLength = 0;
const bufferViews = [];
const accessors = [];

function material(name, color, roughness = 0.8, options = {}) {
  if (materialByName.has(name)) return materialByName.get(name);
  const index = materials.length;
  materials.push({
    name,
    pbrMetallicRoughness: {
      baseColorFactor: [...color, options.alpha ?? 1],
      metallicFactor: options.metallic ?? 0,
      roughnessFactor: roughness,
      ...(options.emissive ? {} : {}),
    },
    ...(options.emissive
      ? { emissiveFactor: options.emissive }
      : {}),
    ...(options.alpha !== undefined && options.alpha < 1
      ? { alphaMode: "BLEND", doubleSided: true }
      : {}),
    ...(options.doubleSided ? { doubleSided: true } : {}),
  });
  materialByName.set(name, index);
  return index;
}

const M = {
  plaster: material("warm grey-blue plaster", [0.48, 0.52, 0.52]),
  panel: material("blue-grey painted panelling", [0.25, 0.32, 0.34]),
  trim: material("aged ivory trim", [0.77, 0.70, 0.57]),
  floor: [
    material("oak boards - honey", [0.34, 0.19, 0.095]),
    material("oak boards - warm", [0.40, 0.235, 0.12]),
    material("oak boards - light", [0.47, 0.29, 0.15]),
  ],
  wood: material("dark polished walnut", [0.18, 0.09, 0.045], 0.34),
  woodLight: material("worn walnut", [0.29, 0.16, 0.075], 0.4),
  gold: material("aged gilt", [0.53, 0.35, 0.12], 0.36, { metallic: 0.58 }),
  velvet: material("deep wine upholstery", [0.24, 0.055, 0.06]),
  rug: material("olive and burgundy rug", [0.22, 0.15, 0.10]),
  rugBorder: material("rug border", [0.47, 0.30, 0.12]),
  curtain: material("muted ochre curtains", [0.48, 0.29, 0.12]),
  glass: material("storm-blue window glass", [0.13, 0.25, 0.32], 0.12, {
    alpha: 0.35,
    metallic: 0.12,
  }),
  stone: material("smoke-dark fireplace stone", [0.20, 0.19, 0.18]),
  firebox: material("fireplace shadow", [0.035, 0.023, 0.018], 1),
  ember: material("glowing amber embers", [0.95, 0.20, 0.025], 0.3, {
    emissive: [0.8, 0.10, 0.008],
  }),
  flame: material("candle flame", [1, 0.48, 0.055], 0.3, {
    emissive: [1, 0.28, 0.015],
  }),
  candle: material("warm beeswax", [0.87, 0.72, 0.43]),
  paper: material("aged paper", [0.73, 0.62, 0.42]),
  ink: material("ink and book leather", [0.11, 0.07, 0.055]),
  moonlight: material("lake-glow glass", [0.20, 0.32, 0.40], 0.25, {
    emissive: [0.045, 0.09, 0.13],
  }),
  marble: material("warm Carrara marble", [0.82, 0.80, 0.74], 0.27, { metallic: 0.035 }),
  marbleShadow: material("marble in carved folds", [0.65, 0.64, 0.59], 0.34),
  marbleJoint: material("articulated marble joints", [0.71, 0.70, 0.65], 0.30),
  skin: material("porcelain skin", [0.78, 0.58, 0.43]),
  hair: material("dark hair", [0.075, 0.043, 0.032]),
  hairBrown: material("chestnut hair", [0.20, 0.09, 0.045]),
  byron: material("Byron - dark plum coat", [0.14, 0.055, 0.075]),
  byronVest: material("Byron - shadowed waistcoat", [0.095, 0.07, 0.07]),
  mary: material("Mary - ivory muslin", [0.83, 0.77, 0.65]),
  marySash: material("Mary - sage sash", [0.34, 0.38, 0.28]),
  claire: material("Claire - pale cream dress", [0.72, 0.62, 0.48]),
  claireSash: material("Claire - faded rose sash", [0.48, 0.20, 0.18]),
  percy: material("Percy - dark olive coat", [0.20, 0.22, 0.16]),
  percyShirt: material("Percy - linen shirt", [0.76, 0.69, 0.56]),
  polidori: material("Polidori - blue-grey waistcoat", [0.18, 0.24, 0.27]),
  polidoriShirt: material("Polidori - white shirt", [0.79, 0.75, 0.65]),
};

function boxGeometry() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    [[[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]], [1, 0, 0]],
    [[[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]], [-1, 0, 0]],
    [[[-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], [0, 1, 0]],
    [[[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5]], [0, -1, 0]],
    [[[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], [0, 0, 1]],
    [[[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], [0, 0, -1]],
  ];
  for (const [corners, normal] of faces) {
    const base = positions.length / 3;
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

function cylinderGeometry(segments = 16) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.5;
    const z = Math.sin(angle) * 0.5;
    positions.push(x, -0.5, z, x, 0.5, z);
    normals.push(Math.cos(angle), 0, Math.sin(angle), Math.cos(angle), 0, Math.sin(angle));
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, -0.5, 0);
  normals.push(0, -1, 0);
  const topCenter = positions.length / 3;
  positions.push(0, 0.5, 0);
  normals.push(0, 1, 0);
  const capStart = positions.length / 3;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * 0.5, -0.5, Math.sin(angle) * 0.5);
    normals.push(0, -1, 0);
  }
  const topStart = positions.length / 3;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * 0.5, 0.5, Math.sin(angle) * 0.5);
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(bottomCenter, capStart + i, capStart + next);
    indices.push(topCenter, topStart + next, topStart + i);
  }
  return { positions, normals, indices };
}

function coneGeometry(segments = 12) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.5;
    const z = Math.sin(angle) * 0.5;
    const normalLength = Math.hypot(Math.cos(angle), 0.5, Math.sin(angle));
    positions.push(x, -0.5, z, 0, 0.5, 0);
    normals.push(Math.cos(angle) / normalLength, 0.5 / normalLength, Math.sin(angle) / normalLength);
    normals.push(Math.cos(angle) / normalLength, 0.5 / normalLength, Math.sin(angle) / normalLength);
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  return { positions, normals, indices };
}

function sphereGeometry() {
  const vertices = [
    [0, 0.5, 0], [0.5, 0, 0], [0, 0, 0.5], [-0.5, 0, 0], [0, 0, -0.5], [0, -0.5, 0],
  ];
  let triangles = [
    [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
    [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4],
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const tri of triangles) {
    let [a, b, c] = tri.map((i) => vertices[i]);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const center = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
    if (cross[0] * center[0] + cross[1] * center[1] + cross[2] * center[2] < 0) [b, c] = [c, b];
    const base = positions.length / 3;
    for (const v of [a, b, c]) {
      const length = Math.hypot(...v);
      positions.push(...v);
      normals.push(v[0] / length, v[1] / length, v[2] / length);
    }
    indices.push(base, base + 1, base + 2);
  }
  return { positions, normals, indices };
}

function appendBytes(buffer) {
  while (binaryLength % 4) {
    binaryParts.push(Buffer.from([0]));
    binaryLength++;
  }
  const byteOffset = binaryLength;
  binaryParts.push(buffer);
  binaryLength += buffer.length;
  return byteOffset;
}

function addGeometry(name, geometry) {
  const posBuffer = Buffer.alloc(geometry.positions.length * 4);
  geometry.positions.forEach((v, i) => posBuffer.writeFloatLE(v, i * 4));
  const normalBuffer = Buffer.alloc(geometry.normals.length * 4);
  geometry.normals.forEach((v, i) => normalBuffer.writeFloatLE(v, i * 4));
  const use32 = geometry.positions.length / 3 > 65535;
  const indexBuffer = Buffer.alloc(geometry.indices.length * (use32 ? 4 : 2));
  geometry.indices.forEach((v, i) => {
    if (use32) indexBuffer.writeUInt32LE(v, i * 4);
    else indexBuffer.writeUInt16LE(v, i * 2);
  });
  const posOffset = appendBytes(posBuffer);
  const posView = bufferViews.push({ buffer: 0, byteOffset: posOffset, byteLength: posBuffer.length, target: 34962 }) - 1;
  const normalOffset = appendBytes(normalBuffer);
  const normalView = bufferViews.push({ buffer: 0, byteOffset: normalOffset, byteLength: normalBuffer.length, target: 34962 }) - 1;
  const indexOffset = appendBytes(indexBuffer);
  const indexView = bufferViews.push({ buffer: 0, byteOffset: indexOffset, byteLength: indexBuffer.length, target: 34963 }) - 1;
  const positionValues = geometry.positions;
  const min = [0, 1, 2].map((axis) => Math.min(...positionValues.filter((_, i) => i % 3 === axis)));
  const max = [0, 1, 2].map((axis) => Math.max(...positionValues.filter((_, i) => i % 3 === axis)));
  const positionAccessor = accessors.push({
    bufferView: posView, componentType: 5126, count: geometry.positions.length / 3, type: "VEC3", min, max,
  }) - 1;
  const normalAccessor = accessors.push({
    bufferView: normalView, componentType: 5126, count: geometry.normals.length / 3, type: "VEC3",
  }) - 1;
  const indexAccessor = accessors.push({
    bufferView: indexView, componentType: use32 ? 5125 : 5123, count: geometry.indices.length, type: "SCALAR",
  }) - 1;
  geometryByName.set(name, { positionAccessor, normalAccessor, indexAccessor });
}

addGeometry("box", boxGeometry());
addGeometry("cylinder", cylinderGeometry());
addGeometry("cone", coneGeometry());
addGeometry("sphere", sphereGeometry());

function meshFor(shape, materialIndex) {
  const key = `${shape}:${materialIndex}`;
  if (meshByKey.has(key)) return meshByKey.get(key);
  const geometry = geometryByName.get(shape);
  const meshIndex = meshes.length;
  meshes.push({
    name: `${shape} / ${materials[materialIndex].name}`,
    primitives: [{
      attributes: { POSITION: geometry.positionAccessor, NORMAL: geometry.normalAccessor },
      indices: geometry.indexAccessor,
      material: materialIndex,
      mode: 4,
    }],
  });
  meshByKey.set(key, meshIndex);
  return meshIndex;
}

function quatY(radians) {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

function quatEuler(x = 0, y = 0, z = 0) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function addNode(name, translation = [0, 0, 0], rotation = undefined, scale = undefined, mesh = undefined, extras = undefined) {
  const node = { name, translation };
  if (rotation) node.rotation = rotation;
  if (scale) node.scale = scale;
  if (mesh !== undefined) node.mesh = mesh;
  if (extras) node.extras = extras;
  const index = nodes.push(node) - 1;
  return index;
}

function group(name, position, yaw = 0, extras = undefined, scale = undefined) {
  const index = addNode(name, position, quatY(yaw), scale, undefined, extras);
  nodes[index].children = [];
  return index;
}

function place(shape, mat, name, position, scale, rotation = undefined, parent = undefined, extras = undefined) {
  const materialIndex = typeof mat === "number" ? mat : mat;
  const index = addNode(name, position, rotation, scale, meshFor(shape, materialIndex), extras);
  if (parent !== undefined) nodes[parent].children.push(index);
  return index;
}

function cube(name, mat, p, s, parent, rotation) {
  return place("box", mat, name, p, s, rotation, parent);
}

function cyl(name, mat, p, s, parent, rotation) {
  return place("cylinder", mat, name, p, s, rotation, parent);
}

function ball(name, mat, p, s, parent, rotation) {
  return place("sphere", mat, name, p, s, rotation, parent);
}

function cone(name, mat, p, s, parent, rotation) {
  return place("cone", mat, name, p, s, rotation, parent);
}

// Historical envelope interpreted as a compact, paneled salon opening onto a
// lakeside gallery. Interior partitions and furniture are designed, not archival.
cube("oak parquet floor", M.floor[0], [0, -0.12, 0], [11.6, 0.24, 8.6]);
for (let i = 0; i < 22; i++) {
  const x = -5.42 + i * 0.515;
  cube(`parquet board ${i + 1}`, M.floor[(i + Math.floor(i / 4)) % M.floor.length], [x, 0.014, 0], [0.505, 0.032, 8.48]);
}
cube("ceiling", M.plaster, [0, 4.42, 0], [11.6, 0.18, 8.65]);

// Back wall with an inset fireplace, paneling, portraits and the implied court-side entrance.
cube("rear wall", M.plaster, [0, 2.2, -4.34], [11.6, 4.4, 0.28]);
cube("rear lower dado", M.panel, [0, 0.64, -4.16], [11.5, 1.18, 0.10]);
cube("rear dado rail", M.trim, [0, 1.27, -4.08], [11.56, 0.08, 0.08]);
cube("rear cornice", M.trim, [0, 4.22, -4.12], [11.62, 0.16, 0.22]);
for (let x = -5.0; x <= 5.01; x += 1.25) {
  cube(`rear panel stile ${x}`, M.trim, [x, 2.68, -4.15], [0.055, 1.9, 0.08]);
  cube(`rear panel upper rail ${x}`, M.trim, [x, 3.62, -4.15], [1.05, 0.045, 0.08]);
}
// Hearth, surround, mantel, logs and low-poly firelight.
cube("fireplace hearth", M.stone, [0, 0.14, -3.85], [2.65, 0.25, 0.72]);
cube("fireplace surround", M.stone, [0, 1.42, -4.11], [2.06, 2.35, 0.30]);
cube("firebox", M.firebox, [0, 1.22, -3.94], [1.44, 1.42, 0.10]);
cube("fireplace opening left", M.gold, [-0.82, 1.33, -3.86], [0.08, 1.67, 0.09]);
cube("fireplace opening right", M.gold, [0.82, 1.33, -3.86], [0.08, 1.67, 0.09]);
cube("fireplace lintel", M.gold, [0, 2.17, -3.86], [1.72, 0.10, 0.10]);
cube("mantel shelf", M.wood, [0, 2.42, -3.90], [2.55, 0.20, 0.55]);
cube("fire log", M.woodLight, [0, 0.73, -3.82], [0.88, 0.13, 0.15], undefined, quatEuler(0, 0, -0.16));
cube("fire log crossed", M.woodLight, [0.03, 0.79, -3.78], [0.72, 0.12, 0.14], undefined, quatEuler(0, 0, 0.19));
cone("fire flame amber", M.ember, [-0.20, 1.07, -3.78], [0.48, 0.86, 0.42]);
cone("fire flame gold", M.flame, [0.22, 1.14, -3.75], [0.36, 0.70, 0.32]);
cube("fireplace rug-side fender left", M.wood, [-1.12, 0.54, -3.60], [0.13, 0.78, 0.14]);
cube("fireplace rug-side fender right", M.wood, [1.12, 0.54, -3.60], [0.13, 0.78, 0.14]);

// Side walls: high windows admit the cold storm light; lower panels keep the room intimate.
for (const side of [-1, 1]) {
  const x = side * 5.72;
  const wallMat = M.plaster;
  cube(`side wall lower rear ${side}`, wallMat, [x, 2.2, -2.95], [0.28, 4.4, 2.5]);
  cube(`side wall lower front ${side}`, wallMat, [x, 2.2, 2.88], [0.28, 4.4, 2.72]);
  cube(`side window header ${side}`, wallMat, [x, 3.68, -0.04], [0.28, 1.45, 3.3]);
  cube(`side window sill ${side}`, M.trim, [x - side * 0.16, 1.24, -0.04], [0.42, 0.12, 3.32]);
  cube(`side window glass ${side}`, M.glass, [x, 2.48, -0.04], [0.035, 2.28, 3.12]);
  for (const z of [-1.62, -0.04, 1.54]) {
    cube(`side window muntin ${side} ${z}`, M.woodLight, [x - side * 0.035, 2.48, z], [0.08, 2.28, 0.055]);
  }
  cube(`side window vertical frame A ${side}`, M.wood, [x - side * 0.06, 2.48, -1.63], [0.13, 2.45, 0.12]);
  cube(`side window vertical frame B ${side}`, M.wood, [x - side * 0.06, 2.48, 1.55], [0.13, 2.45, 0.12]);
  cube(`side dado ${side}`, M.panel, [x - side * 0.17, 0.62, 0], [0.11, 1.12, 8.25]);
  cube(`side dado rail ${side}`, M.trim, [x - side * 0.22, 1.22, 0], [0.15, 0.07, 8.3]);
  // Curtain drops frame rather than obscure the long side window.
  cube(`side curtain rear ${side}`, M.curtain, [x - side * 0.28, 2.30, -1.82], [0.24, 2.90, 0.48]);
  cube(`side curtain front ${side}`, M.curtain, [x - side * 0.28, 2.30, 1.72], [0.24, 2.90, 0.48]);
}

// Lake-facing doors/windows and gold-toned drapery; the gallery starts beyond this wall.
const openingCenters = [-3.15, 0, 3.15];
const openingWidth = 1.62;
const wallMin = -5.8;
const wallMax = 5.8;
const openingEdges = openingCenters.flatMap((center) => [center - openingWidth / 2, center + openingWidth / 2]).sort((a, b) => a - b);
let cursor = wallMin;
for (let i = 0; i < openingEdges.length; i += 2) {
  const left = openingEdges[i];
  const right = openingEdges[i + 1];
  if (left > cursor) {
    const width = left - cursor;
    cube(`lake wall pier ${i / 2}`, M.plaster, [(cursor + left) / 2, 2.18, 4.34], [width, 4.36, 0.30]);
    cube(`lake wall dado pier ${i / 2}`, M.panel, [(cursor + left) / 2, 0.62, 4.16], [width, 1.16, 0.09]);
  }
  cursor = right;
}
if (cursor < wallMax) {
  const width = wallMax - cursor;
  cube("lake wall pier last", M.plaster, [(cursor + wallMax) / 2, 2.18, 4.34], [width, 4.36, 0.30]);
  cube("lake wall dado pier last", M.panel, [(cursor + wallMax) / 2, 0.62, 4.16], [width, 1.16, 0.09]);
}
for (let i = 0; i < openingCenters.length; i++) {
  const cx = openingCenters[i];
  cube(`lake opening header ${i}`, M.plaster, [cx, 3.78, 4.34], [openingWidth + 0.12, 1.16, 0.30]);
  cube(`lake window glass ${i}`, M.glass, [cx, 1.80, 4.34], [openingWidth - 0.10, 2.93, 0.045]);
  cube(`lake opening jamb left ${i}`, M.wood, [cx - openingWidth / 2 + 0.05, 1.83, 4.12], [0.10, 3.12, 0.15]);
  cube(`lake opening jamb right ${i}`, M.wood, [cx + openingWidth / 2 - 0.05, 1.83, 4.12], [0.10, 3.12, 0.15]);
  cube(`lake opening lintel ${i}`, M.wood, [cx, 3.34, 4.12], [openingWidth, 0.10, 0.15]);
  cube(`lake transom ${i}`, M.woodLight, [cx, 2.72, 4.10], [0.055, 1.12, 0.11]);
  cube(`lake center mullion ${i}`, M.woodLight, [cx, 1.80, 4.10], [0.055, 1.82, 0.11]);
  cube(`lake curtain left ${i}`, M.curtain, [cx - openingWidth / 2 - 0.17, 2.25, 4.00], [0.32, 2.95, 0.20]);
  cube(`lake curtain right ${i}`, M.curtain, [cx + openingWidth / 2 + 0.17, 2.25, 4.00], [0.32, 2.95, 0.20]);
}
cube("lake cornice", M.trim, [0, 4.22, 4.14], [11.65, 0.16, 0.22]);

// Narrow wall panels, portrait frames and sconces echo the supplied visual reference.
for (const [x, portraitMat] of [[-4.65, M.hairBrown], [4.65, M.ink]]) {
  cube(`portrait frame ${x}`, M.gold, [x, 2.76, -4.12], [0.86, 1.18, 0.14]);
  cube(`portrait canvas ${x}`, M.ink, [x, 2.76, -4.025], [0.69, 0.98, 0.04]);
  ball(`portrait silhouette ${x}`, portraitMat, [x, 2.92, -3.99], [0.22, 0.31, 0.08]);
  cube(`portrait bust ${x}`, M.byron, [x, 2.55, -3.99], [0.38, 0.34, 0.06]);
  cyl(`sconce arm ${x}`, M.gold, [x > 0 ? 3.90 : -3.90, 3.52, -4.02], [0.09, 0.28, 0.09]);
  cyl(`sconce candle ${x}`, M.candle, [x > 0 ? 3.90 : -3.90, 3.73, -4.02], [0.07, 0.38, 0.07]);
  cone(`sconce flame ${x}`, M.flame, [x > 0 ? 3.90 : -3.90, 3.97, -4.02], [0.09, 0.17, 0.09]);
}

// The parlor's main center: oval gathering rug, low table, ghost-story reading matter.
cyl("gathering rug field", M.rug, [0, 0.034, 0.32], [5.30, 0.06, 3.75]);
cyl("gathering rug gilt edge", M.rugBorder, [0, 0.069, 0.32], [5.10, 0.015, 3.58]);
cyl("rug inset field", M.rug, [0, 0.079, 0.32], [4.72, 0.016, 3.20]);
cube("low reading table top", M.woodLight, [0, 0.62, 0.28], [2.10, 0.16, 1.28]);
cube("reading table apron", M.wood, [0, 0.48, 0.28], [1.82, 0.22, 1.03]);
for (const [x, z] of [[-0.82, -0.16], [0.82, -0.16], [-0.82, 0.72], [0.82, 0.72]]) {
  cyl(`table leg ${x} ${z}`, M.wood, [x, 0.26, z], [0.17, 0.51, 0.17]);
}
// Open folio and scattered books.
cube("open manuscript left leaf", M.paper, [-0.38, 0.715, 0.28], [0.56, 0.045, 0.73], undefined, quatEuler(0, 0, -0.05));
cube("open manuscript right leaf", M.paper, [0.20, 0.715, 0.28], [0.56, 0.045, 0.73], undefined, quatEuler(0, 0, 0.06));
cube("book red leather", M.velvet, [0.72, 0.74, 0.20], [0.52, 0.11, 0.70], undefined, quatEuler(0, -0.24, 0.04));
cube("book gilt pages", M.paper, [0.72, 0.80, 0.20], [0.44, 0.025, 0.62], undefined, quatEuler(0, -0.24, 0.04));
cube("loose letter", M.paper, [-0.67, 0.75, 0.45], [0.45, 0.018, 0.34], undefined, quatEuler(0, 0.20, -0.04));

function candleCluster(name, x, y, z, count = 3) {
  const rootIndex = group(name, [x, y, z]);
  const offsets = count === 3 ? [-0.28, 0, 0.28] : Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * 0.18);
  offsets.forEach((dx, i) => {
    const height = 0.26 + (i % 2) * 0.07;
    cyl(`${name} candle ${i + 1}`, M.candle, [dx, height / 2, 0], [0.065, height, 0.065], rootIndex);
    cone(`${name} flame ${i + 1}`, M.flame, [dx, height + 0.045, 0], [0.07, 0.12, 0.07], rootIndex);
  });
  return rootIndex;
}

candleCluster("table candelabra", -0.90, 0.74, -0.08, 3);
candleCluster("mantel candlesticks left", -1.03, 2.53, -3.62, 2);
candleCluster("mantel candlesticks right", 1.03, 2.53, -3.62, 2);

// Sofa on the left, plus a deep armchair and reading chair on the right as in the reference image.
function sofa(name, position, yaw = 0) {
  const g = group(name, position, yaw);
  cube(`${name} plinth`, M.wood, [0, 0.31, 0], [3.2, 0.36, 1.05], g);
  cube(`${name} cushion`, M.velvet, [0, 0.56, 0.06], [2.84, 0.28, 0.91], g);
  cube(`${name} back`, M.velvet, [0, 1.04, -0.40], [2.95, 0.98, 0.28], g);
  for (const side of [-1, 1]) {
    cube(`${name} arm ${side}`, M.velvet, [side * 1.48, 0.73, 0.05], [0.38, 0.68, 1.04], g);
    cube(`${name} arm cap ${side}`, M.woodLight, [side * 1.48, 1.08, 0.05], [0.43, 0.12, 1.12], g);
    for (const z of [-0.35, 0.40]) cyl(`${name} foot ${side} ${z}`, M.wood, [side * 1.30, 0.12, z], [0.13, 0.28, 0.13], g);
  }
  for (const x of [-0.92, 0, 0.92]) cube(`${name} back seam ${x}`, M.claireSash, [x, 0.99, -0.245], [0.025, 0.72, 0.02], g);
  return g;
}

function armchair(name, position, yaw = 0, upholstery = M.velvet) {
  const g = group(name, position, yaw);
  cube(`${name} seat frame`, M.wood, [0, 0.47, 0], [1.15, 0.22, 1.04], g);
  cube(`${name} seat cushion`, upholstery, [0, 0.62, 0.06], [1.02, 0.20, 0.88], g);
  cube(`${name} back upholstery`, upholstery, [0, 1.15, -0.40], [1.03, 1.14, 0.24], g);
  cube(`${name} back frame`, M.woodLight, [0, 1.75, -0.39], [1.20, 0.12, 0.30], g);
  for (const side of [-1, 1]) {
    cube(`${name} arm support ${side}`, M.woodLight, [side * 0.56, 0.86, 0.00], [0.13, 0.66, 0.14], g);
    cube(`${name} arm pad ${side}`, upholstery, [side * 0.56, 1.16, 0.05], [0.22, 0.18, 0.84], g);
    for (const z of [-0.34, 0.38]) cyl(`${name} leg ${side} ${z}`, M.wood, [side * 0.45, 0.23, z], [0.11, 0.45, 0.11], g, quatEuler(0.05, 0, side * 0.05));
  }
  return g;
}

sofa("carved settee", [-3.38, 0, 0.15], 0);
armchair("Byron's companion chair", [2.55, 0, -0.60], -Math.PI / 2, M.velvet);
armchair("reading chair", [4.12, 0, 0.96], -Math.PI / 2, M.woodLight);
armchair("guest chair by the window", [0.0, 0, 2.42], Math.PI, M.velvet);

function seatedAvatar({ name, position, yaw, dress = false, book = false }) {
  const g = group(name, position, yaw, {
    role: "articulated_marble_statue",
    likeness: "stylized sculptural figure; not a portrait likeness",
  }, [0.92, 0.70, 0.92]);
  // Separate stone forms and visible pivot joints make each guest read as a poseable statue.
  cube(`${name} pelvis`, M.marble, [0, 0.81, 0], [0.55, 0.32, 0.48], g);
  if (dress) {
    cone(`${name} carved drapery`, M.marble, [0, 0.74, 0.13], [0.86, 0.92, 0.90], g);
    cube(`${name} carved sash fold`, M.marbleShadow, [0, 1.22, -0.035], [0.58, 0.12, 0.53], g);
    for (const side of [-1, 1]) {
      cyl(`${name} skirt fold ${side}`, M.marbleShadow, [side * 0.17, 0.71, 0.40], [0.035, 0.60, 0.035], g, quatEuler(0, 0, side * 0.08));
    }
  } else {
    cube(`${name} draped seated legs`, M.marble, [0, 0.57, 0.36], [0.50, 0.20, 0.76], g, quatEuler(-0.12, 0, 0));
    cube(`${name} carved chest fold`, M.marbleShadow, [0, 1.25, 0.245], [0.11, 0.40, 0.035], g);
  }
  cube(`${name} torso`, M.marble, [0, 1.36, -0.05], [0.67, 0.69, 0.43], g, quatEuler(-0.05, 0, 0));
  cube(`${name} carved collar`, M.marbleShadow, [0, 1.70, 0.015], [0.33, 0.10, 0.34], g);
  cyl(`${name} neck`, M.marble, [0, 1.82, 0.015], [0.20, 0.22, 0.20], g);
  ball(`${name} face`, M.marble, [0, 2.03, 0.02], [0.40, 0.48, 0.38], g);
  ball(`${name} carved hair`, M.marbleShadow, [0, 2.23, -0.01], [0.43, 0.25, 0.42], g);
  ball(`${name} nose`, M.marble, [0, 2.02, 0.22], [0.08, 0.10, 0.12], g);
  ball(`${name} left eye recess`, M.marbleShadow, [-0.095, 2.08, 0.185], [0.035, 0.035, 0.026], g);
  ball(`${name} right eye recess`, M.marbleShadow, [0.095, 2.08, 0.185], [0.035, 0.035, 0.026], g);
  ball(`${name} left hip joint`, M.marbleJoint, [-0.21, 0.75, 0.09], [0.19, 0.19, 0.19], g);
  ball(`${name} right hip joint`, M.marbleJoint, [0.21, 0.75, 0.09], [0.19, 0.19, 0.19], g);
  for (const side of [-1, 1]) {
    cube(`${name} upper leg ${side}`, M.marble, [side * 0.19, 0.63, 0.38], [0.29, 0.22, 0.68], g, quatEuler(-0.06, 0, side * -0.04));
    ball(`${name} knee pivot ${side}`, M.marbleJoint, [side * 0.19, 0.58, 0.64], [0.20, 0.18, 0.20], g);
    cube(`${name} shin ${side}`, M.marble, [side * 0.19, 0.30, 0.55], [0.19, 0.48, 0.20], g);
    cube(`${name} foot ${side}`, M.marble, [side * 0.19, 0.10, 0.70], [0.22, 0.13, 0.39], g);
    ball(`${name} shoulder pivot ${side}`, M.marbleJoint, [side * 0.38, 1.48, 0.04], [0.27, 0.27, 0.27], g);
    cube(`${name} upper arm ${side}`, M.marble, [side * 0.38, 1.42, 0.08], [0.23, 0.43, 0.25], g, quatEuler(0, 0, side * -0.17));
    ball(`${name} elbow pivot ${side}`, M.marbleJoint, [side * 0.32, 1.19, 0.30], [0.16, 0.16, 0.16], g);
    cyl(`${name} forearm ${side}`, M.marble, [side * 0.32, 1.16, 0.35], [0.13, 0.42, 0.13], g, quatEuler(-0.64, 0, side * 0.25));
    ball(`${name} wrist pivot ${side}`, M.marbleJoint, [side * 0.28, 1.02, 0.49], [0.13, 0.13, 0.13], g);
    ball(`${name} hand ${side}`, M.marble, [side * 0.28, 1.02, 0.52], [0.15, 0.13, 0.17], g);
  }
  if (book) {
    cube(`${name} book cover`, M.velvet, [0.22, 1.12, 0.60], [0.34, 0.07, 0.27], g, quatEuler(-0.12, -0.16, -0.08));
    cube(`${name} book pages`, M.paper, [0.22, 1.165, 0.60], [0.29, 0.025, 0.23], g, quatEuler(-0.12, -0.16, -0.08));
  }
  return g;
}

function standingByron() {
  const g = group("Lord Byron - standing host", [0.54, 0, -0.15], Math.PI, {
    role: "articulated_marble_statue_host",
    likeness: "stylized sculptural figure; not a portrait likeness",
  }, [0.92, 0.68, 0.92]);
  cone("Byron sculpted cloak", M.marble, [0, 1.08, 0], [0.92, 1.85, 0.68], g);
  cube("Byron carved chest folds", M.marbleShadow, [0, 1.54, 0.34], [0.42, 0.65, 0.08], g);
  cube("Byron sculpted collar", M.marble, [0, 1.91, 0.30], [0.33, 0.20, 0.10], g);
  cyl("Byron neck", M.marble, [0, 2.03, 0.03], [0.21, 0.24, 0.21], g);
  ball("Byron head", M.marble, [0, 2.27, 0.03], [0.43, 0.49, 0.39], g);
  ball("Byron carved curls", M.marbleShadow, [0, 2.47, 0.015], [0.47, 0.26, 0.43], g);
  ball("Byron nose", M.marble, [0, 2.26, 0.24], [0.08, 0.11, 0.12], g);
  ball("Byron left eye recess", M.marbleShadow, [-0.10, 2.32, 0.19], [0.035, 0.035, 0.025], g);
  ball("Byron right eye recess", M.marbleShadow, [0.10, 2.32, 0.19], [0.035, 0.035, 0.025], g);
  ball("Byron left shoulder pivot", M.marbleJoint, [-0.45, 1.76, 0.10], [0.30, 0.30, 0.30], g);
  ball("Byron right shoulder pivot", M.marbleJoint, [0.45, 1.76, 0.10], [0.30, 0.30, 0.30], g);
  for (const side of [-1, 1]) {
    cyl(`Byron upper arm ${side}`, M.marble, [side * 0.45, 1.57, 0.10], [0.28, 0.75, 0.28], g, quatEuler(0, 0, side * -0.29));
    ball(`Byron elbow pivot ${side}`, M.marbleJoint, [side * 0.62, 1.30, 0.18], [0.20, 0.20, 0.20], g);
    cyl(`Byron forearm ${side}`, M.marble, [side * 0.62, 1.27, 0.23], [0.17, 0.52, 0.17], g, quatEuler(0, 0, side * 0.24));
    ball(`Byron wrist pivot ${side}`, M.marbleJoint, [side * 0.68, 1.03, 0.28], [0.15, 0.15, 0.15], g);
    ball(`Byron hand ${side}`, M.marble, [side * 0.68, 1.02, 0.28], [0.16, 0.15, 0.15], g);
    ball(`Byron hip pivot ${side}`, M.marbleJoint, [side * 0.23, 0.60, 0], [0.20, 0.20, 0.20], g);
    cyl(`Byron articulated leg ${side}`, M.marble, [side * 0.23, 0.43, 0], [0.23, 0.58, 0.23], g);
    ball(`Byron knee pivot ${side}`, M.marbleJoint, [side * 0.23, 0.17, 0], [0.16, 0.16, 0.16], g);
    cube(`Byron foot ${side}`, M.marble, [side * 0.23, 0.08, 0.10], [0.29, 0.13, 0.42], g);
  }
  return g;
}

// Period-costume figures follow the supplied composition: two guests on the settee,
// the host standing at the hearth, and two guests seated to the right.
seatedAvatar({ name: "Mary Shelley", position: [-4.00, 0, 0.24], yaw: Math.PI / 2, dress: true });
seatedAvatar({ name: "Claire Clairmont", position: [-2.80, 0, 0.32], yaw: Math.PI / 2, dress: true });
standingByron();
seatedAvatar({ name: "Percy Bysshe Shelley", position: [2.43, 0, -0.52], yaw: -Math.PI / 2 });
seatedAvatar({ name: "John Polidori", position: [4.05, 0, 1.05], yaw: -Math.PI / 2, book: true });

// Writing desk by the side window, folios and inkwell.
cube("writing desk top", M.woodLight, [-4.63, 0.95, -1.90], [1.50, 0.14, 0.84]);
cube("writing desk apron", M.wood, [-4.63, 0.78, -1.90], [1.16, 0.24, 0.55]);
for (const dx of [-0.55, 0.55]) {
  for (const dz of [-0.25, 0.25]) cyl(`writing desk leg ${dx} ${dz}`, M.wood, [-4.63 + dx, 0.40, -1.90 + dz], [0.10, 0.70, 0.10]);
}
cube("draft pages on desk", M.paper, [-4.64, 1.045, -1.91], [0.62, 0.025, 0.48]);
cyl("inkpot", M.ink, [-4.10, 1.12, -1.74], [0.13, 0.18, 0.13]);
cube("quill shaft", M.trim, [-4.24, 1.11, -1.98], [0.52, 0.025, 0.025], undefined, quatEuler(0.08, 0.0, -0.34));

// A bookcase and stacked volumes give the room a lived-in literary focus.
cube("bookcase carcass", M.wood, [4.63, 2.00, -3.65], [1.32, 3.55, 0.52]);
cube("bookcase dark backing", M.ink, [4.63, 2.00, -3.36], [1.08, 3.32, 0.04]);
for (const y of [0.46, 1.25, 2.04, 2.83, 3.55]) {
  cube(`bookcase shelf ${y}`, M.woodLight, [4.63, y, -3.29], [1.31, 0.09, 0.62]);
}
const bookColors = [M.velvet, M.ink, M.percy, M.gold, M.claireSash, M.woodLight];
for (let shelf = 0; shelf < 4; shelf++) {
  for (let i = 0; i < 6; i++) {
    const h = 0.42 + ((i + shelf) % 3) * 0.08;
    cube(`book spine ${shelf}-${i}`, bookColors[(i + shelf) % bookColors.length], [4.15 + i * 0.18, 0.72 + shelf * 0.79 + h / 2, -3.29], [0.12, h, 0.34]);
  }
}

// Terrazzo/stone sill and covered Tuscan-column gallery at the lake side.
cube("lake loggia floor", M.stone, [0, -0.02, 5.75], [12.8, 0.22, 2.85]);
cube("lake loggia threshold", M.gold, [0, 0.12, 4.40], [11.7, 0.08, 0.16]);
cube("loggia front entablature", M.trim, [0, 4.20, 7.12], [13.0, 0.20, 0.40]);
cube("loggia front fascia", M.plaster, [0, 4.02, 7.12], [12.8, 0.20, 0.36]);
for (let x = -5.85; x <= 5.86; x += 1.95) {
  cyl(`Tuscan front column shaft ${x}`, M.trim, [x, 1.97, 7.02], [0.38, 3.66, 0.38]);
  cyl(`Tuscan front column base ${x}`, M.stone, [x, 0.22, 7.02], [0.66, 0.22, 0.66]);
  cube(`Tuscan front column plinth ${x}`, M.trim, [x, 0.38, 7.02], [0.55, 0.12, 0.55]);
  cube(`Tuscan front column capital ${x}`, M.trim, [x, 3.82, 7.02], [0.68, 0.18, 0.68]);
}
for (const side of [-1, 1]) {
  cube(`side loggia return ${side}`, M.stone, [side * 6.15, -0.02, 0.15], [1.05, 0.22, 8.25]);
  cube(`side gallery entablature ${side}`, M.trim, [side * 6.57, 4.20, 0.13], [0.42, 0.20, 8.3]);
  for (const z of [-3.20, -1.2, 0.8, 2.8, 4.8]) {
    cyl(`Tuscan return column shaft ${side} ${z}`, M.trim, [side * 6.54, 1.97, z], [0.36, 3.66, 0.36]);
    cyl(`Tuscan return column base ${side} ${z}`, M.stone, [side * 6.54, 0.22, z], [0.64, 0.22, 0.64]);
    cube(`Tuscan return capital ${side} ${z}`, M.trim, [side * 6.54, 3.82, z], [0.65, 0.18, 0.65]);
  }
}

// Candle pools, fire warmth and cool lake light. KHR_lights_punctual is optional for viewers.
punctualLights.push(
  { name: "hearth glow", type: "point", color: [1.0, 0.42, 0.16], intensity: 36, range: 8 },
  { name: "candle glow", type: "point", color: [1.0, 0.66, 0.30], intensity: 18, range: 7 },
  { name: "storm lake fill", type: "directional", color: [0.44, 0.60, 0.78], intensity: 1.7 },
);
const lightNodes = [
  addNode("hearth glow light", [0, 1.30, -3.20]),
  addNode("candle glow light", [0, 2.15, 0.30]),
  addNode("cool light from the lake", [1.0, 3.5, 6.8], quatEuler(-0.8, Math.PI, 0)),
];
lightNodes.forEach((nodeIndex, i) => {
  nodes[nodeIndex].extensions = { KHR_lights_punctual: { light: i } };
});

cameras.push({
  name: "saloon arrival camera",
  type: "perspective",
  perspective: { aspectRatio: 16 / 9, yfov: 0.82, znear: 0.08, zfar: 120 },
});
const cameraNode = addNode("start view - from the lake gallery", [0, 1.70, 7.86]);
nodes[cameraNode].camera = 0;

const sceneRoots = [];
// Most objects are already root nodes; the character/prop groups own their meshes.
for (let i = 0; i < nodes.length; i++) {
  if (!nodes.some((node) => node.children?.includes(i))) sceneRoots.push(i);
}

const bin = Buffer.concat(binaryParts);
const binPadding = (4 - (bin.length % 4)) % 4;
const paddedBin = binPadding ? Buffer.concat([bin, Buffer.alloc(binPadding)]) : bin;
const gltf = {
  asset: {
    version: "2.0",
    generator: "Castalia Institute — Villa Diodati Saloon prototype",
    extras: {
      orientation: "Lake Geneva is toward +Z; entry court is behind the viewer-facing room, toward -Z.",
      basis: "Exterior massing is guided by public heritage descriptions and nineteenth-century views. Interior layout, furniture, avatars and lighting are interpretive scene design.",
    },
  },
  scene: 0,
  scenes: [{ name: "Villa Diodati - 1816 saloon", nodes: sceneRoots }],
  nodes,
  meshes,
  materials,
  cameras,
  accessors,
  bufferViews,
  buffers: [{ byteLength: paddedBin.length }],
  extensionsUsed: ["KHR_lights_punctual"],
  extensions: { KHR_lights_punctual: { lights: punctualLights } },
};

const jsonBytesRaw = Buffer.from(JSON.stringify(gltf));
const jsonPadding = (4 - (jsonBytesRaw.length % 4)) % 4;
const jsonBytes = jsonPadding
  ? Buffer.concat([jsonBytesRaw, Buffer.alloc(jsonPadding, 0x20)])
  : jsonBytesRaw;
const totalLength = 12 + 8 + jsonBytes.length + 8 + paddedBin.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);
const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(jsonBytes.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);
const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(paddedBin.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jsonChunkHeader, jsonBytes, binChunkHeader, paddedBin]);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, glb);
console.log(`Wrote ${output} (${glb.length.toLocaleString()} bytes, ${nodes.length} nodes, ${meshes.length} meshes).`);
