import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export default function MatReset({
  mobile,
  disabled,
  focused,
  onReset,
  dragOwner,
}: {
  mobile: boolean;
  disabled: boolean;
  focused: boolean;
  onReset: () => void;
  dragOwner: RefObject<string | null>;
}) {
  const { invalidate, gl } = useThree();
  const [hovered, setHovered] = useState(false);
  // Match the centered square-cell layout in build_mat_texture.py.
  const columns = mobile ? 9 : 17;
  const rows = mobile ? 14 : 11;
  const cell = Math.min(
    ((mobile ? 8 : 15) - 0.6) / columns,
    ((mobile ? 12 : 10) - 0.6) / rows,
  );
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return map;
  }, [gl]);
  useLayoutEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const active = !disabled && (hovered || focused);
    ctx.fillStyle = active ? "#ffffff" : "#e2eee3";
    ctx.strokeStyle = ctx.fillStyle;
    if (focused && !disabled) {
      ctx.lineWidth = 10;
      ctx.strokeRect(28, 28, 456, 456);
    }
    // A single counter-clockwise arrow, screenprinted into the grid cell.
    ctx.lineWidth = active ? 23 : 19;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(256, 256, 124, -Math.PI * 0.75, Math.PI * 0.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(168, 106);
    ctx.lineTo(168, 168);
    ctx.lineTo(230, 168);
    ctx.stroke();
    texture.needsUpdate = true;
    invalidate();
  }, [texture, hovered, focused, disabled, invalidate]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    if (disabled) {
      setHovered(false);
      if (!dragOwner.current) document.body.style.cursor = "";
    }
  }, [disabled, dragOwner]);
  return (
    <mesh
      name="Reset desk objects"
      visible={!disabled}
      position={[-((columns - 1) * cell) / 2, ((rows - 1) * cell) / 2, 0.015]}
      onPointerOver={(event) => {
        if (disabled || dragOwner.current) return;
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        if (!dragOwner.current) document.body.style.cursor = "";
      }}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0 || !event.isPrimary) return;
        event.stopPropagation();
      }}
      onClick={(event) => {
        if (disabled || dragOwner.current) return;
        event.stopPropagation();
        setHovered(false);
        onReset();
      }}
    >
      <planeGeometry args={[cell, cell]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
