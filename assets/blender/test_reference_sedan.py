from __future__ import annotations

import hashlib
import math
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_vehicle_family as preparer  # noqa: E402
import validate_vehicles as validator  # noqa: E402


REQUIRED = {
    "EXTERIOR_ROOT",
    "COCKPIT_ROOT",
    "DRIVER_EYE",
    "DASHBOARD",
    "INSTRUMENT_HOOD",
    "ROOF_LINING",
    "INNER_A_PILLAR_L",
    "INNER_A_PILLAR_R",
    "INNER_B_PILLAR_L",
    "INNER_B_PILLAR_R",
    "WHEEL_FL",
    "WHEEL_FR",
    "WHEEL_RL",
    "WHEEL_RR",
}
WHEEL_ROOTS = ("WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR")
COCKPIT_ROOT_NODES = {
    "DRIVER_EYE",
    "DASHBOARD",
    "INSTRUMENT_HOOD",
    "ROOF_LINING",
    "COCKPIT_HOOD",
    "SEAT_DRIVER",
    "SEAT_DRIVER_BASE",
    "SEAT_DRIVER_BACK",
    "SEAT_PASSENGER",
    "SEAT_PASSENGER_BASE",
    "SEAT_PASSENGER_BACK",
    "INNER_A_PILLAR_L",
    "INNER_A_PILLAR_R",
    "INNER_B_PILLAR_L",
    "INNER_B_PILLAR_R",
    "STEERING_WHEEL",
    "WIPER_L",
    "WIPER_R",
}
EXTERIOR_ROOT_NODES = {
    "BODY",
    "GLASS_FRONT",
    "GLASS_REAR",
    "GLASS_LEFT",
    "GLASS_RIGHT",
    "WHEEL_FL",
    "WHEEL_FR",
    "WHEEL_RL",
    "WHEEL_RR",
    "HEADLIGHT_L",
    "HEADLIGHT_R",
    "BRAKE_L",
    "BRAKE_R",
    "BLINKER_FL",
    "BLINKER_FR",
    "BLINKER_RL",
    "BLINKER_RR",
}
WHEEL_ROOT_TOLERANCE = 0.01
WHEELBASE = 2.72
WHEELBASE_TOLERANCE = 0.01
TIRE_RADIUS = 0.32
TIRE_RADIUS_TOLERANCE = 0.01
MAX_TIRE_METALLIC = 0.05
MIN_TIRE_ROUGHNESS = 0.75
MIN_RIM_METALLIC = 0.70
MAX_RIM_ROUGHNESS = 0.40
MAX_REFERENCE_HEIGHT = 1.52
MIN_ROOF_LINING_HEIGHT = 1.44
MIN_INTERIOR_CHANNEL = 0.18
MIN_INTERIOR_EMISSION_CHANNEL = 0.05
MIN_PILLAR_CHANNEL = 0.08
MAX_STEERING_DIAMETER = 0.35
EXPECTED_WHEEL_CENTERS = {
    "WHEEL_FL": (-0.728, 1.36, 0.32),
    "WHEEL_FR": (0.728, 1.36, 0.32),
    "WHEEL_RL": (-0.728, -1.36, 0.32),
    "WHEEL_RR": (0.728, -1.36, 0.32),
}


