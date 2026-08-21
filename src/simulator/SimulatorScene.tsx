import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CameraMode, GearMode, MissionMode, SimulatorSettings, TurnSignal, VehicleOption } from './config';

export interface SimulatorInputs {
  throttle: boolean;
  brake: boolean;
  lookLeft: boolean;
  lookRight: boolean;
  lookRear: boolean;
  toggleLeft: boolean;
  toggleRight: boolean;
  toggleHazard: boolean;
  toggleParkingBrake: boolean;
  horn: boolean;
  pendingGear: GearMode | null;
  wheelDegrees: number;
  steeringHeld: boolean;
}

export interface Telemetry {
  speedKmh: number;
  gear: GearMode;
  wheelDegrees: number;
  wheelTurns: number;
  frontWheelDegrees: number;
  throttle: number;
  brake: number;
  parkingBrake: boolean;
  turnSignal: TurnSignal;
  score: number;
  elapsed: number;
  speedLimit: number;
  zoneLabel: string;
  frontDistance: number;
  rearDistance: number;
  lane: number;
  laneCount: number;
  collision: boolean;
  leftChecked: boolean;
  rightChecked: boolean;
  rearChecked: boolean;
  trafficLight: 'off' | 'green' | 'yellow' | 'red';
  trafficWarning: 'none' | 'yielding' | 'aggressive';
}

export const INITIAL_TELEMETRY: Telemetry = {
  speedKmh: 0,
  gear: 'P',
  wheelDegrees: 0,
  wheelTurns: 0,
  frontWheelDegrees: 0,
  throttle: 0,
  brake: 0,
  parkingBrake: true,
  turnSignal: 'none',
  score: 100,
  elapsed: 0,
  speedLimit: 30,
  zoneLabel: '연습 구간',
  frontDistance: -1,
  rearDistance: -1,
  lane: 1,
  laneCount: 1,
  collision: false,
  leftChecked: false,
  rightChecked: false,
  rearChecked: false,
  trafficLight: 'off',
  trafficWarning: 'none',
};

type Obstacle = { x: number; z: number; radius: number; name: string };
type TrafficCar = { group: THREE.Group; speed: number; baseSpeed: number; behavior: 'normal' | 'yielding' | 'aggressive'; lane: number };

interface SceneProps {
  mission: MissionMode;
  vehicle: VehicleOption;
  resetToken: number;
  inputsRef: React.MutableRefObject<SimulatorInputs>;
  settingsRef: React.MutableRefObject<SimulatorSettings>;
  cameraRef: React.MutableRefObject<CameraMode>;
  mutedRef: React.MutableRefObject<boolean>;
  leftMirrorRef: React.RefObject<HTMLCanvasElement | null>;
  rightMirrorRef: React.RefObject<HTMLCanvasElement | null>;
  rearMirrorRef: React.RefObject<HTMLCanvasElement | null>;
  backupRef: React.RefObject<HTMLCanvasElement | null>;
  onTelemetry: (telemetry: Telemetry) => void;
  onNotice: (message: string, tone?: 'info' | 'warning' | 'success') => void;
  onComplete: (score: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const moveToward = (value: number, target: number, amount: number) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
const normalizeAngle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const angleDifference = (a: number, b: number) => Math.abs(normalizeAngle(a - b));
const localPoint = (x: number, z: number, heading: number, localX: number, localZ: number) => ({
  x: x + localX * Math.cos(heading) - localZ * Math.sin(heading),
  z: z - localX * Math.sin(heading) + localZ * Math.cos(heading),
});

class SoundEngine {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private muted = false;
  private lastBeep = 0;
  private lastSpeech = '';
  private lastSpeechAt = 0;

  resume() {
    try {
      if (!this.context) this.context = new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      if (!this.oscillator && !this.muted) {
        this.oscillator = this.context.createOscillator();
        this.gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();
        this.oscillator.type = 'sawtooth';
        this.oscillator.frequency.value = 45;
        this.gain.gain.value = 0.02;
        filter.type = 'lowpass';
        filter.frequency.value = 280;
        this.oscillator.connect(filter);
        filter.connect(this.gain);
        this.gain.connect(this.context.destination);
        this.oscillator.start();
      }
    } catch {}
  }

  setMuted(value: boolean) {
    this.muted = value;
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(value ? 0 : 0.02, this.context.currentTime, 0.04);
    if (value && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  update(speedKmh: number, throttle: number, gear: GearMode) {
    if (!this.context || !this.oscillator || !this.gain || this.muted) return;
    const rpm = gear === 'P' || gear === 'N' ? 800 + throttle * 1600 : 850 + speedKmh * 38 + throttle * 1200;
    this.oscillator.frequency.setTargetAtTime(clamp(rpm / 17, 42, 310), this.context.currentTime, 0.06);
    this.gain.gain.setTargetAtTime(0.017 + throttle * 0.04, this.context.currentTime, 0.06);
  }

  tone(frequency: number, duration = 0.08, volume = 0.07, type: OscillatorType = 'sine') {
    if (!this.context || this.muted) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration + 0.01);
  }

  click(high: boolean) { this.tone(high ? 860 : 650, 0.035, 0.04); }
  horn() { this.tone(385, 0.23, 0.11, 'square'); }
  warning() { this.tone(740, 0.15, 0.08, 'triangle'); }
  collision() { this.tone(92, 0.31, 0.2, 'sawtooth'); }
  success() { [523, 659, 784].forEach((frequency, index) => setTimeout(() => this.tone(frequency, 0.17, 0.08, 'triangle'), index * 105)); }
  sensor(distance: number) {
    const now = performance.now();
    if (now - this.lastBeep < clamp(distance * 230, 80, 620)) return;
    this.lastBeep = now;
    this.tone(1450, 0.045, 0.055, 'triangle');
  }
  speak(text: string) {
    if (this.muted || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (this.lastSpeech === text && now - this.lastSpeechAt < 4500) return;
    this.lastSpeech = text;
    this.lastSpeechAt = now;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.05;
    speechSynthesis.speak(utterance);
  }
  stop() {
    try { this.oscillator?.stop(); this.oscillator?.disconnect(); } catch {}
    this.oscillator = null;
    this.gain = null;
  }
}

const sound = new SoundEngine();
export const resumeSimulatorSound = () => sound.resume();

const material = (color: number, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness });
const box = (width: number, height: number, depth: number, color: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const addRoad = (group: THREE.Group, width: number, length: number, x = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material(0x30363c, 0.95));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.01, z);
  mesh.receiveShadow = true;
  group.add(mesh);
};

const addLaneLines = (group: THREE.Group, width: number, length: number, lanes: number) => {
  for (let lane = 1; lane < lanes; lane += 1) {
    const x = -width / 2 + width * lane / lanes;
    for (let z = length / 2 - 4; z > -length / 2; z -= 9) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 4.5), new THREE.MeshBasicMaterial({ color: 0xf7fafc }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.027, z);
      group.add(dash);
    }
  }
};

