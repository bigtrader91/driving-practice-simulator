/// <reference types="vite/client" />

import React, { useEffect, useRef, useState } from 'react';
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
import { buildTrackScene } from './TrackBuilder';
import { TrajectoryGuideRenderer } from './TireTracksOverlay';
import { TrafficLightController } from '../../simulation/TrafficLightController';
import { MissionEvaluator } from '../../simulation/MissionEvaluator';
import { MissionRunState } from '../../simulation/MissionRunState';
import { consumeGearCommand } from '../../simulation/GearInput';
import { getGuideVisibility } from '../../simulation/GuideVisibility';
import { updateKeyboardSteeringRatio } from '../../simulation/SteeringInput';
import { advanceVehiclePose, updateLongitudinalMotion } from '../../simulation/VehicleMotion';
import { resetIfVehiclePoseUnrecoverable } from '../../simulation/WorldBounds';
import { playAttemptResultSound, playInstructionalWarning } from '../../simulation/TrainingGuidanceAudio';
import {
  assessMissionResult,
  AttemptEvent,
  isAttemptPassed,
  recordAttemptEvent,
} from '../../simulation/AttemptAssessment';
import { sounds } from '../../audio/soundEffects';
import {
  getBackupCameraOffset,
  getForwardDirection,
  getHoodCameraOffset,
  getMirrorDirection,
  getRearDirection,
  getVisualWheelSteerRotation,
  type MirrorView,
} from './VehicleCoordinateSystem';
import {
  loadVehicleAssetLibrary,
  type VehicleAssetLibrary,
} from './VehicleAssetLibrary';
import {
  createTrafficVehicleVisual,
  disposeTrafficVehicleVisual,
  syncTrafficVehicleVisual,
  type TrafficVehicleVisual,
} from './TrafficVehicleVisual';

type LoadVehicleAssetLibrary = (baseUrl: string) => Promise<VehicleAssetLibrary>;
type VehicleAssetState =
  | { status: 'loading' }
  | { status: 'ready'; library: VehicleAssetLibrary }
  | { status: 'error'; message: string };

export interface SimulationCleanupStep {
  label: string;
  cleanup: () => void;
}

const errorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

export const preloadSimulationVehicleAssets = (
  baseUrl: string,
  loadLibrary: LoadVehicleAssetLibrary,
  onReady: (library: VehicleAssetLibrary) => void,
  onError: (message: string) => void,
): (() => void) => {
  let cancelled = false;
  let loading: Promise<VehicleAssetLibrary>;
  try {
    loading = loadLibrary(baseUrl);
  } catch (error) {
    loading = Promise.reject(error);
  }
  loading
    .then((library) => {
      if (!cancelled) onReady(library);
    })
    .catch((error: unknown) => {
      if (cancelled) return;
      const message = errorMessage(error);
      console.error(message, error);
      onError(message);
    });
  return () => {
    cancelled = true;
  };
};

export const SimulationAssetErrorOverlay = ({ message }: { message: string }) => (
  <div
    role="alert"
    aria-live="assertive"
    className="absolute inset-x-4 top-4 z-20 rounded-lg border border-red-400 bg-red-950/95 p-4 text-sm text-red-100 shadow-lg"
  >
    <p className="font-semibold">차량 모델을 불러오지 못했습니다.</p>
    <p className="mt-1 break-all">{message}</p>
    <p className="mt-2">다시 시도하려면 페이지를 새로고침해 주세요.</p>
  </div>
);

export const SimulationAssetLoadingOverlay = () => (
  <div
    role="status"
    aria-live="polite"
    className="absolute inset-x-4 top-4 z-20 rounded-lg border border-sky-400 bg-slate-950/90 p-4 text-sm text-sky-100 shadow-lg"
  >
    차량 모델을 불러오는 중입니다.
  </div>
);

export const createCompletionSafeCleanup = (
  steps: SimulationCleanupStep[],
): (() => void) => {
  let completed = false;
  return () => {
    if (completed) return;
    completed = true;
    [...steps].reverse().forEach(({ label, cleanup }) => {
      try {
        cleanup();
      } catch (error) {
        console.error(
          `Failed to clean up simulation resource ${label}: ${errorMessage(error)}`,
          error,
        );
      }
    });
  };
};

