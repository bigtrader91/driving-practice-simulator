export type LightPhase = 'green' | 'yellow' | 'red';
export type LightAxis = 'NS' | 'EW';

interface LightStage {
  durationSec: number;
  NS: LightPhase;
  EW: LightPhase;
}

const LIGHT_STAGES: readonly LightStage[] = [
  { durationSec: 10, NS: 'green', EW: 'red' },
  { durationSec: 3, NS: 'yellow', EW: 'red' },
  { durationSec: 1, NS: 'red', EW: 'red' },
  { durationSec: 10, NS: 'red', EW: 'green' },
  { durationSec: 3, NS: 'red', EW: 'yellow' },
  { durationSec: 1, NS: 'red', EW: 'red' },
];

const CYCLE_SECONDS = LIGHT_STAGES.reduce((total, stage) => total + stage.durationSec, 0);

/**
 * N-S / E-W 신호 상태머신. 프레임 독립적이며 Three.js 의존이 없다.
 * 한 축이 녹색 또는 황색인 동안 다른 축은 적색이며, 축 전환 전 1초간
 * 전방향 적색 상태를 유지한다.
 */
export class TrafficLightController {
  private timer = 0;

  update(dt: number): void {
    if (dt <= 0) return;
    this.timer = (this.timer + dt) % CYCLE_SECONDS;
  }

  getPhase(axis: LightAxis): LightPhase {
    let stageEnd = 0;
    for (const stage of LIGHT_STAGES) {
      stageEnd += stage.durationSec;
      if (this.timer < stageEnd) return stage[axis];
    }

    throw new Error('Traffic light timer is outside the configured cycle');
  }
}
