# Semi-Real Driving Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-quality sedan cockpit and exterior plus a semi-real city lane-change reference scene without changing driving physics or mission results.

**Architecture:** Extend the deterministic Blender vehicle pipeline with explicit exterior/cockpit render roots, a measured driver-eye anchor, and circular wheel geometry. Add pure quality selection and focused road/city scenery factories, then integrate them through camera-pass visibility guards in `SimulationCanvas` while preserving the current simulation contracts.

**Tech Stack:** React 19, TypeScript 5.7, Three.js r174, Vitest 4, Blender Python, Vite 6, Playwright Python for temporary browser QA.

**Spec:** `docs/superpowers/specs/2026-08-30-semireal-driving-visuals-design.md`

## Global Constraints

- Before Task 1, update this isolated branch from current `origin/main`. The observed upstream commit `fefbd47` changes `HUD.tsx` and `HUD.test.tsx`; preserve its DrivePrep branding behavior while applying Task 4's camera-mode visibility change.
- The first slice covers the selectable sedan and `city_lane_change` only.
- Do not change road centers, target areas, obstacle bounds, traffic data, physics, scoring, persistence, or input behavior.
- Use deterministic checked-in Blender Python; do not download a new runtime model or add a runtime third-party dependency.
- Require `EXTERIOR_ROOT`, `COCKPIT_ROOT`, and `DRIVER_EYE` for the sedan; fail visibly if they are missing.
- Keep each runtime GLB below 5,000,000 bytes and 50,000 triangles.
- Desktop high targets at least 45 fps at 1440x900; mobile balanced targets at least 30 fps at 844x390 after warm-up.
- Limit visual refinement to three measured browser loops. If the third loop misses a visual or performance threshold, stop and present the evidence instead of adding a fourth speculative fix.
- Every commit step is an approval checkpoint. Do not execute a listed `git commit` without explicit commit approval.
- Do not push, open a PR, merge, deploy, delete a branch, or remove a worktree without its own approval.

---

## File Map

- `assets/blender/prepare_vehicle_family.py`: produce the sedan's cockpit/exterior groups, driver-eye anchor, and smooth wheel geometry.
- `assets/blender/test_reference_sedan.py`: Blender-side behavioral tests for the new sedan contract.
- `assets/blender/validate_vehicles.py`: enforce runtime node, circularity, bounds, size, and triangle budgets.
- `public/models/vehicles/sedan.glb`: generated reference sedan output.
- `src/components/3d/EnvironmentQuality.ts`: pure desktop/mobile quality selection.
- `src/components/3d/EnvironmentQuality.test.ts`: exact profile-boundary tests.
- `src/components/3d/VehicleAssetContract.ts`: strict sedan render-root and driver-eye binding.
- `src/components/3d/VehicleAssetContract.test.ts`: fixture and real-GLB contract coverage.
- `src/components/3d/VehicleRenderPass.ts`: exception-safe camera-pass visibility switching.
- `src/components/3d/VehicleRenderPass.test.ts`: pass matrix and restoration tests.
- `src/components/3d/CarModel.tsx`: expose render roots and the driver-eye handle to the simulation.
- `src/components/3d/RoadMaterialFactory.ts`: create and dispose reference-scene road/lane materials.
- `src/components/3d/RoadMaterialFactory.test.ts`: material and disposal tests.
- `src/components/3d/CitySceneryFactory.ts`: build deterministic high/balanced lane-change scenery.
- `src/components/3d/CitySceneryFactory.test.ts`: deterministic density, geometry-sharing, and cleanup tests.
- `src/components/3d/TrackBuilder.tsx`: consume the factories only for `city_lane_change`.
- `src/components/3d/TrackBuilder.test.ts`: prove gameplay geometry is unchanged.
- `src/components/3d/SimulationCanvas.tsx`: apply quality, measured driver eye, and render-pass guards.
- `src/components/3d/SimulationCanvas.vehicle-assets.test.tsx`: integration coverage for render ordering and errors.
- `src/components/ui/HUD.tsx`: hide the 2D steering wheel only in cockpit mode.
- `src/components/ui/HUD.test.tsx`: camera-mode steering-wheel visibility.
- `package.json`: add the focused Blender reference-sedan test command.

---

### Task 1: Deterministic Environment Quality Profiles

**Files:**
- Create: `src/components/3d/EnvironmentQuality.ts`
- Create: `src/components/3d/EnvironmentQuality.test.ts`

