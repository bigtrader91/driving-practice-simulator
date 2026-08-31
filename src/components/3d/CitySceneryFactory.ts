import * as THREE from 'three';
import type { EnvironmentQuality } from './EnvironmentQuality';
import type { RoadMaterialPack } from './RoadMaterialFactory';

export type CitySceneryMaterials = Pick<RoadMaterialPack, 'building' | 'curb'>;

export interface CitySceneryPack {
  group: THREE.Group;
  dispose(): void;
}

const BASE_DECORATION_COUNT = 6;

const normalizeVisualVariant = (visualVariant: number) => (
  Number.isFinite(visualVariant) ? Math.max(0, Math.trunc(visualVariant)) : 0
);

const createSeededRandom = (visualVariant: number) => {
  let state = (normalizeVisualVariant(visualVariant) + 0x9e3779b9) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const createWindowTexture = (lit: [number, number, number], shade: [number, number, number]) => {
  const data = new Uint8Array([
    ...lit, 255, ...shade, 255,
    ...shade, 255, ...lit, 255,
  ]);
  const texture = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.needsUpdate = true;
  return texture;
};

const createBeveledBuildingGeometry = () => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, 0.5);
  shape.lineTo(-0.5, 0.5);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 1,
    steps: 1,
  });
  geometry.center();
  geometry.computeVertexNormals();
  geometry.name = 'REFERENCE_BEVELED_BUILDING_GEOMETRY';
  return geometry;
};

const createBuilding = (
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  alternateFacade: boolean,
  buildingGeometry: THREE.BufferGeometry,
  buildingMaterials: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial],
  windowGeometry: THREE.BufferGeometry,
  windowMaterials: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial],
) => {
  const building = new THREE.Group();
  building.name = 'REFERENCE_BUILDING';
  building.position.set(x, height / 2, z);
  building.scale.set(width, height, depth);

  const shell = new THREE.Mesh(
    buildingGeometry,
    buildingMaterials[alternateFacade ? 1 : 0],
  );
  shell.name = 'REFERENCE_BUILDING_SHELL';
  shell.castShadow = true;
  shell.receiveShadow = true;
  building.add(shell);

  // The strips stand in for repeated windows without allocating one mesh per
  // pane. They share both geometry and the two deterministic material variants.
  [-0.28, 0.02, 0.32].forEach((y, index) => {
    const frontWindows = new THREE.Mesh(windowGeometry, windowMaterials[index % 2]);
    frontWindows.name = 'REFERENCE_BUILDING_WINDOWS';
    frontWindows.position.set(0, y, 0.515);
    building.add(frontWindows);

    const rearWindows = new THREE.Mesh(windowGeometry, windowMaterials[(index + 1) % 2]);
    rearWindows.name = 'REFERENCE_BUILDING_WINDOWS';
    rearWindows.position.set(0, y, -0.515);
    rearWindows.rotation.y = Math.PI;
    building.add(rearWindows);
  });

  return building;
};

const createTree = (
  x: number,
  z: number,
  scale: number,
  trunkGeometry: THREE.BufferGeometry,
  canopyGeometry: THREE.BufferGeometry,
  trunkMaterial: THREE.MeshStandardMaterial,
  canopyMaterials: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial],
) => {
  const tree = new THREE.Group();
  tree.name = 'REFERENCE_TREE';
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);

  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.name = 'REFERENCE_TREE_TRUNK';
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  tree.add(trunk);

  const lowerCanopy = new THREE.Mesh(canopyGeometry, canopyMaterials[0]);
  lowerCanopy.name = 'REFERENCE_TREE_CANOPY';
  lowerCanopy.position.y = 2.45;
  lowerCanopy.scale.set(1.15, 0.85, 1.15);
  lowerCanopy.castShadow = true;
  tree.add(lowerCanopy);

  const upperCanopy = new THREE.Mesh(canopyGeometry, canopyMaterials[1]);
  upperCanopy.name = 'REFERENCE_TREE_CANOPY';
  upperCanopy.position.y = 3.45;
  upperCanopy.scale.set(0.82, 0.72, 0.82);
  upperCanopy.castShadow = true;
  tree.add(upperCanopy);

  return tree;
};

