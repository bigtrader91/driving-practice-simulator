import React from 'react';
import { CarState, VehicleConfig } from '../../types/simulator';

interface RealisticCockpitFrameProps {
  vehicle: VehicleConfig;
  carState: CarState;
  isVisible: boolean;
}

export const RealisticCockpitFrame: React.FC<RealisticCockpitFrameProps> = () => {
  // Completely empty and transparent so no dark overlay or box blocks the screen view
  return null;
};
