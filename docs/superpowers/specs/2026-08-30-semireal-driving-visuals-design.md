# Semi-Real Driving Visuals Design

**Date:** 2026-08-30
**Status:** Approved in chat
**Scope:** Establish one production-quality sedan and city lane-change scene as the visual and performance reference for later vehicle and map expansion.

## Goal

Replace the current windshield-only cockpit impression and visibly faceted wheels with a believable browser-based driving view. The reference scene should feel like a restrained driving simulator rather than a block-built game while preserving the existing mission, physics, collision, persistence, and input contracts.

The selected direction is a semi-real hybrid:

- desktop and laptop rendering favors material, shadow, and environment quality;
- mobile landscape remains playable through a deterministic reduced-quality profile;
- visual realism comes from purposeful geometry, materials, lighting, and camera placement rather than expensive post-processing;
- the first deliverable is the sedan on the city lane-change course, not a simultaneous rewrite of every vehicle and map.

## User-Visible Outcome

In first-person cockpit view, the player sees a three-dimensional sedan interior with:

- windshield boundaries and slim A-pillars;
- side B-pillar hints where naturally visible during a glance;
- roof lining, dashboard, instrument hood, and part of the front seats;
- a working three-dimensional steering wheel;
- a small, stable portion of the front hood beyond the windshield.

The camera sits at a believable driver eye position. Opaque exterior geometry does not cover the windshield, and the view does not collapse to an empty sheet of glass.

In chase, top, hood, and mirror views, the sedan has a coherent exterior and wheels with a circular silhouette. Tires use a rubber material, rims use a separate metallic material, and wheel steering and rolling remain synchronized with the existing simulation.

The city lane-change scene gains textured asphalt, worn lane paint, beveled and windowed buildings, improved roadside vegetation, and more natural daylight, fog, and shadows. These changes do not alter driveable geometry or scoring.

## Delivery Boundary

This iteration creates a reference vertical slice:

1. one selectable player sedan with matching cockpit and exterior;
2. the `city_lane_change` scene with the semi-real environment treatment;
3. desktop-high and mobile-balanced render profiles;
4. automated asset, rendering, and behavior checks;
5. browser screenshot and frame-timing evidence.

Compact, SUV, truck, traffic, parked vehicles, and other mission environments retain their existing production assets unless a shared renderer change naturally benefits them without changing their appearance contract.

Creating genuinely different training-map topologies is explicitly separate work. The existing `visualVariant` scenery changes remain, but this design does not claim to solve the single-map training structure.

## Vehicle Asset Architecture

### Deterministic source

Extend the checked-in Blender Python pipeline instead of introducing an opaque downloaded model or a manual-only Blender edit. The generated GLB and any `.blend` inspection artifact are outputs; the script, constants, and checked-in source references remain the reproducible source of truth.

The sedan asset remains license-safe and unbranded. It uses contemporary ordinary passenger-car proportions, not a sports-car or bus silhouette.

### Render groups

The sedan asset exposes two explicit visual groups:

- `EXTERIOR_ROOT`: body shell, exterior glass, lamps, mirrors, wheel arches, tires, and rims;
- `COCKPIT_ROOT`: dashboard, instrument hood, inner A/B-pillars, roof lining, seats, steering wheel, and the cockpit-visible hood/cowl surfaces.

The runtime never infers these groups by material names or mesh order. A missing required group is a visible asset-load failure.

The existing dynamic handles remain stable:

- `WHEEL_FL`, `WHEEL_FR`, `WHEEL_RL`, `WHEEL_RR`;
- `STEERING_WHEEL`;
- `WIPER_L`, `WIPER_R`;
- front/rear lamp and blinker nodes required by `VehicleAssetContract`.

The contract is extended with the two render roots and cockpit geometry handles only for player-capable reference assets. Traffic-only assets are not forced to contain an interior.

The reference sedan also exposes `DRIVER_EYE`, a measured camera anchor under `COCKPIT_ROOT`. Runtime camera placement uses this anchor instead of deriving an eye position from vehicle height.

### Wheel construction

Each tire uses at least 32 radial segments and smooth shading. The tire and rim are separate meshes under one of the four existing wheel roots. The Blender validator checks:

