import type { CarState } from '../types/simulator';

const WORLD_RESET_HALF_EXTENT = 490;

export const isOutsideWorldBounds = (
  carState: CarState,
  halfExtent = WORLD_RESET_HALF_EXTENT
): boolean => Math.abs(carState.x) > halfExtent || Math.abs(carState.z) > halfExtent;

export const resetIfOutsideWorldBounds = (
  carState: CarState,
  onReset: () => void,
  halfExtent = WORLD_RESET_HALF_EXTENT
): boolean => {
  if (!isOutsideWorldBounds(carState, halfExtent)) return false;

  onReset();
  return true;
};
