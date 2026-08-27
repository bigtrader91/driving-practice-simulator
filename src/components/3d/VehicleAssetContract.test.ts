import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  bindVehicleAsset,
  cloneVehicleAsset,
  type VehicleAssetKind,
} from './VehicleAssetContract';

const addGroup = (root: THREE.Group, name: string) => {
  const group = new THREE.Group();
  group.name = name;
  root.add(group);
  return group;
};

const addMesh = (
  root: THREE.Group,
  name: string,
  materialName: string,
  color: number,
) => {
  const material = new THREE.MeshStandardMaterial({ color });
  material.name = materialName;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  root.add(mesh);
  return mesh;
};

const makeCompleteAsset = (
  kind: VehicleAssetKind,
  { playerControls = kind !== 'truck' } = {},
) => {
  const root = new THREE.Group();
  root.name = `${kind.toUpperCase()}_ROOT`;

  addMesh(root, 'BODY', 'PAINT', 0xffffff);
  addMesh(root, 'GLASS_FRONT', 'GLASS', 0x1e293b);
  addMesh(root, 'GLASS_REAR', 'GLASS', 0x1e293b);
  addMesh(root, 'GLASS_LEFT', 'GLASS', 0x1e293b);
  addMesh(root, 'GLASS_RIGHT', 'GLASS', 0x1e293b);

  ['WHEEL_FL', 'WHEEL_FR', 'WHEEL_RL', 'WHEEL_RR'].forEach((name) => addGroup(root, name));

  addMesh(root, 'HEADLIGHT_L', 'HEADLIGHT', 0xffffff);
  addMesh(root, 'HEADLIGHT_R', 'HEADLIGHT', 0xffffff);
  addMesh(root, 'BRAKE_L', 'BRAKE', 0xff0000);
  addMesh(root, 'BRAKE_R', 'BRAKE', 0xff0000);
  addMesh(root, 'BLINKER_FL', 'BLINKER', 0xf59e0b);
  addMesh(root, 'BLINKER_FR', 'BLINKER', 0xf59e0b);
  addMesh(root, 'BLINKER_RL', 'BLINKER', 0xf59e0b);
  addMesh(root, 'BLINKER_RR', 'BLINKER', 0xf59e0b);

  if (playerControls) {
    addGroup(root, 'STEERING_WHEEL');
    addGroup(root, 'WIPER_L');
    addGroup(root, 'WIPER_R');
  }

  return root;
};

describe('vehicle asset contract', () => {
  it('rejects an asset that omits a required wheel', () => {
    const root = makeCompleteAsset('sedan');
    root.remove(root.getObjectByName('WHEEL_FR')!);

    expect(() => bindVehicleAsset(root, 'sedan')).toThrow(
      'sedan vehicle asset is missing nodes: WHEEL_FR',
    );
  });

  it('requires player controls on selectable cars but not on a truck', () => {
    const player = makeCompleteAsset('sedan');
    player.remove(player.getObjectByName('STEERING_WHEEL')!);

    expect(() => bindVehicleAsset(player, 'sedan')).toThrow(
      'sedan vehicle asset is missing nodes: STEERING_WHEEL',
    );

    const truck = makeCompleteAsset('truck', { playerControls: false });
    expect(bindVehicleAsset(truck, 'truck').steeringWheelMesh).toBeUndefined();
  });

  it('accepts a traffic compact asset without player-only controls', () => {
    const root = makeCompleteAsset('traffic-compact', { playerControls: false });
    const bound = bindVehicleAsset(root, 'traffic-compact');

    expect(bound.frontLeftWheel.name).toBe('WHEEL_FL');
    expect(bound.steeringWheelMesh).toBeUndefined();
    expect(bound.wiperLeft).toBeUndefined();
    expect(bound.wiperRight).toBeUndefined();
  });

  it('still rejects a traffic compact asset with a missing wheel', () => {
    const root = makeCompleteAsset('traffic-compact', { playerControls: false });
    root.remove(root.getObjectByName('WHEEL_RR')!);

    expect(() => bindVehicleAsset(root, 'traffic-compact')).toThrow(
      'traffic-compact vehicle asset is missing nodes: WHEEL_RR',
    );
  });

  it('isolates mutable paint and lamp materials while sharing geometry', () => {
    const template = makeCompleteAsset('sedan');
    const blue = cloneVehicleAsset(template, 'sedan', 0x2563eb);
    const red = cloneVehicleAsset(template, 'sedan', 0xdc2626);

    expect(blue.bodyMeshes[0].geometry).toBe(red.bodyMeshes[0].geometry);
    expect(blue.bodyMeshes[0].material).not.toBe(red.bodyMeshes[0].material);
    expect((blue.bodyMeshes[0].material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x2563eb);
    expect((red.bodyMeshes[0].material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xdc2626);
    expect(blue.headlights[0].material).not.toBe(red.headlights[0].material);
    expect(blue.brakeLights[0].material).not.toBe(red.brakeLights[0].material);
    expect(blue.frontBlinkers[0].material).not.toBe(red.frontBlinkers[0].material);
  });
});
