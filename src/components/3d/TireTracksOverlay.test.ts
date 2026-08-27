import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VEHICLES } from '../../constants/vehicles';
import type { CarState, GearMode } from '../../types/simulator';
import { TrajectoryGuideRenderer } from './TireTracksOverlay';

const createCarState = (gear: GearMode, steerAngle = 0): CarState => ({
  x: 0,
  y: 0,
  z: 0,
  speed: 0,
  speedMs: 0,
  steerAngle,
  steeringWheelAngle: 0,
  steeringWheelTurns: 0,
  steeringWheelDegrees: 0,
  heading: 0,
  gear,
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
});

const trajectoryPositions = (gear: GearMode, steerAngle = 0): THREE.BufferAttribute => {
  const scene = new THREE.Scene();
  const renderer = new TrajectoryGuideRenderer(scene);
  renderer.update(VEHICLES.sedan, createCarState(gear, steerAngle), true, true);
  const trajectory = (scene.children[0] as THREE.Group).children[0] as THREE.LineSegments;
  return trajectory.geometry.getAttribute('position') as THREE.BufferAttribute;
};

const guideVisibility = (
  gear: GearMode,
  showTrajectory: boolean,
  showWidthGuide: boolean
): { trajectory: boolean; width: boolean } => {
  const scene = new THREE.Scene();
  const renderer = new TrajectoryGuideRenderer(scene);
  renderer.update(VEHICLES.sedan, createCarState(gear), showTrajectory, showWidthGuide);
  const group = scene.children[0] as THREE.Group;
  return {
    trajectory: (group.children[0] as THREE.LineSegments).visible,
    width: (group.children[1] as THREE.LineSegments).visible,
  };
};

const trajectoryZValues = (gear: GearMode): number[] => {
  const positions = trajectoryPositions(gear);
  const zValues: number[] = [];
  for (let index = 0; index < positions.count; index += 1) zValues.push(positions.getZ(index));
  return zValues;
};

const farTrajectoryCenterX = (gear: GearMode, steerAngle: number): number => {
  const positions = trajectoryPositions(gear, steerAngle);
  return (positions.getX(positions.count - 3) + positions.getX(positions.count - 1)) / 2;
};

describe('TrajectoryGuideRenderer gear direction', () => {
  it('궤적선과 차폭 가이드 표시 설정을 독립적으로 적용한다', () => {
    expect(guideVisibility('R', true, false)).toEqual({ trajectory: true, width: false });
    expect(guideVisibility('R', false, true)).toEqual({ trajectory: false, width: true });
  });

  it('D에서는 앞 범퍼부터 전방으로만 궤적선을 그린다', () => {
    const zValues = trajectoryZValues('D');
    expect(Math.max(...zValues)).toBeCloseTo(-VEHICLES.sedan.length / 2, 5);
    expect(Math.min(...zValues)).toBeLessThan(-VEHICLES.sedan.length / 2);
  });

  it('R에서는 뒤 범퍼부터 후방으로만 궤적선을 그린다', () => {
    const zValues = trajectoryZValues('R');
    expect(Math.min(...zValues)).toBeCloseTo(VEHICLES.sedan.length / 2, 5);
    expect(Math.max(...zValues)).toBeGreaterThan(VEHICLES.sedan.length / 2);
  });

  it.each(['D', 'R'] as const)('%s에서 오른쪽 조향 궤적은 실제 차량처럼 +X로 휜다', (gear) => {
    expect(farTrajectoryCenterX(gear, 0.3)).toBeGreaterThan(0);
  });
});
