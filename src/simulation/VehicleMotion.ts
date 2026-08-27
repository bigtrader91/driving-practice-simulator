import type { GearMode, VehicleConfig } from '../types/simulator';

export interface LongitudinalMotionInput {
  speedMs: number;
  gear: GearMode;
  accelerator: boolean;
  brake: boolean;
  handbrake: boolean;
  deltaSeconds: number;
  vehicle: VehicleConfig;
}

export interface LongitudinalMotionResult {
  speedMs: number;
  isAccelerating: boolean;
  isBraking: boolean;
}

export interface VehiclePose {
  x: number;
  z: number;
  heading: number;
}

export const advanceVehiclePose = (
  pose: VehiclePose,
  speedMs: number,
  steerAngle: number,
  deltaSeconds: number,
  wheelBase: number
): VehiclePose => {
  const moveDistance = speedMs * Math.max(0, deltaSeconds);
  const nextPose = {
    x: pose.x - Math.sin(pose.heading) * moveDistance,
    z: pose.z - Math.cos(pose.heading) * moveDistance,
    heading: pose.heading,
  };

  if (Math.abs(steerAngle) > 0.001) {
    nextPose.heading -= (moveDistance / wheelBase) * Math.tan(steerAngle);
  }

  return nextPose;
};

const moveTowardZero = (speedMs: number, amount: number): number => {
  if (speedMs > 0) return Math.max(0, speedMs - amount);
  if (speedMs < 0) return Math.min(0, speedMs + amount);
  return 0;
};

export const updateLongitudinalMotion = ({
  speedMs,
  gear,
  accelerator,
  brake,
  handbrake,
  deltaSeconds,
  vehicle,
}: LongitudinalMotionInput): LongitudinalMotionResult => {
  const delta = Math.max(0, deltaSeconds);
  const isDrivingGear = gear === 'D' || gear === 'R';
  const isBraking = brake || handbrake;
  const isAccelerating = accelerator && !isBraking && isDrivingGear;

  if (gear === 'P' || gear === 'N' || handbrake) {
    speedMs = moveTowardZero(speedMs, Math.abs(speedMs) * Math.min(1, 8 * delta));
  } else if (brake) {
    speedMs = moveTowardZero(speedMs, vehicle.brakingPower * delta);
  } else if (gear === 'D') {
    if (accelerator) {
      const targetSpeedMs = (vehicle.maxSpeed * 1000) / 3600;
      speedMs = Math.min(targetSpeedMs, speedMs + vehicle.acceleration * delta);
    } else {
      const creepSpeed = 1.8;
      speedMs = speedMs > creepSpeed
        ? speedMs - Math.min(speedMs - creepSpeed, 2 * delta)
        : Math.min(creepSpeed, speedMs + 0.8 * delta);
    }
  } else if (gear === 'R') {
    if (accelerator) {
      const targetReverseMs = (vehicle.reverseMaxSpeed * 1000) / 3600;
      speedMs = Math.max(-targetReverseMs, speedMs - vehicle.acceleration * 0.7 * delta);
    } else {
      const creepSpeed = -1.2;
      speedMs = speedMs < creepSpeed
        ? speedMs + Math.min(creepSpeed - speedMs, 2 * delta)
        : Math.max(creepSpeed, speedMs - 0.8 * delta);
    }
  }

  return { speedMs, isAccelerating, isBraking };
};
