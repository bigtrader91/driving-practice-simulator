# 미션 평가 엔진 & 종합주행 코스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** missions.ts의 장식 objectives를 실제 판정 로직으로 전환하고, 미션 7(종합 도로주행)을 신호등·비보호 좌회전·회전교차로가 있는 완주 가능한 코스로 재설계한다.

**Architecture:** 판정 로직은 Three.js 비의존 순수 모듈(`src/simulation/`)로 분리해 단위 테스트하고, TrackBuilder는 지형만, SimulationCanvas는 매 프레임 evaluator 호출과 3D 반영만 담당한다. 필수 목표 위반 시 즉시 실패 흐름을 FeedbackModal까지 연결한다.

**Tech Stack:** React 19, TypeScript, Vite, Three.js, vitest (신설)

**Spec:** `docs/superpowers/specs/2026-08-22-mission-evaluation-engine-design.md`

---

## 파일 구조 개요

| 파일 | 조작 | 책임 |
|---|---|---|
| `package.json` | 수정 | vitest 스크립트 |
| `src/types/simulator.ts` | 수정 | MissionZone, motion/orbit 타입 |
| `src/simulation/TrafficLightController.ts` | 생성 | 신호 상태머신 |
| `src/simulation/MissionEvaluator.ts` | 생성 | objectives 소비 판정기 |
| `src/simulation/TrafficLightController.test.ts` | 생성 | 단위 테스트 |
| `src/simulation/MissionEvaluator.test.ts` | 생성 | 단위 테스트 |
| `src/constants/missions.ts` | 수정 | city_traffic 데이터 갱신 |
| `src/components/3d/TrackBuilder.tsx` | 수정 | city_traffic 지형 신설 |
| `src/components/3d/SimulationCanvas.tsx` | 수정 | evaluator 연결, uiRefs 버그 수정 |
| `src/App.tsx` | 수정 | 실패 상태 연결 |
| `src/components/ui/FeedbackModal.tsx` | 수정 | 실패 UI |

---

### Task 1: vitest 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 설치**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: 스크립트 추가**

`package.json` scripts에 추가:

```json
"test": "vitest run",
```

- [ ] **Step 3: 동작 확인**

Run: `npm test`
Expected: "No test files found" 후 exit code 1 (테스트 없음 — 정상)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: vitest 테스트 인프라 추가"
```

---

### Task 2: 타입 확장

**Files:**
- Modify: `src/types/simulator.ts`

- [ ] **Step 1: TrafficDriverBehavior 확장 + motion/orbit 타입**

`TrafficDriverBehavior`를 교체하고 그 아래에 추가:

```ts
export type TrafficDriverBehavior = 'yielding' | 'aggressive' | 'normal' | 'circulating';

export type TrafficMotion = 'forward' | 'oncoming' | 'orbit';

export interface OrbitConfig {
  cx: number;
  cz: number;
  radius: number;
  angle: number;
  angularSpeed: number; // rad/s
  direction: 1 | -1;
}
```

- [ ] **Step 2: TrafficVehicleData에 선택 필드 추가**

`TrafficVehicleData` 인터페이스 끝에 추가:

```ts
  motion?: TrafficMotion;
  orbit?: OrbitConfig;
```

- [ ] **Step 3: MissionZone + Mission 확장**

`MissionObjective` 위에 추가:

```ts
export type MissionZoneType = 'school' | 'intersection' | 'roundabout';

export interface MissionZone {
  type: MissionZoneType;
  bounds: { x: number; z: number; width: number; depth: number };
  speedLimit?: number;
}
```

`Mission` 인터페이스의 `laneCount?: number;` 아래에 추가:

```ts
  zones?: MissionZone[];
  stopLine?: { z: number }; // 적색 판정 기준선 (city_traffic)
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 통과 (선택 필드라 기존 코드 영향 없음)

- [ ] **Step 5: Commit**

```bash
git add src/types/simulator.ts
git commit -m "feat: MissionZone/motion/orbit 타입 추가"
```

---

### Task 3: TrafficLightController (TDD)

