import * as THREE from 'three';
import type { VehicleConfig } from '../../types/simulator';
import type { BoundVehicleAsset } from './VehicleAssetContract';

export interface Car3DHandles {
  carGroup: THREE.Group;
  exteriorRoot?: THREE.Object3D;
  cockpitRoot?: THREE.Object3D;
  driverEye?: THREE.Object3D;
  frontLeftWheel: THREE.Object3D;
  frontRightWheel: THREE.Object3D;
  rearLeftWheel: THREE.Object3D;
  rearRightWheel: THREE.Object3D;
  steeringWheelMesh: THREE.Object3D;
  leftBlinkerLight: THREE.Mesh;
  rightBlinkerLight: THREE.Mesh;
  leftRearBlinkerLight: THREE.Mesh;
  rightRearBlinkerLight: THREE.Mesh;
  brakeLights: THREE.Mesh[];
  headlights: THREE.Mesh[];
  headlightBeams: THREE.SpotLight[];
  wiperLeft: THREE.Object3D;
  wiperRight: THREE.Object3D;
}

const enableShadows = (group: THREE.Group) => {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
};

const createHeadlightBeams = (vehicle: VehicleConfig, group: THREE.Group) => (
  [-vehicle.width * 0.33, vehicle.width * 0.33].map((x) => {
    const beam = new THREE.SpotLight(0xfffbeb, 3.2, 45, Math.PI / 6, 0.4, 1.2);
    beam.position.set(x, vehicle.height * 0.40, -vehicle.length / 2);
    const target = new THREE.Object3D();
    target.position.set(x, 0, -vehicle.length / 2 - 35);
    group.add(target, beam);
    beam.target = target;
    return beam;
  })
);

export const createCar3DGroup = (
  vehicle: VehicleConfig,
  asset: BoundVehicleAsset,
): Car3DHandles => {
  if (!asset.steeringWheelMesh || !asset.wiperLeft || !asset.wiperRight) {
    throw new Error(`${vehicle.id} player vehicle asset is missing cockpit controls`);
  }

  if (vehicle.id === 'sedan') {
    const missingRenderHandles = [
      ['exteriorRoot', asset.exteriorRoot],
      ['cockpitRoot', asset.cockpitRoot],
      ['driverEye', asset.driverEye],
    ]
      .filter(([, handle]) => !handle)
      .map(([name]) => name);

    if (missingRenderHandles.length > 0) {
      throw new Error(
        `sedan player vehicle asset is missing render handles: ${missingRenderHandles.join(', ')}`,
      );
    }
  }

  const carGroup = asset.group;
  carGroup.name = `PLAYER_VEHICLE_${vehicle.id.toUpperCase()}`;
  enableShadows(carGroup);

  return {
    carGroup,
    exteriorRoot: asset.exteriorRoot,
    cockpitRoot: asset.cockpitRoot,
    driverEye: asset.driverEye,
    frontLeftWheel: asset.frontLeftWheel,
    frontRightWheel: asset.frontRightWheel,
    rearLeftWheel: asset.rearLeftWheel,
    rearRightWheel: asset.rearRightWheel,
    steeringWheelMesh: asset.steeringWheelMesh,
    leftBlinkerLight: asset.frontBlinkers[0],
    rightBlinkerLight: asset.frontBlinkers[1],
    leftRearBlinkerLight: asset.rearBlinkers[0],
    rightRearBlinkerLight: asset.rearBlinkers[1],
    brakeLights: asset.brakeLights,
    headlights: asset.headlights,
    headlightBeams: createHeadlightBeams(vehicle, carGroup),
    wiperLeft: asset.wiperLeft,
    wiperRight: asset.wiperRight,
  };
};
