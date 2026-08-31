from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


TRAFFIC_SEDAN_DIMENSIONS = (1.82, 4.65, 1.45)
TRAFFIC_SEDAN_WHEELBASE = 2.99
KAYKIT_TRAFFIC_WHEELBASE = 2.49

EXPECTED = {
    "compact": (1.60, 3.60, 1.55, True),
    "sedan": (1.82, 4.68, 1.44, True),
    "suv": (1.91, 4.83, 1.70, True),
    "truck": (2.30, 7.50, 2.80, False),
    "traffic-compact": (1.82, 4.65, 1.45, False),
}

COMMON_NODES = {
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
PLAYER_NODES = {"STEERING_WHEEL", "WIPER_L", "WIPER_R"}
SEDAN_REFERENCE_NODES = {
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
    "COCKPIT_HOOD",
    "SEAT_DRIVER",
    "SEAT_DRIVER_BASE",
    "SEAT_DRIVER_BACK",
    "SEAT_PASSENGER",
    "SEAT_PASSENGER_BASE",
    "SEAT_PASSENGER_BACK",
    "WHEEL_FL_TIRE",
    "WHEEL_FL_RIM",
    "WHEEL_FR_TIRE",
    "WHEEL_FR_RIM",
    "WHEEL_RL_TIRE",
    "WHEEL_RL_RIM",
    "WHEEL_RR_TIRE",
    "WHEEL_RR_RIM",
}
SEDAN_COCKPIT_ROOT_NODES = {
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
SEDAN_EXTERIOR_ROOT_NODES = COMMON_NODES
TRAFFIC_WHEEL_NAMES = ("WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR")
TRAFFIC_DETAIL_NODES = {"MIRROR_L", "MIRROR_R", "GRILLE", "BUMPER_FRONT", "BUMPER_REAR"}
DIMENSION_TOLERANCE = 0.08
TRAFFIC_DIMENSION_TOLERANCE = 0.08
GROUND_TOLERANCE = 0.01
STEERING_GLASS_CLEARANCE = 0.12
MAX_RUNTIME_BYTES = 5_000_000
MAX_RUNTIME_TRIANGLES = 50_000
MAX_LAMP_DEPTH = 0.16
MAX_RIM_DIAMETER = 0.82
MAX_GLASS_ALPHA = 0.58
TRAFFIC_WHEELBASE = TRAFFIC_SEDAN_WHEELBASE
TRAFFIC_WHEELBASE_TOLERANCE = 0.08
MIN_TRAFFIC_WHEEL_WELL_RADIUS = 0.25
REFERENCE_SEDAN_WHEELBASE = 2.72
REFERENCE_SEDAN_WHEELBASE_TOLERANCE = 0.01
REFERENCE_SEDAN_WHEEL_ROOT_CENTERS = {
    "WHEEL_FL": (-0.728, 1.36, 0.32),
    "WHEEL_FR": (0.728, 1.36, 0.32),
    "WHEEL_RL": (-0.728, -1.36, 0.32),
    "WHEEL_RR": (0.728, -1.36, 0.32),
}
REFERENCE_SEDAN_WHEEL_ROOT_TOLERANCE = 0.01
REFERENCE_SEDAN_TIRE_RADIUS = 0.32
REFERENCE_SEDAN_TIRE_RADIUS_TOLERANCE = 0.01
REFERENCE_SEDAN_MAX_TIRE_METALLIC = 0.05
REFERENCE_SEDAN_MIN_TIRE_ROUGHNESS = 0.75
REFERENCE_SEDAN_MIN_RIM_METALLIC = 0.70
REFERENCE_SEDAN_MAX_RIM_ROUGHNESS = 0.40
REFERENCE_SEDAN_PILLAR_EDGE_TOLERANCE = 0.03
REFERENCE_SEDAN_PILLAR_DEPTH_TOLERANCE = 0.16


def repository_root() -> Path:
    if "--" not in sys.argv:
        raise SystemExit("usage: blender --background --python validate_vehicles.py -- REPOSITORY_ROOT")
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


def object_parent_chain(root: bpy.types.Object) -> list[bpy.types.Object]:
    chain: list[bpy.types.Object] = []
    current = root
    while current is not None:
        chain.append(current)
        current = current.parent
    return chain


def world_bounds(exclude_names: set[str] | None = None) -> tuple[Vector, Vector]:
    excluded = exclude_names or set()
    corners = [
        obj.matrix_world @ Vector(corner)
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        and not any(ancestor.name in excluded for ancestor in object_parent_chain(obj))
        for corner in obj.bound_box
    ]
    if not corners:
        raise ValueError("contains no mesh geometry")
    return (
        Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners))),
        Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners))),
    )


