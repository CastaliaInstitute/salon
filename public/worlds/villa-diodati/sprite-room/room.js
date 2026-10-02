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
const sheetFiles = {
  byron: "byron.png", mary: "mary-godwin.png", claire: "claire-clairmont.png", percy: "percy-shelley.png", polidori: "john-polidori.png"
};
const defaultPeople = [
  ["a.byron", "Lord Byron", "byron", 0, -1.7, "idle", "#202536", "#7a5138", "#8b3340", "#d6a27f"],
  ["a.maryshelley", "Mary Shelley", "mary", -4.25, .9, "idle", "#e9dfc8", "#f7f0dd", "#71805d", "#e5b18d"],
  ["a.clairmont", "Claire Clairmont", "claire", -3.15, 1.15, "idle", "#e9dfc8", "#f7f0dd", "#9b4936", "#c98768"],
  ["a.shelley", "Percy Bysshe Shelley", "percy", 3.35, .95, "idle", "#32425d", "#d9c7a5", "#6d86a8", "#d5a07c"],
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
  box("dado", [11.8, .22, .22], [0, .55, -3.85], 0xa47955);
  box("fireplace", [2.35, 2.2, .5], [0, 1.1, -3.72], 0x71645c);
  box("fire opening", [1.35, .9, .04], [0, .75, -3.99], 0x241916);
  const fire = new THREE.PointLight(0xff9b43, 4, 5); fire.position.set(0, .8, -3.1); room.add(fire);
  box("rug", [6.3, .035, 2.3], [0, .02, 1.1], 0x583743);
  box("sofa", [3.2, .9, .9], [-3.35, .48, .25], 0x70454a, 0);
  box("sofa back", [3.2, 1.3, .22], [-3.35, 1.05, -.18], 0x70454a);
  box("chair by window", [1.15, .85, 1.15], [3.75, .45, .25], 0x704b42, -Math.PI / 2);
  box("chair right", [1.15, .85, 1.15], [2.55, .45, 1.35], 0x704b42, -Math.PI / 2);
  box("reading chair", [1.15, .85, 1.15], [-1.95, .45, 1.65], 0x704b42, Math.PI / 2);
  box("writing table", [1.8, .45, 1.1], [.15, .38, 1.55], 0x51352c);
  for (const x of [-.48, -.18, .18, .48]) { const candle = new THREE.PointLight(0xffc77c, 1.2, 1.5); candle.position.set(x, 1.1, 1.55); room.add(candle); box("candle", [.05, .65, .05], [x, .86, 1.55], 0xe8d0a4); }
}
function setupLighting() {
  scene.add(new THREE.HemisphereLight(0xe6d4c1, 0x241818, 1.8));
  const key = new THREE.DirectionalLight(0xffe0bd, 2.1); key.position.set(-4, 8, 5); key.castShadow = true; scene.add(key);
}
function sheetMaterial(file) {
  if (textureCache.has(file)) return textureCache.get(file);
  const texture = textureLoader.load(`../sprites/v1/${file}`); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearMipMapLinearFilter;
  const material = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { map: { value: texture }, frame: { value: new THREE.Vector2(0, 0) }, coat: { value: new THREE.Color(0xffffff) }, waistcoat: { value: new THREE.Color(0xffffff) }, accent: { value: new THREE.Color(0xffffff) }, skin: { value: new THREE.Color(0xd5a07c) }, ghost: { value: new THREE.Color(0x8fc9ff) }, ghostStrength: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform sampler2D map; uniform vec2 frame; uniform vec3 coat; uniform vec3 waistcoat; uniform vec3 accent; uniform vec3 skin; uniform vec3 ghost; uniform float ghostStrength; varying vec2 vUv; void main(){vec2 cellUv=vec2(vUv.x,.20+vUv.y*.78); vec2 uv=(cellUv+vec2(frame.x,3.0-frame.y))/vec2(8.0,4.0); vec4 c=texture2D(map,uv); float alpha=c.a; if(alpha<.02) discard; float y=fract(cellUv.y); float lower=smoothstep(.18,.42,y)*(1.0-smoothstep(.86,.98,y)); float middle=smoothstep(.38,.58,y)*(1.0-smoothstep(.72,.88,y)); float warmPixels=smoothstep(.08,.28,c.r-c.b); float faceMask=smoothstep(.58,.78,y)*warmPixels; vec3 recolored=mix(c.rgb,coat,.18*lower); recolored=mix(recolored,waistcoat,.15*middle); recolored=mix(recolored,accent,.08*lower); recolored=mix(recolored,skin,.13*faceMask); recolored=mix(recolored,ghost,ghostStrength); gl_FragColor=vec4(recolored,alpha*(1.0-ghostStrength*.42));}` });
  textureCache.set(file, material); return material;
}
function faceMaterial(file) {
  const texture = textureLoader.load(`../sprites/v1/${file}`); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter;
  return new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { map: { value: texture }, column: { value: 0 } }, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform sampler2D map; uniform float column; varying vec2 vUv; void main(){vec2 uv=(vec2(vUv.x,.62+vUv.y*.36)+vec2(column,3.0))/vec2(8.0,4.0); vec4 c=texture2D(map,uv); if(c.a<.04) discard; gl_FragColor=c;}` });
}
function makeFigure(id, name, style, x, z, state = "idle", index = 0, wardrobe = {}) {
  const material = sheetMaterial(sheetFiles[style] || sheetFiles.byron).clone();
  material.uniforms.coat.value.set(wardrobe.coat || "#ffffff"); material.uniforms.waistcoat.value.set(wardrobe.waistcoat || "#ffffff"); material.uniforms.accent.value.set(wardrobe.accent || "#ffffff"); material.uniforms.skin.value.set(wardrobe.skin || "#d5a07c");
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.2), material); mesh.position.set(x, 1.1, z); mesh.scale.setScalar(state === "sit" ? .84 : 1); mesh.userData = { id, name, style, state, index, baseY: 1.1, phase: index * .7, motion: { x, z } }; mesh.castShadow = true; mesh.renderOrder = 5;
  if (id.startsWith("a.")) {
    const auraMaterial = material.clone(); auraMaterial.uniforms.ghostStrength.value = .26; auraMaterial.uniforms.ghost.value.set(0x78bfff);
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 2.27), auraMaterial); aura.position.z = -.012; aura.renderOrder = 4; mesh.add(aura); mesh.userData.glowMesh = aura;
  }
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(.58, .58), faceMaterial(sheetFiles[style] || sheetFiles.byron)); marker.rotation.x = -Math.PI / 2; marker.position.set(x, .035, z); marker.renderOrder = 20; marker.userData.figure = mesh; mapMarkers.add(marker); mesh.userData.mapMarker = marker;
  participantLayer.add(mesh); figures.set(id, mesh); return mesh;
}
function stateRow(state) { return state === "walk" ? 1 : state === "gesture" || state === "speak" ? 2 : 0; }
function directionColumn(direction) { return { south: 0, southwest: 1, west: 2, northwest: 3, north: 4, northeast: 5, east: 6, southeast: 7 }[String(direction || "south").toLowerCase()] ?? 0; }
function updateFigure(mesh, person, now) { const renderState = person.state === "sit" ? "idle" : (person.state || "idle"); mesh.userData.person = person; mesh.position.x = THREE.MathUtils.clamp(person.x, map.minX, map.maxX); mesh.position.z = THREE.MathUtils.clamp(person.z, map.minZ, map.maxZ); mesh.position.y = 1.1; mesh.userData.baseY = 1.1; mesh.scale.setScalar((person.scale || 1) * (person.weight || 1)); mesh.userData.state = renderState; const direction = directionColumn(person.direction); const frame = new THREE.Vector2(direction, stateRow(renderState)); const material = mesh.material; material.uniforms.coat.value.set(person.coat || "#ffffff"); material.uniforms.waistcoat.value.set(person.waistcoat || "#ffffff"); material.uniforms.accent.value.set(person.accent || "#ffffff"); material.uniforms.skin.value.set(person.skin || "#d5a07c"); material.uniforms.frame.value.copy(frame); if (mesh.userData.glowMesh) mesh.userData.glowMesh.material.uniforms.frame.value.copy(frame); if (mesh.userData.mapMarker) { mesh.userData.mapMarker.position.set(mesh.position.x, .035, mesh.position.z); mesh.userData.mapMarker.material.uniforms.column.value = direction; } }
function syncPeople(people) { const now = clock.elapsedTime; for (const person of people) { let figure = figures.get(person.id); if (!figure) figure = makeFigure(person.id, person.name, person.style, person.x, person.z, person.state, figures.size, person); updateFigure(figure, person, now); } }
function defaultState() { const people = defaultPeople.map(([id, name, style, x, z, state, coat, waistcoat, accent, skin]) => ({ id, name, style, x, z, state, coat, waistcoat, accent, skin })); if (demoCrowd) for (let i = people.length; i < 30; i++) { const angle = i * 2.39996; people.push({ id: `demo.guest-${i}`, name: `Guest ${i - 4}`, style: ["byron", "mary", "claire", "percy", "polidori"][i % 5], x: Math.cos(angle) * (1.2 + (i % 4) * .65), z: .8 + Math.sin(angle) * (1.2 + (i % 5) * .42), state: i % 7 === 0 ? "gesture" : i % 3 === 0 ? "walk" : "idle", scale: .72 + (i % 4) * .08, coat: ["#4e536e", "#85514d", "#526b5b", "#6d5260", "#765f4c"][i % 5], waistcoat: "#9a7a62", accent: "#c29a68", skin: ["#f0c4a0", "#d99b75", "#ae6d4e", "#8e563f"][i % 4] }); } return people; }
function mapState(content) { const people = defaultState(); const byId = new Map(people.map((p) => [p.id, p])); for (const [id, p] of Object.entries(content?.positions || {})) { const target = byId.get(id) || byId.get(`a.${id}`); if (target) Object.assign(target, { x: p.x, z: p.z, direction: p.direction, state: p.animation_state || "idle", scale: p.scale, weight: p.weight }); } for (const [id, p] of Object.entries(content?.participants || {})) { const avatar = content?.avatars?.[id] || {}; byId.set(id, { id, name: p.name || "Guest", style: ["byron","mary","claire","percy","polidori"][byId.size % 5], x: p.x, z: p.z, direction: p.direction, state: p.state || "idle", scale: p.scale, weight: p.weight, skin: avatar.skin ? `#${Number(avatar.skin).toString(16).padStart(6, "0")}` : "#c98768", coat: avatar.coat ? `#${Number(avatar.coat).toString(16).padStart(6, "0")}` : "#6d5260", waistcoat: avatar.waistcoat ? `#${Number(avatar.waistcoat).toString(16).padStart(6, "0")}` : "#a78367", accent: avatar.accent ? `#${Number(avatar.accent).toString(16).padStart(6, "0")}` : "#c29a68" }); } return [...byId.values()]; }
let roomState = null;
let matrixToken = null;
let matrixRoomId = null;
async function pollMatrix() { try { if (!matrixToken) { const reg = await fetch("https://matrix.castalia.institute/_matrix/client/v3/register?kind=guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!reg.ok) throw new Error("guest registration"); matrixToken = (await reg.json()).access_token; } if (!matrixRoomId) { const dir = await fetch("https://matrix.castalia.institute/_matrix/client/v3/directory/room/%23villa-diodati%3Amatrix.castalia.institute", { headers: { Authorization: `Bearer ${matrixToken}` } }); if (!dir.ok) throw new Error("room lookup"); matrixRoomId = (await dir.json()).room_id; } const response = await fetch(`https://matrix.castalia.institute/_matrix/client/v3/rooms/${encodeURIComponent(matrixRoomId)}/state`, { headers: { Authorization: `Bearer ${matrixToken}` }, cache: "no-store" }); if (!response.ok) throw new Error("state fetch"); const event = (await response.json()).find((item) => item.type === "org.castalia.salon.room" && !item.state_key); roomState = event?.content || null; const people = mapState(roomState); syncPeople(people); status.textContent = `Matrix salon · ${people.length} participants`; } catch { matrixToken = null; matrixRoomId = null; syncPeople(defaultState()); status.textContent = "Salon preview · Matrix reconnecting"; } }
cameraButton.addEventListener("click", () => { topDown = false; mapMarkers.visible = false; cinematic = !cinematic; activeCamera = cinematic ? cinematicCamera : isoCamera; controls.object = activeCamera; cameraButton.textContent = cinematic ? "Isometric view" : "Cinematic view"; mapButton.textContent = "Top-down map"; resize(); });
mapButton.addEventListener("click", () => { topDown = !topDown; cinematic = false; mapMarkers.visible = topDown; activeCamera = topDown ? mapCamera : isoCamera; controls.object = activeCamera; mapButton.textContent = topDown ? "Room view" : "Top-down map"; cameraButton.textContent = "Cinematic view"; resize(); });
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); isoCamera.left = -8 * w / h; isoCamera.right = 8 * w / h; isoCamera.top = 5; isoCamera.bottom = -5; isoCamera.updateProjectionMatrix(); mapCamera.left = -8 * w / h; mapCamera.right = 8 * w / h; mapCamera.top = 8; mapCamera.bottom = -8; mapCamera.updateProjectionMatrix(); cinematicCamera.aspect = w / h; cinematicCamera.updateProjectionMatrix(); }
buildRoom(); setupLighting(); isoCamera.position.set(8, 8, 8); mapCamera.position.set(0, 14, 0.01); mapCamera.lookAt(0, 0, 0); cinematicCamera.position.set(0, 4.6, 9); cinematicCamera.lookAt(0, .7, 0); if (topDown) { activeCamera = mapCamera; mapMarkers.visible = true; mapButton.textContent = "Room view"; } resize(); addEventListener("resize", resize); syncPeople(defaultState()); pollMatrix(); setInterval(pollMatrix, 2500);
function animate() { requestAnimationFrame(animate); const now = clock.elapsedTime; participantLayer.children.forEach((figure) => { const person = figure.userData.person; if (person && (!roomState || demoCrowd)) { const motion = figure.userData.motion; const phase = figure.userData.phase; person.x = motion.x + Math.sin(now * (.16 + (figure.userData.index % 3) * .025) + phase) * .7; person.z = motion.z + Math.cos(now * (.13 + (figure.userData.index % 4) * .02) + phase) * .42; person.state = Math.floor(now / 8 + phase) % 5 === 0 ? "speak" : Math.floor(now / 5 + phase) % 4 === 0 ? "gesture" : Math.floor(now / 3 + phase) % 3 === 0 ? "walk" : "idle"; updateFigure(figure, person, now); } figure.lookAt(activeCamera.position.x, figure.position.y, activeCamera.position.z); }); controls.update(); renderer.render(scene, activeCamera); }
animate();
