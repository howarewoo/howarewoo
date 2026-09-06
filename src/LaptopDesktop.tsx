import { useLayoutEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { projects } from "./book-content";

const currentProjects = projects.filter((project) => !project.type.startsWith("ARCHIVED"));
// Favicons downloaded from each project's linked website.
const projectIcons: Record<string, string> = {
  triosens: "/textures/triosens-favicon.png",
  woostack: "/textures/woostack-favicon.svg",
};
const ICON_WIDTH = 144;
const ICON_HEIGHT = 132;

export default function LaptopDesktop({ active }: { active: boolean }) {
  const { gl, size } = useThree();
  const screen = useRef<THREE.Group>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const points = useMemo(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], []);
  const portalTarget = gl.domElement.closest(".desk-world");
  const root = useRef<Root | null>(null);

  useLayoutEffect(() => {
    if (!portalTarget) return;
    const container = document.createElement("div");
    container.className = "laptop-desktop";
    portalTarget.appendChild(container);
    const desktopRoot = createRoot(container);
    root.current = desktopRoot;
    return () => {
      root.current = null;
      container.remove();
      queueMicrotask(() => desktopRoot.unmount());
    };
  }, [portalTarget]);

  // The orthographic camera makes the screen projection affine. Project the
  // actual lid plane so native links stay attached during camera transitions.
  useFrame(({ camera }) => {
    if (!screen.current) return;
    screen.current.updateWorldMatrix(true, false);
    const width = size.width < 650 ? 2.1 : 1.65;
    const height = width * ICON_HEIGHT / ICON_WIDTH;
    currentProjects.forEach((_, index) => {
      const link = links.current[index];
      if (!link) return;
      const x = 4.85 - width;
      const y = 2.95 - index * (height + 0.3);
      points[0].set(x, y, 0.012);
      points[1].set(x + width, y, 0.012);
      points[2].set(x, y - height, 0.012);
      for (const point of points) {
        point.applyMatrix4(screen.current!.matrixWorld).project(camera);
        point.x = (point.x + 1) * size.width / 2;
        point.y = (1 - point.y) * size.height / 2;
      }
      const [origin, right, bottom] = points;
      link.style.transform = `matrix(${(right.x - origin.x) / ICON_WIDTH}, ${(right.y - origin.y) / ICON_WIDTH}, ${(bottom.x - origin.x) / ICON_HEIGHT}, ${(bottom.y - origin.y) / ICON_HEIGHT}, ${origin.x}, ${origin.y})`;
      link.style.visibility = "visible";
    });
  });

  useLayoutEffect(() => {
    root.current?.render(
        <nav aria-label="Current projects" aria-hidden={!active}>
          {currentProjects.map((project, index) => (
            <a
              key={project.slug}
              ref={(element) => { links.current[index] = element; }}
              className="desktop-project"
              href={project.url}
              target="_blank"
              rel="noreferrer"
              tabIndex={active ? 0 : -1}
              style={{ pointerEvents: active ? "auto" : "none" }}
              aria-label={`${project.name} — ${project.link} (opens in a new tab)`}
              title={project.description}
            >
              <img
                className="desktop-app-icon"
                src={projectIcons[project.slug]}
                alt=""
                width={74}
                height={74}
                draggable={false}
              />
              <span>{project.name}</span>
            </a>
          ))}
        </nav>,
    );
  }, [active, portalTarget]);

  return <group ref={screen} position={[0, 4.3, 3.62]} rotation={[75 * Math.PI / 180, 0, 0]} />;
}
