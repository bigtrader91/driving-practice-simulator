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

    const { trackGroup, signals } = buildTrackScene(mission!);

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
