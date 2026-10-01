import bpy
import sys

mannequin_path = sys.argv[-3]
dress_path = sys.argv[-2]
output = sys.argv[-1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=mannequin_path)
armature = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('body'))

bpy.ops.import_scene.gltf(filepath=dress_path)
dress = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o != body)
dress.name = 'Mary Regency dress — fitted downloaded mesh'

# Fit the downloaded garment to the mannequin's rest silhouette.
dress.dimensions = (1.18, 0.44, 1.48)
bpy.context.view_layer.objects.active = dress
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
dress.location = (0.0, -0.015, 0.74)

cloth = dress.modifiers.new('Light cloth thickness', 'SOLIDIFY')
cloth.thickness = 0.006
cloth.offset = 1.0

# Transfer the mannequin's armature. The downloaded scan has a very dense,
# irregular surface, so bone-heat auto-weighting is unreliable. Use stable
# garment-region weights instead: skirt to pelvis, bodice to spine, neckline
# to neck. This keeps the dress moving with the seated pose without tearing.
for bone_name in ('pelvis', 'spine_01', 'neck_01'):
    dress.vertex_groups.new(name=bone_name)
for vertex in dress.data.vertices:
    z = vertex.co.z
    group = 'pelvis' if z < 0.66 else 'spine_01' if z < 1.42 else 'neck_01'
    dress.vertex_groups[group].add([vertex.index], 1.0, 'REPLACE')
modifier = dress.modifiers.new('Mannequin armature', 'ARMATURE')
modifier.object = armature
dress.parent = armature

dress['garment'] = 'downloaded CC0 Smithsonian dress'
dress['fit_method'] = 'scaled to mannequin, solidified, automatic armature weights'
body.hide_viewport = True
body.hide_render = True

bpy.ops.object.select_all(action='DESELECT')
dress.select_set(True)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', export_animations=True, export_skins=True)
print('EXPORTED', output)
