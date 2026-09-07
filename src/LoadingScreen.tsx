import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./loading-screen.css";

export default function LoadingScreen({ ready }: { ready: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDismissed(true);
      return;
    }
    const timeout = window.setTimeout(() => setDismissed(true), 480);
    return () => window.clearTimeout(timeout);
  }, [ready]);

  if (dismissed) return null;

  return createPortal(
    <section
      className={`loading-screen${ready ? " loading-screen--ready" : ""}`}
      aria-label="Loading Adam Woo’s workbench"
      aria-hidden={ready || undefined}
      inert={ready}
    >
      <header className="loading-screen__header">
        <span>On the workbench</span>
        <span className="loading-screen__edition">Work, experiments & other things.</span>
      </header>
      <div className="loading-screen__center">
        <p className="loading-screen__name">Adam Woo<span aria-hidden="true">.</span></p>
        <div className="loading-screen__ruler" aria-hidden="true">
          {Array.from({ length: 41 }, (_, index) => (
            <span key={index} style={{ height: index % 10 === 0 ? 28 : index % 5 === 0 ? 18 : 9 }} />
          ))}
          <i />
        </div>
        <p className="loading-screen__status" role="status">
          {ready ? "The desk is yours." : "Setting out the workbench…"}
        </p>
      </div>
      <footer className="loading-screen__footer">
        <p>A few things to pick up. A little room to explore.</p>
      </footer>
    </section>,
    document.body,
  );
}
