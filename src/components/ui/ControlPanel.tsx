import React from 'react';
import { ControlInputs, GearMode } from '../../types/simulator';
import { Volume2, VolumeX, RotateCcw, HelpCircle, Car, Flag } from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface ControlPanelProps {
  onOpenMissions: () => void;
  onOpenVehicles: () => void;
  onResetCar: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onGearSelect: (gear: GearMode) => void;
  currentGear: GearMode;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  onOpenMissions,
  onOpenVehicles,
  onResetCar,
  isMuted,
  onToggleMute,
  onGearSelect,
  currentGear,
}) => {
  const [showHelp, setShowHelp] = React.useState(false);

  return (
    <>
      {/* Floating Utility Toolbar (Top Center-Right or Bottom) */}
      <div className="absolute top-4 right-44 hidden md:flex items-center gap-2 z-20 pointer-events-auto">
        <button
          onClick={onOpenMissions}
          className="glass-panel px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-800 flex items-center gap-1.5 transition border border-slate-700 shadow-lg"
          title="코스 선택"
        >
          <Flag className="w-4 h-4 text-cyan-400" />
          <span>코스 변경</span>
        </button>

        <button
          onClick={onOpenVehicles}
          className="glass-panel px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-800 flex items-center gap-1.5 transition border border-slate-700 shadow-lg"
          title="차종 변경"
        >
          <Car className="w-4 h-4 text-cyan-400" />
          <span>차종 선택</span>
        </button>

        <button
          onClick={onResetCar}
          className="glass-panel p-2 rounded-xl text-slate-300 hover:bg-slate-800 transition border border-slate-700 shadow-lg"
          title="시작 위치로 리셋 (R키)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleMute}
          className="glass-panel p-2 rounded-xl text-slate-300 hover:bg-slate-800 transition border border-slate-700 shadow-lg"
          title={isMuted ? '음소거 해제' : '음소거'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
        </button>

        <button
          onClick={() => setShowHelp(true)}
          className="glass-panel p-2 rounded-xl text-slate-300 hover:bg-slate-800 transition border border-slate-700 shadow-lg"
          title="조작법 안내"
        >
          <HelpCircle className="w-4 h-4 text-yellow-400" />
        </button>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel-glow w-full max-w-lg rounded-3xl p-6 border border-slate-700 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-cyan-400" />
                조작 단축키 및 운전 가이드
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-cyan-400">주행 & 조향</div>
                <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">W / ↑</kbd> 가속 (엑셀)</div>
                <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">S / ↓</kbd> 감속 / 브레이크</div>
                <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">A / D</kbd> 핸들 좌/우 조향</div>
                <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">Space</kbd> 사이드 브레이크</div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-cyan-400">시선 & 깜빡이</div>
                <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">[ / ]</kbd> 좌/우 방향지시등</div>
                <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">Q / E</kbd> 좌/우 숄더체크</div>
                <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">마우스 드래그</kbd> 자유 시선 회전</div>
                <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">C</kbd> 카메라 시점 변경</div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1 col-span-2">
                <div className="font-bold text-cyan-400">기어 변속 & 가이드 보조</div>
                <div className="flex gap-4">
                  <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">P / R / N / D</kbd> 기어 변경</span>
                  <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded font-mono">T</kbd> 궤적선 ON/OFF</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs"
            >
              확인 및 닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
};