const addCone = (group: THREE.Group, obstacles: Obstacle[], x: number, z: number, name = '라바콘') => {
  const cone = new THREE.Group();
  const base = box(0.34, 0.05, 0.34, 0xf97316);
  base.position.y = 0.025;
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.65, 14), material(0xff641c));
  body.position.y = 0.36;
  cone.add(base, body);
  cone.position.set(x, 0, z);
  group.add(cone);
  obstacles.push({ x, z, radius: 0.42, name });
};

const addParkedCar = (group: THREE.Group, obstacles: Obstacle[], x: number, z: number, heading: number, color: number, name: string) => {
  const car = new THREE.Group();
  const body = box(1.82, 0.62, 4.55, color);
  body.position.y = 0.48;
  const cabin = box(1.52, 0.52, 2.25, 0x172033);
  cabin.position.y = 0.96;
  car.add(body, cabin);
  car.position.set(x, 0, z);
  car.rotation.y = heading;
  group.add(car);
  obstacles.push({ x, z, radius: 2.35, name });
};

const buildCourse = (mission: MissionMode) => {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), material(0x3d6b43, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  if (mission.id === 'curve_s') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 66), new THREE.Vector3(0, 0, 42), new THREE.Vector3(-11, 0, 25),
      new THREE.Vector3(-13, 0, 5), new THREE.Vector3(-4, 0, -14), new THREE.Vector3(12, 0, -30),
      new THREE.Vector3(10, 0, -48), new THREE.Vector3(0, 0, -66),
    ]);
    const points = curve.getPoints(120);
    points.forEach((point, index) => {
      if (index % 2 === 0) {
        const road = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), material(0x30363c, 0.95));
        road.rotation.x = -Math.PI / 2;
        road.position.set(point.x, 0.012, point.z);
        group.add(road);
      }
      if (index > 3 && index < points.length - 4 && index % 7 === 0) {
        const tangent = curve.getTangent(index / (points.length - 1)).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const left = point.clone().add(normal.clone().multiplyScalar(4.05));
        const right = point.clone().add(normal.clone().multiplyScalar(-4.05));
        addCone(group, obstacles, left.x, left.z, 'S자 코스 경계');
        addCone(group, obstacles, right.x, right.z, 'S자 코스 경계');
      }
    });
  } else if (mission.id === 'curve_t') {
    addRoad(group, 5.2, 44, -20, 10);
    addRoad(group, 45, 5.2, 0, -10);
    addRoad(group, 5.2, 44, 20, 10);
    [-22.8, -17.2].forEach((x) => { for (let z = 31; z >= -7; z -= 5) addCone(group, obstacles, x, z, '직각 코스 경계'); });
    for (let x = -17; x <= 17; x += 4.8) addCone(group, obstacles, x, -12.8, '직각 코스 경계');
    [17.2, 22.8].forEach((x) => { for (let z = -7; z <= 31; z += 5) addCone(group, obstacles, x, z, '직각 코스 경계'); });
  } else if (mission.id === 'parking_reverse') {
    addRoad(group, 48, 48);
    for (let x = -12; x <= 12; x += 3.2) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 6.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.026, -13);
      group.add(line);
    }
    addParkedCar(group, obstacles, -3.2, -13, Math.PI, 0xbe123c, '왼쪽 주차 차량');
    addParkedCar(group, obstacles, 3.2, -13, Math.PI, 0x475569, '오른쪽 주차 차량');
  } else if (mission.id === 'parking_parallel') {
    addRoad(group, 16, 70);
    addLaneLines(group, 8, 70, 2);
    addParkedCar(group, obstacles, 4, 5.2, 0, 0x0f8ac0, '앞쪽 주차 차량');
    addParkedCar(group, obstacles, 4, -11.2, 0, 0x198754, '뒤쪽 주차 차량');
  } else {
    addRoad(group, mission.roadWidth, mission.roadLength);
    addLaneLines(group, mission.roadWidth, mission.roadLength, mission.laneCount);
    if (mission.id === 'width_slalom') {
      [[0.9, 38], [-1.2, 22], [1.25, 6], [-1.25, -10], [1.1, -27], [-0.8, -44]].forEach(([x, z]) => addCone(group, obstacles, x, z));
    }
    if (mission.id === 'functional_exam') {
      [44, 34, 24, 14].forEach((z, index) => addCone(group, obstacles, index % 2 ? 3 : -3, z, '기능시험 굴절 콘'));
      addParkedCar(group, obstacles, 1.7, -70, 0, 0x475569, '기능시험 주차 차량');
      addParkedCar(group, obstacles, 8.3, -70, 0, 0x9f1239, '기능시험 주차 차량');
    }
  }

  const goal = new THREE.Mesh(new THREE.PlaneGeometry(mission.goal.width, mission.goal.depth), new THREE.MeshBasicMaterial({ color: 0x42e68c, transparent: true, opacity: 0.34, side: THREE.DoubleSide }));
  goal.rotation.x = -Math.PI / 2;
  goal.position.set(mission.goal.x, 0.034, mission.goal.z);
  group.add(goal);
  return { group, obstacles };
};

