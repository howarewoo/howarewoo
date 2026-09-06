import assert from "node:assert/strict";
import test from "node:test";
import { ThrowVelocity } from "../src/throwVelocity.ts";

function close(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${expected}, received ${actual}`,
  );
}

test("a recent flick releases in world units per second, but a hold does not launch", () => {
  const velocity = new ThrowVelocity();
  const out = { x: 99, y: 99, z: 99 };
  velocity.reset(0, 0, 0, 0);
  velocity.sample(0.4, -0.2, 0.1, 50);
  velocity.release(50, out);
  close(out.x, 8);
  close(out.y, -4);
  close(out.z, 2);

  velocity.release(150, out);
  assert.deepEqual(out, { x: 0, y: 0, z: 0 });
  velocity.sample(0.4, -0.2, 0.1, 200);
  velocity.release(200, out);
  assert.deepEqual(out, { x: 0, y: 0, z: 0 });
});

test("sparse and very dense events retain the same recent motion window", () => {
  const outputs = [];
  for (const interval of [20, 0.25]) {
    const velocity = new ThrowVelocity(100);
    const out = { x: 0, y: 0, z: 0 };
    velocity.reset(0, 0, 0, 0);
    // A direction change makes a shortened event-count window observable.
    for (let time = interval; time <= 200; time += interval) {
      const x = time <= 160 ? time * 0.01 : 1.6 - (time - 160) * 0.005;
      velocity.sample(x, time * -0.002, time * 0.003, time);
    }
    velocity.release(210, out);
    outputs.push(out);
  }
  for (const out of outputs) {
    close(out.x, 3);
    close(out.y, -1.8);
    close(out.z, 2.7);
  }
});

test("duplicate and backwards events cannot corrupt motion, and reset isolates gestures", () => {
  const velocity = new ThrowVelocity();
  const out = { x: 0, y: 0, z: 0 };
  velocity.reset(0, 0, 0, 10);
  velocity.sample(0.2, 0, 0, 30);
  velocity.sample(900, 900, 900, 30);
  velocity.sample(-900, -900, -900, 20);
  velocity.sample(0.4, 0, 0, 50);
  velocity.release(50, out);
  close(out.x, 10);
  close(out.y, 0);
  close(out.z, 0);

  velocity.reset(500, 600, 700, 100);
  velocity.release(100, out);
  assert.deepEqual(out, { x: 0, y: 0, z: 0 });
  velocity.sample(500, 600.1, 700, 120);
  velocity.release(120, out);
  close(out.x, 0);
  close(out.y, 5);
  close(out.z, 0);
});

test("the speed cap preserves direction instead of clamping individual axes", () => {
  const velocity = new ThrowVelocity(5);
  const out = { x: 0, y: 0, z: 0 };
  velocity.reset(0, 0, 0, 0);
  velocity.sample(3, -4, 0, 10);
  velocity.release(10, out);
  close(out.x, 3);
  close(out.y, -4);
  close(out.z, 0);
  close(Math.hypot(out.x, out.y, out.z), 5);
});

test("insufficient samples and invalid input cannot emit non-finite velocity", () => {
  const velocity = new ThrowVelocity();
  const out = { x: 99, y: 99, z: 99 };
  velocity.release(0, out);
  assert.deepEqual(out, { x: 0, y: 0, z: 0 });
  velocity.reset(0, 0, 0, 0);
  velocity.sample(Number.NaN, 0, 0, 10);
  velocity.sample(0, 0, 0, Number.POSITIVE_INFINITY);
  velocity.release(20, out);
  assert.deepEqual(out, { x: 0, y: 0, z: 0 });
  velocity.reset(Number.NaN, 0, 0, 30);
  velocity.release(40, out);
  assert.deepEqual(out, { x: 0, y: 0, z: 0 });
});