def node_world_forward_axis(name: str) -> float:
    return bpy.data.objects[name].matrix_world.translation.y


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


def object_world_size(name: str) -> Vector:
    obj = bpy.data.objects[name]
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return Vector(
        (
            max(vertex.x for vertex in corners) - min(vertex.x for vertex in corners),
            max(vertex.y for vertex in corners) - min(vertex.y for vertex in corners),
            max(vertex.z for vertex in corners) - min(vertex.z for vertex in corners),
        )
    )


def point_segment_distance(point: Vector, start: Vector, end: Vector) -> float:
    edge = end - start
    length_squared = edge.length_squared
    if length_squared == 0:
        return (point - start).length
    parameter = max(0.0, min(1.0, (point - start).dot(edge) / length_squared))
    return (point - (start + parameter * edge)).length


def point_triangle_distance(point: Vector, first: Vector, second: Vector, third: Vector) -> float:
    edge_ab = second - first
    edge_ac = third - first
    if edge_ab.cross(edge_ac).length_squared < 1e-12:
        return min(
            point_segment_distance(point, first, second),
            point_segment_distance(point, second, third),
            point_segment_distance(point, third, first),
        )

    offset_from_first = point - first
    dot_ab = edge_ab.dot(offset_from_first)
    dot_ac = edge_ac.dot(offset_from_first)
    if dot_ab <= 0 and dot_ac <= 0:
        return offset_from_first.length

    offset_from_second = point - second
    dot_ba = edge_ab.dot(offset_from_second)
    dot_bc = edge_ac.dot(offset_from_second)
    if dot_ba >= 0 and dot_bc <= dot_ba:
        return offset_from_second.length

    edge_vertex = dot_ab * dot_bc - dot_ba * dot_ac
    if edge_vertex <= 0 and dot_ab >= 0 and dot_ba <= 0:
        parameter = dot_ab / (dot_ab - dot_ba)
        return (point - (first + parameter * edge_ab)).length

    offset_from_third = point - third
    dot_ca = edge_ab.dot(offset_from_third)
    dot_cc = edge_ac.dot(offset_from_third)
    if dot_cc >= 0 and dot_ca <= dot_cc:
        return offset_from_third.length

    vertex_edge = dot_ca * dot_ac - dot_ab * dot_cc
    if vertex_edge <= 0 and dot_ac >= 0 and dot_cc <= 0:
        parameter = dot_ac / (dot_ac - dot_cc)
        return (point - (first + parameter * edge_ac)).length

    edge_edge = dot_ba * dot_cc - dot_ca * dot_bc
    if edge_edge <= 0 and (dot_bc - dot_ba) >= 0 and (dot_ca - dot_cc) >= 0:
        parameter = (dot_bc - dot_ba) / ((dot_bc - dot_ba) + (dot_ca - dot_cc))
        return (point - (second + parameter * (third - second))).length

    inverse_denominator = 1.0 / (edge_edge + vertex_edge + edge_vertex)
    parameter_ab = vertex_edge * inverse_denominator
    parameter_ac = edge_vertex * inverse_denominator
    closest = first + parameter_ab * edge_ab + parameter_ac * edge_ac
    return (point - closest).length