**Files:**
- Test: `src/simulation/TrafficLightController.test.ts`
- Create: `src/simulation/TrafficLightController.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from 'vitest';
import { TrafficLightController } from './TrafficLightController';

describe('TrafficLightController', () => {
  it('시작 시 NS는 녹색, EW는 적색이다', () => {
    const c = new TrafficLightController();
    expect(c.getPhase('NS')).toBe('green');
    expect(c.getPhase('EW')).toBe('red');
  });

  it('NS는 green(10s) → yellow(3s) 순으로 전환된다', () => {
    const c = new TrafficLightController();
    c.update(9.9);
    expect(c.getPhase('NS')).toBe('green');
    c.update(0.2); // t=10.1
    expect(c.getPhase('NS')).toBe('yellow');
  });

  it('NS 적색 시작(t=13s)과 동시에 EW 녹색이 된다', () => {
    const c = new TrafficLightController();
    c.update(13);
    expect(c.getPhase('NS')).toBe('red');
    expect(c.getPhase('EW')).toBe('green');
  });

  it('EW는 녹색(r-y=5s) 후 황색 3s를 거친다', () => {
    const c = new TrafficLightController();
    c.update(13 + 4.9);
    expect(c.getPhase('EW')).toBe('green');
    c.update(0.2); // t=18.1 → EW local 5.1
    expect(c.getPhase('EW')).toBe('yellow');
    c.update(3.2); // t=21.3 → wrap, EW red
    expect(c.getPhase('EW')).toBe('red');
  });

  it('주기(21s)를 넘으면 다시 처음 위상부터 반복된다', () => {
    const c = new TrafficLightController();
    c.update(21.5);
    expect(c.getPhase('NS')).toBe('green');
    expect(c.getPhase('EW')).toBe('red');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/simulation/TrafficLightController.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
export type LightPhase = 'green' | 'yellow' | 'red';
export type LightAxis = 'NS' | 'EW';

/**
 * N-S / E-W 신호 상태머신. 프레임 독립적이며 Three.js 의존이 없다.
 * 타임라인(한 axis 기준): green(greenSec) → yellow(yellowSec) → red(redSec)
 * EW는 NS보다 (greenSec+yellowSec) 뒤에 같은 시퀀스로 진행된다.
 */
export class TrafficLightController {
  private timer = 0;

  constructor(
    private readonly greenSec = 10,
    private readonly yellowSec = 3,
    private readonly redSec = 8,
  ) {}

  update(dt: number): void {
    if (dt <= 0) return;
    const cycle = this.greenSec + this.yellowSec + this.redSec;
    this.timer = (this.timer + dt) % cycle;
  }

  getPhase(axis: LightAxis): LightPhase {
    const { greenSec: g, yellowSec: y, redSec: r } = this;
    const cycle = g + y + r;
    if (axis === 'NS') {
      if (this.timer < g) return 'green';
      if (this.timer < g + y) return 'yellow';
      return 'red';
    }
    const ewGreen = r - y;
    const t = (this.timer - (g + y) + cycle) % cycle;
    if (t < ewGreen) return 'green';
    if (t < ewGreen + y) return 'yellow';
    return 'red';
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/simulation/TrafficLightController.test.ts`
Expected: PASS 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/simulation/TrafficLightController.ts src/simulation/TrafficLightController.test.ts
git commit -m "feat: 신호등 상태머신 TrafficLightController"
```

---

### Task 4: MissionEvaluator 코어 + 학교구역 + 깜빡이/미러 이관 (TDD)

**Files:**
- Test: `src/simulation/MissionEvaluator.test.ts`
- Create: `src/simulation/MissionEvaluator.ts`

- [ ] **Step 1: 테스트 픽스처와 함께 실패하는 테스트 작성**

```ts
import { describe, it, expect } from 'vitest';
import { MissionEvaluator } from './MissionEvaluator';
import { TrafficLightController } from './TrafficLightController';
import { CarState, Mission } from '../types/simulator';

const makeCar = (over: Partial<CarState> = {}): CarState => ({
  x: 0, y: 0, z: 0,
  speed: 0, speedMs: 0,
  steerAngle: 0, steeringWheelAngle: 0, steeringWheelTurns: 0, steeringWheelDegrees: 0,
  heading: 0, gear: 'D',
  isBraking: false, isAccelerating: false, isHandbrake: false,
  turnSignal: 'none', headlights: true,
  leftMirrorLooked: false, rightMirrorLooked: false, rearMirrorLooked: false,
  lastMirrorCheckTime: 0, inCollision: false, rpm: 800, odometer: 0,
  ...over,
});

const baseObjectives = [
  { id: 'complete_city', text: '종합 주행 코스 완주', isCompleted: false, isMandatory: true, scorePenalty: 40 },
  { id: 'stop_at_red', text: '적색 신호 정지선 준수', isCompleted: false, isMandatory: true, scorePenalty: 30 },
  { id: 'school_zone_speed', text: '어린이보호구역 30km/h 이하 준수', isCompleted: false, isMandatory: false, scorePenalty: 15 },
  { id: 'unprotected_left', text: '비보호 좌회전 안전 진입', isCompleted: false, isMandatory: false, scorePenalty: 15 },
  { id: 'roundabout_yield', text: '회전교차로 순환 차량 양보 후 진입', isCompleted: false, isMandatory: false, scorePenalty: 15 },
];

const makeMission = (over: Partial<Mission> = {}): Mission => ({
  id: 'test_city', title: '테스트', subtitle: '', category: 'traffic', difficulty: '보통',
  description: '', tip: '',
  startPos: [0, 0, 140], startHeading: 0, maxScore: 100,
  objectives: baseObjectives.map((o) => ({ ...o })),
  zones: [
    { type: 'school', bounds: { x: 0, z: 80, width: 24, depth: 40 }, speedLimit: 30 },
    { type: 'intersection', bounds: { x: 0, z: 30, width: 24, depth: 16 } },
    { type: 'roundabout', bounds: { x: -80, z: 30, width: 48, depth: 48 } },
  ],
  stopLine: { z: 36 },
  ...over,
});

describe('MissionEvaluator — 어린이보호구역', () => {
  it('존 내 31km/h 주행 시 scorePenalty(15점) 감점 1회', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 0, z: 80, speed: 31, speedMs: 8.6 }),
      traffic: [], lights: null,
    });
    expect(r.penalties).toHaveLength(1);
    expect(r.penalties[0].points).toBe(15);
    expect(r.penalties[0].reason).toContain('어린이보호구역');
    expect(r.failReason).toBeUndefined();
  });

  it('같은 진입에서는 중복 감점하지 않는다', () => {
    let clock = 0;
    const ev = new MissionEvaluator(makeMission(), () => clock);
    const ctx = { carState: makeCar({ x: 0, z: 80, speed: 40, speedMs: 11 }), traffic: [], lights: null };
    expect(ev.evaluate(ctx).penalties).toHaveLength(1);
    clock = 5000;
    expect(ev.evaluate(ctx).penalties).toHaveLength(0);
  });

  it('존을 나갔다 다시 들어오면 다시 감점한다', () => {
    let clock = 0;
    const ev = new MissionEvaluator(makeMission(), () => clock);
    const speeding = { carState: makeCar({ x: 0, z: 80, speed: 40, speedMs: 11 }), traffic: [], lights: null };
    const slow = { carState: makeCar({ x: 0, z: 50, speed: 20, speedMs: 5.5 }), traffic: [], lights: null };
    expect(ev.evaluate(speeding).penalties).toHaveLength(1);
    clock = 4000;
    expect(ev.evaluate(slow).penalties).toHaveLength(0);
    clock = 8000;
    expect(ev.evaluate(speeding).penalties).toHaveLength(1);
  });

  it('존 내 25km/h는 감점하지 않는다', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 0, z: 80, speed: 25, speedMs: 7 }),
      traffic: [], lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });
});