**Interfaces:**
- Produces: `EnvironmentQualityName`, `EnvironmentQuality`, `EnvironmentQualityInput`, and `chooseEnvironmentQuality(input): EnvironmentQuality`.
- Consumed by: Tasks 5 and 6.

- [ ] **Step 1: Write the failing profile tests**

```ts
import { describe, expect, it } from 'vitest';
import { chooseEnvironmentQuality } from './EnvironmentQuality';

describe('chooseEnvironmentQuality', () => {
  it('uses desktop high for a wide non-coarse viewport', () => {
    expect(chooseEnvironmentQuality({
      width: 1440,
      height: 900,
      devicePixelRatio: 2,
      coarsePointer: false,
    })).toEqual({
      name: 'high',
      pixelRatioCap: 1.25,
      shadowMapSize: 1024,
      sceneryDensity: 0.8,
    });
  });

  it.each([
    { width: 844, height: 390, devicePixelRatio: 2, coarsePointer: true },
    { width: 1023, height: 768, devicePixelRatio: 1, coarsePointer: false },
  ])('uses mobile balanced for $width x $height', (input) => {
    expect(chooseEnvironmentQuality(input)).toEqual({
      name: 'balanced',
      pixelRatioCap: 1,
      shadowMapSize: 512,
      sceneryDensity: 0.45,
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/components/3d/EnvironmentQuality.test.ts`

Expected: FAIL because `EnvironmentQuality.ts` does not exist.

- [ ] **Step 3: Implement the pure selector**

```ts
export type EnvironmentQualityName = 'high' | 'balanced';

export interface EnvironmentQualityInput {
  width: number;
  height: number;
  devicePixelRatio: number;
  coarsePointer: boolean;
}

export interface EnvironmentQuality {
  name: EnvironmentQualityName;
  pixelRatioCap: number;
  shadowMapSize: 512 | 1024 | 2048;
  sceneryDensity: number;
}

export const ENVIRONMENT_QUALITY = {
  high: { name: 'high', pixelRatioCap: 1.25, shadowMapSize: 1024, sceneryDensity: 0.8 },
  balanced: { name: 'balanced', pixelRatioCap: 1, shadowMapSize: 512, sceneryDensity: 0.45 },
} as const satisfies Record<EnvironmentQualityName, EnvironmentQuality>;

const HIGH = ENVIRONMENT_QUALITY.high;
const BALANCED = ENVIRONMENT_QUALITY.balanced;

export const chooseEnvironmentQuality = (input: EnvironmentQualityInput): EnvironmentQuality => (
  input.width >= 1024 && !input.coarsePointer ? HIGH : BALANCED
);
```

- [ ] **Step 4: Run focused and full tests**

Run: `npm test -- src/components/3d/EnvironmentQuality.test.ts`

Expected: 2 profile tests pass.

Run: `npm test`

Expected: all existing tests plus the new profile tests pass.

- [ ] **Step 5: Commit checkpoint**

```bash
git add src/components/3d/EnvironmentQuality.ts src/components/3d/EnvironmentQuality.test.ts
git commit -m "feat: add deterministic visual quality profiles"
```

---

### Task 2: Reference Sedan Blender Contract and Geometry

**Files:**
- Create: `assets/blender/test_reference_sedan.py`
- Modify: `assets/blender/prepare_vehicle_family.py`
- Modify: `assets/blender/validate_vehicles.py`
- Modify: `package.json`
- Generate: `public/models/vehicles/sedan.glb`

**Interfaces:**
- Produces GLB nodes: `EXTERIOR_ROOT`, `COCKPIT_ROOT`, `DRIVER_EYE`, `DASHBOARD`, `INSTRUMENT_HOOD`, `INNER_A_PILLAR_L`, `INNER_A_PILLAR_R`, `INNER_B_PILLAR_L`, `INNER_B_PILLAR_R`, `ROOF_LINING`, and the existing wheel/lamp/control handles.
- Preserves: configured sedan dimensions `(1.82, 4.68, 1.44)` and wheelbase `2.72`.
- Consumed by: Tasks 3, 4, and 6.

- [ ] **Step 1: Add a Blender-side failing contract test**

Create a Blender Python test that imports the generated sedan and asserts exact roots, measured eye position, and wheel geometry:

