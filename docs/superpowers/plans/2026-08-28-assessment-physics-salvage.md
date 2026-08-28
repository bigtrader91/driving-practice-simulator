# Assessment and Physics Salvage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live safety-event assessment and deterministic stability coverage using the same planar vehicle movement as the game.

**Architecture:** Keep event classification and planar movement in small pure simulation modules. `MissionEvaluator` emits procedure-omission events, `SimulationCanvas` accumulates live events, and `App` passes the final assessment into `TrainingSession`. The stability suite drives the canonical `advanceVehiclePose` function with a deterministic fixed-step lane-change profile.

**Tech Stack:** React 19, TypeScript 5.7, Three.js 0.174, Vitest 4.1, Vite 6.2

**Spec:** `docs/superpowers/specs/2026-08-28-assessment-physics-salvage.md`

## Global Constraints

- Preserve the canonical checkout and all unrelated dirty files.
- Do not copy the failed Ouroboros worktree wholesale.
- Do not implement the other six acceptance criteria.
- Do not commit, push, create a PR, merge, or deploy in this plan.
- New production behavior requires a test that is observed failing first.

---

### Task 1: Safety assessment and training continuation

**Files:**
- Create: `src/simulation/AttemptAssessment.ts`
- Create: `src/simulation/AttemptAssessment.test.ts`
- Modify: `src/simulation/TrainingSession.ts`
- Modify: `src/simulation/TrainingSession.test.ts`

**Interfaces:**
- Produces: `AttemptEvent`, `AttemptAssessment`, `assessAttemptEvents(events)`, and `assessMissionResult(events, feedback)`.
- Extends: `completeTrainingAttempt(session, { score, passed, assessment? })` and `TrainingAttemptResult.feedback/majorFailures`.

- [x] **Step 1: Write failing classification tests**

```ts
it('classifies only the five declared safety events as major failures', () => {
  const result = assessAttemptEvents([
    { type: 'collision' },
    { type: 'road-departure' },
    { type: 'rear-ttc-entry', seconds: 1.49 },
    { type: 'rollover' },
    { type: 'spin', degrees: 90 },
  ]);
  expect(result.majorFailures.map((failure) => failure.type)).toEqual([
    'collision', 'road-departure', 'critical-rear-ttc', 'rollover', 'spin',
  ]);
});
```

- [x] **Step 2: Run `npx vitest run src/simulation/AttemptAssessment.test.ts` and verify the missing module fails**

- [x] **Step 3: Implement the pure event classifier with inclusive TTC/spin boundaries from the spec**

```ts
export type AttemptEvent =
  | { type: 'collision' }
  | { type: 'road-departure' }
  | { type: 'rear-ttc-entry'; seconds: number }
  | { type: 'rollover' }
  | { type: 'spin'; degrees: number }
  | { type: 'procedure-omission'; code: ProcedureOmissionCode; message: string };

export function assessAttemptEvents(events: AttemptEvent[]): AttemptAssessment {
  const assessment: AttemptAssessment = {
    majorFailures: [],
    procedureOmissions: [],
    feedback: [],
  };
  for (const event of events) {
    if (event.type === 'collision') {
      assessment.majorFailures.push({ type: 'collision', message: '충돌이 발생했습니다.' });
    } else if (event.type === 'road-departure') {
      assessment.majorFailures.push({ type: 'road-departure', message: '도로를 이탈했습니다.' });
    } else if (event.type === 'rear-ttc-entry' && event.seconds < 1.5) {
      assessment.majorFailures.push({ type: 'critical-rear-ttc', message: '후방 TTC 1.5초 미만으로 진입했습니다.' });
    } else if (event.type === 'rollover') {
      assessment.majorFailures.push({ type: 'rollover', message: '차량이 전복됐습니다.' });
    } else if (event.type === 'spin' && Math.abs(event.degrees) >= 90) {
      assessment.majorFailures.push({ type: 'spin', message: '차량이 90도 이상 회전했습니다.' });
    } else if (event.type === 'procedure-omission') {
      assessment.procedureOmissions.push(event.code);
      assessment.feedback.push(event.message);
    }
  }
  return assessment;
}
```

- [x] **Step 4: Run the focused test and verify it passes**

- [x] **Step 5: Add a failing `TrainingSession` test proving an omission fails only the current scored attempt and advances to the next attempt**

```ts
const assessment = assessAttemptEvents([
  { type: 'procedure-omission', code: 'signal', message: '방향지시등 확인이 누락됐습니다.' },
]);
let session = startTrainingSession(createTrainingSession());
session = completeTrainingAttempt(session, { score: 100, passed: true });
session = completeTrainingAttempt(session, { score: 85, passed: true, assessment });
expect(session.results[1]).toMatchObject({
  passed: false,
  feedback: ['방향지시등 확인이 누락됐습니다.'],
  majorFailures: [],
});
expect(session.currentAttempt?.id).toBe('baseline-right');
```

- [x] **Step 6: Extend `TrainingAttemptResult` and `completeTrainingAttempt` minimally, then run both focused test files**

```ts
const assessment = result.assessment ?? {
  majorFailures: [],
  procedureOmissions: [],
  feedback: [],
};
const recordedResult = {
  score: session.currentAttempt.scored ? result.score : null,
  passed: session.currentAttempt.scored
    ? result.passed && assessment.majorFailures.length === 0 && assessment.procedureOmissions.length === 0
    : null,
  feedback: assessment.feedback,
  majorFailures: assessment.majorFailures,
};
```

