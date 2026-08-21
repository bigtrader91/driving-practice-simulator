import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Flag,
  Gauge,
  Keyboard,
  Map as MapIcon,
  RotateCcw,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

type Gear = 'P' | 'R' | 'N' | 'D';
type Signal = 'none' | 'left' | 'right' | 'hazard';
type CameraMode = 'cockpit' | 'hood' | 'chase' | 'top';
type ActionId =
  | 'throttle' | 'brake' | 'signalLeft' | 'signalRight' | 'lookLeft' | 'lookRight'
  | 'lookRear' | 'hazard' | 'parkingBrake' | 'horn' | 'gearP' | 'gearR' | 'gearN'
  | 'gearD' | 'camera' | 'trajectory' | 'widthGuide' | 'reset' | 'hud';

type MissionId =
  | 'basic_controls' | 'width_slalom' | 'curve_s' | 'curve_t' | 'functional_exam'
  | 'parking_reverse' | 'parking_parallel' | 'city_lane_change' | 'city_traffic'
  | 'highway_5lane';

interface Vehicle {
  id: 'compact' | 'sedan' | 'suv';
  name: string;
  category: string;
  width: number;
  length: number;
  height: number;
  wheelBase: number;
  steeringRatio: number;
  maxWheelDeg: number;
  maxSpeed: number;
  acceleration: number;
  braking: number;
  reverseMax: number;
  eye: [number, number, number];
  color: number;
}

interface Mission {
  id: MissionId;
  order: number;
  group: 'basic' | 'license' | 'road';
  title: string;
  subtitle: string;
  difficulty: '입문' | '보통' | '어려움';
  description: string;
  tip: string;
  start: { x: number; z: number; heading: number; gear: Gear };
  goal: { x: number; z: number; width: number; depth: number; heading?: number; tolerance?: number; park?: boolean };
  speedLimit: number;
  roadWidth: number;
  roadLength: number;
  lanes: number;
}

interface SettingsState {
  fov: number;
  seatHeight: number;
  seatDepth: number;
  cameraMotion: 'off' | 'comfort' | 'realistic';
  mirrorMode: 'auto' | 'always' | 'off';
  mirrorScale: number;
  hudScale: number;
  compactHud: boolean;
  steeringSensitivity: number;
  steeringReturn: number;
  trajectory: boolean;
  widthGuide: boolean;
  voice: boolean;
}

interface Inputs {
  throttle: boolean;
  brake: boolean;
  lookLeft: boolean;
  lookRight: boolean;
  lookRear: boolean;
  signalLeftPulse: boolean;
  signalRightPulse: boolean;
  hazardPulse: boolean;
  parkingBrakePulse: boolean;
  hornPulse: boolean;
  pendingGear: Gear | null;
  wheelDeg: number;
  steeringHeld: boolean;
}

interface Snapshot {
  speed: number;
  gear: Gear;
  parkingBrake: boolean;
  signal: Signal;
  wheelDeg: number;
  frontWheelDeg: number;
  throttle: number;
  brake: number;
  score: number;
  elapsed: number;
  lane: number;
  zone: string;
  frontDistance: number;
  rearDistance: number;
  leftChecked: boolean;
  rightChecked: boolean;
  rearChecked: boolean;
  trafficWarning: 'none' | 'yielding' | 'aggressive';
  trafficLight: 'off' | 'green' | 'yellow' | 'red';
  collision: boolean;
}

interface Obstacle {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  radius?: number;
  label: string;
}

