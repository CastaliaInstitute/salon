import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
let RAPIER = null;

const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");
const chatPanel = document.querySelector("#chat-panel");
const closeChat = document.querySelector("#close-chat");
const openChat = document.querySelector("#open-chat");
const textureLoader = new THREE.TextureLoader();
const mannequinLoader = new GLTFLoader();
const qaMode = new URLSearchParams(window.location.search).get("qa") || "";
const figureOnlyMode = qaMode.startsWith("figure-only");
const figureRoomMode = qaMode === "figure-room";
const dressingRoomMode = qaMode === "dressing-room";
const clothingLoader = new GLTFLoader();
const downloadedDressLoader = new GLTFLoader();
const furnitureLoader = new GLTFLoader();
const mannequinMixers = [];
const seatedFigures = [];
const standingFigures = [];
const ragdolls = [];
let physicsWorld = null;
let physicsReady = false;
const animationClock = new THREE.Clock();
const FLOOR_Y = -0.22;
const facultyBusts = {
  "Lord Byron": "https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/byron/bust_frontal.png",
  "Claire Clairmont": "https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/clairmont/bust_frontal.png",
  "Percy Bysshe Shelley": "https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/shelley/bust_frontal.png",
  "John Polidori": "https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/polidori/bust_frontal.png",
};
const headAssets = [
  "./furniture/heads/byron-head.png",
  "./furniture/heads/clairmont-head.png",
  "./furniture/heads/shelley-head.png",
  "./furniture/heads/polidori-head.png",
  "./furniture/heads/byron-head.png",
];
const wardrobeColors = [
  0x651f2b, // Byron wine coat
  0x304936, // Claire deep green dress
  0x56633b, // Percy olive coat
  0x263c58, // Polidori navy coat
  0x6b2635, // Mary wine dress
];

function preparePoseBases(figure) {
  figure.traverse((object) => {
    if (object.isBone && !object.userData.poseBase) object.userData.poseBase = object.rotation.clone();
  });
}

function refreshSkinnedPose(figure) {
  figure.updateMatrixWorld(true);
  figure.traverse((object) => {
    if (object.isSkinnedMesh && object.skeleton) object.skeleton.update();
  });
}

function addDrapedClothing(figure, index) {
  const fabric = new THREE.MeshStandardMaterial({
    color: wardrobeColors[index] || wardrobeColors[0],
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  // These are separate garment shells around the articulated wood, not a
  // recolor of the mannequin. Keeping them on the root preserves the visible
  // wood at the joints while giving the torso a period fabric silhouette.
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.31, 0.62, 24, 1, true), fabric);
  coat.position.set(0, 0.93, 0);
  figure.add(coat);
  const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.025), fabric.clone());
  lapel.material.color.offsetHSL(0, 0, 0.08);
  lapel.position.set(0, 1.02, 0.245);
  figure.add(lapel);
  if (index === 1 || index === 4) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.43, 0.48, 24, 1, true), fabric.clone());
    skirt.position.set(0, 0.53, 0);
    figure.add(skirt);
  }
}

function poseMannequin(figure, pose = "seated") {
  preparePoseBases(figure);
  const bones = new Map();
  figure.traverse((object) => {
    if (object.isBone) bones.set(object.name, object);
  });
  const rotate = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (bone) bone.rotation.copy(bone.userData.poseBase).x += x, bone.rotation.y = bone.userData.poseBase.y + y, bone.rotation.z = bone.userData.poseBase.z + z;
  };
  if (pose === "seated") {
    // The asset's rest pose is fully vertical. These stronger bends make the
    // hip-to-knee and knee-to-ankle chain read clearly from the salon camera.
    rotate("thigh.l", -1.62, 0.12, -0.10);
    rotate("thigh.r", -1.62, -0.12, 0.10);
    rotate("calf.l", 2.18, 0, 0);
    rotate("calf.r", 2.18, 0, 0);
    rotate("foot.l", -0.62, 0, 0);
    rotate("foot.r", -0.62, 0, 0);
    rotate("spine_01", -0.10, 0, 0);
    rotate("spine_02", -0.08, 0, 0);
    rotate("upperarm.l", 0, 0, -1.32);
    rotate("upperarm.r", 0, 0, 1.32);
    rotate("lowerarm.l", -0.28, 0, -0.08);
    rotate("lowerarm.r", -0.28, 0, 0.08);
    refreshSkinnedPose(figure);
  } else if (pose === "conversational") {
    rotate("thigh.l", -1.62, 0.12, -0.10);
    rotate("thigh.r", -1.62, -0.12, 0.10);
    rotate("calf.l", 2.18, 0, 0);
    rotate("calf.r", 2.18, 0, 0);
    rotate("foot.l", -0.62, 0, 0);
    rotate("foot.r", -0.62, 0, 0);
    rotate("upperarm.l", -0.24, 0, -1.04);
    rotate("upperarm.r", -0.10, 0, 0.88);
    rotate("lowerarm.l", -0.64, 0.08, -0.10);
    rotate("lowerarm.r", -0.52, -0.08, 0.10);
    rotate("head", 0.02, 0.32, 0);
    refreshSkinnedPose(figure);
  }
}