const createPlayerCar = (vehicle: VehicleOption) => {
  const group = new THREE.Group();
  const exterior = new THREE.Group();
  const body = box(vehicle.width, vehicle.height * 0.42, vehicle.length, Number.parseInt(vehicle.color.slice(1), 16));
  body.position.y = vehicle.height * 0.21 + 0.24;
  const cabin = box(vehicle.width * 0.82, vehicle.height * 0.46, vehicle.length * 0.48, 0x354b62);
  cabin.position.set(0, vehicle.height * 0.62, vehicle.length * 0.07);
  exterior.add(body, cabin);
  group.add(exterior);
  const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 20);
  wheelGeometry.rotateZ(Math.PI / 2);
  const wheelMaterial = material(0x10141a, 0.92);
  const wheels: THREE.Mesh[] = [];
  const frontPivots: THREE.Group[] = [];
  const wheelX = vehicle.width / 2 + 0.02;
  [[-wheelX, -vehicle.wheelBase / 2, true], [wheelX, -vehicle.wheelBase / 2, true], [-wheelX, vehicle.wheelBase / 2, false], [wheelX, vehicle.wheelBase / 2, false]].forEach(([x, z, front]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x as number, 0.34, z as number);
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (front) frontPivots.push(pivot);
  });
  const signalMaterial = () => new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.08 });
  const leftSignal = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.05), signalMaterial());
  const rightSignal = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.05), signalMaterial());
  leftSignal.position.set(-vehicle.width * 0.35, vehicle.height * 0.32, -vehicle.length / 2 - 0.02);
  rightSignal.position.set(vehicle.width * 0.35, vehicle.height * 0.32, -vehicle.length / 2 - 0.02);
  group.add(leftSignal, rightSignal);
  return { group, exterior, wheels, frontPivots, leftSignal, rightSignal };
};

