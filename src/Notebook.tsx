import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { BookPage, BookSpread } from "./book-content";
import { PageMotion, PaperBend } from "./PagePhysics";
import RibbonBookmark from "./RibbonBookmark";

const PAGE_WIDTH = 3.5;
const PAGE_HEIGHT = 4.65;
const PAGE_TOP = 0.347;
const HINGE_X = -1.77;
const COVER_Z = 0.4;
const RIGHT_CENTER_X = 0.03;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 1360;
const PAPER = "#f2ead5";
const INK = "#292821";
const QUIET_INK = "#39362d";
const NO_PAGE_IMAGES: string[] = [];

type NotebookTab = { label: string; page: number };

type NotebookProps = {
  body: THREE.Group;
  cover: THREE.Group;
  open: boolean;
  reduced: boolean;
  page: number;
  onPageChange: (page: number) => void;
  spreads: BookSpread[];
  pageImages?: string[];
  vertical?: boolean;
  tabs?: readonly NotebookTab[];
};

type PageSide = "left" | "right";
type PageIdentity = { spread: number; side: PageSide };
type PointerSession = {
  pointerId: number;
  startX: number;
  startY: number;
  localX: number;
  page: PageIdentity | null;
  uv: THREE.Vector2 | null;
  target: HTMLElement;
  startPage: number;
  extent: number;
  dragging: boolean;
};
type Turn = { from: number; to: number; direction: 1 | -1 };
type RenderedPage = {
  texture: THREE.CanvasTexture;
  linkLeft: number | null;
  linkRight: number | null;
  linkTop: number | null;
  linkBottom: number | null;
};

function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paperRandom(seed: number) {
  return () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507);
    return (seed >>> 0) / 4294967296;
  };
}

function paintPageWear(
  context: CanvasRenderingContext2D,
  side: PageSide,
  folio: number,
) {
  const { width, height } = context.canvas;
  const random = paperRandom(folio * 2654435761);
  context.save();
  for (let index = 0; index < 4200; index++) {
    context.fillStyle = random() > 0.45 ? "#8f775222" : "#fff9e94a";
    context.fillRect(
      random() * width,
      random() * height,
      1 + random() * 3,
      0.7 + random(),
    );
  }
  for (const [x, y, endX, endY] of [
    [0, 0, 34, 0],
    [width, 0, width - 34, 0],
    [0, 0, 0, 30],
    [0, height, 0, height - 42],
  ]) {
    const edge = context.createLinearGradient(x, y, endX, endY);
    edge.addColorStop(0, "#92704140");
    edge.addColorStop(0.22, "#aa885a1b");
    edge.addColorStop(1, "#aa885a00");
    context.fillStyle = edge;
    context.fillRect(0, 0, width, height);
  }
  const outer = side === "right" ? width : 0;
  const inward = side === "right" ? -1 : 1;
  const handling = context.createRadialGradient(
    outer,
    height * 0.78,
    4,
    outer,
    height * 0.78,
    130,
  );
  handling.addColorStop(0, "#98784c1c");
  handling.addColorStop(1, "#98784c00");
  context.fillStyle = handling;
  context.fillRect(0, height * 0.6, width, height * 0.4);

  // Small nicks remain in the outer margin, never across the printed content.
  for (let index = 0; index < 8; index++) {
    const y = 80 + random() * (height - 160);
    const depth = 7 + random() * 14;
    context.beginPath();
    context.moveTo(outer, y - 3);
    context.lineTo(outer + inward * depth * 0.45, y + 1);
    context.lineTo(outer + inward * depth, y + 4 + random() * 5);
    context.strokeStyle = "#8f754b55";
    context.lineWidth = 1.5;
    context.stroke();
    context.strokeStyle = "#fff9e8bb";
    context.translate(0, 2);
    context.stroke();
    context.translate(0, -2);
  }
  const fold = 40 + random() * 30;
  const cornerY = folio % 3 === 0 ? height : 0;
  const towardCenter = cornerY === 0 ? 1 : -1;
  context.beginPath();
  context.moveTo(outer + inward * fold, cornerY);
  context.lineTo(outer, cornerY + towardCenter * fold * 1.3);
  context.lineTo(outer, cornerY);
  context.closePath();
  context.fillStyle = "#e6d8bc";
  context.fill();
  context.beginPath();
  context.moveTo(outer + inward * fold, cornerY);
  context.lineTo(outer, cornerY + towardCenter * fold * 1.3);
  context.strokeStyle = "#8c734e55";
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function drawPage(
  page: BookPage,
  side: PageSide,
  folio: number,
  worn: boolean,
) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Canvas 2D is required to render notebook pages.");

  context.fillStyle = PAPER;
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (worn) paintPageWear(context, side, folio);
  const gutter = context.createLinearGradient(
    side === "right" ? 0 : canvas.width,
    0,
    side === "right" ? 150 : canvas.width - 150,
    0,
  );
  gutter.addColorStop(0, "rgba(70, 58, 37, .17)");
  gutter.addColorStop(0.42, "rgba(89, 73, 46, .055)");
  gutter.addColorStop(1, "rgba(89, 73, 46, 0)");
  context.fillStyle = gutter;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const inner = side === "right" ? 116 : 100;
  const outer = side === "right" ? 100 : 116;
  const startX = side === "right" ? inner : outer;
  const measure = canvas.width - inner - outer;
  let y = 168;

  context.fillStyle = INK;
  context.font = '700 74px "DM Sans"';
  context.textBaseline = "top";
  const titleLines = wrapLines(context, page.title, measure);
  for (const line of titleLines) {
    context.fillText(line, startX, y);
    y += 86;
  }
  y += 48;

  page.paragraphs.forEach((paragraph, paragraphIndex) => {
    const isLabel = paragraphIndex === 0 && /^[A-Z ·]+$/.test(paragraph);
    context.fillStyle = isLabel ? QUIET_INK : INK;
    context.font = isLabel ? '500 36px "DM Sans"' : '400 50px "DM Sans"';
    const lineHeight = isLabel ? 50 : 68;
    for (const line of wrapLines(context, paragraph, measure)) {
      context.fillText(line, startX, y);
      y += lineHeight;
    }
    y += isLabel ? 50 : 46;
  });

  let linkLeft: number | null = null;
  let linkRight: number | null = null;
  let linkTop: number | null = null;
  let linkBottom: number | null = null;
  if (page.link && page.url) {
    y = Math.min(y + 24, 1110);
    context.fillStyle = INK;
    context.font = '500 40px "DM Sans"';
    context.fillText(page.link, startX, y);
    const width = context.measureText(page.link).width;
    context.fillRect(startX, y + 53, width, 2);
    linkTop = y - 18;
    linkBottom = y + 78;
    linkLeft = startX - 20;
    linkRight = startX + width + 20;
  }

  context.fillStyle = QUIET_INK;
  context.font = '400 30px "DM Sans"';
  context.textAlign = side === "right" ? "right" : "left";
  context.fillText(String(folio), side === "right" ? 924 : 100, 1260);
  context.textAlign = "left";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    linkLeft,
    linkRight,
    linkTop,
    linkBottom,
  } satisfies RenderedPage;
}

