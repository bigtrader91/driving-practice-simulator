import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { cloneVehicleAsset } from './VehicleAssetContract';
import { loadVehicleAssetLibrary } from './VehicleAssetLibrary';

const requiredNodeNames = [
  'BODY',
  'GLASS_FRONT',
  'GLASS_REAR',
  'GLASS_LEFT',
  'GLASS_RIGHT',
  'WHEEL_FL',
  'WHEEL_FR',
  'WHEEL_RL',
  'WHEEL_RR',
  'HEADLIGHT_L',
  'HEADLIGHT_R',
  'BRAKE_L',
  'BRAKE_R',
  'BLINKER_FL',
  'BLINKER_FR',
  'BLINKER_RL',
  'BLINKER_RR',
] as const;

let parseQueue = Promise.resolve<unknown>(undefined);

const parseRuntimeScene = (kind = 'traffic-compact'): Promise<THREE.Group> => {
  const parse = async () => {
    const previousSelf = Reflect.get(globalThis, 'self');
    const previousCreateImageBitmap = Reflect.get(globalThis, 'createImageBitmap');
    Object.assign(globalThis, {
      self: globalThis,
      createImageBitmap: async () => ({ width: 1, height: 1 }),
    });
    try {
      const resolvedKind = kind.endsWith('.glb')
        ? kind.split('/').at(-1)!.replace('.glb', '')
        : kind;
      const bytes = await readFile(`public/models/vehicles/${resolvedKind}.glb`);
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await new GLTFLoader().parseAsync(data, '');
      return gltf.scene;
    } finally {
      if (previousSelf === undefined) Reflect.deleteProperty(globalThis, 'self');
      else Reflect.set(globalThis, 'self', previousSelf);
      if (previousCreateImageBitmap === undefined) {
        Reflect.deleteProperty(globalThis, 'createImageBitmap');
      } else {
        Reflect.set(globalThis, 'createImageBitmap', previousCreateImageBitmap);
      }
    }
  };
  const result = parseQueue.then(parse, parse);
  parseQueue = result.then(() => undefined, () => undefined);
  return result;
};

const namedMaterial = (mesh: THREE.Mesh, name: string) => {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.find((material) => material.name === name);
};

