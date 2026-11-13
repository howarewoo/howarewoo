import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { projects } from "./book-content";
import geometry from "./laptop-geometry.json";
import SecretArcade from "./SecretArcade";

const SCREEN_TOP = geometry.depth / 2 - 0.19;

const currentProjects = projects.filter(
  (project) => !project.type.startsWith("ARCHIVED"),
);
// Favicons downloaded from each project's linked website.
const projectIcons: Record<string, string> = {
  triosens: "/textures/triosens-favicon.png",
  woostack: "/textures/woostack-favicon.svg",
  secret: "/textures/secret-lock.svg",
};
const TILE_WIDTH = 1.15;
const TILE_HEIGHT = 1.12;
const ICON_SIZE = 0.65;
const TEXTURE_SCALE = 400;

type Project = Pick<(typeof currentProjects)[number], "name" | "slug">;
const secretItem: Project = { name: "Secret", slug: "secret" };

function ProjectIcon({
  project,
  index,
  active,
  focused,
  hovered,
  onHover,
  onOpen,
}: {
  project: Project;
  index: number;
  active: boolean;
  focused: boolean;
  hovered: boolean;
  onHover: (slug: string | null) => void;
  onOpen: () => void;
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
      position={[4.25, SCREEN_TOP - 1.015 - index * 1.28, 0.025]}
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
        onOpen();
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

function DesktopMenuBar({ active }: { active: boolean }) {
  const { gl, invalidate } = useThree();
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2084;
    canvas.height = 54;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return map;
  }, [gl]);

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const date = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    let timer: ReturnType<typeof setTimeout>;
    const paint = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(235, 244, 247, 0.86)";
      context.beginPath();
      context.roundRect(0, 0, canvas.width, canvas.height, [26, 26, 0, 0]);
      context.fill();
      context.fillStyle = "#18232b";
      context.strokeStyle = "#18232b";
      context.lineWidth = 2.5;
      context.lineCap = "round";
      context.textBaseline = "middle";
      context.save();
      context.translate(27, 12);
      context.scale(1.25, 1.25);
      context.fill(
        new Path2D(
          "M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.06 7.31c1.35.07 2.29.78 3.08.84 1.18-.24 2.31-.97 3.57-.88 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.55 4.09ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.28 2.58-2.34 4.5-3.74 4.25Z",
        ),
      );
      context.restore();
      let x = 82;
      for (const label of [
        "Finder",
        "File",
        "Edit",
        "View",
        "Go",
        "Window",
        "Help",
      ]) {
        context.font = `${label === "Finder" ? 600 : 400} 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        context.fillText(label, x, 28);
        x += context.measureText(label).width + 32;
      }
      const now = new Date();
      const clock = `${date.format(now)}   ${time.format(now)}`;
      context.font =
        '400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const clockX = canvas.width - 26 - context.measureText(clock).width;
      context.fillText(clock, clockX, 28);

      // Decorative macOS status glyphs, not readings of the visitor's device.
      const controlsX = clockX - 55;
      for (const [y, knob] of [
        [20, 8],
        [35, 22],
      ]) {
        context.beginPath();
        context.moveTo(controlsX, y);
        context.lineTo(controlsX + 30, y);
        context.stroke();
        context.beginPath();
        context.arc(controlsX + knob, y, 4, 0, Math.PI * 2);
        context.fill();
      }
      const searchX = controlsX - 48;
      context.beginPath();
      context.arc(searchX, 24, 8, 0, Math.PI * 2);
      context.moveTo(searchX + 6, 30);
      context.lineTo(searchX + 13, 37);
      context.stroke();
      const wifiX = searchX - 53;
      for (const radius of [11, 20]) {
        context.beginPath();
        context.arc(wifiX, 39, radius, -Math.PI * 0.76, -Math.PI * 0.24);
        context.stroke();
      }
      context.beginPath();
      context.arc(wifiX, 37, 2.5, 0, Math.PI * 2);
      context.fill();
      const batteryX = wifiX - 77;
      context.beginPath();
      context.roundRect(batteryX, 18, 36, 19, 4);
      context.stroke();
      context.fillRect(batteryX + 4, 22, 26, 11);
      context.fillRect(batteryX + 39, 23, 3, 9);
      texture.needsUpdate = true;
      invalidate();
      if (active) timer = setTimeout(paint, 60_000 - (Date.now() % 60_000));
    };
    paint();
    return () => clearTimeout(timer);
  }, [texture, active, invalidate]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh
      name="macOS desktop menu bar"
      position={[0, SCREEN_TOP - 0.135, 0.002]}
    >
      <planeGeometry args={[10.42, 0.27]} />
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
  const [secretOpen, setSecretOpen] = useState(false);
  const openSecret = useCallback(() => setSecretOpen(true), []);
  const closeSecret = useCallback(() => {
    setSecretOpen(false);
    container.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

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
        <button
          type="button"
          tabIndex={active ? 0 : -1}
          onFocus={() => setFocused("secret")}
          onBlur={() => setFocused(null)}
          onClick={() => {
            if (active) openSecret();
          }}
          aria-label="Open secret arcade"
        >
          Secret
        </button>
      </nav>,
    );
  }, [active, portalTarget, openSecret]);

  useEffect(() => {
    if (!active || !hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [active, hovered]);

  return (
    <group
      position={geometry.screenCenter as [number, number, number]}
      rotation={[(75 * Math.PI) / 180, 0, 0]}
    >
      <DesktopMenuBar active={active} />
      {currentProjects.map((project, index) => (
        <ProjectIcon
          key={project.slug}
          project={project}
          index={index}
          active={active}
          focused={focused === project.slug}
          hovered={hovered === project.slug}
          onHover={setHovered}
          onOpen={() =>
            window.open(project.url, "_blank", "noopener,noreferrer")
          }
        />
      ))}
      <ProjectIcon
        project={secretItem}
        index={currentProjects.length}
        active={active}
        focused={focused === "secret"}
        hovered={hovered === "secret"}
        onHover={setHovered}
        onOpen={openSecret}
      />
      {secretOpen && <SecretArcade onClose={closeSecret} active={active} />}
    </group>
  );
}
