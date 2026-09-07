import type { MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router";
import { projects } from "./book-content";
import "./archive.css";

export default function Archive() {
  const navigate = useNavigate();
  const dismiss = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !document.startViewTransition
    )
      return;
    event.preventDefault();
    document.startViewTransition(() => {
      flushSync(() => navigate("/"));
    });
  };
  const archived = projects.filter((project) =>
    project.type.startsWith("ARCHIVED"),
  );
  return (
    <div className="retro-world">
      <div className="retro-site">
        <aside className="retro-sidebar">
          <Link className="retro-home" to="/" onClick={dismiss}>
            Back to the desk
          </Link>
          <nav aria-label="Archive navigation">
            <a href="#project-directory">Project directory</a>
            <a href="#about-archive">About this archive</a>
            <Link to="/projects">Current projects</Link>
            <Link to="/contact">Get in touch</Link>
          </nav>
          <hr />
          <p>Elsewhere on the Web</p>
          <a href="https://github.com/howarewoo">Adam’s GitHub</a>
          <a href="https://triosens.io">TrioSens</a>
          <hr />
          <p className="retro-disk-label">
            ADAM WOO
            <br />
            PERSONAL ARCHIVE
            <br />
            <span>READ ONLY</span>
          </p>
          <Link to="/" className="retro-eject" onClick={dismiss}>
            Eject disk
          </Link>
        </aside>
        <article className="retro-content">
          <header className="retro-masthead">
            <div className="retro-edition">
              PERSONAL WEB SITE <b>ARCHIVE</b>
            </div>
            <h1>Welcome to the Archive</h1>
            <p>Adam Woo’s collection of past lives on the Web.</p>
          </header>
          <div className="retro-feature">
            <div className="retro-feature-main">
              <div className="retro-banner">
                <span>
                  Old projects.
                  <br />
                  Still worth a look.
                </span>
              </div>
              <p>Out of date. Abandoned. Not forgotten.</p>
            </div>
            <aside className="retro-feature-note">
              <strong>
                BACK TO
                <br />
                THE PRESENT
              </strong>
              <p>Looking for what I’m building now?</p>
              <Link to="/projects">Open the notebook</Link>
            </aside>
          </div>
          <section id="project-directory" className="retro-directory">
            <h2 className="retro-section-title">
              <span>Project Directory</span>
            </h2>
            <div className="retro-columns">
              <div>
                {archived.map((project) => (
                  <article className="retro-project" key={project.slug}>
                    <h3>
                      <a href={project.url}>{project.name}</a>
                    </h3>
                    <p className="retro-status">{project.type}</p>
                    <p>{project.description}</p>
                    <p>
                      <a href={project.url}>{project.link}</a>
                    </p>
                    <p className="retro-caution">
                      Archived software. Kept here for reference, not as a
                      current recommendation.
                    </p>
                  </article>
                ))}
              </div>
              <div>
                <section id="about-archive" className="retro-note">
                  <h3>A place for past lives</h3>
                  <p>
                    Not every project stays in use. This is where I keep the
                    ones that are out of date or that I’ve left behind.
                  </p>
                  <p>
                    The workbench is for what’s current. This disk is for
                    everything that came before.
                  </p>
                </section>
                <section className="retro-note">
                  <h3>Source, not support</h3>
                  <p>
                    Follow a project’s link to explore its code and history.
                    These projects may no longer work as originally intended.
                  </p>
                </section>
              </div>
            </div>
          </section>
          <footer className="retro-footer">
            <p>
              <Link to="/" onClick={dismiss}>
                Home
              </Link>{" "}
              | <a href="#project-directory">Projects</a> |{" "}
              <Link to="/contact">Contact the webmaster</Link>
            </p>
            <p>Adam Woo · Personal project archive</p>
            <span className="retro-web-badge">
              BEST VIEWED WITH
              <br />
              <b>A LITTLE CURIOSITY</b>
            </span>
          </footer>
        </article>
      </div>
    </div>
  );
}
