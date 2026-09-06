const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/** Critically damped page motion; changing the destination never resets velocity. */
export class PageMotion {
  position: number;
  velocity = 0;
  input: number;
  target: number | null;
  readonly lastPage: number;

  constructor(page: number, lastPage: number) {
    this.position = this.input = page;
    this.target = page;
    this.lastPage = lastPage;
  }

  reset(page: number) {
    this.position = this.input = page;
    this.target = page;
    this.velocity = 0;
  }

  drive(position: number) {
    this.input = clamp(position, 0, this.lastPage);
    this.target = null;
  }

  goTo(page: number) {
    this.input = this.target = clamp(Math.round(page), 0, this.lastPage);
  }

  release() {
    // Include input received since the last rendered frame, then project the
    // body's existing momentum. Never reinterpret an OS wheel tail as a flick.
    this.goTo(this.input + this.velocity * 0.15);
    return this.target!;
  }

  advance(seconds: number, reduced: boolean) {
    const destination = this.target ?? this.input;
    const dt = Math.min(seconds, 0.05);
    if (reduced) {
      this.position = destination;
      this.velocity = 0;
      return;
    }
    const omega = this.target === null ? 20 : 8;
    const offset = this.position - destination;
    const impulse = this.velocity + omega * offset;
    const decay = Math.exp(-omega * dt);
    this.position = destination + (offset + impulse * dt) * decay;
    this.velocity = (this.velocity - omega * impulse * dt) * decay;
    if (this.position < 0 || this.position > this.lastPage) {
      this.position = clamp(this.position, 0, this.lastPage);
      this.velocity = 0; // Contact with the first/last page, not a release reset.
    }
    if (this.settled) {
      this.position = destination;
      this.velocity = 0;
    }
  }

  get settled() {
    return (
      this.target !== null &&
      Math.abs(this.position - this.target) < 0.001 &&
      Math.abs(this.velocity) < 0.01
    );
  }
}

/** A clamped-free paper beam's bending mode, driven by hinge inertia and gravity. */
export class PaperBend {
  angle = 0;
  velocity = 0;
  twist = 0;
  twistVelocity = 0;
  loadOffset = 0.18;
  private hingeVelocity = 0;

  reset(hingeVelocity = 0) {
    this.angle = this.velocity = 0;
    this.twist = this.twistVelocity = 0;
    this.hingeVelocity = hingeVelocity;
  }

  advance(
    hingeAngle: number,
    hingeVelocity: number,
    seconds: number,
    reduced: boolean,
  ) {
    if (reduced) {
      this.reset();
      return;
    }
    const dt = Math.min(seconds, 0.05);
    if (dt <= 0) return;
    const acceleration = clamp(
      (hingeVelocity - this.hingeVelocity) / dt,
      -80,
      80,
    );
    this.hingeVelocity = hingeVelocity;
    const force =
      -0.6 * acceleration - 1.8 * hingeVelocity + 1.5 * Math.cos(hingeAngle);
    const steps = Math.ceil(dt * 240);
    const step = dt / steps;
    const clearance = 1.1 * Math.max(0, Math.sin(-hingeAngle));
    for (let index = 0; index < steps; index++) {
      this.velocity += (force - 32 * this.angle - 10 * this.velocity) * step;
      this.angle += this.velocity * step;
      this.twistVelocity +=
        (force * this.loadOffset - 45 * this.twist - 12 * this.twistVelocity) *
        step;
      this.twist += this.twistVelocity * step;
      // Every tangent stays above the page stack. Contact absorbs only outward
      // velocity; the spine remains fixed and the free edge can keep flexing.
      const constrained = clamp(
        this.angle,
        Math.max(-clearance, -Math.PI - hingeAngle),
        Math.min(clearance, -hingeAngle),
      );
      if (constrained !== this.angle) {
        this.angle = constrained;
        this.velocity = 0;
      }
      const twistLimit = Math.max(
        0,
        Math.min(
          this.angle - Math.max(-clearance, -Math.PI - hingeAngle),
          Math.min(clearance, -hingeAngle) - this.angle,
        ),
      );
      const constrainedTwist = clamp(this.twist, -twistLimit, twistLimit);
      if (constrainedTwist !== this.twist) {
        this.twist = constrainedTwist;
        this.twistVelocity = 0;
      }
    }
  }

  get settled() {
    return (
      Math.abs(this.angle) < 0.005 &&
      Math.abs(this.velocity) < 0.025 &&
      Math.abs(this.twist) < 0.005 &&
      Math.abs(this.twistVelocity) < 0.025
    );
  }
}
