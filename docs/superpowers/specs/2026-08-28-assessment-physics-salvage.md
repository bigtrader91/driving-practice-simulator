# Assessment and Physics Salvage Specification

## Goal

Recover only the useful AC3 and AC5 behavior from the failed Ouroboros run without importing its generated files wholesale.

## In scope

- Classify collision, road departure, rear TTC below 1.5 seconds, rollover, and spin of at least 90 degrees as major failures.
- Treat signal, mirror, blind-spot, and speed procedure omissions as per-attempt feedback rather than session-ending failures.
- Carry evaluator and collision events through the live simulation result boundary into `TrainingSession`.
- Make a scored attempt fail when it has either a major failure or a procedure omission while continuing to the next attempt.
- Reuse the canonical pure `advanceVehiclePose` Ackermann movement used by `SimulationCanvas`.
- Exercise that same movement function in deterministic 30/50/80 km/h lane-change stability tests with 34/33/33 runs.

## Out of scope

- The other six Ouroboros acceptance criteria.
- Analytics, performance harnesses, production deployment, user studies, and UI redesign.
- Commit, push, pull request creation, and merge.

## Verification contract

- Every production behavior starts with a failing Vitest test.
- Existing tests remain green.
- `npm test -- --run`, `npx tsc --noEmit -p tsconfig.json`, and `npm run build` must pass before the changes are offered for commit.
- A browser smoke test must confirm the training flow still starts and the simulation canvas renders.
