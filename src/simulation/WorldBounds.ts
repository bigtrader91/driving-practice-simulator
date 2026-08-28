import type { CarState } from '../types/simulator';

const WORLD_RESET_HALF_EXTENT = 490;
const MIN_RECOVERABLE_HEIGHT = -2;
const MAX_RECOVERABLE_HEIGHT = 10;
const MAX_RECOVERABLE_TILT = 75 * Math.PI / 180;

export interface VehicleOrientation {
  pitch: number;
  roll: number;
}

export const isOutsideWorldBounds = (
  carState: CarState,
  halfExtent = WORLD_RESET_HALF_EXTENT
): boolean => Math.abs(carState.x) > halfExtent || Math.abs(carState.z) > halfExtent;

export const isVehiclePoseUnrecoverable = (
  carState: CarState,
  orientation: VehicleOrientation,
  halfExtent = WORLD_RESET_HALF_EXTENT,
): boolean => {
  const values = [
    carState.x,
    carState.y,
    carState.z,
    carState.heading,
    orientation.pitch,
    orientation.roll,
  ];
  if (!values.every(Number.isFinite)) return true;
  if (isOutsideWorldBounds(carState, halfExtent)) return true;
  if (carState.y < MIN_RECOVERABLE_HEIGHT || carState.y > MAX_RECOVERABLE_HEIGHT) return true;
  return Math.abs(orientation.pitch) >= MAX_RECOVERABLE_TILT
    || Math.abs(orientation.roll) >= MAX_RECOVERABLE_TILT;
};

export const resetIfVehiclePoseUnrecoverable = (
  carState: CarState,
  orientation: VehicleOrientation,
  onReset: () => void,
  halfExtent = WORLD_RESET_HALF_EXTENT
): boolean => {
  if (!isVehiclePoseUnrecoverable(carState, orientation, halfExtent)) return false;

  onReset();
  return true;
};