def assert_reference_sedan(root: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root / "public/models/vehicles/sedan.glb"))
    names = {obj.name for obj in bpy.context.scene.objects}
    missing = sorted(REQUIRED - names)
    assert not missing, f"sedan reference nodes missing: {', '.join(missing)}"

    eye = bpy.data.objects["DRIVER_EYE"].matrix_world.translation
    assert -0.55 <= eye.x <= -0.25, f"driver eye X={eye.x:.3f}m is outside measured sedan range"
    assert 1.08 <= eye.z <= 1.28, f"driver eye Z={eye.z:.3f}m is outside measured sedan range"

    mesh_points = [
        obj.matrix_world @ Vector(corner)
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    cockpit_failures: list[str] = []
    maximum_height = max(point.z for point in mesh_points)
    if maximum_height > MAX_REFERENCE_HEIGHT:
        cockpit_failures.append(
            f"reference sedan height {maximum_height:.3f}m exceeds {MAX_REFERENCE_HEIGHT:.3f}m"
        )

    roof_lining = bpy.data.objects["ROOF_LINING"]
    roof_points = [roof_lining.matrix_world @ Vector(corner) for corner in roof_lining.bound_box]
    assert min(point.z for point in roof_points) >= MIN_ROOF_LINING_HEIGHT, (
        "roof lining must remain above the forward sightline"
    )
    roof_depth = max(point.y for point in roof_points) - min(point.y for point in roof_points)
    assert roof_depth <= 0.12, "roof lining must remain a slim upper windshield boundary"
    assert roof_lining.matrix_world.translation.y >= 0.70, (
        "roof lining must remain near the A-pillar tops instead of the driver eye"
    )
    roof_min_z = min(point.z for point in roof_points)
    for name in ("INNER_A_PILLAR_L", "INNER_A_PILLAR_R"):
        pillar = bpy.data.objects[name]
        pillar_points = [pillar.matrix_world @ vertex.co for vertex in pillar.data.vertices]
        assert max(point.z for point in pillar_points) >= roof_min_z - 0.03, (
            f"{name} must connect to the roof lining"
        )
        expected_x = min(point.x for point in roof_points) if name.endswith("_L") else max(
            point.x for point in roof_points
        )
        roof_center_y = sum(point.y for point in roof_points) / len(roof_points)
        assert min(abs(point.x - expected_x) for point in pillar_points) <= 0.03, (
            f"{name} must meet the roof edge"
        )
        assert min(abs(point.y - roof_center_y) for point in pillar_points) <= 0.16, (
            f"{name} must meet the roof depth"
        )

    interior = bpy.data.materials["INTERIOR"]
    principled = interior.node_tree.nodes["Principled BSDF"]
    base_color = principled.inputs["Base Color"].default_value
    if min(base_color[:3]) < MIN_INTERIOR_CHANNEL:
        cockpit_failures.append(
            f"interior base color {tuple(round(value, 3) for value in base_color[:3])} is too dark"
        )
    emission_input = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
    if emission_input is None:
        cockpit_failures.append("interior material has no emission input")
    else:
        emission = emission_input.default_value
        if min(emission[:3]) < MIN_INTERIOR_EMISSION_CHANNEL:
            cockpit_failures.append(
                f"interior emission {tuple(round(value, 3) for value in emission[:3])} is too dark"
            )

    pillar_material = bpy.data.objects["INNER_A_PILLAR_L"].active_material
    pillar_principled = pillar_material.node_tree.nodes["Principled BSDF"]
    pillar_color = pillar_principled.inputs["Base Color"].default_value
    if min(pillar_color[:3]) < MIN_PILLAR_CHANNEL:
        cockpit_failures.append(
            f"pillar base color {tuple(round(value, 3) for value in pillar_color[:3])} is too dark"
        )

    tire_principled = bpy.data.materials["TIRE"].node_tree.nodes["Principled BSDF"]
    rim_principled = bpy.data.materials["RIM"].node_tree.nodes["Principled BSDF"]
    assert tire_principled.inputs["Metallic"].default_value <= MAX_TIRE_METALLIC
    assert tire_principled.inputs["Roughness"].default_value >= MIN_TIRE_ROUGHNESS
    assert rim_principled.inputs["Metallic"].default_value >= MIN_RIM_METALLIC
    assert rim_principled.inputs["Roughness"].default_value <= MAX_RIM_ROUGHNESS

    steering = bpy.data.objects["STEERING_WHEEL_RIM"]
    steering_points = [steering.matrix_world @ Vector(corner) for corner in steering.bound_box]
    steering_min_z = min(point.z for point in steering_points)
    steering_max_z = max(point.z for point in steering_points)
    steering_center_z = (steering_min_z + steering_max_z) / 2
    if steering_center_z > eye.z - 0.12:
        cockpit_failures.append(
            f"steering center Z={steering_center_z:.3f}m must remain below driver eye Z={eye.z:.3f}m"
        )
    if steering_max_z - steering_min_z > MAX_STEERING_DIAMETER:
        cockpit_failures.append(
            f"steering diameter {steering_max_z - steering_min_z:.3f}m exceeds {MAX_STEERING_DIAMETER:.3f}m"
        )

    assert not cockpit_failures, "; ".join(cockpit_failures)

    for root_name, names in (
        ("COCKPIT_ROOT", COCKPIT_ROOT_NODES),
        ("EXTERIOR_ROOT", EXTERIOR_ROOT_NODES),
    ):
        expected_root = bpy.data.objects[root_name]
        for name in sorted(names):
            parent = bpy.data.objects[name].parent
            ancestors = []
            while parent is not None:
                ancestors.append(parent)
                parent = parent.parent
            assert expected_root in ancestors, f"{name} must be parented under {root_name}"

    assert bpy.data.objects["COCKPIT_ROOT"].parent is None, "COCKPIT_ROOT must be top-level"
    assert bpy.data.objects["EXTERIOR_ROOT"].parent is None, "EXTERIOR_ROOT must be top-level"

    wheel_roots = [bpy.data.objects[name] for name in WHEEL_ROOTS]
    for wheel_name, expected_center in EXPECTED_WHEEL_CENTERS.items():
        wheel = bpy.data.objects[wheel_name]
        actual_center = wheel.matrix_world.translation
        assert all(
            abs(actual - expected) <= WHEEL_ROOT_TOLERANCE
            for actual, expected in zip(actual_center, expected_center, strict=True)
        ), f"{wheel_name} center {tuple(round(value, 3) for value in actual_center)} is not {expected_center}"

        tire = bpy.data.objects[f"{wheel_name}_TIRE"]
        rim = bpy.data.objects[f"{wheel_name}_RIM"]
        assert tire.type == "MESH", f"{tire.name} is not a mesh"
        assert rim.type == "MESH", f"{rim.name} is not a mesh"
        assert tire is not rim, f"{wheel_name} tire and rim must be distinct meshes"
        assert tire.parent is wheel, f"{tire.name} is not under {wheel_name}"
        assert rim.parent is wheel, f"{rim.name} is not under {wheel_name}"
        assert all(polygon.use_smooth for polygon in tire.data.polygons), f"{tire.name} is not smooth shaded"

        root_inverse = wheel.matrix_world.inverted()
        points = [root_inverse @ tire.matrix_world @ vertex.co for vertex in tire.data.vertices]
        radii = [math.hypot(point.y, point.z) for point in points]
        mean_radius = sum(radii) / len(radii)
        assert abs(mean_radius - TIRE_RADIUS) <= TIRE_RADIUS_TOLERANCE, (
            f"{tire.name} mean radius {mean_radius:.3f}m is not {TIRE_RADIUS:.3f}m"
        )
        radial_angles = {
            round(math.atan2(point.z, point.y), 5)
            for point in points
            if math.hypot(point.y, point.z) > TIRE_RADIUS * 0.625
        }
        assert len(radial_angles) >= 32, f"{wheel_name} tire is visibly faceted"

        rim_points = [root_inverse @ rim.matrix_world @ vertex.co for vertex in rim.data.vertices]
        rim_radius = max(math.hypot(point.y, point.z) for point in rim_points)
        assert rim_radius < min(radii), f"{rim.name} must remain inside the tire envelope"

    front_y = sum(root.matrix_world.translation.y for root in wheel_roots[:2]) / 2
    rear_y = sum(root.matrix_world.translation.y for root in wheel_roots[2:]) / 2
    assert abs((front_y - rear_y) - WHEELBASE) <= WHEELBASE_TOLERANCE, (
        f"wheelbase {front_y - rear_y:.3f}m is not {WHEELBASE:.3f}m"
    )


def export_mutated_sedan(source: Path, output: Path, mutation: str) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    wheel = bpy.data.objects["WHEEL_FL"]
    tire = bpy.data.objects["WHEEL_FL_TIRE"]
    if mutation == "wheelbase":
        wheel.location.y += 0.08
    elif mutation == "radius":
        for vertex in tire.data.vertices:
            vertex.co *= 0.90
        tire.data.update()
    elif mutation == "rim-envelope":
        rim = bpy.data.objects["WHEEL_FL_RIM"]
        for vertex in rim.data.vertices:
            vertex.co *= 2.0
        rim.data.update()
    elif mutation == "tire-material":
        tire.data.materials.clear()
    elif mutation == "rim-material":
        bpy.data.objects["WHEEL_FL_RIM"].data.materials.clear()
    elif mutation == "pillar-connection":
        bpy.data.objects["INNER_A_PILLAR_L"].location.x += 0.40
    elif mutation == "hierarchy":
        world = tire.matrix_world.copy()
        tire.parent = None
        tire.matrix_world = world
    elif mutation == "smooth":
        for polygon in tire.data.polygons:
            polygon.use_smooth = False
    elif mutation == "render-root":
        driver_eye = bpy.data.objects["DRIVER_EYE"]
        world = driver_eye.matrix_world.copy()
        driver_eye.parent = bpy.data.objects["EXTERIOR_ROOT"]
        driver_eye.matrix_world = world
    elif mutation == "seat-render-root":
        seat_base = bpy.data.objects["SEAT_DRIVER_BASE"]
        world = seat_base.matrix_world.copy()
        seat_base.parent = bpy.data.objects["EXTERIOR_ROOT"]
        seat_base.matrix_world = world
    elif mutation == "nested-roots":
        cockpit_root = bpy.data.objects["COCKPIT_ROOT"]
        world = cockpit_root.matrix_world.copy()
        cockpit_root.parent = bpy.data.objects["EXTERIOR_ROOT"]
        cockpit_root.matrix_world = world
    else:
        raise ValueError(f"unknown sedan mutation: {mutation}")

    bpy.ops.object.select_all(action="SELECT")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_materials="EXPORT",
    )


