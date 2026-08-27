import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

const parseRuntimeScene = async () => {
  const previousSelf = Reflect.get(globalThis, 'self');
  const previousCreateImageBitmap = Reflect.get(globalThis, 'createImageBitmap');
  Object.assign(globalThis, {
    self: globalThis,
    createImageBitmap: async () => ({ width: 1, height: 1 }),
  });
  try {
    const bytes = await readFile('public/models/vehicles/traffic-compact.glb');
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

const namedMaterial = (mesh: THREE.Mesh, name: string) => {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.find((material) => material.name === name);
};

describe('vehicle asset library', () => {
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

  it('normalizes the base URL and caches one in-flight promise before loading', async () => {
    let release!: (scene: THREE.Group) => void;
    const pendingScene = new Promise<THREE.Group>((resolve) => {
      release = resolve;
    });
    const loadScene = vi.fn(() => pendingScene);

    const first = loadVehicleAssetLibrary('/game///', loadScene);
    const second = loadVehicleAssetLibrary('/game', loadScene);

    expect(first).toBe(second);
    expect(loadScene).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(loadScene).toHaveBeenCalledOnce();
    expect(loadScene).toHaveBeenCalledWith('/game/models/vehicles/traffic-compact.glb');

    release(await parseRuntimeScene());
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
      'Failed to load vehicle asset /missing/models/vehicles/traffic-compact.glb: 404',
    );

    const replacementLoader = vi.fn(async () => parseRuntimeScene());
    const second = loadVehicleAssetLibrary('/missing', replacementLoader);

    expect(second).toBe(first);
    await expect(second).rejects.toThrow(
      'Failed to load vehicle asset /missing/models/vehicles/traffic-compact.glb: 404',
    );
    expect(loadScene).toHaveBeenCalledOnce();
    expect(replacementLoader).not.toHaveBeenCalled();
  });

  it('wraps a malformed asset contract with its exact URL and bind error', async () => {
    const promise = loadVehicleAssetLibrary('/malformed///', async () => new THREE.Group());

    await expect(promise).rejects.toThrow(
      'Failed to load vehicle asset /malformed/models/vehicles/traffic-compact.glb: '
      + 'traffic-compact vehicle asset is missing nodes: BLINKER_FL, BLINKER_FR, '
      + 'BLINKER_RL, BLINKER_RR, BODY, BRAKE_L, BRAKE_R, GLASS_FRONT, GLASS_LEFT, '
      + 'GLASS_REAR, GLASS_RIGHT, HEADLIGHT_L, HEADLIGHT_R, WHEEL_FL, WHEEL_FR, '
      + 'WHEEL_RL, WHEEL_RR',
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
        + '/sync-throw/models/vehicles/traffic-compact.glb: synchronous decoder failure',
      cause: originalError,
    });
  });
});
