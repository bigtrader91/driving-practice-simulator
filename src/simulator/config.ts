export type GearMode = 'P' | 'R' | 'N' | 'D';
export type CameraMode = 'cockpit' | 'hood' | 'chase' | 'top';
export type TurnSignal = 'none' | 'left' | 'right' | 'hazard';
export type Difficulty = '입문' | '보통' | '어려움';
export type MissionGroup = 'basic' | 'license' | 'road';

export type ActionId =
  | 'throttle' | 'brake' | 'signalLeft' | 'signalRight'
  | 'lookLeft' | 'lookRight' | 'lookRear' | 'hazard'
  | 'parkingBrake' | 'horn' | 'gearP' | 'gearR' | 'gearN' | 'gearD'
  | 'camera' | 'trajectory' | 'widthGuide' | 'reset' | 'hud';

export type KeyBindings = Record<ActionId, string>;

export interface ActionDefinition {
  id: ActionId;
  label: string;
  shortLabel: string;
  kind: 'hold' | 'toggle' | 'gear';
  group: 'pedal' | 'signal' | 'mirror' | 'gear' | 'utility';
}

export interface VehicleOption {
  id: 'compact' | 'sedan' | 'suv';
  name: string;
  category: string;
  width: number;
  length: number;
  height: number;
  wheelBase: number;
  steeringRatio: number;
  maxSteeringWheelTurns: number;
  maxWheelAngleDeg: number;
  maxSpeedKmh: number;
  acceleration: number;
  braking: number;
  reverseMaxKmh: number;
  color: string;
  eyeX: number;
  eyeY: number;
  eyeZ: number;
}

export interface GoalZone {
  x: number;
  z: number;
  width: number;
  depth: number;
  heading?: number;
  headingTolerance?: number;
  requiresPark?: boolean;
}

export interface MissionMode {
  id: string;
  order: number;
  group: MissionGroup;
  title: string;
  subtitle: string;
  difficulty: Difficulty;
  description: string;
  tip: string;
  start: { x: number; z: number; heading: number; gear: GearMode };
  goal: GoalZone;
  speedLimitKmh: number;
  roadWidth: number;
  roadLength: number;
  laneCount: number;
}

export interface SimulatorSettings {
  fov: number;
  seatHeight: number;
  seatForeAft: number;
  cameraMotion: 'off' | 'comfort' | 'realistic';
  mirrorMode: 'auto' | 'always' | 'off';
  mirrorScale: number;
  hudScale: number;
  compactHud: boolean;
  steeringSensitivity: number;
  steeringReturn: number;
  showTrajectory: boolean;
  showWidthGuide: boolean;
  voiceGuide: boolean;
}

export const ACTIONS: ActionDefinition[] = [
  { id: 'throttle', label: '엑셀', shortLabel: '엑셀', kind: 'hold', group: 'pedal' },
  { id: 'brake', label: '풋브레이크', shortLabel: '브레이크', kind: 'hold', group: 'pedal' },
  { id: 'signalLeft', label: '좌측 방향지시등', shortLabel: '좌깜빡이', kind: 'toggle', group: 'signal' },
  { id: 'signalRight', label: '우측 방향지시등', shortLabel: '우깜빡이', kind: 'toggle', group: 'signal' },
  { id: 'lookLeft', label: '좌측 미러·숄더체크', shortLabel: '좌미러', kind: 'hold', group: 'mirror' },
  { id: 'lookRight', label: '우측 미러·숄더체크', shortLabel: '우미러', kind: 'hold', group: 'mirror' },
  { id: 'lookRear', label: '룸미러 확인', shortLabel: '룸미러', kind: 'hold', group: 'mirror' },
  { id: 'hazard', label: '비상등', shortLabel: '비상등', kind: 'toggle', group: 'signal' },
  { id: 'parkingBrake', label: '주차브레이크', shortLabel: '주차B', kind: 'toggle', group: 'pedal' },
  { id: 'horn', label: '경적', shortLabel: '경적', kind: 'toggle', group: 'utility' },
  { id: 'gearP', label: 'P단', shortLabel: 'P', kind: 'gear', group: 'gear' },
  { id: 'gearR', label: 'R단', shortLabel: 'R', kind: 'gear', group: 'gear' },
  { id: 'gearN', label: 'N단', shortLabel: 'N', kind: 'gear', group: 'gear' },
  { id: 'gearD', label: 'D단', shortLabel: 'D', kind: 'gear', group: 'gear' },
  { id: 'camera', label: '카메라 시점 전환', shortLabel: '시점', kind: 'toggle', group: 'utility' },
  { id: 'trajectory', label: '주행 궤적선', shortLabel: '궤적선', kind: 'toggle', group: 'utility' },
  { id: 'widthGuide', label: '차폭 가이드', shortLabel: '차폭선', kind: 'toggle', group: 'utility' },
  { id: 'reset', label: '시작 위치 복귀', shortLabel: '리셋', kind: 'toggle', group: 'utility' },
  { id: 'hud', label: 'HUD 표시 전환', shortLabel: 'HUD', kind: 'toggle', group: 'utility' },
];

