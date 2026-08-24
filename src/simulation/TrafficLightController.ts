export type LightPhase = 'green' | 'yellow' | 'red';
export type LightAxis = 'NS' | 'EW';

/**
 * N-S / E-W 신호 상태머신. 프레임 독립적이며 Three.js 의존이 없다.
 * 타임라인(한 axis 기준): green(greenSec) → yellow(yellowSec) → red(redSec)
 * EW는 NS보다 (greenSec+yellowSec) 뒤에 같은 시퀀스로 진행된다.
 */
export class TrafficLightController {
  private timer = 0;

  constructor(
    private readonly greenSec = 10,
    private readonly yellowSec = 3,
    private readonly redSec = 8,
  ) {}

  update(dt: number): void {
    if (dt <= 0) return;
    const cycle = this.greenSec + this.yellowSec + this.redSec;
    this.timer = (this.timer + dt) % cycle;
  }

  getPhase(axis: LightAxis): LightPhase {
    const { greenSec: g, yellowSec: y, redSec: r } = this;
    const cycle = g + y + r;
    if (axis === 'NS') {
      if (this.timer < g) return 'green';
      if (this.timer < g + y) return 'yellow';
      return 'red';
    }
    const ewGreen = r - y;
    const t = (this.timer - (g + y) + cycle) % cycle;
    if (t < ewGreen) return 'green';
    if (t < ewGreen + y) return 'yellow';
    return 'red';
  }
}
