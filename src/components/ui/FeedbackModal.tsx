import React, { useEffect } from 'react';
import { Mission, ScoreDeduction } from '../../types/simulator';
import { Award, CheckCircle2, RotateCcw, ArrowRight, ShieldCheck, XCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

interface FeedbackModalProps {
  mission: Mission;
  score: number;
  deductions: ScoreDeduction[];
  failReason?: string;
  onRetry: () => void;
  onNextMission: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  mission,
  score,
  deductions,
  failReason,
  onRetry,
  onNextMission,
}) => {
  const isFailed = Boolean(failReason);
  const isPassed = score >= 70 && !isFailed;

  useEffect(() => {
    if (isPassed) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [isPassed]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4">
      <div className="glass-panel-glow w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-slate-700 shadow-2xl text-center space-y-5 animate-in zoom-in-95">
        {/* Badge Icon */}
        <div className="inline-flex p-4 rounded-full bg-slate-900 border border-slate-800 shadow-inner">
          {isPassed ? (
            <Award className="w-12 h-12 text-emerald-400 animate-bounce" />
          ) : (
            <XCircle className="w-12 h-12 text-rose-500" />
          )}
        </div>

        {/* Title */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {isFailed ? '🚫 미션 실패' : isPassed ? '🎉 미션 완주 합격!' : '⚠️ 기준 점수 미달 (불합격)'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{mission.title}</p>
          {isFailed && (
            <p className="text-sm font-bold text-rose-400 mt-2">사유: {failReason}</p>
          )}
        </div>

        {/* Score Ring */}
        <div className="py-2">
          <div
            className={`text-5xl sm:text-6xl font-black tracking-tight font-mono ${
              isPassed ? 'text-emerald-400' : 'text-rose-500'
            }`}
          >
            {score}
            <span className="text-base font-normal text-slate-400 ml-1">/ 100점</span>
          </div>
          <div className="text-xs font-semibold text-slate-300 mt-2">
            {isPassed
              ? '훌륭합니다! 안전 운전 기본기가 아주 좋습니다.'
              : '감점 항목을 보완하여 다시 한 번 도전해보세요!'}
          </div>
        </div>

        {/* Deductions Breakdown List */}
        <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 text-left max-h-40 overflow-y-auto space-y-2">
          <div className="text-xs font-bold text-slate-400">감점 상세 내역</div>
          {deductions.length === 0 ? (
            <div className="text-xs text-emerald-400 flex items-center gap-1.5 py-1">
              <ShieldCheck className="w-4 h-4" />
              <span>감점 없음! 완벽한 무결점 클리어</span>
            </div>
          ) : (
            deductions.map((d) => (
              <div
                key={d.id}
                className="flex justify-between items-center text-xs py-1 border-b border-slate-900 last:border-0"
              >
                <span className="text-slate-300">{d.reason}</span>
                <span className="font-bold text-rose-400">-{d.points}점</span>
              </div>
            ))
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onRetry}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>다시 연습하기</span>
          </button>
          <button
            onClick={onNextMission}
            className="flex-1 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-500/25"
          >
            <span>다음 코스 도전</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
