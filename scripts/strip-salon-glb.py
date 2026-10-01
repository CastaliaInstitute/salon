"""Create a room-shell GLB without authored figures or furniture."""
import json
import struct
from pathlib import Path

source = Path("public/worlds/villa-diodati/saloon.glb")
target = Path("public/worlds/villa-diodati/salon.glb")
data = source.read_bytes()
magic, version, total_length = struct.unpack_from("<III", data, 0)
assert magic == 0x46546C67 and version == 2
json_length, json_type = struct.unpack_from("<II", data, 12)
assert json_type == 0x4E4F534A
document = json.loads(data[20:20 + json_length].decode("utf-8"))

def remove_name(name: str) -> bool:
    value = name.lower()
    tokens = (
        "mannequin", "white bust", "reading table", "table leg", "table candelabra",
        "companion chair", "reading chair", "guest chair", "carved settee",
        "writing desk", "bookcase", "book spine", "open manuscript", "loose letter",
        "draft pages", "inkpot", "quill", "gathering rug", "rug inset", "fireplace",
        "fire log", "fire flame", "mantel candlestick",
    )
    return any(token in value for token in tokens)

nodes = document.get("nodes", [])
children = {index: list(node.get("children", [])) for index, node in enumerate(nodes)}
removed = set()

def mark(index):
    if index in removed:
        return
    removed.add(index)
    for child in children.get(index, []):
        mark(child)

for index, node in enumerate(nodes):
    if remove_name(node.get("name", "")):
        mark(index)

for node in nodes:
    if "children" in node:
        node["children"] = [child for child in node["children"] if child not in removed]
for scene in document.get("scenes", []):
    scene["nodes"] = [node for node in scene.get("nodes", []) if node not in removed]

encoded = json.dumps(document, separators=(",", ":")).encode("utf-8")
encoded += b" " * ((4 - len(encoded) % 4) % 4)
binary = data[20 + json_length:]
out = struct.pack("<III", magic, version, 20 + 8 + len(encoded) + len(binary))
out += struct.pack("<II", len(encoded), json_type) + encoded + binary
target.write_bytes(out)
print(f"removed {len(removed)} nodes; wrote {target}")
