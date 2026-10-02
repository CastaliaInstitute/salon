import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#room");
const status = document.querySelector("#status");
const cameraButton = document.querySelector("#camera");
const mapButton = document.querySelector("#map-view");
const povButton = document.querySelector("#pov-view");
const dialogueLayer = document.querySelector("#dialogue-layer");
const scriptLines = document.querySelector("#script-lines");
const scriptState = document.querySelector("#script-state");
const rewindSlider = document.querySelector("#rewind-slider");
const rewindLabel = document.querySelector("#rewind-label");
const rewindLive = document.querySelector("#rewind-live");
const rewindPlay = document.querySelector("#rewind-play");
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17120f);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
const isoCamera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 100);
const cinematicCamera = new THREE.PerspectiveCamera(36, 1, .1, 100);
const mapCamera = new THREE.OrthographicCamera(-8, 8, 8, -8, .1, 100);
const povCamera = new THREE.PerspectiveCamera(68, 1, .05, 100);
let activeCamera = isoCamera;
let cinematic = false;
let topDown = new URLSearchParams(location.search).get("map") === "topdown";
let pov = false;
const controls = new OrbitControls(activeCamera, canvas);
controls.enablePan = true; controls.enableDamping = true; controls.dampingFactor = .08;
controls.minZoom = .72; controls.maxZoom = 2.15; controls.minDistance = 3.2; controls.maxDistance = 16;
controls.target.set(0, 0.8, 0);

const map = { minX: -6, maxX: 6, minZ: -4, maxZ: 5 };
fetch("../isometric-map.json", { cache: "no-cache" }).then((response) => response.ok ? response.json() : null).then((contract) => {
  if (contract?.coordinateSystem === "villa-diodati-isometric-v1") Object.assign(map, contract.bounds || {});
}).catch(() => {});
const room = new THREE.Group(); scene.add(room);
const participantLayer = new THREE.Group(); scene.add(participantLayer);
const mapMarkers = new THREE.Group(); mapMarkers.visible = false; scene.add(mapMarkers);
const clock = new THREE.Clock();
const figures = new Map();
const textureCache = new Map();
let fireLight;
let lightningLight;
let cinematicCue = null;
const candleLights = [];
const flames = [];
const sheetFiles = {
  byron: "byron.png", mary: "mary-godwin.png", claire: "claire-clairmont.png", percy: "percy-shelley.png", polidori: "john-polidori.png"
};
const defaultPeople = [
  ["a.byron", "Lord Byron", "byron", 0, -1.7, "idle", "#3d1728", "#9a5d42", "#b6324b", "#d6a27f", 1.1, 1.02],
  ["a.maryshelley", "Mary Shelley", "mary", -4.25, .9, "idle", "#e9dfc8", "#f7f0dd", "#71805d", "#e5b18d"],
  ["a.clairmont", "Claire Clairmont", "claire", -3.15, 1.15, "idle", "#e9dfc8", "#f7f0dd", "#9b4936", "#c98768"],
  ["a.shelley", "Percy Bysshe Shelley", "percy", 3.35, .95, "idle", "#314f7b", "#eadfc4", "#91b6dc", "#d5a07c", .91, .88],
  ["a.polidori", "John Polidori", "polidori", -1.25, 2.25, "idle", "#17191c", "#674936", "#9c7652", "#a96f50"],
];
const demoCrowd = new URLSearchParams(location.search).get("demo") === "30";
const localPlayerEnabled = new URLSearchParams(location.search).get("player") === "1";
if (localPlayerEnabled) document.body.classList.add("local-player");
const localHearingRange = 2.8;
const demoSeated = Math.max(0, Math.min(6, Number(new URLSearchParams(location.search).get("sit") || 0)));
const demoSeatedLimit = defaultPeople.length + demoSeated;
const speechRange = 2.8;
const localPlayer = { id: "player.local", name: "You", style: "mary", x: 0, z: 3.2, state: "idle", direction: "north", coat: "#526b5b", waistcoat: "#e9dfc8", accent: "#b58b59", skin: "#c98768", scale: .9, width: .92, speechRange: localHearingRange };
const pressedKeys = new Set();
let walkTarget = null;
const tapRaycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
canvas.addEventListener("pointerup", (event) => { if (!localPlayerEnabled || event.button !== 0) return; const rect = canvas.getBoundingClientRect(); const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); tapRaycaster.setFromCamera(pointer, activeCamera); const point = new THREE.Vector3(); if (!tapRaycaster.ray.intersectPlane(floorPlane, point)) return; const safe = safePosition(point.x, point.z, .22); walkTarget = { x: safe.x, z: safe.z }; });
addEventListener("keydown", (event) => { if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(event.key)) return; pressedKeys.add(event.key.toLowerCase()); event.preventDefault(); });
addEventListener("keyup", (event) => pressedKeys.delete(event.key.toLowerCase()));
if (localPlayerEnabled) { const joystick = document.createElement("div"); joystick.className = "joystick"; joystick.setAttribute("aria-label", "Move avatar"); document.body.append(joystick); let pointerId = null; const setJoystick = (event) => { const rect = joystick.getBoundingClientRect(); const dx = event.clientX - (rect.left + rect.width / 2); const dy = event.clientY - (rect.top + rect.height / 2); const length = Math.min(Math.hypot(dx, dy), rect.width * .38); const angle = Math.atan2(dy, dx); const x = Math.cos(angle) * length; const y = Math.sin(angle) * length; joystick.style.setProperty("--joy-x", `${x}px`); joystick.style.setProperty("--joy-y", `${y}px`); for (const key of ["arrowleft", "arrowright", "arrowup", "arrowdown"]) pressedKeys.delete(key); if (Math.abs(x) > 8) pressedKeys.add(x < 0 ? "arrowleft" : "arrowright"); if (Math.abs(y) > 8) pressedKeys.add(y < 0 ? "arrowup" : "arrowdown"); }; joystick.addEventListener("pointerdown", (event) => { pointerId = event.pointerId; joystick.setPointerCapture(pointerId); setJoystick(event); }); joystick.addEventListener("pointermove", (event) => { if (event.pointerId === pointerId) setJoystick(event); }); const releaseJoystick = (event) => { if (event.pointerId !== pointerId) return; pointerId = null; for (const key of ["arrowleft", "arrowright", "arrowup", "arrowdown"]) pressedKeys.delete(key); joystick.style.setProperty("--joy-x", "0px"); joystick.style.setProperty("--joy-y", "0px"); }; joystick.addEventListener("pointerup", releaseJoystick); joystick.addEventListener("pointercancel", releaseJoystick); }
function demographicFactors(person) { const height = Number(person.height_cm ?? person.height); const weight = Number(person.weight_kg ?? person.weight); const heightFactor = Number.isFinite(height) && height > 100 ? THREE.MathUtils.clamp(height / 170, .86, 1.14) : 1; const weightFactor = Number.isFinite(weight) && weight > 25 ? THREE.MathUtils.clamp(Math.sqrt(weight / 70), .82, 1.18) : (Number.isFinite(weight) ? THREE.MathUtils.clamp(weight, .84, 1.16) : 1); return { height: heightFactor, weight: weightFactor }; }
const furnitureObstacles = [
  { minX: -5.05, maxX: -1.65, minZ: -.35, maxZ: .95 },
  { minX: 3.05, maxX: 4.45, minZ: -.5, maxZ: .85 },
  { minX: 1.9, maxX: 3.2, minZ: .75, maxZ: 1.95 },
  { minX: -2.65, maxX: -1.25, minZ: 1.1, maxZ: 2.2 },
  { minX: -.95, maxX: 1.25, minZ: 1.0, maxZ: 2.15 },
];

