import type { SceneObjectSpec, SceneSpec } from "@alumieye/eyeviz";
import { parseQuickFormula, uniqueId, type SceneDocument } from "@alumieye/eyeviz/authoring";
import { useId, useState } from "react";
import { toScalar } from "./editor/visual/fields";
import { useT } from "./i18n";

/** Distinct, colour-blind-friendlier colours for successive graphs. */
const COLORS = ["#1c7ed6", "#e8590c", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599", "#e03131"];

interface Props {
  readonly doc: SceneDocument;
  /** The selected object, whose x range the range fields show and edit. */
  readonly selected: string | null;
  readonly onAdded: (id: string, newSliders: readonly string[]) => void;
  /** After the x range of existing graphs changed (e.g. to fit the view). */
  readonly onRangeApplied: (from: string, to: string) => void;
}

/**
 * Type a function the way it is written on paper — "y = 3x² − 2sin x" — and press Enter.
 * The formula is converted to EyeViz's strict form and added as a curve; unknown names
 * become sliders. With the formula empty, the x range applies to the selected graph (or to
 * every graph of y in x when none is selected).
 */
export function QuickGraphBar({ doc, selected, onAdded, onRangeApplied }: Props) {
  const t = useT();
  const id = useId();
  const [input, setInput] = useState("");
  const [from, setFrom] = useState("-5");
  const [to, setTo] = useState("5");
  const [error, setError] = useState<string>();

  const known = (doc.spec.parameters ?? [])
    .filter((p) => typeof p.value === "number")
    .map((p) => p.id);
  const preview = input.trim() ? parseQuickFormula(input, known) : undefined;

  const graphs = doc.spec.objects.filter(isGraphOfX);
  const selectedGraph = graphs.find((o) => o.id === selected);
  const rangeTargets = selectedGraph ? [selectedGraph] : graphs;
  const editingRange = !input.trim() && rangeTargets.length > 0;

  // Show the selected graph's range when the selection changes (not while the user types).
  const [shownGraph, setShownGraph] = useState<string>();
  if (selectedGraph && selectedGraph.id !== shownGraph) {
    setShownGraph(selectedGraph.id);
    setFrom(String(selectedGraph.domain[0]));
    setTo(String(selectedGraph.domain[1]));
  } else if (!selectedGraph && shownGraph !== undefined) {
    setShownGraph(undefined);
  }

  const applyRange = () => {
    const domain = [rangeScalar(from), rangeScalar(to)] as const;
    if (typeof domain[0] === "number" && typeof domain[1] === "number" && domain[0] >= domain[1]) {
      return setError(t.quickGraphRangeInvalid);
    }
    for (const graph of rangeTargets) {
      const result = doc.apply({
        op: "updateObject",
        id: graph.id,
        changes: { domain: [domain[0], domain[1]] },
      });
      if (!result.ok) return setError(result.error.message);
    }
    setError(undefined);
    onRangeApplied(String(domain[0]), String(domain[1]));
  };

  const draw = () => {
    if (!preview) return;
    if (!preview.ok) return setError(preview.message);
    const spec = doc.spec;
    const curveId = uniqueId(spec, "f");
    const count = spec.objects.filter((o) => o.type === "curve").length;

    // New sliders for unknown names, then the curve — each its own undo step.
    for (const name of preview.unknown) {
      doc.apply({
        op: "addParameter",
        parameter: {
          id: name,
          value: 1,
          min: -5,
          max: 5,
          step: 0.1,
          label: name,
          control: "slider",
        },
      });
    }
    if (isEmpty3d(doc.spec))
      doc.apply({ op: "setScene", value: { ...doc.spec.scene, dimension: "2d" } });
    const result = doc.apply({
      op: "addObject",
      object: {
        id: curveId,
        type: "curve",
        // Keep the formula as the author wrote it for display; the spec stores the strict form.
        name: `y = ${input.trim().replace(/^(y|f\s*\(\s*x\s*\))\s*=\s*/i, "")}`,
        variable: "x",
        domain: [rangeScalar(from), rangeScalar(to)],
        position: ["x", preview.expression, 0],
        color: COLORS[count % COLORS.length] as string,
      },
    });
    if (!result.ok) return setError(result.error.message);
    setError(undefined);
    setInput("");
    onAdded(curveId, preview.unknown);
  };

  return (
    <form
      className="quick-graph"
      onSubmit={(event) => {
        event.preventDefault();
        if (editingRange) applyRange();
        else draw();
      }}
    >
      <label htmlFor={id} className="quick-graph-label">
        {t.quickGraph}
      </label>
      <div className="quick-graph-row">
        <span className="quick-graph-y" aria-hidden="true">
          y =
        </span>
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
        <button type="submit" className="primary" disabled={!input.trim() && !editingRange}>
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
                : t.quickGraphHint)}
      </div>
    </form>
  );
}

/** A graph of y in x, as quick graph draws it: a curve whose x coordinate is its variable. */
function isGraphOfX(
  object: SceneObjectSpec,
): object is Extract<SceneObjectSpec, { type: "curve" }> {
  return object.type === "curve" && object.position[0] === object.variable;
}

/** A range bound; accepts a decimal comma (`-2,5`). */
function rangeScalar(text: string) {
  return toScalar(text.replace(/(\d),(\d)/g, "$1.$2"));
}

function isEmpty3d(spec: SceneSpec): boolean {
  return spec.objects.length === 0 && (spec.scene?.dimension ?? "3d") === "3d";
}
