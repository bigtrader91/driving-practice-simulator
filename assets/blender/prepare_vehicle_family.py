from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


@dataclass(frozen=True)
class VehicleSource:
    filename: str
    dimensions: tuple[float, float, float]
    player_controls: bool


SOURCES = {
    "compact": VehicleSource("compact-source.glb", (1.60, 3.60, 1.55), True),
    "sedan": VehicleSource("sedan-source.glb", (1.82, 4.68, 1.44), True),
    "suv": VehicleSource("suv-source.glb", (1.91, 4.83, 1.70), True),
    "truck": VehicleSource("truck-source.gltf", (2.30, 7.50, 2.80), False),
}

WHEELBASE = {
    "compact": 2.40,
    "sedan": 2.72,
    "suv": 2.81,
    "truck": 4.20,
}


def repository_root() -> Path:
    if "--" not in sys.argv:
        raise SystemExit("usage: blender --background --python prepare_vehicle_family.py -- REPOSITORY_ROOT")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise SystemExit("expected exactly one REPOSITORY_ROOT argument")
    return Path(arguments[0]).resolve()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def mesh_bounds() -> tuple[Vector, Vector]:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    if not points:
        raise ValueError("source contains no mesh geometry")
    return (
        Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
    )


def material(
    name: str,
    color: tuple[float, float, float, float],
    emission: tuple[float, float, float] | None = None,
    *,
    roughness: float = 0.32,
    metallic: float = 0.0,
) -> bpy.types.Material:
    value = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    value.name = name
    value.diffuse_color = color
    value.use_nodes = True
    principled = value.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = roughness
        principled.inputs["Metallic"].default_value = metallic
        alpha_input = principled.inputs.get("Alpha")
        if alpha_input:
            alpha_input.default_value = color[3]
        if emission:
            emission_input = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
            strength_input = principled.inputs.get("Emission Strength")
            if emission_input:
                emission_input.default_value = (*emission, 1.0)
            if strength_input:
                strength_input.default_value = 1.0
    if color[3] < 1.0:
        value.surface_render_method = "DITHERED"
    return value


