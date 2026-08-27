import { describe, expect, it } from 'vitest';
import { consumeGearCommand, type GearCommandState } from './GearInput';

describe('consumeGearCommand', () => {
  it('R 명령을 한 번만 소비해 이후 D 초기 상태를 되돌리지 않는다', () => {
    const commands: GearCommandState = {
      gearP: false,
      gearR: true,
      gearN: false,
      gearD: false,
    };

    expect(consumeGearCommand(commands, 'D')).toBe('R');
    expect(commands).toEqual({
      gearP: false,
      gearR: false,
      gearN: false,
      gearD: false,
    });
    expect(consumeGearCommand(commands, 'D')).toBe('D');
  });
});
