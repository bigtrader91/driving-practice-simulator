import type { ControlInputs, GearMode } from '../types/simulator';

export type GearCommandState = Pick<ControlInputs, 'gearP' | 'gearR' | 'gearN' | 'gearD'>;

export const consumeGearCommand = (
  commands: GearCommandState,
  currentGear: GearMode
): GearMode => {
  let nextGear = currentGear;
  if (commands.gearP) nextGear = 'P';
  else if (commands.gearR) nextGear = 'R';
  else if (commands.gearN) nextGear = 'N';
  else if (commands.gearD) nextGear = 'D';

  commands.gearP = false;
  commands.gearR = false;
  commands.gearN = false;
  commands.gearD = false;

  return nextGear;
};
