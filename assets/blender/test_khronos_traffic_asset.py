from __future__ import annotations

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_khronos_traffic as converter  # noqa: E402
import validate_vehicles as validator  # noqa: E402


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def receipt_runtime_hash(path: Path) -> str:
    prefix = "Runtime SHA-256: "
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return line.removeprefix(prefix)
    raise AssertionError(f"receipt has no runtime hash: {path}")


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Alpha"].default_value = color[3]
    return material


def make_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def make_body(
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
) -> None:
    width, length, height = dimensions
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    def add_box(
        box_dimensions: tuple[float, float, float],
        location: tuple[float, float, float],
    ) -> None:
        start = len(vertices)
        half_x, half_y, half_z = (dimension / 2 for dimension in box_dimensions)
        center_x, center_y, center_z = location
        vertices.extend(
            [
                (center_x - half_x, center_y - half_y, center_z - half_z),
                (center_x + half_x, center_y - half_y, center_z - half_z),
                (center_x - half_x, center_y + half_y, center_z - half_z),
                (center_x + half_x, center_y + half_y, center_z - half_z),
                (center_x - half_x, center_y - half_y, center_z + half_z),
                (center_x + half_x, center_y - half_y, center_z + half_z),
                (center_x - half_x, center_y + half_y, center_z + half_z),
                (center_x + half_x, center_y + half_y, center_z + half_z),
            ]
        )
        faces.extend(
            [
                (start, start + 1, start + 3, start + 2),
                (start + 4, start + 6, start + 7, start + 5),
                (start, start + 4, start + 5, start + 1),
                (start + 2, start + 3, start + 7, start + 6),
                (start, start + 2, start + 6, start + 4),
                (start + 1, start + 5, start + 7, start + 3),
            ]
        )

    add_box((width, length, height - 0.75), (0.0, 0.0, 0.75 + (height - 0.75) / 2))
    add_box((0.50, length, 0.12), (0.0, 0.0, 0.06))
    mesh = bpy.data.meshes.new("BODY_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    body = bpy.data.objects.new("BODY", mesh)
    bpy.context.scene.collection.objects.link(body)


def make_wheel_root(
    name: str,
    x: float,
    y: float,
    material: bpy.types.Material,
    parent: bpy.types.Object | None,
) -> None:
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    root.location = (x, y, 0.30)
    root.parent = parent
    bpy.context.scene.collection.objects.link(root)
    wheel = make_box(f"{name}_TIRE", (0.14, 0.56, 0.56), (0.0, 0.0, 0.0), material)
    wheel.parent = root


def build_contract_fixture(
    root: Path,
    dimensions: tuple[float, float, float],
    wheelbase: float,
    negative_parent: bool = False,
) -> Path:
    reset_scene()
    width, length, height = dimensions
    paint = make_material("PAINT", (0.10, 0.30, 0.80, 1.0))
    glass = make_material("GLASS", (0.02, 0.04, 0.08, 0.50))
    trim = make_material("TRIM", (0.03, 0.03, 0.03, 1.0))
    lamp = make_material("LAMP", (0.90, 0.20, 0.05, 1.0))
    tire = make_material("TIRE", (0.01, 0.01, 0.01, 1.0))

    make_body(dimensions, paint)
    for name, location, box_dimensions in (
        ("GLASS_FRONT", (0.0, length * 0.20, height * 0.75), (0.50, 0.02, 0.25)),
        ("GLASS_REAR", (0.0, -length * 0.20, height * 0.75), (0.50, 0.02, 0.25)),
        ("GLASS_LEFT", (-width * 0.40, 0.0, height * 0.75), (0.02, 0.50, 0.25)),
        ("GLASS_RIGHT", (width * 0.40, 0.0, height * 0.75), (0.02, 0.50, 0.25)),
    ):
        make_box(name, box_dimensions, location, glass)

    end_y = length / 2 - 0.02
    for name, x, y in (
        ("HEADLIGHT_L", -0.30, end_y),
        ("HEADLIGHT_R", 0.30, end_y),
        ("BRAKE_L", -0.30, -end_y),
        ("BRAKE_R", 0.30, -end_y),
        ("BLINKER_FL", -0.48, end_y),
        ("BLINKER_FR", 0.48, end_y),
        ("BLINKER_RL", -0.48, -end_y),
        ("BLINKER_RR", 0.48, -end_y),
    ):
        make_box(name, (0.06, 0.012, 0.06), (x, y, 0.66), lamp)

    for name, location, box_dimensions in (
        ("MIRROR_L", (-width * 0.49, 0.30, height * 0.73), (0.02, 0.10, 0.14)),
        ("MIRROR_R", (width * 0.49, 0.30, height * 0.73), (0.02, 0.10, 0.14)),
        ("GRILLE", (0.0, end_y, 0.38), (0.50, 0.012, 0.12)),
        ("BUMPER_FRONT", (0.0, end_y, 0.18), (0.70, 0.012, 0.10)),
        ("BUMPER_REAR", (0.0, -end_y, 0.18), (0.70, 0.012, 0.10)),
    ):
        make_box(name, box_dimensions, location, trim)

    wheel_parent = None
    if negative_parent:
        wheel_parent = bpy.data.objects.new("WHEEL_PARENT", None)
        wheel_parent.scale.x = -1.0
        bpy.context.scene.collection.objects.link(wheel_parent)
    half_wheelbase = wheelbase / 2
    for name, x, y in (
        ("WHEEL_FL", -0.72, half_wheelbase),
        ("WHEEL_FR", 0.72, half_wheelbase),
        ("WHEEL_RL", -0.72, -half_wheelbase),
        ("WHEEL_RR", 0.72, -half_wheelbase),
    ):
        make_wheel_root(name, x, y, tire, wheel_parent)

    output = root / "public" / "models" / "vehicles" / "traffic-compact.glb"
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    return root


def build_khronos_source_fixture(root: Path) -> Path:
    reset_scene()
    paint = make_material("Paint 1 Carmine", (0.30, 0.03, 0.04, 1.0))
    glass = make_material("Glass", (0.02, 0.04, 0.07, 0.40))
    trim = make_material("Material_2", (0.03, 0.03, 0.03, 1.0))
    tire_side = make_material("Tireside", (0.008, 0.008, 0.008, 1.0))
    tire_tread = make_material("Tiretread", (0.01, 0.01, 0.01, 1.0))
    logo_image = bpy.data.images.new("LogoSidewallTexture", width=1, height=1)
    logo_image.generated_color = (0.8, 0.8, 0.8, 1.0)
    logo_image.pack()
    logo_node = tire_side.node_tree.nodes.new("ShaderNodeTexImage")
    logo_node.image = logo_image
    tire_shader = tire_side.node_tree.nodes.get("Principled BSDF")
    tire_side.node_tree.links.new(logo_node.outputs["Color"], tire_shader.inputs["Base Color"])
    rim = make_material("Rim1", (0.55, 0.58, 0.62, 1.0))
    headlight = make_material("Headlight", (0.82, 0.91, 1.0, 1.0))
    brake = make_material("Brakelight", (0.72, 0.01, 0.01, 1.0))
    blinker = make_material("Signallight", (1.0, 0.20, 0.01, 1.0))

    body = make_box("BodyRearPanelsColor1", (1.8, 4.4, 1.0), (0.0, -0.2, 0.65), paint)
    make_box("BodyWindshield", (1.35, 0.04, 0.55), (0.0, -0.55, 1.10), glass)
    make_box("BodyRearwindow", (1.35, 0.04, 0.55), (0.0, 0.55, 1.10), glass)
    make_box("BodyDoorLWindow", (0.04, 1.0, 0.50), (0.88, 0.0, 1.10), glass)
    make_box("BodyDoorRWindow", (0.04, 1.0, 0.50), (-0.88, 0.0, 1.10), glass)
    make_box("InteriorCage", (1.1, 1.8, 0.5), (0.0, 0.0, 0.75), trim)
    make_box("BodyHoodTopgrill", (0.8, 0.05, 0.25), (0.0, -2.18, 0.45), trim)
    make_box("BodyDoorLMirrorColor1", (0.16, 0.28, 0.12), (1.0, -0.35, 1.05), paint)
    make_box("BodyDoorRMirrorColor1", (0.16, 0.28, 0.12), (-1.0, -0.35, 1.05), paint)

    for name, material, y, z, width in (
        ("BodyHeadlights", headlight, -2.16, 0.68, 0.62),
        ("BodyTaillights", brake, 1.96, 0.72, 0.52),
        ("BodyTurnsignalsRear", blinker, 1.94, 0.62, 0.16),
    ):
        lenses = []
        for x in (-0.58, 0.58):
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=12,
                ring_count=6,
                location=(x, y, z),
                scale=(width / 2, 0.025, 0.08),
            )
            lens = bpy.context.object
            lens.data.materials.append(material)
            lens["source_lens"] = True
            lenses.append(lens)
        converter.select_only(lenses)
        bpy.ops.object.join()
        lenses[0].name = name

    for source_name, x, y in (
        ("WheelFrontL", 0.78, -1.35),
        ("WheelFrontR", -0.78, -1.35),
        ("WheelRearL", 0.78, 1.35),
        ("WheelRearR", -0.78, 1.35),
    ):
        root_object = bpy.data.objects.new(source_name, None)
        root_object.location = (x, y, 0.30)
        root_object.parent = body
        bpy.context.scene.collection.objects.link(root_object)
        wheel = make_box(f"{source_name}Tire", (0.18, 0.58, 0.58), (x, y, 0.30), tire_side)
        wheel.data.materials.append(tire_tread)
        for polygon in wheel.data.polygons[2:]:
            polygon.material_index = 1
        wheel["source_wheel_component"] = "tire"
        wheel.parent = root_object
        wheel.matrix_parent_inverse = root_object.matrix_world.inverted()
        wheel_rim = make_box(f"{source_name}Rim", (0.19, 0.32, 0.32), (x, y, 0.30), rim)
        wheel_rim["source_wheel_component"] = "rim"
        wheel_rim.parent = root_object
        wheel_rim.matrix_parent_inverse = root_object.matrix_world.inverted()

    source = root / "fixture.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(source),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_extras=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    return source


