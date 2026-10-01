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
const facultyBusts = {
  "Lord Byron": "https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/byron/bust_frontal.png",
  "Claire Clairmont": "https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/clairmont/bust_frontal.png",
  "Percy Bysshe Shelley": "https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/shelley/bust_frontal.png",
  "John Polidori": "https://pilmscrodlitdrygabvo.supabase.co/storage/v1/object/public/busts/polidori/bust_frontal.png",
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171513);

const camera = new THREE.PerspectiveCamera(72, 1, 0.06, 100);
camera.position.set(0, 3.4, 6.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

scene.add(new THREE.HemisphereLight(0xc8d4df, 0x4a2a17, 1.65));
const fill = new THREE.DirectionalLight(0xd2d9e1, 0.95);
fill.position.set(-3, 7, 6);
scene.add(fill);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, -0.15);
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
  "./saloon.glb",
  (gltf) => {
    // A cutaway roof and lake facade keep the statues visible in the browser overview.
    // The downloadable GLB remains complete for ThirdRoom.
    gltf.scene.traverse((object) => {
      if (
        object.name === "ceiling" ||
        /^(lake_wall|lake_opening|lake_window|lake_transom|lake_center_mullion|lake_curtain|lake_cornice)/.test(object.name)
      ) object.visible = false;
      if (/^(Mary Shelley|Claire Clairmont|Percy Bysshe Shelley|John Polidori|Lord Byron) mannequin/.test(object.name)) {
        object.visible = false;
      }
      if (object.isMesh && object.name.endsWith("white bust face")) {
        const faculty = Object.keys(facultyBusts).find((name) => object.name.startsWith(name));
        const url = faculty && facultyBusts[faculty];
        if (url) {
          const material = object.material.clone();
          textureLoader.load(url, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            // The stored source is a full bust; show only the head and hair so
            // it remains a head replacement on the wooden mannequin body.
            texture.repeat.set(0.56, 0.50);
            texture.offset.set(0.22, 0.50);
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            const headCard = new THREE.Mesh(
              new THREE.PlaneGeometry(0.56, 0.68),
              new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
              }),
            );
            headCard.position.set(object.position.x, object.position.y + 0.02, object.position.z + 0.28);
            object.parent?.add(headCard);
            object.visible = false;
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
        figure.scale.setScalar(0.72);
        figure.traverse((object) => {
          if (!object.isMesh) return;
          object.material = object.material.clone();
          object.material.color.set(0x8b542c);
          object.material.roughness = 0.52;
          object.material.metalness = 0;
        });
        figure.position.set(x, y, z);
        figure.rotation.y = yaw;
        scene.add(figure);
      }
      status.textContent = "Wooden mannequin circle loaded. Drag to look around.";
    }, undefined, (error) => {
      console.error("Could not load the wooden mannequin asset", error);
      status.textContent = "Room loaded; mannequin asset unavailable.";
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
  controls.update();
  renderer.render(scene, camera);
});
