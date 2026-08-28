export type ProcedureOmissionCode = 'signal' | 'mirror' | 'blind-spot' | 'speed';

export type AttemptEvent =
  | { type: 'collision' }
  | { type: 'road-departure' }
  | { type: 'rear-ttc-entry'; seconds: number }
  | { type: 'rollover' }
  | { type: 'spin'; degrees: number }
  | { type: 'procedure-omission'; code: ProcedureOmissionCode; message: string };

export type MajorFailureType =
  | 'collision'
  | 'road-departure'
  | 'critical-rear-ttc'
  | 'rollover'
  | 'spin';

export interface MajorFailure {
  type: MajorFailureType;
  message: string;
}

export interface AttemptAssessment {
  majorFailures: MajorFailure[];
  procedureOmissions: ProcedureOmissionCode[];
  feedback: string[];
}

export function recordAttemptEvent(events: AttemptEvent[], event: AttemptEvent): void {
  const isDuplicate = events.some((recorded) => {
    if (event.type === 'collision') return recorded.type === 'collision';
    if (event.type === 'procedure-omission' && recorded.type === 'procedure-omission') {
      return recorded.code === event.code;
    }
    return false;
  });

  if (!isDuplicate) events.push(event);
}

export function assessAttemptEvents(events: AttemptEvent[]): AttemptAssessment {
  const assessment: AttemptAssessment = {
    majorFailures: [],
    procedureOmissions: [],
    feedback: [],
  };

  for (const event of events) {
    if (event.type === 'collision') {
      assessment.majorFailures.push({ type: 'collision', message: '충돌이 발생했습니다.' });
    } else if (event.type === 'road-departure') {
      assessment.majorFailures.push({
        type: 'road-departure',
        message: '도로를 이탈했습니다.',
      });
    } else if (event.type === 'rear-ttc-entry' && event.seconds < 1.5) {
      assessment.majorFailures.push({
        type: 'critical-rear-ttc',
        message: '후방 TTC 1.5초 미만으로 진입했습니다.',
      });
    } else if (event.type === 'rollover') {
      assessment.majorFailures.push({ type: 'rollover', message: '차량이 전복됐습니다.' });
    } else if (event.type === 'spin' && Math.abs(event.degrees) >= 90) {
      assessment.majorFailures.push({
        type: 'spin',
        message: '차량이 90도 이상 회전했습니다.',
      });
    } else if (event.type === 'procedure-omission') {
      assessment.procedureOmissions.push(event.code);
      assessment.feedback.push(event.message);
    }
  }

  return assessment;
}

export function assessMissionResult(
  events: AttemptEvent[],
  additionalFeedback: string[] = [],
): AttemptAssessment {
  const assessment = assessAttemptEvents(events);
  return {
    ...assessment,
    feedback: [...assessment.feedback, ...additionalFeedback],
  };
}

export function isAttemptPassed(
  missionPassed: boolean,
  assessment: AttemptAssessment,
): boolean {
  return missionPassed &&
    assessment.majorFailures.length === 0 &&
    assessment.procedureOmissions.length === 0;
}
