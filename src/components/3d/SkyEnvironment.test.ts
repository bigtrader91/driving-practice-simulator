import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SkyEnvironment } from './SkyEnvironment';

const horizonSnapshot = (variant: number) => (
  SkyEnvironment.createCityHorizon(variant).children.map((object) => {
    const mesh = object as THREE.Mesh<THREE.BoxGeometry>;
    const { width, height, depth } = mesh.geometry.parameters;
    return {
      width,
      height,
      depth,
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
    };
  })
);

describe('SkyEnvironment city horizon', () => {
  it('같은 시각 변형은 같은 스카이라인을 만들고 다른 변형은 다르게 만든다', () => {
    expect(horizonSnapshot(3)).toEqual(horizonSnapshot(3));
    expect(horizonSnapshot(3)).not.toEqual(horizonSnapshot(4));
  });
});
