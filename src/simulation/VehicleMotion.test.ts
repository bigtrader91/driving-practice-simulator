import { describe, expect, it } from 'vitest';
import { VEHICLES } from '../constants/vehicles';
import { advanceVehiclePose, updateLongitudinalMotion } from './VehicleMotion';

const update = (
  gear: 'D' | 'R',
  accelerator: boolean,
  brake: boolean,
  speedMs = 0,
  deltaSeconds = 0.5
) => updateLongitudinalMotion({
  speedMs,
  gear,
  accelerator,
  brake,
  handbrake: false,
  deltaSeconds,
  vehicle: VEHICLES.sedan,
});

describe('advanceVehiclePose reverse steering contract', () => {
  it('우조향 후진은 차체를 180도 돌리지 않고 반대 yaw로 이동한다', () => {
    const forward = advanceVehiclePose({ x: 0, z: 0, heading: 0 }, 2, 0.2, 0.5, 2.6);
    const reverse = advanceVehiclePose({ x: 0, z: 0, heading: 0 }, -2, 0.2, 0.5, 2.6);

    expect(forward.z).toBeLessThan(0);
    expect(forward.heading).toBeLessThan(0);
    expect(reverse.z).toBeGreaterThan(0);
    expect(reverse.heading).toBeGreaterThan(0);
    expect(Math.abs(reverse.heading)).toBeLessThan(Math.PI / 2);
  });
});

describe('updateLongitudinalMotion pedal contract', () => {
  it('W 가속 입력은 D에서 전진하고 R에서 후진한다', () => {
    expect(update('D', true, false).speedMs).toBeGreaterThan(0);
    expect(update('R', true, false).speedMs).toBeLessThan(0);
  });

  it('S 브레이크 입력은 R에서도 후진 속도를 0 쪽으로 줄인다', () => {
    const result = update('R', false, true, -3);

    expect(result.speedMs).toBeGreaterThan(-3);
    expect(result.speedMs).toBeLessThanOrEqual(0);
    expect(result.isBraking).toBe(true);
    expect(result.isAccelerating).toBe(false);
  });

  it('정지 상태에서 S를 눌러도 R 차량이 움직이지 않는다', () => {
    expect(update('R', false, true).speedMs).toBe(0);
  });

  it('가속과 브레이크가 동시에 눌리면 브레이크를 우선한다', () => {
    const result = update('D', true, true, 5);

    expect(result.speedMs).toBeLessThan(5);
    expect(result.isBraking).toBe(true);
    expect(result.isAccelerating).toBe(false);
  });
});
