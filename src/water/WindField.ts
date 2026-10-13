/**
 * Wind energy left on the water by the pointer.
 *
 * The pointer does not carry an effect around with it. It deposits energy
 * along its path; the energy stays where it landed, drifts gently downwind,
 * softens, and decays. The shader reads it as "how roughened is the water
 * here" and raises the existing short waves accordingly, so a gust looks like
 * a cat's paw on real water rather than a stamp following the cursor.
 *
 * Coordinates are normalised screen space (0..1, y up), matching
 * gl_FragCoord / resolution. The camera is fixed, so a screen point is a
 * fixed patch of water. All buffers are allocated once; step() and
 * deposit() allocate nothing.
 */
export class WindField {
  readonly width: number;
  readonly height: number;
  /** Uploaded to the GPU (R8). */
  readonly bytes: Uint8Array;
  private energy: Float32Array;
  private scratch: Float32Array;
  private peak = 0;

  constructor(width = 96, height = 60) {
    this.width = width;
    this.height = height;
    this.energy = new Float32Array(width * height);
    this.scratch = new Float32Array(width * height);
    this.bytes = new Uint8Array(width * height);
  }

  /** True while any visible energy remains (worth uploading). */
  get active(): boolean {
    return this.peak > 1 / 255;
  }

  /**
   * Deposit along a segment, like a breath dragged across the surface.
   * `amount` (0..1) is the gust strength for this segment; the stamp
   * shrinks toward the top of the frame, where the water is farther away.
   */
  deposit(x0: number, y0: number, x1: number, y1: number, amount: number,
    radius = 0.07): void {
    if (amount <= 0) return;
    const { width, height, energy } = this;
    const lengthCells = Math.hypot((x1 - x0) * width, (y1 - y0) * height);
    const steps = Math.max(1, Math.ceil(lengthCells));
    const share = amount / steps;
    for (let s = 0; s < steps; s += 1) {
      const t = (s + 0.5) / steps;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      // Perspective: the same breath covers less screen far away.
      const r = radius * (1 - 0.45 * Math.min(1, Math.max(0, cy)));
      const rx = r * width;
      const ry = r * width * 0.55; // foreshortened toward the viewer's angle
      const minX = Math.max(0, Math.floor(cx * width - rx * 2));
      const maxX = Math.min(width - 1, Math.ceil(cx * width + rx * 2));
      const minY = Math.max(0, Math.floor(cy * height - ry * 2));
      const maxY = Math.min(height - 1, Math.ceil(cy * height + ry * 2));
      for (let y = minY; y <= maxY; y += 1) {
        const dy = (y + 0.5 - cy * height) / ry;
        for (let x = minX; x <= maxX; x += 1) {
          const dx = (x + 0.5 - cx * width) / rx;
          const falloff = Math.exp(-(dx * dx + dy * dy));
          const index = y * width + x;
          // Saturating add: repeated passes thicken a patch but never blow out.
          energy[index] += (1 - energy[index]) * falloff * share * 2.2;
        }
      }
    }
    this.peak = Math.max(this.peak, amount);
  }

  /**
   * Advance by dt seconds: drift downwind (dirX, dirY in screen units),
   * soften with a light blur, and decay. tau is the 1/e lifetime in seconds.
   */
  step(dt: number, dirX: number, dirY: number, tau = 0.85, drift = 0.035): void {
    if (!this.active) return;
    const { width, height, energy, scratch } = this;
    const decay = Math.exp(-dt / tau);
    // Semi-Lagrangian advection: sample from upwind.
    const ox = dirX * drift * dt * width;
    const oy = dirY * drift * dt * height;
    let peak = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sx = Math.min(width - 1.001, Math.max(0, x - ox));
        const sy = Math.min(height - 1.001, Math.max(0, y - oy));
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const fx = sx - ix;
        const fy = sy - iy;
        const i = iy * width + ix;
        const top = energy[i] * (1 - fx) + energy[i + 1] * fx;
        const bottom = energy[i + width] * (1 - fx) + energy[i + width + 1] * fx;
        scratch[y * width + x] = (top * (1 - fy) + bottom * fy) * decay;
      }
    }
    // Light cross blur: the roughened patch spreads and softens as it fades.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const left = scratch[x > 0 ? i - 1 : i];
        const right = scratch[x < width - 1 ? i + 1 : i];
        const up = scratch[y > 0 ? i - width : i];
        const down = scratch[y < height - 1 ? i + width : i];
        const value = scratch[i] * 0.6 + (left + right + up + down) * 0.1;
        energy[i] = value;
        this.bytes[i] = Math.min(255, Math.round(value * 255));
        if (value > peak) peak = value;
      }
    }
    this.peak = peak;
    if (!this.active) this.clear();
  }

  clear(): void {
    this.energy.fill(0);
    this.scratch.fill(0);
    this.bytes.fill(0);
    this.peak = 0;
  }
}