def add_box(name: str, size: tuple[float, float, float], location: tuple[float, float, float], value: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(value)
    return obj


def add_empty(name: str, location: tuple[float, float, float]) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    return obj


def rename_source_parts(kind: str) -> None:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    body = max(meshes, key=lambda obj: len(obj.data.vertices))
    body.name = "BODY"

    excluded_paint_names = {"Windows", "Black", "Grey", "Headlights", "TailLights", "BrakeLight"}
    paint_slot = next(
        (slot for slot in body.material_slots if slot.material and slot.material.name not in excluded_paint_names),
        body.material_slots[0],
    )
    if paint_slot.material:
        paint_slot.material.name = "PAINT"

    for slot in body.material_slots:
        if not slot.material:
            continue
        if slot.material.name == "Windows":
            slot.material.name = "SOURCE_GLASS"
            slot.material.diffuse_color[3] = 0.18
            slot.material.use_nodes = True
            principled = slot.material.node_tree.nodes.get("Principled BSDF")
            if principled:
                base_color = principled.inputs["Base Color"].default_value
                principled.inputs["Base Color"].default_value = (*base_color[:3], 0.18)
                alpha_input = principled.inputs.get("Alpha")
                if alpha_input:
                    alpha_input.default_value = 0.18
            slot.material.surface_render_method = "DITHERED"
        elif slot.material.name == "Headlights":
            slot.material.name = "SOURCE_HEADLIGHT"
        elif slot.material.name in {"TailLights", "BrakeLight"}:
            slot.material.name = "SOURCE_BRAKE"

    front_wheels = sorted(
        [obj for obj in meshes if "Front" in obj.name and "Wheel" in obj.name],
        key=lambda obj: obj.matrix_world.translation.x,
    )
    rear_wheels = [obj for obj in meshes if "BackWheel" in obj.name or "BackWheels" in obj.name]
    if len(front_wheels) != 2 or len(rear_wheels) != 1:
        raise ValueError(f"{kind}: unexpected upstream wheel structure")
    front_wheels[0].name = "SOURCE_WHEEL_FL"
    front_wheels[1].name = "SOURCE_WHEEL_FR"
    rear_wheels[0].name = "SOURCE_WHEEL_REAR"


def normalize_source(dimensions: tuple[float, float, float]) -> None:
    top_level = [obj for obj in bpy.context.scene.objects if obj.parent is None]
    root = add_empty("VEHICLE_ROOT", (0, 0, 0))
    for obj in top_level:
        if obj is root:
            continue
        matrix = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = matrix
    root.rotation_euler.z = math.pi
    bpy.context.view_layer.update()

    minimum, maximum = mesh_bounds()
    current = maximum - minimum
    width, length, height = dimensions
    root.scale = (width / current.x, length / current.y, height / current.z)
    bpy.context.view_layer.update()
    minimum, maximum = mesh_bounds()
    root.location.x -= (minimum.x + maximum.x) / 2
    root.location.y -= (minimum.y + maximum.y) / 2
    root.location.z -= minimum.z
    bpy.context.view_layer.update()

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    world_matrices = {obj: obj.matrix_world.copy() for obj in meshes}
    for obj in meshes:
        obj.parent = None
        obj.matrix_world = world_matrices[obj]
    for obj in list(bpy.context.scene.objects):
        if obj.type == "EMPTY":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.view_layer.update()


def add_wheel_handles(kind: str, dimensions: tuple[float, float, float]) -> None:
    width, _, height = dimensions
    wheelbase = WHEELBASE[kind]
    wheel_center_z = 0.32 if kind == "sedan" else height * 0.17
    positions = {
        "WHEEL_FL": (-width * 0.40, wheelbase / 2, wheel_center_z),
        "WHEEL_FR": (width * 0.40, wheelbase / 2, wheel_center_z),
        "WHEEL_RL": (-width * 0.40, -wheelbase / 2, wheel_center_z),
        "WHEEL_RR": (width * 0.40, -wheelbase / 2, wheel_center_z),
    }
    sources = {
        "WHEEL_FL": bpy.data.objects["SOURCE_WHEEL_FL"],
        "WHEEL_FR": bpy.data.objects["SOURCE_WHEEL_FR"],
        "WHEEL_RL": bpy.data.objects["SOURCE_WHEEL_REAR"],
    }
    for name, location in positions.items():
        handle = add_empty(name, location)
        bpy.context.view_layer.update()
        source = sources.get(name)
        if source:
            world = source.matrix_world.copy()
            source.parent = handle
            source.matrix_parent_inverse = Matrix.Identity(4)
            source.matrix_basis = handle.matrix_world.inverted() @ world


def apply_bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new(name="Edge Bevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def add_reference_wheel(root: bpy.types.Object, radius: float, width: float) -> None:
    center = root.matrix_world.translation.copy()
    tire_material = material("TIRE", (0.008, 0.009, 0.011, 1.0), roughness=0.88)
    rim_material = material("RIM", (0.42, 0.48, 0.56, 1.0), roughness=0.24, metallic=0.85)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32,
        radius=radius,
        depth=width,
        location=center,
        rotation=(0, math.pi / 2, 0),
    )
    tire = bpy.context.object
    tire.name = f"{root.name}_TIRE"
    tire.data.materials.append(tire_material)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    tire.parent = root
    tire.matrix_parent_inverse = root.matrix_world.inverted()
    for polygon in tire.data.polygons:
        polygon.use_smooth = True

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32,
        radius=radius * 0.64,
        depth=width + 0.008,
        location=center,
        rotation=(0, math.pi / 2, 0),
    )
    rim = bpy.context.object
    rim.name = f"{root.name}_RIM"
    rim.data.materials.append(rim_material)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    rim.parent = root
    rim.matrix_parent_inverse = root.matrix_world.inverted()
    for polygon in rim.data.polygons:
        polygon.use_smooth = True


def add_reference_wheels() -> None:
    for name in ("WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR"):
        add_reference_wheel(bpy.data.objects[name], radius=0.32, width=0.22)


def remove_sedan_source_wheels() -> None:
    for name in ("SOURCE_WHEEL_FL", "SOURCE_WHEEL_FR", "SOURCE_WHEEL_REAR"):
        source = bpy.data.objects.get(name)
        if source is None:
            raise ValueError(f"sedan: missing source wheel {name}")
        bpy.data.objects.remove(source, do_unlink=True)


