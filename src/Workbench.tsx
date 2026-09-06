import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import DeskLighting from "./DeskLighting";
import { useNavigate } from "react-router";
import Notebook from "./Notebook";
import LaptopCamera from "./LaptopCamera";
import MatReset from "./MatReset";
import { CuboidCollider, Physics, RigidBody } from "@react-three/rapier";
import PhysicsObject from "./PhysicsObject";
import { bookSpreads } from "./book-content";
import { passportSpreads, passportPageImages } from "./passport-content";

const modelNames = [
  "notebook",
  "notebook-cover",
  "passport",
  "passport-cover",
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
  passportOpen: boolean;
  passportPage: number;
  onPassportPageChange: (page: number) => void;
  deskActive: boolean;
  resetGeneration: number;
  resetFocused: boolean;
  onReset: () => void;
  onResetAvailableChange: (available: boolean) => void;
  onBookPageChange: (page: number) => void;
  onBookClose: () => void;
};

function Scene({
  reduced,
  bookOpen,
  laptopOpen,
  bookPage,
  passportOpen,
  passportPage,
  onPassportPageChange,
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
  const passportScale = Math.min(
    (viewport.width - 0.4) / 5,
    (viewport.height - 0.6) / 7.6,
  );
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
    <Physics
      gravity={[0, 0, -25]}
      timeStep={1 / 120}
      interpolate={false}
      updatePriority={-50}
      numSolverIterations={8}
      maxCcdSubsteps={4}
      paused={deskDisabled}
    >
      <DeskLighting />
      <RigidBody type="fixed" colliders={false} name="Desk and room colliders">
        <CuboidCollider
          args={[deskWidth / 2, deskDepth / 2, TABLETOP_THICKNESS / 2]}
          position={[0, deskCenterY, tabletopZ - TABLETOP_THICKNESS / 2]}
          friction={0.55}
        />
        <CuboidCollider
          args={[wallWidth / 2, 0.1, wallHeight / 2]}
          position={[0, wallY + 0.1, floorZ + wallHeight / 2]}
        />
        {/* The room floor continues outside the visible crop to catch thrown props. */}
        <CuboidCollider
          args={[500, 500, 0.1]}
          position={[0, 0, floorZ - 0.1]}
          friction={0.7}
        />
      </RigidBody>
      <RigidBody
        type="fixed"
        colliders={false}
        position={laptopOrigin}
        scale={laptopScale}
        name="Laptop colliders"
      >
        <CuboidCollider args={[5.4, 3.75, 0.165]} position={[0, 0, 0.165]} />
        <CuboidCollider
          args={[5.4, 3.425, 0.08]}
          position={[0, 4.377, 3.599]}
          rotation={[(75 * Math.PI) / 180, 0, 0]}
        />
      </RigidBody>
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
      {(bookOpen || passportOpen) && !cameraMoving && (
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
        <RigidBody type="fixed" colliders={false} name="Cutting mat collider">
          <CuboidCollider
            args={[mobile ? 4 : 7.5, mobile ? 6 : 5, 0.035]}
            position={[0, 0, -0.035]}
            friction={0.65}
          />
        </RigidBody>
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
        <PhysicsObject
          model={models.notebook}
          collisionCover={models["notebook-cover"]}
          mass={0.6}
          position={mobile ? [-1.55, 2.4, 0.014] : [-3.3, 0.65, 0.014]}
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
            spreads={bookSpreads}
          />
        </PhysicsObject>
        <PhysicsObject
          model={models.passport}
          collisionCover={models["passport-cover"]}
          mass={0.09}
          position={mobile ? [1.85, -0.4, 0.02] : [2, 2.4, 0.014]}
          angle={0.09}
          to="/about"
          label="About Adam"
          reduced={reduced}
          dragOwner={dragOwner}
          disabled={deskDisabled}
          resetGeneration={resetGeneration}
          size={mobile ? 0.6 : 0.7}
          focus={{
            active: passportOpen && !cameraMoving,
            position: [0, (-1.77 * passportScale) / scale, 4 / scale],
            scale: passportScale / scale,
          }}
        >
          <Notebook
            body={models.passport}
            cover={models["passport-cover"]}
            open={passportOpen && !cameraMoving}
            reduced={reduced}
            page={passportPage}
            onPageChange={onPassportPageChange}
            spreads={passportSpreads}
            pageImages={passportPageImages}
            vertical
          />
        </PhysicsObject>
        <PhysicsObject
          model={models.disk}
          mass={0.085}
          position={mobile ? [-1.5, -2.6, 0.014] : [0.7, -1.9, 0.014]}
          angle={0.12}
          to="/archive"
          label="Archive"
          reduced={reduced}
          dragOwner={dragOwner}
          disabled={deskDisabled}
          resetGeneration={resetGeneration}
        />
        <PhysicsObject
          model={models.envelope}
          mass={0.06}
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
    </Physics>
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
