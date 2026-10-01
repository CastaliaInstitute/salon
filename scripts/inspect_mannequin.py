import bpy
import sys

path = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
for obj in bpy.context.scene.objects:
    if obj.type == 'ARMATURE':
        print('ARMATURE', obj.name, 'bones', len(obj.data.bones))
        print('BONES', ','.join(b.name for b in obj.data.bones))
    elif obj.type == 'MESH':
        xs = [v.co.x for v in obj.data.vertices]
        ys = [v.co.y for v in obj.data.vertices]
        zs = [v.co.z for v in obj.data.vertices]
        print('MESH', obj.name, 'verts', len(obj.data.vertices), 'polys', len(obj.data.polygons), 'bounds', tuple(round(v, 3) for v in (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))), 'mods', ','.join(m.type for m in obj.modifiers))