export const DEFAULT_BINDINGS: KeyBindings = {
  throttle: 'KeyW', brake: 'KeyS', signalLeft: 'KeyA', signalRight: 'KeyD',
  lookLeft: 'KeyQ', lookRight: 'KeyE', lookRear: 'KeyR', hazard: 'KeyZ',
  parkingBrake: 'Space', horn: 'KeyX', gearP: 'Digit1', gearR: 'Digit2',
  gearN: 'Digit3', gearD: 'Digit4', camera: 'KeyC', trajectory: 'KeyT',
  widthGuide: 'KeyV', reset: 'KeyF', hud: 'KeyH',
};

export const DEFAULT_SETTINGS: SimulatorSettings = {
  fov: 67, seatHeight: 0, seatForeAft: 0, cameraMotion: 'comfort',
  mirrorMode: 'auto', mirrorScale: 1, hudScale: 1, compactHud: true,
  steeringSensitivity: 1, steeringReturn: 1, showTrajectory: true,
  showWidthGuide: true, voiceGuide: true,
};

export const VEHICLES: VehicleOption[] = [
  { id: 'compact', name: '경차', category: '캐스퍼·모닝급', width: 1.60, length: 3.60, height: 1.55, wheelBase: 2.40, steeringRatio: 14.8, maxSteeringWheelTurns: 1.5, maxWheelAngleDeg: 36.5, maxSpeedKmh: 105, acceleration: 4.5, braking: 9.2, reverseMaxKmh: 24, color: '#20b8c8', eyeX: -0.34, eyeY: 1.30, eyeZ: 0.38 },
  { id: 'sedan', name: '준중형 세단', category: '아반떼·K5급', width: 1.82, length: 4.68, height: 1.44, wheelBase: 2.72, steeringRatio: 15.2, maxSteeringWheelTurns: 1.5, maxWheelAngleDeg: 33.2, maxSpeedKmh: 135, acceleration: 5.1, braking: 9.7, reverseMaxKmh: 28, color: '#2670e8', eyeX: -0.39, eyeY: 1.25, eyeZ: 0.48 },
  { id: 'suv', name: '중형 SUV', category: '싼타페·쏘렌토급', width: 1.91, length: 4.83, height: 1.70, wheelBase: 2.81, steeringRatio: 15.6, maxSteeringWheelTurns: 1.5, maxWheelAngleDeg: 31, maxSpeedKmh: 130, acceleration: 4.8, braking: 9.8, reverseMaxKmh: 26, color: '#5c55df', eyeX: -0.43, eyeY: 1.49, eyeZ: 0.58 },
];