const createStreetlight = (
  x: number,
  z: number,
  rightSide: boolean,
  poleGeometry: THREE.BufferGeometry,
  armGeometry: THREE.BufferGeometry,
  bulbGeometry: THREE.BufferGeometry,
  poleMaterial: THREE.MeshStandardMaterial,
  bulbMaterial: THREE.MeshStandardMaterial,
) => {
  const streetlight = new THREE.Group();
  streetlight.name = 'REFERENCE_STREETLIGHT';
  streetlight.position.set(x, 0, z);

  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.name = 'REFERENCE_STREETLIGHT_POLE';
  pole.position.y = 4;
  pole.castShadow = true;

  const arm = new THREE.Mesh(armGeometry, poleMaterial);
  arm.name = 'REFERENCE_STREETLIGHT_ARM';
  arm.position.set(rightSide ? -0.95 : 0.95, 7.8, 0);

  const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
  bulb.name = 'REFERENCE_STREETLIGHT_BULB';
  bulb.position.set(rightSide ? -1.9 : 1.9, 7.58, 0);

  streetlight.add(pole, arm, bulb);
  return streetlight;
};

export const createLaneChangeScenery = (
  quality: EnvironmentQuality,
  materials: CitySceneryMaterials,
  visualVariant: number,
): CitySceneryPack => {
  const group = new THREE.Group();
  group.name = 'REFERENCE_CITY_SCENERY';

  const alternateFacade = materials.building.clone();
  alternateFacade.color.multiplyScalar(0.82);
  alternateFacade.roughness = Math.max(0.55, alternateFacade.roughness);

  const windowTextureA = createWindowTexture([168, 208, 220], [36, 68, 88]);
  const windowTextureB = createWindowTexture([235, 203, 112], [82, 61, 24]);

  const windowMaterials: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial] = [
    new THREE.MeshStandardMaterial({
      map: windowTextureA,
      color: 0xffffff,
      roughness: 0.36,
      metalness: 0.08,
      emissive: 0x172b3d,
      emissiveIntensity: 0.18,
    }),
    new THREE.MeshStandardMaterial({
      map: windowTextureB,
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.05,
      emissive: 0x523d15,
      emissiveIntensity: 0.12,
    }),
  ];
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x56351c, roughness: 0.92 });
  const canopyMaterials: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial] = [
    new THREE.MeshStandardMaterial({ color: 0x2f6b4f, roughness: 0.86 }),
    new THREE.MeshStandardMaterial({ color: 0x4f8f61, roughness: 0.82 }),
  ];
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.82 });
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x53606c, roughness: 0.34, metalness: 0.72 });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff5d1,
    emissive: 0xffd66b,
    emissiveIntensity: 0.75,
    roughness: 0.28,
  });

  const buildingGeometry = createBeveledBuildingGeometry();
  const windowGeometry = new THREE.BoxGeometry(0.78, 0.045, 0.025);
  windowGeometry.name = 'REFERENCE_BUILDING_WINDOW_GEOMETRY';
  const sidewalkGeometry = new THREE.BoxGeometry(1, 0.16, 1);
  sidewalkGeometry.name = 'REFERENCE_SIDEWALK_GEOMETRY';
  const curbGeometry = new THREE.BoxGeometry(1, 0.2, 1);
  curbGeometry.name = 'REFERENCE_CURB_GEOMETRY';
  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.27, 2.4, 10);
  trunkGeometry.name = 'REFERENCE_TREE_TRUNK_GEOMETRY';
  const canopyGeometry = new THREE.IcosahedronGeometry(1.35, 1);
  canopyGeometry.name = 'REFERENCE_TREE_CANOPY_GEOMETRY';
  const poleGeometry = new THREE.CylinderGeometry(0.1, 0.14, 8, 12);
  poleGeometry.name = 'REFERENCE_STREETLIGHT_POLE_GEOMETRY';
  const armGeometry = new THREE.BoxGeometry(2.25, 0.12, 0.12);
  armGeometry.name = 'REFERENCE_STREETLIGHT_ARM_GEOMETRY';
  const bulbGeometry = new THREE.SphereGeometry(0.22, 12, 12);
  bulbGeometry.name = 'REFERENCE_STREETLIGHT_BULB_GEOMETRY';

  const random = createSeededRandom(visualVariant);
  const decorationCount = Math.round(BASE_DECORATION_COUNT * quality.sceneryDensity);

  for (let index = 0; index < decorationCount; index += 1) {
    const z = 135 - index * 52 + Math.round(random() * 12) - 6;
    const leftHeight = 22 + Math.round(random() * 24);
    const rightHeight = 24 + Math.round(random() * 26);
    const leftX = -25 - Math.round(random() * 2) * 3;
    const rightX = 25 + Math.round(random() * 2) * 3;
    const segment = new THREE.Group();
    segment.name = `REFERENCE_CITY_DECORATION_${index}`;

    segment.add(
      createBuilding(leftX, 0, 13, 20, leftHeight, random() > 0.5, buildingGeometry, [materials.building, alternateFacade], windowGeometry, windowMaterials),
      createBuilding(rightX, -12, 13, 20, rightHeight, random() > 0.5, buildingGeometry, [materials.building, alternateFacade], windowGeometry, windowMaterials),
    );

    [-15.8, 15.8].forEach((x, sideIndex) => {
      const sidewalk = new THREE.Mesh(sidewalkGeometry, sidewalkMaterial);
      sidewalk.name = 'REFERENCE_SIDEWALK';
      sidewalk.position.set(x, 0.08, sideIndex === 0 ? 0 : -12);
      sidewalk.scale.set(6.4, 1, 20);
      sidewalk.receiveShadow = true;
      segment.add(sidewalk);

      const curb = new THREE.Mesh(curbGeometry, materials.curb);
      curb.name = 'REFERENCE_CURB';
      curb.position.set(sideIndex === 0 ? -12.45 : 12.45, 0.1, sideIndex === 0 ? 0 : -12);
      curb.scale.set(0.35, 1, 20);
      curb.receiveShadow = true;
      segment.add(curb);
    });

    segment.add(
      createTree(-16 - Math.round(random()) * 1.2, -18, 0.9 + random() * 0.2, trunkGeometry, canopyGeometry, trunkMaterial, canopyMaterials),
      createTree(16 + Math.round(random()) * 1.2, 12, 0.9 + random() * 0.2, trunkGeometry, canopyGeometry, trunkMaterial, canopyMaterials),
      createStreetlight(-13.2, 5, false, poleGeometry, armGeometry, bulbGeometry, poleMaterial, bulbMaterial),
      createStreetlight(13.2, -21, true, poleGeometry, armGeometry, bulbGeometry, poleMaterial, bulbMaterial),
    );

    segment.position.z = z;
    group.add(segment);
  }

  const ownedGeometries = [
    buildingGeometry,
    windowGeometry,
    sidewalkGeometry,
    curbGeometry,
    trunkGeometry,
    canopyGeometry,
    poleGeometry,
    armGeometry,
    bulbGeometry,
  ];
  const ownedMaterials = [
    alternateFacade,
    ...windowMaterials,
    trunkMaterial,
    ...canopyMaterials,
    sidewalkMaterial,
    poleMaterial,
    bulbMaterial,
  ];
  const ownedTextures = [windowTextureA, windowTextureB];
  let disposed = false;

  return {
    group,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      ownedGeometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      ownedTextures.forEach((texture) => texture.dispose());
    },
  };
};
