import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../constants/missions';
import { missionForTrainingAttempt } from './TrainingMission';

const laneChangeMission = MISSIONS.find((mission) => mission.id === 'city_lane_change');

describe('missionForTrainingAttempt', () => {
  it('좌우 시도에 맞게 시작 차로와 목표 차로를 서로 반대로 배치한다', () => {
    if (!laneChangeMission) throw new Error('city_lane_change 미션이 필요합니다.');

    const left = missionForTrainingAttempt(laneChangeMission, 'left');
    const right = missionForTrainingAttempt(laneChangeMission, 'right');

    expect([left.startPos[0], left.targetArea?.x]).toEqual([6, 2]);
    expect([right.startPos[0], right.targetArea?.x]).toEqual([2, 6]);
    expect(left.startPos[0] > 0 && (left.targetArea?.x ?? 0) > 0).toBe(true);
    expect(right.startPos[0] > 0 && (right.targetArea?.x ?? 0) > 0).toBe(true);
    expect([left.id, right.id]).toEqual(['city_lane_change', 'city_lane_change']);
    expect([laneChangeMission.startPos[0], laneChangeMission.targetArea?.x]).toEqual([7, -7]);
  });
});
