import type {
  TrainingAttempt,
  TrainingAttemptResult,
  TrainingSession,
} from './TrainingSession';
import { hasCanonicalTrainingProgress } from './TrainingSession';

export const TRAINING_PERSISTENCE_KEY = 'driveprep.training-session.v1';
const TRAINING_PERSISTENCE_VERSION = 1 as const;
const MAX_PERSISTENCE_CHARACTERS = 64_000;
const MAX_FEEDBACK_ITEMS = 32;
const MAX_FAILURE_ITEMS = 16;
const MAX_MESSAGE_CHARACTERS = 500;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CompletedTrainingRecord {
  completedAt: string;
  session: TrainingSession;
}

export interface TrainingPersistenceSnapshot {
  version: typeof TRAINING_PERSISTENCE_VERSION;
  activeSession: TrainingSession | null;
  latestCompleted: CompletedTrainingRecord | null;
}

export interface TrainingPersistenceIssue {
  kind: 'invalid-data' | 'storage-unavailable' | 'write-failure';
  message: string;
}

export type TrainingPersistenceLoadResult =
  | { status: 'ready'; snapshot: TrainingPersistenceSnapshot }
  | { status: 'invalid'; snapshot: TrainingPersistenceSnapshot; issue: TrainingPersistenceIssue };

export type TrainingPersistenceWriteResult =
  | { ok: true }
  | { ok: false; issue: TrainingPersistenceIssue };

export function createEmptyTrainingPersistence(): TrainingPersistenceSnapshot {
  return {
    version: TRAINING_PERSISTENCE_VERSION,
    activeSession: null,
    latestCompleted: null,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTrainingAttempt = (value: unknown): value is TrainingAttempt => {
  if (!isObject(value)) return false;
  return typeof value.id === 'string'
    && ['adaptation', 'baseline', 'guided', 'post-assessment'].includes(String(value.phase))
    && ['free', 'left', 'right'].includes(String(value.direction))
    && typeof value.scored === 'boolean'
    && typeof value.guidance === 'boolean';
};

const isTrainingAttemptResult = (value: unknown): value is TrainingAttemptResult => {
  if (!isTrainingAttempt(value)) return false;
  const result = value as unknown as Record<string, unknown>;
  const scoreIsValid = result.score === null
    || (typeof result.score === 'number' && Number.isFinite(result.score) && result.score >= 0 && result.score <= 100);
  const passedIsValid = result.passed === null || typeof result.passed === 'boolean';
  const feedbackIsValid = Array.isArray(result.feedback)
    && result.feedback.length <= MAX_FEEDBACK_ITEMS
    && result.feedback.every((message) => typeof message === 'string'
      && message.length <= MAX_MESSAGE_CHARACTERS);
  const failuresAreValid = Array.isArray(result.majorFailures)
    && result.majorFailures.length <= MAX_FAILURE_ITEMS
    && result.majorFailures.every((failure) => isObject(failure)
      && ['collision', 'road-departure', 'critical-rear-ttc', 'rollover', 'spin'].includes(String(failure.type))
      && typeof failure.message === 'string'
      && failure.message.length <= MAX_MESSAGE_CHARACTERS);
  return scoreIsValid && passedIsValid && feedbackIsValid && failuresAreValid;
};

const isTrainingSession = (value: unknown): value is TrainingSession => {
  if (!isObject(value) || !['welcome', 'active', 'post-briefing', 'results'].includes(String(value.lifecycle))) {
    return false;
  }
  if (!Array.isArray(value.results) || value.results.length > 10 || !value.results.every(isTrainingAttemptResult)) {
    return false;
  }
  const currentAttemptIsValid = value.currentAttempt === null || isTrainingAttempt(value.currentAttempt);
  if (!currentAttemptIsValid) return false;
  const session = value as unknown as TrainingSession;
  return hasCanonicalTrainingProgress(session);
};

const isTrainingPersistenceSnapshot = (value: unknown): value is TrainingPersistenceSnapshot => {
  if (!isObject(value) || value.version !== TRAINING_PERSISTENCE_VERSION) return false;
  const activeSessionIsValid = value.activeSession === null
    || (isTrainingSession(value.activeSession)
      && ['active', 'post-briefing'].includes(value.activeSession.lifecycle));
  const latestCompletedIsValid = value.latestCompleted === null
    || (isObject(value.latestCompleted)
      && typeof value.latestCompleted.completedAt === 'string'
      && !Number.isNaN(Date.parse(value.latestCompleted.completedAt))
      && isTrainingSession(value.latestCompleted.session)
      && value.latestCompleted.session.lifecycle === 'results');
  return activeSessionIsValid && latestCompletedIsValid;
};

export function loadTrainingPersistence(storage: StorageLike): TrainingPersistenceLoadResult {
  const empty = createEmptyTrainingPersistence();
  let raw: string | null;
  try {
    raw = storage.getItem(TRAINING_PERSISTENCE_KEY);
  } catch {
    return {
      status: 'invalid',
      snapshot: empty,
      issue: {
        kind: 'storage-unavailable',
        message: '브라우저 저장소를 읽을 수 없어 훈련 진행 상황을 복원하지 못했습니다.',
      },
    };
  }
  if (raw === null) return { status: 'ready', snapshot: empty };
  if (raw.length > MAX_PERSISTENCE_CHARACTERS) {
    return {
      status: 'invalid',
      snapshot: empty,
      issue: {
        kind: 'invalid-data',
        message: '저장된 훈련 데이터가 허용된 크기를 초과했습니다.',
      },
    };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isTrainingPersistenceSnapshot(parsed)) {
      return {
        status: 'invalid',
        snapshot: empty,
        issue: {
          kind: 'invalid-data',
          message: '저장된 훈련 데이터가 손상됐거나 지원하지 않는 버전입니다.',
        },
      };
    }
    return { status: 'ready', snapshot: parsed };
  } catch {
    return {
      status: 'invalid',
      snapshot: empty,
      issue: {
        kind: 'invalid-data',
        message: '저장된 훈련 데이터를 읽지 못했습니다. 삭제 후 새로 시작할 수 있습니다.',
      },
    };
  }
}

export function saveTrainingPersistence(
  storage: StorageLike,
  snapshot: TrainingPersistenceSnapshot,
): TrainingPersistenceWriteResult {
  try {
    storage.setItem(TRAINING_PERSISTENCE_KEY, JSON.stringify(snapshot));
    return { ok: true };
  } catch {
    return {
      ok: false,
      issue: {
        kind: 'write-failure',
        message: '훈련 진행 상황을 브라우저에 저장하지 못했습니다.',
      },
    };
  }
}

export function clearTrainingPersistence(storage: StorageLike): TrainingPersistenceWriteResult {
  try {
    storage.removeItem(TRAINING_PERSISTENCE_KEY);
    return { ok: true };
  } catch {
    return {
      ok: false,
      issue: {
        kind: 'write-failure',
        message: '저장된 훈련 데이터를 삭제하지 못했습니다.',
      },
    };
  }
}

export function snapshotForTrainingSession(
  previous: TrainingPersistenceSnapshot,
  session: TrainingSession,
  completedAt: string,
): TrainingPersistenceSnapshot {
  if (session.lifecycle === 'results') {
    return {
      ...previous,
      activeSession: null,
      latestCompleted: { completedAt, session },
    };
  }
  if (session.lifecycle === 'welcome') {
    return { ...previous, activeSession: null };
  }
  return { ...previous, activeSession: session };
}
