import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  beginPostAssessment,
  completeTrainingAttempt,
  createTrainingSession,
  startTrainingSession,
} from '../../simulation/TrainingSession';
import { TrainingFlowOverlay } from './TrainingFlowOverlay';

const renderFlow = (session: ReturnType<typeof createTrainingSession>) =>
  renderToStaticMarkup(
    <TrainingFlowOverlay
      session={session}
      onStart={() => undefined}
      onBeginPostAssessment={() => undefined}
      onRestart={() => undefined}
    />
  );

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
});
