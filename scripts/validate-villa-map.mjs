import { readFile } from "node:fs/promises";

const mapPath = new URL("../public/worlds/villa-diodati/isometric-map.json", import.meta.url);
const map = JSON.parse(await readFile(mapPath, "utf8"));
const rooms = Array.isArray(map.rooms) ? map.rooms : [];
const ids = new Set(rooms.map((room) => room.id));
const errors = [];

if (map.coordinateSystem !== "villa-diodati-isometric-v1") errors.push("unexpected coordinate system");
if (!rooms.length) errors.push("no named rooms");

for (const room of rooms) {
  if (!room.id || !Number.isInteger(room.floor) || room.floor < 0 || room.floor > 3) errors.push(`invalid room metadata: ${room.id || "<unnamed>"}`);
  if (![room.x, room.z].every(Number.isFinite)) errors.push(`room has invalid center: ${room.id}`);
  if (room.x < map.bounds.minX || room.x > map.bounds.maxX || room.z < map.bounds.minZ || room.z > map.bounds.maxZ) errors.push(`room outside bounds: ${room.id}`);
  for (const connection of room.connections || []) {
    if (!ids.has(connection)) errors.push(`dangling connection: ${room.id}->${connection}`);
    else if (!(rooms.find((candidate) => candidate.id === connection).connections || []).includes(room.id)) errors.push(`non-reciprocal connection: ${room.id}<->${connection}`);
  }
}

for (const transition of map.floorTransitions || []) {
  if (!transition.id || !Number.isFinite(transition.x) || !Number.isFinite(transition.z)) errors.push(`invalid floor transition: ${transition.id || "<unnamed>"}`);
  if (transition.x < map.bounds.minX || transition.x > map.bounds.maxX || transition.z < map.bounds.minZ || transition.z > map.bounds.maxZ) errors.push(`floor transition outside bounds: ${transition.id}`);
  if (!Array.isArray(transition.levels) || transition.levels.length < 2 || transition.levels.some((level) => ![0, 1, 2, 3].includes(level))) errors.push(`invalid transition levels: ${transition.id}`);
}

const reachable = new Set(["salon"]);
const queue = ["salon"];
while (queue.length) {
  const current = queue.shift();
  for (const next of rooms.find((room) => room.id === current)?.connections || []) if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
}
for (const room of rooms) if (!reachable.has(room.id)) errors.push(`unreachable room: ${room.id}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Villa map valid: ${rooms.length} connected rooms across ${map.floors.length} floors`);
