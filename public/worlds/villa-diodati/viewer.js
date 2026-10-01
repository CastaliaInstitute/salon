import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");
const chatPanel = document.querySelector("#chat-panel");
const closeChat = document.querySelector("#close-chat");
const openChat = document.querySelector("#open-chat");
const textureLoader = new THREE.TextureLoader();
const mannequinLoader = new GLTFLoader();
const furnitureLoader = new GLTFLoader();
const mannequinMixers = [];
const seatedFigures = [];
const animationClock = new THREE.Clock();
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
  const bones = new Map();
  figure.traverse((object) => {
    if (object.isBone) bones.set(object.name, object);
  });
  const rotate = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (bone) bone.rotation.set(x, y, z);
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
  }
}

function poseSeatedLowerBody(figure) {
  const bones = new Map();
  figure.traverse((object) => {
    if (object.isBone) bones.set(object.name, object);
  });
  const rotate = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (bone) bone.rotation.set(x, y, z);
  };
  rotate("thigh.l", -1.62, 0.12, -0.10);
  rotate("thigh.r", -1.62, -0.12, 0.10);
  rotate("calf.l", 2.18, 0, 0);
  rotate("calf.r", 2.18, 0, 0);
  rotate("foot.l", -0.62, 0, 0);
  rotate("foot.r", -0.62, 0, 0);
}

function poseSeatedFigure(figure) {
  // Re-apply the authored seated pose after the idle mixer advances. This
  // keeps the animation flow intact while preventing it from reopening the
  // knees or lifting the conversational arms into a T-pose.
  poseSeatedLowerBody(figure);
  const bones = new Map();
  figure.traverse((object) => {
    if (object.isBone) bones.set(object.name, object);
  });
  const rotate = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (bone) bone.rotation.set(x, y, z);
  };
  rotate("spine_01", -0.10, 0, 0);
  rotate("spine_02", -0.08, 0, 0);
  rotate("upperarm.l", 0, 0, -1.32);
  rotate("upperarm.r", 0, 0, 1.32);
  rotate("lowerarm.l", -0.28, 0, -0.08);
  rotate("lowerarm.r", -0.28, 0, 0.08);
}

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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171513);

