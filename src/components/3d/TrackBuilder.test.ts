import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MISSIONS } from '../../constants/missions';
import { RoadTextureGenerator } from './RoadTextures';
import { buildTrackScene } from './TrackBuilder';

describe('buildTrackScene city_traffic signals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('NS와 EW 접근 방향에 각각 독립된 신호등 폴을 2개씩 만든다', () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(new THREE.Texture());
    vi.spyOn(RoadTextureGenerator, 'createSchoolZoneTexture')
      .mockReturnValue(new THREE.Texture() as THREE.CanvasTexture);

    const mission = MISSIONS.find(({ id }) => id === 'city_traffic');
    expect(mission).toBeDefined();

    const { trackGroup, signals } = buildTrackScene(mission!, () => new THREE.Group());

    expect(signals.map(({ axis }) => axis).sort()).toEqual(['EW', 'EW', 'NS', 'NS']);
    expect(new Set(signals.map(({ lamps }) => lamps.red)).size).toBe(4);
    expect(new Set(signals.map(({ lamps }) => lamps.yellow)).size).toBe(4);
    expect(new Set(signals.map(({ lamps }) => lamps.green)).size).toBe(4);

    const placements = signals.map((rig) => {
      let lampMesh: THREE.Mesh | undefined;
      trackGroup.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material === rig.lamps.red) {
          lampMesh = object;
        }
      });
      expect(lampMesh).toBeDefined();

      const signalGroup = lampMesh!.parent!;
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(signalGroup.quaternion);
      const rounded = (value: number) => Number(value.toFixed(3));

      return {
        axis: rig.axis,
        x: signalGroup.position.x,
        z: signalGroup.position.z,
        facingX: rounded(facing.x),
        facingZ: rounded(facing.z),
      };
    });

    expect(placements).toEqual([
      { axis: 'NS', x: 13, z: 38.5, facingX: 0, facingZ: 1 },
      { axis: 'NS', x: -13, z: 21.5, facingX: 0, facingZ: -1 },
      { axis: 'EW', x: -13, z: 38.5, facingX: -1, facingZ: 0 },
      { axis: 'EW', x: 13, z: 21.5, facingX: 1, facingZ: 0 },
    ]);
  });
});

describe('buildTrackScene parked vehicles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the supplied GLB clone factory while preserving literal collision boxes', () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(new THREE.Texture());
    const createParkedVehicle = vi.fn((color: number) => {
      const group = new THREE.Group();
      group.name = `LOADED_PARKED_${color.toString(16)}`;
      return group;
    });
    const mission = MISSIONS.find(({ id }) => id === 'parking_reverse');
    expect(mission).toBeDefined();

    const { trackGroup, obstacles } = buildTrackScene(mission!, createParkedVehicle);

    expect(createParkedVehicle.mock.calls.map(([color]) => color)).toEqual([0xdc2626, 0x475569]);
    const parked = trackGroup.children.filter(({ name }) => name.startsWith('LOADED_PARKED_'));
    expect(parked.map(({ position, rotation }) => [position.x, position.z, rotation.y])).toEqual([
      [-3.2, -12, Math.PI],
      [3.2, -12, Math.PI],
    ]);
    expect(obstacles.filter(({ name }) => name.includes('주차 차량'))).toMatchObject([
      { x: -3.2, z: -12, width: 1.9, depth: 4.7 },
      { x: 3.2, z: -12, width: 1.9, depth: 4.7 },
    ]);
  });
});

describe('buildTrackScene lane-change visual variants', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('도로 판정 조건은 유지하면서 시도별 도로변 배치를 결정적으로 바꾼다', () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(new THREE.Texture());
    vi.spyOn(RoadTextureGenerator, 'createSchoolZoneTexture')
      .mockReturnValue(new THREE.Texture() as THREE.CanvasTexture);
    vi.spyOn(RoadTextureGenerator, 'createDiamondMarkerTexture')
      .mockReturnValue(new THREE.Texture() as THREE.CanvasTexture);
    const baseMission = MISSIONS.find(({ id }) => id === 'city_lane_change');
    expect(baseMission).toBeDefined();

    const first = buildTrackScene(
      { ...baseMission!, visualVariant: 0 },
      () => new THREE.Group(),
    );
    const second = buildTrackScene(
      { ...baseMission!, visualVariant: 1 },
      () => new THREE.Group(),
    );
    const repeat = buildTrackScene(
      { ...baseMission!, visualVariant: 1 },
      () => new THREE.Group(),
    );
    const snapshot = (trackGroup: THREE.Group) => {
      const scenery = trackGroup.getObjectByName('LANE_CHANGE_SCENERY');
      expect(scenery).toBeDefined();
      return scenery!.children.map(({ name, position, scale }) => ({
        name,
        x: position.x,
        z: position.z,
        scaleY: scale.y,
      }));
    };

    expect(snapshot(first.trackGroup)).not.toEqual(snapshot(second.trackGroup));
    expect(snapshot(first.trackGroup)).not.toHaveLength(snapshot(second.trackGroup).length);
    expect(snapshot(second.trackGroup)).toEqual(snapshot(repeat.trackGroup));
    expect(first.obstacles).toEqual(second.obstacles);
    expect([
      first.goalMesh?.position.x,
      first.goalMesh?.position.z,
    ]).toEqual([
      second.goalMesh?.position.x,
      second.goalMesh?.position.z,
    ]);
  });
});
