import bpy
import sys

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        print('MESH', obj.name, [m.name for m in obj.data.materials])
    elif obj.type == 'ARMATURE':
        print('ARMATURE', obj.name)
