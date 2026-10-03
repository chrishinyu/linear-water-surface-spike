export type WaterMode = 'hero' | 'background';
export type QualityTier = 'high' | 'medium' | 'low';

export interface WaterConfig {
  mode: WaterMode;
  quality: QualityTier;
  maxDpr: number;
  waveAmplitude: number;
  waveSpeed: number;
  lineDensity: number;
  reflectionIntensity: number;
  reflectionCenter: number;
  reflectionWidth: number;
  pointerStrength: number;
  rippleStrength: number;
  rippleDuration: number;
  interactionEnabled: boolean;
}

export const HERO_CONFIG: Readonly<WaterConfig> = Object.freeze({
  mode: 'hero', quality: 'high', maxDpr: 1.5,
  waveAmplitude: 0.17, waveSpeed: 0.14, lineDensity: 228,
  reflectionIntensity: 1.05, reflectionCenter: 0.54, reflectionWidth: 0.19,
  pointerStrength: 0.035, rippleStrength: 0.11, rippleDuration: 3,
  interactionEnabled: true,
});

export const BACKGROUND_CONFIG: Readonly<WaterConfig> = Object.freeze({
  mode: 'background', quality: 'medium', maxDpr: 1.25,
  waveAmplitude: 0.10, waveSpeed: 0.09, lineDensity: 180,
  reflectionIntensity: 0.58, reflectionCenter: 0.54, reflectionWidth: 0.20,
  pointerStrength: 0.018, rippleStrength: 0.06, rippleDuration: 3,
  interactionEnabled: true,
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function resolveConfig(
  mode: WaterMode,
  overrides: Partial<WaterConfig> = {},
): WaterConfig {
  const base = mode === 'hero' ? HERO_CONFIG : BACKGROUND_CONFIG;
  const merged = { ...base, ...overrides, mode };
  return {
    ...merged,
    maxDpr: clamp(merged.maxDpr, 0.75, mode === 'hero' ? 1.5 : 1.25),
    rippleStrength: clamp(merged.rippleStrength, 0, 0.16),
    pointerStrength: clamp(merged.pointerStrength, 0, 0.05),
    rippleDuration: clamp(merged.rippleDuration, 2, 4),
  };
}
