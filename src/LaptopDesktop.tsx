import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { projects } from "./book-content";

const currentProjects = projects.filter(
  (project) => !project.type.startsWith("ARCHIVED"),
);
// Favicons downloaded from each project's linked website.
const projectIcons: Record<string, string> = {
  triosens: "/textures/triosens-favicon.png",
  woostack: "/textures/woostack-favicon.svg",
};
const TILE_WIDTH = 1.15;
const TILE_HEIGHT = 1.12;
const ICON_SIZE = 0.65;
const TEXTURE_SCALE = 400;

type Project = (typeof currentProjects)[number];

function ProjectIcon({
  project,
  index,
  active,
  focused,
  hovered,
  onHover,
}: {
  project: Project;
  index: number;
  active: boolean;
  focused: boolean;
  hovered: boolean;
  onHover: (slug: string | null) => void;
}) {
  const { gl, invalidate } = useThree();
  const [favicon, setFavicon] = useState<HTMLImageElement | null>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(TILE_WIDTH * TEXTURE_SCALE);
    canvas.height = Math.round(TILE_HEIGHT * TEXTURE_SCALE);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return map;
  }, [gl]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setFavicon(image);
    image.src = projectIcons[project.slug];
    return () => {
      image.onload = null;
    };
  }, [project.slug]);

  useLayoutEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const iconSize = ICON_SIZE * TEXTURE_SCALE;
    const iconX = (canvas.width - iconSize) / 2;
    const iconY = 30;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f5f4ef";
    context.beginPath();
    context.roundRect(iconX, iconY, iconSize, iconSize, 38);
    context.fill();
    if (favicon) {
      // Drawing through a canvas also rasterizes the local SVG favicon for WebGL.
      const inset = 32;
      const scale =
        (iconSize - inset * 2) /
        Math.max(favicon.naturalWidth, favicon.naturalHeight);
      const width = favicon.naturalWidth * scale;
      const height = favicon.naturalHeight * scale;
      context.drawImage(
        favicon,
        iconX + (iconSize - width) / 2,
        iconY + (iconSize - height) / 2,
        width,
        height,
      );
    }
    context.font =
      '500 52px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    const captionWidth = Math.min(
      canvas.width - 28,
      context.measureText(project.name).width + 28,
    );
    context.fillStyle =
      active && (focused || hovered) ? "#175cb9" : "rgba(14, 29, 44, 0.84)";
    context.beginPath();
    context.roundRect(
      (canvas.width - captionWidth) / 2,
      312,
      captionWidth,
      72,
      12,
    );
    context.fill();
    context.fillStyle = "#ffffff";
    context.fillText(project.name, canvas.width / 2, 348, canvas.width - 48);
    if (active && focused) {
      context.strokeStyle = "#ffffff";
      context.lineWidth = 7;
      context.beginPath();
      context.roundRect(9, 9, canvas.width - 18, canvas.height - 18, 30);
      context.stroke();
    }
    texture.needsUpdate = true;
    invalidate();
  }, [texture, favicon, project.name, active, focused, hovered, invalidate]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh
      name={`${project.name} project link`}
      position={[4.25, 2.22 - index * 1.28, 0.025]}
      onPointerOver={(event) => {
        if (!active) return;
        event.stopPropagation();
        onHover(project.slug);
      }}
      onPointerOut={() => onHover(null)}
      onPointerDown={(event) => {
        if (!active || event.button !== 0) return;
        event.stopPropagation();
      }}
      onClick={(event) => {
        if (!active || event.button !== 0) return;
        event.stopPropagation();
        window.open(project.url, "_blank", "noopener,noreferrer");
      }}
    >
      <planeGeometry args={[TILE_WIDTH, TILE_HEIGHT]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

export default function LaptopDesktop({ active }: { active: boolean }) {
  const gl = useThree((state) => state.gl);
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const portalTarget = gl.domElement.closest(".desk-world");
  const root = useRef<Root | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!portalTarget) return;
    const element = document.createElement("div");
    // Native links are keyboard/screen-reader access only. All visible pixels
    // belong to the lid meshes and render in the same frame as LaptopCamera.
    Object.assign(element.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clipPath: "inset(50%)",
      whiteSpace: "nowrap",
      border: "0",
    });
    portalTarget.appendChild(element);
    container.current = element;
    const desktopRoot = createRoot(element);
    root.current = desktopRoot;
    return () => {
      root.current = null;
      container.current = null;
      element.remove();
      queueMicrotask(() => desktopRoot.unmount());
    };
  }, [portalTarget]);

  useLayoutEffect(() => {
    if (!active) {
      const element = document.activeElement;
      if (
        element instanceof HTMLElement &&
        container.current?.contains(element)
      )
        element.blur();
      setFocused(null);
      setHovered(null);
    }
    root.current?.render(
      <nav aria-label="Current projects" aria-hidden={!active}>
        {currentProjects.map((project) => (
          <a
            key={project.slug}
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={active ? 0 : -1}
            onFocus={() => setFocused(project.slug)}
            onBlur={() => setFocused(null)}
            onClick={(event) => {
              if (!active) event.preventDefault();
            }}
            aria-label={`${project.name} — ${project.link} (opens in a new tab)`}
          >
            {project.name}
          </a>
        ))}
      </nav>,
    );
  }, [active, portalTarget]);

  useEffect(() => {
    if (!active || !hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [active, hovered]);

  return (
    <group position={[0, 4.3, 3.62]} rotation={[(75 * Math.PI) / 180, 0, 0]}>
      {currentProjects.map((project, index) => (
        <ProjectIcon
          key={project.slug}
          project={project}
          index={index}
          active={active}
          focused={focused === project.slug}
          hovered={hovered === project.slug}
          onHover={setHovered}
        />
      ))}
    </group>
  );
}
