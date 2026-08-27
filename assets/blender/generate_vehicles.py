from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Vector


@dataclass(frozen=True)
class VehicleSpec:
    width: float
    length: float
    height: float
    wheelbase: float
    wheel_radius: float
    belt_height: float
    cabin_front: float
    cabin_rear: float
    cockpit: tuple[float, float, float] | None


SPECS = {
    "compact": VehicleSpec(1.60, 3.60, 1.55, 2.40, 0.30, 0.82, -0.82, 1.18, (-0.35, 1.28, -0.45)),
    "sedan": VehicleSpec(1.82, 4.68, 1.44, 2.72, 0.32, 0.76, -0.78, 1.34, (-0.40, 1.25, -0.55)),
    "suv": VehicleSpec(1.91, 4.83, 1.70, 2.81, 0.36, 0.90, -0.92, 1.46, (-0.45, 1.48, -0.65)),
    "truck": VehicleSpec(2.30, 7.50, 2.80, 4.20, 0.40, 1.05, -3.05, -0.72, None),
}


def repository_root() -> Path:
    if "--" not in sys.argv:
        raise SystemExit("usage: blender --background --python generate_vehicles.py -- REPOSITORY_ROOT")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise SystemExit("expected exactly one REPOSITORY_ROOT argument")
    return Path(arguments[0]).resolve()


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
    transmission: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    shader = result.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if "Alpha" in shader.inputs:
            shader.inputs["Alpha"].default_value = color[3]
        if "Transmission Weight" in shader.inputs:
            shader.inputs["Transmission Weight"].default_value = transmission
        if emission and "Emission Color" in shader.inputs:
            shader.inputs["Emission Color"].default_value = emission
            shader.inputs["Emission Strength"].default_value = emission_strength
    return result


def build_materials() -> dict[str, bpy.types.Material]:
    return {
        "paint": material("PAINT", (0.06, 0.30, 0.80, 1.0), metallic=0.72, roughness=0.22),
        "glass": material("GLASS", (0.018, 0.055, 0.090, 1.0), roughness=0.18, transmission=0.04),
        "trim": material("TRIM", (0.012, 0.016, 0.022, 1.0), roughness=0.55),
        "tire": material("TIRE", (0.008, 0.009, 0.011, 1.0), roughness=0.88),
        "rim": material("RIM", (0.42, 0.48, 0.56, 1.0), metallic=0.90, roughness=0.18),
        "chrome": material("CHROME", (0.68, 0.72, 0.78, 1.0), metallic=0.96, roughness=0.12),
        "interior": material("INTERIOR", (0.025, 0.032, 0.045, 1.0), roughness=0.82),
        "headlight": material(
            "HEADLIGHT",
            (0.92, 0.97, 1.0, 1.0),
            roughness=0.15,
            emission=(0.80, 0.92, 1.0, 1.0),
            emission_strength=2.2,
        ),
        "brake": material(
            "BRAKE",
            (0.72, 0.008, 0.012, 1.0),
            roughness=0.20,
            emission=(1.0, 0.005, 0.008, 1.0),
            emission_strength=0.7,
        ),
        "blinker": material(
            "BLINKER",
            (1.0, 0.30, 0.01, 1.0),
            roughness=0.18,
            emission=(1.0, 0.12, 0.0, 1.0),
            emission_strength=0.45,
        ),
    }


