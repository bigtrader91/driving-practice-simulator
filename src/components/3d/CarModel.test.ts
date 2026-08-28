import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VEHICLES } from '../../constants/vehicles';
import { createCar3DGroup } from './CarModel';
import type { VehicleAssetLibrary } from './VehicleAssetLibrary';
import { loadRealVehicleFamily } from './VehicleAssetTestUtils';

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
    const { carGroup } = createCar3DGroup(
      vehicle,
      library.createVehicle(vehicle.id, vehicle.color),
    );
    carGroup.updateMatrixWorld(true);

    const eye = new THREE.Vector3(...vehicle.cockpitPos);
    const raycaster = new THREE.Raycaster(eye, new THREE.Vector3(0, 0, -1), 0.05, vehicle.length);
    const blockers = raycaster
      .intersectObject(carGroup, true)
      .filter(({ object }) => isOpaque(object));

    expect(blockers).toEqual([]);
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
});
