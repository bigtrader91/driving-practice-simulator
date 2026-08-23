import { describe, it, expect } from 'vitest';
import { TrafficLightController } from './TrafficLightController';

describe('TrafficLightController', () => {
  it('시작 시 NS는 녹색, EW는 적색이다', () => {
    const c = new TrafficLightController();
    expect(c.getPhase('NS')).toBe('green');
    expect(c.getPhase('EW')).toBe('red');
  });

  it('NS는 green(10s) → yellow(3s) 순으로 전환된다', () => {
    const c = new TrafficLightController();
    c.update(9.9);
    expect(c.getPhase('NS')).toBe('green');
    c.update(0.2); // t=10.1
    expect(c.getPhase('NS')).toBe('yellow');
  });

  it('NS 적색 시작(t=13s)과 동시에 EW 녹색이 된다', () => {
    const c = new TrafficLightController();
    c.update(13);
    expect(c.getPhase('NS')).toBe('red');
    expect(c.getPhase('EW')).toBe('green');
  });

  it('EW는 녹색(r-y=5s) 후 황색 3s를 거친다', () => {
    const c = new TrafficLightController();
    c.update(13 + 4.9);
    expect(c.getPhase('EW')).toBe('green');
    c.update(0.2); // t=18.1 → EW local 5.1
    expect(c.getPhase('EW')).toBe('yellow');
    c.update(3.2); // t=21.3 → wrap, EW red
    expect(c.getPhase('EW')).toBe('red');
  });

  it('주기(21s)를 넘으면 다시 처음 위상부터 반복된다', () => {
    const c = new TrafficLightController();
    c.update(21.5);
    expect(c.getPhase('NS')).toBe('green');
    expect(c.getPhase('EW')).toBe('red');
  });
});
