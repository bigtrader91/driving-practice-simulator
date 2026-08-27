# Blender Vehicle Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every box-built player, moving-traffic, and parked vehicle with a validated Blender-generated GLB while preserving driving, camera, light, and collision behavior.

**Architecture:** A deterministic Blender Python generator creates compact, sedan, SUV, and truck assets that obey a stable node-name and local `-Z`-forward contract. A focused Three.js asset library preloads each GLB once, validates and clones it synchronously, and exposes the dynamic wheel/lamp/wiper handles already consumed by the simulator. `SimulationCanvas` starts the runtime only after asset loading succeeds, while `TrackBuilder` receives a narrow parked-car factory so track and physics data stay independent of the loader.

**Tech Stack:** Blender 4.x Python API, binary glTF 2.0 (`.glb`), Three.js 0.174 `GLTFLoader`, React 19, TypeScript 5.7, Vitest 4, Vite 6, Playwright

**Spec:** `docs/superpowers/specs/2026-08-25-blender-vehicle-assets-design.md`

## Global Constraints

- Runtime vehicle forward is local `-Z`; generated models must not use a compensating negative scale.
- Preserve current physics dimensions, collision boxes, mission behavior, camera offsets, and input behavior.
- Required silhouettes are compact hatchback, sedan, SUV, and traffic truck.
- Asset-loading or contract failures must be shown visibly and logged; never silently fall back to the old box model.
- Share immutable geometry and base materials; clone only instance-mutated paint and lamp materials.
- Do not add Blender MCP or download third-party vehicle assets.
- Do not commit, push, open a PR, merge, or deploy until the user grants the corresponding separate approval.

---

## File Map

**Create**

- `assets/vehicle-concepts/vehicle-family.png` — approved orthographic art-direction reference; never loaded at runtime.
- `assets/blender/generate_vehicles.py` — sole reproducible geometry/material generator and `.blend`/GLB exporter.
- `assets/blender/validate_vehicles.py` — deterministic Blender-side validation of nodes, transforms, dimensions, and orientation.
- `public/models/vehicles/{compact,sedan,suv,truck}.glb` — browser runtime assets.
- `src/components/3d/VehicleAssetContract.ts` — node binding, contract validation, and safe per-instance material isolation.
- `src/components/3d/VehicleAssetContract.test.ts` — behavior tests using real Three.js object graphs.
- `src/components/3d/VehicleAssetLibrary.ts` — GLB preload/cache and player/traffic/parked clone factories.
- `src/components/3d/VehicleAssetLibrary.test.ts` — asset-library behavior against actual generated GLBs.
- `src/components/3d/VehicleLoadState.ts` — converts asset-library promise outcomes into explicit loading states.
- `src/components/3d/VehicleLoadState.test.ts` — success and visible-error state behavior.

**Modify**

- `src/components/3d/CarModel.tsx` — retain the public player handle shape and dynamic spotlights, but delegate mesh creation to the asset library.
- `src/components/3d/CarModel.test.ts` — exercise generated models instead of box geometry.
- `src/components/3d/VehicleCoordinateSystem.test.ts` — run camera and steering invariants against generated player models.
- `src/components/3d/TrackBuilder.tsx` — accept a parked-vehicle factory and remove parked box meshes only.
- `src/components/3d/TrackBuilder.test.ts` — prove parked visuals are factory clones while collision contracts remain literal and unchanged.
- `src/components/3d/SimulationCanvas.tsx` — preload assets, surface initialization errors, and replace moving-traffic boxes.
- `package.json` — add deterministic `vehicles:generate` and `vehicles:validate` commands.

---

### Task 1: Generate and Approve the Vehicle Family Concept

**Files:**

- Create: `assets/vehicle-concepts/vehicle-family.png`

**Interfaces:**

- Consumes: the visual direction and four silhouettes in the approved spec.
- Produces: one orthographic reference sheet with front, side, rear, and three-quarter views for compact, sedan, SUV, and truck.