function poseSeatedLowerBody(figure, index = 0) {
  preparePoseBases(figure);
  const bones = new Map();
  figure.traverse((object) => {
    if (object.isBone) bones.set(object.name, object);
  });
  const rotate = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (bone) bone.rotation.copy(bone.userData.poseBase).x += x, bone.rotation.y = bone.userData.poseBase.y + y, bone.rotation.z = bone.userData.poseBase.z + z;
  };
  const lowerBody = [
    [-1.48, -1.66, 2.04, 2.18, -0.52, -0.62],
    [-1.60, -1.52, 2.16, 2.04, -0.60, -0.54],
    [-1.70, -1.58, 2.26, 2.10, -0.68, -0.58],
    [-1.54, -1.72, 2.10, 2.24, -0.56, -0.66],
  ][index % 4];
  rotate("thigh.l", lowerBody[0], 0.12, -0.10);
  rotate("thigh.r", lowerBody[1], -0.12, 0.10);
  rotate("calf.l", lowerBody[2], 0, 0);
  rotate("calf.r", lowerBody[3], 0, 0);
  rotate("foot.l", lowerBody[4], 0, 0);
  rotate("foot.r", lowerBody[5], 0, 0);
  refreshSkinnedPose(figure);
}

function poseSeatedFigure(figure, index = 0) {
  // Re-apply the authored seated pose after the idle mixer advances. This
  // keeps the animation flow intact while preventing it from reopening the
  // knees or lifting the conversational arms into a T-pose.
  poseSeatedLowerBody(figure, index);
  preparePoseBases(figure);
  const bones = new Map();
  figure.traverse((object) => {
    if (object.isBone) bones.set(object.name, object);
  });
  const rotate = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (bone) bone.rotation.copy(bone.userData.poseBase).x += x, bone.rotation.y = bone.userData.poseBase.y + y, bone.rotation.z = bone.userData.poseBase.z + z;
  };
  const conversational = [
    [-0.10, -0.08, -1.12, 0.88, -0.52, -0.42, 0.06, 0.28],
    [-0.14, -0.10, -0.96, 1.08, -0.46, -0.20, -0.02, -0.24],
    [-0.08, -0.12, -1.24, 0.82, -0.38, -0.68, 0.02, 0.34],
    [-0.12, -0.08, -1.04, 1.16, -0.64, -0.32, 0.01, -0.30],
  ][index % 4];
  const breath = Math.sin(animationClock.elapsedTime * 1.35 + index * 0.8) * 0.012;
  rotate("spine_01", conversational[0], 0, 0);
  rotate("spine_02", conversational[1] + breath, 0, 0);
  // This rig's upper-arm rest axis is Z (not X); using X leaves both arms in
  // the glTF T-pose even though the numeric rotations look plausible.
  rotate("upperarm.l", 0, 0, -1.32);
  rotate("upperarm.r", 0, 0, 1.32);
  rotate("lowerarm.l", -0.28, 0, -0.08);
  rotate("lowerarm.r", -0.28, 0, 0.08);
  rotate("head", conversational[6] - breath * 0.4, conversational[7], 0);
  refreshSkinnedPose(figure);
}