def body_wheel_clearance(body: bpy.types.Object, wheel: bpy.types.Object) -> float | None:
    vertices = [body.matrix_world @ vertex.co for vertex in body.data.vertices]
    wheel_center = wheel.matrix_world.translation
    minimum: float | None = None
    for polygon in body.data.polygons:
        indices = list(polygon.vertices)
        if len(indices) < 3:
            continue
        first = vertices[indices[0]]
        for index in range(1, len(indices) - 1):
            distance = point_triangle_distance(
                wheel_center,
                first,
                vertices[indices[index]],
                vertices[indices[index + 1]],
            )
            minimum = distance if minimum is None else min(minimum, distance)
    if minimum is None and vertices:
        minimum = min((vertex - wheel_center).length for vertex in vertices)
    return minimum


def front_glass_axis_at_height(height: float) -> float:
    glass = bpy.data.objects["GLASS_FRONT"]
    vertices = [glass.matrix_world @ vertex.co for vertex in glass.data.vertices]
    lower_z = min(vertex.z for vertex in vertices)
    upper_z = max(vertex.z for vertex in vertices)
    if upper_z == lower_z:
        raise ValueError("front glass has no vertical span")
    lower_y = sum(vertex.y for vertex in vertices if abs(vertex.z - lower_z) < 0.001) / 2
    upper_y = sum(vertex.y for vertex in vertices if abs(vertex.z - upper_z) < 0.001) / 2
    ratio = min(1.0, max(0.0, (height - lower_z) / (upper_z - lower_z)))
    return lower_y + (upper_y - lower_y) * ratio


def wheel_parent_chain(root: bpy.types.Object) -> list[bpy.types.Object]:
    return object_parent_chain(root)


def validate_wheel_roots(
    asset: str,
    wheel_roots: list[bpy.types.Object],
    expected_wheelbase: float,
) -> list[str]:
    failures: list[str] = []
    if len(wheel_roots) != len(TRAFFIC_WHEEL_NAMES):
        failures.append(
            f"{asset}: expected four wheel roots, found {len(wheel_roots)}"
        )
        return failures

    identities = {root.as_pointer() for root in wheel_roots}
    if len(identities) != len(wheel_roots):
        failures.append(f"{asset}: wheel roots are not four unique object identities")

    front_y = sum(root.matrix_world.translation.y for root in wheel_roots[:2]) / 2
    rear_y = sum(root.matrix_world.translation.y for root in wheel_roots[2:]) / 2
    wheelbase = front_y - rear_y
    if abs(wheelbase - expected_wheelbase) > TRAFFIC_WHEELBASE_TOLERANCE:
        failures.append(
            f"{asset}: wheelbase {wheelbase:.3f}m expected {expected_wheelbase:.3f}m "
            f"±{TRAFFIC_WHEELBASE_TOLERANCE:.3f}m"
        )

    for root in wheel_roots:
        negative_ancestors = [
            ancestor.name
            for ancestor in wheel_parent_chain(root)
            if min(ancestor.scale) < 0
        ]
        if negative_ancestors:
            failures.append(
                f"{asset}: {root.name} wheel parent chain has negative scale at "
                f"{', '.join(negative_ancestors)}"
            )
    return failures


