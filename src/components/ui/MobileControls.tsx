import React from 'react';
import { ControlInputs, GearMode } from '../../types/simulator';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { setMobileControl } from '../../simulation/InputSafety';

interface MobileControlsProps {
  inputsRef: React.MutableRefObject<ControlInputs>;
  currentGear: GearMode;
  onGearChange: (gear: GearMode) => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  inputsRef,
  currentGear,
  onGearChange,
}) => {
  return (
    <div className="md:hidden absolute bottom-4 inset-x-4 flex justify-between items-end z-20 pointer-events-none">
      {/* Left / Right Steering Touch Buttons */}
      <div className="flex gap-2 pointer-events-auto">
        <button
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setMobileControl(inputsRef.current, 'steerLeft', true);
          }}
          onPointerUp={() => setMobileControl(inputsRef.current, 'steerLeft', false)}
          onPointerCancel={() => setMobileControl(inputsRef.current, 'steerLeft', false)}
          onLostPointerCapture={() => setMobileControl(inputsRef.current, 'steerLeft', false)}
          className="touch-none w-16 h-16 rounded-2xl bg-slate-900/80 border-2 border-slate-700 text-white flex items-center justify-center active:bg-cyan-500 active:text-slate-950 shadow-xl backdrop-blur-md"
        >
          <ArrowLeft className="w-8 h-8" />
        </button>
        <button
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setMobileControl(inputsRef.current, 'steerRight', true);
          }}
          onPointerUp={() => setMobileControl(inputsRef.current, 'steerRight', false)}
          onPointerCancel={() => setMobileControl(inputsRef.current, 'steerRight', false)}
          onLostPointerCapture={() => setMobileControl(inputsRef.current, 'steerRight', false)}
          className="touch-none w-16 h-16 rounded-2xl bg-slate-900/80 border-2 border-slate-700 text-white flex items-center justify-center active:bg-cyan-500 active:text-slate-950 shadow-xl backdrop-blur-md"
        >
          <ArrowRight className="w-8 h-8" />
        </button>
      </div>

      {/* Gas & Brake Pedals */}
      <div className="flex gap-2 pointer-events-auto">
        <button
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setMobileControl(inputsRef.current, 'backward', true);
          }}
          onPointerUp={() => setMobileControl(inputsRef.current, 'backward', false)}
          onPointerCancel={() => setMobileControl(inputsRef.current, 'backward', false)}
          onLostPointerCapture={() => setMobileControl(inputsRef.current, 'backward', false)}
          className="touch-none w-16 h-20 rounded-2xl bg-rose-950/80 border-2 border-rose-600 text-rose-300 font-black text-sm flex items-center justify-center active:bg-rose-600 active:text-white shadow-xl backdrop-blur-md"
        >
          브레이크
        </button>
        <button
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setMobileControl(inputsRef.current, 'forward', true);
          }}
          onPointerUp={() => setMobileControl(inputsRef.current, 'forward', false)}
          onPointerCancel={() => setMobileControl(inputsRef.current, 'forward', false)}
          onLostPointerCapture={() => setMobileControl(inputsRef.current, 'forward', false)}
          className="touch-none w-16 h-24 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500 text-emerald-300 font-black text-sm flex items-center justify-center active:bg-emerald-500 active:text-white shadow-xl backdrop-blur-md"
        >
          엑셀
        </button>
      </div>
    </div>
  );
};