interface SimulationCanvasProps {
  vehicle: VehicleConfig;
  mission: Mission;
  cameraMode: CameraViewMode;
  showTrajectory: boolean;
  showWidthGuide: boolean;
  guidanceEnabled: boolean;
  resultFeedbackEnabled: boolean;
  inputsRef: React.MutableRefObject<ControlInputs>;
  onStateUpdate: (state: CarState, sensors: ProximitySensorData, trafficData?: TrafficVehicleData[]) => void;
  onMissionComplete: (score: number, deductions: ScoreDeduction[], events: AttemptEvent[]) => void;
  onMissionFail: (reason: string, score: number, deductions: ScoreDeduction[], events: AttemptEvent[]) => void;
  onPenalty: (deduction: ScoreDeduction) => void;
  onReset: () => void;
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
  guidanceEnabled,
  resultFeedbackEnabled,
  inputsRef,
  onStateUpdate,
  onMissionComplete,
  onMissionFail,
  onPenalty,
  onReset,
  leftMirrorCanvasRef,
  rightMirrorCanvasRef,
  rearMirrorCanvasRef,
  backupCameraCanvasRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [vehicleAssetState, setVehicleAssetState] = useState<VehicleAssetState>({ status: 'loading' });
  // UI 토글은 effect를 재실행하지 않고 ref로 미러링한다 (C/T키 리셋 버그 수정)
  const uiStateRef = useRef({ cameraMode, showTrajectory, showWidthGuide });
  uiStateRef.current = { cameraMode, showTrajectory, showWidthGuide };

  useEffect(() => preloadSimulationVehicleAssets(
    import.meta.env.BASE_URL,
    loadVehicleAssetLibrary,
    (library) => setVehicleAssetState({ status: 'ready', library }),
    (message) => setVehicleAssetState({ status: 'error', message }),
  ), []);

  useEffect(() => {
    if (!containerRef.current || vehicleAssetState.status !== 'ready') return;
    const vehicleAssets = vehicleAssetState.library;
    const container = containerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const cleanupSteps: SimulationCleanupStep[] = [];
    const cleanup = createCompletionSafeCleanup(cleanupSteps);

    try {

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    cleanupSteps.push({ label: 'scene', cleanup: () => scene.clear() });
    scene.background = new THREE.Color(0x60a5fa);
    scene.fog = new THREE.FogExp2(0x93c5fd, 0.0028);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    cleanupSteps.push({ label: 'main renderer', cleanup: () => renderer.dispose() });
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
      cleanupSteps.push({ label: 'left mirror renderer', cleanup: () => leftMirrorRenderer?.dispose() });
      leftMirrorRenderer.setSize(leftMirrorCanvasRef.current.width, leftMirrorCanvasRef.current.height);
    }
    if (rightMirrorCanvasRef?.current) {
      rightMirrorRenderer = new THREE.WebGLRenderer({ canvas: rightMirrorCanvasRef.current, antialias: true });
      cleanupSteps.push({ label: 'right mirror renderer', cleanup: () => rightMirrorRenderer?.dispose() });
      rightMirrorRenderer.setSize(rightMirrorCanvasRef.current.width, rightMirrorCanvasRef.current.height);
    }
    if (rearMirrorCanvasRef?.current) {
      rearMirrorRenderer = new THREE.WebGLRenderer({ canvas: rearMirrorCanvasRef.current, antialias: true });
      cleanupSteps.push({ label: 'rear mirror renderer', cleanup: () => rearMirrorRenderer?.dispose() });
      rearMirrorRenderer.setSize(rearMirrorCanvasRef.current.width, rearMirrorCanvasRef.current.height);
    }
    if (backupCameraCanvasRef?.current) {
      backupRenderer = new THREE.WebGLRenderer({ canvas: backupCameraCanvasRef.current, antialias: true });
      cleanupSteps.push({ label: 'backup camera renderer', cleanup: () => backupRenderer?.dispose() });
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
    const { trackGroup, obstacles, initialTraffic, signals } = buildTrackScene(
      mission,
      (color) => vehicleAssets.createVehicle('sedan', color).group,
    );
    const attemptEvents: AttemptEvent[] = [];
    scene.add(trackGroup);

    const lightController = mission.id === 'city_traffic' ? new TrafficLightController() : null;
    const evaluator = new MissionEvaluator(mission);
    const runState = new MissionRunState();

    const trafficVehicles: TrafficVehicleData[] = [...initialTraffic];
    const trafficMeshes: {
      data: TrafficVehicleData;
      visual: TrafficVehicleVisual;
    }[] = [];

    trafficVehicles.forEach((tv) => {
      const visual = createTrafficVehicleVisual(tv, vehicleAssets);
      cleanupSteps.push({
        label: `traffic visual ${tv.id}`,
        cleanup: () => disposeTrafficVehicleVisual(visual),
      });
      scene.add(visual.group);
      trafficMeshes.push({ data: tv, visual });
    });

    // 4. Player Car Mesh
    const car3D = createCar3DGroup(
      vehicle,
      vehicleAssets.createVehicle(vehicle.id, vehicle.color),
    );
    scene.add(car3D.carGroup);

    // 5. Cameras (Near plane at 0.05)
    const mainCamera = new THREE.PerspectiveCamera(65, width / height, 0.05, 1000);
    const leftMirrorCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 180);
    const rightMirrorCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 180);
    const rearMirrorCam = new THREE.PerspectiveCamera(45, 21 / 9, 0.1, 180);
    const backupCam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);

