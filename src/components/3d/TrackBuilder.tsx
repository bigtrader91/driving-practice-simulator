import * as THREE from 'three';
import { Mission, TrafficVehicleData, TrafficDriverBehavior } from '../../types/simulator';
import { RoadTextureGenerator } from './RoadTextures';
import { SkyEnvironment } from './SkyEnvironment';

export interface CollisionObstacle {
  type: 'box' | 'cylinder';
  x: number;
  z: number;
  radius?: number;
  width?: number;
  depth?: number;
  name: string;
  isPenaltyTrigger?: boolean;
}

export interface TrafficSignalRig {
  axis: 'NS' | 'EW';
  lamps: {
    red: THREE.MeshStandardMaterial;
    yellow: THREE.MeshStandardMaterial;
    green: THREE.MeshStandardMaterial;
  };
}

export const buildTrackScene = (mission: Mission): {
  trackGroup: THREE.Group;
  obstacles: CollisionObstacle[];
  initialTraffic: TrafficVehicleData[];
  goalMesh?: THREE.Mesh;
  signals: TrafficSignalRig[];
} => {
  const group = new THREE.Group();
  const obstacles: CollisionObstacle[] = [];
  const initialTraffic: TrafficVehicleData[] = [];
  const signals: TrafficSignalRig[] = [];

  const textureLoader = new THREE.TextureLoader();

  // 1. Add Realistic SkyDome & Distant Metropolis Horizon
  const skyDome = SkyEnvironment.createSkyDome();
  group.add(skyDome);

  const cityHorizon = SkyEnvironment.createCityHorizon();
  group.add(cityHorizon);

  // Load asphalt texture with high tiling
  const asphaltTex = textureLoader.load('/asphalt.jpg');
  asphaltTex.wrapS = THREE.RepeatWrapping;
  asphaltTex.wrapT = THREE.RepeatWrapping;
  asphaltTex.repeat.set(8, 60);

  // Load building facade texture
  const buildingTex = textureLoader.load('/building.jpg');
  buildingTex.wrapS = THREE.RepeatWrapping;
  buildingTex.wrapT = THREE.RepeatWrapping;
  buildingTex.repeat.set(2, 6);

  // Materials
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.85,
    metalness: 0.1,
  });

  const buildingMat = new THREE.MeshStandardMaterial({
    map: buildingTex,
    roughness: 0.2,
    metalness: 0.8,
  });

  const laneYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const laneWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const laneDashedMat = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.6 });
  const guardrailMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x1c3a27, roughness: 0.95 });
  const coneOrangeMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.4 });
  const coneWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const catEyeMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  // Ground Grass Plane
  const grassGeo = new THREE.PlaneGeometry(1000, 1000);
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.05;
  grass.receiveShadow = true;
  group.add(grass);

  // Helper: Create a traffic cone
  const createCone = (x: number, z: number, name = '라바콘') => {
    const coneGroup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), coneOrangeMat);
    base.position.y = 0.02;
    coneGroup.add(base);

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.72, 16), coneOrangeMat);
    body.position.y = 0.38;
    coneGroup.add(body);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.105, 0.16, 16), coneWhiteMat);
    stripe.position.y = 0.44;
    coneGroup.add(stripe);

    coneGroup.position.set(x, 0, z);
    group.add(coneGroup);

    obstacles.push({
      type: 'cylinder',
      x,
      z,
      radius: 0.22,
      name,
      isPenaltyTrigger: true,
    });
  };

  // Helper: Create a realistic streetlight post with glowing bulb
  const createStreetLight = (x: number, z: number, isRightSide: boolean) => {
    const lightG = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 8, 12), guardrailMat);
    pole.position.set(0, 4, 0);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), guardrailMat);
    arm.position.set(isRightSide ? -1.0 : 1.0, 7.8, 0);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb })
    );
    bulb.position.set(isRightSide ? -2.0 : 2.0, 7.6, 0);

    lightG.add(pole);
    lightG.add(arm);
    lightG.add(bulb);
    lightG.position.set(x, 0, z);
    group.add(lightG);
  };

  // Helper: Create a roadside tree
  const createTree = (x: number, z: number) => {
    const treeG = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x582f0e, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.5, 8), trunkMat);
    trunk.position.y = 1.25;
    const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 1), leafMat);
    leaves.position.y = 3.3;

    treeG.add(trunk);
    treeG.add(leaves);
    treeG.position.set(x, 0, z);
    group.add(treeG);
  };

  // Helper: Create high-rise city skyscrapers along the road
  const createSkyscraper = (x: number, z: number, w: number, d: number, h: number) => {
    const bMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
    bMesh.position.set(x, h / 2, z);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    group.add(bMesh);

    const roofBox = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.8, d * 0.4), guardrailMat);
    roofBox.position.set(x, h + 0.9, z);
    group.add(roofBox);
  };

  // Helper: Create a parked obstacle car
  const createParkedCar = (x: number, z: number, heading: number, color: number, name = '주차 차량') => {
    const carG = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.65, 4.65), mat);
    body.position.y = 0.45;
    body.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.5), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.1 }));
    cabin.position.set(0, 0.95, -0.2);
    carG.add(body);
    carG.add(cabin);

    carG.position.set(x, 0, z);
    carG.rotation.y = heading;
    group.add(carG);

    obstacles.push({
      type: 'box',
      x,
      z,
      width: 1.9,
      depth: 4.7,
      name,
      isPenaltyTrigger: true,
    });
  };

  // Helper: Target Goal Mesh
  let goalMesh: THREE.Mesh | undefined;
  if (mission.targetArea) {
    const { x, z, width, depth } = mission.targetArea;
    const goalGeo = new THREE.PlaneGeometry(width, depth);
    const goalMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    goalMesh = new THREE.Mesh(goalGeo, goalMat);
    goalMesh.rotation.x = -Math.PI / 2;
    goalMesh.position.set(x, 0.03, z);
    group.add(goalMesh);

    const edges = new THREE.EdgesGeometry(goalGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4ade80, linewidth: 3 });
    const outline = new THREE.LineSegments(edges, lineMat);
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(x, 0.04, z);
    group.add(outline);
  }

  // 1. 6-LANE HIGHWAY & EXPRESS BOULEVARD (Mission: highway_5lane)
  if (mission.id === 'highway_5lane') {
    const laneWidth = 3.6;
    const numLanes = 6;
    const roadWidth = laneWidth * numLanes; // 21.6m
    const roadLength = 600;

    const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadLength), asphaltMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 0);
    road.receiveShadow = true;
    group.add(road);

    const leftGuardX = -roadWidth / 2 - 0.5;
    const rightGuardX = roadWidth / 2 + 0.5;
    [-roadWidth / 2 - 0.25, roadWidth / 2 + 0.25].forEach((gx) => {
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, roadLength), guardrailMat);
      guard.position.set(gx, 0.425, 0);
      group.add(guard);
      obstacles.push({ type: 'box', x: gx, z: 0, width: 0.3, depth: roadLength, name: '고속도로 가드레일', isPenaltyTrigger: true });
    });

    const leftSolid = new THREE.Mesh(new THREE.PlaneGeometry(0.22, roadLength), laneYellowMat);
    leftSolid.rotation.x = -Math.PI / 2;
    leftSolid.position.set(-roadWidth / 2 + 0.18, 0.02, 0);
    const rightSolid = new THREE.Mesh(new THREE.PlaneGeometry(0.22, roadLength), laneWhiteMat);
    rightSolid.rotation.x = -Math.PI / 2;
    rightSolid.position.set(roadWidth / 2 - 0.18, 0.02, 0);
    group.add(leftSolid);
    group.add(rightSolid);

    const laneDividers = [-7.2, -3.6, 0, 3.6, 7.2];
    laneDividers.forEach((lx) => {
      for (let lz = 280; lz >= -280; lz -= 9) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 5.0), laneDashedMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(lx, 0.02, lz);
        group.add(dash);

        const catEye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.18), catEyeMat);
        catEye.position.set(lx, 0.025, lz + 2.5);
        group.add(catEye);
      }
    });

    // Real Korean Road Markings on Highway (Straight Arrows & 80km Speed Limits on road)
    const arrowStraightTex = RoadTextureGenerator.createRoadArrowTexture('straight');
    const speed80Tex = RoadTextureGenerator.createSpeedLimitTexture(80);
    const arrowMergeTex = RoadTextureGenerator.createRoadArrowTexture('merge');

    const laneCenters = [-9.0, -5.4, -1.8, 1.8, 5.4, 9.0];

    // Paint Road Markings along lanes
    [-100, 50, 180].forEach((pz) => {
      laneCenters.forEach((lc, lIdx) => {
        // Road Arrow
        const arrowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2.0, 4.0),
          new THREE.MeshBasicMaterial({ map: lIdx === 5 ? arrowMergeTex : arrowStraightTex, transparent: true })
        );
        arrowMesh.rotation.x = -Math.PI / 2;
        arrowMesh.position.set(lc, 0.025, pz);
        group.add(arrowMesh);

        // Speed limit circle on road
        if (lIdx === 1 || lIdx === 3) {
          const speedMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 2.4),
            new THREE.MeshBasicMaterial({ map: speed80Tex, transparent: true })
          );
          speedMesh.rotation.x = -Math.PI / 2;
          speedMesh.position.set(lc, 0.025, pz - 25);
          group.add(speedMesh);
        }
      });
    });

    // High-Rise City Skyline Buildings lining both sides of the expressway
    for (let bz = 250; bz >= -250; bz -= 45) {
      const bhLeft = 35 + Math.random() * 45;
      const bhRight = 35 + Math.random() * 45;
      createSkyscraper(-roadWidth / 2 - 18, bz, 22, 28, bhLeft);
      createSkyscraper(roadWidth / 2 + 18, bz, 22, 28, bhRight);

      createStreetLight(leftGuardX, bz + 10, false);
      createStreetLight(rightGuardX, bz + 10, true);
      createTree(-roadWidth / 2 - 4, bz + 22);
      createTree(roadWidth / 2 + 4, bz + 22);
    }

    // Overhead Korean Highway Direction Sign Gantry
    const gantryGroup = new THREE.Group();
    const gantryPoleLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8.5, 16), guardrailMat);
    gantryPoleLeft.position.set(leftGuardX, 4.25, 40);
    const gantryPoleRight = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8.5, 16), guardrailMat);
    gantryPoleRight.position.set(rightGuardX, 4.25, 40);
    const gantryBeam = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 3, 0.7, 0.7), guardrailMat);
    gantryBeam.position.set(0, 8.0, 40);

    const signTex1 = RoadTextureGenerator.createHighwaySignTexture('판교 · 분당', 'Pangyo · Bundang (1~3차로)');
    const signTex2 = RoadTextureGenerator.createHighwaySignTexture('서울 · 강남', 'Seoul · Gangnam (4~6차로)');

    const signBoard1 = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 2.8, 0.12),
      new THREE.MeshBasicMaterial({ map: signTex1 })
    );
    signBoard1.position.set(-5.0, 8.0, 39.8);
    signBoard1.rotation.y = Math.PI;

    const signBoard2 = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 2.8, 0.12),
      new THREE.MeshBasicMaterial({ map: signTex2 })
    );
    signBoard2.position.set(5.0, 8.0, 39.8);
    signBoard2.rotation.y = Math.PI;

    gantryGroup.add(gantryPoleLeft);
    gantryGroup.add(gantryPoleRight);
    gantryGroup.add(gantryBeam);
    gantryGroup.add(signBoard1);
    gantryGroup.add(signBoard2);
    group.add(gantryGroup);

    // Spawn Dynamic AI Traffic Vehicles
    const colors = [0x2563eb, 0xdc2626, 0x059669, 0x475569, 0xd97706, 0x7c3aed, 0x0284c7, 0x1e293b];

    const trafficConfigs = [
      { lane: 4, z: 120, speed: 65, behavior: 'yielding' as TrafficDriverBehavior, color: colors[0], type: 'sedan' as const },
      { lane: 4, z: 175, speed: 70, behavior: 'aggressive' as TrafficDriverBehavior, color: colors[1], type: 'suv' as const },
      { lane: 3, z: 85, speed: 75, behavior: 'yielding' as TrafficDriverBehavior, color: colors[2], type: 'sedan' as const },
      { lane: 3, z: 145, speed: 82, behavior: 'aggressive' as TrafficDriverBehavior, color: colors[3], type: 'truck' as const },
      { lane: 2, z: 55, speed: 80, behavior: 'yielding' as TrafficDriverBehavior, color: colors[4], type: 'sedan' as const },
      { lane: 2, z: 125, speed: 88, behavior: 'aggressive' as TrafficDriverBehavior, color: colors[5], type: 'suv' as const },
      { lane: 1, z: 25, speed: 85, behavior: 'yielding' as TrafficDriverBehavior, color: colors[6], type: 'sedan' as const },
      { lane: 1, z: 95, speed: 92, behavior: 'aggressive' as TrafficDriverBehavior, color: colors[7], type: 'sedan' as const },
      { lane: 5, z: 10, speed: 55, behavior: 'yielding' as TrafficDriverBehavior, color: colors[0], type: 'truck' as const },
      { lane: 0, z: -20, speed: 90, behavior: 'yielding' as TrafficDriverBehavior, color: colors[1], type: 'sedan' as const },
    ];

    trafficConfigs.forEach((cfg, idx) => {
      initialTraffic.push({
        id: `traffic_${idx}`,
        x: laneCenters[cfg.lane],
        z: cfg.z,
        speedKmH: cfg.speed,
        targetLane: cfg.lane,
        laneX: laneCenters[cfg.lane],
        color: cfg.color,
        type: cfg.type,
        behavior: cfg.behavior,
        isYielding: false,
        isHonking: false,
        isFlashingHighBeam: false,
      });
    });

  } else if (mission.id === 'width_slalom') {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(8, 140), asphaltMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 0);
    road.receiveShadow = true;
    group.add(road);

    [-4.1, 4.1].forEach((cx) => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 140), curbMat);
      curb.position.set(cx, 0.075, 0);
      group.add(curb);
      obstacles.push({ type: 'box', x: cx, z: 0, width: 0.3, depth: 140, name: '보도블록 연석', isPenaltyTrigger: true });
    });

    const conePositions = [[0, 25], [-1.2, 10], [1.2, -5], [-1.2, -20], [0, -35]];
    conePositions.forEach(([cx, cz]) => createCone(cx, cz));
    [-1.4, 1.4].forEach((gx) => createCone(gx, -42, '협소 통로 게이트 콘'));

    for (let bz = 40; bz >= -60; bz -= 25) {
      createTree(-6, bz);
      createTree(6, bz);
      createSkyscraper(-16, bz, 16, 20, 25);
      createSkyscraper(16, bz, 16, 20, 25);
    }

  } else if (mission.id === 'curve_s') {
    const roadPoints: [number, number][] = [
      [0, 60], [0, 30], [-12, 15], [-14, 0], [-5, -15], [12, -30], [10, -45], [0, -60],
    ];
    const curvePoints = roadPoints.map(([px, pz]) => new THREE.Vector3(px, 0, pz));
    const spline = new THREE.CatmullRomCurve3(curvePoints);
    const pts = spline.getPoints(120);

    pts.forEach((pt, i) => {
      if (i % 2 === 0) {
        const seg = new THREE.Mesh(new THREE.CircleGeometry(4.2, 16), asphaltMat);
        seg.rotation.x = -Math.PI / 2;
        seg.position.set(pt.x, 0.01, pt.z);
        group.add(seg);
      }
    });

    pts.forEach((pt, i) => {
      if (i % 8 === 0 && i > 0 && i < pts.length - 2) {
        const tangent = spline.getTangent(i / pts.length).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const leftP = pt.clone().add(normal.clone().multiplyScalar(4.0));
        const rightP = pt.clone().add(normal.clone().multiplyScalar(-4.0));
        createCone(leftP.x, leftP.z, 'S자 코스 외곽 콘');
        createCone(rightP.x, rightP.z, 'S자 코스 내곽 콘');
      }
    });

  } else if (mission.id === 'curve_t') {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), grassMat);
    road.rotation.x = -Math.PI / 2;
    group.add(road);

    const tAsphalt1 = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 45), asphaltMat);
    tAsphalt1.rotation.x = -Math.PI / 2;
    tAsphalt1.position.set(-20, 0.01, 10);
    group.add(tAsphalt1);

    const tAsphalt2 = new THREE.Mesh(new THREE.PlaneGeometry(42, 4.5), asphaltMat);
    tAsphalt2.rotation.x = -Math.PI / 2;
    tAsphalt2.position.set(0, 0.01, -10);
    group.add(tAsphalt2);

    const tAsphalt3 = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 45), asphaltMat);
    tAsphalt3.rotation.x = -Math.PI / 2;
    tAsphalt3.position.set(20, 0.01, 10);
    group.add(tAsphalt3);

    [-22.5, -17.5].forEach((cx) => {
      for (let cz = 30; cz >= -7.5; cz -= 5) createCone(cx, cz, '직각 코스 경계');
    });
    for (let cx = -17.5; cx <= 17.5; cx += 5) createCone(cx, -12.5, '직각 코스 막다른 벽');
    [17.5, 22.5].forEach((cx) => {
      for (let cz = -7.5; cz <= 30; cz += 5) createCone(cx, cz, '직각 코스 탈출로 경계');
    });

  } else if (mission.id === 'parking_reverse') {
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(50, 40), asphaltMat);
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(0, 0, 0);
    group.add(lot);

    createParkedCar(-3.2, -12, Math.PI, 0xdc2626, '왼쪽 주차 차량(레드)');
    createParkedCar(3.2, -12, Math.PI, 0x475569, '오른쪽 주차 차량(그레이)');

    const line1 = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 6), laneWhiteMat);
    line1.rotation.x = -Math.PI / 2;
    line1.position.set(-1.5, 0.02, -12);
    const line2 = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 6), laneWhiteMat);
    line2.rotation.x = -Math.PI / 2;
    line2.position.set(1.5, 0.02, -12);
    group.add(line1);
    group.add(line2);

    const stopperMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
    const stopper1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.15), stopperMat);
    stopper1.position.set(-0.7, 0.06, -14.5);
    const stopper2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.15), stopperMat);
    stopper2.position.set(0.7, 0.06, -14.5);
    group.add(stopper1);
    group.add(stopper2);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 0.5), curbMat);
    wall.position.set(0, 0.75, -15.5);
    group.add(wall);
    obstacles.push({ type: 'box', x: 0, z: -15.5, width: 20, depth: 0.5, name: '주차장 후방 벽면', isPenaltyTrigger: true });

  } else if (mission.id === 'parking_parallel') {
    const street = new THREE.Mesh(new THREE.PlaneGeometry(16, 60), asphaltMat);
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, 0, 0);
    group.add(street);

    const curb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 60), curbMat);
    curb.position.set(5.5, 0.1, 0);
    group.add(curb);
    obstacles.push({ type: 'box', x: 5.5, z: 0, width: 1.5, depth: 60, name: '인도 보도블록', isPenaltyTrigger: true });

    createParkedCar(3.5, 5, 0, 0x0284c7, '앞쪽 주차 차량');
    createParkedCar(3.5, -11, 0, 0x16a34a, '뒤쪽 주차 차량');

    const pLine = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.15), laneWhiteMat);
    pLine.rotation.x = -Math.PI / 2;
    pLine.position.set(3.5, 0.02, 0.5);
    const pLineRear = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.15), laneWhiteMat);
    pLineRear.rotation.x = -Math.PI / 2;
    pLineRear.position.set(3.5, 0.02, -6.5);
    group.add(pLine);
    group.add(pLineRear);

  } else if (mission.id === 'city_traffic') {
    // ── 본선(N-S 24m 폭, 기존 직선 도로 재사용) ──
    const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(24, 320), asphaltMat);
    mainRoad.rotation.x = -Math.PI / 2;
    group.add(mainRoad);

    [-0.2, 0.2].forEach((lx) => {
      const yl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 320), laneYellowMat);
      yl.rotation.x = -Math.PI / 2;
      yl.position.set(lx, 0.02, 0);
      group.add(yl);
    });

    [-8, -4, 4, 8].forEach((lx) => {
      for (let lz = 150; lz >= -150; lz -= 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4), laneWhiteMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(lx, 0.02, lz);
        group.add(dash);
      }
    });

    // ── 도로변 연석: 동측은 풀 길이, 서측은 가지도로 진입구(z 20~40) 개방 ──
    const eastCurb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 320), curbMat);
    eastCurb.position.set(12.2, 0.1, 0);
    group.add(eastCurb);
    obstacles.push({ type: 'box', x: 12.2, z: 0, width: 0.4, depth: 320, name: '도로변 보도블록', isPenaltyTrigger: true });

    // 서측 연석 2분절: z∈[-160,20) 과 (40,160] — 좌회전 경로 확보
    [[-70, 180], [100, 120]].forEach(([cz, cd]) => {
      const westCurb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, cd), curbMat);
      westCurb.position.set(-12.2, 0.1, cz);
      group.add(westCurb);
      obstacles.push({ type: 'box', x: -12.2, z: cz, width: 0.4, depth: cd, name: '도로변 보도블록', isPenaltyTrigger: true });
    });

    // 가지도로·출구도로 가장자리 연석 (잔디 이탈 방지) — 튜플 순서: [x, z, sizeX, sizeZ]
    const edgeCurbs: [number, number, number, number][] = [
      [-39, 21.85, 54, 0.3],   // 가지도로 북연
      [-39, 38.15, 54, 0.3],   // 가지도로 남연
      [-86.85, 72, 0.3, 52],   // 출구도로 서연
      [-73.15, 72, 0.3, 52],   // 출구도로 동연
    ];
    edgeCurbs.forEach(([ex, ez, ew, ed]) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.2, ed), curbMat);
      c.position.set(ex, 0.1, ez);
      group.add(c);
      obstacles.push({ type: 'box', x: ex, z: ez, width: ew, depth: ed, name: '가지도로 연석', isPenaltyTrigger: true });
    });

    // ── 어린이보호구역 데칼 (z 60~100) ──
    const schoolZoneTex = RoadTextureGenerator.createSchoolZoneTexture();
    [95, 65].forEach((sz) => {
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 5),
        new THREE.MeshBasicMaterial({ map: schoolZoneTex, transparent: true })
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(6, 0.025, sz);
      group.add(decal);
    });

    // ── 서측 가지도로 (비보호 좌회전 진출, z∈[22,38], x -66~-12) ──
    const branch = new THREE.Mesh(new THREE.PlaneGeometry(54, 16), asphaltMat);
    branch.rotation.x = -Math.PI / 2;
    branch.position.set(-39, 0.01, 30);
    group.add(branch);

    // ── 북측 출구 도로 (회전교차로 → 목표, x∈[-87,-73]) ──
    const exitRoad = new THREE.Mesh(new THREE.PlaneGeometry(14, 52), asphaltMat);
    exitRoad.rotation.x = -Math.PI / 2;
    exitRoad.position.set(-80, 0.01, 72);
    group.add(exitRoad);

    // ── 정지선 + 횡단보도 ──
    const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.45), laneWhiteMat);
    stopLine.rotation.x = -Math.PI / 2;
    stopLine.position.set(5.5, 0.03, 36);
    group.add(stopLine);

    for (let sx = -10; sx <= 10; sx += 2.5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.6), laneWhiteMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx, 0.03, 41.5);
      group.add(stripe);
    }

    // ── 신호등 폴대 ×4 (NS/EW rig 각 1식) ──
    const mkSignal = (axis: 'NS' | 'EW', px: number, pz: number, rotY: number): TrafficSignalRig => {
      const poleG = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 10), guardrailMat);
      pole.position.y = 2.6;
      poleG.add(pole);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.35), new THREE.MeshStandardMaterial({ color: 0x111827 }));
      housing.position.y = 5.4;
      poleG.add(housing);
      const mkLamp = (color: number, ly: number) => {
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), mat);
        lamp.position.set(0, ly, 0.2);
        poleG.add(lamp);
        return mat;
      };
      const lamps = {
        red: mkLamp(0xff2222, 5.85),
        yellow: mkLamp(0xffcc00, 5.4),
        green: mkLamp(0x22dd44, 4.95),
      };
      poleG.position.set(px, 0, pz);
      poleG.rotation.y = rotY;
      group.add(poleG);
      return { axis, lamps };
    };

    // 상단에서 hoist된 signals 배열에 추가
    signals.push(
      mkSignal('NS', 13.0, 38.5, Math.PI),      // 남향 접근(우측 코너)
      mkSignal('EW', -13.0, 21.5, Math.PI / 2), // 서향 가지도로 접근
    );

    // ── 회전교차로 (중심 (-80,30)) ──
    const island = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.4, 32), grassMat);
    island.position.set(-80, 0.2, 30);
    group.add(island);
    obstacles.push({ type: 'cylinder', x: -80, z: 30, radius: 6, name: '회전교차로 중앙섬', isPenaltyTrigger: true });

    const ring = new THREE.Mesh(new THREE.RingGeometry(6, 16, 48), asphaltMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-80, 0.01, 30);
    group.add(ring);

    // 가지도로/출구가 링과 만나는 구멍 메우기 (링 위 덧판)
    const joinW = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), asphaltMat);
    joinW.rotation.x = -Math.PI / 2;
    joinW.position.set(-71, 0.012, 30);
    group.add(joinW);
    const joinN = new THREE.Mesh(new THREE.PlaneGeometry(16, 22), asphaltMat);
    joinN.rotation.x = -Math.PI / 2;
    joinN.position.set(-80, 0.012, 37);
    group.add(joinN);

    // ── 주변 배경 ──
    for (let bz = 130; bz >= -130; bz -= 35) {
      createSkyscraper(-26, bz, 18, 22, 25 + Math.random() * 30);
      createSkyscraper(26, bz, 18, 22, 25 + Math.random() * 30);
      if (bz % 70 === 0) {
        createStreetLight(13, bz, true);
        createTree(-15, bz + 10);
        createTree(15, bz - 10);
      }
    }
    [[-39, 12], [-39, 48], [-95, 60], [-65, 60]].forEach(([tx, tz]) => createTree(tx, tz));

    // ── 온커밍 차량 (x<0 차로, +Z 방향) ──
    const oncomingCfg = [
      { x: -6, z: -60, speed: 48, color: 0x2563eb },
      { x: -2, z: -110, speed: 42, color: 0xdc2626 },
      { x: -6, z: -160, speed: 55, color: 0x059669 },
    ];
    oncomingCfg.forEach((cfg, idx) => {
      initialTraffic.push({
        id: `oncoming_${idx}`, x: cfg.x, z: cfg.z, speedKmH: cfg.speed,
        targetLane: 0, laneX: cfg.x, color: cfg.color, type: 'sedan',
        behavior: 'normal', isYielding: false, isHonking: false, isFlashingHighBeam: false,
        motion: 'oncoming',
      });
    });

    // ── 회전교차로 순환 차량 ──
    [0, Math.PI].forEach((angle, idx) => {
      initialTraffic.push({
        id: `orb_${idx}`, x: -80 + Math.cos(angle) * 11, z: 30 + Math.sin(angle) * 11,
        speedKmH: 25, targetLane: 0, laneX: -80, color: 0xd97706, type: 'suv',
        behavior: 'circulating', isYielding: false, isHonking: false, isFlashingHighBeam: false,
        motion: 'orbit',
        orbit: { cx: -80, cz: 30, radius: 11, angle, angularSpeed: 0.35, direction: 1 },
      });
    });

  } else if (mission.id === 'city_lane_change') {
    // City Driving Track with School Zone & Intersection Decals
    const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(24, 320), asphaltMat);
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.set(0, 0, 0);
    group.add(mainRoad);

    const yellow1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 320), laneYellowMat);
    yellow1.rotation.x = -Math.PI / 2;
    yellow1.position.set(-0.2, 0.02, 0);
    const yellow2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 320), laneYellowMat);
    yellow2.rotation.x = -Math.PI / 2;
    yellow2.position.set(0.2, 0.02, 0);
    group.add(yellow1);
    group.add(yellow2);

    [-4, -8, 4, 8].forEach((lx) => {
      for (let lz = 150; lz >= -150; lz -= 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4), laneWhiteMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(lx, 0.02, lz);
        group.add(dash);
      }
    });

    // School Zone Red Asphalt Decal (어린이보호구역 30)
    const schoolZoneTex = RoadTextureGenerator.createSchoolZoneTexture();
    const schoolZoneMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 5),
      new THREE.MeshBasicMaterial({ map: schoolZoneTex, transparent: true })
    );
    schoolZoneMesh.rotation.x = -Math.PI / 2;
    schoolZoneMesh.position.set(6, 0.025, 40);
    group.add(schoolZoneMesh);

    // Crosswalk Diamond Warning Marker
    const diamondTex = RoadTextureGenerator.createDiamondMarkerTexture();
    const diamondMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 4.4),
      new THREE.MeshBasicMaterial({ map: diamondTex, transparent: true })
    );
    diamondMesh.rotation.x = -Math.PI / 2;
    diamondMesh.position.set(6, 0.025, 10);
    group.add(diamondMesh);

    [-12.2, 12.2].forEach((cx) => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 320), curbMat);
      curb.position.set(cx, 0.1, 0);
      group.add(curb);
      obstacles.push({ type: 'box', x: cx, z: 0, width: 0.4, depth: 320, name: '도로변 보도블록', isPenaltyTrigger: true });
    });
  }

  return {
    trackGroup: group,
    obstacles,
    initialTraffic,
    goalMesh,
    signals,
  };
};