function poseStandingFigure(figure) {
  preparePoseBases(figure);
  const bones = new Map();
  figure.traverse((object) => { if (object.isBone) bones.set(object.name, object); });
  const rotate = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (bone) bone.rotation.copy(bone.userData.poseBase).x += x, bone.rotation.y = bone.userData.poseBase.y + y, bone.rotation.z = bone.userData.poseBase.z + z;
  };
  rotate("spine_01", -0.04, 0, 0);
  const breath = Math.sin(animationClock.elapsedTime * 1.35 + 2.4) * 0.012;
  rotate("spine_02", -0.02 + breath, 0, 0);
  // The rig's shoulder hinge is the Z axis; keep the host's arms lowered
  // instead of rotating on X and leaving the source mesh in a T-pose.
  rotate("upperarm.l", 0, 0, -0.92);
  rotate("upperarm.r", 0, 0, 0.78);
  rotate("lowerarm.l", -0.48, 0.06, -0.08);
  rotate("lowerarm.r", -0.62, -0.06, 0.08);
  rotate("head", 0.02 - breath * 0.4, 0.28, 0);
  refreshSkinnedPose(figure);
}

function stepPhysics(delta) {
  if (!physicsReady) return;
  physicsWorld.timestep = Math.min(delta, 1 / 30);
  physicsWorld.step();
  for (const ragdoll of ragdolls) {
    for (const part of ragdoll.parts) {
      // Keep the authored bone rotations visible. The rigid bodies provide
      // collision/contact state; copying unconstrained ball rotations here
      // would erase the seated pose and collapse the figures into a T-pose.
    }
  }
}

function addStaticBox(center, halfExtents) {
  const body = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...center));
  physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(...halfExtents), body);
}

function createChairColliders() {
  addStaticBox([0, -0.22, 0], [11, 0.12, 11]);
  for (const x of [-1.55, 1.55]) {
    addStaticBox([x, 0.82, 0.18], [0.72, 0.08, 0.72]);
    addStaticBox([x, 1.42, -0.38], [0.72, 0.62, 0.08]);
    addStaticBox([x - 0.66, 0.78, 0.18], [0.08, 0.38, 0.72]);
    addStaticBox([x + 0.66, 0.78, 0.18], [0.08, 0.38, 0.72]);
  }
  addStaticBox([0, 0.82, -1.28], [1.9, 0.08, 0.62]);
  addStaticBox([0, 1.45, -1.82], [1.9, 0.62, 0.08]);
}

function createRagdoll(figure) {
  figure.updateMatrixWorld(true);
  const names = new Set(["spine_01", "spine_02", "upperarm.l", "lowerarm.l", "upperarm.r", "lowerarm.r", "thigh.l", "calf.l", "foot.l", "thigh.r", "calf.r", "foot.r"]);
  const parts = [];
  const byBone = new Map();
  figure.traverse((bone) => {
    if (!bone.isBone || !names.has(bone.name)) return;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    bone.getWorldPosition(p);
    bone.getWorldQuaternion(q);
    const body = physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(3).setAngularDamping(3).setCanSleep(false),
    );
    physicsWorld.createCollider(RAPIER.ColliderDesc.ball(0.13).setMass(0.7), body);
    const part = { bone, body };
    parts.push(part);
    byBone.set(bone, part);
  });
  for (const part of parts) {
    const parent = byBone.get(part.bone.parent);
    if (!parent) continue;
    physicsWorld.createImpulseJoint(
      RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      parent.body,
      part.body,
      true,
    );
  }
  ragdolls.push({ figure, parts });
}

const physicsInit = import("rapier3d-compat")
  .then(async (module) => {
    RAPIER = module.default ?? module;
    await RAPIER.init();
    physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    createChairColliders();
    physicsReady = true;
  })
  .catch((error) => console.warn("Physics unavailable; keeping authored mannequin poses", error));

function keepFeetAboveFloor(figure) {
  figure.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(figure);
  if (bounds.min.y < 0.03) figure.position.y += 0.03 - bounds.min.y;
}

