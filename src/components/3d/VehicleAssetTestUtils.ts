import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VehicleAssetKind } from './VehicleAssetContract';
import { loadVehicleAssetLibrary } from './VehicleAssetLibrary';

export interface VehicleAssetFixtureOptions {
  kind: VehicleAssetKind;
  referenceCockpit?: boolean;
  playerControls?: boolean;
}

const addFixtureGroup = (root: THREE.Object3D, name: string) => {
  const group = new THREE.Group();
  group.name = name;
  root.add(group);
  return group;
};

const addFixtureMesh = (
  root: THREE.Object3D,
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

export const makeVehicleAssetFixture = ({
  kind,
  referenceCockpit = false,
  playerControls = kind !== 'truck' && kind !== 'traffic-compact',
}: VehicleAssetFixtureOptions): THREE.Group => {
  const root = new THREE.Group();
  root.name = `${kind.toUpperCase()}_ROOT`;

  const exteriorRoot = referenceCockpit ? addFixtureGroup(root, 'EXTERIOR_ROOT') : root;
  const cockpitRoot = referenceCockpit ? addFixtureGroup(root, 'COCKPIT_ROOT') : root;

  addFixtureMesh(exteriorRoot, 'BODY', 'PAINT', 0xffffff);
  addFixtureMesh(exteriorRoot, 'GLASS_FRONT', 'GLASS', 0x1e293b);
  addFixtureMesh(exteriorRoot, 'GLASS_REAR', 'GLASS', 0x1e293b);
  addFixtureMesh(exteriorRoot, 'GLASS_LEFT', 'GLASS', 0x1e293b);
  addFixtureMesh(exteriorRoot, 'GLASS_RIGHT', 'GLASS', 0x1e293b);

  ['WHEEL_FL', 'WHEEL_FR', 'WHEEL_RL', 'WHEEL_RR'].forEach((name) => (
    addFixtureGroup(exteriorRoot, name)
  ));

  addFixtureMesh(exteriorRoot, 'HEADLIGHT_L', 'HEADLIGHT', 0xffffff);
  addFixtureMesh(exteriorRoot, 'HEADLIGHT_R', 'HEADLIGHT', 0xffffff);
  addFixtureMesh(exteriorRoot, 'BRAKE_L', 'BRAKE', 0xff0000);
  addFixtureMesh(exteriorRoot, 'BRAKE_R', 'BRAKE', 0xff0000);
  addFixtureMesh(exteriorRoot, 'BLINKER_FL', 'BLINKER', 0xf59e0b);
  addFixtureMesh(exteriorRoot, 'BLINKER_FR', 'BLINKER', 0xf59e0b);
  addFixtureMesh(exteriorRoot, 'BLINKER_RL', 'BLINKER', 0xf59e0b);
  addFixtureMesh(exteriorRoot, 'BLINKER_RR', 'BLINKER', 0xf59e0b);

  if (playerControls) {
    addFixtureGroup(cockpitRoot, 'STEERING_WHEEL');
    addFixtureGroup(cockpitRoot, 'WIPER_L');
    addFixtureGroup(cockpitRoot, 'WIPER_R');
  }

  if (referenceCockpit) {
    const driverEye = new THREE.Object3D();
    driverEye.name = 'DRIVER_EYE';
    driverEye.position.x = -0.40;
    cockpitRoot.add(driverEye);
  }

  return root;
};

export const loadRealVehicleFamily = async (baseUrl: string) => {
  const previousSelf = Reflect.get(globalThis, 'self');
  const previousCreateImageBitmap = Reflect.get(globalThis, 'createImageBitmap');
  Object.assign(globalThis, {
    self: globalThis,
    createImageBitmap: async () => ({ width: 1, height: 1 }),
  });
  try {
    return await loadVehicleAssetLibrary(baseUrl, async (url) => {
      const filename = url.split('/').at(-1)!;
      const bytes = await readFile(`public/models/vehicles/${filename}`);
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await new GLTFLoader().parseAsync(data, '');
      return gltf.scene;
    });
  } finally {
    if (previousSelf === undefined) Reflect.deleteProperty(globalThis, 'self');
    else Reflect.set(globalThis, 'self', previousSelf);
    if (previousCreateImageBitmap === undefined) {
      Reflect.deleteProperty(globalThis, 'createImageBitmap');
    } else {
      Reflect.set(globalThis, 'createImageBitmap', previousCreateImageBitmap);
    }
  }
};