const createTraffic = (mission: MissionMode, scene: THREE.Scene) => {
  const cars: TrafficCar[] = [];
  if (mission.group !== 'road') return cars;
  const laneWidth = mission.roadWidth / mission.laneCount;
  const count = mission.id === 'highway_5lane' ? 12 : 7;
  for (let index = 0; index < count; index += 1) {
    const lane = index % mission.laneCount;
    const group = new THREE.Group();
    const body = box(index % 5 === 3 ? 2.15 : 1.86, 0.68, index % 5 === 3 ? 6.4 : 4.55, [0x2563eb, 0xdc2626, 0x059669, 0x475569, 0xd97706, 0x7c3aed][index % 6]);
    body.position.y = 0.49;
    group.add(body);
    group.position.set(-mission.roadWidth / 2 + laneWidth * (lane + 0.5), 0, mission.roadLength / 2 - 35 - index * 38);
    scene.add(group);
    cars.push({ group, lane, speed: 0, baseSpeed: mission.id === 'highway_5lane' ? 62 + (index % 5) * 6 : 38 + (index % 4) * 6, behavior: index % 3 === 0 ? 'yielding' : index % 3 === 1 ? 'aggressive' : 'normal' });
  }
  return cars;
};

export const SimulatorScene: React.FC<SceneProps> = ({ mission, vehicle, resetToken, inputsRef, settingsRef, cameraRef, mutedRef, leftMirrorRef, rightMirrorRef, rearMirrorRef, backupRef, onTelemetry, onNotice, onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x94c5ec);
    scene.fog = new THREE.FogExp2(0xa7c9e5, 0.0026);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = 'driveprep-main-canvas';
    container.replaceChildren(renderer.domElement);

    const makeMirror = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return null;
      const mirror = new THREE.WebGLRenderer({ canvas, antialias: true });
      mirror.setSize(canvas.width, canvas.height, false);
      mirror.outputColorSpace = THREE.SRGBColorSpace;
      return mirror;
    };
    const leftRenderer = makeMirror(leftMirrorRef.current);
    const rightRenderer = makeMirror(rightMirrorRef.current);
    const rearRenderer = makeMirror(rearMirrorRef.current);
    const backupRenderer = makeMirror(backupRef.current);
    const camera = new THREE.PerspectiveCamera(settingsRef.current.fov, container.clientWidth / container.clientHeight, 0.05, 1200);
    const leftCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.08, 260);
    const rightCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.08, 260);
    const rearCamera = new THREE.PerspectiveCamera(46, 21 / 8, 0.08, 280);
    const backupCamera = new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 120);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3e5d43, 0.95));
    const sun = new THREE.DirectionalLight(0xfff5df, 1.4);
    sun.position.set(55, 100, 42);
    sun.castShadow = true;
    scene.add(sun);
    const course = buildCourse(mission);
    scene.add(course.group);
    const player = createPlayerCar(vehicle);
    scene.add(player.group);
    const traffic = createTraffic(mission, scene);
    const trajectoryGeometry = new THREE.BufferGeometry();
    const widthGeometry = new THREE.BufferGeometry();
    const trajectory = new THREE.LineSegments(trajectoryGeometry, new THREE.LineBasicMaterial({ color: 0x35c7f4, transparent: true, opacity: 0.9 }));
    const widthGuide = new THREE.LineSegments(widthGeometry, new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.72 }));
    scene.add(trajectory, widthGuide);

    let x = mission.start.x;
    let z = mission.start.z;
    let heading = mission.start.heading;
    let speed = 0;
    let gear = mission.start.gear;
    let wheelDegrees = 0;
    let throttle = 0;
    let brake = 0;
    let parkingBrake = true;
    let turnSignal: TurnSignal = 'none';
    let score = 100;
    let elapsed = 0;
    let lastSafe = { x, z, heading };
    let lastSafeAt = 0;
    let collisionUntil = 0;
    let collisionCooldown = 0;
    let blinkTimer = 0;
    let blinkState = false;
    let leftCheckedAt = -999;
    let rightCheckedAt = -999;
    let rearCheckedAt = -999;
    let signalAt = -999;
    let previousLane = 1;
    let completed = false;
    let lastTelemetry = 0;
    let trafficLight: Telemetry['trafficLight'] = 'off';
    const penaltyAt = new Map<string, number>();
    inputsRef.current.wheelDegrees = 0;
    inputsRef.current.pendingGear = null;

    const laneWidth = mission.roadWidth / Math.max(1, mission.laneCount);
    const laneFor = (px: number) => mission.laneCount <= 1 ? 1 : clamp(Math.floor((px + mission.roadWidth / 2) / laneWidth) + 1, 1, mission.laneCount);
    previousLane = laneFor(x);
    const announce = (message: string, tone: 'info' | 'warning' | 'success' = 'info', voice = false) => {
      onNotice(message, tone);
      if (voice && settingsRef.current.voiceGuide) sound.speak(message);
    };
    const penalty = (key: string, message: string, points: number, cooldown = 2600) => {
      const now = performance.now();
      if (now - (penaltyAt.get(key) ?? -Infinity) < cooldown) return;
      penaltyAt.set(key, now);
      score = Math.max(0, score - points);
      announce(`${message} (-${points}점)`, 'warning', true);
      sound.warning();
    };
    announce(`${mission.title} 연습을 시작합니다.`, 'info', true);

    const obstacleDistance = (forward: boolean) => {
      let best = Infinity;
      const all = [...course.obstacles, ...traffic.map((car) => ({ x: car.group.position.x, z: car.group.position.z, radius: 2.3, name: '주행 차량' }))];
      for (const obstacle of all) {
        const dx = obstacle.x - x;
        const dz = obstacle.z - z;
        const longitudinal = -(dx * Math.sin(heading) + dz * Math.cos(heading));
        const lateral = Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading));
        if (lateral < vehicle.width / 2 + obstacle.radius && (forward ? longitudinal > 0 : longitudinal < 0)) best = Math.min(best, Math.abs(longitudinal));
      }
      return best < 6 ? best : -1;
    };

    const colliding = () => {
      if (!['curve_s', 'curve_t', 'parking_reverse', 'parking_parallel'].includes(mission.id)) {
        if (Math.abs(x) > mission.roadWidth / 2 - vehicle.width * 0.45) return '도로 경계';
      }
      const all = [...course.obstacles, ...traffic.map((car) => ({ x: car.group.position.x, z: car.group.position.z, radius: 2.2, name: '주행 차량' }))];
      for (const obstacle of all) {
        if (Math.hypot(obstacle.x - x, obstacle.z - z) < obstacle.radius + Math.max(vehicle.width, vehicle.length * 0.38) / 2) return obstacle.name;
      }
      return '';
    };

    const updateGuides = (frontDegrees: number) => {
      const settings = settingsRef.current;
      trajectory.visible = settings.showTrajectory;
      widthGuide.visible = settings.showWidthGuide;
      if (!trajectory.visible && !widthGuide.visible) return;
      const direction = gear === 'R' ? -1 : 1;
      let gx = x; let gz = z; let gh = heading;
      const left: THREE.Vector3[] = []; const right: THREE.Vector3[] = []; const cross: THREE.Vector3[] = [];
      for (let index = 0; index <= 24; index += 1) {
        const rightX = Math.cos(gh); const rightZ = -Math.sin(gh);
        const a = new THREE.Vector3(gx - rightX * vehicle.width / 2, 0.055, gz - rightZ * vehicle.width / 2);
        const b = new THREE.Vector3(gx + rightX * vehicle.width / 2, 0.055, gz + rightZ * vehicle.width / 2);
        left.push(a); right.push(b); if (index % 4 === 0) cross.push(a, b);
        const step = 0.62 * direction;
        gx += -Math.sin(gh) * step; gz += -Math.cos(gh) * step;
        if (Math.abs(frontDegrees) > 0.01) gh -= (step / vehicle.wheelBase) * Math.tan(THREE.MathUtils.degToRad(frontDegrees));
      }
      const line: number[] = [];
      for (let index = 0; index < left.length - 1; index += 1) line.push(left[index].x, left[index].y, left[index].z, left[index + 1].x, left[index + 1].y, left[index + 1].z, right[index].x, right[index].y, right[index].z, right[index + 1].x, right[index + 1].y, right[index + 1].z);
      const hashes: number[] = [];
      for (let index = 0; index < cross.length; index += 2) hashes.push(cross[index].x, cross[index].y, cross[index].z, cross[index + 1].x, cross[index + 1].y, cross[index + 1].z);
      trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
      widthGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hashes, 3));
    };

    const renderMirrors = () => {
      if (settingsRef.current.mirrorMode === 'off') return;
      const backDirection = (offset: number) => new THREE.Vector3(Math.sin(heading + offset), -0.035, Math.cos(heading + offset)).normalize();
      const render = (target: THREE.WebGLRenderer | null, mirrorCamera: THREE.PerspectiveCamera, px: number, py: number, pz: number, offset: number) => {
        if (!target) return;
        mirrorCamera.position.set(px, py, pz);
        mirrorCamera.up.set(0, 1, 0);
        mirrorCamera.lookAt(mirrorCamera.position.clone().add(backDirection(offset)));
        target.render(scene, mirrorCamera);
      };
      const left = localPoint(x, z, heading, -vehicle.width / 2 - 0.06, -0.35);
      const right = localPoint(x, z, heading, vehicle.width / 2 + 0.06, -0.35);
      const eye = localPoint(x, z, heading, vehicle.eyeX, vehicle.eyeZ);
      render(leftRenderer, leftCamera, left.x, vehicle.eyeY - 0.12, left.z, 0.23);
      render(rightRenderer, rightCamera, right.x, vehicle.eyeY - 0.12, right.z, -0.23);
      render(rearRenderer, rearCamera, eye.x, vehicle.eyeY + 0.08, eye.z, 0);
      if (gear === 'R' && backupRenderer) {
        const rear = localPoint(x, z, heading, 0, vehicle.length * 0.48);
        backupCamera.position.set(rear.x, vehicle.height * 0.58, rear.z);
        const direction = backDirection(0); direction.y = -0.22;
        backupCamera.lookAt(backupCamera.position.clone().add(direction));
        backupRenderer.render(scene, backupCamera);
      }
    };

    let frame = 0;
    let previous = performance.now();
    const animate = (time: number) => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(0.045, Math.max(0.001, (time - previous) / 1000));
      previous = time;
      elapsed += delta;
      const inputs = inputsRef.current;
      sound.setMuted(mutedRef.current);

      if (inputs.pendingGear) {
        const requested = inputs.pendingGear;
        inputs.pendingGear = null;
        const stationary = Math.abs(speed) < 0.25;
        if (stationary && inputs.brake) {
          gear = requested;
          if (requested === 'P') parkingBrake = true;
          announce(`${requested}단이 체결되었습니다.`);
        } else {
          announce('완전히 정지하고 풋브레이크를 밟은 뒤 기어를 변경하세요.', 'warning', true);
        }
      }
      if (inputs.toggleParkingBrake) {
        inputs.toggleParkingBrake = false;
        if (Math.abs(speed) < 0.4 || parkingBrake) parkingBrake = !parkingBrake;
        else announce('주행 중에는 주차브레이크를 체결할 수 없습니다.', 'warning', true);
      }
      if (inputs.toggleLeft) { inputs.toggleLeft = false; turnSignal = turnSignal === 'left' ? 'none' : 'left'; signalAt = elapsed; }
      if (inputs.toggleRight) { inputs.toggleRight = false; turnSignal = turnSignal === 'right' ? 'none' : 'right'; signalAt = elapsed; }
      if (inputs.toggleHazard) { inputs.toggleHazard = false; turnSignal = turnSignal === 'hazard' ? 'none' : 'hazard'; }
      if (inputs.horn) { inputs.horn = false; sound.horn(); }
      if (inputs.lookLeft) leftCheckedAt = elapsed;
      if (inputs.lookRight) rightCheckedAt = elapsed;
      if (inputs.lookRear) rearCheckedAt = elapsed;

      if (turnSignal !== 'none') {
        blinkTimer += delta;
        if (blinkTimer >= 0.42) { blinkTimer = 0; blinkState = !blinkState; sound.click(blinkState); }
      } else { blinkTimer = 0; blinkState = false; }
      (player.leftSignal.material as THREE.MeshStandardMaterial).emissiveIntensity = (turnSignal === 'left' || turnSignal === 'hazard') && blinkState ? 3 : 0.08;
      (player.rightSignal.material as THREE.MeshStandardMaterial).emissiveIntensity = (turnSignal === 'right' || turnSignal === 'hazard') && blinkState ? 3 : 0.08;

      throttle = moveToward(throttle, inputs.throttle ? 1 : 0, delta * (inputs.throttle ? 2.8 : 4.5));
      brake = moveToward(brake, inputs.brake ? 1 : 0, delta * (inputs.brake ? 5 : 6));
      wheelDegrees = clamp(inputs.wheelDegrees, -vehicle.maxSteeringWheelTurns * 360, vehicle.maxSteeringWheelTurns * 360);
      if (!inputs.steeringHeld && Math.abs(speed) > 0.45) {
        wheelDegrees = moveToward(wheelDegrees, 0, settingsRef.current.steeringReturn * clamp(Math.abs(speed) / 12, 0.16, 1.35) * 105 * delta);
        inputs.wheelDegrees = wheelDegrees;
      }
      const frontDegrees = clamp(wheelDegrees / vehicle.steeringRatio, -vehicle.maxWheelAngleDeg, vehicle.maxWheelAngleDeg);
      const direction = gear === 'D' ? 1 : gear === 'R' ? -1 : 0;
      if (parkingBrake || gear === 'P' || gear === 'N') speed = moveToward(speed, 0, delta * (parkingBrake ? 11 : 4));
      else if (brake > 0.01) speed = moveToward(speed, 0, vehicle.braking * brake * delta);
      else if (throttle > 0.01) speed = moveToward(speed, direction * ((direction > 0 ? vehicle.maxSpeedKmh : vehicle.reverseMaxKmh) / 3.6), vehicle.acceleration * (0.25 + throttle * 0.75) * delta);
      else if (direction !== 0) speed = moveToward(speed, direction * (mission.group === 'license' ? 0.9 : 1.25), 0.65 * delta);
      else speed = moveToward(speed, 0, 0.9 * delta);

      if (Math.abs(speed) > 0.005) {
        x += -Math.sin(heading) * speed * delta;
        z += -Math.cos(heading) * speed * delta;
        if (Math.abs(frontDegrees) > 0.001) heading = normalizeAngle(heading - (speed / vehicle.wheelBase) * Math.tan(THREE.MathUtils.degToRad(frontDegrees)) * delta);
      }
      player.group.position.set(x, 0, z);
      player.group.rotation.y = heading;
      player.frontPivots.forEach((pivot) => { pivot.rotation.y = -THREE.MathUtils.degToRad(frontDegrees); });
      player.wheels.forEach((wheel) => { wheel.rotation.x += speed * delta / 0.34; });

      let trafficWarning: Telemetry['trafficWarning'] = 'none';
      const requestedDirection = turnSignal === 'left' ? -1 : turnSignal === 'right' ? 1 : 0;
      const targetLane = clamp(laneFor(x) + requestedDirection, 1, mission.laneCount);
      traffic.forEach((car) => {
        const behind = car.group.position.z - z;
        let targetSpeed = car.baseSpeed;
        if (requestedDirection && car.lane + 1 === targetLane && behind > 0 && behind < 45) {
          if (car.behavior === 'yielding') { targetSpeed -= 17; trafficWarning = trafficWarning === 'aggressive' ? 'aggressive' : 'yielding'; }
          if (car.behavior === 'aggressive') { targetSpeed += 18; trafficWarning = 'aggressive'; }
        }
        car.speed = THREE.MathUtils.lerp(car.speed, targetSpeed, Math.min(1, delta * 2.4));
        car.group.position.z -= car.speed / 3.6 * delta;
        if (car.group.position.z < -mission.roadLength / 2 - 30) car.group.position.z = mission.roadLength / 2 + 25 + Math.random() * 55;
      });

      const lane = laneFor(x);
      if (mission.laneCount > 1 && lane !== previousLane && Math.abs(speed) * 3.6 > 12) {
        const correctSignal = lane < previousLane ? turnSignal === 'left' : turnSignal === 'right';
        const mirrorAt = lane < previousLane ? leftCheckedAt : rightCheckedAt;
        if (!correctSignal || elapsed - signalAt < 1.4) penalty('lane-signal', '차선 변경 전에 방향지시등을 충분히 먼저 켜세요.', 8, 1800);
        if (elapsed - mirrorAt > 4) penalty('lane-mirror', '차선 변경 전에 사이드미러와 사각지대를 확인하세요.', 8, 1800);
        previousLane = lane;
      }

      let speedLimit = mission.speedLimitKmh;
      let zoneLabel = mission.group === 'license' ? '장내 기능 연습' : mission.group === 'road' ? '일반 도로' : '기본 조작 구간';
      if (mission.id === 'city_traffic' && z <= 86 && z >= 30) { speedLimit = 30; zoneLabel = '어린이보호구역'; }
      if (mission.id === 'highway_5lane') zoneLabel = '고속화도로';
      if (mission.id === 'city_traffic') {
        const cycle = elapsed % 17;
        trafficLight = cycle < 8 ? 'green' : cycle < 10 ? 'yellow' : 'red';
      } else trafficLight = 'off';
      if (Math.abs(speed) * 3.6 > speedLimit + 3) penalty('speeding', `${zoneLabel} 제한속도 ${speedLimit}km/h를 초과했습니다.`, 2, 3500);

      const hit = colliding();
      if (hit && time > collisionCooldown) {
        collisionCooldown = time + 950;
        collisionUntil = time + 500;
        x = lastSafe.x; z = lastSafe.z; heading = lastSafe.heading; speed = 0;
        penalty(`collision-${hit}`, `${hit}과 충돌했습니다.`, 12, 900);
        sound.collision();
      } else if (!hit && time - lastSafeAt > 180) {
        lastSafeAt = time;
        lastSafe = { x, z, heading };
      }

      const frontDistance = obstacleDistance(true);
      const rearDistance = obstacleDistance(false);
      const activeDistance = gear === 'R' ? rearDistance : frontDistance;
      if (activeDistance > 0) sound.sensor(activeDistance);
      const inGoal = Math.abs(x - mission.goal.x) <= mission.goal.width / 2 && Math.abs(z - mission.goal.z) <= mission.goal.depth / 2;
      const headingOk = mission.goal.heading === undefined || angleDifference(heading, mission.goal.heading) <= (mission.goal.headingTolerance ?? 0.35);
      const parkingOk = !mission.goal.requiresPark || (gear === 'P' && parkingBrake && Math.abs(speed) < 0.15);
      if (inGoal && headingOk && parkingOk && !completed) {
        completed = true;
        speed = 0;
        gear = 'P';
        parkingBrake = true;
        inputs.throttle = false;
        inputs.brake = false;
        sound.success();
        announce(`완료! 안전 점수 ${score}점입니다.`, 'success', true);
        onComplete(score);
      }

      updateGuides(frontDegrees);
      const settings = settingsRef.current;
      const mode = cameraRef.current;
      camera.fov = settings.fov;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      camera.up.set(0, 1, 0);
      player.exterior.visible = mode === 'chase' || mode === 'top';
      const vibration = settings.cameraMotion === 'off' ? 0 : Math.sin(time * 0.018) * Math.min(0.004, Math.abs(speed) * 0.0004);
      const headYaw = inputs.lookLeft ? 0.58 : inputs.lookRight ? -0.58 : 0;
      if (mode === 'cockpit') {
        const eye = localPoint(x, z, heading, vehicle.eyeX, vehicle.eyeZ + settings.seatForeAft);
        camera.position.set(eye.x, vehicle.eyeY + settings.seatHeight + vibration, eye.z);
        camera.lookAt(camera.position.clone().add(new THREE.Vector3(-Math.sin(heading + headYaw), brake > 0.2 ? -0.045 : -0.025, -Math.cos(heading + headYaw))));
      } else if (mode === 'hood') {
        const hood = localPoint(x, z, heading, 0, -vehicle.length * 0.4);
        camera.position.set(hood.x, vehicle.height * 0.7 + vibration, hood.z);
        camera.lookAt(camera.position.clone().add(new THREE.Vector3(-Math.sin(heading), -0.025, -Math.cos(heading))));
      } else if (mode === 'chase') {
        const behind = localPoint(x, z, heading, 0, vehicle.length * 1.55);
        camera.position.lerp(new THREE.Vector3(behind.x, vehicle.height + 2.5, behind.z), Math.min(1, delta * 7));
        camera.lookAt(x, 0.95, z);
      } else {
        camera.up.set(0, 0, -1);
        camera.position.set(x, 27, z + 0.01);
        camera.lookAt(x, 0, z - 0.01);
      }
      if ((mode === 'cockpit' || mode === 'hood') && settings.cameraMotion !== 'off') {
        const rollLimit = settings.cameraMotion === 'realistic' ? 0.03 : 0.0218;
        camera.rotateZ(clamp(-speed * THREE.MathUtils.degToRad(frontDegrees) * 0.006, -rollLimit, rollLimit));
      }
      sound.update(Math.abs(speed) * 3.6, throttle, gear);
      renderer.render(scene, camera);
      renderMirrors();

      if (time - lastTelemetry > 75) {
        lastTelemetry = time;
        onTelemetry({ speedKmh: Math.round(Math.abs(speed) * 3.6), gear, wheelDegrees: Math.round(wheelDegrees), wheelTurns: Number((wheelDegrees / 360).toFixed(2)), frontWheelDegrees: Number(frontDegrees.toFixed(1)), throttle, brake, parkingBrake, turnSignal, score, elapsed, speedLimit, zoneLabel, frontDistance, rearDistance, lane, laneCount: mission.laneCount, collision: time < collisionUntil, leftChecked: elapsed - leftCheckedAt < 1, rightChecked: elapsed - rightCheckedAt < 1, rearChecked: elapsed - rearCheckedAt < 1, trafficLight, trafficWarning });
      }
    };

    frame = requestAnimationFrame(animate);
    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      sound.stop();
      renderer.dispose();
      leftRenderer?.dispose();
      rightRenderer?.dispose();
      rearRenderer?.dispose();
      backupRenderer?.dispose();
      trajectoryGeometry.dispose();
      widthGeometry.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((entry) => entry.dispose());
        }
      });
    };
  }, [mission, vehicle, resetToken, inputsRef, settingsRef, cameraRef, mutedRef, leftMirrorRef, rightMirrorRef, rearMirrorRef, backupRef, onTelemetry, onNotice, onComplete]);

  return <div ref={containerRef} className="driveprep-viewport" />;
};