// The articulated preview mannequin is deliberately neutral. Add a small,
// readable 1816 wardrobe on top of it so the browser view and the ThirdRoom
// scene share the same character language without baking clothes into the
// licensed rig asset.
function dressFigure(figure, index) {
  const wardrobes = [
    { coat: 0x263b2b, accent: 0xa37b3d, kind: "dress" }, // Mary: sage muslin
    { coat: 0x641f2d, accent: 0x9e4e50, kind: "dress" }, // Claire: wine dress
    { coat: 0x2e321f, accent: 0xd2c4a4, kind: "coat" }, // Percy: olive coat
    { coat: 0x33424c, accent: 0xe1d8c2, kind: "waistcoat" }, // Polidori
    { coat: 0x4e1c31, accent: 0x5e4250, kind: "coat" }, // Byron: plum coat
  ];
  const wardrobe = wardrobes[index];
  const fabric = (color) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
  });
  const add = (geometry, material, name, position, rotation = [0, 0, 0]) => {
    const garment = new THREE.Mesh(geometry, material);
    garment.name = name;
    garment.position.set(...position);
    garment.rotation.set(...rotation);
    garment.castShadow = true;
    figure.add(garment);
  };

  const rounded = (width, height, depth, radius = 0.06, smoothness = 3) =>
    new RoundedBoxGeometry(width, height, depth, smoothness, radius);

  // A shallow lathed profile gives the skirts a hem and a natural flare,
  // instead of the perfect cone silhouette used in the first wardrobe pass.
  const skirtProfile = [
    new THREE.Vector2(0.18, 1.28),
    new THREE.Vector2(0.25, 1.16),
    new THREE.Vector2(0.31, 0.99),
    new THREE.Vector2(0.42, 0.77),
    new THREE.Vector2(0.52, 0.60),
  ];

  if (wardrobe.kind === "dress") {
    add(new THREE.LatheGeometry(skirtProfile, 32), fabric(wardrobe.coat), "period dress skirt", [0, 0.02, 0.03]);
    add(rounded(0.40, 0.48, 0.32, 0.08), fabric(wardrobe.coat), "dress bodice", [0, 1.31, 0.01]);
    add(rounded(0.34, 0.10, 0.045, 0.025), fabric(wardrobe.accent), "dress sash", [0, 1.23, 0.20]);
    add(rounded(0.13, 0.28, 0.045, 0.02), fabric(wardrobe.accent), "dress neckline", [0, 1.48, 0.18]);
  } else {
    add(rounded(0.68, 0.72, 0.44, 0.11), fabric(wardrobe.coat), "period coat torso", [0, 1.34, 0]);
    add(rounded(0.34, 0.38, 0.075, 0.035), fabric(wardrobe.accent), "linen waistcoat", [0, 1.49, 0.235]);
    add(rounded(0.14, 0.24, 0.07, 0.025), fabric(wardrobe.accent), "high collar", [0, 1.77, 0.18]);
    add(rounded(0.055, 0.055, 0.035, 0.02), fabric(0xd2af62), "waistcoat button", [0, 1.51, 0.285]);
    add(rounded(0.055, 0.055, 0.035, 0.02), fabric(0xd2af62), "waistcoat button", [0, 1.39, 0.285]);
  }

  // Small cuffs keep the posed forearms from reading as bare wooden sticks.
  for (const side of [-1, 1]) {
    add(rounded(0.16, 0.30, 0.16, 0.055), fabric(wardrobe.coat), "period sleeve", [side * 0.31, 1.20, 0.27], [0, 0, side * 0.28]);
    add(rounded(0.17, 0.09, 0.17, 0.03), fabric(wardrobe.accent), "shirt cuff", [side * 0.28, 1.04, 0.39], [0, 0, side * 0.28]);
  }
}

function tintClothing(clothing, index) {
  const palettes = [
    { outer: 0x263b2b, waistcoat: 0xa37b3d, shirt: 0xd2c4a4 },
    { outer: 0x641f2d, waistcoat: 0x9e4e50, shirt: 0xe0d2b8 },
    { outer: 0x2e321f, waistcoat: 0x8f8a65, shirt: 0xd2c4a4 },
    { outer: 0x33424c, waistcoat: 0x596b73, shirt: 0xe1d8c2 },
    { outer: 0x4e1c31, waistcoat: 0x6b465b, shirt: 0xd8c8b0 },
  ][index];
  clothing.traverse((object) => {
    if (!object.isMesh) return;
    object.material = object.material.clone();
    const name = object.name.toLowerCase();
    const color = name.includes('shirt') || name.includes('linen')
      ? palettes.shirt
      : name.includes('waistcoat')
        ? palettes.waistcoat
        : palettes.outer;
    object.material.color.set(color);
    object.material.roughness = name.includes('dress') ? 0.92 : 0.82;
  });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171513);

