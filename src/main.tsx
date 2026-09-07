import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-mono/400.css";
import "./styles.css";
import { bookSpreads, bookPaths, bookTabs } from "./book-content";
import Archive from "./Archive";
import { photos } from "./creative-content";
const Workbench = lazy(async () => {
  await Promise.all(
    [400, 500, 700].map((weight) =>
      document.fonts.load(`${weight} 16px "DM Sans"`),
    ),
  );
  await document.fonts.ready;
  return import("./Workbench");
});
function bookPageForPath(path: string): number | null {
  const index = bookPaths.indexOf(path);
  return index < 0 ? null : index;
}
function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M5 19 19 5M5 5h14v14" />
    </svg>
  );
}
function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="external" href={href} target="_blank" rel="noreferrer">
      {children}
      <Arrow />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-message">
        <h2>The workbench couldn’t load.</h2>
        <p>
          Explore the <Link to="/archive">archive</Link> or{" "}
          <Link to="/contact">get in touch</Link>.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Home() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reader = useRef<HTMLElement>(null);
  const bookPage = bookPageForPath(pathname);
  const bookOpen = bookPage !== null;
  const laptopOpen = pathname === "/laptop";
  const photo = photos.find((entry) => pathname === `/photos/${entry.id}`);
  const activePage = bookPage;
  const activeSpreads = bookSpreads;
  const turnPage = (page: number) => {
    if (page >= 0 && page < bookSpreads.length)
      navigate(bookPaths[page], { replace: true });
  };
  useEffect(() => {
    if (bookOpen || photo) reader.current?.focus({ preventScroll: true });
  }, [bookOpen, photo]);
  useEffect(() => {
    if (activePage === null && !laptopOpen && !photo) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        navigate("/");
      } else if (photo) {
        if (event.key === "Tab") {
          event.preventDefault();
          reader.current?.focus();
        } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          const index =
            photos.indexOf(photo) + (event.key === "ArrowRight" ? 1 : -1);
          if (photos[index])
            navigate(`/photos/${photos[index].id}`, { replace: true });
        }
      } else if (activePage === null) {
        return;
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        turnPage(activePage + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        turnPage(activePage - 1);
      } else if (event.key === "Tab") {
        event.preventDefault();
        const root = reader.current;
        if (!root) return;
        const targets = [
          root,
          ...Array.from(
            root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
          ).filter((button) => button.offsetWidth > 0),
        ];
        const current = targets.indexOf(document.activeElement as HTMLElement);
        targets[
          (current + (event.shiftKey ? -1 : 1) + targets.length) %
            targets.length
        ].focus();
      } else if (event.key === "Enter") {
        const url = activeSpreads[activePage].right.url;
        if (url) {
          event.preventDefault();
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePage, laptopOpen, photo]);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [resetGeneration, setResetGeneration] = useState(0);
  const [resetFocused, setResetFocused] = useState(false);
  const [resetAvailable, setResetAvailable] = useState(false);
  const resetDesk = () => {
    if (pathname === "/" && resetAvailable)
      setResetGeneration((generation) => generation + 1);
  };
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <div className="desk-world">
      {pathname === "/" && <h1 className="sr-only">Adam Woo’s workbench</h1>}
      {laptopOpen && <h1 className="sr-only">MacBook Pro</h1>}
      <div
        className="scene"
        role="img"
        aria-label={
          laptopOpen
            ? "A close-up of the MacBook Pro display with a macOS-style menu bar and desktop shortcuts for current projects. Drag the top edge of the lid downward to close it, or press Escape to return to the desk."
            : "A tabbed notebook for work, art, and fashion, a floppy disk, and individual Polaroid photographs on a cutting mat and butcher-block desk. Drag to rearrange, release quickly to throw, or click to discover. Objects collide and fall under gravity. The reset arrow in the mat’s upper-left grid cell restores all desk objects and stops their motion; a keyboard reset button follows this scene. A MacBook Pro peeks in at the top; click it to move to its screen. Equivalent destinations are available through keyboard navigation."
        }
      >
        <SceneBoundary>
          <Suspense
            fallback={
              <p className="scene-message">Setting out the workbench…</p>
            }
          >
            <Workbench
              reduced={systemReduced}
              bookOpen={bookOpen}
              laptopOpen={laptopOpen}
              bookPage={bookPage ?? 0}
              photoId={photo?.id ?? null}
              deskActive={pathname === "/"}
              resetGeneration={resetGeneration}
              resetFocused={resetFocused}
              onReset={resetDesk}
              onResetAvailableChange={setResetAvailable}
              onBookPageChange={turnPage}
              onBookClose={() => navigate("/")}
            />
          </Suspense>
        </SceneBoundary>
      </div>
      {pathname === "/" && (
        <button
          type="button"
          className="sr-only"
          disabled={!resetAvailable}
          onClick={resetDesk}
          onFocus={() => setResetFocused(true)}
          onBlur={() => setResetFocused(false)}
        >
          Reset all desk objects to their starting positions
        </button>
      )}
      {photo && (
        <section
          className="sr-only"
          ref={reader}
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${photo.id}`}
          tabIndex={-1}
        >
          <h1>{photo.caption}</h1>
          <p>{photo.alt}</p>
          <p>
            Use left and right arrow keys to view other cards. Click outside the
            photograph or press Escape to return to the desk.
          </p>
        </section>
      )}
      {activePage !== null && (
        <section
          className="sr-only book-reader"
          ref={reader}
          role="dialog"
          aria-modal="true"
          aria-label="Open notebook"
          aria-describedby="book-instructions"
          tabIndex={-1}
        >
          <p id="book-instructions">
            Scroll to turn pages, drag left or right, or click a page’s outer
            edge. Pages follow your gesture, carry its momentum, and gently
            settle on a spread when you release. You can also use the arrow
            keys. Press Enter to visit a linked project. Click outside the book
            or press Escape to close it.
          </p>
          <div aria-live="polite" aria-atomic="true">
            <h1>{activeSpreads[activePage].right.title}</h1>
            {activeSpreads[activePage].right.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {activeSpreads[activePage].right.url && (
              <a
                tabIndex={-1}
                href={activeSpreads[activePage].right.url}
                target="_blank"
                rel="noreferrer"
              >
                {activeSpreads[activePage].right.link}
              </a>
            )}
            <p>
              Notebook sections:{" "}
              {bookTabs.map((tab, index) => (
                <span key={tab.label}>
                  {index > 0 && ", "}
                  {tab.label}
                </span>
              ))}
              . Use the physical tabs or arrow keys to change pages.
            </p>
            <p>
              Spread {activePage + 1} of {activeSpreads.length}.
            </p>
          </div>
        </section>
      )}
      {laptopOpen && (
        <button className="sr-only laptop-close" onClick={() => navigate("/")}>
          Close laptop and return to the desk
        </button>
      )}
    </div>
  );
}
function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="paper-page">
      <Link className="back-link" to="/">
        ← Back to the workbench
      </Link>
      <h1>{title}</h1>
      {children}
    </article>
  );
}
function ProjectDetail() {
  const { pathname } = useLocation();
  const known =
    bookPageForPath(pathname) !== null ||
    photos.some((entry) => pathname === `/photos/${entry.id}`);
  return known ? null : (
    <Page title="Not on this desk.">
      <p>
        That project couldn’t be found. Head back to the workbench to explore.
      </p>
    </Page>
  );
}
function App() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const heading = document.querySelector("h1");
    const focusTarget =
      location.pathname === "/" ? document.getElementById("main") : heading;
    if (
      bookPageForPath(location.pathname) === null &&
      location.key !== "default" &&
      focusTarget instanceof HTMLElement
    ) {
      if (focusTarget === heading) focusTarget.tabIndex = -1;
      focusTarget.focus({ preventScroll: true });
    }
    document.title = `${heading?.innerText.replace(/\s+/g, " ") || "Workbench"} — Adam Woo`;
  }, [location.pathname, location.key]);
  return (
    <main
      id="main"
      tabIndex={-1}
      className={`tabletop${bookPageForPath(location.pathname) !== null || photos.some((entry) => location.pathname === `/photos/${entry.id}`) ? " book-reading" : location.pathname === "/laptop" ? " laptop-focused" : location.pathname === "/archive" ? " archive-open" : location.pathname === "/" ? "" : " reading"}`}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Home />
      <nav className="sr-only keyboard-navigation" aria-label="Site navigation">
        <Link to="/">The workbench</Link>
        {[
          ["/projects", "Work"],
          ["/art", "Art"],
          ["/fashion", "Fashion"],
          ...(photos.length ? [[`/photos/${photos[0].id}`, "Photos"]] : []),
          ["/laptop", "MacBook Pro"],
          ["/archive", "Archive"],
          ["/contact", "Contact"],
        ].map(([to, label]) => (
          <NavLink key={to} to={to}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route path="/" element={null} />
        <Route path="/laptop" element={null} />
        <Route path="/projects" element={null} />
        <Route path="/projects/:slug" element={<ProjectDetail />} />
        <Route path="/art" element={<ProjectDetail />} />
        <Route path="/art/:page" element={<ProjectDetail />} />
        <Route path="/fashion" element={<ProjectDetail />} />
        <Route path="/fashion/:page" element={<ProjectDetail />} />
        <Route path="/photos/:id" element={<ProjectDetail />} />
        <Route path="/archive" element={<Archive />} />
        <Route
          path="/contact"
          element={
            <Page title="Good things start with a hello.">
              <p className="page-lead">
                Have something in mind? Let’s connect.
              </p>
              <div className="contact-links">
                <External href="https://linkedin.com/in/adam-woo-11733ba4/">
                  Find me on LinkedIn
                </External>
                <External href="https://github.com/howarewoo">
                  Follow along on GitHub
                </External>
              </div>
            </Page>
          }
        />
        <Route
          path="*"
          element={
            <Page title="Not on this desk.">
              <p>
                That page couldn’t be found. The workbench is a good place to
                start.
              </p>
            </Page>
          }
        />
      </Routes>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
