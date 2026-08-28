import { describe, expect, it } from 'vitest';
import { runLaneChangeStabilitySuite } from './LaneChangePhysics';

describe('runLaneChangeStabilitySuite', () => {
  it('30·50·80km/h 총 100회에서 안정성 한계와 치명적 오류 기준을 지킨다', () => {
    const suite = runLaneChangeStabilitySuite();

    expect(suite.scenarioVersion).toBe('lane-change-stability-v1');
    expect(suite.fixedStepSeconds).toBe(1 / 60);
    expect(suite.runs).toHaveLength(100);
    expect(suite.runs.filter((run) => run.speedKmH === 30)).toHaveLength(34);
    expect(suite.runs.filter((run) => run.speedKmH === 50)).toHaveLength(33);
    expect(suite.runs.filter((run) => run.speedKmH === 80)).toHaveLength(33);

    for (const run of suite.runs) {
      expect(run.physicsStepCount).toBe(468);
      expect(run.maneuverDurationSeconds).toBeGreaterThanOrEqual(3);
      expect(run.maneuverDurationSeconds).toBeLessThanOrEqual(6);
      expect(run.maxLateralAccelerationMs2).toBeLessThanOrEqual(2.5);
      expect(run.maxYawRateDegPerSecond).toBeLessThanOrEqual(15);
      expect(run.stabilized).toBe(true);
      expect(run.stabilizationSeconds).toBeLessThanOrEqual(3);
      expect(run.finalLaneCenterErrorMeters).toBeLessThanOrEqual(0.35);
      expect(Math.abs(run.finalHeadingDegrees)).toBeLessThanOrEqual(1);
      expect(run.fatalErrors).toEqual([]);
    }

    expect(suite.fatalErrorCount).toBe(0);
  });

  it('같은 버전 고정 시나리오는 다시 실행해도 같은 결과를 낸다', () => {
    expect(runLaneChangeStabilitySuite()).toEqual(runLaneChangeStabilitySuite());
  });
});