```py
from pathlib import Path
import math
import bpy

REQUIRED = {
    "EXTERIOR_ROOT", "COCKPIT_ROOT", "DRIVER_EYE", "DASHBOARD",
    "INSTRUMENT_HOOD", "INNER_A_PILLAR_L", "INNER_A_PILLAR_R",
    "INNER_B_PILLAR_L", "INNER_B_PILLAR_R", "ROOF_LINING",
    "WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR",
}

def assert_reference_sedan(root: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root / "public/models/vehicles/sedan.glb"))
    names = {obj.name for obj in bpy.context.scene.objects}
    missing = sorted(REQUIRED - names)
    assert not missing, f"sedan reference nodes missing: {', '.join(missing)}"
    eye = bpy.data.objects["DRIVER_EYE"].matrix_world.translation
    assert -0.55 <= eye.x <= -0.25
    assert 1.08 <= eye.z <= 1.28
    for wheel_name in ("WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR"):
        tire = bpy.data.objects[f"{wheel_name}_TIRE"]
        root_inverse = bpy.data.objects[wheel_name].matrix_world.inverted()
        points = [root_inverse @ tire.matrix_world @ vertex.co for vertex in tire.data.vertices]
        radial_angles = {
            round(math.atan2(point.z, point.y), 5)
            for point in points
            if math.hypot(point.y, point.z) > 0.20
        }
        assert len(radial_angles) >= 32, f"{wheel_name} tire is visibly faceted"
```

Add this script entry:

```json
"vehicles:test-reference": "blender --background --python-exit-code 1 --python assets/blender/test_reference_sedan.py -- ."
```

- [ ] **Step 2: Run the Blender test and confirm RED**

Run: `npm run vehicles:test-reference`

Expected: FAIL listing `EXTERIOR_ROOT`, `COCKPIT_ROOT`, `DRIVER_EYE`, and interior nodes as missing.

- [ ] **Step 3: Add deterministic sedan wheel geometry**

In `prepare_vehicle_family.py`, after normalization and before export, remove the sedan source-wheel meshes and add four wheels under the existing roots:

```py
def add_reference_wheel(root: bpy.types.Object, radius: float, width: float) -> None:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32, radius=radius, depth=width,
        location=root.matrix_world.translation,
        rotation=(0, math.pi / 2, 0),
    )
    tire = bpy.context.object
    tire.name = f"{root.name}_TIRE"
    tire.data.materials.append(material("TIRE", (0.008, 0.009, 0.011, 1.0)))
    tire.parent = root
    tire.matrix_parent_inverse = root.matrix_world.inverted()
    for polygon in tire.data.polygons:
        polygon.use_smooth = True

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32, radius=radius * 0.64, depth=width + 0.008,
        location=root.matrix_world.translation,
        rotation=(0, math.pi / 2, 0),
    )
    rim = bpy.context.object
    rim.name = f"{root.name}_RIM"
    rim.data.materials.append(material("RIM", (0.42, 0.48, 0.56, 1.0)))
    rim.parent = root
    rim.matrix_parent_inverse = root.matrix_world.inverted()
    for polygon in rim.data.polygons:
        polygon.use_smooth = True
```

Use radius `0.32` and the existing wheel-root centers. Delete only the source wheel children for `sedan`; compact and SUV outputs remain unchanged.

- [ ] **Step 4: Add explicit exterior and cockpit roots**

Create `EXTERIOR_ROOT`, parent the sedan exterior meshes and wheel roots without changing their world transforms, and create `COCKPIT_ROOT` with the required interior nodes. Use fitted boxes with bevels for dashboard, instrument hood, roof liner, and seats; use 12-segment cylinders between measured endpoints for the inner pillars. Add a torus steering rim under the existing `STEERING_WHEEL` handle.

Create the eye anchor at the measured sedan-local position:

```py
driver_eye = add_empty("DRIVER_EYE", (-0.40, -0.48, 1.18))
driver_eye.parent = cockpit_root
```

Keep Blender's source coordinate convention intact and let the existing export conversion produce runtime local `-Z` forward. Place the cockpit-visible hood/cowl mesh under `COCKPIT_ROOT`, not `EXTERIOR_ROOT`.

- [ ] **Step 5: Extend the validator**

For `sedan`, add exact required-node checks and calculate each tire's radial samples around its local X axis:

```py
radii = [math.hypot(vertex.co.y, vertex.co.z) for vertex in tire.data.vertices]
mean_radius = sum(radii) / len(radii)
max_error = max(abs(radius - mean_radius) for radius in radii)
if max_error > 0.01:
    failures.append(f"sedan: {tire.name} radial error {max_error:.3f}m exceeds 0.010m")
```

Retain the current 5 MB, 50,000-triangle, bounds, ground, material, lamp, and transform checks.

- [ ] **Step 6: Generate and validate the reference sedan**

Run: `npm run vehicles:prepare-family`

