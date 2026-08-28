import React from 'react';
import {
  CarState,
  Mission,
  ProximitySensorData,
  ScoreDeduction,
  CameraViewMode,
  VehicleConfig,
  TrafficVehicleData,
  ControlInputs,
  GearMode,
} from '../../types/simulator';
import {
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Compass,
  Gauge,
  Eye,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  Car,
  Activity,
  RotateCw,
  Sliders,
} from 'lucide-react';
import { LargeSteeringWheel } from './LargeSteeringWheel';

interface HUDProps {
  vehicle: VehicleConfig;
  mission: Mission;
  carState: CarState;
  sensors: ProximitySensorData;
  trafficData?: TrafficVehicleData[];
  score: number;
  recentPenalty: ScoreDeduction | null;
  cameraMode: CameraViewMode;
  onCameraToggle: () => void;
  showTrajectory: boolean;
  onTrajectoryToggle: () => void;
  showWidthGuide: boolean;
  onWidthGuideToggle: () => void;
  inputs: ControlInputs;
  onGearChange: (gear: GearMode) => void;
  onMouseSteer: (ratio: number) => void;
  showGuidance: boolean;
}

export const HUD: React.FC<HUDProps> = ({
  vehicle,
  mission,
  carState,
  sensors,
  trafficData,
  score,
  recentPenalty,
  cameraMode,
  onCameraToggle,
  showTrajectory,
  onTrajectoryToggle,
  showWidthGuide,
  onWidthGuideToggle,
  inputs,
  onGearChange,
  onMouseSteer,
  showGuidance,
}) => {
  const isLeftBlink = carState.turnSignal === 'left' || carState.turnSignal === 'hazard';
  const isRightBlink = carState.turnSignal === 'right' || carState.turnSignal === 'hazard';

  const yieldingCar = trafficData?.find((t) => t.isYielding);
  const aggressiveCar = trafficData?.find(
    (t) =>
      t.isHonking ||
      (t.behavior === 'aggressive' && isLeftBlink && t.x < carState.x) ||
      (t.behavior === 'aggressive' && isRightBlink && t.x > carState.x)
  );

  const speedRatio = Math.min(1, Math.abs(carState.speed) / 120);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4 select-none z-10">
      {/* 1. Top Section - Under Mirrors (Zero Overlaps) */}
      <div className="flex justify-between items-start pt-24 sm:pt-28 gap-4">
        {/* Mission Info Card */}
        {showGuidance && <div className="glass-panel rounded-2xl p-3 max-w-sm pointer-events-auto border-l-4 border-l-cyan-400 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="bg-cyan-500/20 text-cyan-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-cyan-500/30">
              {mission.difficulty}
            </span>
            <h2 className="text-xs sm:text-sm font-black text-white tracking-tight truncate">
              {mission.title}
            </h2>
          </div>
          <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">{mission.subtitle}</p>

          <div className="text-[10px] text-amber-200 bg-amber-950/50 border border-amber-500/30 px-2 py-1 rounded-xl mt-1.5 flex items-start gap-1">
            <span className="shrink-0 font-bold">💡 팁:</span>
            <span className="truncate">{mission.tip.replace('💡 팁: ', '').replace('💡 실전 팁: ', '')}</span>
          </div>
        </div>}

        {/* Safety Score & Camera Switcher */}
        <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
          {showGuidance && <div className="glass-panel rounded-2xl px-3.5 py-1.5 flex items-center gap-2.5 shadow-2xl border border-slate-700/60">
            <div className="text-right">
              <div className="text-[9px] uppercase font-black tracking-wider text-slate-400">안전 점수</div>
              <div
                className={`text-xl font-black tracking-tight font-mono ${
                  score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-rose-500'
                }`}
              >
                {score} <span className="text-[10px] font-normal text-slate-400">/ 100</span>
              </div>
            </div>
          </div>}

          <button
            onClick={onCameraToggle}
            className="glass-panel hover:bg-slate-800 active:scale-95 transition px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-slate-700 shadow-xl text-slate-200 text-xs font-bold"
            title="시점 전환 (C키)"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {cameraMode === 'cockpit'
                ? '1인칭 운전석'
                : cameraMode === 'chase'
                ? '3인칭 후방'
                : cameraMode === 'top'
                ? '탑뷰'
                : '보닛'}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Middle Notification Banners */}
      <div className="flex flex-col items-center gap-2">
        {showGuidance && recentPenalty && (
          <div className="animate-bounce">
            <div className="bg-rose-600/95 text-white font-black text-xs sm:text-sm px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-rose-300 backdrop-blur-xl">
              <AlertTriangle className="w-4 h-4 text-yellow-300" />
              <span>{recentPenalty.reason} (-{recentPenalty.points}점)</span>
            </div>
          </div>
        )}

        {showGuidance && yieldingCar && (
          <div className="animate-pulse glass-panel-glow bg-emerald-950/85 border-emerald-400/80 px-4 py-2 rounded-full text-xs font-black text-emerald-300 flex items-center gap-2 shadow-2xl">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>🟢 [양보 신호] 뒤쪽 차량이 상향등을 깜빡이며 감속 중입니다! (안전 진입 가능)</span>
          </div>
        )}

        {showGuidance && aggressiveCar && (
          <div className="animate-pulse glass-panel bg-rose-950/90 border-rose-500 px-4 py-2 rounded-full text-xs font-black text-rose-300 flex items-center gap-2 shadow-2xl">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>🔴 [위험 경고] 뒤쪽 차량이 양보 없이 가속 중입니다! 차선 변경을 멈추세요.</span>
          </div>
        )}
      </div>

      {/* 3. Shoulder Check & Proximity Radar */}
      <div className="flex justify-between items-center px-1">
        {showGuidance && <div className="glass-panel p-2 rounded-2xl text-xs space-y-1 border border-slate-800 shadow-2xl backdrop-blur-xl">
          <div className="text-[10px] font-black text-slate-400 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            사각지대 숄더체크
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${
                carState.leftMirrorLooked
                  ? 'bg-cyan-400 text-slate-950 shadow-md scale-105'
                  : 'bg-slate-900/80 text-slate-500 border border-slate-800'
              }`}
            >
              좌측 (Q)
            </span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${
                carState.rearMirrorLooked
                  ? 'bg-cyan-400 text-slate-950 shadow-md scale-105'
                  : 'bg-slate-900/80 text-slate-500 border border-slate-800'
              }`}
            >
              룸미러
            </span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${
                carState.rightMirrorLooked
                  ? 'bg-cyan-400 text-slate-950 shadow-md scale-105'
                  : 'bg-slate-900/80 text-slate-500 border border-slate-800'
              }`}
            >
              우측 (E)
            </span>
          </div>
        </div>}

        {showGuidance && sensors.minDistance > 0 && sensors.minDistance < 3.0 && (
          <div className="glass-panel px-3 py-1.5 rounded-xl border border-amber-500/50 bg-amber-950/50 text-amber-300 font-bold text-xs flex items-center gap-1.5 animate-pulse shadow-xl">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>거리: {sensors.minDistance.toFixed(1)}m</span>
          </div>
        )}
      </div>

      {/* 4. Bottom Section: Left-Hand Controls + Large Steering Wheel + Speedometer Cluster */}
      <div className="flex flex-col lg:flex-row justify-between items-end gap-3 pb-1">
        {/* Left: Left-Hand Keyboard Control Guide (No Key Overlaps) */}
        {showGuidance && <div className="glass-panel p-3 rounded-2xl border border-slate-800 shadow-2xl pointer-events-auto space-y-2 max-w-xs sm:max-w-sm backdrop-blur-xl">
          <div className="flex justify-between items-center text-[10px] font-black text-slate-400 pb-1 border-b border-slate-800">
            <span className="text-cyan-400 flex items-center gap-1">
              <Activity className="w-3 h-3" />
              키보드 조작 가이드
            </span>
            <span className="text-[9px] text-emerald-400 font-bold">조향: 마우스 · ←/→</span>
          </div>

          <div className="space-y-1.5 text-xs">
            {/* Driving Pedals */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <span className={`px-2 py-0.5 rounded-lg font-mono font-black text-[11px] transition ${inputs.forward ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300'}`}>W 엑셀</span>
              <span className={`px-2 py-0.5 rounded-lg font-mono font-black text-[11px] transition ${inputs.backward ? 'bg-rose-500 text-white shadow-md' : 'bg-slate-800 text-slate-300'}`}>S 브레이크</span>
            </div>

            {/* PRND Transmission Buttons */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <span className="text-[9px] text-slate-400 font-bold px-1">기어:</span>
              {(['P', 'R', 'N', 'D'] as const).map((g, idx) => (
                <button
                  key={g}
                  onClick={() => onGearChange(g)}
                  className={`px-2 py-0.5 rounded-lg font-mono font-black text-[11px] transition ${
                    carState.gear === g
                      ? g === 'P'
                        ? 'bg-rose-600 text-white shadow-lg scale-105'
                        : g === 'R'
                        ? 'bg-amber-500 text-slate-950 shadow-lg scale-105'
                        : g === 'D'
                        ? 'bg-emerald-500 text-slate-950 shadow-lg scale-105'
                        : 'bg-cyan-500 text-slate-950 scale-105'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                  title={`${g}단으로 변경 (단축키: ${g} 또는 ${idx + 1})`}
                >
                  {g} ({idx + 1})
                </button>
              ))}
            </div>

            {/* Turn Signals & Hazard */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <span className={`px-1.5 py-0.5 rounded-lg font-mono font-black text-[10px] transition ${carState.turnSignal === 'left' ? 'bg-amber-400 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300'}`}>A 좌깜빡이</span>
              <span className={`px-1.5 py-0.5 rounded-lg font-mono font-black text-[10px] transition ${carState.turnSignal === 'right' ? 'bg-amber-400 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300'}`}>F 우깜빡이</span>
              <span className={`px-1.5 py-0.5 rounded-lg font-mono font-black text-[10px] transition ${carState.turnSignal === 'hazard' ? 'bg-rose-500 text-white shadow-md' : 'bg-slate-800 text-slate-300'}`}>Space 비상등</span>
            </div>

            {/* Mirrors */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <span className={`px-1.5 py-0.5 rounded-lg font-mono font-black text-[10px] transition ${inputs.lookLeft ? 'bg-cyan-400 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300'}`}>Q 좌미러</span>
              <span className={`px-1.5 py-0.5 rounded-lg font-mono font-black text-[10px] transition ${inputs.lookRight ? 'bg-cyan-400 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300'}`}>E 우미러</span>
            </div>
          </div>
        </div>}

        {/* Center: Large Luxury Steering Wheel (Prominently Displayed & Controlled by Mouse) */}
        <LargeSteeringWheel
          steeringWheelDegrees={carState.steeringWheelDegrees}
          steeringWheelTurns={carState.steeringWheelTurns}
          steerAngle={carState.steerAngle}
          onMouseSteer={onMouseSteer}
        />

        {/* Right: Digital Speedometer Cluster & Helper Toggles */}
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          {/* Speedometer Cluster */}
          <div className="glass-panel-glow rounded-3xl px-5 py-3 flex items-center gap-4 shadow-2xl border border-cyan-500/40 backdrop-blur-2xl">
            <div
              className={`p-2 rounded-full transition-all duration-150 ${
                isLeftBlink ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/60 scale-110' : 'bg-slate-800/80 text-slate-600'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
            </div>

            <div className="text-center min-w-[80px]">
              <div className="text-3xl sm:text-4xl font-black tracking-tight text-white font-mono drop-shadow-md">
                {Math.abs(carState.speed)}
              </div>
              <div className="text-[9px] font-black tracking-widest text-cyan-400 uppercase mt-0.5">
                KM / H
              </div>
              <div className="w-full bg-slate-800/80 h-1.5 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-400 transition-all duration-150"
                  style={{ width: `${speedRatio * 100}%` }}
                />
              </div>
            </div>

            <div
              className={`p-2 rounded-full transition-all duration-150 ${
                isRightBlink ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/60 scale-110' : 'bg-slate-800/80 text-slate-600'
              }`}
            >
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Toggles */}
          {showGuidance && <div className="glass-panel p-2 rounded-2xl flex items-center gap-1.5 border border-slate-800 shadow-2xl backdrop-blur-xl">
            <button
              onClick={onTrajectoryToggle}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition ${
                showTrajectory
                  ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              궤적선 (T)
            </button>
            <button
              onClick={onWidthGuideToggle}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition ${
                showWidthGuide
                  ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              차폭 ({vehicle.width}m)
            </button>
          </div>}
        </div>
      </div>
    </div>
  );
};
