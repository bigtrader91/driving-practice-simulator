import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createRoadMaterialPack } from './RoadMaterialFactory';

describe('createRoadMaterialPack', () => {
  it('creates physically plausible road materials and disposes owned resources once', () => {
    const asphaltTexture = new THREE.Texture();
    const buildingTexture = new THREE.Texture();
    const loader = {
      load: vi.fn((url: string) => url === '/asphalt.jpg' ? asphaltTexture : buildingTexture),
    } as unknown as THREE.TextureLoader;

    const pack = createRoadMaterialPack(loader);

    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(loader.load).toHaveBeenNthCalledWith(1, '/asphalt.jpg');
    expect(loader.load).toHaveBeenNthCalledWith(2, '/building.jpg');
    expect(pack.asphalt).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(pack.building).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(pack.laneWhite).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(pack.laneYellow).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(pack.curb).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(pack.asphalt.map).toBe(asphaltTexture);
    expect(pack.building.map).toBe(buildingTexture);
    expect(asphaltTexture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(buildingTexture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(asphaltTexture.wrapS).toBe(THREE.RepeatWrapping);
    expect(asphaltTexture.wrapT).toBe(THREE.RepeatWrapping);
    expect(buildingTexture.wrapS).toBe(THREE.RepeatWrapping);
    expect(buildingTexture.wrapT).toBe(THREE.RepeatWrapping);
    expect(asphaltTexture.version).toBe(0);
    expect(buildingTexture.version).toBe(0);
    expect(asphaltTexture.anisotropy).toBeLessThanOrEqual(4);
    expect(buildingTexture.anisotropy).toBeLessThanOrEqual(4);
    expect(pack.asphalt.roughness).toBeGreaterThanOrEqual(0.82);
    expect(pack.asphalt.metalness).toBeLessThanOrEqual(0.05);
    expect(pack.building.roughness).toBeGreaterThanOrEqual(0.55);
    expect(pack.building.metalness).toBeLessThanOrEqual(0.15);
    expect(pack.laneWhite.roughness).toBeGreaterThanOrEqual(0.65);
    expect(pack.laneYellow.roughness).toBeGreaterThanOrEqual(0.65);
    expect(pack.laneWhite.polygonOffset).toBe(true);
    expect(pack.laneYellow.polygonOffset).toBe(true);
    expect(pack.laneWhite.opacity).not.toBe(pack.laneYellow.opacity);

    const laneWearTexture = pack.laneWhite.alphaMap;
    expect(laneWearTexture).toBe(pack.laneYellow.alphaMap);
    expect(laneWearTexture).toBeTruthy();
    expect(laneWearTexture!.wrapS).toBe(THREE.RepeatWrapping);
    expect(laneWearTexture!.wrapT).toBe(THREE.RepeatWrapping);
    const alphaLevels = new Set(Array.from(laneWearTexture!.image.data as Uint8Array));
    expect(alphaLevels.size).toBeGreaterThanOrEqual(2);

    const textureDispose = [
      vi.spyOn(asphaltTexture, 'dispose'),
      vi.spyOn(buildingTexture, 'dispose'),
    ];
    const laneWearDispose = vi.spyOn(laneWearTexture!, 'dispose');
    const materialDispose = [
      vi.spyOn(pack.asphalt, 'dispose'),
      vi.spyOn(pack.building, 'dispose'),
      vi.spyOn(pack.laneWhite, 'dispose'),
      vi.spyOn(pack.laneYellow, 'dispose'),
      vi.spyOn(pack.curb, 'dispose'),
    ];

    pack.dispose();
    pack.dispose();

    textureDispose.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(laneWearDispose).toHaveBeenCalledTimes(1);
    materialDispose.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });
});
