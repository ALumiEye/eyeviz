import {
  compileScene,
  EyeVizEngine,
  getSceneSpecJsonSchema,
  type NumberVec3,
  type SceneModel,
  type SceneSpec,
} from "@alumieye/eyeviz";
import { emptyScene, SceneDocument } from "@alumieye/eyeviz/authoring";
import { EyeVizScene, type EyeVizSceneHandle } from "@alumieye/eyeviz/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { analyze, type Analysis } from "./analyze";
import { lineColumn, locate, type TextRange } from "./editor/locate";
import { SpecEditor } from "./editor/SpecEditor";
import { Inspector, type Selection } from "./editor/visual/Inspector";
import { SceneTree } from "./editor/visual/SceneTree";
import { EXAMPLES } from "./examples";
import { formatJson } from "./format";
import { setLanguage, useT, type Language } from "./i18n";
import { ParameterControls } from "./ParameterControls";
import { QuickGraphBar } from "./QuickGraphBar";
import { SelectionPanel } from "./SelectionPanel";
import { StepsBar } from "./StepsBar";
import { TimelineBar } from "./TimelineBar";

const REPOSITORY_URL = "https://github.com/ALumiEye/eyeviz";
const EDIT_DEBOUNCE_MS = 200;
const DRAFT_KEY = "eyeviz.playground.draft";
const jsonSchema = getSceneSpecJsonSchema();

type Mode = "visual" | "json";

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
    const step = previous.getState().step;
    if (step !== null && step < engine.getSteps().length) engine.setStep(step);
  }
  return engine;
}

function engineFor(spec: SceneSpec, previous: EyeVizEngine | null): EyeVizEngine | null {
  const result = compileScene(spec);
  return result.ok ? createEngine(result.model, previous) : null;
}

function readDraft(): { exampleId: string; spec: SceneSpec } | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return undefined;
    const draft = JSON.parse(raw) as { exampleId?: string; text?: string };
    const result = analyze(draft.text ?? "");
    return result.spec ? { exampleId: draft.exampleId ?? "", spec: result.spec } : undefined;
  } catch {
    return undefined;
  }
}

function exampleSpec(id: string): SceneSpec | undefined {
  const example = EXAMPLES.find((e) => e.id === id);
  return example ? analyze(example.text).spec : undefined;
}

const draft = readDraft();
const initialExampleId = draft?.exampleId ?? EXAMPLES[0]?.id ?? "";
const initialSpec = draft?.spec ?? exampleSpec(initialExampleId) ?? emptyScene();