- [ ] **Step 1: Generate one coherent concept sheet**

Use the image-generation tool with this exact art brief:

```text
Orthographic automotive design sheet for one coherent family of contemporary Korean-road training-simulator vehicles: compact tall hatchback, mid-size sedan, mid-size SUV, and medium delivery truck. Show each vehicle in clean side, front, rear, and front-three-quarter views, aligned on a neutral light gray studio grid. Realistic proportions and recognizable wheel arches, sloped glazing, bumpers, mirrors, grille, headlights, and taillights; restrained modern design; no logos, badges, text, people, scenery, reflections hiding the silhouette, or exaggerated concept-car features. Production-ready low-to-medium-poly 3D modeling reference, consistent scale and design language, crisp edges with modest bevels.
```

- [ ] **Step 2: Inspect the full-resolution output**

Verify manually that all four types are present, each type has consistent proportions across views, wheels are circular and aligned, and no branding or unreadable pseudo-labels appear.

- [ ] **Step 3: Save only the accepted sheet**

Save the accepted image as `assets/vehicle-concepts/vehicle-family.png`. If the first sheet fails any criterion, regenerate rather than editing the flawed sheet into the repository.

- [ ] **Step 4: Checkpoint**

Show the sheet to the user and pause for visual approval before encoding its proportions in Blender. Do not commit.

### Task 2: Define the Runtime Vehicle Asset Contract

**Files:**

- Create: `src/components/3d/VehicleAssetContract.test.ts`
- Create: `src/components/3d/VehicleAssetContract.ts`

**Interfaces:**

- Consumes: `THREE.Group` and `VehicleType` from `src/types/simulator.ts`.
- Produces:

```ts
export type VehicleAssetKind = VehicleType | 'truck';

export interface BoundVehicleAsset {
  group: THREE.Group;
  bodyMeshes: THREE.Mesh[];
  frontLeftWheel: THREE.Group;
  frontRightWheel: THREE.Group;
  rearLeftWheel: THREE.Group;
  rearRightWheel: THREE.Group;
  steeringWheelMesh?: THREE.Group;
  wiperLeft?: THREE.Group;
  wiperRight?: THREE.Group;
  headlights: THREE.Mesh[];
  brakeLights: THREE.Mesh[];
  frontBlinkers: [THREE.Mesh, THREE.Mesh];
  rearBlinkers: [THREE.Mesh, THREE.Mesh];
}

export function bindVehicleAsset(root: THREE.Group, kind: VehicleAssetKind): BoundVehicleAsset;
export function cloneVehicleAsset(template: THREE.Group, kind: VehicleAssetKind, color: THREE.ColorRepresentation): BoundVehicleAsset;
```

- [ ] **Step 1: Write failing contract tests**

Create real Three.js groups in the test. Name every required object literally and assert:

```ts
it('rejects an asset that omits a required wheel', () => {
  const root = makeCompleteAsset('sedan');
  root.remove(root.getObjectByName('WHEEL_FR')!);
  expect(() => bindVehicleAsset(root, 'sedan')).toThrow(
    'sedan vehicle asset is missing nodes: WHEEL_FR'
  );
});

it('requires player controls on selectable cars but not on a truck', () => {
  const player = makeCompleteAsset('sedan');
  player.remove(player.getObjectByName('STEERING_WHEEL')!);
  expect(() => bindVehicleAsset(player, 'sedan')).toThrow(/STEERING_WHEEL/);

  const truck = makeCompleteAsset('truck', { playerControls: false });
  expect(bindVehicleAsset(truck, 'truck').steeringWheelMesh).toBeUndefined();
});

it('isolates paint and lamp materials while sharing geometry', () => {
  const template = makeCompleteAsset('sedan');
  const blue = cloneVehicleAsset(template, 'sedan', 0x2563eb);
  const red = cloneVehicleAsset(template, 'sedan', 0xdc2626);
  expect(blue.bodyMeshes[0].geometry).toBe(red.bodyMeshes[0].geometry);
  expect(blue.bodyMeshes[0].material).not.toBe(red.bodyMeshes[0].material);
  expect((blue.bodyMeshes[0].material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x2563eb);
  expect((red.bodyMeshes[0].material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xdc2626);
  expect(blue.brakeLights[0].material).not.toBe(red.brakeLights[0].material);
});
```

