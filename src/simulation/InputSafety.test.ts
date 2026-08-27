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
});
