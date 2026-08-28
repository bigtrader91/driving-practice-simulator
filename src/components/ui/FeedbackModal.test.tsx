import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../constants/missions';
import { FeedbackModal } from './FeedbackModal';

const mission = MISSIONS.find((candidate) => candidate.id === 'city_lane_change') ?? MISSIONS[0];
const deduction = {
  id: 'signal-miss',
  timestamp: 1,
  reason: '방향지시등을 켜지 않았습니다.',
  points: 25,
};

const renderFeedback = (revealResult: boolean) => renderToStaticMarkup(
  <FeedbackModal
    mission={mission}
    score={65}
    deductions={[deduction]}
    failReason="차선 변경 절차 미준수"
    onRetry={() => undefined}
    onNextMission={() => undefined}
    nextLabel="다음 평가"
    isScored
    revealResult={revealResult}
  />
);

describe('FeedbackModal result disclosure', () => {
  it('사후평가 중간 시도에는 결과와 절차 힌트를 공개하지 않는다', () => {
    const html = renderFeedback(false);

    expect(html).toContain('사후 평가 시도 기록 완료');
    expect(html).toContain('다음 평가');
    expect(html).not.toContain('65');
    expect(html).not.toContain('방향지시등을 켜지 않았습니다.');
    expect(html).not.toContain('차선 변경 절차 미준수');
    expect(html).not.toContain('미러 확인 차선 변경');
    expect(html).not.toContain('다시 연습하기');
  });

  it('결과 공개 시점에는 점수와 감점 상세를 표시한다', () => {
    const html = renderFeedback(true);

    expect(html).toContain('65');
    expect(html).toContain('방향지시등을 켜지 않았습니다.');
    expect(html).toContain('차선 변경 절차 미준수');
    expect(html).toContain('다시 연습하기');
  });

  it('점수가 70점 이상이어도 유효 통과 여부가 false면 불합격으로 표시한다', () => {
    const html = renderToStaticMarkup(
      <FeedbackModal
        mission={mission}
        score={90}
        deductions={[deduction]}
        passed={false}
        onRetry={() => undefined}
        onNextMission={() => undefined}
      />
    );

    expect(html).toContain('안전 기준 미충족 (불합격)');
    expect(html).not.toContain('미션 완주 합격');
  });
});