export const MISSIONS: MissionMode[] = [
  { id: 'basic_controls', order: 1, group: 'basic', title: '기본 조작과 출발·정지', subtitle: '브레이크를 밟고 D단 체결 후 부드럽게 출발합니다.', difficulty: '입문', description: 'P/R/N/D 인터록, 엑셀과 풋브레이크, 주차브레이크와 핸들 복원을 익히는 입문 코스입니다.', tip: 'S를 누른 채 4로 D단을 체결하고 Space로 주차브레이크를 해제한 뒤 W를 조금씩 눌러 출발하세요.', start: { x: 0, z: 58, heading: 0, gear: 'P' }, goal: { x: 0, z: -66, width: 7, depth: 8 }, speedLimitKmh: 30, roadWidth: 10, roadLength: 170, laneCount: 1 },
  { id: 'width_slalom', order: 2, group: 'license', title: '차폭감과 좁은 길', subtitle: '라바콘 사이를 저속으로 통과하며 좌우 차폭을 익힙니다.', difficulty: '입문', description: '보닛 기준점, 차폭 가이드와 타이어 궤적을 비교하며 좁은 통로를 통과합니다.', tip: '핸들을 크게 흔들지 말고 멀리 바라보면서 작은 각도로 계속 수정하세요.', start: { x: 0, z: 62, heading: 0, gear: 'P' }, goal: { x: 0, z: -62, width: 6, depth: 7 }, speedLimitKmh: 20, roadWidth: 8, roadLength: 155, laneCount: 1 },
  { id: 'curve_s', order: 3, group: 'license', title: 'S자 곡선 코스', subtitle: '내륜차와 핸들 되감기 타이밍을 연습합니다.', difficulty: '보통', description: '연속 곡선에서 앞바퀴와 뒷바퀴가 지나가는 궤적 차이를 익힙니다.', tip: '코너 안쪽보다 바깥쪽에 여유를 두고, 차가 펴지는 만큼 핸들을 천천히 되감으세요.', start: { x: 0, z: 66, heading: 0, gear: 'P' }, goal: { x: 0, z: -66, width: 8, depth: 8 }, speedLimitKmh: 20, roadWidth: 8, roadLength: 160, laneCount: 1 },
  { id: 'curve_t', order: 4, group: 'license', title: '직각(T자) 코스', subtitle: '어깨선 기준과 끝까지 감기·되감기를 익힙니다.', difficulty: '보통', description: '좁은 직각 통로에 진입해 정지선 확인 후 반대편 출구로 빠져나갑니다.', tip: '앞모서리가 코너를 충분히 지난 뒤 핸들을 감고, 차체가 출구와 평행해질 때 되감으세요.', start: { x: -20, z: 31, heading: 0, gear: 'P' }, goal: { x: 20, z: 31, width: 6, depth: 7, heading: Math.PI, headingTolerance: 0.55 }, speedLimitKmh: 15, roadWidth: 5, roadLength: 70, laneCount: 1 },
  { id: 'functional_exam', order: 5, group: 'license', title: '장내 기능시험 종합', subtitle: '출발·정지선·굴절·주차 절차를 한 번에 연습합니다.', difficulty: '어려움', description: '기능시험에서 반복되는 저속 조작, 정지선, 방향지시등과 최종 정차 절차를 종합합니다.', tip: '속도보다 절차가 우선입니다. 각 구간 진입 전에 브레이크로 속도를 충분히 줄이세요.', start: { x: -5, z: 72, heading: 0, gear: 'P' }, goal: { x: 5, z: -70, width: 7, depth: 9, requiresPark: true }, speedLimitKmh: 20, roadWidth: 18, roadLength: 170, laneCount: 2 },
  { id: 'parking_reverse', order: 6, group: 'license', title: '후진 주차', subtitle: '사이드미러와 후방카메라로 주차선 안에 맞춥니다.', difficulty: '보통', description: '빈 주차칸 앞에서 각도를 만든 뒤 R단으로 후진해 차체를 반듯하게 세웁니다.', tip: '주차칸 모서리가 뒷바퀴 근처에 왔을 때 핸들을 감고, 차체가 평행해지기 전에 되감으세요.', start: { x: -7, z: 10, heading: -Math.PI / 2, gear: 'P' }, goal: { x: 0, z: -13, width: 2.8, depth: 5.8, heading: Math.PI, headingTolerance: 0.28, requiresPark: true }, speedLimitKmh: 10, roadWidth: 48, roadLength: 48, laneCount: 1 },
  { id: 'parking_parallel', order: 7, group: 'license', title: '평행 주차', subtitle: '앞뒤 차량 사이에 45도 공식으로 진입합니다.', difficulty: '어려움', description: '앞차와 나란히 선 뒤 후진 각도를 만들고 연석 가까이 차체를 정렬합니다.', tip: '처음부터 연석에 붙으려 하지 말고 45도 각도, 핸들 정렬, 반대쪽 끝까지 감기의 순서를 지키세요.', start: { x: 0, z: 17, heading: 0, gear: 'P' }, goal: { x: 4, z: -3, width: 2.7, depth: 7, heading: 0, headingTolerance: 0.22, requiresPark: true }, speedLimitKmh: 10, roadWidth: 16, roadLength: 70, laneCount: 2 },
  { id: 'city_lane_change', order: 8, group: 'road', title: '시내 차선 변경', subtitle: '깜빡이·미러 확인·부드러운 진입 순서를 연습합니다.', difficulty: '보통', description: '3차로에서 시작해 2차로와 1차로로 이동하며 뒤차의 접근 속도를 확인합니다.', tip: '깜빡이를 먼저 켠 뒤 미러를 확인하고, 옆 차로와 속도를 맞춘 다음 한 번에 부드럽게 이동하세요.', start: { x: 3.6, z: 128, heading: 0, gear: 'P' }, goal: { x: -3.6, z: -130, width: 3.4, depth: 10 }, speedLimitKmh: 60, roadWidth: 12.8, roadLength: 300, laneCount: 3 },
  { id: 'city_traffic', order: 9, group: 'road', title: '종합 도로주행', subtitle: '신호·정지선·횡단보도·어린이보호구역을 통과합니다.', difficulty: '어려움', description: '실제 도로주행에서 자주 만나는 교차로와 제한속도 변화에 대응합니다.', tip: '정지선 앞에서는 신호가 바뀔 가능성을 고려해 미리 가속 페달에서 발을 떼세요.', start: { x: 6, z: 150, heading: 0, gear: 'P' }, goal: { x: 6, z: -150, width: 4, depth: 10 }, speedLimitKmh: 50, roadWidth: 20, roadLength: 340, laneCount: 4 },
  { id: 'highway_5lane', order: 10, group: 'road', title: '다차로 고속화도로', subtitle: '양보 차량과 가속 차량을 구분하며 여러 차로를 이동합니다.', difficulty: '어려움', description: '6차로 도로에서 미러 속 차량 크기 변화를 보고 안전한 간격에만 진입합니다.', tip: '방향지시등을 켠 뒤 최소 2초 동안 미러를 보고, 빠르게 커지는 차량이 있으면 진입을 미루세요.', start: { x: 9, z: 255, heading: 0, gear: 'P' }, goal: { x: -9, z: -255, width: 3.5, depth: 12 }, speedLimitKmh: 80, roadWidth: 22.8, roadLength: 570, laneCount: 6 },
];

