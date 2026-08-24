import { describe, expect, it } from 'vitest';
import { MissionRunState } from './MissionRunState';
import { ScoreDeduction } from '../types/simulator';

const redLightDeduction: ScoreDeduction = {
  id: 'red-light',
  timestamp: 100,
  reason: '[감점] 적색 신호 정지선 준수',
  points: 30,
};

describe('MissionRunState', () => {
  it('감점 적용 후 실패 결과에 실제 점수와 감점 스냅샷을 담는다', () => {
    const run = new MissionRunState();
    expect(run.applyPenalty(redLightDeduction)).toBe(true);

    expect(run.finishFailure('적색 신호 정지선 준수')).toEqual({
      reason: '적색 신호 정지선 준수',
      score: 70,
      deductions: [redLightDeduction],
    });
  });

  it('첫 종료 뒤 추가 감점과 다른 종료 전환을 거부한다', () => {
    const run = new MissionRunState();
    expect(run.finishFailure('신호위반')).not.toBeNull();

    expect(run.isFinished).toBe(true);
    expect(run.applyPenalty(redLightDeduction)).toBe(false);
    expect(run.finishSuccess()).toBeNull();
    expect(run.score).toBe(100);
    expect(run.deductions).toEqual([]);
  });
});