The break caught is accepting malformed GLBs or allowing one instance's paint/lamp mutation to leak into every clone.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- src/components/3d/VehicleAssetContract.test.ts
```

Expected: FAIL because `VehicleAssetContract` and its exports do not exist.

- [ ] **Step 3: Implement strict binding and clone isolation**

Use `getObjectByName`, verify runtime object classes, collect body meshes by material name `PAINT`, sort missing names for deterministic errors, and clone only `PAINT`, `HEADLIGHT`, `BRAKE`, and `BLINKER` materials. Do not clone geometry.

```ts
const requireNode = <T extends THREE.Object3D>(
  root: THREE.Object3D,
  name: string,
  guard: (node: THREE.Object3D) => node is T,
  missing: string[],
): T | undefined => {
  const node = root.getObjectByName(name);
  if (!node || !guard(node)) missing.push(name);
  return node && guard(node) ? node : undefined;
};
```

Return only after all required nodes have been resolved. Throw one error listing every missing node.

- [ ] **Step 4: Run contract tests and verify GREEN**

Run the same targeted command. Expected: all contract tests PASS with no warnings.

- [ ] **Step 5: Checkpoint**

Report the RED and GREEN evidence. Do not commit without separate approval.

### Task 3: Build and Validate the Blender Generator

**Files:**

- Create: `assets/blender/validate_vehicles.py`
- Create: `assets/blender/generate_vehicles.py`
- Modify: `package.json`
- Generate: `assets/blender/vehicles.blend`
- Generate: `public/models/vehicles/compact.glb`
- Generate: `public/models/vehicles/sedan.glb`
- Generate: `public/models/vehicles/suv.glb`
- Generate: `public/models/vehicles/truck.glb`

**Interfaces:**

- Consumes: exact dimensions from `src/constants/vehicles.ts`; traffic dimensions `sedan=1.82x4.65x1.45`, `suv=2.0x4.9x1.7`, and `truck=2.3x7.5x2.8` from the existing simulator.
- Produces: four GLBs satisfying Task 2's node/material contract and local `-Z` orientation.

- [ ] **Step 1: Write the Blender validator before the generator**

`validate_vehicles.py` accepts the repository root after `--`, imports each GLB into an empty scene, and exits non-zero with one line per violated constraint. Use literal expected dimensions and a `0.08m` bound tolerance.

```py
EXPECTED = {
    "compact": (1.60, 3.60, 1.55, True),
    "sedan": (1.82, 4.68, 1.44, True),
    "suv": (1.91, 4.83, 1.70, True),
    "truck": (2.30, 7.50, 2.80, False),
}

def fail(asset: str, message: str) -> None:
    failures.append(f"{asset}: {message}")
