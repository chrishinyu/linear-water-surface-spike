export class FrameSampler {
  private readonly durations = new Float32Array(120);
  private next = 0;
  private count = 0;
  private totalMs = 0;

  get averageFps(): number {
    return this.totalMs > 0 ? this.count * 1000 / this.totalMs : 0;
  }

  push(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    if (this.count === this.durations.length) {
      this.totalMs -= this.durations[this.next];
    } else {
      this.count += 1;
    }
    this.durations[this.next] = deltaMs;
    this.totalMs += this.durations[this.next];
    this.next = (this.next + 1) % this.durations.length;
  }

  reset(): void {
    this.next = 0;
    this.count = 0;
    this.totalMs = 0;
  }
}