- [x] **Step 7: Checkpoint the diff without committing**

### Task 2: Live simulation event pipeline

**Files:**
- Modify: `src/simulation/AttemptAssessment.ts`
- Modify: `src/simulation/AttemptAssessment.test.ts`
- Modify: `src/simulation/MissionEvaluator.ts`
- Modify: `src/simulation/MissionEvaluator.test.ts`
- Modify: `src/components/3d/SimulationCanvas.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Extends: `EvalResult.attemptEvents: AttemptEvent[]`.
- Extends: `onMissionComplete(score, deductions, events)` and `onMissionFail(reason, score, deductions, events)`.
- Produces: `recordAttemptEvent(events, event)` for stable per-attempt deduplication.
- Consumes: `assessMissionResult(events)` from Task 1; deductions remain in the existing result UI and are not duplicated in stored procedure feedback.

- [x] **Step 1: Add a failing evaluator test asserting missing signal and blind-spot checks emit typed procedure omissions**

```ts
expect(result.attemptEvents).toEqual([
  expect.objectContaining({ type: 'procedure-omission', code: 'signal' }),
  expect.objectContaining({ type: 'procedure-omission', code: 'blind-spot' }),
]);
```

- [x] **Step 2: Run `npx vitest run src/simulation/MissionEvaluator.test.ts` and verify `attemptEvents` is missing**

- [x] **Step 3: Add per-evaluation event collection to `MissionEvaluator.raise` and return it from `evaluate`**

- [x] **Step 4: Run the evaluator tests and verify they pass**

- [x] **Step 5: Add a failing pure-function test proving repeated collision and repeated omission codes are recorded once, then implement `recordAttemptEvent`**

```ts
const events: AttemptEvent[] = [];
recordAttemptEvent(events, { type: 'collision' });
recordAttemptEvent(events, { type: 'collision' });
recordAttemptEvent(events, {
  type: 'procedure-omission',
  code: 'signal',
  message: '첫 메시지',
});
recordAttemptEvent(events, {
  type: 'procedure-omission',
  code: 'signal',
  message: '중복 메시지',
});
expect(events).toHaveLength(2);
```

- [x] **Step 6: Thread attempt events through `SimulationCanvas` and `App`, using `recordAttemptEvent` for collision and evaluator events**

- [x] **Step 7: Run `npx tsc --noEmit -p tsconfig.json` to validate the callback contract**

- [x] **Step 8: Checkpoint the diff without committing**

### Task 3: Shared planar dynamics and deterministic stability suite

**Files:**
- Reuse: `src/simulation/VehicleMotion.ts`
- Verify: `src/simulation/VehicleMotion.test.ts`
- Create: `src/simulation/LaneChangePhysics.ts`
- Create: `src/simulation/LaneChangePhysics.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: canonical `advanceVehiclePose(pose, speedMs, steerAngle, deltaSeconds, wheelBase)` used by `SimulationCanvas`.
- Produces: `runLaneChangeStabilitySuite()` with a version, fixed step, 100 runs, and fatal-error total.
- Each stability run reports `stabilized: boolean`; a run that never reaches the center/heading tolerance cannot pass by exhausting the settle window.
- Rebase note: latest `main` already extracted and regression-tested this movement in `VehicleMotion`; the temporary duplicate `VehicleDynamics` module was removed during conflict resolution.

- [x] **Step 1: Confirm `VehicleMotion.test.ts` covers straight/reverse signed steering and pedal behavior**

- [x] **Step 2: Keep `SimulationCanvas` on the latest `advanceVehiclePose` implementation**

- [x] **Step 3: Add a failing deterministic suite test with literal counts and stability limits**

```ts
expect(suite.runs).toHaveLength(100);
expect(suite.runs.filter((run) => run.speedKmH === 30)).toHaveLength(34);
expect(suite.runs.filter((run) => run.speedKmH === 50)).toHaveLength(33);
expect(suite.runs.filter((run) => run.speedKmH === 80)).toHaveLength(33);
expect(suite.fatalErrorCount).toBe(0);
expect(suite.runs.every((run) => run.stabilized)).toBe(true);
```

- [x] **Step 4: Run the new suite test and verify the missing implementation fails**

- [x] **Step 5: Implement the fixed 1/60-second, versioned suite using `advanceVehiclePose` and the exact 34/33/33 distribution**

- [x] **Step 6: Add `test:scoring` and `test:physics` scripts, then run both focused commands**

- [x] **Step 7: Checkpoint the diff without committing**

### Task 4: Whole-change verification

**Files:**
- Verify all files changed in Tasks 1–3.

**Interfaces:**
- Consumes every interface above; produces verification evidence only.

- [x] **Step 1: Run `npm test -- --run` and require zero failed test files and tests**

- [x] **Step 2: Run `npx tsc --noEmit -p tsconfig.json` and require exit code 0**

- [x] **Step 3: Run `npm run build` and require exit code 0**

- [x] **Step 4: Start the isolated Vite server and perform a browser smoke test that opens the training flow and renders the simulation canvas**

- [x] **Step 5: Inspect `git diff --check`, `git status --short`, and the final diff; exclude generated `tsconfig.tsbuildinfo` from any later commit proposal**

- [x] **Step 6: Report verified results and request separate approval before commit or publication**
