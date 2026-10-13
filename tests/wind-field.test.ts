import { describe, expect, it } from 'vitest';
import { WindField } from '../src/water/WindField';

const sum = (bytes: Uint8Array) => bytes.reduce((total, value) => total + value, 0);

describe('wind field', () => {
  it('stays empty and inactive until the pointer deposits wind', () => {
    const field = new WindField(32, 20);
    field.step(1 / 60, 1, 0);
    expect(field.active).toBe(false);
    expect(sum(field.bytes)).toBe(0);
  });

  it('leaves energy where the gust passed, not where the pointer is now', () => {
    const field = new WindField(32, 20);
    field.deposit(0.2, 0.5, 0.3, 0.5, 0.8);
    field.step(1 / 60, 1, 0);
    const at = (x: number, y: number) => field.bytes[Math.floor(y * 20) * 32 + Math.floor(x * 32)];
    expect(at(0.25, 0.5)).toBeGreaterThan(0);
    expect(at(0.9, 0.5)).toBe(0);
  });

  it('decays to nothing and then stops uploading', () => {
    const field = new WindField(32, 20);
    field.deposit(0.5, 0.5, 0.55, 0.5, 1);
    for (let frame = 0; frame < 60 * 8; frame += 1) field.step(1 / 60, 0, 1);
    expect(field.active).toBe(false);
    expect(sum(field.bytes)).toBe(0);
  });

  it('never exceeds full energy under repeated passes', () => {
    const field = new WindField(32, 20);
    for (let pass = 0; pass < 50; pass += 1) field.deposit(0.4, 0.5, 0.6, 0.5, 1);
    field.step(1 / 60, 1, 0);
    expect(Math.max(...field.bytes)).toBeLessThanOrEqual(255);
  });

  it('a parked pointer (zero amount) deposits nothing', () => {
    const field = new WindField(32, 20);
    field.deposit(0.5, 0.5, 0.5, 0.5, 0);
    expect(field.active).toBe(false);
  });
});
