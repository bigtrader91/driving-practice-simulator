import { describe, expect, it } from 'vitest';
import { getGuideVisibility } from './GuideVisibility';

describe('getGuideVisibility', () => {
  it('일반 임무의 D에서는 후진용 가이드를 모두 숨긴다', () => {
    expect(getGuideVisibility('highway_5lane', 'D', true, true)).toEqual({
      trajectory: false,
      width: false,
    });
  });

  it('차폭 연습 임무의 D에서는 두 토글을 독립적으로 따른다', () => {
    expect(getGuideVisibility('width_slalom', 'D', true, false)).toEqual({
      trajectory: true,
      width: false,
    });
  });

  it('R에서는 두 후진 가이드 토글을 독립적으로 따른다', () => {
    expect(getGuideVisibility('parking_reverse', 'R', false, true)).toEqual({
      trajectory: false,
      width: true,
    });
  });
});
