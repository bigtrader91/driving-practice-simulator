import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { TrafficVehicleData } from '../../types/simulator';
import type { BoundVehicleAsset } from './VehicleAssetContract';
import type { VehicleAssetLibrary } from './VehicleAssetLibrary';
import {
  createTrafficVehicleVisual,
  disposeTrafficVehicleVisual,
  syncTrafficVehicleVisual,
} from './TrafficVehicleVisual';

const makeTraffic = (
  type: TrafficVehicleData['type'],
  overrides: Partial<TrafficVehicleData> = {},
): TrafficVehicleData => ({
  id: `traffic-${type}`,
  x: 4,
  z: -8,
  speedKmH: 45,
  targetLane: 0,
  laneX: 4,
  color: 0x2563eb,
  type,
  behavior: 'normal',
  isYielding: false,
  isHonking: false,
  isFlashingHighBeam: false,
  ...overrides,
});

const makeMesh = (name: string, materialName: string) => {
  const material = new THREE.MeshStandardMaterial();
  material.name = materialName;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  return mesh;
};

const makeAsset = (): BoundVehicleAsset => {
  const group = new THREE.Group();
  group.name = 'LOADED_TRAFFIC_COMPACT';
  const body = makeMesh('BODY', 'PAINT');
  const headlights = [
    makeMesh('HEADLIGHT_L', 'HEADLIGHT'),
    makeMesh('HEADLIGHT_R', 'HEADLIGHT'),
  ];
  const brakeLights = [
    makeMesh('BRAKE_L', 'BRAKE'),
    makeMesh('BRAKE_R', 'BRAKE'),
  ];
  const frontBlinkers = [
    makeMesh('BLINKER_FL', 'BLINKER'),
    makeMesh('BLINKER_FR', 'BLINKER'),
  ] as [THREE.Mesh, THREE.Mesh];
  const rearBlinkers = [
    makeMesh('BLINKER_RL', 'BLINKER'),
    makeMesh('BLINKER_RR', 'BLINKER'),
  ] as [THREE.Mesh, THREE.Mesh];
  const glass = makeMesh('GLASS_FRONT', 'GLASS');
  const wheels = ['FL', 'FR', 'RL', 'RR'].map((suffix) => {
    const wheel = new THREE.Group();
    wheel.name = `WHEEL_${suffix}`;
    return wheel;
  });
  group.add(
    body,
    glass,
    ...headlights,
    ...brakeLights,
    ...frontBlinkers,
    ...rearBlinkers,
    ...wheels,
  );
  return {
    group,
    bodyMeshes: [body],
    frontLeftWheel: wheels[0],
    frontRightWheel: wheels[1],
    rearLeftWheel: wheels[2],
    rearRightWheel: wheels[3],
    headlights,
    brakeLights,
    frontBlinkers,
    rearBlinkers,
  };
};

const makeLibrary = () => {
  const createVehicle = vi.fn(() => makeAsset());
  const createTrafficSedan = vi.fn(() => makeAsset());
  return {
    library: { createVehicle, createTrafficSedan } satisfies VehicleAssetLibrary,
    createVehicle,
    createTrafficSedan,
  };
};

