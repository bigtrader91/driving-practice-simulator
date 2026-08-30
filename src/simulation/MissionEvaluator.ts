import {
  CarState,
  Mission,
  MissionZone,
  ScoreDeduction,
  TrafficVehicleData,
} from '../types/simulator';
import { TrafficLightController } from './TrafficLightController';
import { AttemptEvent, ProcedureOmissionCode } from './AttemptAssessment';

export interface EvalContext {
  carState: CarState;
  traffic: TrafficVehicleData[];
  lights: TrafficLightController | null;
}

export interface EvalResult {
  penalties: ScoreDeduction[];
  attemptEvents: AttemptEvent[];
  failReason?: string;
}

const THROTTLE_MS = 3000;
const MIRROR_CHECK_VALID_MS = 5000;
const HIGHWAY_LANE_WIDTH = 3.6;

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
  private processedEntries = new Set<string>();
  private rearGaps = new Map<string, number>();
  private currentLane?: number;
  private lastLeftMirrorCheckAt?: number;
  private lastRightMirrorCheckAt?: number;
  private failed = false;
  private failMessage?: string;
  private seq = 0;
  private pending: ScoreDeduction[] = [];
  private pendingEvents: AttemptEvent[] = [];

  constructor(
    private readonly mission: Mission,
    private readonly now: () => number = () => performance.now(),
  ) {}

  evaluate(ctx: EvalContext): EvalResult {
    this.pending = [];
    this.pendingEvents = [];
    const { carState: car } = ctx;

    this.checkSignalAndMirror(car);
    this.checkSchoolZones(car);
    this.checkStopAtRed(ctx);
    this.checkYieldOnMerge(ctx);
    this.checkUnprotectedLeft(ctx);
    this.checkRoundaboutYield(ctx);

    return {
      penalties: this.pending,
      attemptEvents: this.pendingEvents,
      failReason: this.failed ? this.failMessage : undefined,
    };
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
    const omissionCodes: Partial<Record<string, ProcedureOmissionCode>> = {
      signal_check: 'signal',
      signal_before_change: 'signal',
      mirror_check: 'mirror',
      shoulder_check: 'blind-spot',
      speed_check: 'speed',
    };
    const omissionCode = omissionCodes[objectiveId];
    if (omissionCode) {
      this.pendingEvents.push({
        type: 'procedure-omission',
        code: omissionCode,
        message: obj.text,
      });
    }
  }

  /** 기존 SimulationCanvas 판정 조건을 이관하고 미션별 objective 감점을 적용한다. */
  private checkSignalAndMirror(car: CarState): void {
    const checkedAt = this.now();
    if (car.leftMirrorLooked) this.lastLeftMirrorCheckAt = checkedAt;
    if (car.rightMirrorLooked) this.lastRightMirrorCheckAt = checkedAt;
    if (!(Math.abs(car.steerAngle) > 0.12 && Math.abs(car.speed) > 15)) return;
    const left = car.steerAngle < 0;
    const correctSignal = left ? car.turnSignal === 'left' : car.turnSignal === 'right';
    const lastMirrorCheckAt = left ? this.lastLeftMirrorCheckAt : this.lastRightMirrorCheckAt;
    const mirrorCheckAge = lastMirrorCheckAt === undefined ? Infinity : checkedAt - lastMirrorCheckAt;
    const correctMirror = mirrorCheckAge >= 0 && mirrorCheckAge <= MIRROR_CHECK_VALID_MS;
    const signalObjectiveId = ['signal_check', 'signal_before_change'].find((id) =>
      this.mission.objectives.some((objective) => objective.id === id),
    );
    const mirrorObjectiveId = ['shoulder_check', 'mirror_check'].find((id) =>
      this.mission.objectives.some((objective) => objective.id === id),
    );
    if (!correctSignal && signalObjectiveId) {
      this.raise(signalObjectiveId, signalObjectiveId);
    }
    if (!correctMirror && mirrorObjectiveId) {
      this.raise(mirrorObjectiveId, mirrorObjectiveId);
    }
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
    const laneCount = this.mission.laneCount;
    if (!laneCount) return;
    const lane = Math.max(
      0,
      Math.min(laneCount - 1, Math.round(car.x / HIGHWAY_LANE_WIDTH + (laneCount - 1) / 2)),
    );
    const previousLane = this.currentLane;
    this.currentLane = lane;

    const currentGaps = new Map(ctx.traffic.map((tv) => [tv.id, tv.z - car.z]));
    if (previousLane === undefined || lane === previousLane || car.speedMs <= 3) {
      this.rearGaps = currentGaps;
      return;
    }

    const risky = ctx.traffic.some(
      (tv) => {
        const gap = currentGaps.get(tv.id)!;
        const previousGap = this.rearGaps.get(tv.id);
        return (
          tv.behavior === 'aggressive' &&
          tv.targetLane === lane &&
          gap > 0 &&
          gap < 25 &&
          previousGap !== undefined &&
          gap < previousGap
        );
      },
    );
    this.rearGaps = currentGaps;
    if (risky) this.raise('yield_check', 'yield_check');
  }

  private checkUnprotectedLeft(ctx: EvalContext): void {
    const inter = (this.mission.zones ?? []).find((z) => z.type === 'intersection');
    if (!inter) return;
    const car = ctx.carState;
    const inside = inBounds(car.x, car.z, inter.bounds);
    const key = 'unprotected_left_entry';
    if (!inside) {
      this.processedEntries.delete(key);
      return;
    }
    if (car.speedMs <= 1 || car.x >= inter.bounds.x || this.processedEntries.has(key)) return;
    this.processedEntries.add(key);
    const oncomingClose = ctx.traffic.some(
      (tv) =>
        tv.motion === 'oncoming' &&
        tv.z < car.z &&
        Math.hypot(tv.x - car.x, tv.z - car.z) < 30,
    );
    if (oncomingClose) this.raise('unprotected_left', key, 1);
  }

  private checkRoundaboutYield(ctx: EvalContext): void {
    const rb = (this.mission.zones ?? []).find((z) => z.type === 'roundabout');
    if (!rb) return;
    const car = ctx.carState;
    const key = 'roundabout_entry';
    if (!inBounds(car.x, car.z, rb.bounds)) {
      this.processedEntries.delete(key);
      return;
    }
    const entryX = rb.bounds.x + rb.bounds.width / 3;
    if (car.speedMs <= 1 || car.x >= entryX || this.processedEntries.has(key)) return;
    this.processedEntries.add(key);
    const circulatingNear = ctx.traffic.some(
      (tv) =>
        tv.behavior === 'circulating' &&
        Math.hypot(tv.x - car.x, tv.z - car.z) < 15,
    );
    if (circulatingNear) this.raise('roundabout_yield', key, 1);
  }
}
