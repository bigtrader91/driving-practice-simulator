import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  beginPostAssessment,
  completeTrainingAttempt,
  createTrainingSession,
  startTrainingSession,
} from '../../simulation/TrainingSession';
import { TrainingFlowOverlay } from './TrainingFlowOverlay';
import type { CompletedTrainingRecord } from '../../simulation/TrainingSessionPersistence';
import type { TrainingPersistenceIssue } from '../../simulation/TrainingSessionPersistence';

interface PersistenceProps {
  resumableSession?: ReturnType<typeof createTrainingSession> | null;
  latestCompleted?: CompletedTrainingRecord | null;
  persistenceIssue?: TrainingPersistenceIssue | null;
}

const renderFlow = (
  session: ReturnType<typeof createTrainingSession>,
  persistence: PersistenceProps = {},
) => {
  const props = {
    session,
    onStart: () => undefined,
    onBeginPostAssessment: () => undefined,
    onRestart: () => undefined,
    onResume: () => undefined,
    onClearPersistenceError: () => undefined,
    ...persistence,
  };
  return renderToStaticMarkup(
    React.createElement(
      TrainingFlowOverlay,
      props as React.ComponentProps<typeof TrainingFlowOverlay>,
    ),
  );
};

describe('TrainingFlowOverlay', () => {
  it('URL 첫 화면부터 별도 사후 평가 경계와 최종 결과까지 표시한다', () => {
    let session = createTrainingSession();
    expect(renderFlow(session)).toContain('10분 차선 변경 안전 훈련');

    session = startTrainingSession(session);
    expect(renderFlow(session)).toContain('조작 적응');

    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 90, passed: true });
    }
    expect(renderFlow(session)).toContain('사후 평가 5회');

    session = beginPostAssessment(session);
    expect(renderFlow(session)).toContain('사후 평가');
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 90, passed: true });
    }

    const results = renderFlow(session);
    expect(results).toContain('전체 훈련 완료');
    expect(results).toContain('사후 평가 5/5회');
  });

  it('사후 평가 4/5 이상만 횟수 목표 달성으로 표시한다', () => {
    let session = startTrainingSession(createTrainingSession());
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 90, passed: true });
    }
    session = beginPostAssessment(session);
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 90, passed: index < 4 });
    }
    expect(renderFlow(session)).toContain('사후 평가 횟수 목표 달성');

    session = startTrainingSession(createTrainingSession());
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 90, passed: true });
    }
    session = beginPostAssessment(session);
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 60, passed: index < 3 });
    }
    expect(renderFlow(session)).toContain('사후 평가 횟수 목표 미달');
  });

  it('확정된 시도 다음 단계에서 이어가거나 새 훈련을 선택할 수 있다', () => {
    let resumableSession = startTrainingSession(createTrainingSession());
    resumableSession = completeTrainingAttempt(resumableSession, { score: 90, passed: true });

    const html = renderFlow(createTrainingSession(), { resumableSession });

    expect(html).toContain('훈련 이어하기');
    expect(html).toContain('진행 1/10회');
    expect(html).toContain('새 훈련 시작');
  });

  it('최근 완료 기록의 성공, 평균 점수, 감점, 중대 실패를 요약한다', () => {
    let completed = startTrainingSession(createTrainingSession());
    for (let index = 0; index < 5; index += 1) {
      completed = completeTrainingAttempt(completed, { score: 90, passed: true });
    }
    completed = beginPostAssessment(completed);
    for (let index = 0; index < 5; index += 1) {
      completed = completeTrainingAttempt(completed, {
        score: index === 0 ? 50 : 90,
        passed: index !== 0,
        assessment: index === 0
          ? {
              majorFailures: [{ type: 'collision', message: '충돌이 발생했습니다.' }],
              procedureOmissions: [],
              feedback: [],
            }
          : undefined,
      });
    }
    const latestCompleted: CompletedTrainingRecord = {
      completedAt: '2026-08-28T10:01:00.000Z',
      session: completed,
    };

    const html = renderFlow(createTrainingSession(), { latestCompleted });

    expect(html).toContain('최근 완료 기록');
    expect(html).toContain('성공 8/9회');
    expect(html).toContain('평균 86점');
    expect(html).toContain('총 감점 130점');
    expect(html).toContain('중대 실패 1건');
  });

  it('저장 데이터 오류와 사용자가 실행할 수 있는 복구 동작을 표시한다', () => {
    const html = renderFlow(createTrainingSession(), {
      persistenceIssue: {
        kind: 'invalid-data',
        message: '저장된 훈련 데이터가 손상됐습니다.',
      },
    });

    expect(html).toContain('저장된 훈련 데이터가 손상됐습니다.');
    expect(html).toContain('저장 데이터 삭제');
  });

  it('사후 평가 안내 단계에서도 저장 실패를 숨기지 않는다', () => {
    let session = startTrainingSession(createTrainingSession());
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 90, passed: true });
    }

    const html = renderFlow(session, {
      persistenceIssue: {
        kind: 'write-failure',
        message: '훈련 진행 상황을 브라우저에 저장하지 못했습니다.',
      },
    });

    expect(html).toContain('훈련 진행 상황을 브라우저에 저장하지 못했습니다.');
    expect(html).not.toContain('저장 데이터 삭제');
  });
});