def validate_reference_sedan_wheels() -> list[str]:
    failures: list[str] = []
    if any(name not in bpy.data.objects for name in TRAFFIC_WHEEL_NAMES):
        return failures

    wheel_roots = [bpy.data.objects[name] for name in TRAFFIC_WHEEL_NAMES]
    identities = {root.as_pointer() for root in wheel_roots}
    if len(identities) != len(wheel_roots):
        failures.append("sedan: wheel roots are not four unique object identities")

    for name, expected_center in REFERENCE_SEDAN_WHEEL_ROOT_CENTERS.items():
        actual_center = bpy.data.objects[name].matrix_world.translation
        for axis, actual, expected in zip(
            ("X", "Y", "Z"),
            actual_center,
            expected_center,
            strict=True,
        ):
            if abs(actual - expected) > REFERENCE_SEDAN_WHEEL_ROOT_TOLERANCE:
                failures.append(
                    f"sedan: {name} center {axis}={actual:.3f}m expected {expected:.3f}m "
                    f"±{REFERENCE_SEDAN_WHEEL_ROOT_TOLERANCE:.3f}m"
                )

    front_y = sum(root.matrix_world.translation.y for root in wheel_roots[:2]) / 2
    rear_y = sum(root.matrix_world.translation.y for root in wheel_roots[2:]) / 2
    wheelbase = front_y - rear_y
    if abs(wheelbase - REFERENCE_SEDAN_WHEELBASE) > REFERENCE_SEDAN_WHEELBASE_TOLERANCE:
        failures.append(
            f"sedan: wheelbase {wheelbase:.3f}m expected {REFERENCE_SEDAN_WHEELBASE:.3f}m "
            f"±{REFERENCE_SEDAN_WHEELBASE_TOLERANCE:.3f}m"
        )

    for root in wheel_roots:
        tire = bpy.data.objects.get(f"{root.name}_TIRE")
        rim = bpy.data.objects.get(f"{root.name}_RIM")
        if tire is None or rim is None:
            continue
        if tire.type != "MESH":
            failures.append(f"sedan: {tire.name} must be a mesh")
        if rim.type != "MESH":
            failures.append(f"sedan: {rim.name} must be a mesh")
        if tire is rim:
            failures.append(f"sedan: {root.name} tire and rim must be distinct mesh objects")
        if tire.parent is not root:
            failures.append(f"sedan: {tire.name} must be parented under {root.name}")
        if rim.parent is not root:
            failures.append(f"sedan: {rim.name} must be parented under {root.name}")
        if tire.type == "MESH":
            if not all(polygon.use_smooth for polygon in tire.data.polygons):
                failures.append(f"sedan: {tire.name} must be smooth shaded")
            root_inverse = root.matrix_world.inverted()
            points = [root_inverse @ tire.matrix_world @ vertex.co for vertex in tire.data.vertices]
            radii = [math.hypot(point.y, point.z) for point in points]
            if not radii:
                failures.append(f"sedan: {tire.name} has no radial samples")
                continue
            mean_radius = sum(radii) / len(radii)
            max_error = max(abs(radius - mean_radius) for radius in radii)
            if abs(mean_radius - REFERENCE_SEDAN_TIRE_RADIUS) > REFERENCE_SEDAN_TIRE_RADIUS_TOLERANCE:
                failures.append(
                    f"sedan: {tire.name} mean radius {mean_radius:.3f}m expected "
                    f"{REFERENCE_SEDAN_TIRE_RADIUS:.3f}m ±{REFERENCE_SEDAN_TIRE_RADIUS_TOLERANCE:.3f}m"
                )
            if max_error > 0.01:
                failures.append(f"sedan: {tire.name} radial error {max_error:.3f}m exceeds 0.010m")
            if rim.type == "MESH":
                rim_points = [root_inverse @ rim.matrix_world @ vertex.co for vertex in rim.data.vertices]
                rim_radius = max((math.hypot(point.y, point.z) for point in rim_points), default=0.0)
                if rim_radius >= min(radii):
                    failures.append(
                        f"sedan: {rim.name} rim radius {rim_radius:.3f}m must remain inside "
                        f"the tire radius {min(radii):.3f}m"
                    )

            tire_material = tire.active_material
            if tire_material is None:
                failures.append(f"sedan: {tire.name} is missing a material")
            elif not tire_material.use_nodes:
                failures.append(f"sedan: {tire.name} material must use nodes")
            else:
                principled = tire_material.node_tree.nodes.get("Principled BSDF")
                if principled is None:
                    failures.append(f"sedan: {tire.name} material is missing Principled BSDF")
                else:
                    if principled.inputs["Metallic"].default_value > REFERENCE_SEDAN_MAX_TIRE_METALLIC:
                        failures.append(f"sedan: {tire.name} material must remain non-metallic")
                    if principled.inputs["Roughness"].default_value < REFERENCE_SEDAN_MIN_TIRE_ROUGHNESS:
                        failures.append(f"sedan: {tire.name} material must remain rubber-like")

            rim_material = rim.active_material
            if rim_material is None:
                failures.append(f"sedan: {rim.name} is missing a material")
            elif not rim_material.use_nodes:
                failures.append(f"sedan: {rim.name} material must use nodes")
            else:
                principled = rim_material.node_tree.nodes.get("Principled BSDF")
                if principled is None:
                    failures.append(f"sedan: {rim.name} material is missing Principled BSDF")
                else:
                    if principled.inputs["Metallic"].default_value < REFERENCE_SEDAN_MIN_RIM_METALLIC:
                        failures.append(f"sedan: {rim.name} material must remain metallic")
                    if principled.inputs["Roughness"].default_value > REFERENCE_SEDAN_MAX_RIM_ROUGHNESS:
                        failures.append(f"sedan: {rim.name} material is too rough")
    return failures


