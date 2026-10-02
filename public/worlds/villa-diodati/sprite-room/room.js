import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#room");
const status = document.querySelector("#status");
const cameraButton = document.querySelector("#camera");
const mapButton = document.querySelector("#map-view");
const textureLoader = new THREE.TextureLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17120f);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
const isoCamera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 100);
const cinematicCamera = new THREE.PerspectiveCamera(36, 1, .1, 100);
const mapCamera = new THREE.OrthographicCamera(-8, 8, 8, -8, .1, 100);
let activeCamera = isoCamera;
let cinematic = false;
let topDown = new URLSearchParams(location.search).get("map") === "topdown";
const controls = new OrbitControls(activeCamera, canvas);
controls.enablePan = true; controls.enableDamping = true; controls.dampingFactor = .08;
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
const candleLights = [];
const flames = [];
const sheetFiles = {
  byron: "byron.png", mary: "mary-godwin.png", claire: "claire-clairmont.png", percy: "percy-shelley.png", polidori: "john-polidori.png"
};
const defaultPeople = [
  ["a.byron", "Lord Byron", "byron", 0, -1.7, "idle", "#202536", "#7a5138", "#8b3340", "#d6a27f", 1.1, 1.02],
  ["a.maryshelley", "Mary Shelley", "mary", -4.25, .9, "idle", "#e9dfc8", "#f7f0dd", "#71805d", "#e5b18d"],
  ["a.clairmont", "Claire Clairmont", "claire", -3.15, 1.15, "idle", "#e9dfc8", "#f7f0dd", "#9b4936", "#c98768"],
  ["a.shelley", "Percy Bysshe Shelley", "percy", 3.35, .95, "idle", "#253b62", "#d9c7a5", "#8ca9d2", "#d5a07c", .91, .88],
  ["a.polidori", "John Polidori", "polidori", -1.25, 2.25, "idle", "#17191c", "#674936", "#9c7652", "#a96f50"],
];
const demoCrowd = new URLSearchParams(location.search).get("demo") === "30";