```

For each asset validate: file exists; required node names; no object has a negative scale; minimum world `Y` is within `0.01m` of zero; dimensions are within tolerance; `HEADLIGHT_*` world `Z` is smaller than `BRAKE_*` world `Z`; front wheel `Z` is smaller than rear wheel `Z`; and `PAINT` is present.

- [ ] **Step 2: Run validation and verify RED**

Run:

```bash
blender --background --python assets/blender/validate_vehicles.py -- "$PWD"
```

Expected: non-zero exit with four explicit `missing file` failures.

- [ ] **Step 3: Implement the deterministic generator**

In `generate_vehicles.py`:

- clear the default scene;
- define the four literal dimension/profile records;
- construct body shells from explicit longitudinal cross-sections rather than `primitive_cube_add` body stacks;
- use bevel modifiers only for finishing, then apply them before export;
- create sloped glass planes, bumpers, grille, mirrors, lights, and wheel cylinders;
- cut or visually frame wheel arches so tires are not pasted against a flat slab;
- create player dashboard, low cowl, seats, slim pillars, steering wheel, and wipers for compact, sedan, and SUV while keeping the configured eye point outside all opaque meshes;
- set object/material names exactly as the contract requires;
- apply rotation and scale transforms;
- save `assets/blender/vehicles.blend`;
- export each vehicle collection separately with `export_format='GLB'`, selected objects only, Y-up, materials enabled, cameras/lights excluded, and custom properties excluded.

Use one helper per responsibility, for example:

```py
def create_profile_mesh(name: str, sections: list[tuple[float, float, float, float]], material): ...
def create_wheel(name: str, x: float, y: float, z: float, radius: float): ...
def create_vehicle(kind: str, spec: VehicleSpec) -> bpy.types.Collection: ...
def export_collection(collection: bpy.types.Collection, output: Path) -> None: ...
```

The longitudinal section tuples are `(z, half_width, lower_y, upper_y)` and must be ordered from front negative `Z` to rear positive `Z`, making the orientation obvious in source.

- [ ] **Step 4: Add repeatable npm commands**

Add:

```json
"vehicles:generate": "blender --background --python assets/blender/generate_vehicles.py -- .",
"vehicles:validate": "blender --background --python assets/blender/validate_vehicles.py -- ."
```

- [ ] **Step 5: Generate and verify GREEN**

Run:

```bash
npm run vehicles:generate
npm run vehicles:validate
```

Expected: generator exits `0`; validator prints one `PASS` line per asset and exits `0`.

- [ ] **Step 6: Verify deterministic artifacts and size**

Run the generator twice and compare SHA-256 hashes only if Blender's exporter is deterministic in this environment. If metadata makes byte hashes differ, validate semantic equality by rerunning the validator and report the nondeterminism visibly. Then run:

```bash
du -h public/models/vehicles/*.glb assets/blender/vehicles.blend
```

Record every file size. Reject any individual runtime GLB above `2 MiB`; simplify geometry/materials instead of adding compression infrastructure in this pass.

- [ ] **Step 7: Checkpoint**

Show rendered turntable/contact-sheet views of all four Blender models before runtime integration. Do not commit.

### Task 4: Load Actual GLBs and Produce Runtime Handles

**Files:**

- Create: `src/components/3d/VehicleAssetLibrary.test.ts`
- Create: `src/components/3d/VehicleAssetLibrary.ts`
- Modify: `src/components/3d/CarModel.tsx`
- Modify: `src/components/3d/CarModel.test.ts`
- Modify: `src/components/3d/VehicleCoordinateSystem.test.ts`

**Interfaces:**

- Consumes: `bindVehicleAsset`, `cloneVehicleAsset`, generated GLBs, and `VehicleConfig`.
- Produces:

```ts
export interface VehicleAssetLibrary {
  createPlayer(vehicle: VehicleConfig): Car3DHandles;
  createTraffic(kind: 'sedan' | 'suv' | 'truck', color: number): TrafficVisualHandles;
  createParked(color: number): THREE.Group;
}

export type LoadVehicleScene = (url: string) => Promise<THREE.Group>;
export async function loadVehicleAssetLibrary(
  baseUrl?: string,
  loadScene?: LoadVehicleScene,
): Promise<VehicleAssetLibrary>;
```

`Car3DHandles` is the existing `createCar3DGroup` return shape, exported as a named interface. `TrafficVisualHandles` contains `group`, `headlights`, and `brakeLights`.

- [ ] **Step 1: Write failing real-asset tests**

Load binary files with `readFile`, pass their `ArrayBuffer` to `GLTFLoader.parseAsync`, construct the library from parsed template groups through an exported `createVehicleAssetLibrary(templates)` seam, and assert literal behavior:

```ts
it.each(['compact', 'sedan', 'suv'] as const)('%s player model preserves the runtime handles', async (kind) => {
  const library = await loadTestLibrary();
  const result = library.createPlayer(VEHICLES[kind]);
  expect(result.carGroup.scale.toArray()).toEqual([1, 1, 1]);
  expect(result.frontLeftWheel.name).toBe('WHEEL_FL');
  expect(result.steeringWheelMesh.name).toBe('STEERING_WHEEL');
  expect(result.headlights).toHaveLength(2);
  expect(result.brakeLights).toHaveLength(2);
});

it('returns an actionable URL when a GLB load fails', async () => {
  const rejectLoad: LoadVehicleScene = async () => { throw new Error('404'); };
  await expect(loadVehicleAssetLibrary('/missing-base/', rejectLoad)).rejects.toThrow(
    '/missing-base/models/vehicles/compact.glb'
  );
});
```

The break caught is a generated GLB that validates superficially but cannot satisfy the actual Three.js runtime, or a loader that hides the failed URL.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test -- src/components/3d/VehicleAssetLibrary.test.ts
```

Expected: FAIL because the library does not exist.

- [ ] **Step 3: Implement preload, caching, and factories**

The default `LoadVehicleScene` loads each URL with `GLTFLoader.loadAsync` and returns its scene. The optional injected function is only the network/file boundary used by the failure test; template validation and library construction remain real. Wrap errors as:

```ts
throw new Error(`Failed to load vehicle asset ${url}: ${message}`);
```

Call `bindVehicleAsset` immediately after loading so malformed assets fail before the simulation starts. `createPlayer` adds the two existing dynamic `SpotLight`s and returns named handles. `createTraffic` and `createParked` omit spotlights. Keep the cache scoped to one library promise; do not add a global retry or fallback policy.

- [ ] **Step 4: Replace procedural player geometry behind the existing boundary**

Change `createCar3DGroup` to accept the already-loaded library:

```ts
export const createCar3DGroup = (
  vehicle: VehicleConfig,
  assets: VehicleAssetLibrary,
): Car3DHandles => assets.createPlayer(vehicle);
```

Remove the old box-built body/interior implementation only after the real-asset tests are failing for its absence. Preserve the returned handle names used by `SimulationCanvas`.

- [ ] **Step 5: Update coordinate and camera tests against real assets**

Make test setup await `loadTestLibrary()`, then pass the library to `createCar3DGroup`. Preserve the hand-derived coordinate assertions. Add literal bound checks for all player types and retain the ray-intersection checks rather than replacing them with node-name assertions.

- [ ] **Step 6: Run targeted tests and verify GREEN**

Run:

```bash
npm test -- src/components/3d/VehicleAssetContract.test.ts src/components/3d/VehicleAssetLibrary.test.ts src/components/3d/CarModel.test.ts src/components/3d/VehicleCoordinateSystem.test.ts
```

Expected: all tests PASS without resource or loader warnings.

- [ ] **Step 7: Checkpoint**

Report asset load counts, contract coverage, and camera-ray evidence. Do not commit.

### Task 5: Replace Parked and Moving Traffic Vehicles

**Files:**

- Modify: `src/components/3d/TrackBuilder.test.ts`
- Modify: `src/components/3d/TrackBuilder.tsx`
- Modify: `src/components/3d/SimulationCanvas.tsx`

**Interfaces:**

- Consumes: `VehicleAssetLibrary.createParked` and `VehicleAssetLibrary.createTraffic`.
- Produces:

```ts
export type ParkedVehicleFactory = (color: number) => THREE.Group;
export function buildTrackScene(mission: Mission, createParkedVehicle: ParkedVehicleFactory): TrackSceneResult;
```

- [ ] **Step 1: Write the failing parked-vehicle integration test**

Pass a real factory that returns a named group and assert both visual and collision outcomes:

```ts
it('uses the parked vehicle factory without changing its collision obstacle', () => {
  const colors: number[] = [];
  const result = buildTrackScene(parkingMission, (color) => {
    colors.push(color);
    const group = new THREE.Group();
    group.name = 'GLB_PARKED_VEHICLE';
    return group;
  });
  expect(colors).toEqual([0xdc2626, 0x475569]);
  expect(result.trackGroup.getObjectsByProperty('name', 'GLB_PARKED_VEHICLE')).toHaveLength(2);
  expect(result.obstacles.filter(({ name }) => name.includes('주차 차량'))).toEqual([
    expect.objectContaining({ width: 1.9, depth: 4.7, isPenaltyTrigger: true }),
    expect.objectContaining({ width: 1.9, depth: 4.7, isPenaltyTrigger: true }),
  ]);
});
```

The break caught is retaining a box visual or accidentally coupling a visual change to collision dimensions.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test -- src/components/3d/TrackBuilder.test.ts
```

Expected: FAIL because `buildTrackScene` does not accept or invoke the factory.

- [ ] **Step 3: Replace only the parked visual construction**

Inject `createParkedVehicle`, set returned group position/heading, and preserve the exact existing obstacle object. Delete the parked body/cabin `BoxGeometry` and their materials; do not change other track geometry.

- [ ] **Step 4: Add the failing moving-traffic assertion**

In `VehicleAssetLibrary.test.ts`, create sedan, SUV, and truck traffic instances and assert distinct bounds, named wheel nodes, isolated paint colors, and two head/two brake light handles. This catches mapping every traffic type to the sedan template.

- [ ] **Step 5: Replace moving-traffic box construction**

In `SimulationCanvas`, replace the traffic body/cabin/light block with:

```ts
const visual = vehicleAssets.createTraffic(tv.type, tv.color);
const tvGroup = visual.group;
tvGroup.position.set(tv.x, 0, tv.z);
scene.add(tvGroup);
trafficMeshes.push({ data: tv, ...visual });
```

Do not set `scale.z = -1`. Preserve all traffic motion, heading, yielding, light-intensity, and evaluator code.

- [ ] **Step 6: Run targeted tests and verify GREEN**

Run:

```bash
npm test -- src/components/3d/TrackBuilder.test.ts src/components/3d/VehicleAssetLibrary.test.ts src/components/3d/VehicleCoordinateSystem.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Checkpoint**

Report the exact deleted box-vehicle paths and confirm obstacle literals did not change. Do not commit.

### Task 6: Gate Simulation Startup on Asset Loading and Surface Failures

**Files:**

- Create: `src/components/3d/VehicleLoadState.test.ts`
- Create: `src/components/3d/VehicleLoadState.ts`
- Modify: `src/components/3d/SimulationCanvas.tsx`

**Interfaces:**

- Consumes: `loadVehicleAssetLibrary(import.meta.env.BASE_URL)`.
- Produces: a visible `role="alert"` initialization error and a simulation that starts only after all four templates validate.

- [ ] **Step 1: Write the failing user-visible error test**

Put only the state transition in `VehicleLoadState.ts` so it can be tested without mocking WebGL:

```ts
export type VehicleLoadState =
  | { status: 'loading' }
  | { status: 'ready'; assets: VehicleAssetLibrary }
  | { status: 'error'; message: string };

export async function resolveVehicleLoadState(
  load: () => Promise<VehicleAssetLibrary>,
): Promise<VehicleLoadState>;
```

Test with real resolved/rejected promises and assert the rejected message is preserved. The production mutation caught is swallowing loader errors or entering the ready state without assets.

- [ ] **Step 2: Run and verify RED**

Run the new test directly. Expected: FAIL because `resolveVehicleLoadState` does not exist.

- [ ] **Step 3: Implement the minimal state helper and component state**

Initialize with `{status: 'loading'}`. On success, start scene construction and animation with the loaded library. On failure, call `console.error(error)` and render:

```tsx
<div role="alert" className="absolute inset-0 grid place-items-center bg-slate-950 text-rose-200">
  <div className="max-w-md rounded-xl border border-rose-500/40 bg-slate-900 p-5">
    <p className="font-semibold">차량 모델을 불러오지 못했습니다.</p>
    <p className="mt-2 text-sm text-rose-100/80">{loadState.message}</p>
  </div>
</div>
```

Use an effect-local `cancelled` flag. If cleanup occurs before load completion, do not create a renderer or mutate the container. If runtime construction already occurred, run its existing disposal path.

- [ ] **Step 4: Run the focused test and existing simulator tests**

Run:

```bash
npm test -- src/components/3d/VehicleLoadState.test.ts src/components/3d/CarModel.test.ts src/components/3d/TrackBuilder.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Checkpoint**

Report the loading, ready, error, and cancelled paths. Do not commit.

### Task 7: Full Verification and Visual Acceptance

**Files:**

- Modify only if a failing check reveals a requirement-level defect.

**Interfaces:**

- Consumes: the complete implementation.
- Produces: requirement-by-requirement evidence for all original steering/reverse/guide fixes and the new vehicle visuals.

- [ ] **Step 1: Validate generated assets**

Run:

```bash
npm run vehicles:validate
```

Expected: four PASS lines, exit `0`.

- [ ] **Step 2: Run the full automated suite**

Run:

```bash
npm test
```

Expected: every test file and test passes; no unhandled rejection or console warning.

- [ ] **Step 3: Run production build and hygiene checks**

Run:

```bash
npm run build
git diff --check
git status --short
```

Expected: build exits `0`; only the known Vite chunk-size advisory is acceptable; diff check is empty; status contains only this goal's intended files and previously preserved first-iteration files. Restore generated `tsconfig.tsbuildinfo` if the build modifies it.

- [ ] **Step 4: Start the browser test helper correctly**

First run:

```bash
python /home/bigtrader91/.agents/skills/webapp-testing/scripts/with_server.py --help
```

Then use a fresh isolated port and a native Playwright script. Wait for `networkidle` and for the loading overlay to disappear before interacting.

- [ ] **Step 5: Capture visual coverage**

Capture and inspect screenshots for:

- compact, sedan, and SUV cockpit/hood views with no opaque blocker;
- D gear with no reverse guide in an ordinary mission;
- R gear with reverse guide and correctly oriented keyboard steering;
- mirror and backup-camera views showing the player exterior correctly oriented;
- highway moving traffic showing sedan, SUV, and truck silhouettes;
- parking mission showing non-box parked vehicles;
- exact pointer-wheel states at `0°`, `360°`, and `540°`, followed by center reset to `0°`.

Do not treat screenshots as passing until they are opened with the local image viewer and visually inspected.

- [ ] **Step 6: Measure browser rendering stability**

In the busiest traffic mission, sample at least 300 consecutive `requestAnimationFrame` intervals after a 3-second warm-up. Report median and p95 frame interval plus any WebGL/console errors. Compare against the pre-change scene if its prior branch can be run on the same machine and port isolation; otherwise report only absolute measurements and explicitly state that no baseline comparison was available.

- [ ] **Step 7: Run completion audit**

Map every objective requirement to direct evidence:

- steering crosses `360°`, reaches `540°`, and centers;
- reverse keyboard acceleration/braking and steering orientation;
- ordinary D hides reverse guides and R shows them;
- world-bound reset prevents road-end flip;
- player, traffic, and parked vehicle visual replacement;
- build/test/browser console state.

Any missing or indirect evidence keeps the goal active.

- [ ] **Step 8: Review gate**

Run the required TypeScript and general code reviews, apply only verified blocker fixes through new RED/GREEN cycles, and rerun affected verification. Present the final diff, generated asset sizes, test/build results, screenshots, frame metrics, and review findings. Ask separately for commit approval.