function NotebookIndex({
  tabs,
  activePage,
  open,
  reduced,
  cover,
  onSelect,
}: {
  tabs: readonly NotebookTab[];
  activePage: number | null;
  open: boolean;
  reduced: boolean;
  cover: { current: THREE.Group | null };
  onSelect: (page: number) => void;
}) {
  const { gl, invalidate } = useThree();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const elapsed = useRef(0);
  const resources = useMemo(
    () =>
      tabs.map(({ label }) => {
        // Stable variation: handling a tab never changes its placement or wrinkles.
        let seed = 2166136261;
        for (const character of label)
          seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
        const random = paperRandom(seed);
        const angle = (random() - 0.5) * 0.2;
        const offset = (random() - 0.5) * 0.09;
        const phase = random() * Math.PI * 2;
        const foldStart = 250 + random() * 80;
        const foldEnd = 380 + random() * 80;
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 224;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#f3e4c8";
        context.fillRect(0, 0, 512, 224);
        for (let index = 0; index < 1800; index++) {
          context.fillStyle = random() > 0.5 ? "#fff9ed25" : "#79644316";
          context.fillRect(
            random() * 512,
            random() * 224,
            0.6 + random() * 1.6,
            0.7,
          );
        }
        const bumpCanvas = document.createElement("canvas");
        bumpCanvas.width = 512;
        bumpCanvas.height = 224;
        const bump = bumpCanvas.getContext("2d")!;
        bump.fillStyle = "#808080";
        bump.fillRect(0, 0, 512, 224);
        for (let index = 0; index < 9; index++) {
          const x = random() * 512;
          const drift = (random() - 0.5) * 150;
          for (const [drawing, shadow, highlight] of [
            [context, "#80674638", "#fffcf060"],
            [bump, "#484848", "#b7b7b7"],
          ] as const) {
            drawing.lineWidth = 1.2 + random() * 1.2;
            drawing.strokeStyle = shadow;
            drawing.beginPath();
            drawing.moveTo(x, 0);
            drawing.bezierCurveTo(
              x + drift,
              65,
              x - drift * 0.4,
              160,
              x + drift * 0.7,
              224,
            );
            drawing.stroke();
            drawing.strokeStyle = highlight;
            drawing.beginPath();
            drawing.moveTo(x + 2, 0);
            drawing.bezierCurveTo(
              x + drift + 2,
              65,
              x - drift * 0.4 + 2,
              160,
              x + drift * 0.7 + 2,
              224,
            );
            drawing.stroke();
          }
        }
        for (const [drawing, shadow, highlight] of [
          [context, "#7c603a66", "#fff7dcbb"],
          [bump, "#343434", "#d0d0d0"],
        ] as const) {
          drawing.beginPath();
          drawing.moveTo(foldStart, 0);
          drawing.lineTo(foldEnd, 224);
          drawing.strokeStyle = shadow;
          drawing.lineWidth = 5;
          drawing.stroke();
          drawing.beginPath();
          drawing.moveTo(foldStart + 4, 0);
          drawing.lineTo(foldEnd + 4, 224);
          drawing.strokeStyle = highlight;
          drawing.lineWidth = 3;
          drawing.stroke();
        }
        const wornEdge = context.createLinearGradient(470, 0, 512, 0);
        wornEdge.addColorStop(0, "#8b673800");
        wornEdge.addColorStop(1, "#8b67384d");
        context.fillStyle = wornEdge;
        context.fillRect(470, 0, 42, 224);
        for (let index = 0; index < 22; index++) {
          const y = random() * 224;
          context.fillStyle = index % 2 ? "#8068445c" : "#fff9e8c9";
          context.fillRect(502 - random() * 9, y, 12, 1 + random() * 3);
        }
        context.strokeStyle = "#8e78512c";
        context.lineWidth = 3;
        context.strokeRect(1, 1, 510, 222);
        context.fillStyle = INK;
        context.font = '600 58px "DM Sans"';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(label, 314, 112, 338);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        const bumpMap = new THREE.CanvasTexture(bumpCanvas);
        const normal = new THREE.MeshStandardMaterial({
          color: "#e8d6b6",
          map: texture,
          bumpMap,
          bumpScale: 0.014,
          roughness: 0.98,
          envMapIntensity: 0.24,
          side: THREE.DoubleSide,
        });
        const selected = normal.clone();
        selected.color.set("#e3b28d");
        const geometry = new THREE.PlaneGeometry(0.88, 0.38, 28, 6);
        const original = new Float32Array(geometry.attributes.position.array);
        (geometry.attributes.position as THREE.BufferAttribute).setUsage(
          THREE.DynamicDrawUsage,
        );
        geometry.boundingSphere = new THREE.Sphere(
          new THREE.Vector3(0.35, 0, 0.15),
          0.85,
        );
        return {
          texture,
          bumpMap,
          normal,
          selected,
          geometry,
          original,
          angle,
          offset,
          phase,
          foldStart,
          foldEnd,
          progress: 0,
        };
      }),
    [gl, tabs],
  );

  useEffect(
    () => () => {
      for (const resource of resources) {
        resource.geometry.dispose();
        resource.texture.dispose();
        resource.bumpMap.dispose();
        resource.normal.dispose();
        resource.selected.dispose();
      }
    },
    [resources],
  );

  useEffect(() => {
    invalidate();
  }, [open, reduced, invalidate]);
  useFrame((_, delta) => {
    const revealing =
      open && (reduced || Math.abs(cover.current?.rotation.y ?? 0) > 1.7);
    elapsed.current = revealing ? elapsed.current + Math.min(delta, 0.05) : 0;
    let moving = false;
    resources.forEach((resource, index) => {
      const group = groups.current[index];
      if (!group) return;
      const target =
        revealing && (reduced || elapsed.current > index * 0.065) ? 1 : 0;
      let progress = reduced
        ? target
        : THREE.MathUtils.damp(
            resource.progress,
            target,
            8.5,
            Math.min(delta, 0.05),
          );
      if (Math.abs(progress - target) < 0.001) progress = target;
      if (progress !== target || (revealing && target === 0)) moving = true;
      group.visible =
        progress > 0.002 &&
        (open || Math.abs(cover.current?.rotation.y ?? 0) > 0.5);
      group.position.x = 1.6 + progress * 0.1;
      if (progress === resource.progress) return;
      resource.progress = progress;
      const positions = resource.geometry.attributes.position;
      const curvature = ((1 - progress) * 6) / 0.88;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const s = resource.original[vertex * 3] + 0.44;
        const y = resource.original[vertex * 3 + 1];
        const x = curvature > 0.0001 ? Math.sin(curvature * s) / curvature : s;
        const curl =
          curvature > 0.0001 ? (1 - Math.cos(curvature * s)) / curvature : 0;
        const foldX =
          ((resource.foldStart +
            (resource.foldEnd - resource.foldStart) * (0.5 - y / 0.38)) *
            0.88) /
          512;
        const foldDistance = s - foldX;
        const crease =
          Math.exp((-foldDistance * foldDistance) / 0.0005) * 0.018;
        const corner = Math.max(0, s - 0.79 + Math.max(y, 0) * 0.5) * 0.25;
        const wrinkle =
          Math.sin(s * 29 + y * 12 + resource.phase) * 0.0045 +
          Math.sin(s * 13 - y * 24 + resource.phase) * 0.003;
        positions.setXYZ(
          vertex,
          x,
          y,
          curl + (wrinkle + crease + corner) * progress,
        );
      }
      positions.needsUpdate = true;
      resource.geometry.computeVertexNormals();
    });
    if (moving) invalidate();
  });

  let selectedIndex = -1;
  if (activePage !== null) {
    tabs.forEach((tab, index) => {
      if (
        tab.page <= activePage &&
        (selectedIndex < 0 || tab.page > tabs[selectedIndex].page)
      )
        selectedIndex = index;
    });
  }
  const spacing = Math.min(
    0.58,
    (PAGE_HEIGHT - 0.6) / Math.max(1, tabs.length),
  );
  return (
    <group dispose={null}>
      {tabs.map((tab, index) => (
        <group
          key={`${tab.page}:${tab.label}`}
          ref={(group) => {
            groups.current[index] = group;
          }}
          visible={false}
          position={[
            1.6,
            1.55 - index * spacing + resources[index].offset,
            PAGE_TOP - 0.05,
          ]}
          rotation={[0, 0, resources[index].angle]}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (open && resources[index].progress > 0.8 && event.button === 0)
              onSelect(tab.page);
          }}
        >
          <mesh
            name={`Notebook ${tab.label} tab`}
            geometry={resources[index].geometry}
            material={
              index === selectedIndex
                ? resources[index].selected
                : resources[index].normal
            }
            raycast={(raycaster, intersections) => {
              const group = groups.current[index];
              if (open && group?.visible && resources[index].progress > 0.8) {
                THREE.Mesh.prototype.raycast.call(
                  group.children[0] as THREE.Mesh,
                  raycaster,
                  intersections,
                );
              }
            }}
            castShadow
            receiveShadow
          />
        </group>
      ))}
    </group>
  );
}

