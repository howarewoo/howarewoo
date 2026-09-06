import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import DeskLighting from "./DeskLighting";
import { useNavigate } from "react-router";
import Notebook from "./Notebook";
import LaptopCamera from "./LaptopCamera";
import MatReset from "./MatReset";

const modelNames = [
  "notebook",
  "notebook-cover",
  "card",
  "disk",
  "envelope",
  "mat",
  "mat-mobile",
  "macbook",
] as const;
const modelPaths = modelNames.map((name) => `/models/${name}.glb`);
type ModelName = (typeof modelNames)[number];
const draco = new DRACOLoader()
  .setDecoderPath("/draco/")
  .setDecoderConfig({ type: "wasm" })
  .setWorkerLimit(2);
type Position = [number, number, number];
const DESK_CAMERA = { position: [0, 0, 18] as Position, zoom: 65 };
const WOOD_REPEAT_WIDTH = 24;
const WOOD_REPEAT_DEPTH = 15;
const TABLETOP_THICKNESS = 0.9;
const TABLE_WALL_GAP = 0.06;
const FLOOR_DROP = 24;

type WorkbenchProps = {
  reduced: boolean;
  bookOpen: boolean;
  laptopOpen: boolean;
  bookPage: number;
  deskActive: boolean;
  resetGeneration: number;
  resetFocused: boolean;
  onReset: () => void;
  onResetAvailableChange: (available: boolean) => void;
  onBookPageChange: (page: number) => void;
  onBookClose: () => void;
};

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  origin: THREE.Vector3;
  hadPlacement: boolean;
  offset: THREE.Vector3;
  rect: DOMRect;
  moved: boolean;
};

