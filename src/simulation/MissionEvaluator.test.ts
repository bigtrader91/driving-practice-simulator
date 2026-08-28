import { describe, it, expect } from 'vitest';
import { MissionEvaluator } from './MissionEvaluator';
import { TrafficLightController } from './TrafficLightController';
import { CarState, Mission } from '../types/simulator';
import { MISSIONS } from '../constants/missions';

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
  const laneChangeMission = makeMission({
    objectives: [
      { id: 'signal_check', text: '차선 변경 3초 전 깜빡이 켜기', isCompleted: false, isMandatory: false, scorePenalty: 25 },
      { id: 'shoulder_check', text: '사각지대 숄더체크 & 사이드미러 확인', isCompleted: false, isMandatory: false, scorePenalty: 20 },
    ],
  });

  it('차선변경 objective의 scorePenalty로 감점한다', () => {
    const ev = new MissionEvaluator(laneChangeMission, () => 0);
    const r = ev.evaluate({
      carState: makeCar({ speed: 30, speedMs: 8.3, steerAngle: -0.2 }),
      traffic: [], lights: null,
    });
    expect(r.penalties.map((p) => p.points)).toEqual([25, 20]);
    expect(r.penalties[0].reason).toContain('깜빡이');
    expect(r.attemptEvents).toEqual([
      expect.objectContaining({ type: 'procedure-omission', code: 'signal' }),
      expect.objectContaining({ type: 'procedure-omission', code: 'blind-spot' }),
    ]);
  });

  it('정지 상태 조향은 감점하지 않는다', () => {
    const ev = new MissionEvaluator(laneChangeMission, () => 0);
    const r = ev.evaluate({
      carState: makeCar({ speed: 5, speedMs: 1.4, steerAngle: -0.2 }),
      traffic: [], lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });

  it('차선변경 objective가 없는 미션은 조향만으로 감점하지 않는다', () => {
    const ev = new MissionEvaluator(makeMission({ objectives: [] }), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ speed: 30, speedMs: 8.3, steerAngle: -0.2 }),
      traffic: [], lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });
});

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
  const highwayMission = MISSIONS.find((mission) => mission.id === 'highway_5lane')!;
  const aggressive = {
    id: 'traffic_1', x: 5.4, z: 175, speedKmH: 70, targetLane: 4, laneX: 5.4,
    color: 0xff0000, type: 'suv' as const, behavior: 'aggressive' as const,
    isYielding: false, isHonking: false, isFlashingHighBeam: false,
  };

  it('실제 시작 상태에서는 차선 변경 전 자동 감점하지 않는다', () => {
    const ev = new MissionEvaluator(highwayMission, () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 8, z: 160, speed: 60, speedMs: 16 }),
      traffic: [aggressive],
      lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });

  it('aggressive 차량이 간격을 좁힐 때 해당 차로로 진입하면 감점', () => {
    let clock = 0;
    const ev = new MissionEvaluator(highwayMission, () => clock);
    ev.evaluate({
      carState: makeCar({ x: 8, z: 160, speed: 60, speedMs: 16 }),
      traffic: [aggressive],
      lights: null,
    });
    clock = 100;
    const r = ev.evaluate({
      carState: makeCar({ x: 5.4, z: 150, speed: 60, speedMs: 16 }),
      traffic: [{ ...aggressive, z: 164 }],
      lights: null,
    });
    expect(r.penalties).toHaveLength(1);
    expect(r.penalties[0].points).toBe(30);
  });

  it('aggressive 차량과의 간격이 넓어지는 차로 진입은 무감점', () => {
    const ev = new MissionEvaluator(highwayMission, () => 0);
    ev.evaluate({
      carState: makeCar({ x: 8, z: 160, speed: 60, speedMs: 16 }),
      traffic: [aggressive],
      lights: null,
    });
    const r = ev.evaluate({
      carState: makeCar({ x: 5.4, z: 150, speed: 60, speedMs: 16 }),
      traffic: [{ ...aggressive, z: 166 }],
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
    motion: 'oncoming' as const,
  });

  it('정지해 좌회전 양보 중이면 감점하지 않는다', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: 2, z: 28, turnSignal: 'left', speed: 0, speedMs: 0 }),
      traffic: [oncoming(-6, 20)],
      lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });

  it('온커밍 30m 내에서 좌회전 경로로 움직여 진입하면 감점', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    ev.evaluate({
      carState: makeCar({ x: 2, z: 28, turnSignal: 'left', speed: 0, speedMs: 0 }),
      traffic: [oncoming(-6, 20)],
      lights: null,
    });
    const r = ev.evaluate({
      carState: makeCar({ x: -1, z: 28, turnSignal: 'left', speed: 15, speedMs: 4.2 }),
      traffic: [oncoming(-6, 22)],
      lights: null,
    });
    expect(r.penalties.some((p) => p.points === 15)).toBe(true);
  });

  it('온커밍 없이 좌회전하면 무감점', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const r = ev.evaluate({
      carState: makeCar({ x: -1, z: 28, turnSignal: 'left', speed: 15, speedMs: 4.2 }),
      traffic: [],
      lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });

  it('회전교차로 진입 전에 정지해 양보 중이면 감점하지 않는다', () => {
    const ev = new MissionEvaluator(makeMission(), () => 0);
    const circulating = {
      id: 'orb1', x: -70, z: 34, speedKmH: 25, targetLane: 0, laneX: -70,
      color: 0x00ff00, type: 'sedan' as const, behavior: 'circulating' as const,
      isYielding: false, isHonking: false, isFlashingHighBeam: false,
    };
    const r = ev.evaluate({
      carState: makeCar({ x: -62, z: 30, speed: 0, speedMs: 0 }),
      traffic: [circulating],
      lights: null,
    });
    expect(r.penalties).toHaveLength(0);
  });

  it('순환 차량 15m 내에서 회전교차로로 움직여 진입하면 1회 감점', () => {
    let clock = 0;
    const ev = new MissionEvaluator(makeMission(), () => clock);
    const circulating = {
      id: 'orb1', x: -70, z: 34, speedKmH: 25, targetLane: 0, laneX: -70,
      color: 0x00ff00, type: 'sedan' as const, behavior: 'circulating' as const,
      isYielding: false, isHonking: false, isFlashingHighBeam: false,
    };
    ev.evaluate({
      carState: makeCar({ x: -62, z: 30, speed: 0, speedMs: 0 }),
      traffic: [circulating],
      lights: null,
    });
    const entering = {
      carState: makeCar({ x: -65, z: 30, speed: 12, speedMs: 3.3 }),
      traffic: [circulating],
      lights: null,
    };
    const r = ev.evaluate(entering);
    expect(r.penalties).toHaveLength(1);
    expect(r.penalties[0].reason).toContain('회전교차로');
    clock = 6000;
    expect(ev.evaluate(entering).penalties).toHaveLength(0);
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
