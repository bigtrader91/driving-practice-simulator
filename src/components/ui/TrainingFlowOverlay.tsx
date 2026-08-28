import React from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, Play, RotateCcw, XCircle } from 'lucide-react';
import { TrainingSession } from '../../simulation/TrainingSession';

interface TrainingFlowOverlayProps {
  session: TrainingSession;
  onStart: () => void;
  onBeginPostAssessment: () => void;
  onRestart: () => void;
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
}) => {
  if (session.lifecycle === 'active' && session.currentAttempt) {
    const attempt = session.currentAttempt;
    return (
      <aside className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-2xl border border-cyan-400/50 bg-slate-950/90 px-4 py-2 text-center shadow-2xl backdrop-blur-xl">
        <div className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
          {phaseLabels[attempt.phase]} · {session.results.length + 1}/10
        </div>
        <div className="text-sm font-black text-white">{directionLabels[attempt.direction]}</div>
        <div className="text-[10px] text-slate-300">
          {attempt.scored ? (attempt.guidance ? '안내를 따라 안전 절차를 연습하세요.' : '안내 없이 평소처럼 수행하세요.') : '점수에 반영되지 않는 조작 적응입니다.'}
        </div>
      </aside>
    );
  }

  if (session.lifecycle === 'welcome') {
    return (
      <TrainingCard
        icon={<Play className="h-8 w-8 text-cyan-300" />}
        title="10분 차선 변경 안전 훈련"
        description="설치 없이 바로 시작합니다. 조작 적응 1회, 사전 기준선 좌우 각 1회, 안내 훈련 좌우 각 1회 후 별도 사후 평가 5회를 진행합니다."
        buttonLabel="훈련 시작"
        onAction={onStart}
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
}

const TrainingCard: React.FC<TrainingCardProps> = ({
  icon,
  title,
  description,
  buttonLabel,
  onAction,
  buttonIcon,
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-lg">
    <section className="glass-panel-glow w-full max-w-xl space-y-5 rounded-3xl border border-slate-700 p-7 text-center shadow-2xl">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-900">
        {icon}
      </div>
      <div>
        <h1 className="text-2xl font-black text-white sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{description}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="mx-auto flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
      >
        {buttonIcon ?? <ArrowRight className="h-4 w-4" />}
        {buttonLabel}
      </button>
    </section>
  </div>
);
