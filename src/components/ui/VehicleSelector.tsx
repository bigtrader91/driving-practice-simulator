import React from 'react';
import { VehicleConfig, VehicleType } from '../../types/simulator';
import { VEHICLES } from '../../constants/vehicles';
import { Car, Check, X } from 'lucide-react';

interface VehicleSelectorProps {
  currentVehicleId: VehicleType;
  onSelectVehicle: (vehicle: VehicleConfig) => void;
  onClose: () => void;
}

export const VehicleSelector: React.FC<VehicleSelectorProps> = ({
  currentVehicleId,
  onSelectVehicle,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel-glow w-full max-w-2xl rounded-3xl p-6 border border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Car className="w-6 h-6 text-cyan-400" />
              차종 선택 및 제원 비교
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              차량 크기(차폭/전장)에 따라 시야각과 회전 궤적이 달라집니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Vehicle Cards */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {Object.values(VEHICLES).map((veh) => {
            const isSelected = veh.id === currentVehicleId;
            return (
              <div
                key={veh.id}
                onClick={() => {
                  onSelectVehicle(veh);
                  onClose();
                }}
                className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-950/30 ring-2 ring-cyan-500/40'
                    : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: veh.color }} />
                    <h3 className="text-base font-bold text-white">{veh.name}</h3>
                    <span className="text-xs font-semibold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-500/20">
                      {veh.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{veh.description}</p>
                  
                  {/* Specs Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400">전폭 (차폭)</div>
                      <div className="text-xs font-bold text-slate-200">{veh.width} m</div>
                    </div>
                    <div className="bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400">전장 (길이)</div>
                      <div className="text-xs font-bold text-slate-200">{veh.length} m</div>
                    </div>
                    <div className="bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-400">최소 회전반경</div>
                      <div className="text-xs font-bold text-cyan-400">{veh.turningRadius} m</div>
                    </div>
                  </div>
                </div>

                <div className="self-end sm:self-center">
                  <button
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>선택됨</span>
                      </>
                    ) : (
                      <span>이 차량으로 연습</span>
                    )}
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
