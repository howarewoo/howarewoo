import assert from "node:assert/strict";
import test from "node:test";
import { PageMotion, PaperBend } from "../src/PagePhysics.ts";

function advance(motion: PageMotion, seconds: number, fps = 120) {
  for (let frame = 0; frame < seconds * fps; frame++)
    motion.advance(1 / fps, false);
}

test("a release carries velocity into the next page instead of reversing at the nearest index", () => {
  const motion = new PageMotion(0, 5);
  motion.drive(0.45);
  motion.advance(0.04, false);
  const position = motion.position;
  const velocity = motion.velocity;
  assert.ok(position < 0.5);
  assert.equal(motion.release(), 1);
  assert.equal(motion.position, position);
  assert.equal(motion.velocity, velocity);
  motion.advance(0.01, false);
  assert.ok(motion.position > position);
  advance(motion, 2);
  assert.equal(motion.position, 1);
  assert.equal(motion.velocity, 0);

  motion.reset(0);
  motion.drive(0.45);
  advance(motion, 2);
  assert.equal(
    motion.release(),
    0,
    "holding the same partial turn removes flick momentum",
  );
  motion.reset(0);
  motion.drive(0.65);
  assert.equal(
    motion.release(),
    1,
    "the final input must survive release before the next animation frame",
  );
});

test("spring motion is independent of display refresh rate and cannot escape the page range", () => {
  const slow = new PageMotion(0, 2);
  const fast = new PageMotion(0, 2);
  for (const motion of [slow, fast]) motion.drive(0.8);
  advance(slow, 0.2, 30);
  advance(fast, 0.2, 120);
  assert.ok(Math.abs(slow.position - fast.position) < 1e-10);
  assert.ok(Math.abs(slow.velocity - fast.velocity) < 1e-10);
  for (const destination of [100, -100]) {
    slow.drive(destination);
    advance(slow, 0.2);
    slow.release();
    for (let frame = 0; frame < 240; frame++) {
      slow.advance(1 / 120, false);
      assert.ok(slow.position >= 0 && slow.position <= 2);
    }
    assert.equal(slow.position, destination > 0 ? 2 : 0);
  }
});

test("paper flexes under hinge acceleration, stays above the stack, and lands flat", () => {
  const motion = new PageMotion(0, 1);
  const paper = new PaperBend();
  motion.goTo(1);
  let maximumBend = 0;
  let maximumTwist = 0;
  for (let frame = 0; frame < 360; frame++) {
    motion.advance(1 / 120, false);
    const angle = -Math.PI * motion.position;
    paper.advance(angle, -Math.PI * motion.velocity, 1 / 120, false);
    maximumBend = Math.max(maximumBend, Math.abs(paper.angle));
    maximumTwist = Math.max(maximumTwist, Math.abs(paper.twist));
    assert.ok(Number.isFinite(paper.angle) && Number.isFinite(paper.velocity));
    assert.ok(angle + paper.angle + Math.abs(paper.twist) <= 1e-8);
    assert.ok(angle + paper.angle - Math.abs(paper.twist) >= -Math.PI - 1e-8);
  }
  assert.ok(
    maximumBend > 0.03,
    "a rigid sheet must not pass as flexible paper",
  );
  assert.ok(
    maximumTwist > 0.005,
    "an off-center load must flex the corners differently",
  );
  assert.ok(paper.settled);
  assert.equal(motion.position, 1);
});

test("reduced motion removes inertial continuation and bending", () => {
  const motion = new PageMotion(0, 2);
  const paper = new PaperBend();
  motion.drive(0.7);
  motion.advance(1 / 60, true);
  assert.equal(motion.position, 0.7);
  assert.equal(motion.release(), 1);
  motion.advance(1 / 60, true);
  paper.advance(-Math.PI / 2, -4, 1 / 60, true);
  assert.equal(motion.position, 1);
  assert.equal(motion.velocity, 0);
  assert.equal(paper.angle, 0);
});
