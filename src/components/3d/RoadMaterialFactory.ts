import * as THREE from 'three';

export interface RoadMaterialPack {
  asphalt: THREE.MeshStandardMaterial;
  building: THREE.MeshStandardMaterial;
  laneWhite: THREE.MeshStandardMaterial;
  laneYellow: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  dispose(): void;
}

type TextureLoaderLike = Pick<THREE.TextureLoader, 'load'>;

const createLaneWearTexture = () => {
  const alphaLevels = [255, 214, 168, 232, 190, 255, 148, 220];
  const data = new Uint8Array(alphaLevels.flatMap((level) => [255, level, 255, level]));
  const texture = new THREE.DataTexture(data, alphaLevels.length, 1, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  texture.needsUpdate = true;
  return texture;
};

const configureReferenceTexture = (texture: THREE.Texture, repeatX: number, repeatY: number) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
};

export const createRoadMaterialPack = (loader: TextureLoaderLike): RoadMaterialPack => {
  const asphaltTexture = configureReferenceTexture(loader.load('/asphalt.jpg'), 8, 60);
  const buildingTexture = configureReferenceTexture(loader.load('/building.jpg'), 2, 6);
  const laneWearTexture = createLaneWearTexture();

  const asphalt = new THREE.MeshStandardMaterial({
    map: asphaltTexture,
    roughness: 0.88,
    metalness: 0.02,
  });
  const building = new THREE.MeshStandardMaterial({
    map: buildingTexture,
    roughness: 0.62,
    metalness: 0.08,
  });
  const laneWhite = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    alphaMap: laneWearTexture,
    roughness: 0.72,
    metalness: 0,
    transparent: true,
    opacity: 0.94,
    alphaTest: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const laneYellow = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    alphaMap: laneWearTexture,
    roughness: 0.7,
    metalness: 0,
    transparent: true,
    opacity: 0.9,
    alphaTest: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const curb = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.68,
    metalness: 0.02,
  });

  let disposed = false;
  return {
    asphalt,
    building,
    laneWhite,
    laneYellow,
    curb,
    dispose: () => {
      if (disposed) return;
      disposed = true;

      asphalt.dispose();
      building.dispose();
      laneWhite.dispose();
      laneYellow.dispose();
      curb.dispose();

      // A custom loader may return the same texture for both paths. Dispose
      // each factory-owned texture at most once in that case.
      const textures = new Set([asphaltTexture, buildingTexture, laneWearTexture]);
      textures.forEach((texture) => texture.dispose());
    },
  };
};
