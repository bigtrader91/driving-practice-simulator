import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  VehicleConfig,
  CarState,
  ControlInputs,
  Mission,
  CameraViewMode,
  ProximitySensorData,
  ScoreDeduction,
  TrafficVehicleData,
} from '../../types/simulator';
import { createCar3DGroup } from './CarModel';
import { buildTrackScene, CollisionObstacle } from './TrackBuilder';
import { TrajectoryGuideRenderer } from './TireTracksOverlay';
import { sounds } from '../../audio/soundEffects';

interface SimulationCanvasProps {
  vehicle: VehicleConfig;
  mission: Mission;
  cameraMode: CameraViewMode;
  showTrajectory: boolean;
  showWidthGuide: boolean;
  inputsRef: React.MutableRefObject<ControlInputs>;
  onStateUpdate: (state: CarState, sensors: ProximitySensorData, trafficData?: TrafficVehicleData[]) => void;
  onMissionComplete: (score: number, deductions: ScoreDeduction[]) => void;
  onPenalty: (deduction: ScoreDeduction) => void;
  leftMirrorCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  rightMirrorCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  rearMirrorCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  backupCameraCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  vehicle,
  mission,
  cameraMode,
  showTrajectory,
  showWidthGuide,
  inputsRef,
  onStateUpdate,
  onMissionComplete,
  onPenalty,
  leftMirrorCanvasRef,
  rightMirrorCanvasRef,
  rearMirrorCanvasRef,
  backupCameraCanvasRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMissionFinishedRef = useRef(false);
  const scoreDeductionsRef = useRef<ScoreDeduction[]>([]);
  const currentScoreRef = useRef(100);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x60a5fa);
    scene.fog = new THREE.FogExp2(0x93c5fd, 0.0028);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.replaceChildren(renderer.domElement);

    // Mirror renderers
    let leftMirrorRenderer: THREE.WebGLRenderer | null = null;
    let rightMirrorRenderer: THREE.WebGLRenderer | null = null;
    let rearMirrorRenderer: THREE.WebGLRenderer | null = null;
    let backupRenderer: THREE.WebGLRenderer | null = null;

    if (leftMirrorCanvasRef?.current) {
      leftMirrorRenderer = new THREE.WebGLRenderer({ canvas: leftMirrorCanvasRef.current, antialias: true });
      leftMirrorRenderer.setSize(leftMirrorCanvasRef.current.width, leftMirrorCanvasRef.current.height);
    }
    if (rightMirrorCanvasRef?.current) {
      rightMirrorRenderer = new THREE.WebGLRenderer({ canvas: rightMirrorCanvasRef.current, antialias: true });
      rightMirrorRenderer.setSize(rightMirrorCanvasRef.current.width, rightMirrorCanvasRef.current.height);
    }
    if (rearMirrorCanvasRef?.current) {
      rearMirrorRenderer = new THREE.WebGLRenderer({ canvas: rearMirrorCanvasRef.current, antialias: true });
      rearMirrorRenderer.setSize(rearMirrorCanvasRef.current.width, rearMirrorCanvasRef.current.height);
    }
    if (backupCameraCanvasRef?.current) {
      backupRenderer = new THREE.WebGLRenderer({ canvas: backupCameraCanvasRef.current, antialias: true });
      backupRenderer.setSize(backupCameraCanvasRef.current.width, backupCameraCanvasRef.current.height);
    }

    // 2. Lighting & Sunlight
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 0.7);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
    sunLight.position.set(60, 130, 70);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 450;
    sunLight.shadow.camera.left = -90;
    sunLight.shadow.camera.right = 90;
    sunLight.shadow.camera.top = 90;
    sunLight.shadow.camera.bottom = -90;
    sunLight.shadow.bias = -0.0001;
    scene.add(sunLight);

    // 3. Track Scene & Traffic
    const { trackGroup, obstacles, initialTraffic } = buildTrackScene(mission);
    scene.add(trackGroup);

    const trafficVehicles: TrafficVehicleData[] = [...initialTraffic];
    const trafficMeshes: {
      data: TrafficVehicleData;
      group: THREE.Group;
      headlights: THREE.Mesh[];
      brakeLights: THREE.Mesh[];
    }[] = [];

    const trafficMatCache: Record<number, THREE.MeshStandardMaterial> = {};
    const getTrafficBodyMat = (color: number) => {
      if (!trafficMatCache[color]) {
        trafficMatCache[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.7 });
      }
      return trafficMatCache[color];
    };

    trafficVehicles.forEach((tv) => {
      const tvGroup = new THREE.Group();
      const bodyMat = getTrafficBodyMat(tv.color);
      const isTruck = tv.type === 'truck';
      const isSUV = tv.type === 'suv';

      const tw = isTruck ? 2.3 : isSUV ? 2.0 : 1.82;
      const tl = isTruck ? 7.5 : isSUV ? 4.9 : 4.65;
      const th = isTruck ? 2.8 : isSUV ? 1.7 : 1.45;

      const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(tw, th * 0.45, tl), bodyMat);
      bodyMesh.position.y = th * 0.225 + 0.25;
      bodyMesh.castShadow = true;
      tvGroup.add(bodyMesh);

      const cabinMesh = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.9, th * 0.45, tl * 0.5), bodyMat);
      cabinMesh.position.set(0, th * 0.65 + 0.25, -tl * 0.05);
      cabinMesh.castShadow = true;
      tvGroup.add(cabinMesh);

      const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 });
      const blMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 0.4 });

      const hlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), hlMat);
      hlLeft.position.set(-tw * 0.35, th * 0.3 + 0.25, tl / 2 + 0.02);
      const hlRight = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), hlMat);
      hlRight.position.set(tw * 0.35, th * 0.3 + 0.25, tl / 2 + 0.02);
      tvGroup.add(hlLeft);
      tvGroup.add(hlRight);

      const blLeft = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), blMat);
      blLeft.position.set(-tw * 0.35, th * 0.3 + 0.25, -tl / 2 - 0.02);
      const blRight = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), blMat);
      blRight.position.set(tw * 0.35, th * 0.3 + 0.25, -tl / 2 - 0.02);
      tvGroup.add(blLeft);
      tvGroup.add(blRight);

      tvGroup.position.set(tv.x, 0, tv.z);
      scene.add(tvGroup);

      trafficMeshes.push({
        data: tv,
        group: tvGroup,
        headlights: [hlLeft, hlRight],
        brakeLights: [blLeft, blRight],
      });
    });

    // 4. Player Car Mesh
    const car3D = createCar3DGroup(vehicle);
    scene.add(car3D.carGroup);

    // 5. Cameras (Near plane at 0.05)
    const mainCamera = new THREE.PerspectiveCamera(65, width / height, 0.05, 1000);
    const leftMirrorCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 180);
    const rightMirrorCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 180);
    const rearMirrorCam = new THREE.PerspectiveCamera(45, 21 / 9, 0.1, 180);
    const backupCam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);

    // 6. Trajectory guide renderer
    const trajectoryRenderer = new TrajectoryGuideRenderer(scene);

    // State
    const carState: CarState = {
      x: mission.startPos[0],
      y: mission.startPos[1],
      z: mission.startPos[2],
      speed: 0,
      speedMs: 0,
      steerAngle: 0,
      steeringWheelAngle: 0,
      steeringWheelTurns: 0,
      steeringWheelDegrees: 0,
      heading: mission.startHeading,
      gear: 'D',
      isBraking: false,
      isAccelerating: false,
      isHandbrake: false,
      turnSignal: 'none',
      headlights: true,
      leftMirrorLooked: false,
      rightMirrorLooked: false,
      rearMirrorLooked: false,
      lastMirrorCheckTime: 0,
      inCollision: false,
      rpm: 800,
      odometer: 0,
    };

    isMissionFinishedRef.current = false;
    scoreDeductionsRef.current = [];
    currentScoreRef.current = 100;

    let headYaw = 0;
    let headPitch = 0;
    let blinkerTimer = 0;
    let blinkerState = false;
    let highBeamTimer = 0;
    let lastTime = performance.now();
    let collisionCooldown = 0;
    let parkingHoldTimer = 0;

    let camPitchInertia = 0;
    let camRollInertia = 0;
    let vibeOffset = 0;

    sounds.init();
    sounds.startEngine();

    setTimeout(() => {
      sounds.speakInstructor(`${mission.title} 연습을 시작합니다. 안전 운전하세요.`);
    }, 1200);

    const triggerPenalty = (reason: string, points: number) => {
      const now = performance.now();
      const existing = scoreDeductionsRef.current.find((d) => d.reason === reason && now - d.timestamp < 3000);
      if (existing) return;

      const deduction: ScoreDeduction = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: now,
        reason,
        points,
      };
      scoreDeductionsRef.current.push(deduction);
      currentScoreRef.current = Math.max(0, currentScoreRef.current - points);
      sounds.playWarning();
      sounds.speakInstructor(`주의! ${reason}`);
      onPenalty(deduction);
    };

    let animationFrameId: number;

    const animate = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      const inputs = inputsRef.current;

      // Handle Gear Shifts (P, R, N, D)
      if (inputs.gearP) carState.gear = 'P';
      else if (inputs.gearR) carState.gear = 'R';
      else if (inputs.gearN) carState.gear = 'N';
      else if (inputs.gearD) carState.gear = 'D';

      // Handle Turn Signals
      if (inputs.signalLeft) {
        carState.turnSignal = carState.turnSignal === 'left' ? 'none' : 'left';
        inputs.signalLeft = false;
        if (carState.turnSignal === 'left') {
          sounds.speakInstructor('좌측 깜빡이 작동. 좌측 사이드미러를 확인하세요.');
        }
      }
      if (inputs.signalRight) {
        carState.turnSignal = carState.turnSignal === 'right' ? 'none' : 'right';
        inputs.signalRight = false;
        if (carState.turnSignal === 'right') {
          sounds.speakInstructor('우측 깜빡이 작동. 우측 사이드미러를 확인하세요.');
        }
      }
      if (inputs.hazard) {
        carState.turnSignal = carState.turnSignal === 'hazard' ? 'none' : 'hazard';
        inputs.hazard = false;
      }

      // Blinker Timing & Audio
      if (carState.turnSignal !== 'none') {
        blinkerTimer += delta;
        if (blinkerTimer >= 0.38) {
          blinkerTimer = 0;
          blinkerState = !blinkerState;
          sounds.playTurnSignalClick(blinkerState);
        }
      } else {
        blinkerState = false;
        blinkerTimer = 0;
      }

      const leftBlink = (carState.turnSignal === 'left' || carState.turnSignal === 'hazard') && blinkerState;
      const rightBlink = (carState.turnSignal === 'right' || carState.turnSignal === 'hazard') && blinkerState;
      (car3D.leftBlinkerLight.material as THREE.MeshStandardMaterial).emissiveIntensity = leftBlink ? 2.8 : 0.1;
      (car3D.leftRearBlinkerLight.material as THREE.MeshStandardMaterial).emissiveIntensity = leftBlink ? 2.8 : 0.1;
      (car3D.rightBlinkerLight.material as THREE.MeshStandardMaterial).emissiveIntensity = rightBlink ? 2.8 : 0.1;
      (car3D.rightRearBlinkerLight.material as THREE.MeshStandardMaterial).emissiveIntensity = rightBlink ? 2.8 : 0.1;

      // =========================================================================
      // MOUSE STEERING DIRECTION & 540 DEGREES (1.5 TURNS) CALCULATION
      // =========================================================================
      // Max steering wheel angle in radians: 1.5 * 2π = 3π = 9.4248 rad (540 degrees)
      const maxSteeringWheelAngle = vehicle.maxSteeringWheelTurns * Math.PI * 2;
      
      // Target steering wheel angle directly from mouse (-1.0 to +1.0)
      const targetWheelAngle = inputs.mouseSteerRatio * maxSteeringWheelAngle;
      carState.steeringWheelAngle = THREE.MathUtils.lerp(carState.steeringWheelAngle, targetWheelAngle, 18 * delta);

      // Degrees: Left is negative (-540°), Right is positive (+540°)
      carState.steeringWheelDegrees = Math.round((carState.steeringWheelAngle * 180) / Math.PI);
      carState.steeringWheelTurns = parseFloat((carState.steeringWheelAngle / (Math.PI * 2)).toFixed(2));

      // Tire angle: turns up to ~33.2 degrees (+ for right, - for left)
      const wheelSteerRatio = carState.steeringWheelAngle / maxSteeringWheelAngle;
      carState.steerAngle = wheelSteerRatio * vehicle.maxWheelAngle;

      // In 3D: Rotate steering wheel and front wheels
      car3D.steeringWheelMesh.rotation.z = -carState.steeringWheelAngle;
      car3D.frontLeftWheel.rotation.y = -carState.steerAngle;
      car3D.frontRightWheel.rotation.y = -carState.steerAngle;

      // Acceleration & Braking with Pitch Inertia
      carState.isBraking = (inputs.backward && carState.gear === 'D') || (inputs.forward && carState.gear === 'R') || inputs.handbrake;
      carState.isAccelerating = (inputs.forward && carState.gear === 'D') || (inputs.backward && carState.gear === 'R');
      carState.isHandbrake = inputs.handbrake;

      car3D.brakeLights.forEach((bl) => {
        (bl.material as THREE.MeshStandardMaterial).emissiveIntensity = carState.isBraking ? 2.2 : 0.3;
      });

      let targetPitch = 0;
      if (carState.isAccelerating) {
        targetPitch = 0.025;
      } else if (carState.isBraking) {
        targetPitch = -0.04;
      }
      camPitchInertia = THREE.MathUtils.lerp(camPitchInertia, targetPitch, 8 * delta);

      const lateralForce = (carState.speedMs * carState.steerAngle) * 0.015;
      camRollInertia = THREE.MathUtils.lerp(camRollInertia, -lateralForce, 6 * delta);

      vibeOffset = Math.sin(currentTime * 0.03) * (Math.abs(carState.speed) > 10 ? 0.003 : 0.0008);

      if (carState.gear === 'P' || carState.gear === 'N' || carState.isHandbrake) {
        carState.speedMs = THREE.MathUtils.lerp(carState.speedMs, 0, 8 * delta);
      } else if (carState.gear === 'D') {
        if (inputs.forward) {
          const targetSpeedMs = (vehicle.maxSpeed * 1000) / 3600;
          carState.speedMs = Math.min(targetSpeedMs, carState.speedMs + vehicle.acceleration * delta);
        } else if (inputs.backward) {
          carState.speedMs = Math.max(0, carState.speedMs - vehicle.brakingPower * delta);
        } else {
          const creepSpeed = 1.8;
          if (carState.speedMs > creepSpeed) {
            carState.speedMs -= 2.0 * delta;
          } else {
            carState.speedMs = Math.min(creepSpeed, carState.speedMs + 0.8 * delta);
          }
        }
      } else if (carState.gear === 'R') {
        if (inputs.backward) {
          const targetReverseMs = (vehicle.reverseMaxSpeed * 1000) / 3600;
          carState.speedMs = Math.max(-targetReverseMs, carState.speedMs - vehicle.acceleration * 0.7 * delta);
        } else if (inputs.forward) {
          carState.speedMs = Math.min(0, carState.speedMs + vehicle.brakingPower * delta);
        } else {
          const revCreep = -1.2;
          if (carState.speedMs < revCreep) {
            carState.speedMs += 2.0 * delta;
          } else {
            carState.speedMs = Math.max(revCreep, carState.speedMs - 0.8 * delta);
          }
        }
      }

      carState.speed = Math.round((carState.speedMs * 3600) / 1000);
      carState.odometer += Math.abs(carState.speedMs) * delta;

      // Position update with correct Ackermann Yaw Kinematics
      if (Math.abs(carState.speedMs) > 0.01) {
        const moveDist = carState.speedMs * delta;
        carState.x += -Math.sin(carState.heading) * moveDist;
        carState.z += -Math.cos(carState.heading) * moveDist;

        if (Math.abs(carState.steerAngle) > 0.001) {
          // Turning Right (steerAngle > 0): heading decreases (clockwise turning in -Z/+X coordinates)
          const turnRate = (moveDist / vehicle.wheelBase) * Math.tan(carState.steerAngle);
          carState.heading -= turnRate;
        }

        const wheelRoll = moveDist / 0.33;
        car3D.frontLeftWheel.rotation.x += wheelRoll;
        car3D.frontRightWheel.rotation.x += wheelRoll;
        car3D.rearLeftWheel.rotation.x += wheelRoll;
        car3D.rearRightWheel.rotation.x += wheelRoll;
      }

      car3D.carGroup.position.set(carState.x, carState.y, carState.z);
      car3D.carGroup.rotation.y = carState.heading;

      sounds.updateEngine(carState.speed, carState.isAccelerating, carState.gear);

      // Dynamic Traffic AI
      highBeamTimer += delta;
      const isHighBeamFlash = Math.sin(highBeamTimer * 12) > 0;

      trafficMeshes.forEach(({ data: tv, group: tvG, headlights, brakeLights }) => {
        let currentTargetSpeed = tv.speedKmH;

        const zDiff = tv.z - carState.z;
        const xDiff = tv.x - carState.x;
        const inAdjacentLane = Math.abs(xDiff) < 4.2;
        const playerTurningTowardsAI =
          (carState.turnSignal === 'left' && carState.x > tv.x && inAdjacentLane) ||
          (carState.turnSignal === 'right' && carState.x < tv.x && inAdjacentLane);

        if (playerTurningTowardsAI && zDiff > 0 && zDiff < 45) {
          if (tv.behavior === 'yielding') {
            tv.isYielding = true;
            currentTargetSpeed = Math.max(30, carState.speed - 15);
            tv.isFlashingHighBeam = true;
            tv.isHonking = false;
            sounds.speakInstructor('뒤차가 양보하고 있습니다. 서서히 진입하세요.');
          } else if (tv.behavior === 'aggressive') {
            tv.isYielding = false;
            currentTargetSpeed = tv.speedKmH + 22;
            tv.isFlashingHighBeam = false;
            if (zDiff < 18 && !tv.isHonking) {
              tv.isHonking = true;
              sounds.playWarning();
              sounds.speakInstructor('위험! 뒤차가 가속 중입니다. 끼어들지 마세요.');
            }
          }
        } else {
          tv.isYielding = false;
          tv.isFlashingHighBeam = false;
          tv.isHonking = false;
        }

        const tvSpeedMs = (currentTargetSpeed * 1000) / 3600;
        tv.z -= tvSpeedMs * delta;

        if (tv.z < -280) {
          tv.z = 240 + Math.random() * 40;
        }

        tvG.position.set(tv.x, 0, tv.z);

        const hlIntensity = tv.isFlashingHighBeam && isHighBeamFlash ? 3.5 : 1.0;
        headlights.forEach((hl) => {
          (hl.material as THREE.MeshStandardMaterial).emissiveIntensity = hlIntensity;
        });

        const isBraking = tvSpeedMs < (tv.speedKmH * 1000) / 3600 - 1;
        brakeLights.forEach((bl) => {
          (bl.material as THREE.MeshStandardMaterial).emissiveIntensity = isBraking ? 2.5 : 0.4;
        });
      });

      // Collision Detection
      collisionCooldown = Math.max(0, collisionCooldown - delta);
      let minDistance = 999;
      let isCollidingNow = false;

      const carHalfW = vehicle.width / 2;
      const carHalfL = vehicle.length / 2;

      obstacles.forEach((obs) => {
        const dx = obs.x - carState.x;
        const dz = obs.z - carState.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDistance) minDistance = dist;

        let hasOverlap = false;
        if (obs.type === 'cylinder') {
          const rad = obs.radius || 0.3;
          if (dist < rad + carHalfW) hasOverlap = true;
        } else if (obs.type === 'box') {
          const bw = (obs.width || 2) / 2;
          const bd = (obs.depth || 2) / 2;
          if (Math.abs(dx) < carHalfW + bw && Math.abs(dz) < carHalfL + bd) hasOverlap = true;
        }

        if (hasOverlap) {
          isCollidingNow = true;
          if (collisionCooldown <= 0) {
            collisionCooldown = 1.2;
            sounds.playCollision();
            carState.speedMs = -carState.speedMs * 0.3;
            triggerPenalty(`[충돌] ${obs.name} 충돌 감점`, 15);
          }
        }
      });

      trafficVehicles.forEach((tv) => {
        const dx = tv.x - carState.x;
        const dz = tv.z - carState.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDistance) minDistance = dist;

        if (Math.abs(dx) < carHalfW + 1.0 && Math.abs(dz) < carHalfL + 2.3) {
          isCollidingNow = true;
          if (collisionCooldown <= 0) {
            collisionCooldown = 1.2;
            sounds.playCollision();
            carState.speedMs = -carState.speedMs * 0.4;
            triggerPenalty(`[차량 충돌] ${tv.behavior === 'aggressive' ? '가속 추월 차량' : '주행 차량'}과 충돌`, 30);
          }
        }
      });

      carState.inCollision = isCollidingNow;

      const sensors: ProximitySensorData = {
        frontLeft: minDistance < 5 ? minDistance * 0.9 : -1,
        frontCenter: minDistance < 5 ? minDistance : -1,
        frontRight: minDistance < 5 ? minDistance * 0.9 : -1,
        rearLeft: carState.gear === 'R' && minDistance < 5 ? minDistance * 0.9 : -1,
        rearCenter: carState.gear === 'R' && minDistance < 5 ? minDistance : -1,
        rearRight: carState.gear === 'R' && minDistance < 5 ? minDistance * 0.9 : -1,
        minDistance: minDistance < 5 ? minDistance : -1,
      };

      if (sensors.minDistance > 0 && sensors.minDistance <= 2.2) {
        sounds.playSensorBeep(sensors.minDistance);
      }

      // Check Mirror Looking (Clamped to natural glance range, NO 180-degree flip)
      if (inputs.lookLeft) headYaw = 0.55; // ~31 degree glance to left mirror
      else if (inputs.lookRight) headYaw = -0.55; // ~31 degree glance to right mirror
      else if (inputs.lookRear) headYaw = 0; // Look rear via top mirror
      else {
        headYaw = THREE.MathUtils.lerp(headYaw, 0, 10 * delta);
        headPitch = THREE.MathUtils.lerp(headPitch, 0, 10 * delta);
      }

      carState.leftMirrorLooked = headYaw > 0.35;
      carState.rightMirrorLooked = headYaw < -0.35;
      carState.rearMirrorLooked = inputs.lookRear;

      // Lane Change Safety Check
      if (Math.abs(carState.steerAngle) > 0.12 && Math.abs(carState.speed) > 15) {
        const isTurningLeft = carState.steerAngle < 0;
        const correctSignal = isTurningLeft ? carState.turnSignal === 'left' : carState.turnSignal === 'right';
        const correctMirror = isTurningLeft ? carState.leftMirrorLooked : carState.rightMirrorLooked;

        if (!correctSignal) {
          triggerPenalty('방향지시등(깜빡이) 미작동 차선 변경 감점', 10);
        }
        if (!correctMirror) {
          triggerPenalty('사이드미러/사각지대 숄더체크 미확인 감점', 10);
        }
      }

      // Mission Goal Check
      if (mission.targetArea && !isMissionFinishedRef.current) {
        const { x: tx, z: tz, width: tw, depth: td, targetHeading, toleranceHeading } = mission.targetArea;
        const inZone = Math.abs(carState.x - tx) < tw / 2 && Math.abs(carState.z - tz) < td / 2;

        if (inZone) {
          let headingOk = true;
          if (targetHeading !== undefined && toleranceHeading !== undefined) {
            const hDiff = Math.abs(Math.atan2(Math.sin(carState.heading - targetHeading), Math.cos(carState.heading - targetHeading)));
            headingOk = hDiff < toleranceHeading || Math.abs(hDiff - Math.PI) < toleranceHeading;
          }

          if (headingOk) {
            if (mission.category === 'parking') {
              if (carState.gear === 'P' && Math.abs(carState.speed) === 0) {
                parkingHoldTimer += delta;
                if (parkingHoldTimer >= 1.5) {
                  isMissionFinishedRef.current = true;
                  sounds.playSuccess();
                  sounds.speakInstructor('축하합니다! 완벽하게 주차를 완료했습니다.');
                  onMissionComplete(currentScoreRef.current, scoreDeductionsRef.current);
                }
              }
            } else {
              isMissionFinishedRef.current = true;
              sounds.playSuccess();
              sounds.speakInstructor('축하합니다! 미션을 성공적으로 완주했습니다.');
              onMissionComplete(currentScoreRef.current, scoreDeductionsRef.current);
            }
          }
        } else {
          parkingHoldTimer = 0;
        }
      }

      trajectoryRenderer.update(vehicle, carState, showTrajectory || showWidthGuide);

      // Camera Placement
      const [cpx, cpy, cpz] = vehicle.cockpitPos;
      const carPos = car3D.carGroup.position;
      const heading = carState.heading;

      if (cameraMode === 'cockpit') {
        const eyeOffset = new THREE.Vector3(cpx, cpy + vibeOffset, cpz).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
        mainCamera.position.copy(carPos).add(eyeOffset);

        const lookDir = new THREE.Vector3(
          -Math.sin(heading + headYaw),
          headPitch + camPitchInertia - 0.04,
          -Math.cos(heading + headYaw)
        ).normalize();
        mainCamera.lookAt(mainCamera.position.clone().add(lookDir));
        mainCamera.rotation.z = camRollInertia;
      } else if (cameraMode === 'chase') {
        const chaseDist = 6.8;
        const chaseHeight = 3.2 + vibeOffset;
        const camPos = new THREE.Vector3(
          carPos.x + Math.sin(heading) * chaseDist,
          carPos.y + chaseHeight,
          carPos.z + Math.cos(heading) * chaseDist
        );
        mainCamera.position.lerp(camPos, 10 * delta);
        mainCamera.lookAt(carPos.x, carPos.y + 1.2, carPos.z);
        mainCamera.rotation.z = 0;
      } else if (cameraMode === 'top') {
        mainCamera.position.set(carPos.x, carPos.y + 24, carPos.z);
        mainCamera.lookAt(carPos.x, carPos.y, carPos.z);
        mainCamera.rotation.z = 0;
      } else if (cameraMode === 'hood') {
        const hoodOffset = new THREE.Vector3(0, vehicle.height * 0.65 + vibeOffset, vehicle.length * 0.35).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
        mainCamera.position.copy(carPos).add(hoodOffset);
        const lookDir = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
        mainCamera.lookAt(mainCamera.position.clone().add(lookDir));
        mainCamera.rotation.z = 0;
      }

      renderer.render(scene, mainCamera);

      const renderMirror = (
        mirrorRenderer: THREE.WebGLRenderer | null,
        mirrorCam: THREE.PerspectiveCamera,
        mPos: [number, number, number],
        angleOffset: number
      ) => {
        if (!mirrorRenderer) return;
        const worldPos = new THREE.Vector3(...mPos).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(carPos);
        mirrorCam.position.copy(worldPos);
        const mirrorDir = new THREE.Vector3(
          Math.sin(heading + angleOffset),
          -0.05,
          Math.cos(heading + angleOffset)
        ).normalize();
        mirrorCam.lookAt(mirrorCam.position.clone().add(mirrorDir));
        mirrorRenderer.render(scene, mirrorCam);
      };

      renderMirror(leftMirrorRenderer, leftMirrorCam, vehicle.leftMirrorPos, 0.12);
      renderMirror(rightMirrorRenderer, rightMirrorCam, vehicle.rightMirrorPos, -0.12);
      renderMirror(rearMirrorRenderer, rearMirrorCam, vehicle.rearMirrorPos, 0);

      if (backupRenderer && carState.gear === 'R') {
        const backupPos = new THREE.Vector3(0, vehicle.height * 0.55, -vehicle.length * 0.48).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(carPos);
        backupCam.position.copy(backupPos);
        const backupDir = new THREE.Vector3(Math.sin(heading), -0.25, Math.cos(heading)).normalize();
        backupCam.lookAt(backupCam.position.clone().add(backupDir));
        backupRenderer.render(scene, backupCam);
      }

      onStateUpdate(carState, sensors, trafficVehicles);
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      mainCamera.aspect = w / h;
      mainCamera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      sounds.stopEngine();
      trajectoryRenderer.dispose();
      renderer.dispose();
      leftMirrorRenderer?.dispose();
      rightMirrorRenderer?.dispose();
      rearMirrorRenderer?.dispose();
      backupRenderer?.dispose();
    };
  }, [vehicle, mission, cameraMode, showTrajectory, showWidthGuide]);

  return (
    <div ref={containerRef} className="w-full h-full relative cursor-crosshair overflow-hidden" />
  );
};
