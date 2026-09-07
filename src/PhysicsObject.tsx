import { useEffect, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, RigidBody, useRapier } from "@react-three/rapier";
import type { RapierCollider, RapierRigidBody } from "@react-three/rapier";
import { useNavigate } from "react-router";
import { flushSync } from "react-dom";
import * as THREE from "three";
import { ThrowVelocity } from "./throwVelocity";

type Position = [number, number, number];
type Props = {
  model: THREE.Group;
  position: Position;
  angle: number;
  to: string;
  label: string;
  reduced: boolean;
  dragOwner: RefObject<string | null>;
  disabled: boolean;
  resetGeneration: number;
  focus?: { active: boolean; position: Position; scale: number };
  children?: ReactNode;
  size?: number;
  collisionCover?: THREE.Group;
  mass?: number;
};
type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  placed: boolean;
  origin: THREE.Vector3;
  rotation: THREE.Quaternion;
  anchor: THREE.Vector3;
  target: THREE.Vector3;
  liftZ: number;
  rect: DOMRect;
};
const ZERO = { x: 0, y: 0, z: 0 };
const DOWN = { x: 0, y: 0, z: -1 };

export default function PhysicsObject({
  model,
  position,
  angle,
  to,
  label,
  reduced,
  dragOwner,
  disabled,
  resetGeneration,
  focus,
  children,
  size = 1,
  collisionCover,
  mass = 0.35,
}: Props) {
  const visual = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const drag = useRef<Gesture | null>(null);
  const lostCaptureFrame = useRef(0);
  const { scene, camera, gl, clock, invalidate } = useThree();
  const { world, rapier } = useRapier();
  const navigate = useNavigate();
  const shape = useMemo(() => {
    // Measure a detached, closed probe once; animated cover/pages never own collision geometry.
    const probe = new THREE.Group();
    probe.rotation.x = Math.PI / 2;
    const modelProbe = model.clone(true);
    // Primitive rotation is written onto cached GLTF roots by R3F; don't count
    // that presentation transform a second time after a remount.
    modelProbe.rotation.set(0, 0, 0);
    probe.add(modelProbe);
    if (collisionCover) probe.add(collisionCover.clone(true));
    probe.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(probe);
    return {
      center: box.getCenter(new THREE.Vector3()),
      half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5),
    };
  }, [model, collisionCover]);
  const state = useMemo(
    () => ({
      initialized: false,
      placed: false,
      reset: resetGeneration,
      scale: 1,
      focus: 0,
      suspended: false,
      lastFrame: performance.now(),
      home: new THREE.Vector3(),
      homeRotation: new THREE.Quaternion(),
      returning: false,
      returnElapsed: 0,
      returnPosition: new THREE.Vector3(),
      returnRotation: new THREE.Quaternion(),
      velocity: new ThrowVelocity(),
      release: new THREE.Vector3(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1)),
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      point: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      inverseRotation: new THREE.Quaternion(),
      parentRotation: new THREE.Quaternion(),
      targetRotation: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, 0.015),
      ),
      parentScale: new THREE.Vector3(),
      extent: new THREE.Vector3(),
      center: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
      inverse: new THREE.Matrix4(),
      worldScale: new THREE.Vector3(),
      castOrigin: new THREE.Vector3(),
      colliderOffset: new THREE.Vector3(),
    }),
    [],
  );

  const clearVelocity = () => {
    const rigid = body.current;
    if (!rigid) return;
    rigid.resetForces(false);
    rigid.resetTorques(false);
    rigid.setLinvel(ZERO, false);
    rigid.setAngvel(ZERO, false);
  };

  const placeHeld = () => {
    const session = drag.current;
    const rigid = body.current;
    const collision = collider.current;
    if (!session?.moved || !rigid || !collision) return;
    state.point.copy(session.anchor).applyQuaternion(session.rotation);
    state.point.negate().add(session.target);
    // Cursor XY is authoritative while carried. Sweep the whole collider down
    // from above the room to find clearance over props, stacks, and the laptop.
    state.colliderOffset
      .copy(shape.center)
      .multiplyScalar(state.scale)
      .applyQuaternion(session.rotation);
    state.castOrigin.copy(state.point).add(state.colliderOffset);
    state.castOrigin.z = 100;
    const hit = world.castShape(
      state.castOrigin,
      session.rotation,
      DOWN,
      collision.shape,
      0,
      200,
      true,
      undefined,
      undefined,
      collision,
      rigid,
    );
    const clearance = (reduced ? 0.025 : 0.08) * state.scale;
    state.point.z = Math.max(
      session.liftZ,
      hit
        ? 100 - hit.time_of_impact - state.colliderOffset.z + clearance
        : session.liftZ,
    );
    // No spring or interpolation: rendering and the next physics step share
    // the exact carried pose, including a release between animation frames.
    rigid.setTranslation(state.point, true);
    rigid.setNextKinematicTranslation(state.point);
    rigid.setRotation(session.rotation, true);
    rigid.setNextKinematicRotation(session.rotation);
  };
  const finish = (kind: "release" | "cancel" | "restore") => {
    const session = drag.current;
    const rigid = body.current;
    if (!session || !rigid) return;
    placeHeld();
    drag.current = null;
    cancelAnimationFrame(lostCaptureFrame.current);
    if (dragOwner.current === label) dragOwner.current = null;
    document.body.style.cursor = "";
    if (gl.domElement.hasPointerCapture(session.pointerId))
      gl.domElement.releasePointerCapture(session.pointerId);
    rigid.resetForces(false);
    rigid.resetTorques(false);
    rigid.setBodyType(rapier.RigidBodyType.Dynamic, true);
    if (kind === "restore") {
      clearVelocity();
      rigid.setTranslation(session.origin, true);
      rigid.setRotation(session.rotation, true);
      state.placed = session.placed;
    } else if (session.moved) {
      state.placed = true;
      if (kind === "release" && !reduced) {
        state.velocity.release(performance.now(), state.release);
        rigid.setLinvel(state.release, true);
        rigid.setAngvel(ZERO, true);
      } else clearVelocity();
    }
    rigid.wakeUp();
    invalidate();
  };

  // Child Rapier effects create the body/collider first. Read the actual mat transform,
  // not camera viewport: camera zoom must never move a home or resize a collider.
  useEffect(() => {
    const object = visual.current;
    const rigid = body.current;
    const collision = collider.current;
    if (!object?.parent || !rigid || !collision) return;
    object.parent.updateWorldMatrix(true, false);
    object.parent.getWorldScale(state.parentScale);
    object.parent.getWorldQuaternion(state.parentRotation);
    state.point.set(...position);
    object.parent.localToWorld(state.point);
    state.rotation
      .setFromEuler(new THREE.Euler(0, 0, angle))
      .premultiply(state.parentRotation);
    const nextScale = state.parentScale.x * size;
    const reset = state.reset !== resetGeneration;
    const changed =
      !state.initialized ||
      nextScale !== state.scale ||
      !state.home.equals(state.point) ||
      !state.homeRotation.equals(state.rotation);
    if (changed || reset) {
      state.home.copy(state.point);
      state.homeRotation.copy(state.rotation);
      finish("cancel");
      if (
        state.initialized &&
        state.placed &&
        !reset &&
        nextScale !== state.scale
      ) {
        // Retain a placed object's footprint and bottom on responsive scaling.
        // Rotated/fallen objects use their world support extent, not mat-local Z.
        state.inverseRotation.copy(rigid.rotation());
        state.matrix.makeRotationFromQuaternion(state.inverseRotation);
        const elements = state.matrix.elements;
        state.center
          .copy(shape.center)
          .multiplyScalar(state.scale)
          .applyQuaternion(state.inverseRotation);
        const bottom =
          state.center.z -
          (Math.abs(elements[2]) * state.extent.x +
            Math.abs(elements[6]) * state.extent.y +
            Math.abs(elements[10]) * state.extent.z);
        state.center.copy(rigid.translation());
        state.center.z -= bottom * (nextScale / state.scale - 1);
        rigid.setTranslation(state.center, true);
      }
      state.scale = nextScale;
      state.extent.copy(shape.half).multiplyScalar(nextScale);
      state.extent.x = Math.max(0.005, state.extent.x);
      state.extent.y = Math.max(0.005, state.extent.y);
      state.extent.z = Math.max(0.005, state.extent.z);
      collision.setHalfExtents(state.extent);
      collision.clearShapeCache();
      state.center.copy(shape.center).multiplyScalar(nextScale);
      collision.setTranslationWrtParent(state.center);
      collision.setMass(mass);
      rigid.recomputeMassPropertiesFromColliders();
      if (state.initialized && !reduced && (reset || state.returning)) {
        clearVelocity();
        state.returnPosition.copy(rigid.translation());
        state.returnRotation.copy(rigid.rotation());
        state.returnElapsed = 0;
        state.returning = true;
        rigid.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
        rigid.setNextKinematicTranslation(state.returnPosition);
        rigid.setNextKinematicRotation(state.returnRotation);
        // Returning props must not push one another away from their homes.
        collision.setEnabled(false);
      } else if (!state.initialized || reset || !state.placed) {
        state.returning = false;
        collision.setEnabled(true);
        rigid.setBodyType(rapier.RigidBodyType.Dynamic, true);
        clearVelocity();
        rigid.setTranslation(state.home, true);
        rigid.setRotation(state.homeRotation, true);
      }
      if (reset) {
        state.placed = false;
        state.focus = 0;
        state.reset = resetGeneration;
      }
      state.initialized = true;
      rigid.wakeUp();
      invalidate();
    }
    if (disabled && drag.current) finish("cancel");
    if (focus?.active && !state.suspended) {
      finish("cancel");
      clearVelocity();
      state.suspended = true;
      rigid.setEnabled(false);
      invalidate();
    }
  });

  useFrame((_, delta) => {
    state.lastFrame = performance.now();
    const object = visual.current;
    const rigid = body.current;
    if (!object?.parent || !rigid || !state.initialized) return;
    if (state.returning && !disabled) {
      state.returnElapsed += Math.min(delta, 0.05);
      const t = reduced ? 1 : Math.min(state.returnElapsed / 0.65, 1);
      const eased = t * t * (3 - 2 * t);
      state.point.lerpVectors(state.returnPosition, state.home, eased);
      state.rotation.slerpQuaternions(
        state.returnRotation,
        state.homeRotation,
        eased,
      );
      rigid.setTranslation(state.point, true);
      rigid.setNextKinematicTranslation(state.point);
      rigid.setRotation(state.rotation, true);
      rigid.setNextKinematicRotation(state.rotation);
      if (t === 1) {
        state.returning = false;
        state.placed = false;
        rigid.setBodyType(rapier.RigidBodyType.Dynamic, true);
        clearVelocity();
        collider.current?.setEnabled(true);
        rigid.recomputeMassPropertiesFromColliders();
        rigid.wakeUp();
      }
      invalidate();
    }
    const target = focus?.active ? 1 : 0;
    const progress = reduced
      ? target
      : THREE.MathUtils.damp(state.focus, target, 8, Math.min(delta, 0.05));
    state.focus = Math.abs(progress - target) < 0.0001 ? target : progress;
    object.parent.updateWorldMatrix(true, false);
    state.inverse.copy(object.parent.matrixWorld).invert();
    state.point.copy(rigid.translation());
    state.rotation.copy(rigid.rotation());
    if (
      !state.placed &&
      !state.suspended &&
      !state.returning &&
      (Math.hypot(state.point.x - state.home.x, state.point.y - state.home.y) >
        0.02 * state.scale ||
        state.rotation.angleTo(state.homeRotation) > 0.02)
    )
      state.placed = true;
    state.worldScale.setScalar(state.scale);
    state.matrix
      .compose(state.point, state.rotation, state.worldScale)
      .premultiply(state.inverse);
    state.matrix.decompose(object.position, object.quaternion, object.scale);
    if (focus && state.focus > 0) {
      state.point.set(...focus.position);
      object.position.lerp(state.point, state.focus);
      object.quaternion.slerp(state.targetRotation, state.focus);
      state.worldScale.setScalar(focus.scale);
      object.scale.lerp(state.worldScale, state.focus);
    }
    if (state.suspended && !target && state.focus === 0) {
      state.suspended = false;
      rigid.setEnabled(true);
      rigid.wakeUp();
      invalidate();
    }
    if (
      state.focus !== target ||
      (!disabled && !state.suspended && !rigid.isSleeping())
    )
      invalidate();
  });

  useEffect(() => {
    const canvas = gl.domElement;
    const move = (event: PointerEvent) => {
      const session = drag.current;
      if (!session || event.pointerId !== session.pointerId) return;
      event.stopPropagation();
      if (
        !session.moved &&
        Math.hypot(
          event.clientX - session.startX,
          event.clientY - session.startY,
        ) < 6
      )
        return;
      session.moved = true;
      state.placed = true;
      document.body.style.cursor = "grabbing";
      state.pointer.set(
        ((event.clientX - session.rect.left) / session.rect.width) * 2 - 1,
        (-(event.clientY - session.rect.top) / session.rect.height) * 2 + 1,
      );
      state.raycaster.setFromCamera(state.pointer, camera);
      if (!state.raycaster.ray.intersectPlane(state.plane, state.point)) return;
      session.target.copy(state.point);
      state.velocity.sample(
        session.target.x,
        session.target.y,
        session.target.z,
        performance.now(),
      );
      placeHeld();
      body.current?.wakeUp();
      invalidate();
    };
    const release = (event: PointerEvent) => {
      const session = drag.current;
      if (!session || event.pointerId !== session.pointerId) return;
      event.stopPropagation();
      const open =
        !disabled &&
        !session.moved &&
        Math.hypot(
          event.clientX - session.startX,
          event.clientY - session.startY,
        ) < 6;
      finish("release");
      if (open) {
        if (to === "/archive" && !reduced && document.startViewTransition) {
          document.startViewTransition(() => {
            flushSync(() => navigate(to));
          });
        } else navigate(to);
      }
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointerId) finish("cancel");
    };
    const lostCapture = (event: PointerEvent) => {
      const session = drag.current;
      if (!session || event.pointerId !== session.pointerId) return;
      // Let a pointerup reported after capture loss retain its release velocity.
      lostCaptureFrame.current = requestAnimationFrame(() => {
        if (
          drag.current === session &&
          !canvas.hasPointerCapture(session.pointerId)
        )
          finish("cancel");
      });
    };
    const interrupt = () => finish("cancel");
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        finish("restore");
      }
    };
    canvas.addEventListener("pointermove", move, true);
    canvas.addEventListener("pointerup", release, true);
    canvas.addEventListener("pointercancel", cancel, true);
    canvas.addEventListener("lostpointercapture", lostCapture);
    window.addEventListener("blur", interrupt);
    window.addEventListener("keydown", escape);
    return () => {
      canvas.removeEventListener("pointermove", move, true);
      canvas.removeEventListener("pointerup", release, true);
      canvas.removeEventListener("pointercancel", cancel, true);
      canvas.removeEventListener("lostpointercapture", lostCapture);
      window.removeEventListener("blur", interrupt);
      window.removeEventListener("keydown", escape);
    };
  });
  useEffect(
    () => () => {
      cancelAnimationFrame(lostCaptureFrame.current);
      const session = drag.current;
      if (!session) return;
      drag.current = null;
      if (dragOwner.current === label) dragOwner.current = null;
      document.body.style.cursor = "";
      if (gl.domElement.hasPointerCapture(session.pointerId))
        gl.domElement.releasePointerCapture(session.pointerId);
    },
    [dragOwner, gl, label],
  );

  return (
    <>
      {createPortal(
        <RigidBody
          ref={body}
          name={`${label} body`}
          colliders={false}
          ccd
          canSleep
          linearDamping={0.3}
          angularDamping={1.3}
          additionalSolverIterations={4}
          onWake={invalidate}
        >
          <CuboidCollider
            ref={collider}
            args={[shape.half.x, shape.half.y, Math.max(0.005, shape.half.z)]}
            mass={mass}
            friction={0.65}
            restitution={0.06}
          />
        </RigidBody>,
        scene,
      )}
      <group
        ref={visual}
        name={label}
        userData={{ deskObject: true }}
        onClick={(event) => event.stopPropagation()}
        onPointerOver={(event) => {
          if (
            disabled ||
            dragOwner.current ||
            state.focus > 0 ||
            state.returning
          )
            return;
          event.stopPropagation();
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          if (!dragOwner.current) document.body.style.cursor = "";
        }}
        onPointerDown={(event) => {
          const rigid = body.current;
          if (
            !rigid ||
            !state.initialized ||
            disabled ||
            state.focus > 0 ||
            state.returning ||
            event.button !== 0 ||
            !event.isPrimary ||
            dragOwner.current
          )
            return;
          event.stopPropagation();
          state.plane.constant = -event.point.z;
          state.rotation.copy(rigid.rotation()).invert();
          const anchor = event.point
            .clone()
            .sub(rigid.translation())
            .applyQuaternion(state.rotation);
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            placed: state.placed,
            origin: new THREE.Vector3().copy(rigid.translation()),
            rotation: new THREE.Quaternion().copy(rigid.rotation()),
            anchor,
            target: event.point.clone(),
            liftZ:
              rigid.translation().z + (reduced ? 0.12 : 0.45) * state.scale,
            rect: gl.domElement.getBoundingClientRect(),
          };
          state.velocity.reset(
            event.point.x,
            event.point.y,
            event.point.z,
            performance.now(),
          );
          dragOwner.current = label;
          gl.domElement.setPointerCapture(event.pointerId);
          clearVelocity();
          rigid.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
          rigid.setNextKinematicTranslation(drag.current.origin);
          rigid.setNextKinematicRotation(drag.current.rotation);
          // Demand rendering can leave a long idle clock delta; don't run that backlog
          // as spring substeps when the first gesture wakes the scene.
          if (performance.now() - state.lastFrame > 100) clock.getDelta();
          rigid.wakeUp();
          invalidate();
        }}
      >
        {children ?? (
          <primitive
            object={model}
            rotation={[Math.PI / 2, 0, 0]}
            dispose={null}
          />
        )}
      </group>
    </>
  );
}
