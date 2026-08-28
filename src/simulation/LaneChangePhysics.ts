import { advanceVehiclePose, type VehiclePose } from './VehicleMotion';

export const LANE_CHANGE_PHYSICS_SCENARIO_VERSION = 'lane-change-stability-v1';

const FIXED_STEP_SECONDS = 1 / 60;
const MANEUVER_DURATION_SECONDS = 4.8;
const SETTLE_WINDOW_SECONDS = 3;
const LANE_WIDTH_METERS = 4;
const GRAVITY_MS2 = 9.81;
const WHEEL_BASE_METERS = 2.72;

type TestSpeedKmH = 30 | 50 | 80;
export type FatalPhysicsError = 'non-finite-state' | 'rollover' | 'spin' | 'teleport';

export interface LaneChangeStabilityRun {
  speedKmH: TestSpeedKmH;
  physicsStepCount: number;
  maneuverDurationSeconds: number;
  maxLateralAccelerationMs2: number;
  maxYawRateDegPerSecond: number;
  stabilized: boolean;
  stabilizationSeconds: number;
  finalLaneCenterErrorMeters: number;
  finalHeadingDegrees: number;
  fatalErrors: FatalPhysicsError[];
}

export interface LaneChangeStabilitySuite {
  scenarioVersion: typeof LANE_CHANGE_PHYSICS_SCENARIO_VERSION;
  fixedStepSeconds: number;
  runs: LaneChangeStabilityRun[];
  fatalErrorCount: number;
}

function smoothLaneVelocity(normalizedTime: number): number {
  if (normalizedTime <= 0 || normalizedTime >= 1) return 0;
  const squared = normalizedTime * normalizedTime;
  const cubed = squared * normalizedTime;
  const fourth = cubed * normalizedTime;
  return 30 * squared - 60 * cubed + 30 * fourth;
}

function runStabilityScenario(
  speedKmH: TestSpeedKmH,
  direction: -1 | 1,
): LaneChangeStabilityRun {
  const speedMs = speedKmH / 3.6;
  const totalPhysicsSteps = Math.round(
    (MANEUVER_DURATION_SECONDS + SETTLE_WINDOW_SECONDS) / FIXED_STEP_SECONDS,
  );
  const fatalErrors = new Set<FatalPhysicsError>();
  const state: VehiclePose & { speedMs: number; steerAngle: number } = {
    x: 0,
    z: 0,
    speedMs,
    steerAngle: 0,
    heading: 0,
  };
  let maxLateralAccelerationMs2 = 0;
  let maxYawRateDegPerSecond = 0;
  let stabilized = false;
  let stabilizationSeconds = Number.POSITIVE_INFINITY;
  let finalLaneCenterErrorMeters = LANE_WIDTH_METERS;

  for (let frame = 0; frame < totalPhysicsSteps; frame += 1) {
    const nextTimeSeconds = (frame + 1) * FIXED_STEP_SECONDS;
    const normalizedTime = nextTimeSeconds / MANEUVER_DURATION_SECONDS;
    const lateralVelocityMs =
      direction *
      LANE_WIDTH_METERS *
      smoothLaneVelocity(normalizedTime) /
      MANEUVER_DURATION_SECONDS;
    const targetHeading = -Math.asin(
      Math.max(-1, Math.min(1, lateralVelocityMs / speedMs)),
    );
    const targetYawDelta = targetHeading - state.heading;
    state.steerAngle = Math.atan(
      (-targetYawDelta * WHEEL_BASE_METERS) / (speedMs * FIXED_STEP_SECONDS),
    );

    const previousX = state.x;
    const previousZ = state.z;
    const previousHeading = state.heading;
    const nextPose = advanceVehiclePose(
      state,
      state.speedMs,
      state.steerAngle,
      FIXED_STEP_SECONDS,
      WHEEL_BASE_METERS,
    );
    state.x = nextPose.x;
    state.z = nextPose.z;
    state.heading = nextPose.heading;
    const yawRateRadiansPerSecond =
      (state.heading - previousHeading) / FIXED_STEP_SECONDS;
    const lateralAccelerationMs2 = speedMs * yawRateRadiansPerSecond;
    const yawRateDegPerSecond = Math.abs(yawRateRadiansPerSecond * 180 / Math.PI);
    const rollDegrees = Math.atan(lateralAccelerationMs2 / GRAVITY_MS2) * 180 / Math.PI;
    const laneCenterErrorMeters = Math.abs(direction * LANE_WIDTH_METERS - state.x);

    maxLateralAccelerationMs2 = Math.max(
      maxLateralAccelerationMs2,
      Math.abs(lateralAccelerationMs2),
    );
    maxYawRateDegPerSecond = Math.max(maxYawRateDegPerSecond, yawRateDegPerSecond);
    finalLaneCenterErrorMeters = laneCenterErrorMeters;

    if (
      [
        nextTimeSeconds,
        state.x,
        state.z,
        state.steerAngle,
        lateralAccelerationMs2,
        state.heading,
        yawRateRadiansPerSecond,
        rollDegrees,
      ].some((value) => !Number.isFinite(value))
    ) {
      fatalErrors.add('non-finite-state');
    }
    if (Math.abs(rollDegrees) >= 90) fatalErrors.add('rollover');
    if (Math.abs(state.heading) >= Math.PI / 2) fatalErrors.add('spin');
    if (Math.hypot(state.x - previousX, state.z - previousZ) > 2) {
      fatalErrors.add('teleport');
    }

    if (
      !stabilized &&
      nextTimeSeconds >= MANEUVER_DURATION_SECONDS &&
      laneCenterErrorMeters <= 0.35 &&
      Math.abs(state.heading) <= Math.PI / 180
    ) {
      stabilized = true;
      stabilizationSeconds = nextTimeSeconds - MANEUVER_DURATION_SECONDS;
    }
  }

  return {
    speedKmH,
    physicsStepCount: totalPhysicsSteps,
    maneuverDurationSeconds: MANEUVER_DURATION_SECONDS,
    maxLateralAccelerationMs2,
    maxYawRateDegPerSecond,
    stabilized,
    stabilizationSeconds,
    finalLaneCenterErrorMeters,
    finalHeadingDegrees: state.heading * 180 / Math.PI,
    fatalErrors: [...fatalErrors],
  };
}

export function runLaneChangeStabilitySuite(): LaneChangeStabilitySuite {
  const speeds: TestSpeedKmH[] = [
    ...Array.from({ length: 34 }, () => 30 as const),
    ...Array.from({ length: 33 }, () => 50 as const),
    ...Array.from({ length: 33 }, () => 80 as const),
  ];
  const runs = speeds.map((speedKmH, index) =>
    runStabilityScenario(speedKmH, index % 2 === 0 ? -1 : 1),
  );

  return {
    scenarioVersion: LANE_CHANGE_PHYSICS_SCENARIO_VERSION,
    fixedStepSeconds: FIXED_STEP_SECONDS,
    runs,
    fatalErrorCount: runs.reduce((count, run) => count + run.fatalErrors.length, 0),
  };
}
