import { describe, expect, it } from 'vitest';
import { getQualitySettings } from '../src/water/quality';

describe('quality settings', () => {
  it('reduces every quality control in high, medium, low order', () => {
    const high = getQualitySettings('high');
    const medium = getQualitySettings('medium');
    const low = getQualitySettings('low');
    for (const key of ['dprScale', 'fineWaveWeight', 'highlightSamples', 'lineSamples', 'maxRipples'] as const) {
      expect(high[key], key).toBeGreaterThan(medium[key]);
      expect(medium[key], key).toBeGreaterThan(low[key]);
    }
  });
});