function DeskObject({
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
}: {
  model: THREE.Group;
  position: Position;
  angle: number;
  to: string;
  label: string;
  reduced: boolean;
  dragOwner: RefObject<string | null>;
  size?: number;
  disabled: boolean;
  resetGeneration: number;
  focus?: { active: boolean; position: Position; scale: number };
  children?: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const drag = useRef<DragSession | null>(null);
  const lostCaptureFrame = useRef(0);
  const navigate = useNavigate();
  const { invalidate, viewport, gl, camera } = useThree();
  // One synchronous owner for placement. React renders never write the transform.
  const motion = useMemo(
    () => ({
      rest: new THREE.Vector3(...position),
      placed: false,
      resetting: false,
      hover: false,
      focus: 0,
      elevation: position[2],
      sway: new THREE.Vector3(),
    }),
    [],
  );
  const scratch = useMemo(
    () => ({
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      point: new THREE.Vector3(),
      center: new THREE.Vector3(),
      bounds: new THREE.Box3(),
      sibling: new THREE.Box3(),
      worldScale: new THREE.Vector3(),
      savedPosition: new THREE.Vector3(),
      savedScale: new THREE.Vector3(),
      savedRotation: new THREE.Euler(),
    }),
    [],
  );

  const measureRestingBounds = () => {
    const object = group.current!;
    scratch.savedPosition.copy(object.position);
    scratch.savedScale.copy(object.scale);
    scratch.savedRotation.copy(object.rotation);
    object.position.copy(motion.rest);
    object.rotation.set(0, 0, angle);
    object.scale.setScalar(size);
    object.updateWorldMatrix(true, true);
    scratch.bounds.setFromObject(object);
    object.getWorldPosition(scratch.center);
    object.parent!.getWorldScale(scratch.worldScale);
    object.position.copy(scratch.savedPosition);
    object.scale.copy(scratch.savedScale);
    object.rotation.copy(scratch.savedRotation);
    object.updateWorldMatrix(false, true);
  };

  useFrame((_, elapsed) => {
    const object = group.current;
    if (!object) return;
    const dt = Math.min(elapsed, 0.05);
    if (motion.resetting) {
      const blend = reduced ? 1 : 1 - Math.exp(-14 * dt);
      motion.rest.x = THREE.MathUtils.lerp(motion.rest.x, position[0], blend);
      motion.rest.y = THREE.MathUtils.lerp(motion.rest.y, position[1], blend);
      motion.rest.z = THREE.MathUtils.lerp(motion.rest.z, position[2], blend);
      if (
        Math.abs(motion.rest.x - position[0]) +
          Math.abs(motion.rest.y - position[1]) +
          Math.abs(motion.rest.z - position[2]) <
        0.0001
      ) {
        motion.rest.set(...position);
        motion.resetting = false;
      } else invalidate();
    }
    const target = focus?.active ? 1 : 0;
    const progress = reduced
      ? target
      : THREE.MathUtils.damp(motion.focus, target, 8, dt);
    motion.focus = Math.abs(progress - target) < 0.0001 ? target : progress;
    const t = motion.focus;
    const dragging = !!drag.current?.moved;
    object.position.x = THREE.MathUtils.lerp(
      motion.rest.x,
      focus?.position[0] ?? motion.rest.x,
      t,
    );
    object.position.y = THREE.MathUtils.lerp(
      motion.rest.y,
      focus?.position[1] ?? motion.rest.y,
      t,
    );
    object.scale.setScalar(THREE.MathUtils.lerp(size, focus?.scale ?? size, t));
    const z = THREE.MathUtils.lerp(
      motion.rest.z + (dragging ? 0.28 : motion.hover && !disabled ? 0.055 : 0),
      focus?.position[2] ?? motion.rest.z,
      t,
    );
    motion.elevation = reduced
      ? z
      : THREE.MathUtils.damp(motion.elevation, z, 15, dt);
    if (Math.abs(motion.elevation - z) < 0.0001) motion.elevation = z;
    object.position.z = motion.elevation;
    const rx = reduced || !dragging ? 0 : motion.sway.x;
    const ry = reduced || !dragging ? 0 : motion.sway.y;
    const rz = THREE.MathUtils.lerp(
      angle + (reduced || !dragging ? 0 : motion.sway.z),
      0.015,
      t,
    );
    object.rotation.x = reduced
      ? rx
      : THREE.MathUtils.damp(object.rotation.x, rx, 12, dt);
    object.rotation.y = reduced
      ? ry
      : THREE.MathUtils.damp(object.rotation.y, ry, 12, dt);
    object.rotation.z = reduced
      ? rz
      : THREE.MathUtils.damp(object.rotation.z, rz, 10, dt);
    if (Math.abs(object.rotation.x - rx) < 0.0001) object.rotation.x = rx;
    if (Math.abs(object.rotation.y - ry) < 0.0001) object.rotation.y = ry;
    if (Math.abs(object.rotation.z - rz) < 0.0001) object.rotation.z = rz;
    motion.sway.multiplyScalar(Math.exp(-5 * dt));
    if (
      t !== target ||
      Math.abs(object.position.z - z) > 0.0001 ||
      Math.abs(object.rotation.x) +
        Math.abs(object.rotation.y) +
        Math.abs(object.rotation.z - rz) >
        0.0001
    )
      invalidate();
  });

  const finish = (restoreOrigin: boolean) => {
    const session = drag.current;
    const object = group.current;
    if (!session || !object) return;
    if (restoreOrigin) {
      motion.rest.copy(session.origin);
      motion.placed = session.hadPlacement;
    } else if (session.moved) {
      // Only height changes on release; the last valid XY is already committed.
      measureRestingBounds();
      const bottomOffset =
        (scratch.bounds.min.z - scratch.center.z) / scratch.worldScale.z;
      let landing = position[2];
      for (const sibling of object.parent!.children) {
        if (sibling === object || !sibling.userData.deskObject) continue;
        scratch.sibling.setFromObject(sibling);
        if (
          scratch.bounds.min.x < scratch.sibling.max.x &&
          scratch.bounds.max.x > scratch.sibling.min.x &&
          scratch.bounds.min.y < scratch.sibling.max.y &&
          scratch.bounds.max.y > scratch.sibling.min.y
        ) {
          scratch.point.copy(scratch.sibling.max);
          object.parent!.worldToLocal(scratch.point);
          landing = Math.max(landing, scratch.point.z - bottomOffset + 0.008);
        }
      }
      motion.rest.z = landing;
      motion.placed = true;
    }
    drag.current = null;
    dragOwner.current = null;
    motion.hover = false;
    document.body.style.cursor = "";
    cancelAnimationFrame(lostCaptureFrame.current);
    if (gl.domElement.hasPointerCapture(session.pointerId))
      gl.domElement.releasePointerCapture(session.pointerId);
    invalidate();
  };

  useEffect(() => {
    const canvas = gl.domElement;
    const move = (event: PointerEvent) => {
      const session = drag.current;
      if (!session || event.pointerId !== session.pointerId || !group.current)
        return;
      event.stopPropagation();
      if (
        !session.moved &&
        Math.hypot(
          event.clientX - session.startX,
          event.clientY - session.startY,
        ) < 6
      )
        return;
      if (!session.moved) document.body.style.cursor = "grabbing";
      session.moved = true;
      scratch.pointer.set(
        ((event.clientX - session.rect.left) / session.rect.width) * 2 - 1,
        (-(event.clientY - session.rect.top) / session.rect.height) * 2 + 1,
      );
      scratch.raycaster.setFromCamera(scratch.pointer, camera);
      if (!scratch.raycaster.ray.intersectPlane(scratch.plane, scratch.point))
        return;
      scratch.point.sub(session.offset);
      group.current.parent!.worldToLocal(scratch.point);
      motion.sway.set(
        THREE.MathUtils.clamp(
          (scratch.point.y - motion.rest.y) * 0.4,
          -0.065,
          0.065,
        ),
        THREE.MathUtils.clamp(
          (motion.rest.x - scratch.point.x) * 0.4,
          -0.065,
          0.065,
        ),
        THREE.MathUtils.clamp(
          (scratch.point.x - motion.rest.x) * 0.2,
          -0.045,
          0.045,
        ),
      );
      motion.rest.x = scratch.point.x;
      motion.rest.y = scratch.point.y;
      invalidate();
    };
    const release = (event: PointerEvent) => {
      const session = drag.current;
      if (!session || event.pointerId !== session.pointerId) return;
      event.stopPropagation();
      const open =
        !session.moved &&
        Math.hypot(
          event.clientX - session.startX,
          event.clientY - session.startY,
        ) < 6;
      finish(false);
      if (open) navigate(to);
    };
    const interrupt = () => finish(false);
    const cancelPointer = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointerId) finish(false);
    };
    const lostCapture = (event: PointerEvent) => {
      const session = drag.current;
      if (!session || event.pointerId !== session.pointerId) return;
      // Some browsers report loss before pointerup; let that release finish first.
      lostCaptureFrame.current = requestAnimationFrame(() => {
        if (
          drag.current === session &&
          !canvas.hasPointerCapture(session.pointerId)
        )
          finish(false);
      });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        finish(true);
      }
    };
    canvas.addEventListener("pointermove", move, true);
    canvas.addEventListener("pointerup", release, true);
    canvas.addEventListener("pointercancel", cancelPointer, true);
    canvas.addEventListener("lostpointercapture", lostCapture);
    window.addEventListener("blur", interrupt);
    window.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("pointermove", move, true);
      canvas.removeEventListener("pointerup", release, true);
      canvas.removeEventListener("pointercancel", cancelPointer, true);
      canvas.removeEventListener("lostpointercapture", lostCapture);
      window.removeEventListener("blur", interrupt);
      window.removeEventListener("keydown", key);
    };
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(lostCaptureFrame.current);
      const session = drag.current;
      if (!session) return;
      drag.current = null;
      dragOwner.current = null;
      document.body.style.cursor = "";
      if (gl.domElement.hasPointerCapture(session.pointerId))
        gl.domElement.releasePointerCapture(session.pointerId);
    },
    [dragOwner, gl],
  );

  const lastReset = useRef(resetGeneration);
  useLayoutEffect(() => {
    if (lastReset.current === resetGeneration || !group.current) return;
    lastReset.current = resetGeneration;
    const object = group.current;
    const session = drag.current;
    drag.current = null;
    cancelAnimationFrame(lostCaptureFrame.current);
    if (dragOwner.current === label) dragOwner.current = null;
    if (session && gl.domElement.hasPointerCapture(session.pointerId))
      gl.domElement.releasePointerCapture(session.pointerId);
    document.body.style.cursor = "";
    motion.rest.copy(object.position);
    motion.placed = false;
    motion.hover = false;
    motion.focus = 0;
    motion.sway.set(0, 0, 0);
    motion.elevation = object.position.z;
    motion.resetting = !reduced;
    object.rotation.set(0, 0, angle);
    object.scale.setScalar(size);
    if (reduced) {
      motion.rest.set(...position);
      motion.elevation = position[2];
      object.position.copy(motion.rest);
    }
    invalidate();
  }, [resetGeneration]);

  useLayoutEffect(() => {
    if (!group.current) return;
    finish(false);
    if (!motion.placed && !motion.resetting) motion.rest.set(...position);
    invalidate();
  }, [
    viewport.width,
    viewport.height,
    size,
    angle,
    position[0],
    position[1],
    position[2],
  ]);

  return (
    <group
      ref={group}
      name={label}
      userData={{ deskObject: true }}
      onPointerOver={(event) => {
        if (disabled || dragOwner.current) return;
        event.stopPropagation();
        motion.hover = true;
        document.body.style.cursor = "grab";
        invalidate();
      }}
      onPointerOut={() => {
        if (drag.current) return;
        motion.hover = false;
        if (!dragOwner.current) document.body.style.cursor = "";
        invalidate();
      }}
      onPointerDown={(event) => {
        if (
          disabled ||
          motion.focus > 0.001 ||
          event.button !== 0 ||
          !event.isPrimary ||
          dragOwner.current ||
          !group.current
        )
          return;
        event.stopPropagation();
        if (!event.ray.intersectPlane(scratch.plane, scratch.point)) return;
        if (motion.resetting) {
          motion.resetting = false;
          motion.rest.copy(group.current.position);
          motion.elevation = group.current.position.z;
          motion.placed = true;
        }
        group.current.getWorldPosition(scratch.center);
        const offset = scratch.point.clone().sub(scratch.center);
        offset.z = 0;
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          origin: motion.rest.clone(),
          hadPlacement: motion.placed,
          offset,
          rect: gl.domElement.getBoundingClientRect(),
          moved: false,
        };
        dragOwner.current = label;
        gl.domElement.setPointerCapture(event.pointerId);
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
  );
}

