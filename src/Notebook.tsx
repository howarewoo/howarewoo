import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { bookSpreads } from "./book-content";
import type { BookPage } from "./book-content";

const PAGE_WIDTH = 3.5;
const PAGE_HEIGHT = 4.65;
const PAGE_TOP = 0.347;
const HINGE_X = -1.77;
const COVER_Z = 0.4;
const RIGHT_CENTER_X = 0.03;
const LAST_PAGE = bookSpreads.length - 1;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 1360;
const PAPER = "#f2ead5";
const INK = "#292821";
const QUIET_INK = "#39362d";

type NotebookProps = {
  body: THREE.Group;
  cover: THREE.Group;
  open: boolean;
  reduced: boolean;
  page: number;
  onPageChange: (page: number) => void;
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

function drawPage(page: BookPage, side: PageSide, folio: number) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Canvas 2D is required to render notebook pages.");

  context.fillStyle = PAPER;
  context.fillRect(0, 0, canvas.width, canvas.height);
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

function clampPage(page: number) {
  return THREE.MathUtils.clamp(Math.round(page), 0, LAST_PAGE);
}

export default function Notebook({
  body,
  cover,
  open,
  reduced,
  page,
  onPageChange,
}: NotebookProps) {
  const { gl, invalidate } = useThree();
  const coverPivot = useRef<THREE.Group>(null);
  const turningSheet = useRef<THREE.Group>(null);
  const paperRoot = useRef<THREE.Group>(null);
  const pointer = useRef<PointerSession | null>(null);
  const point = useRef(new THREE.Vector3());
  const requestedPage = useRef(clampPage(page));
  const completingTurn = useRef(false);
  const [displayPage, setDisplayPage] = useState(() => clampPage(page));
  const [turn, setTurn] = useState<Turn | null>(null);

  const resources = useMemo(() => {
    const pages = bookSpreads.map((spread, spreadIndex) => ({
      left: drawPage(spread.left, "left", spreadIndex * 2 + 1),
      right: drawPage(spread.right, "right", spreadIndex * 2 + 2),
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
      spread.right.texture.anisotropy = maximumAnisotropy;
    }
    return {
      pages,
      materials,
      plane: new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT),
      sheet: new THREE.BoxGeometry(PAGE_WIDTH, PAGE_HEIGHT, 0.018),
      paper: new THREE.MeshStandardMaterial({
        color: PAPER,
        roughness: 0.96,
        metalness: 0,
        envMapIntensity: 0.24,
      }),
    };
  }, [gl]);

  useEffect(
    () => () => {
      resources.plane.dispose();
      resources.sheet.dispose();
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
  useEffect(() => {
    requestedPage.current = boundedPage;
    if (open && !turn && displayPage !== boundedPage) {
      const direction = boundedPage > displayPage ? 1 : -1;
      setTurn({ from: displayPage, to: displayPage + direction, direction });
      completingTurn.current = false;
      invalidate();
    }
  }, [boundedPage, displayPage, invalidate, open, turn]);

  useLayoutEffect(() => {
    if (!turningSheet.current || !turn) return;
    turningSheet.current.rotation.y = turn.direction === 1 ? 0 : -Math.PI;
    invalidate();
  }, [invalidate, turn]);

  useEffect(() => {
    invalidate();
  }, [invalidate, open, reduced]);

  useEffect(() => {
    if (open || !pointer.current) return;
    const session = pointer.current;
    pointer.current = null;
    if (session.target.hasPointerCapture(session.pointerId))
      session.target.releasePointerCapture(session.pointerId);
  }, [open]);

  useEffect(
    () => () => {
      const session = pointer.current;
      pointer.current = null;
      if (session?.target.hasPointerCapture(session.pointerId))
        session.target.releasePointerCapture(session.pointerId);
    },
    [],
  );

  useEffect(() => {
    const cancel = () => {
      const session = pointer.current;
      pointer.current = null;
      if (session?.target.hasPointerCapture(session.pointerId))
        session.target.releasePointerCapture(session.pointerId);
    };
    const lostCapture = (event: PointerEvent) => {
      if (
        pointer.current?.pointerId === event.pointerId &&
        !gl.domElement.hasPointerCapture(event.pointerId)
      )
        cancel();
    };
    gl.domElement.addEventListener("pointercancel", cancel);
    gl.domElement.addEventListener("lostpointercapture", lostCapture);
    window.addEventListener("blur", cancel);
    return () => {
      gl.domElement.removeEventListener("pointercancel", cancel);
      gl.domElement.removeEventListener("lostpointercapture", lostCapture);
      window.removeEventListener("blur", cancel);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const pivot = coverPivot.current;
    const sheet = turningSheet.current;
    let moving = false;

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
      if (
        !open &&
        pivot.rotation.y === 0 &&
        (displayPage !== requestedPage.current || turn)
      ) {
        setDisplayPage(requestedPage.current);
        setTurn(null);
        completingTurn.current = false;
      }
    }

    if (sheet && turn) {
      const target = turn.direction === 1 ? -Math.PI : 0;
      sheet.rotation.y = reduced
        ? target
        : THREE.MathUtils.damp(
            sheet.rotation.y,
            target,
            11,
            Math.min(delta, 0.05),
          );
      if (Math.abs(sheet.rotation.y - target) < 0.002) {
        sheet.rotation.y = target;
        if (!completingTurn.current) {
          completingTurn.current = true;
          setDisplayPage(turn.to);
          setTurn(null);
        }
      } else {
        moving = true;
      }
    }

    if (moving) invalidate();
  });

  const requestPage = (next: number) => {
    const bounded = clampPage(next);
    if (!open || bounded === requestedPage.current) return;
    requestedPage.current = bounded;
    onPageChange(bounded);
  };

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
    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);
    paperRoot.current.worldToLocal(point.current.copy(event.point));
    const data = event.object.userData.bookPage as PageIdentity | undefined;
    pointer.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      localX: point.current.x,
      page: data ?? null,
      uv: event.uv?.clone() ?? null,
      target,
    };
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (open && pointer.current?.pointerId === event.pointerId)
      event.stopPropagation();
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
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      requestPage(requestedPage.current + (dx < 0 ? 1 : -1));
      return;
    }

    if (Math.hypot(dx, dy) > 7) return;
    if (session.page && session.uv) {
      const rendered = resources.pages[session.page.spread][session.page.side];
      const canvasX = session.uv.x * TEXTURE_WIDTH;
      const canvasY = (1 - session.uv.y) * TEXTURE_HEIGHT;
      const content = bookSpreads[session.page.spread][session.page.side];
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

    if (session.localX > 1.25) requestPage(requestedPage.current + 1);
    else if (session.localX < -4.8) requestPage(requestedPage.current - 1);
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

      <group ref={paperRoot}>
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
              geometry={resources.sheet}
              material={resources.paper}
              position={[PAGE_WIDTH / 2, 0, PAGE_TOP - COVER_Z - 0.012]}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={resources.plane}
              material={resources.materials[turnLower].right}
              position={[PAGE_WIDTH / 2, 0, PAGE_TOP - COVER_Z + 0.002]}
              userData={pageIdentity(turnLower, "right")}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
            />
            <mesh
              geometry={resources.plane}
              material={resources.materials[turnHigher].left}
              position={[PAGE_WIDTH / 2, 0, PAGE_TOP - COVER_Z - 0.024]}
              rotation={[0, Math.PI, 0]}
              userData={pageIdentity(turnHigher, "left")}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
            />
          </group>
        )}
      </group>
    </group>
  );
}
