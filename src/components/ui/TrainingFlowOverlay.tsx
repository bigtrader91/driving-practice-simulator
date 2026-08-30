import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  History,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { TrainingSession } from '../../simulation/TrainingSession';
import type {
  CompletedTrainingRecord,
  TrainingPersistenceIssue,
} from '../../simulation/TrainingSessionPersistence';
import { BrandLogo } from './BrandLogo';

interface TrainingFlowOverlayProps {
  session: TrainingSession;
  onStart: () => void;
  onBeginPostAssessment: () => void;
  onRestart: () => void;
  resumableSession?: TrainingSession | null;
  latestCompleted?: CompletedTrainingRecord | null;
  persistenceIssue?: TrainingPersistenceIssue | null;
  onResume: () => void;
  onClearPersistenceError: () => void;
}

const phaseLabels = {
  adaptation: '조작 적응',
  baseline: '사전 기준선',
  guided: '안내 훈련',
  'post-assessment': '사후 평가',
} as const;

const directionLabels = {
  free: '자유 적응',
  left: '좌측 차선 변경',
  right: '우측 차선 변경',
} as const;

export const TrainingFlowOverlay: React.FC<TrainingFlowOverlayProps> = ({
  session,
  onStart,
  onBeginPostAssessment,
  onRestart,
  resumableSession = null,
  latestCompleted = null,
  persistenceIssue = null,
  onResume,
  onClearPersistenceError,
}) => {
  const persistenceWarning = persistenceIssue
    ? <PersistenceWarning issue={persistenceIssue} onClear={onClearPersistenceError} />
    : undefined;

  if (session.lifecycle === 'active' && session.currentAttempt) {
    const attempt = session.currentAttempt;
    return (
      <aside className="absolute left-1/2 top-28 z-40 -translate-x-1/2 rounded-2xl border border-cyan-400/50 bg-slate-950/90 px-4 py-2 text-center shadow-2xl backdrop-blur-xl">
        <div className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
          {phaseLabels[attempt.phase]} · {session.results.length + 1}/10
        </div>
        <div className="text-sm font-black text-white">{directionLabels[attempt.direction]}</div>
        <div className="text-[10px] text-slate-300">
          {attempt.scored ? (attempt.guidance ? '안내를 따라 안전 절차를 연습하세요.' : '안내 없이 평소처럼 수행하세요.') : '점수에 반영되지 않는 조작 적응입니다.'}
        </div>
        {persistenceWarning}
      </aside>
    );
  }

  if (session.lifecycle === 'welcome') {
    const scoredResults = latestCompleted?.session.results.filter((result) => result.scored) ?? [];
    const scoreValues = scoredResults.flatMap((result) => result.score === null ? [] : [result.score]);
    const averageScore = scoreValues.length === 0
      ? 0
      : Math.round(scoreValues.reduce((total, score) => total + score, 0) / scoreValues.length);
    const totalDeductions = scoreValues.reduce((total, score) => total + Math.max(0, 100 - score), 0);
    const majorFailures = scoredResults.reduce((total, result) => total + result.majorFailures.length, 0);
    const welcomeDetails = (
      <div className="space-y-3 text-left">
        {resumableSession && (
          <div className="rounded-2xl border border-cyan-400/40 bg-cyan-950/30 p-4">
            <div className="text-xs font-black text-cyan-300">저장된 훈련 · 진행 {resumableSession.results.length}/10회</div>
            <p className="mt-1 text-xs text-slate-300">마지막으로 완료한 시도 다음 단계부터 계속합니다.</p>
          </div>
        )}
        {latestCompleted && (
          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="flex items-center gap-2 text-xs font-black text-slate-200">
              <History className="h-4 w-4 text-emerald-300" />
              최근 완료 기록
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-4">
              <span>성공 {scoredResults.filter((result) => result.passed).length}/9회</span>
              <span>평균 {averageScore}점</span>
              <span>총 감점 {totalDeductions}점</span>
              <span>중대 실패 {majorFailures}건</span>
            </div>
          </div>
        )}
        {persistenceWarning}
      </div>
    );
    return (
      <TrainingCard
        icon={<Play className="h-8 w-8 text-cyan-300" />}
        title="10분 차선 변경 안전 훈련"
        description="설치 없이 바로 시작합니다. 조작 적응 1회, 사전 기준선 좌우 각 1회, 안내 훈련 좌우 각 1회 후 별도 사후 평가 5회를 진행합니다."
        buttonLabel={resumableSession ? '훈련 이어하기' : '훈련 시작'}
        onAction={resumableSession ? onResume : onStart}
        secondaryAction={resumableSession ? { label: '새 훈련 시작', onAction: onStart } : undefined}
        details={welcomeDetails}
      />
    );
  }

  if (session.lifecycle === 'post-briefing') {
    return (
      <TrainingCard
        icon={<ClipboardCheck className="h-8 w-8 text-amber-300" />}
        title="사후 평가 5회"
        description="안내 훈련이 끝났습니다. 이제 별도 배치에서 안내 없이 좌우 차선 변경을 5회 평가합니다. 준비되면 시작하세요."
        buttonLabel="사후 평가 시작"
        onAction={onBeginPostAssessment}
        details={persistenceWarning}
      />
    );
  }

  const completed = session.results.filter((result) => result.scored && result.passed).length;
  const postCompleted = session.results.filter(
    (result) => result.phase === 'post-assessment' && result.passed
  ).length;
  const metPostAttemptTarget = postCompleted >= 4;
  return (
    <TrainingCard
      icon={metPostAttemptTarget
        ? <CheckCircle2 className="h-8 w-8 text-emerald-300" />
        : <XCircle className="h-8 w-8 text-rose-300" />}
      title={`전체 훈련 완료 · 사후 평가 횟수 목표 ${metPostAttemptTarget ? '달성' : '미달'}`}
      description={`조작 적응 1회와 평가 9회를 마쳤습니다. 평가 성공 ${completed}/9회 · 사후 평가 ${postCompleted}/5회`}
      buttonLabel="새 훈련 시작"
      onAction={onRestart}
      buttonIcon={<RotateCcw className="h-4 w-4" />}
      details={persistenceWarning}
    />
  );
};

