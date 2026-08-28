import { describe, expect, it } from 'vitest';
import {
  assessAttemptEvents,
  assessMissionResult,
  AttemptEvent,
  isAttemptPassed,
  recordAttemptEvent,
} from './AttemptAssessment';

describe('AttemptAssessment', () => {
  it('명시된 다섯 안전 사건만 중대 실패로 분류한다', () => {
    const events: AttemptEvent[] = [
      { type: 'collision' },
      { type: 'road-departure' },
      { type: 'rear-ttc-entry', seconds: 1.49 },
      { type: 'rollover' },
      { type: 'spin', degrees: 90 },
    ];

    expect(assessAttemptEvents(events).majorFailures.map((failure) => failure.type)).toEqual([
      'collision',
      'road-departure',
      'critical-rear-ttc',
      'rollover',
      'spin',
    ]);
  });

  it('TTC와 스핀의 중대 실패 경계를 정확히 적용한다', () => {
    const result = assessAttemptEvents([
      { type: 'rear-ttc-entry', seconds: 1.5 },
      { type: 'spin', degrees: 89.9 },
      { type: 'spin', degrees: -90 },
    ]);

    expect(result.majorFailures.map((failure) => failure.type)).toEqual(['spin']);
  });

  it('절차 누락과 기존 감점 사유를 시도 피드백으로 결합한다', () => {
    const result = assessMissionResult(
      [
        {
          type: 'procedure-omission',
          code: 'mirror',
          message: '목표측 미러 확인이 누락됐습니다.',
        },
      ],
      ['속도를 안정적으로 유지하세요.'],
    );

    expect(result.majorFailures).toEqual([]);
    expect(result.procedureOmissions).toEqual(['mirror']);
    expect(result.feedback).toEqual([
      '목표측 미러 확인이 누락됐습니다.',
      '속도를 안정적으로 유지하세요.',
    ]);
  });

  it('같은 충돌과 같은 절차 누락 코드는 시도당 한 번만 기록한다', () => {
    const events: AttemptEvent[] = [];

    recordAttemptEvent(events, { type: 'collision' });
    recordAttemptEvent(events, { type: 'collision' });
    recordAttemptEvent(events, {
      type: 'procedure-omission',
      code: 'signal',
      message: '첫 메시지',
    });
    recordAttemptEvent(events, {
      type: 'procedure-omission',
      code: 'signal',
      message: '중복 메시지',
    });

    expect(events).toEqual([
      { type: 'collision' },
      { type: 'procedure-omission', code: 'signal', message: '첫 메시지' },
    ]);
  });

  it('점수가 합격이어도 충돌이나 절차 누락이 있으면 최종 통과시키지 않는다', () => {
    const collision = assessAttemptEvents([{ type: 'collision' }]);
    const omission = assessAttemptEvents([
      { type: 'procedure-omission', code: 'signal', message: '방향지시등 누락' },
    ]);

    expect(isAttemptPassed(true, collision)).toBe(false);
    expect(isAttemptPassed(true, omission)).toBe(false);
    expect(isAttemptPassed(true, assessAttemptEvents([]))).toBe(true);
    expect(isAttemptPassed(false, assessAttemptEvents([]))).toBe(false);
  });
});
