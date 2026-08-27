from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import struct
import sys
import tempfile
import uuid
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

import bpy  # type: ignore[import-not-found]
from mathutils import Vector  # type: ignore[import-not-found]


VIEWS = (
    "front",
    "rear",
    "side",
    "front-three-quarter",
    "rear-three-quarter",
    "elevated",
)
OUTPUT_FILENAMES = tuple(f"{view}.png" for view in VIEWS)
RENDER_WIDTH = 1024
RENDER_HEIGHT = 768
RENDER_SAMPLES = 64
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
WORLD_COLOR = (0.08, 0.08, 0.08, 1.0)
FLOOR_COLOR = (0.18, 0.18, 0.18, 1.0)


@dataclass(frozen=True)
class InputSnapshot:
    blend_hash: str
    runtime_hash: str
    receipt_hash: str
    source_hash: str
    recorded_runtime_hash: str


@dataclass(frozen=True)
class JournalState:
    status: str
    output: Path
    stage: Path
    backup: Path
    had_output: bool
    mode: str


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_attribution_hashes(runtime_glb: Path) -> tuple[str, str]:
    receipt = runtime_glb.with_name(f"{runtime_glb.stem}-LICENSE.md")
    if not receipt.is_file():
        raise SystemExit(f"runtime attribution receipt does not exist: {receipt}")
    text = receipt.read_text(encoding="utf-8")
    source_matches = re.findall(r"^Source SHA-256: ([0-9a-f]{64})$", text, re.MULTILINE)
    runtime_matches = re.findall(r"^Runtime SHA-256: ([0-9a-f]{64})$", text, re.MULTILINE)
    if len(source_matches) != 1 or len(runtime_matches) != 1:
        raise SystemExit(f"runtime attribution hashes are missing or ambiguous: {receipt}")
    source_hash, recorded_runtime_hash = source_matches[0], runtime_matches[0]
    if not SHA256_RE.fullmatch(source_hash) or not SHA256_RE.fullmatch(recorded_runtime_hash):
        raise SystemExit(f"runtime attribution hashes are invalid: {receipt}")
    return source_hash, recorded_runtime_hash


def snapshot_inputs(blend_path: Path, runtime_glb: Path) -> InputSnapshot:
    receipt = runtime_glb.with_name(f"{runtime_glb.stem}-LICENSE.md")
    if not receipt.is_file():
        raise SystemExit(f"runtime attribution receipt does not exist: {receipt}")
    receipt_hash = sha256(receipt)
    source_hash, recorded_runtime_hash = read_attribution_hashes(runtime_glb)
    if sha256(receipt) != receipt_hash:
        raise SystemExit("attribution receipt changed while snapshotting render inputs")
    runtime_hash = sha256(runtime_glb)
    if runtime_hash != recorded_runtime_hash:
        raise SystemExit(
            f"runtime hash mismatch: attribution={recorded_runtime_hash} actual={runtime_hash}"
        )
    return InputSnapshot(
        blend_hash=sha256(blend_path),
        runtime_hash=runtime_hash,
        receipt_hash=receipt_hash,
        source_hash=source_hash,
        recorded_runtime_hash=recorded_runtime_hash,
    )


def verify_inputs_unchanged(snapshot: InputSnapshot, blend_path: Path, runtime_glb: Path) -> None:
    receipt = runtime_glb.with_name(f"{runtime_glb.stem}-LICENSE.md")
    checks = (
        ("inspection Blend", blend_path, snapshot.blend_hash),
        ("runtime GLB", runtime_glb, snapshot.runtime_hash),
        ("attribution receipt", receipt, snapshot.receipt_hash),
    )
    for label, path, expected in checks:
        if not path.is_file() or sha256(path) != expected:
            raise SystemExit(f"{label} changed during rendering")
    hashes = read_attribution_hashes(runtime_glb)
    if hashes != (snapshot.source_hash, snapshot.recorded_runtime_hash):
        raise SystemExit("attribution receipt hashes changed during rendering")