interface TrafficCar {
  mesh: THREE.Group;
  x: number;
  z: number;
  speed: number;
  laneX: number;
  behavior: 'normal' | 'yielding' | 'aggressive';
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const approach = (value: number, target: number, amount: number) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const VEHICLES: Vehicle[] = [
  { id: 'compact', name: '경차', category: '캐스퍼 · 모닝급', width: 1.60, length: 3.60, height: 1.55, wheelBase: 2.40, steeringRatio: 14.8, maxWheelDeg: 36.5, maxSpeed: 105, acceleration: 4.5, braking: 9.2, reverseMax: 24, eye: [-0.34, 1.30, 0.38], color: 0x20b8c8 },
  { id: 'sedan', name: '준중형 세단', category: '아반떼 · K5급', width: 1.82, length: 4.68, height: 1.44, wheelBase: 2.72, steeringRatio: 15.2, maxWheelDeg: 33.2, maxSpeed: 135, acceleration: 5.1, braking: 9.7, reverseMax: 28, eye: [-0.39, 1.25, 0.48], color: 0x2670e8 },
  { id: 'suv', name: '중형 SUV', category: '싼타페 · 쏘렌토급', width: 1.91, length: 4.83, height: 1.70, wheelBase: 2.81, steeringRatio: 15.6, maxWheelDeg: 31, maxSpeed: 130, acceleration: 4.8, braking: 9.8, reverseMax: 26, eye: [-0.43, 1.49, 0.58], color: 0x5c55df },
];

const MISSIONS: Mission[] = [
  { id: 'basic_controls', order: 1, group: 'basic', title: '기본 조작과 출발·정지', subtitle: '브레이크를 밟고 D단 체결 후 부드럽게 출발합니다.', difficulty: '입문', description: 'P/R/N/D 인터록, 엑셀과 풋브레이크, 주차브레이크와 핸들 복원을 익히는 입문 코스입니다.', tip: 'S를 누른 채 4로 D단을 체결하고 Space로 주차브레이크를 해제한 뒤 W를 조금씩 누르세요.', start: { x: 0, z: 58, heading: 0, gear: 'P' }, goal: { x: 0, z: -66, width: 7, depth: 8 }, speedLimit: 30, roadWidth: 10, roadLength: 170, lanes: 1 },
  { id: 'width_slalom', order: 2, group: 'license', title: '차폭감과 좁은 길', subtitle: '라바콘 사이를 저속으로 통과하며 좌우 차폭을 익힙니다.', difficulty: '입문', description: '보닛 기준점, 차폭 가이드와 타이어 궤적을 비교하며 좁은 통로를 통과합니다.', tip: '핸들을 크게 흔들지 말고 멀리 바라보며 작은 각도로 수정하세요.', start: { x: 0, z: 64, heading: 0, gear: 'P' }, goal: { x: 0, z: -64, width: 7, depth: 8 }, speedLimit: 20, roadWidth: 8, roadLength: 160, lanes: 1 },
  { id: 'curve_s', order: 3, group: 'license', title: 'S자 곡선 코스', subtitle: '내륜차와 핸들 되감기 타이밍을 연습합니다.', difficulty: '보통', description: '연속 곡선에서 앞바퀴와 뒷바퀴가 지나가는 궤적 차이를 익힙니다.', tip: '코너 안쪽보다 바깥쪽에 여유를 두고 차가 펴지는 만큼 핸들을 천천히 되감으세요.', start: { x: 0, z: 66, heading: 0, gear: 'P' }, goal: { x: 0, z: -66, width: 8, depth: 8 }, speedLimit: 20, roadWidth: 8, roadLength: 160, lanes: 1 },
  { id: 'curve_t', order: 4, group: 'license', title: '직각(T자) 코스', subtitle: '어깨선 기준과 끝까지 감기·되감기를 익힙니다.', difficulty: '보통', description: '좁은 직각 통로에 진입하여 정지선 확인 후 반대편 출구로 빠져나갑니다.', tip: '앞 모서리가 코너를 충분히 지난 뒤 핸들을 감고 차체가 출구와 평행해질 때 되감으세요.', start: { x: -20, z: 31, heading: 0, gear: 'P' }, goal: { x: 20, z: 31, width: 6, depth: 7, heading: Math.PI, tolerance: 0.55 }, speedLimit: 15, roadWidth: 5, roadLength: 70, lanes: 1 },
  { id: 'functional_exam', order: 5, group: 'license', title: '장내 기능시험 종합', subtitle: '출발·정지선·굴절·주차 절차를 한 번에 연습합니다.', difficulty: '어려움', description: '기능시험에서 반복되는 저속 조작, 정지선, 방향지시등과 최종 정차 절차를 종합합니다.', tip: '속도보다 절차가 우선입니다. 각 구간 진입 전에 브레이크로 속도를 충분히 줄이세요.', start: { x: -5, z: 72, heading: 0, gear: 'P' }, goal: { x: 5, z: -70, width: 7, depth: 9, park: true }, speedLimit: 20, roadWidth: 18, roadLength: 170, lanes: 2 },
  { id: 'parking_reverse', order: 6, group: 'license', title: '후진 주차', subtitle: '사이드미러와 후방카메라로 주차선 안에 맞춥니다.', difficulty: '보통', description: '빈 주차칸 앞에서 각도를 만든 뒤 R단으로 후진해 차체를 반듯하게 세웁니다.', tip: '주차칸 모서리가 뒤바퀴 근처에 왔을 때 핸들을 감고 차체가 평행해지기 전에 되감으세요.', start: { x: -7, z: 10, heading: -Math.PI / 2, gear: 'P' }, goal: { x: 0, z: -13, width: 2.8, depth: 5.8, heading: Math.PI, tolerance: 0.28, park: true }, speedLimit: 10, roadWidth: 48, roadLength: 48, lanes: 1 },
  { id: 'parking_parallel', order: 7, group: 'license', title: '평행 주차', subtitle: '앞뒤 차량 사이에 45도 공식으로 진입합니다.', difficulty: '어려움', description: '앞차와 나란히 선 뒤 후진 각도를 만들고 연석 가까이 차체를 정렬합니다.', tip: '처음부터 연석에 붙으려 하지 말고 45도, 핸들 정렬, 반대쪽 끝까지 감기의 순서를 지키세요.', start: { x: 0, z: 17, heading: 0, gear: 'P' }, goal: { x: 4, z: -3, width: 2.7, depth: 7, heading: 0, tolerance: 0.22, park: true }, speedLimit: 10, roadWidth: 16, roadLength: 70, lanes: 2 },
  { id: 'city_lane_change', order: 8, group: 'road', title: '시내 차선 변경', subtitle: '깜빡이·미러 확인·부드러운 진입 순서를 연습합니다.', difficulty: '보통', description: '3차로에서 2차로와 1차로로 이동하며 뒤차의 접근 속도를 확인합니다.', tip: '깜빡이를 먼저 켠 뒤 미러를 확인하고 옆 차로와 속도를 맞춘 다음 한 번에 부드럽게 이동하세요.', start: { x: 3.6, z: 128, heading: 0, gear: 'P' }, goal: { x: -3.6, z: -130, width: 3.4, depth: 10 }, speedLimit: 60, roadWidth: 12.8, roadLength: 300, lanes: 3 },
  { id: 'city_traffic', order: 9, group: 'road', title: '종합 도로주행', subtitle: '신호·정지선·횡단보도·어린이보호구역을 통과합니다.', difficulty: '어려움', description: '실제 도로주행에서 자주 만나는 교차로와 제한속도 변화에 대응합니다.', tip: '정지선 앞에서는 신호가 바뀔 가능성을 고려해 미리 가속페달에서 발을 떼세요.', start: { x: 6, z: 150, heading: 0, gear: 'P' }, goal: { x: 6, z: -150, width: 4, depth: 10 }, speedLimit: 50, roadWidth: 20, roadLength: 340, lanes: 4 },
  { id: 'highway_5lane', order: 10, group: 'road', title: '다차로 고속화도로', subtitle: '양보 차량과 가속 차량을 구분하며 여러 차로를 이동합니다.', difficulty: '어려움', description: '6차로 도로에서 미러 속 차량 크기 변화를 보고 안전한 간격에만 진입합니다.', tip: '깜빡이를 켠 뒤 최소 2초 동안 미러를 보고 빠르게 커지는 차량이 있으면 먼저 보내세요.', start: { x: 9, z: 255, heading: 0, gear: 'P' }, goal: { x: -9, z: -255, width: 3.5, depth: 12 }, speedLimit: 80, roadWidth: 22.8, roadLength: 570, lanes: 6 },
];

const ACTIONS: { id: ActionId; label: string; group: string }[] = [
  { id: 'throttle', label: '엑셀', group: '페달' }, { id: 'brake', label: '풋브레이크', group: '페달' },
  { id: 'signalLeft', label: '좌측 방향지시등', group: '신호' }, { id: 'signalRight', label: '우측 방향지시등', group: '신호' },
  { id: 'lookLeft', label: '좌측 미러·숄더체크', group: '미러' }, { id: 'lookRight', label: '우측 미러·숄더체크', group: '미러' },
  { id: 'lookRear', label: '룸미러 확인', group: '미러' }, { id: 'hazard', label: '비상등', group: '신호' },
  { id: 'parkingBrake', label: '주차브레이크', group: '페달' }, { id: 'horn', label: '경적', group: '기타' },
  { id: 'gearP', label: 'P단', group: '기어' }, { id: 'gearR', label: 'R단', group: '기어' },
  { id: 'gearN', label: 'N단', group: '기어' }, { id: 'gearD', label: 'D단', group: '기어' },
  { id: 'camera', label: '시점 전환', group: '화면' }, { id: 'trajectory', label: '궤적선', group: '화면' },
  { id: 'widthGuide', label: '차폭선', group: '화면' }, { id: 'reset', label: '시작 위치 복귀', group: '기타' },
  { id: 'hud', label: 'HUD 표시 전환', group: '화면' },
];

const DEFAULT_BINDINGS: Record<ActionId, string> = {
  throttle: 'KeyW', brake: 'KeyS', signalLeft: 'KeyA', signalRight: 'KeyD', lookLeft: 'KeyQ', lookRight: 'KeyE',
  lookRear: 'KeyR', hazard: 'KeyZ', parkingBrake: 'Space', horn: 'KeyX', gearP: 'Digit1', gearR: 'Digit2',
  gearN: 'Digit3', gearD: 'Digit4', camera: 'KeyC', trajectory: 'KeyT', widthGuide: 'KeyV', reset: 'KeyF', hud: 'KeyH',
};

const DEFAULT_SETTINGS: SettingsState = {
  fov: 67, seatHeight: 0, seatDepth: 0, cameraMotion: 'comfort', mirrorMode: 'auto', mirrorScale: 1,
  hudScale: 1, compactHud: true, steeringSensitivity: 1, steeringReturn: 1, trajectory: true,
  widthGuide: true, voice: true,
};

const EMPTY_SNAPSHOT: Snapshot = {
  speed: 0, gear: 'P', parkingBrake: true, signal: 'none', wheelDeg: 0, frontWheelDeg: 0,
  throttle: 0, brake: 0, score: 100, elapsed: 0, lane: 1, zone: '출발 준비', frontDistance: -1,
  rearDistance: -1, leftChecked: false, rightChecked: false, rearChecked: false,
  trafficWarning: 'none', trafficLight: 'off', collision: false,
};

const keyLabel = (code: string) => code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? 'Space' : code.replace('Arrow', '');

function loadJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}

class SoundSystem {
  private ctx: AudioContext | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  muted = false;

  resume() {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtor();
    }
    void this.ctx.resume();
    if (!this.engine) {
      this.engine = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 38;
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 260;
      this.engine.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engine.start();
    }
  }

  updateEngine(speed: number, throttle: number) {
    if (!this.ctx || !this.engine || !this.engineGain) return;
    const now = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(38 + Math.abs(speed) * 1.6 + throttle * 42, now, 0.08);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.018 + throttle * 0.025, now, 0.08);
  }

  tone(frequency = 720, duration = 0.08, volume = 0.05, type: OscillatorType = 'sine') {
    if (this.muted) return;
    this.resume(); if (!this.ctx) return;
    const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); const now = this.ctx.currentTime;
    osc.type = type; osc.frequency.value = frequency; gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain); gain.connect(this.ctx.destination); osc.start(now); osc.stop(now + duration);
  }

  horn() { this.tone(360, 0.28, 0.09, 'square'); }
  collision() { this.tone(90, 0.32, 0.16, 'sawtooth'); }
  success() { [523, 659, 784].forEach((f, i) => window.setTimeout(() => this.tone(f, 0.16, 0.07), i * 100)); }
  speak(text: string, enabled: boolean) {
    if (this.muted || !enabled || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ko-KR'; utterance.rate = 1.05;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
}

const sounds = new SoundSystem();

function createCar(vehicle: Vehicle, color = vehicle.color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.24 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101722, roughness: 0.72 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x29445a, metalness: 0.25, roughness: 0.15 });
  const lower = new THREE.Mesh(new THREE.BoxGeometry(vehicle.width, vehicle.height * 0.42, vehicle.length), bodyMat);
  lower.position.y = 0.36 + vehicle.height * 0.21; lower.castShadow = true; group.add(lower);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(vehicle.width * 0.84, vehicle.height * 0.42, vehicle.length * 0.48), glass);
  cabin.position.set(0, 0.66 + vehicle.height * 0.42, -vehicle.length * 0.08); cabin.castShadow = true; group.add(cabin);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(vehicle.width * 0.86, 0.24, 0.5), dark);
  dash.position.set(0, 0.78, vehicle.length * 0.18); group.add(dash);
  const steering = new THREE.Group();
  steering.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 12, 28), dark));
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.025), dark); steering.add(spoke);
  steering.position.set(vehicle.eye[0], 0.93, vehicle.length * 0.12); steering.rotation.x = 0.72; group.add(steering);
  const wheels: THREE.Group[] = [];
  const frontWheels: THREE.Group[] = [];
  const wheelX = vehicle.width / 2 + 0.03; const frontZ = vehicle.wheelBase / 2; const rearZ = -vehicle.wheelBase / 2;
  for (const [x, z, front] of [[-wheelX, frontZ, 1], [wheelX, frontZ, 1], [-wheelX, rearZ, 0], [wheelX, rearZ, 0]] as const) {
    const pivot = new THREE.Group(); const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.18, 18), dark);
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; pivot.add(tire); pivot.position.set(x, 0.31, z); group.add(pivot);
    wheels.push(pivot); if (front) frontWheels.push(pivot);
  }
  const brakeLights: THREE.Mesh[] = [];
  for (const x of [-vehicle.width * 0.32, vehicle.width * 0.32]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.06), new THREE.MeshStandardMaterial({ color: 0xff203d, emissive: 0xff102d, emissiveIntensity: 0.2 }));
    light.position.set(x, 0.55, -vehicle.length / 2 - 0.03); group.add(light); brakeLights.push(light);
  }
  return { group, wheels, frontWheels, steering, brakeLights };
}

