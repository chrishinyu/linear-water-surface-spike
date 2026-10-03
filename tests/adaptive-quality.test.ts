import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from '../src/performance/AdaptiveQuality';
import { FrameSampler } from '../src/performance/FrameSampler';

describe('FrameSampler', () => {
  it('averages a fixed window of frame durations', () => {
    const sampler = new FrameSampler();
    for (let index = 0; index < 120; index += 1) sampler.push(20);
    expect(sampler.averageFps).toBeCloseTo(50);
    sampler.push(40);
    expect(sampler.averageFps).toBeCloseTo(120_000 / 2420);
  });

  it('ignores invalid durations and can discard samples after a pause', () => {
    const sampler = new FrameSampler();
    sampler.push(20);
    sampler.push(0);
    sampler.push(Number.NaN);
    expect(sampler.averageFps).toBeCloseTo(50);
    sampler.reset();
    expect(sampler.averageFps).toBe(0);
  });
});

describe('AdaptiveQuality', () => {
  it('drops one tier only after five continuous seconds below 45 FPS on desktop', () => {
    const controller = new AdaptiveQuality('high');
    expect(controller.sample(44, 4000)).toBeNull();
    expect(controller.sample(44, 999)).toBeNull();
    expect(controller.sample(44, 1)).toBe('medium');
    expect(controller.sample(44, 1000)).toBeNull();
  });

  it('clears pressure when frame rate recovers', () => {
    const controller = new AdaptiveQuality('high');
    expect(controller.sample(40, 4000)).toBeNull();
    expect(controller.sample(45, 1000)).toBeNull();
    expect(controller.sample(40, 4000)).toBeNull();
    expect(controller.sample(40, 1000)).toBe('medium');
  });

  it('treats a single recovered frame as a break in continuous pressure', () => {
    const controller = new AdaptiveQuality('high');
    expect(controller.sample(20, 4500)).toBeNull();
    expect(controller.sample(60, 16)).toBeNull();
    expect(controller.sample(20, 500)).toBeNull();
    expect(controller.sample(20, 4500)).toBe('medium');
  });

  it('uses a 30 FPS threshold on mobile', () => {
    const controller = new AdaptiveQuality('high', true);
    expect(controller.sample(35, 10000)).toBeNull();
    expect(controller.sample(29, 4999)).toBeNull();
    expect(controller.sample(29, 1)).toBeNull();
    expect(controller.sample(29, 999)).toBe('medium');
  });

  it('never upgrades or drops below low', () => {
    const controller = new AdaptiveQuality('medium');
    expect(controller.sample(60, 30000)).toBeNull();
    expect(controller.sample(20, 5000)).toBe('low');
    expect(controller.sample(20, 30000)).toBeNull();
    expect(controller.sample(60, 30000)).toBeNull();
  });

  it('resets sustained pressure on pause', () => {
    const controller = new AdaptiveQuality('high');
    expect(controller.sample(40, 4000)).toBeNull();
    controller.resetPressure();
    expect(controller.sample(40, 1000)).toBeNull();
  });
});
