import { describe, expect, it } from 'vitest';
import type { ControlInputs } from '../types/simulator';
import { releaseTransientInputs, setMobileControl } from './InputSafety';

const createInputs = (): ControlInputs => ({
  forward: true,
  backward: true,
  steerLeft: true,
  steerRight: true,
  handbrake: true,
  lookLeft: true,
  lookRight: true,
  lookRear: true,
  signalLeft: true,
  signalRight: true,
  hazard: true,
  gearP: true,
  gearR: true,
  gearN: true,
  gearD: true,
  horn: true,
  toggleView: true,
  toggleTrajectory: true,
  toggleWidthGuide: true,
  resetPosition: true,
  mouseYaw: 0,
  mousePitch: 0,
  mouseSteerRatio: 0.5,
  isMouseSteeringActive: true,
});

describe('input safety', () => {
  it('모바일 조향 시작 시 포인터 고정 모드를 해제한다', () => {
    const inputs = createInputs();
    setMobileControl(inputs, 'steerLeft', true);

    expect(inputs.steerLeft).toBe(true);
    expect(inputs.isMouseSteeringActive).toBe(false);
  });

  it('포커스를 잃으면 모든 순간 입력을 해제한다', () => {
    const inputs = createInputs();
    releaseTransientInputs(inputs);

    expect(inputs).toMatchObject({
      forward: false,
      backward: false,
      steerLeft: false,
      steerRight: false,
      handbrake: false,
      lookLeft: false,
      lookRight: false,
      lookRear: false,
      signalLeft: false,
      signalRight: false,
      hazard: false,
      gearP: false,
      gearR: false,
      gearN: false,
      gearD: false,
      horn: false,
      toggleView: false,
      toggleTrajectory: false,
      toggleWidthGuide: false,
      resetPosition: false,
    });
    expect(inputs.mouseSteerRatio).toBe(0.5);
  });

  it.each(['lookLeft', 'lookRear', 'lookRight'] as const)(
    '모바일 %s 미러 확인은 누르는 동안만 활성화한다',
    (control) => {
      const inputs = createInputs();
      inputs[control] = false;

      setMobileControl(inputs, control, true);
      expect(inputs[control]).toBe(true);

      setMobileControl(inputs, control, false);
      expect(inputs[control]).toBe(false);
    },
  );

  it('차량 재시작은 hold 입력과 포인터 조향 상태를 함께 초기화한다', () => {
    const inputs = createInputs();
    inputs.isMouseSteeringActive = false;

    releaseTransientInputs(inputs, true);

    expect(inputs.forward).toBe(false);
    expect(inputs.lookLeft).toBe(false);
    expect(inputs.mouseSteerRatio).toBe(0);
    expect(inputs.isMouseSteeringActive).toBe(true);
  });
});