Expected: compact, sedan, SUV, and truck regenerate; only the sedan contains the new reference roots and reconstructed wheels.

Run: `npm run vehicles:test-reference`

Expected: PASS.

Run: `npm run vehicles:validate`

Expected: all five runtime assets pass; output reports sedan bytes and triangles below the hard ceilings.

- [ ] **Step 7: Record exact binary evidence**

Run: `sha256sum public/models/vehicles/sedan.glb && stat -c '%s bytes' public/models/vehicles/sedan.glb`

Expected: one SHA-256 and a size below 5,000,000 bytes. Copy both values into the implementation checkpoint report; do not hard-code them into tests.

- [ ] **Step 8: Commit checkpoint**

```bash
git add package.json assets/blender/prepare_vehicle_family.py assets/blender/test_reference_sedan.py assets/blender/validate_vehicles.py public/models/vehicles/sedan.glb
git commit -m "feat: build reference sedan cockpit and wheels"
```

---

### Task 3: Strict Runtime Binding for Cockpit and Exterior Roots

**Files:**
- Modify: `src/components/3d/VehicleAssetContract.ts`
- Modify: `src/components/3d/VehicleAssetContract.test.ts`
- Modify: `src/components/3d/VehicleAssetTestUtils.ts`
- Modify: `src/components/3d/VehicleAssetLibrary.test.ts`

**Interfaces:**
- Produces `BoundVehicleAsset.exteriorRoot?: THREE.Object3D`, `cockpitRoot?: THREE.Object3D`, and `driverEye?: THREE.Object3D`.
- Sedan binding requires all three; compact, SUV, truck, and traffic sedan remain compatible without them.
- Consumed by: Tasks 4 and 6.

- [ ] **Step 1: Write failing fixture and binding tests**

```ts
it('binds the sedan exterior, cockpit, and driver eye', () => {
  const fixture = makeVehicleAssetFixture({ kind: 'sedan', referenceCockpit: true });
  const bound = bindVehicleAsset(fixture, 'sedan');
  expect(bound.exteriorRoot?.name).toBe('EXTERIOR_ROOT');
  expect(bound.cockpitRoot?.name).toBe('COCKPIT_ROOT');
  expect(bound.driverEye?.name).toBe('DRIVER_EYE');
});

it.each(['EXTERIOR_ROOT', 'COCKPIT_ROOT', 'DRIVER_EYE'])('rejects sedan without %s', (name) => {
  const fixture = makeVehicleAssetFixture({ kind: 'sedan', referenceCockpit: true });
  const object = fixture.getObjectByName(name)!;
  object.parent?.remove(object);
  expect(() => bindVehicleAsset(fixture, 'sedan')).toThrow(
    new RegExp(`sedan vehicle asset is missing nodes: .*${name}`),
  );
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/components/3d/VehicleAssetContract.test.ts`

Expected: FAIL because the three bound properties do not exist and missing roots are not rejected.

- [ ] **Step 3: Extend the contract minimally**

```ts
export interface BoundVehicleAsset {
  exteriorRoot?: THREE.Object3D;
  cockpitRoot?: THREE.Object3D;
  driverEye?: THREE.Object3D;
}

const referenceSedanNames = ['EXTERIOR_ROOT', 'COCKPIT_ROOT', 'DRIVER_EYE'] as const;
```

Look up those names for `kind === 'sedan'`, append missing names to the existing sorted error, and return the handles. Do not require them for other kinds.

- [ ] **Step 4: Prove clone behavior and real-GLB parsing**

Extend the library test to parse `public/models/vehicles/sedan.glb`, clone it twice, and assert:

```ts
expect(first.exteriorRoot).not.toBe(second.exteriorRoot);
expect(first.cockpitRoot).not.toBe(second.cockpitRoot);
expect(first.driverEye?.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(-0.40, 2);
expect(first.bodyMeshes[0].geometry).toBe(second.bodyMeshes[0].geometry);
```