describe('MissionEvaluator — 깜빡이/미러 이관 체크', () => {
  it('15km/h 이상에서 좌회전 조향 중 깜빡이가 없으면 감점한다', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ speed: 30, speedMs: 8.3, steerAngle: -0.2 }),
      traffic: [], lights: null,
    });
    expect(r.penalties.some((p) => p.reason.includes('방향지시등'))).toBe(true);
  });

  it('정지 상태 조향은 감점하지 않는다', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ speed: 5, speedMs: 1.4, steerAngle: -0.2 }),
      traffic: [], lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/simulation/MissionEvaluator.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
import {
  CarState,
  Mission,
  MissionZone,
  ScoreDeduction,
  TrafficVehicleData,
} from '../types/simulator';
import { TrafficLightController } from './TrafficLightController';

export interface EvalContext {
  carState: CarState;
  traffic: TrafficVehicleData[];
  lights: TrafficLightController | null;
}

export interface EvalResult {
  penalties: ScoreDeduction[];
  failReason?: string;
}

const THROTTLE_MS = 3000;

const inBounds = (
  x: number,
  z: number,
  b: MissionZone['bounds'],
): boolean => Math.abs(x - b.x) < b.width / 2 && Math.abs(z - b.z) < b.depth / 2;

// (스펙 편차 명시) EvalContext에서 mission/dt 필드를 뺀다 —
// mission은 생성자에서 주입되고 dt는 throttle이 wall-clock 기반이라 불필요하다.

/**
 * missions.ts의 objectives를 유일한 진실 원천으로 소비하는 판정기.
 * Three.js 의존 없음. 매 프레임 evaluate() 호출을 전제로 한다.
 */
export class MissionEvaluator {
  private lastPenaltyAt = new Map<string, number>();
  private insideZones = new Set<string>();
  private zonePenalized = new Set<string>();
  private failed = false;
  private failMessage?: string;
  private seq = 0;
  private pending: ScoreDeduction[] = [];

  constructor(
    private readonly mission: Mission,
    private readonly now: () => number = () => performance.now(),
  ) {}

  evaluate(ctx: EvalContext): EvalResult {
    this.pending = [];
    const { carState: car } = ctx;

    this.checkSignalAndMirror(car);
    this.checkSchoolZones(car);
    this.checkStopAtRed(ctx);
    this.checkYieldOnMerge(ctx);
    this.checkUnprotectedLeft(ctx);
    this.checkRoundaboutYield(ctx);

    return { penalties: this.pending, failReason: this.failed ? this.failMessage : undefined };
  }

  /** objective 조회 → 없으면 무시(다른 미션 호환), 있으면 감점. mandatory면 즉시 실패. */
  private raise(objectiveId: string, throttleKey: string, throttleMs = THROTTLE_MS): void {
    if (this.failed) return;
    const obj = this.mission.objectives.find((o) => o.id === objectiveId);
    if (!obj) return;

    const t = this.now();
    if (throttleMs > 0) {
      const last = this.lastPenaltyAt.get(throttleKey);
      if (last !== undefined && t - last < throttleMs) return;
      this.lastPenaltyAt.set(throttleKey, t);
    }

    if (obj.isMandatory) {
      this.failed = true;
      this.failMessage = obj.text;
    }
    this.seq += 1;
    this.pending.push({
      id: `eval_${this.seq}`,
      timestamp: t,
      reason: `[감점] ${obj.text}`,
      points: obj.scorePenalty,
    });
  }

  /** 기존 SimulationCanvas 인라인 로직 이관 (값 유지) */
  private checkSignalAndMirror(car: CarState): void {
    if (!(Math.abs(car.steerAngle) > 0.12 && Math.abs(car.speed) > 15)) return;
    const left = car.steerAngle < 0;
    const correctSignal = left ? car.turnSignal === 'left' : car.turnSignal === 'right';
    const correctMirror = left ? car.leftMirrorLooked : car.rightMirrorLooked;
    if (!correctSignal) this.raiseGeneric('방향지시등(깜빡이) 미작동 차선 변경 감점', 10);
    if (!correctMirror) this.raiseGeneric('사이드미러/사각지대 숄더체크 미확인 감점', 10);
  }

  private raiseGeneric(reason: string, points: number): void {
    if (this.failed) return;
    const t = this.now();
    const last = this.lastPenaltyAt.get(reason);
    if (last !== undefined && t - last < THROTTLE_MS) return;
    this.lastPenaltyAt.set(reason, t);
    this.seq += 1;
    this.pending.push({ id: `eval_${this.seq}`, timestamp: t, reason, points });
  }

  private checkSchoolZones(car: CarState): void {
    (this.mission.zones ?? []).forEach((z, i) => {
      if (z.type !== 'school' || z.speedLimit === undefined) return;
      const key = `school_${i}`;
      const inside = inBounds(car.x, car.z, z.bounds);
      if (inside && !this.insideZones.has(key)) this.zonePenalized.delete(key);
      if (inside) this.insideZones.add(key);
      else this.insideZones.delete(key);
      if (inside && !this.zonePenalized.has(key) && car.speed > z.speedLimit) {
        this.zonePenalized.add(key);
        this.raise('school_zone_speed', `school_once_${i}`, 1);
      }
    });
  }

