import type { EyeVizEngine, ObjectState } from "@alumieye/eyeviz";
import { useEyeVizState } from "@alumieye/eyeviz/react";
import { useT, type T } from "./i18n";

const n = (value: number) => (Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "—");
const vec = (v: readonly number[]) => `(${v.map(n).join(", ")})`;
const length = (v: readonly number[]) => Math.hypot(...v);

/** Live, read-only facts about an object's current state. */
export function facts(state: ObjectState, t: T): string[] {
  switch (state.type) {
    case "point":
      return [`${t.factPosition} ${vec(state.position)}`];
    case "segment":
      return [
        `${t.factLength} ${n(length(state.to.map((v, i) => v - (state.from[i] as number))))}`,
      ];
    case "vector":
      return [
        `${t.factComponents} ${vec(state.components)}`,
        `${t.factLength} ${n(length(state.components))}`,
      ];
    case "plane":
      return [`${t.factNormal} ${vec(state.normal)}`, `${t.factThrough} ${vec(state.center)}`];
    case "curve":
      return [
        t.factPieces(
          state.polylines.length,
          state.polylines.reduce((s, p) => s + p.length / 3, 0),
        ),
      ];
    case "surface":
      return [t.factGrid(state.rows, state.columns)];
    case "label":
      return [`${t.factAt} ${vec(state.position)}`];
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
  const t = useT();
  const state = useEyeVizState(engine, (s) => s.objects[id]);
  const model = engine.model.objects.get(id);
  if (!model || !state) return null;

  const parameters = [...model.dependencies].filter((d) => engine.model.parameters.has(d));
  const usesTime = model.dependencies.has("t");
  const drag = model.type === "point" ? model.drag : undefined;

  return (
    <div className="selection" role="region" aria-label={t.selected}>
      <div className="selection-body">
        <div>
          <strong>{model.name ?? id}</strong> <span className="muted">({model.type})</span>
          {!state.valid ? <span className="badge badge-error">{t.undefinedHere}</span> : null}
          {!state.visible ? <span className="badge">{t.hidden}</span> : null}
        </div>
        <div className="selection-facts">{facts(state, t).join(" · ")}</div>
        {parameters.length || usesTime ? (
          <div className="muted">
            {t.dependsOn} {[...parameters, ...(usesTime ? [t.time] : [])].join(", ")}
            {drag ? ` · ${t.dragChanges} ${drag.join(", ")}` : ""}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={() => onShowInSpec(model.index)}>
        {t.showInSpec}
      </button>
      <button type="button" aria-label={t.clearSelection} onClick={onClear}>
        ✕
      </button>
    </div>
  );
}
