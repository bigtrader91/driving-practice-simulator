from __future__ import annotations

import hashlib
import math
import os
import shutil
import sys
import tempfile
from collections.abc import Callable
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_vehicles as validator


TARGET_DIMENSIONS = Vector(validator.TRAFFIC_SEDAN_DIMENSIONS)
MAX_TRIANGLES = validator.MAX_RUNTIME_TRIANGLES
MAX_BYTES = validator.MAX_RUNTIME_BYTES
DECIMATION_TARGET = 44_000
REMOVED_OBJECT_TYPES = {"CAMERA", "LIGHT"}
REQUIRED_ROOTS = ("WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR")
REQUIRED_LIGHTS = (
    "HEADLIGHT_L",
    "HEADLIGHT_R",
    "BRAKE_L",
    "BRAKE_R",
    "BLINKER_FL",
    "BLINKER_FR",
    "BLINKER_RL",
    "BLINKER_RR",
)
MUTABLE_MATERIALS = ("PAINT", "HEADLIGHT", "BRAKE", "BLINKER")
SOURCE_WHEELS = {
    "WheelFrontL": "WHEEL_FL",
    "WheelFrontR": "WHEEL_FR",
    "WheelRearL": "WHEEL_RL",
    "WheelRearR": "WHEEL_RR",
}
PRESENTATION_OBJECTS = {
    "Cube",
    "Khronos",
    "KhronosLogo",
    "3DCommerce",
    "3DCommerceLogo",
    "License Plate",
}
HIDDEN_DETAIL_OBJECTS = {
    "Engine",
    "Axles",
    "BodyWindshieldWipers",
    "BodyWindshieldWipersBase",
    "BodyHoodInterior01",
    "BodyHoodInterior02",
    "BodyHoodUnder",
    "InteriorFloormats",
    "InteriorPedalAccel",
    "InteriorPedalAccelArm",
    "InteriorPedalBrake",
    "InteriorPedalBrakeArm",
    "InteriorSeatsFrame1",
    "InteriorSeatsFrame2",
    "InteriorSteeringBase",
    "InteriorSteeringCylinder",
    "InteriorSteeringEmblem",
    "InteriorSteeringWheel01",
    "InteriorSteeringWheel02",
    "InteriorSteeringWheel03",
    "InteriorSteeringWheel04",
    "InteriorSteeringDashColumn",
    "InteriorSteeringHandleL",
    "InteriorSteeringHandleR",
    "InteriorDoorL01",
    "InteriorDoorL02",
    "InteriorDoorL03",
    "InteriorDoorL04",
    "InteriorDoorL05",
    "InteriorDoorL06",
    "InteriorDoorR01",
    "InteriorDoorR02",
    "InteriorDoorR03",
    "InteriorDoorR04",
    "InteriorDoorR05",
    "InteriorDoorR06",
    "WheelFrontLBrakePad",
    "WheelFrontLBrakeDisc",
    "WheelFrontRBrakePad",
    "WheelFrontRBrakeDisc",
    "WheelRearLBrakePad",
    "WheelRearLBrakeDisc",
    "WheelRearRBrakePad",
    "WheelRearRBrakeDisc",
}
GLASS_OBJECTS = {
    "BodyWindshield": "GLASS_FRONT",
    "BodyRearwindow": "GLASS_REAR",
    "BodyDoorLWindow": "GLASS_LEFT",
    "BodyDoorRWindow": "GLASS_RIGHT",
}
DETAIL_OBJECTS = {
    "BodyHoodTopgrill": "GRILLE",
    "BodyHeadlights": "SOURCE_HEADLIGHTS",
    "BodyTaillights": "SOURCE_TAILLIGHTS",
    "BodyTurnsignalsRear": "SOURCE_REAR_SIGNALS",
}


def parse_arguments(arguments: list[str]) -> tuple[Path, Path, Path, Path, Path]:
    if len(arguments) != 5:
        raise SystemExit("expected exactly five path arguments")
    return tuple(Path(value).resolve() for value in arguments)  # type: ignore[return-value]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def select_only(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def world_bounds(objects: list[bpy.types.Object] | None = None) -> tuple[Vector, Vector]:
    measured = objects or mesh_objects()
    corners = [obj.matrix_world @ Vector(corner) for obj in measured for corner in obj.bound_box]
    if not corners:
        raise SystemExit("Khronos source GLB contains no mesh geometry")
    return (
        Vector(tuple(min(vertex[index] for vertex in corners) for index in range(3))),
        Vector(tuple(max(vertex[index] for vertex in corners) for index in range(3))),
    )


