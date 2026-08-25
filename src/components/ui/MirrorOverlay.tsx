import React from 'react';
import { CameraViewMode, GearMode } from '../../types/simulator';

interface MirrorOverlayProps {
  cameraMode: CameraViewMode;
  gear: GearMode;
  leftMirrorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  rightMirrorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  rearMirrorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  backupCameraCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isLeftLooked: boolean;
  isRightLooked: boolean;
}

export const MirrorOverlay: React.FC<MirrorOverlayProps> = ({
  cameraMode,
  gear,
  leftMirrorCanvasRef,
  rightMirrorCanvasRef,
  rearMirrorCanvasRef,
  backupCameraCanvasRef,
  isLeftLooked,
  isRightLooked,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 select-none overflow-hidden">
      {/* 1. Center Rearview Mirror (Top Center - Completely Isolated from Other UI) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="relative border-4 border-slate-800 bg-slate-950 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20">
          <canvas
            ref={rearMirrorCanvasRef}
            width={240}
            height={75}
            className="w-44 sm:w-56 h-14 sm:h-18 object-cover"
          />
          <div className="absolute top-1 left-2 text-[9px] font-black text-slate-300 bg-black/70 px-1.5 py-0.5 rounded backdrop-blur-sm">
            룸미러 (Rear)
          </div>
        </div>
      </div>

      {/* 2. Left Side Mirror (Top Left - High Visibility, No Overlaps) */}
      <div
        className={`absolute top-3 left-3 transition-all duration-300 pointer-events-none ${
          isLeftLooked ? 'scale-110 ring-4 ring-cyan-400' : 'opacity-95'
        }`}
      >
        <div className="relative border-4 border-slate-800 bg-slate-950 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20">
          <canvas
            ref={leftMirrorCanvasRef}
            width={180}
            height={110}
            className="w-36 sm:w-44 h-22 sm:h-28 object-cover"
          />
          {/* Mirror Header Badge */}
          <div className="absolute top-1.5 left-2 flex items-center gap-1 bg-black/75 px-2 py-0.5 rounded text-[10px] font-black text-cyan-300 backdrop-blur-sm">
            <span>좌측 미러</span>
            {isLeftLooked && <span className="text-emerald-400 font-bold">● 숄더체크중</span>}
          </div>
          {/* Blind Spot BSD Warning Indicator Light (Amber triangle) */}
          <div className="absolute top-1.5 right-2 w-3 h-3 rounded-full bg-amber-500/80 animate-pulse border border-amber-300" title="사각지대 감지" />
          <div className="absolute bottom-1 right-2 text-[8px] text-slate-400 bg-black/60 px-1 rounded">
            사물의 실제 거리보다 가까이 있음
          </div>
        </div>
      </div>

      {/* 3. Right Side Mirror (Top Right - High Visibility, No Overlaps) */}
      <div
        className={`absolute top-3 right-3 transition-all duration-300 pointer-events-none ${
          isRightLooked ? 'scale-110 ring-4 ring-cyan-400' : 'opacity-95'
        }`}
      >
        <div className="relative border-4 border-slate-800 bg-slate-950 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20">
          <canvas
            ref={rightMirrorCanvasRef}
            width={180}
            height={110}
            className="w-36 sm:w-44 h-22 sm:h-28 object-cover"
          />
          {/* Mirror Header Badge */}
          <div className="absolute top-1.5 right-2 flex items-center gap-1 bg-black/75 px-2 py-0.5 rounded text-[10px] font-black text-cyan-300 backdrop-blur-sm">
            {isRightLooked && <span className="text-emerald-400 font-bold">● 숄더체크중</span>}
            <span>우측 미러</span>
          </div>
          {/* Blind Spot BSD Warning Indicator Light */}
          <div className="absolute top-1.5 left-2 w-3 h-3 rounded-full bg-amber-500/80 animate-pulse border border-amber-300" title="사각지대 감지" />
          <div className="absolute bottom-1 left-2 text-[8px] text-slate-400 bg-black/60 px-1 rounded">
            사물의 실제 거리보다 가까이 있음
          </div>
        </div>
      </div>

      {/* 4. Backup Camera Screen (Active when Gear is 'R', Positioned Cleanly at Bottom Right above controls) */}
      <div
        className={`absolute bottom-28 right-4 pointer-events-none ${
          gear === 'R' ? 'animate-in fade-in zoom-in-95 duration-200' : 'hidden'
        }`}
      >
        <div className="relative border-4 border-emerald-500/80 bg-slate-950 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-emerald-400/50">
          <canvas
            ref={backupCameraCanvasRef}
            width={260}
            height={160}
            className="w-52 sm:w-64 h-32 sm:h-40 object-cover"
          />
          {/* Dynamic Parking Trajectory Guidelines */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-end items-center pb-2">
            <div className="w-4/5 h-24 border-x-2 border-dashed border-yellow-400/90 flex flex-col justify-between items-center relative">
              <div className="w-full h-0.5 bg-green-400 opacity-80" />
              <div className="w-full h-0.5 bg-yellow-400 opacity-95" />
              <div className="w-full h-1.5 bg-red-500 shadow-lg" />
            </div>
          </div>
          <div className="absolute top-1.5 left-2 bg-red-600/90 text-white font-black text-[10px] px-2 py-0.5 rounded tracking-wide animate-pulse">
            ● R 후방 카메라 & 가이드선
          </div>
          <div className="absolute bottom-1 left-2 text-[9px] text-yellow-300 bg-black/75 px-1.5 py-0.5 rounded font-bold">
            🔴 50cm / 🟡 1m / 🟢 2m
          </div>
        </div>
      </div>
    </div>
  );
};
