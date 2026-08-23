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
