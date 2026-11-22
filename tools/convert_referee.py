import bpy
import os
import sys

src = os.path.abspath(sys.argv[-2])
out = os.path.abspath(sys.argv[-1])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False, use_prepost_rot=True)

# Normalize scene units without applying destructive mesh edits.
for obj in bpy.context.scene.objects:
    if obj.type == 'ARMATURE':
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        break

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=False, rotation=False, scale=False)

bpy.context.scene.render.fps = 30
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_copyright='User-supplied Daniel Brooks referee model',
    export_animations=True,
    export_skins=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_yup=True,
    export_apply=False,
    export_lights=False,
    export_cameras=False,
)
print(f'EXPORTED {out}')
