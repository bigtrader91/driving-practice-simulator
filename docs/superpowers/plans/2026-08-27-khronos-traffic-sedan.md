# Khronos Traffic Sedan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only moving sedan traffic boxes with a validated, optimized Khronos CarConcept GLB after a six-view visual approval gate.

**Architecture:** A deterministic headless Blender converter imports the immutable CC BY 4.0 source, removes presentation and logo content, normalizes it to the existing sedan envelope, builds the established `traffic-compact` node/material contract, and emits one budgeted GLB. After render approval, a focused Three.js asset library loads and validates it once; a small traffic-visual seam selects it only for sedan traffic while existing simulation data remains authoritative.

**Tech Stack:** Blender 5.2 Python API, binary glTF 2.0, Three.js 0.174 `GLTFLoader`, React 19, TypeScript 5.7, Vitest 4, Vite 6, browser Playwright

**Spec:** `docs/superpowers/specs/2026-08-27-khronos-traffic-sedan-design.md`

## Global Constraints

- Immutable source: `/data/ai/modly/sources/khronos-car-concept/CarConcept.glb`; never modify it.
- License receipt: `/data/ai/modly/sources/khronos-car-concept/LICENSE.md`; copy attribution into the repository beside the runtime asset.
- Runtime output: `public/models/vehicles/traffic-compact.glb`, at most `5,000,000` bytes and `50,000` triangles.
- Visual dimensions: `1.82 m x 4.65 m x 1.45 m`, tolerance `0.08 m` per axis.
- Blender authors forward along `+Y`; glTF/runtime forward is local `-Z`; no negative-scale compensation is allowed.
- Reuse `VehicleAssetKind = VehicleType | 'truck' | 'traffic-compact'`; do not introduce `traffic-sedan` or a second loader.
- Asset gate precedes runtime integration. A recorded multimodal PASS is sufficient to continue because the user explicitly authorized completing the game within the total correction budget.
- Player, parked, SUV, truck, collisions, physics, traffic behavior, missions, and scoring remain unchanged.
- Preserve the dirty worktree. Do not clean, reset, stage, commit, push, open a PR, merge, or deploy without its explicit gate.
- Hard correction ceiling: twenty diagnosed rounds across all remaining tasks, including the first three failed Task 2 rounds. No blind retry counts as progress.

## File Map

- `assets/blender/prepare_khronos_traffic.py` — deterministic source import, cleanup, normalization, contract binding, staged export, and inspection `.blend` creation.
- `assets/blender/test_khronos_traffic_asset.py` — converter and Blender validator behavior using temporary fixtures.
- `assets/blender/render_khronos_traffic.py` — deterministic six-view inspection render and manifest.
- `assets/blender/render_khronos_traffic.test.py` — render argument, camera-set, manifest, and failure tests.
- `assets/blender/validate_vehicles.py` — real runtime GLB dimensions, budget, wheel, material, and orientation checks.
- `package.json` — explicit prepare/render commands; no new dependencies.
- `public/models/vehicles/traffic-compact.glb` — optimized runtime asset.
- `public/models/vehicles/traffic-compact-LICENSE.md` — source URL, author, CC BY 4.0 attribution, source and runtime hashes.
- `src/components/3d/VehicleAssetContract.ts` — existing node binding and per-instance mutable material isolation; change only if a real-GLB mismatch proves necessary.
- `src/components/3d/VehicleAssetContract.test.ts` — real contract regression expectations.
- `src/components/3d/VehicleAssetLibrary.ts` — one cached GLB loader and traffic clone factory.
- `src/components/3d/VehicleAssetLibrary.test.ts` — real-GLB parsing, cache, clone isolation, orientation, and error tests.
- `src/components/3d/TrafficVehicleVisual.ts` — sedan asset selection, transform/light sync, and wheel rotation; procedural SUV/truck preservation.
- `src/components/3d/TrafficVehicleVisual.test.ts` — visual selection and synchronization behavior.
- `src/components/3d/SimulationCanvas.tsx` — preload state and use of the visual seam; no traffic/physics rewrite.

---

### Task 1: Lock the Khronos Runtime Contract

