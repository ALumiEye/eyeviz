import {
  DEFAULT_IMPLICIT_VARIABLES,
  type ImplicitSpec,
  type ParameterSpec,
  type Scalar,
  type SceneObjectSpec,
  type SceneSpec,
} from "@alumieye/eyeviz";
import {
  latexToFormula,
  parseQuickFormula,
  uniqueId,
  type QuickFormulaResult,
  type SceneDocument,
} from "@alumieye/eyeviz/authoring";
import { useEffect, useId, useRef, useState } from "react";
import { MathInput } from "./editor/MathInput";
import { toScalar } from "./editor/visual/fields";
import { useT } from "./i18n";

/** Distinct, colour-blind-friendlier colours for successive graphs. */
const COLORS = ["#1c7ed6", "#e8590c", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599", "#e03131"];

/** What a formula adds to the scene: new sliders and the curve. */
export interface QuickGraphAddition {
  readonly parameters: readonly ParameterSpec[];
  readonly object: SceneObjectSpec;
}

interface Props {
  readonly doc: SceneDocument;
  /** The selected object, whose x range the range fields show and edit. */
  readonly selected: string | null;
  readonly onAdded: (id: string, newSliders: readonly string[]) => void;
  /** After the x range of existing graphs changed (e.g. to fit the view). */
  readonly onRangeApplied: (from: string, to: string) => void;
  /** The graph of the formula being typed, to show before it is added (or `undefined`). */
  readonly onDraft: (draft: QuickGraphAddition | undefined) => void;
}

/**
 * Type a function or an equation the way it is written on paper — in a formula field (√,
 * powers and fractions shown as in a textbook) or as text ("y = 3x² − 2sin x"). The graph is
 * previewed while typing; Enter adds it, and unknown names become sliders. With the formula
 * empty, the x range applies to the selected graph (or to every graph when none is selected).
 */
export function QuickGraphBar({ doc, selected, onAdded, onRangeApplied, onDraft }: Props) {
  const t = useT();
  const id = useId();
  const [mode, setMode] = useState<"math" | "text">("math");
  const [latex, setLatex] = useState("");
  const [input, setInput] = useState("");
  const [from, setFrom] = useState("-5");
  const [to, setTo] = useState("5");
  const [error, setError] = useState<string>();

  const known = (doc.spec.parameters ?? [])
    .filter((p) => typeof p.value === "number")
    .map((p) => p.id);
  const source = mode === "math" ? latex : input;
  const hasInput = source.trim() !== "";
  const converted = mode === "math" && hasInput ? latexToFormula(latex) : undefined;
  const preview: QuickFormulaResult | undefined = !hasInput
    ? undefined
    : converted && !converted.ok
      ? { ok: false, expression: "", message: converted.message }
      : parseQuickFormula(converted?.ok ? converted.text : input, known);

  const graphs = doc.spec.objects.filter(
    (o): o is GraphOfX | ImplicitSpec => isGraphOfX(o) || o.type === "implicit",
  );
  const selectedGraph = graphs.find((o) => o.id === selected);
  const rangeTargets = selectedGraph ? [selectedGraph] : graphs;
  const editingRange = !hasInput && rangeTargets.length > 0;

  // Show the selected graph's range when the selection changes (not while the user types).
  const [shownGraph, setShownGraph] = useState<string>();
  if (selectedGraph && selectedGraph.id !== shownGraph) {
    setShownGraph(selectedGraph.id);
    const [start, end] = xRange(selectedGraph);
    setFrom(String(start));
    setTo(String(end));
  } else if (!selectedGraph && shownGraph !== undefined) {
    setShownGraph(undefined);
  }

  // Typed text is kept as the display name; a formula field's LaTeX does not read as text, so
  // its graph is named after the strict form.
  const addition =
    preview?.ok === true
      ? buildAddition(
          doc.spec,
          preview,
          [rangeScalar(from), rangeScalar(to)],
          mode === "text" ? input.trim() : undefined,
        )
      : undefined;

  // Preview the graph while typing. Keyed by content, so re-renders do not send it again.
  // While the formula is half-typed (e.g. an empty root), the last valid preview stays: the
  // graph does not flicker and the view does not jump.
  const [draftKey, setDraftKey] = useState("");
  const nextDraftKey = !hasInput ? "" : addition ? JSON.stringify(addition) : draftKey;
  if (nextDraftKey !== draftKey) setDraftKey(nextDraftKey);
  const onDraftRef = useRef(onDraft);
  useEffect(() => {
    onDraftRef.current = onDraft;
  });
  useEffect(() => {
    onDraftRef.current(draftKey ? (JSON.parse(draftKey) as QuickGraphAddition) : undefined);
  }, [draftKey]);
  useEffect(() => () => onDraftRef.current(undefined), []);

  const applyRange = () => {
    const domain = [rangeScalar(from), rangeScalar(to)] as const;
    if (typeof domain[0] === "number" && typeof domain[1] === "number" && domain[0] >= domain[1]) {
      return setError(t.quickGraphRangeInvalid);
    }
    for (const graph of rangeTargets) {
      // An equation's curve gets the same range for x and y: a square window.
      const changes =
        graph.type === "implicit"
          ? {
              domain: Object.fromEntries(
                (graph.variables ?? DEFAULT_IMPLICIT_VARIABLES).map((v) => [v, [...domain]]),
              ),
            }
          : { domain: [domain[0], domain[1]] };
      const result = doc.apply({ op: "updateObject", id: graph.id, changes });
      if (!result.ok) return setError(result.error.message);
    }
    setError(undefined);
    onRangeApplied(String(domain[0]), String(domain[1]));
  };

  const draw = () => {
    if (!preview) return;
    if (!preview.ok) return setError(preview.message);
    if (!addition) return;
    // New sliders for unknown names, then the curve — each its own undo step.
    for (const parameter of addition.parameters) doc.apply({ op: "addParameter", parameter });
    if (isEmpty3d(doc.spec))
      doc.apply({ op: "setScene", value: { ...doc.spec.scene, dimension: "2d" } });
    const result = doc.apply({ op: "addObject", object: addition.object });
    if (!result.ok) return setError(result.error.message);
    setError(undefined);
    setInput("");
    setLatex("");
    onAdded(addition.object.id, preview.unknown);
  };

  const submit = () => (editingRange ? applyRange() : draw());

  return (
    <form
      className="quick-graph"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="quick-graph-label">
        {t.quickGraph}
      </label>
      <div className="quick-graph-row">
        {/* An equation carries its own "=". */}
        <span className="quick-graph-y" aria-hidden="true">
          {source.includes("=") ? "" : "y ="}
        </span>
        {mode === "math" ? (
          <MathInput
            className="quick-graph-input quick-graph-math"
            value={latex}
            label={t.quickGraph}
            describedBy={`${id}-hint`}
            invalid={Boolean(error) || preview?.ok === false}
            decimalSeparator={t.language === "vi" ? "," : "."}
            onChange={(next) => {
              setLatex(next);
              setError(undefined);
            }}
            onSubmit={submit}
            onUnavailable={() => setMode("text")}
          />
        ) : (
          <input
            id={id}
            className="quick-graph-input"
            value={input}
            placeholder={t.quickGraphPlaceholder}
            spellCheck={false}
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setInput(event.target.value);
              setError(undefined);
            }}
          />
        )}
        <button
          type="button"
          className="quick-graph-mode"
          aria-pressed={mode === "math"}
          title={mode === "math" ? t.quickGraphUseText : t.quickGraphUseMath}
          aria-label={mode === "math" ? t.quickGraphUseText : t.quickGraphUseMath}
          onClick={() => {
            setMode(mode === "math" ? "text" : "math");
            setError(undefined);
          }}
        >
          {mode === "math" ? "Aa" : "√x"}
        </button>
        <label className="quick-graph-range">
          <span>{t.quickGraphFrom}</span>
          <input
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setError(undefined);
            }}
            aria-label={`x ${t.quickGraphFrom}`}
          />
        </label>
        <label className="quick-graph-range">
          <span>{t.quickGraphTo}</span>
          <input
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setError(undefined);
            }}
            aria-label={`x ${t.quickGraphTo}`}
          />
        </label>
        <button type="submit" className="primary" disabled={!hasInput && !editingRange}>
          {editingRange ? t.quickGraphApply : t.quickGraphDraw}
        </button>
      </div>
      <div
        id={`${id}-hint`}
        className={error ? "field-error" : "field-hint"}
        role={error ? "alert" : undefined}
      >
        {t.issue(error ?? "") ||
          (preview?.ok
            ? `→ ${preview.expression}${preview.unknown.length ? ` · ${t.quickGraphNewSliders(preview.unknown.join(", "))}` : ""}`
            : preview
              ? t.issue(preview.message)
              : editingRange
                ? t.quickGraphRangeHint(rangeTargets.length)
                : mode === "math"
                  ? t.quickGraphMathHint
                  : t.quickGraphHint)}
      </div>
    </form>
  );
}

