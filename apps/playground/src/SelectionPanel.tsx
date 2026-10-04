import type { EyeVizEngine, ObjectState } from "@alumieye/eyeviz";
import { useEyeVizState } from "@alumieye/eyeviz/react";

const n = (value: number) => (Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "—");
const vec = (v: readonly number[]) => `(${v.map(n).join(", ")})`;
const length = (v: readonly number[]) => Math.hypot(...v);

/** Live, read-only facts about an object's current state. */
function facts(state: ObjectState): string[] {
  switch (state.type) {
    case "point":
      return [`position ${vec(state.position)}`];
    case "segment":
      return [`length ${n(length(state.to.map((v, i) => v - (state.from[i] as number))))}`];
    case "vector":
      return [`components ${vec(state.components)}`, `length ${n(length(state.components))}`];
    case "plane":
      return [`normal ${vec(state.normal)}`, `through ${vec(state.center)}`];
    case "curve":
      return [
        `${state.polylines.length} piece(s), ${state.polylines.reduce((s, p) => s + p.length / 3, 0)} samples`,
      ];
    case "surface":
      return [`${state.rows} × ${state.columns} grid`];
    case "label":
      return [`at ${vec(state.position)}`];
  }
}

interface Props {
  readonly engine: EyeVizEngine;
  readonly id: string;
  readonly onShowInSpec: (index: number) => void;
  readonly onClear: () => void;
}

/** Inspector for the selected object: what it is, its live values, and what drives it. */
export function SelectionPanel({ engine, id, onShowInSpec, onClear }: Props) {
  const state = useEyeVizState(engine, (s) => s.objects[id]);
  const model = engine.model.objects.get(id);
  if (!model || !state) return null;

  const parameters = [...model.dependencies].filter((d) => engine.model.parameters.has(d));
  const usesTime = model.dependencies.has("t");
  const drag = model.type === "point" ? model.drag : undefined;

  return (
    <div className="selection" role="region" aria-label="Selected object">
      <div className="selection-body">
        <div>
          <strong>{model.name ?? id}</strong> <span className="muted">({model.type})</span>
          {!state.valid ? <span className="badge badge-error">undefined here</span> : null}
          {!state.visible ? <span className="badge">hidden</span> : null}
        </div>
        <div className="selection-facts">{facts(state).join(" · ")}</div>
        {parameters.length || usesTime ? (
          <div className="muted">
            depends on {[...parameters, ...(usesTime ? ["time t"] : [])].join(", ")}
            {drag ? ` · drag changes ${drag.join(", ")}` : ""}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={() => onShowInSpec(model.index)}>
        Show in spec
      </button>
      <button type="button" aria-label="Clear selection" onClick={onClear}>
        ✕
      </button>
    </div>
  );
}
