from __future__ import annotations

import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_vehicles as validator  # noqa: E402


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class KayKitTrafficAssetTests(unittest.TestCase):
    def test_converts_the_vendored_cc0_sedan_into_the_runtime_contract(self) -> None:
        repository = Path(__file__).resolve().parents[2]
        source_dir = repository / "assets" / "vehicle-sources" / "kaykit-city-builder-bits"
        source = source_dir / "car_sedan.gltf"
        license_path = source_dir / "LICENSE.txt"
        converter_path = repository / "assets" / "blender" / "prepare_kaykit_traffic.py"

        for required in (
            source,
            source_dir / "car_sedan.bin",
            source_dir / "citybits_texture.png",
            license_path,
            converter_path,
        ):
            self.assertTrue(required.is_file(), f"missing KayKit conversion input: {required}")

        specification = importlib.util.spec_from_file_location("prepare_kaykit_traffic", converter_path)
        if specification is None or specification.loader is None:
            raise RuntimeError(f"cannot load KayKit converter: {converter_path}")
        converter = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(converter)

        source_hashes_before = {
            path.name: sha256_file(path)
            for path in (
                source,
                source_dir / "car_sedan.bin",
                source_dir / "citybits_texture.png",
                license_path,
            )
        }
        with (
            tempfile.TemporaryDirectory() as first_directory,
            tempfile.TemporaryDirectory() as second_directory,
        ):
            roots = (Path(first_directory), Path(second_directory))
            outputs = tuple(
                root / "public" / "models" / "vehicles" / "traffic-compact.glb"
                for root in roots
            )
            results = tuple(
                converter.prepare(root, source, license_path, output)
                for root, output in zip(roots, outputs, strict=True)
            )
            root, output, result = roots[0], outputs[0], results[0]

            self.assertEqual(results[0], results[1])
            self.assertEqual(sha256_file(outputs[0]), sha256_file(outputs[1]))
            self.assertEqual(
                sha256_file(outputs[0].with_name("traffic-compact-LICENSE.md")),
                sha256_file(outputs[1].with_name("traffic-compact-LICENSE.md")),
            )

            self.assertEqual(
                validator.validate_asset(
                    root,
                    "traffic-compact",
                    validator.EXPECTED["traffic-compact"],
                    validator.KAYKIT_TRAFFIC_WHEELBASE,
                ),
                [],
            )
            self.assertLess(result["triangles"], 5_000)
            for actual, expected in zip(
                result["dimensions"],
                validator.TRAFFIC_SEDAN_DIMENSIONS,
                strict=True,
            ):
                self.assertAlmostEqual(actual, expected, places=2)
            self.assertEqual(result["source_hashes"], source_hashes_before)
            receipt = output.with_name("traffic-compact-LICENSE.md").read_text(encoding="utf-8")
            self.assertIn("KayKit: City Builder Bits", receipt)
            self.assertIn("License: CC0 1.0 Universal", receipt)
            self.assertIn(f"Runtime SHA-256: {sha256_file(output)}", receipt)

            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.import_scene.gltf(filepath=str(output))
            body = bpy.data.objects["BODY"]
            self.assertIn("PAINT", {slot.material.name for slot in body.material_slots if slot.material})
            for wheel_name in validator.TRAFFIC_WHEEL_NAMES:
                wheel = bpy.data.objects[wheel_name]
                self.assertTrue(any(child.type == "MESH" for child in wheel.children_recursive))

        self.assertEqual(
            {
                path.name: sha256_file(path)
                for path in (
                    source,
                    source_dir / "car_sedan.bin",
                    source_dir / "citybits_texture.png",
                    license_path,
                )
            },
            source_hashes_before,
        )


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]], verbosity=2)
