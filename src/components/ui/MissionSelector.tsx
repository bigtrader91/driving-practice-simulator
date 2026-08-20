import React from 'react';
import { Mission, MissionCategory } from '../../types/simulator';
import { MISSIONS } from '../../constants/missions';
import { Flag, Compass, Award, CheckCircle2, ChevronRight, X } from 'lucide-react';

interface MissionSelectorProps {
  currentMissionId: string;
  onSelectMission: (mission: Mission) => void;
  onClose: () => void;
}

export const MissionSelector: React.FC<MissionSelectorProps> = ({
  currentMissionId,
  onSelectMission,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = React.useState<MissionCategory | 'all'>('all');

  const filteredMissions = MISSIONS.filter((m) =>
    activeCategory === 'all' ? true : m.category === activeCategory
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel-glow w-full max-w-3xl rounded-3xl p-6 border border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Flag className="w-6 h-6 text-cyan-400" />
              운전 연습 코스 & 미션 선택
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              초보 운전자가 가장 어려워하는 상황별 코스를 단계적으로 마스터하세요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 py-3 overflow-x-auto">
          {[
            { id: 'all', label: '전체 코스' },
            { id: 'width', label: '차폭감 & 좁은길' },
            { id: 'curve', label: 'S자 & 직각 코스' },
            { id: 'parking', label: '주차 마스터 (후진/평행)' },
            { id: 'traffic', label: '시내 도로 & 차선변경' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                activeCategory === tab.id
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Mission List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {filteredMissions.map((mission) => {
            const isCurrent = mission.id === currentMissionId;
            return (
              <div
                key={mission.id}
                onClick={() => {
                  onSelectMission(mission);
                  onClose();
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                  isCurrent
                    ? 'border-cyan-500 bg-cyan-950/30 ring-1 ring-cyan-500/50'
                    : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        mission.difficulty === '쉬움'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : mission.difficulty === '보통'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {mission.difficulty}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      {mission.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300">{mission.subtitle}</p>
                  <p className="text-[11px] text-slate-400">{mission.description}</p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition ${
                      isCurrent
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-200 hover:bg-cyan-500 hover:text-slate-950'
                    }`}
                  >
                    <span>{isCurrent ? '진행 중' : '시작하기'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
