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
  const createTrafficSedan = vi.fn(() => makeAsset());
  return {
    library: { createTrafficSedan } satisfies VehicleAssetLibrary,
    createTrafficSedan,
  };
};

const dimensionsOf = (mesh: THREE.Mesh) => {
  const geometry = mesh.geometry as THREE.BoxGeometry;
  const { width, height, depth } = geometry.parameters;
  return [width, height, depth];
};

const lightIntensity = (mesh: THREE.Mesh) => (
  (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity
);

const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial;

const expectProceduralLiterals = (
  visual: ReturnType<typeof createTrafficVehicleVisual>,
  dimensions: { width: number; length: number; height: number },
) => {
  const { width, length, height } = dimensions;
  const [body, cabin] = visual.group.children as THREE.Mesh[];
  expect(dimensionsOf(body)).toEqual([width, height * 0.45, length]);
  expect(body.position.toArray()).toEqual([0, height * 0.225 + 0.25, 0]);
  expect(dimensionsOf(cabin)).toEqual([width * 0.9, height * 0.45, length * 0.5]);
  expect(cabin.position.toArray()).toEqual([0, height * 0.65 + 0.25, length * 0.05]);
  expect(materialOf(body)).toMatchObject({
    roughness: 0.22,
    metalness: 0.7,
  });
  expect(materialOf(body).color.getHex()).toBe(0x2563eb);

  const expectedX = [-width * 0.35, width * 0.35];
  visual.headlights.forEach((light, index) => {
    expect(dimensionsOf(light)).toEqual([0.25, 0.12, 0.05]);
    expect(light.position.toArray()).toEqual([
      expectedX[index],
      height * 0.3 + 0.25,
      -length / 2 - 0.02,
    ]);
    expect(materialOf(light).color.getHex()).toBe(0xffffff);
    expect(materialOf(light).emissive.getHex()).toBe(0xffffff);
    expect(materialOf(light).emissiveIntensity).toBe(1);
  });
  visual.brakeLights.forEach((light, index) => {
    expect(dimensionsOf(light)).toEqual([0.25, 0.12, 0.05]);
    expect(light.position.toArray()).toEqual([
      expectedX[index],
      height * 0.3 + 0.25,
      length / 2 + 0.02,
    ]);
    expect(materialOf(light).color.getHex()).toBe(0xff0000);
    expect(materialOf(light).emissive.getHex()).toBe(0xaa0000);
    expect(materialOf(light).emissiveIntensity).toBe(0.4);
  });
  expect(visual.group.scale.toArray()).toEqual([1, 1, 1]);
};

describe('traffic vehicle visual', () => {
  it('selects the loaded asset only for sedan traffic', () => {
    const { library, createTrafficSedan } = makeLibrary();

    const sedan = createTrafficVehicleVisual(makeTraffic('sedan'), library);
    const suv = createTrafficVehicleVisual(makeTraffic('suv'), library);
    const truck = createTrafficVehicleVisual(makeTraffic('truck'), library);

    expect(sedan.group.name).toBe('LOADED_TRAFFIC_COMPACT');
    expect(suv.group.name).toBe('PROCEDURAL_TRAFFIC_SUV');
    expect(truck.group.name).toBe('PROCEDURAL_TRAFFIC_TRUCK');
    expect(createTrafficSedan).toHaveBeenCalledOnce();
    expect(createTrafficSedan).toHaveBeenCalledWith(0x2563eb);
  });

  it('preserves the procedural SUV and truck body, cabin, and lamp literals', () => {
    const { library } = makeLibrary();

    const suv = createTrafficVehicleVisual(makeTraffic('suv'), library);
    const truck = createTrafficVehicleVisual(makeTraffic('truck'), library);
    expectProceduralLiterals(suv, { width: 2, length: 4.9, height: 1.7 });
    expectProceduralLiterals(truck, { width: 2.3, length: 7.5, height: 2.8 });
    expect(suv.wheels).toHaveLength(4);
    expect(truck.wheels).toHaveLength(4);
    expect(materialOf(suv.headlights[0])).not.toBe(materialOf(truck.headlights[0]));
    expect(materialOf(suv.brakeLights[0])).not.toBe(materialOf(truck.brakeLights[0]));
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
    const createTrafficSedan = vi.fn(() => asset);
    const visual = createTrafficVehicleVisual(
      makeTraffic('sedan'),
      { createTrafficSedan },
    );

    disposeTrafficVehicleVisual(visual);
    disposeTrafficVehicleVisual(visual);

    mutableMaterialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    sharedGeometryDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    expect(glassMaterialDispose).not.toHaveBeenCalled();
  });

  it('disposes every procedural geometry and material exactly once', () => {
    const { library } = makeLibrary();
    const visual = createTrafficVehicleVisual(makeTraffic('suv'), library);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    visual.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      materials.add(materialOf(object));
    });
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, 'dispose'));

    disposeTrafficVehicleVisual(visual);
    disposeTrafficVehicleVisual(visual);

    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('attempts every owned disposal after a failure and remains terminally idempotent', () => {
    const { library } = makeLibrary();
    const visual = createTrafficVehicleVisual(makeTraffic('suv'), library);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    visual.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      materials.add(materialOf(object));
    });
    const [firstGeometry, ...remainingGeometries] = [...geometries];
    const firstDispose = vi.spyOn(firstGeometry, 'dispose').mockImplementation(() => {
      throw new Error('geometry dispose failed');
    });
    const remainingGeometryDisposals = remainingGeometries
      .map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...materials]
      .map((material) => vi.spyOn(material, 'dispose'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    disposeTrafficVehicleVisual(visual);
    disposeTrafficVehicleVisual(visual);

    expect(firstDispose).toHaveBeenCalledOnce();
    remainingGeometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to dispose traffic visual geometry:',
      expect.objectContaining({ message: 'geometry dispose failed' }),
    );
    consoleError.mockRestore();
  });
});