function addBox(scene: THREE.Object3D, obstacles: Obstacle[], x: number, z: number, width: number, depth: number, height: number, color: number, label: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
  mesh.position.set(x, height / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  obstacles.push({ x, z, halfW: width / 2, halfD: depth / 2, label });
}

function buildWorld(scene: THREE.Scene, mission: Mission, vehicle: Vehicle) {
  const obstacles: Obstacle[] = []; const traffic: TrafficCar[] = [];
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x343b42, roughness: 0.98 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x365c3d, roughness: 1 });
  const white = new THREE.MeshBasicMaterial({ color: 0xf4f7fb });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xf7c948 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), grass); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);

  const addRoad = (x: number, z: number, width: number, depth: number) => {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), asphalt); road.rotation.x = -Math.PI / 2; road.position.set(x, 0, z); road.receiveShadow = true; scene.add(road);
  };
  const addLine = (x: number, z: number, width: number, depth: number, material = white) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material); line.rotation.x = -Math.PI / 2; line.position.set(x, 0.015, z); scene.add(line);
  };
  const cone = (x: number, z: number, label = '라바콘') => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0xf97316 }));
    mesh.position.set(x, 0.35, z); mesh.castShadow = true; scene.add(mesh); obstacles.push({ x, z, halfW: 0.22, halfD: 0.22, radius: 0.24, label });
  };
  const parked = (x: number, z: number, heading: number, color: number, label: string) => {
    const car = createCar({ ...vehicle, width: 1.82, length: 4.5, height: 1.45, wheelBase: 2.7 }, color).group;
    car.position.set(x, 0, z); car.rotation.y = heading; scene.add(car);
    const rotated = Math.abs(Math.sin(heading)) > 0.7;
    obstacles.push({ x, z, halfW: (rotated ? 4.5 : 1.82) / 2, halfD: (rotated ? 1.82 : 4.5) / 2, label });
  };

  if (mission.id === 'curve_t') {
    addRoad(-20, 10, 5, 45); addRoad(0, -10, 45, 5); addRoad(20, 10, 5, 45);
    for (let z = 31; z >= -7; z -= 5) { cone(-22.7, z); cone(-17.3, z); cone(17.3, z); cone(22.7, z); }
    for (let x = -17; x <= 17; x += 5) cone(x, -12.7);
  } else if (mission.id === 'parking_reverse') {
    addRoad(0, 0, 48, 48); parked(-3.3, -13, Math.PI, 0xd53f55, '왼쪽 주차 차량'); parked(3.3, -13, Math.PI, 0x64748b, '오른쪽 주차 차량');
    addLine(-1.5, -13, 0.13, 6.2); addLine(1.5, -13, 0.13, 6.2); addBox(scene, obstacles, 0, -16.2, 18, 0.45, 1.1, 0x9aa3ad, '후방 벽');
  } else if (mission.id === 'parking_parallel') {
    addRoad(0, 0, 16, 70); addBox(scene, obstacles, 6.1, 0, 1.2, 70, 0.25, 0xb9c0c8, '연석');
    parked(4, 6, 0, 0x2f80d0, '앞 차량'); parked(4, -12, 0, 0x2ea66b, '뒤 차량'); addLine(4, 1.5, 2.8, 0.13); addLine(4, -7.5, 2.8, 0.13);
  } else if (mission.id === 'curve_s') {
    const points = [[0, 66], [0, 38], [-11, 20], [-13, 2], [-5, -15], [11, -31], [9, -50], [0, -66]];
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    for (let i = 0; i <= 120; i += 2) {
      const p = curve.getPoint(i / 120); const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), asphalt); disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, 0, p.z); scene.add(disc);
      if (i % 12 === 0 && i > 0 && i < 120) { const t = curve.getTangent(i / 120); const n = new THREE.Vector3(-t.z, 0, t.x); cone(p.x + n.x * 4.05, p.z + n.z * 4.05); cone(p.x - n.x * 4.05, p.z - n.z * 4.05); }
    }
  } else {
    addRoad(0, 0, mission.roadWidth, mission.roadLength);
    const laneWidth = mission.roadWidth / mission.lanes;
    for (let lane = 1; lane < mission.lanes; lane++) {
      const x = -mission.roadWidth / 2 + laneWidth * lane;
      for (let z = mission.roadLength / 2 - 4; z > -mission.roadLength / 2; z -= 9) addLine(x, z, 0.14, 4);
    }
    addLine(-mission.roadWidth / 2 + 0.18, 0, 0.18, mission.roadLength, yellow);
    addLine(mission.roadWidth / 2 - 0.18, 0, 0.18, mission.roadLength);
    addBox(scene, obstacles, -mission.roadWidth / 2 - 0.55, 0, 0.55, mission.roadLength, 0.34, 0xb9c0c8, '왼쪽 연석');
    addBox(scene, obstacles, mission.roadWidth / 2 + 0.55, 0, 0.55, mission.roadLength, 0.34, 0xb9c0c8, '오른쪽 연석');

    if (mission.id === 'width_slalom') {
      for (const [x, z] of [[0, 28], [-1.25, 12], [1.25, -5], [-1.25, -22], [0, -38]]) cone(x, z);
      cone(-1.45, -48, '좁은 통로'); cone(1.45, -48, '좁은 통로');
    }
    if (mission.id === 'functional_exam') {
      for (let z = 45; z > -35; z -= 10) { cone(-6.2 + (z % 20 ? 0 : 3), z); cone(6.2 - (z % 20 ? 0 : 3), z); }
      addLine(0, 18, mission.roadWidth, 0.35, yellow); addLine(0, -38, mission.roadWidth, 0.35, yellow);
    }
    if (mission.id === 'city_traffic') {
      const school = new THREE.Mesh(new THREE.PlaneGeometry(mission.roadWidth, 42), new THREE.MeshBasicMaterial({ color: 0x8e3a3a, transparent: true, opacity: 0.72 })); school.rotation.x = -Math.PI / 2; school.position.set(0, 0.008, 40); scene.add(school);
      addLine(0, 8, mission.roadWidth, 0.55); for (let x = -mission.roadWidth / 2 + 1; x < mission.roadWidth / 2; x += 1.2) addLine(x, 3.8, 0.7, 6);
    }
    if (mission.group === 'road') {
      const laneCenters = Array.from({ length: mission.lanes }, (_, i) => -mission.roadWidth / 2 + laneWidth * (i + 0.5));
      const count = mission.id === 'highway_5lane' ? 10 : 6;
      for (let i = 0; i < count; i++) {
        const laneX = laneCenters[i % laneCenters.length]; const dataVehicle = { ...vehicle, width: 1.78, length: 4.5, height: 1.45, wheelBase: 2.65 };
        const mesh = createCar(dataVehicle, [0xd34b5b, 0x2e83cc, 0x37a46e, 0xe0a239, 0x6f62c6][i % 5]).group;
        const z = mission.roadLength / 2 - 35 - i * 26; mesh.position.set(laneX, 0, z); scene.add(mesh);
        traffic.push({ mesh, x: laneX, z, speed: mission.id === 'highway_5lane' ? 55 + (i % 4) * 9 : 30 + (i % 3) * 8, laneX, behavior: i % 4 === 1 ? 'aggressive' : i % 3 === 0 ? 'yielding' : 'normal' });
      }
    }
  }

  const goal = new THREE.Mesh(new THREE.PlaneGeometry(mission.goal.width, mission.goal.depth), new THREE.MeshBasicMaterial({ color: 0x42dc8b, transparent: true, opacity: 0.38, side: THREE.DoubleSide }));
  goal.rotation.x = -Math.PI / 2; goal.position.set(mission.goal.x, 0.022, mission.goal.z); scene.add(goal);
  return { obstacles, traffic };
}