describe('vehicle asset library', () => {
  it('loads the complete vehicle family before exposing type-specific clones', async () => {
    const loadScene = vi.fn(async (url: string) => {
      const kind = url.split('/').at(-1)!.replace('.glb', '');
      return parseRuntimeScene(kind);
    });

    const library = await loadVehicleAssetLibrary('/family/', loadScene);

    expect(loadScene.mock.calls.map(([url]) => url)).toEqual([
      '/family/models/vehicles/compact.glb',
      '/family/models/vehicles/sedan.glb',
      '/family/models/vehicles/suv.glb',
      '/family/models/vehicles/truck.glb',
      '/family/models/vehicles/traffic-compact.glb',
    ]);
    expect(library.createVehicle('compact', 0x2563eb).group).toBeInstanceOf(THREE.Group);
    expect(library.createVehicle('sedan', 0xdc2626).group).toBeInstanceOf(THREE.Group);
    expect(library.createVehicle('suv', 0x059669).group).toBeInstanceOf(THREE.Group);
    expect(library.createVehicle('truck', 0xd97706).group).toBeInstanceOf(THREE.Group);
    expect(library.createTrafficSedan(0x2563eb).steeringWheelMesh).toBeUndefined();
  });

  it('parses the real traffic sedan with the runtime node and orientation contract', async () => {
    const root = await parseRuntimeScene();

    requiredNodeNames.forEach((name) => expect(root.getObjectByName(name), name).toBeDefined());
    root.updateMatrixWorld(true);
    const frontZ = root.getObjectByName('HEADLIGHT_L')!
      .getWorldPosition(new THREE.Vector3()).z;
    const rearZ = root.getObjectByName('BRAKE_L')!
      .getWorldPosition(new THREE.Vector3()).z;

    expect(frontZ).toBeLessThan(rearZ);
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
    expect(new Set([
      root.getObjectByName('WHEEL_FL'),
      root.getObjectByName('WHEEL_FR'),
      root.getObjectByName('WHEEL_RL'),
      root.getObjectByName('WHEEL_RR'),
    ]).size).toBe(4);
  });

  it('creates colored clones with shared geometry and isolated mutable materials', async () => {
    const library = await loadVehicleAssetLibrary('/real-clones/', parseRuntimeScene);
    const blue = library.createTrafficSedan(0x2563eb);
    const red = library.createTrafficSedan(0xdc2626);

    expect(blue.bodyMeshes[0].geometry).toBe(red.bodyMeshes[0].geometry);
    expect((blue.bodyMeshes[0].material as THREE.MeshStandardMaterial).color.getHex())
      .toBe(0x2563eb);
    expect((red.bodyMeshes[0].material as THREE.MeshStandardMaterial).color.getHex())
      .toBe(0xdc2626);
    expect(namedMaterial(blue.bodyMeshes[0], 'PAINT')).toBeDefined();
    expect(namedMaterial(blue.bodyMeshes[0], 'PAINT'))
      .not.toBe(namedMaterial(red.bodyMeshes[0], 'PAINT'));

    const handleFamilies = [
      { blue: blue.headlights, red: red.headlights, material: 'HEADLIGHT' },
      { blue: blue.brakeLights, red: red.brakeLights, material: 'BRAKE' },
      {
        blue: [...blue.frontBlinkers, ...blue.rearBlinkers],
        red: [...red.frontBlinkers, ...red.rearBlinkers],
        material: 'BLINKER',
      },
    ];
    handleFamilies.forEach(({ blue: blueHandles, red: redHandles, material }) => {
      expect(blueHandles).toHaveLength(redHandles.length);
      blueHandles.forEach((blueHandle, index) => {
        const blueMaterial = namedMaterial(blueHandle, material);
        const redMaterial = namedMaterial(redHandles[index], material);
        expect(blueMaterial, `${blueHandle.name} must use ${material}`).toBeDefined();
        expect(redMaterial, `${redHandles[index].name} must use ${material}`).toBeDefined();
        expect(blueMaterial, `${blueHandle.name} material must be clone-isolated`)
          .not.toBe(redMaterial);
      });
    });
    expect(new Set([
      blue.frontLeftWheel,
      blue.frontRightWheel,
      blue.rearLeftWheel,
      blue.rearRightWheel,
    ]).size).toBe(4);
  });

  it('binds and clones the real sedan cockpit roots with shared geometry', async () => {
    const template = await parseRuntimeScene('sedan.glb');
    const first = cloneVehicleAsset(template, 'sedan', 0x2563eb);
    const second = cloneVehicleAsset(template, 'sedan', 0xdc2626);

    expect(first.exteriorRoot).not.toBe(second.exteriorRoot);
    expect(first.cockpitRoot).not.toBe(second.cockpitRoot);
    first.group.updateMatrixWorld(true);
    expect(first.driverEye?.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(-0.40, 2);
    expect(first.bodyMeshes[0].geometry).toBe(second.bodyMeshes[0].geometry);

    expect(namedMaterial(first.bodyMeshes[0], 'PAINT'))
      .not.toBe(namedMaterial(second.bodyMeshes[0], 'PAINT'));
    [
      { first: first.headlights, second: second.headlights, material: 'HEADLIGHT' },
      { first: first.brakeLights, second: second.brakeLights, material: 'BRAKE' },
      {
        first: [...first.frontBlinkers, ...first.rearBlinkers],
        second: [...second.frontBlinkers, ...second.rearBlinkers],
        material: 'BLINKER',
      },
    ].forEach(({ first: firstHandles, second: secondHandles, material }) => {
      firstHandles.forEach((firstHandle, index) => {
        expect(namedMaterial(firstHandle, material))
          .not.toBe(namedMaterial(secondHandles[index], material));
      });
    });
  });

  it('normalizes the base URL and caches one in-flight promise before loading', async () => {
    const loadScene = vi.fn((url: string) => parseRuntimeScene(url));

    const first = loadVehicleAssetLibrary('/game///', loadScene);
    const second = loadVehicleAssetLibrary('/game', loadScene);

    expect(first).toBe(second);
    expect(loadScene).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(loadScene.mock.calls.map(([url]) => url)).toEqual([
      '/game/models/vehicles/compact.glb',
      '/game/models/vehicles/sedan.glb',
      '/game/models/vehicles/suv.glb',
      '/game/models/vehicles/truck.glb',
      '/game/models/vehicles/traffic-compact.glb',
    ]);
    await expect(first).resolves.toBe(await second);
  });

  it('reports a failed asset URL and retains the rejected promise', async () => {
    const originalError = new Error('404');
    const loadScene = vi.fn(async () => {
      throw originalError;
    });

    const first = loadVehicleAssetLibrary('/missing/', loadScene);
    const rejected = await first.catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(Error);
    expect(rejected).toMatchObject({ cause: originalError });
    expect((rejected as Error).message).toBe(
      'Failed to load vehicle asset /missing/models/vehicles/compact.glb: 404',
    );

    const replacementLoader = vi.fn(async () => parseRuntimeScene());
    const second = loadVehicleAssetLibrary('/missing', replacementLoader);

    expect(second).toBe(first);
    await expect(second).rejects.toThrow(
      'Failed to load vehicle asset /missing/models/vehicles/compact.glb: 404',
    );
    expect(loadScene).toHaveBeenCalledTimes(5);
    expect(replacementLoader).not.toHaveBeenCalled();
  });

  it('wraps a malformed asset contract with its exact URL and bind error', async () => {
    const promise = loadVehicleAssetLibrary('/malformed///', async () => new THREE.Group());

    await expect(promise).rejects.toThrow(
      'Failed to load vehicle asset /malformed/models/vehicles/compact.glb: '
      + 'compact vehicle asset is missing nodes: BLINKER_FL, BLINKER_FR, '
      + 'BLINKER_RL, BLINKER_RR, BODY, BRAKE_L, BRAKE_R, GLASS_FRONT, GLASS_LEFT, '
      + 'GLASS_REAR, GLASS_RIGHT, HEADLIGHT_L, HEADLIGHT_R, STEERING_WHEEL, WHEEL_FL, '
      + 'WHEEL_FR, WHEEL_RL, WHEEL_RR, WIPER_L, WIPER_R',
    );
  });

  it('wraps a synchronous loader throw as a rejected promise', async () => {
    const originalError = new Error('synchronous decoder failure');
    const promise = loadVehicleAssetLibrary('/sync-throw/', () => {
      throw originalError;
    });

    const rejected = await promise.catch((error: unknown) => error);
    expect(rejected).toMatchObject({
      message: 'Failed to load vehicle asset '
        + '/sync-throw/models/vehicles/compact.glb: synchronous decoder failure',
      cause: originalError,
    });
  });
});
