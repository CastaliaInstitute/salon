# Villa Diodati animal sprites

The house now uses lightweight eight-direction sprite sheets instead of GLB
animal models:

- `../sprites/animals/sheets/*-directional-v1.png` — eight horizontal cells
  per animal, matching the person direction order: south, southwest, west,
  northwest, north, northeast, east, southeast.
- `../sprites/animals/animals-directional-master-v3.png` — source master atlas.
- `sprite-room/room.js` creates ten roaming actors: one monkey, peacock, dog,
  five cats, crow, and falcon.
- Animals use the same camera-facing billboard approach as the human guests,
  with direction selection while moving, autonomous wandering, and floor-safe
  collision clamping.

The peacock roams the terrace/garden; the dog and most cats roam the salon;
the crow and falcon perch/roam near the rear wall. The atlas is intentionally a
single small raster asset so it remains cheap to load and easy to replace with
hand-authored animation later.