interface SimViewProps {
  mission: Mission;
  vehicle: Vehicle;
  resetKey: number;
  inputsRef: React.MutableRefObject<Inputs>;
  settingsRef: React.MutableRefObject<SettingsState>;
  cameraModeRef: React.MutableRefObject<CameraMode>;
  leftMirror: React.RefObject<HTMLCanvasElement | null>;
  rightMirror: React.RefObject<HTMLCanvasElement | null>;
  rearMirror: React.RefObject<HTMLCanvasElement | null>;
  backupMirror: React.RefObject<HTMLCanvasElement | null>;
  onSnapshot: (snapshot: Snapshot) => void;
  onNotice: (text: string, tone?: 'info' | 'warning' | 'success') => void;
  onComplete: (score: number) => void;
}

const SimView: React.FC<SimViewProps> = ({ mission, vehicle, resetKey, inputsRef, settingsRef, cameraModeRef, leftMirror, rightMirror, rearMirror, backupMirror, onSnapshot, onNotice, onComplete }) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current; const width = host.clientWidth || innerWidth; const height = host.clientHeight || innerHeight;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fc7ee); scene.fog = new THREE.FogExp2(0xa9d1ec, 0.0024);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8)); renderer.setSize(width, height); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    host.replaceChildren(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(settingsRef.current.fov, width / height, 0.05, 900);
    const mirrorCamera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 300);
    const leftCamera = mirrorCamera.clone(); const rightCamera = mirrorCamera.clone(); const rearCamera = mirrorCamera.clone(); const backupCamera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 180);
    const makeMirrorRenderer = (canvas: HTMLCanvasElement | null) => canvas ? new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }) : null;
    const leftRenderer = makeMirrorRenderer(leftMirror.current); const rightRenderer = makeMirrorRenderer(rightMirror.current); const rearRenderer = makeMirrorRenderer(rearMirror.current); const backupRenderer = makeMirrorRenderer(backupMirror.current);
    for (const mirrorRenderer of [leftRenderer, rightRenderer, rearRenderer, backupRenderer]) { mirrorRenderer?.setPixelRatio(1); mirrorRenderer?.setSize(320, 180, false); mirrorRenderer && (mirrorRenderer.outputColorSpace = THREE.SRGBColorSpace); }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x37524a, 1.15));
    const sun = new THREE.DirectionalLight(0xfff7df, 1.45); sun.position.set(70, 120, 55); sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536); sun.shadow.camera.left = -90; sun.shadow.camera.right = 90; sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90; scene.add(sun);
    const { obstacles, traffic } = buildWorld(scene, mission, vehicle);
    const car = createCar(vehicle); scene.add(car.group);

    const guideGroup = new THREE.Group(); scene.add(guideGroup);
    const trajectoryGeometry = new THREE.BufferGeometry(); const trajectoryLine = new THREE.LineSegments(trajectoryGeometry, new THREE.LineBasicMaterial({ color: 0x4bd7ff, transparent: true, opacity: 0.9 })); guideGroup.add(trajectoryLine);
    const widthGeometry = new THREE.BufferGeometry(); const widthLine = new THREE.LineSegments(widthGeometry, new THREE.LineBasicMaterial({ color: 0xffd14f, transparent: true, opacity: 0.74 })); guideGroup.add(widthLine);

    let x = mission.start.x; let z = mission.start.z; let heading = mission.start.heading; let speedMs = 0; let gear = mission.start.gear; let parkingBrake = true; let signal: Signal = 'none';
    let throttle = 0; let brake = 0; let score = 100; let collision = false; let completed = false; let goalHold = 0; let blinkTimer = 0; let blinkOn = false; let lastTime = performance.now(); let elapsed = 0; let lastSnapshot = 0; let lastLane = 1; let leftCheckedAt = -99; let rightCheckedAt = -99; let rearCheckedAt = -99; let overspeedCooldown = 0; let collisionCooldown = 0; let signalCooldown = 0; let lastSafe = { x, z, heading };

    const penalize = (reason: string, points: number) => {
      score = Math.max(0, score - points); onNotice(`${reason} (-${points}점)`, 'warning'); sounds.tone(340, 0.16, 0.07, 'square');
    };
    const changeGear = (next: Gear) => {
      const stationary = Math.abs(speedMs) < 0.18; const brakeHeld = inputsRef.current.brake;
      if ((next === 'N' && stationary) || ((next === 'P' || next === 'R' || next === 'D') && stationary && brakeHeld)) { gear = next; sounds.tone(520, 0.07, 0.035); }
      else onNotice(next === 'N' ? '완전히 정지한 뒤 N단으로 변경하세요.' : '차량을 정지하고 풋브레이크를 밟은 채 기어를 변경하세요.', 'warning');
    };

    const updateGuides = (frontWheelDeg: number) => {
      const points: number[] = []; const bars: number[] = []; const steer = THREE.MathUtils.degToRad(frontWheelDeg); let gx = 0; let gz = vehicle.length / 2; let gh = 0;
      const direction = gear === 'R' ? -1 : 1; const halfW = vehicle.width / 2 + 0.08;
      const leftPts: THREE.Vector3[] = []; const rightPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const lx = gx - Math.cos(gh) * halfW; const lz = gz + Math.sin(gh) * halfW; const rx = gx + Math.cos(gh) * halfW; const rz = gz - Math.sin(gh) * halfW;
        leftPts.push(new THREE.Vector3(lx, 0.045, lz)); rightPts.push(new THREE.Vector3(rx, 0.045, rz));
        if (i % 4 === 0) bars.push(lx, 0.045, lz, rx, 0.045, rz);
        const step = 0.58 * direction; gx += -Math.sin(gh) * step; gz += -Math.cos(gh) * step; if (Math.abs(steer) > 0.001) gh -= (step / vehicle.wheelBase) * Math.tan(steer);
      }
      for (let i = 0; i < leftPts.length - 1; i++) points.push(leftPts[i].x, leftPts[i].y, leftPts[i].z, leftPts[i + 1].x, leftPts[i + 1].y, leftPts[i + 1].z, rightPts[i].x, rightPts[i].y, rightPts[i].z, rightPts[i + 1].x, rightPts[i + 1].y, rightPts[i + 1].z);
      trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); widthGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bars, 3));
      trajectoryLine.visible = settingsRef.current.trajectory; widthLine.visible = settingsRef.current.widthGuide; guideGroup.position.set(x, 0, z); guideGroup.rotation.y = heading;
    };

    const renderMirror = (mirrorRenderer: THREE.WebGLRenderer | null, mirrorCam: THREE.PerspectiveCamera, offsetX: number, offsetY: number, offsetZ: number, yaw: number) => {
      if (!mirrorRenderer) return; const local = new THREE.Vector3(offsetX, offsetY, offsetZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading); mirrorCam.position.set(x + local.x, local.y, z + local.z);
      const dir = new THREE.Vector3(Math.sin(heading + yaw), -0.04, Math.cos(heading + yaw)).normalize(); mirrorCam.lookAt(mirrorCam.position.clone().add(dir)); mirrorRenderer.render(scene, mirrorCam);
    };

    renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.045); lastTime = now; elapsed += dt; const input = inputsRef.current; const settings = settingsRef.current;
      if (input.signalLeftPulse) { signal = signal === 'left' ? 'none' : 'left'; input.signalLeftPulse = false; sounds.tone(750, 0.035, 0.035); }
      if (input.signalRightPulse) { signal = signal === 'right' ? 'none' : 'right'; input.signalRightPulse = false; sounds.tone(750, 0.035, 0.035); }
      if (input.hazardPulse) { signal = signal === 'hazard' ? 'none' : 'hazard'; input.hazardPulse = false; }
      if (input.parkingBrakePulse) { parkingBrake = !parkingBrake; input.parkingBrakePulse = false; sounds.tone(430, 0.08, 0.035); }
      if (input.pendingGear) { changeGear(input.pendingGear); input.pendingGear = null; }
      if (input.hornPulse) { sounds.horn(); input.hornPulse = false; }
      if (input.lookLeft) leftCheckedAt = elapsed; if (input.lookRight) rightCheckedAt = elapsed; if (input.lookRear) rearCheckedAt = elapsed;

      const maxWheel = 540; input.wheelDeg = clamp(input.wheelDeg, -maxWheel, maxWheel);
      if (!input.steeringHeld && Math.abs(speedMs) > 0.8) input.wheelDeg = approach(input.wheelDeg, 0, (55 + Math.abs(speedMs) * 7) * settings.steeringReturn * dt);
      const frontWheelDeg = clamp(input.wheelDeg / vehicle.steeringRatio, -vehicle.maxWheelDeg, vehicle.maxWheelDeg); const steerRad = THREE.MathUtils.degToRad(frontWheelDeg);
      throttle = approach(throttle, input.throttle ? 1 : 0, dt * (input.throttle ? 2.2 : 3.2)); brake = approach(brake, input.brake ? 1 : 0, dt * (input.brake ? 4.2 : 5));
      if (gear === 'P' || gear === 'N' || parkingBrake) speedMs = approach(speedMs, 0, dt * (parkingBrake ? 11 : 5));
      else {
        const direction = gear === 'D' ? 1 : -1; const maxMs = (gear === 'D' ? vehicle.maxSpeed : vehicle.reverseMax) / 3.6;
        if (throttle > 0.02) speedMs += direction * vehicle.acceleration * throttle * dt;
        else if (brake < 0.04) speedMs = approach(speedMs, direction * 1.15, dt * 0.75);
        if (brake > 0.02) speedMs = approach(speedMs, 0, vehicle.braking * brake * dt);
        if (gear === 'D') speedMs = clamp(speedMs, 0, maxMs); else speedMs = clamp(speedMs, -maxMs, 0);
        if (!input.throttle && !input.brake) speedMs *= Math.max(0, 1 - dt * 0.025);
      }
      if (Math.abs(speedMs) > 0.01) { const move = speedMs * dt; x += -Math.sin(heading) * move; z += -Math.cos(heading) * move; heading -= (move / vehicle.wheelBase) * Math.tan(steerRad); const roll = move / 0.31; car.wheels.forEach(w => { const tire = w.children[0]; tire.rotation.x += roll; }); }
      car.group.position.set(x, 0, z); car.group.rotation.y = heading; car.frontWheels.forEach(w => { w.rotation.y = -steerRad; }); car.steering.rotation.z = -THREE.MathUtils.degToRad(input.wheelDeg);
      car.brakeLights.forEach(light => { (light.material as THREE.MeshStandardMaterial).emissiveIntensity = brake > 0.05 ? 2.4 : 0.2; });
      sounds.updateEngine(speedMs * 3.6, throttle);

      blinkTimer += dt; if (signal !== 'none' && blinkTimer > 0.38) { blinkTimer = 0; blinkOn = !blinkOn; sounds.tone(blinkOn ? 760 : 620, 0.025, 0.025); } if (signal === 'none') blinkOn = false;
      overspeedCooldown = Math.max(0, overspeedCooldown - dt); collisionCooldown = Math.max(0, collisionCooldown - dt); signalCooldown = Math.max(0, signalCooldown - dt);

      const halfW = vehicle.width / 2; const halfD = vehicle.length / 2; let collidedWith = ''; let nearestFront = 999; let nearestRear = 999;
      const testPoint = (ox: number, oz: number, ow: number, od: number, label: string) => {
        const dx = ox - x; const dz = oz - z; const localX = Math.cos(heading) * dx - Math.sin(heading) * dz; const localZ = Math.sin(heading) * dx + Math.cos(heading) * dz;
        const overlap = Math.abs(localX) < halfW + ow && Math.abs(localZ) < halfD + od; if (overlap) collidedWith = label;
        if (Math.abs(localX) < halfW + ow + 0.8) { const gap = Math.max(0, Math.abs(localZ) - halfD - od); if (localZ < 0) nearestFront = Math.min(nearestFront, gap); else nearestRear = Math.min(nearestRear, gap); }
      };
      obstacles.forEach(o => testPoint(o.x, o.z, o.halfW, o.halfD, o.label));

      const laneWidth = mission.roadWidth / mission.lanes; const lane = clamp(Math.floor((x + mission.roadWidth / 2) / laneWidth) + 1, 1, mission.lanes);
      let warning: Snapshot['trafficWarning'] = 'none';
      for (const trafficCar of traffic) {
        const playerNearLane = Math.abs(trafficCar.laneX - x) < laneWidth * 1.25; const dz = trafficCar.z - z;
        if (playerNearLane && dz > -45 && dz < 20 && (signal === 'left' || signal === 'right')) {
          if (trafficCar.behavior === 'yielding') { trafficCar.speed = approach(trafficCar.speed, Math.max(20, Math.abs(speedMs * 3.6) - 12), dt * 14); warning = 'yielding'; }
          if (trafficCar.behavior === 'aggressive') { trafficCar.speed = approach(trafficCar.speed, mission.speedLimit + 22, dt * 18); warning = 'aggressive'; }
        }
        trafficCar.z -= (trafficCar.speed / 3.6) * dt; if (trafficCar.z < -mission.roadLength / 2 - 25) trafficCar.z = mission.roadLength / 2 + 20 + Math.random() * 35;
        trafficCar.mesh.position.set(trafficCar.x, 0, trafficCar.z); testPoint(trafficCar.x, trafficCar.z, 0.95, 2.3, '주행 차량');
      }

      collision = Boolean(collidedWith);
      if (collision && collisionCooldown <= 0) { collisionCooldown = 1.1; x = lastSafe.x; z = lastSafe.z; heading = lastSafe.heading; speedMs = 0; input.throttle = false; sounds.collision(); penalize(`${collidedWith} 충돌`, collidedWith === '주행 차량' ? 25 : 12); }
      else if (!collision && Math.abs(speedMs) < 12) lastSafe = { x, z, heading };

      const speedKmh = Math.round(Math.abs(speedMs) * 3.6); let zone = mission.group === 'road' ? '일반도로' : mission.group === 'license' ? '기능시험장' : '기본연습장'; let activeLimit = mission.speedLimit; let light: Snapshot['trafficLight'] = 'off';
      if (mission.id === 'city_traffic') {
        if (z < 62 && z > 18) { zone = '어린이보호구역'; activeLimit = 30; }
        const phase = elapsed % 24; light = phase < 12 ? 'green' : phase < 15 ? 'yellow' : 'red';
        if (z < 12 && z > 5 && speedKmh > 3 && light === 'red' && signalCooldown <= 0) { penalize('적색 신호 정지선 위반', 20); signalCooldown = 5; }
      }
      if (speedKmh > activeLimit + 3 && overspeedCooldown <= 0) { penalize(`${zone} 제한속도 초과`, zone === '어린이보호구역' ? 15 : 7); overspeedCooldown = 4; }
      if (lane !== lastLane && speedKmh > 12 && mission.lanes > 1) {
        const movedLeft = lane < lastLane; const correctSignal = movedLeft ? signal === 'left' : signal === 'right'; const checked = movedLeft ? elapsed - leftCheckedAt < 4 : elapsed - rightCheckedAt < 4;
        if (!correctSignal) penalize('방향지시등 없이 차선 변경', 8); if (!checked) penalize('미러·사각지대 미확인', 8); if (warning === 'aggressive') penalize('가속 중인 뒤차 앞으로 진입', 12); lastLane = lane;
      }

      const inGoal = Math.abs(x - mission.goal.x) < mission.goal.width / 2 && Math.abs(z - mission.goal.z) < mission.goal.depth / 2;
      const headingOk = mission.goal.heading === undefined || angleDiff(heading, mission.goal.heading) < (mission.goal.tolerance ?? 0.4);
      const parkingOk = !mission.goal.park || (gear === 'P' && parkingBrake && speedKmh === 0);
      if (inGoal && headingOk && parkingOk && !completed) { goalHold += dt; if (goalHold > 1.2) { completed = true; speedMs = 0; gear = 'P'; parkingBrake = true; input.throttle = false; sounds.success(); sounds.speak(`완료했습니다. 안전 점수 ${score}점입니다.`, settings.voice); onComplete(score); } } else goalHold = 0;

      updateGuides(frontWheelDeg);
      const activeCamera = cameraModeRef.current; camera.fov = settings.fov; camera.aspect = host.clientWidth / Math.max(1, host.clientHeight); camera.updateProjectionMatrix();
      const carPos = new THREE.Vector3(x, 0, z); const yaw = input.lookLeft ? 0.55 : input.lookRight ? -0.55 : 0; const rollLimit = settings.cameraMotion === 'off' ? 0 : settings.cameraMotion === 'comfort' ? 0.0218 : 0.03; const cameraRoll = clamp(-(speedMs * Math.tan(steerRad)) * 0.004, -rollLimit, rollLimit);
      if (activeCamera === 'cockpit') {
        const eye = new THREE.Vector3(vehicle.eye[0], vehicle.eye[1] + settings.seatHeight, vehicle.eye[2] + settings.seatDepth).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading); camera.position.copy(carPos).add(eye);
        const dir = new THREE.Vector3(-Math.sin(heading + yaw), -0.045, -Math.cos(heading + yaw)); camera.lookAt(camera.position.clone().add(dir)); camera.rotation.z = cameraRoll;
      } else if (activeCamera === 'hood') {
        const offset = new THREE.Vector3(0, vehicle.height * 0.72, vehicle.length * 0.34).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading); camera.position.copy(carPos).add(offset); camera.lookAt(camera.position.clone().add(new THREE.Vector3(-Math.sin(heading), -0.03, -Math.cos(heading)))); camera.rotation.z = cameraRoll * 0.45;
      } else if (activeCamera === 'chase') {
        const target = new THREE.Vector3(x + Math.sin(heading) * 7, 3.5, z + Math.cos(heading) * 7); camera.position.lerp(target, clamp(dt * 8, 0, 1)); camera.lookAt(x, 1, z); camera.rotation.z = 0;
      } else { camera.position.set(x, 25, z + 0.01); camera.lookAt(x, 0, z); camera.rotation.z = 0; }
      renderer.render(scene, camera);

      const mirrorAllowed = settings.mirrorMode !== 'off' && (activeCamera === 'cockpit' || activeCamera === 'hood');
      if (mirrorAllowed) {
        const leftNeeded = settings.mirrorMode === 'always' || signal === 'left' || signal === 'hazard' || input.lookLeft;
        const rightNeeded = settings.mirrorMode === 'always' || signal === 'right' || signal === 'hazard' || input.lookRight;
        if (leftNeeded) renderMirror(leftRenderer, leftCamera, -vehicle.width / 2 - 0.08, vehicle.eye[1] - 0.13, vehicle.length * 0.18, 0.22);
        if (rightNeeded) renderMirror(rightRenderer, rightCamera, vehicle.width / 2 + 0.08, vehicle.eye[1] - 0.13, vehicle.length * 0.18, -0.22);
        renderMirror(rearRenderer, rearCamera, 0, vehicle.eye[1] + 0.08, vehicle.eye[2], 0);
      }
      if (backupRenderer && gear === 'R') { const offset = new THREE.Vector3(0, 0.8, -vehicle.length / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading); backupCamera.position.copy(carPos).add(offset); backupCamera.lookAt(backupCamera.position.clone().add(new THREE.Vector3(Math.sin(heading), -0.18, Math.cos(heading)))); backupRenderer.render(scene, backupCamera); }

      if (now - lastSnapshot > 90) {
        lastSnapshot = now; onSnapshot({ speed: speedKmh, gear, parkingBrake, signal, wheelDeg: Math.round(input.wheelDeg), frontWheelDeg: Math.round(frontWheelDeg * 10) / 10, throttle, brake, score, elapsed, lane, zone, frontDistance: nearestFront < 5 ? nearestFront : -1, rearDistance: nearestRear < 5 ? nearestRear : -1, leftChecked: elapsed - leftCheckedAt < 1.1, rightChecked: elapsed - rightCheckedAt < 1.1, rearChecked: elapsed - rearCheckedAt < 1.1, trafficWarning: warning, trafficLight: light, collision });
      }
    });

    const resize = () => { const w = host.clientWidth || innerWidth; const h = host.clientHeight || innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    addEventListener('resize', resize);
    window.setTimeout(() => sounds.speak(`${mission.title} 연습을 시작합니다.`, settingsRef.current.voice), 500);
    return () => {
      renderer.setAnimationLoop(null); removeEventListener('resize', resize); renderer.dispose(); leftRenderer?.dispose(); rightRenderer?.dispose(); rearRenderer?.dispose(); backupRenderer?.dispose();
      scene.traverse(object => { const item = object as THREE.Mesh; if (item.geometry) item.geometry.dispose(); if (item.material) { const materials = Array.isArray(item.material) ? item.material : [item.material]; materials.forEach(material => material.dispose()); } });
    };
  }, [mission, vehicle, resetKey, inputsRef, settingsRef, cameraModeRef, leftMirror, rightMirror, rearMirror, backupMirror, onSnapshot, onNotice, onComplete]);

  return <div ref={hostRef} className="sim-view" />;
};