**Files:**
- Create: `assets/blender/test_khronos_traffic_asset.py`
- Modify: `assets/blender/validate_vehicles.py`

**Interfaces:**
- Consumes: existing `validate_asset(root, asset, expected)` and `bindVehicleAsset(root, 'traffic-compact')`.
- Produces: `TRAFFIC_SEDAN_DIMENSIONS = (1.82, 4.65, 1.45)`, `TRAFFIC_SEDAN_WHEELBASE = 2.70`, and literal validation errors used by the converter gate.

- [ ] **Step 1: Add failing Blender validator tests**

Create `build_contract_fixture(root, dimensions, wheelbase, negative_parent=False)` in the test file. It resets Blender, creates a `BODY` mesh with `PAINT`, four glass meshes, four unique wheel-root empties at `x=±0.72` and `y=±wheelbase/2`, required lamp/blinker meshes, and the five detail nodes already required by `validate_vehicles.py`; it exports the scene to `root/public/models/vehicles/traffic-compact.glb`. Then assert the new envelope and wheelbase literally with `unittest`:

```python
class KhronosTrafficValidatorTests(unittest.TestCase):
    def test_rejects_old_picanto_dimensions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = build_contract_fixture(Path(directory), (1.595, 3.595, 1.495), 2.40)
            failures = validator.validate_asset(root, "traffic-compact", validator.EXPECTED["traffic-compact"])
        self.assertIn("traffic-compact: width 1.595m expected 1.820m", failures)
        self.assertIn("traffic-compact: length 3.595m expected 4.650m", failures)

    def test_rejects_negative_scale_and_wrong_wheelbase(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = build_contract_fixture(Path(directory), (1.82, 4.65, 1.45), 2.40, negative_parent=True)
            failures = validator.validate_asset(root, "traffic-compact", validator.EXPECTED["traffic-compact"])
        self.assertIn("traffic-compact: wheelbase 2.400m expected 2.700m ±0.080m", failures)
        self.assertTrue(any("negative scale" in failure for failure in failures))
```

- [ ] **Step 2: Run the tests and confirm the contract fails for the old values**

Run:

```bash
blender --background --python-exit-code 1 --python assets/blender/test_khronos_traffic_asset.py -- .
```

Expected: FAIL because `EXPECTED['traffic-compact']` is still `(1.595, 3.595, 1.495, False)` and the wheelbase constants still encode `2.400 ± 0.050m`.

- [ ] **Step 3: Change only the source-specific validator constants**

Use:

```python
EXPECTED["traffic-compact"] = (1.82, 4.65, 1.45, False)
TRAFFIC_DIMENSION_TOLERANCE = 0.08
TRAFFIC_WHEELBASE = 2.70
TRAFFIC_WHEELBASE_TOLERANCE = 0.08
```

Keep common required nodes, the 5 MB/50k budgets, unique wheel roots, fitted lamps, material checks, ground contact, and non-negative transforms. Remove Picanto-only axle-position and exact wheel-well-radius assumptions only when their tests prove they reject a valid Khronos fixture; replace them with four wheels inside the body length and below the beltline.

- [ ] **Step 4: Re-run focused tests**

Run:

```bash
blender --background --python-exit-code 1 --python assets/blender/test_khronos_traffic_asset.py -- .
```

Expected: Blender fixture tests PASS without depending on a runtime GLB that Task 2 has not generated yet.

- [ ] **Step 5: Stop at the commit gate**

Report the exact tests and diff. Do not stage or commit. If explicitly approved later:

```bash
git add assets/blender/test_khronos_traffic_asset.py assets/blender/validate_vehicles.py
git commit -m "test: define Khronos traffic sedan contract"
```

### Task 2: Convert the Khronos Source Deterministically

**Files:**
- Create: `assets/blender/prepare_khronos_traffic.py`
- Modify: `assets/blender/test_khronos_traffic_asset.py`
- Modify: `package.json`
- Generate: `public/models/vehicles/traffic-compact.glb`
- Create: `public/models/vehicles/traffic-compact-LICENSE.md`
- Generate outside Git: `/data/ai/modly/workspaces/khronos-traffic-sedan.blend`

