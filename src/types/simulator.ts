export type VehicleType = 'compact' | 'sedan' | 'suv';

export interface VehicleConfig {
  id: VehicleType;
  name: string;
  nameEn: string;
  category: string;
  description: string;
  width: number; // meters
  length: number; // meters
  height: number;
  wheelBase: number;
  maxWheelAngle: number; // max tire angle in radians (~35 deg = ~0.61 rad)
  maxSteeringWheelTurns: number; // e.g. 1.5 turns = 540 degrees lock-to-lock
  steeringRatio: number; // e.g. 15.0 (15 deg steering wheel = 1 deg tire)
  maxSpeed: number; // km/h
  acceleration: number; // m/s^2
  brakingPower: number;
  reverseMaxSpeed: number;
  color: string;
  cockpitPos: [number, number, number]; // driver eye position
  leftMirrorPos: [number, number, number];
  rightMirrorPos: [number, number, number];
  rearMirrorPos: [number, number, number];
  turningRadius: number; // meters
}

export type CameraViewMode = 'cockpit' | 'chase' | 'top' | 'hood';
export type GearMode = 'P' | 'R' | 'N' | 'D';
export type TurnSignal = 'none' | 'left' | 'right' | 'hazard';

export interface CarState {
  x: number;
  y: number;
  z: number;
  speed: number; // km/h
  speedMs: number; // m/s
  steerAngle: number; // tire angle in radians (-maxWheelAngle to +maxWheelAngle)
  steeringWheelAngle: number; // steering wheel rotation in radians (-1.5 * 2PI to +1.5 * 2PI)
  steeringWheelTurns: number; // e.g. -1.5 ~ +1.5 turns
  steeringWheelDegrees: number; // e.g. -540 ~ +540 degrees
  heading: number; // yaw angle in radians
  gear: GearMode;
  isBraking: boolean;
  isAccelerating: boolean;
  isHandbrake: boolean;
  turnSignal: TurnSignal;
  headlights: boolean;
  leftMirrorLooked: boolean;
  rightMirrorLooked: boolean;
  rearMirrorLooked: boolean;
  lastMirrorCheckTime: number;
  inCollision: boolean;
  collisionTarget?: string;
  rpm: number;
  odometer: number;
}

export interface ControlInputs {
  forward: boolean;
  backward: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
  lookLeft: boolean;
  lookRight: boolean;
  lookRear: boolean;
  signalLeft: boolean;
  signalRight: boolean;
  hazard: boolean;
  gearP: boolean;
  gearR: boolean;
  gearN: boolean;
  gearD: boolean;
  horn: boolean;
  toggleView: boolean;
  toggleTrajectory: boolean;
  toggleWidthGuide: boolean;
  resetPosition: boolean;
  mouseYaw: number;
  mousePitch: number;
  mouseSteerRatio: number; // -1.0 (full left 540 deg) to +1.0 (full right 540 deg)
  isMouseSteeringActive: boolean;
}

export type MissionCategory = 'basic' | 'width' | 'curve' | 'parking' | 'traffic' | 'highway';

export interface MissionObjective {
  id: string;
  text: string;
  isCompleted: boolean;
  isMandatory: boolean;
  scorePenalty: number;
}

export interface Mission {
  id: string;
  title: string;
  subtitle: string;
  category: MissionCategory;
  difficulty: '쉬움' | '보통' | '어려움';
  description: string;
  tip: string;
  startPos: [number, number, number];
  startHeading: number;
  targetArea?: {
    x: number;
    z: number;
    width: number;
    depth: number;
    targetHeading?: number;
    toleranceHeading?: number;
  };
  timeLimit?: number;
  maxScore: number;
  objectives: MissionObjective[];
  laneCount?: number;
}

export interface ScoreDeduction {
  id: string;
  timestamp: number;
  reason: string;
  points: number;
}

export interface ProximitySensorData {
  frontLeft: number;
  frontCenter: number;
  frontRight: number;
  rearLeft: number;
  rearCenter: number;
  rearRight: number;
  minDistance: number;
}

export type TrafficDriverBehavior = 'yielding' | 'aggressive' | 'normal';

export interface TrafficVehicleData {
  id: string;
  x: number;
  z: number;
  speedKmH: number;
  targetLane: number;
  laneX: number;
  color: number;
  type: 'sedan' | 'suv' | 'truck';
  behavior: TrafficDriverBehavior;
  isYielding: boolean;
  isHonking: boolean;
  isFlashingHighBeam: boolean;
  meshGroup?: any;
}
