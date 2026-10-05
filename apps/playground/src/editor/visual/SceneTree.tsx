/** The scene as a list: objects, parameters and steps, with an "Add" menu. */
import type { EyeVizIssue, SceneObjectSpec, SceneSpec } from "@alumieye/eyeviz";
import {
  createObject,
  createParameter,
  createStep,
  type NewItemKind,
  type SceneDocument,
} from "@alumieye/eyeviz/authoring";
import { useState } from "react";
import { useT } from "../../i18n";
import type { Selection } from "./Inspector";

const ICONS: Record<SceneObjectSpec["type"], string> = {
  point: "●",
  segment: "╱",
  vector: "➚",
  plane: "▱",
  curve: "∿",
  surface: "◒",
  implicit: "◯",
  label: "A",
};

interface Props {
  readonly doc: SceneDocument;
  readonly spec: SceneSpec;
  readonly issues: readonly EyeVizIssue[];
  readonly selection: Selection | null;
  readonly onSelect: (selection: Selection | null) => void;
  readonly onNotice: (message: string) => void;
}

export function SceneTree({ doc, spec, issues, selection, onSelect, onNotice }: Props) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasIssue = (prefix: string) =>
    issues.some(
      (i) =>
        i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`),
    );
  const isSelected = (kind: Selection["kind"], id?: string) =>
    selection?.kind === kind && (id === undefined || ("id" in selection && selection.id === id));

  const add = (kind: NewItemKind | "step") => {
    setMenuOpen(false);
    if (kind === "number" || kind === "toggle") {
      const parameter = createParameter(doc.spec, kind);
      if (doc.apply({ op: "addParameter", parameter }).ok)
        onSelect({ kind: "parameter", id: parameter.id });
      return;
    }
    if (kind === "step") {
      const step = createStep(doc.spec);
      if (doc.apply({ op: "addStep", step }).ok) onSelect({ kind: "step", id: step.id });
      return;
    }
    const object = createObject(doc.spec, kind);
    if (!object) return onNotice(t.needTwoPoints);
    if (doc.apply({ op: "addObject", object }).ok) onSelect({ kind: "object", id: object.id });
  };

  const menu: readonly [NewItemKind | "step", string][] = [
    ["point", t.addPoint],
    ["segment", t.addSegment],
    ["vector", t.addVector],
    ["plane", t.addPlane],
    ["graph", t.addGraph],
    ["implicit", t.addImplicit],
    ["surface", t.addSurface],
    ["label", t.addLabel],
    ["number", t.addNumber],
    ["toggle", t.addToggle],
    ["step", t.addStep],
  ];

  return (
    <nav className="tree" aria-label={t.scene}>
      <div className="tree-header">
        <button
          type="button"
          className={isSelected("scene") ? "tree-item selected" : "tree-item"}
          onClick={() => onSelect({ kind: "scene" })}
        >
          ⚙ {t.sceneSettings}
        </button>
        <div className="add-menu">
          <button
            type="button"
            className="primary"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            + {t.add}
          </button>
          {menuOpen ? (
            <div className="menu" role="menu">
              {menu.map(([kind, label]) => (
                <button key={kind} type="button" role="menuitem" onClick={() => add(kind)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <h4>{t.objects}</h4>
      {spec.objects.length === 0 ? <p className="muted">{t.emptyTree}</p> : null}
      <ul>
        {spec.objects.map((object, index) => (
          <li key={object.id}>
            <button
              type="button"
              className={isSelected("object", object.id) ? "tree-item selected" : "tree-item"}
              aria-current={isSelected("object", object.id)}
              onClick={() => onSelect({ kind: "object", id: object.id })}
            >
              <span className="tree-icon" aria-hidden="true">
                {ICONS[object.type]}
              </span>
              <span className="tree-id">{object.id}</span>
              {object.name ? <span className="tree-name">{object.name}</span> : null}
              {hasIssue(`objects[${index}]`) ? (
                <span className="tree-issue" aria-label="!">
                  ⚠
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {spec.parameters?.length ? (
        <>
          <h4>{t.sliders}</h4>
          <ul>
            {spec.parameters.map((parameter, index) => (
              <li key={parameter.id}>
                <button
                  type="button"
                  className={
                    isSelected("parameter", parameter.id) ? "tree-item selected" : "tree-item"
                  }
                  onClick={() => onSelect({ kind: "parameter", id: parameter.id })}
                >
                  <span className="tree-icon" aria-hidden="true">
                    {typeof parameter.value === "boolean" ? "◐" : "⊶"}
                  </span>
                  <span className="tree-id">{parameter.id}</span>
                  {parameter.label ? <span className="tree-name">{parameter.label}</span> : null}
                  {hasIssue(`parameters[${index}]`) ? <span className="tree-issue">⚠</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {spec.steps?.length ? (
        <>
          <h4>{t.steps}</h4>
          <ol>
            {spec.steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  className={isSelected("step", step.id) ? "tree-item selected" : "tree-item"}
                  onClick={() => onSelect({ kind: "step", id: step.id })}
                >
                  <span className="tree-icon" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="tree-name">{step.title ?? step.id}</span>
                  {hasIssue(`steps[${index}]`) ? <span className="tree-issue">⚠</span> : null}
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </nav>
  );
}