interface SteeringWheelProps { vehicle: Vehicle; snapshot: Snapshot; inputsRef: React.MutableRefObject<Inputs>; settings: SettingsState; }
const SteeringWheel: React.FC<SteeringWheelProps> = ({ vehicle, snapshot, inputsRef, settings }) => {
  const ref = useRef<HTMLButtonElement>(null); const lastAngle = useRef(0); const activePointer = useRef<number | null>(null);
  const pointerAngle = (event: React.PointerEvent<HTMLButtonElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)); };
  const down = (event: React.PointerEvent<HTMLButtonElement>) => { if (event.button !== 0) return; sounds.resume(); activePointer.current = event.pointerId; lastAngle.current = pointerAngle(event); inputsRef.current.steeringHeld = true; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => { if (activePointer.current !== event.pointerId) return; const next = pointerAngle(event); let delta = next - lastAngle.current; if (delta > Math.PI) delta -= Math.PI * 2; if (delta < -Math.PI) delta += Math.PI * 2; lastAngle.current = next; inputsRef.current.wheelDeg = clamp(inputsRef.current.wheelDeg + THREE.MathUtils.radToDeg(delta) * settings.steeringSensitivity, -540, 540); };
  const up = (event: React.PointerEvent<HTMLButtonElement>) => { if (activePointer.current !== event.pointerId) return; activePointer.current = null; inputsRef.current.steeringHeld = false; try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {} };
  const status = Math.abs(snapshot.wheelDeg) < 12 ? '핸들 정렬' : `${snapshot.wheelDeg < 0 ? '좌측' : '우측'} ${Math.abs(snapshot.wheelDeg)}°`;
  return <div className="steering-module">
    <div className="steering-readout"><i data-active={inputsRef.current.steeringHeld} /><strong>{status}</strong><span>앞바퀴 {Math.abs(snapshot.frontWheelDeg).toFixed(1)}° · {(snapshot.wheelDeg / 360).toFixed(2)}바퀴</span></div>
    <button ref={ref} className="steering-wheel" type="button" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={event => event.preventDefault()} aria-label="마우스 좌클릭 드래그 핸들" title="좌클릭한 채 원형으로 돌리세요">
      <div className="wheel-rotor" style={{ transform: `rotate(${snapshot.wheelDeg}deg)` }}><b /><span className="spoke horizontal" /><span className="spoke vertical" /><span className="wheel-hub">DRIVE<small>AIRBAG</small></span></div>
    </button>
    <div className="steering-help">좌클릭 유지 · 원형 드래그 · 최대 좌우 1.5바퀴</div>
  </div>;
};