/** The sliders and the curve a valid formula adds. */
function buildAddition(
  spec: SceneSpec,
  formula: Extract<QuickFormulaResult, { ok: true }>,
  range: readonly [Scalar, Scalar],
  typed: string | undefined,
): QuickGraphAddition {
  const count = spec.objects.filter((o) => o.type === "curve" || o.type === "implicit").length;
  const color = COLORS[count % COLORS.length] as string;
  const parameters = formula.unknown.map((name): ParameterSpec => ({
    id: name,
    value: 1,
    min: -5,
    max: 5,
    step: 0.1,
    label: name,
    control: "slider",
  }));
  const object: SceneObjectSpec =
    formula.kind === "equation"
      ? {
          id: uniqueId(spec, "c"),
          type: "implicit",
          name: typed ?? formula.expression,
          equation: formula.expression,
          domain: { x: [...range], y: [...range] },
          color,
        }
      : {
          id: uniqueId(spec, "f"),
          type: "curve",
          name: `y = ${typed?.replace(/^(y|f\s*\(\s*x\s*\))\s*=\s*/i, "") ?? formula.expression}`,
          variable: "x",
          domain: [...range],
          position: ["x", formula.expression, 0],
          color,
        };
  return { parameters, object };
}

type GraphOfX = Extract<SceneObjectSpec, { type: "curve" }>;

/** A graph of y in x, as quick graph draws it: a curve whose x coordinate is its variable. */
function isGraphOfX(object: SceneObjectSpec): object is GraphOfX {
  return object.type === "curve" && object.position[0] === object.variable;
}

/** The horizontal range of a graph or an equation's curve. */
function xRange(graph: GraphOfX | ImplicitSpec): readonly [Scalar, Scalar] {
  if (graph.type === "curve") return graph.domain;
  const [x] = graph.variables ?? DEFAULT_IMPLICIT_VARIABLES;
  return graph.domain[x] ?? [-5, 5];
}

/** A range bound; accepts a decimal comma (`-2,5`). */
function rangeScalar(text: string) {
  return toScalar(text.replace(/(\d),(\d)/g, "$1.$2"));
}

function isEmpty3d(spec: SceneSpec): boolean {
  return spec.objects.length === 0 && (spec.scene?.dimension ?? "3d") === "3d";
}