const lakeBackdropTexture = textureLoader.load("./furniture/lake-geneva-dusk.png");
lakeBackdropTexture.colorSpace = THREE.SRGBColorSpace;
const lakeBackdrop = new THREE.Mesh(
  new THREE.CylinderGeometry(12, 12, 10, 64, 1, true),
  new THREE.MeshBasicMaterial({ map: lakeBackdropTexture, toneMapped: false, side: THREE.BackSide }),
);
lakeBackdrop.position.set(0, 4.0, 0);
scene.add(lakeBackdrop);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(22, 22),
  new THREE.MeshStandardMaterial({ color: 0x5a5047, roughness: 0.78, metalness: 0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.22;
scene.add(floor);

const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(22, 22),
  new THREE.MeshStandardMaterial({ color: 0x171513, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = 4.55;
scene.add(ceiling);

const camera = new THREE.PerspectiveCamera(72, 1, 0.06, 100);
camera.position.set(0, 2.85, 5.15);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

scene.add(new THREE.HemisphereLight(0xb98f72, 0x24130f, 0.78));
const fill = new THREE.DirectionalLight(0xffd1a3, 0.52);
fill.position.set(-3, 6, 4);
scene.add(fill);
const firelight = new THREE.PointLight(0xff8a42, 2.6, 8, 2);
firelight.position.set(-4.15, 1.65, -2.45);
scene.add(firelight);
const tablelight = new THREE.PointLight(0xffbf72, 1.5, 5, 2);
tablelight.position.set(0, 2.15, 0.05);
scene.add(tablelight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.28, -0.25);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 2.4;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

const resize = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
};
window.addEventListener("resize", resize);
resize();

new GLTFLoader().load(
  "./saloon.glb?v=68a0298",
  async (gltf) => {
    // A cutaway roof and lake facade keep the statues visible in the browser overview.
    // The downloadable GLB remains complete for ThirdRoom.
    gltf.scene.traverse((object) => {
      if (
        object.name === "ceiling" ||
        /^(lake_wall|lake_opening|lake_window|lake_transom|lake_center_mullion|lake_curtain|lake_cornice)/.test(object.name)
      ) object.visible = false;
      if (/white bust/i.test(object.name)) object.visible = false;
      if (object.isMesh && object.material && /deep wine upholstery/i.test(object.material.name || "")) {
        object.visible = false;
      }
      if (object.isMesh && object.material && /(warm Carrara marble|marble in carved folds)/i.test(object.material.name || "")) {
        object.visible = false;
      }
      if (object.isMesh && object.name.endsWith("white bust face")) {
        const faculty = Object.keys(facultyBusts).find((name) => object.name.startsWith(name));
        const url = faculty && facultyBusts[faculty];
        if (url) {
          const material = object.material.clone();
          // Keep the authored white marble head geometry visible. The
          // Supabase portrait remains the faculty source of record, but
          // projecting its full-bust PNG onto a primitive creates obvious
          // billboard/mushroom artifacts at this camera distance.
          textureLoader.load(url);
          object.material = material;
        }
      }
    });
    if (!figureOnlyMode && !dressingRoomMode) scene.add(gltf.scene);
    else {
      scene.background = new THREE.Color(0x202020);
      scene.fog = null;
      camera.position.set(0, 1.8, 5.4);
      controls.target.set(0, 1.05, 0);
      controls.update();
    }
    if (figureRoomMode || dressingRoomMode) {
      scene.background = new THREE.Color(0x202020);
      scene.fog = null;
      camera.position.set(0, 1.65, 5.8);
      controls.target.set(0, 1.15, 0);
      controls.update();
    }
    mannequinLoader.load("./mannequiny.glb", (mannequin) => {
      const placements = [
        [-4.00, 0.34, 0.24, Math.PI / 2],
        [-2.80, 0.34, 0.32, Math.PI / 2],
        [0.54, 0.14, -0.15, Math.PI],
        [2.43, 0.34, -0.52, -Math.PI / 2],
        [4.05, 0.34, 1.05, -Math.PI / 2],
      ];
      const visiblePlacements = figureOnlyMode || figureRoomMode || dressingRoomMode ? [[0, 0.34, -0.75, 0]] : placements;
      for (const [x, y, z, yaw] of visiblePlacements) {
        const figure = mannequin.scene.clone(true);
        figure.scale.setScalar(figureRoomMode || dressingRoomMode ? 2.75 : 2.45);
        figure.position.set(x, y, z);
        figure.rotation.y = yaw;
        figure.traverse((object) => {
          // The source GLB contains child visibility flags from its authoring
          // scene. Do not let those flags hide limbs in the browser preview.
          object.visible = true;
          if (object.isMesh) object.frustumCulled = false;
        });
        scene.add(figure);
      }
      status.textContent = dressingRoomMode ? "Dressing room loaded: one wooden mannequin and one chair." : `Wooden mannequin circle loaded: ${placements.length} figures.`;
    }, undefined, (error) => {
      console.error("Could not load the wooden mannequin asset", error);
      status.textContent = "Room loaded; mannequin asset unavailable.";
    });
    furnitureLoader.load("./furniture/wood-furniture-kit.glb", (kit) => {
      if (figureOnlyMode || figureRoomMode) return;
      const placements = {
        Furns_Shelf_Book_1: [4.42, 0, -3.62, 0],
      };
      kit.scene.traverse((object) => {
        const placement = placements[object.name];
        object.visible = Boolean(placement);
        if (!placement) return;
        object.position.set(placement[0], placement[1], placement[2]);
        object.rotation.y = placement[3];
        object.scale.multiplyScalar(0.82);
      });
      scene.add(kit.scene);
    }, undefined, (error) => {
      console.error("Could not load the wood furniture kit", error);
    });
    furnitureLoader.load("./furniture/armchair-01/ArmChair_01.gltf", (armchair) => {
      if (figureOnlyMode || figureRoomMode) return;
      if (dressingRoomMode) {
        const chair = armchair.scene.clone(true);
        chair.scale.setScalar(0.9);
        chair.position.set(1.35, 0, -0.7);
        chair.rotation.y = -Math.PI * 0.12;
        scene.add(chair);
        return;
      }
      const placements = [
        [-1.55, 0, 0.18, Math.PI * 0.08, 0x8b2635],
        [1.55, 0, 0.18, -Math.PI * 0.08, 0x314b35],
      ];
      for (const [x, y, z, yaw, tint] of placements) {
        const chair = armchair.scene.clone(true);
        chair.scale.setScalar(0.94);
        chair.position.set(x, y, z);
        chair.rotation.y = yaw;
        chair.traverse((object) => {
          if (!object.isMesh) return;
          object.material = object.material.clone();
          object.material.color.multiply(new THREE.Color(tint));
        });
        scene.add(chair);
      }
    }, undefined, (error) => {
      console.error("Could not load the Victorian armchair", error);
    });
    furnitureLoader.load("./furniture/sofa-03/sofa_03.gltf", (sofa) => {
      if (figureOnlyMode || figureRoomMode) return;
      const replacement = sofa.scene.clone(true);
      replacement.scale.setScalar(0.9);
      replacement.position.set(0, 0, -1.28);
      replacement.rotation.y = 0;
      scene.add(replacement);
    }, undefined, (error) => {
      console.error("Could not load the Victorian sofa", error);
    });
    status.textContent = dressingRoomMode ? "Dressing room loaded. Drag to look around." : "White bust mannequin circle loaded. Drag to look around.";
  },
  (event) => {
    if (event.total) status.textContent = `Loading the room… ${Math.round((event.loaded / event.total) * 100)}%`;
  },
  (error) => {
    console.error("Could not load the Villa Diodati scene", error);
    status.textContent = "The room could not be loaded. Try refreshing.";
  },
);

closeChat.addEventListener("click", () => {
  chatPanel.classList.add("is-hidden");
  openChat.classList.add("is-visible");
  openChat.setAttribute("aria-expanded", "false");
});
openChat.addEventListener("click", () => {
  chatPanel.classList.remove("is-hidden");
  openChat.classList.remove("is-visible");
  openChat.setAttribute("aria-expanded", "true");
});

if (window.matchMedia("(max-width: 760px)").matches) {
  chatPanel.classList.add("is-hidden");
  openChat.classList.add("is-visible");
  openChat.setAttribute("aria-expanded", "false");
}

renderer.setAnimationLoop(() => {
  const delta = Math.min(animationClock.getDelta(), 0.05);
  for (const mixer of mannequinMixers) mixer.update(delta);
  for (const seated of seatedFigures) {
    poseSeatedFigure(seated.figure, seated.index);
    keepFeetAboveFloor(seated.figure);
  }
  for (const figure of standingFigures) poseStandingFigure(figure);
  // The preview is intentionally pose-led; physics remains available for
  // future interaction but does not overwrite the authored clothing pose.
  controls.update();
  renderer.render(scene, camera);
});