const lakeBackdropTexture = textureLoader.load("./furniture/lake-geneva-dusk.png");
lakeBackdropTexture.colorSpace = THREE.SRGBColorSpace;
const lakeBackdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(15.8, 7.9),
  new THREE.MeshBasicMaterial({ map: lakeBackdropTexture, toneMapped: false }),
);
lakeBackdrop.position.set(0, 2.65, -4.32);
scene.add(lakeBackdrop);

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
  (gltf) => {
    // A cutaway roof and lake facade keep the statues visible in the browser overview.
    // The downloadable GLB remains complete for ThirdRoom.
    gltf.scene.traverse((object) => {
      if (
        object.name === "ceiling" ||
        /^(lake_wall|lake_opening|lake_window|lake_transom|lake_center_mullion|lake_curtain|lake_cornice)/.test(object.name)
      ) object.visible = false;
      if (/white bust/i.test(object.name)) object.visible = false;
      if (/^(Byron's companion chair|reading chair|guest chair by the window)/.test(object.name)) {
        object.visible = false;
      }
      if (/^(low reading table|reading table|table leg|table candelabra)/.test(object.name)) {
        object.visible = false;
      }
      if (/(table|chair|desk|bench|seat)/i.test(object.name)) {
        object.visible = false;
      }
      if (/^carved settee/.test(object.name)) {
        object.visible = false;
      }
      if (object.isMesh && object.material && /deep wine upholstery/i.test(object.material.name || "")) {
        object.visible = false;
      }
      if (object.isMesh && object.material && /(warm Carrara marble|marble in carved folds)/i.test(object.material.name || "")) {
        object.visible = false;
      }
      if (object.isMesh && object.material && object.material.color) {
        const { r, g, b } = object.material.color;
        if (r > g * 1.28 && r > b * 1.22 && r > 0.22) object.visible = false;
      }
      if (/^(Mary Shelley|Claire Clairmont|Percy Bysshe Shelley|John Polidori|Lord Byron) mannequin/.test(object.name)) {
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
    scene.add(gltf.scene);
    mannequinLoader.load("./mannequiny.glb", (mannequin) => {
      const placements = [
        [-4.00, 0.02, 0.24, Math.PI / 2],
        [-2.80, 0.02, 0.32, Math.PI / 2],
        [0.54, 0.02, -0.15, Math.PI],
        [2.43, 0.02, -0.52, -Math.PI / 2],
        [4.05, 0.02, 1.05, -Math.PI / 2],
      ];
      for (const [index, [x, y, z, yaw]] of placements.entries()) {
        const figure = SkeletonUtils.clone(mannequin.scene);
        // Match the mannequin to the authored seating and bust mounts. The
        // source asset is intentionally compact, so 1.08 restores human
        // scale in this room without changing the furniture layout.
        figure.scale.setScalar(1.08);
        poseMannequin(figure, x === 0.54 ? "conversational" : "seated");
        const headBone = [...figure.children, figure].flatMap((root) => {
          const found = [];
          root.traverse((object) => { if (object.isBone && object.name === "head") found.push(object); });
          return found;
        })[0];
        if (headBone) {
          const headTexture = textureLoader.load(headAssets[index]);
          headTexture.colorSpace = THREE.SRGBColorSpace;
          const headVolume = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 32, 20),
            new THREE.MeshStandardMaterial({
              map: headTexture,
              transparent: true,
              alphaTest: 0.08,
              roughness: 0.74,
              metalness: 0,
              side: THREE.DoubleSide,
            }),
          );
          headVolume.userData.isFacultyHead = true;
          headVolume.scale.set(0.78, 0.98, 0.68);
          headVolume.rotation.y = Math.PI;
          headVolume.position.set(0, 0.09, 0.02);
          headBone.add(headVolume);
        }
        figure.traverse((object) => {
          if (!object.isMesh) return;
          if (object.userData.isFacultyHead) return;
          const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
          object.material = sourceMaterials.map((source, materialIndex) => {
            const material = source.clone();
            material.color.set(0x8b542c);
            material.roughness = 0.52;
            material.metalness = 0;
            return material;
          });
        });
        addDrapedClothing(figure, index);
        dressFigure(figure, index);
        // The source rig keeps a tall standing silhouette even when its leg
        // bones are posed. Lower the figures only slightly into the chair
        // line, with a hard floor-safe limit so no feet can pass below the
        // saloon floor plane.
        figure.position.set(x, x === 0.54 ? y : y + 0.14, z);
        figure.rotation.y = yaw;
        if (x !== 0.54) {
          seatedFigures.push(figure);
          keepFeetAboveFloor(figure);
        }
        const idleClip = mannequin.animations?.find((clip) => clip.name === "idle");
        if (idleClip) {
          const mixer = new THREE.AnimationMixer(figure);
          mixer.clipAction(idleClip).play();
          mannequinMixers.push(mixer);
        }
        scene.add(figure);
      }
      status.textContent = "Wooden mannequin circle loaded. Drag to look around.";
    }, undefined, (error) => {
      console.error("Could not load the wooden mannequin asset", error);
      status.textContent = "Room loaded; mannequin asset unavailable.";
    });
    furnitureLoader.load("./furniture/wood-furniture-kit.glb", (kit) => {
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
      const replacement = sofa.scene.clone(true);
      replacement.scale.setScalar(0.9);
      replacement.position.set(0, 0, -1.28);
      replacement.rotation.y = 0;
      scene.add(replacement);
    }, undefined, (error) => {
      console.error("Could not load the Victorian sofa", error);
    });
    status.textContent = "White bust mannequin circle loaded. Drag to look around.";
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
  for (const figure of seatedFigures) {
    poseSeatedFigure(figure);
    keepFeetAboveFloor(figure);
  }
  controls.update();
  renderer.render(scene, camera);
});
