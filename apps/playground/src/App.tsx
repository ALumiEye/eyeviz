import { SPEC_VERSION, SUPPORTED_SPEC_VERSIONS } from "@alumieye/eyeviz";

/**
 * Phase 0 shell. Phase 1 replaces the placeholder panels with the Scene Spec editor,
 * live validation, the live preview and generated parameter controls.
 */
export function App() {
  return (
    <div className="layout">
      <header className="header">
        <h1>
          EyeViz <span className="by">by ALumiEye</span>
        </h1>
        <span className="badge">Scene Spec v{SPEC_VERSION}</span>
      </header>
      <main className="panes">
        <section className="pane" aria-labelledby="spec-title">
          <h2 id="spec-title">Scene Specification</h2>
          <p className="muted">Editor arrives in Phase 1.</p>
        </section>
        <section className="pane" aria-labelledby="preview-title">
          <h2 id="preview-title">Live Visualization</h2>
          <p className="muted">
            Renderer arrives in Phase 1. Runtime supports spec versions:{" "}
            {SUPPORTED_SPEC_VERSIONS.join(", ")}.
          </p>
        </section>
      </main>
    </div>
  );
}
