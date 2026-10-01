import bpy
import sys
from mathutils import Vector

mannequin_path, clothing_path, output = sys.argv[-3:]
bpy.ops.wm.read_factory_settings(use_empty=True)

def import_gltf(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.context.scene.objects if o not in before]

wood_objects = import_gltf(mannequin_path)
for obj in wood_objects:
    if obj.type != 'MESH':
        continue
    wood = bpy.data.materials.new('warm walnut mannequin')
    wood.diffuse_color = (0.24, 0.07, 0.025, 1)
    wood.use_nodes = True
    bsdf = wood.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.24, 0.07, 0.025, 1)
    bsdf.inputs['Roughness'].default_value = 0.52
    obj.data.materials.clear()
    obj.data.materials.append(wood)

clothing_objects = import_gltf(clothing_path)
for obj in clothing_objects:
    if obj.type == 'MESH' and not obj.name.startswith('Regency'):
        obj.hide_render = True

def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

floor_mat = bpy.data.materials.new('dark studio floor')
floor_mat.diffuse_color = (0.035, 0.018, 0.012, 1)
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
bpy.context.object.data.materials.append(floor_mat)

for location, energy, size in [((2.8, -3.2, 3.4), 650, 2.2), ((-2.4, -1.5, 2.0), 360, 1.8), ((0.0, 2.5, 2.8), 450, 1.6)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = 'DISK'
    light.data.size = size
    look_at(light, (0, 0, 0.9))

bpy.ops.object.camera_add(location=(2.35, -4.2, 1.55))
camera = bpy.context.object
camera.data.lens = 58
look_at(camera, (0, 0, 0.9))
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 800
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = output
scene.world = bpy.data.worlds.new('wardrobe studio')
scene.world.color = (0.008, 0.004, 0.002)
bpy.ops.render.render(write_still=True)
print('RENDERED', output)