interface TrainingCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onAction: () => void;
  buttonIcon?: React.ReactNode;
  details?: React.ReactNode;
  secondaryAction?: { label: string; onAction: () => void };
}

const TrainingCard: React.FC<TrainingCardProps> = ({
  icon,
  title,
  description,
  buttonLabel,
  onAction,
  buttonIcon,
  details,
  secondaryAction,
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-lg">
    <section className="glass-panel-glow w-full max-w-xl space-y-5 rounded-3xl border border-slate-700 p-7 text-center shadow-2xl">
      <div className="flex justify-center">
        <BrandLogo />
      </div>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-900">
        {icon}
      </div>
      <div>
        <h1 className="text-2xl font-black text-white sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{description}</p>
      </div>
      {details}
      <div className="flex flex-col justify-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onAction}
          className="flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
        >
          {buttonIcon ?? <ArrowRight className="h-4 w-4" />}
          {buttonLabel}
        </button>
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onAction}
            className="rounded-xl bg-slate-800 px-6 py-3 text-sm font-black text-slate-200 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </section>
  </div>
);

const PersistenceWarning: React.FC<{
  issue: TrainingPersistenceIssue;
  onClear: () => void;
}> = ({ issue, onClear }) => (
  <div role="alert" className="rounded-xl border border-amber-500/50 bg-amber-950/40 p-3 text-left">
    <div className="flex items-start gap-2 text-xs text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{issue.message}</span>
    </div>
    {issue.kind === 'invalid-data' && (
      <button
        type="button"
        onClick={onClear}
        className="mt-2 text-xs font-black text-amber-100 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
      >
        저장 데이터 삭제
      </button>
    )}
  </div>
);
