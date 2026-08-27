from __future__ import annotations

import hashlib
import json
import os
import shutil
import struct
import sys
import tempfile
import unittest
import uuid
import zlib
from pathlib import Path
from typing import Any, cast

import bpy  # type: ignore[import-not-found]

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_khronos_traffic as renderer  # noqa: E402


EXPECTED_VIEWS = (
    "front",
    "rear",
    "side",
    "front-three-quarter",
    "rear-three-quarter",
    "elevated",
)
EXPECTED_MANIFEST_KEYS = {
    "sourceSha256",
    "runtimeSha256",
    "blenderVersion",
    "triangleCount",
    "dimensions",
    "views",
}


class KhronosRenderContractTests(unittest.TestCase):
    def setUp(self) -> None:
        bpy.ops.wm.read_factory_settings(use_empty=True)

    def tearDown(self) -> None:
        bpy.ops.wm.read_factory_settings(use_empty=True)

    def _fixture(self, root: Path) -> tuple[Path, Path, Path]:
        bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, 0.5))
        blend = root / "inspection.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend), check_existing=False)
        runtime = root / "traffic-compact.glb"
        runtime.write_bytes(b"deterministic-runtime-fixture")
        runtime_hash = hashlib.sha256(runtime.read_bytes()).hexdigest()
        runtime.with_name("traffic-compact-LICENSE.md").write_text(
            "Source SHA-256: " + "a" * 64 + "\n"
            "Runtime SHA-256: " + runtime_hash + "\n",
            encoding="utf-8",
        )
        output = root / "pack"
        return blend, runtime, output

    def _assert_not_published(self, output: Path) -> None:
        self.assertFalse((output / "manifest.json").exists())
        self.assertEqual(list(output.parent.glob(f".{output.name}.staging-*")), [])

    @staticmethod
    def _png(path: Path, color: tuple[int, int, int] = (32, 64, 96), *, width: int = 1024, height: int = 768) -> None:
        def chunk(kind: bytes, payload: bytes) -> bytes:
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

        row = b"\0" + bytes(color) * width
        payload = b"\x89PNG\r\n\x1a\n"
        payload += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        payload += chunk(b"IDAT", zlib.compress(row * height))
        payload += chunk(b"IEND", b"")
        path.write_bytes(payload)

    def _complete_pack(self, path: Path, color: tuple[int, int, int]) -> None:
        path.mkdir()
        view_paths = {}
        for view in EXPECTED_VIEWS:
            target = path / f"{view}.png"
            self._png(target, color)
            view_paths[view] = target
        manifest = renderer.build_manifest(
            source_hash="a" * 64,
            runtime_hash="b" * 64,
            attribution_receipt_hash="c" * 64,
            inspection_blend_hash="d" * 64,
            triangle_count=123,
            dimensions=(1.82, 4.65, 1.45),
            view_paths=view_paths,
        )
        (path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    @staticmethod
    def _transaction_path(root: Path, output: Path, role: str) -> Path:
        return root / f".{output.name}.{role}-{uuid.uuid4().hex}"

    def test_view_set_is_exact(self) -> None:
        self.assertTupleEqual(tuple(renderer.VIEWS), EXPECTED_VIEWS)
        self.assertTupleEqual(
            renderer.OUTPUT_FILENAMES,
            tuple(f"{view}.png" for view in EXPECTED_VIEWS),
        )

    def test_manifest_has_required_keys_and_exact_view_records(self) -> None:
        with tempfile.TemporaryDirectory(prefix="khronos-render-manifest-") as temporary:
            root = Path(temporary)
            files = {}
            for view in EXPECTED_VIEWS:
                path = root / f"{view}.png"
                path.write_bytes(view.encode("utf-8"))
                files[view] = path
            manifest = renderer.build_manifest(
                source_hash="a" * 64,
                runtime_hash="b" * 64,
                attribution_receipt_hash="c" * 64,
                inspection_blend_hash="d" * 64,
                triangle_count=123,
                dimensions=(1.82, 4.65, 1.45),
                view_paths=files,
            )
            self.assertGreaterEqual(set(manifest), EXPECTED_MANIFEST_KEYS)
            typed_manifest = cast(dict[str, Any], manifest)
            self.assertEqual(tuple(typed_manifest["views"]), EXPECTED_VIEWS)
            self.assertEqual(
                {view: typed_manifest["views"][view]["file"] for view in EXPECTED_VIEWS},
                {view: f"{view}.png" for view in EXPECTED_VIEWS},
            )
            self.assertTrue(
                all(len(typed_manifest["views"][view]["sha256"]) == 64 for view in EXPECTED_VIEWS)
            )

    def test_camera_positions_and_look_directions_match_runtime_axes(self) -> None:
        minimum = renderer.Vector((-1.2, -2.7, 0.1))
        maximum = renderer.Vector((0.8, 2.1, 1.7))
        cameras = renderer.install_studio_rig(bpy.context.scene, minimum, maximum)
        bpy.context.view_layer.update()
        target = renderer.Vector((-0.2, -0.3, 0.868))
        self.assertGreater(cameras["front"].location.y, maximum.y)
        self.assertLess(cameras["rear"].location.y, minimum.y)
        self.assertLess(cameras["side"].location.x, minimum.x)
        self.assertLess(cameras["front-three-quarter"].location.x, target.x)
        self.assertGreater(cameras["front-three-quarter"].location.y, target.y)
        self.assertGreater(cameras["rear-three-quarter"].location.x, target.x)
        self.assertLess(cameras["rear-three-quarter"].location.y, target.y)
        self.assertLess(cameras["elevated"].location.x, target.x)
        self.assertGreater(cameras["elevated"].location.y, target.y)
        self.assertGreater(cameras["elevated"].location.z, cameras["front-three-quarter"].location.z)
        for view, camera in cameras.items():
            forward = camera.matrix_world.to_quaternion() @ renderer.Vector((0.0, 0.0, -1.0))
            expected = (target - camera.location).normalized()
            self.assertGreater(forward.dot(expected), 0.99999, view)

    def test_existing_pack_is_recoverable_after_each_publication_boundary(self) -> None:
        for interrupt_after in (1, 2):
            with self.subTest(interrupt_after=interrupt_after), tempfile.TemporaryDirectory(prefix="khronos-publish-") as temporary:
                root = Path(temporary)
                output = root / "pack"
                stage = self._transaction_path(root, output, "staging")
                self._complete_pack(output, (10, 20, 30))
                self._complete_pack(stage, (90, 80, 70))
                old_hash = hashlib.sha256((output / "front.png").read_bytes()).hexdigest()
                calls = 0

                def interrupting_replace(source: str | os.PathLike[str], destination: str | os.PathLike[str]) -> None:
                    nonlocal calls
                    os.replace(source, destination)
                    calls += 1
                    if calls == interrupt_after:
                        raise KeyboardInterrupt(f"interrupt after rename {calls}")

                with self.assertRaisesRegex(KeyboardInterrupt, "interrupt after rename"):
                    renderer.publish_staged_pack(stage, output, replace=interrupting_replace)
                renderer.recover_pending_publication(output)
                renderer.validate_pack(output)
                self.assertEqual(hashlib.sha256((output / "front.png").read_bytes()).hexdigest(), old_hash)
                self.assertEqual(list(root.glob(".pack.*")), [])

    def test_committed_new_pack_survives_backup_cleanup_interruption(self) -> None:
        with tempfile.TemporaryDirectory(prefix="khronos-cleanup-") as temporary:
            root = Path(temporary)
            output = root / "pack"
            stage = self._transaction_path(root, output, "staging")
            self._complete_pack(output, (10, 20, 30))
            self._complete_pack(stage, (90, 80, 70))
            new_hash = hashlib.sha256((stage / "front.png").read_bytes()).hexdigest()

            def interrupting_cleanup(path: str | os.PathLike[str]) -> None:
                shutil.rmtree(path)
                raise KeyboardInterrupt("interrupt after backup cleanup")

            with self.assertRaisesRegex(KeyboardInterrupt, "backup cleanup"):
                renderer.publish_staged_pack(stage, output, remove_tree=interrupting_cleanup)
            renderer.recover_pending_publication(output)
            renderer.validate_pack(output)
            self.assertEqual(hashlib.sha256((output / "front.png").read_bytes()).hexdigest(), new_hash)
            self.assertEqual(list(root.glob(".pack.*")), [])

    def test_pre_side_effect_interrupts_preserve_the_old_complete_pack(self) -> None:
        for interrupt_before in (1, 2):
            with self.subTest(interrupt_before=interrupt_before), tempfile.TemporaryDirectory(prefix="khronos-pre-rename-") as temporary:
                root = Path(temporary)
                output = root / "pack"
                stage = self._transaction_path(root, output, "staging")
                self._complete_pack(output, (10, 20, 30))
                self._complete_pack(stage, (90, 80, 70))
                old_hash = hashlib.sha256((output / "front.png").read_bytes()).hexdigest()
                calls = 0

                def interrupt_before_replace(source: str | os.PathLike[str], destination: str | os.PathLike[str]) -> None:
                    nonlocal calls
                    calls += 1
                    if calls == interrupt_before:
                        raise KeyboardInterrupt(f"interrupt before rename {calls}")
                    os.replace(source, destination)

                with self.assertRaisesRegex(KeyboardInterrupt, "interrupt before rename"):
                    renderer.publish_staged_pack(stage, output, replace=interrupt_before_replace)
                renderer.recover_pending_publication(output)
                renderer.validate_pack(output)
                self.assertEqual(hashlib.sha256((output / "front.png").read_bytes()).hexdigest(), old_hash)
                self.assertEqual(list(root.glob(".pack.*")), [])

    def test_tampered_journal_paths_are_rejected_before_mutation(self) -> None:
        for label in ("arbitrary sibling", "symlink"):
            with self.subTest(label=label), tempfile.TemporaryDirectory(prefix="khronos-journal-tamper-") as temporary:
                root = Path(temporary)
                output = root / "pack"
                stage = self._transaction_path(root, output, "staging")
                backup = self._transaction_path(root, output, "backup")
                arbitrary = root / "unrelated"
                self._complete_pack(output, (10, 20, 30))
                self._complete_pack(stage, (90, 80, 70))
                self._complete_pack(arbitrary, (40, 50, 60))
                if label == "arbitrary sibling":
                    backup = arbitrary
                else:
                    backup.symlink_to(arbitrary, target_is_directory=True)
                output_hash = hashlib.sha256((output / "front.png").read_bytes()).hexdigest()
                unrelated_hash = hashlib.sha256((arbitrary / "front.png").read_bytes()).hexdigest()
                journal = {
                    "version": 1,
                    "status": "publishing",
                    "output": str(output.resolve()),
                    "stage": str(stage.resolve()),
                    "backup": str(backup.absolute()),
                    "hadOutput": True,
                }
                renderer._write_journal(renderer._journal_path(output), journal)
                with self.assertRaises(SystemExit):
                    renderer.recover_pending_publication(output)
                self.assertEqual(hashlib.sha256((output / "front.png").read_bytes()).hexdigest(), output_hash)
                self.assertEqual(hashlib.sha256((arbitrary / "front.png").read_bytes()).hexdigest(), unrelated_hash)

    def test_malformed_staged_and_committed_manifests_are_rejected_untouched(self) -> None:
        with tempfile.TemporaryDirectory(prefix="khronos-manifest-stage-") as temporary:
            root = Path(temporary)
            output = root / "pack"
            stage = self._transaction_path(root, output, "staging")
            self._complete_pack(output, (10, 20, 30))
            self._complete_pack(stage, (90, 80, 70))
            old_hash = hashlib.sha256((output / "front.png").read_bytes()).hexdigest()
            manifest = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
            del manifest["inspectionBlendSha256"]
            (stage / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(SystemExit, "manifest schema"):
                renderer.publish_staged_pack(stage, output)
            self.assertEqual(hashlib.sha256((output / "front.png").read_bytes()).hexdigest(), old_hash)
            self.assertFalse(renderer._journal_path(output).exists())

        with tempfile.TemporaryDirectory(prefix="khronos-manifest-committed-") as temporary:
            root = Path(temporary)
            output = root / "pack"
            backup = self._transaction_path(root, output, "backup")
            stage = self._transaction_path(root, output, "staging")
            self._complete_pack(output, (90, 80, 70))
            self._complete_pack(backup, (10, 20, 30))
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            manifest["renderSettings"]["samples"] = "64"
            (output / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            output_bytes = (output / "manifest.json").read_bytes()
            backup_hash = hashlib.sha256((backup / "front.png").read_bytes()).hexdigest()
            renderer._write_journal(
                renderer._journal_path(output),
                {
                    "version": 1,
                    "status": "committed",
                    "output": str(output.resolve()),
                    "stage": str(stage.resolve()),
                    "backup": str(backup.resolve()),
                    "hadOutput": True,
                },
            )
            with self.assertRaisesRegex(SystemExit, "manifest schema"):
                renderer.recover_pending_publication(output)
            self.assertEqual((output / "manifest.json").read_bytes(), output_bytes)
            self.assertEqual(hashlib.sha256((backup / "front.png").read_bytes()).hexdigest(), backup_hash)

    def test_recovery_restarts_after_every_pre_and_post_side_effect_interrupt(self) -> None:
        cases = (
            ("before-first", "remove", "old"),
            ("before-second-replace", "replace", "old"),
            ("before-second-remove", "remove", "old"),
            ("after-second-remove", "remove", "old"),
            ("after-second-replace", "replace", "old"),
            ("committed", "remove", "new"),
            ("new-before", "replace", "new"),
        )
        for state_name, operation, expected_pack in cases:
            for timing in ("pre", "post"):
                with self.subTest(state=state_name, operation=operation, timing=timing), tempfile.TemporaryDirectory(prefix="khronos-recovery-restart-") as temporary:
                    root = Path(temporary)
                    output = root / "pack"
                    stage = self._transaction_path(root, output, "staging")
                    backup = self._transaction_path(root, output, "backup")
                    old_hash = new_hash = ""
                    if state_name == "before-first":
                        self._complete_pack(output, (10, 20, 30))
                        self._complete_pack(stage, (90, 80, 70))
                    elif state_name.startswith("before-second"):
                        self._complete_pack(stage, (90, 80, 70))
                        self._complete_pack(backup, (10, 20, 30))
                    elif state_name.startswith("after-second"):
                        self._complete_pack(output, (90, 80, 70))
                        self._complete_pack(backup, (10, 20, 30))
                    elif state_name == "committed":
                        self._complete_pack(output, (90, 80, 70))
                        self._complete_pack(backup, (10, 20, 30))
                    else:
                        self._complete_pack(stage, (90, 80, 70))
                    if output.exists():
                        new_hash = hashlib.sha256((output / "front.png").read_bytes()).hexdigest()
                    if backup.exists():
                        old_hash = hashlib.sha256((backup / "front.png").read_bytes()).hexdigest()
                    elif state_name == "before-first":
                        old_hash = new_hash
                    if stage.exists() and not new_hash:
                        new_hash = hashlib.sha256((stage / "front.png").read_bytes()).hexdigest()
                    status = "committed" if state_name == "committed" else "publishing"
                    had_output = state_name != "new-before"
                    renderer._write_journal(
                        renderer._journal_path(output),
                        {
                            "version": 1,
                            "status": status,
                            "output": str(output.resolve()),
                            "stage": str(stage.resolve()),
                            "backup": str(backup.resolve()),
                            "hadOutput": had_output,
                        },
                    )
                    interrupted = False

                    def injected_replace(source: str | os.PathLike[str], destination: str | os.PathLike[str]) -> None:
                        nonlocal interrupted
                        if operation == "replace" and not interrupted:
                            interrupted = True
                            if timing == "post":
                                os.replace(source, destination)
                            raise KeyboardInterrupt(f"{timing} recovery replace")
                        os.replace(source, destination)

                    def injected_remove(path: str | os.PathLike[str]) -> None:
                        nonlocal interrupted
                        if operation == "remove" and not interrupted:
                            interrupted = True
                            if timing == "post":
                                shutil.rmtree(path)
                            raise KeyboardInterrupt(f"{timing} recovery remove")
                        shutil.rmtree(path)

                    with self.assertRaisesRegex(KeyboardInterrupt, f"{timing} recovery {operation}"):
                        renderer.recover_pending_publication(
                            output, replace=injected_replace, remove_tree=injected_remove
                        )
                    self.assertTrue(interrupted)
                    renderer.recover_pending_publication(output)
                    renderer.validate_pack(output)
                    expected_hash = old_hash if expected_pack == "old" else new_hash
                    self.assertEqual(
                        hashlib.sha256((output / "front.png").read_bytes()).hexdigest(),
                        expected_hash,
                    )
                    self.assertEqual(list(root.glob(".pack.*")), [])

    def test_non_finite_manifest_metrics_are_rejected(self) -> None:
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=value), tempfile.TemporaryDirectory(prefix="khronos-nonfinite-") as temporary:
                root = Path(temporary)
                output = root / "pack"
                stage = self._transaction_path(root, output, "staging")
                self._complete_pack(output, (10, 20, 30))
                self._complete_pack(stage, (90, 80, 70))
                manifest = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
                manifest["dimensions"]["width"] = value
                (stage / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
                old_hash = hashlib.sha256((output / "front.png").read_bytes()).hexdigest()
                with self.assertRaisesRegex(SystemExit, "dimensions.width"):
                    renderer.publish_staged_pack(stage, output)
                self.assertEqual(
                    hashlib.sha256((output / "front.png").read_bytes()).hexdigest(), old_hash
                )
                self.assertFalse(renderer._journal_path(output).exists())

    def test_missing_inspection_blend_exits_without_publication(self) -> None:
        with tempfile.TemporaryDirectory(prefix="khronos-render-missing-") as temporary:
            root = Path(temporary)
            _, runtime, output = self._fixture(root)
            missing = root / "missing.blend"
            with self.assertRaisesRegex(SystemExit, "inspection Blend does not exist"):
                renderer.render_pack(missing, runtime, output)
            self._assert_not_published(output)

    def test_runtime_hash_mismatch_exits_without_publication(self) -> None:
        with tempfile.TemporaryDirectory(prefix="khronos-render-hash-") as temporary:
            root = Path(temporary)
            blend, runtime, output = self._fixture(root)
            runtime.with_name("traffic-compact-LICENSE.md").write_text(
                "Source SHA-256: " + "a" * 64 + "\n"
                "Runtime SHA-256: " + "b" * 64 + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(SystemExit, "runtime hash mismatch"):
                renderer.render_pack(blend, runtime, output)
            self._assert_not_published(output)

    def test_render_failure_exits_without_publication(self) -> None:
        with tempfile.TemporaryDirectory(prefix="khronos-render-failure-") as temporary:
            root = Path(temporary)
            blend, runtime, output = self._fixture(root)

            def fail_render(*_args: object) -> None:
                raise RuntimeError("injected render failure")

            with self.assertRaisesRegex(RuntimeError, "injected render failure"):
                renderer.render_pack(blend, runtime, output, render_image=fail_render)
            self._assert_not_published(output)

    def test_missing_output_image_exits_without_publication(self) -> None:
        with tempfile.TemporaryDirectory(prefix="khronos-render-output-") as temporary:
            root = Path(temporary)
            blend, runtime, output = self._fixture(root)

            def omit_elevated(_scene: object, _camera: object, target: Path) -> None:
                if target.name != "elevated.png":
                    target.write_bytes(b"rendered-image")

            with self.assertRaisesRegex(SystemExit, "missing rendered image: elevated.png"):
                renderer.render_pack(blend, runtime, output, render_image=omit_elevated)
            self._assert_not_published(output)

    def test_corrupt_truncated_and_wrong_size_pngs_never_publish(self) -> None:
        cases = {
            "corrupt": lambda path: path.write_bytes(b"not-a-png"),
            "truncated": lambda path: (self._png(path), path.write_bytes(path.read_bytes()[:-7])),
            "wrong-size": lambda path: self._png(path, width=32, height=32),
        }
        for label, write_bad in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory(prefix=f"khronos-{label}-") as temporary:
                blend, runtime, output = self._fixture(Path(temporary))

                def injected(_scene: Any, _camera: Any, target: Path) -> None:
                    if target.name == "front.png":
                        write_bad(target)
                    else:
                        self._png(target)

                with self.assertRaises(SystemExit):
                    renderer.render_pack(blend, runtime, output, render_image=injected)
                self._assert_not_published(output)

    def test_all_input_mutations_during_render_are_rejected(self) -> None:
        for label in ("inspection Blend", "runtime GLB", "attribution receipt"):
            with self.subTest(label=label), tempfile.TemporaryDirectory(prefix="khronos-input-drift-") as temporary:
                blend, runtime, output = self._fixture(Path(temporary))
                receipt = runtime.with_name("traffic-compact-LICENSE.md")

                def mutate(_scene: Any, _camera: Any, target: Path) -> None:
                    self._png(target)
                    if target.name == "elevated.png":
                        changed = {"inspection Blend": blend, "runtime GLB": runtime, "attribution receipt": receipt}[label]
                        changed.write_bytes(changed.read_bytes() + b"mutated")

                with self.assertRaisesRegex(SystemExit, f"{label} changed during rendering"):
                    renderer.render_pack(blend, runtime, output, render_image=mutate)
                self._assert_not_published(output)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]])
