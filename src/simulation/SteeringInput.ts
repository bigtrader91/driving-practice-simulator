export const accumulatePointerSteering = (
  currentDegrees: number,
  previousPointerAngle: number,
  nextPointerAngle: number,
  maxDegrees = 540
): number => {
  const deltaDegrees = ((nextPointerAngle - previousPointerAngle + 540) % 360) - 180;
  return Math.max(-maxDegrees, Math.min(maxDegrees, currentDegrees + deltaDegrees));
};

export interface PointerTargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const getPointerAngleDegrees = (
  clientX: number,
  clientY: number,
  rect: PointerTargetRect,
  deadZoneRatio = 0.2
): number | null => {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const offsetX = clientX - centerX;
  const offsetY = clientY - centerY;
  const radius = Math.hypot(offsetX, offsetY);
  const deadZoneRadius = Math.min(rect.width, rect.height) * deadZoneRatio;
  if (radius < deadZoneRadius) return null;
  return Math.atan2(offsetY, offsetX) * (180 / Math.PI);
};

export interface PointerSteeringState {
  currentDegrees: number;
  previousPointerAngle: number;
  needsRebaseline: boolean;
}

export const updatePointerSteering = (
  state: PointerSteeringState,
  nextPointerAngle: number | null
): PointerSteeringState => {
  if (nextPointerAngle === null) {
    return { ...state, needsRebaseline: true };
  }
  if (state.needsRebaseline) {
    return {
      currentDegrees: state.currentDegrees,
      previousPointerAngle: nextPointerAngle,
      needsRebaseline: false,
    };
  }
  return {
    currentDegrees: accumulatePointerSteering(
      state.currentDegrees,
      state.previousPointerAngle,
      nextPointerAngle
    ),
    previousPointerAngle: nextPointerAngle,
    needsRebaseline: false,
  };
};

export const updateKeyboardSteeringRatio = (
  currentRatio: number,
  steerLeft: boolean,
  steerRight: boolean,
  isPointerSteeringActive: boolean,
  deltaSeconds: number
): number => {
  const step = Math.max(0, deltaSeconds);
  if (steerLeft !== steerRight) {
    const direction = steerRight ? 1 : -1;
    return Math.max(-1, Math.min(1, currentRatio + direction * step));
  }

  if (isPointerSteeringActive) return currentRatio;

  const returnStep = 1.5 * step;
  if (Math.abs(currentRatio) <= returnStep) return 0;
  return currentRatio - Math.sign(currentRatio) * returnStep;
};
