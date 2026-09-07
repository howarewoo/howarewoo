const WINDOW_MS = 100;
const SAMPLE_MS = 5;
const CAPACITY = 32;

export class ThrowVelocity {
  private readonly samples = new Float64Array(CAPACITY * 4);
  private readonly maxSpeed: number;
  private head = 0;
  private count = 0;
  private nextTime = 0;
  private lastTime = 0;
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;

  constructor(maxSpeed = 22) {
    this.maxSpeed = Number.isFinite(maxSpeed) && maxSpeed >= 0 ? maxSpeed : 22;
  }

  reset(x: number, y: number, z: number, timeMs: number): void {
    this.head = 0;
    this.count = 0;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(timeMs)
    )
      return;
    this.lastX = x;
    this.lastY = y;
    this.lastZ = z;
    this.lastTime = timeMs;
    this.nextTime = timeMs + SAMPLE_MS;
    this.push(x, y, z, timeMs);
  }

  sample(x: number, y: number, z: number, timeMs: number): void {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(timeMs)
    )
      return;
    if (this.count === 0) {
      this.reset(x, y, z, timeMs);
      return;
    }
    if (timeMs <= this.lastTime) return;

    // Resample by elapsed time, not event count: dense pointer events cannot
    // evict the recent history. Skip obsolete ticks after a long event gap.
    const skipped = Math.floor(
      (timeMs - WINDOW_MS - this.nextTime) / SAMPLE_MS,
    );
    if (skipped > 0) this.nextTime += skipped * SAMPLE_MS;
    for (let ticks = 0; ticks < CAPACITY && this.nextTime <= timeMs; ticks++) {
      const fraction =
        (this.nextTime - this.lastTime) / (timeMs - this.lastTime);
      this.push(
        this.lastX + (x - this.lastX) * fraction,
        this.lastY + (y - this.lastY) * fraction,
        this.lastZ + (z - this.lastZ) * fraction,
        this.nextTime,
      );
      this.nextTime += SAMPLE_MS;
    }
    this.lastX = x;
    this.lastY = y;
    this.lastZ = z;
    this.lastTime = timeMs;
  }

  release(timeMs: number, out: { x: number; y: number; z: number }): void {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    if (
      this.count === 0 ||
      !Number.isFinite(timeMs) ||
      timeMs < this.lastTime ||
      timeMs - this.lastTime >= WINDOW_MS
    )
      return;

    let index = this.head * 4;
    let startTime = this.samples[index];
    let x = this.samples[index + 1];
    let y = this.samples[index + 2];
    let z = this.samples[index + 3];
    const boundary = Math.max(startTime, timeMs - WINDOW_MS);

    // Interpolate the window boundary, including the unsnapped final event.
    // Treat time between the last event and release as a stationary hold.
    for (let i = 1; i <= this.count; i++) {
      index = ((this.head + i) % CAPACITY) * 4;
      const endTime = i === this.count ? this.lastTime : this.samples[index];
      const endX = i === this.count ? this.lastX : this.samples[index + 1];
      const endY = i === this.count ? this.lastY : this.samples[index + 2];
      const endZ = i === this.count ? this.lastZ : this.samples[index + 3];
      if (endTime > boundary) {
        const fraction = (boundary - startTime) / (endTime - startTime);
        x += (endX - x) * fraction;
        y += (endY - y) * fraction;
        z += (endZ - z) * fraction;
        break;
      }
      startTime = endTime;
      x = endX;
      y = endY;
      z = endZ;
    }

    const seconds = (timeMs - boundary) / 1000;
    if (seconds <= 0) return;
    const vx = (this.lastX - x) / seconds;
    const vy = (this.lastY - y) / seconds;
    const vz = (this.lastZ - z) / seconds;
    const speed = Math.hypot(vx, vy, vz);
    if (!Number.isFinite(speed) || speed === 0) return;
    const scale = Math.min(1, this.maxSpeed / speed);
    out.x = vx * scale;
    out.y = vy * scale;
    out.z = vz * scale;
  }

  private push(x: number, y: number, z: number, timeMs: number): void {
    const index = ((this.head + this.count) % CAPACITY) * 4;
    this.samples[index] = timeMs;
    this.samples[index + 1] = x;
    this.samples[index + 2] = y;
    this.samples[index + 3] = z;
    if (this.count < CAPACITY) this.count++;
    else this.head = (this.head + 1) % CAPACITY;
  }
}
