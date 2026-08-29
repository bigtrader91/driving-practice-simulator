import * as THREE from 'three';
import type { TrafficVehicleData } from '../../types/simulator';
import { getOrbitVehicleHeading } from './VehicleCoordinateSystem';
import type { BoundVehicleAsset } from './VehicleAssetContract';
import type { VehicleAssetLibrary } from './VehicleAssetLibrary';

const wheelRadius = 0.30;
const teleportDistance = 100;
const mutableAssetMaterials = new Set(['PAINT', 'HEADLIGHT', 'BRAKE', 'BLINKER']);

export interface TrafficVehicleVisual {
  group: THREE.Group;
  headlights: THREE.Mesh[];
  brakeLights: THREE.Mesh[];
  wheels: THREE.Object3D[];
  lastPosition: THREE.Vector2;
}

export interface TrafficVehicleVisualState {
  isBraking: boolean;
}

interface OwnedResources {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  elapsedSeconds: number;
  disposing: boolean;
  disposed: boolean;
}

const resourcesByVisual = new WeakMap<TrafficVehicleVisual, OwnedResources>();

const materialsOf = (mesh: THREE.Mesh): THREE.Material[] => (
  Array.isArray(mesh.material) ? mesh.material : [mesh.material]
);

const collectMutableAssetMaterials = (asset: BoundVehicleAsset) => {
  const materials = new Set<THREE.Material>();
  asset.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    materialsOf(object).forEach((material) => {
      if (mutableAssetMaterials.has(material.name)) materials.add(material);
    });
  });
  return materials;
};

const trafficHeading = (data: TrafficVehicleData) => {
  if (data.motion === 'orbit' && data.orbit) {
    return getOrbitVehicleHeading(data.orbit.angle, data.orbit.direction);
  }
  return data.motion === 'oncoming' ? Math.PI : 0;
};

const initializeVisual = (
  visual: TrafficVehicleVisual,
  data: TrafficVehicleData,
  resources: Omit<OwnedResources, 'elapsedSeconds' | 'disposing' | 'disposed'>,
) => {
  visual.group.position.set(data.x, 0, data.z);
  visual.group.rotation.y = trafficHeading(data);
  visual.lastPosition.set(data.x, data.z);
  resourcesByVisual.set(visual, {
    ...resources,
    elapsedSeconds: 0,
    disposing: false,
    disposed: false,
  });
  return visual;
};

const createLoadedVisual = (
  data: TrafficVehicleData,
  assets: VehicleAssetLibrary,
): TrafficVehicleVisual => {
  const asset = data.type === 'sedan'
    ? assets.createTrafficSedan(data.color)
    : assets.createVehicle(data.type, data.color);
  const visual: TrafficVehicleVisual = {
    group: asset.group,
    headlights: asset.headlights,
    brakeLights: asset.brakeLights,
    wheels: [
      asset.frontLeftWheel,
      asset.frontRightWheel,
      asset.rearLeftWheel,
      asset.rearRightWheel,
    ],
    lastPosition: new THREE.Vector2(),
  };
  return initializeVisual(visual, data, {
    geometries: new Set(),
    materials: collectMutableAssetMaterials(asset),
  });
};

export const createTrafficVehicleVisual = (
  data: TrafficVehicleData,
  assets: VehicleAssetLibrary,
): TrafficVehicleVisual => createLoadedVisual(data, assets);

const setEmissiveIntensity = (meshes: THREE.Mesh[], intensity: number) => {
  meshes.forEach((mesh) => {
    materialsOf(mesh).forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = intensity;
      }
    });
  });
};

export const syncTrafficVehicleVisual = (
  visual: TrafficVehicleVisual,
  data: TrafficVehicleData,
  deltaSeconds: number,
  state: TrafficVehicleVisualState,
): void => {
  const resources = resourcesByVisual.get(visual);
  if (!resources || resources.disposed) return;

  const dx = data.x - visual.lastPosition.x;
  const dz = data.z - visual.lastPosition.y;
  const distance = Math.hypot(dx, dz);
  if (distance <= teleportDistance) {
    const wheelRoll = -distance / wheelRadius;
    visual.wheels.forEach((wheel) => {
      wheel.rotation.x += wheelRoll;
    });
  }

  visual.group.position.set(data.x, 0, data.z);
  visual.group.rotation.y = trafficHeading(data);
  visual.lastPosition.set(data.x, data.z);

  if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
    resources.elapsedSeconds += deltaSeconds;
  }
  const highBeamOn = data.isFlashingHighBeam
    && Math.sin(resources.elapsedSeconds * 12) > 0;
  setEmissiveIntensity(visual.headlights, highBeamOn ? 3.5 : 1.0);
  setEmissiveIntensity(visual.brakeLights, state.isBraking ? 2.5 : 0.4);
};

export const disposeTrafficVehicleVisual = (visual: TrafficVehicleVisual): void => {
  const resources = resourcesByVisual.get(visual);
  if (!resources || resources.disposing || resources.disposed) return;
  resources.disposing = true;
  resources.geometries.forEach((geometry) => {
    try {
      geometry.dispose();
    } catch (error) {
      console.error('Failed to dispose traffic visual geometry:', error);
    }
  });
  resources.materials.forEach((material) => {
    try {
      material.dispose();
    } catch (error) {
      console.error('Failed to dispose traffic visual material:', error);
    }
  });
  resources.disposing = false;
  resources.disposed = true;
};
