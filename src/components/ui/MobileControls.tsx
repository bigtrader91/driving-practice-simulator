import React from 'react';
import { ControlInputs, GearMode, TurnSignal } from '../../types/simulator';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { setMobileControl } from '../../simulation/InputSafety';

type HeldMobileControl = Parameters<typeof setMobileControl>[1];

interface MobileControlsProps {
  inputsRef: React.MutableRefObject<ControlInputs>;
  currentGear: GearMode;
  currentTurnSignal: TurnSignal;
  onGearChange: (gear: GearMode) => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  inputsRef,
  currentGear,
  currentTurnSignal,
  onGearChange,
}) => {
  const holdControl = (control: HeldMobileControl) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setMobileControl(inputsRef.current, control, true);
    },
    onPointerUp: () => setMobileControl(inputsRef.current, control, false),
    onPointerCancel: () => setMobileControl(inputsRef.current, control, false),
    onLostPointerCapture: () => setMobileControl(inputsRef.current, control, false),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      setMobileControl(inputsRef.current, control, true);
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      setMobileControl(inputsRef.current, control, false);
    },
    onBlur: () => setMobileControl(inputsRef.current, control, false),
  });

  return (
    <div
      className="lg:hidden absolute bottom-2 inset-x-2 z-30 pointer-events-none"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <div className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-1.5 pointer-events-auto sm:-translate-x-10">
        <div className="flex gap-1 rounded-xl border border-slate-700 bg-slate-950/85 p-1 shadow-xl backdrop-blur-md">
          {(['P', 'R', 'N', 'D'] as const).map((gear) => (
            <button
              key={gear}
              type="button"
              aria-label={`${gear} 기어`}
              aria-pressed={currentGear === gear}
              onClick={() => onGearChange(gear)}
              className={`h-8 w-9 rounded-lg font-mono text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                currentGear === gear
                  ? 'bg-cyan-400 text-slate-950'
                  : 'bg-slate-800 text-slate-300 active:bg-slate-600'
              }`}
            >
              {gear}
            </button>
          ))}
        </div>

        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/85 p-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            aria-label="좌측 방향지시등"
            aria-pressed={currentTurnSignal === 'left'}
            onClick={() => {
              inputsRef.current.signalLeft = true;
            }}
            className={`h-9 min-w-11 rounded-lg px-2 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
              currentTurnSignal === 'left'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-amber-950/90 text-amber-300 active:bg-amber-400 active:text-slate-950'
            }`}
          >
            좌깜빡이
          </button>
          <button
            type="button"
            aria-label="비상등"
            aria-pressed={currentTurnSignal === 'hazard'}
            onClick={() => {
              inputsRef.current.hazard = true;
            }}
            className={`h-9 min-w-11 rounded-lg px-2 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 ${
              currentTurnSignal === 'hazard'
                ? 'bg-rose-500 text-white'
                : 'bg-rose-950/90 text-rose-300 active:bg-rose-500 active:text-white'
            }`}
          >
            비상
          </button>
          <button
            type="button"
            aria-label="우측 방향지시등"
            aria-pressed={currentTurnSignal === 'right'}
            onClick={() => {
              inputsRef.current.signalRight = true;
            }}
            className={`h-9 min-w-11 rounded-lg px-2 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
              currentTurnSignal === 'right'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-amber-950/90 text-amber-300 active:bg-amber-400 active:text-slate-950'
            }`}
          >
            우깜빡이
          </button>
          <button
            type="button"
            aria-label="좌측 미러 확인"
            {...holdControl('lookLeft')}
            className="touch-none h-9 min-w-11 rounded-lg bg-sky-950/90 px-2 text-xs font-black text-sky-300 active:bg-sky-400 active:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
          >
            좌미러
          </button>
          <button
            type="button"
            aria-label="룸미러 확인"
            {...holdControl('lookRear')}
            className="touch-none h-9 min-w-11 rounded-lg bg-sky-950/90 px-2 text-xs font-black text-sky-300 active:bg-sky-400 active:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
          >
            룸미러
          </button>
          <button
            type="button"
            aria-label="우측 미러 확인"
            {...holdControl('lookRight')}
            className="touch-none h-9 min-w-11 rounded-lg bg-sky-950/90 px-2 text-xs font-black text-sky-300 active:bg-sky-400 active:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
          >
            우미러
          </button>
        </div>
      </div>

      <div className="flex justify-between items-end">
        {/* Left / Right Steering Touch Buttons */}
        <div className="flex gap-2 pointer-events-auto">
          <button
            type="button"
            aria-label="왼쪽 조향"
            {...holdControl('steerLeft')}
            className="touch-none w-14 h-14 rounded-2xl bg-slate-900/80 border-2 border-slate-700 text-white flex items-center justify-center active:bg-cyan-500 active:text-slate-950 shadow-xl backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <ArrowLeft className="w-7 h-7" />
          </button>
          <button
            type="button"
            aria-label="오른쪽 조향"
            {...holdControl('steerRight')}
            className="touch-none w-14 h-14 rounded-2xl bg-slate-900/80 border-2 border-slate-700 text-white flex items-center justify-center active:bg-cyan-500 active:text-slate-950 shadow-xl backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <ArrowRight className="w-7 h-7" />
          </button>
        </div>

        {/* Gas & Brake Pedals */}
        <div className="flex gap-2 pointer-events-auto">
          <button
            type="button"
            aria-label="브레이크"
            {...holdControl('backward')}
            className="touch-none w-14 h-16 rounded-2xl bg-rose-950/80 border-2 border-rose-600 text-rose-300 font-black text-xs flex items-center justify-center active:bg-rose-600 active:text-white shadow-xl backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            브레이크
          </button>
          <button
            type="button"
            aria-label="엑셀"
            {...holdControl('forward')}
            className="touch-none w-14 h-20 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500 text-emerald-300 font-black text-xs flex items-center justify-center active:bg-emerald-500 active:text-white shadow-xl backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            엑셀
          </button>
        </div>
      </div>
    </div>
  );
};
