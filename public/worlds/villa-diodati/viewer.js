import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171513);

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
      if (/^(Mary Shelley|Claire Clairmont|Percy Bysshe Shelley|John Polidori) white bust$/.test(object.name)) {
        object.position.y -= 0.52;
      }
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
          textureLoader.load(url, () => {
            object.visible = true;
          });
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
      for (const [x, y, z, yaw] of placements) {
        const figure = SkeletonUtils.clone(mannequin.scene);
        // Match the mannequin to the authored seating and bust mounts. The
        // source asset is intentionally compact, so 1.08 restores human
        // scale in this room without changing the furniture layout.
        figure.scale.setScalar(1.08);
        poseMannequin(figure, x === 0.54 ? "conversational" : "seated");
        figure.traverse((object) => {
          if (!object.isMesh) return;
          object.material = object.material.clone();
          object.material.color.set(0x8b542c);
          object.material.roughness = 0.52;
          object.material.metalness = 0;
        });
        // The source rig keeps a tall standing silhouette even when its leg
        // bones are posed. Lower the four circle members into the chair line;
        // the hearth host remains standing at the center.
      figure.position.set(x, y - 0.52, z);
        figure.rotation.y = yaw;
        if (x !== 0.54) seatedFigures.push(figure);
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
  for (const figure of seatedFigures) poseSeatedLowerBody(figure);
  controls.update();
  renderer.render(scene, camera);
});
