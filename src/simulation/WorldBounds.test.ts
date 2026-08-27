import { describe, expect, it, vi } from 'vitest';
import { MISSIONS } from '../constants/missions';
import type { CarState } from '../types/simulator';
import { isOutsideWorldBounds, resetIfOutsideWorldBounds } from './WorldBounds';

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

    expect(resetIfOutsideWorldBounds({ ...baseCarState, z: -490.01 }, onReset)).toBe(true);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('지면 경계 안이면 리셋하지 않는다', () => {
    const onReset = vi.fn();

    expect(resetIfOutsideWorldBounds({ ...baseCarState, z: -489 }, onReset)).toBe(false);
    expect(onReset).not.toHaveBeenCalled();
  });

  it.each(MISSIONS)('$id 임무 출발점은 지면 경계 안에 있다', (mission) => {
    const [x, y, z] = mission.startPos;

    expect(isOutsideWorldBounds({ ...baseCarState, x, y, z })).toBe(false);
  });
});
