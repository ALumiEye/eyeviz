import { EyeVizEngine, getSceneSpecJsonSchema, type SceneModel } from "@alumieye/eyeviz";
import { EyeVizScene } from "@alumieye/eyeviz/react";
import { useRef, useState } from "react";
import { analyze, type Analysis } from "./analyze";
import { lineColumn, locate, type TextRange } from "./editor/locate";
import { SpecEditor } from "./editor/SpecEditor";
import { EXAMPLES } from "./examples";
import { formatJson } from "./format";
import { ParameterControls } from "./ParameterControls";
import { SelectionPanel } from "./SelectionPanel";
import { StepsBar } from "./StepsBar";
import { TimelineBar } from "./TimelineBar";

const REPOSITORY_URL = "https://github.com/ALumiEye/eyeviz";
const EDIT_DEBOUNCE_MS = 200;
const jsonSchema = getSceneSpecJsonSchema();

const initialExample = EXAMPLES[0];
const initialText = initialExample?.text ?? '{\n  "version": "0.1",\n  "objects": []\n}\n';
const initialAnalysis = analyze(initialText);

/** Creates an engine, keeping the current values of parameters that still exist. */
function createEngine(model: SceneModel, previous: EyeVizEngine | null): EyeVizEngine {
  const engine = new EyeVizEngine(model);
  if (previous) {
    const carried: Record<string, number | boolean> = {};
    for (const parameter of engine.getParameters()) {
      if (previous.model.parameters.get(parameter.id)?.kind === parameter.kind) {
        carried[parameter.id] = previous.getParameterValue(parameter.id);
      }
    }
    engine.setParameters(carried);
    // Keep the moment being looked at while the spec is edited.
    if (engine.model.animated) engine.setTime(previous.getTime());
  }
  return engine;
}

export function App() {
  const [exampleId, setExampleId] = useState(initialExample?.id ?? "");
  const [text, setText] = useState(initialText);
  const [analysis, setAnalysis] = useState<Analysis>(initialAnalysis);
  const [engine, setEngine] = useState<EyeVizEngine | null>(() =>
    initialAnalysis.model ? new EyeVizEngine(initialAnalysis.model) : null,
  );
  const [reveal, setReveal] = useState<{ range: TextRange; token: number }>();
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Parse → validate → render if valid; otherwise keep the last valid scene. */
  const apply = (next: string, resetParameters: boolean) => {
    const result = analyze(next);
    setAnalysis(result);
    const model = result.model;
    if (model) setEngine((previous) => createEngine(model, resetParameters ? null : previous));
  };

  const onEdit = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(next, false), EDIT_DEBOUNCE_MS);
  };

  const loadExample = (id: string) => {
    const example = EXAMPLES.find((e) => e.id === id);
    if (!example) return;
    clearTimeout(timer.current);
    setSelected(null);
    setExampleId(id);
    setText(example.text);
    apply(example.text, true);
  };

  const format = () => {
    try {
      const formatted = `${formatJson(JSON.parse(text))}\n`;
      setText(formatted);
      apply(formatted, false);
    } catch {
      flash("Fix JSON syntax errors before formatting");
    }
  };

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 2000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      flash("Copied to clipboard");
    } catch {
      flash("Copy failed — select the text and copy manually");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exampleId || "scene"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const issues = analysis.issues;
  const stale = issues.length > 0 && engine !== null;

  return (
    <div className="layout">
      <header className="header">
        <h1>
          EyeViz <span className="by">by ALumiEye</span>
        </h1>
        <div className="toolbar">
          <label className="example-select">
            <span className="visually-hidden">Example</span>
            <select value={exampleId} onChange={(event) => loadExample(event.target.value)}>
              {exampleId === "" ? <option value="">Custom scene</option> : null}
              {EXAMPLES.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={format}>
            Format
          </button>
          <button type="button" onClick={() => void copy()}>
            Copy
          </button>
          <button type="button" onClick={download}>
            Download
          </button>
          <a className="repo-link" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </header>

      <main className="workspace">
        <section className="pane pane-editor" aria-labelledby="spec-title">
          <h2 id="spec-title" className="pane-title">
            Scene Specification <span className="badge">v0.1</span>
          </h2>
          <div className="editor-host">
            <SpecEditor
              value={text}
              onChange={onEdit}
              issues={issues}
              jsonSchema={jsonSchema}
              reveal={reveal}
            />
          </div>
        </section>

        <section className="pane pane-preview" aria-labelledby="preview-title">
          <h2 id="preview-title" className="pane-title">
            Live Visualization
            {stale ? <span className="badge badge-warn">showing last valid scene</span> : null}
          </h2>
          <div className="preview-host">
            {engine ? (
              <EyeVizScene
                engine={engine}
                selected={selected}
                onSelect={setSelected}
                lazy={false}
                style={{ height: "100%", aspectRatio: "auto" }}
              />
            ) : (
              <p className="muted empty">Fix the issues to see the scene.</p>
            )}
          </div>
          {engine && selected && engine.model.objects.has(selected) ? (
            <SelectionPanel
              engine={engine}
              id={selected}
              onShowInSpec={(index) =>
                setReveal({ range: locate(text, `objects[${index}]`), token: Math.random() })
              }
              onClear={() => setSelected(null)}
            />
          ) : null}
          {engine ? <StepsBar engine={engine} /> : null}
          {engine?.model.animated ? <TimelineBar engine={engine} /> : null}
        </section>

        <section className="pane pane-issues" aria-labelledby="issues-title">
          <h2 id="issues-title" className="pane-title">
            Validation
            <span className={issues.length ? "badge badge-error" : "badge badge-ok"}>
              {issues.length ? `${issues.length} issue${issues.length > 1 ? "s" : ""}` : "valid"}
            </span>
          </h2>
          {issues.length === 0 ? (
            <p className="muted">The scene is valid.</p>
          ) : (
            <ul className="issues">
              {issues.map((issue, index) => {
                const { line, column } = lineColumn(text, issue.range.offset);
                return (
                  <li key={`${issue.path}-${issue.code}-${index}`}>
                    <button
                      type="button"
                      className="issue"
                      onClick={() =>
                        setReveal({ range: issue.range, token: index + Math.random() })
                      }
                    >
                      <span className="issue-code">{issue.code}</span>
                      <span className="issue-message">{issue.message}</span>
                      <span className="issue-where">
                        {issue.path || "document"} · line {line}:{column}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="pane pane-controls" aria-labelledby="controls-title">
          <h2 id="controls-title" className="pane-title">
            Parameters
          </h2>
          {engine ? <ParameterControls engine={engine} /> : null}
        </section>
      </main>

      <div className="notice" role="status" aria-live="polite">
        {notice}
      </div>
    </div>
  );
}
