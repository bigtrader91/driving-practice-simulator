# Khronos Traffic Sedan Design

**Date:** 2026-08-27
**Status:** Approved in chat on 2026-08-27
**Scope:** Adapt the officially distributed Khronos CarConcept GLB into one game-ready moving sedan-traffic asset. Player, SUV, truck, parked vehicles, collision behavior, physics, and missions remain unchanged.

## Goal

Replace only the rectangular moving-sedan visual with a recognizable, materially detailed car. The first iteration proves the complete asset pipeline with one vehicle before expanding to other vehicle classes.

The result is accepted only when:

- six Blender inspection renders show a coherent car with no floating, missing, inverted, or visibly collapsed parts;
- Khronos and 3D Commerce logos are removed from the runtime asset;
- the runtime GLB is at most 5 MB and at most 50,000 triangles;
- its visual dimensions are `1.82 m x 4.65 m x 1.45 m` within `0.08 m` per axis;
- local forward is `-Z` without a negative-scale reflection;
- four named wheel roots rotate independently;
- paint, glass, tires, rims, headlights, brake lights, and blinkers remain visually distinct;
- a load or contract failure is shown in the simulator and console instead of silently falling back to box geometry;
- the busiest traffic mission has no WebGL errors or obvious sustained frame stutter.

## Source and License

The immutable source remains outside Git on the data disk:

```text
/data/ai/modly/sources/khronos-car-concept/CarConcept.glb
/data/ai/modly/sources/khronos-car-concept/LICENSE.md
```

The source is the Khronos glTF Sample Assets `CarConcept`, credited to Darmstadt Graphics Group GmbH and Eric Chadwick under CC BY 4.0. The repository records the attribution and source URL alongside the generated runtime asset.

The converter never modifies the immutable source and performs no network access. It fails visibly when the source, license receipt, or expected mesh content is absent.

## Chosen Approach

Use the existing high-quality source mesh and materials, then perform deterministic Blender cleanup and optimization. This is preferred over generating another vehicle because the geometry, glazing, interior, wheels, and PBR materials are already coherent and legally documented.

Rejected alternatives:

- continue through Sketchfab authentication for a generic sedan: closer silhouette but currently blocked by account linking and Real ID;
- reuse the Hunyuan/Picanto mesh: it passed structural validation but failed visual review;
- replace every vehicle type at once: hides asset-specific defects and increases runtime and QA scope before the first model is proven.

## Blender Conversion

Add a deterministic headless Blender converter that:

1. imports the source GLB and removes source cameras, lights, presentation helpers, logos, and unused material variants;
2. selects one restrained road-car paint variant and keeps the existing glass, interior, tire, rim, and trim appearance;
3. joins static body detail only where doing so does not destroy material identity;
4. reduces hidden and duplicate geometry before applying controlled decimation;
5. normalizes the visible car to the existing sedan dimensions, ground plane, origin, and forward contract: Blender `+Y` becomes glTF/runtime `-Z` after export;
6. creates or renames the required body, glazing, wheel, and lamp nodes without duplicating visible source parts;
7. exports a single binary glTF to the existing `public/models/vehicles/traffic-compact.glb` path;
8. exits non-zero with a specific validation error if any runtime contract or budget cannot be met.

The total correction budget for the remaining vehicle work is twenty diagnosed rounds, including the first three failed conversion rounds. There are no automatic retries or silent substitutions. Every counted round names the observed failure, targeted change, and resulting evidence. Stop when the twentieth round is exhausted without a complete game-ready result.

## Asset Contract

Reuse the existing `traffic-compact` kind in `VehicleAssetContract` rather than adding a second name or loading path. It requires:

- `BODY`
- `GLASS_FRONT`, `GLASS_REAR`, `GLASS_LEFT`, `GLASS_RIGHT`
- `WHEEL_FL`, `WHEEL_FR`, `WHEEL_RL`, `WHEEL_RR`
- `HEADLIGHT_L`, `HEADLIGHT_R`
- `BRAKE_L`, `BRAKE_R`
- `BLINKER_FL`, `BLINKER_FR`, `BLINKER_RL`, `BLINKER_RR`

Mutable material names are `PAINT`, `HEADLIGHT`, `BRAKE`, and `BLINKER`. Each traffic instance receives isolated mutable materials; geometry and immutable glass, tire, rim, interior, and trim materials remain shared.

Blender validation checks dimensions, ground contact, Blender `+Y` forward orientation, non-negative transforms, required names, distinct wheel roots, materials, file size, and triangle count. Three.js tests parse the real GLB and prove that its exported front points toward runtime local `-Z` without a compensating negative scale.

## Runtime Integration

Add one shared `VehicleAssetLibrary` that loads and validates `traffic-compact.glb` once, caches its in-flight or fulfilled promise, and clones instances with independent paint and lamp materials. It exposes the group, four wheel roots, headlights, and brake lights.

`SimulationCanvas` waits for this asset before constructing moving sedan traffic. Sedan position, heading, yielding, high-beam, brake-light behavior, mission evaluation, and collision dimensions remain authoritative in the existing simulation data. SUV and truck traffic keep their current procedural visuals. Player and parked vehicles are untouched.

The animation loop rotates all four wheels from traveled distance. A failed load produces an actionable UI error and console error; it does not substitute the old boxes.

## Approval Gates and Verification

Implementation follows two explicit gates:

1. **Asset gate:** convert and validate the GLB, render front, rear, side, front-three-quarter, rear-three-quarter, and elevated views, copy the render pack to `~/다운로드`, and perform a recorded multimodal PASS/FAIL review.
2. **Runtime gate:** only after the recorded render review passes, implement the loader and moving-sedan integration. The user's 2026-08-27 instruction to finish within the twenty-round budget authorizes proceeding through this gate without another pause.

Verification follows red-green-refactor:

1. add failing validator and contract expectations;
2. implement the converter until the real GLB passes byte, triangle, dimensions, node, material, and transform checks;
3. add real-GLB loader tests for parsing, caching, material isolation, wheel handles, and actionable errors;
4. add a focused traffic-visual selection test proving only sedan uses the asset;
5. run targeted tests, the complete Vitest suite, vehicle validation, and the production build;
6. run browser QA in the busiest traffic mission, inspecting cockpit and mirror views, wheel rotation, ground contact, lights, console/WebGL errors, and sustained frame behavior.

## Non-Goals

- changing driving physics, collisions, missions, or traffic behavior;
- replacing the player, parked, SUV, or truck visuals in this iteration;
- recreating an exact production sedan or preserving source logos;
- requiring the user to operate Blender;
- adding Blender MCP, new model-generation software, automatic retry, CDN delivery, damage, suspension, doors, occupants, or multiple LOD levels;
- committing, pushing, opening a pull request, merging, or deploying without separate approval.

## Risks and Controls

- **Concept-car proportions remain too extreme:** normalize to the existing sedan envelope and reject the six-view render before integration if it still reads as unsuitable.
- **Decimation damages curved panels or glass openings:** reduce hidden/detail geometry first, decimate by part, and compare every correction render against the source preview.
- **Advanced glTF materials render inconsistently:** retain only extensions supported by the current Three.js version and validate the exported GLB in both Blender and the browser.
- **Shared material mutation recolors every car:** clone mutable materials per instance and test two differently colored clones.
- **Large geometry stalls the browser:** enforce both 5 MB and 50,000-triangle ceilings before runtime work starts.
- **Dirty-worktree overlap loses prior work:** touch only the new converter, validator/contract seam, runtime asset, and later loader/integration files; never clean or reset unrelated changes.