function mat(color, roughness = .72) { return new THREE.MeshStandardMaterial({ color, roughness, metalness: .03 }); }
function box(name, size, position, color, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color));
  mesh.name = name; mesh.position.set(...position); mesh.rotation.y = rotation; mesh.castShadow = true; mesh.receiveShadow = true; room.add(mesh); return mesh;
}
function buildRoom() {
  const floor = box("oak parquet floor", [12, .12, 9], [0, -.12, .5], 0x76513e); floor.receiveShadow = true;
  for (let x = -5.5; x <= 5.5; x += .55) box("floor inlay", [.018, .015, 8.4], [x, -.045, .5], 0x9a6b4d);
  for (let z = -3.5; z <= 4.5; z += .55) box("floor inlay", [11.5, .015, .018], [0, -.04, z], 0x5f3f36);
  box("rear wall", [12, 4.3, .18], [0, 2.05, -4], 0x3d3435);
  box("left wall", [.18, 4.3, 8.2], [-6, 2.05, .1], 0x4a3a38);
  box("right wall", [.18, 4.3, 8.2], [6, 2.05, .1], 0x4a3a38);
  for (const x of [-4.25, 4.25]) {
    box("window recess", [1.8, 2.35, .08], [x, 2.45, -3.88], 0x182b3c);
    box("window mullion", [.1, 2.1, .1], [x, 2.45, -3.8], 0x9d704d);
    box("window sill", [1.9, .12, .22], [x, 1.25, -3.72], 0xb3875c);
    box("curtain", [.28, 3.1, .3], [x + (x < 0 ? -.82 : .82), 2.45, -3.7], 0x80605b);
  }
  box("dado", [11.8, .22, .22], [0, .55, -3.85], 0xa47955);
  for (const x of [-3.8, 3.8]) {
    box("art frame", [1.25, 1.55, .08], [x, 2.55, -3.88], 0xa47a50);
    box("wall painting", [1.02, 1.3, .03], [x, 2.55, -3.94], x < 0 ? 0x34495b : 0x5e3b42);
  }
  box("fireplace", [2.35, 2.2, .5], [0, 1.1, -3.72], 0x71645c);
  box("fire opening", [1.35, .9, .04], [0, .75, -3.99], 0x241916);
  fireLight = new THREE.PointLight(0xff9b43, 4, 5); fireLight.position.set(0, .8, -3.1); room.add(fireLight);
  const fireOuter = new THREE.Mesh(new THREE.ConeGeometry(.48, 1.15, 7), new THREE.MeshBasicMaterial({ color: 0xff6b2e, transparent: true, opacity: .9 })); fireOuter.position.set(0, .82, -4.05); room.add(fireOuter); flames.push(fireOuter);
  const fireInner = new THREE.Mesh(new THREE.ConeGeometry(.24, .72, 7), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: .95 })); fireInner.position.set(0, .72, -4.08); room.add(fireInner); flames.push(fireInner);
  box("rug", [6.3, .035, 2.3], [0, .02, 1.1], 0x583743);
  box("sofa", [3.2, .9, .9], [-3.35, .48, .25], 0x70454a, 0);
  box("sofa back", [3.2, 1.3, .22], [-3.35, 1.05, -.18], 0x70454a);
  box("chair by window", [1.15, .85, 1.15], [3.75, .45, .25], 0x704b42, -Math.PI / 2);
  box("chair right", [1.15, .85, 1.15], [2.55, .45, 1.35], 0x704b42, -Math.PI / 2);
  box("reading chair", [1.15, .85, 1.15], [-1.95, .45, 1.65], 0x704b42, Math.PI / 2);
  box("writing table", [1.8, .45, 1.1], [.15, .38, 1.55], 0x51352c);
  for (const x of [-.48, -.18, .18, .48]) { const candle = new THREE.PointLight(0xffc77c, 1.2, 1.5); candle.position.set(x, 1.1, 1.55); room.add(candle); candleLights.push(candle); box("candle", [.05, .65, .05], [x, .86, 1.55], 0xe8d0a4); const flame = new THREE.Mesh(new THREE.ConeGeometry(.06, .2, 5), new THREE.MeshBasicMaterial({ color: 0xffd37a })); flame.position.set(x, 1.22, 1.55); room.add(flame); flames.push(flame); }
  lightningLight = new THREE.PointLight(0xb9ddff, 0, 18); lightningLight.position.set(0, 4, 1); scene.add(lightningLight);
}
function setupLighting() {
  scene.add(new THREE.HemisphereLight(0xe6d4c1, 0x241818, 1.8));
  const key = new THREE.DirectionalLight(0xffe0bd, 2.1); key.position.set(-4, 8, 5); key.castShadow = true; scene.add(key);
}
function sheetMaterial(file) {
  if (textureCache.has(file)) return textureCache.get(file);
  const texture = textureLoader.load(`../sprites/v1/${file}`); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const material = new THREE.ShaderMaterial({ transparent: true, depthTest: true, depthWrite: false, uniforms: { map: { value: texture }, frame: { value: new THREE.Vector2(0, 0) }, coat: { value: new THREE.Color(0xffffff) }, waistcoat: { value: new THREE.Color(0xffffff) }, accent: { value: new THREE.Color(0xffffff) }, skin: { value: new THREE.Color(0xd5a07c) }, ghost: { value: new THREE.Color(0x8fc9ff) }, ghostStrength: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform sampler2D map; uniform vec2 frame; uniform vec3 coat; uniform vec3 waistcoat; uniform vec3 accent; uniform vec3 skin; uniform vec3 ghost; uniform float ghostStrength; varying vec2 vUv; void main(){vec2 cellUv=vec2(vUv.x,.02+vUv.y*.84); vec2 uv=(cellUv+vec2(frame.x,3.0-frame.y))/vec2(8.0,4.0); vec4 c=texture2D(map,uv); float alpha=c.a; if(alpha<.02) discard; float y=fract(cellUv.y); float lower=smoothstep(.18,.42,y)*(1.0-smoothstep(.86,.98,y)); float middle=smoothstep(.38,.58,y)*(1.0-smoothstep(.72,.88,y)); float warmPixels=smoothstep(.08,.28,c.r-c.b); float faceMask=smoothstep(.58,.78,y)*warmPixels; vec3 recolored=mix(c.rgb,coat,.18*lower); recolored=mix(recolored,waistcoat,.15*middle); recolored=mix(recolored,accent,.08*lower); recolored=mix(recolored,skin,.13*faceMask); recolored=mix(recolored,ghost,ghostStrength); gl_FragColor=vec4(recolored,alpha*(1.0-ghostStrength*.42));}` });
  textureCache.set(file, material); return material;
}
function faceMaterial(file) {
  const texture = textureLoader.load(`../sprites/v1/${file}`); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter;
  return new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { map: { value: texture }, column: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform sampler2D map; uniform float column; varying vec2 vUv; void main(){vec2 uv=(vec2(vUv.x,.62+vUv.y*.36)+vec2(column,3.0))/vec2(8.0,4.0); vec4 c=texture2D(map,uv); if(c.a<.04) discard; gl_FragColor=c;}` });
}
function heldProp(kind) {
  if (!kind) return null;
  const group = new THREE.Group(); group.position.set(.42, -.08, .06); group.renderOrder = 8;
  if (kind === "book") { const book = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, .22), new THREE.MeshStandardMaterial({ color: 0x6c3440, roughness: .6 })); book.rotation.z = -.18; group.add(book); }
  if (kind === "cup") { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.065, .055, .13, 12), new THREE.MeshStandardMaterial({ color: 0xd7c39b, roughness: .35 })); cup.rotation.z = -.18; group.add(cup); }
  if (kind === "glass") { const glass = new THREE.Mesh(new THREE.CylinderGeometry(.055, .04, .15, 12), new THREE.MeshPhysicalMaterial({ color: 0xc8e9ed, transparent: true, opacity: .7, roughness: .12, transmission: .2 })); glass.rotation.z = -.12; group.add(glass); }
  if (kind === "candelabra") { const stem = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, .25, 8), new THREE.MeshStandardMaterial({ color: 0xd1aa68, metalness: .5, roughness: .3 })); group.add(stem); for (const offset of [-.07, 0, .07]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .12, 8), stem.material); arm.position.set(offset, .09, 0); group.add(arm); const flame = new THREE.Mesh(new THREE.ConeGeometry(.022, .07, 5), new THREE.MeshBasicMaterial({ color: 0xffd47d })); flame.position.set(offset, .17, 0); group.add(flame); } }
  return group;
}
function setHeldProp(mesh, kind) { if (mesh.userData.heldProp) mesh.remove(mesh.userData.heldProp); mesh.userData.heldProp = heldProp(kind); if (mesh.userData.heldProp) mesh.add(mesh.userData.heldProp); }
function makeFigure(id, name, style, x, z, state = "idle", index = 0, wardrobe = {}) {
  const material = sheetMaterial(sheetFiles[style] || sheetFiles.byron).clone();
  material.uniforms.coat.value.set(wardrobe.coat || "#ffffff"); material.uniforms.waistcoat.value.set(wardrobe.waistcoat || "#ffffff"); material.uniforms.accent.value.set(wardrobe.accent || "#ffffff"); material.uniforms.skin.value.set(wardrobe.skin || "#d5a07c");
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.2), material); mesh.position.set(x, 1.1, z); mesh.scale.setScalar(state === "sit" ? .84 : 1); mesh.userData = { id, name, style, state, index, baseY: 1.1, phase: index * .7, motion: { x, z } }; mesh.castShadow = true; mesh.renderOrder = 5; setHeldProp(mesh, wardrobe.held); mesh.userData.heldKind = wardrobe.held || null;
  if (id.startsWith("a.")) {
    const auraMaterial = material.clone(); auraMaterial.depthTest = true; auraMaterial.uniforms.ghostStrength.value = .22; auraMaterial.uniforms.ghost.value.set(0xb8f3ff);
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 2.27), auraMaterial); aura.position.z = -.012; aura.renderOrder = 4; mesh.add(aura); mesh.userData.glowMesh = aura;
  }
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(.58, .58), faceMaterial(sheetFiles[style] || sheetFiles.byron)); marker.rotation.x = -Math.PI / 2; marker.position.set(x, .035, z); marker.renderOrder = 20; marker.userData.figure = mesh; mapMarkers.add(marker); mesh.userData.mapMarker = marker;
  participantLayer.add(mesh); figures.set(id, mesh); return mesh;
}
function stateRow(state) { return state === "walk" ? 1 : state === "gesture" ? 2 : state === "sit" ? 3 : state === "speak" ? 4 : 0; }
function directionColumn(direction) { return { south: 0, southwest: 1, west: 2, northwest: 3, north: 4, northeast: 5, east: 6, southeast: 7 }[String(direction || "south").toLowerCase()] ?? 0; }
function updateFigure(mesh, person, now) { const renderState = person.state || "idle"; mesh.userData.person = person; mesh.position.x = THREE.MathUtils.clamp(person.x, map.minX, map.maxX); mesh.position.z = THREE.MathUtils.clamp(person.z, map.minZ, map.maxZ); mesh.position.y = 1.1; mesh.userData.baseY = 1.1; const bodyScale = (person.scale || 1) * (person.weight || 1); const width = person.width || 1; mesh.scale.set(width * bodyScale, bodyScale, bodyScale); mesh.userData.state = renderState; const direction = directionColumn(person.direction); const frame = new THREE.Vector2(direction, stateRow(renderState)); const material = mesh.material; material.uniforms.coat.value.set(person.coat || "#ffffff"); material.uniforms.waistcoat.value.set(person.waistcoat || "#ffffff"); material.uniforms.accent.value.set(person.accent || "#ffffff"); material.uniforms.skin.value.set(person.skin || "#d5a07c"); material.uniforms.frame.value.copy(frame); if (mesh.userData.glowMesh) mesh.userData.glowMesh.material.uniforms.frame.value.copy(frame); if (mesh.userData.mapMarker) { mesh.userData.mapMarker.position.set(mesh.position.x, .035, mesh.position.z); mesh.userData.mapMarker.material.uniforms.column.value = direction; } if ((mesh.userData.heldKind || null) !== (person.held || null)) { mesh.userData.heldKind = person.held || null; setHeldProp(mesh, person.held); } }
function syncPeople(people) { const now = clock.elapsedTime; for (const person of people) { let figure = figures.get(person.id); if (!figure) figure = makeFigure(person.id, person.name, person.style, person.x, person.z, person.state, figures.size, person); updateFigure(figure, person, now); } }
function defaultState() { const people = defaultPeople.map(([id, name, style, x, z, state, coat, waistcoat, accent, skin, scale, width]) => ({ id, name, style, x, z, state, coat, waistcoat, accent, skin, scale, width })); if (demoCrowd) for (let i = people.length; i < 30; i++) { const angle = i * 2.39996; people.push({ id: `demo.guest-${i}`, name: `Guest ${i - 4}`, style: ["byron", "mary", "claire", "percy", "polidori"][i % 5], x: Math.cos(angle) * (1.2 + (i % 4) * .65), z: .8 + Math.sin(angle) * (1.2 + (i % 5) * .42), state: i % 7 === 0 ? "gesture" : i % 3 === 0 ? "walk" : "idle", scale: .72 + (i % 4) * .08, width: .88 + (i % 3) * .08, coat: ["#4e536e", "#85514d", "#526b5b", "#6d5260", "#765f4c"][i % 5], waistcoat: "#9a7a62", accent: "#c29a68", skin: ["#f0c4a0", "#d99b75", "#ae6d4e", "#8e563f"][i % 4] }); } return people; }
function mapState(content) { const people = defaultState(); const byId = new Map(people.map((p) => [p.id, p])); for (const [id, p] of Object.entries(content?.positions || {})) { const target = byId.get(id) || byId.get(`a.${id}`); if (target) { Object.assign(target, { x: p.x, z: p.z, direction: p.direction, state: p.animation_state || "idle", held: p.held }); if (p.scale != null) target.scale = p.scale; if (p.weight != null) target.weight = p.weight; if (p.width != null) target.width = p.width; } } for (const [id, p] of Object.entries(content?.participants || {})) { const avatar = content?.avatars?.[id] || {}; byId.set(id, { id, name: p.name || "Guest", style: ["byron","mary","claire","percy","polidori"][byId.size % 5], x: p.x, z: p.z, direction: p.direction, state: p.state || "idle", scale: p.scale, weight: p.weight, width: p.width, held: p.held, skin: avatar.skin ? `#${Number(avatar.skin).toString(16).padStart(6, "0")}` : "#c98768", coat: avatar.coat ? `#${Number(avatar.coat).toString(16).padStart(6, "0")}` : "#6d5260", waistcoat: avatar.waistcoat ? `#${Number(avatar.waistcoat).toString(16).padStart(6, "0")}` : "#a78367", accent: avatar.accent ? `#${Number(avatar.accent).toString(16).padStart(6, "0")}` : "#c29a68" }); } return [...byId.values()]; }
let roomState = null;
let matrixToken = null;
let matrixRoomId = null;
async function pollMatrix() { try { if (!matrixToken) { const reg = await fetch("https://matrix.castalia.institute/_matrix/client/v3/register?kind=guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!reg.ok) throw new Error("guest registration"); matrixToken = (await reg.json()).access_token; } if (!matrixRoomId) { const dir = await fetch("https://matrix.castalia.institute/_matrix/client/v3/directory/room/%23villa-diodati%3Amatrix.castalia.institute", { headers: { Authorization: `Bearer ${matrixToken}` } }); if (!dir.ok) throw new Error("room lookup"); matrixRoomId = (await dir.json()).room_id; } const response = await fetch(`https://matrix.castalia.institute/_matrix/client/v3/rooms/${encodeURIComponent(matrixRoomId)}/state`, { headers: { Authorization: `Bearer ${matrixToken}` }, cache: "no-store" }); if (!response.ok) throw new Error("state fetch"); const event = (await response.json()).find((item) => item.type === "org.castalia.salon.room" && !item.state_key); roomState = event?.content || null; const people = mapState(roomState); syncPeople(people); status.textContent = `Matrix salon · ${people.length} participants`; } catch { matrixToken = null; matrixRoomId = null; syncPeople(defaultState()); status.textContent = "Salon preview · Matrix reconnecting"; } }
cameraButton.addEventListener("click", () => { topDown = false; mapMarkers.visible = false; cinematic = !cinematic; activeCamera = cinematic ? cinematicCamera : isoCamera; controls.object = activeCamera; cameraButton.textContent = cinematic ? "Isometric view" : "Cinematic view"; mapButton.textContent = "Top-down map"; resize(); });
mapButton.addEventListener("click", () => { topDown = !topDown; cinematic = false; mapMarkers.visible = topDown; activeCamera = topDown ? mapCamera : isoCamera; controls.object = activeCamera; mapButton.textContent = topDown ? "Room view" : "Top-down map"; cameraButton.textContent = "Cinematic view"; resize(); });
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); isoCamera.left = -8 * w / h; isoCamera.right = 8 * w / h; isoCamera.top = 5; isoCamera.bottom = -5; isoCamera.updateProjectionMatrix(); mapCamera.left = -8 * w / h; mapCamera.right = 8 * w / h; mapCamera.top = 8; mapCamera.bottom = -8; mapCamera.updateProjectionMatrix(); cinematicCamera.aspect = w / h; cinematicCamera.updateProjectionMatrix(); }
buildRoom(); setupLighting(); isoCamera.position.set(8, 8, 8); mapCamera.position.set(0, 14, 0.01); mapCamera.lookAt(0, 0, 0); cinematicCamera.position.set(0, 4.6, 9); cinematicCamera.lookAt(0, .7, 0); if (topDown) { activeCamera = mapCamera; mapMarkers.visible = true; mapButton.textContent = "Room view"; } resize(); addEventListener("resize", resize); syncPeople(defaultState()); pollMatrix(); setInterval(pollMatrix, 2500);
function animate() { requestAnimationFrame(animate); const now = clock.elapsedTime; if (fireLight) fireLight.intensity = 3.5 + Math.sin(now * 7.1) * .45 + Math.sin(now * 11.7) * .25; flames.forEach((flame, index) => { const pulse = 1 + Math.sin(now * (5 + index) + index) * .08; flame.scale.set(pulse, 1 + Math.sin(now * 8 + index) * .12, pulse); }); candleLights.forEach((light, index) => { light.intensity = 1.05 + Math.sin(now * 6 + index * 1.9) * .18; }); if (lightningLight) { const flash = Math.max(0, Math.sin(now * .19 + 2.4) - .995) * 140; lightningLight.intensity = flash; } participantLayer.children.forEach((figure) => { const person = figure.userData.person; if (person && (!roomState || demoCrowd)) { const motion = figure.userData.motion; const phase = figure.userData.phase; person.x = motion.x + Math.sin(now * (.16 + (figure.userData.index % 3) * .025) + phase) * .7; person.z = motion.z + Math.cos(now * (.13 + (figure.userData.index % 4) * .02) + phase) * .42; person.state = Math.floor(now / 8 + phase) % 5 === 0 ? "speak" : Math.floor(now / 5 + phase) % 4 === 0 ? "gesture" : Math.floor(now / 3 + phase) % 3 === 0 ? "walk" : "idle"; updateFigure(figure, person, now); } figure.lookAt(activeCamera.position.x, figure.position.y, activeCamera.position.z); }); controls.update(); renderer.render(scene, activeCamera); }
animate();