function mat(color, roughness = .72) { return new THREE.MeshStandardMaterial({ color, roughness, metalness: .03 }); }
function box(name, size, position, color, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color));
  mesh.name = name; mesh.position.set(...position); mesh.rotation.y = rotation; mesh.castShadow = true; mesh.receiveShadow = true; room.add(mesh); return mesh;
}
function windowViewTexture() { const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512; const ctx = canvas.getContext("2d"); const sky = ctx.createLinearGradient(0, 0, 0, 512); sky.addColorStop(0, "#0b1830"); sky.addColorStop(.58, "#243d58"); sky.addColorStop(1, "#151b24"); ctx.fillStyle = sky; ctx.fillRect(0, 0, 512, 512); ctx.fillStyle = "rgba(232,241,255,.9)"; ctx.beginPath(); ctx.arc(390, 92, 42, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(11,24,48,.9)"; ctx.beginPath(); ctx.arc(407, 80, 39, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 45; i++) { const x = (i * 83) % 512; const y = 24 + ((i * 47) % 250); ctx.fillStyle = `rgba(220,235,255,${.35 + (i % 4) * .12})`; ctx.fillRect(x, y, 2, 2); } ctx.fillStyle = "#101923"; ctx.beginPath(); ctx.moveTo(0, 390); ctx.lineTo(100, 320); ctx.lineTo(175, 370); ctx.lineTo(280, 290); ctx.lineTo(390, 370); ctx.lineTo(512, 300); ctx.lineTo(512, 512); ctx.lineTo(0, 512); ctx.fill(); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture; }
function loadFurnitureModel(path, name, position, scale, rotation = 0) { gltfLoader.load(path, (gltf) => { const model = gltf.scene; model.name = name; model.position.set(...position); model.scale.setScalar(scale); model.rotation.y = rotation; model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } }); room.add(model); }); }
function buildRoom() {
  const floor = box("oak parquet floor", [12, .12, 9], [0, -.12, .5], 0x76513e); floor.receiveShadow = true;
  for (let x = -5.5; x <= 5.5; x += .55) box("floor inlay", [.018, .015, 8.4], [x, -.045, .5], 0x9a6b4d);
  for (let z = -3.5; z <= 4.5; z += .55) box("floor inlay", [11.5, .015, .018], [0, -.04, z], 0x5f3f36);
  const rearWall = box("rear wall", [12, 4.3, .18], [0, 2.05, -4], 0x3d3435);
  const leftWall = box("left wall", [.18, 4.3, 8.2], [-6, 2.05, .1], 0x4a3a38);
  const rightWall = box("right wall", [.18, 4.3, 8.2], [6, 2.05, .1], 0x4a3a38);
  const frontWall = box("camera-side wall", [12, 4.3, .18], [0, 2.05, 5], 0x3d3435);
  room.userData.walls = { rear: rearWall, left: leftWall, right: rightWall, front: frontWall };
  room.userData.occludingDecor = [];
  const wallpaper = textureLoader.load("../art/wallpaper-v1.png");
  wallpaper.colorSpace = THREE.SRGBColorSpace;
  wallpaper.wrapS = THREE.RepeatWrapping; wallpaper.wrapT = THREE.RepeatWrapping;
  wallpaper.repeat.set(3, 1);
  for (const wall of [rearWall, leftWall, rightWall, frontWall]) { wall.material.map = wallpaper; wall.material.color.set(0xffffff); wall.material.needsUpdate = true; }
  const door = box("front wall door", [1.35, 2.55, .08], [0, 1.3, 4.87], 0x402a24);
  const doorFrameLeft = box("front door frame left", [.12, 2.8, .12], [-.72, 1.42, 4.8], 0xb3875c);
  const doorFrameRight = box("front door frame right", [.12, 2.8, .12], [.72, 1.42, 4.8], 0xb3875c);
  const doorLintel = box("front door lintel", [1.55, .12, .12], [0, 2.78, 4.8], 0xb3875c);
  box("front door handle", [.08, .08, .08], [.48, 1.35, 4.76], 0xd8b36e);
  room.userData.occludingDecor.push(door, doorFrameLeft, doorFrameRight, doorLintel);
  const outside = windowViewTexture();
  for (const x of [-4.25, 4.25]) {
    box("window recess", [1.8, 2.35, .08], [x, 2.45, -3.88], 0x182b3c);
    const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.05), new THREE.MeshBasicMaterial({ map: outside, transparent: true })); windowPane.name = "window to the storm outside"; windowPane.position.set(x, 2.45, -3.8); windowPane.renderOrder = 1; room.add(windowPane); room.userData.occludingDecor.push(windowPane);
    box("window mullion", [.1, 2.1, .1], [x, 2.45, -3.8], 0x9d704d);
    box("window sill", [1.9, .12, .22], [x, 1.25, -3.72], 0xb3875c);
    box("curtain", [.28, 3.1, .3], [x + (x < 0 ? -.82 : .82), 2.45, -3.7], 0x80605b);
  }
  const shelfX = -5.72;
  box("built-in bookshelf backing", [.12, 3.05, 3.55], [shelfX, 1.95, -1.55], 0x3b2925);
  box("built-in bookshelf left stile", [.28, 3.35, 3.75], [shelfX - .1, 1.95, -1.55], 0x8b5d40);
  box("built-in bookshelf right stile", [.28, 3.35, 3.75], [shelfX + .1, 1.95, -1.55], 0x8b5d40);
  for (const y of [.52, 1.3, 2.08, 2.86, 3.64]) box("built-in bookshelf shelf", [.38, .12, 3.75], [shelfX, y, -1.55], 0x9b6846);
  const bookColors = [0x6e3030, 0x284b59, 0x68502e, 0x4b315c, 0x9a7044, 0x334b36, 0x7b4034];
  const bookRows = [.61, 1.39, 2.17, 2.95, 3.73];
  bookRows.forEach((y, row) => {
    let z = -3.18 + (row % 2) * .05;
    let index = 0;
    while (z < .05) {
      const width = .16 + ((row + index) % 3) * .045;
      const height = .5 + ((row * 2 + index) % 3) * .07;
      const book = box("individual book", [.24, height, width], [shelfX - .22, y + height / 2, z + width / 2], bookColors[(row * 3 + index) % bookColors.length], 0);
      book.rotation.x = ((index + row) % 4 === 0 ? -.035 : 0);
      book.rotation.y = ((index + row) % 5 === 0 ? .08 : 0);
      z += width + .045;
      index += 1;
    }
  });
  const writingDeskX = 4.55;
  const writingDeskZ = -1.8;
  box("antique writing desk top", [1.25, .12, 1.15], [writingDeskX, 1.02, writingDeskZ], 0x6b402d);
  box("antique writing desk apron", [1.1, .32, .08], [writingDeskX, .82, writingDeskZ + .48], 0x553126);
  for (const x of [writingDeskX - .5, writingDeskX + .5]) for (const z of [writingDeskZ - .42, writingDeskZ + .42]) box("antique writing desk leg", [.1, .82, .1], [x, .43, z], 0x4b2d24);
  box("dado", [11.8, .22, .22], [0, .55, -3.85], 0xa47955);
  for (const x of [-2.35, 2.35]) {
    const framePieces = [
      box("art frame top", [1.18, .08, .1], [x, 3.24, -3.68], 0xa47a50),
      box("art frame bottom", [1.18, .08, .1], [x, 1.86, -3.68], 0xa47a50),
      box("art frame left", [.08, 1.46, .1], [x - .55, 2.55, -3.68], 0xa47a50),
      box("art frame right", [.08, 1.46, .1], [x + .55, 2.55, -3.68], 0xa47a50),
    ];
    const art = textureLoader.load("../art/wall-triptych-v1.png");
    art.colorSpace = THREE.SRGBColorSpace; art.wrapS = THREE.ClampToEdgeWrapping; art.repeat.set(1 / 3, 1); art.offset.set(x < 0 ? 0 : 2 / 3, 0);
    const painting = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.3), new THREE.MeshBasicMaterial({ map: art }));
    painting.name = "generated wall painting"; painting.position.set(x, 2.55, -3.7); painting.renderOrder = 2; room.add(painting);
    room.userData.occludingDecor.push(...framePieces, painting);
  }
  const fireplaceTexture = textureLoader.load("../art/fireplace-v1.png");
  fireplaceTexture.colorSpace = THREE.SRGBColorSpace;
  const fireplaceArt = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 1.985), new THREE.MeshBasicMaterial({ map: fireplaceTexture, transparent: true, depthWrite: false }));
  fireplaceArt.name = "Villa Diodati fireplace artwork"; fireplaceArt.position.set(0, 1.32, -3.78); fireplaceArt.renderOrder = 3; room.add(fireplaceArt);
  room.userData.occludingDecor.push(fireplaceArt);
  fireLight = new THREE.PointLight(0xff9b43, 3.2, 5); fireLight.position.set(0, .82, -3.15); room.add(fireLight);
  loadFurnitureModel("../furniture/rug-01/rug.glb", "CC0 salon rug", [0, .025, 1.1], 2.65, 0);
  loadFurnitureModel("../furniture/sofa-03/sofa_03.gltf", "ThirdRoom carved sofa", [-3.45, 0, .65], 1.16, 0);
  loadFurnitureModel("../furniture/armchair-01/ArmChair_01.gltf", "ThirdRoom right armchair", [3.45, 0, .35], 1.12, -Math.PI / 2);
  loadFurnitureModel("../furniture/armchair-01/ArmChair_01.gltf", "ThirdRoom second right armchair", [3.45, 0, 1.85], 1.12, -Math.PI / 2);
  loadFurnitureModel("../furniture/armchair-01/ArmChair_01.gltf", "ThirdRoom reading armchair", [-1.95, 0, 1.65], 1.12, Math.PI / 2);
  loadFurnitureModel("../furniture/antique-table-01/table.glb", "antique Chinese tea table", [0, 0, 1.1], 1.35, 0);
  const tableCandelabra = heldProp("candelabra"); tableCandelabra.name = "candelabra on coffee table"; tableCandelabra.position.set(0, .72, 1.35); room.add(tableCandelabra);
  const tableCandleLight = new THREE.PointLight(0xffc77c, 1.15, 2.2); tableCandleLight.position.set(0, 1.18, 1.35); room.add(tableCandleLight); candleLights.push(tableCandleLight);
  lightningLight = new THREE.PointLight(0xb9ddff, 0, 18); lightningLight.position.set(0, 4, 1); scene.add(lightningLight);
}
function updateWallOcclusion() { const walls = room.userData.walls; if (!walls) return; const decor = room.userData.occludingDecor || []; if (topDown) { for (const wall of Object.values(walls)) { wall.material.opacity = 1; wall.material.depthWrite = true; } for (const item of decor) { item.material.transparent = true; item.material.opacity = 1; item.material.depthWrite = true; } return; } const position = activeCamera.position; const near = new Set(); if (position.x > 1.2) near.add("right"); if (position.x < -1.2) near.add("left"); if (position.z < -1.2) near.add("rear"); if (position.z > 1.2) near.add("front"); for (const [name, wall] of Object.entries(walls)) { wall.material.transparent = true; wall.material.opacity = near.has(name) ? .16 : 1; wall.material.depthWrite = !near.has(name); wall.material.needsUpdate = true; } const decorOpacity = near.size ? .16 : 1; for (const item of decor) { item.material.transparent = true; item.material.opacity = decorOpacity; item.material.depthWrite = !near.size; item.material.needsUpdate = true; } }
function setupLighting() {
  scene.add(new THREE.HemisphereLight(0xe6d4c1, 0x241818, 1.8));
  const key = new THREE.DirectionalLight(0xffe0bd, 2.1); key.position.set(-4, 8, 5); key.castShadow = true; scene.add(key);
}
function sheetMaterial(file) {
  if (textureCache.has(file)) return textureCache.get(file);
  const texture = textureLoader.load(`../sprites/dressup-v1/${file}`); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const material = new THREE.ShaderMaterial({ transparent: true, depthTest: true, depthWrite: false, uniforms: { map: { value: texture }, frame: { value: new THREE.Vector2(0, 0) }, coat: { value: new THREE.Color(0xffffff) }, waistcoat: { value: new THREE.Color(0xffffff) }, accent: { value: new THREE.Color(0xffffff) }, skin: { value: new THREE.Color(0xd5a07c) }, ghost: { value: new THREE.Color(0x8fc9ff) }, ghostStrength: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform sampler2D map; uniform vec2 frame; uniform vec3 coat; uniform vec3 waistcoat; uniform vec3 accent; uniform vec3 skin; uniform vec3 ghost; uniform float ghostStrength; varying vec2 vUv; void main(){vec2 cellUv=vec2(vUv.x,vUv.y); vec2 uv=(cellUv+vec2(frame.x,4.0-frame.y))/vec2(8.0,5.0); vec4 c=texture2D(map,uv); float alpha=c.a; if(alpha<.02) discard; float y=fract(cellUv.y); float lower=smoothstep(.18,.42,y)*(1.0-smoothstep(.86,.98,y)); float middle=smoothstep(.38,.58,y)*(1.0-smoothstep(.72,.88,y)); float warmPixels=smoothstep(.08,.28,c.r-c.b); float faceMask=smoothstep(.58,.78,y)*warmPixels; vec3 recolored=mix(c.rgb,coat,.55*lower); recolored=mix(recolored,waistcoat,.42*middle); recolored=mix(recolored,accent,.22*lower); recolored=mix(recolored,skin,.13*faceMask); recolored=mix(recolored,ghost,ghostStrength); gl_FragColor=vec4(recolored,alpha*(1.0-ghostStrength*.42));}` });
  textureCache.set(file, material); return material;
}
function faceMaterial(file) {
  const texture = textureLoader.load(`../sprites/dressup-v1/${file}`); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter;
  return new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { map: { value: texture }, column: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform sampler2D map; uniform float column; varying vec2 vUv; void main(){vec2 uv=(vec2(vUv.x,.08+vUv.y*.84)+vec2(column,4.0))/vec2(8.0,5.0); vec4 c=texture2D(map,uv); if(c.a<.04) discard; gl_FragColor=c;}` });
}
function heldProp(kind) {
  if (!kind) return null;
  const group = new THREE.Group(); group.position.set(.42, -.08, .06); group.renderOrder = 8;
  if (kind === "book") { const book = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, .22), new THREE.MeshStandardMaterial({ color: 0x6c3440, roughness: .6 })); book.rotation.z = -.18; group.add(book); }
  if (kind === "quill") { const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.012, .018, .25, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a36, roughness: .65 })); shaft.rotation.z = -.45; group.add(shaft); const nib = new THREE.Mesh(new THREE.ConeGeometry(.025, .07, 5), new THREE.MeshStandardMaterial({ color: 0xd2b56d, metalness: .5, roughness: .35 })); nib.position.set(.09, -.1, 0); nib.rotation.z = -.45; group.add(nib); }
  if (kind === "cup") { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.065, .055, .13, 12), new THREE.MeshStandardMaterial({ color: 0xd7c39b, roughness: .35 })); cup.rotation.z = -.18; group.add(cup); }
  if (kind === "glass") { const glass = new THREE.Mesh(new THREE.CylinderGeometry(.055, .04, .15, 12), new THREE.MeshPhysicalMaterial({ color: 0xc8e9ed, transparent: true, opacity: .7, roughness: .12, transmission: .2 })); glass.rotation.z = -.12; group.add(glass); }
  if (kind === "candelabra") { const stem = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, .25, 8), new THREE.MeshStandardMaterial({ color: 0xd1aa68, metalness: .5, roughness: .3 })); group.add(stem); for (const offset of [-.07, 0, .07]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .12, 8), stem.material); arm.position.set(offset, .09, 0); group.add(arm); const flame = new THREE.Mesh(new THREE.ConeGeometry(.022, .07, 5), new THREE.MeshBasicMaterial({ color: 0xffd47d })); flame.position.set(offset, .17, 0); group.add(flame); } }
  return group;
}
function setHeldProp(mesh, kind) { if (mesh.userData.heldProp) mesh.remove(mesh.userData.heldProp); mesh.userData.heldProp = heldProp(kind); if (mesh.userData.heldProp) mesh.add(mesh.userData.heldProp); }
function directionFromDelta(dx, dz, fallback = "south") { if (Math.abs(dx) < .015 && Math.abs(dz) < .015) return fallback; const angle = Math.atan2(dx, dz); const index = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8; return ["south", "southeast", "east", "northeast", "north", "northwest", "west", "southwest"][index]; }
function safePosition(x, z, radius = .28) { let safeX = THREE.MathUtils.clamp(x, map.minX + radius, map.maxX - radius); let safeZ = THREE.MathUtils.clamp(z, map.minZ + radius, map.maxZ - radius); for (const obstacle of furnitureObstacles) { if (safeX > obstacle.minX - radius && safeX < obstacle.maxX + radius && safeZ > obstacle.minZ - radius && safeZ < obstacle.maxZ + radius) { const push = [{ axis: "x", value: obstacle.minX - radius, distance: Math.abs(safeX - (obstacle.minX - radius)) }, { axis: "x", value: obstacle.maxX + radius, distance: Math.abs(safeX - (obstacle.maxX + radius)) }, { axis: "z", value: obstacle.minZ - radius, distance: Math.abs(safeZ - (obstacle.minZ - radius)) }, { axis: "z", value: obstacle.maxZ + radius, distance: Math.abs(safeZ - (obstacle.maxZ + radius)) }].sort((a, b) => a.distance - b.distance)[0]; if (push.axis === "x") safeX = push.value; else safeZ = push.value; } } return { x: safeX, z: safeZ }; }
function makeFigure(id, name, style, x, z, state = "idle", index = 0, wardrobe = {}) {
  const material = sheetMaterial(sheetFiles[style] || sheetFiles.byron).clone();
  material.uniforms.coat.value.set(wardrobe.coat || "#ffffff"); material.uniforms.waistcoat.value.set(wardrobe.waistcoat || "#ffffff"); material.uniforms.accent.value.set(wardrobe.accent || "#ffffff"); material.uniforms.skin.value.set(wardrobe.skin || "#d5a07c");
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.7), material); mesh.position.set(x, .82, z); mesh.scale.setScalar(state === "sit" ? .84 : 1); mesh.userData = { id, name, style, state, index, baseY: .82, phase: index * .7, motion: { x, z } }; mesh.castShadow = true; mesh.renderOrder = 5; setHeldProp(mesh, wardrobe.held); mesh.userData.heldKind = wardrobe.held || null;
  if (id.startsWith("a.")) {
    const auraMaterial = material.clone(); auraMaterial.depthTest = true; auraMaterial.uniforms.ghostStrength.value = .22; auraMaterial.uniforms.ghost.value.set(0xb8f3ff);
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(1.51, 1.75), auraMaterial); aura.position.z = -.012; aura.renderOrder = 4; mesh.add(aura); mesh.userData.glowMesh = aura;
  }
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(.58, .58), faceMaterial(sheetFiles[style] || sheetFiles.byron)); marker.rotation.x = -Math.PI / 2; marker.position.set(x, .035, z); marker.renderOrder = 20; marker.userData.figure = mesh; mapMarkers.add(marker); mesh.userData.mapMarker = marker;
  participantLayer.add(mesh); figures.set(id, mesh); return mesh;
}
function stateRow(state, held) { if (held && state !== "sit") return 2; return state === "walk" ? 1 : state === "gesture" || state === "write" ? 2 : state === "sit" ? 3 : state === "speak" ? 4 : 0; }
function directionColumn(direction) { return { south: 0, southwest: 1, west: 2, northwest: 3, north: 4, northeast: 5, east: 6, southeast: 7 }[String(direction || "south").toLowerCase()] ?? 0; }
function updateFigure(mesh, person, now) { const renderState = person.held && person.state !== "sit" ? "gesture" : (person.state || "idle"); const activeHeld = person.state === "write" ? "quill" : person.held; mesh.userData.person = person; if (!person.direction) person.direction = directionFromDelta(person.x - (mesh.userData.lastX ?? person.x), person.z - (mesh.userData.lastZ ?? person.z)); mesh.userData.lastX = person.x; mesh.userData.lastZ = person.z; const safe = safePosition(person.x, person.z, renderState === "sit" ? .2 : .24); mesh.position.x = safe.x; mesh.position.z = safe.z; const demographics = demographicFactors(person); const bodyScale = THREE.MathUtils.clamp((person.scale || 1) * demographics.height, .68, 1.02) * (renderState === "sit" ? .84 : 1); const width = THREE.MathUtils.clamp((person.width || 1) * demographics.weight, .82, 1.05); mesh.position.y = .82 * bodyScale; mesh.userData.baseY = mesh.position.y; mesh.scale.set(width * bodyScale, bodyScale, bodyScale); mesh.userData.state = renderState; const direction = directionColumn(person.direction); const frame = new THREE.Vector2(direction, stateRow(renderState, activeHeld)); const material = mesh.material; material.uniforms.coat.value.set(person.coat || "#ffffff"); material.uniforms.waistcoat.value.set(person.waistcoat || "#ffffff"); material.uniforms.accent.value.set(person.accent || "#ffffff"); material.uniforms.skin.value.set(person.skin || "#d5a07c"); material.uniforms.frame.value.copy(frame); if (mesh.userData.glowMesh) mesh.userData.glowMesh.material.uniforms.frame.value.copy(frame); if (mesh.userData.mapMarker) { mesh.userData.mapMarker.position.set(safe.x, .035, safe.z); mesh.userData.mapMarker.material.uniforms.column.value = direction; } if ((mesh.userData.heldKind || null) !== (activeHeld || null)) { mesh.userData.heldKind = activeHeld || null; setHeldProp(mesh, activeHeld); } }
function syncPeople(people) { const now = clock.elapsedTime; const incoming = new Set(people.map((person) => person.id)); for (const [id, figure] of figures) { if (incoming.has(id)) continue; participantLayer.remove(figure); mapMarkers.remove(figure.userData.mapMarker); figures.delete(id); } for (const person of people) { let figure = figures.get(person.id); if (!figure) figure = makeFigure(person.id, person.name, person.style, person.x, person.z, person.state, figures.size, person); updateFigure(figure, person, now); } }
function defaultState() { const people = defaultPeople.map(([id, name, style, x, z, state, coat, waistcoat, accent, skin, scale, width]) => ({ id, name, style, x, z, state, coat, waistcoat, accent, skin, scale, width })); if (localPlayerEnabled) people.push({ ...localPlayer }); if (demoCrowd) for (let i = people.length; i < 30; i++) { const angle = i * 2.39996; people.push({ id: `demo.guest-${i}`, name: `Guest ${i - 4}`, style: ["byron", "mary", "claire", "percy", "polidori"][i % 5], x: Math.cos(angle) * (1.2 + (i % 4) * .65), z: .8 + Math.sin(angle) * (1.2 + (i % 5) * .42), state: demoSeated && i < demoSeatedLimit ? "sit" : i % 7 === 0 ? "gesture" : i % 3 === 0 ? "walk" : "idle", scale: .72 + (i % 4) * .08, width: .88 + (i % 3) * .08, coat: ["#4e536e", "#85514d", "#526b5b", "#6d5260", "#765f4c"][i % 5], waistcoat: "#9a7a62", accent: "#c29a68", skin: ["#f0c4a0", "#d99b75", "#ae6d4e", "#8e563f"][i % 4] }); } return people; }
function compatibleRoomState(content) { return content?.map === "villa-diodati-salon-v1" && content?.coordinate_system === "villa-diodati-isometric-v1"; }
function applyCinematography(content) { const cue = content?.cinematography; if (!cue || !["wide", "medium", "close", "pan"].includes(cue.shot)) { cinematicCue = null; return; } cinematicCue = { shot: cue.shot, target: cue.target || null, started: clock.elapsedTime, duration: Math.max(1, Math.min(30, Number(cue.duration_ms || 7000) / 1000)), hold: Math.max(0, Math.min(30, Number(cue.hold_ms || 3000) / 1000)) }; setViewMode("cinematic"); }
function mapState(content) { const people = defaultState(); const byId = new Map(people.map((p) => [p.id, p])); for (const [id, p] of Object.entries(content?.positions || {})) { const target = byId.get(id) || byId.get(`a.${id}`); if (target) { Object.assign(target, { x: p.x, z: p.z, direction: p.direction, state: p.animation_state || "idle", held: p.held, talkingTo: p.talking_to, conversationId: p.conversation_id, speechRange: p.speech_range || speechRange, height_cm: p.height_cm, weight_kg: p.weight_kg }); if (p.scale != null) target.scale = p.scale; if (p.weight != null) target.weight = p.weight; if (p.width != null) target.width = p.width; } } for (const [id, p] of Object.entries(content?.participants || {})) { const avatar = content?.avatars?.[id] || {}; byId.set(id, { id, name: p.name || "Guest", style: ["byron","mary","claire","percy","polidori"][byId.size % 5], x: p.x, z: p.z, direction: p.direction, state: p.state || "idle", scale: p.scale, weight: p.weight, width: p.width, height_cm: p.height_cm, weight_kg: p.weight_kg, held: p.held, talkingTo: p.talking_to, conversationId: p.conversation_id, speechRange: p.speech_range || speechRange, skin: avatar.skin ? `#${Number(avatar.skin).toString(16).padStart(6, "0")}` : "#c98768", coat: avatar.coat ? `#${Number(avatar.coat).toString(16).padStart(6, "0")}` : "#6d5260", waistcoat: avatar.waistcoat ? `#${Number(avatar.waistcoat).toString(16).padStart(6, "0")}` : "#a78367", accent: avatar.accent ? `#${Number(avatar.accent).toString(16).padStart(6, "0")}` : "#c29a68" }); } if (localPlayerEnabled) byId.set(localPlayer.id, { ...localPlayer }); return [...byId.values()]; }
let roomState = null;
let matrixToken = null;
let matrixRoomId = null;
let dialogueEvents = [];
let roomHistory = [];
let rewindIndex = -1;
let rewindPlaying = false;
let rewindTimer = null;
const roomHistoryKey = "villa-diodati-room-history-v1";
const dialogueNames = { "a.byron": "Byron", "a.maryshelley": "Mary", "a.clairmont": "Claire", "a.shelley": "Percy", "a.polidori": "Polidori", "a.shelley1": "Percy" };
function speakerId(sender) { return String(sender || "").replace(/^@/, "").split(":")[0]; }
function dialogueText(event) { const body = event?.content?.body; return event?.type === "m.room.message" && event?.content?.msgtype === "m.text" && typeof body === "string" ? body.replace(/\s+/g, " ").trim() : ""; }
function renderDialogue() { const latest = dialogueEvents.at(-1); const latestId = speakerId(latest?.sender); const latestText = dialogueText(latest); const reading = latestId === "a.byron" && (/^📖/.test(latestText) || /from fantasmagoriana/i.test(latestText)); const byron = figures.get("a.byron")?.userData.person; if (byron && reading) { byron.held = "book"; byron.state = "gesture"; } if (!scriptLines) return; scriptLines.replaceChildren(); for (const event of dialogueEvents.slice(-5)) { const line = document.createElement("div"); line.className = "script-line"; const speaker = document.createElement("span"); speaker.className = "script-speaker"; speaker.textContent = dialogueNames[speakerId(event.sender)] || speakerId(event.sender) || "Salon"; const body = document.createElement("span"); body.textContent = dialogueText(event); line.append(speaker, body); scriptLines.append(line); } if (scriptState) scriptState.textContent = dialogueEvents.length ? "Live Matrix dialogue" : "Listening to Matrix…"; }
function renderBubbles() { dialogueLayer?.replaceChildren(); for (const event of dialogueEvents.slice(-3)) { const id = speakerId(event.sender); const figure = figures.get(id); const text = dialogueText(event); if (!figure || !text) continue; const point = figure.position.clone().add(new THREE.Vector3(0, 1.55, 0)).project(activeCamera); const rect = canvas.getBoundingClientRect(); const bubble = document.createElement("div"); bubble.className = "dialogue-bubble"; bubble.style.left = `${rect.left + (point.x + 1) * rect.width / 2}px`; bubble.style.top = `${rect.top + (1 - point.y) * rect.height / 2}px`; const name = document.createElement("strong"); name.textContent = dialogueNames[id] || id; bubble.append(name, document.createTextNode(text.length > 150 ? `${text.slice(0, 147)}…` : text)); dialogueLayer.append(bubble); } }
async function pollDialogue() { try { if (!matrixToken || !matrixRoomId) return; const response = await fetch(`https://matrix.castalia.institute/_matrix/client/v3/rooms/${encodeURIComponent(matrixRoomId)}/messages?dir=b&limit=100`, { headers: { Authorization: `Bearer ${matrixToken}` }, cache: "no-store" }); if (!response.ok) return; const events = (await response.json()).chunk || []; const next = events.filter((event) => dialogueText(event)).reverse().slice(-8); dialogueEvents = next; const snapshots = events.filter((event) => event.type === "org.castalia.salon.room" && event.content).reverse().map((event) => ({ ...historySnapshot(event.content), at: new Date(event.origin_server_ts || Date.now()).toISOString() })); if (snapshots.length) refreshHistory({ ...roomState, history: snapshots }); renderDialogue(); } catch {} }
function historySnapshot(content) { return { at: content?.updatedAt || new Date().toISOString(), positions: content?.positions || {}, participants: content?.participants || {}, avatars: content?.avatars || {}, cinematography: content?.cinematography || null }; }
function refreshHistory(content) { const stored = (() => { try { return JSON.parse(localStorage.getItem(roomHistoryKey) || "[]"); } catch { return []; } })(); const source = Array.isArray(content?.history) ? content.history : stored; const current = historySnapshot(content); const signature = JSON.stringify(current.positions); const merged = [...source, current].filter((item, index, all) => index === 0 || JSON.stringify(item.positions) !== JSON.stringify(all[index - 1].positions)).slice(-120); roomHistory = merged; try { localStorage.setItem(roomHistoryKey, JSON.stringify(roomHistory)); } catch {} if (rewindIndex < 0 || rewindIndex >= roomHistory.length) rewindIndex = -1; if (rewindSlider) { rewindSlider.max = String(Math.max(0, roomHistory.length - 1)); rewindSlider.value = String(rewindIndex < 0 ? Math.max(0, roomHistory.length - 1) : rewindIndex); rewindSlider.disabled = roomHistory.length < 2; } if (rewindLive) rewindLive.disabled = rewindIndex < 0; if (rewindPlay) rewindPlay.disabled = roomHistory.length < 2; if (rewindLabel) rewindLabel.textContent = rewindIndex < 0 ? "Live" : new Date(roomHistory[rewindIndex]?.at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function applyHistorySnapshot(index) { const snapshot = roomHistory[index]; if (!snapshot) return; rewindIndex = index; const content = { ...roomState, ...snapshot }; syncPeople(mapState(content)); applyCinematography(content); if (rewindLabel) rewindLabel.textContent = new Date(snapshot.at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); if (rewindLive) rewindLive.disabled = false; }
rewindSlider?.addEventListener("input", () => { rewindPlaying = false; if (rewindPlay) rewindPlay.textContent = "Play"; applyHistorySnapshot(Number(rewindSlider.value)); }); rewindLive?.addEventListener("click", () => { rewindPlaying = false; if (rewindPlay) rewindPlay.textContent = "Play"; rewindIndex = -1; if (roomState) syncPeople(mapState(roomState)); if (rewindLabel) rewindLabel.textContent = "Live"; rewindLive.disabled = true; }); rewindPlay?.addEventListener("click", () => { if (roomHistory.length < 2) return; if (rewindIndex < 0 || rewindIndex >= roomHistory.length - 1) rewindIndex = 0; rewindPlaying = !rewindPlaying; rewindPlay.textContent = rewindPlaying ? "Pause" : "Play"; if (rewindPlaying) { applyHistorySnapshot(rewindIndex); clearInterval(rewindTimer); rewindTimer = setInterval(() => { if (!rewindPlaying) return; if (rewindIndex >= roomHistory.length - 1) { rewindPlaying = false; rewindPlay.textContent = "Play"; clearInterval(rewindTimer); return; } rewindIndex += 1; if (rewindSlider) rewindSlider.value = String(rewindIndex); applyHistorySnapshot(rewindIndex); }, 900); } else clearInterval(rewindTimer); });
async function pollMatrix() { try { if (!matrixToken) { const reg = await fetch("https://matrix.castalia.institute/_matrix/client/v3/register?kind=guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!reg.ok) throw new Error("guest registration"); matrixToken = (await reg.json()).access_token; } if (!matrixRoomId) { const dir = await fetch("https://matrix.castalia.institute/_matrix/client/v3/directory/room/%23villa-diodati%3Amatrix.castalia.institute", { headers: { Authorization: `Bearer ${matrixToken}` } }); if (!dir.ok) throw new Error("room lookup"); matrixRoomId = (await dir.json()).room_id; } const response = await fetch(`https://matrix.castalia.institute/_matrix/client/v3/rooms/${encodeURIComponent(matrixRoomId)}/state`, { headers: { Authorization: `Bearer ${matrixToken}` }, cache: "no-store" }); if (!response.ok) throw new Error("state fetch"); const event = (await response.json()).find((item) => item.type === "org.castalia.salon.room" && !item.state_key); roomState = compatibleRoomState(event?.content) ? event.content : null; refreshHistory(roomState); const people = mapState(roomState); syncPeople(people); applyCinematography(roomState); status.textContent = roomState ? `Matrix salon · ${people.length} participants` : `Salon preview · ${people.length} participants`; } catch (error) { console.warn("Matrix salon poll failed", error); if (roomState) { const people = mapState(roomState); syncPeople(people); status.textContent = `Matrix salon · ${people.length} participants · reconnecting`; } else { matrixToken = null; matrixRoomId = null; cinematicCue = null; syncPeople(defaultState()); status.textContent = demoCrowd ? "Salon preview · Matrix reconnecting" : "Matrix state unavailable"; } } }
function updatePovCamera() { const angle = { south: 0, southeast: Math.PI / 4, east: Math.PI / 2, northeast: Math.PI * .75, north: Math.PI, northwest: Math.PI * 1.25, west: Math.PI * 1.5, southwest: Math.PI * 1.75 }[localPlayer.direction] ?? 0; const eye = new THREE.Vector3(localPlayer.x, 1.52, localPlayer.z); const look = new THREE.Vector3(localPlayer.x + Math.sin(angle) * 2, 1.42, localPlayer.z + Math.cos(angle) * 2); povCamera.position.copy(eye); povCamera.lookAt(look); povCamera.updateProjectionMatrix(); }
function setViewMode(mode) { pov = mode === "pov"; topDown = mode === "topdown"; cinematic = mode === "cinematic"; participantLayer.visible = !topDown; mapMarkers.visible = topDown; activeCamera = pov ? povCamera : topDown ? mapCamera : cinematic ? cinematicCamera : isoCamera; if (pov) { updatePovCamera(); } else if (topDown) { mapCamera.position.set(0, 14, 0.01); mapCamera.lookAt(0, 0, 0); } else if (cinematic) { cinematicCamera.position.set(0, 4.6, 9); cinematicCamera.lookAt(0, .7, 0); } else { isoCamera.position.set(8, 8, 8); isoCamera.lookAt(0, .8, 0); } const localFigure = figures.get(localPlayer.id); if (localFigure) localFigure.visible = !pov; controls.object = activeCamera; controls.enableRotate = !pov; controls.enablePan = !pov; controls.target.set(0, topDown ? 0 : .8, 0); cameraButton.textContent = cinematic ? "Isometric view" : "Cinematic view"; mapButton.textContent = topDown ? "Room view" : "Top-down map"; povButton.textContent = pov ? "Exit POV" : "POV"; resize(); }
function leaveTopDownForBillboards() { if (!topDown || Math.abs(mapCamera.position.y - 14) < .08) return; topDown = false; cinematic = false; participantLayer.visible = true; mapMarkers.visible = false; activeCamera = mapCamera; controls.object = mapCamera; controls.enableRotate = true; cameraButton.textContent = "Cinematic view"; mapButton.textContent = "Top-down map"; }
function handleCameraChange() { if (pov) return; if (!topDown && activeCamera === isoCamera) { const offset = isoCamera.position.clone().sub(controls.target); const polar = Math.atan2(Math.hypot(offset.x, offset.z), Math.max(.001, offset.y)); if (polar < .3) { setViewMode("topdown"); return; } } leaveTopDownForBillboards(); }
cameraButton.addEventListener("click", () => setViewMode(cinematic ? "isometric" : "cinematic"));
mapButton.addEventListener("click", () => setViewMode(topDown ? "isometric" : "topdown"));
povButton.addEventListener("click", () => setViewMode(pov ? "isometric" : "pov"));
controls.addEventListener("change", handleCameraChange);
function resize() { const rect = canvas.getBoundingClientRect(); const w = Math.max(1, rect.width), h = Math.max(1, rect.height); renderer.setSize(w, h, false); isoCamera.left = -8 * w / h; isoCamera.right = 8 * w / h; isoCamera.top = 5; isoCamera.bottom = -5; isoCamera.updateProjectionMatrix(); mapCamera.left = -8 * w / h; mapCamera.right = 8 * w / h; mapCamera.top = 8; mapCamera.bottom = -8; mapCamera.updateProjectionMatrix(); cinematicCamera.aspect = w / h; cinematicCamera.updateProjectionMatrix(); povCamera.aspect = w / h; povCamera.updateProjectionMatrix(); }
function refreshConversations(now) { const active = [...figures.values()].map((figure) => figure.userData.person).filter((person) => person && person.id !== localPlayer.id); for (const person of active) { if (person.talkingTo) continue; const candidates = active.filter((other) => other.id !== person.id && Math.hypot(other.x - person.x, other.z - person.z) <= (person.speechRange || speechRange)); const target = candidates.sort((a, b) => Math.hypot(a.x - person.x, a.z - person.z) - Math.hypot(b.x - person.x, b.z - person.z))[0]; if (!target) continue; const exchange = Math.floor(now / 11 + (figures.get(person.id)?.userData.phase || 0)) % 5; if (exchange < 3) { person.talkingTo = target.id; person.conversationId = person.conversationId || `local-${Math.floor(now / 11)}`; if (exchange === 0 || exchange === 1) { person.state = "speak"; person.direction = directionFromDelta(target.x - person.x, target.z - person.z, person.direction); } } else { person.talkingTo = null; person.conversationId = null; } } }
function updateCinematicShot(now) { if (!cinematicCue || !cinematic) return; const elapsed = now - cinematicCue.started; if (elapsed > cinematicCue.duration + cinematicCue.hold) { cinematicCue = null; setViewMode("isometric"); return; } const targetFigure = cinematicCue.target ? figures.get(cinematicCue.target) : null; const target = targetFigure ? targetFigure.position : new THREE.Vector3(0, .8, 0); const distance = cinematicCue.shot === "close" ? 3.2 : cinematicCue.shot === "medium" ? 5.2 : 8.8; const side = cinematicCue.shot === "pan" ? Math.sin(elapsed * .35) * 2.2 : 0; const desired = new THREE.Vector3(target.x + side, target.y + (cinematicCue.shot === "close" ? .35 : 1.8), target.z + distance); cinematicCamera.position.lerp(desired, .045); cinematicCamera.lookAt(target.x, target.y + (cinematicCue.shot === "close" ? .25 : .55), target.z); cinematicCamera.fov = cinematicCue.shot === "close" ? 28 : cinematicCue.shot === "medium" ? 34 : 40; cinematicCamera.updateProjectionMatrix(); }
function updateLocalPlayer(now) { if (!localPlayerEnabled) return; const keyHorizontal = (pressedKeys.has("d") || pressedKeys.has("arrowright") ? 1 : 0) - (pressedKeys.has("a") || pressedKeys.has("arrowleft") ? 1 : 0); const keyVertical = (pressedKeys.has("s") || pressedKeys.has("arrowdown") ? 1 : 0) - (pressedKeys.has("w") || pressedKeys.has("arrowup") ? 1 : 0); const targetDx = walkTarget ? walkTarget.x - localPlayer.x : 0; const targetDz = walkTarget ? walkTarget.z - localPlayer.z : 0; const targetDistance = Math.hypot(targetDx, targetDz); if (walkTarget && targetDistance < .07) walkTarget = null; const horizontal = keyHorizontal || (walkTarget ? targetDx / Math.max(targetDistance, .001) : 0); const vertical = keyVertical || (walkTarget ? targetDz / Math.max(targetDistance, .001) : 0); const moving = horizontal !== 0 || vertical !== 0; if (moving) { const length = Math.hypot(horizontal, vertical) || 1; const nextX = localPlayer.x + (horizontal / length) * .045; const nextZ = localPlayer.z + (vertical / length) * .045; const safe = safePosition(nextX, nextZ, .22); localPlayer.x = safe.x; localPlayer.z = safe.z; localPlayer.direction = directionFromDelta(horizontal, vertical, localPlayer.direction); localPlayer.state = "walk"; } else localPlayer.state = Math.floor(now / 5) % 4 === 0 ? "gesture" : "idle"; const localFigure = figures.get(localPlayer.id); if (localFigure?.userData.person) Object.assign(localFigure.userData.person, localPlayer); const nearby = [...figures.values()].map((figure) => figure.userData.person).filter((person) => person && person.id !== localPlayer.id && Math.hypot(person.x - localPlayer.x, person.z - localPlayer.z) <= localHearingRange); const source = roomState ? `Matrix salon · ${figures.size} participants` : demoCrowd ? `Salon preview · ${peopleCountForStatus()} participants` : "Matrix state unavailable"; status.textContent = `${source}${nearby.length ? ` · hearing ${nearby.length}` : ""}`; }
function peopleCountForStatus() { return figures.size; }
buildRoom(); setupLighting(); isoCamera.position.set(8, 8, 8); mapCamera.position.set(0, 14, 0.01); mapCamera.lookAt(0, 0, 0); cinematicCamera.position.set(0, 4.6, 9); cinematicCamera.lookAt(0, .7, 0); setViewMode(topDown ? "topdown" : "isometric"); addEventListener("resize", resize); syncPeople(defaultState()); pollMatrix(); setInterval(pollMatrix, 2500); setInterval(pollDialogue, 4000); setInterval(() => { if (rewindIndex >= 0) applyHistorySnapshot(rewindIndex); }, 2500);
function animate() { requestAnimationFrame(animate); const now = clock.elapsedTime; if (fireLight) fireLight.intensity = 3.5 + Math.sin(now * 7.1) * .45 + Math.sin(now * 11.7) * .25; flames.forEach((flame, index) => { const pulse = 1 + Math.sin(now * (5 + index) + index) * .08; flame.scale.set(pulse, 1 + Math.sin(now * 8 + index) * .12, pulse); }); candleLights.forEach((light, index) => { light.intensity = 1.05 + Math.sin(now * 6 + index * 1.9) * .18; }); if (lightningLight) { const flash = Math.max(0, Math.sin(now * .19 + 2.4) - .995) * 140; lightningLight.intensity = flash; } updateLocalPlayer(now); if (pov) updatePovCamera(); participantLayer.children.forEach((figure) => { const person = figure.userData.person; if (person && person.id !== localPlayer.id && demoCrowd && !roomState && person.state !== "sit") { const motion = figure.userData.motion; const phase = figure.userData.phase; const previousX = person.x; const previousZ = person.z; person.x = motion.x + Math.sin(now * (.16 + (figure.userData.index % 3) * .025) + phase) * .7; person.z = motion.z + Math.cos(now * (.13 + (figure.userData.index % 4) * .02) + phase) * .42; person.direction = directionFromDelta(person.x - previousX, person.z - previousZ, person.direction); person.state = Math.floor(now / 8 + phase) % 5 === 0 ? "speak" : Math.floor(now / 5 + phase) % 4 === 0 ? "gesture" : Math.floor(now / 3 + phase) % 3 === 0 ? "walk" : "idle"; updateFigure(figure, person, now); } if (!pov) figure.lookAt(activeCamera.position.x, figure.position.y, activeCamera.position.z); }); if (demoCrowd && !roomState) refreshConversations(now); updateCinematicShot(now); controls.update(); updateWallOcclusion(); renderBubbles(); renderer.render(scene, activeCamera); }
animate();
