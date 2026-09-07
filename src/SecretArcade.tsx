import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import "./secret-arcade.css";

// An Easter egg, not authentication: anything shipped to the browser is public.
const SECRET_PASSWORD = import.meta.env.VITE_SECRET_PASSWORD || "woop";
const SIZE = 16;
type Point = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";
type Game = {
  snake: Point[];
  food: Point | null;
  direction: Direction;
  status: "ready" | "running" | "paused" | "lost" | "won";
};
const vectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const opposite: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
function foodFor(snake: Point[]): Point | null {
  const free: Point[] = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (!snake.some((part) => part.x === x && part.y === y))
        free.push({ x, y });
    }
  return free[Math.floor(Math.random() * free.length)] ?? null;
}
function newGame(): Game {
  return {
    snake: [
      { x: 7, y: 8 },
      { x: 6, y: 8 },
      { x: 5, y: 8 },
    ],
    food: { x: 11, y: 8 },
    direction: "right",
    status: "ready",
  };
}
function Snake({ active }: { active: boolean }) {
  const [game, setGame] = useState<Game>(newGame);
  const queued = useRef<Direction | null>(null);
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => {
    board.current?.focus();
  }, []);
  useEffect(() => {
    if (!active)
      setGame((current) =>
        current.status === "running"
          ? { ...current, status: "paused" }
          : current,
      );
  }, [active]);
  const turn = (direction: Direction) => {
    if (
      game.status === "running" &&
      !queued.current &&
      direction !== opposite[game.direction]
    )
      queued.current = direction;
  };
  const start = () => {
    queued.current = null;
    setGame({ ...newGame(), status: "running" });
    board.current?.focus();
  };
  useEffect(() => {
    if (game.status !== "running") return;
    const timer = window.setInterval(() => {
      const input = queued.current;
      queued.current = null;
      setGame((current) => {
        if (current.status !== "running") return current;
        const direction = input ?? current.direction;
        const delta = vectors[direction];
        const head = {
          x: current.snake[0].x + delta.x,
          y: current.snake[0].y + delta.y,
        };
        const eating = head.x === current.food?.x && head.y === current.food?.y;
        const body = eating ? current.snake : current.snake.slice(0, -1);
        if (
          head.x < 0 ||
          head.y < 0 ||
          head.x >= SIZE ||
          head.y >= SIZE ||
          body.some((part) => part.x === head.x && part.y === head.y)
        ) {
          return { ...current, status: "lost" };
        }
        const snake = [head, ...body];
        const food = eating ? foodFor(snake) : current.food;
        return { snake, food, direction, status: food ? "running" : "won" };
      });
    }, 170);
    const pause = () =>
      setGame((current) =>
        current.status === "running"
          ? { ...current, status: "paused" }
          : current,
      );
    const visibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [game.status]);
  const togglePause = () => {
    setGame((current) => ({
      ...current,
      status: current.status === "paused" ? "running" : "paused",
    }));
    board.current?.focus();
  };
  return (
    <div
      className="snake"
      onKeyDown={(event) => {
        const direction = (
          {
            ArrowUp: "up",
            ArrowDown: "down",
            ArrowLeft: "left",
            ArrowRight: "right",
            w: "up",
            s: "down",
            a: "left",
            d: "right",
          } as Record<string, Direction>
        )[event.key];
        if (direction) {
          event.preventDefault();
          turn(direction);
        }
        if (event.code === "Space" && event.target === board.current) {
          event.preventDefault();
          if (game.status === "running" || game.status === "paused")
            togglePause();
          else start();
        }
      }}
    >
      <div className="snake-toolbar">
        <strong>Snake</strong>
        <span>Score {game.snake.length - 3}</span>
        <button
          onClick={
            game.status === "running" || game.status === "paused"
              ? togglePause
              : start
          }
        >
          {game.status === "running"
            ? "Pause"
            : game.status === "paused"
              ? "Resume"
              : game.status === "ready"
                ? "Play"
                : "Play again"}
        </button>
      </div>
      <div
        className="snake-board"
        ref={board}
        tabIndex={0}
        role="group"
        aria-label="Snake game board. Use arrow keys or W A S D to move, Space to pause."
        autoFocus
      >
        <svg
          viewBox="0 0 320 320"
          role="img"
          aria-label={`Snake board, score ${game.snake.length - 3}`}
        >
          {game.food && (
            <circle
              cx={game.food.x * 20 + 10}
              cy={game.food.y * 20 + 10}
              r="6"
              fill="#f7bb58"
            />
          )}
          {game.snake.map((part, index) => (
            <rect
              key={`${part.x},${part.y}`}
              x={part.x * 20 + 1}
              y={part.y * 20 + 1}
              width="18"
              height="18"
              rx="3"
              fill={index === 0 ? "#e6f4b5" : "#9bc782"}
            />
          ))}
        </svg>
        {game.status !== "running" && (
          <div className="snake-message" role="status">
            <strong>
              {
                {
                  ready: "A little break?",
                  paused: "Paused",
                  lost: "Game over",
                  won: "You filled the board!",
                }[game.status]
              }
            </strong>
            <span>
              {game.status === "lost"
                ? `Final score: ${game.snake.length - 3}. Try another round.`
                : "Collect the gold dots. Avoid walls and yourself."}
            </span>
          </div>
        )}
      </div>
      <div className="snake-footer">
        <span>
          Arrows / WASD
          <br />
          Space to pause
        </span>
        <div className="snake-directions" aria-label="Touch controls">
          {(["left", "up", "down", "right"] as Direction[]).map((direction) => (
            <button
              key={direction}
              aria-label={`Move ${direction}`}
              onClick={() => turn(direction)}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                style={{
                  transform: `rotate(${{ up: 0, right: 90, down: 180, left: 270 }[direction]}deg)`,
                }}
              >
                <path d="M5 14l7-7 7 7M12 7v13" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function ArcadeWindow({
  onClose,
  active,
}: {
  onClose: () => void;
  active: boolean;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const windowElement = useRef<HTMLElement>(null);
  const animation = useRef<Animation | null>(null);
  const closeRequested = useRef(false);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    animation.current = windowElement.current!.animate(
      [
        {
          opacity: 0,
          transform: reduced ? "none" : "translateY(8px) scale(0.9)",
        },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: reduced ? 100 : 300,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "both",
      },
    );
    return () => animation.current?.cancel();
  }, []);

  const requestClose = () => {
    if (closeRequested.current || !windowElement.current) return;
    closeRequested.current = true;
    setClosing(true);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Capture the rendered pose before canceling so an interrupted opening
    // closes from its current size rather than jumping to the full window.
    const style = getComputedStyle(windowElement.current);
    const from = { opacity: style.opacity, transform: style.transform };
    animation.current?.cancel();
    const exit = windowElement.current.animate(
      [
        from,
        {
          opacity: 0,
          transform: reduced ? "none" : "translateY(4px) scale(0.94)",
        },
      ],
      {
        duration: reduced ? 80 : 160,
        easing: "cubic-bezier(0.4, 0, 1, 1)",
        fill: "forwards",
      },
    );
    animation.current = exit;
    // Unmount only after the exit finishes; cancellation means the parent
    // already removed this window and must not receive a stale close callback.
    void exit.finished.then(onClose, () => {});
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      input.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <section
      ref={windowElement}
      inert={closing}
      className="secret-window"
      aria-label="Secret arcade"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          requestClose();
        }
      }}
    >
      <header className="secret-titlebar">
        <button
          className="secret-close"
          aria-label="Close secret arcade"
          onClick={requestClose}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m3 3 6 6m0-6-6 6" />
          </svg>
        </button>
        <span className="secret-traffic yellow" />
        <span className="secret-traffic green" />
        <strong>{unlocked ? "Secret Arcade — Snake" : "Secret"}</strong>
      </header>
      {unlocked ? (
        <Snake active={active && !closing} />
      ) : (
        <form
          className="secret-lock"
          onSubmit={(event) => {
            event.preventDefault();
            if (password === SECRET_PASSWORD) {
              setUnlocked(true);
              setPassword("");
            } else {
              setError(true);
              input.current?.select();
            }
          }}
        >
          <svg
            className="secret-lock-icon"
            viewBox="0 0 64 64"
            aria-hidden="true"
          >
            <path d="M20 28v-9a12 12 0 0 1 24 0v9" />
            <rect x="12" y="28" width="40" height="30" rx="6" />
            <path d="M32 39v9" />
          </svg>
          <h2>You found the secret.</h2>
          <p>Enter the password to unlock a little arcade.</p>
          <label htmlFor="secret-password">Password</label>
          <input
            ref={input}
            id="secret-password"
            type="password"
            autoFocus
            autoComplete="off"
            required
            value={password}
            aria-invalid={error}
            aria-describedby="secret-feedback"
            onChange={(event) => {
              setPassword(event.target.value);
              setError(false);
            }}
          />
          <p id="secret-feedback" className="secret-feedback" role="status">
            {error
              ? "That’s not it. Try another password."
              : "A small secret. A classic game."}
          </p>
          <button className="secret-unlock" type="submit">
            Unlock
          </button>
        </form>
      )}
    </section>
  );
}

/** Native form projected onto the same orthographic lid plane as the desktop. */
export default function SecretArcade({
  onClose,
  active,
}: {
  onClose: () => void;
  active: boolean;
}) {
  const { gl } = useThree();
  const anchor = useRef<THREE.Group>(null);
  const element = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);
  const scratch = useMemo(
    () => ({
      origin: new THREE.Vector3(),
      right: new THREE.Vector3(),
      down: new THREE.Vector3(),
    }),
    [],
  );
  useLayoutEffect(() => {
    const target = gl.domElement.closest(".desk-world");
    if (!target) return;
    const host = document.createElement("div");
    host.className = "secret-projection";
    target.appendChild(host);
    element.current = host;
    const root = createRoot(host);
    rootRef.current = root;
    return () => {
      rootRef.current = null;
      element.current = null;
      host.remove();
      queueMicrotask(() => root.unmount());
    };
  }, [gl]);
  useLayoutEffect(() => {
    rootRef.current?.render(<ArcadeWindow onClose={onClose} active={active} />);
    if (element.current) element.current.inert = !active;
  }, [active, onClose, gl]);
  useFrame(({ camera, size }) => {
    if (!anchor.current || !element.current) return;
    anchor.current.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    const project = (point: THREE.Vector3, x: number, y: number) => {
      point
        .set(x, y, 0.06)
        .applyMatrix4(anchor.current!.matrixWorld)
        .project(camera);
      point.set(
        ((point.x + 1) * size.width) / 2,
        ((1 - point.y) * size.height) / 2,
        0,
      );
    };
    project(scratch.origin, -4.5, 2.8);
    project(scratch.right, 4.5, 2.8);
    project(scratch.down, -4.5, -3.2);
    const { origin, right, down } = scratch;
    const width = size.width <= 600 ? 300 : 600;
    const height = size.width <= 600 ? 200 : 400;
    element.current.style.transform = `matrix(${(right.x - origin.x) / width},${(right.y - origin.y) / width},${(down.x - origin.x) / height},${(down.y - origin.y) / height},${origin.x},${origin.y})`;
    element.current.style.visibility = active ? "visible" : "hidden";
  });
  return <group ref={anchor} />;
}
