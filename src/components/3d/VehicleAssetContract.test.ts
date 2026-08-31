import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  bindVehicleAsset,
  cloneVehicleAsset,
  type VehicleAssetKind,
} from './VehicleAssetContract';
import { makeVehicleAssetFixture } from './VehicleAssetTestUtils';

const makeCompleteAsset = (
  kind: VehicleAssetKind,
  { playerControls = kind !== 'truck' } = {},
) => makeVehicleAssetFixture({
  kind,
  playerControls,
  referenceCockpit: kind === 'sedan',
});

describe('vehicle asset contract', () => {
  it('binds the sedan exterior, cockpit, and driver eye', () => {
    const fixture = makeVehicleAssetFixture({ kind: 'sedan', referenceCockpit: true });
    const bound = bindVehicleAsset(fixture, 'sedan');

    expect(bound.exteriorRoot?.name).toBe('EXTERIOR_ROOT');
    expect(bound.cockpitRoot?.name).toBe('COCKPIT_ROOT');
    expect(bound.driverEye?.name).toBe('DRIVER_EYE');
  });

  it.each(['EXTERIOR_ROOT', 'COCKPIT_ROOT', 'DRIVER_EYE'])
    ('rejects sedan without %s', (name) => {
      const fixture = makeVehicleAssetFixture({ kind: 'sedan', referenceCockpit: true });
      const object = fixture.getObjectByName(name)!;
      object.parent?.remove(object);

      expect(() => bindVehicleAsset(fixture, 'sedan')).toThrow(
        new RegExp(`sedan vehicle asset is missing nodes: .*${name}`),
      );
    });

  it('rejects an asset that omits a required wheel', () => {
    const root = makeCompleteAsset('sedan');
    root.getObjectByName('WHEEL_FR')!.parent?.remove(root.getObjectByName('WHEEL_FR')!);

    expect(() => bindVehicleAsset(root, 'sedan')).toThrow(
      'sedan vehicle asset is missing nodes: WHEEL_FR',
    );
  });

  it('requires player controls on selectable cars but not on a truck', () => {
    const player = makeCompleteAsset('sedan');
    player.getObjectByName('STEERING_WHEEL')!.parent?.remove(
      player.getObjectByName('STEERING_WHEEL')!,
    );

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
    root.getObjectByName('WHEEL_RR')!.parent?.remove(root.getObjectByName('WHEEL_RR')!);

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