def validate_reference_sedan_cockpit() -> list[str]:
    required = {"ROOF_LINING", "INNER_A_PILLAR_L", "INNER_A_PILLAR_R"}
    if any(name not in bpy.data.objects for name in required):
        return []

    failures: list[str] = []
    roof = bpy.data.objects["ROOF_LINING"]
    roof_points = [roof.matrix_world @ Vector(corner) for corner in roof.bound_box]
    roof_min_z = min(point.z for point in roof_points)
    roof_center_y = sum(point.y for point in roof_points) / len(roof_points)
    for name in ("INNER_A_PILLAR_L", "INNER_A_PILLAR_R"):
        pillar = bpy.data.objects[name]
        if pillar.type != "MESH":
            failures.append(f"sedan: {name} must be a mesh")
            continue
        pillar_points = [pillar.matrix_world @ vertex.co for vertex in pillar.data.vertices]
        if max(point.z for point in pillar_points) < roof_min_z - 0.03:
            failures.append(f"sedan: {name} must connect to the roof lining")
        expected_x = min(point.x for point in roof_points) if name.endswith("_L") else max(
            point.x for point in roof_points
        )
        if min(abs(point.x - expected_x) for point in pillar_points) > REFERENCE_SEDAN_PILLAR_EDGE_TOLERANCE:
            failures.append(f"sedan: {name} must meet the roof edge")
        if min(abs(point.y - roof_center_y) for point in pillar_points) > REFERENCE_SEDAN_PILLAR_DEPTH_TOLERANCE:
            failures.append(f"sedan: {name} must meet the roof depth")
    return failures


