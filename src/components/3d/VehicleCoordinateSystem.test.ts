import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VEHICLES } from '../../constants/vehicles';
import { createCar3DGroup } from './CarModel';
import type { VehicleAssetLibrary } from './VehicleAssetLibrary';
import { loadRealVehicleFamily } from './VehicleAssetTestUtils';
import {
  getBackupCameraOffset,
  getForwardDirection,
  getHoodCameraOffset,
  getMirrorDirection,
  getOrbitVehicleHeading,
  getRearDirection,
  getVisualWheelSteerRotation,
  orientCameraToward,
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

describe('vehicle coordinate system', () => {
  let library: VehicleAssetLibrary;

  beforeAll(async () => {
    library = await loadRealVehicleFamily('/coordinate-tests/');
  });

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
    const { carGroup } = createCar3DGroup(
      vehicle,
      library.createVehicle(vehicle.id, vehicle.color),
    );
    carGroup.updateMatrixWorld(true);

    const hoodOffset = getHoodCameraOffset(vehicle);
    const backupOffset = getBackupCameraOffset(vehicle);

    expect(hoodOffset.z).toBeLessThan(-vehicle.length * 0.3);
    expect(backupOffset.z).toBeGreaterThan(vehicle.length * 0.4);
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

  it('우조향 시 -Z 전방 차량 모델의 앞바퀴도 오른쪽을 향한다', () => {
    const { carGroup, frontLeftWheel } = createCar3DGroup(
      VEHICLES.sedan,
      library.createVehicle('sedan', VEHICLES.sedan.color),
    );
    frontLeftWheel.rotation.y = getVisualWheelSteerRotation(0.3);
    carGroup.updateMatrixWorld(true);

    const origin = frontLeftWheel.localToWorld(new THREE.Vector3());
    const wheelForward = frontLeftWheel
      .localToWorld(new THREE.Vector3(0, 0, -1))
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

  it.each([91, 120, 179, 181, 240, 269])(
    '차량 방향이 %s도여도 카메라 상하축이 뒤집히지 않는다',
    (headingDegrees) => {
      const camera = new THREE.PerspectiveCamera();
      const heading = THREE.MathUtils.degToRad(headingDegrees);
      const target = getForwardDirection(heading);

      orientCameraToward(camera, target, 0);

      const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      expect(cameraUp.y).toBeCloseTo(1, 10);
    },
  );

  it('운전석 기울기는 뒤집힘 없이 카메라 로컬 전방축에 적용된다', () => {
    const camera = new THREE.PerspectiveCamera();
    const target = getForwardDirection(THREE.MathUtils.degToRad(120));

    orientCameraToward(camera, target, 0.2);

    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    expect(cameraUp.y).toBeCloseTo(0.9800665778, 8);
  });
});
