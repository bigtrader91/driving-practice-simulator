import React, { useRef } from 'react';
import { RotateCw } from 'lucide-react';

interface LargeSteeringWheelProps {
  steeringWheelDegrees: number;
  steeringWheelTurns: number;
  steerAngle: number;
  onMouseSteer: (ratio: number) => void;
}

export const LargeSteeringWheel: React.FC<LargeSteeringWheelProps> = ({
  steeringWheelDegrees,
  steeringWheelTurns,
  steerAngle,
  onMouseSteer,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startRatioRef = useRef(0);

  const steerDeg = steeringWheelDegrees || 0;
  const absDeg = Math.abs(steerDeg);
  const tireDeg = Math.round(Math.abs(((steerAngle || 0) * 180) / Math.PI));

  let statusText = '핸들 정렬 (0°)';
  let badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

  if (absDeg > 500) {
    statusText = `${steerDeg > 0 ? '우측' : '좌측'} 끝까지 감김 (1.5바퀴 / ${absDeg}°)`;
    badgeColor = 'bg-rose-500/25 text-rose-300 border-rose-500/50';
  } else if (absDeg > 330) {
    statusText = `${steerDeg > 0 ? '우측' : '좌측'} 1바퀴 감김 (${absDeg}°)`;
    badgeColor = 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50';
  } else if (absDeg > 150) {
    statusText = `${steerDeg > 0 ? '우측' : '좌측'} 반바퀴 감김 (${absDeg}°)`;
    badgeColor = 'bg-amber-500/25 text-amber-300 border-amber-500/50';
  } else if (absDeg > 15) {
    statusText = `${steerDeg > 0 ? '우측' : '좌측'} ${absDeg}° 조향 중`;
    badgeColor = 'bg-sky-500/25 text-sky-300 border-sky-500/50';
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startRatioRef.current = steerDeg / 540;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - startXRef.current;
    // 250px drag = 1.0 ratio (540 degrees)
    const newRatio = Math.max(-1.0, Math.min(1.0, startRatioRef.current + deltaX / 250));
    onMouseSteer(newRatio);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div className="flex flex-col items-center select-none pointer-events-auto">
      {/* Real-time Turn Count & Degree Badge */}
      <div className={`mb-1.5 px-3.5 py-1 rounded-full text-xs font-black border backdrop-blur-xl shadow-2xl flex items-center gap-1.5 transition-all ${badgeColor}`}>
        <RotateCw className="w-3.5 h-3.5" />
        <span>{statusText}</span>
        <span className="text-[10px] opacity-75 font-mono ml-1">(앞바퀴: {tireDeg}°)</span>
      </div>

      {/* Large Realistic Luxury Steering Wheel (200px diameter, rotates up to 540 degrees) */}
      <div
        ref={wheelRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-44 h-44 sm:w-52 sm:h-52 rounded-full relative cursor-grab active:cursor-grabbing shadow-2xl flex items-center justify-center transition-transform duration-75"
        style={{
          transform: `rotate(${steerDeg}deg)`,
          background: 'radial-gradient(circle, #1e293b 0%, #0f172a 70%, #020617 100%)',
          boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(0,0,0,0.9), 0 0 0 6px #1e293b, 0 0 0 10px #0f172a',
        }}
        title="핸들을 좌우로 드래그하여 조작하세요 (최대 1.5바퀴 / 540도)"
      >
        {/* 12 O'Clock Center Alignment Marker (Red/Yellow Sports Band) */}
        <div className="absolute top-0 w-4 h-6 bg-gradient-to-b from-amber-400 to-rose-500 rounded-sm shadow-md ring-1 ring-white/50" />

        {/* Outer Wheel Grip Texture Grooves */}
        <div className="absolute inset-2 rounded-full border-4 border-dashed border-slate-700/60 pointer-events-none" />

        {/* Horizontal Left & Right Spokes */}
        <div className="absolute w-full h-7 bg-gradient-to-r from-slate-700 via-slate-800 to-slate-700 rounded-md shadow-inner flex items-center justify-between px-3">
          <div className="w-6 h-2.5 rounded bg-slate-900/80 border border-slate-600" />
          <div className="w-6 h-2.5 rounded bg-slate-900/80 border border-slate-600" />
        </div>

        {/* Vertical Bottom Spoke */}
        <div className="absolute bottom-0 w-7 h-20 bg-gradient-to-b from-slate-800 to-slate-700 rounded-md shadow-inner" />

        {/* Center Horn Hub */}
        <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-slate-900 border-4 border-slate-600 shadow-2xl flex flex-col items-center justify-center relative z-10">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-500 flex items-center justify-center shadow-inner">
            <span className="font-black text-cyan-400 text-xs sm:text-sm tracking-widest font-mono">DRIVE</span>
          </div>
          <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">AIRBAG</span>
        </div>

        {/* 9 & 3 O'Clock Ergonomic Thumb Grips */}
        <div className="absolute left-0 w-3.5 h-10 bg-slate-900/90 rounded-r-md" />
        <div className="absolute right-0 w-3.5 h-10 bg-slate-900/90 rounded-l-md" />
      </div>

      {/* Mouse Steering Prompt Under Wheel */}
      <div className="text-[10px] text-slate-400 font-bold mt-1 bg-slate-950/80 px-2.5 py-0.5 rounded-full border border-slate-800">
        🖱️ 핸들 좌우 드래그: 1.5바퀴(540°) 회전
      </div>
    </div>
  );
};
