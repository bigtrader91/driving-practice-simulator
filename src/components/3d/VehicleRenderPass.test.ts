import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { withVehicleRenderMode } from './VehicleRenderPass';

describe('withVehicleRenderMode', () => {
  it.each([
    ['cockpit', false, true],
    ['external', true, false],
  ] as const)('uses %s visibility and restores it', (mode, exteriorVisible, cockpitVisible) => {
    const exteriorRoot = new THREE.Group();
    const cockpitRoot = new THREE.Group();
    exteriorRoot.visible = true;
    cockpitRoot.visible = false;

    withVehicleRenderMode({ exteriorRoot, cockpitRoot }, mode, () => {
      expect(exteriorRoot.visible).toBe(exteriorVisible);
      expect(cockpitRoot.visible).toBe(cockpitVisible);
    });

    expect(exteriorRoot.visible).toBe(true);
    expect(cockpitRoot.visible).toBe(false);
  });

  it('restores both roots after render throws', () => {
    const exteriorRoot = new THREE.Group();
    const cockpitRoot = new THREE.Group();
    cockpitRoot.visible = false;

    expect(() => withVehicleRenderMode(
      { exteriorRoot, cockpitRoot },
      'cockpit',
      () => { throw new Error('render failed'); },
    )).toThrow('render failed');

    expect([exteriorRoot.visible, cockpitRoot.visible]).toEqual([true, false]);
  });

  it.each([
    ['cockpit', false],
    ['external', true],
  ] as const)('uses whole-car fallback for rootless %s assets and restores it', (mode, visible) => {
    const carGroup = new THREE.Group();
    carGroup.visible = true;

    withVehicleRenderMode({ carGroup }, mode, () => {
      expect(carGroup.visible).toBe(visible);
    });

    expect(carGroup.visible).toBe(true);
  });

  it('restores a rootless car after render throws', () => {
    const carGroup = new THREE.Group();

    expect(() => withVehicleRenderMode(
      { carGroup },
      'cockpit',
      () => { throw new Error('render failed'); },
    )).toThrow('render failed');

    expect(carGroup.visible).toBe(true);
  });
});
