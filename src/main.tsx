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
import { bookSpreads, projects } from "./book-content";
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
  if (path === "/projects") return 0;
  const index = projects.findIndex(
    (project) => path === `/projects/${project.slug}`,
  );
  return index < 0 ? null : index + 1;
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
        <p>Open the desk index in the corner to explore every section.</p>
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
  const turnPage = (page: number) => {
    if (page >= 0 && page < bookSpreads.length)
      navigate(
        page === 0 ? "/projects" : `/projects/${projects[page - 1].slug}`,
        { replace: true },
      );
  };
  useEffect(() => {
    if (bookOpen) reader.current?.focus({ preventScroll: true });
  }, [bookOpen]);
  useEffect(() => {
    if (bookPage === null && !laptopOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        navigate("/");
      } else if (bookPage === null) {
        return;
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        turnPage(bookPage + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        turnPage(bookPage - 1);
      } else if (event.key === "Tab") {
        event.preventDefault();
        reader.current?.focus();
      } else if (event.key === "Enter") {
        const url = bookSpreads[bookPage].right.url;
        if (url) {
          event.preventDefault();
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bookPage, laptopOpen]);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [paused, setPaused] = useState(false);
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
            ? "A close-up of the MacBook Pro display. Use Back to the desk or press Escape to return."
            : "A leather notebook, card, floppy disk, and sealed envelope on a cutting mat and butcher-block desk. Drag to rearrange; click to discover. The reset arrow in the mat’s upper-left grid cell restores all four objects; a keyboard reset button follows this scene. A MacBook Pro peeks in at the top; click it to move to its screen. Equivalent destinations are in the desk index."
        }
      >
        <SceneBoundary>
          <Suspense
            fallback={
              <p className="scene-message">Setting out the workbench…</p>
            }
          >
            <Workbench
              reduced={systemReduced || paused}
              bookOpen={bookOpen}
              laptopOpen={laptopOpen}
              bookPage={bookPage ?? 0}
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
          Reset all four desk objects to their starting positions
        </button>
      )}
      {bookPage !== null && (
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
            Turn pages with the left and right arrow keys, drag across a page,
            or click its outer edge. Press Enter to visit the project. Click
            outside the book or press Escape to close it.
          </p>
          <div aria-live="polite" aria-atomic="true">
            <h1>{bookSpreads[bookPage].right.title}</h1>
            {bookSpreads[bookPage].right.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {bookSpreads[bookPage].right.url && (
              <a
                tabIndex={-1}
                href={bookSpreads[bookPage].right.url}
                target="_blank"
                rel="noreferrer"
              >
                {bookSpreads[bookPage].right.link}
              </a>
            )}
            <p>
              Spread {bookPage + 1} of {bookSpreads.length}.
            </p>
          </div>
        </section>
      )}
      {laptopOpen && (
        <button
          className="motion-toggle laptop-return"
          onClick={() => navigate("/")}
        >
          Back to the desk
        </button>
      )}
      <div className="desk-footer">
        <button
          className="motion-toggle"
          onClick={() => setPaused((v) => !v)}
          aria-pressed={paused || systemReduced}
          disabled={systemReduced}
        >
          {systemReduced
            ? "Reduced motion enabled"
            : paused
              ? "Resume motion"
              : "Pause motion"}
        </button>
      </div>
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
function Archive() {
  return (
    <Page title="Past lives.">
      <p className="page-lead">
        Experiments and projects from an earlier chapter.
      </p>
      <div className="project-list">
        {projects
          .filter((p) => p.slug === "omp-remote")
          .map((p) => (
            <article key={p.slug}>
              <span className="project-type">{p.type}</span>
              <h2>
                <Link to={`/projects/${p.slug}`}>
                  {p.name}
                  <Arrow />
                </Link>
              </h2>
              <p>{p.description}</p>
              <External href={p.url}>{p.link}</External>
            </article>
          ))}
      </div>
    </Page>
  );
}
function ProjectDetail() {
  const { pathname } = useLocation();
  const project = projects.find((p) => pathname === `/projects/${p.slug}`);
  return project ? null : (
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
      location.pathname === "/"
        ? document.querySelector(".desk-index summary")
        : location.pathname === "/laptop"
          ? document.querySelector(".laptop-return")
          : heading;
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
      className={`tabletop${bookPageForPath(location.pathname) !== null ? " book-reading" : location.pathname === "/laptop" ? " laptop-focused" : location.pathname === "/" ? "" : " reading"}`}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Home />
      <details className="desk-index" key={location.pathname}>
        <summary>Desk index</summary>
        <nav aria-label="Desk navigation">
          <Link to="/">The workbench</Link>
          {[
            ["/projects", "Work"],
            ["/laptop", "MacBook Pro"],
            ["/about", "About"],
            ["/archive", "Archive"],
            ["/contact", "Contact"],
          ].map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
      </details>
      <Routes>
        <Route path="/" element={null} />
        <Route path="/laptop" element={null} />
        <Route path="/projects" element={null} />
        <Route path="/projects/:slug" element={<ProjectDetail />} />
        <Route path="/archive" element={<Archive />} />
        <Route
          path="/about"
          element={
            <Page title="Hello, I’m Adam.">
              <p className="page-lead">An engineer who likes making things.</p>
              <p>
                Former senior engineer at Meta Superintelligence Lab and
                Instagram.
              </p>
              <p>
                These days, my projects include TrioSens and woostack: tools for
                understanding AI brand visibility and working with AI coding
                agents.
              </p>
              <Link className="external" to="/projects">
                See what I’m building
                <Arrow />
              </Link>
            </Page>
          }
        />
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
