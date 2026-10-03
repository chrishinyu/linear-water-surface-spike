export const MAX_RIPPLE_UNIFORMS = 4;

export interface RippleSlot {
  x: number;
  y: number;
  startedAt: number;
  strength: number;
  active: boolean;
}

export interface RipplePoint {
  x: number;
  y: number;
}

export function createRippleSlots(count: number): RippleSlot[] {
  const capacity = Math.min(MAX_RIPPLE_UNIFORMS, Math.max(0, Math.floor(count)));
  return Array.from({ length: capacity }, () => ({
    x: 0,
    y: 0,
    startedAt: 0,
    strength: 0,
    active: false,
  }));
}

export function emitRipple(
  slots: RippleSlot[],
  point: RipplePoint,
  time: number,
  strength: number,
  maxSlots = slots.length,
): void {
  const count = Math.min(MAX_RIPPLE_UNIFORMS, slots.length, Math.max(0, Math.floor(maxSlots)));
  if (count === 0) return;

  let target = slots[0];
  for (let index = 0; index < count; index += 1) {
    const slot = slots[index];
    if (!slot.active) {
      target = slot;
      break;
    }
    if (slot.startedAt < target.startedAt) target = slot;
  }

  target.x = point.x;
  target.y = point.y;
  target.startedAt = time;
  target.strength = strength;
  target.active = true;
}

export function writeRippleUniforms(
  slots: RippleSlot[],
  now: number,
  duration: number,
  positions: Float32Array,
  starts: Float32Array,
  strengths: Float32Array,
): void {
  positions.fill(0);
  starts.fill(0);
  strengths.fill(0);

  const count = Math.min(MAX_RIPPLE_UNIFORMS, slots.length);
  for (let index = 0; index < count; index += 1) {
    const slot = slots[index];
    if (!slot.active) continue;

    const age = Math.max(0, now - slot.startedAt);
    const decay = duration > 0 ? Math.max(0, 1 - age / duration) : 0;
    const strength = slot.strength * decay;
    if (strength <= 0) {
      slot.active = false;
      continue;
    }

    const positionIndex = index * 2;
    if (positionIndex + 1 < positions.length) {
      positions[positionIndex] = slot.x;
      positions[positionIndex + 1] = slot.y;
    }
    if (index < starts.length) starts[index] = slot.startedAt;
    if (index < strengths.length) strengths[index] = strength;
  }
}
