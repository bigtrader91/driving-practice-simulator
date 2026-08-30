import { describe, expect, it } from 'vitest';
import { MISSIONS } from './constants/missions';
import { createMissionStartCarState, prepareTrainingAttemptStart } from './App';
import {
  completeTrainingAttempt,
  createTrainingSession,
  startTrainingSession,
} from './simulation/TrainingSession';

describe('mission start car state', () => {
  it('다음 미션 출발 위치에서 핸들과 속도를 즉시 중앙 초기화한다', () => {
    const mission = MISSIONS.find((candidate) => candidate.id === 'curve_s');
    if (!mission) throw new Error('curve_s mission fixture is missing');

    const state = createMissionStartCarState(mission);

    expect([state.x, state.y, state.z, state.heading]).toEqual([0, 0, 60, 0]);
    expect({
      speed: state.speed,
      speedMs: state.speedMs,
      steerAngle: state.steerAngle,
      steeringWheelAngle: state.steeringWheelAngle,
      steeringWheelTurns: state.steeringWheelTurns,
      steeringWheelDegrees: state.steeringWheelDegrees,
    }).toEqual({
      speed: 0,
      speedMs: 0,
      steerAngle: 0,
      steeringWheelAngle: 0,
      steeringWheelTurns: 0,
      steeringWheelDegrees: 0,
    });
  });

  it('첫 시도 완료 직후 두 번째 훈련 미션과 중앙 핸들 상태를 함께 준비한다', () => {
    const session = startTrainingSession(createTrainingSession());
    const nextSession = completeTrainingAttempt(session, { score: 100, passed: true });

    const next = prepareTrainingAttemptStart(nextSession);

    expect(nextSession.currentAttempt).toMatchObject({
      id: 'baseline-left',
      direction: 'left',
    });
    expect([next.mission.startPos[0], next.mission.targetArea?.x]).toEqual([6, 2]);
    expect([
      next.carState.x,
      next.carState.z,
      next.carState.steeringWheelDegrees,
      next.carState.steerAngle,
    ]).toEqual([6, 80, 0, 0]);
  });
});
