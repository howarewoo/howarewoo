import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import LaptopDesktop from "./LaptopDesktop";
import geometry from "./laptop-geometry.json";

const CLOSED = THREE.MathUtils.degToRad(105);
const HINGE = geometry.hinge as [number, number, number];
const SCREEN_CENTER = geometry.screenCenter as [number, number, number];
const COLLIDER_CENTER: [number, number, number] = [
  0,
  SCREEN_CENTER[1] + 0.965925826 * 0.057,
  SCREEN_CENTER[2] - 0.258819045 * 0.057,
];
const CLOSED_COLLIDER_CENTER = new THREE.Vector3(...COLLIDER_CENTER)
  .sub(new THREE.Vector3(...HINGE))
  .applyAxisAngle(new THREE.Vector3(1, 0, 0), CLOSED)
  .add(new THREE.Vector3(...HINGE));

export default function LaptopLid({
  model,
  active,
  reduced,
  cameraMoving,
  onMovingChange,
  onClose,
}: {
  model: THREE.Group;
  active: boolean;
  reduced: boolean;
  cameraMoving: boolean;
  onMovingChange: (moving: boolean) => void;
  onClose: () => void;
}) {
  const { invalidate, camera, gl } = useThree();
  const { rapier } = useRapier();
  const exits = useRef(
    new Map<
      number,
      {
        direction: number;
        distance: number;
        stalled: number;
      }
    >(),
  );
  const lid = useRef<THREE.Group>(null);
  const collider = useRef<RapierRigidBody>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{
    id: number;
    offset: number;
    cosine: number;
    sine: number;
    center: number;
  } | null>(null);
  const motion = useRef({
    angle: CLOSED,
    from: CLOSED,
    target: CLOSED,
    elapsed: 0,
    simulatedAngle: CLOSED,
    stepFrom: CLOSED,
    stepTo: CLOSED,
    stepElapsed: 0,
    stepDuration: 0,
    clearing: false,
  });
  const scratch = useMemo(
    () => ({
      position: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      bounds: new THREE.Box3(),
      colliderBounds: new THREE.Box3(),
      inverse: new THREE.Matrix4(),
      transform: new THREE.Matrix4(),
      center: new THREE.Vector3(),
      orientation: new THREE.Quaternion(),
      unit: new THREE.Vector3(1, 1, 1),
      scale: new THREE.Vector3(),
      impulse: new THREE.Vector3(),
      tilt: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        (Math.PI * 75) / 180,
      ),
    }),
    [],
  );

  const settle = (target: number) => {
    const state = motion.current;
    state.from = state.angle;
    state.target = target;
    state.elapsed = 0;
    setBusy(true);
    invalidate();
  };

  useLayoutEffect(() => {
    drag.current = null;
    document.body.style.cursor = "";
    const target = active ? 0 : CLOSED;
    if (motion.current.target !== target) settle(target);
    else invalidate();
  }, [active, reduced]);

  useEffect(() => {
    onMovingChange(busy);
    return () => onMovingChange(false);
  }, [busy, onMovingChange]);

  useEffect(() => {
    if (!active) return;
    const update = (event: PointerEvent) => {
      const session = drag.current;
      if (!session || session.id !== event.pointerId) return;
      // In an orthographic view, the grabbed point traces this projected arc.
      // Invert its screen Y rather than mapping pixel travel linearly to angle.
      const targetY = event.clientY + session.offset;
      let low = 0;
      let high = CLOSED;
      for (let i = 0; i < 18; i++) {
        const angle = (low + high) / 2;
        const y =
          session.center +
          session.cosine * Math.cos(angle) +
          session.sine * Math.sin(angle);
        if (y < targetY) low = angle;
        else high = angle;
      }
      motion.current.angle = (low + high) / 2;
      invalidate();
    };
    const end = (event: PointerEvent) => {
      if (drag.current?.id !== event.pointerId) return;
      update(event);
      drag.current = null;
      document.body.style.cursor = "";
      if (motion.current.angle >= CLOSED * 0.35) {
        // Hand off before navigation: frames can run before the route commits.
        settle(CLOSED);
        onClose();
      } else settle(0);
    };
    const cancel = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.cursor = "";
      settle(0);
    };
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      drag.current = null;
      document.body.style.cursor = "";
    };
  }, [active, invalidate, onClose]);

  useFrame((_, delta) => {
    if (!lid.current) return;
    const state = motion.current;
    if (!drag.current) {
      state.elapsed = Math.min(state.elapsed + Math.min(delta, 0.05), 0.65);
      const progress = reduced ? 1 : state.elapsed / 0.65;
      // Accelerate the opening hinge from rest instead of kicking its load.
      const eased =
        state.target === 0
          ? progress * progress * (3 - 2 * progress)
          : 1 - (1 - progress) ** 4;
      state.angle = THREE.MathUtils.lerp(state.from, state.target, eased);
      if (progress < 1) invalidate();
    }
    state.stepFrom = state.simulatedAngle;
    state.stepTo = state.angle;
    state.stepElapsed = 0;
    state.stepDuration = Math.min(delta, 0.05);
  }, -60);

  useBeforePhysicsStep((world) => {
    if (!lid.current) return;
    const state = motion.current;
    state.stepElapsed += world.timestep;
    const fraction =
      state.stepDuration > 0
        ? Math.min(state.stepElapsed / state.stepDuration, 1)
        : 1;
    let nextAngle = THREE.MathUtils.lerp(
      state.stepFrom,
      state.stepTo,
      fraction,
    );
    if (state.angle < state.simulatedAngle - 1e-6) {
      state.clearing = false;
      exits.current.clear();
    }
    if (nextAngle > state.simulatedAngle + 1e-8) {
      const laptop = lid.current.parent!;
      laptop.updateWorldMatrix(true, false);
      scratch.inverse.copy(laptop.matrixWorld).invert();
      laptop.getWorldScale(scratch.scale);
      let clearanceAngle = CLOSED;
      world.forEachRigidBody((body) => {
        if (!body.isDynamic() || !body.isEnabled()) return;
        scratch.bounds.makeEmpty();
        for (let i = 0; i < body.numColliders(); i++) {
          const shape = body.collider(i);
          if (
            !shape.isEnabled() ||
            shape.isSensor() ||
            shape.shapeType() !== rapier.ShapeType.Cuboid
          )
            continue;
          const half = shape.halfExtents();
          scratch.colliderBounds.min.set(-half.x, -half.y, -half.z);
          scratch.colliderBounds.max.set(half.x, half.y, half.z);
          scratch.center.copy(shape.translation());
          scratch.orientation.copy(shape.rotation());
          scratch.transform
            .compose(scratch.center, scratch.orientation, scratch.unit)
            .premultiply(scratch.inverse);
          scratch.bounds.union(
            scratch.colliderBounds.applyMatrix4(scratch.transform),
          );
        }
        const { min, max } = scratch.bounds;
        const halfWidth = geometry.width / 2;
        const halfDepth = geometry.depth / 2;
        if (
          scratch.bounds.isEmpty() ||
          max.z < 0.33 ||
          min.z > 2 ||
          min.x > halfWidth + 0.1 ||
          max.x < -halfWidth - 0.1 ||
          min.y > halfDepth ||
          max.y < -halfDepth - 0.1
        )
          return;

        // Keep a stable exit while sliding, but route around a jam rather
        // than pinning a light prop against a heavier object on the desk.
        let route = exits.current.get(body.handle);
        const left = max.x + halfWidth + 0.15;
        const right = halfWidth - min.x + 0.15;
        const front = max.y + halfDepth + 0.15;
        if (!route) {
          // Clear the keyboard sideways, away from the crowded mat in front.
          const direction =
            max.y + min.y < 0 && front < Math.min(left, right)
              ? 0
              : left <= right
                ? -1
                : 1;
          route = { direction, distance: Infinity, stalled: 0 };
          exits.current.set(body.handle, route);
        }
        let distance =
          route.direction === 0 ? front : route.direction < 0 ? left : right;
        if (distance < route.distance - 0.02) {
          route.distance = distance;
          route.stalled = 0;
        } else route.stalled += world.timestep;
        if (route.stalled > 0.3) {
          route.direction =
            route.direction === 0 ? (left <= right ? -1 : 1) : -route.direction;
          distance = route.direction < 0 ? left : right;
          route.distance = distance;
          route.stalled = 0;
        }
        state.clearing = true;
        const exit = route.direction;
        scratch.impulse
          .set(exit, exit === 0 ? -1 : 0, 0)
          .transformDirection(laptop.matrixWorld);
        const velocity = body.linvel();
        const speed =
          THREE.MathUtils.clamp(distance / 0.35, 3, 10) * scratch.scale.x;
        const currentSpeed =
          scratch.impulse.x * velocity.x +
          scratch.impulse.y * velocity.y +
          scratch.impulse.z * velocity.z;
        const acceleration = Math.min(
          Math.max(0, speed - currentSpeed),
          // Gravity does not shrink with the mobile model: still overcome friction.
          30 * Math.max(1, scratch.scale.x) * world.timestep,
        );
        scratch.impulse.multiplyScalar(body.mass() * acceleration);
        body.applyImpulse(scratch.impulse, true);

        // Conservatively keep the underside above the object's nearest
        // hinge-side corner until its entire footprint has cleared the deck.
        const run = Math.max(0.05, HINGE[1] - max.y);
        clearanceAngle = Math.min(
          clearanceAngle,
          CLOSED - Math.PI / 6,
          CLOSED - Math.atan2(Math.max(0, max.z + 0.08 - HINGE[2]), run),
        );
      });
      nextAngle = Math.min(
        nextAngle,
        Math.max(state.simulatedAngle, clearanceAngle),
      );
      if (state.clearing) {
        // Resume from the held pose, not from the completed route animation.
        nextAngle = Math.min(
          nextAngle,
          state.simulatedAngle + 4 * world.timestep,
        );
        invalidate();
      }
    }
    state.simulatedAngle = nextAngle;
    if (state.simulatedAngle >= CLOSED - 1e-8) {
      state.clearing = false;
      exits.current.clear();
    }
    // The mesh and solid advance together, once per collision-solving substep.
    // Never render a lid pose the resting objects have not had a chance to meet.
    if (
      !drag.current &&
      state.elapsed === 0.65 &&
      Math.abs(state.simulatedAngle - state.target) < 1e-8 &&
      busy
    ) {
      setBusy(false);
    }
    lid.current.rotation.x = state.simulatedAngle;
    lid.current.updateWorldMatrix(true, false);
    scratch.position
      .set(0, COLLIDER_CENTER[1] - HINGE[1], COLLIDER_CENTER[2] - HINGE[2])
      .applyMatrix4(lid.current.matrixWorld);
    lid.current.getWorldQuaternion(scratch.rotation).multiply(scratch.tilt);
    collider.current?.setNextKinematicTranslation(scratch.position);
    collider.current?.setNextKinematicRotation(scratch.rotation);
  });

  const start = (event: ThreeEvent<PointerEvent>) => {
    if (
      !active ||
      cameraMoving ||
      busy ||
      !lid.current ||
      !event.isPrimary ||
      event.button !== 0
    )
      return;
    event.stopPropagation();
    const hinge = lid.current!;
    hinge.updateWorldMatrix(true, false);
    const point = hinge.worldToLocal(event.point.clone());
    const projected = point.clone();
    const rect = gl.domElement.getBoundingClientRect();
    const screenY = (angle: number) => {
      projected.set(
        point.x,
        point.y * Math.cos(angle) - point.z * Math.sin(angle),
        point.y * Math.sin(angle) + point.z * Math.cos(angle),
      );
      projected.applyMatrix4(hinge.matrixWorld).project(camera);
      return rect.top + ((1 - projected.y) * rect.height) / 2;
    };
    const startY = screenY(0);
    const oppositeY = screenY(Math.PI);
    const center = (startY + oppositeY) / 2;
    drag.current = {
      id: event.pointerId,
      offset: startY - event.clientY,
      cosine: (startY - oppositeY) / 2,
      sine: screenY(Math.PI / 2) - center,
      center,
    };
    setBusy(true);
    document.body.style.cursor = "grabbing";
    // Native capture keeps touch/mouse drags alive beyond the canvas bounds.
    gl.domElement.setPointerCapture(event.pointerId);
    invalidate();
  };

  return (
    <>
      <group
        ref={lid}
        name="MacBook lid hinge"
        position={HINGE}
        rotation={[CLOSED, 0, 0]}
      >
        <group position={[0, -HINGE[1], -HINGE[2]]}>
          <primitive
            object={model}
            rotation={[Math.PI / 2, 0, 0]}
            dispose={null}
          />
          <LaptopDesktop active={active && !cameraMoving && !busy} />
          <group
            position={SCREEN_CENTER}
            rotation={[(Math.PI * 75) / 180, 0, 0]}
          >
            <mesh
              name="MacBook draggable top edge"
              position={[0, geometry.depth / 2 + 0.175, 0.05]}
              visible={active}
              onPointerDown={start}
              onPointerOver={(event) => {
                if (active && !busy && !cameraMoving) {
                  event.stopPropagation();
                  document.body.style.cursor = "grab";
                }
              }}
              onPointerOut={() => {
                if (!drag.current) document.body.style.cursor = "";
              }}
            >
              {/* Extend above the rim for touch, never into the project icons. */}
              <planeGeometry args={[10.8, 1.5]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        </group>
      </group>
      <RigidBody
        ref={collider}
        type="kinematicPosition"
        colliders={false}
        additionalSolverIterations={8}
        position={CLOSED_COLLIDER_CENTER}
        rotation={[Math.PI, 0, 0]}
      >
        <CuboidCollider
          args={[geometry.width / 2, geometry.depth / 2, 0.083]}
          contactSkin={0.02}
        />
      </RigidBody>
    </>
  );
}
