import bpy
import sys
from mathutils import Vector

source, output = sys.argv[-2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)

for obj in list(bpy.context.scene.objects):
    if obj.type not in {'MESH', 'ARMATURE'}:
        bpy.data.objects.remove(obj, do_unlink=True)
    elif obj.type == 'MESH' and not obj.name.startswith('Regency'):
        obj.hide_render = True

def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

floor_mat = bpy.data.materials.new('warm studio floor')
floor_mat.diffuse_color = (0.055, 0.035, 0.025, 1)
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
floor = bpy.context.object
floor.data.materials.append(floor_mat)

for location, energy, size in [
    ((2.8, -3.2, 3.4), 850, 2.2),
    ((-2.4, -1.5, 2.0), 500, 1.8),
    ((0.0, 2.5, 2.8), 700, 1.6),
]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = 'DISK'
    light.data.size = size
    look_at(light, (0, 0, 0.9))

bpy.ops.object.camera_add(location=(2.35, -4.2, 1.55))
camera = bpy.context.object
look_at(camera, (0, 0, 0.9))
camera.data.lens = 58
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 800
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = output
scene.world = bpy.data.worlds.new('studio world')
scene.world.color = (0.012, 0.008, 0.006)
bpy.ops.render.render(write_still=True)
print('RENDERED', output)
