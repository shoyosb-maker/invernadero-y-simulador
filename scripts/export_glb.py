"""Exporta el invernadero de Blender a GLB para Babylon.js.

Uso:
  blender -b invernadero_v010.blend --python proyecto\ invernadero\scripts\export_glb.py

El exportador glTF no sabe convertir las instancias de Geometry Nodes en una
malla; por eso se anade un nodo Realize Instances a las camas antes de exportar.
Las colecciones PROC_* se muestran temporalmente para que el GLB incluya todos
los procesos (sombreo, barrera, fertirrigacion y postcosecha).
"""

import os
import bpy

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(PROJECT, "public", "invernadero.glb")


def realize_plant_instances() -> None:
    for obj in bpy.data.objects:
        if not obj.name.startswith("Cama_suelo"):
            continue
        for modifier in obj.modifiers:
            node_group = getattr(modifier, "node_group", None)
            if node_group is None:
                continue
            nodes = node_group.nodes
            links = node_group.links
            output = next(
                (node for node in nodes if node.bl_idname == "NodeGroupOutput"),
                None,
            )
            instance_node = next(
                (node for node in nodes if node.bl_idname == "GeometryNodeInstanceOnPoints"),
                None,
            )
            if output is None or instance_node is None:
                continue
            current = output.inputs["Geometry"].links
            if current and current[0].from_node.bl_idname == "GeometryNodeRealizeInstances":
                continue
            for link in list(current):
                links.remove(link)
            realize = nodes.new("GeometryNodeRealizeInstances")
            realize.location = (470, 60)
            links.new(instance_node.outputs["Instances"], realize.inputs["Geometry"])
            links.new(realize.outputs["Geometry"], output.inputs["Geometry"])


def show_process_collections() -> None:
    for collection in bpy.data.collections:
        if collection.name.startswith("PROC_"):
            collection.hide_viewport = False
            collection.hide_render = False


def main() -> None:
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    realize_plant_instances()
    show_process_collections()
    bpy.context.view_layer.update()

    bpy.ops.export_scene.gltf(
        filepath=OUT_PATH,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        use_visible=True,
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
    )
    print("GLB exportado:", OUT_PATH, os.path.getsize(OUT_PATH), "bytes")


if __name__ == "__main__":
    main()
