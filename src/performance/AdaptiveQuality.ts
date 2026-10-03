import type { QualityTier } from '../config';

export class AdaptiveQuality {
  private tier: QualityTier;
  private pressureMs = 0;
  private readonly threshold: number;

  constructor(tier: QualityTier, mobile = false) {
    this.tier = tier;
    this.threshold = mobile ? 30 : 45;
  }

  sample(fps: number, elapsedMs: number): QualityTier | null {
    if (this.tier === 'low') return null;
    if (!Number.isFinite(fps) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return null;
    if (fps >= this.threshold) {
      this.pressureMs = 0;
      return null;
    }
    this.pressureMs += elapsedMs;
    if (this.pressureMs < 5000) return null;
    this.pressureMs = 0;
    this.tier = this.tier === 'high' ? 'medium' : 'low';
    return this.tier;
  }

  resetPressure(): void { this.pressureMs = 0; }
}
