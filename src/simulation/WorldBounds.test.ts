import { describe, expect, it, vi } from 'vitest';
import { MISSIONS } from '../constants/missions';
import type { CarState } from '../types/simulator';
import {
  isOutsideWorldBounds,
  isVehiclePoseUnrecoverable,
  resetIfVehiclePoseUnrecoverable,
} from './WorldBounds';

const baseCarState: CarState = {
  x: 8,
  y: 0,
  z: 160,
  speed: 0,
  speedMs: 0,
  steerAngle: 0,
  steeringWheelAngle: 0,
  steeringWheelTurns: 0,
  steeringWheelDegrees: 0,
  heading: 0,
  gear: 'D',
  isBraking: false,
  isAccelerating: false,
  isHandbrake: false,
  turnSignal: 'none',
  headlights: true,
  leftMirrorLooked: false,
  rightMirrorLooked: false,
  rearMirrorLooked: false,
  lastMirrorCheckTime: 0,
  inCollision: false,
  rpm: 800,
  odometer: 0,
};

describe('isOutsideWorldBounds', () => {
  it('유한 지면 밖이면 리셋 콜백을 한 번 호출한다', () => {
    const onReset = vi.fn();

    expect(resetIfVehiclePoseUnrecoverable(
      { ...baseCarState, z: -490.01 },
      { pitch: 0, roll: 0 },
      onReset,
    )).toBe(true);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('지면 경계 안이면 리셋하지 않는다', () => {
    const onReset = vi.fn();

    expect(resetIfVehiclePoseUnrecoverable(
      { ...baseCarState, z: -489 },
      { pitch: 0, roll: 0 },
      onReset,
    )).toBe(false);
    expect(onReset).not.toHaveBeenCalled();
  });

  it.each(MISSIONS)('$id 임무 출발점은 지면 경계 안에 있다', (mission) => {
    const [x, y, z] = mission.startPos;

    expect(isOutsideWorldBounds({ ...baseCarState, x, y, z })).toBe(false);
  });
});

describe('isVehiclePoseUnrecoverable', () => {
  it.each([
    { pitch: Math.PI / 2, roll: 0 },
    { pitch: 0, roll: -Math.PI / 2 },
  ])('차량이 옆이나 앞뒤로 뒤집히면 복구 대상으로 판정한다: %o', (orientation) => {
    expect(isVehiclePoseUnrecoverable(baseCarState, orientation)).toBe(true);
  });

  it('정상적인 차체 흔들림은 복구하지 않는다', () => {
    expect(isVehiclePoseUnrecoverable(
      baseCarState,
      { pitch: 15 * Math.PI / 180, roll: -20 * Math.PI / 180 },
    )).toBe(false);
  });

  it.each([
    { ...baseCarState, x: Number.NaN },
    { ...baseCarState, heading: Number.POSITIVE_INFINITY },
    { ...baseCarState, y: -3 },
  ])('수치가 깨졌거나 도로 아래로 추락한 자세도 복구한다', (state) => {
    expect(isVehiclePoseUnrecoverable(state, { pitch: 0, roll: 0 })).toBe(true);
  });
});
