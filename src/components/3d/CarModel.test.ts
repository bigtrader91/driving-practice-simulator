import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VEHICLES } from '../../constants/vehicles';
import { createCar3DGroup } from './CarModel';
import type { VehicleAssetLibrary } from './VehicleAssetLibrary';
import { loadRealVehicleFamily } from './VehicleAssetTestUtils';
import { withVehicleRenderMode } from './VehicleRenderPass';

const isOpaque = (object: THREE.Object3D) => {
  if (!(object instanceof THREE.Mesh)) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((material) => !material.transparent);
};

const worldZ = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3()).z;

describe('createCar3DGroup vehicle coordinate contract', () => {
  let library: VehicleAssetLibrary;

  beforeAll(async () => {
    library = await loadRealVehicleFamily('/car-model-tests/');
  });

  it.each(Object.values(VEHICLES))('$name 운전석의 전방 시야를 불투명한 차체가 가리지 않는다', (vehicle) => {
    const handles = createCar3DGroup(
      vehicle,
      library.createVehicle(vehicle.id, vehicle.color),
    );
    const { carGroup } = handles;
    carGroup.updateMatrixWorld(true);

    if (vehicle.id === 'sedan') {
      expect(handles.driverEye).toBeDefined();
      handles.exteriorRoot!.visible = false;
      handles.cockpitRoot!.visible = true;
    }
    const eye = handles.driverEye
      ? handles.driverEye.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(...vehicle.cockpitPos);
    const blockers = [0, 0.08, 0.16]
      .flatMap((rise) => new THREE.Raycaster(
        eye,
        new THREE.Vector3(0, rise, -1).normalize(),
        0.05,
        vehicle.length,
      ).intersectObject(carGroup, true))
      .filter(({ object }) => isOpaque(object));

    expect(blockers).toEqual([]);
  });

  it('sedan keeps cockpit-visible seats and B-pillars under the cockpit render root', () => {
    const handles = createCar3DGroup(
      VEHICLES.sedan,
      library.createVehicle('sedan', VEHICLES.sedan.color),
    );

    ['SEAT_DRIVER', 'SEAT_PASSENGER', 'INNER_B_PILLAR_L', 'INNER_B_PILLAR_R']
      .forEach((name) => expect(handles.cockpitRoot?.getObjectByName(name), name).toBeDefined());
  });

  it('전조등과 전조등 빛은 진행 방향에 있고 제동등은 뒤에 있다', () => {
    const { carGroup, headlights, brakeLights, headlightBeams } = createCar3DGroup(
      VEHICLES.sedan,
      library.createVehicle('sedan', VEHICLES.sedan.color),
    );
    carGroup.updateMatrixWorld(true);

    const headlightZ = Math.max(...headlights.map(worldZ));
    const brakeLightZ = Math.min(...brakeLights.map(worldZ));

    expect(headlightZ).toBeLessThan(brakeLightZ);
    headlightBeams.forEach((beam) => {
      expect(worldZ(beam.target)).toBeLessThan(worldZ(beam));
    });
  });

  it('sedan render handles are propagated to the 3D car handles', () => {
    const asset = library.createVehicle('sedan', VEHICLES.sedan.color);
    const handles = createCar3DGroup(VEHICLES.sedan, asset);

    expect(handles.exteriorRoot).toBe(asset.exteriorRoot);
    expect(handles.cockpitRoot).toBe(asset.cockpitRoot);
    expect(handles.driverEye).toBe(asset.driverEye);
  });

  it('rejects a sedan that is missing a render handle with a descriptive error', () => {
    const asset = library.createVehicle('sedan', VEHICLES.sedan.color);
    const missingDriverEye = { ...asset, driverEye: undefined };

    expect(() => createCar3DGroup(VEHICLES.sedan, missingDriverEye)).toThrow(
      'sedan player vehicle asset is missing render handles: driverEye',
    );
  });

  it.each(['compact', 'suv'] as const)('%s remains compatible without sedan render handles', (id) => {
    const handles = createCar3DGroup(
      VEHICLES[id],
      library.createVehicle(id, VEHICLES[id].color),
    );

    expect([handles.exteriorRoot, handles.cockpitRoot]).toEqual([undefined, undefined]);
    withVehicleRenderMode(handles, 'cockpit', () => {
      expect(handles.carGroup.visible).toBe(false);
    });
    expect(handles.carGroup.visible).toBe(true);
  });
});
