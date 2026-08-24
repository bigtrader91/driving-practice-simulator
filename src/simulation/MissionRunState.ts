import { ScoreDeduction } from '../types/simulator';

interface MissionResult {
  score: number;
  deductions: ScoreDeduction[];
}

interface MissionFailureResult extends MissionResult {
  reason: string;
}

export class MissionRunState {
  private finished = false;
  private currentScore = 100;
  private readonly appliedDeductions: ScoreDeduction[] = [];

  get isFinished(): boolean {
    return this.finished;
  }

  get score(): number {
    return this.currentScore;
  }

  get deductions(): readonly ScoreDeduction[] {
    return this.appliedDeductions;
  }

  applyPenalty(deduction: ScoreDeduction): boolean {
    if (this.finished) return false;
    this.appliedDeductions.push(deduction);
    this.currentScore = Math.max(0, this.currentScore - deduction.points);
    return true;
  }

  finishFailure(reason: string): MissionFailureResult | null {
    if (this.finished) return null;
    this.finished = true;
    return { reason, ...this.snapshot() };
  }

  finishSuccess(): MissionResult | null {
    if (this.finished) return null;
    this.finished = true;
    return this.snapshot();
  }

  private snapshot(): MissionResult {
    return {
      score: this.currentScore,
      deductions: [...this.appliedDeductions],
    };
  }
}
