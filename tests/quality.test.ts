import { describe, expect, it } from 'vitest';
import { getQualitySettings } from '../src/water/quality';

describe('quality settings', () => {
  it('reduces costly samples monotonically', () => {
    const high = getQualitySettings('high');
    const medium = getQualitySettings('medium');
    const low = getQualitySettings('low');
    expect(high.lineSamples).toBeGreaterThan(medium.lineSamples);
    expect(medium.lineSamples).toBeGreaterThan(low.lineSamples);
    expect(high.maxRipples).toBeGreaterThanOrEqual(medium.maxRipples);
    expect(medium.maxRipples).toBeGreaterThanOrEqual(low.maxRipples);
  });
});