  private checkStopAtRed(ctx: EvalContext): void {
    const inter = (this.mission.zones ?? []).find((z) => z.type === 'intersection');
    if (!inter || !ctx.lights || !this.mission.stopLine) return;
    const key = 'intersection';
    const inside = inBounds(ctx.carState.x, ctx.carState.z, inter.bounds);
    const wasInside = this.insideZones.has(key);
    if (wasInside) {
      if (!inside) this.insideZones.delete(key);
      return;
    }
    if (inside) {
      this.insideZones.add(key);
      if (ctx.lights.getPhase('NS') === 'red') {
        this.raise('stop_at_red', 'stop_at_red', 1);
      }
    }
  }

  private checkYieldOnMerge(ctx: EvalContext): void {
    const car = ctx.carState;
    if (car.speedMs <= 3) return;
    const risky = ctx.traffic.some(
      (tv) =>
        tv.behavior === 'aggressive' &&
        tv.z - car.z > 0 &&
        tv.z - car.z < 25 &&
        Math.abs(tv.x - car.x) < 2.6,
    );
    if (risky) this.raise('yield_check', 'yield_check');
  }

  private checkUnprotectedLeft(ctx: EvalContext): void {
    const inter = (this.mission.zones ?? []).find((z) => z.type === 'intersection');
    if (!inter) return;
    const car = ctx.carState;
    const inside = inBounds(car.x, car.z, inter.bounds);
    const turningLeft = car.turnSignal === 'left' || car.steerAngle < -0.15;
    if (!inside || !turningLeft) return;
    const oncomingClose = ctx.traffic.some(
      (tv) =>
        tv.motion !== 'orbit' &&
        tv.behavior !== 'circulating' &&
        tv.x < 0 &&
        Math.hypot(tv.x - car.x, tv.z - car.z) < 30,
    );
    if (oncomingClose) this.raise('unprotected_left', 'unprotected_left', 5000);
  }

