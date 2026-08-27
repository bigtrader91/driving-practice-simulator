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

const createSedanVisual = (
  data: TrafficVehicleData,
  assets: VehicleAssetLibrary,
): TrafficVehicleVisual => {
  const asset = assets.createTrafficSedan(data.color);
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

const createProceduralVisual = (data: TrafficVehicleData): TrafficVehicleVisual => {
  const group = new THREE.Group();
  group.name = `PROCEDURAL_TRAFFIC_${data.type.toUpperCase()}`;
  const isTruck = data.type === 'truck';
  const width = isTruck ? 2.3 : 2.0;
  const length = isTruck ? 7.5 : 4.9;
  const height = isTruck ? 2.8 : 1.7;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: data.color,
    roughness: 0.22,
    metalness: 0.7,
  });
  materials.add(bodyMaterial);

  const bodyGeometry = new THREE.BoxGeometry(width, height * 0.45, length);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = height * 0.225 + 0.25;
  body.castShadow = true;
  geometries.add(bodyGeometry);
  group.add(body);

  const cabinGeometry = new THREE.BoxGeometry(width * 0.9, height * 0.45, length * 0.5);
  const cabin = new THREE.Mesh(cabinGeometry, bodyMaterial);
  cabin.position.set(0, height * 0.65 + 0.25, length * 0.05);
  cabin.castShadow = true;
  geometries.add(cabinGeometry);
  group.add(cabin);

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.0,
  });
  const brakeMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xaa0000,
    emissiveIntensity: 0.4,
  });
  materials.add(headlightMaterial);
  materials.add(brakeMaterial);

  const makeLights = (
    material: THREE.MeshStandardMaterial,
    z: number,
  ): THREE.Mesh[] => [-1, 1].map((side) => {
    const geometry = new THREE.BoxGeometry(0.25, 0.12, 0.05);
    const light = new THREE.Mesh(geometry, material);
    light.position.set(side * width * 0.35, height * 0.3 + 0.25, z);
    geometries.add(geometry);
    group.add(light);
    return light;
  });
  const headlights = makeLights(headlightMaterial, -length / 2 - 0.02);
  const brakeLights = makeLights(brakeMaterial, length / 2 + 0.02);

  const wheels = ['FL', 'FR', 'RL', 'RR'].map((suffix) => {
    const wheel = new THREE.Group();
    wheel.name = `WHEEL_${suffix}`;
    group.add(wheel);
    return wheel;
  });

  return initializeVisual({
    group,
    headlights,
    brakeLights,
    wheels,
    lastPosition: new THREE.Vector2(),
  }, data, { geometries, materials });
};

export const createTrafficVehicleVisual = (
  data: TrafficVehicleData,
  assets: VehicleAssetLibrary,
): TrafficVehicleVisual => (
  data.type === 'sedan'
    ? createSedanVisual(data, assets)
    : createProceduralVisual(data)
);

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
