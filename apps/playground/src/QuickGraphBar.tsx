import type { SceneSpec } from "@alumieye/eyeviz";
import { parseQuickFormula, uniqueId, type SceneDocument } from "@alumieye/eyeviz/authoring";
import { useId, useState } from "react";
import { toScalar } from "./editor/visual/fields";
import { useT } from "./i18n";

/** Distinct, colour-blind-friendlier colours for successive graphs. */
const COLORS = ["#1c7ed6", "#e8590c", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599", "#e03131"];

interface Props {
  readonly doc: SceneDocument;
  readonly onAdded: (id: string, newSliders: readonly string[]) => void;
}

/**
 * Type a function the way it is written on paper — "y = 3x² − 2sin x" — and press Enter.
 * The formula is converted to EyeViz's strict form and added as a curve; unknown names
 * become sliders.
 */
export function QuickGraphBar({ doc, onAdded }: Props) {
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
        domain: [toScalar(from), toScalar(to)],
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
        draw();
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
            onChange={(e) => setFrom(e.target.value)}
            aria-label={`x ${t.quickGraphFrom}`}
          />
        </label>
        <label className="quick-graph-range">
          <span>{t.quickGraphTo}</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label={`x ${t.quickGraphTo}`}
          />
        </label>
        <button type="submit" className="primary" disabled={!input.trim()}>
          {t.quickGraphDraw}
        </button>
      </div>
      <div
        id={`${id}-hint`}
        className={error ? "field-error" : "field-hint"}
        role={error ? "alert" : undefined}
      >
        {error ??
          (preview?.ok
            ? `→ ${preview.expression}${preview.unknown.length ? ` · ${t.quickGraphNewSliders(preview.unknown.join(", "))}` : ""}`
            : preview
              ? preview.message
              : t.quickGraphHint)}
      </div>
    </form>
  );
}

function isEmpty3d(spec: SceneSpec): boolean {
  return spec.objects.length === 0 && (spec.scene?.dimension ?? "3d") === "3d";
}