function Scene({
  reduced,
  bookOpen,
  laptopOpen,
  bookPage,
  deskActive,
  resetGeneration,
  resetFocused,
  onReset,
  onResetAvailableChange,
  onBookPageChange,
  onBookClose,
}: WorkbenchProps) {
  const { size, gl, invalidate } = useThree();
  // Desk layout must not resize itself when the focus camera changes zoom.
  const viewport = useMemo(
    () => ({ width: size.width / 65, height: size.height / 65 }),
    [size.width, size.height],
  );
  const [cameraMoving, setCameraMoving] = useState(false);
  const navigate = useNavigate();
  const deskDisabled = !deskActive || bookOpen || laptopOpen || cameraMoving;
  useEffect(() => {
    onResetAvailableChange(!deskDisabled);
    return () => onResetAvailableChange(false);
  }, [deskDisabled, onResetAvailableChange]);
  const dragOwner = useRef<string | null>(null);
  const mobile = size.width < 650;
  const loaded = useLoader(GLTFLoader, modelPaths, (loader) =>
    loader.setDRACOLoader(draco),
  );
  const [wood, woodNormal, woodRoughness] = useLoader(THREE.TextureLoader, [
    "/textures/wood.jpg",
    "/textures/wood-normal.jpg",
    "/textures/wood-roughness.jpg",
  ]);
  const models = useMemo(() => {
    const result = {} as Record<ModelName, THREE.Group>;
    loaded.forEach((asset, index) => {
      asset.scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial) {
              material.envMapIntensity = 0.55;
              if (material.normalMap)
                material.normalMap.anisotropy = Math.min(
                  8,
                  gl.capabilities.getMaxAnisotropy(),
                );
            }
          }
        }
      });
      result[modelNames[index]] = asset.scene;
    });
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return result;
  }, [loaded, wood, gl]);
  const scale = mobile
    ? Math.min(viewport.width / 9, viewport.height / 13)
    : Math.min(viewport.width / 16.4, viewport.height / 11.2);
  const openScale = mobile
    ? Math.min((viewport.width - 0.65) / 3.85, (viewport.height - 1.7) / 5.25)
    : Math.min((viewport.width - 2.4) / 7.65, (viewport.height - 2) / 5.3, 1.8);
  const laptopScale = Math.min(1.05, viewport.width / 12);
  const laptopOrigin = useMemo<Position>(
    () => [
      0,
      viewport.height / 2 +
        3.75 * laptopScale -
        Math.max(0.8 * laptopScale, mobile ? 48 / 65 : 0),
      -0.09 * scale,
    ],
    [viewport.height, laptopScale, mobile, scale],
  );
  const wallY = laptopOrigin[1] + 6.1 * laptopScale;
  const deskWidth = Math.max(42 * laptopScale, viewport.width + 6);
  const deskLeft = -deskWidth / 2;
  const deskFront = -viewport.height / 2 - 3.5;
  const deskBack = wallY - TABLE_WALL_GAP;
  const deskDepth = deskBack - deskFront;
  const deskCenterY = (deskFront + deskBack) / 2;
  const tabletopZ = laptopOrigin[2];
  const floorZ = tabletopZ - FLOOR_DROP * laptopScale;
  const floorFront = deskFront - 5;
  const floorDepth = wallY - floorFront;
  const wallWidth = deskWidth + 8;
  const wallHeight = tabletopZ + 15 - floorZ;
  useLayoutEffect(() => {
    for (const texture of [wood, woodNormal, woodRoughness]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(
        deskWidth / WOOD_REPEAT_WIDTH,
        deskDepth / WOOD_REPEAT_DEPTH,
      );
      // Anchor the grain in world space so responsive desk sizing never
      // changes either its scale or its phase beneath the objects.
      texture.offset.set(
        deskLeft / WOOD_REPEAT_WIDTH,
        deskFront / WOOD_REPEAT_DEPTH,
      );
      texture.needsUpdate = true;
    }
    invalidate();
  }, [
    deskDepth,
    deskFront,
    deskLeft,
    deskWidth,
    invalidate,
    wood,
    woodNormal,
    woodRoughness,
  ]);
  return (
    <>
      <DeskLighting />
      <LaptopCamera
        active={laptopOpen}
        reduced={reduced}
        origin={laptopOrigin}
        scale={laptopScale}
        onMovingChange={setCameraMoving}
      />
      <group
        name="MacBook Pro"
        position={laptopOrigin}
        scale={laptopScale}
        onPointerOver={(event) => {
          if (deskDisabled || dragOwner.current) return;
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          if (!dragOwner.current) document.body.style.cursor = "";
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (deskDisabled || dragOwner.current) return;
          document.body.style.cursor = "";
          navigate("/laptop");
        }}
      >
        <primitive
          object={models.macbook}
          rotation={[Math.PI / 2, 0, 0]}
          dispose={null}
        />
      </group>
      <mesh
        name="Tabletop slab"
        castShadow
        receiveShadow
        position={[0, deskCenterY, tabletopZ - TABLETOP_THICKNESS / 2]}
      >
        <boxGeometry args={[deskWidth, deskDepth, TABLETOP_THICKNESS]} />
        <meshStandardMaterial
          color="#4b2d1c"
          roughness={0.82}
          envMapIntensity={0.16}
        />
      </mesh>
      <mesh
        name="Tabletop wood surface"
        receiveShadow
        position={[0, deskCenterY, tabletopZ + 0.002]}
      >
        <planeGeometry args={[deskWidth, deskDepth]} />
        <meshPhysicalMaterial
          map={wood}
          normalMap={woodNormal}
          roughnessMap={woodRoughness}
          normalScale={[0.075, 0.075]}
          roughness={1}
          specularIntensity={0.55}
          envMapIntensity={0.2}
        />
      </mesh>
      <mesh
        name="Room floor"
        receiveShadow
        position={[0, (floorFront + wallY) / 2, floorZ]}
      >
        <planeGeometry args={[wallWidth, floorDepth]} />
        <meshStandardMaterial
          color="#857e73"
          roughness={1}
          envMapIntensity={0.12}
        />
      </mesh>
      <mesh
        name="Room wall"
        receiveShadow
        position={[0, wallY, floorZ + wallHeight / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[wallWidth, wallHeight]} />
        <meshStandardMaterial
          color="#eee7dc"
          roughness={0.95}
          envMapIntensity={0.15}
        />
      </mesh>
      {bookOpen && !cameraMoving && (
        <mesh
          position={[0, 0, 3]}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onBookClose();
          }}
        >
          <planeGeometry args={[viewport.width, viewport.height]} />
          <meshBasicMaterial
            color="#241c12"
            transparent
            opacity={0.25}
            depthWrite={false}
          />
        </mesh>
      )}
      <group scale={scale} rotation={[0, 0, -0.015]}>
        <primitive
          object={mobile ? models["mat-mobile"] : models.mat}
          rotation={[Math.PI / 2, 0, 0]}
          dispose={null}
        />
        <MatReset
          mobile={mobile}
          disabled={deskDisabled}
          focused={resetFocused}
          onReset={onReset}
          dragOwner={dragOwner}
        />
        <DeskObject
          model={models.notebook}
          position={mobile ? [-1.45, 2.4, 0.014] : [-3.3, 0.65, 0.014]}
          angle={-0.13}
          to="/projects"
          label="Selected work"
          reduced={reduced}
          dragOwner={dragOwner}
          disabled={deskDisabled}
          resetGeneration={resetGeneration}
          focus={{
            active: bookOpen && !cameraMoving,
            position: [mobile ? 0 : (1.77 * openScale) / scale, 0, 4 / scale],
            scale: openScale / scale,
          }}
          size={mobile ? 0.87 : 1}
        >
          <Notebook
            body={models.notebook}
            cover={models["notebook-cover"]}
            open={bookOpen && !cameraMoving}
            reduced={reduced}
            page={bookPage}
            onPageChange={onBookPageChange}
          />
        </DeskObject>
        <DeskObject
          model={models.card}
          position={mobile ? [1.7, -0.05, 0.02] : [2, 2.4, 0.014]}
          angle={0.09}
          to="/about"
          label="About Adam"
          reduced={reduced}
          dragOwner={dragOwner}
          disabled={deskDisabled}
          resetGeneration={resetGeneration}
          size={mobile ? 0.9 : 1}
        />
        <DeskObject
          model={models.disk}
          position={mobile ? [-1.5, -2.6, 0.014] : [0.7, -1.9, 0.014]}
          angle={0.12}
          to="/archive"
          label="Archive"
          reduced={reduced}
          dragOwner={dragOwner}
          disabled={deskDisabled}
          resetGeneration={resetGeneration}
        />
        <DeskObject
          model={models.envelope}
          position={mobile ? [1.6, -4, 0.03] : [4.7, -1.75, 0.014]}
          angle={-0.16}
          to="/contact"
          label="Contact"
          reduced={reduced}
          dragOwner={dragOwner}
          disabled={deskDisabled}
          resetGeneration={resetGeneration}
          size={mobile ? 0.87 : 1}
        />
      </group>
    </>
  );
}

export default function Workbench(props: WorkbenchProps) {
  return (
    <Canvas
      frameloop="demand"
      shadows={{ type: THREE.PCFShadowMap }}
      orthographic
      camera={DESK_CAMERA}
      dpr={[1, 1.5]}
      gl={{
        alpha: true,
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
      fallback={
        <p className="scene-message">
          3D isn’t available on this device. Open the desk index to explore.
        </p>
      }
    >
      <Scene {...props} />
    </Canvas>
  );
}
