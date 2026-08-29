import { describe, expect, it } from 'vitest';
import {
  beginPostAssessment,
  createTrainingSession,
  completeTrainingAttempt,
  startTrainingSession,
} from './TrainingSession';
import {
  clearTrainingPersistence,
  createEmptyTrainingPersistence,
  loadTrainingPersistence,
  saveTrainingPersistence,
  snapshotForTrainingSession,
  TRAINING_PERSISTENCE_KEY,
  type StorageLike,
} from './TrainingSessionPersistence';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('TrainingSessionPersistence', () => {
  it('마지막으로 확정된 시도 다음의 활성 세션을 그대로 복원한다', () => {
    const storage = new MemoryStorage();
    let session = startTrainingSession(createTrainingSession());
    session = completeTrainingAttempt(session, { score: 100, passed: true });
    const snapshot = snapshotForTrainingSession(
      createEmptyTrainingPersistence(),
      session,
      '2026-08-28T10:00:00.000Z',
    );

    expect(saveTrainingPersistence(storage, snapshot)).toEqual({ ok: true });
    expect(loadTrainingPersistence(storage)).toEqual({ status: 'ready', snapshot });
    expect(snapshot.activeSession?.currentAttempt?.id).toBe('baseline-left');
  });

  it('완료 세션은 활성 진행에서 제거하고 최근 완료 기록으로 승격한다', () => {
    let session = startTrainingSession(createTrainingSession());
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 80 + index, passed: true });
    }
    session = beginPostAssessment(session);
    for (let index = 0; index < 5; index += 1) {
      session = completeTrainingAttempt(session, { score: 85 + index, passed: index !== 2 });
    }

    const snapshot = snapshotForTrainingSession(
      createEmptyTrainingPersistence(),
      session,
      '2026-08-28T10:01:00.000Z',
    );
    expect(snapshot.activeSession).toBeNull();
    expect(snapshot.latestCompleted).toMatchObject({
      completedAt: '2026-08-28T10:01:00.000Z',
      session: { lifecycle: 'results' },
    });
  });

  it.each([
    ['손상된 JSON', '{not-json'],
    ['지원하지 않는 버전', JSON.stringify({ version: 2, activeSession: null, latestCompleted: null })],
    ['잘못된 세션 구조', JSON.stringify({ version: 1, activeSession: { lifecycle: 'active' }, latestCompleted: null })],
  ])('%s은 조용히 무시하지 않고 복구 필요 상태로 반환한다', (_label, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(TRAINING_PERSISTENCE_KEY, raw);

    const result = loadTrainingPersistence(storage);

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issue.kind).toBe('invalid-data');
      expect(result.issue.message).toContain('저장된 훈련 데이터');
    }
    expect(storage.getItem(TRAINING_PERSISTENCE_KEY)).toBe(raw);
  });

  it.each([
    ['임의 current attempt', (snapshot: ReturnType<typeof createEmptyTrainingPersistence>) => {
      if (!snapshot.activeSession?.currentAttempt) throw new Error('active fixture required');
      snapshot.activeSession.currentAttempt.id = 'bogus-attempt';
    }],
    ['순서와 다른 current attempt', (snapshot: ReturnType<typeof createEmptyTrainingPersistence>) => {
      if (!snapshot.activeSession?.currentAttempt) throw new Error('active fixture required');
      snapshot.activeSession.currentAttempt = {
        id: 'post-1',
        phase: 'post-assessment',
        direction: 'left',
        scored: true,
        guidance: false,
      };
    }],
    ['scored 규칙과 다른 적응 결과', (snapshot: ReturnType<typeof createEmptyTrainingPersistence>) => {
      if (!snapshot.activeSession) throw new Error('active fixture required');
      snapshot.activeSession.results[0].score = 100;
      snapshot.activeSession.results[0].passed = true;
    }],
    ['완료 결과가 없는 results lifecycle', (snapshot: ReturnType<typeof createEmptyTrainingPersistence>) => {
      snapshot.latestCompleted = {
        completedAt: '2026-08-28T10:01:00.000Z',
        session: { lifecycle: 'results', currentAttempt: null, results: [] },
      };
    }],
  ])('%s 상태는 의미상 손상된 데이터로 거부한다', (_label, mutate) => {
    const storage = new MemoryStorage();
    let session = startTrainingSession(createTrainingSession());
    session = completeTrainingAttempt(session, { score: 100, passed: true });
    const snapshot = structuredClone(snapshotForTrainingSession(
      createEmptyTrainingPersistence(),
      session,
      '2026-08-28T10:00:00.000Z',
    ));
    mutate(snapshot);
    storage.setItem(TRAINING_PERSISTENCE_KEY, JSON.stringify(snapshot));

    expect(loadTrainingPersistence(storage).status).toBe('invalid');
  });

  it('비정상적으로 큰 payload와 결과 배열은 복구 필요 상태로 거부한다', () => {
    const storage = new MemoryStorage();
    storage.setItem(TRAINING_PERSISTENCE_KEY, ' '.repeat(70_000));
    expect(loadTrainingPersistence(storage).status).toBe('invalid');

    let session = startTrainingSession(createTrainingSession());
    session = completeTrainingAttempt(session, { score: 100, passed: true });
    const snapshot = snapshotForTrainingSession(
      createEmptyTrainingPersistence(),
      session,
      '2026-08-28T10:00:00.000Z',
    );
    if (!snapshot.activeSession) throw new Error('active fixture required');
    snapshot.activeSession.results[0].feedback = Array.from({ length: 33 }, () => '반복 피드백');
    storage.setItem(TRAINING_PERSISTENCE_KEY, JSON.stringify(snapshot));
    expect(loadTrainingPersistence(storage).status).toBe('invalid');
  });

  it('브라우저 저장 실패를 호출자에게 명시적으로 반환한다', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
    };

    expect(saveTrainingPersistence(storage, createEmptyTrainingPersistence())).toEqual({
      ok: false,
      issue: {
        kind: 'write-failure',
        message: '훈련 진행 상황을 브라우저에 저장하지 못했습니다.',
      },
    });
  });

  it('브라우저 저장소 읽기 차단은 손상 데이터가 아니라 사용 불가로 분류한다', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    const result = loadTrainingPersistence(storage);

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.issue.kind).toBe('storage-unavailable');
    }
  });

  it('사용자가 복구를 선택하면 손상된 저장 데이터를 삭제한다', () => {
    const storage = new MemoryStorage();
    storage.setItem(TRAINING_PERSISTENCE_KEY, '{not-json');

    expect(clearTrainingPersistence(storage)).toEqual({ ok: true });
    expect(storage.getItem(TRAINING_PERSISTENCE_KEY)).toBeNull();
  });

  it('저장 데이터 삭제 실패도 조용히 무시하지 않는다', () => {
    const storage: StorageLike = {
      getItem: () => '{not-json',
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('blocked');
      },
    };

    expect(clearTrainingPersistence(storage)).toEqual({
      ok: false,
      issue: {
        kind: 'write-failure',
        message: '저장된 훈련 데이터를 삭제하지 못했습니다.',
      },
    });
  });
});
