import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  bindVehicleAsset,
  cloneVehicleAsset,
  type BoundVehicleAsset,
} from './VehicleAssetContract';

const trafficSedanPath = 'models/vehicles/traffic-compact.glb';
const libraryPromises = new Map<string, Promise<VehicleAssetLibrary>>();

export interface VehicleAssetLibrary {
  createTrafficSedan(color: THREE.ColorRepresentation): BoundVehicleAsset;
}

export type LoadVehicleScene = (url: string) => Promise<THREE.Group>;

const normalizeBaseUrl = (baseUrl: string) => `${baseUrl.replace(/\/+$/, '')}/`;

const defaultLoadScene: LoadVehicleScene = async (url) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.scene;
};

const errorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

export const loadVehicleAssetLibrary = (
  baseUrl: string,
  loadScene: LoadVehicleScene = defaultLoadScene,
): Promise<VehicleAssetLibrary> => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const cached = libraryPromises.get(normalizedBaseUrl);
  if (cached) return cached;

  const url = `${normalizedBaseUrl}${trafficSedanPath}`;
  const promise = Promise.resolve()
    .then(() => loadScene(url))
    .then((scene) => {
      bindVehicleAsset(scene, 'traffic-compact');
      return {
        createTrafficSedan: (color: THREE.ColorRepresentation) => (
          cloneVehicleAsset(scene, 'traffic-compact', color)
        ),
      };
    })
    .catch((error: unknown) => {
      const wrapped = new Error(`Failed to load vehicle asset ${url}: ${errorMessage(error)}`);
      (wrapped as Error & { cause: unknown }).cause = error;
      throw wrapped;
    });

  libraryPromises.set(normalizedBaseUrl, promise);
  return promise;
};