**Interfaces:**
- Consumes: `prepare(REPOSITORY_ROOT, SOURCE_GLB, LICENSE_RECEIPT, INSPECTION_BLEND, OUTPUT_GLB)` and Task 1 validator constants.
- Produces: a validated real GLB and attribution receipt accepted by later Three.js tests.

- [ ] **Step 1: Add converter boundary tests before implementation**

Test exact argument count, missing/malformed source, missing receipt, source hash stability, staged-output cleanup, and validation failure:

```python
def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class KhronosConverterBoundaryTests(unittest.TestCase):
    def test_missing_source_fails_without_touching_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "traffic-compact.glb"
            output.write_bytes(b"sentinel")
            with self.assertRaisesRegex(SystemExit, "Khronos source GLB does not exist"):
                converter.prepare(root, root / "missing.glb", root / "LICENSE.md", root / "inspect.blend", output)
            self.assertEqual(output.read_bytes(), b"sentinel")

    def test_source_is_immutable(self) -> None:
        source = Path("/data/ai/modly/sources/khronos-car-concept/CarConcept.glb")
        receipt = Path("/data/ai/modly/sources/khronos-car-concept/LICENSE.md")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = sha256_file(source)
            converter.prepare(root, source, receipt, root / "inspect.blend", root / "out.glb")
            self.assertEqual(sha256_file(source), before)
```

- [ ] **Step 2: Run tests and verify the converter is missing**

Run:

```bash
blender --background --python-exit-code 1 --python assets/blender/test_khronos_traffic_asset.py -- .
```

Expected: FAIL because `prepare_khronos_traffic.py` and `prepare()` do not exist.

- [ ] **Step 3: Implement the explicit CLI and transaction boundary**

Expose:

```python
def prepare(
    repository_root: Path,
    source_glb: Path,
    license_receipt: Path,
    inspection_blend: Path,
    output_glb: Path,
) -> dict[str, object]:
    """Return hashes, dimensions, triangle count, and output paths; raise visibly on failure."""
```

Write the GLB and `.blend` to same-directory temporary names, validate the staged GLB, and replace final paths only after every check passes. On failure, delete only the exact temporary files created by this run. Never catch and suppress import, export, or validation errors.

- [ ] **Step 4: Implement deterministic scene cleanup and naming**

Use object-type and exact-name/material matching, not screen selection state:

```python
REMOVED_OBJECT_TYPES = {"CAMERA", "LIGHT"}
REQUIRED_ROOTS = ("WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR")
REQUIRED_LIGHTS = (
    "HEADLIGHT_L", "HEADLIGHT_R", "BRAKE_L", "BRAKE_R",
    "BLINKER_FL", "BLINKER_FR", "BLINKER_RL", "BLINKER_RR",
)
MUTABLE_MATERIALS = ("PAINT", "HEADLIGHT", "BRAKE", "BLINKER")
```

Delete Khronos/3D Commerce logo meshes and unused material-variant duplicates by recorded source names. Preserve one body, glass, interior, tire, rim, and trim set. Parent each existing wheel assembly under a unique required wheel root. Add thin fitted lamp proxy meshes only when the source lamps cannot satisfy the runtime names; do not cover the source body with rectangular panels.

- [ ] **Step 5: Normalize geometry and reduce the asset**

Apply transforms, center X, place the lowest tire point at Z=0 in Blender, set exact final dimensions, and place front/rear wheel roots at `+1.35/-1.35m` on Blender Y. Decimate large static body/detail meshes individually while preserving boundary and material seams. Remove hidden presentation geometry before decimation. Reject rather than export if the final triangle count exceeds 50,000.

- [ ] **Step 6: Export and record attribution**

Export glTF with applied modifiers, Y-up conversion, materials, and no cameras/lights/animations. Write `traffic-compact-LICENSE.md` with:

```markdown
Source: Khronos glTF Sample Assets — CarConcept
URL: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
Author/model and textures: Eric Chadwick, Darmstadt Graphics Group GmbH
License: CC BY 4.0
Source SHA-256: <computed source hash>
Runtime SHA-256: <computed output hash>
Modifications: logos and presentation content removed; geometry optimized, normalized, and renamed for runtime use.
```

