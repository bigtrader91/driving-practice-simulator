import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  bindVehicleAsset,
  cloneVehicleAsset,
  type BoundVehicleAsset,
  type VehicleAssetKind,
} from './VehicleAssetContract';
import type { VehicleType } from '../../types/simulator';

export type RuntimeVehicleKind = VehicleType | 'truck';

type LoadedVehicleKind = RuntimeVehicleKind | 'traffic-compact';

const vehicleKinds = [
  'compact',
  'sedan',
  'suv',
  'truck',
  'traffic-compact',
] as const satisfies readonly LoadedVehicleKind[];
const libraryPromises = new Map<string, Promise<VehicleAssetLibrary>>();

export interface VehicleAssetLibrary {
  createVehicle(kind: RuntimeVehicleKind, color: THREE.ColorRepresentation): BoundVehicleAsset;
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

  const loadTemplate = async (kind: LoadedVehicleKind) => {
    const url = `${normalizedBaseUrl}models/vehicles/${kind}.glb`;
    try {
      const scene = await loadScene(url);
      bindVehicleAsset(scene, kind);
      return [kind, scene] as const;
    } catch (error: unknown) {
      const wrapped = new Error(`Failed to load vehicle asset ${url}: ${errorMessage(error)}`);
      (wrapped as Error & { cause: unknown }).cause = error;
      throw wrapped;
    }
  };

  const promise = Promise.resolve()
    .then(() => Promise.all(vehicleKinds.map(loadTemplate)))
    .then((entries) => {
      const templates = new Map<LoadedVehicleKind, THREE.Group>(entries);
      const createVehicle = (
        kind: VehicleAssetKind,
        color: THREE.ColorRepresentation,
      ) => cloneVehicleAsset(templates.get(kind)!, kind, color);
      return {
        createVehicle,
        createTrafficSedan: (color: THREE.ColorRepresentation) => (
          createVehicle('traffic-compact', color)
        ),
      };
    });

  libraryPromises.set(normalizedBaseUrl, promise);
  return promise;
};
