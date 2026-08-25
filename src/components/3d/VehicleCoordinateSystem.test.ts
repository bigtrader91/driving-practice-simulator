import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VEHICLES } from '../../constants/vehicles';
import { createCar3DGroup } from './CarModel';
import {
  getBackupCameraOffset,
  getForwardDirection,
  getHoodCameraOffset,
  getMirrorDirection,
  getOrbitVehicleHeading,
  getRearDirection,
  getVisualWheelSteerRotation,
} from './VehicleCoordinateSystem';

const yAxis = new THREE.Vector3(0, 1, 0);

const opaqueBlockers = (origin: THREE.Vector3, direction: THREE.Vector3, carGroup: THREE.Group) => {
  const raycaster = new THREE.Raycaster(origin, direction, 0.05, 20);
  return raycaster.intersectObject(carGroup, true).filter(({ object }) => {
    if (!(object instanceof THREE.Mesh)) return false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.some((material) => !material.transparent);
  });
};

const opaqueClearance = (point: THREE.Vector3, carGroup: THREE.Group) => {
  let clearance = Infinity;
  carGroup.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.every((material) => material.transparent)) return;
    clearance = Math.min(clearance, new THREE.Box3().setFromObject(object).distanceToPoint(point));
  });
  return clearance;
};

describe('vehicle coordinate system', () => {
  it('전진과 후방 방향은 주행 물리의 -Z/+Z 규약을 따른다', () => {
    expect(getForwardDirection(0).x).toBeCloseTo(0, 10);
    expect(getForwardDirection(0).z).toBeCloseTo(-1, 10);
    expect(getRearDirection(0).x).toBeCloseTo(0, 10);
    expect(getRearDirection(0).z).toBeCloseTo(1, 10);

    const heading = Math.PI / 2;
    expect(getForwardDirection(heading).x).toBeCloseTo(-1, 10);
    expect(getForwardDirection(heading).z).toBeCloseTo(0, 10);
    expect(getRearDirection(heading).x).toBeCloseTo(1, 10);
    expect(getRearDirection(heading).z).toBeCloseTo(0, 10);
  });

  it.each(Object.values(VEHICLES))('$name 보닛 및 후방 카메라가 차체 바깥을 바라본다', (vehicle) => {
    const { carGroup } = createCar3DGroup(vehicle);
    carGroup.updateMatrixWorld(true);

    const hoodOffset = getHoodCameraOffset(vehicle);
    const backupOffset = getBackupCameraOffset(vehicle);

    expect(hoodOffset.z).toBeLessThan(-vehicle.length * 0.3);
    expect(backupOffset.z).toBeGreaterThan(vehicle.length * 0.4);
    expect(opaqueClearance(hoodOffset, carGroup)).toBeGreaterThan(0.1);
    expect(opaqueClearance(backupOffset, carGroup)).toBeGreaterThan(0.1);
    expect(opaqueBlockers(hoodOffset, getForwardDirection(0), carGroup)).toEqual([]);
    expect(opaqueBlockers(backupOffset, getRearDirection(0, -0.25), carGroup)).toEqual([]);
  });

  it.each([1, -1] as const)('회전교차로 차량의 앞이 direction=%s 궤도 접선을 향한다', (direction) => {
    const angle = Math.PI / 3;
    const heading = getOrbitVehicleHeading(angle, direction);
    const renderedForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(yAxis, heading);
    const tangent = new THREE.Vector3(
      -Math.sin(angle) * direction,
      0,
      Math.cos(angle) * direction
    ).normalize();

    expect(renderedForward.x).toBeCloseTo(tangent.x, 10);
    expect(renderedForward.z).toBeCloseTo(tangent.z, 10);
  });

  it('우조향 시 반사된 차량 모델의 앞바퀴도 오른쪽을 향한다', () => {
    const { carGroup, frontLeftWheel } = createCar3DGroup(VEHICLES.sedan);
    frontLeftWheel.rotation.y = getVisualWheelSteerRotation(0.3);
    carGroup.updateMatrixWorld(true);

    const origin = frontLeftWheel.localToWorld(new THREE.Vector3());
    const wheelForward = frontLeftWheel
      .localToWorld(new THREE.Vector3(0, 0, 1))
      .sub(origin)
      .normalize();

    expect(wheelForward.x).toBeGreaterThan(0);
    expect(wheelForward.z).toBeLessThan(0);
  });

  it('좌우 사이드미러는 차량 중심이 아니라 같은 쪽 후방 차로를 향한다', () => {
    const left = getMirrorDirection(0, 'left');
    const right = getMirrorDirection(0, 'right');
    const rear = getMirrorDirection(0, 'rear');

    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    expect(rear.x).toBeCloseTo(0, 10);
    expect(left.z).toBeGreaterThan(0);
    expect(right.z).toBeGreaterThan(0);
    expect(rear.z).toBeGreaterThan(0);
  });
});
