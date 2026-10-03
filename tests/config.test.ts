import { describe, expect, it } from 'vitest';
import { BACKGROUND_CONFIG, HERO_CONFIG, resolveConfig } from '../src/config';

describe('water configuration', () => {
  it('keeps background motion and interaction below hero values', () => {
    expect(BACKGROUND_CONFIG.waveAmplitude).toBeLessThan(HERO_CONFIG.waveAmplitude);
    expect(BACKGROUND_CONFIG.pointerStrength).toBeLessThan(HERO_CONFIG.pointerStrength);
    expect(BACKGROUND_CONFIG.reflectionIntensity).toBeLessThan(HERO_CONFIG.reflectionIntensity);
  });

  it('applies overrides without mutating the preset', () => {
    const resolved = resolveConfig('hero', { reflectionIntensity: 0.7 });
    expect(resolved.reflectionIntensity).toBe(0.7);
    expect(HERO_CONFIG.reflectionIntensity).not.toBe(0.7);
  });

  it('clamps unsafe values', () => {
    const resolved = resolveConfig('hero', { maxDpr: 4, rippleStrength: -1 });
    expect(resolved.maxDpr).toBe(1.5);
    expect(resolved.rippleStrength).toBe(0);
  });
});