def assert_validator_rejects_mutations(root: Path) -> None:
    source = root / "public/models/vehicles/sedan.glb"
    with tempfile.TemporaryDirectory(prefix="reference-sedan-validator-") as temporary:
        for mutation, expected_failure in (
            ("wheelbase", "wheelbase"),
            ("radius", "mean radius"),
            ("rim-envelope", "rim radius"),
            ("tire-material", "material"),
            ("rim-material", "material"),
            ("pillar-connection", "roof edge"),
            ("hierarchy", "must be parented under"),
            ("smooth", "smooth shaded"),
            ("render-root", "COCKPIT_ROOT"),
            ("seat-render-root", "COCKPIT_ROOT"),
            ("nested-roots", "top-level"),
        ):
            if mutation == "smooth":
                bpy.ops.wm.read_factory_settings(use_empty=True)
                bpy.ops.import_scene.gltf(filepath=str(source))
                for polygon in bpy.data.objects["WHEEL_FL_TIRE"].data.polygons:
                    polygon.use_smooth = False
                failures = validator.validate_reference_sedan_wheels()
            else:
                mutation_root = Path(temporary) / mutation
                output = mutation_root / "public/models/vehicles/sedan.glb"
                export_mutated_sedan(source, output, mutation)
                failures = validator.validate_asset(mutation_root, "sedan", validator.EXPECTED["sedan"])
            assert any(expected_failure in failure for failure in failures), (
                f"sedan validator accepted {mutation} mutation: {failures}"
            )


def assert_deterministic_regeneration(root: Path) -> None:
    committed = root / "public/models/vehicles/sedan.glb"
    with tempfile.TemporaryDirectory(prefix="reference-sedan-regeneration-") as temporary:
        outputs = [Path(temporary) / f"sedan-{index}.glb" for index in (1, 2)]
        for output in outputs:
            preparer.prepare_vehicle(root, "sedan", output)
        hashes = [hashlib.sha256(path.read_bytes()).hexdigest() for path in [committed, *outputs]]
        assert len(set(hashes)) == 1, f"sedan regeneration is not byte-stable: {hashes}"


def repository_root() -> Path:
    if "--" not in sys.argv:
        raise SystemExit("usage: blender --background --python test_reference_sedan.py -- REPOSITORY_ROOT")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise SystemExit("expected exactly one REPOSITORY_ROOT argument")
    return Path(arguments[0]).resolve()


if __name__ == "__main__":
    root = repository_root()
    assert_reference_sedan(root)
    assert_deterministic_regeneration(root)
    assert_validator_rejects_mutations(root)
    print("PASS reference sedan")