- [ ] **Step 7: Add explicit package command and generate the real artifact**

Add:

```json
"vehicles:prepare-khronos": "blender --background --python-exit-code 1 --python assets/blender/prepare_khronos_traffic.py -- . /data/ai/modly/sources/khronos-car-concept/CarConcept.glb /data/ai/modly/sources/khronos-car-concept/LICENSE.md /data/ai/modly/workspaces/khronos-traffic-sedan.blend public/models/vehicles/traffic-compact.glb"
```

Run `npm run vehicles:prepare-khronos`, then `npm run vehicles:validate`.

Expected: converter prints `KHRONOS_TRAFFIC_ASSET_OK`; validator prints `PASS traffic-compact`; source hash before and after is identical.

- [ ] **Step 8: Stop at the commit gate**

Report byte count, triangle count, dimensions, hashes, required-node list, and tests. Do not stage or commit. If explicitly approved later, commit only the files named in this task.

### Task 3: Render and Deliver the Visual Approval Pack

**Files:**
- Create: `assets/blender/render_khronos_traffic.py`
- Create: `assets/blender/render_khronos_traffic.test.py`
- Modify: `package.json`
- Generate outside Git: `/data/ai/modly/previews/khronos-traffic-sedan/*.png`
- Generate outside Git: `/data/ai/modly/previews/khronos-traffic-sedan/manifest.json`
- Copy for user review: `~/다운로드/khronos-traffic-sedan-review/`

**Interfaces:**
- Consumes: Task 2 inspection `.blend`, runtime GLB, and attribution hashes.
- Produces: exactly six named PNGs plus a manifest; this is the hard asset approval gate.

- [ ] **Step 1: Add failing render-contract tests**

Assert the fixed view set and manifest keys:

```python
EXPECTED_VIEWS = (
    "front", "rear", "side", "front-three-quarter",
    "rear-three-quarter", "elevated",
)

self.assertTupleEqual(tuple(renderer.VIEWS), EXPECTED_VIEWS)
self.assertGreaterEqual(
    set(manifest),
    {"sourceSha256", "runtimeSha256", "blenderVersion", "triangleCount", "dimensions", "views"},
)
```

Also assert missing inspection `.blend`, hash mismatch, render failure, or a missing output image exits non-zero and does not publish a partial manifest.

- [ ] **Step 2: Run the test and confirm the renderer is missing**

Run:

```bash
blender --background --python-exit-code 1 --python assets/blender/render_khronos_traffic.test.py -- .
```

Expected: FAIL because the renderer module does not exist.

- [ ] **Step 3: Implement one deterministic studio scene**

Use a neutral gray world, one floor plane, fixed three-point lighting, 1024x768 PNG output, 64 samples, transparent disabled, and fixed camera transforms derived from the validated bounds. Load the inspection `.blend` read-only and never modify the runtime GLB during rendering.

- [ ] **Step 4: Render, validate, and copy the complete pack**

Add:

```json
"vehicles:render-khronos": "blender --background --python-exit-code 1 --python assets/blender/render_khronos_traffic.py -- /data/ai/modly/workspaces/khronos-traffic-sedan.blend public/models/vehicles/traffic-compact.glb /data/ai/modly/previews/khronos-traffic-sedan"
```

Run the renderer, verify all six files and manifest hashes, then copy the completed directory atomically to `~/다운로드/khronos-traffic-sedan-review/`.

- [ ] **Step 5: Perform the multimodal visual gate**

Inspect all six PNGs for silhouette, panel collapse, glass openings, wheels/arches, lamps, ground contact, missing surfaces, floating parts, and logos. Report each criterion as PASS/FAIL with image evidence. Continue to Task 4 only on a recorded PASS; retain the copied render pack for user inspection.

### Task 4: Load, Cache, and Clone the Approved GLB

**Precondition:** Task 3 records a multimodal PASS for the complete render pack.