Mutable paint/lamp materials remain isolated exactly as in the current library tests.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- src/components/3d/VehicleAssetContract.test.ts src/components/3d/VehicleAssetLibrary.test.ts`

Expected: all contract and library tests pass.

Run: `npm test`

Expected: full suite passes.

- [ ] **Step 6: Commit checkpoint**

```bash
git add src/components/3d/VehicleAssetContract.ts src/components/3d/VehicleAssetContract.test.ts src/components/3d/VehicleAssetTestUtils.ts src/components/3d/VehicleAssetLibrary.test.ts
git commit -m "feat: bind sedan cockpit render groups"
```

---

### Task 4: Exception-Safe Vehicle Render Passes and HUD Authority

**Files:**
- Create: `src/components/3d/VehicleRenderPass.ts`
- Create: `src/components/3d/VehicleRenderPass.test.ts`
- Modify: `src/components/3d/CarModel.tsx`
- Modify: `src/components/3d/CarModel.test.ts`
- Modify: `src/components/ui/HUD.tsx`
- Modify: `src/components/ui/HUD.test.tsx`

**Interfaces:**
- Produces `VehicleRenderMode = 'cockpit' | 'external'` and `withVehicleRenderMode(handles, mode, render): void`.
- `Car3DHandles` gains optional `exteriorRoot`, `cockpitRoot`, and `driverEye` handles.
- Consumed by: Task 6.

- [ ] **Step 1: Write the render-matrix and restoration tests**

```ts
it.each([
  ['cockpit', false, true],
  ['external', true, false],
] as const)('uses %s visibility and restores it', (mode, exteriorVisible, cockpitVisible) => {
  const exteriorRoot = new THREE.Group();
  const cockpitRoot = new THREE.Group();
  exteriorRoot.visible = true;
  cockpitRoot.visible = false;
  withVehicleRenderMode({ exteriorRoot, cockpitRoot }, mode, () => {
    expect(exteriorRoot.visible).toBe(exteriorVisible);
    expect(cockpitRoot.visible).toBe(cockpitVisible);
  });
  expect(exteriorRoot.visible).toBe(true);
  expect(cockpitRoot.visible).toBe(false);
});

