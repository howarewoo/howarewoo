import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const ROWS = 20;
const COLUMNS = 3;
const COUNT = (ROWS + 1) * COLUMNS;
// Keep the section threaded through the pages secured through the cover lip.
const PINNED = COLUMNS * 6;

export default function RibbonBookmark({ reduced }: { reduced: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { invalidate } = useThree();
  const cloth = useMemo(() => {
    const rest = new Float64Array(COUNT * 3);
    const position = new Float64Array(COUNT * 3);
    const previous = new Float64Array(COUNT * 3);
    const uv = new Float32Array(COUNT * 2);
    const indices: number[] = [];
    const constraints: {
      a: number;
      b: number;
      length: number;
      stiffness: number;
    }[] = [];
    for (let row = 0; row <= ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const id = row * COLUMNS + column;
        const securedRows = PINNED / COLUMNS - 1;
        const length =
          row <= securedRows
            ? row * 0.051
            : securedRows * 0.051 +
              ((row - securedRows) / (ROWS - securedRows)) * 0.42;
        rest[id * 3] = 0.8 + (column - 1) * 0.08;
        rest[id * 3 + 1] = -2.23 - length;
        rest[id * 3 + 2] = Math.max(
          0.014,
          0.235 - Math.max(0, length - 0.14) * 0.55,
        );
        uv[id * 2] = column / (COLUMNS - 1);
        uv[id * 2 + 1] = 1 - row / ROWS;
        if (row < ROWS && column < COLUMNS - 1) {
          indices.push(
            id,
            id + COLUMNS,
            id + 1,
            id + 1,
            id + COLUMNS,
            id + COLUMNS + 1,
          );
        }
      }
    }
    const connect = (a: number, b: number, stiffness: number) => {
      constraints.push({
        a,
        b,
        stiffness,
        length: Math.hypot(
          rest[a * 3] - rest[b * 3],
          rest[a * 3 + 1] - rest[b * 3 + 1],
          rest[a * 3 + 2] - rest[b * 3 + 2],
        ),
      });
    };
    for (let row = 0; row <= ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const id = row * COLUMNS + column;
        if (column < COLUMNS - 1) connect(id, id + 1, 1);
        if (row < ROWS) {
          connect(id, id + COLUMNS, 1);
          if (column < COLUMNS - 1) {
            connect(id, id + COLUMNS + 1, 0.8);
            connect(id + 1, id + COLUMNS, 0.8);
          }
        }
        if (row < ROWS - 1) connect(id, id + COLUMNS * 2, 0.8);
        if (row < ROWS - 3) connect(id, id + COLUMNS * 4, 0.5);
        if (row < ROWS - 7) connect(id, id + COLUMNS * 8, 0.2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(rest), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0.8, -2.65, 0.2),
      2,
    );

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 512;
    const context = canvas.getContext("2d")!;
    const pixels = context.createImageData(128, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 128; x++) {
        const offset = (y * 128 + x) * 4;
        const weave =
          (x % 8 < 4 !== y % 8 < 4 ? 12 : -9) + (x % 4 === 0 ? -10 : 0);
        const edge = x < 6 || x > 121 ? -22 : 0;
        pixels.data[offset] = 190 + weave + edge;
        pixels.data[offset + 1] = 158 + weave + edge;
        pixels.data[offset + 2] = 99 + weave + edge;
        pixels.data[offset + 3] = y > 505 + ((x * 17) % 7) ? 0 : 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshPhysicalMaterial({
      map: texture,
      bumpMap: texture,
      bumpScale: 0.007,
      roughness: 0.94,
      metalness: 0,
      sheen: 0.55,
      sheenRoughness: 0.9,
      sheenColor: new THREE.Color("#e2cf9e"),
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    });
    return {
      geometry,
      material,
      texture,
      rest,
      position,
      previous,
      constraints,
      initialized: false,
      accumulator: 0,
      quietFrames: 0,
    };
  }, []);
  const scratch = useMemo(
    () => ({
      point: new THREE.Vector3(),
      inverse: new THREE.Matrix4(),
      matrix: new THREE.Matrix4(),
    }),
    [],
  );
  useEffect(
    () => () => {
      cloth.geometry.dispose();
      cloth.material.dispose();
      cloth.texture.dispose();
    },
    [cloth],
  );
  useEffect(() => {
    cloth.quietFrames = 0;
    invalidate();
  }, [cloth, reduced, invalidate]);

  useFrame((_, delta) => {
    const object = mesh.current;
    if (!object) return;
    object.updateWorldMatrix(true, false);
    const moved = !scratch.matrix.equals(object.matrixWorld);
    scratch.matrix.copy(object.matrixWorld);
    scratch.inverse.copy(object.matrixWorld).invert();
    const elements = object.matrixWorld.elements;
    const scale = Math.hypot(elements[0], elements[1], elements[2]);
    const pin = (id: number) => {
      scratch.point.fromArray(cloth.rest, id * 3).applyMatrix4(scratch.matrix);
      scratch.point.toArray(cloth.position, id * 3);
      scratch.point.toArray(cloth.previous, id * 3);
    };
    if (!cloth.initialized || reduced) {
      for (let id = 0; id < COUNT; id++) {
        pin(id);
        if (id >= PINNED) {
          const z = id * 3 + 2;
          cloth.position[z] = cloth.previous[z] = Math.max(
            0.008,
            cloth.position[z],
          );
        }
      }
      cloth.initialized = true;
      cloth.accumulator = 0;
    } else {
      cloth.accumulator += Math.min(delta, 0.05);
      const dt = 1 / 120;
      while (cloth.accumulator >= dt) {
        cloth.accumulator -= dt;
        for (let id = 0; id < COUNT; id++) {
          if (id < PINNED) {
            pin(id);
            continue;
          }
          const offset = id * 3;
          for (let axis = 0; axis < 3; axis++) {
            const value = cloth.position[offset + axis];
            const velocity = (value - cloth.previous[offset + axis]) * 0.9;
            cloth.position[offset + axis] +=
              velocity + (axis === 2 ? -12 * dt * dt : 0);
            cloth.previous[offset + axis] = value;
          }
        }
        for (let iteration = 0; iteration < 14; iteration++) {
          for (const { a, b, length, stiffness } of cloth.constraints) {
            const wa = a < PINNED ? 0 : 1;
            const wb = b < PINNED ? 0 : 1;
            if (!wa && !wb) continue;
            const ai = a * 3;
            const bi = b * 3;
            const dx = cloth.position[bi] - cloth.position[ai];
            const dy = cloth.position[bi + 1] - cloth.position[ai + 1];
            const dz = cloth.position[bi + 2] - cloth.position[ai + 2];
            const distance = Math.hypot(dx, dy, dz);
            if (distance < 1e-9) continue;
            const correction =
              (((distance - length * scale) / distance) * stiffness) /
              (wa + wb);
            cloth.position[ai] += dx * correction * wa;
            cloth.position[ai + 1] += dy * correction * wa;
            cloth.position[ai + 2] += dz * correction * wa;
            cloth.position[bi] -= dx * correction * wb;
            cloth.position[bi + 1] -= dy * correction * wb;
            cloth.position[bi + 2] -= dz * correction * wb;
          }
          for (let id = PINNED; id < COUNT; id++) {
            const offset = id * 3;
            scratch.point
              .fromArray(cloth.position, offset)
              .applyMatrix4(scratch.inverse);
            // Keep entire ribbon faces outside the cover's exit plane, rather
            // than letting edges cut through the lip between colliding vertices.
            // The free tail can still bend sideways and vertically.
            if (scratch.point.y > -2.49) scratch.point.y = -2.49;
            scratch.point
              .applyMatrix4(scratch.matrix)
              .toArray(cloth.position, offset);
            if (cloth.position[offset + 2] < 0.008) {
              cloth.position[offset + 2] = 0.008;
              cloth.previous[offset + 2] = 0.008;
              if (iteration === 13) {
                cloth.previous[offset] +=
                  (cloth.position[offset] - cloth.previous[offset]) * 0.25;
                cloth.previous[offset + 1] +=
                  (cloth.position[offset + 1] - cloth.previous[offset + 1]) *
                  0.25;
              }
            }
          }
        }
      }
    }
    const positions = cloth.geometry.attributes
      .position as THREE.BufferAttribute;
    for (let id = 0; id < COUNT; id++) {
      scratch.point
        .fromArray(cloth.position, id * 3)
        .applyMatrix4(scratch.inverse);
      positions.setXYZ(id, scratch.point.x, scratch.point.y, scratch.point.z);
    }
    positions.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
    let energy = 0;
    for (let offset = PINNED * 3; offset < cloth.position.length; offset++) {
      const velocity = cloth.position[offset] - cloth.previous[offset];
      energy = Math.max(energy, velocity * velocity);
    }
    cloth.quietFrames = moved || energy > 1e-8 ? 0 : cloth.quietFrames + 1;
    if (!reduced && cloth.quietFrames < 12) invalidate();
  });

  return (
    <mesh
      ref={mesh}
      name="Woven fabric bookmark"
      geometry={cloth.geometry}
      material={cloth.material}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