- distinct wheel roots and correct axle positions;
- circularity within a fixed radial tolerance;
- tire ground contact;
- rim diameter inside the tire envelope;
- unchanged configured wheelbase and vehicle bounds;
- non-negative exported transforms.

The runtime continues rotating and steering the wheel roots. It does not regenerate wheel geometry per frame or replace deterministic animation with shader or model inference.

## Camera and Render-Pass Behavior

The sedan cockpit position is calibrated against the generated GLB rather than guessed from the roof height. A Blender-side camera clearance check and a Three.js ray test prove that the forward view is unobstructed and that a bounded portion of the hood is visible.

Rendering toggles groups explicitly for each pass:

| Pass | Exterior | Cockpit interior |
| --- | --- | --- |
| Main cockpit | hidden | visible, including cockpit hood/cowl representation |
| Main chase/top/hood | visible | hidden |
| Left/right/rear mirror | visible | hidden |
| Backup camera | visible | hidden |

Visibility is restored in `finally` blocks so a renderer exception cannot leave the next pass in a corrupt state.

The HUD's large two-dimensional steering wheel is hidden in cockpit mode because the three-dimensional wheel becomes the authoritative visual. It remains available in external views as control feedback. Speed, gear, signaling, mission, and accessibility information remain HUD elements.

The first-person camera continues using local-axis roll through `orientCameraToward`; the prior upside-down camera regression must remain covered.

## Environment Visual Architecture

Introduce focused factories rather than adding more one-off materials inside `TrackBuilder`:

- `EnvironmentQuality`: deterministic `high` or `balanced` profile selected from viewport size, device pixel ratio, and coarse-pointer capability;
- `RoadMaterialFactory`: repeatable asphalt color/roughness texture and worn lane-paint treatment;
- `CitySceneryFactory`: beveled building shells, facade/window materials, sidewalk details, roadside lights, and improved vegetation for the lane-change scene.

The factories return Three.js resources plus an explicit disposal function. Shared textures and materials are created once per scene and disposed during the existing simulation cleanup.

### Road

The current generated asphalt remains the base, enriched with restrained aggregate variation and roughness. Lane markings gain slight deterministic wear without weakening their gameplay readability. Road meshes, target areas, obstacle bounds, and lane centers remain unchanged.

### Buildings and vegetation

Reference-scene buildings use beveled edges and a small deterministic set of facade/window patterns. They remain low-to-medium density and do not require one mesh or material per window. Trees use a more natural trunk and layered canopy silhouette while preserving instancing or shared geometry where possible.

### Lighting and color

Keep ACES filmic tone mapping, but calibrate exposure, hemisphere light, sun direction, fog color, and shadow camera bounds against the reference screenshots. Do not add bloom, screen-space reflections, depth of field, motion blur, or cinematic color grading in this slice.

## Quality Profiles and Budgets

Quality selection is deterministic code and never an LLM decision.

### Desktop high

- target viewport: 1440x900;
- soft shadows with the existing high-resolution shadow map ceiling;
- complete reference scenery density;
- pixel ratio capped to a measured safe value rather than blindly using the full device ratio;
- target sustained frame rate: at least 45 fps in the lane-change reference scene after warm-up.

### Mobile balanced

- target viewport: 844x390 landscape;
- lower shadow-map resolution and reduced decorative scenery density;
- lower pixel-ratio cap;
- identical road, traffic, mission, collision, and target geometry;
- target sustained frame rate: at least 30 fps after warm-up.

### Asset budgets

- each generated runtime GLB remains below the existing 5 MB limit;
- each GLB remains below the existing 50,000-triangle limit;
- the reference sedan should stay substantially below those hard ceilings, and any increase from the current 225 KB sedan is reported explicitly;
- geometry and immutable materials are shared between clones;
- no new network-time third-party dependency is required to play.

Frame targets are acceptance thresholds for the designated test environment, not universal guarantees for every device. Measurement records median and 95th-percentile frame interval so a misleading average cannot hide sustained stutter.

## Data Flow

