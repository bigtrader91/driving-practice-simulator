# Blender Vehicle Asset Pipeline Design

**Date:** 2026-08-25
**Status:** Awaiting user review
**Scope:** Replace the box-built player, traffic, and parked vehicle visuals with locally generated Blender assets while preserving the existing driving physics and coordinate contracts.

## Goal

The game should show recognizable, proportionate vehicles rather than stacked rectangular boxes. The player car, moving traffic, and parked obstacles must share the same coherent visual language without changing collision dimensions, mission behavior, or the established local `-Z` forward direction.

Success requires:

- four distinct silhouettes: compact hatchback, sedan, SUV, and traffic truck;
- sloped glazing, rounded body panels, wheel arches, actual tires and rims, bumpers, mirrors, grille, and separate lamp surfaces;
- player cars retaining working steering wheels, steerable front wheels, blinkers, brake lights, headlights, and wipers;
- traffic and parked cars using the same model family instead of box-only stand-ins;
- cockpit, hood, mirror, and backup camera sight lines remaining unobstructed;
- assets loading without console errors and maintaining usable frame pacing in the busiest traffic mission.

## Chosen Approach

Use an image-generated orthographic concept sheet as art direction, then build the actual meshes with a deterministic Blender Python script. Blender exports one binary glTF (`.glb`) per silhouette. The game loads and clones those assets with Three.js `GLTFLoader`.

Blender MCP is not part of the required pipeline. The local Blender CLI and a checked-in Python generator provide reproducible output without adding an always-on third-party code-execution bridge. MCP may be considered later only for supervised viewport refinement.

## Visual Direction

The target is realistic training-simulator readability rather than showroom photorealism. Proportions should resemble contemporary Korean road vehicles, while surfaces remain moderately low-poly and clean enough for a browser game.

- Body: broad continuous surfaces formed from longitudinal cross-sections, with beveled panel edges rather than stacked cuboids.
- Glass: dark blue-gray transparent panes with visibly sloped windscreen and rear glass.
- Wheels: round tire and alloy-rim geometry seated inside visible wheel arches.
- Identity: compact has a short hood and tall cabin; sedan has a low three-box profile; SUV has a taller squared shoulder; truck has a separate cab and cargo body.
- Materials: restrained metallic paint, rubber, glass, dark trim, chrome accents, and emissive lamp surfaces. Color variation comes from cloning only the body material per vehicle instance.

The generated concept sheet is a reference artifact, not a texture pasted onto the model and not a runtime dependency.

## Source and Generated Artifacts

```text
assets/vehicle-concepts/vehicle-family.png
assets/blender/generate_vehicles.py
assets/blender/vehicles.blend
public/models/vehicles/compact.glb
public/models/vehicles/sedan.glb
public/models/vehicles/suv.glb
public/models/vehicles/truck.glb
```

`generate_vehicles.py` is the reproducible source of geometry and material setup. It saves `vehicles.blend` for manual inspection and exports the four runtime GLBs. Generated files are committed only after their size and validity are verified and only after a separate commit approval.

## Asset Contract

Every GLB uses meters, rests on ground plane `Y=0`, is centered on `X=0`, and faces local `-Z`. Its dimensions match the corresponding existing vehicle configuration or traffic dimensions.

Stable node and material names form the integration contract:

- `BODY` with material `PAINT`
- `GLASS_FRONT`, `GLASS_REAR`, and side glass nodes
- `WHEEL_FL`, `WHEEL_FR`, `WHEEL_RL`, `WHEEL_RR`
- `HEADLIGHT_L`, `HEADLIGHT_R`
- `BRAKE_L`, `BRAKE_R`
- `BLINKER_FL`, `BLINKER_FR`, `BLINKER_RL`, `BLINKER_RR`
- player-capable assets additionally include `STEERING_WHEEL`, `WIPER_L`, and `WIPER_R`

The loader validates required nodes and throws a descriptive error naming the asset and missing nodes. It does not silently substitute the old box model.

## Runtime Architecture

Add a focused `VehicleModelFactory` module with three responsibilities:

1. preload the four GLB templates once;
2. validate and clone the requested template;
3. return the existing runtime handles for wheels, lamps, steering wheel, and wipers.

`SimulationCanvas` awaits asset loading before adding vehicle objects and starting the animation loop. An initialization failure is surfaced in the visible simulator UI and in the console. Cancellation prevents a late load from mutating a disposed scene.

The existing `CarModel` runtime contract remains the compatibility boundary for player animation, but its box-built geometry is replaced by the loaded asset plus only those dynamic Three.js lights that cannot be baked into GLB. Physics, collision boxes, mission evaluation, camera offsets, and input behavior remain unchanged.

Moving traffic obtains clones from the sedan, SUV, or truck template according to `TrafficVehicleData.type`. Parked obstacles use sedan clones while keeping their existing collision boxes and penalty names. Shared geometry and base materials avoid duplicating GPU resources; body paint is the only per-instance material clone.

## Coordinate and Camera Safety

The current simulation defines local `-Z` as forward. Blender exports directly in that orientation, so the new assets must not rely on the current corrective `group.scale.z = -1` reflection.

Automated checks preserve these invariants:

- headlights are ahead of brake lights along local `-Z`;
- all four wheel centers are on their expected left/right and front/rear sides;
- right steering rotates both front wheels toward the rendered right side;
- cockpit and hood-camera rays have no opaque intersections in front of the camera;
- backup-camera and mirror rays remain clear;
- model bounds stay within a small tolerance of configured width, length, and height.

## Test and Verification Strategy

Implementation follows red-green-refactor:

1. Add failing contract tests for required nodes, dimensions, direction, clone isolation, and missing-asset errors.
2. Add a Blender-side validation script/test that opens the generated assets and checks names, bounds, transforms, and material slots.
3. Implement the generator and factory until those tests pass.
4. Update player, traffic, and parked integrations and retain all existing motion, guide, camera, and mission tests.
5. Run the complete Vitest suite and production build.
6. Use Playwright on the local app to verify compact, sedan, SUV, traffic truck, and parked cars from cockpit, mirror, rear-camera, and external-visible views.
7. Inspect screenshots rather than relying only on DOM assertions. In the busiest traffic scene, compare browser frame timing before and after and reject obvious sustained stutter or WebGL errors.

## Non-Goals

- branded or manufacturer-identical vehicles;
- downloadable third-party models or unclear asset licenses;
- damage deformation, opening doors, suspension simulation, or animated occupants;
- changing collision physics to follow every visible body contour;
- adding Blender MCP as a permanent project dependency.

## Risks and Controls

- **Opaque geometry blocks the cockpit:** camera-ray tests and direct cockpit screenshots gate acceptance.
- **Wrong vehicle orientation:** the `-Z` export contract is validated before integration; no compensating reflection is allowed.
- **Large downloads or draw-call growth:** four shared templates, moderate mesh density, shared geometry/materials, and GLB size readback limit the cost.
- **Async initialization races:** initialization uses cancellation and disposes partially created resources.
- **Generated binary drift:** the Blender script remains the source of truth, and generated GLBs are validated in the same verification command.