it('restores both roots after render throws', () => {
  const exteriorRoot = new THREE.Group();
  const cockpitRoot = new THREE.Group();
  cockpitRoot.visible = false;
  expect(() => withVehicleRenderMode(
    { exteriorRoot, cockpitRoot }, 'cockpit', () => { throw new Error('render failed'); },
  )).toThrow('render failed');
  expect([exteriorRoot.visible, cockpitRoot.visible]).toEqual([true, false]);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- src/components/3d/VehicleRenderPass.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the visibility guard**

```ts
export type VehicleRenderMode = 'cockpit' | 'external';

export const withVehicleRenderMode = (
  handles: { exteriorRoot?: THREE.Object3D; cockpitRoot?: THREE.Object3D },
  mode: VehicleRenderMode,
  render: () => void,
): void => {
  const previousExterior = handles.exteriorRoot?.visible;
  const previousCockpit = handles.cockpitRoot?.visible;
  if (handles.exteriorRoot) handles.exteriorRoot.visible = mode === 'external';
  if (handles.cockpitRoot) handles.cockpitRoot.visible = mode === 'cockpit';
  try {
    render();
  } finally {
    if (handles.exteriorRoot && previousExterior !== undefined) handles.exteriorRoot.visible = previousExterior;
    if (handles.cockpitRoot && previousCockpit !== undefined) handles.cockpitRoot.visible = previousCockpit;
  }
};
```

- [ ] **Step 4: Expose the handles from `CarModel`**

Copy `asset.exteriorRoot`, `asset.cockpitRoot`, and `asset.driverEye` onto `Car3DHandles`. For sedan, assert they exist with one descriptive error; keep compact/SUV behavior unchanged.

- [ ] **Step 5: Make the 3D wheel authoritative in cockpit mode**

Change the HUD wrapper only:

```tsx
{cameraMode !== 'cockpit' && (
  <div className="hidden lg:col-start-2 lg:block">
    <LargeSteeringWheel {...steeringWheelProps} />
  </div>
)}
```

Update `HUD.test.tsx` to assert cockpit output omits `DRIVE`/the steering-wheel marker while chase output retains it. Do not hide speed, gear, turn signals, mission content, or keyboard guidance.

- [ ] **Step 6: Run focused and full tests**

Run: `npm test -- src/components/3d/VehicleRenderPass.test.ts src/components/3d/CarModel.test.ts src/components/ui/HUD.test.tsx`

Expected: all focused tests pass.

Run: `npm test`

Expected: full suite passes.

- [ ] **Step 7: Commit checkpoint**

```bash
git add src/components/3d/VehicleRenderPass.ts src/components/3d/VehicleRenderPass.test.ts src/components/3d/CarModel.tsx src/components/3d/CarModel.test.ts src/components/ui/HUD.tsx src/components/ui/HUD.test.tsx
git commit -m "feat: add cockpit-aware vehicle render passes"
```

---

### Task 5: Semi-Real Road Materials and City Scenery

**Files:**
- Create: `src/components/3d/RoadMaterialFactory.ts`
- Create: `src/components/3d/RoadMaterialFactory.test.ts`
- Create: `src/components/3d/CitySceneryFactory.ts`
- Create: `src/components/3d/CitySceneryFactory.test.ts`
- Modify: `src/components/3d/TrackBuilder.tsx`
- Modify: `src/components/3d/TrackBuilder.test.ts`

**Interfaces:**
- Consumes: `EnvironmentQuality` from Task 1.
- Produces: `createRoadMaterialPack(loader): RoadMaterialPack`, `createLaneChangeScenery(quality, materials, visualVariant): CitySceneryPack`.
- `buildTrackScene` gains an optional third argument `{ quality?: EnvironmentQuality }` with the high profile as the compatibility default.
- Consumed by: Task 6.

- [ ] **Step 1: Write failing material lifecycle tests**

```ts
it('creates physically plausible road materials and disposes owned resources', () => {
  const texture = new THREE.Texture();
  const loader = { load: vi.fn(() => texture) } as unknown as THREE.TextureLoader;
  const pack = createRoadMaterialPack(loader);
  expect(pack.asphalt.roughness).toBeGreaterThanOrEqual(0.82);
  expect(pack.asphalt.metalness).toBeLessThanOrEqual(0.05);
  expect(pack.laneWhite.roughness).toBeGreaterThanOrEqual(0.65);
  const dispose = vi.spyOn(texture, 'dispose');
  pack.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Write failing scenery tests**

```ts
it('uses fewer decorations in balanced mode without changing deterministic placement', () => {
  const high = createLaneChangeScenery(ENVIRONMENT_QUALITY.high, materials, 2);
  const balanced = createLaneChangeScenery(ENVIRONMENT_QUALITY.balanced, materials, 2);
  expect(high.group.getObjectByName('REFERENCE_CITY_SCENERY')).toBeDefined();
  expect(balanced.group.children.length).toBeLessThan(high.group.children.length);
  expect(snapshot(createLaneChangeScenery(ENVIRONMENT_QUALITY.high, materials, 2))).toEqual(snapshot(high));
});
```

Compare repeated building and tree child geometries by object identity to prove they share geometry rather than allocating a unique mesh per facade detail.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `npm test -- src/components/3d/RoadMaterialFactory.test.ts src/components/3d/CitySceneryFactory.test.ts`

Expected: FAIL because both modules do not exist.

- [ ] **Step 4: Implement the road material pack**

```ts
export interface RoadMaterialPack {
  asphalt: THREE.MeshStandardMaterial;
  building: THREE.MeshStandardMaterial;
  laneWhite: THREE.MeshStandardMaterial;
  laneYellow: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  dispose(): void;
}
```

Load `/asphalt.jpg` and `/building.jpg` once, set `SRGBColorSpace`, repeat wrapping, and anisotropy no higher than 4. Use asphalt `roughness >= 0.82` and `metalness <= 0.05`; use facade `roughness >= 0.55` and `metalness <= 0.15`. Lane materials remain bright but use `MeshStandardMaterial`, polygon offset, and deterministic opacity variation so markings stay readable.

- [ ] **Step 5: Implement deterministic reference scenery**

Use a seeded integer PRNG derived from `visualVariant`. Build:

- beveled building shells with two shared facade materials and window texture variations;
- shared sidewalk/curb geometry;
- layered-canopy trees using shared trunk and canopy geometries;
- existing streetlight silhouettes with shared materials;
- `Math.round(baseCount * quality.sceneryDensity)` decorative repetitions.

Return `{ group, dispose }`, name the root `REFERENCE_CITY_SCENERY`, and dispose only resources created by this factory.

- [ ] **Step 6: Integrate only the lane-change scene**

Change the signature:

```ts
export interface TrackBuildOptions { quality?: EnvironmentQuality }
```

Add `options: TrackBuildOptions = {}` as the third parameter of the existing `buildTrackScene` function and retain its inferred return type and existing return object unchanged.

For `mission.id === 'city_lane_change'`, use the new materials and replace the previous `LANE_CHANGE_SCENERY` group with `REFERENCE_CITY_SCENERY`. Keep all obstacle pushes, road meshes, goal mesh, start/target data, and traffic arrays untouched.

- [ ] **Step 7: Prove gameplay geometry did not change**

Extend `TrackBuilder.test.ts`:

```ts
expect(high.obstacles).toEqual(balanced.obstacles);
expect([high.goalMesh?.position.x, high.goalMesh?.position.z]).toEqual([
  balanced.goalMesh?.position.x,
  balanced.goalMesh?.position.z,
]);
expect(high.initialTraffic).toEqual(balanced.initialTraffic);
```

- [ ] **Step 8: Run focused and full tests**

Run: `npm test -- src/components/3d/RoadMaterialFactory.test.ts src/components/3d/CitySceneryFactory.test.ts src/components/3d/TrackBuilder.test.ts`

Expected: focused tests pass.

Run: `npm test`

Expected: full suite passes.

- [ ] **Step 9: Commit checkpoint**

```bash
git add src/components/3d/RoadMaterialFactory.ts src/components/3d/RoadMaterialFactory.test.ts src/components/3d/CitySceneryFactory.ts src/components/3d/CitySceneryFactory.test.ts src/components/3d/TrackBuilder.tsx src/components/3d/TrackBuilder.test.ts
git commit -m "feat: add semi-real lane-change scenery"
```

---

### Task 6: Simulation Camera, Quality, and Render Integration

**Files:**
- Modify: `src/components/3d/SimulationCanvas.tsx`
- Modify: `src/components/3d/SimulationCanvas.vehicle-assets.test.tsx`
- Modify: `src/constants/vehicles.ts` only if browser evidence proves the GLB `DRIVER_EYE` needs a documented fallback correction.

**Interfaces:**
- Consumes: `chooseEnvironmentQuality`, `withVehicleRenderMode`, sedan `driverEye`, and the third `buildTrackScene` options argument.
- Produces no new persistence or simulation-state fields.

- [ ] **Step 1: Write failing integration assertions**

Update the renderer mock to record exterior/cockpit visibility for each render. Assert the first four renders in cockpit mode are:

```ts
expect(renderStates.slice(0, 4)).toEqual([
  { exterior: false, cockpit: true },  // main cockpit
  { exterior: true, cockpit: false },  // left mirror
  { exterior: true, cockpit: false },  // right mirror
  { exterior: true, cockpit: false },  // rear mirror
]);
```

Add a renderer-throws case and assert both root visibilities are restored. Add viewport cases proving 1440x900 uses pixel-ratio cap 1.25 and shadow size 1024, while 844x390 coarse-pointer uses cap 1 and shadow size 512.

- [ ] **Step 2: Run the integration test and confirm RED**

Run: `npm test -- src/components/3d/SimulationCanvas.vehicle-assets.test.tsx`

Expected: FAIL because the simulation still hides the entire player group and does not use quality profiles.

- [ ] **Step 3: Apply the quality profile before renderer creation**

```ts
const quality = chooseEnvironmentQuality({
  width,
  height,
  devicePixelRatio: window.devicePixelRatio,
  coarsePointer: window.matchMedia('(pointer: coarse)').matches,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
sunLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
```

Pass `{ quality }` to `buildTrackScene`. Apply the same pixel-ratio cap to mirror renderers only if measurement shows their fixed canvas resolution is not already lower; do not increase mirror resolution.

- [ ] **Step 4: Use the measured driver-eye anchor**

For the sedan, obtain the `DRIVER_EYE` world position after updating the car-group transform:

```ts
if (car3D.driverEye) {
  car3D.driverEye.getWorldPosition(mainCamera.position);
  mainCamera.position.y += vibeOffset;
} else {
  mainCamera.position.copy(carPos).add(fallbackEyeOffset);
}
```

The fallback remains for compact and SUV. Do not mutate `VehicleConfig.cockpitPos` unless browser evidence shows the non-reference fallback itself is wrong.

- [ ] **Step 5: Replace whole-car hiding with pass guards**

Render the main cockpit through `withVehicleRenderMode(car3D, 'cockpit', ...)`; render chase/top/hood and every mirror/backup pass through `'external'`. Remove the whole `carGroup.visible = false` block.

- [ ] **Step 6: Calibrate restrained lighting values**

Keep ACES filmic tone mapping and adjust only values covered by screenshot evidence: exposure, hemisphere intensity/color, sun position/intensity, fog color/density, and shadow camera bounds. Record every final literal in the browser QA report; do not add post-processing.

- [ ] **Step 7: Run focused, scoring, physics, and full tests**

Run: `npm test -- src/components/3d/SimulationCanvas.vehicle-assets.test.tsx`

Expected: integration tests pass.

Run: `npm run test:scoring && npm run test:physics`

Expected: scoring and physics suites pass unchanged.

Run: `npm test`

Expected: full suite passes.

- [ ] **Step 8: Commit checkpoint**

```bash
git add src/components/3d/SimulationCanvas.tsx src/components/3d/SimulationCanvas.vehicle-assets.test.tsx src/constants/vehicles.ts
git commit -m "feat: integrate semi-real cockpit rendering"
```

If `src/constants/vehicles.ts` remains unchanged, omit it from `git add`.

---

### Task 7: Measured Browser Refinement and Final Verification

**Files:**
- Modify only files already owned by Tasks 2, 5, or 6 when evidence requires a bounded visual adjustment.
- Create temporary evidence under `/tmp/dps-semireal-qa/`; do not commit browser profiles, screenshots, or temporary scripts.

**Interfaces:**
- Consumes the completed reference slice.
- Produces before/after screenshots, a JSON frame/asset/error report, and the final verification record.

- [ ] **Step 1: Capture the current baseline at matching framing**

From merge commit `e371c37`, capture 1440x900 screenshots for cockpit, chase, top, left mirror, and right mirror on `city_lane_change`, plus cockpit/chase at 844x390. Save them under `/tmp/dps-semireal-qa/before/`.

The temporary Playwright script must wait for `차량 에셋 준비 중` to become hidden before input or capture, record console/page/request failures, and use canonical training local-storage state so each run starts in the same attempt.

- [ ] **Step 2: Capture implementation screenshots and metrics**

Run the same script against the feature worktree and save `/tmp/dps-semireal-qa/after/`. Collect:

```json
{
  "viewport": "1440x900",
  "quality": "high",
  "medianFrameMs": 0,
  "p95FrameMs": 0,
  "estimatedFps": 0,
  "sedanBytes": 0,
  "consoleErrors": [],
  "pageErrors": [],
  "localRequestFailures": []
}
```

Populate values from the run; zeros in this schema are initialization values, not acceptable final evidence.

- [ ] **Step 3: Visual refinement loop 1 — cockpit composition**

Inspect before/after cockpit and mirror images. Adjust only Blender cockpit geometry, `DRIVER_EYE`, FOV, or near-plane values if any of these fail: A-pillars absent, windshield blocked, hood dominates, no hood visible, duplicate HUD wheel, dashboard clipping, mirror exterior missing.

Regenerate, validate, rerun focused tests, and recapture the same frames.

- [ ] **Step 4: Visual refinement loop 2 — exterior wheels and environment**

Inspect chase/top images. Adjust only wheel segment/material values, facade/road materials, deterministic decoration placement, or approved lighting literals if any of these fail: faceted wheel silhouette, floating tires, metallic asphalt, unreadable lane paint, flat unwindowed buildings, excessive shadow darkness.

Regenerate or rebuild, rerun focused tests, and recapture the same frames.

- [ ] **Step 5: Performance loop 3 — only if a threshold is missed**

If desktop is below 45 fps or mobile below 30 fps after warm-up, reduce only profile-controlled pixel-ratio cap, shadow size, or decorative scenery density. Do not reduce road/target/traffic geometry, remove cockpit elements, or alter physics.

After this third measured loop, stop even if a threshold remains missed and report the exact gap for a design decision.

- [ ] **Step 6: Run all deterministic verification**

Run: `npm run vehicles:test-reference`

Expected: reference sedan Blender tests pass.

Run: `npm run vehicles:validate`

Expected: all runtime vehicle assets pass size, triangle, geometry, material, and transform validation.

Run: `npm test`

Expected: all tests pass with zero failures.

Run: `npm run build`

Expected: production build succeeds; report the existing bundle-size warning separately if it remains.

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 7: Review the final diff against the spec**

Verify each acceptance criterion has one direct automated or browser artifact. Reject unrelated changes, unapproved assets, new dependencies, physics/scoring diffs, silent fallbacks, and temporary QA files inside the repository.

- [ ] **Step 8: Present the before/after user gate**

Show the matching cockpit, chase, wheel close-up, and mobile pairs plus the measured JSON report. Stop for user visual approval before broader rollout, commit squashing, push, PR, merge, deployment, or worktree cleanup.

- [ ] **Step 9: Final commit checkpoint**

Only after user visual approval and explicit commit approval:

```bash
git add assets/blender src/components/3d src/components/ui/HUD.tsx src/components/ui/HUD.test.tsx public/models/vehicles/sedan.glb package.json docs/superpowers/specs/2026-08-30-semireal-driving-visuals-design.md docs/superpowers/plans/2026-08-30-semireal-driving-visuals.md
git commit -m "feat: establish semi-real driving visual reference"
```

Before committing, inspect `git diff --cached --stat` and ensure neither `/tmp` evidence nor unrelated files are staged.