    // 6. Trajectory guide renderer
    const trajectoryRenderer = new TrajectoryGuideRenderer(scene);
    cleanupSteps.push({ label: 'trajectory renderer', cleanup: () => trajectoryRenderer.dispose() });

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

    let headYaw = 0;
    let headPitch = 0;
    let blinkerTimer = 0;
    let blinkerState = false;
    let lastTime = performance.now();
    let collisionCooldown = 0;
    let parkingHoldTimer = 0;

    let camPitchInertia = 0;
    let camRollInertia = 0;
    let vibeOffset = 0;

    cleanupSteps.push({ label: 'engine audio', cleanup: () => sounds.stopEngine() });
    sounds.init();
    sounds.startEngine();

    const introSpeechTimer = guidanceEnabled
      ? window.setTimeout(() => {
          sounds.speakInstructor(`${mission.title} 연습을 시작합니다. 안전 운전하세요.`);
        }, 1200)
      : null;
    if (introSpeechTimer !== null) {
      cleanupSteps.push({
        label: 'instructor timeout',
        cleanup: () => window.clearTimeout(introSpeechTimer),
      });
    }

    const applyPenalty = (deduction: ScoreDeduction) => {
      if (!runState.applyPenalty(deduction)) return;
      playInstructionalWarning(guidanceEnabled, deduction.reason, sounds);
      onPenalty(deduction);
    };

    const triggerPenalty = (reason: string, points: number) => {
      const now = performance.now();
      const existing = runState.deductions.find((d) => d.reason === reason && now - d.timestamp < 3000);
      if (existing) return;
      applyPenalty({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: now,
        reason,
        points,
      });
    };

    let animationFrameId: number;