export default function App() {
  const [mission, setMission] = useState<Mission>(() => MISSIONS.find(item => item.id === localStorage.getItem('driveprep:mission')) ?? MISSIONS[0]);
  const [vehicle, setVehicle] = useState<Vehicle>(() => VEHICLES.find(item => item.id === localStorage.getItem('driveprep:vehicle')) ?? VEHICLES[1]);
  const [settings, setSettings] = useState<SettingsState>(() => loadJson('driveprep:settings', DEFAULT_SETTINGS));
  const [bindings, setBindings] = useState<Record<ActionId, string>>(() => loadJson('driveprep:bindings', DEFAULT_BINDINGS));
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT); const [cameraMode, setCameraMode] = useState<CameraMode>('cockpit'); const [resetKey, setResetKey] = useState(0);
  const [hud, setHud] = useState(true); const [muted, setMuted] = useState(false); const [missionOpen, setMissionOpen] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false); const [helpOpen, setHelpOpen] = useState(false); const [completeScore, setCompleteScore] = useState<number | null>(null); const [notice, setNotice] = useState<{ text: string; tone: string } | null>(null); const [listening, setListening] = useState<ActionId | null>(null);
  const inputsRef = useRef<Inputs>({ throttle: false, brake: false, lookLeft: false, lookRight: false, lookRear: false, signalLeftPulse: false, signalRightPulse: false, hazardPulse: false, parkingBrakePulse: false, hornPulse: false, pendingGear: null, wheelDeg: 0, steeringHeld: false });
  const settingsRef = useRef(settings); const cameraModeRef = useRef(cameraMode); const noticeTimer = useRef<number | null>(null);
  const leftMirror = useRef<HTMLCanvasElement | null>(null); const rightMirror = useRef<HTMLCanvasElement | null>(null); const rearMirror = useRef<HTMLCanvasElement | null>(null); const backupMirror = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { settingsRef.current = settings; localStorage.setItem('driveprep:settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => { sounds.muted = muted; }, [muted]);
  const showNotice = useCallback((text: string, tone: 'info' | 'warning' | 'success' = 'info') => { setNotice({ text, tone }); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(null), tone === 'warning' ? 3600 : 2500); }, []);
  const reset = useCallback(() => { const input = inputsRef.current; Object.assign(input, { throttle: false, brake: false, lookLeft: false, lookRight: false, lookRear: false, wheelDeg: 0, steeringHeld: false, pendingGear: null }); setSnapshot(EMPTY_SNAPSHOT); setCompleteScore(null); setResetKey(value => value + 1); }, []);
  const cycleCamera = useCallback(() => setCameraMode(mode => mode === 'cockpit' ? 'hood' : mode === 'hood' ? 'chase' : mode === 'chase' ? 'top' : 'cockpit'), []);
  const actionByCode = useMemo(() => new Map(Object.entries(bindings).map(([action, code]) => [code, action as ActionId])), [bindings]);

  useEffect(() => {
    if (listening) {
      const remap = (event: KeyboardEvent) => { event.preventDefault(); const conflict = (Object.keys(bindings) as ActionId[]).find(action => bindings[action] === event.code); setBindings(current => { const next = { ...current }; if (conflict && conflict !== listening) next[conflict] = current[listening]; next[listening] = event.code; localStorage.setItem('driveprep:bindings', JSON.stringify(next)); return next; }); setListening(null); };
      addEventListener('keydown', remap, { once: true, capture: true }); return () => removeEventListener('keydown', remap, { capture: true });
    }
  }, [listening, bindings]);

  useEffect(() => {
    const modal = missionOpen || settingsOpen || helpOpen || completeScore !== null;
    const release = () => { inputsRef.current.throttle = false; inputsRef.current.brake = false; inputsRef.current.lookLeft = false; inputsRef.current.lookRight = false; inputsRef.current.lookRear = false; inputsRef.current.steeringHeld = false; };
    const down = (event: KeyboardEvent) => {
      if (modal || listening) return; const action = actionByCode.get(event.code); if (!action) return; if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault(); sounds.resume(); const input = inputsRef.current;
      if (action === 'throttle') input.throttle = true; else if (action === 'brake') input.brake = true; else if (action === 'lookLeft') input.lookLeft = true; else if (action === 'lookRight') input.lookRight = true; else if (action === 'lookRear') input.lookRear = true; else if (!event.repeat) {
        if (action === 'signalLeft') input.signalLeftPulse = true; else if (action === 'signalRight') input.signalRightPulse = true; else if (action === 'hazard') input.hazardPulse = true; else if (action === 'parkingBrake') input.parkingBrakePulse = true; else if (action === 'horn') input.hornPulse = true;
        else if (action === 'gearP') input.pendingGear = 'P'; else if (action === 'gearR') input.pendingGear = 'R'; else if (action === 'gearN') input.pendingGear = 'N'; else if (action === 'gearD') input.pendingGear = 'D'; else if (action === 'camera') cycleCamera(); else if (action === 'trajectory') setSettings(current => ({ ...current, trajectory: !current.trajectory })); else if (action === 'widthGuide') setSettings(current => ({ ...current, widthGuide: !current.widthGuide })); else if (action === 'reset') reset(); else if (action === 'hud') setHud(value => !value);
      }
    };
    const up = (event: KeyboardEvent) => { const action = actionByCode.get(event.code); if (action === 'throttle') inputsRef.current.throttle = false; if (action === 'brake') inputsRef.current.brake = false; if (action === 'lookLeft') inputsRef.current.lookLeft = false; if (action === 'lookRight') inputsRef.current.lookRight = false; if (action === 'lookRear') inputsRef.current.lookRear = false; };
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', release); if (modal) release(); return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', release); };
  }, [actionByCode, cycleCamera, reset, missionOpen, settingsOpen, helpOpen, completeScore, listening]);

  const chooseMission = (next: Mission) => { localStorage.setItem('driveprep:mission', next.id); setMission(next); setMissionOpen(false); reset(); };
  const chooseVehicle = (next: Vehicle) => { localStorage.setItem('driveprep:vehicle', next.id); setVehicle(next); reset(); };
  const gearRequest = (gear: Gear) => { sounds.resume(); inputsRef.current.pendingGear = gear; };
  const nextMission = () => chooseMission(MISSIONS[(MISSIONS.findIndex(item => item.id === mission.id) + 1) % MISSIONS.length]);
  const mirrorAllowed = settings.mirrorMode !== 'off' && (cameraMode === 'cockpit' || cameraMode === 'hood');
  const leftVisible = mirrorAllowed && (settings.mirrorMode === 'always' || snapshot.signal === 'left' || snapshot.signal === 'hazard' || snapshot.leftChecked);
  const rightVisible = mirrorAllowed && (settings.mirrorMode === 'always' || snapshot.signal === 'right' || snapshot.signal === 'hazard' || snapshot.rightChecked);
  const rearVisible = mirrorAllowed && (settings.mirrorMode === 'always' || settings.mirrorMode === 'auto' || snapshot.rearChecked);
  const distance = snapshot.gear === 'R' ? snapshot.rearDistance : snapshot.frontDistance;

  return <main className={`drive-app camera-${cameraMode} ${settings.compactHud ? 'compact' : 'expanded'} ${snapshot.collision ? 'collision' : ''}`} style={{ '--hud-scale': settings.hudScale, '--mirror-scale': settings.mirrorScale } as React.CSSProperties}>
    <SimView mission={mission} vehicle={vehicle} resetKey={resetKey} inputsRef={inputsRef} settingsRef={settingsRef} cameraModeRef={cameraModeRef} leftMirror={leftMirror} rightMirror={rightMirror} rearMirror={rearMirror} backupMirror={backupMirror} onSnapshot={setSnapshot} onNotice={showNotice} onComplete={setCompleteScore} />
    {(cameraMode === 'cockpit' || cameraMode === 'hood') && <div className="cockpit-overlay" />}
    <div className="mirror-layer">
      <div className="mirror rear" data-visible={rearVisible}><canvas ref={rearMirror} width="320" height="180" /><span>ROOM</span></div>
      <div className="mirror side left" data-visible={leftVisible} data-checked={snapshot.leftChecked}><canvas ref={leftMirror} width="320" height="180" /><span>LEFT</span></div>
      <div className="mirror side right" data-visible={rightVisible} data-checked={snapshot.rightChecked}><canvas ref={rightMirror} width="320" height="180" /><span>RIGHT</span></div>
      <div className="backup" data-visible={snapshot.gear === 'R'}><canvas ref={backupMirror} width="320" height="180" /><div className="backup-lines"><i /><i /><i /></div><span>R · 후방카메라</span></div>
    </div>

    {hud && <div className="hud-layer">
      <header className="topbar">
        <button className="mission-pill" type="button" onClick={() => setMissionOpen(true)}><b>{String(mission.order).padStart(2, '0')}</b><span><strong>{mission.title}</strong><small>{mission.subtitle}</small></span><ChevronRight size={17} /></button>
        <div className="toolbar"><div className="score"><small>안전점수</small><strong>{snapshot.score}</strong></div><button type="button" onClick={cycleCamera} title="시점 전환"><Camera size={17} /><span>{cameraMode === 'cockpit' ? '운전석' : cameraMode === 'hood' ? '보닛' : cameraMode === 'chase' ? '추적' : '탑뷰'}</span></button><button type="button" onClick={reset} title="시작 위치 복귀"><RotateCcw size={17} /></button><button type="button" onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><button type="button" onClick={() => setSettingsOpen(true)}><SettingsIcon size={17} /></button><button type="button" onClick={() => setHelpOpen(true)}><CircleHelp size={17} /></button></div>
      </header>
      <div className="status-strip"><span><MapIcon size={13} />{snapshot.zone}</span><span><Gauge size={13} />제한 {snapshot.zone === '어린이보호구역' ? 30 : mission.speedLimit}km/h</span><span>{formatTime(snapshot.elapsed)}</span>{mission.lanes > 1 && <span>{snapshot.lane}/{mission.lanes}차로</span>}{snapshot.trafficLight !== 'off' && <span data-light={snapshot.trafficLight}>{snapshot.trafficLight === 'green' ? '녹색' : snapshot.trafficLight === 'yellow' ? '황색' : '적색'} 신호</span>}</div>
      {notice && <div className="notice" data-tone={notice.tone}>{notice.text}</div>}
      {snapshot.trafficWarning !== 'none' && <div className="traffic-alert" data-tone={snapshot.trafficWarning}>{snapshot.trafficWarning === 'yielding' ? '뒤차가 감속하며 간격을 만들고 있습니다. 계속 확인하며 진입하세요.' : '뒤차가 가속 중입니다. 차선 변경을 멈추고 먼저 보내세요.'}</div>}
      {distance > -1 && distance < 3.2 && <div className="distance-alert" data-danger={distance < 0.8}>{snapshot.gear === 'R' ? '후방' : '전방'} {distance.toFixed(1)}m</div>}
      <section className="bottom-hud">
        <div className="left-controls">
          <div className="pedals"><div data-on={snapshot.throttle > 0.04} data-kind="gas"><kbd>{keyLabel(bindings.throttle)}</kbd><span>엑셀</span><i style={{ height: `${snapshot.throttle * 100}%` }} /></div><div data-on={snapshot.brake > 0.04} data-kind="brake"><kbd>{keyLabel(bindings.brake)}</kbd><span>풋브레이크</span><i style={{ height: `${snapshot.brake * 100}%` }} /></div></div>
          <div className="quick-keys"><span data-on={snapshot.signal === 'left'}><kbd>{keyLabel(bindings.signalLeft)}</kbd>좌깜빡이</span><span data-on={snapshot.signal === 'right'}><kbd>{keyLabel(bindings.signalRight)}</kbd>우깜빡이</span><span data-on={snapshot.leftChecked}><kbd>{keyLabel(bindings.lookLeft)}</kbd>좌미러</span><span data-on={snapshot.rightChecked}><kbd>{keyLabel(bindings.lookRight)}</kbd>우미러</span><span data-on={snapshot.parkingBrake}><kbd>{keyLabel(bindings.parkingBrake)}</kbd>주차B</span><span data-on={snapshot.signal === 'hazard'}><kbd>{keyLabel(bindings.hazard)}</kbd>비상등</span></div>
          <div className="guide-buttons"><button type="button" data-on={settings.trajectory} onClick={() => setSettings(value => ({ ...value, trajectory: !value.trajectory }))}>궤적선 {keyLabel(bindings.trajectory)}</button><button type="button" data-on={settings.widthGuide} onClick={() => setSettings(value => ({ ...value, widthGuide: !value.widthGuide }))}>차폭선 {keyLabel(bindings.widthGuide)}</button></div>
        </div>
        <SteeringWheel vehicle={vehicle} snapshot={snapshot} inputsRef={inputsRef} settings={settings} />
        <div className="cluster"><div className="blinkers"><span data-on={snapshot.signal === 'left' || snapshot.signal === 'hazard'}><ChevronLeft /></span><strong>{snapshot.speed}</strong><span data-on={snapshot.signal === 'right' || snapshot.signal === 'hazard'}><ChevronRight /></span></div><small>km/h</small><div className="gears">{(['P', 'R', 'N', 'D'] as Gear[]).map(gear => <button type="button" key={gear} data-on={snapshot.gear === gear} onClick={() => gearRequest(gear)}>{gear}<small>{keyLabel(bindings[`gear${gear}` as ActionId])}</small></button>)}</div><div className="cluster-meta"><span data-on={snapshot.parkingBrake}>PARK</span><span>{vehicle.name}</span><span>{(snapshot.wheelDeg / 360).toFixed(2)} turn</span></div></div>
      </section>
    </div>}
    {!hud && <button className="restore-hud" type="button" onClick={() => setHud(true)}>HUD 표시 · {keyLabel(bindings.hud)}</button>}

    {missionOpen && <div className="modal-bg" onMouseDown={event => event.target === event.currentTarget && setMissionOpen(false)}><section className="modal mission-modal"><header><div><span className="eyebrow"><Flag size={14} />연습 코스</span><h2>상황별 운전 연습</h2><p>기본 조작부터 기능시험과 도로주행까지 단계적으로 연습합니다.</p></div><button type="button" onClick={() => setMissionOpen(false)}><X /></button></header><div className="mission-grid">{MISSIONS.map(item => <button type="button" key={item.id} data-on={item.id === mission.id} onClick={() => chooseMission(item)}><b>{String(item.order).padStart(2, '0')}</b><span><strong>{item.title}<em data-level={item.difficulty}>{item.difficulty}</em></strong><small>{item.subtitle}</small><p>{item.description}</p></span><ChevronRight /></button>)}</div></section></div>}

    {settingsOpen && <div className="modal-bg" onMouseDown={event => event.target === event.currentTarget && setSettingsOpen(false)}><section className="modal settings-modal"><header><div><span className="eyebrow"><SlidersHorizontal size={14} />시뮬레이터 설정</span><h2>조작과 화면 맞춤</h2><p>왼손 위치에 맞게 키를 바꾸고 시야와 조향감을 조정할 수 있습니다.</p></div><button type="button" onClick={() => setSettingsOpen(false)}><X /></button></header><div className="settings-scroll"><h3>차종</h3><div className="vehicle-grid">{VEHICLES.map(item => <button type="button" key={item.id} data-on={item.id === vehicle.id} onClick={() => chooseVehicle(item)}><Car /><strong>{item.name}</strong><small>{item.category}</small><span>{item.width.toFixed(2)}m × {item.length.toFixed(2)}m</span></button>)}</div><h3>키 설정</h3><div className="binding-grid">{ACTIONS.map(action => <label key={action.id}><span>{action.label}<small>{action.group}</small></span><button type="button" data-listening={listening === action.id} onClick={() => setListening(action.id)}>{listening === action.id ? '새 키 입력…' : keyLabel(bindings[action.id])}</button></label>)}</div><button className="text-button" type="button" onClick={() => { setBindings(DEFAULT_BINDINGS); localStorage.setItem('driveprep:bindings', JSON.stringify(DEFAULT_BINDINGS)); }}>기본 키로 복원</button><h3>화면과 조향감</h3><div className="range-grid"><label>시야각 <b>{settings.fov}°</b><input type="range" min="55" max="82" value={settings.fov} onChange={event => setSettings(value => ({ ...value, fov: Number(event.target.value) }))} /></label><label>HUD 크기 <b>{settings.hudScale.toFixed(2)}</b><input type="range" min="0.82" max="1.2" step="0.02" value={settings.hudScale} onChange={event => setSettings(value => ({ ...value, hudScale: Number(event.target.value) }))} /></label><label>미러 크기 <b>{settings.mirrorScale.toFixed(2)}</b><input type="range" min="0.75" max="1.25" step="0.05" value={settings.mirrorScale} onChange={event => setSettings(value => ({ ...value, mirrorScale: Number(event.target.value) }))} /></label><label>핸들 감도 <b>{settings.steeringSensitivity.toFixed(2)}</b><input type="range" min="0.65" max="1.45" step="0.05" value={settings.steeringSensitivity} onChange={event => setSettings(value => ({ ...value, steeringSensitivity: Number(event.target.value) }))} /></label><label>핸들 복원력 <b>{settings.steeringReturn.toFixed(2)}</b><input type="range" min="0.45" max="1.5" step="0.05" value={settings.steeringReturn} onChange={event => setSettings(value => ({ ...value, steeringReturn: Number(event.target.value) }))} /></label><label>좌석 높이 <b>{settings.seatHeight.toFixed(2)}m</b><input type="range" min="-0.15" max="0.2" step="0.01" value={settings.seatHeight} onChange={event => setSettings(value => ({ ...value, seatHeight: Number(event.target.value) }))} /></label></div><div className="option-row"><label>카메라 움직임<select value={settings.cameraMotion} onChange={event => setSettings(value => ({ ...value, cameraMotion: event.target.value as SettingsState['cameraMotion'] }))}><option value="off">고정</option><option value="comfort">편안함</option><option value="realistic">현실감</option></select></label><label>미러 표시<select value={settings.mirrorMode} onChange={event => setSettings(value => ({ ...value, mirrorMode: event.target.value as SettingsState['mirrorMode'] }))}><option value="auto">자동</option><option value="always">항상</option><option value="off">숨김</option></select></label><label><input type="checkbox" checked={settings.compactHud} onChange={event => setSettings(value => ({ ...value, compactHud: event.target.checked }))} />컴팩트 HUD</label><label><input type="checkbox" checked={settings.voice} onChange={event => setSettings(value => ({ ...value, voice: event.target.checked }))} />한국어 음성 코칭</label></div></div><footer><button className="primary" type="button" onClick={() => setSettingsOpen(false)}>저장하고 닫기</button></footer></section></div>}

    {helpOpen && <div className="modal-bg" onMouseDown={event => event.target === event.currentTarget && setHelpOpen(false)}><section className="modal help-modal"><header><div><span className="eyebrow"><Keyboard size={14} />빠른 조작 안내</span><h2>왼손 키보드 + 오른손 마우스</h2></div><button type="button" onClick={() => setHelpOpen(false)}><X /></button></header><div className="help-body"><div className="mouse-visual"><i /><strong>핸들을 좌클릭한 채 원형으로 돌리기</strong><p>마우스 위치만으로는 핸들이 움직이지 않습니다. 버튼을 놓으면 실제 차량처럼 주행 속도에 따라 서서히 복원됩니다.</p></div><div className="help-keys">{ACTIONS.filter(action => ['페달', '신호', '미러', '기어'].includes(action.group)).map(action => <span key={action.id}><kbd>{keyLabel(bindings[action.id])}</kbd>{action.label}</span>)}</div></div><div className="help-note">기어는 차량이 거의 정지하고 풋브레이크를 밟은 상태에서 변경됩니다. W는 항상 엑셀, S는 항상 풋브레이크이며 전진·후진 방향은 D/R단이 결정합니다.</div><footer><button className="primary" type="button" onClick={() => setHelpOpen(false)}>연습 계속하기</button></footer></section></div>}

    {completeScore !== null && <div className="modal-bg complete-bg"><section className="complete-card"><CheckCircle2 /><span>COURSE COMPLETE</span><h2>{mission.title} 완료</h2><div><strong>{completeScore}</strong><small>/ 100</small></div><p>{completeScore >= 90 ? '안정적인 조작과 안전 확인 절차를 잘 지켰습니다.' : completeScore >= 70 ? '완주했습니다. 감점 구간을 한 번 더 반복해 보세요.' : '완주했습니다. 저속 조작과 안전 확인 절차부터 다시 연습해 보세요.'}</p><footer><button type="button" onClick={reset}><RotateCcw size={16} />다시 연습</button><button className="primary" type="button" onClick={nextMission}>다음 코스<ChevronRight size={16} /></button></footer></section></div>}
  </main>;
}
