import bpy
import sys

source, output = sys.argv[-2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)

for obj in bpy.context.scene.objects:
    obj.select_set(False)
    if obj.type in {'ARMATURE', 'MESH'}:
        obj.select_set(True)

bpy.ops.wm.save_as_mainfile(filepath=output)
print('SAVED', output)
