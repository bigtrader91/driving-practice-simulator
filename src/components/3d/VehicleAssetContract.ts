import * as THREE from 'three';
import type { VehicleType } from '../../types/simulator';

export type VehicleAssetKind = VehicleType | 'truck' | 'traffic-compact';

export interface BoundVehicleAsset {
  group: THREE.Group;
  exteriorRoot?: THREE.Object3D;
  cockpitRoot?: THREE.Object3D;
  driverEye?: THREE.Object3D;
  bodyMeshes: THREE.Mesh[];
  frontLeftWheel: THREE.Object3D;
  frontRightWheel: THREE.Object3D;
  rearLeftWheel: THREE.Object3D;
  rearRightWheel: THREE.Object3D;
  steeringWheelMesh?: THREE.Object3D;
  wiperLeft?: THREE.Object3D;
  wiperRight?: THREE.Object3D;
  headlights: THREE.Mesh[];
  brakeLights: THREE.Mesh[];
  frontBlinkers: [THREE.Mesh, THREE.Mesh];
  rearBlinkers: [THREE.Mesh, THREE.Mesh];
}

const meshNames = [
  'GLASS_FRONT',
  'GLASS_REAR',
  'GLASS_LEFT',
  'GLASS_RIGHT',
  'HEADLIGHT_L',
  'HEADLIGHT_R',
  'BRAKE_L',
  'BRAKE_R',
  'BLINKER_FL',
  'BLINKER_FR',
  'BLINKER_RL',
  'BLINKER_RR',
] as const;

const objectNames = ['BODY', 'WHEEL_FL', 'WHEEL_FR', 'WHEEL_RL', 'WHEEL_RR'] as const;
const playerObjectNames = ['STEERING_WHEEL', 'WIPER_L', 'WIPER_R'] as const;
const referenceSedanNames = ['EXTERIOR_ROOT', 'COCKPIT_ROOT', 'DRIVER_EYE'] as const;
const mutableMaterialNames = new Set(['PAINT', 'HEADLIGHT', 'BRAKE', 'BLINKER']);

const requiresPlayerControls = (kind: VehicleAssetKind) => (
  kind !== 'truck' && kind !== 'traffic-compact'
);

const isMesh = (object: THREE.Object3D | undefined): object is THREE.Mesh => (
  object instanceof THREE.Mesh
);

export const bindVehicleAsset = (
  root: THREE.Group,
  kind: VehicleAssetKind,
): BoundVehicleAsset => {
  const missing: string[] = [];
  const meshes = Object.fromEntries(meshNames.map((name) => {
    const object = root.getObjectByName(name);
    if (!isMesh(object)) missing.push(name);
    return [name, object];
  })) as Record<(typeof meshNames)[number], THREE.Mesh | undefined>;

  const objects = Object.fromEntries(objectNames.map((name) => {
    const object = root.getObjectByName(name);
    if (!object) missing.push(name);
    return [name, object];
  })) as Record<(typeof objectNames)[number], THREE.Object3D | undefined>;

  const playerObjects = Object.fromEntries(playerObjectNames.map((name) => {
    const object = root.getObjectByName(name);
    if (requiresPlayerControls(kind) && !object) missing.push(name);
    return [name, object];
  })) as Record<(typeof playerObjectNames)[number], THREE.Object3D | undefined>;

  const referenceObjects = Object.fromEntries(referenceSedanNames.map((name) => {
    const object = root.getObjectByName(name);
    if (kind === 'sedan' && !object) missing.push(name);
    return [name, object];
  })) as Record<(typeof referenceSedanNames)[number], THREE.Object3D | undefined>;

  const bodyMeshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!isMesh(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(({ name }) => name === 'PAINT')) bodyMeshes.push(object);
  });
  if (bodyMeshes.length === 0 && !missing.includes('BODY')) missing.push('PAINT');

  if (missing.length > 0) {
    throw new Error(`${kind} vehicle asset is missing nodes: ${missing.sort().join(', ')}`);
  }

  return {
    group: root,
    exteriorRoot: referenceObjects.EXTERIOR_ROOT,
    cockpitRoot: referenceObjects.COCKPIT_ROOT,
    driverEye: referenceObjects.DRIVER_EYE,
    bodyMeshes,
    frontLeftWheel: objects.WHEEL_FL!,
    frontRightWheel: objects.WHEEL_FR!,
    rearLeftWheel: objects.WHEEL_RL!,
    rearRightWheel: objects.WHEEL_RR!,
    steeringWheelMesh: playerObjects.STEERING_WHEEL,
    wiperLeft: playerObjects.WIPER_L,
    wiperRight: playerObjects.WIPER_R,
    headlights: [meshes.HEADLIGHT_L!, meshes.HEADLIGHT_R!],
    brakeLights: [meshes.BRAKE_L!, meshes.BRAKE_R!],
    frontBlinkers: [meshes.BLINKER_FL!, meshes.BLINKER_FR!],
    rearBlinkers: [meshes.BLINKER_RL!, meshes.BLINKER_RR!],
  };
};

export const cloneVehicleAsset = (
  template: THREE.Group,
  kind: VehicleAssetKind,
  color: THREE.ColorRepresentation,
): BoundVehicleAsset => {
  const group = template.clone(true);
  const materialClones = new Map<THREE.Material, THREE.Material>();

  group.traverse((object) => {
    if (!isMesh(object)) return;
    const cloneMaterial = (material: THREE.Material) => {
      if (!mutableMaterialNames.has(material.name)) return material;
      let cloned = materialClones.get(material);
      if (!cloned) {
        cloned = material.clone();
        if (cloned.name === 'PAINT' && 'color' in cloned && cloned.color instanceof THREE.Color) {
          cloned.color.set(color);
        }
        materialClones.set(material, cloned);
      }
      return cloned;
    };

    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });

  return bindVehicleAsset(group, kind);
};