def scene_metrics(scene: bpy.types.Scene) -> tuple[Vector, Vector, int]:
    points: list[Vector] = []
    triangles = 0
    for obj in scene.objects:
        if obj.type != "MESH" or obj.name.startswith("KHRONOS_STUDIO_"):
            continue
        points.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    if not points:
        raise SystemExit("inspection Blend contains no renderable mesh geometry")
    minimum = Vector(tuple(min(point[index] for point in points) for index in range(3)))
    maximum = Vector(tuple(max(point[index] for point in points) for index in range(3)))
    return minimum, maximum, triangles


def configure_studio_scene(scene: bpy.types.Scene) -> None:
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = RENDER_SAMPLES
    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    world = scene.world or bpy.data.worlds.new("KHRONOS_STUDIO_WORLD")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        background = world.node_tree.nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = WORLD_COLOR
    background.inputs["Strength"].default_value = 0.30


def _point_camera(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def _add_area_light(
    scene: bpy.types.Scene,
    name: str,
    location: Vector,
    target: Vector,
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> None:
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    _point_camera(light, target)


def install_studio_rig(
    scene: bpy.types.Scene,
    minimum: Vector,
    maximum: Vector,
) -> dict[str, bpy.types.Object]:
    for obj in list(scene.objects):
        if obj.name.startswith("KHRONOS_STUDIO_"):
            bpy.data.objects.remove(obj, do_unlink=True)

    size = maximum - minimum
    center = (minimum + maximum) / 2.0
    target = Vector((center.x, center.y, minimum.z + size.z * 0.48))
    distance = max(float(size.y * 1.70), float(size.x * 3.0), 7.4)
    eye_height = max(float(size.z * 0.30), 0.42)

    floor_material = bpy.data.materials.new("KHRONOS_STUDIO_FLOOR_MATERIAL")
    floor_material.diffuse_color = FLOOR_COLOR
    floor_material.use_nodes = True
    shader = floor_material.node_tree.nodes.get("Principled BSDF")
    if shader is not None:
        shader.inputs["Base Color"].default_value = FLOOR_COLOR
        shader.inputs["Roughness"].default_value = 0.88
    floor_size = max(18.0, distance * 2.6)
    bpy.ops.mesh.primitive_plane_add(size=floor_size, location=(center.x, center.y, minimum.z))
    floor = bpy.context.object
    floor.name = "KHRONOS_STUDIO_FLOOR"
    floor.data.materials.append(floor_material)

    _add_area_light(
        scene,
        "KHRONOS_STUDIO_KEY",
        center + Vector((-4.5, 4.0, 5.5)),
        target,
        850.0,
        4.0,
        (1.0, 0.94, 0.88),
    )
    _add_area_light(
        scene,
        "KHRONOS_STUDIO_FILL",
        center + Vector((4.2, 1.0, 3.2)),
        target,
        450.0,
        3.5,
        (0.84, 0.91, 1.0),
    )
    _add_area_light(
        scene,
        "KHRONOS_STUDIO_RIM",
        center + Vector((0.0, -4.8, 4.8)),
        target,
        700.0,
        3.0,
        (1.0, 1.0, 1.0),
    )

    direction_by_view = {
        "front": Vector((0.0, 1.0, 0.0)),
        "rear": Vector((0.0, -1.0, 0.0)),
        "side": Vector((-1.0, 0.0, 0.0)),
        "front-three-quarter": Vector((-1.0, 1.0, 0.0)).normalized(),
        "rear-three-quarter": Vector((1.0, -1.0, 0.0)).normalized(),
    }
    cameras: dict[str, bpy.types.Object] = {}
    for view, direction in direction_by_view.items():
        data = bpy.data.cameras.new(f"KHRONOS_STUDIO_CAMERA_{view}")
        data.lens = 52.0
        data.sensor_width = 36.0
        data.dof.use_dof = False
        camera = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(camera)
        camera.location = target + direction * distance + Vector((0.0, 0.0, eye_height))
        _point_camera(camera, target)
        cameras[view] = camera

    elevated_data = bpy.data.cameras.new("KHRONOS_STUDIO_CAMERA_elevated")
    elevated_data.lens = 52.0
    elevated_data.sensor_width = 36.0
    elevated_data.dof.use_dof = False
    elevated = bpy.data.objects.new(elevated_data.name, elevated_data)
    scene.collection.objects.link(elevated)
    elevated_direction = Vector((-1.0, 1.0, 0.0)).normalized()
    elevated.location = target + elevated_direction * (distance * 1.10) + Vector(
        (0.0, 0.0, distance * 0.72)
    )
    _point_camera(elevated, target)
    cameras["elevated"] = elevated
    return {view: cameras[view] for view in VIEWS}


def render_image(scene: bpy.types.Scene, camera: bpy.types.Object, target: Path) -> None:
    scene.camera = camera
    scene.render.filepath = str(target)
    result = bpy.ops.render.render(write_still=True)
    if "FINISHED" not in result:
        raise SystemExit(f"Blender render failed for {target.name}: {result}")


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"rendered output is not a PNG: {path.name}")
    offset = 8
    ihdr: tuple[int, int, int, int, int, int, int] | None = None
    compressed = bytearray()
    saw_end = False
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        start, end = offset + 8, offset + 8 + length
        if end + 4 > len(data):
            raise SystemExit(f"rendered PNG is truncated: {path.name}")
        payload = data[start:end]
        crc = struct.unpack(">I", data[end : end + 4])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            raise SystemExit(f"rendered PNG has invalid CRC: {path.name}")
        if kind == b"IHDR":
            if ihdr is not None or len(payload) != 13:
                raise SystemExit(f"rendered PNG has invalid IHDR: {path.name}")
            ihdr = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            if payload or end + 4 != len(data):
                raise SystemExit(f"rendered PNG has invalid IEND: {path.name}")
            saw_end = True
            break
        offset = end + 4
    if ihdr is None or not saw_end:
        raise SystemExit(f"rendered PNG is incomplete: {path.name}")
    width, height, depth, color_type, compression, filtering, interlace = ihdr
    if depth != 8 or color_type != 2 or compression or filtering or interlace:
        raise SystemExit(f"rendered PNG encoding is unsupported: {path.name}")
    try:
        raw = zlib.decompress(bytes(compressed))
    except zlib.error as error:
        raise SystemExit(f"rendered PNG cannot be decompressed: {path.name}") from error
    stride = width * 3
    if len(raw) != height * (stride + 1):
        raise SystemExit(f"rendered PNG scanlines are incomplete: {path.name}")
    previous = bytearray(stride)
    for row in range(height):
        offset = row * (stride + 1)
        filter_type = raw[offset]
        if filter_type > 4:
            raise SystemExit(f"rendered PNG uses an invalid filter: {path.name}")
        encoded = raw[offset + 1 : offset + stride + 1]
        decoded = bytearray(encoded)
        for index in range(stride):
            left = decoded[index - 3] if index >= 3 else 0
            above = previous[index]
            upper_left = previous[index - 3] if index >= 3 else 0
            if filter_type == 1:
                decoded[index] = (decoded[index] + left) & 0xFF
            elif filter_type == 2:
                decoded[index] = (decoded[index] + above) & 0xFF
            elif filter_type == 3:
                decoded[index] = (decoded[index] + ((left + above) // 2)) & 0xFF
            elif filter_type == 4:
                estimate = left + above - upper_left
                candidates = (abs(estimate - left), abs(estimate - above), abs(estimate - upper_left))
                predictor = (left, above, upper_left)[candidates.index(min(candidates))]
                decoded[index] = (decoded[index] + predictor) & 0xFF
        previous = decoded
    return width, height


def build_manifest(
    *,
    source_hash: str,
    runtime_hash: str,
    attribution_receipt_hash: str,
    inspection_blend_hash: str,
    triangle_count: int,
    dimensions: tuple[float, float, float],
    view_paths: Mapping[str, Path],
) -> dict[str, Any]:
    return {
        "sourceSha256": source_hash,
        "runtimeSha256": runtime_hash,
        "inspectionBlendSha256": inspection_blend_hash,
        "attributionReceiptSha256": attribution_receipt_hash,
        "blenderVersion": bpy.app.version_string,
        "triangleCount": triangle_count,
        "dimensions": {
            "width": round(dimensions[0], 6),
            "length": round(dimensions[1], 6),
            "height": round(dimensions[2], 6),
            "unit": "meters",
            "basis": "inspection visible mesh bounds including mirrors",
        },
        "triangleCountBasis": "inspection visible mesh objects before studio setup",
        "renderSettings": {
            "engine": "BLENDER_EEVEE",
            "width": RENDER_WIDTH,
            "height": RENDER_HEIGHT,
            "samples": RENDER_SAMPLES,
            "transparent": False,
        },
        "views": {
            view: {
                "file": view_paths[view].name,
                "sha256": sha256(view_paths[view]),
                "width": RENDER_WIDTH,
                "height": RENDER_HEIGHT,
            }
            for view in VIEWS
        },
    }


def validate_pack(directory: Path) -> None:
    expected = {*OUTPUT_FILENAMES, "manifest.json"}
    if not directory.is_dir() or directory.is_symlink():
        raise SystemExit(f"render pack is not a regular directory: {directory}")
    if {entry.name for entry in directory.iterdir()} != expected:
        raise SystemExit(f"render pack file set is incomplete or unexpected: {directory}")
    try:
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"render manifest is not readable JSON: {directory}") from error
    expected_keys = {
        "sourceSha256", "runtimeSha256", "inspectionBlendSha256",
        "attributionReceiptSha256", "blenderVersion", "triangleCount",
        "dimensions", "triangleCountBasis", "renderSettings", "views",
    }
    if not isinstance(manifest, dict) or set(manifest) != expected_keys:
        raise SystemExit("render manifest schema is invalid: top-level fields")
    for key in (
        "sourceSha256", "runtimeSha256", "inspectionBlendSha256", "attributionReceiptSha256"
    ):
        value = manifest[key]
        if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
            raise SystemExit(f"render manifest schema is invalid: {key}")
    if not isinstance(manifest["blenderVersion"], str) or not manifest["blenderVersion"]:
        raise SystemExit("render manifest schema is invalid: blenderVersion")
    if type(manifest["triangleCount"]) is not int or manifest["triangleCount"] <= 0:
        raise SystemExit("render manifest schema is invalid: triangleCount")
    dimensions = manifest["dimensions"]
    dimension_keys = {"width", "length", "height", "unit", "basis"}
    if not isinstance(dimensions, dict) or set(dimensions) != dimension_keys:
        raise SystemExit("render manifest schema is invalid: dimensions")
    for key in ("width", "length", "height"):
        if (
            type(dimensions[key]) not in (int, float)
            or not math.isfinite(float(dimensions[key]))
            or dimensions[key] <= 0
        ):
            raise SystemExit(f"render manifest schema is invalid: dimensions.{key}")
    if dimensions["unit"] != "meters" or dimensions["basis"] != "inspection visible mesh bounds including mirrors":
        raise SystemExit("render manifest schema is invalid: dimension basis")
    if manifest["triangleCountBasis"] != "inspection visible mesh objects before studio setup":
        raise SystemExit("render manifest schema is invalid: triangleCountBasis")
    settings = manifest["renderSettings"]
    if not isinstance(settings, dict) or set(settings) != {"engine", "width", "height", "samples", "transparent"}:
        raise SystemExit("render manifest schema is invalid: renderSettings")
    if (
        settings["engine"] != "BLENDER_EEVEE"
        or type(settings["width"]) is not int or settings["width"] != RENDER_WIDTH
        or type(settings["height"]) is not int or settings["height"] != RENDER_HEIGHT
        or type(settings["samples"]) is not int or settings["samples"] != RENDER_SAMPLES
        or type(settings["transparent"]) is not bool or settings["transparent"]
    ):
        raise SystemExit("render manifest schema is invalid: renderSettings values")
    if not isinstance(manifest["views"], dict):
        raise SystemExit("render manifest schema is invalid: views")
    views = manifest["views"]
    if tuple(views) != VIEWS:
        raise SystemExit("render manifest view set/order is invalid")
    for view in VIEWS:
        record = views.get(view)
        if (
            not isinstance(record, dict)
            or set(record) != {"file", "sha256", "width", "height"}
            or record.get("file") != f"{view}.png"
            or not isinstance(record.get("sha256"), str)
            or not SHA256_RE.fullmatch(record["sha256"])
            or type(record.get("width")) is not int or record["width"] != RENDER_WIDTH
            or type(record.get("height")) is not int or record["height"] != RENDER_HEIGHT
        ):
            raise SystemExit(f"render manifest schema is invalid: view {view}")
        path = directory / f"{view}.png"
        if png_dimensions(path) != (RENDER_WIDTH, RENDER_HEIGHT):
            raise SystemExit(f"rendered image dimensions are invalid: {path.name}")
        if record.get("sha256") != sha256(path):
            raise SystemExit(f"rendered image hash mismatch: {path.name}")


def _journal_path(output: Path) -> Path:
    return output.with_name(f".{output.name}.publication.json")


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_journal(path: Path, value: Mapping[str, object]) -> None:
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        _fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _path_exists(path: Path) -> bool:
    return os.path.lexists(path)


def _validate_journal(output: Path, journal_path: Path) -> JournalState:
    if journal_path.is_symlink() or not journal_path.is_file():
        raise SystemExit(f"publication journal is not a regular file: {journal_path}")
    try:
        journal = json.loads(journal_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"publication journal is unreadable: {journal_path}") from error
    keys = {"version", "status", "output", "stage", "backup", "hadOutput"}
    if not isinstance(journal, dict) or set(journal) != keys:
        raise SystemExit(f"publication journal schema is invalid: {journal_path}")
    if type(journal["version"]) is not int or journal["version"] != 1:
        raise SystemExit(f"publication journal version is invalid: {journal_path}")
    if type(journal["status"]) is not str or journal["status"] not in {"publishing", "committed"}:
        raise SystemExit(f"publication journal status is invalid: {journal_path}")
    if type(journal["hadOutput"]) is not bool:
        raise SystemExit(f"publication journal hadOutput is invalid: {journal_path}")
    if any(type(journal[key]) is not str for key in ("output", "stage", "backup")):
        raise SystemExit(f"publication journal paths have invalid types: {journal_path}")
    canonical_output = output.resolve()
    if output.is_symlink() or Path(journal["output"]) != canonical_output:
        raise SystemExit(f"publication journal output is invalid: {journal_path}")
    stage = Path(journal["stage"])
    backup = Path(journal["backup"])
    parent = canonical_output.parent
    pattern = re.compile(rf"^\.{re.escape(canonical_output.name)}\.(staging|backup)-[0-9a-f]{{32}}$")
    if (
        not stage.is_absolute() or not backup.is_absolute()
        or stage.parent.resolve() != parent or backup.parent.resolve() != parent
        or not pattern.fullmatch(stage.name) or not pattern.fullmatch(backup.name)
        or not stage.name.startswith(f".{canonical_output.name}.staging-")
        or not backup.name.startswith(f".{canonical_output.name}.backup-")
        or stage == backup or stage == canonical_output or backup == canonical_output
    ):
        raise SystemExit(f"publication journal temporary paths are invalid: {journal_path}")
    for label, path in (("output", canonical_output), ("stage", stage), ("backup", backup)):
        if _path_exists(path) and (path.is_symlink() or not path.is_dir()):
            raise SystemExit(f"publication journal {label} is not a regular directory: {path}")

    output_exists, stage_exists, backup_exists = map(
        Path.is_dir, (canonical_output, stage, backup)
    )
    had_output = journal["hadOutput"]
    status = journal["status"]
    if status == "committed":
        if not output_exists or stage_exists or (not had_output and backup_exists):
            raise SystemExit(f"publication journal committed state is invalid: {journal_path}")
        validate_pack(canonical_output)
        if backup_exists:
            validate_pack(backup)
        mode = "committed"
    elif had_output and output_exists and stage_exists and not backup_exists:
        validate_pack(canonical_output)
        validate_pack(stage)
        mode = "before-first"
    elif had_output and not output_exists and stage_exists and backup_exists:
        validate_pack(stage)
        validate_pack(backup)
        mode = "before-second"
    elif had_output and output_exists and not stage_exists and backup_exists:
        validate_pack(canonical_output)
        validate_pack(backup)
        mode = "after-second"
    elif had_output and output_exists and not stage_exists and not backup_exists:
        validate_pack(canonical_output)
        mode = "old-only"
    elif had_output and not output_exists and not stage_exists and backup_exists:
        validate_pack(backup)
        mode = "restore-only"
    elif not had_output and not output_exists and stage_exists and not backup_exists:
        validate_pack(stage)
        mode = "new-before"
    elif not had_output and output_exists and not stage_exists and not backup_exists:
        validate_pack(canonical_output)
        mode = "new-after"
    else:
        raise SystemExit(f"publication journal filesystem state is invalid: {journal_path}")
    return JournalState(status, canonical_output, stage, backup, had_output, mode)


def recover_pending_publication(
    output: Path,
    *,
    replace: Callable[[str | os.PathLike[str], str | os.PathLike[str]], None] = os.replace,
    remove_tree: Callable[[str | os.PathLike[str]], None] = shutil.rmtree,
) -> None:
    journal_path = _journal_path(output)
    if not journal_path.exists():
        return
    state = _validate_journal(output, journal_path)
    if state.mode == "before-first":
        remove_tree(state.stage)
    elif state.mode == "new-before":
        replace(state.stage, state.output)
        _fsync_directory(state.output.parent)
    elif state.mode == "before-second":
        replace(state.backup, state.output)
        _fsync_directory(state.output.parent)
        remove_tree(state.stage)
    elif state.mode == "after-second":
        remove_tree(state.output)
        _fsync_directory(state.output.parent)
        replace(state.backup, state.output)
        _fsync_directory(state.output.parent)
    elif state.mode == "committed" and state.backup.exists():
        remove_tree(state.backup)
    elif state.mode == "restore-only":
        replace(state.backup, state.output)
        _fsync_directory(state.output.parent)
    # old-only, new-after, and committed-without-backup already have the sole valid pack.
    journal_path.unlink()
    _fsync_directory(state.output.parent)


def publish_staged_pack(
    stage: Path,
    output: Path,
    *,
    replace: Callable[[str | os.PathLike[str], str | os.PathLike[str]], None] = os.replace,
    remove_tree: Callable[[str | os.PathLike[str]], None] = shutil.rmtree,
) -> None:
    recover_pending_publication(output)
    validate_pack(stage)
    had_output = output.exists()
    if had_output:
        validate_pack(output)
    backup = output.with_name(f".{output.name}.backup-{uuid.uuid4().hex}")
    journal_path = _journal_path(output)
    journal: dict[str, object] = {
        "version": 1,
        "status": "publishing",
        "output": str(output.resolve()),
        "stage": str(stage.resolve()),
        "backup": str(backup.resolve()),
        "hadOutput": had_output,
    }
    _write_journal(journal_path, journal)
    if had_output:
        replace(output, backup)
        _fsync_directory(output.parent)
    replace(stage, output)
    _fsync_directory(output.parent)
    validate_pack(output)
    journal["status"] = "committed"
    _write_journal(journal_path, journal)
    if backup.exists():
        remove_tree(backup)
        _fsync_directory(output.parent)
    journal_path.unlink()
    _fsync_directory(output.parent)


def render_pack(
    blend_path: Path,
    runtime_glb: Path,
    output_dir: Path,
    *,
    render_image: Callable[[bpy.types.Scene, bpy.types.Object, Path], None] = render_image,
) -> Path:
    blend_path = blend_path.resolve()
    runtime_glb = runtime_glb.resolve()
    output_dir = output_dir.resolve()
    if not blend_path.is_file():
        raise SystemExit(f"inspection Blend does not exist: {blend_path}")
    if not runtime_glb.is_file():
        raise SystemExit(f"runtime GLB does not exist: {runtime_glb}")
    snapshot = snapshot_inputs(blend_path, runtime_glb)

    recover_pending_publication(output_dir)
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    stage = output_dir.with_name(f".{output_dir.name}.staging-{uuid.uuid4().hex}")
    stage.mkdir(mode=0o700)
    published = False
    try:
        bpy.ops.wm.open_mainfile(filepath=str(blend_path))
        verify_inputs_unchanged(snapshot, blend_path, runtime_glb)
        scene = bpy.context.scene
        minimum, maximum, triangles = scene_metrics(scene)
        dimensions_vector = maximum - minimum
        dimensions = (
            float(dimensions_vector.x),
            float(dimensions_vector.y),
            float(dimensions_vector.z),
        )
        configure_studio_scene(scene)
        cameras = install_studio_rig(scene, minimum, maximum)
        view_paths = {view: stage / f"{view}.png" for view in VIEWS}
        for view in VIEWS:
            render_image(scene, cameras[view], view_paths[view])
        for view in VIEWS:
            path = view_paths[view]
            if not path.is_file() or path.stat().st_size <= 0:
                raise SystemExit(f"missing rendered image: {path.name}")
        for view in VIEWS:
            size = png_dimensions(view_paths[view])
            if size != (RENDER_WIDTH, RENDER_HEIGHT):
                raise SystemExit(
                    f"rendered image dimensions are {size[0]}x{size[1]}, "
                    f"expected {RENDER_WIDTH}x{RENDER_HEIGHT}: {view_paths[view].name}"
                )
        verify_inputs_unchanged(snapshot, blend_path, runtime_glb)
        manifest = build_manifest(
            source_hash=snapshot.source_hash,
            runtime_hash=snapshot.runtime_hash,
            attribution_receipt_hash=snapshot.receipt_hash,
            inspection_blend_hash=snapshot.blend_hash,
            triangle_count=triangles,
            dimensions=dimensions,
            view_paths=view_paths,
        )
        manifest_path = stage / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        publish_staged_pack(stage, output_dir)
        published = True
    finally:
        if not published and stage.exists() and not _journal_path(output_dir).exists():
            shutil.rmtree(stage)
    result = output_dir / "manifest.json"
    print("KHRONOS_RENDER_PACK_OK")
    print(f"OUTPUT_DIR={output_dir}")
    print(f"MANIFEST={result}")
    print(f"RUNTIME_SHA256={snapshot.runtime_hash}")
    print(f"PNG_COUNT={len(OUTPUT_FILENAMES)}")
    return result


def parse_arguments() -> tuple[Path, Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit(
            "usage: blender --background --python render_khronos_traffic.py -- "
            "INSPECTION_BLEND RUNTIME_GLB OUTPUT_DIR"
        )
    arguments = [Path(value) for value in sys.argv[sys.argv.index("--") + 1 :]]
    if len(arguments) != 3:
        raise SystemExit("expected INSPECTION_BLEND RUNTIME_GLB OUTPUT_DIR")
    return arguments[0], arguments[1], arguments[2]


def main() -> None:
    render_pack(*parse_arguments())


if __name__ == "__main__":
    main()
