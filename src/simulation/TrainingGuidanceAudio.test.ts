import { describe, expect, it } from 'vitest';
import { playAttemptResultSound, playInstructionalWarning } from './TrainingGuidanceAudio';

describe('playInstructionalWarning', () => {
  it('무안내 평가에서는 감점 경고음과 강사 음성을 재생하지 않는다', () => {
    const played: string[] = [];

    playInstructionalWarning(false, '방향지시등 누락', {
      playWarning: () => played.push('warning'),
      speakInstructor: (message) => played.push(message),
    });

    expect(played).toEqual([]);
  });

  it('안내 훈련에서는 감점 경고음과 이유를 함께 제공한다', () => {
    const played: string[] = [];

    playInstructionalWarning(true, '방향지시등 누락', {
      playWarning: () => played.push('warning'),
      speakInstructor: (message) => played.push(message),
    });

    expect(played).toEqual(['warning', '주의! 방향지시등 누락']);
  });
});

describe('playAttemptResultSound', () => {
  it('결과 비공개 시도에서는 성공음과 실패음을 모두 재생하지 않는다', () => {
    const played: string[] = [];
    const audio = {
      playSuccess: () => played.push('success'),
      playWarning: () => played.push('failure'),
    };

    playAttemptResultSound(false, 'success', audio);
    playAttemptResultSound(false, 'failure', audio);

    expect(played).toEqual([]);
  });

  it('결과 공개 시점에는 결과에 맞는 소리만 재생한다', () => {
    const played: string[] = [];
    const audio = {
      playSuccess: () => played.push('success'),
      playWarning: () => played.push('failure'),
    };

    playAttemptResultSound(true, 'success', audio);
    playAttemptResultSound(true, 'failure', audio);

    expect(played).toEqual(['success', 'failure']);
  });
});
