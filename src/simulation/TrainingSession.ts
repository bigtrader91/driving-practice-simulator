import { AttemptAssessment, isAttemptPassed, MajorFailure } from './AttemptAssessment';

export type TrainingPhase = 'adaptation' | 'baseline' | 'guided' | 'post-assessment';
export type TrainingDirection = 'free' | 'left' | 'right';
export type TrainingLifecycle = 'welcome' | 'active' | 'post-briefing' | 'results';

export interface TrainingAttempt {
  id: string;
  phase: TrainingPhase;
  direction: TrainingDirection;
  scored: boolean;
  guidance: boolean;
}

export interface TrainingAttemptResult extends TrainingAttempt {
  score: number | null;
  passed: boolean | null;
  feedback: string[];
  majorFailures: MajorFailure[];
}

export interface TrainingSession {
  lifecycle: TrainingLifecycle;
  currentAttempt: TrainingAttempt | null;
  results: TrainingAttemptResult[];
}

const PRE_POST_ATTEMPTS: TrainingAttempt[] = [
  { id: 'adaptation-1', phase: 'adaptation', direction: 'free', scored: false, guidance: true },
  { id: 'baseline-left', phase: 'baseline', direction: 'left', scored: true, guidance: false },
  { id: 'baseline-right', phase: 'baseline', direction: 'right', scored: true, guidance: false },
  { id: 'guided-left', phase: 'guided', direction: 'left', scored: true, guidance: true },
  { id: 'guided-right', phase: 'guided', direction: 'right', scored: true, guidance: true },
];

const POST_ATTEMPTS: TrainingAttempt[] = [
  { id: 'post-1', phase: 'post-assessment', direction: 'left', scored: true, guidance: false },
  { id: 'post-2', phase: 'post-assessment', direction: 'right', scored: true, guidance: false },
  { id: 'post-3', phase: 'post-assessment', direction: 'left', scored: true, guidance: false },
  { id: 'post-4', phase: 'post-assessment', direction: 'right', scored: true, guidance: false },
  { id: 'post-5', phase: 'post-assessment', direction: 'left', scored: true, guidance: false },
];

export function createTrainingSession(): TrainingSession {
  return { lifecycle: 'welcome', currentAttempt: null, results: [] };
}

export function isTrainingAttemptActive(session: TrainingSession): boolean {
  return session.lifecycle === 'active' && session.currentAttempt !== null;
}

export function hasActiveGuidance(session: TrainingSession): boolean {
  return isTrainingAttemptActive(session) && session.currentAttempt?.guidance === true;
}

export function shouldRevealAttemptResult(attempt: TrainingAttempt | null): boolean {
  return attempt?.phase !== 'post-assessment' || attempt.id === 'post-5';
}

export function startTrainingSession(session: TrainingSession): TrainingSession {
  if (session.lifecycle !== 'welcome') {
    throw new Error('새 훈련 세션만 시작할 수 있습니다.');
  }
  return { ...session, lifecycle: 'active', currentAttempt: PRE_POST_ATTEMPTS[0] };
}

export function beginPostAssessment(session: TrainingSession): TrainingSession {
  if (session.lifecycle !== 'post-briefing') {
    throw new Error('안내 훈련을 마친 뒤 사후 평가를 시작할 수 있습니다.');
  }
  return { ...session, lifecycle: 'active', currentAttempt: POST_ATTEMPTS[0] };
}

export function completeTrainingAttempt(
  session: TrainingSession,
  result: { score: number; passed: boolean; assessment?: AttemptAssessment }
): TrainingSession {
  if (session.lifecycle !== 'active' || !session.currentAttempt) {
    throw new Error('진행 중인 훈련 시도가 없습니다.');
  }

  const assessment = result.assessment ?? {
    majorFailures: [],
    procedureOmissions: [],
    feedback: [],
  };
  const recordedResult = {
    score: session.currentAttempt.scored ? result.score : null,
    passed: session.currentAttempt.scored
      ? isAttemptPassed(result.passed, assessment)
      : null,
    feedback: assessment.feedback,
    majorFailures: assessment.majorFailures,
  };
  const results = [...session.results, { ...session.currentAttempt, ...recordedResult }];
  const attempts = session.currentAttempt.phase === 'post-assessment' ? POST_ATTEMPTS : PRE_POST_ATTEMPTS;
  const currentIndex = attempts.findIndex((attempt) => attempt.id === session.currentAttempt?.id);
  const nextAttempt = attempts[currentIndex + 1];

  if (nextAttempt) {
    return { lifecycle: 'active', currentAttempt: nextAttempt, results };
  }

  if (session.currentAttempt.phase === 'post-assessment') {
    return { lifecycle: 'results', currentAttempt: null, results };
  }

  return { lifecycle: 'post-briefing', currentAttempt: null, results };
}
