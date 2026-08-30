import { Mission } from '../types/simulator';
import { TrainingDirection } from './TrainingSession';

export function missionForTrainingAttempt(
  baseMission: Mission,
  direction: TrainingDirection,
  visualVariant = 0,
): Mission {
  const variantMission = { ...baseMission, visualVariant };
  if (direction === 'free') return variantMission;
  if (!baseMission.targetArea) {
    throw new Error('차선 변경 훈련에는 목표 차로가 필요합니다.');
  }

  const isLeft = direction === 'left';
  const startLaneX = isLeft ? 6 : 2;
  const targetLaneX = isLeft ? 2 : 6;

  return {
    ...variantMission,
    startPos: [startLaneX, baseMission.startPos[1], baseMission.startPos[2]],
    targetArea: {
      ...baseMission.targetArea,
      x: targetLaneX,
    },
  };
}