    const animate = (currentTime: number) => {
      if (runState.isFinished) return;
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      const inputs = inputsRef.current;

      // Handle Gear Shifts (P, R, N, D)
      carState.gear = consumeGearCommand(inputs, carState.gear);

      // Handle Turn Signals
      if (inputs.signalLeft) {
        carState.turnSignal = carState.turnSignal === 'left' ? 'none' : 'left';
        inputs.signalLeft = false;
        if (carState.turnSignal === 'left') {
          if (guidanceEnabled) sounds.speakInstructor('좌측 깜빡이 작동. 좌측 사이드미러를 확인하세요.');
        }
      }
      if (inputs.signalRight) {
        carState.turnSignal = carState.turnSignal === 'right' ? 'none' : 'right';
        inputs.signalRight = false;
        if (carState.turnSignal === 'right') {
          if (guidanceEnabled) sounds.speakInstructor('우측 깜빡이 작동. 우측 사이드미러를 확인하세요.');
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

      inputs.mouseSteerRatio = updateKeyboardSteeringRatio(
        inputs.mouseSteerRatio,
        inputs.steerLeft,
        inputs.steerRight,
        inputs.isMouseSteeringActive,
        delta
      );

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
      const visualWheelSteer = getVisualWheelSteerRotation(carState.steerAngle);
      car3D.frontLeftWheel.rotation.y = visualWheelSteer;
      car3D.frontRightWheel.rotation.y = visualWheelSteer;

      // W remains the accelerator and S remains the brake in every driving gear.
      const motion = updateLongitudinalMotion({
        speedMs: carState.speedMs,
        gear: carState.gear,
        accelerator: inputs.forward,
        brake: inputs.backward,
        handbrake: inputs.handbrake,
        deltaSeconds: delta,
        vehicle,
      });
      carState.speedMs = motion.speedMs;
      carState.isBraking = motion.isBraking;
      carState.isAccelerating = motion.isAccelerating;
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

      carState.speed = Math.round((carState.speedMs * 3600) / 1000);
      carState.odometer += Math.abs(carState.speedMs) * delta;

      // Position update with correct Ackermann Yaw Kinematics
      if (Math.abs(carState.speedMs) > 0.01) {
        const moveDist = carState.speedMs * delta;
        const nextPose = advanceVehiclePose(
          carState,
          carState.speedMs,
          carState.steerAngle,
          delta,
          vehicle.wheelBase
        );
        carState.x = nextPose.x;
        carState.z = nextPose.z;
        carState.heading = nextPose.heading;

        const wheelRoll = moveDist / 0.33;
        car3D.frontLeftWheel.rotation.x += wheelRoll;
        car3D.frontRightWheel.rotation.x += wheelRoll;
        car3D.rearLeftWheel.rotation.x += wheelRoll;
        car3D.rearRightWheel.rotation.x += wheelRoll;
      }

      if (resetIfVehiclePoseUnrecoverable(
        carState,
        { pitch: car3D.carGroup.rotation.x, roll: car3D.carGroup.rotation.z },
        onReset,
      )) {
        sounds.playWarning();
        sounds.speakInstructor('차량 자세를 복구할 수 없어 훈련을 다시 시작합니다.');
        return;
      }

      car3D.carGroup.position.set(carState.x, carState.y, carState.z);
      car3D.carGroup.rotation.y = carState.heading;

      sounds.updateEngine(carState.speed, carState.isAccelerating, carState.gear);

      // Dynamic Traffic AI
      trafficMeshes.forEach(({ data: tv, visual }) => {
        // 회전교차로 순환 차량 — 원형 궤도 이동 후 조기 반환
        if (tv.motion === 'orbit' && tv.orbit) {
          tv.orbit.angle += tv.orbit.angularSpeed * tv.orbit.direction * delta;
          tv.x = tv.orbit.cx + Math.cos(tv.orbit.angle) * tv.orbit.radius;
          tv.z = tv.orbit.cz + Math.sin(tv.orbit.angle) * tv.orbit.radius;
          syncTrafficVehicleVisual(visual, tv, delta, { isBraking: false });
          return; // yield/aggressive 응답 스킵
        }

        // 온커밍 차량 — +Z 방향 주행 (비보호 좌회전 양보 대상)
        if (tv.motion === 'oncoming') {
          const tvSpeedMs = (tv.speedKmH * 1000) / 3600;
          tv.z += tvSpeedMs * delta;
          if (tv.z > 200) tv.z = -180 - Math.random() * 60;
          syncTrafficVehicleVisual(visual, tv, delta, { isBraking: false });
          return;
        }

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
            if (guidanceEnabled) sounds.speakInstructor('뒤차가 양보하고 있습니다. 서서히 진입하세요.');
          } else if (tv.behavior === 'aggressive') {
            tv.isYielding = false;
            currentTargetSpeed = tv.speedKmH + 22;
            tv.isFlashingHighBeam = false;
            if (zDiff < 18 && !tv.isHonking) {
              tv.isHonking = true;
              sounds.playWarning();
              if (guidanceEnabled) sounds.speakInstructor('위험! 뒤차가 가속 중입니다. 끼어들지 마세요.');
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

        const baseSpeedMs = (tv.speedKmH * 1000) / 3600;
        syncTrafficVehicleVisual(visual, tv, delta, {
          isBraking: tvSpeedMs < baseSpeedMs - 1,
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
            recordAttemptEvent(attemptEvents, { type: 'collision' });
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
            recordAttemptEvent(attemptEvents, { type: 'collision' });
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

      // Mission Evaluation (objectives-driven)
      lightController?.update(delta);
      const evalResult = evaluator.evaluate({
        carState,
        traffic: trafficVehicles,
        lights: lightController,
      });
      evalResult.penalties.forEach(applyPenalty);
      evalResult.attemptEvents.forEach((event) => recordAttemptEvent(attemptEvents, event));

      if (evalResult.failReason) {
        const failure = runState.finishFailure(evalResult.failReason);
        if (!failure) return;
        playAttemptResultSound(resultFeedbackEnabled, 'failure', sounds);
        if (guidanceEnabled) sounds.speakInstructor(`미션 실패! ${evalResult.failReason}`);
        onMissionFail(failure.reason, failure.score, failure.deductions, [...attemptEvents]);
      }

      // 신호등 램프 렌더링
      if (lightController) {
        signals.forEach((rig) => {
          const phase = lightController.getPhase(rig.axis);
          rig.lamps.red.emissiveIntensity = phase === 'red' ? 2.6 : 0.05;
          rig.lamps.yellow.emissiveIntensity = phase === 'yellow' ? 2.6 : 0.05;
          rig.lamps.green.emissiveIntensity = phase === 'green' ? 2.6 : 0.05;
        });
      }

      // Mission Goal Check
      if (mission.targetArea && !runState.isFinished) {
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
                  const result = runState.finishSuccess();
                  if (!result) return;
                  const passed = isAttemptPassed(
                    result.score >= 70,
                    assessMissionResult(attemptEvents),
                  );
                  playAttemptResultSound(resultFeedbackEnabled, passed ? 'success' : 'failure', sounds);
                  if (guidanceEnabled) {
                    sounds.speakInstructor(
                      passed ? '축하합니다! 완벽하게 주차를 완료했습니다.' : '안전 기준을 충족하지 못했습니다. 결과를 확인하세요.',
                    );
                  }
                  onMissionComplete(result.score, result.deductions, [...attemptEvents]);
                }
              }
            } else {
              const result = runState.finishSuccess();
              if (!result) return;
              const passed = isAttemptPassed(
                result.score >= 70,
                assessMissionResult(attemptEvents),
              );
              playAttemptResultSound(resultFeedbackEnabled, passed ? 'success' : 'failure', sounds);
              if (guidanceEnabled) {
                sounds.speakInstructor(
                  passed ? '축하합니다! 미션을 성공적으로 완주했습니다.' : '안전 기준을 충족하지 못했습니다. 결과를 확인하세요.',
                );
              }
              onMissionComplete(result.score, result.deductions, [...attemptEvents]);
            }
          }
        } else {
          parkingHoldTimer = 0;
        }
      }

      const guideVisibility = getGuideVisibility(
        mission.id,
        carState.gear,
        uiStateRef.current.showTrajectory,
        uiStateRef.current.showWidthGuide
      );
      trajectoryRenderer.update(
        vehicle,
        carState,
        guideVisibility.trajectory,
        guideVisibility.width
      );

      // Camera Placement
      const [cpx, cpy, cpz] = vehicle.cockpitPos;
      const carPos = car3D.carGroup.position;
      const heading = carState.heading;

      if (uiStateRef.current.cameraMode === 'cockpit') {
        const eyeOffset = new THREE.Vector3(cpx, cpy + vibeOffset, cpz).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
        mainCamera.position.copy(carPos).add(eyeOffset);

        const lookDir = getForwardDirection(
          heading + headYaw,
          headPitch + camPitchInertia - 0.04
        );
        mainCamera.lookAt(mainCamera.position.clone().add(lookDir));
        mainCamera.rotation.z = camRollInertia;
      } else if (uiStateRef.current.cameraMode === 'chase') {
        const chaseDist = 6.8;
        const chaseHeight = 3.2 + vibeOffset;
        const camPos = getRearDirection(heading)
          .multiplyScalar(chaseDist)
          .add(carPos);
        camPos.y += chaseHeight;
        mainCamera.position.lerp(camPos, 10 * delta);
        mainCamera.lookAt(carPos.x, carPos.y + 1.2, carPos.z);
        mainCamera.rotation.z = 0;
      } else if (uiStateRef.current.cameraMode === 'top') {
        mainCamera.position.set(carPos.x, carPos.y + 24, carPos.z);
        mainCamera.lookAt(carPos.x, carPos.y, carPos.z);
        mainCamera.rotation.z = 0;
      } else if (uiStateRef.current.cameraMode === 'hood') {
        const hoodOffset = getHoodCameraOffset(vehicle, vibeOffset)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
        mainCamera.position.copy(carPos).add(hoodOffset);
        const lookDir = getForwardDirection(heading);
        mainCamera.lookAt(mainCamera.position.clone().add(lookDir));
        mainCamera.rotation.z = 0;
      }

      renderer.render(scene, mainCamera);

      const renderMirror = (
        mirrorRenderer: THREE.WebGLRenderer | null,
        mirrorCam: THREE.PerspectiveCamera,
        mPos: [number, number, number],
        view: MirrorView
      ) => {
        if (!mirrorRenderer) return;
        const worldPos = new THREE.Vector3(...mPos).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(carPos);
        mirrorCam.position.copy(worldPos);
        const mirrorDir = getMirrorDirection(heading, view);
        mirrorCam.lookAt(mirrorCam.position.clone().add(mirrorDir));
        mirrorRenderer.render(scene, mirrorCam);
      };

      renderMirror(leftMirrorRenderer, leftMirrorCam, vehicle.leftMirrorPos, 'left');
      renderMirror(rightMirrorRenderer, rightMirrorCam, vehicle.rightMirrorPos, 'right');
      renderMirror(rearMirrorRenderer, rearMirrorCam, vehicle.rearMirrorPos, 'rear');

      if (backupRenderer && carState.gear === 'R') {
        const backupPos = getBackupCameraOffset(vehicle)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), heading)
          .add(carPos);
        backupCam.position.copy(backupPos);
        const backupDir = getRearDirection(heading, -0.25);
        backupCam.lookAt(backupCam.position.clone().add(backupDir));
        backupRenderer.render(scene, backupCam);
      }

      onStateUpdate(carState, sensors, trafficVehicles);
    };

    animationFrameId = requestAnimationFrame(animate);
    cleanupSteps.push({
      label: 'animation frame',
      cleanup: () => cancelAnimationFrame(animationFrameId),
    });

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      mainCamera.aspect = w / h;
      mainCamera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    cleanupSteps.push({
      label: 'resize listener',
      cleanup: () => window.removeEventListener('resize', handleResize),
    });

    return cleanup;
    } catch (error) {
      cleanup();
      const message = `Failed to initialize driving simulation: ${errorMessage(error)}`;
      console.error(message, error);
      setVehicleAssetState({ status: 'error', message });
      return cleanup;
    }
  }, [vehicle, mission, vehicleAssetState, guidanceEnabled, resultFeedbackEnabled]);

  return (
    <div ref={containerRef} className="w-full h-full relative cursor-crosshair overflow-hidden">
      {vehicleAssetState.status === 'loading' && <SimulationAssetLoadingOverlay />}
      {vehicleAssetState.status === 'error'
        && <SimulationAssetErrorOverlay message={vehicleAssetState.message} />}
    </div>
  );
};
