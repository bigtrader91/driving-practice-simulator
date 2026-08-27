import type { GearMode } from '../types/simulator';

export interface GuideVisibility {
  trajectory: boolean;
  width: boolean;
}

export const getGuideVisibility = (
  missionId: string,
  gear: GearMode,
  showTrajectory: boolean,
  showWidthGuide: boolean
): GuideVisibility => {
  const isReverseGuide = gear === 'R';
  const isForwardTrainingGuide = gear === 'D' && missionId === 'width_slalom';
  const isGuideAllowed = isReverseGuide || isForwardTrainingGuide;

  return {
    trajectory: isGuideAllowed && showTrajectory,
    width: isGuideAllowed && showWidthGuide,
  };
};
