import { describe, expect, it } from 'vitest';
import {
  beginPostAssessment,
  completeTrainingAttempt,
  createTrainingSession,
  hasActiveGuidance,
  isTrainingAttemptActive,
  shouldRevealAttemptResult,
  startTrainingSession,
} from './TrainingSession';

describe('TrainingSession', () => {
  it('설치 없는 한 세션에서 적응, 사전 좌우, 안내 좌우 순서로 진행한다', () => {
    let session = startTrainingSession(createTrainingSession());

    expect(session.currentAttempt).toMatchObject({
      phase: 'adaptation',
      direction: 'free',
      scored: false,
    });
    expect(isTrainingAttemptActive(session)).toBe(true);
    expect(hasActiveGuidance(session)).toBe(true);

    session = completeTrainingAttempt(session, { score: 100, passed: true });
    expect(session.results[0]).toMatchObject({ score: null, passed: null, scored: false });
    expect(session.currentAttempt).toMatchObject({ phase: 'baseline', direction: 'left' });
    expect(hasActiveGuidance(session)).toBe(false);

    session = completeTrainingAttempt(session, { score: 72, passed: true });
    expect(session.currentAttempt).toMatchObject({ phase: 'baseline', direction: 'right' });

    session = completeTrainingAttempt(session, { score: 68, passed: false });
    expect(session.currentAttempt).toMatchObject({ phase: 'guided', direction: 'left' });
    expect(hasActiveGuidance(session)).toBe(true);

    session = completeTrainingAttempt(session, { score: 85, passed: true });
    expect(session.currentAttempt).toMatchObject({ phase: 'guided', direction: 'right' });
  });

  it('안내 훈련 뒤 별도 시작 경계를 거쳐 사후 평가 5회를 완료한다', () => {
    let session = startTrainingSession(createTrainingSession());
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 80 + index, passed: true });
    }

    expect(session.lifecycle).toBe('post-briefing');
    expect(session.currentAttempt).toBeNull();
    expect(isTrainingAttemptActive(session)).toBe(false);
    expect(() => completeTrainingAttempt(session, { score: 90, passed: true })).toThrow(
      '진행 중인 훈련 시도가 없습니다.'
    );

    session = beginPostAssessment(session);
    const postDirections = [];
    for (let index = 0; index < 5; index += 1) {
      postDirections.push(session.currentAttempt?.direction);
      session = completeTrainingAttempt(session, { score: 90 + index, passed: true });
    }

    expect(postDirections).toEqual(['left', 'right', 'left', 'right', 'left']);
    expect(session.lifecycle).toBe('results');
    expect(session.results).toHaveLength(10);
    expect(session.results.filter((result) => result.phase === 'post-assessment')).toHaveLength(5);
  });

  it('사후 평가 1~4회 결과는 숨기고 마지막 시도에서만 공개한다', () => {
    let session = startTrainingSession(createTrainingSession());
    for (let index = 0; index < 5; index += 1) {
      expect(shouldRevealAttemptResult(session.currentAttempt)).toBe(true);
      session = completeTrainingAttempt(session, { score: 90, passed: true });
    }

    session = beginPostAssessment(session);
    for (let index = 0; index < 5; index += 1) {
      expect(shouldRevealAttemptResult(session.currentAttempt)).toBe(index === 4);
      session = completeTrainingAttempt(session, { score: 90, passed: true });
    }
  });
});
