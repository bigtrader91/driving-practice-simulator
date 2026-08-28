import type { ControlInputs } from '../types/simulator';

type MobileControl =
  | 'forward'
  | 'backward'
  | 'steerLeft'
  | 'steerRight'
  | 'lookLeft'
  | 'lookRear'
  | 'lookRight';

export const setMobileControl = (
  inputs: ControlInputs,
  control: MobileControl,
  active: boolean
): void => {
  inputs[control] = active;
  if (active && (control === 'steerLeft' || control === 'steerRight')) {
    inputs.isMouseSteeringActive = false;
  }
};

export const releaseTransientInputs = (
  inputs: ControlInputs,
  resetPointerSteering = false,
): void => {
  inputs.forward = false;
  inputs.backward = false;
  inputs.steerLeft = false;
  inputs.steerRight = false;
  inputs.handbrake = false;
  inputs.lookLeft = false;
  inputs.lookRight = false;
  inputs.lookRear = false;
  inputs.signalLeft = false;
  inputs.signalRight = false;
  inputs.hazard = false;
  inputs.gearP = false;
  inputs.gearR = false;
  inputs.gearN = false;
  inputs.gearD = false;
  inputs.horn = false;
  inputs.toggleView = false;
  inputs.toggleTrajectory = false;
  inputs.toggleWidthGuide = false;
  inputs.resetPosition = false;
  if (resetPointerSteering) {
    inputs.mouseSteerRatio = 0;
    inputs.isMouseSteeringActive = true;
  }
};