def triangle_count() -> int:
    total = 0
    seen: set[int] = set()
    for obj in mesh_objects():
        identity = obj.data.as_pointer()
        if identity in seen:
            continue
        seen.add(identity)
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
    emission: tuple[float, float, float, float] | None = None,
) -> bpy.types.Material:
    result = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = color
    shader = result.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Alpha"].default_value = color[3]
        if emission and "Emission Color" in shader.inputs:
            shader.inputs["Emission Color"].default_value = emission
            shader.inputs["Emission Strength"].default_value = 1.5
    return result


def assign_material(obj: bpy.types.Object, assigned: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(assigned)


def remove_recorded_content() -> None:
    for obj in list(bpy.context.scene.objects):
        if (
            obj.type in REMOVED_OBJECT_TYPES
            or obj.name in PRESENTATION_OBJECTS
            or obj.name in HIDDEN_DETAIL_OBJECTS
            or "Khronos" in obj.name
            or "3DCommerce" in obj.name
        ):
            bpy.data.objects.remove(obj, do_unlink=True)


def collect_source_wheel_assemblies() -> dict[str, list[bpy.types.Object]]:
    assemblies: dict[str, list[bpy.types.Object]] = {}
    for source_name, runtime_name in SOURCE_WHEELS.items():
        source_root = bpy.data.objects.get(source_name)
        if source_root is None:
            raise SystemExit(f"Khronos source GLB is missing wheel root {source_name}")
        children = [obj for obj in source_root.children_recursive if obj.type == "MESH"]
        if not children:
            raise SystemExit(f"Khronos wheel root {source_name} has no mesh assembly")
        rims = [child for child in children if "rim" in child.name.casefold()]
        tires = [child for child in children if child not in rims]
        if len(rims) != 1 or len(tires) != 1:
            raise SystemExit(
                f"Khronos wheel root {source_name} must contain one tire and one rim after cleanup"
            )
        tires[0].name = f"{runtime_name}_TIRE"
        rims[0].name = f"{runtime_name}_RIM"
        assemblies[runtime_name] = [tires[0], rims[0]]
    return assemblies


def rebuild_meshes_in_world_space() -> None:
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        world = obj.matrix_world.copy()
        obj.parent = None
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        obj.data.transform(world)
        obj.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()


def join_named(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    if not objects:
        raise SystemExit(f"Khronos source GLB cannot produce required node {name}")
    select_only(objects)
    if len(objects) > 1:
        bpy.ops.object.join()
    result = objects[0]
    result.name = name
    return result


def bind_source_contract() -> tuple[bpy.types.Object, dict[str, bpy.types.Material]]:
    paint = material("PAINT", (0.24, 0.018, 0.028, 1.0), metallic=0.72, roughness=0.24)
    glass = material("GLASS", (0.018, 0.035, 0.055, 0.50), metallic=0.12, roughness=0.14)
    trim = material("TRIM", (0.025, 0.028, 0.032, 1.0), metallic=0.35, roughness=0.32)
    tire = material("TIRE", (0.008, 0.009, 0.011, 1.0), roughness=0.92)
    rim = material("RIM", (0.48, 0.52, 0.58, 1.0), metallic=0.92, roughness=0.20)
    headlight = material(
        "HEADLIGHT",
        (0.82, 0.91, 1.0, 1.0),
        roughness=0.12,
        emission=(0.72, 0.86, 1.0, 1.0),
    )
    brake = material(
        "BRAKE",
        (0.72, 0.006, 0.008, 1.0),
        roughness=0.18,
        emission=(1.0, 0.0, 0.0, 1.0),
    )
    blinker = material(
        "BLINKER",
        (1.0, 0.20, 0.005, 1.0),
        roughness=0.16,
        emission=(1.0, 0.08, 0.0, 1.0),
    )
    materials = {
        "paint": paint,
        "glass": glass,
        "trim": trim,
        "tire": tire,
        "rim": rim,
        "headlight": headlight,
        "brake": brake,
        "blinker": blinker,
    }

    for source_name, runtime_name in GLASS_OBJECTS.items():
        obj = bpy.data.objects.get(source_name)
        if obj is None:
            raise SystemExit(f"Khronos source GLB is missing glass mesh {source_name}")
        obj.name = runtime_name
        assign_material(obj, glass)

    for source_name, runtime_name in DETAIL_OBJECTS.items():
        obj = bpy.data.objects.get(source_name)
        if obj is not None:
            obj.name = runtime_name
            if runtime_name.startswith("MIRROR"):
                assign_material(obj, paint)
            elif runtime_name == "GRILLE":
                assign_material(obj, trim)

    for side in ("L", "R"):
        mirror_parts = [
            obj
            for obj in mesh_objects()
            if obj.name.startswith(f"BodyDoor{side}Mirror")
        ]
        mirror = join_named(mirror_parts, f"MIRROR_{side}")
        assign_material(mirror, paint)

    reserved = set(GLASS_OBJECTS.values()) | set(DETAIL_OBJECTS.values())
    body_parts = [
        obj
        for obj in mesh_objects()
        if obj.name not in reserved
        and obj.name.startswith("Body")
        and "Window" not in obj.name
        and "window" not in obj.name
        and "Mirror" not in obj.name
        and "Headlight" not in obj.name
        and "Taillight" not in obj.name
        and "Turnsignal" not in obj.name
    ]
    body = join_named(body_parts, "BODY")
    assign_material(body, paint)

    interior_parts = [
        bpy.data.objects.get(name)
        for name in ("InteriorCage", "InteriorDashMid", "InteriorSeatsColor1")
    ]
    interior = join_named([obj for obj in interior_parts if obj is not None], "INTERIOR")
    assign_material(interior, trim)

    return body, materials


def normalize_scene() -> None:
    measured = [obj for obj in mesh_objects() if obj.name not in {"MIRROR_L", "MIRROR_R"}]
    minimum, maximum = world_bounds(measured)
    size = maximum - minimum
    if min(size) <= 0:
        raise SystemExit(f"Khronos source GLB has invalid bounds: {tuple(size)}")
    rotation = Matrix.Rotation(math.pi, 4, "Z")
    scale = Matrix.Diagonal(
        Vector((TARGET_DIMENSIONS.x / size.x, TARGET_DIMENSIONS.y / size.y, TARGET_DIMENSIONS.z / size.z, 1.0))
    )
    transform = scale @ rotation
    for obj in mesh_objects():
        obj.data.transform(transform)
    bpy.context.view_layer.update()
    minimum, maximum = world_bounds(measured)
    translation = Matrix.Translation(
        Vector((-(minimum.x + maximum.x) / 2, -(minimum.y + maximum.y) / 2, -minimum.z))
    )
    for obj in mesh_objects():
        obj.data.transform(translation)
    bpy.context.view_layer.update()


def bind_source_wheel_assemblies(
    assemblies: dict[str, list[bpy.types.Object]],
    materials: dict[str, bpy.types.Material],
) -> None:
    sidewall_materials: dict[int, bpy.types.Material] = {}
    sidewall_images: dict[int, bpy.types.Image] = {}
    for name in REQUIRED_ROOTS:
        parts = assemblies[name]
        tire, rim = parts
        sanitized_sidewalls = 0
        for index, source_material in enumerate(tire.data.materials):
            if source_material and source_material.name == "Tireside":
                sidewall_materials[source_material.as_pointer()] = source_material
                if source_material.node_tree:
                    for node in source_material.node_tree.nodes:
                        image = getattr(node, "image", None)
                        if image is not None:
                            sidewall_images[image.as_pointer()] = image
                tire.data.materials[index] = materials["tire"]
                sanitized_sidewalls += 1
        if sanitized_sidewalls != 1:
            raise SystemExit(
                f"Khronos {name} tire must contain exactly one Tireside material slot"
            )
        corners = [obj.matrix_world @ Vector(corner) for obj in parts for corner in obj.bound_box]
        minimum = Vector(tuple(min(vertex[index] for vertex in corners) for index in range(3)))
        maximum = Vector(tuple(max(vertex[index] for vertex in corners) for index in range(3)))
        root = bpy.data.objects.new(name, None)
        root.empty_display_type = "PLAIN_AXES"
        root.location = (minimum + maximum) / 2
        bpy.context.scene.collection.objects.link(root)
        for part in parts:
            part.data.transform(Matrix.Translation(-root.location))
            part.parent = root
            part.matrix_parent_inverse = Matrix.Identity(4)
            part.location = (0.0, 0.0, 0.0)
            part.rotation_euler = (0.0, 0.0, 0.0)
            part.scale = (1.0, 1.0, 1.0)

    for source_material in sidewall_materials.values():
        if source_material.users != 0:
            raise SystemExit(
                f"Khronos Tireside material remains bound to {source_material.users} data-blocks"
            )
        bpy.data.materials.remove(source_material)
    for image in sidewall_images.values():
        if image.users == 0:
            bpy.data.images.remove(image)


def apply_decimation() -> None:
    current = triangle_count()
    if current <= DECIMATION_TARGET:
        return
    candidates = []
    for obj in mesh_objects():
        obj.data.calc_loop_triangles()
        count = len(obj.data.loop_triangles)
        if count >= 500 and obj.name not in REQUIRED_LIGHTS:
            candidates.append((obj, count))
    candidate_total = sum(count for _, count in candidates)
    fixed = current - candidate_total
    allowed = max(1, DECIMATION_TARGET - fixed)
    ratio = min(1.0, allowed / candidate_total)
    for obj, _ in candidates:
        modifier = obj.modifiers.new(name="Runtime triangle budget", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        select_only([obj])
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def copy_face_partition(
    source: bpy.types.Object,
    name: str,
    assigned: bpy.types.Material,
    keep_face: Callable[[Vector], bool],
) -> bpy.types.Object:
    result = source.copy()
    result.data = source.data.copy()
    result.name = name
    bpy.context.scene.collection.objects.link(result)
    editable = bmesh.new()
    editable.from_mesh(result.data)
    rejected = [
        face
        for face in editable.faces
        if not keep_face(sum((vertex.co for vertex in face.verts), Vector()) / len(face.verts))
    ]
    bmesh.ops.delete(editable, geom=rejected, context="FACES")
    isolated = [vertex for vertex in editable.verts if not vertex.link_faces]
    if isolated:
        bmesh.ops.delete(editable, geom=isolated, context="VERTS")
    if not editable.faces:
        editable.free()
        bpy.data.objects.remove(result, do_unlink=True)
        raise SystemExit(f"Khronos source lamp partition {name} contains no faces")
    editable.to_mesh(result.data)
    editable.free()
    result.data.update()
    assign_material(result, assigned)
    minimum, maximum = world_bounds([result])
    center = (minimum + maximum) / 2
    result.data.transform(Matrix.Translation(-center))
    result.location = center
    return result


def bind_source_lamps(materials: dict[str, bpy.types.Material]) -> None:
    headlights = bpy.data.objects.get("SOURCE_HEADLIGHTS")
    taillights = bpy.data.objects.get("SOURCE_TAILLIGHTS")
    rear_signals = bpy.data.objects.get("SOURCE_REAR_SIGNALS")
    if not headlights or not taillights or not rear_signals:
        raise SystemExit("Khronos source GLB is missing native headlight, taillight, or signal geometry")

    absolute_x = [abs(vertex.co.x) for vertex in headlights.data.vertices]
    outer_threshold = min(absolute_x) + (max(absolute_x) - min(absolute_x)) * 0.72
    partitions = (
        (headlights, "HEADLIGHT_L", materials["headlight"], lambda center: center.x < 0 and abs(center.x) <= outer_threshold),
        (headlights, "HEADLIGHT_R", materials["headlight"], lambda center: center.x > 0 and abs(center.x) <= outer_threshold),
        (headlights, "BLINKER_FL", materials["blinker"], lambda center: center.x < 0 and abs(center.x) > outer_threshold),
        (headlights, "BLINKER_FR", materials["blinker"], lambda center: center.x > 0 and abs(center.x) > outer_threshold),
        (taillights, "BRAKE_L", materials["brake"], lambda center: center.x < 0),
        (taillights, "BRAKE_R", materials["brake"], lambda center: center.x > 0),
        (rear_signals, "BLINKER_RL", materials["blinker"], lambda center: center.x < 0),
        (rear_signals, "BLINKER_RR", materials["blinker"], lambda center: center.x > 0),
    )
    for source, name, assigned, predicate in partitions:
        copy_face_partition(source, name, assigned, predicate)
    for source in (headlights, taillights, rear_signals):
        bpy.data.objects.remove(source, do_unlink=True)


def add_semantic_detail_handles() -> None:
    for name, location in (
        ("BUMPER_FRONT", (0.0, 2.20, 0.28)),
        ("BUMPER_REAR", (0.0, -2.20, 0.28)),
    ):
        if name not in bpy.data.objects:
            handle = bpy.data.objects.new(name, None)
            handle.location = location
            bpy.context.scene.collection.objects.link(handle)


def validate_scene_budget() -> None:
    triangles = triangle_count()
    if triangles > MAX_TRIANGLES:
        raise SystemExit(f"Khronos runtime triangle count {triangles} exceeds {MAX_TRIANGLES}")
    missing = sorted(
        ({"BODY", "GLASS_FRONT", "GLASS_REAR", "GLASS_LEFT", "GLASS_RIGHT"} | set(REQUIRED_ROOTS) | set(REQUIRED_LIGHTS))
        .difference(bpy.data.objects.keys())
    )
    if missing:
        raise SystemExit(f"Khronos conversion is missing runtime nodes: {', '.join(missing)}")
    missing_materials = sorted(set(MUTABLE_MATERIALS).difference(bpy.data.materials.keys()))
    if missing_materials:
        raise SystemExit(f"Khronos conversion is missing mutable materials: {', '.join(missing_materials)}")


def export_glb(path: Path) -> None:
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def validate_staged_output(staged_glb: Path) -> None:
    with tempfile.TemporaryDirectory(prefix=".khronos-traffic-validation-", dir=str(staged_glb.parent)) as directory:
        root = Path(directory)
        validation_output = root / "public" / "models" / "vehicles" / "traffic-compact.glb"
        validation_output.parent.mkdir(parents=True)
        try:
            os.link(staged_glb, validation_output)
        except OSError:
            shutil.copyfile(staged_glb, validation_output)
        failures = validator.validate_asset(root, "traffic-compact", validator.EXPECTED["traffic-compact"])
    if failures:
        raise SystemExit("staged Khronos GLB failed validation:\n" + "\n".join(failures))


def attribution(source_hash: str, runtime_hash: str) -> str:
    return (
        "Source: Khronos glTF Sample Assets — CarConcept\n"
        "URL: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept\n"
        "Author/model and textures: Eric Chadwick, Darmstadt Graphics Group GmbH\n"
        "License: CC BY 4.0\n"
        f"Source SHA-256: {source_hash}\n"
        f"Runtime SHA-256: {runtime_hash}\n"
        "Modifications: logos and presentation content removed; geometry optimized, normalized, and renamed for runtime use.\n"
    )


def temporary_path(final: Path, suffix: str) -> Path:
    final.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=".khronos-traffic-", suffix=suffix, dir=str(final.parent))
    os.close(descriptor)
    temporary = Path(name)
    temporary.unlink()
    return temporary


def publish_artifacts(publications: tuple[tuple[Path, Path], ...]) -> None:
    states: list[tuple[Path, bool, Path | None]] = []
    copied_backups: set[Path] = set()
    possibly_published_finals: set[Path] = set()
    restored_backups: set[Path] = set()
    unneeded_backups: set[Path] = set()
    try:
        for staged, final in publications:
            if not staged.is_file():
                raise FileNotFoundError(f"staged publication artifact does not exist: {staged}")
            final.parent.mkdir(parents=True, exist_ok=True)
            existed = final.is_file()
            backup = temporary_path(final, ".backup") if existed else None
            states.append((final, existed, backup))
            if backup is not None:
                shutil.copyfile(final, backup)
                copied_backups.add(backup)

        for staged, final in publications:
            possibly_published_finals.add(final)
            os.replace(staged, final)
    except BaseException as publication_error:
        restoration_errors: list[str] = []
        for final, existed, backup in states:
            if final not in possibly_published_finals:
                if backup is not None:
                    unneeded_backups.add(backup)
                continue
            try:
                if existed and backup is not None:
                    if backup not in copied_backups:
                        raise RuntimeError(f"backup copy did not complete: {backup}")
                    shutil.copyfile(backup, final)
                    restored_backups.add(backup)
                elif not existed:
                    final.unlink(missing_ok=True)
            except BaseException as restoration_error:
                recovery = f"; recoverable backup retained at {backup}" if backup is not None else ""
                restoration_errors.append(f"{final}: {restoration_error}{recovery}")
        if restoration_errors:
            raise RuntimeError(
                "Khronos publication failed and restoration was incomplete: "
                + "; ".join(restoration_errors)
            ) from publication_error
        raise
    else:
        unneeded_backups.update(copied_backups)
    finally:
        for _, _, backup in states:
            if backup is not None and backup in restored_backups | unneeded_backups:
                backup.unlink(missing_ok=True)


def prepare(
    repository_root: Path,
    source_glb: Path,
    license_receipt: Path,
    inspection_blend: Path,
    output_glb: Path,
) -> dict[str, object]:
    """Return hashes, dimensions, triangle count, and output paths; raise visibly on failure."""
    repository_root = repository_root.resolve()
    source_glb = source_glb.resolve()
    license_receipt = license_receipt.resolve()
    inspection_blend = inspection_blend.resolve()
    output_glb = output_glb.resolve()
    if not source_glb.is_file():
        raise SystemExit(f"Khronos source GLB does not exist: {source_glb}")
    if not license_receipt.is_file():
        raise SystemExit(f"Khronos license receipt does not exist: {license_receipt}")
    source_hash = sha256_file(source_glb)
    staged_glb = temporary_path(output_glb, ".glb")
    staged_blend = temporary_path(inspection_blend, ".blend")
    license_output = output_glb.with_name(f"{output_glb.stem}-LICENSE.md")
    staged_license = temporary_path(license_output, ".md")
    staged_paths = (staged_glb, staged_blend, staged_license)
    try:
        reset_scene()
        bpy.ops.import_scene.gltf(filepath=str(source_glb))
        remove_recorded_content()
        wheel_assemblies = collect_source_wheel_assemblies()
        rebuild_meshes_in_world_space()
        _body, materials = bind_source_contract()
        normalize_scene()
        bind_source_wheel_assemblies(wheel_assemblies, materials)
        bind_source_lamps(materials)
        add_semantic_detail_handles()
        apply_decimation()
        validate_scene_budget()
        bpy.ops.wm.save_as_mainfile(filepath=str(staged_blend), check_existing=False)
        export_glb(staged_glb)
        if staged_glb.stat().st_size > MAX_BYTES:
            raise SystemExit(
                f"Khronos runtime file size {staged_glb.stat().st_size} exceeds {MAX_BYTES}"
            )
        validate_staged_output(staged_glb)
        runtime_hash = sha256_file(staged_glb)
        staged_license.write_text(attribution(source_hash, runtime_hash), encoding="utf-8")
        if sha256_file(source_glb) != source_hash:
            raise SystemExit("immutable Khronos source hash changed during conversion")
        publish_artifacts(
            (
                (staged_blend, inspection_blend),
                (staged_glb, output_glb),
                (staged_license, license_output),
            )
        )
        minimum, maximum = world_bounds()
        dimensions = maximum - minimum
        result: dict[str, object] = {
            "sourceHash": source_hash,
            "runtimeHash": runtime_hash,
            "bytes": output_glb.stat().st_size,
            "triangles": triangle_count(),
            "dimensions": [round(value, 6) for value in dimensions],
            "output": str(output_glb),
            "inspectionBlend": str(inspection_blend),
            "license": str(license_output),
            "requiredNodes": [*REQUIRED_ROOTS, *REQUIRED_LIGHTS],
            "mutableMaterials": list(MUTABLE_MATERIALS),
        }
        print("KHRONOS_TRAFFIC_ASSET_OK")
        for key, value in result.items():
            print(f"{key}: {value}")
        return result
    finally:
        for path in staged_paths:
            path.unlink(missing_ok=True)


def main() -> None:
    if "--" not in sys.argv:
        raise SystemExit(
            "usage: blender --background --python prepare_khronos_traffic.py -- "
            "REPOSITORY_ROOT SOURCE_GLB LICENSE_RECEIPT INSPECTION_BLEND OUTPUT_GLB"
        )
    prepare(*parse_arguments(sys.argv[sys.argv.index("--") + 1 :]))


if __name__ == "__main__":
    main()