def add_cylinder_between(
    name: str,
    start: Vector,
    end: Vector,
    radius: float,
    assigned_material: bpy.types.Material,
) -> bpy.types.Object:
    direction = end - start
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12,
        radius=radius,
        depth=direction.length,
        location=(start + end) / 2,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(assigned_material)
    return obj


def add_reference_cockpit() -> None:
    exterior_root = add_empty("EXTERIOR_ROOT", (0, 0, 0))
    cockpit_root = add_empty("COCKPIT_ROOT", (0, 0, 0))

    cockpit_handles = {"STEERING_WHEEL", "WIPER_L", "WIPER_R"}
    for obj in list(bpy.context.scene.objects):
        if obj in {exterior_root, cockpit_root} or obj.parent is not None:
            continue
        parent_keep_world(obj, cockpit_root if obj.name in cockpit_handles else exterior_root)

    interior = material("INTERIOR", (0.18, 0.22, 0.28, 1.0), (0.05, 0.06, 0.08))
    dashboard = add_box("DASHBOARD", (1.08, 0.12, 0.10), (0, 0.62, 0.67), interior)
    apply_bevel(dashboard, 0.045)
    parent_keep_world(dashboard, cockpit_root)

    instrument_hood = add_box("INSTRUMENT_HOOD", (0.44, 0.14, 0.08), (-0.40, 0.23, 0.86), interior)
    apply_bevel(instrument_hood, 0.035)
    parent_keep_world(instrument_hood, cockpit_root)

    cockpit_hood = add_box("COCKPIT_HOOD", (1.08, 0.40, 0.05), (0, 1.12, 0.68), interior)
    apply_bevel(cockpit_hood, 0.018)
    parent_keep_world(cockpit_hood, cockpit_root)

    roof_lining = add_box("ROOF_LINING", (1.48, 0.08, 0.03), (0, 0.78, 1.49), interior)
    apply_bevel(roof_lining, 0.018)
    parent_keep_world(roof_lining, cockpit_root)

    for side, x in (("DRIVER", -0.40), ("PASSENGER", 0.40)):
        seat_root = add_empty(f"SEAT_{side}", (x, -0.18, 0))
        bpy.context.view_layer.update()
        parent_keep_world(seat_root, cockpit_root)
        seat_base = add_box(f"SEAT_{side}_BASE", (0.46, 0.52, 0.16), (x, -0.18, 0.39), interior)
        apply_bevel(seat_base, 0.045)
        parent_keep_world(seat_base, seat_root)
        seat_back = add_box(f"SEAT_{side}_BACK", (0.46, 0.16, 0.62), (x, -0.43, 0.70), interior)
        apply_bevel(seat_back, 0.045)
        parent_keep_world(seat_back, seat_root)

    pillar_material = material("INTERIOR_PILLAR", (0.12, 0.14, 0.18, 1.0), (0.03, 0.04, 0.06))
    pillar_points = {
        "INNER_A_PILLAR_L": (Vector((-0.82, 0.50, 0.69)), Vector((-0.74, 0.78, 1.48))),
        "INNER_A_PILLAR_R": (Vector((0.82, 0.50, 0.69)), Vector((0.74, 0.78, 1.48))),
        "INNER_B_PILLAR_L": (Vector((-0.77, -0.55, 0.69)), Vector((-0.70, -0.35, 1.30))),
        "INNER_B_PILLAR_R": (Vector((0.77, -0.55, 0.69)), Vector((0.70, -0.35, 1.30))),
    }
    for name, (start, end) in pillar_points.items():
        pillar = add_cylinder_between(name, start, end, 0.018, pillar_material)
        parent_keep_world(pillar, cockpit_root)

    driver_eye = add_empty("DRIVER_EYE", (-0.40, -0.68, 1.20))
    bpy.context.view_layer.update()
    parent_keep_world(driver_eye, cockpit_root)

    steering = bpy.data.objects.get("STEERING_WHEEL")
    steering_rim = bpy.data.objects.get("STEERING_WHEEL_RIM")
    if steering is None or steering_rim is None:
        raise ValueError("sedan: runtime steering wheel handles are missing")
    if steering_rim.parent is not steering:
        parent_keep_world(steering_rim, steering)
    steering.location = (-0.40, 0.28, 0.92)
    steering_rim.scale *= 0.80
    bpy.context.view_layer.update()


