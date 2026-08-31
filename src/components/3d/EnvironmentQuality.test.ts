import { describe, expect, it } from 'vitest';
import { chooseEnvironmentQuality } from './EnvironmentQuality';

describe('chooseEnvironmentQuality', () => {
  it('uses desktop high for a wide non-coarse viewport', () => {
    expect(chooseEnvironmentQuality({
      width: 1440,
      height: 900,
      devicePixelRatio: 2,
      coarsePointer: false,
    })).toEqual({
      name: 'high',
      pixelRatioCap: 1.25,
      shadowMapSize: 1024,
      sceneryDensity: 0.8,
    });
  });

  it.each([
    { width: 844, height: 390, devicePixelRatio: 2, coarsePointer: true },
    { width: 1023, height: 768, devicePixelRatio: 1, coarsePointer: false },
  ])('uses mobile balanced for $width x $height', (input) => {
    expect(chooseEnvironmentQuality(input)).toEqual({
      name: 'balanced',
      pixelRatioCap: 1,
      shadowMapSize: 512,
      sceneryDensity: 0.45,
    });
  });
});
