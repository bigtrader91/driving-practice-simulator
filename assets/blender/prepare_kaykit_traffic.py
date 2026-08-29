from __future__ import annotations

import hashlib
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_khronos_traffic import publish_artifacts  # noqa: E402
from prepare_vehicle_family import (  # noqa: E402
    add_box,
    add_runtime_handles,
    clear_scene,
    export_glb,
    material,
    normalize_source,
)
import validate_vehicles as validator  # noqa: E402


TARGET_DIMENSIONS = (1.82, 4.65, 1.45)
WHEEL_NAMES = {
    "car_sedan_wheel_front_left": "WHEEL_FL",
    "car_sedan_wheel_front_right": "WHEEL_FR",
    "car_sedan_wheel_rear_left": "WHEEL_RL",
    "car_sedan_wheel_rear_right": "WHEEL_RR",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def triangle_count() -> int:
    total = 0
    seen: set[int] = set()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.data.as_pointer() in seen:
            continue
        seen.add(obj.data.as_pointer())
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def imported_body() -> bpy.types.Object:
    body = bpy.data.objects.get("car_sedan")
    if body is None or body.type != "MESH":
        raise SystemExit("KayKit source is missing the car_sedan body mesh")
    return body


def source_image(body: bpy.types.Object) -> bpy.types.Image:
    for slot in body.material_slots:
        value = slot.material
        if value is None or value.node_tree is None:
            continue
        for node in value.node_tree.nodes:
            image = getattr(node, "image", None)
            if image is not None:
                return image
    raise SystemExit("KayKit sedan body is missing its atlas texture")


def sampled_color(image: bpy.types.Image, u: float, v: float) -> tuple[float, float, float]:
    width, height = image.size
    x = min(width - 1, max(0, int((u % 1.0) * width)))
    y = min(height - 1, max(0, int((v % 1.0) * height)))
    offset = (y * width + x) * 4
    return tuple(image.pixels[offset + index] for index in range(3))


def is_blue_paint(color: tuple[float, float, float]) -> bool:
    red, green, blue = color
    return blue > 0.25 and blue > red * 1.18 and blue > green * 1.08


def bind_paint_material(body: bpy.types.Object) -> None:
    uv_layer = body.data.uv_layers.active
    if uv_layer is None:
        raise SystemExit("KayKit sedan body is missing UV coordinates")
    image = source_image(body)
    paint = material("PAINT", (1.0, 1.0, 1.0, 1.0))
    body.data.materials.append(paint)
    paint_index = len(body.data.materials) - 1
    painted = 0
    for polygon in body.data.polygons:
        uvs = [uv_layer.data[index].uv for index in polygon.loop_indices]
        center = sum(uvs, Vector((0.0, 0.0))) / len(uvs)
        if is_blue_paint(sampled_color(image, center.x, center.y)):
            polygon.material_index = paint_index
            painted += 1
    if painted == 0:
        raise SystemExit("KayKit sedan paint atlas partition selected no faces")
    body.name = "BODY"


def bind_wheels() -> None:
    for source_name, runtime_name in WHEEL_NAMES.items():
        wheel = bpy.data.objects.get(source_name)
        if wheel is None or wheel.type != "MESH":
            raise SystemExit(f"KayKit source is missing wheel mesh {source_name}")
        world = wheel.matrix_world.copy()
        root = bpy.data.objects.new(runtime_name, None)
        root.empty_display_type = "PLAIN_AXES"
        root.location = world.translation
        bpy.context.scene.collection.objects.link(root)
        bpy.context.view_layer.update()
        wheel.name = f"{runtime_name}_MESH"
        wheel.parent = root
        wheel.matrix_parent_inverse = Matrix.Identity(4)
        wheel.matrix_basis = root.matrix_world.inverted() @ world


def add_traffic_details() -> None:
    width, length, height = TARGET_DIMENSIONS
    trim = material("TRIM", (0.035, 0.045, 0.055, 1.0))
    front = length / 2 - 0.025
    rear = -length / 2 + 0.025
    for name, size, location in (
        ("MIRROR_L", (0.12, 0.24, 0.10), (-width * 0.51, length * 0.10, height * 0.66)),
        ("MIRROR_R", (0.12, 0.24, 0.10), (width * 0.51, length * 0.10, height * 0.66)),
        ("GRILLE", (width * 0.42, 0.025, height * 0.10), (0.0, front, height * 0.24)),
        ("BUMPER_FRONT", (width * 0.72, 0.025, height * 0.07), (0.0, front, height * 0.14)),
        ("BUMPER_REAR", (width * 0.72, 0.025, height * 0.07), (0.0, rear, height * 0.14)),
    ):
        add_box(name, size, location, trim)


def source_hashes(source: Path, license_path: Path) -> dict[str, str]:
    source_dir = source.parent
    paths = (source, source_dir / "car_sedan.bin", source_dir / "citybits_texture.png", license_path)
    missing = [path for path in paths if not path.is_file()]
    if missing:
        raise SystemExit(f"KayKit conversion input does not exist: {missing[0]}")
    return {path.name: sha256_file(path) for path in paths}


def receipt(hashes: dict[str, str], runtime_hash: str) -> str:
    source_lines = "\n".join(
        f"Source SHA-256 ({name}): {digest}" for name, digest in hashes.items()
    )
    return (
        "Source: KayKit: City Builder Bits — car_sedan\n"
        "URL: https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0\n"
        "Author: Kay Lousberg\n"
        "License: CC0 1.0 Universal\n"
        f"{source_lines}\n"
        f"Runtime SHA-256: {runtime_hash}\n"
        "Modifications: paint faces separated by source atlas color; normalized, renamed, and fitted with runtime control meshes.\n"
    )


def prepare(
    _repository_root: Path,
    source: Path,
    license_path: Path,
    output: Path,
) -> dict[str, object]:
    hashes = source_hashes(source, license_path)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    body = imported_body()
    bind_paint_material(body)
    normalize_source(TARGET_DIMENSIONS)
    bind_wheels()
    add_runtime_handles("traffic-compact", TARGET_DIMENSIONS, False)
    add_traffic_details()

    minimum, maximum = validator.world_bounds({"MIRROR_L", "MIRROR_R"})
    dimensions = tuple((maximum - minimum))
    triangles = triangle_count()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".kaykit-traffic-", dir=output.parent) as directory:
        staged_root = Path(directory)
        staged_output = staged_root / "public" / "models" / "vehicles" / output.name
        export_glb(staged_output)
        failures = validator.validate_asset(
            staged_root,
            "traffic-compact",
            validator.EXPECTED["traffic-compact"],
            validator.KAYKIT_TRAFFIC_WHEELBASE,
        )
        if failures:
            raise SystemExit("staged KayKit GLB failed validation:\n" + "\n".join(failures))
        runtime_hash = sha256_file(staged_output)
        staged_receipt = staged_output.with_name("traffic-compact-LICENSE.md")
        staged_receipt.write_text(receipt(hashes, runtime_hash), encoding="utf-8")
        publish_artifacts(
            (
                (staged_output, output),
                (staged_receipt, output.with_name("traffic-compact-LICENSE.md")),
            )
        )
    return {"triangles": triangles, "dimensions": dimensions, "source_hashes": hashes}


def parse_arguments(arguments: list[str]) -> tuple[Path, Path, Path, Path]:
    if len(arguments) != 4:
        raise SystemExit("expected REPOSITORY_ROOT SOURCE_GLTF LICENSE OUTPUT_GLTF")
    repository_root, source, license_path, output = arguments
    return (
        Path(repository_root).resolve(),
        Path(source).resolve(),
        Path(license_path).resolve(),
        Path(output).resolve(),
    )


def main() -> None:
    if "--" not in sys.argv:
        raise SystemExit("missing path arguments after --")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    repository_root, source, license_path, output = parse_arguments(arguments)
    result = prepare(repository_root, source, license_path, output)
    print(f"PREPARED KayKit traffic sedan: {result}")


if __name__ == "__main__":
    main()
