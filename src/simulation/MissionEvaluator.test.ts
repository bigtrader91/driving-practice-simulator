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