**Files:**
- Create: `src/components/3d/VehicleAssetLibrary.ts`
- Create: `src/components/3d/VehicleAssetLibrary.test.ts`
- Modify only if required: `src/components/3d/VehicleAssetContract.ts`
- Modify: `src/components/3d/VehicleAssetContract.test.ts`

**Interfaces:**
- Produces: `loadVehicleAssetLibrary(baseUrl, loadScene?) => Promise<VehicleAssetLibrary>` and `VehicleAssetLibrary.createTrafficSedan(color) => BoundVehicleAsset`.

- [ ] **Step 1: Write real-GLB tests first**

Parse `public/models/vehicles/traffic-compact.glb` with `GLTFLoader.parseAsync` and assert required nodes, `-Z` front ordering using world positions, unit root scale, two differently colored clones, shared geometry, isolated `PAINT`/lamp materials, and four distinct wheel handles:

```ts
root.updateMatrixWorld(true);
const front = root.getObjectByName('HEADLIGHT_L')!.getWorldPosition(new THREE.Vector3()).z;
const rear = root.getObjectByName('BRAKE_L')!.getWorldPosition(new THREE.Vector3()).z;
expect(front).toBeLessThan(rear);
expect(root.scale.toArray()).toEqual([1, 1, 1]);
```

Add a mocked 404 assertion:

```ts
await expect(loadVehicleAssetLibrary('/missing/', async () => {
  throw new Error('404');
})).rejects.toThrow(
  'Failed to load vehicle asset /missing/models/vehicles/traffic-compact.glb: 404',
);
```

- [ ] **Step 2: Run and verify the library is missing**

Run `npm test -- src/components/3d/VehicleAssetLibrary.test.ts`.

Expected: FAIL because `VehicleAssetLibrary.ts` does not exist.

- [ ] **Step 3: Implement the minimal loader**

Use:

```ts
export interface VehicleAssetLibrary {
  createTrafficSedan(color: THREE.ColorRepresentation): BoundVehicleAsset;
}

export type LoadVehicleScene = (url: string) => Promise<THREE.Group>;

export function loadVehicleAssetLibrary(
  baseUrl: string,
  loadScene?: LoadVehicleScene,
): Promise<VehicleAssetLibrary>;
```

Normalize `baseUrl` to one trailing slash, load exactly `models/vehicles/traffic-compact.glb`, validate immediately with `bindVehicleAsset(scene, 'traffic-compact')`, and cache one promise per normalized base URL. Insert the promise before awaiting it; retain rejection so reload is the explicit retry boundary.

- [ ] **Step 4: Run focused tests and stop at the commit gate**

Run:

```bash
npm test -- src/components/3d/VehicleAssetContract.test.ts src/components/3d/VehicleAssetLibrary.test.ts
```

Expected: PASS. Report the exact count and diff; do not stage or commit without approval.

### Task 5: Select and Synchronize Sedan Traffic Visuals

**Files:**
- Create: `src/components/3d/TrafficVehicleVisual.ts`
- Create: `src/components/3d/TrafficVehicleVisual.test.ts`

**Interfaces:**
- Consumes: `VehicleAssetLibrary`, `TrafficVehicleData`, and the existing procedural SUV/truck construction inputs.
- Produces: `createTrafficVehicleVisual(data, assets)` and `syncTrafficVehicleVisual(visual, data, deltaSeconds)`.

- [ ] **Step 1: Write selection and synchronization tests**

Assert sedan calls `createTrafficSedan(color)`, SUV/truck retain their current procedural dimensions, heading uses the existing value without `scale.z = -1`, light emissive intensity follows current high-beam/braking state, and wheel roll derives from traveled distance. Assert a teleport over 100m updates position without a huge wheel spin.

- [ ] **Step 2: Run and verify the seam is missing**

Run `npm test -- src/components/3d/TrafficVehicleVisual.test.ts`.

Expected: FAIL because `TrafficVehicleVisual.ts` does not exist.

- [ ] **Step 3: Implement the smallest visual seam**

Use:

```ts
export interface TrafficVehicleVisual {
  group: THREE.Group;
  headlights: THREE.Mesh[];
  brakeLights: THREE.Mesh[];
  wheels: THREE.Object3D[];
  lastPosition: THREE.Vector2;
}
```

Move only existing sedan/SUV/truck mesh construction and light synchronization into this module. Sedan uses the approved asset; SUV/truck preserve their literal current dimensions. Do not move traffic motion, collision, evaluator, or mission logic.

- [ ] **Step 4: Run tests and stop at the commit gate**

Run `npm test -- src/components/3d/TrafficVehicleVisual.test.ts src/components/3d/VehicleAssetLibrary.test.ts`.

Expected: PASS. Report exact results; do not stage or commit without approval.

### Task 6: Integrate Visible Loading and Failure States

**Files:**
- Modify: `src/components/3d/SimulationCanvas.tsx`
- Create: `src/components/3d/SimulationCanvas.vehicle-assets.test.tsx`

**Interfaces:**
- Consumes: Tasks 4-5 loader and visual seam.
- Produces: one explicit `loading | ready | error` asset state driving scene construction and user-visible status.

- [ ] **Step 1: Write failing lifecycle tests**

Assert one preload per mount, no scene construction before readiness, cancelled mounts do not update state, rejected loads render the exact failed URL/message and call `console.error`, and successful loads create sedan assets while SUV/truck remain procedural.

- [ ] **Step 2: Run and confirm current canvas has no asset lifecycle**

Run `npm test -- src/components/3d/SimulationCanvas.vehicle-assets.test.tsx`.

Expected: FAIL because the canvas constructs every traffic visual synchronously from boxes.

- [ ] **Step 3: Implement the minimal lifecycle**

Start one preload effect with a cancellation flag. Return early from the Three.js scene effect until assets are ready. On rejection, store the actionable message, log the same error, and render an error overlay; do not create fallback sedan boxes. Dispose cloned materials and scene resources through the existing cleanup path.

- [ ] **Step 4: Run focused and complete verification**

Run:

```bash
npm test -- src/components/3d/SimulationCanvas.vehicle-assets.test.tsx src/components/3d/TrafficVehicleVisual.test.ts src/components/3d/VehicleAssetLibrary.test.ts src/components/3d/VehicleAssetContract.test.ts
npm test
npm run vehicles:validate
npm run build
git diff --check
```

Expected: all tests and validator pass; production build succeeds; only the existing Vite chunk-size warning is acceptable.

### Task 7: Browser QA, Review, and Handoff

**Files:**
- No source edits unless a reproduced blocker requires a separately diagnosed fix.
- Generate outside Git: browser screenshots and a concise QA receipt under `/tmp/khronos-traffic-browser-qa/`.

**Interfaces:**
- Consumes: completed runtime integration.
- Produces: evidence-backed verdict; no automatic commit/PR/merge.

- [ ] **Step 1: Start the isolated game server**

Use an unused strict port, record the PID and exact worktree, and verify the served page belongs to this repository before browser interaction.

- [ ] **Step 2: Verify behavior in the busiest traffic mission**

From cockpit and all mirrors, inspect multiple sedan colors, orientation, ground contact, wheel rotation, head/brake lights, traffic yielding, and lane motion. Confirm SUV/truck behavior and appearance are unchanged. Exercise the already-fixed steering, reverse control, and guide visibility once to catch integration regressions.

- [ ] **Step 3: Check runtime health**

Capture console errors, page errors, failed requests, WebGL warnings, and a bounded performance trace. PASS requires no asset 404, contract error, shader error, or obvious sustained frame stutter.

- [ ] **Step 4: Run mandatory code reviews**

Run the general code reviewer and TypeScript reviewer on the final diff. Because this is a non-trivial pre-PR change, run one `pr-code-reviewer` pass. Fix only verified blockers, rerun the affected tests, and use at most one additional specialist pass only if a blocker was changed.

- [ ] **Step 5: Present the final gate**

Report changed files, hashes, byte/triangle/dimension results, test/build counts, browser evidence, reviewer verdicts, remaining gaps, and dirty-worktree preservation. Ask separately for commit; after commit ask separately for push/PR; after CI ask separately for merge.