  private checkRoundaboutYield(ctx: EvalContext): void {
    const rb = (this.mission.zones ?? []).find((z) => z.type === 'roundabout');
    if (!rb) return;
    const car = ctx.carState;
    if (!inBounds(car.x, car.z, rb.bounds)) return;
    const circulatingNear = ctx.traffic.some(
      (tv) =>
        tv.behavior === 'circulating' &&
        Math.hypot(tv.x - car.x, tv.z - car.z) < 15,
    );
    if (circulatingNear) this.raise('roundabout_yield', 'roundabout_yield', 5000);
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/simulation/MissionEvaluator.test.ts`
Expected: PASS 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/simulation/MissionEvaluator.ts src/simulation/MissionEvaluator.test.ts
git commit -m "feat: MissionEvaluator 코어(학교구역/깜빡이·미러 이관)"
```

---

### Task 5: MissionEvaluator — 즉시 실패 + yield 판정들 (TDD)

**Files:**
- Modify: `src/simulation/MissionEvaluator.test.ts`
- Modify: `src/simulation/MissionEvaluator.ts` (판정 메서드는 Task 4에서 이미 구현됨 — 여기서는 테스트만 추가)

- [ ] **Step 1: 테스트 추가 (파일 끝에 append)**

```ts
describe('MissionEvaluator — 신호위반 즉시 실패', () => {
  const redLights = { getPhase: () => 'red' } as unknown as TrafficLightController;
  const yellowLights = { getPhase: () => 'yellow' } as unknown as TrafficLightController;

  it('적색에 교차로 박스 진입 시 failReason 반환', () => {
    let clock = 0;
    const ev = new MissionEvaluator(makeMission(), () => clock);
    const outside = { carState: makeCar({ x: 0, z: 45 }), traffic: [], lights: redLights };
    const inside = { carState: makeCar({ x: 0, z: 30 }), traffic: [], lights: redLights };
    expect(ev.evaluate(outside).failReason).toBeUndefined();
    clock = 100;
    const r = ev.evaluate(inside);
    expect(r.failReason).toContain('적색 신호 정지선 준수');
    expect(r.penalties[0].points).toBe(30);
  });

  it('황색 진입은 위반이 아니다', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    ev.evaluate({ carState: makeCar({ x: 0, z: 45 }), traffic: [], lights: yellowLights });
    const r = ev.evaluate({ carState: makeCar({ x: 0, z: 30 }), traffic: [], lights: yellowLights });
    expect(r.failReason).toBeUndefined();
  });
});

describe('MissionEvaluator — yield_check (고속도로)', () => {
  const highwayMission = makeMission({
    id: 'highway_test',
    zones: [],
    objectives: [
      { id: 'yield_check', text: '비양보 가속 차량 앞 무리한 끼어들기 금지', isCompleted: false, isMandatory: false, scorePenalty: 30 },
    ],
  });
  const aggressive = {
    id: 'tv1', x: 1.8, z: 120, speedKmH: 88, targetLane: 0, laneX: 1.8,
    color: 0xff0000, type: 'sedan' as const, behavior: 'aggressive' as const,
    isYielding: false, isHonking: false, isFlashingHighBeam: false,
  };

  it('aggressive 차량 후방 25m 내 접근 중 해당 차로 진입하면 감점', () => {
    const ev = new MissionEvaluator(highwayMission, () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 1.8, z: 100, speed: 60, speedMs: 16 }),
      traffic: [{ ...aggressive, z: 115 }],
      lights: null,
    });
    expect(r.penalties).toHaveLength(1);
    expect(r.penalties[0].points).toBe(30);
  });

  it('yielding 차량 뒤로 진입하면 무감점', () => {
    const ev = new MissionEvaluator(highwayMission, () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 1.8, z: 100, speed: 60, speedMs: 16 }),
      traffic: [{ ...aggressive, behavior: 'yielding', z: 115 }],
      lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });
});

describe('MissionEvaluator — 비보호 좌회전 / 회전교차로', () => {
  const oncoming = (x: number, z: number) => ({
    id: 'onc', x, z, speedKmH: 50, targetLane: 0, laneX: x,
    color: 0x0000ff, type: 'sedan' as const, behavior: 'normal' as const,
    isYielding: false, isHonking: false, isFlashingHighBeam: false,
  });

  it('좌회전 중 온커밍 30m 내 진입 시 감점', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 2, z: 28, turnSignal: 'left' }),
      traffic: [oncoming(-6, 32)],
      lights: null,
    });
    expect(r.penalties.some((p) => p.points === 15)).toBe(true);
  });

  it('온커밋 없이 좌회전하면 무감점', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 2, z: 28, turnSignal: 'left' }),
      traffic: [],
      lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });

  it('순환 차량 15m 내 회전교차로 진입 시 감점', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const circulating = {
      id: 'orb1', x: -70, z: 34, speedKmH: 25, targetLane: 0, laneX: -70,
      color: 0x00ff00, type: 'sedan' as const, behavior: 'circulating' as const,
      isYielding: false, isHonking: false, isFlashingHighBeam: false,
    };
    const r = ev.evaluate({
      carState: makeCar({ x: -62, z: 30 }),
      traffic: [circulating],
      lights: null,
    });
    expect(r.penalties).toHaveLength(1);
    expect(r.penalties[0].reason).toContain('회전교차로');
  });

  it('objective가 정의되지 않은 미션의 판정은 no-op이다', () => {
    const noObjMission = makeMission({ objectives: [] });
    const ev = new MissionEvaluator(noObjMission, () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 0, z: 30, speed: 40, speedMs: 11 }),
      traffic: [], lights: null,
    });
    expect(r.penalties).toHaveLength(0);
    expect(r.failReason).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실행**

Run: `npx vitest run src/simulation/MissionEvaluator.test.ts`
Expected: PASS (판정 메서드는 Task 4에서 구현됨 — 테스트만 추가하는 태스크)

- [ ] **Step 3: 전체 테스트**

Run: `npm test`
Expected: PASS (TrafficLightController 포함 전체)

- [ ] **Step 4: Commit**

```bash
git add src/simulation/MissionEvaluator.test.ts
git commit -m "test: 즉시실패/yield/비보호좌회전/회전교차로 판정 테스트"
```

---

### Task 6: missions.ts city_traffic 데이터 갱신

**Files:**
- Modify: `src/constants/missions.ts:173-196` (city_traffic 객체)

- [ ] **Step 1: targetArea/zones/stopLine/objectives 교체**

`city_traffic` 미션 객체에서 `targetArea` 블록을 교체:

(참고: `stopLine`은 판정기가 교차로 박스 진입 시점 기준으로 판정하므로 직접 읽히지 않지만, HUD/향후 확장을 위해 데이터로 유지한다)

```ts
    targetArea: {
      x: -80,
      z: 90,
      width: 8,
      depth: 8,
    },
    zones: [
      { type: 'school', bounds: { x: 0, z: 80, width: 24, depth: 40 }, speedLimit: 30 },
      { type: 'intersection', bounds: { x: 0, z: 30, width: 24, depth: 16 } },
      { type: 'roundabout', bounds: { x: -80, z: 30, width: 48, depth: 48 } },
    ],
    stopLine: { z: 36 },
```

objectives 배열 끝에 추가:

```ts
      { id: 'roundabout_yield', text: '회전교차로 순환 차량 양보 후 진입', isCompleted: false, isMandatory: false, scorePenalty: 15 },
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 통과

- [ ] **Step 3: Commit**

```bash
git add src/constants/missions.ts
git commit -m "feat: city_traffic 코스 데이터(목표지점/zones/roundabout_yield)"
```

---

### Task 7: TrackBuilder city_traffic 지형

**Files:**
- Modify: `src/components/3d/TrackBuilder.tsx`

- [ ] **Step 1: TrafficSignalRig 타입 + 반환값 확장**

파일 상단 인터페이스 영역에 추가:

```ts
export interface TrafficSignalRig {
  axis: 'NS' | 'EW';
  lamps: {
    red: THREE.MeshStandardMaterial;
    yellow: THREE.MeshStandardMaterial;
    green: THREE.MeshStandardMaterial;
  };
}
```

`buildTrackScene` 반환 타입에 `signals: TrafficSignalRig[]` 추가. 함수 상단 초기화 영역(`obstacles`, `initialTraffic` 선언 곁)에 다음을 선언해 **블록 스코프 문제를 회피**한다:

```ts
  const signals: TrafficSignalRig[] = [];
```

함수 말미 반환문:

```ts
  return { trackGroup: group, obstacles, initialTraffic, goalMesh, signals };
```

- [ ] **Step 2: city_traffic 분기 신설**

기존 `} else { // City Driving ...` 분기를 `} else if (mission.id === 'city_lane_change') {` 로 변경(기존 내용 유지)하고, 그 앞에 새 분기 추가:

```ts
  } else if (mission.id === 'city_traffic') {
    // ── 본선(N-S 24m 폭, 기존 직선 도로 재사용) ──
    const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(24, 320), asphaltMat);
    mainRoad.rotation.x = -Math.PI / 2;
    group.add(mainRoad);

    [-0.2, 0.2].forEach((lx) => {
      const yl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 320), laneYellowMat);
      yl.rotation.x = -Math.PI / 2;
      yl.position.set(lx, 0.02, 0);
      group.add(yl);
    });

    [-8, -4, 4, 8].forEach((lx) => {
      for (let lz = 150; lz >= -150; lz -= 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4), laneWhiteMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(lx, 0.02, lz);
        group.add(dash);
      }
    });

    // ── 도로변 연석: 동측은 풀 길이, 서측은 가지도로 진입구(z 20~40) 개방 ──
    const eastCurb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 320), curbMat);
    eastCurb.position.set(12.2, 0.1, 0);
    group.add(eastCurb);
    obstacles.push({ type: 'box', x: 12.2, z: 0, width: 0.4, depth: 320, name: '도로변 보도블록', isPenaltyTrigger: true });

    // 서측 연석 2분절: z∈[-160,20) 과 (40,160] — 좌회전 경로 확보
    [[-70, 180], [100, 120]].forEach(([cz, cd]) => {
      const westCurb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, cd), curbMat);
      westCurb.position.set(-12.2, 0.1, cz);
      group.add(westCurb);
      obstacles.push({ type: 'box', x: -12.2, z: cz, width: 0.4, depth: cd, name: '도로변 보도블록', isPenaltyTrigger: true });
    });

    // 가지도로·출구도로 가장자리 연석 (잔디 이탈 방지)
    const edgeCurbs: [number, number, number, number][] = [
      [-39, 21.85, 54, 0.3],   // 가지도로 북연
      [-39, 38.15, 54, 0.3],   // 가지도로 남연
      [-86.85, 72, 52, 0.3],   // 출구도로 서연
      [-73.15, 72, 52, 0.3],   // 출구도로 동연
    ];
    edgeCurbs.forEach(([ex, ez, ew, ed]) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.2, ed), curbMat);
      c.position.set(ex, 0.1, ez);
      group.add(c);
      obstacles.push({ type: 'box', x: ex, z: ez, width: ew, depth: ed, name: '가지도로 연석', isPenaltyTrigger: true });
    });

    // ── 어린이보호구역 데칼 (z 60~100) ──
    const schoolZoneTex = RoadTextureGenerator.createSchoolZoneTexture();
    [95, 65].forEach((sz) => {
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 5),
        new THREE.MeshBasicMaterial({ map: schoolZoneTex, transparent: true })
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(6, 0.025, sz);
      group.add(decal);
    });

    // ── 서측 가지도로 (비보호 좌회전 진출, z∈[22,38], x -66~-12) ──
    const branch = new THREE.Mesh(new THREE.PlaneGeometry(54, 16), asphaltMat);
    branch.rotation.x = -Math.PI / 2;
    branch.position.set(-39, 0.01, 30);
    group.add(branch);

    // ── 북측 출구 도로 (회전교차로 → 목표, x∈[-87,-73]) ──
    const exitRoad = new THREE.Mesh(new THREE.PlaneGeometry(14, 52), asphaltMat);
    exitRoad.rotation.x = -Math.PI / 2;
    exitRoad.position.set(-80, 0.01, 72);
    group.add(exitRoad);

    // ── 정지선 + 횡단보도 ──
    const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.45), laneWhiteMat);
    stopLine.rotation.x = -Math.PI / 2;
    stopLine.position.set(5.5, 0.03, 36);
    group.add(stopLine);

    for (let sx = -10; sx <= 10; sx += 2.5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.6), laneWhiteMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx, 0.03, 41.5);
      group.add(stripe);
    }

    // ── 신호등 폴대 ×4 (NS/EW rig 각 1식) ──
    const mkSignal = (axis: 'NS' | 'EW', px: number, pz: number, rotY: number): TrafficSignalRig => {
      const poleG = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 10), guardrailMat);
      pole.position.y = 2.6;
      poleG.add(pole);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.35), new THREE.MeshStandardMaterial({ color: 0x111827 }));
      housing.position.y = 5.4;
      poleG.add(housing);
      const mkLamp = (color: number, ly: number) => {
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), mat);
        lamp.position.set(0, ly, 0.2);
        poleG.add(lamp);
        return mat;
      };
      const lamps = {
        red: mkLamp(0xff2222, 5.85),
        yellow: mkLamp(0xffcc00, 5.4),
        green: mkLamp(0x22dd44, 4.95),
      };
      poleG.position.set(px, 0, pz);
      poleG.rotation.y = rotY;
      group.add(poleG);
      return { axis, lamps };
    };

    // 상단에서 hoist된 signals 배열에 추가
    signals.push(
      mkSignal('NS', 13.0, 38.5, Math.PI),      // 남향 접근(우측 코너)
      mkSignal('EW', -13.0, 21.5, Math.PI / 2), // 서향 가지도로 접근
    );

    // ── 회전교차로 (중심 (-80,30)) ──
    const island = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.4, 32), grassMat);
    island.position.set(-80, 0.2, 30);
    group.add(island);
    obstacles.push({ type: 'cylinder', x: -80, z: 30, radius: 6, name: '회전교차로 중앙섬', isPenaltyTrigger: true });

    const ring = new THREE.Mesh(new THREE.RingGeometry(6, 16, 48), asphaltMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-80, 0.01, 30);
    group.add(ring);

    // 가지도로/출구가 링과 만나는 구멍 메우기 (링 위 덧판)
    const joinW = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), asphaltMat);
    joinW.rotation.x = -Math.PI / 2;
    joinW.position.set(-71, 0.012, 30);
    group.add(joinW);
    const joinN = new THREE.Mesh(new THREE.PlaneGeometry(16, 22), asphaltMat);
    joinN.rotation.x = -Math.PI / 2;
    joinN.position.set(-80, 0.012, 37);
    group.add(joinN);

    // ── 주변 배경 ──
    for (let bz = 130; bz >= -130; bz -= 35) {
      createSkyscraper(-26, bz, 18, 22, 25 + Math.random() * 30);
      createSkyscraper(26, bz, 18, 22, 25 + Math.random() * 30);
      if (bz % 70 === 0) {
        createStreetLight(13, bz, true);
        createTree(-15, bz + 10);
        createTree(15, bz - 10);
      }
    }
    [[-39, 12], [-39, 48], [-95, 60], [-65, 60]].forEach(([tx, tz]) => createTree(tx, tz));

    // ── 온커밍 차량 (x<0 차로, +Z 방향) ──
    const oncomingCfg = [
      { x: -6, z: -60, speed: 48, color: 0x2563eb },
      { x: -2, z: -110, speed: 42, color: 0xdc2626 },
      { x: -6, z: -160, speed: 55, color: 0x059669 },
    ];
    oncomingCfg.forEach((cfg, idx) => {
      initialTraffic.push({
        id: `oncoming_${idx}`, x: cfg.x, z: cfg.z, speedKmH: cfg.speed,
        targetLane: 0, laneX: cfg.x, color: cfg.color, type: 'sedan',
        behavior: 'normal', isYielding: false, isHonking: false, isFlashingHighBeam: false,
        motion: 'oncoming',
      });
    });

    // ── 회전교차로 순환 차량 ──
    [0, Math.PI].forEach((angle, idx) => {
      initialTraffic.push({
        id: `orb_${idx}`, x: -80 + Math.cos(angle) * 11, z: 30 + Math.sin(angle) * 11,
        speedKmH: 25, targetLane: 0, laneX: -80, color: 0xd97706, type: 'suv',
        behavior: 'circulating', isYielding: false, isHonking: false, isFlashingHighBeam: false,
        motion: 'orbit',
        orbit: { cx: -80, cz: 30, radius: 11, angle, angularSpeed: 0.35, direction: 1 },
      });
    });
```

반환문은 Step 1에서 작성한 `signals`를 그대로 사용한다.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 통과 (SimulationCanvas가 아직 signals를 받지 않아도 반환값 무시는 허용)

- [ ] **Step 4: Commit**

```bash
git add src/components/3d/TrackBuilder.tsx
git commit -m "feat: city_traffic 종합주행 코스 지형(교차로/신호등/회전교차로)"
```

---

### Task 8: SimulationCanvas 통합 + uiRefs 버그 수정

**Files:**
- Modify: `src/components/3d/SimulationCanvas.tsx`

- [ ] **Step 1: uiRefs 패턴으로 deps 버그 수정**

컴포넌트 상단(effect 밖)에 추가:

```tsx
  const uiStateRef = useRef({ cameraMode, showTrajectory, showWidthGuide });
  uiStateRef.current = { cameraMode, showTrajectory, showWidthGuide };
```

effect deps 변경: `}, [vehicle, mission]);`

effect 내부 참조 교체 (animate 루프 안):
- `cameraMode === 'cockpit'` 등 4곳 → `uiStateRef.current.cameraMode`
- `trajectoryRenderer.update(vehicle, carState, showTrajectory || showWidthGuide)` → `trajectoryRenderer.update(vehicle, carState, uiStateRef.current.showTrajectory || uiStateRef.current.showWidthGuide)`

- [ ] **Step 2: props 및 임포트 확장**

```tsx
import { TrafficLightController } from '../../simulation/TrafficLightController';
import { MissionEvaluator } from '../../simulation/MissionEvaluator';
import { TrafficSignalRig } from './TrackBuilder';
```

(주의: `buildTrackScene, CollisionObstacle` 임포트는 기존 14번 줄에 이미 있음 — 새로 추가하지 말고 기존 줄에 `TrafficSignalRig`만 병합)

props 인터페이스에 추가:

```tsx
  onMissionFail: (reason: string) => void;
```

함수 인자 분해에 `onMissionFail,` 추가.

- [ ] **Step 3: 인스턴스 생성 (buildTrackScene 호출부 교체)**

```tsx
    const { trackGroup, obstacles, initialTraffic, signals } = buildTrackScene(mission);
    scene.add(trackGroup);

    const lightController = mission.id === 'city_traffic' ? new TrafficLightController() : null;
    const evaluator = new MissionEvaluator(mission);
```

- [ ] **Step 4: applyPenalty 리팩터 + triggerPenalty 정리**

기존 `triggerPenalty`를 두 함수로 교체:

```tsx
    const applyPenalty = (deduction: ScoreDeduction) => {
      scoreDeductionsRef.current.push(deduction);
      currentScoreRef.current = Math.max(0, currentScoreRef.current - deduction.points);
      sounds.playWarning();
      sounds.speakInstructor(`주의! ${deduction.reason}`);
      onPenalty(deduction);
    };

    const triggerPenalty = (reason: string, points: number) => {
      const now = performance.now();
      const existing = scoreDeductionsRef.current.find((d) => d.reason === reason && now - d.timestamp < 3000);
      if (existing) return;
      applyPenalty({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: now,
        reason,
        points,
      });
    };
```

- [ ] **Step 5: 트래픽 AI 모션 분기**

기존 `trafficMeshes.forEach(({ data: tv, ... }) => {...})` 루프 시작 부분에 분기 추가:

```tsx
        if (tv.motion === 'orbit' && tv.orbit) {
          tv.orbit.angle += tv.orbit.angularSpeed * tv.orbit.direction * delta;
          tv.x = tv.orbit.cx + Math.cos(tv.orbit.angle) * tv.orbit.radius;
          tv.z = tv.orbit.cz + Math.sin(tv.orbit.angle) * tv.orbit.radius;
          tvG.position.set(tv.x, 0, tv.z);
          tvG.rotation.y = -(tv.orbit.angle + (Math.PI / 2) * tv.orbit.direction);
          return; // yield/aggressive 응답 스킵
        }

        if (tv.motion === 'oncoming') {
          const tvSpeedMs = (tv.speedKmH * 1000) / 3600;
          tv.z += tvSpeedMs * delta;
          if (tv.z > 200) tv.z = -180 - Math.random() * 60;
          tvG.position.set(tv.x, 0, tv.z);
          tvG.rotation.y = Math.PI;
          return;
        }
```

(루프 끝의 공통 headlight/brakelight 처리는 orbit/oncoming은 return으로 건너뛰므로, 순환차량 브레이크등 등은 무시 — 수용 가능한 단순화)

- [ ] **Step 6: 인라인 깜빡이/미러 페널티 블록 제거 + evaluator 호출**

`// Lane Change Safety Check ...` 블록(SimulationCanvas.tsx:566-578)을 삭제하고, `// Mission Goal Check` 직전에 삽입:

```tsx
      // Mission Evaluation (objectives-driven)
      lightController?.update(delta);
      const evalResult = evaluator.evaluate({
        carState,
        traffic: trafficVehicles,
        lights: lightController,
      });
      evalResult.penalties.forEach(applyPenalty);

      if (evalResult.failReason && !isMissionFinishedRef.current) {
        isMissionFinishedRef.current = true;
        sounds.playWarning();
        sounds.speakInstructor(`미션 실패! ${evalResult.failReason}`);
        onMissionFail(evalResult.failReason);
      }

      // 신호등 램프 렌더링
      if (lightController) {
        signals.forEach((rig) => {
          const phase = lightController.getPhase(rig.axis);
          rig.lamps.red.emissiveIntensity = phase === 'red' ? 2.6 : 0.05;
          rig.lamps.yellow.emissiveIntensity = phase === 'yellow' ? 2.6 : 0.05;
          rig.lamps.green.emissiveIntensity = phase === 'green' ? 2.6 : 0.05;
        });
      }
```

- [ ] **Step 7: 빌드 + 전체 테스트**

Run: `npm run build && npm test`
Expected: 모두 통과

- [ ] **Step 8: Commit**

```bash
git add src/components/3d/SimulationCanvas.tsx
git commit -m "feat: MissionEvaluator/신호등 연결, UI토글 리셋 버그 수정"
```

---

### Task 9: App + FeedbackModal 실패 흐름

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ui/FeedbackModal.tsx`

- [ ] **Step 1: FeedbackModal에 failReason prop 추가**

인터페이스에 `failReason?: string;` 추가. 컴포넌트 내:

```tsx
  const isFailed = Boolean(failReason);
  const isPassed = score >= 70 && !isFailed;
```

Badge/Title 섹션 교체:

```tsx
          {isPassed ? (
            <Award className="w-12 h-12 text-emerald-400 animate-bounce" />
          ) : (
            <XCircle className="w-12 h-12 text-rose-500" />
          )}
...
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {isFailed ? '🚫 미션 실패' : isPassed ? '🎉 미션 완주 합격!' : '⚠️ 기준 점수 미달 (불합격)'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{mission.title}</p>
          {isFailed && (
            <p className="text-sm font-bold text-rose-400 mt-2">사유: {failReason}</p>
          )}
```

- [ ] **Step 2: App에 실패 상태 연결**

```tsx
  const [failReason, setFailReason] = useState<string | null>(null);

  const handleMissionFail = useCallback((reason: string) => {
    setFailReason(reason);
    setShowFeedbackModal(true);
  }, []);
```

`handleResetCar`에 `setFailReason(null);` 추가.

JSX: `<SimulationCanvas ... onMissionFail={handleMissionFail} />`,
`<FeedbackModal ... failReason={failReason ?? undefined} />`

- [ ] **Step 3: 빌드 + 전체 테스트**

Run: `npm run build && npm test`
Expected: 통과

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/ui/FeedbackModal.tsx
git commit -m "feat: 미션 즉시 실패 흐름(모달 사유 표시)"
```

---

### Task 10: 최종 검증

- [ ] **Step 1: 전체 테스트 + 빌드**

Run: `npm test && npm run build`
Expected: 전부 green

- [ ] **Step 2: 수동 브라우저 검증 (dev 서버)**

Run: `npm run dev` (포트 3000)

체크리스트:
1. C키(카메라)/T키(궤적선) 토글 시 위치·점수 유지되는지
2. 미션 7 선택 → 출발 → 학교구역 40km/h 통과 시 감점 토스트
3. 적색 신호에 교차로 진입 시 실패 모달 + 사유 표시
4. 녹색에 진입 → 좌회전(온커밍 접근 중이면 감점) → 가지도로 → 회전교차로 통과 → 목표(-80, 90) 완주 모달
5. 미션 1에서 aggressive 차량 접근 중 차로 진입 시 감점

- [ ] **Step 3: 최종 Commit (있다면)**

```bash
git status
# 변경분 있으면 커밋
```

---

## 성공 기준 (스펙 §10 대응)

1. 미션 7 실제 완주 가능 (출발→학교구역→신호→좌회전→회전교차로→목표)
2. 적색 신호 통과 시 즉시 실패 모달
3. 학교구역 초과속도 감점 동작
4. C/T키 토글 리셋 없음
5. `npm test` + `npm run build` green
