import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ENVIRONMENT_QUALITY } from './EnvironmentQuality';
import { createLaneChangeScenery } from './CitySceneryFactory';

const materials = {
  building: new THREE.MeshStandardMaterial({ color: 0x64748b }),
  curb: new THREE.MeshStandardMaterial({ color: 0xd1d5db }),
};

const snapshot = (group: THREE.Group) => group.children.map((segment) => ({
  name: segment.name,
  x: segment.position.x,
  z: segment.position.z,
  scaleY: segment.scale.y,
}));

const descendantsWithName = (group: THREE.Group, name: string) => {
  const matches: THREE.Object3D[] = [];
  group.traverse((object) => {
    if (object.name === name) matches.push(object);
  });
  return matches;
};

describe('createLaneChangeScenery', () => {
  it('uses fewer decorations in balanced mode without changing deterministic placement', () => {
    const high = createLaneChangeScenery(ENVIRONMENT_QUALITY.high, materials, 2);
    const balanced = createLaneChangeScenery(ENVIRONMENT_QUALITY.balanced, materials, 2);

    expect(high.group.name).toBe('REFERENCE_CITY_SCENERY');
    expect(balanced.group.name).toBe('REFERENCE_CITY_SCENERY');
    expect(balanced.group.children.length).toBeLessThan(high.group.children.length);
    expect(snapshot(createLaneChangeScenery(ENVIRONMENT_QUALITY.high, materials, 2).group))
      .toEqual(snapshot(high.group));
    expect(snapshot(createLaneChangeScenery(ENVIRONMENT_QUALITY.high, materials, -10).group))
      .toEqual(snapshot(createLaneChangeScenery(ENVIRONMENT_QUALITY.high, materials, 0).group));
  });

  it('shares repeated building and tree geometry while keeping caller materials owned by the caller', () => {
    const pack = createLaneChangeScenery(ENVIRONMENT_QUALITY.high, materials, 5);
    const shells = descendantsWithName(pack.group, 'REFERENCE_BUILDING_SHELL') as THREE.Mesh[];
    const trunks = descendantsWithName(pack.group, 'REFERENCE_TREE_TRUNK') as THREE.Mesh[];
    const canopies = descendantsWithName(pack.group, 'REFERENCE_TREE_CANOPY') as THREE.Mesh[];
    const sidewalks = descendantsWithName(pack.group, 'REFERENCE_SIDEWALK') as THREE.Mesh[];
    const curbs = descendantsWithName(pack.group, 'REFERENCE_CURB') as THREE.Mesh[];

    expect(shells.length).toBeGreaterThan(1);
    expect(trunks.length).toBeGreaterThan(1);
    expect(canopies.length).toBeGreaterThan(1);
    expect(new Set(shells.map(({ geometry }) => geometry)).size).toBe(1);
    expect(new Set(trunks.map(({ geometry }) => geometry)).size).toBe(1);
    expect(new Set(canopies.map(({ geometry }) => geometry)).size).toBe(1);
    expect(new Set(sidewalks.map(({ geometry }) => geometry)).size).toBe(1);
    expect(new Set(curbs.map(({ geometry }) => geometry)).size).toBe(1);

    const callerBuildingDispose = vi.spyOn(materials.building, 'dispose');
    const callerCurbDispose = vi.spyOn(materials.curb, 'dispose');
    const ownGeometryDispose = vi.spyOn(shells[0].geometry, 'dispose');
    pack.dispose();
    pack.dispose();

    expect(ownGeometryDispose).toHaveBeenCalledTimes(1);
    expect(callerBuildingDispose).not.toHaveBeenCalled();
    expect(callerCurbDispose).not.toHaveBeenCalled();
  });

  it('uses two shared window texture variations', () => {
    const pack = createLaneChangeScenery(ENVIRONMENT_QUALITY.high, materials, 1);
    const windows = descendantsWithName(pack.group, 'REFERENCE_BUILDING_WINDOWS') as THREE.Mesh[];
    const windowMaterials = [...new Set(windows.map(({ material }) => material))] as THREE.MeshStandardMaterial[];

    expect(windowMaterials).toHaveLength(2);
    expect(windowMaterials.every((material) => material instanceof THREE.MeshStandardMaterial)).toBe(true);
    expect(windowMaterials.every((material) => material.map instanceof THREE.Texture)).toBe(true);
    expect(new Set(windowMaterials.map(({ map }) => map)).size).toBe(2);

    pack.dispose();
  });
});