export default function Notebook({
  body,
  cover,
  open,
  reduced,
  page,
  onPageChange,
  spreads,
  pageImages = NO_PAGE_IMAGES,
  vertical = false,
  tabs,
}: NotebookProps) {
  const { gl, invalidate, camera: sceneCamera } = useThree();
  const imageSources = useMemo(() => {
    const sources = spreads.flatMap((spread, index) => [
      pageImages[index * 2] ?? spread.left.image,
      pageImages[index * 2 + 1] ?? spread.right.image,
    ]);
    const paths = [
      ...new Set(sources.filter((path): path is string => !!path)),
    ];
    return {
      paths,
      indices: sources.map((path) => (path ? paths.indexOf(path) : -1)),
    };
  }, [pageImages, spreads]);
  const loadedPages = useLoader(THREE.TextureLoader, imageSources.paths);
  const clampPage = (value: number) =>
    THREE.MathUtils.clamp(Math.round(value), 0, spreads.length - 1);
  const coverPivot = useRef<THREE.Group>(null);
  const orientation = useRef<THREE.Group>(null);
  const turningSheet = useRef<THREE.Group>(null);
  const paperRoot = useRef<THREE.Group>(null);
  const pointer = useRef<PointerSession | null>(null);
  const point = useRef(new THREE.Vector3());
  const requestedPage = useRef(clampPage(page));
  const motion = useRef<{
    turn: Turn | null;
    progress: number;
  }>({ turn: null, progress: 0 });
  const dynamics = useRef(new PageMotion(clampPage(page), spreads.length - 1));
  const bending = useRef(new PaperBend());
  const directTurn = useRef<Turn | null>(null);
  const restingPage = useRef(clampPage(page));
  const wheelTimer = useRef<number | undefined>(undefined);
  const wheelExtent = useRef(620);
  const projectedEdge = useRef(new THREE.Vector3());
  const [displayPage, setDisplayPage] = useState(() => clampPage(page));
  const [turn, setTurn] = useState<Turn | null>(null);
  const imageTexture = (
    source: THREE.Texture,
    fullBleed: boolean,
    side: PageSide,
    folio: number,
  ) => {
    if (fullBleed) return source.clone();
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const context = canvas.getContext("2d")!;
    context.fillStyle = PAPER;
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!vertical) paintPageWear(context, side, folio);
    const image = source.image;
    const ratio = Math.min(
      (canvas.width - 128) / image.width,
      (canvas.height - 128) / image.height,
    );
    const width = image.width * ratio;
    const height = image.height * ratio;
    context.drawImage(
      image,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    return new THREE.CanvasTexture(canvas);
  };

  const resources = useMemo(() => {
    const render = (content: BookPage, side: PageSide, index: number) =>
      loadedPages[imageSources.indices[index]]
        ? {
            texture: imageTexture(
              loadedPages[imageSources.indices[index]],
              !!pageImages[index],
              side,
              index + 1,
            ),
            linkLeft: null,
            linkRight: null,
            linkTop: null,
            linkBottom: null,
          }
        : drawPage(content, side, index + 1, !vertical);
    const pages = spreads.map((spread, spreadIndex) => ({
      left: render(spread.left, "left", spreadIndex * 2),
      right: render(spread.right, "right", spreadIndex * 2 + 1),
    }));
    const maximumAnisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const materials = pages.map((spread) => ({
      left: new THREE.MeshStandardMaterial({
        map: spread.left.texture,
        color: 0xffffff,
        roughness: 0.94,
        metalness: 0,
        envMapIntensity: 0.24,
        side: THREE.FrontSide,
      }),
      right: new THREE.MeshStandardMaterial({
        map: spread.right.texture,
        color: 0xffffff,
        roughness: 0.94,
        metalness: 0,
        envMapIntensity: 0.24,
        side: THREE.FrontSide,
      }),
    }));
    for (const spread of pages) {
      spread.left.texture.anisotropy = maximumAnisotropy;
      spread.left.texture.colorSpace = THREE.SRGBColorSpace;
      spread.right.texture.colorSpace = THREE.SRGBColorSpace;
      spread.right.texture.anisotropy = maximumAnisotropy;
    }
    const segments = 32;
    const flexible = new THREE.BoxGeometry(
      PAGE_WIDTH,
      PAGE_HEIGHT,
      0.03,
      segments,
      6,
      1,
    );
    const original = new Float32Array(flexible.attributes.position.array);
    const positions = flexible.attributes.position as THREE.BufferAttribute;
    const normals = flexible.attributes.normal as THREE.BufferAttribute;
    positions.setUsage(THREE.DynamicDrawUsage);
    normals.setUsage(THREE.DynamicDrawUsage);
    flexible.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      PAGE_WIDTH + PAGE_HEIGHT / 2,
    );
    const rows = 6;
    const spine = new Float64Array((segments + 1) * (rows + 1) * 4);
    let previousBend = Number.NaN;
    let previousTwist = Number.NaN;
    const deform = (bend: number, twist: number) => {
      if (bend === previousBend && twist === previousTwist) return;
      previousBend = bend;
      previousTwist = twist;
      for (let row = 0; row <= rows; row++) {
        const curvature = bend + twist * ((row / rows) * 2 - 1);
        let x = 0;
        let z = 0;
        for (let column = 0; column <= segments; column++) {
          if (column > 0) {
            const midpoint = (column - 0.5) / segments;
            const tangent = curvature * (1 - (1 - midpoint) ** 3);
            // Each strip retains its arc length, including an off-center pull.
            x += (Math.cos(tangent) * PAGE_WIDTH) / segments;
            z -= (Math.sin(tangent) * PAGE_WIDTH) / segments;
          }
          const tangent = curvature * (1 - (1 - column / segments) ** 3);
          const cell = (row * (segments + 1) + column) * 4;
          spine[cell] = x;
          spine[cell + 1] = z;
          spine[cell + 2] = Math.sin(tangent);
          spine[cell + 3] = Math.cos(tangent);
        }
      }
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const offset = vertex * 3;
        const row = Math.round(
          (original[offset + 1] / PAGE_HEIGHT + 0.5) * rows,
        );
        const column =
          (row * (segments + 1) +
            Math.round((original[offset] / PAGE_WIDTH + 0.5) * segments)) *
          4;
        const sin = spine[column + 2];
        const cos = spine[column + 3];
        positions.setXYZ(
          vertex,
          spine[column] - PAGE_WIDTH / 2 + original[offset + 2] * sin,
          original[offset + 1],
          spine[column + 1] + original[offset + 2] * cos,
        );
      }
      positions.needsUpdate = true;
      flexible.computeVertexNormals();
    };
    return {
      pages,
      materials,
      flexible,
      deform,
      plane: new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT),
      sheet: new THREE.BoxGeometry(PAGE_WIDTH, PAGE_HEIGHT, 0.018),
      paper: new THREE.MeshStandardMaterial({
        color: PAPER,
        roughness: 0.96,
        metalness: 0,
        envMapIntensity: 0.24,
      }),
    };
  }, [gl, spreads, loadedPages, imageSources, pageImages, vertical]);

  useEffect(
    () => () => {
      resources.plane.dispose();
      resources.sheet.dispose();
      resources.flexible.dispose();
      resources.paper.dispose();
      for (const spread of resources.pages) {
        spread.left.texture.dispose();
        spread.right.texture.dispose();
      }
      for (const spread of resources.materials) {
        spread.left.dispose();
        spread.right.dispose();
      }
    },
    [resources],
  );

  const boundedPage = clampPage(page);
  const currentPosition = () => dynamics.current.position;
  const clearInput = () => {
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = undefined;
    const session = pointer.current;
    pointer.current = null;
    if (session?.target.hasPointerCapture(session.pointerId))
      session.target.releasePointerCapture(session.pointerId);
  };
  const animateTo = (next: number) => {
    const current = motion.current.turn;
    const from = restingPage.current;
    directTurn.current = current
      ? next === current.from || next === current.to
        ? current
        : null
      : from !== next
        ? { from, to: next, direction: next > from ? 1 : -1 }
        : null;
    dynamics.current.goTo(next);
    invalidate();
  };
  const requestPage = (next: number) => {
    if (!open) return;
    clearInput();
    const bounded = clampPage(next);
    animateTo(bounded);
    if (bounded !== requestedPage.current) {
      requestedPage.current = bounded;
      onPageChange(bounded);
    }
  };
  const scrub = (position: number) => {
    directTurn.current = null;
    dynamics.current.drive(position);
    invalidate();
  };
  const settle = () => requestPage(dynamics.current.release());
  const gestureExtent = () => {
    const root = paperRoot.current;
    if (!root) return 300;
    const canvas = gl.domElement;
    const start = point.current.set(HINGE_X, 0, PAGE_TOP);
    const end = projectedEdge.current.set(HINGE_X + PAGE_WIDTH, 0, PAGE_TOP);
    root.localToWorld(start);
    root.localToWorld(end);
    start.project(sceneCamera);
    end.project(sceneCamera);
    return Math.max(
      120,
      Math.hypot(
        ((end.x - start.x) * canvas.clientWidth) / 2,
        ((end.y - start.y) * canvas.clientHeight) / 2,
      ),
    );
  };

  // Wheel cancellation must be non-passive. Stable listeners delegate to the
  // current route and gesture state rather than restarting an active gesture.
  const inputHandlers = useRef<{
    wheel: (event: WheelEvent) => void;
    cancel: () => void;
  } | null>(null);
  inputHandlers.current = {
    wheel: (event) => {
      if (!open || pointer.current || event.ctrlKey || event.metaKey) return;
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      const first = wheelTimer.current === undefined;
      if (first)
        wheelExtent.current = THREE.MathUtils.clamp(
          gestureExtent() * 1.5,
          480,
          760,
        );
      window.clearTimeout(wheelTimer.current);
      const units =
        event.deltaMode === 1
          ? 32
          : event.deltaMode === 2
            ? wheelExtent.current
            : 1;
      scrub(
        (first ? currentPosition() : dynamics.current.input) +
          (delta * units) / wheelExtent.current,
      );
      wheelTimer.current = window.setTimeout(() => {
        wheelTimer.current = undefined;
        settle();
      }, 140);
    },
    cancel: () => {
      if (open && (pointer.current || wheelTimer.current !== undefined))
        settle();
      else clearInput();
    },
  };

  useEffect(() => {
    if (boundedPage !== requestedPage.current) {
      clearInput();
      requestedPage.current = boundedPage;
      if (open) animateTo(boundedPage);
    }
    if (!open) {
      clearInput();
      motion.current.turn = null;
      dynamics.current.reset(boundedPage);
      bending.current.reset();
      directTurn.current = null;
      restingPage.current = boundedPage;
      setDisplayPage(boundedPage);
      setTurn(null);
    }
    invalidate();
  }, [boundedPage, open, invalidate]);

  useLayoutEffect(() => {
    if (!turningSheet.current || !turn) return;
    const progress = motion.current.progress;
    turningSheet.current.rotation.y =
      -Math.PI * (turn.direction === 1 ? progress : 1 - progress);
    invalidate();
  }, [invalidate, turn]);

  useEffect(() => {
    invalidate();
  }, [invalidate, reduced]);
  useEffect(() => {
    const wheel = (event: WheelEvent) => inputHandlers.current?.wheel(event);
    const cancel = () => inputHandlers.current?.cancel();
    const lostCapture = (event: PointerEvent) => {
      if (pointer.current?.pointerId === event.pointerId) cancel();
    };
    const canvas = gl.domElement;
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", lostCapture);
    window.addEventListener("blur", cancel);
    return () => {
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", lostCapture);
      window.removeEventListener("blur", cancel);
      clearInput();
    };
  }, [gl]);

  useFrame((_, delta) => {
    const pivot = coverPivot.current;
    const sheet = turningSheet.current;
    let moving = false;
    if (orientation.current) {
      const target = vertical && open ? -Math.PI / 2 : 0;
      const rotation = orientation.current.rotation;
      rotation.z = reduced
        ? target
        : THREE.MathUtils.damp(rotation.z, target, 8.5, Math.min(delta, 0.05));
      if (Math.abs(rotation.z - target) < 0.001) rotation.z = target;
      else moving = true;
    }

    if (pivot) {
      const target = open ? -Math.PI : 0;
      pivot.rotation.y = reduced
        ? target
        : THREE.MathUtils.damp(
            pivot.rotation.y,
            target,
            8.5,
            Math.min(delta, 0.05),
          );
      if (Math.abs(pivot.rotation.y - target) < 0.001)
        pivot.rotation.y = target;
      else moving = true;
    }

    const current = motion.current;
    const physics = dynamics.current;
    if (open && spreads.length > 1) {
      physics.advance(delta, reduced);
      if (
        current.turn ||
        !physics.settled ||
        physics.position !== restingPage.current
      ) {
        const lower = Math.min(
          Math.floor(physics.position),
          spreads.length - 2,
        );
        const from = directTurn.current?.from ?? lower;
        const to = directTurn.current?.to ?? lower + 1;
        const direction = to > from ? 1 : -1;
        const span = Math.abs(to - from);
        const fraction = THREE.MathUtils.clamp(
          (physics.position - Math.min(from, to)) / span,
          0,
          1,
        );
        const angle = -Math.PI * fraction;
        const angularVelocity = (-Math.PI * physics.velocity) / span;
        if (current.turn?.from !== from || current.turn.to !== to) {
          current.turn = { from, to, direction };
          setTurn(current.turn);
          bending.current.reset(angularVelocity);
        }
        current.progress = direction === 1 ? fraction : 1 - fraction;
        bending.current.advance(angle, angularVelocity, delta, reduced);
        resources.deform(bending.current.angle, bending.current.twist);
        if (sheet) sheet.rotation.y = angle;
        if (physics.settled && bending.current.settled) {
          restingPage.current = physics.position;
          setDisplayPage(physics.position);
          current.turn = null;
          directTurn.current = null;
          setTurn(null);
        } else moving = true;
      }
    }

    if (moving) invalidate();
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (
      !open ||
      pointer.current ||
      event.button !== 0 ||
      !event.isPrimary ||
      !paperRoot.current
    )
      return;
    event.stopPropagation();
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = undefined;
    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const extent = gestureExtent();
    paperRoot.current.worldToLocal(point.current.copy(event.point));
    const turningPages = event.object.userData.turnPages as
      | { front: number; back: number }
      | undefined;
    const data: PageIdentity | undefined = turningPages
      ? {
          spread:
            event.face?.materialIndex === 5
              ? turningPages.back
              : turningPages.front,
          side: event.face?.materialIndex === 5 ? "left" : "right",
        }
      : event.object.userData.bookPage;
    pointer.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      localX: point.current.x,
      page: data ?? null,
      uv: event.uv?.clone() ?? null,
      target,
      startPage: currentPosition(),
      extent,
      dragging: false,
    };
    bending.current.loadOffset = THREE.MathUtils.clamp(
      point.current.y / (PAGE_HEIGHT / 2),
      -1,
      1,
    );
    dynamics.current.drive(currentPosition());
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const session = pointer.current;
    if (!open || !session || session.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    const travel = vertical ? dy : dx;
    const cross = vertical ? dx : dy;
    if (
      !session.dragging &&
      Math.abs(travel) > 7 &&
      Math.abs(travel) > Math.abs(cross) * 1.15
    )
      session.dragging = true;
    if (session.dragging) scrub(session.startPage - travel / session.extent);
  };

  const finishPointer = (event: ThreeEvent<PointerEvent>) => {
    const session = pointer.current;
    if (!session || session.pointerId !== event.pointerId) return;
    pointer.current = null;
    event.stopPropagation();
    if (session.target.hasPointerCapture(session.pointerId))
      session.target.releasePointerCapture(session.pointerId);
    if (!open) return;

    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    if (session.dragging) {
      const travel = vertical ? dy : dx;
      scrub(session.startPage - travel / session.extent);
      settle();
      return;
    }
    if (motion.current.turn) settle();

    if (Math.hypot(dx, dy) > 7) return;
    if (session.page && session.uv) {
      const rendered = resources.pages[session.page.spread][session.page.side];
      const canvasX = session.uv.x * TEXTURE_WIDTH;
      const canvasY = (1 - session.uv.y) * TEXTURE_HEIGHT;
      const content = spreads[session.page.spread][session.page.side];
      if (
        content.url &&
        rendered.linkLeft !== null &&
        rendered.linkRight !== null &&
        rendered.linkTop !== null &&
        rendered.linkBottom !== null &&
        canvasX >= rendered.linkLeft &&
        canvasX <= rendered.linkRight &&
        canvasY >= rendered.linkTop &&
        canvasY <= rendered.linkBottom
      ) {
        window.open(content.url, "_blank", "noopener,noreferrer");
        return;
      }
    }

    if (session.localX > 1.25) requestPage(clampPage(currentPosition()) + 1);
    else if (session.localX < -4.8)
      requestPage(clampPage(currentPosition()) - 1);
  };

  const baseLeft = turn ? Math.min(turn.from, turn.to) : displayPage;
  const baseRight = turn ? Math.max(turn.from, turn.to) : displayPage;
  const turnLower = turn ? Math.min(turn.from, turn.to) : displayPage;
  const turnHigher = turn ? Math.max(turn.from, turn.to) : displayPage;
  const pageIdentity = (spread: number, side: PageSide) => ({
    bookPage: { spread, side } satisfies PageIdentity,
  });

  return (
    <group
      ref={orientation}
      dispose={null}
      onPointerDown={(event) => {
        if (open) event.stopPropagation();
      }}
      onPointerUp={(event) => {
        if (open) event.stopPropagation();
      }}
      onClick={(event) => {
        if (open) event.stopPropagation();
      }}
    >
      <group rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={body} dispose={null} />
      </group>
      {!vertical && <RibbonBookmark reduced={reduced} />}

      <group ref={paperRoot}>
        {tabs && tabs.length > 0 && (
          <NotebookIndex
            tabs={tabs}
            open={open}
            reduced={reduced}
            cover={coverPivot}
            activePage={open ? boundedPage : null}
            onSelect={requestPage}
          />
        )}
        <mesh
          geometry={resources.plane}
          material={resources.materials[baseRight].right}
          position={[RIGHT_CENTER_X, 0, PAGE_TOP]}
          receiveShadow
          userData={pageIdentity(baseRight, "right")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
        />

        <group ref={coverPivot} position={[HINGE_X, 0, COVER_Z]}>
          <group
            position={[-HINGE_X, 0, -COVER_Z]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <primitive object={cover} dispose={null} />
          </group>
          <mesh
            geometry={resources.sheet}
            material={resources.paper}
            position={[PAGE_WIDTH / 2, 0, PAGE_TOP - COVER_Z - 0.012]}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={resources.plane}
            material={resources.materials[baseLeft].left}
            position={[PAGE_WIDTH / 2, 0, PAGE_TOP - COVER_Z - 0.024]}
            rotation={[0, Math.PI, 0]}
            userData={pageIdentity(baseLeft, "left")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
          />
        </group>

        {turn && open && (
          <group
            ref={turningSheet}
            position={[HINGE_X, 0, COVER_Z]}
            rotation={[0, turn.direction === 1 ? 0 : -Math.PI, 0]}
          >
            <mesh
              name="Flexible turning page"
              geometry={resources.flexible}
              material={[
                resources.paper,
                resources.paper,
                resources.paper,
                resources.paper,
                resources.materials[turnLower].right,
                resources.materials[turnHigher].left,
              ]}
              position={[PAGE_WIDTH / 2, 0, PAGE_TOP - COVER_Z - 0.012]}
              userData={{ turnPages: { front: turnLower, back: turnHigher } }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              castShadow
              receiveShadow
            />
          </group>
        )}
      </group>
    </group>
  );
}
