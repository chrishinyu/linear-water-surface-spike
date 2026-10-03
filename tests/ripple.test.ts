import { describe, expect, it } from 'vitest';
import { createRippleSlots, emitRipple, writeRippleUniforms } from '../src/math/ripple';

describe('ripple state', () => {
  it('reuses the oldest ripple slot when full', () => {
    const slots = createRippleSlots(2);
    emitRipple(slots, { x: 0.1, y: 0.2 }, 1, 0.1);
    emitRipple(slots, { x: 0.3, y: 0.4 }, 2, 0.1);
    emitRipple(slots, { x: 0.8, y: 0.9 }, 3, 0.12);
    expect(slots[0]).toMatchObject({ x: 0.8, y: 0.9, startedAt: 3 });
  });

  it('writes decayed strengths without allocating output arrays', () => {
    const slots = createRippleSlots(1);
    emitRipple(slots, { x: 0.5, y: 0.5 }, 1, 0.12);
    const positions = new Float32Array(4);
    const starts = new Float32Array(4);
    const strengths = new Float32Array(4);
    writeRippleUniforms(slots, 2.5, 3, positions, starts, strengths);
    expect(strengths[0]).toBeGreaterThan(0);
    expect(strengths[0]).toBeLessThan(0.12);
  });

  it('clears unused uniform entries across the supplied arrays', () => {
    const slots = createRippleSlots(1);
    emitRipple(slots, { x: 0.2, y: 0.7 }, 5, 0.1);
    const positions = new Float32Array(10).fill(9);
    const starts = new Float32Array(6).fill(9);
    const strengths = new Float32Array(5).fill(9);
    writeRippleUniforms(slots, 5, 3, positions, starts, strengths);
    expect(positions[0]).toBeCloseTo(0.2);
    expect(positions[1]).toBeCloseTo(0.7);
    expect([...positions.slice(2)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...starts]).toEqual([5, 0, 0, 0, 0, 0]);
    expect(strengths[0]).toBeCloseTo(0.1);
    expect([...strengths.slice(1)]).toEqual([0, 0, 0, 0]);
  });

  it('deactivates expired ripple slots so they are not counted as active', () => {
    const slots = createRippleSlots(4);
    emitRipple(slots, { x: 0.5, y: 0.5 }, 1, 0.11);
    writeRippleUniforms(slots, 4, 3, new Float32Array(8), new Float32Array(4), new Float32Array(4));
    expect(slots.filter((slot) => slot.active)).toHaveLength(0);
  });

  it('caps allocated ripple slots at four', () => {
    expect(createRippleSlots(10)).toHaveLength(4);
  });

  it('reuses only slots inside the quality tier cap', () => {
    const slots = createRippleSlots(4);
    emitRipple(slots, { x: 0.1, y: 0.1 }, 1, 0.1, 2);
    emitRipple(slots, { x: 0.2, y: 0.2 }, 2, 0.1, 2);
    emitRipple(slots, { x: 0.3, y: 0.3 }, 3, 0.1, 2);
    expect(slots[0].x).toBe(0.3);
    expect(slots.slice(2).every((slot) => !slot.active)).toBe(true);
  });
});