def link_object(obj: bpy.types.Object, collection: bpy.types.Collection) -> bpy.types.Object:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    modifier = obj.modifiers.new(name="Edge Bevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    apply_modifier(obj, modifier)


def create_profile_mesh(
    name: str,
    sections: list[tuple[float, float, float, float]],
    assigned_material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel_width: float = 0.035,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for z, half_width, lower_y, upper_y in sections:
        vertices.extend(
            [
                (-half_width, lower_y, z),
                (half_width, lower_y, z),
                (-half_width, upper_y, z),
                (half_width, upper_y, z),
            ]
        )

    faces: list[tuple[int, ...]] = []
    for index in range(len(sections) - 1):
        current = index * 4
        following = current + 4
        faces.extend(
            [
                (current, following, following + 1, current + 1),
                (current + 2, current + 3, following + 3, following + 2),
                (current, current + 2, following + 2, following),
                (current + 1, following + 1, following + 3, current + 3),
            ]
        )
    last = (len(sections) - 1) * 4
    faces.extend([(0, 1, 3, 2), (last, last + 2, last + 3, last + 1)])

    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(assigned_material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bevel(obj, bevel_width)
    return obj


def create_quad(
    name: str,
    points: list[tuple[float, float, float]],
    assigned_material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(points, [], [(0, 1, 2, 3)])
    mesh.materials.append(assigned_material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def create_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel_width: float = 0.02,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(assigned_material)
    if bevel_width > 0:
        bevel(obj, bevel_width)
    return obj


def create_cylinder_between(
    name: str,
    start: Vector,
    end: Vector,
    radius: float,
    assigned_material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    direction = end - start
    midpoint = (start + end) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=direction.length, location=midpoint)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(assigned_material)
    bevel(obj, radius * 0.18, 2)
    return obj


def create_arch(
    name: str,
    x: float,
    y: float,
    z: float,
    radius: float,
    assigned_material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_CURVE", type="CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.022
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    segments = 16
    spline.points.add(segments)
    for index in range(segments + 1):
        angle = math.pi * index / segments
        spline.points[index].co = (
            x,
            y + math.sin(angle) * radius,
            z + math.cos(angle) * radius,
            1.0,
        )
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    curve.materials.append(assigned_material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return obj


def create_wheel(
    name: str,
    x: float,
    y: float,
    z: float,
    radius: float,
    width: float,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    root.location = (x, y, z)
    collection.objects.link(root)

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=width, location=(0, 0, 0), rotation=(0, math.pi / 2, 0))
    tire = link_object(bpy.context.object, collection)
    tire.name = f"{name}_TIRE"
    tire.data.materials.append(materials["tire"])
    tire.parent = root
    for polygon in tire.data.polygons:
        polygon.use_smooth = True

    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius * 0.66, depth=width + 0.006, location=(0, 0, 0), rotation=(0, math.pi / 2, 0))
    rim = link_object(bpy.context.object, collection)
    rim.name = f"{name}_RIM"
    rim.data.materials.append(materials["rim"])
    rim.parent = root
    for polygon in rim.data.polygons:
        polygon.use_smooth = True

    for index in range(5):
        angle = index * math.tau / 5
        spoke = create_box(
            f"{name}_SPOKE_{index + 1}",
            (width + 0.012, radius * 0.10, radius * 0.92),
            (0, 0, 0),
            materials["chrome"],
            collection,
            bevel_width=0.008,
        )
        spoke.rotation_euler.x = angle
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        spoke.parent = root

    return root


def create_lamp_pair(
    left_name: str,
    right_name: str,
    z: float,
    y: float,
    width: float,
    depth: float,
    assigned_material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> tuple[bpy.types.Object, bpy.types.Object]:
    lamp_width = width * 0.22
    x = width * 0.32
    left = create_box(left_name, (lamp_width, width * 0.09, depth), (-x, y, z), assigned_material, collection, bevel_width=0.025)
    right = create_box(right_name, (lamp_width, width * 0.09, depth), (x, y, z), assigned_material, collection, bevel_width=0.025)
    return left, right


def create_car_glass_and_cabin(
    spec: VehicleSpec,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> None:
    width = spec.width
    height = spec.height
    belt = spec.belt_height
    cabin_front = spec.cabin_front
    cabin_rear = spec.cabin_rear
    roof_front = cabin_front + spec.length * 0.16
    roof_rear = cabin_rear - spec.length * 0.10
    glass_half_width = width * 0.405
    glass_bottom_half_width = width * 0.445
    roof_y = height - 0.075

    create_profile_mesh(
        "ROOF_BODY",
        [
            (roof_front, width * 0.36, roof_y, height),
            ((roof_front + roof_rear) * 0.5, width * 0.405, roof_y, height),
            (roof_rear, width * 0.36, roof_y, height),
        ],
        materials["paint"],
        collection,
        bevel_width=0.025,
    )

    create_quad(
        "GLASS_FRONT",
        [
            (-glass_bottom_half_width, belt + 0.015, cabin_front),
            (glass_bottom_half_width, belt + 0.015, cabin_front),
            (glass_half_width, roof_y - 0.015, roof_front),
            (-glass_half_width, roof_y - 0.015, roof_front),
        ],
        materials["glass"],
        collection,
    )
    create_quad(
        "GLASS_REAR",
        [
            (glass_bottom_half_width, belt + 0.015, cabin_rear),
            (-glass_bottom_half_width, belt + 0.015, cabin_rear),
            (-glass_half_width, roof_y - 0.015, roof_rear),
            (glass_half_width, roof_y - 0.015, roof_rear),
        ],
        materials["glass"],
        collection,
    )

    left_x = -width * 0.445
    right_x = width * 0.445
    side_points = [
        (left_x, belt + 0.025, cabin_front + 0.03),
        (left_x, roof_y - 0.02, roof_front + 0.02),
        (left_x, roof_y - 0.02, roof_rear - 0.02),
        (left_x, belt + 0.025, cabin_rear - 0.03),
    ]
    create_quad("GLASS_LEFT", side_points, materials["glass"], collection)
    create_quad(
        "GLASS_RIGHT",
        [(right_x, y, z) for _, y, z in reversed(side_points)],
        materials["glass"],
        collection,
    )

    for side, x in (("L", left_x), ("R", right_x)):
        create_cylinder_between(
            f"A_PILLAR_{side}",
            Vector((x, belt, cabin_front)),
            Vector((x * 0.91, roof_y, roof_front)),
            0.040,
            materials["paint"],
            collection,
        )
        create_cylinder_between(
            f"B_PILLAR_{side}",
            Vector((x, belt, (cabin_front + cabin_rear) * 0.50)),
            Vector((x * 0.91, roof_y, (roof_front + roof_rear) * 0.50)),
            0.034,
            materials["trim"],
            collection,
        )
        create_cylinder_between(
            f"C_PILLAR_{side}",
            Vector((x, belt, cabin_rear)),
            Vector((x * 0.91, roof_y, roof_rear)),
            0.052,
            materials["paint"],
            collection,
        )
        create_cylinder_between(
            f"ROOF_RAIL_{side}",
            Vector((x * 0.91, roof_y, roof_front)),
            Vector((x * 0.91, roof_y, roof_rear)),
            0.045,
            materials["paint"],
            collection,
        )
        create_cylinder_between(
            f"BELT_RAIL_{side}",
            Vector((x, belt, cabin_front)),
            Vector((x, belt, cabin_rear)),
            0.032,
            materials["paint"],
            collection,
        )

    mirror_y = belt + (height - belt) * 0.20
    mirror_z = cabin_front + spec.length * 0.08
    create_box("MIRROR_L", (0.14, 0.12, 0.22), (-width / 2 + 0.07, mirror_y, mirror_z), materials["paint"], collection, bevel_width=0.045)
    create_box("MIRROR_R", (0.14, 0.12, 0.22), (width / 2 - 0.07, mirror_y, mirror_z), materials["paint"], collection, bevel_width=0.045)


def create_player_interior(
    spec: VehicleSpec,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> None:
    assert spec.cockpit is not None
    cockpit_x, cockpit_y, cockpit_z = spec.cockpit
    dashboard_y = min(spec.belt_height - 0.10, cockpit_y - 0.32)
    dashboard_z = spec.cabin_front + spec.length * 0.10
    create_box(
        "DASHBOARD",
        (spec.width * 0.78, 0.18, 0.36),
        (0, dashboard_y, dashboard_z),
        materials["interior"],
        collection,
        bevel_width=0.045,
    )

    for side, seat_x in (("DRIVER", cockpit_x), ("PASSENGER", -cockpit_x)):
        create_box(
            f"SEAT_{side}_BASE",
            (0.46, 0.16, 0.52),
            (seat_x, 0.48, cockpit_z + 0.20),
            materials["interior"],
            collection,
            bevel_width=0.06,
        )
        seat_back = create_box(
            f"SEAT_{side}_BACK",
            (0.46, 0.66, 0.15),
            (seat_x, 0.82, cockpit_z + 0.42),
            materials["interior"],
            collection,
            bevel_width=0.055,
        )
        seat_back.rotation_euler.x = -0.10
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    steering = bpy.data.objects.new("STEERING_WHEEL", None)
    steering_y = cockpit_y - 0.29
    roof_front = spec.cabin_front + spec.length * 0.16
    roof_y = spec.height - 0.075
    windshield_ratio = (steering_y - spec.belt_height) / (roof_y - spec.belt_height)
    windshield_z = spec.cabin_front + (roof_front - spec.cabin_front) * windshield_ratio
    steering.location = (cockpit_x, steering_y, windshield_z + 0.18)
    collection.objects.link(steering)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.17,
        minor_radius=0.022,
        major_segments=24,
        minor_segments=8,
        location=(0, 0, 0),
    )
    rim = link_object(bpy.context.object, collection)
    rim.name = "STEERING_WHEEL_RIM"
    rim.data.materials.append(materials["interior"])
    rim.parent = steering
    create_box("STEERING_SPOKE_H", (0.28, 0.025, 0.018), (0, 0, 0), materials["chrome"], collection, bevel_width=0.006).parent = steering
    create_box("STEERING_SPOKE_V", (0.025, 0.13, 0.018), (0, -0.05, 0), materials["chrome"], collection, bevel_width=0.006).parent = steering
    steering.rotation_euler.x = math.radians(14)

    wiper_y = spec.belt_height + 0.045
    wiper_z = spec.cabin_front - 0.012
    for name, x in (("WIPER_L", -spec.width * 0.22), ("WIPER_R", spec.width * 0.10)):
        root = bpy.data.objects.new(name, None)
        root.location = (x, wiper_y, wiper_z)
        collection.objects.link(root)
        blade = create_box(f"{name}_BLADE", (0.44, 0.018, 0.018), (0.20, 0, 0), materials["trim"], collection, bevel_width=0.004)
        blade.parent = root
        root.rotation_euler.y = 0.10 if name == "WIPER_L" else -0.12


def create_passenger_vehicle(
    kind: str,
    spec: VehicleSpec,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> None:
    length = spec.length
    width = spec.width
    belt = spec.belt_height
    nose_factor = 0.42 if kind == "compact" else 0.48
    tail_factor = 0.45 if kind == "compact" else 0.48
    create_profile_mesh(
        "BODY",
        [
            (-length / 2, width * nose_factor, 0.24, belt * 0.72),
            (-length * 0.38, width * 0.49, 0.20, belt * 0.90),
            (spec.cabin_front, width * 0.50, 0.18, belt),
            (spec.cabin_rear, width * 0.50, 0.18, belt),
            (length * 0.43, width * 0.49, 0.21, belt * 0.91),
            (length / 2, width * tail_factor, 0.27, belt * 0.76),
        ],
        materials["paint"],
        collection,
        bevel_width=0.045,
    )
    create_car_glass_and_cabin(spec, materials, collection)

    hood_front = -length / 2 + 0.16
    hood_rear = spec.cabin_front - 0.07
    create_profile_mesh(
        "HOOD_PANEL",
        [
            (hood_front, width * 0.34, belt * 0.73, belt * 0.755),
            ((hood_front + hood_rear) * 0.52, width * 0.42, belt * 0.89, belt * 0.915),
            (hood_rear, width * 0.43, belt * 0.97, belt * 0.995),
        ],
        materials["paint"],
        collection,
        bevel_width=0.018,
    )
    if kind == "sedan":
        create_profile_mesh(
            "TRUNK_DECK",
            [
                (spec.cabin_rear + 0.06, width * 0.42, belt * 0.91, belt * 0.94),
                (length / 2 - 0.15, width * 0.43, belt * 0.79, belt * 0.82),
            ],
            materials["paint"],
            collection,
            bevel_width=0.018,
        )

    for side, x in (("L", -width * 0.492), ("R", width * 0.492)):
        create_box(
            f"ROCKER_{side}",
            (0.026, 0.09, length * 0.68),
            (x, 0.27, 0.08),
            materials["trim"],
            collection,
            bevel_width=0.009,
        )
        create_cylinder_between(
            f"WINDOW_SILL_{side}",
            Vector((x, belt + 0.015, spec.cabin_front + 0.03)),
            Vector((x, belt + 0.015, spec.cabin_rear - 0.03)),
            0.014,
            materials["chrome"],
            collection,
        )
        door_centers = (
            (spec.cabin_front + spec.cabin_rear) * 0.42,
            (spec.cabin_front + spec.cabin_rear) * 0.73,
        )
        for index, z in enumerate(door_centers, start=1):
            create_box(
                f"DOOR_SEAM_{side}_{index}",
                (0.018, belt * 0.56, 0.022),
                (x, belt * 0.56, z),
                materials["trim"],
                collection,
                bevel_width=0.005,
            )
        for index, z in enumerate((spec.cabin_front + length * 0.28, spec.cabin_rear - length * 0.22), start=1):
            create_box(
                f"DOOR_HANDLE_{side}_{index}",
                (0.025, 0.035, 0.18),
                (x, belt * 0.82, z),
                materials["chrome"],
                collection,
                bevel_width=0.012,
            )

    wheel_width = min(0.22, width * 0.13)
    wheel_x = width / 2 - wheel_width / 2
    front_z = -spec.wheelbase / 2
    rear_z = spec.wheelbase / 2
    for name, x, z in (
        ("WHEEL_FL", -wheel_x, front_z),
        ("WHEEL_FR", wheel_x, front_z),
        ("WHEEL_RL", -wheel_x, rear_z),
        ("WHEEL_RR", wheel_x, rear_z),
    ):
        create_wheel(name, x, spec.wheel_radius, z, spec.wheel_radius, wheel_width, materials, collection)
        create_arch(f"ARCH_{name[-2:]}", math.copysign(width * 0.485, x), spec.wheel_radius, z, spec.wheel_radius * 1.13, materials["trim"], collection)

    lamp_depth = 0.05
    create_lamp_pair(
        "HEADLIGHT_L",
        "HEADLIGHT_R",
        -length / 2 + lamp_depth / 2,
        belt * 0.68,
        width,
        lamp_depth,
        materials["headlight"],
        collection,
    )
    create_lamp_pair(
        "BRAKE_L",
        "BRAKE_R",
        length / 2 - lamp_depth / 2,
        belt * 0.68,
        width,
        lamp_depth,
        materials["brake"],
        collection,
    )
    blinker_width = width * 0.11
    for name, x, z in (
        ("BLINKER_FL", -width * 0.43, -length / 2 + lamp_depth / 2),
        ("BLINKER_FR", width * 0.43, -length / 2 + lamp_depth / 2),
        ("BLINKER_RL", -width * 0.43, length / 2 - lamp_depth / 2),
        ("BLINKER_RR", width * 0.43, length / 2 - lamp_depth / 2),
    ):
        create_box(name, (blinker_width, width * 0.055, lamp_depth), (x, belt * 0.62, z), materials["blinker"], collection, bevel_width=0.018)

    create_box("GRILLE", (width * 0.54, belt * 0.22, 0.035), (0, belt * 0.46, -length / 2 + 0.018), materials["trim"], collection, bevel_width=0.025)
    for index in range(3):
        create_box(
            f"GRILLE_BAR_{index + 1}",
            (width * (0.44 - index * 0.025), 0.018, 0.018),
            (0, belt * (0.40 + index * 0.07), -length / 2 + 0.009),
            materials["chrome"],
            collection,
            bevel_width=0.006,
        )
    create_box("BUMPER_FRONT", (width * 0.80, 0.10, 0.12), (0, 0.30, -length / 2 + 0.06), materials["trim"], collection, bevel_width=0.035)
    create_box("BUMPER_REAR", (width * 0.80, 0.10, 0.12), (0, 0.30, length / 2 - 0.06), materials["trim"], collection, bevel_width=0.035)
    create_player_interior(spec, materials, collection)


def create_truck(
    spec: VehicleSpec,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> None:
    width = spec.width
    length = spec.length
    height = spec.height
    create_profile_mesh(
        "BODY",
        [
            (-length / 2, width * 0.46, 0.28, 0.82),
            (-length * 0.36, width * 0.49, 0.22, 0.94),
            (length * 0.40, width * 0.49, 0.22, 0.80),
            (length / 2, width * 0.44, 0.28, 0.72),
        ],
        materials["paint"],
        collection,
        bevel_width=0.055,
    )

    cab_center_z = (spec.cabin_front + spec.cabin_rear) / 2
    cab_length = spec.cabin_rear - spec.cabin_front
    create_box("CAB_BODY", (width * 0.96, height * 0.61, cab_length), (0, 1.10, cab_center_z), materials["paint"], collection, bevel_width=0.10)
    cargo_front = spec.cabin_rear + 0.14
    cargo_length = length / 2 - cargo_front
    create_box(
        "CARGO_BODY",
        (width, height - 0.72, cargo_length),
        (0, 0.72 + (height - 0.72) / 2, cargo_front + cargo_length / 2),
        materials["paint"],
        collection,
        bevel_width=0.055,
    )
    create_box("CARGO_REAR_FRAME", (width * 0.90, height * 0.72, 0.035), (0, 1.66, length / 2 - 0.018), materials["chrome"], collection, bevel_width=0.012)

    glass_y = 1.56
    front_z = -length / 2 + 0.018
    create_box("GLASS_FRONT", (width * 0.72, 0.56, 0.028), (0, glass_y, front_z), materials["glass"], collection, bevel_width=0.045)
    create_box("GLASS_REAR", (width * 0.52, 0.34, 0.028), (0, 1.58, spec.cabin_rear - 0.018), materials["glass"], collection, bevel_width=0.035)
    create_box("GLASS_LEFT", (0.028, 0.52, cab_length * 0.52), (-width * 0.481, 1.53, cab_center_z), materials["glass"], collection, bevel_width=0.04)
    create_box("GLASS_RIGHT", (0.028, 0.52, cab_length * 0.52), (width * 0.481, 1.53, cab_center_z), materials["glass"], collection, bevel_width=0.04)

    wheel_width = 0.25
    wheel_x = width / 2 - wheel_width / 2
    wheel_positions = (-spec.wheelbase * 0.52, spec.wheelbase * 0.48)
    for name, x, z in (
        ("WHEEL_FL", -wheel_x, wheel_positions[0]),
        ("WHEEL_FR", wheel_x, wheel_positions[0]),
        ("WHEEL_RL", -wheel_x, wheel_positions[1]),
        ("WHEEL_RR", wheel_x, wheel_positions[1]),
    ):
        create_wheel(name, x, spec.wheel_radius, z, spec.wheel_radius, wheel_width, materials, collection)
        create_arch(f"ARCH_{name[-2:]}", math.copysign(width * 0.485, x), spec.wheel_radius, z, spec.wheel_radius * 1.12, materials["trim"], collection)

    lamp_depth = 0.05
    create_lamp_pair("HEADLIGHT_L", "HEADLIGHT_R", -length / 2 + lamp_depth / 2, 0.82, width, lamp_depth, materials["headlight"], collection)
    create_lamp_pair("BRAKE_L", "BRAKE_R", length / 2 - lamp_depth / 2, 0.72, width, lamp_depth, materials["brake"], collection)
    for name, x, z in (
        ("BLINKER_FL", -width * 0.43, -length / 2 + lamp_depth / 2),
        ("BLINKER_FR", width * 0.43, -length / 2 + lamp_depth / 2),
        ("BLINKER_RL", -width * 0.43, length / 2 - lamp_depth / 2),
        ("BLINKER_RR", width * 0.43, length / 2 - lamp_depth / 2),
    ):
        create_box(name, (0.18, 0.10, lamp_depth), (x, 0.66, z), materials["blinker"], collection, bevel_width=0.018)
    create_box("GRILLE", (width * 0.60, 0.34, 0.035), (0, 0.66, -length / 2 + 0.018), materials["trim"], collection, bevel_width=0.035)
    create_box("BUMPER_FRONT", (width * 0.84, 0.13, 0.12), (0, 0.34, -length / 2 + 0.06), materials["chrome"], collection, bevel_width=0.035)
    create_box("BUMPER_REAR", (width * 0.84, 0.13, 0.12), (0, 0.34, length / 2 - 0.06), materials["chrome"], collection, bevel_width=0.035)
    create_box("MIRROR_L", (0.14, 0.26, 0.20), (-width / 2 + 0.07, 1.54, -length * 0.37), materials["trim"], collection, bevel_width=0.045)
    create_box("MIRROR_R", (0.14, 0.26, 0.20), (width / 2 - 0.07, 1.54, -length * 0.37), materials["trim"], collection, bevel_width=0.045)
    for index in range(4):
        create_box(
            f"TRUCK_GRILLE_BAR_{index + 1}",
            (width * (0.50 - index * 0.025), 0.022, 0.018),
            (0, 0.56 + index * 0.09, -length / 2 + 0.009),
            materials["chrome"],
            collection,
            bevel_width=0.006,
        )
    for side, x in (("L", -width * 0.482), ("R", width * 0.482)):
        create_box(
            f"TRUCK_DOOR_SEAM_{side}",
            (0.022, 0.88, 0.022),
            (x, 1.02, spec.cabin_rear - 0.14),
            materials["trim"],
            collection,
            bevel_width=0.006,
        )
        create_box(
            f"TRUCK_HANDLE_{side}",
            (0.026, 0.05, 0.19),
            (x, 1.28, spec.cabin_rear - 0.36),
            materials["chrome"],
            collection,
            bevel_width=0.012,
        )


def create_vehicle(
    kind: str,
    spec: VehicleSpec,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Collection:
    collection = bpy.data.collections.new(kind.upper())
    bpy.context.scene.collection.children.link(collection)
    if kind == "truck":
        create_truck(spec, materials, collection)
    else:
        create_passenger_vehicle(kind, spec, materials, collection)

    root = bpy.data.objects.new("VEHICLE_ROOT", None)
    collection.objects.link(root)
    for obj in list(collection.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    root.rotation_euler.x = math.pi / 2
    return collection


def export_collection(collection: bpy.types.Collection, output: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
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
    )


def main() -> None:
    root = repository_root()
    for kind, spec in SPECS.items():
        reset_scene()
        materials = build_materials()
        collection = create_vehicle(kind, spec, materials)
        output = root / "public" / "models" / "vehicles" / f"{kind}.glb"
        export_collection(collection, output)
        print(f"GENERATED {kind} {output}")

    reset_scene()
    materials = build_materials()
    for kind, spec in SPECS.items():
        create_vehicle(kind, spec, materials)
    blend_path = root / "assets" / "blender" / "vehicles.blend"
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)


if __name__ == "__main__":
    main()