def add_runtime_handles(kind: str, dimensions: tuple[float, float, float], player_controls: bool) -> None:
    width, length, height = dimensions
    glass = material("GLASS", (0.08, 0.12, 0.18, 0.20))
    glass.diffuse_color[3] = 0.20
    glass.surface_render_method = "DITHERED"
    headlight = material("HEADLIGHT", (1.0, 0.95, 0.78, 1.0), (1.0, 0.92, 0.7))
    brake = material("BRAKE", (0.65, 0.01, 0.01, 1.0), (0.7, 0.0, 0.0))
    blinker = material("BLINKER", (1.0, 0.28, 0.0, 1.0), (1.0, 0.18, 0.0))
    interior = material("INTERIOR", (0.32, 0.38, 0.46, 1.0), (0.10, 0.13, 0.18))

    add_box("GLASS_FRONT", (width * 0.72, 0.012, height * 0.30), (0, length * 0.16, height * 0.69), glass)
    add_box("GLASS_REAR", (width * 0.68, 0.012, height * 0.27), (0, -length * 0.23, height * 0.68), glass)
    add_box("GLASS_LEFT", (0.012, length * 0.36, height * 0.25), (-width * 0.455, -length * 0.02, height * 0.68), glass)
    add_box("GLASS_RIGHT", (0.012, length * 0.36, height * 0.25), (width * 0.455, -length * 0.02, height * 0.68), glass)

    lamp_y = length / 2 - 0.018
    rear_y = -length / 2 + 0.018
    for side, x in (("L", -width * 0.26), ("R", width * 0.26)):
        add_box(f"HEADLIGHT_{side}", (width * 0.10, 0.035, height * 0.055), (x, lamp_y, height * 0.40), headlight)
        add_box(f"BRAKE_{side}", (width * 0.10, 0.035, height * 0.055), (x, rear_y, height * 0.42), brake)
    for name, x, y in (
        ("BLINKER_FL", -width * 0.29, lamp_y),
        ("BLINKER_FR", width * 0.29, lamp_y),
        ("BLINKER_RL", -width * 0.29, rear_y),
        ("BLINKER_RR", width * 0.29, rear_y),
    ):
        add_box(name, (width * 0.045, 0.038, height * 0.04), (x, y, height * 0.40), blinker)

    if not player_controls:
        return

    steering = add_empty("STEERING_WHEEL", (-width * 0.22, length * 0.10, height * 0.88))
    bpy.ops.mesh.primitive_torus_add(major_radius=width * 0.10, minor_radius=0.018, major_segments=32, minor_segments=8)
    rim = bpy.context.object
    rim.name = "STEERING_WHEEL_RIM"
    rim.rotation_euler.x = math.pi / 2
    rim.data.materials.append(interior)
    rim.parent = steering
    rim.location = (0, 0, 0)

    for name, x in (("WIPER_L", -width * 0.20), ("WIPER_R", width * 0.08)):
        wiper = add_empty(name, (x, length * 0.165, height * 0.54))
        blade = add_box(f"{name}_BLADE", (width * 0.24, 0.015, 0.014), (0, 0, 0), interior)
        blade.parent = wiper
        blade.location = (width * 0.12, 0, 0)


def export_glb(output: Path, *, export_texcoords: bool = True) -> None:
    bpy.ops.object.select_all(action="SELECT")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_materials="EXPORT",
        export_texcoords=export_texcoords,
    )


def prepare_vehicle(root: Path, kind: str, output: Path) -> None:
    source = SOURCES[kind]
    source_dir = root / "assets" / "vehicle-sources" / "quaternius"
    clear_scene()
    source_path = source_dir / source.filename
    if not source_path.is_file():
        raise FileNotFoundError(f"{kind}: missing source {source_path}")
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    rename_source_parts(kind)
    normalize_source(source.dimensions)
    add_wheel_handles(kind, source.dimensions)
    if kind == "sedan":
        remove_sedan_source_wheels()
        add_reference_wheels()
    add_runtime_handles(kind, source.dimensions, source.player_controls)
    if kind == "sedan":
        add_reference_cockpit()
    export_glb(output, export_texcoords=kind != "sedan")
    print(f"PREPARED {kind} from {source_path}")


def main() -> None:
    root = repository_root()
    output_dir = root / "public" / "models" / "vehicles"
    for kind in SOURCES:
        prepare_vehicle(root, kind, output_dir / f"{kind}.glb")


if __name__ == "__main__":
    main()
