export type EnvironmentQualityName = 'high' | 'balanced';

export interface EnvironmentQualityInput {
  width: number;
  height: number;
  devicePixelRatio: number;
  coarsePointer: boolean;
}

export interface EnvironmentQuality {
  name: EnvironmentQualityName;
  pixelRatioCap: number;
  shadowMapSize: 512 | 1024 | 2048;
  sceneryDensity: number;
}

export const ENVIRONMENT_QUALITY = {
  high: { name: 'high', pixelRatioCap: 1.25, shadowMapSize: 1024, sceneryDensity: 0.8 },
  balanced: { name: 'balanced', pixelRatioCap: 1, shadowMapSize: 512, sceneryDensity: 0.45 },
} as const satisfies Record<EnvironmentQualityName, EnvironmentQuality>;

const HIGH = ENVIRONMENT_QUALITY.high;
const BALANCED = ENVIRONMENT_QUALITY.balanced;

export const chooseEnvironmentQuality = (input: EnvironmentQualityInput): EnvironmentQuality => (
  input.width >= 1024 && !input.coarsePointer ? HIGH : BALANCED
);
