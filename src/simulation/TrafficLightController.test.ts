import { describe, it, expect } from 'vitest';
import { TrafficLightController } from './TrafficLightController';

describe('TrafficLightController', () => {
  it('시작 시 NS는 녹색, EW는 적색이다', () => {
    const c = new TrafficLightController();
    expect(c.getPhase('NS')).toBe('green');
    expect(c.getPhase('EW')).toBe('red');
  });

  it.each([
    [9.999, 'green', 'red'],
    [10, 'yellow', 'red'],
    [12.999, 'yellow', 'red'],
    [13, 'red', 'red'],
    [13.999, 'red', 'red'],
    [14, 'red', 'green'],
    [23.999, 'red', 'green'],
    [24, 'red', 'yellow'],
    [26.999, 'red', 'yellow'],
    [27, 'red', 'red'],
    [27.999, 'red', 'red'],
    [28, 'green', 'red'],
  ] as const)('t=%ss에서 승인된 28초 위상표를 따른다', (time, ns, ew) => {
    const c = new TrafficLightController();
    c.update(time);

    expect(c.getPhase('NS')).toBe(ns);
    expect(c.getPhase('EW')).toBe(ew);
  });

  it('여러 주기를 한 번에 진행해도 28초 주기의 같은 위상을 유지한다', () => {
    const c = new TrafficLightController();
    c.update(28 * 3 + 27.5);

    expect(c.getPhase('NS')).toBe('red');
    expect(c.getPhase('EW')).toBe('red');
  });

  it('프레임별 dt를 누적해 단계 경계와 주기 경계를 순서대로 통과한다', () => {
    const c = new TrafficLightController();

    c.update(9);
    expect(c.getPhase('NS')).toBe('green');
    c.update(1);
    expect(c.getPhase('NS')).toBe('yellow');
    c.update(3);
    expect(c.getPhase('NS')).toBe('red');
    expect(c.getPhase('EW')).toBe('red');
    c.update(1);
    expect(c.getPhase('EW')).toBe('green');
    c.update(13);
    expect(c.getPhase('NS')).toBe('red');
    expect(c.getPhase('EW')).toBe('red');
    c.update(1);
    expect(c.getPhase('NS')).toBe('green');
    expect(c.getPhase('EW')).toBe('red');
  });
});
