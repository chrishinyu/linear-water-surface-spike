import type { QualityTier } from '../config';

export interface QualitySettings {
  dprScale: number;
  lineSamples: number;
  highlightSamples: number;
  fineWaveWeight: number;
  maxRipples: number;
}

export const QUALITY_SETTINGS: Readonly<Record<QualityTier, QualitySettings>> = {
  high: { dprScale: 1, lineSamples: 240, highlightSamples: 7, fineWaveWeight: 1, maxRipples: 4 },
  medium: { dprScale: 0.82, lineSamples: 190, highlightSamples: 5, fineWaveWeight: 0.7, maxRipples: 3 },
  low: { dprScale: 0.65, lineSamples: 135, highlightSamples: 3, fineWaveWeight: 0.35, maxRipples: 2 },
};

export const getQualitySettings = (tier: QualityTier): QualitySettings =>
  QUALITY_SETTINGS[tier];
