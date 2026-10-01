import bpy
import bmesh
import sys
from mathutils import Vector

source = sys.argv[-2]
output = sys.argv[-1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('body'))
armature = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
source_meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

def material(name, color, roughness=0.82):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

materials = {
    'burgundy': material('Byron burgundy wool', (0.20, 0.025, 0.035)),
    'sage': material('Mary deep sage muslin', (0.09, 0.19, 0.10)),
    'olive': material('Percy olive broadcloth', (0.12, 0.14, 0.08)),
    'charcoal': material('Polidori blue charcoal wool', (0.07, 0.11, 0.14)),
    'wine': material('Claire wine silk', (0.27, 0.035, 0.055)),
    'linen': material('Warm linen', (0.62, 0.53, 0.39)),
}

def copy_shell(name, garment_mat, keep):
    obj = body.copy()
    obj.data = body.data.copy()
    obj.name = name
    bpy.context.collection.objects.link(obj)
    obj.data.materials.clear()
    obj.data.materials.append(garment_mat)
    # Rebuild every polygon's material index after replacing the source
    # mannequin materials.  The source mesh is multi-material; leaving those
    # indices intact makes the exported coat inherit blue/pink body panels.
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    # Delete body faces outside the garment region in rest-pose coordinates.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for face in list(bm.faces):
        center = face.calc_center_median()
        if not keep(center, face):
            bm.faces.remove(face)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0001)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    obj.scale = (1.035, 1.05, 1.025)
    # Existing armature modifier and vertex groups were copied from the body.
    solid = obj.modifiers.new('Tailored cloth thickness', 'SOLIDIFY')
    solid.thickness = 0.012
    solid.offset = 1.0
    obj['garment'] = True
    obj['source'] = 'fitted over mannequiny.glb body surface'
    return obj

# The shell follows the mannequin's topology rather than floating in front of it.
copy_shell('Regency coat upper shell', materials['burgundy'], lambda c, f: 0.72 <= c.z <= 1.62 and abs(c.x) < 0.34)
copy_shell('Regency linen shirt front', materials['linen'], lambda c, f: 1.18 <= c.z <= 1.62 and c.y > -0.12 and abs(c.x) < 0.24)

# The men’s coat is cut long behind the waist, echoing the 1816 tailcoat
# silhouette instead of ending as a modern short jacket.  It stays a skinned
# shell, so the tails follow the pelvis and spine when the mannequin is posed.
copy_shell('Regency tailcoat tails', materials['burgundy'], lambda c, f: 0.72 <= c.z <= 1.10 and c.y < -0.025 and abs(c.x) < 0.42)

# A small waistcoat overlay is an intentional separate garment layer.
waist = copy_shell('Regency waistcoat shell', materials['olive'], lambda c, f: 1.18 <= c.z <= 1.62 and c.y > -0.12 and abs(c.x) < 0.40)
waist.scale = (1.045, 1.062, 1.035)

# A narrow white cravat bib gives the boys a readable neckline at the salon
# camera distance; it shares the spine weights of the fitted shirt surface.
copy_shell('Regency cravat bib', materials['linen'], lambda c, f: 1.48 <= c.z <= 1.67 and c.y > 0.03 and abs(c.x) < 0.13)

# Keep only clothing in the exported asset; the original body is retained in
# the browser as the wooden mannequin beneath these shells.
for source_mesh in source_meshes:
    source_mesh.hide_render = True
    source_mesh.hide_viewport = True

bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.get('garment') or obj.type == 'ARMATURE':
        obj.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', export_animations=True, export_skins=True, export_morph=False, use_selection=True)
print('EXPORTED', output)