export function App() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("visual");
  const [exampleId, setExampleId] = useState(initialExampleId);
  const [doc, setDoc] = useState(() => new SceneDocument(initialSpec));
  const spec = useSyncExternalStore(
    (onChange) => doc.subscribe(onChange),
    () => doc.spec,
  );
  const [engine, setEngine] = useState<EyeVizEngine | null>(() => engineFor(initialSpec, null));
  const [jsonText, setJsonText] = useState("");
  const [jsonAnalysis, setJsonAnalysis] = useState<Analysis | undefined>(undefined);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reveal, setReveal] = useState<{ range: TextRange; token: number }>();
  const [notice, setNotice] = useState(draft ? t.draftRestored : "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sceneRef = useRef<EyeVizSceneHandle>(null);

  // The document is the single source of truth: every change (edit, undo, JSON) updates the
  // engine when the spec is valid; otherwise the last valid scene stays on screen.
  useEffect(
    () =>
      doc.subscribe((change) => {
        const result = compileScene(change.spec);
        if (result.ok) setEngine((previous) => createEngine(result.model, previous));
        try {
          localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ exampleId: "", text: formatJson(change.spec) }),
          );
        } catch {
          // Drafts are a convenience; the editor works without storage.
        }
      }),
    [doc],
  );
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timeout);
  }, [notice]);

  // Visual mode: issues come from compiling the document, located in its formatted JSON.
  const visualText = useMemo(() => `${formatJson(spec)}\n`, [spec]);
  const visualIssues = useMemo(() => {
    const result = compileScene(spec);
    return result.ok ? [] : result.issues;
  }, [spec]);
  const text = mode === "json" ? jsonText : visualText;
  const issueList =
    mode === "json" && jsonAnalysis
      ? jsonAnalysis.issues
      : visualIssues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          path: issue.path,
          range: locate(visualText, issue.path),
        }));
  const jsonBlocked = mode === "json" && jsonAnalysis !== undefined && !jsonAnalysis.spec;

  const loadSpec = (next: SceneSpec, id: string) => {
    clearTimeout(timer.current);
    const nextDoc = new SceneDocument(next);
    setDoc(nextDoc);
    setEngine(engineFor(next, null));
    setExampleId(id);
    setSelection(null);
    setJsonText(`${formatJson(next)}\n`);
    setJsonAnalysis(undefined);
  };

  const loadExample = (id: string) => {
    if (id === "new2d" || id === "new3d")
      return loadSpec(emptyScene(id === "new2d" ? "2d" : "3d"), "");
    const next = exampleSpec(id);
    if (next) loadSpec(next, id);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "json") {
      setJsonText(visualText);
      setJsonAnalysis(undefined);
    } else if (jsonBlocked) {
      setNotice(t.jsonInvalidForVisual);
      return;
    }
    setMode(next);
  };

  const onJsonEdit = (next: string) => {
    setJsonText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const result = analyze(next);
      setJsonAnalysis(result);
      if (result.spec) doc.replace(result.spec, "Edit JSON", { coalesceKey: "json" });
    }, EDIT_DEBOUNCE_MS);
  };

  const format = () => {
    try {
      const formatted = `${formatJson(JSON.parse(text))}\n`;
      if (mode === "json") onJsonEdit(formatted);
    } catch {
      setNotice(t.formatNeedsJson);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t.copied);
    } catch {
      setNotice(t.copyFailed);
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

  const undo = () => doc.undo();
  const redo = () => doc.redo();

  // Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y — unless typing in a field or the JSON editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (mode !== "visual" || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select") || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) doc.undo();
      else if ((key === "z" && event.shiftKey) || key === "y") doc.redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, mode]);

  /** In the visual editor, dragging a point with fixed coordinates edits those coordinates. */
  const onDragPoint = (id: string, target: readonly [number, number, number]) => {
    if (engine?.isDraggable(id)) return engine.dragPoint(id, target as NumberVec3);
    const object = doc.spec.objects.find((o) => o.id === id);
    if (object?.type !== "point" || !object.position.every((v) => typeof v === "number")) return;
    const round = (v: number) => Math.round(v * 100) / 100;
    const next = object.position.map((v, axis) =>
      doc.spec.scene?.dimension === "2d" && axis === 2 ? v : round(target[axis] as number),
    );
    doc.apply(
      { op: "updateObject", id, changes: { position: next } },
      { coalesceKey: `drag:${id}` },
    );
  };

  const selectedObject = selection?.kind === "object" ? selection.id : null;
  const stale = issueList.length > 0 && engine !== null;

  const preview = (
    <section className="pane pane-preview" aria-labelledby="preview-title">
      <h2 id="preview-title" className="pane-title">
        {t.liveVisualization}
        {stale ? <span className="badge badge-warn">{t.showingLastValid}</span> : null}
        {engine ? (
          <button type="button" className="fit-view" onClick={() => sceneRef.current?.resetView()}>
            ⤢ {t.fitView}
          </button>
        ) : null}
      </h2>
      <div className="preview-host">
        {engine ? (
          <EyeVizScene
            ref={sceneRef}
            engine={engine}
            selected={selectedObject}
            onSelect={(id) => setSelection(id ? { kind: "object", id } : null)}
            dragMode={mode === "visual" ? "all" : "declared"}
            onDragPoint={onDragPoint}
            lazy={false}
            style={{ height: "100%", aspectRatio: "auto" }}
          />
        ) : (
          <p className="muted empty">{t.fixToSee}</p>
        )}
      </div>
      {mode === "json" && engine && selectedObject && engine.model.objects.has(selectedObject) ? (
        <SelectionPanel
          engine={engine}
          id={selectedObject}
          onShowInSpec={(index) =>
            setReveal({ range: locate(text, `objects[${index}]`), token: Math.random() })
          }
          onClear={() => setSelection(null)}
        />
      ) : null}
      {engine ? <StepsBar engine={engine} /> : null}
      {engine?.model.animated ? <TimelineBar engine={engine} /> : null}
    </section>
  );

  const issuesPanel = (
    <section className="pane pane-issues" aria-labelledby="issues-title">
      <h2 id="issues-title" className="pane-title">
        {t.validation}
        <span className={issueList.length ? "badge badge-error" : "badge badge-ok"}>
          {issueList.length ? t.issues(issueList.length) : t.valid}
        </span>
      </h2>
      {issueList.length === 0 ? (
        <p className="muted">{t.sceneIsValid}</p>
      ) : (
        <ul className="issues">
          {issueList.map((issue, index) => {
            const { line, column } = lineColumn(text, issue.range.offset);
            const objectIndex = /^objects\[(\d+)\]/.exec(issue.path)?.[1];
            return (
              <li key={`${issue.path}-${issue.code}-${index}`}>
                <button
                  type="button"
                  className="issue"
                  onClick={() => {
                    const object =
                      objectIndex !== undefined ? spec.objects[Number(objectIndex)] : undefined;
                    if (mode === "visual" && object)
                      setSelection({ kind: "object", id: object.id });
                    else setReveal({ range: issue.range, token: index + Math.random() });
                  }}
                >
                  <span className="issue-code">{issue.code}</span>
                  <span className="issue-message">{issue.message}</span>
                  <span className="issue-where">
                    {issue.path || t.document}
                    {mode === "json" ? ` · ${t.line} ${line}:${column}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const controls = (
    <section className="pane pane-controls" aria-labelledby="controls-title">
      <h2 id="controls-title" className="pane-title">
        {t.parameters}
      </h2>
      {engine ? <ParameterControls engine={engine} /> : null}
    </section>
  );

  return (
    <div className="layout">
      <header className="header">
        <h1>
          {t.appTitle} <span className="by">{t.by}</span>
        </h1>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label={t.modeLabel}>
            <button
              type="button"
              aria-pressed={mode === "visual"}
              onClick={() => switchMode("visual")}
            >
              {t.modeVisual}
            </button>
            <button type="button" aria-pressed={mode === "json"} onClick={() => switchMode("json")}>
              {t.modeJson}
            </button>
          </div>
          <label className="example-select">
            <span className="visually-hidden">{t.examples}</span>
            <select value={exampleId} onChange={(event) => loadExample(event.target.value)}>
              {exampleId === "" ? <option value="">{t.customScene}</option> : null}
              <option value="new2d">＋ {t.newScene2d}</option>
              <option value="new3d">＋ {t.newScene3d}</option>
              {EXAMPLES.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.title}
                </option>
              ))}
            </select>
          </label>
          {mode === "visual" ? (
            <>
              <button type="button" onClick={undo} disabled={!doc.canUndo} title={doc.undoSummary}>
                ↶ {t.undo}
              </button>
              <button type="button" onClick={redo} disabled={!doc.canRedo} title={doc.redoSummary}>
                ↷ {t.redo}
              </button>
            </>
          ) : (
            <button type="button" onClick={format}>
              {t.format}
            </button>
          )}
          <button type="button" onClick={() => void copy()}>
            {t.copy}
          </button>
          <button type="button" onClick={download}>
            {t.download}
          </button>
          <label className="example-select">
            <span className="visually-hidden">{t.language}</span>
            <select
              value={t.language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <a className="repo-link" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </header>

      {mode === "visual" ? (
        <main className="workspace-visual">
          <aside className="pane pane-tree">
            <SceneTree
              doc={doc}
              spec={spec}
              issues={visualIssues}
              selection={selection}
              onSelect={setSelection}
              onNotice={setNotice}
            />
            {issueList.length ? issuesPanel : null}
          </aside>
          <div className="visual-center">
            <QuickGraphBar
              doc={doc}
              onAdded={(id, sliders) => {
                setSelection({ kind: "object", id });
                setNotice(t.quickGraphAdded(sliders.join(", ")));
              }}
            />
            {preview}
            {controls}
          </div>
          <aside className="pane pane-inspector" aria-label={t.inspector}>
            <Inspector
              doc={doc}
              spec={spec}
              issues={visualIssues}
              engine={engine}
              selection={selection}
              onSelect={setSelection}
            />
          </aside>
        </main>
      ) : (
        <main className="workspace">
          <section className="pane pane-editor" aria-labelledby="spec-title">
            <h2 id="spec-title" className="pane-title">
              {t.sceneSpecification} <span className="badge">v0.1</span>
            </h2>
            <div className="editor-host">
              <SpecEditor
                value={jsonText}
                onChange={onJsonEdit}
                issues={issueList}
                jsonSchema={jsonSchema}
                reveal={reveal}
              />
            </div>
          </section>
          {preview}
          {issuesPanel}
          {controls}
        </main>
      )}

      <div className="notice" role="status" aria-live="polite">
        {notice}
      </div>
    </div>
  );
}