def validate_asset(
    root: Path,
    asset: str,
    expected: tuple[float, float, float, bool],
    traffic_wheelbase: float = TRAFFIC_WHEELBASE,
) -> list[str]:
    width, length, height, player_controls = expected
    path = root / "public" / "models" / "vehicles" / f"{asset}.glb"
    if not path.is_file():
        return [f"{asset}: missing file {path}"]

    clear_scene()
    failures: list[str] = []
    try:
        bpy.ops.import_scene.gltf(filepath=str(path))
    except Exception as error:
        return [f"{asset}: import failed: {error}"]

    required = COMMON_NODES | (PLAYER_NODES if player_controls else set())
    if asset == "sedan":
        required |= SEDAN_REFERENCE_NODES
    if asset == "traffic-compact":
        required |= TRAFFIC_DETAIL_NODES
    missing = sorted(required.difference(bpy.data.objects.keys()))
    if missing:
        failures.append(f"{asset}: missing nodes: {', '.join(missing)}")

    if asset == "sedan" and not missing:
        for root_name in ("COCKPIT_ROOT", "EXTERIOR_ROOT"):
            if bpy.data.objects[root_name].parent is not None:
                failures.append(f"sedan: {root_name} must be top-level")
        for root_name, names in (
            ("COCKPIT_ROOT", SEDAN_COCKPIT_ROOT_NODES),
            ("EXTERIOR_ROOT", SEDAN_EXTERIOR_ROOT_NODES),
        ):
            expected_root = bpy.data.objects[root_name]
            for name in sorted(names):
                parent = bpy.data.objects[name].parent
                while parent is not None and parent is not expected_root:
                    parent = parent.parent
                if parent is None:
                    failures.append(f"sedan: {name} must be parented under {root_name}")

    negative_scale = sorted(
        obj.name
        for obj in bpy.context.scene.objects
        if min(obj.scale) < 0
    )
    if negative_scale:
        failures.append(f"{asset}: negative scale: {', '.join(negative_scale)}")

    try:
        measurement_exclusions = {"MIRROR_L", "MIRROR_R"} if asset == "traffic-compact" else set()
        minimum, maximum = world_bounds(measurement_exclusions)
    except ValueError as error:
        failures.append(f"{asset}: {error}")
    else:
        actual = (maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z)
        labels = ("width", "length", "height")
        dimension_tolerance = (
            TRAFFIC_DIMENSION_TOLERANCE
            if asset == "traffic-compact"
            else DIMENSION_TOLERANCE
        )
        for label, got, wanted in zip(labels, actual, (width, length, height), strict=True):
            if abs(got - wanted) > dimension_tolerance:
                failures.append(f"{asset}: {label} {got:.3f}m expected {wanted:.3f}m")
        if abs(minimum.z) > GROUND_TOLERANCE:
            failures.append(f"{asset}: ground clearance starts at Z={minimum.z:.3f}m")

    if all(name in bpy.data.objects for name in ("HEADLIGHT_L", "HEADLIGHT_R", "BRAKE_L", "BRAKE_R")):
        front_lights = [node_world_forward_axis("HEADLIGHT_L"), node_world_forward_axis("HEADLIGHT_R")]
        rear_lights = [node_world_forward_axis("BRAKE_L"), node_world_forward_axis("BRAKE_R")]
        if min(front_lights) <= max(rear_lights):
            failures.append(f"{asset}: headlights are not ahead along +Y/front")

    if all(name in bpy.data.objects for name in TRAFFIC_WHEEL_NAMES):
        front_wheels = [node_world_forward_axis("WHEEL_FL"), node_world_forward_axis("WHEEL_FR")]
        rear_wheels = [node_world_forward_axis("WHEEL_RL"), node_world_forward_axis("WHEEL_RR")]
        if min(front_wheels) <= max(rear_wheels):
            failures.append(f"{asset}: front wheels are not ahead along +Y/front")

    if player_controls and all(name in bpy.data.objects for name in ("STEERING_WHEEL", "GLASS_FRONT")):
        steering = bpy.data.objects["STEERING_WHEEL"].matrix_world.translation
        glass_axis = front_glass_axis_at_height(steering.z)
        clearance = glass_axis - steering.y
        if clearance < STEERING_GLASS_CLEARANCE:
            failures.append(
                f"{asset}: steering wheel clears front glass by {clearance:.3f}m "
                f"expected at least {STEERING_GLASS_CLEARANCE:.3f}m"
            )

    paint_found = any(
        slot.material and slot.material.name == "PAINT"
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        for slot in obj.material_slots
    )
    if not paint_found:
        failures.append(f"{asset}: missing PAINT material")

    if asset == "sedan":
        failures.extend(validate_reference_sedan_wheels())
        failures.extend(validate_reference_sedan_cockpit())

        size = path.stat().st_size
        triangles = triangle_count()
        print(f"METRIC sedan bytes={size} triangles={triangles}")
        if size > MAX_RUNTIME_BYTES:
            failures.append(f"sedan: file size {size} bytes exceeds {MAX_RUNTIME_BYTES}")
        if triangles > MAX_RUNTIME_TRIANGLES:
            failures.append(f"sedan: triangle count {triangles} exceeds {MAX_RUNTIME_TRIANGLES}")

    if asset == "traffic-compact":
        if all(name in bpy.data.objects for name in TRAFFIC_WHEEL_NAMES):
            wheel_roots = [bpy.data.objects[name] for name in TRAFFIC_WHEEL_NAMES]
            failures.extend(validate_wheel_roots(asset, wheel_roots, traffic_wheelbase))

        size = path.stat().st_size
        triangles = triangle_count()
        print(f"METRIC traffic-compact bytes={size} triangles={triangles}")
        if size > MAX_RUNTIME_BYTES:
            failures.append(f"{asset}: file size {size} bytes exceeds {MAX_RUNTIME_BYTES}")
        if triangles > MAX_RUNTIME_TRIANGLES:
            failures.append(f"{asset}: triangle count {triangles} exceeds {MAX_RUNTIME_TRIANGLES}")

        for name in (
            "HEADLIGHT_L",
            "HEADLIGHT_R",
            "BRAKE_L",
            "BRAKE_R",
            "BLINKER_FL",
            "BLINKER_FR",
            "BLINKER_RL",
            "BLINKER_RR",
        ):
            if name in bpy.data.objects:
                depth = object_world_size(name).y
                if depth > MAX_LAMP_DEPTH:
                    failures.append(
                        f"{asset}: {name} depth {depth:.3f}m exceeds fitted lens limit {MAX_LAMP_DEPTH:.3f}m"
                    )

        for name in ("WHEEL_FL_RIM", "WHEEL_FR_RIM", "WHEEL_RL_RIM", "WHEEL_RR_RIM"):
            if name in bpy.data.objects:
                diameter = object_world_size(name).z
                if diameter > MAX_RIM_DIAMETER:
                    failures.append(
                        f"{asset}: {name} diameter {diameter:.3f}m exceeds {MAX_RIM_DIAMETER:.3f}m"
                    )

        body = bpy.data.objects.get("BODY")
        if body:
            body_corners = [body.matrix_world @ Vector(corner) for corner in body.bound_box]
            body_rear = min(corner.y for corner in body_corners)
            body_front = max(corner.y for corner in body_corners)
            side_glass = [
                bpy.data.objects[name]
                for name in ("GLASS_LEFT", "GLASS_RIGHT")
                if name in bpy.data.objects
            ]
            beltline = min(
                (glass.matrix_world @ Vector(corner)).z
                for glass in side_glass
                for corner in glass.bound_box
            ) if side_glass else None
            for name in ("WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR"):
                wheel = bpy.data.objects.get(name)
                if not wheel:
                    continue
                wheel_center = wheel.matrix_world.translation
                if not body_rear <= wheel_center.y <= body_front:
                    failures.append(
                        f"{asset}: {name} wheel center Y={wheel_center.y:.3f}m is outside "
                        f"body length {body_rear:.3f}m..{body_front:.3f}m"
                    )
                if beltline is not None and wheel_center.z >= beltline:
                    failures.append(
                        f"{asset}: {name} wheel center Z={wheel_center.z:.3f}m is not below "
                        f"beltline {beltline:.3f}m"
                    )
                clearance = body_wheel_clearance(body, wheel)
                if clearance is not None and clearance < MIN_TRAFFIC_WHEEL_WELL_RADIUS:
                    failures.append(
                        f"{asset}: {name} wheel-well clearance {clearance:.3f}m is below "
                        f"{MIN_TRAFFIC_WHEEL_WELL_RADIUS:.3f}m"
                    )

        glass_material = bpy.data.materials.get("GLASS")
        if glass_material and glass_material.diffuse_color[3] > MAX_GLASS_ALPHA:
            failures.append(
                f"{asset}: GLASS alpha {glass_material.diffuse_color[3]:.2f} exceeds {MAX_GLASS_ALPHA:.2f}"
            )

    return failures


def main() -> None:
    root = repository_root()
    results = [
        (
            asset,
            validate_asset(
                root,
                asset,
                expected,
                KAYKIT_TRAFFIC_WHEELBASE if asset == "traffic-compact" else TRAFFIC_WHEELBASE,
            ),
        )
        for asset, expected in EXPECTED.items()
    ]
    failures = [failure for _, asset_failures in results for failure in asset_failures]
    if failures:
        print("VEHICLE_ASSET_VALIDATION_FAILED")
    for asset, asset_failures in results:
        print(f"PASS {asset}" if not asset_failures else f"FAIL {asset}")
        for failure in asset_failures:
            print(f"FAIL {failure}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