class KhronosConverterBoundaryTests(unittest.TestCase):
    def test_cli_requires_exactly_five_paths(self) -> None:
        with self.assertRaisesRegex(SystemExit, "expected exactly five path arguments"):
            converter.parse_arguments(["."])

    def test_missing_source_fails_without_touching_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "traffic-compact.glb"
            output.write_bytes(b"sentinel")
            with self.assertRaisesRegex(SystemExit, "Khronos source GLB does not exist"):
                converter.prepare(
                    root,
                    root / "missing.glb",
                    root / "LICENSE.md",
                    root / "inspect.blend",
                    output,
                )
            self.assertEqual(output.read_bytes(), b"sentinel")

    def test_publication_failure_restores_existing_and_absent_finals_at_each_step(self) -> None:
        for finals_exist in (True, False):
            for failed_step in range(3):
                with self.subTest(finals_exist=finals_exist, failed_step=failed_step + 1):
                    with tempfile.TemporaryDirectory() as directory:
                        root = Path(directory)
                        publications: list[tuple[Path, Path]] = []
                        originals: dict[Path, bytes] = {}
                        for index, suffix in enumerate((".blend", ".glb", ".md")):
                            target_directory = root / f"target-{index}"
                            target_directory.mkdir()
                            staged = target_directory / f"staged{suffix}"
                            final = target_directory / f"final{suffix}"
                            staged.write_bytes(f"staged-{index}".encode())
                            if finals_exist:
                                originals[final] = f"original-{index}".encode()
                                final.write_bytes(originals[final])
                            publications.append((staged, final))

                        real_replace = converter.os.replace
                        staged_sources = {staged for staged, _ in publications}
                        publication_calls = 0

                        def fail_publication(source: Path, destination: Path) -> None:
                            nonlocal publication_calls
                            if Path(source) in staged_sources:
                                publication_calls += 1
                                if publication_calls == failed_step + 1:
                                    raise OSError(f"forced publication failure {failed_step + 1}")
                            real_replace(source, destination)

                        with mock.patch.object(converter.os, "replace", side_effect=fail_publication):
                            with self.assertRaisesRegex(
                                OSError,
                                f"forced publication failure {failed_step + 1}",
                            ):
                                converter.publish_artifacts(tuple(publications))

                        for _, final in publications:
                            if finals_exist:
                                self.assertEqual(final.read_bytes(), originals[final])
                            else:
                                self.assertFalse(final.exists())
                        self.assertEqual(list(root.rglob(".khronos-traffic-*")), [])

    def test_backup_copy_failure_keeps_finals_and_cleans_partial_backup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publications: list[tuple[Path, Path]] = []
            originals: dict[Path, bytes] = {}
            for index, suffix in enumerate((".blend", ".glb", ".md")):
                target_directory = root / f"target-{index}"
                target_directory.mkdir()
                staged = target_directory / f"staged{suffix}"
                final = target_directory / f"final{suffix}"
                staged.write_bytes(f"staged-{index}".encode())
                if index != 1:
                    originals[final] = f"original-{index}".encode()
                    final.write_bytes(originals[final])
                publications.append((staged, final))
            unrelated = root / "unrelated.txt"
            unrelated.write_bytes(b"unrelated sentinel")

            real_copyfile = converter.shutil.copyfile
            backup_copies = 0

            def fail_second_backup_copy(source: Path, destination: Path) -> None:
                nonlocal backup_copies
                backup_copies += 1
                if backup_copies == 2:
                    Path(destination).write_bytes(b"partial backup")
                    raise OSError("forced backup copy failure")
                real_copyfile(source, destination)

            with mock.patch.object(converter.shutil, "copyfile", side_effect=fail_second_backup_copy):
                with self.assertRaisesRegex(OSError, "forced backup copy failure"):
                    converter.publish_artifacts(tuple(publications))

            for _, final in publications:
                if final in originals:
                    self.assertEqual(final.read_bytes(), originals[final])
                else:
                    self.assertFalse(final.exists())
            self.assertEqual(unrelated.read_bytes(), b"unrelated sentinel")
            self.assertEqual(list(root.rglob(".khronos-traffic-*")), [])

    def test_backup_restore_failure_retains_recoverable_backup_and_reports_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publications: list[tuple[Path, Path]] = []
            originals: dict[Path, bytes] = {}
            for index, suffix in enumerate((".blend", ".glb", ".md")):
                target_directory = root / f"target-{index}"
                target_directory.mkdir()
                staged = target_directory / f"staged{suffix}"
                final = target_directory / f"final{suffix}"
                staged.write_bytes(f"staged-{index}".encode())
                if index != 1:
                    originals[final] = f"original-{index}".encode()
                    final.write_bytes(originals[final])
                publications.append((staged, final))
            unrelated = root / "unrelated.txt"
            unrelated.write_bytes(b"unrelated sentinel")

            real_replace = converter.os.replace
            real_copyfile = converter.shutil.copyfile
            failed_staged = publications[2][0]
            failed_restoration = publications[0][1]

            def fail_publication(source: Path, destination: Path) -> None:
                if Path(source) == failed_staged:
                    raise OSError("forced publication failure")
                real_replace(source, destination)

            def fail_restoration(source: Path, destination: Path) -> None:
                if Path(source).name.endswith(".backup") and Path(destination) == failed_restoration:
                    raise OSError("forced backup restoration failure")
                real_copyfile(source, destination)

            with mock.patch.object(converter.os, "replace", side_effect=fail_publication):
                with mock.patch.object(converter.shutil, "copyfile", side_effect=fail_restoration):
                    with self.assertRaisesRegex(RuntimeError, "restoration was incomplete") as raised:
                        converter.publish_artifacts(tuple(publications))

            backups = list(root.rglob(".khronos-traffic-*.backup"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), originals[failed_restoration])
            self.assertIn(str(backups[0]), str(raised.exception))
            self.assertFalse(publications[1][1].exists())
            self.assertEqual(publications[2][1].read_bytes(), originals[publications[2][1]])
            self.assertEqual(unrelated.read_bytes(), b"unrelated sentinel")

    def test_publish_interrupt_after_real_replace_rolls_back_existing_and_absent_finals(self) -> None:
        for failed_index in (0, 1):
            with self.subTest(failed_target="existing" if failed_index == 0 else "absent"):
                with tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    publications: list[tuple[Path, Path]] = []
                    originals: dict[Path, bytes] = {}
                    for index, suffix in enumerate((".blend", ".glb", ".md")):
                        target_directory = root / f"target-{index}"
                        target_directory.mkdir()
                        staged = target_directory / f"staged{suffix}"
                        final = target_directory / f"final{suffix}"
                        staged.write_bytes(f"staged-{index}".encode())
                        if index != 1:
                            originals[final] = f"original-{index}".encode()
                            final.write_bytes(originals[final])
                        publications.append((staged, final))
                    unrelated = root / "unrelated.txt"
                    unrelated.write_bytes(b"unrelated sentinel")

                    real_replace = converter.os.replace
                    interrupted_source = publications[failed_index][0]

                    def interrupt_after_replace(source: Path, destination: Path) -> None:
                        real_replace(source, destination)
                        if Path(source) == interrupted_source:
                            raise KeyboardInterrupt("interrupt after real publication replace")

                    with mock.patch.object(
                        converter.os,
                        "replace",
                        side_effect=interrupt_after_replace,
                    ):
                        with self.assertRaisesRegex(
                            KeyboardInterrupt,
                            "interrupt after real publication replace",
                        ):
                            converter.publish_artifacts(tuple(publications))

                    for _, final in publications:
                        if final in originals:
                            self.assertEqual(final.read_bytes(), originals[final])
                        else:
                            self.assertFalse(final.exists())
                    self.assertEqual(unrelated.read_bytes(), b"unrelated sentinel")
                    self.assertEqual(list(root.rglob(".khronos-traffic-*")), [])

    def test_restore_interrupt_after_real_copy_retains_complete_backup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publications: list[tuple[Path, Path]] = []
            originals: dict[Path, bytes] = {}
            for index, suffix in enumerate((".blend", ".glb", ".md")):
                target_directory = root / f"target-{index}"
                target_directory.mkdir()
                staged = target_directory / f"staged{suffix}"
                final = target_directory / f"final{suffix}"
                staged.write_bytes(f"staged-{index}".encode())
                if index != 1:
                    originals[final] = f"original-{index}".encode()
                    final.write_bytes(originals[final])
                publications.append((staged, final))
            unrelated = root / "unrelated.txt"
            unrelated.write_bytes(b"unrelated sentinel")

            real_replace = converter.os.replace
            real_copyfile = converter.shutil.copyfile
            failed_publication = publications[2][0]
            interrupted_restoration = publications[0][1]

            def fail_third_publication(source: Path, destination: Path) -> None:
                if Path(source) == failed_publication:
                    raise OSError("forced publication failure")
                real_replace(source, destination)

            def interrupt_after_restore_copy(source: Path, destination: Path) -> None:
                real_copyfile(source, destination)
                if Path(source).name.endswith(".backup") and Path(destination) == interrupted_restoration:
                    raise KeyboardInterrupt("interrupt after real restoration copy")

            with mock.patch.object(converter.os, "replace", side_effect=fail_third_publication):
                with mock.patch.object(
                    converter.shutil,
                    "copyfile",
                    side_effect=interrupt_after_restore_copy,
                ):
                    with self.assertRaisesRegex(RuntimeError, "restoration was incomplete") as raised:
                        converter.publish_artifacts(tuple(publications))

            backups = list(root.rglob(".khronos-traffic-*.backup"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), originals[interrupted_restoration])
            self.assertIn(str(backups[0]), str(raised.exception))
            self.assertEqual(interrupted_restoration.read_bytes(), originals[interrupted_restoration])
            self.assertFalse(publications[1][1].exists())
            self.assertEqual(publications[2][1].read_bytes(), originals[publications[2][1]])
            self.assertEqual(unrelated.read_bytes(), b"unrelated sentinel")

    def test_malformed_source_cleans_staging_and_preserves_finals(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.glb"
            receipt = root / "LICENSE.md"
            inspection = root / "inspect.blend"
            output = root / "traffic-compact.glb"
            source.write_bytes(b"not a glb")
            receipt.write_text("CC BY 4.0", encoding="utf-8")
            inspection.write_bytes(b"inspection sentinel")
            output.write_bytes(b"runtime sentinel")

            with self.assertRaises(Exception):
                converter.prepare(root, source, receipt, inspection, output)

            self.assertEqual(inspection.read_bytes(), b"inspection sentinel")
            self.assertEqual(output.read_bytes(), b"runtime sentinel")
            self.assertEqual(list(root.glob(".khronos-traffic-*")), [])

    def test_missing_receipt_fails_without_touching_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.glb"
            source.write_bytes(b"glTF")
            output = root / "traffic-compact.glb"
            output.write_bytes(b"sentinel")
            with self.assertRaisesRegex(SystemExit, "Khronos license receipt does not exist"):
                converter.prepare(root, source, root / "missing.md", root / "inspect.blend", output)
            self.assertEqual(output.read_bytes(), b"sentinel")

    def test_validation_failure_cleans_staging_and_preserves_finals(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = build_khronos_source_fixture(root)
            receipt = root / "LICENSE.md"
            inspection = root / "inspect.blend"
            output = root / "traffic-compact.glb"
            receipt.write_text("CC BY 4.0", encoding="utf-8")
            inspection.write_bytes(b"inspection sentinel")
            output.write_bytes(b"runtime sentinel")

            with mock.patch.object(
                converter,
                "validate_staged_output",
                side_effect=SystemExit("forced validation failure"),
            ):
                with self.assertRaisesRegex(SystemExit, "forced validation failure"):
                    converter.prepare(root, source, receipt, inspection, output)

            self.assertEqual(inspection.read_bytes(), b"inspection sentinel")
            self.assertEqual(output.read_bytes(), b"runtime sentinel")
            self.assertEqual(list(root.glob(".khronos-traffic-*")), [])

    def test_conversion_preserves_native_wheels_lamps_and_body_openings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = build_khronos_source_fixture(root)
            receipt = root / "LICENSE.md"
            inspection = root / "inspect.blend"
            output = root / "traffic-compact.glb"
            receipt.write_text("CC BY 4.0", encoding="utf-8")

            destructive = mock.Mock(side_effect=AssertionError("destructive wheel-well cut called"))
            proxies = mock.Mock(side_effect=AssertionError("visible lamp proxy builder called"))
            simple_wheels = mock.Mock(side_effect=AssertionError("simple wheel builder called"))
            with mock.patch.object(converter, "cut_runtime_wheel_wells", destructive, create=True):
                with mock.patch.object(converter, "add_runtime_proxies", proxies, create=True):
                    with mock.patch.object(converter, "add_runtime_wheels", simple_wheels, create=True):
                        with mock.patch.object(converter, "validate_staged_output"):
                            converter.prepare(root, source, receipt, inspection, output)

            self.assertEqual(destructive.call_count, 0)
            self.assertEqual(proxies.call_count, 0)
            self.assertEqual(simple_wheels.call_count, 0)
            bpy.ops.wm.open_mainfile(filepath=str(inspection))
            self.assertNotIn("Tireside", bpy.data.materials)
            self.assertNotIn("LogoSidewallTexture", bpy.data.images)
            for wheel_name in converter.REQUIRED_ROOTS:
                wheel = bpy.data.objects[wheel_name]
                source_parts = {
                    child.get("source_wheel_component"): child
                    for child in wheel.children_recursive
                    if child.type == "MESH"
                }
                source_components = set(source_parts)
                self.assertEqual(source_components, {"tire", "rim"})
                self.assertEqual(
                    [material.name for material in source_parts["tire"].data.materials],
                    ["TIRE", "Tiretread"],
                )
                self.assertEqual(
                    [material.name for material in source_parts["rim"].data.materials],
                    ["Rim1"],
                )
            for lamp_name in converter.REQUIRED_LIGHTS:
                lamp = bpy.data.objects[lamp_name]
                self.assertEqual(lamp.type, "MESH")
                self.assertTrue(lamp.get("source_lens"))
                lamp.data.calc_loop_triangles()
                self.assertGreater(len(lamp.data.loop_triangles), 12)
            self.assertFalse(any(name.startswith("SOURCE_") for name in bpy.data.objects.keys()))

    def test_source_is_immutable(self) -> None:
        source = Path("/data/ai/modly/sources/khronos-car-concept/CarConcept.glb")
        receipt = Path("/data/ai/modly/sources/khronos-car-concept/LICENSE.md")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = sha256_file(source)
            converter.prepare(root, source, receipt, root / "inspect.blend", root / "out.glb")
            self.assertEqual(sha256_file(source), before)

    def test_two_isolated_conversions_are_byte_and_metric_deterministic(self) -> None:
        source = Path("/data/ai/modly/sources/khronos-car-concept/CarConcept.glb")
        receipt = Path("/data/ai/modly/sources/khronos-car-concept/LICENSE.md")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            results = []
            outputs = []
            receipts = []
            for name in ("first", "second"):
                destination = root / name
                output = destination / "traffic-compact.glb"
                inspection = destination / "inspect.blend"
                results.append(converter.prepare(root, source, receipt, inspection, output))
                outputs.append(output)
                receipts.append(destination / "traffic-compact-LICENSE.md")

            hashes = [sha256_file(output) for output in outputs]
            self.assertEqual(hashes[0], hashes[1])
            self.assertEqual(results[0]["triangles"], results[1]["triangles"])
            self.assertEqual(results[0]["dimensions"], results[1]["dimensions"])
            self.assertEqual(receipt_runtime_hash(receipts[0]), hashes[0])
            self.assertEqual(receipt_runtime_hash(receipts[1]), hashes[1])


class KhronosTrafficValidatorTests(unittest.TestCase):
    def test_accepts_khronos_sedan_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = build_contract_fixture(
                Path(directory),
                validator.TRAFFIC_SEDAN_DIMENSIONS,
                validator.TRAFFIC_SEDAN_WHEELBASE,
            )
            failures = validator.validate_asset(
                root,
                "traffic-compact",
                validator.EXPECTED["traffic-compact"],
            )
        self.assertEqual(failures, [])

    def test_rejects_old_picanto_dimensions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = build_contract_fixture(Path(directory), (1.595, 3.595, 1.495), 2.40)
            failures = validator.validate_asset(root, "traffic-compact", validator.EXPECTED["traffic-compact"])
        self.assertIn("traffic-compact: width 1.595m expected 1.820m", failures)
        self.assertIn("traffic-compact: length 3.595m expected 4.650m", failures)

    def test_rejects_negative_scale_and_wrong_wheelbase(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = build_contract_fixture(Path(directory), (1.82, 4.65, 1.45), 2.40, negative_parent=True)
            failures = validator.validate_asset(root, "traffic-compact", validator.EXPECTED["traffic-compact"])
        self.assertIn("traffic-compact: wheelbase 2.400m expected 2.990m ±0.080m", failures)
        self.assertTrue(any("negative scale" in failure for failure in failures))

    def test_uses_source_derived_wheel_and_lamp_contract(self) -> None:
        self.assertEqual(validator.TRAFFIC_SEDAN_WHEELBASE, 2.99)
        self.assertEqual(validator.TRAFFIC_WHEELBASE, 2.99)
        self.assertGreaterEqual(validator.MAX_RIM_DIAMETER, 0.78)
        self.assertGreaterEqual(validator.MAX_LAMP_DEPTH, 0.14)
        self.assertLessEqual(validator.MIN_TRAFFIC_WHEEL_WELL_RADIUS, 0.28)


def main() -> None:
    suite = unittest.TestSuite()
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(KhronosTrafficValidatorTests))
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(KhronosConverterBoundaryTests))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)


if __name__ == "__main__":
    main()
