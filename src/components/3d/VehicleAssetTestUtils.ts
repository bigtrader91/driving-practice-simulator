import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadVehicleAssetLibrary } from './VehicleAssetLibrary';

export const loadRealVehicleFamily = async (baseUrl: string) => {
  const previousSelf = Reflect.get(globalThis, 'self');
  const previousCreateImageBitmap = Reflect.get(globalThis, 'createImageBitmap');
  Object.assign(globalThis, {
    self: globalThis,
    createImageBitmap: async () => ({ width: 1, height: 1 }),
  });
  try {
    return await loadVehicleAssetLibrary(baseUrl, async (url) => {
      const filename = url.split('/').at(-1)!;
      const bytes = await readFile(`public/models/vehicles/${filename}`);
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await new GLTFLoader().parseAsync(data, '');
      return gltf.scene;
    });
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
