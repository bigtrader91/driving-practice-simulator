import { describe, expect, it } from 'vitest';
import {
  accumulatePointerSteering,
  getPointerAngleDegrees,
  updatePointerSteering,
  updateKeyboardSteeringRatio,
} from './SteeringInput';

describe('accumulatePointerSteering', () => {
  it('포인터가 180도 경계를 지나도 360도 이상 회전을 누적한다', () => {
    expect(accumulatePointerSteering(350, 170, -170)).toBe(370);
  });

  it('반대 방향으로 180도 경계를 지나면 누적 각도를 줄인다', () => {
    expect(accumulatePointerSteering(-350, -170, 170)).toBe(-370);
  });

  it('핸들 회전을 좌우 540도로 제한한다', () => {
    expect(accumulatePointerSteering(530, 170, -170)).toBe(540);
    expect(accumulatePointerSteering(-530, -170, 170)).toBe(-540);
  });

  it('540도까지 감은 뒤 같은 궤적으로 0도까지 연속 복귀한다', () => {
    const clockwise = [90, 180, -90, 0, 90, 180];
    const counterClockwise = [90, 0, -90, 180, 90, 0];
    let degrees = 0;
    let previous = 0;

    for (const next of clockwise) {
      degrees = accumulatePointerSteering(degrees, previous, next);
      previous = next;
    }
    expect(degrees).toBe(540);

    for (const next of counterClockwise) {
      degrees = accumulatePointerSteering(degrees, previous, next);
      previous = next;
    }
    expect(degrees).toBe(0);
  });
});

describe('getPointerAngleDegrees', () => {
  const rect = { left: 0, top: 0, width: 200, height: 200 };

  it('핸들 중심 데드존의 포인터는 무시한다', () => {
    expect(getPointerAngleDegrees(101, 100, rect)).toBeNull();
  });

  it('핸들 림의 포인터 각도를 계산한다', () => {
    expect(getPointerAngleDegrees(200, 100, rect)).toBe(0);
  });
});

describe('updatePointerSteering', () => {
  it('드래그 중 중심 데드존을 통과하면 반대편 각도로 재기준화한다', () => {
    const beforeCenter = {
      currentDegrees: 120,
      previousPointerAngle: 0,
      needsRebaseline: false,
    };
    const inCenter = updatePointerSteering(beforeCenter, null);
    const afterCenter = updatePointerSteering(inCenter, 180);
    const continued = updatePointerSteering(afterCenter, -170);

    expect(inCenter).toMatchObject({ currentDegrees: 120, needsRebaseline: true });
    expect(afterCenter).toEqual({
      currentDegrees: 120,
      previousPointerAngle: 180,
      needsRebaseline: false,
    });
    expect(continued.currentDegrees).toBe(130);
  });
});

describe('updateKeyboardSteeringRatio', () => {
  it('오른쪽 키를 누르면 조향비를 양수 방향으로 누적한다', () => {
    expect(updateKeyboardSteeringRatio(0, false, true, false, 0.25)).toBeCloseTo(0.25, 10);
  });

  it('키를 놓으면 키보드 조향만 중앙으로 복귀하고 0을 넘지 않는다', () => {
    expect(updateKeyboardSteeringRatio(0.6, false, false, false, 0.2)).toBeCloseTo(0.3, 10);
    expect(updateKeyboardSteeringRatio(-0.1, false, false, false, 0.2)).toBe(0);
  });

  it('포인터로 맞춘 핸들 각도는 키를 놓아도 유지한다', () => {
    expect(updateKeyboardSteeringRatio(0.6, false, false, true, 0.2)).toBe(0.6);
  });
});