1. `VehicleAssetLibrary` loads and validates the reference sedan GLB once.
2. `VehicleAssetContract` binds exterior, cockpit, wheel, lamp, steering, and wiper handles.
3. `SimulationCanvas` selects a deterministic quality profile before creating renderers and scene resources.
4. `TrackBuilder` requests the lane-change environment from the focused scenery/material factories while retaining existing mission geometry.
5. The animation loop updates physical state and dynamic handles exactly as before.
6. Each camera pass toggles the appropriate sedan render groups, renders, and restores visibility.
7. Cleanup disposes renderer-owned scene resources and stops further animation updates.

No new visual state is written into training persistence, and quality selection cannot affect mission outcomes.

## Failure Handling

- Missing cockpit or exterior nodes produce a descriptive visible initialization error and a matching console error.
- The runtime does not silently fall back to the windshield-only view or a procedural box car.
- Invalid dimensions, wheel circularity, camera obstruction, excessive size, or excessive triangle count fail the offline Blender validator before the GLB can be accepted.
- Unsupported or lower-powered devices receive the balanced profile; they do not receive a different physics or mission implementation.
- Resource disposal failures remain visible through the existing cleanup error aggregation rather than being swallowed.

## Test Strategy

Implementation follows red-green-refactor.

### Asset and Blender tests

- required exterior/cockpit group and handle names;
- bounds, ground contact, wheelbase, transform signs, size, and triangle budgets;
- wheel circularity, tire/rim separation, and four distinct wheel roots;
- cockpit camera clearance and bounded hood visibility;
- byte-stable or semantically stable deterministic regeneration as supported by the current Blender version.

### TypeScript tests

- strict binding errors for missing cockpit nodes;
- clone material isolation and shared immutable geometry;
- cockpit/exterior visibility for main, mirror, and backup render passes;
- visibility restoration after a thrown render call;
- three-dimensional steering wheel and external wheel handles receive existing steering/rolling updates;
- HUD wheel visibility changes only by camera mode;
- high/balanced profile selection is deterministic at viewport boundaries;
- environment factories preserve mission obstacle and target geometry and dispose resources.

### Browser verification

- cockpit, hood, chase, top, left/right/rear mirror, and backup views at 1440x900;
- cockpit and external views at 844x390 landscape;
- visual inspection for A/B-pillars, dashboard, hood amount, clipping, duplicate steering wheels, circular wheels, ground contact, material coherence, and readable road markings;
- active steering, wheel roll, signaling, braking lamps, mirror glance, mission completion, failure, and reset;
- zero page, console, WebGL, and same-origin request failures;
- asset transfer sizes and frame timing after a fixed warm-up and driving interval.

The screenshot set includes matching before/after framing so visual improvement is assessed against the current scene rather than from isolated attractive images.

## Acceptance Criteria

The vertical slice is complete only when all of the following are true:

1. cockpit view visibly includes the approved interior elements and a restrained hood portion without clipping;
2. chase/top/mirror views show circular wheels with correct steering and rolling behavior;
3. the lane-change scene has visibly improved road, building, vegetation, lighting, and shadow treatment;
4. desktop and mobile use their intended deterministic quality profiles;
5. physics, mission scoring, training persistence, and collision geometry produce unchanged automated results;
6. all unit, integration, Blender validation, production build, and browser checks pass;
7. measured asset and frame budgets satisfy the documented thresholds;
8. the user reviews the final before/after screenshot set before broader rollout to other vehicles and maps.

## Non-Goals

- manufacturer-identical or branded cars;
- showroom photorealism;
- occupants, animated hands, opening doors, damage, suspension, or deformable tires;
- per-pixel reflections, ray tracing, heavy post-processing, or weather;
- changing vehicle physics to match every visible contour;
- replacing every vehicle or map in the first implementation;
- creating additional training-map layouts as part of this visual slice.

## Expansion After the Reference Slice

Only after the reference scene passes visual and performance acceptance should the same contracts be extended in separate slices:

1. compact and SUV cockpit/exterior assets;
2. traffic and parked vehicle material/wheel consistency;
3. other existing mission environments;
4. genuinely distinct lane-change map layouts.

Each expansion reuses the validated asset contract, render-pass behavior, quality profiles, and evidence format rather than reopening the core architecture.
