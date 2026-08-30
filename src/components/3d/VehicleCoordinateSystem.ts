import * as THREE from 'three';
import { VehicleConfig } from '../../types/simulator';

export const getForwardDirection = (heading: number, vertical = 0): THREE.Vector3 => new THREE.Vector3(
  -Math.sin(heading),
  vertical,
  -Math.cos(heading)
).normalize();

export const getRearDirection = (heading: number, vertical = 0): THREE.Vector3 => new THREE.Vector3(
  Math.sin(heading),
  vertical,
  Math.cos(heading)
).normalize();

export const getHoodCameraOffset = (vehicle: VehicleConfig, vibration = 0): THREE.Vector3 => new THREE.Vector3(
  0,
  vehicle.height * 0.8 + vibration,
  -vehicle.length * 0.52
);

export const getBackupCameraOffset = (vehicle: VehicleConfig): THREE.Vector3 => new THREE.Vector3(
  0,
  vehicle.height * 0.55,
  vehicle.length * 0.53
);

export const getOrbitVehicleHeading = (angle: number, direction: 1 | -1): number => (
  -angle + (direction === 1 ? Math.PI : 0)
);

export const getVisualWheelSteerRotation = (steerAngle: number): number => -steerAngle;

export const orientCameraToward = (
  camera: THREE.Camera,
  target: THREE.Vector3,
  localRoll = 0,
): void => {
  camera.lookAt(target);
  camera.rotateZ(localRoll);
};

export type MirrorView = 'left' | 'right' | 'rear';

export const getMirrorDirection = (heading: number, view: MirrorView): THREE.Vector3 => {
  const yawOffset = view === 'left' ? -0.12 : view === 'right' ? 0.12 : 0;
  return getRearDirection(heading + yawOffset, -0.05);
};
