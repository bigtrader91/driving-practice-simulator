# Driving Simulator V1 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete issues #12, #4, and #5 and close the remaining driving-behavior gaps with validated vehicle assets and full-browser mission evidence.

**Architecture:** Keep physics and mission evaluation independent from rendering. A strict, fail-visible asset library preloads one normalized GLB per selectable or traffic vehicle type and returns cloned bindings for the player, traffic, and parked-car consumers. Pure simulation functions own steering, reverse guides, and recovery decisions; React/Three adapters only apply those outcomes. The existing training flow remains intact while the failure result adds an explicit route into the existing mission selector.

**Tech Stack:** React 19, TypeScript 5.7, Three.js 0.174, Vitest 4, Vite 6, Blender 5.x, Playwright Chromium

**Supersedes:** The runtime portions of `2026-08-25-blender-vehicle-assets.md` that require internally generated body shells. The current user-approved goal requires externally sourced, license-validated GLBs; strict node contracts, local `-Z` forward, and fail-visible loading remain unchanged.

## Global constraints

- Preserve the root checkout and all unrelated worktrees; implement only in `/tmp/dps-v1-completion`.
- Use Quaternius CC0 source models with recorded URL, license, SHA-256, and deterministic Blender conversion details.
- Never fall back to procedural box vehicles after a load or contract failure.
- Preserve current collision dimensions and mission evaluation unless a named behavior task requires a change.
- Use RED-GREEN TDD for each behavior and run fresh milestone verification.

### Task 1: Replace every vehicle box with validated GLBs (#12)

**Files:** `assets/blender/prepare_vehicle_family.py`, `assets/vehicle-sources/README.md`, `assets/vehicle-sources/LICENSE-QUATERNIUS-CC0.txt`, `public/models/vehicles/*.glb`, `src/components/3d/{VehicleAssetContract,VehicleAssetLibrary,CarModel,TrafficVehicleVisual,TrackBuilder}*`

- [ ] Add behavior tests proving the library loads all four kinds, player/traffic/parked consumers use clones, and any missing or malformed GLB rejects visibly.
- [ ] Record the exact upstream model URLs and SHA-256 values and add a deterministic Blender normalizer that applies scale/orientation and emits the established named control/light nodes.
- [ ] Replace player, parked, SUV, and truck procedural geometry with asset-library clones; remove the silent procedural fallback path.
- [ ] Run targeted tests, `vehicles:validate`, typecheck, and browser asset-load checks.

### Task 2: Align wheels, steering wheel, lights, camera, and collisions

**Files:** `src/components/3d/{CarModel,VehicleCoordinateSystem,SimulationCanvas,TrackBuilder}*`, `src/simulation/*`

- [ ] Add literal coordinate-invariant tests for wheel centers, front/rear lamps, cockpit eye clearance, camera forward direction, and unchanged collision dimensions.
- [ ] Adjust only conversion transforms and existing camera/control offsets needed to satisfy the invariants.
- [ ] Verify all selectable vehicles in cockpit and chase views.

### Task 3: Complete driving behavior and recovery

**Files:** `src/simulation/{VehicleMotion,GuideVisibility,WorldBounds}*`, `src/components/3d/{SimulationCanvas,TireTracksOverlay}*`

- [ ] Add failing tests for D/R steering direction, 540-degree steering-wheel endpoints, reverse-only guide direction, rollover reset, and world-bounds reset.
- [ ] Implement the minimum deterministic pure-function changes, then wire them into the canvas without model decisions.
- [ ] Run physics and behavior suites.

### Task 4: Add failure-modal mission selection (#4)

**Files:** `src/components/ui/FeedbackModal*`, `src/App.tsx`

- [ ] Add a failing UI test that a failed scored attempt offers `미션 선택` and invokes a distinct callback.
- [ ] Wire that callback to close feedback and open the existing mission selector while preserving retry and training progression.
- [ ] Verify keyboard focus and visible result behavior.

### Task 5: Make TypeScript build metadata disposable (#5)

**Files:** `.gitignore`, `tsconfig.json`, `package.json`, tracked `tsconfig.tsbuildinfo`

- [ ] Add an executable build-policy test or clean-worktree gate that catches a build dirtying tracked metadata.
- [ ] Move or ignore the build-info output and remove the tracked generated artifact.
- [ ] Run two consecutive builds and prove no tracked diff appears.

### Task 6: Verify every mission at 1600x900

**Files:** browser verification scripts or tests only where they assert user-visible behavior

- [ ] Start the production preview and run Chromium at exactly 1600x900.
- [ ] Complete each mission start-to-finish, exercising cockpit/chase views, D/R, steering, guides, success, failure, retry, and mission selection.
- [ ] Capture screenshots and console/page errors; treat any visual obstruction or silent asset fallback as failure.

### Task 7: Run repository gates and review

- [ ] Run full tests, typecheck, build, vehicle validation, and fresh browser checks.
- [ ] Review the complete diff for correctness, asset licensing, silent failures, and unrelated changes; fix blockers and rerun affected gates.

### Task 8: Deliver through GitHub

- [ ] Commit the scoped changes, push the feature branch, open a PR referencing #12, #4, and #5, and wait for CI.
- [ ] Apply only concrete blocker fixes, rerun verification, and merge once checks and review are clean.
- [ ] Re-check remote main, issue closure, CI, and leave only value-gated follow-ups.
