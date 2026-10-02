import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#room");
const status = document.querySelector("#status");
const cameraButton = document.querySelector("#camera");
const mapButton = document.querySelector("#map-view");
const povButton = document.querySelector("#pov-view");
const floorButton = document.querySelector("#floor-view");
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
const mapCamera = new THREE.OrthographicCamera(-18, 18, 28, -28, .1, 100);
const povCamera = new THREE.PerspectiveCamera(68, 1, .05, 100);
let activeCamera = isoCamera;
let cinematic = false;
let topDown = new URLSearchParams(location.search).get("map") === "topdown";
let pov = false;
const controls = new OrbitControls(activeCamera, canvas);
controls.enablePan = true; controls.enableDamping = true; controls.dampingFactor = .08;
controls.minZoom = .72; controls.maxZoom = 2.15; controls.minDistance = 3.2; controls.maxDistance = 16;
controls.target.set(0, 0.8, 0);

const map = { minX: -18, maxX: 18, minZ: -10, maxZ: 32 };
let roomRegions = [];
let navigationRooms = [];
let walkRoute = [];
let currentRoomId = "";
const stair = { x: 0, z: -5 };
const requestedRoom = new URLSearchParams(location.search).get("room");
function focusHouseLocation(x, z, floor) { const y = [-3.64, 0, 3.96, 7.76][Math.max(0, Math.min(3, Number(floor) || 1))]; controls.target.set(x, y + .8, z); if (topDown) { mapCamera.position.set(x, 24, z + 11); mapCamera.lookAt(x, 0, z); } else { isoCamera.position.set(x + 8, y + 8, z + 8); isoCamera.lookAt(x, y + .8, z); } }
fetch("../isometric-map.json", { cache: "no-cache" }).then((response) => response.ok ? response.json() : null).then((contract) => {
  if (contract?.coordinateSystem === "villa-diodati-isometric-v1") { Object.assign(map, contract.bounds || {}); roomRegions = (contract.rooms || []).filter((candidate) => Number.isFinite(candidate.x) && Number.isFinite(candidate.z) && Number.isFinite(candidate.width) && Number.isFinite(candidate.depth)).map((candidate) => ({ floor: Number(candidate.floor), minX: Number(candidate.x) - Number(candidate.width) / 2, maxX: Number(candidate.x) + Number(candidate.width) / 2, minZ: Number(candidate.z) - Number(candidate.depth) / 2, maxZ: Number(candidate.z) + Number(candidate.depth) / 2 })); const transition = contract.floorTransitions?.find((candidate) => candidate.id === "central-stair"); if (transition) { stair.x = Number(transition.x); stair.z = Number(transition.z); } const destination = requestedRoom ? contract.rooms?.find((room) => room.id === requestedRoom) : null; if (destination && localPlayerEnabled) { localPlayer.x = Number(destination.x); localPlayer.z = Number(destination.z); localPlayer.floor = Number(destination.floor); walkTarget = null; setFloorLevel(localPlayer.floor); focusHouseLocation(localPlayer.x, localPlayer.z, localPlayer.floor); const figure = figures.get(localPlayer.id); if (figure) updateFigure(figure, localPlayer, clock.elapsedTime); } }
}).catch(() => {});
fetch("../isometric-map.json", { cache: "no-cache" }).then((response) => response.ok ? response.json() : null).then((contract) => { navigationRooms = contract?.rooms || []; }).catch(() => {});
setInterval(updateRoomScope, 200);
const room = new THREE.Group(); scene.add(room);
const exteriorLayer = new THREE.Group(); exteriorLayer.visible = false; exteriorLayer.name = "Villa Diodati exterior"; scene.add(exteriorLayer);
const participantLayer = new THREE.Group(); scene.add(participantLayer);
const mapMarkers = new THREE.Group(); mapMarkers.visible = false; scene.add(mapMarkers);
const lowerFloor = new THREE.Group(); lowerFloor.visible = false; scene.add(lowerFloor);
const upperFloors = [new THREE.Group(), new THREE.Group()]; upperFloors.forEach((layer) => { layer.visible = false; scene.add(layer); });
const floorQuery = new URLSearchParams(location.search).get("floor");
const requestedFloor = floorQuery === null || floorQuery === "" ? NaN : Number(floorQuery);
let floorLevel = Number.isInteger(requestedFloor) && requestedFloor >= 0 && requestedFloor <= 3 ? requestedFloor : 1;
const defaultSalonFloor = 1;
if (!Number.isInteger(requestedFloor)) floorLevel = defaultSalonFloor;
const clock = new THREE.Clock();
const figures = new Map();
// Dressable avatar contract: every source sheet uses the same safe frame and
// bottom-center floor anchor. Clothing/skin changes must never change this
// placement, which prevents the recurring cropped-head and floating-feet bugs.
const DRESSUP_ATLAS = { columns: 8, rows: 5, safeInset: { left: .04, right: .04, top: .04, bottom: .08 }, anchorY: .92 };
const textureCache = new Map();
let fireLight;
let lightningLight;
let cinematicCue = null;
let cinematicSpeakerId = null;
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
const localPlayer = { id: "player.local", name: "You", style: "mary", x: 0, z: 3.2, state: "idle", floor: floorLevel, direction: "north", coat: "#526b5b", waistcoat: "#e9dfc8", accent: "#b58b59", skin: "#c98768", scale: .9, width: .92, speechRange: localHearingRange };
const pressedKeys = new Set();
let walkTarget = null;
let lastFloorChange = -10;
const tapRaycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function changeFloor(now = clock.elapsedTime) { if (now - lastFloorChange < 1.2) return false; const nextFloor = floorLevel >= 3 ? 0 : floorLevel + 1; lastFloorChange = now; localPlayer.floor = nextFloor; localPlayer.z = stair.z + 1.0; walkRoute = []; setFloorLevel(nextFloor); focusHouseLocation(stair.x, localPlayer.z, nextFloor); return true; }
function roomAtPoint(x, z) { return navigationRooms.find((room) => Number(room.floor) === floorLevel && x >= Number(room.x) - Number(room.width) / 2 && x <= Number(room.x) + Number(room.width) / 2 && z >= Number(room.z) - Number(room.depth) / 2 && z <= Number(room.z) + Number(room.depth) / 2) || null; }
function updateRoomScope() { if (topDown || pov || !navigationRooms.length) return; const current = roomAtPoint(localPlayer.x, localPlayer.z); if (!current) return; const outdoors = new Set(["terrace", "garden", "vineyard", "orchard", "shore", "lake"]); const outside = outdoors.has(current.id); exteriorLayer.visible = outside; for (const wall of Object.values(room.userData.walls || {})) wall.visible = !outside; for (const item of room.userData.occludingDecor || []) item.visible = !outside; if (current.id !== currentRoomId) { currentRoomId = current.id; const targetZ = outside ? 5.0 : Number(current.z); const targetY = outside ? 2.3 : [-3.64, 0, 3.96, 7.76][floorLevel] + .8; const cameraZ = outside ? Math.max(Number(current.z) + 9, 17) : Number(current.z) + 7; controls.target.set(0, targetY, targetZ); isoCamera.position.set(8, outside ? 9.0 : [-3.64, 0, 3.96, 7.76][floorLevel] + 6.8, cameraZ); isoCamera.lookAt(0, targetY, targetZ); } for (const figure of figures.values()) { const person = figure.userData.person; if (!person) continue; figure.visible = Number(person.floor ?? 1) === floorLevel; } }
function roomWaypoints(origin, destination) { if (!origin || !destination || origin.id === destination.id || Number(origin.floor) !== Number(destination.floor)) return []; const rooms = new Map(navigationRooms.filter((room) => Number(room.floor) === floorLevel).map((room) => [room.id, room])); const previous = new Map([[origin.id, null]]); const queue = [origin.id]; while (queue.length) { const id = queue.shift(); if (id === destination.id) break; for (const next of rooms.get(id)?.connections || []) if (rooms.has(next) && !previous.has(next)) { previous.set(next, id); queue.push(next); } } if (!previous.has(destination.id)) return []; const ids = []; for (let id = destination.id; id && id !== origin.id; id = previous.get(id)) ids.unshift(id); return ids.map((id) => { const room = rooms.get(id); return safePosition(Number(room.x), Number(room.z), .22); }); }
canvas.addEventListener("pointerup", (event) => { if (!localPlayerEnabled || event.button !== 0) return; const rect = canvas.getBoundingClientRect(); const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); tapRaycaster.setFromCamera(pointer, activeCamera); const point = new THREE.Vector3(); if (!tapRaycaster.ray.intersectPlane(floorPlane, point)) return; const safe = safePosition(point.x, point.z, .22); if (Math.hypot(point.x - stair.x, point.z - stair.z) < 1.7) changeFloor(); walkTarget = { x: safe.x, z: safe.z }; });
canvas.addEventListener("pointerup", (event) => { if (!localPlayerEnabled || event.button !== 0 || !navigationRooms.length) return; const rect = canvas.getBoundingClientRect(); const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); tapRaycaster.setFromCamera(pointer, activeCamera); const point = new THREE.Vector3(); if (!tapRaycaster.ray.intersectPlane(floorPlane, point)) return; const destination = roomAtPoint(point.x, point.z); const origin = roomAtPoint(localPlayer.x, localPlayer.z); const route = roomWaypoints(origin, destination); if (route.length) { walkRoute = route.slice(1); walkTarget = route[0]; } });
setInterval(() => { if (walkRoute.length && (!walkTarget || Math.hypot(localPlayer.x - walkTarget.x, localPlayer.z - walkTarget.z) < .12)) walkTarget = walkRoute.shift(); }, 100);
addEventListener("keydown", (event) => { if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(event.key)) return; pressedKeys.add(event.key.toLowerCase()); event.preventDefault(); });
addEventListener("keyup", (event) => pressedKeys.delete(event.key.toLowerCase()));
addEventListener("keydown", (event) => { if (event.key.toLowerCase() !== "f") return; if (Math.hypot(localPlayer.x - stair.x, localPlayer.z - stair.z) < 1.7) changeFloor(); });
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
function loadFurnitureModel(path, name, position, scale, rotation = 0) { gltfLoader.load(path, (gltf) => { const model = gltf.scene; model.name = name; model.position.set(...position); model.scale.setScalar(scale); model.rotation.y = rotation; model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; if (name === "CC0 salon rug" && node.material?.color) node.material.color.set(0x70454b); } }); room.add(model); }); }
function addStairFlight(layer, baseY, name) {
  const stairMat = mat(0x806445);
  for (let step = 0; step < 6; step++) {
    const tread = new THREE.Mesh(new THREE.BoxGeometry(2.1, .12 + step * .02, .42), stairMat);
    tread.name = `${name} stair ${step + 1}`;
    tread.position.set(0, baseY + step * .18, -5.65 + step * .42);
    tread.castShadow = true; tread.receiveShadow = true; layer.add(tread);
  }
  const landing = new THREE.Mesh(new THREE.BoxGeometry(2.7, .12, .9), stairMat);
  landing.name = `${name} stair landing`; landing.position.set(0, baseY + 1.08, -3.95); landing.castShadow = true; landing.receiveShadow = true; layer.add(landing);
}
function buildLowerFloor() {
  const floorMat = mat(0x6c5542); const wallMat = mat(0x49362d);
  const room = (name, x, z, width, depth) => { const floor = new THREE.Mesh(new THREE.BoxGeometry(width, .12, depth), floorMat); floor.name = `${name} floor`; floor.position.set(x, -3.7, z); lowerFloor.add(floor); const gap = Math.min(1.15, width - .4); const sideGap = Math.min(1.15, depth - .4); const horizontal = (centerX, centerZ) => { const segment = (width - gap) / 2; for (const offset of [-(gap + segment) / 2, (gap + segment) / 2]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(segment, .82, .12), wallMat); wall.name = `${name} wall`; wall.position.set(centerX + offset, -3.29, centerZ); lowerFloor.add(wall); } }; const vertical = (centerX, centerZ) => { const segment = (depth - sideGap) / 2; for (const offset of [-(sideGap + segment) / 2, (sideGap + segment) / 2]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(.12, .82, segment), wallMat); wall.name = `${name} wall`; wall.position.set(centerX, -3.29, centerZ + offset); lowerFloor.add(wall); } }; horizontal(x, z - depth / 2); horizontal(x, z + depth / 2); vertical(x - width / 2, z); vertical(x + width / 2, z); };
  room("entrance hall", 0, -.8, 5.85, 5.5); room("kitchen", -6.075, -.8, 6.35, 5.5); room("pantry", -10.5, -.8, 2.5, 5.5); room("servants hall", 6.075, -.8, 6.35, 5.5); room("storage and cellar", 10.5, -.8, 2.5, 5.5); room("wine cellar", -5.5, -5.5, 5.5, 2.8); room("stores", 5.5, -5.5, 5.5, 2.8);
  addStairFlight(lowerFloor, -3.68, "ground floor");
  for (const x of [-7.3, -5.5, -3.7]) { const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, .65, .55), mat(0x5b3828)); counter.position.set(x, -3.2, -.8); lowerFloor.add(counter); }
  const lowerProp = (name, size, position, color = 0x5b3828) => { const prop = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color)); prop.name = name; prop.position.set(...position); prop.castShadow = true; prop.receiveShadow = true; lowerFloor.add(prop); return prop; };
  lowerProp("kitchen work island", [2.3, .72, .72], [-6.2, -3.18, .7]);
  lowerProp("kitchen hearth", [1.1, .9, .38], [-7.9, -3.1, -3.0], 0x3b2924);
  for (const z of [-2.0, -.6, .8, 2.2]) lowerProp("pantry shelf", [1.9, .12, .34], [-10.5, -2.95, z], 0x704b35);
  lowerProp("servants hall table", [2.2, .12, .85], [6.2, -2.78, -.8]);
  for (const x of [5.3, 7.1]) lowerProp("servants hall bench", [.42, .42, 1.7], [x, -3.28, -.8], 0x6b4937);
  for (const x of [-6.35, -4.65, 4.65, 6.35, 10.5]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.32, .36, .7, 12), mat(0x62402e)); barrel.name = "cellar barrel"; barrel.rotation.z = Math.PI / 2; barrel.position.set(x, -3.22, -5.5); barrel.castShadow = true; lowerFloor.add(barrel);
  }
}
function buildUpperFloors() {
  const floorMat = mat(0x8b725a);
  const wallMat = mat(0x5b4035);
  const addRoom = (layer, name, x, z, width, depth) => {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, .12, depth), floorMat); floor.name = `${name} floor`; floor.position.set(x, layer === upperFloors[0] ? 3.9 : 7.7, z); layer.add(floor);
    const gap = Math.min(1.15, width - .4); const sideGap = Math.min(1.15, depth - .4); const horizontal = (centerX, centerZ) => { const segment = (width - gap) / 2; for (const offset of [-(gap + segment) / 2, (gap + segment) / 2]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(segment, .82, .12), wallMat); wall.name = `${name} wall`; wall.position.set(centerX + offset, floor.position.y + .41, centerZ); layer.add(wall); } }; const vertical = (centerX, centerZ) => { const segment = (depth - sideGap) / 2; for (const offset of [-(sideGap + segment) / 2, (sideGap + segment) / 2]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(.12, .82, segment), wallMat); wall.name = `${name} wall`; wall.position.set(centerX, floor.position.y + .41, centerZ + offset); layer.add(wall); } }; horizontal(x, z - depth / 2); horizontal(x, z + depth / 2); vertical(x - width / 2, z); vertical(x + width / 2, z);
  };
  addRoom(upperFloors[0], "Byron bedroom", -5.3, -1.4, 5.1, 4.6);
  addRoom(upperFloors[0], "Polidori bedroom", 5.3, -1.4, 5.1, 4.6);
  addRoom(upperFloors[0], "guest chamber west", -5.3, 3.0, 5.1, 3.2);
  addRoom(upperFloors[0], "guest chamber east", 5.3, 3.0, 5.1, 3.2);
  addRoom(upperFloors[1], "servants room west", -5.0, -.4, 5.6, 5.8);
  addRoom(upperFloors[1], "servants room east", 5.0, -.4, 5.6, 5.8);
  addRoom(upperFloors[1], "upper landing", 0, 3.2, 4.2, 3.0);
  const addUpperProp = (layer, name, x, z, width, height, depth, color) => { const prop = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(color)); prop.name = name; prop.position.set(x, layer === upperFloors[0] ? 4.25 : 8.05, z); prop.castShadow = true; layer.add(prop); return prop; };
  for (const [x, z] of [[-6.1, -1.5], [-4.5, -1.5], [4.5, -1.5], [6.1, -1.5], [-6.1, 3.0], [4.8, 3.0]]) {
    addUpperProp(upperFloors[0], "upper floor bed", x, z, 1.25, .22, 2.0, 0x6a493b);
    addUpperProp(upperFloors[0], "upper floor writing desk", x + .7, z + .85, .7, .5, .42, 0x5b3828);
    addUpperProp(upperFloors[0], "upper floor bedside table", x - .82, z - .55, .36, .42, .36, 0x5b3828);
  }
  for (const x of [-6.2, 6.2]) { addUpperProp(upperFloors[1], "servants room bed", x, -.4, 1.1, .22, 1.8, 0x6a493b); addUpperProp(upperFloors[1], "servants room chest", x + (x < 0 ? .95 : -.95), -.4, .6, .45, .8, 0x5b3828); }
  for (const x of [-1.2, 1.2]) addUpperProp(upperFloors[1], "attic landing trunk", x, 3.0, .7, .42, .5, 0x5b3828);
  for (const layer of upperFloors) {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.2, .18, 2.2), mat(0x806445)); shaft.name = "stair landing opening"; shaft.position.set(0, layer === upperFloors[0] ? 3.98 : 7.78, -1.9); layer.add(shaft);
  }
  addStairFlight(upperFloors[0], 3.92, "upper floor");
  addStairFlight(upperFloors[1], 7.72, "attic floor");
  for (const z of [2.2, 2.8, 3.4]) addUpperProp(upperFloors[1], "attic storage chest", 0, z, 1.4, .42, .65, 0x5b3828);
}
function setFloorLevel(level) { floorLevel = Number(level); room.visible = floorLevel === 1; lowerFloor.visible = floorLevel === 0; upperFloors.forEach((layer, index) => { layer.visible = floorLevel === index + 2; }); for (const figure of figures.values()) { const person = figure.userData.person; if (person) figure.visible = Number(person.floor ?? 1) === floorLevel && (!pov || person.id === localPlayer.id); } if (floorButton) floorButton.textContent = floorLevel === 0 ? "Ground floor" : `Floor ${floorLevel}`; }
function buildExterior() { const exteriorMat = mat(0xd8e4e3); const trimMat = mat(0xf4f0e6); const roofMat = mat(0x594b46); const glassMat = new THREE.MeshStandardMaterial({ color: 0x7ea7b5, transparent: true, opacity: .62, roughness: .18 }); const add = (geometry, material, position, name) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; exteriorLayer.add(mesh); return mesh; }; add(new THREE.BoxGeometry(14.8, 4.0, .42), exteriorMat, [0, 2.05, 4.72], "villa exterior facade"); add(new THREE.BoxGeometry(16.2, .3, 3.3), roofMat, [0, 4.25, 4.72], "villa exterior roof"); add(new THREE.BoxGeometry(15.6, .18, .5), trimMat, [0, 4.05, 4.45], "villa exterior cornice"); for (const x of [-6.2, -3.8, 3.8, 6.2]) { add(new THREE.BoxGeometry(1.75, 2.35, .06), glassMat, [x, 2.35, 4.46], "villa exterior window"); add(new THREE.BoxGeometry(.08, 2.48, .12), trimMat, [x - .87, 2.35, 4.4], "villa exterior window trim"); add(new THREE.BoxGeometry(.08, 2.48, .12), trimMat, [x + .87, 2.35, 4.4], "villa exterior window trim"); add(new THREE.BoxGeometry(1.9, .1, .16), trimMat, [x, 1.14, 4.38], "villa exterior window sill"); } add(new THREE.BoxGeometry(2.4, 2.85, .12), mat(0x5a3b2f), [0, 1.46, 4.4], "villa exterior entrance door"); for (const x of [-5.8, -4.35, -2.9, 2.9, 4.35, 5.8]) add(new THREE.CylinderGeometry(.16, .2, 2.7, 12), trimMat, [x, 1.35, 5.45], "villa veranda column"); add(new THREE.BoxGeometry(15.8, .18, 2.7), trimMat, [0, 2.72, 5.45], "villa veranda entablature"); }
function buildVillaSilhouette() { const wall = mat(0xb9d0d3); const trim = mat(0xf5f0e6); const roof = mat(0x4a403e); const chimney = mat(0x80665b); const glass = new THREE.MeshStandardMaterial({ color: 0x7899a3, transparent: true, opacity: .72, roughness: .2 }); const wood = mat(0x6c4938); const add = (geometry, material, position, name) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; exteriorLayer.add(mesh); return mesh; }; for (const [y, height] of [[1.2, 2.4], [3.45, 2.0], [5.25, 1.55]]) add(new THREE.BoxGeometry(15.2, height, .5), wall, [0, y, 4.62], "Villa Diodati exterior storey"); add(new THREE.BoxGeometry(17.0, .28, 3.0), roof, [0, 6.55, 4.62], "Villa Diodati hipped roof"); add(new THREE.ConeGeometry(8.8, 2.5, 4), roof, [0, 7.55, 4.62], "Villa Diodati roof ridge").rotation.y = Math.PI / 4; add(new THREE.BoxGeometry(7.0, .24, 2.4), trim, [0, 3.15, 5.1], "Villa Diodati balcony deck"); add(new THREE.BoxGeometry(7.2, .65, .12), trim, [0, 3.62, 5.42], "Villa Diodati balcony rail"); for (const x of [-3.1, -1.55, 1.55, 3.1]) add(new THREE.CylinderGeometry(.14, .19, 3.25, 12), trim, [x, 1.62, 5.48], "Villa Diodati portico column"); add(new THREE.BoxGeometry(7.6, .2, 2.8), trim, [0, 3.02, 5.48], "Villa Diodati portico entablature"); add(new THREE.BoxGeometry(1.65, 2.55, .12), wood, [0, 1.28, 4.3], "Villa Diodati entrance door"); for (const y of [1.25, 3.45, 5.25]) for (const x of [-6.1, -4.45, 4.45, 6.1]) { add(new THREE.BoxGeometry(1.05, 1.45, .08), glass, [x, y, 4.3], "Villa Diodati tall window"); add(new THREE.BoxGeometry(1.18, .08, .14), trim, [x, y - .78, 4.24], "Villa Diodati window sill"); } const chimneyX = -5.275; add(new THREE.BoxGeometry(1.05, 3.7, .7), chimney, [chimneyX, 3.0, 4.18], "Villa Diodati chimney breast"); add(new THREE.BoxGeometry(1.15, 2.0, .8), chimney, [chimneyX, 7.25, 4.18], "Villa Diodati chimney stack"); add(new THREE.BoxGeometry(1.35, .16, .95), trim, [chimneyX, 8.28, 4.18], "Villa Diodati chimney cap"); }
function buildSquareVillaExterior() { exteriorLayer.clear(); const wall = mat(0xb9d0d3); const trim = mat(0xf5f0e6); const roof = mat(0x4a403e); const glass = new THREE.MeshStandardMaterial({ color: 0x7899a3, transparent: true, opacity: .72, roughness: .2 }); const add = (geometry, material, position, name, rotation = 0) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.rotation.y = rotation; mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; exteriorLayer.add(mesh); return mesh; }; for (const [y, height] of [[1.2, 2.4], [3.45, 2.0], [5.25, 1.55]]) { add(new THREE.BoxGeometry(11.8, height, .5), wall, [0, y, 4.62], "square villa facade"); add(new THREE.BoxGeometry(.5, height, 10.8), wall, [-5.65, y, .05], "square villa west side"); add(new THREE.BoxGeometry(.5, height, 10.8), wall, [5.65, y, .05], "square villa east side"); } add(new THREE.BoxGeometry(13.0, .28, 10.0), roof, [0, 6.55, .05], "square villa hipped roof"); add(new THREE.BoxGeometry(7.0, .24, 2.4), trim, [0, 3.15, 5.1], "square villa balcony deck"); for (const x of [-3.1, -1.55, 1.55, 3.1]) add(new THREE.CylinderGeometry(.14, .19, 3.25, 12), trim, [x, 1.62, 5.48], "square villa portico column"); for (const x of [-4.1, 0, 4.1]) { for (const y of [1.25, 3.45, 5.25]) { add(new THREE.BoxGeometry(1.15, 1.45, .08), glass, [x, y, 4.3], "square villa front window"); add(new THREE.BoxGeometry(1.28, .08, .14), trim, [x, y - .78, 4.24], "square villa front sill"); } } for (const z of [.55, 3.0, 5.45]) { add(new THREE.BoxGeometry(1.15, 1.45, .08), glass, [-5.36, 3.45, z], "square villa side window", Math.PI / 2); add(new THREE.BoxGeometry(1.15, 1.45, .08), glass, [5.36, 3.45, z], "square villa side window", Math.PI / 2); } add(new THREE.BoxGeometry(1.65, 2.55, .12), mat(0x6c4938), [0, 1.28, 4.3], "square villa entrance"); }
function addSquareChimney() { const chimney = mat(0x80665b); const cap = mat(0xf5f0e6); const breast = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.7, .7), chimney); breast.position.set(-4.1, 3.0, 4.18); exteriorLayer.add(breast); const stack = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.0, .8), chimney); stack.position.set(-4.1, 7.25, 4.18); exteriorLayer.add(stack); const top = new THREE.Mesh(new THREE.BoxGeometry(1.35, .16, .95), cap); top.position.set(-4.1, 8.28, 4.18); exteriorLayer.add(top); }
function addFrontEntranceDetails() { const stone = mat(0xb3aaa0); const shutter = mat(0x2f665f); const lamp = mat(0x252321); const add = (geometry, material, position, name) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.name = name; mesh.castShadow = true; exteriorLayer.add(mesh); return mesh; }; add(new THREE.BoxGeometry(2.35, .18, .16), stone, [0, 2.55, 4.12], "arched entrance lintel"); add(new THREE.BoxGeometry(.18, 1.25, .16), stone, [-1.08, 1.8, 4.12], "entrance stone jamb"); add(new THREE.BoxGeometry(.18, 1.25, .16), stone, [1.08, 1.8, 4.12], "entrance stone jamb"); add(new THREE.TorusGeometry(.86, .1, 8, 24, Math.PI), stone, [0, 2.48, 4.1], "arched entrance surround").rotation.z = Math.PI; for (const x of [-.92, .92]) { add(new THREE.BoxGeometry(.22, 1.45, .1), shutter, [x, 5.25, 4.12], "upper center green shutter"); add(new THREE.BoxGeometry(.22, 1.45, .1), shutter, [x, 1.25, 4.12], "entrance-side green shutter"); } for (const x of [-1.5, 1.5]) add(new THREE.BoxGeometry(.12, .52, .12), lamp, [x, 1.72, 4.02], "front entrance wall lamp"); }
function addWestElevationDetails() { const shutter = mat(0x2f665f); const stone = mat(0x9b9387); const glass = new THREE.MeshStandardMaterial({ color: 0x7899a3, transparent: true, opacity: .72, roughness: .2 }); const add = (geometry, material, position, name) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.name = name; mesh.castShadow = true; exteriorLayer.add(mesh); return mesh; }; for (const y of [1.25, 3.45, 5.25]) for (const z of [.7, 3.0, 5.3]) { add(new THREE.BoxGeometry(.08, 1.35, 1.05), glass, [-5.94, y, z], "west elevation window"); add(new THREE.BoxGeometry(.1, 1.45, .2), shutter, [-6.0, y, z - .7], "west elevation shutter"); add(new THREE.BoxGeometry(.1, 1.45, .2), shutter, [-6.0, y, z + .7], "west elevation shutter"); } add(new THREE.BoxGeometry(.08, 2.25, 1.45), glass, [-5.94, 2.35, 1.65], "west veranda French door"); add(new THREE.BoxGeometry(.08, 2.25, 1.45), glass, [-5.94, 2.35, 4.35], "west veranda French door"); for (const z of [1.65, 4.35]) { add(new THREE.BoxGeometry(.12, 2.38, .16), stone, [-6.0, 2.35, z - .82], "west veranda door jamb"); add(new THREE.BoxGeometry(.12, 2.38, .16), stone, [-6.0, 2.35, z + .82], "west veranda door jamb"); } add(new THREE.BoxGeometry(1.2, .9, 8.8), stone, [-6.35, -.05, 2.7], "west retaining wall"); add(new THREE.BoxGeometry(8.0, .08, 3.0), mat(0xc0a477), [-9.0, -.38, 7.0], "west garden path"); }
function addWestBalconyRail() { const iron = new THREE.MeshStandardMaterial({ color: 0x202524, metalness: .65, roughness: .35 }); const add = (geometry, position, name) => { const mesh = new THREE.Mesh(geometry, iron); mesh.position.set(...position); mesh.name = name; mesh.castShadow = true; exteriorLayer.add(mesh); }; add(new THREE.BoxGeometry(.08, .08, 8.3), [-6.0, 3.62, 2.8], "west balcony top rail"); add(new THREE.BoxGeometry(.08, .08, 8.3), [-6.0, 3.05, 2.8], "west balcony lower rail"); for (const z of [-1.2, .2, 1.6, 3.0, 4.4, 5.8, 6.8]) add(new THREE.CylinderGeometry(.035, .035, .75, 8), [-6.0, 3.35, z], "west balcony iron post"); }
function addRoofDormers() { const wall = mat(0xd7ded8); const shutter = mat(0x2f665f); const glass = new THREE.MeshStandardMaterial({ color: 0x7899a3, transparent: true, opacity: .8 }); for (const x of [-4.1, 0, 4.1]) { const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, .95, .75), wall); body.position.set(x, 7.55, 4.42); body.name = "Villa Diodati roof dormer"; exteriorLayer.add(body); const pane = new THREE.Mesh(new THREE.BoxGeometry(.82, .58, .05), glass); pane.position.set(x, 7.62, 4.02); pane.name = "Villa Diodati dormer window"; exteriorLayer.add(pane); for (const side of [-.58, .58]) { const shutterPanel = new THREE.Mesh(new THREE.BoxGeometry(.16, .68, .08), shutter); shutterPanel.position.set(x + side, 7.62, 4.0); shutterPanel.name = "Villa Diodati dormer shutter"; exteriorLayer.add(shutterPanel); } const cap = new THREE.Mesh(new THREE.ConeGeometry(.88, .5, 4), mat(0x594b46)); cap.position.set(x, 8.25, 4.42); cap.rotation.y = Math.PI / 4; exteriorLayer.add(cap); } }
buildExterior(); buildVillaSilhouette(); buildSquareVillaExterior(); const squareRoof = exteriorLayer.children.find((node) => node.name === "square villa hipped roof"); if (squareRoof) squareRoof.scale.z = .46; addSquareChimney(); addFrontEntranceDetails(); addWestElevationDetails(); addWestBalconyRail(); addRoofDormers();
function buildRoom() {
  const floor = box("oak parquet floor", [16, .12, 9], [0, -.12, .5], 0x76513e); floor.receiveShadow = true;
  for (let x = -7.5; x <= 7.5; x += .55) box("floor inlay", [.018, .015, 8.4], [x, -.045, .5], 0x9a6b4d);
  for (let z = -3.5; z <= 4.5; z += .55) box("floor inlay", [15.5, .015, .018], [0, -.04, z], 0x5f3f36);
  const rearWall = box("rear wall", [16.18, 4.3, .18], [0, 2.05, -4], 0x91adbc);
  const leftWall = box("left wall", [.18, 4.3, 9.18], [-7.91, 2.05, .5], 0x91adbc);
  const rightWall = box("right wall", [.18, 4.3, 9.18], [7.91, 2.05, .5], 0x91adbc);
  const frontWall = box("camera-side wall", [16.18, 4.3, .18], [0, 2.05, 5], 0x91adbc);
  frontWall.visible = false;
  const verandaWallLeft = box("front wall left of veranda door", [7.0, 4.3, .18], [-4.5, 2.05, 5], 0x91adbc);
  const verandaWallRight = box("front wall right of veranda door", [7.0, 4.3, .18], [4.5, 2.05, 5], 0x91adbc);
  const verandaLintel = box("veranda door lintel", [2.0, 1.5, .18], [0, 3.35, 5], 0x91adbc);
  room.userData.walls = { rear: rearWall, left: leftWall, right: rightWall, front: frontWall };
  room.userData.occludingDecor = [];
  for (const wall of [rearWall, leftWall, rightWall, frontWall]) { wall.material.map = null; wall.material.color.set(0x91adbc); wall.material.needsUpdate = true; }
  const crownMolding = box("white crown molding", [15.7, .14, .12], [0, 4.08, -3.91], 0xf2eee5);
  room.userData.occludingDecor.push(crownMolding);
  const sideTrim = [];
  for (const x of [-7.91, 7.91]) {
    sideTrim.push(
      box("side wall crown molding", [.12, .14, 9.0], [x, 4.08, .5], 0xf2eee5),
    );
  }
  const frontTrim = [
    box("front wall crown molding", [15.7, .14, .12], [0, 4.08, 4.91], 0xf2eee5),
  ];
  room.userData.occludingDecor.push(...sideTrim, ...frontTrim, verandaWallLeft, verandaWallRight, verandaLintel);
  // The salon has floor-to-crown wall panels, not a horizontal chair rail. Keep
  // this cleanup broad so an older cached/loaded furnishing cannot reintroduce it.
  room.traverse((node) => {
    if (node.name && /(chair.?rail|wall.?rail|chair.?molding)/i.test(node.name)) {
      node.visible = false;
      node.userData.occluded = true;
    }
  });
  // Grounds reconstruction: terrace, formal garden, meadow, vineyard, orchard, and lake shore.
  box("villa front terrace", [15.8, .12, 3.8], [0, -.12, 6.9], 0x8b684b);
  for (let x = -7.4; x <= 7.4; x += .65) box("terrace board", [.025, .018, 3.55], [x, -.045, 6.9], 0xb28a62);
  box("terrace steps", [4.2, .28, .7], [0, -.02, 5.05], 0x76513e);
  for (const x of [-5.6, -3.7, -1.8, 1.8, 3.7, 5.6]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(.18, .22, 2.7, 12), mat(0xe6dfd2)); column.position.set(x, 1.25, 5.55); column.castShadow = true; room.add(column); room.userData.occludingDecor.push(column);
  }
  box("garden lawn", [15.8, .08, 9.8], [0, -.16, 13.4], 0x52694d);
  const path = box("main garden path", [1.15, .1, 14.5], [0, -.08, 13.8], 0xc0a477, 0);
  box("east garden path", [1.0, .1, 9.5], [7.1, -.07, 14.2], 0xc0a477, -.12);
  box("west garden path", [1.0, .1, 9.5], [-7.1, -.07, 14.2], 0xc0a477, .12);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, .16, 32), mat(0xb7a27c)); basin.position.set(5.2, -.02, 10.3); room.add(basin);
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, .08, 32), mat(0x6e9a9d)); pond.position.set(5.2, .08, 10.3); room.add(pond);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(.12, .18, .7, 12), mat(0xd4c8b3)); fountain.position.set(5.2, .4, 10.3); room.add(fountain);
  // Vineyard terrace rows descending toward the lake.
  for (let row = 0; row < 5; row++) {
    const z = 18.5 + row * 1.15;
    for (let x = -6.8; x <= 6.8; x += .7) {
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .55, 6), mat(0x4d3a2b)); vine.position.set(x, .18, z); room.add(vine);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(.18, 7, 5), mat(0x496444)); leaves.scale.set(1.4, .7, .7); leaves.position.set(x, .52, z); room.add(leaves);
    }
  }
  // Orchard trees on the lower terrace.
  for (let row = 0; row < 2; row++) for (let x = -7.2; x <= 7.2; x += 1.8) {
    const z = 24.0 + row * 1.7;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.13, .18, 1.1, 7), mat(0x4b3326)); trunk.position.set(x, .48, z); trunk.castShadow = true; room.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(.62, 10, 7), mat(row ? 0x557347 : 0x48633e)); crown.position.set(x, 1.25, z); crown.castShadow = true; room.add(crown);
  }
  box("lake shore path", [15.8, .1, 1.3], [0, -.1, 27.1], 0xc0a477);
  box("stone seawall", [15.8, .28, .45], [0, .03, 28.0], 0x8b887c);
  box("Lake Geneva", [36, .06, 8], [0, -.13, 32], 0x314f65);
  for (const x of [-14, -11, 11, 14]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .22, 1.5, 7), mat(0x4b3326)); trunk.position.set(x, .65, 12 + Math.abs(x % 2)); trunk.castShadow = true; room.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(.8, 10, 7), mat(0x314c37)); crown.position.set(x, 1.75, trunk.position.z); crown.castShadow = true; room.add(crown);
  }
  const door = box("front wall door", [1.35, 2.55, .08], [0, 1.3, 4.87], 0x402a24);
  const doorFrameLeft = box("front door frame left", [.12, 2.8, .12], [-.72, 1.42, 4.8], 0xb3875c);
  const doorFrameRight = box("front door frame right", [.12, 2.8, .12], [.72, 1.42, 4.8], 0xb3875c);
  const doorLintel = box("front door lintel", [1.55, .12, .12], [0, 2.78, 4.8], 0xb3875c);
  box("front door handle", [.08, .08, .08], [.48, 1.35, 4.76], 0xd8b36e);
  room.userData.occludingDecor.push(door, doorFrameLeft, doorFrameRight, doorLintel);
  const outside = windowViewTexture();
  const addFacadeWindow = (x, y, z, rotation = 0) => {
    const recess = box("villa facade window recess", [1.85, 2.65, .08], [x, y, z], 0x182b3c, rotation);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.3), new THREE.MeshBasicMaterial({ map: outside, transparent: true }));
    pane.name = "villa facade window"; pane.position.set(x, y, z + (rotation ? 0 : -.055)); pane.rotation.y = rotation; pane.renderOrder = 1; room.add(pane);
    const frame = [
      box("facade window left", [.08, 2.42, .1], [x - (rotation ? 0 : .82), y, z + (rotation ? 0 : -.1)], 0xf2eee5, rotation),
      box("facade window right", [.08, 2.42, .1], [x + (rotation ? 0 : .82), y, z + (rotation ? 0 : -.1)], 0xf2eee5, rotation),
      box("facade window top", [1.72, .08, .1], [x, y + 1.22, z + (rotation ? 0 : -.1)], 0xf2eee5, rotation),
      box("facade window sill", [1.9, .1, .16], [x, y - 1.22, z + (rotation ? 0 : -.1)], 0xf2eee5, rotation),
    ];
    room.userData.occludingDecor.push(recess, pane, ...frame);
  };
  // Principal-floor reconstruction surrounding the salon.
  const planRoom = (name, x, z, width, depth, color = 0x80634d) => {
    box(`${name} floor`, [width, .1, depth], [x, -.08, z], color);
    const wall = 0.16;
    const gap = Math.min(1.35, width - .4); const sideGap = Math.min(1.35, depth - .4);
    const horizontal = (centerX, centerZ, side) => { const segment = (width - gap) / 2; for (const offset of [-(gap + segment) / 2, (gap + segment) / 2]) box(`${name} ${side} wall`, [segment, .28, wall], [centerX + offset, .28, centerZ], 0x5b4035); };
    const vertical = (centerX, centerZ, side) => { const segment = (depth - sideGap) / 2; for (const offset of [-(sideGap + segment) / 2, (sideGap + segment) / 2]) box(`${name} ${side} wall`, [wall, .28, segment], [centerX, .28, centerZ + offset], 0x5b4035); };
    horizontal(x, z - depth / 2, "north"); horizontal(x, z + depth / 2, "south"); vertical(x - width / 2, z, "west"); vertical(x + width / 2, z, "east");
  };
  planRoom("drawing room and music room", -12.1, -.9, 7.8, 5.8, 0x80634d);
  planRoom("library and morning room", -12.1, 3.4, 7.8, 2.6, 0x80634d);
  planRoom("dining room", 12.1, -.9, 7.8, 5.8, 0x80634d);
  planRoom("cabinet and guest room", 12.1, 3.4, 7.8, 2.6, 0x80634d);
  planRoom("Byron study", -4.8, -6.2, 4.2, 3.8, 0x705640);
  planRoom("central stair hall", 0, -6.2, 4.2, 3.8, 0x80634d);
  planRoom("ante room", 4.8, -6.2, 4.2, 3.8, 0x705640);
  // Open thresholds connect the salon to the inferred adjacent rooms and service hall.
  box("west room connector", [1.4, .1, 2.4], [-8.0, -.02, .1], 0xa28662);
  box("east room connector", [1.4, .1, 2.4], [8.0, -.02, .1], 0xa28662);
  box("rear hall connector", [2.8, .1, 1.5], [0, -.02, -4.45], 0xa28662);
  box("terrace threshold", [2.8, .1, 1.2], [0, -.02, 4.75], 0xa28662);
  box("main floor veranda landing", [5.4, .12, 2.2], [0, -.04, 5.85], 0x8b684b);
  box("veranda front rail", [5.4, .65, .12], [0, .35, 6.85], 0xf2eee5);
  // Room-specific anchors make the inferred plan legible and give the characters places to visit.
  box("drawing room piano", [2.3, .9, .75], [-13.7, .42, -1.25], 0x3c2420);
  for (const x of [-11.8, -10.5]) loadFurnitureModel("../furniture/armchair-01/ArmChair_01.gltf", "drawing room armchair", [x, 0, .35], .8, Math.PI);
  box("dining room table", [3.3, .18, 1.35], [12.0, .86, -.8], 0x5b3828);
  for (const x of [10.7, 13.3]) for (const z of [-1.8, .2]) loadFurnitureModel("../furniture/armchair-01/ArmChair_01.gltf", "dining room chair", [x, 0, z], .72, x < 12 ? Math.PI / 2 : -Math.PI / 2);
  for (let shelf = 0; shelf < 3; shelf++) box("library bookcase", [2.8, 1.8, .25], [-14.9 + shelf * 1.35, .9, 3.95], 0x4b3025);
  box("cabinet writing desk", [1.6, .75, .7], [11.6, .42, 3.3], 0x5b3828);
  box("Byron study fireplace surround", [1.25, 1.05, .28], [-5.275, .5, -7.98], 0x80665b);
  box("Byron study fireplace opening", [.72, .62, .03], [-5.275, .42, -7.82], 0x211916);
  // Central stair hall is represented as a broad landing connecting the principal rooms.
  box("central stair landing", [3.2, .12, 3.2], [0, -.02, -5.0], 0x9a7956);
  for (let step = 0; step < 5; step++) box("central stair", [2.5 - step * .12, .12, .38], [0, .08 + step * .1, -6.9 + step * .38], 0xb79b72);
  // Principal façade: two windows flanking the entrance.
  for (const x of [-3.55, 3.55]) addFacadeWindow(x, 2.25, 4.88);
  // Side elevations: repeated windows along the lake-facing wings.
  for (const z of [-2.15, .55, 3.15]) {
    addFacadeWindow(-7.86, 2.25, z, Math.PI / 2);
    addFacadeWindow(7.86, 2.25, z, Math.PI / 2);
  }
  for (const x of [-5.9, 5.9]) {
    const windowRecess = box("tall window recess", [2.05, 3.15, .08], [x, 2.35, -3.91], 0x182b3c);
    room.userData.occludingDecor.push(windowRecess);
    const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 2.8), new THREE.MeshBasicMaterial({ map: outside, transparent: true })); windowPane.name = "tall window to the storm outside"; windowPane.position.set(x, 2.35, -3.8); windowPane.renderOrder = 1; room.add(windowPane); room.userData.occludingDecor.push(windowPane);
    const windowMullion = box("window mullion", [.1, 2.85, .1], [x, 2.35, -3.90], 0xf2eee5);
    const windowSill = box("window sill", [2.15, .12, .22], [x, .78, -3.82], 0xf2eee5);
    const curtain = box("curtain", [.3, 3.7, .3], [x + (x < 0 ? -1.0 : 1.0), 2.35, -3.86], 0x5e7080);
    room.userData.occludingDecor.push(windowMullion, windowSill, curtain);
  }
  const writingDeskX = -5.35;
  const writingDeskZ = 2.65;
  box("antique writing desk top", [1.25, .12, 1.15], [writingDeskX, 1.02, writingDeskZ], 0x6b402d);
  box("antique writing desk apron", [1.1, .32, .08], [writingDeskX, .82, writingDeskZ + .48], 0x553126);
  for (const x of [writingDeskX - .5, writingDeskX + .5]) for (const z of [writingDeskZ - .42, writingDeskZ + .42]) box("antique writing desk leg", [.1, .82, .1], [x, .43, z], 0x4b2d24);
  box("dado", [11.8, .22, .22], [0, .55, -3.85], 0xa47955);
  const largeArt = textureLoader.load("../art/wall-triptych-v1.png");
  largeArt.colorSpace = THREE.SRGBColorSpace;
  const largeFrame = box("large painting frame above fireplace", [3.9, 2.05, .1], [0, 3.02, -3.90], 0x8a633d);
  const largePainting = new THREE.Mesh(new THREE.PlaneGeometry(3.45, 1.62), new THREE.MeshBasicMaterial({ map: largeArt }));
  largePainting.name = "large painting above fireplace"; largePainting.position.set(0, 3.02, -3.61); largePainting.renderOrder = 2; room.add(largePainting);
  room.userData.occludingDecor.push(largeFrame, largePainting);
  for (const x of [-2.35, 2.35]) {
    const framePieces = [
      box("art frame top", [1.18, .08, .1], [x, 3.24, -3.90], 0xa47a50),
      box("art frame bottom", [1.18, .08, .1], [x, 1.86, -3.90], 0xa47a50),
      box("art frame left", [.08, 1.46, .1], [x - .55, 2.55, -3.90], 0xa47a50),
      box("art frame right", [.08, 1.46, .1], [x + .55, 2.55, -3.90], 0xa47a50),
    ];
    const art = textureLoader.load("../art/wall-triptych-v1.png");
    art.colorSpace = THREE.SRGBColorSpace; art.wrapS = THREE.ClampToEdgeWrapping; art.repeat.set(1 / 3, 1); art.offset.set(x < 0 ? 0 : 2 / 3, 0);
    const painting = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.3), new THREE.MeshBasicMaterial({ map: art }));
    painting.name = "generated wall painting"; painting.position.set(x, 2.55, -3.7); painting.renderOrder = 2; room.add(painting);
    room.userData.occludingDecor.push(...framePieces, painting);
    const sconceBack = box("wall sconce backplate", [.12, .42, .08], [x, 3.15, -3.90], 0xb08a55);
    const sconceArm = box("wall sconce arm", [.22, .06, .1], [x, 2.98, -3.86], 0xb08a55);
    const sconceFlame = new THREE.Mesh(new THREE.ConeGeometry(.055, .18, 8), new THREE.MeshBasicMaterial({ color: 0xffd58a }));
    sconceFlame.name = "wall sconce flame"; sconceFlame.position.set(x, 3.08, -3.5); room.add(sconceFlame);
    const sconceLight = new THREE.PointLight(0xffc277, .48, 2.2); sconceLight.position.set(x, 3.08, -3.35); room.add(sconceLight);
    room.userData.occludingDecor.push(sconceBack, sconceArm, sconceFlame);
  }
  const fireplaceTexture = textureLoader.load("../art/fireplace-v1.png");
  fireplaceTexture.colorSpace = THREE.SRGBColorSpace;
  const fireplaceArt = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 1.985), new THREE.MeshBasicMaterial({ map: fireplaceTexture, transparent: true, depthWrite: false }));
  fireplaceArt.name = "Villa Diodati fireplace artwork"; fireplaceArt.position.set(0, 1.32, -3.78); fireplaceArt.renderOrder = 3; room.add(fireplaceArt);
  room.userData.occludingDecor.push(fireplaceArt);
  fireLight = new THREE.PointLight(0xff9b43, 3.2, 5); fireLight.position.set(0, .82, -3.15); room.add(fireLight);
  loadFurnitureModel("../furniture/rug-01/rug.glb", "CC0 salon rug", [0, .025, 1.15], 2.05, 0);
  loadFurnitureModel("../furniture/sofa-03/sofa_03.gltf", "ThirdRoom carved sofa", [-3.0, 0, .65], 1.08, 0);
  loadFurnitureModel("../furniture/armchair-01/ArmChair_01.gltf", "ThirdRoom right armchair", [2.55, 0, .35], 1.02, -Math.PI / 2);
  loadFurnitureModel("../furniture/armchair-01/ArmChair_01.gltf", "ThirdRoom second right armchair", [2.55, 0, 1.85], 1.02, -Math.PI / 2);
  loadFurnitureModel("../furniture/armchair-01/ArmChair_01.gltf", "ThirdRoom reading armchair", [-1.75, 0, 2.35], 1.02, Math.PI / 2);
  loadFurnitureModel("../furniture/antique-table-01/table.glb", "antique Chinese tea table", [0, 0, 1.15], 1.52, 0);
  const tableCandelabra = heldProp("candelabra"); tableCandelabra.name = "candelabra on coffee table"; tableCandelabra.position.set(0, .72, 1.42); room.add(tableCandelabra);
  const tableCandleLight = new THREE.PointLight(0xffc77c, 1.15, 2.2); tableCandleLight.position.set(0, 1.18, 1.42); room.add(tableCandleLight); candleLights.push(tableCandleLight);
  lightningLight = new THREE.PointLight(0xb9ddff, 0, 18); lightningLight.position.set(0, 4, 1); scene.add(lightningLight);
}
function updateWallOcclusion() { const walls = room.userData.walls; if (!walls) return; const decor = room.userData.occludingDecor || []; const position = activeCamera.position; const near = new Set(); if (position.x > 1.2) near.add("right"); if (position.x < -1.2) near.add("left"); if (position.z < -1.2) near.add("rear"); if (position.z > 1.2) near.add("front"); if (topDown) { for (const wall of Object.values(walls)) { wall.material.opacity = 1; wall.material.depthWrite = true; } for (const item of decor) { item.material.transparent = true; item.material.opacity = 1; item.material.depthWrite = true; } } else { for (const [name, wall] of Object.entries(walls)) { wall.material.transparent = true; wall.material.opacity = near.has(name) ? .06 : 1; wall.material.depthWrite = !near.has(name); wall.material.needsUpdate = true; } const decorOpacity = near.size ? .06 : 1; for (const item of decor) { item.material.transparent = true; item.material.opacity = decorOpacity; item.material.depthWrite = !near.size; item.material.needsUpdate = true; } } const activeShells = floorLevel === 0 ? [lowerFloor] : floorLevel >= 2 ? [upperFloors[floorLevel - 2]] : []; for (const shell of activeShells) shell.traverse((node) => { if (!node.isMesh || !/ wall$/i.test(node.name)) return; const side = node.position.x > 1.2 ? "right" : node.position.x < -1.2 ? "left" : node.position.z < -1.2 ? "rear" : "front"; node.material.transparent = !topDown; node.material.opacity = topDown || !near.has(side) ? 1 : .12; node.material.depthWrite = topDown || !near.has(side); node.material.needsUpdate = true; }); }
function setupLighting() {
  scene.add(new THREE.HemisphereLight(0xe6d4c1, 0x241818, 1.8));
  const key = new THREE.DirectionalLight(0xffe0bd, 2.1); key.position.set(-4, 8, 5); key.castShadow = true; scene.add(key);
}
function sheetMaterial(file) {
  if (textureCache.has(file)) return textureCache.get(file);
  const texture = textureLoader.load(`../sprites/dressup-v1/${file}`); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const material = new THREE.ShaderMaterial({ transparent: true, depthTest: true, depthWrite: false, uniforms: { map: { value: texture }, frame: { value: new THREE.Vector2(0, 0) }, coat: { value: new THREE.Color(0xffffff) }, waistcoat: { value: new THREE.Color(0xffffff) }, accent: { value: new THREE.Color(0xffffff) }, skin: { value: new THREE.Color(0xd5a07c) }, ghost: { value: new THREE.Color(0x8fc9ff) }, ghostStrength: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform sampler2D map; uniform vec2 frame; uniform vec3 coat; uniform vec3 waistcoat; uniform vec3 accent; uniform vec3 skin; uniform vec3 ghost; uniform float ghostStrength; varying vec2 vUv; void main(){vec2 cellUv=vec2(.04+vUv.x*.92,.04+vUv.y*.92); vec2 uv=(cellUv+vec2(frame.x,4.0-frame.y))/vec2(8.0,5.0); vec4 c=texture2D(map,uv); float alpha=c.a; if(alpha<.02) discard; float y=fract(cellUv.y); float lower=smoothstep(.18,.42,y)*(1.0-smoothstep(.86,.98,y)); float middle=smoothstep(.38,.58,y)*(1.0-smoothstep(.72,.88,y)); float warmPixels=smoothstep(.08,.28,c.r-c.b); float faceMask=smoothstep(.58,.78,y)*warmPixels; vec3 recolored=mix(c.rgb,coat,.55*lower); recolored=mix(recolored,waistcoat,.42*middle); recolored=mix(recolored,accent,.22*lower); recolored=mix(recolored,skin,.13*faceMask); recolored=mix(recolored,ghost,ghostStrength); gl_FragColor=vec4(recolored,alpha*(1.0-ghostStrength*.42));}` });
  textureCache.set(file, material); return material;
}
function faceMaterial(file) {
  const texture = textureLoader.load(`../sprites/dressup-v1/${file}`); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter;
  return new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { map: { value: texture }, column: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform sampler2D map; uniform float column; varying vec2 vUv; void main(){vec2 uv=(vec2(vUv.x,.08+vUv.y*.84)+vec2(column,4.0))/vec2(8.0,5.0); vec4 c=texture2D(map,uv); if(c.a<.04) discard; gl_FragColor=c;}` });
}
function heldProp(kind) {
  if (!kind) return null;
  const group = new THREE.Group(); group.position.set(.31, .2, .06); group.renderOrder = 8;
  if (kind === "book") { const book = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, .22), new THREE.MeshStandardMaterial({ color: 0x6c3440, roughness: .6 })); book.rotation.z = -.18; group.add(book); }
  if (kind === "quill") { const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.012, .018, .25, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a36, roughness: .65 })); shaft.rotation.z = -.45; group.add(shaft); const nib = new THREE.Mesh(new THREE.ConeGeometry(.025, .07, 5), new THREE.MeshStandardMaterial({ color: 0xd2b56d, metalness: .5, roughness: .35 })); nib.position.set(.09, -.1, 0); nib.rotation.z = -.45; group.add(nib); }
  if (kind === "cup") { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.065, .055, .13, 12), new THREE.MeshStandardMaterial({ color: 0xd7c39b, roughness: .35 })); cup.rotation.z = -.18; group.add(cup); }
  if (kind === "glass") { const glass = new THREE.Mesh(new THREE.CylinderGeometry(.055, .04, .15, 12), new THREE.MeshPhysicalMaterial({ color: 0xc8e9ed, transparent: true, opacity: .7, roughness: .12, transmission: .2 })); glass.rotation.z = -.12; group.add(glass); }
  if (kind === "candelabra") { const stem = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, .25, 8), new THREE.MeshStandardMaterial({ color: 0xd1aa68, metalness: .5, roughness: .3 })); group.add(stem); for (const offset of [-.07, 0, .07]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .12, 8), stem.material); arm.position.set(offset, .09, 0); group.add(arm); const flame = new THREE.Mesh(new THREE.ConeGeometry(.022, .07, 5), new THREE.MeshBasicMaterial({ color: 0xffd47d })); flame.position.set(offset, .17, 0); group.add(flame); } }
  return group;
}
function setHeldProp(mesh, kind) { if (mesh.userData.heldProp) mesh.remove(mesh.userData.heldProp); mesh.userData.heldProp = heldProp(kind); if (mesh.userData.heldProp) mesh.add(mesh.userData.heldProp); }
function directionFromDelta(dx, dz, fallback = "south") { if (Math.abs(dx) < .015 && Math.abs(dz) < .015) return fallback; const angle = Math.atan2(dx, dz); const index = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8; return ["south", "southeast", "east", "northeast", "north", "northwest", "west", "southwest"][index]; }
function oppositeDirection(direction) { return { south: "north", southeast: "northwest", east: "west", northeast: "southwest", north: "south", northwest: "southeast", west: "east", southwest: "northeast" }[String(direction || "south").toLowerCase()] || "north"; }
function spriteDirectionForCamera(person) { const facing = String(person.direction || "south").toLowerCase(); const cameraDirection = directionFromDelta(activeCamera.position.x - person.x, activeCamera.position.z - person.z, facing); const names = ["south", "southeast", "east", "northeast", "north", "northwest", "west", "southwest"]; const facingIndex = names.indexOf(facing); const cameraIndex = names.indexOf(cameraDirection); const difference = Math.abs(facingIndex - cameraIndex); if (difference <= 2 || difference >= 6) return difference >= 6 ? oppositeDirection(facing) : facing; return cameraDirection; }
function safePosition(x, z, radius = .28) { let safeX = THREE.MathUtils.clamp(x, map.minX + radius, map.maxX - radius); let safeZ = THREE.MathUtils.clamp(z, map.minZ + radius, map.maxZ - radius); const regions = roomRegions.filter((region) => region.floor === floorLevel); if (regions.length && !regions.some((region) => safeX >= region.minX - radius && safeX <= region.maxX + radius && safeZ >= region.minZ - radius && safeZ <= region.maxZ + radius)) { const nearest = regions.map((region) => ({ region, x: THREE.MathUtils.clamp(safeX, region.minX + radius, region.maxX - radius), z: THREE.MathUtils.clamp(safeZ, region.minZ + radius, region.maxZ - radius) })).sort((a, b) => Math.hypot(a.x - safeX, a.z - safeZ) - Math.hypot(b.x - safeX, b.z - safeZ))[0]; if (nearest) { safeX = nearest.x; safeZ = nearest.z; } } const activeObstacles = floorLevel === 1 ? furnitureObstacles : []; for (const obstacle of activeObstacles) { if (safeX > obstacle.minX - radius && safeX < obstacle.maxX + radius && safeZ > obstacle.minZ - radius && safeZ < obstacle.maxZ + radius) { const push = [{ axis: "x", value: obstacle.minX - radius, distance: Math.abs(safeX - (obstacle.minX - radius)) }, { axis: "x", value: obstacle.maxX + radius, distance: Math.abs(safeX - (obstacle.maxX + radius)) }, { axis: "z", value: obstacle.minZ - radius, distance: Math.abs(safeZ - (obstacle.minZ - radius)) }, { axis: "z", value: obstacle.maxZ + radius, distance: Math.abs(safeZ - (obstacle.maxZ + radius)) }].sort((a, b) => a.distance - b.distance)[0]; if (push.axis === "x") safeX = push.value; else safeZ = push.value; } } return { x: safeX, z: safeZ }; }
function makeFigure(id, name, style, x, z, state = "idle", index = 0, wardrobe = {}) {
  const material = sheetMaterial(sheetFiles[style] || sheetFiles.byron).clone();
  material.uniforms.coat.value.set(wardrobe.coat || "#ffffff"); material.uniforms.waistcoat.value.set(wardrobe.waistcoat || "#ffffff"); material.uniforms.accent.value.set(wardrobe.accent || "#ffffff"); material.uniforms.skin.value.set(wardrobe.skin || "#d5a07c");
  // The atlas frame is deliberately taller than the visible body. The extra
  // headroom prevents the top row from clipping hair/hat pixels, while the
  // bottom anchor keeps every pair of feet on the floor.
  const spriteHeight = 2.36;
  const spriteWidth = spriteHeight * DRESSUP_ATLAS.frameAspect;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spriteWidth, spriteHeight), material); mesh.position.set(x, spriteHeight * (1 - DRESSUP_ATLAS.anchorY), z); mesh.scale.setScalar(state === "sit" ? .84 : 1); mesh.userData = { id, name, style, state, index, baseY: mesh.position.y, phase: index * .7, motion: { x, z }, floorAnchor: DRESSUP_ATLAS.anchorY }; mesh.castShadow = true; mesh.renderOrder = 5; setHeldProp(mesh, wardrobe.held); mesh.userData.heldKind = wardrobe.held || null;
  if (id.startsWith("a.")) {
    const auraMaterial = material.clone(); auraMaterial.depthTest = true; auraMaterial.uniforms.ghostStrength.value = .22; auraMaterial.uniforms.ghost.value.set(0xb8f3ff);
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(spriteWidth * 1.04, spriteHeight * 1.03), auraMaterial); aura.position.z = -.012; aura.renderOrder = 4; mesh.add(aura); mesh.userData.glowMesh = aura;
  }
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(.58, .58), faceMaterial(sheetFiles[style] || sheetFiles.byron)); marker.rotation.x = -Math.PI / 2; marker.position.set(x, .035, z); marker.renderOrder = 20; marker.userData.figure = mesh; mapMarkers.add(marker); mesh.userData.mapMarker = marker;
  participantLayer.add(mesh); figures.set(id, mesh); return mesh;
}
function stateRow(state, held) { if (held && state !== "sit") return 2; return state === "walk" ? 1 : state === "gesture" || state === "write" ? 2 : state === "sit" ? 3 : state === "speak" ? 4 : 0; }
function directionColumn(direction) { return { south: 0, southwest: 1, west: 2, northwest: 3, north: 4, northeast: 5, east: 6, southeast: 7 }[String(direction || "south").toLowerCase()] ?? 0; }
function updateFigure(mesh, person, now) { const renderState = person.held && person.state !== "sit" ? "gesture" : (person.state || "idle"); const activeHeld = person.state === "write" ? "quill" : person.held; mesh.userData.person = person; if (!person.direction) person.direction = directionFromDelta(person.x - (mesh.userData.lastX ?? person.x), person.z - (mesh.userData.lastZ ?? person.z), person.direction); mesh.userData.lastX = person.x; mesh.userData.lastZ = person.z; const safe = safePosition(person.x, person.z, renderState === "sit" ? .2 : .24); mesh.position.x = safe.x; mesh.position.z = safe.z; const demographics = demographicFactors(person); const bodyScale = THREE.MathUtils.clamp((person.scale || 1) * demographics.height, .68, 1.02) * (renderState === "sit" ? .84 : 1); const floor = THREE.MathUtils.clamp(Number(person.floor || 1), 0, 3); const floorOffset = [-3.64, 0, 3.96, 7.76][floor]; const width = THREE.MathUtils.clamp((person.width || 1) * demographics.weight, .82, 1.05); mesh.position.y = floorOffset + 1.18 * bodyScale; mesh.userData.baseY = mesh.position.y; mesh.scale.set(width * bodyScale, bodyScale, bodyScale); mesh.userData.state = renderState; mesh.visible = floor === floorLevel && (!pov || person.id === localPlayer.id); const direction = directionColumn(spriteDirectionForCamera(person)); const frame = new THREE.Vector2(direction, stateRow(renderState, activeHeld)); const material = mesh.material; material.uniforms.coat.value.set(person.coat || "#ffffff"); material.uniforms.waistcoat.value.set(person.waistcoat || "#ffffff"); material.uniforms.accent.value.set(person.accent || "#ffffff"); material.uniforms.skin.value.set(person.skin || "#d5a07c"); material.uniforms.frame.value.copy(frame); if (mesh.userData.glowMesh) mesh.userData.glowMesh.material.uniforms.frame.value.copy(frame); if (mesh.userData.mapMarker) { mesh.userData.mapMarker.visible = topDown && floor === floorLevel; mesh.userData.mapMarker.position.set(safe.x, floorOffset + .035, safe.z); mesh.userData.mapMarker.material.uniforms.column.value = direction; } if ((mesh.userData.heldKind || null) !== (activeHeld || null)) { mesh.userData.heldKind = activeHeld || null; setHeldProp(mesh, activeHeld); } }
function syncPeople(people) { const now = clock.elapsedTime; const incoming = new Set(people.map((person) => person.id)); for (const [id, figure] of figures) { if (incoming.has(id)) continue; participantLayer.remove(figure); mapMarkers.remove(figure.userData.mapMarker); figures.delete(id); } for (const person of people) { let figure = figures.get(person.id); if (!figure) figure = makeFigure(person.id, person.name, person.style, person.x, person.z, person.state, figures.size, person); updateFigure(figure, person, now); } }
function defaultState() { const people = defaultPeople.map(([id, name, style, x, z, state, coat, waistcoat, accent, skin, scale, width]) => ({ id, name, style, x, z, state, floor: 1, coat, waistcoat, accent, skin, scale, width })); if (localPlayerEnabled) people.push({ ...localPlayer }); if (demoCrowd) for (let i = people.length; i < 30; i++) { const angle = i * 2.39996; people.push({ id: `demo.guest-${i}`, name: `Guest ${i - 4}`, style: ["byron", "mary", "claire", "percy", "polidori"][i % 5], x: Math.cos(angle) * (1.2 + (i % 4) * .65), z: .8 + Math.sin(angle) * (1.2 + (i % 5) * .42), state: demoSeated && i < demoSeatedLimit ? "sit" : i % 7 === 0 ? "gesture" : i % 3 === 0 ? "walk" : "idle", scale: .72 + (i % 4) * .08, width: .88 + (i % 3) * .08, coat: ["#4e536e", "#85514d", "#526b5b", "#6d5260", "#765f4c"][i % 5], waistcoat: "#9a7a62", accent: "#c29a68", skin: ["#f0c4a0", "#d99b75", "#ae6d4e", "#8e563f"][i % 4] }); } return people; }
function compatibleRoomState(content) { return content?.map === "villa-diodati-salon-v1" && content?.coordinate_system === "villa-diodati-isometric-v1"; }
function applyCinematography(content) { const cue = content?.cinematography; if (!cue || !["wide", "medium", "close", "pan"].includes(cue.shot)) { cinematicCue = null; return; } cinematicCue = { shot: cue.shot, target: cue.target || null, started: clock.elapsedTime, duration: Math.max(1, Math.min(30, Number(cue.duration_ms || 7000) / 1000)), hold: Math.max(0, Math.min(30, Number(cue.hold_ms || 3000) / 1000)) }; setViewMode("cinematic"); }
function mapState(content) { const people = defaultState(); const byId = new Map(people.map((p) => [p.id, p])); for (const [id, p] of Object.entries(content?.positions || {})) { const target = byId.get(id) || byId.get(`a.${id}`); if (target) { Object.assign(target, { x: p.x, z: p.z, floor: p.floor || 1, direction: p.direction, state: p.animation_state || "idle", held: p.held, talkingTo: p.talking_to, conversationId: p.conversation_id, speechRange: p.speech_range || speechRange, height_cm: p.height_cm, weight_kg: p.weight_kg }); if (p.scale != null) target.scale = p.scale; if (p.weight != null) target.weight = p.weight; if (p.width != null) target.width = p.width; } } for (const [id, p] of Object.entries(content?.participants || {})) { const avatar = content?.avatars?.[id] || {}; byId.set(id, { id, name: p.name || "Guest", style: ["byron","mary","claire","percy","polidori"][byId.size % 5], x: p.x, z: p.z, direction: p.direction, state: p.state || "idle", floor: p.floor || 1, scale: p.scale, weight: p.weight, width: p.width, height_cm: p.height_cm, weight_kg: p.weight_kg, held: p.held, talkingTo: p.talking_to, conversationId: p.conversation_id, speechRange: p.speech_range || speechRange, skin: avatar.skin ? `#${Number(avatar.skin).toString(16).padStart(6, "0")}` : "#c98768", coat: avatar.coat ? `#${Number(avatar.coat).toString(16).padStart(6, "0")}` : "#6d5260", waistcoat: avatar.waistcoat ? `#${Number(avatar.waistcoat).toString(16).padStart(6, "0")}` : "#a78367", accent: avatar.accent ? `#${Number(avatar.accent).toString(16).padStart(6, "0")}` : "#c29a68" }); } if (localPlayerEnabled) byId.set(localPlayer.id, { ...localPlayer }); return [...byId.values()]; }
let roomState = null;
let matrixToken = null;
let matrixRoomId = null;
let dialogueEvents = [];
let dialoguePlaybackKey = "";
let dialoguePlaybackStarted = performance.now();
let roomHistory = [];
let rewindIndex = -1;
let rewindPlaying = false;
let rewindTimer = null;
const roomHistoryKey = "villa-diodati-room-history-v1";
const dialogueNames = { "a.byron": "Byron", "a.maryshelley": "Mary", "a.clairmont": "Claire", "a.shelley": "Percy", "a.polidori": "Polidori", "a.shelley1": "Percy" };
function speakerId(sender) { return String(sender || "").replace(/^@/, "").split(":")[0]; }
function dialogueText(event) { const body = event?.content?.body; return event?.type === "m.room.message" && event?.content?.msgtype === "m.text" && typeof body === "string" ? body.replace(/\s+/g, " ").trim() : ""; }
function renderDialogue() { const latest = dialogueEvents.at(-1); const latestId = speakerId(latest?.sender); const latestText = dialogueText(latest); if (latestId && figures.has(latestId)) cinematicSpeakerId = latestId; const reading = latestId === "a.byron" && (/^📖/.test(latestText) || /from fantasmagoriana/i.test(latestText)); const byron = figures.get("a.byron")?.userData.person; if (byron && reading) { byron.held = "book"; byron.state = "gesture"; } if (!scriptLines) return; scriptLines.replaceChildren(); for (const event of dialogueEvents.slice(-5)) { const line = document.createElement("div"); line.className = "script-line"; const speaker = document.createElement("span"); speaker.className = "script-speaker"; speaker.textContent = dialogueNames[speakerId(event.sender)] || speakerId(event.sender) || "Salon"; const body = document.createElement("span"); body.textContent = dialogueText(event); line.append(speaker, body); scriptLines.append(line); } if (scriptState) scriptState.textContent = dialogueEvents.length ? "Live Matrix dialogue" : "Listening to Matrix…"; }
function renderBubbles() { if (topDown) { dialogueLayer?.replaceChildren(); return; } dialogueLayer?.replaceChildren(); const playback = dialogueEvents.slice(-5); if (!playback.length) return; const key = `${playback[0]?.event_id || ""}:${playback.at(-1)?.event_id || ""}`; if (key !== dialoguePlaybackKey) { dialoguePlaybackKey = key; dialoguePlaybackStarted = performance.now(); } const event = playback[Math.min(playback.length - 1, Math.floor((performance.now() - dialoguePlaybackStarted) / 6500))]; const id = speakerId(event.sender); const figure = figures.get(id); const text = dialogueText(event); if (!figure || !text) return; const point = figure.position.clone().add(new THREE.Vector3(0, 1.78, 0)).project(activeCamera); const rect = canvas.getBoundingClientRect(); const bubble = document.createElement("div"); bubble.className = "dialogue-bubble"; bubble.style.left = `${rect.left + (point.x + 1) * rect.width / 2}px`; bubble.style.top = `${rect.top + (1 - point.y) * rect.height / 2}px`; const name = document.createElement("strong"); name.textContent = dialogueNames[id] || id; bubble.append(name, document.createTextNode(text.length > 115 ? `${text.slice(0, 112)}…` : text)); dialogueLayer.append(bubble); }
async function pollDialogue() { try { if (!matrixToken || !matrixRoomId) return; const response = await fetch(`https://matrix.castalia.institute/_matrix/client/v3/rooms/${encodeURIComponent(matrixRoomId)}/messages?dir=b&limit=100`, { headers: { Authorization: `Bearer ${matrixToken}` }, cache: "no-store" }); if (!response.ok) return; const events = (await response.json()).chunk || []; const next = events.filter((event) => dialogueText(event)).reverse().slice(-8); dialogueEvents = next; const snapshots = events.filter((event) => event.type === "org.castalia.salon.room" && event.content).reverse().map((event) => ({ ...historySnapshot(event.content), at: new Date(event.origin_server_ts || Date.now()).toISOString() })); if (snapshots.length) refreshHistory({ ...roomState, history: snapshots }); renderDialogue(); } catch {} }
function historySnapshot(content) { return { at: content?.updatedAt || new Date().toISOString(), positions: content?.positions || {}, participants: content?.participants || {}, avatars: content?.avatars || {}, cinematography: content?.cinematography || null }; }
function refreshHistory(content) { const stored = (() => { try { return JSON.parse(localStorage.getItem(roomHistoryKey) || "[]"); } catch { return []; } })(); const source = Array.isArray(content?.history) ? content.history : stored; const current = historySnapshot(content); const signature = JSON.stringify(current.positions); const merged = [...source, current].filter((item, index, all) => index === 0 || JSON.stringify(item.positions) !== JSON.stringify(all[index - 1].positions)).slice(-120); roomHistory = merged; try { localStorage.setItem(roomHistoryKey, JSON.stringify(roomHistory)); } catch {} if (rewindIndex < 0 || rewindIndex >= roomHistory.length) rewindIndex = -1; if (rewindSlider) { rewindSlider.max = String(Math.max(0, roomHistory.length - 1)); rewindSlider.value = String(rewindIndex < 0 ? Math.max(0, roomHistory.length - 1) : rewindIndex); rewindSlider.disabled = roomHistory.length < 2; } if (rewindLive) rewindLive.disabled = rewindIndex < 0; if (rewindPlay) rewindPlay.disabled = roomHistory.length < 2; if (rewindLabel) rewindLabel.textContent = rewindIndex < 0 ? "Live" : new Date(roomHistory[rewindIndex]?.at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function applyHistorySnapshot(index) { const snapshot = roomHistory[index]; if (!snapshot) return; rewindIndex = index; const content = { ...roomState, ...snapshot }; syncPeople(mapState(content)); applyCinematography(content); if (rewindLabel) rewindLabel.textContent = new Date(snapshot.at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); if (rewindLive) rewindLive.disabled = false; }
rewindSlider?.addEventListener("input", () => { rewindPlaying = false; if (rewindPlay) rewindPlay.textContent = "Play"; applyHistorySnapshot(Number(rewindSlider.value)); }); rewindLive?.addEventListener("click", () => { rewindPlaying = false; if (rewindPlay) rewindPlay.textContent = "Play"; rewindIndex = -1; if (roomState) syncPeople(mapState(roomState)); if (rewindLabel) rewindLabel.textContent = "Live"; rewindLive.disabled = true; }); rewindPlay?.addEventListener("click", () => { if (roomHistory.length < 2) return; if (rewindIndex < 0 || rewindIndex >= roomHistory.length - 1) rewindIndex = 0; rewindPlaying = !rewindPlaying; rewindPlay.textContent = rewindPlaying ? "Pause" : "Play"; if (rewindPlaying) { applyHistorySnapshot(rewindIndex); clearInterval(rewindTimer); rewindTimer = setInterval(() => { if (!rewindPlaying) return; if (rewindIndex >= roomHistory.length - 1) { rewindPlaying = false; rewindPlay.textContent = "Play"; clearInterval(rewindTimer); return; } rewindIndex += 1; if (rewindSlider) rewindSlider.value = String(rewindIndex); applyHistorySnapshot(rewindIndex); }, 900); } else clearInterval(rewindTimer); });
async function pollMatrix() { try { if (!matrixToken) { const reg = await fetch("https://matrix.castalia.institute/_matrix/client/v3/register?kind=guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!reg.ok) throw new Error("guest registration"); matrixToken = (await reg.json()).access_token; } if (!matrixRoomId) { const dir = await fetch("https://matrix.castalia.institute/_matrix/client/v3/directory/room/%23villa-diodati%3Amatrix.castalia.institute", { headers: { Authorization: `Bearer ${matrixToken}` } }); if (!dir.ok) throw new Error("room lookup"); matrixRoomId = (await dir.json()).room_id; } const response = await fetch(`https://matrix.castalia.institute/_matrix/client/v3/rooms/${encodeURIComponent(matrixRoomId)}/state`, { headers: { Authorization: `Bearer ${matrixToken}` }, cache: "no-store" }); if (!response.ok) throw new Error("state fetch"); const event = (await response.json()).find((item) => item.type === "org.castalia.salon.room" && !item.state_key); roomState = compatibleRoomState(event?.content) ? event.content : null; refreshHistory(roomState); const people = mapState(roomState); syncPeople(people); applyCinematography(roomState); status.textContent = roomState ? `Matrix salon · ${people.length} participants` : `Salon preview · ${people.length} participants`; } catch (error) { console.warn("Matrix salon poll failed", error); if (roomState) { const people = mapState(roomState); syncPeople(people); status.textContent = `Matrix salon · ${people.length} participants · reconnecting`; } else { matrixToken = null; matrixRoomId = null; cinematicCue = null; syncPeople(defaultState()); status.textContent = demoCrowd ? "Salon preview · Matrix reconnecting" : "Matrix state unavailable"; } } }
function updatePovCamera() { const angle = { south: 0, southeast: Math.PI / 4, east: Math.PI / 2, northeast: Math.PI * .75, north: Math.PI, northwest: Math.PI * 1.25, west: Math.PI * 1.5, southwest: Math.PI * 1.75 }[localPlayer.direction] ?? 0; const eye = new THREE.Vector3(localPlayer.x, 1.52, localPlayer.z); const look = new THREE.Vector3(localPlayer.x + Math.sin(angle) * 2, 1.42, localPlayer.z + Math.cos(angle) * 2); povCamera.position.copy(eye); povCamera.lookAt(look); povCamera.updateProjectionMatrix(); }
function setViewMode(mode) { setFloorLevel(floorLevel); pov = mode === "pov"; topDown = mode === "topdown"; cinematic = mode === "cinematic"; renderer.shadowMap.enabled = !topDown; participantLayer.visible = !topDown; mapMarkers.visible = topDown; activeCamera = pov ? povCamera : topDown ? mapCamera : cinematic ? cinematicCamera : isoCamera; if (pov) { updatePovCamera(); } else if (topDown) { mapCamera.position.set(0, 24, 11); mapCamera.lookAt(0, 0, 11); } else if (cinematic) { cinematicCamera.position.set(0, 4.6, 9); cinematicCamera.lookAt(0, .7, 0); } else { isoCamera.position.set(8, 8, 8); isoCamera.lookAt(0, .8, 0); } const localFigure = figures.get(localPlayer.id); if (localFigure) localFigure.visible = !pov; controls.object = activeCamera; controls.enableRotate = !pov; controls.enablePan = !pov; controls.target.set(0, topDown ? 11 : .8, 0); cameraButton.textContent = cinematic ? "Isometric view" : "Cinematic view"; mapButton.textContent = topDown ? "Room view" : "Top-down map"; povButton.textContent = pov ? "Exit POV" : "POV"; resize(); }
function leaveTopDownForBillboards() { if (!topDown || Math.abs(mapCamera.position.y - 20) < .08) return; topDown = false; cinematic = false; participantLayer.visible = true; mapMarkers.visible = false; activeCamera = mapCamera; controls.object = mapCamera; controls.enableRotate = true; cameraButton.textContent = "Cinematic view"; mapButton.textContent = "Top-down map"; }
function handleCameraChange() { if (pov) return; if (!topDown && activeCamera === isoCamera) { const offset = isoCamera.position.clone().sub(controls.target); const polar = Math.atan2(Math.hypot(offset.x, offset.z), Math.max(.001, offset.y)); if (polar < .3) { setViewMode("topdown"); return; } } leaveTopDownForBillboards(); }
cameraButton.addEventListener("click", () => setViewMode(cinematic ? "isometric" : "cinematic"));
mapButton.addEventListener("click", () => setViewMode(topDown ? "isometric" : "topdown"));
povButton.addEventListener("click", () => setViewMode(pov ? "isometric" : "pov"));
floorButton?.addEventListener("click", () => { const nextFloor = floorLevel >= 3 ? 0 : floorLevel + 1; if (localPlayerEnabled) { localPlayer.floor = nextFloor; localPlayer.x = stair.x; localPlayer.z = stair.z + 1.0; walkTarget = null; } setFloorLevel(nextFloor); focusHouseLocation(stair.x, stair.z + 1.0, nextFloor); });
controls.addEventListener("change", handleCameraChange);
function resize() { const rect = canvas.getBoundingClientRect(); const w = Math.max(1, rect.width), h = Math.max(1, rect.height); renderer.setSize(w, h, false); isoCamera.left = -8 * w / h; isoCamera.right = 8 * w / h; isoCamera.top = 5; isoCamera.bottom = -5; isoCamera.updateProjectionMatrix(); mapCamera.left = -18; mapCamera.right = 18; mapCamera.top = 18 / Math.max(w / h, .35); mapCamera.bottom = -18 / Math.max(w / h, .35); mapCamera.updateProjectionMatrix(); cinematicCamera.aspect = w / h; cinematicCamera.updateProjectionMatrix(); povCamera.aspect = w / h; povCamera.updateProjectionMatrix(); }
function refreshConversations(now) { const active = [...figures.values()].map((figure) => figure.userData.person).filter((person) => person && person.id !== localPlayer.id); for (const person of active) { if (person.talkingTo) continue; const candidates = active.filter((other) => other.id !== person.id && Math.hypot(other.x - person.x, other.z - person.z) <= (person.speechRange || speechRange)); const target = candidates.sort((a, b) => Math.hypot(a.x - person.x, a.z - person.z) - Math.hypot(b.x - person.x, b.z - person.z))[0]; if (!target) continue; const exchange = Math.floor(now / 11 + (figures.get(person.id)?.userData.phase || 0)) % 5; if (exchange < 3) { person.talkingTo = target.id; person.conversationId = person.conversationId || `local-${Math.floor(now / 11)}`; if (exchange === 0 || exchange === 1) { person.state = "speak"; person.direction = directionFromDelta(target.x - person.x, target.z - person.z, person.direction); } } else { person.talkingTo = null; person.conversationId = null; } } }
function updateCinematicShot(now) { if (!cinematic) return; const cue = cinematicCue; const elapsed = cue ? now - cue.started : 0; if (cue && elapsed > cue.duration + cue.hold) { cinematicCue = null; setViewMode("isometric"); return; } const targetId = cue?.target || cinematicSpeakerId; const targetFigure = targetId ? figures.get(targetId) : null; const target = targetFigure ? targetFigure.position : new THREE.Vector3(0, .8, 0); const shot = cue?.shot || "wide"; const distance = shot === "close" ? 3.2 : shot === "medium" ? 5.2 : 8.8; const side = shot === "pan" ? Math.sin((cue ? elapsed : now) * .35) * 2.2 : 0; const desired = new THREE.Vector3(target.x + side, target.y + (shot === "close" ? .35 : 1.8), target.z + distance); cinematicCamera.position.lerp(desired, .045); cinematicCamera.lookAt(target.x, target.y + (shot === "close" ? .25 : .55), target.z); cinematicCamera.fov = shot === "close" ? 28 : shot === "medium" ? 34 : 40; cinematicCamera.updateProjectionMatrix(); }
function updateLocalPlayer(now) { if (!localPlayerEnabled) return; const keyHorizontal = (pressedKeys.has("d") || pressedKeys.has("arrowright") ? 1 : 0) - (pressedKeys.has("a") || pressedKeys.has("arrowleft") ? 1 : 0); const keyVertical = (pressedKeys.has("s") || pressedKeys.has("arrowdown") ? 1 : 0) - (pressedKeys.has("w") || pressedKeys.has("arrowup") ? 1 : 0); const targetDx = walkTarget ? walkTarget.x - localPlayer.x : 0; const targetDz = walkTarget ? walkTarget.z - localPlayer.z : 0; const targetDistance = Math.hypot(targetDx, targetDz); if (walkTarget && targetDistance < .07) walkTarget = null; const horizontal = keyHorizontal || (walkTarget ? targetDx / Math.max(targetDistance, .001) : 0); const vertical = keyVertical || (walkTarget ? targetDz / Math.max(targetDistance, .001) : 0); const moving = horizontal !== 0 || vertical !== 0; if (moving) { const length = Math.hypot(horizontal, vertical) || 1; const nextX = localPlayer.x + (horizontal / length) * .045; const nextZ = localPlayer.z + (vertical / length) * .045; const safe = safePosition(nextX, nextZ, .22); localPlayer.x = safe.x; localPlayer.z = safe.z; localPlayer.direction = directionFromDelta(horizontal, vertical, localPlayer.direction); localPlayer.state = "walk"; if (Math.hypot(localPlayer.x - stair.x, localPlayer.z - stair.z) < .72) changeFloor(now); } else localPlayer.state = Math.floor(now / 5) % 4 === 0 ? "gesture" : "idle"; const localFigure = figures.get(localPlayer.id); if (localFigure?.userData.person) Object.assign(localFigure.userData.person, localPlayer); const nearby = [...figures.values()].map((figure) => figure.userData.person).filter((person) => person && person.id !== localPlayer.id && Math.hypot(person.x - localPlayer.x, person.z - localPlayer.z) <= localHearingRange); const source = roomState ? `Matrix salon · ${figures.size} participants` : demoCrowd ? `Salon preview · ${peopleCountForStatus()} participants` : "Matrix state unavailable"; status.textContent = `${source}${nearby.length ? ` · hearing ${nearby.length}` : ""}`; }
function peopleCountForStatus() { return figures.size; }
buildRoom(); buildLowerFloor(); buildUpperFloors(); setFloorLevel(floorLevel); setupLighting(); isoCamera.position.set(8, 8, 8); mapCamera.position.set(0, 24, 11); mapCamera.lookAt(0, 0, 11); cinematicCamera.position.set(0, 4.6, 9); cinematicCamera.lookAt(0, .7, 0); setViewMode(topDown ? "topdown" : "isometric"); if (Number.isInteger(requestedFloor) && !requestedRoom) focusHouseLocation(stair.x, stair.z + 1.0, floorLevel); addEventListener("resize", resize); syncPeople(defaultState()); pollMatrix(); setInterval(pollMatrix, 2500); setInterval(pollDialogue, 4000); setInterval(() => { if (rewindIndex >= 0) applyHistorySnapshot(rewindIndex); }, 2500);
function animate() { requestAnimationFrame(animate); const now = clock.elapsedTime; if (fireLight) fireLight.intensity = 3.5 + Math.sin(now * 7.1) * .45 + Math.sin(now * 11.7) * .25; flames.forEach((flame, index) => { const pulse = 1 + Math.sin(now * (5 + index) + index) * .08; flame.scale.set(pulse, 1 + Math.sin(now * 8 + index) * .12, pulse); }); candleLights.forEach((light, index) => { light.intensity = 1.05 + Math.sin(now * 6 + index * 1.9) * .18; }); if (lightningLight) { const flash = Math.max(0, Math.sin(now * .19 + 2.4) - .995) * 140; lightningLight.intensity = flash; } updateLocalPlayer(now); if (pov) updatePovCamera(); mapMarkers.visible = topDown; participantLayer.children.forEach((figure) => { const person = figure.userData.person; if (person && person.id !== localPlayer.id && demoCrowd && !roomState && person.state !== "sit") { const motion = figure.userData.motion; const phase = figure.userData.phase; const previousX = person.x; const previousZ = person.z; person.x = motion.x + Math.sin(now * (.16 + (figure.userData.index % 3) * .025) + phase) * .7; person.z = motion.z + Math.cos(now * (.13 + (figure.userData.index % 4) * .02) + phase) * .42; person.direction = directionFromDelta(person.x - previousX, person.z - previousZ, person.direction); person.state = Math.floor(now / 8 + phase) % 5 === 0 ? "speak" : Math.floor(now / 5 + phase) % 4 === 0 ? "gesture" : Math.floor(now / 3 + phase) % 3 === 0 ? "walk" : "idle"; updateFigure(figure, person, now); } figure.lookAt(activeCamera.position.x, figure.position.y, activeCamera.position.z); }); if (demoCrowd && !roomState) refreshConversations(now); updateCinematicShot(now); controls.update(); updateWallOcclusion(); renderBubbles(); renderer.render(scene, activeCamera); }
animate();