const STORAGE_KEYS = {
  bindings: 'driveprep:key-bindings:v2', settings: 'driveprep:settings:v2',
  vehicle: 'driveprep:vehicle:v2', mission: 'driveprep:mission:v2',
};

export function loadBindings(): KeyBindings { try { const raw = localStorage.getItem(STORAGE_KEYS.bindings); return raw ? { ...DEFAULT_BINDINGS, ...JSON.parse(raw) } : { ...DEFAULT_BINDINGS }; } catch { return { ...DEFAULT_BINDINGS }; } }
export function saveBindings(value: KeyBindings) { try { localStorage.setItem(STORAGE_KEYS.bindings, JSON.stringify(value)); } catch {} }
export function loadSettings(): SimulatorSettings { try { const raw = localStorage.getItem(STORAGE_KEYS.settings); return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }; } catch { return { ...DEFAULT_SETTINGS }; } }
export function saveSettings(value: SimulatorSettings) { try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(value)); } catch {} }
export function loadVehicleId() { try { return localStorage.getItem(STORAGE_KEYS.vehicle) ?? 'sedan'; } catch { return 'sedan'; } }
export function saveVehicleId(id: string) { try { localStorage.setItem(STORAGE_KEYS.vehicle, id); } catch {} }
export function loadMissionId() { try { return localStorage.getItem(STORAGE_KEYS.mission) ?? 'basic_controls'; } catch { return 'basic_controls'; } }
export function saveMissionId(id: string) { try { localStorage.setItem(STORAGE_KEYS.mission, id); } catch {} }
export function keyLabel(code: string): string { if (code.startsWith('Key')) return code.slice(3); if (code.startsWith('Digit')) return code.slice(5); if (code === 'Space') return 'Space'; return code.replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('BracketLeft', '[').replace('BracketRight', ']'); }
