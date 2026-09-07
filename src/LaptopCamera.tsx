import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import geometry from "./laptop-geometry.json";

export type LaptopCameraProps = {
  active: boolean;
  reduced: boolean;
  origin: readonly [number, number, number];
  scale: number;
  onMovingChange: (moving: boolean) => void;
};

const REST_ZOOM = 65;
const CAMERA_DISTANCE = 18;
const TRANSITION_SECONDS = 0.8;
const LID_WIDTH = geometry.width;
const LID_HEIGHT = geometry.depth;
const HORIZONTAL_SAFE_PIXELS = 64;
const VERTICAL_SAFE_PIXELS = 144;

const SCREEN_CENTER = geometry.screenCenter;
const SCREEN_NORMAL = [0, -0.965925826, 0.258819045] as const;
const SCREEN_UP = [0, 0.258819045, 0.965925826] as const;

type Motion = {
  moving: boolean;
  elapsed: number;
  fromPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  focus: THREE.Vector3;
  fromQuaternion: THREE.Quaternion;
  targetQuaternion: THREE.Quaternion;
  lookAt: THREE.Matrix4;
  screenUp: THREE.Vector3;
  fromZoom: number;
  targetZoom: number;
};

export default function LaptopCamera({
  active,
  reduced,
  origin,
  scale,
  onMovingChange,
}: LaptopCameraProps) {
  const camera = useThree((state) => state.camera) as THREE.OrthographicCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const onMovingChangeRef = useRef(onMovingChange);
  onMovingChangeRef.current = onMovingChange;

  const motion = useMemo<Motion>(
    () => ({
      moving: false,
      elapsed: 0,
      fromPosition: new THREE.Vector3(),
      targetPosition: new THREE.Vector3(),
      focus: new THREE.Vector3(),
      fromQuaternion: new THREE.Quaternion(),
      targetQuaternion: new THREE.Quaternion(),
      lookAt: new THREE.Matrix4(),
      screenUp: new THREE.Vector3(...SCREEN_UP),
      fromZoom: REST_ZOOM,
      targetZoom: REST_ZOOM,
    }),
    [],
  );

  const setMoving = useCallback(
    (moving: boolean) => {
      if (motion.moving === moving) return;
      motion.moving = moving;
      onMovingChangeRef.current(moving);
    },
    [motion],
  );

  useLayoutEffect(() => {
    if (active) {
      motion.focus.set(
        origin[0] + SCREEN_CENTER[0] * scale,
        origin[1] + SCREEN_CENTER[1] * scale,
        origin[2] + SCREEN_CENTER[2] * scale,
      );
      motion.targetPosition.set(
        motion.focus.x + SCREEN_NORMAL[0] * CAMERA_DISTANCE,
        motion.focus.y + SCREEN_NORMAL[1] * CAMERA_DISTANCE,
        motion.focus.z + SCREEN_NORMAL[2] * CAMERA_DISTANCE,
      );
      motion.lookAt.lookAt(
        motion.targetPosition,
        motion.focus,
        motion.screenUp,
      );
      motion.targetQuaternion.setFromRotationMatrix(motion.lookAt);

      // Leave breathing room around the lid for grabbing its top edge.
      const availableWidth = Math.max(1, size.width - HORIZONTAL_SAFE_PIXELS);
      const availableHeight = Math.max(1, size.height - VERTICAL_SAFE_PIXELS);
      motion.targetZoom = Math.min(
        availableWidth / (LID_WIDTH * scale),
        availableHeight / (LID_HEIGHT * scale),
      );
    } else {
      motion.targetPosition.set(0, 0, CAMERA_DISTANCE);
      motion.targetQuaternion.identity();
      motion.targetZoom = REST_ZOOM;
    }

    const settled =
      camera.position.distanceToSquared(motion.targetPosition) < 1e-12 &&
      1 - Math.abs(camera.quaternion.dot(motion.targetQuaternion)) < 1e-12 &&
      Math.abs(camera.zoom - motion.targetZoom) < 1e-9;

    if (reduced || settled) {
      camera.position.copy(motion.targetPosition);
      camera.quaternion.copy(motion.targetQuaternion);
      camera.zoom = motion.targetZoom;
      camera.updateProjectionMatrix();
      setMoving(false);
      invalidate();
      return;
    }

    // Every retarget starts from the rendered pose, so reversal never jumps.
    motion.fromPosition.copy(camera.position);
    motion.fromQuaternion.copy(camera.quaternion);
    motion.fromZoom = camera.zoom;
    motion.elapsed = 0;
    setMoving(true);
    invalidate();
  }, [
    active,
    camera,
    invalidate,
    motion,
    origin,
    reduced,
    scale,
    setMoving,
    size.height,
    size.width,
  ]);

  useFrame((_, delta) => {
    if (!motion.moving) return;

    motion.elapsed = Math.min(
      motion.elapsed + Math.min(delta, 0.05),
      TRANSITION_SECONDS,
    );
    const progress = motion.elapsed / TRANSITION_SECONDS;
    const remainder = 1 - progress;
    const eased = 1 - remainder * remainder * remainder * remainder;

    camera.position.lerpVectors(
      motion.fromPosition,
      motion.targetPosition,
      eased,
    );
    camera.quaternion.slerpQuaternions(
      motion.fromQuaternion,
      motion.targetQuaternion,
      eased,
    );
    camera.zoom =
      motion.fromZoom + (motion.targetZoom - motion.fromZoom) * eased;
    camera.updateProjectionMatrix();

    if (progress === 1) {
      // Land on canonical values; callbacks and controls settle on the same frame.
      camera.position.copy(motion.targetPosition);
      camera.quaternion.copy(motion.targetQuaternion);
      camera.zoom = motion.targetZoom;
      camera.updateProjectionMatrix();
      setMoving(false);
      return;
    }

    invalidate();
  });

  useLayoutEffect(
    () => () => {
      camera.position.set(0, 0, CAMERA_DISTANCE);
      camera.quaternion.identity();
      camera.zoom = REST_ZOOM;
      camera.updateProjectionMatrix();
      setMoving(false);
      invalidate();
    },
    [camera, invalidate, setMoving],
  );

  return null;
}
