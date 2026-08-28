interface InstructionalAudio {
  playWarning: () => void;
  speakInstructor: (message: string) => void;
}

interface AttemptResultAudio {
  playSuccess: () => void;
  playWarning: () => void;
}

export function playInstructionalWarning(
  guidanceEnabled: boolean,
  reason: string,
  audio: InstructionalAudio,
): void {
  if (!guidanceEnabled) return;
  audio.playWarning();
  audio.speakInstructor(`주의! ${reason}`);
}

export function playAttemptResultSound(
  resultFeedbackEnabled: boolean,
  result: 'success' | 'failure',
  audio: AttemptResultAudio,
): void {
  if (!resultFeedbackEnabled) return;
  if (result === 'success') audio.playSuccess();
  else audio.playWarning();
}