const lightIntensity = (mesh: THREE.Mesh) => (
  (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity
);

const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial;


describe('traffic vehicle visual', () => {
  it('uses the dedicated traffic sedan and type-specific SUV and truck clones', () => {
    const createVehicle = vi.fn((type: 'sedan' | 'suv' | 'truck') => {
      const asset = makeAsset();
      asset.group.name = `LOADED_${type.toUpperCase()}`;
      return asset;
    });
    const createTrafficSedan = vi.fn(() => {
      const asset = makeAsset();
      asset.group.name = 'LOADED_TRAFFIC_SEDAN';
      return asset;
    });
    const library = { createVehicle, createTrafficSedan } satisfies VehicleAssetLibrary;

    const visuals = (['sedan', 'suv', 'truck'] as const).map((type) => (
      createTrafficVehicleVisual(makeTraffic(type), library)
    ));

    expect(visuals.map(({ group }) => group.name)).toEqual([
      'LOADED_TRAFFIC_SEDAN',
      'LOADED_SUV',
      'LOADED_TRUCK',
    ]);
    expect(createTrafficSedan).toHaveBeenCalledOnce();
    expect(createTrafficSedan).toHaveBeenCalledWith(0x2563eb);
    expect(createVehicle.mock.calls.map(([type]) => type)).toEqual(['suv', 'truck']);
  });

  it('uses existing traffic headings without a negative scale', () => {
    const { library } = makeLibrary();
    const normal = createTrafficVehicleVisual(makeTraffic('sedan'), library);
    const oncoming = createTrafficVehicleVisual(
      makeTraffic('sedan', { motion: 'oncoming' }),
      library,
    );
    const orbit = createTrafficVehicleVisual(makeTraffic('suv', {
      motion: 'orbit',
      orbit: { cx: 0, cz: 0, radius: 10, angle: Math.PI / 2, angularSpeed: 0.2, direction: 1 },
    }), library);

    expect(normal.group.rotation.y).toBe(0);
    expect(oncoming.group.rotation.y).toBe(Math.PI);
    expect(orbit.group.rotation.y).toBeCloseTo(Math.PI / 2);
    [normal, oncoming, orbit].forEach(({ group }) => {
      expect(group.scale.toArray()).toEqual([1, 1, 1]);
    });
  });

  it('synchronizes authoritative pose, lights, and all four wheel rolls', () => {
    const { library } = makeLibrary();
    const initial = makeTraffic('sedan', { x: 0, z: 0 });
    const visual = createTrafficVehicleVisual(initial, library);
    const moved = { ...initial, z: -0.6, isYielding: true, isFlashingHighBeam: true };

    syncTrafficVehicleVisual(visual, moved, 0.1, { isBraking: true });

    expect(visual.group.position.toArray()).toEqual([0, 0, -0.6]);
    expect(visual.wheels.map(({ rotation }) => rotation.x)).toEqual([-2, -2, -2, -2]);
    expect(visual.headlights.map(lightIntensity)).toEqual([3.5, 3.5]);
    expect(visual.brakeLights.map(lightIntensity)).toEqual([2.5, 2.5]);

    syncTrafficVehicleVisual(
      visual,
      { ...moved, isYielding: false, isFlashingHighBeam: false },
      0,
      { isBraking: false },
    );
    expect(visual.headlights.map(lightIntensity)).toEqual([1, 1]);
    expect(visual.brakeLights.map(lightIntensity)).toEqual([0.4, 0.4]);
  });

  it('uses an explicit braking decision instead of treating yielding as braking', () => {
    const { library } = makeLibrary();
    const yielding = makeTraffic('sedan', { isYielding: true });
    const visual = createTrafficVehicleVisual(yielding, library);

    syncTrafficVehicleVisual(visual, yielding, 0, { isBraking: false });
    expect(visual.brakeLights.map(lightIntensity)).toEqual([0.4, 0.4]);

    syncTrafficVehicleVisual(
      visual,
      { ...yielding, isYielding: false },
      0,
      { isBraking: true },
    );
    expect(visual.brakeLights.map(lightIntensity)).toEqual([2.5, 2.5]);
  });

  it('updates a teleport over 100m without adding a huge wheel spin', () => {
    const { library } = makeLibrary();
    const initial = makeTraffic('sedan', { x: 0, z: 0 });
    const visual = createTrafficVehicleVisual(initial, library);

    syncTrafficVehicleVisual(visual, { ...initial, x: 101, z: 0 }, 1, { isBraking: false });

    expect(visual.group.position.toArray()).toEqual([101, 0, 0]);
    expect(visual.lastPosition.toArray()).toEqual([101, 0]);
    expect(visual.wheels.map(({ rotation }) => rotation.x)).toEqual([0, 0, 0, 0]);
  });

  it('isolates loaded lamp materials per vehicle', () => {
    const { library } = makeLibrary();
    const first = createTrafficVehicleVisual(makeTraffic('sedan'), library);
    const second = createTrafficVehicleVisual(makeTraffic('sedan'), library);

    expect(materialOf(first.headlights[0])).not.toBe(materialOf(second.headlights[0]));
    expect(materialOf(first.brakeLights[0])).not.toBe(materialOf(second.brakeLights[0]));

    syncTrafficVehicleVisual(first, makeTraffic('sedan'), 0, { isBraking: true });
    expect(first.brakeLights.map(lightIntensity)).toEqual([2.5, 2.5]);
    expect(second.brakeLights.map(lightIntensity)).toEqual([1, 1]);
  });

  it('disposes only clone-owned loaded materials and keeps all shared GLB geometry', () => {
    const asset = makeAsset();
    const meshes: THREE.Mesh[] = [];
    asset.group.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    const sharedGeometryDisposals = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
    const mutableMaterialDisposals = meshes
      .filter((mesh) => ['PAINT', 'HEADLIGHT', 'BRAKE', 'BLINKER'].includes(materialOf(mesh).name))
      .map((mesh) => vi.spyOn(materialOf(mesh), 'dispose'));
    const glass = asset.group.getObjectByName('GLASS_FRONT') as THREE.Mesh;
    const glassMaterialDispose = vi.spyOn(materialOf(glass), 'dispose');
    const visual = createTrafficVehicleVisual(
      makeTraffic('sedan'),
      { createVehicle: vi.fn(), createTrafficSedan: vi.fn(() => asset) },
    );

    disposeTrafficVehicleVisual(visual);
    disposeTrafficVehicleVisual(visual);

    mutableMaterialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    sharedGeometryDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    expect(glassMaterialDispose).not.toHaveBeenCalled();
  });

  it('attempts every owned disposal after a failure and remains terminally idempotent', () => {
    const { library } = makeLibrary();
    const visual = createTrafficVehicleVisual(makeTraffic('suv'), library);
    const materials = new Set<THREE.Material>();
    visual.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (['PAINT', 'HEADLIGHT', 'BRAKE', 'BLINKER'].includes(materialOf(object).name)) {
        materials.add(materialOf(object));
      }
    });
    const [firstMaterial, ...remainingMaterials] = [...materials];
    const firstDispose = vi.spyOn(firstMaterial, 'dispose').mockImplementation(() => {
      throw new Error('material dispose failed');
    });
    const materialDisposals = remainingMaterials
      .map((material) => vi.spyOn(material, 'dispose'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    disposeTrafficVehicleVisual(visual);
    disposeTrafficVehicleVisual(visual);

    expect(firstDispose).toHaveBeenCalledOnce();
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to dispose traffic visual material:',
      expect.objectContaining({ message: 'material dispose failed' }),
    );
    consoleError.mockRestore();
  });
});
