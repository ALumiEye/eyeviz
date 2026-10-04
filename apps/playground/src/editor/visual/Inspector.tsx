/** Property forms for the selected object, parameter, step or the scene itself. */
import type {
  Anchor,
  EyeVizEngine,
  EyeVizIssue,
  ParameterSpec,
  Scalar,
  SceneObjectSpec,
  SceneSpec,
  StepSpec,
  Vec3,
} from "@alumieye/eyeviz";
import {
  parameterUsers,
  type EditCommand,
  type EditResult,
  type SceneDocument,
} from "@alumieye/eyeviz/authoring";
import { useEyeVizState } from "@alumieye/eyeviz/react";
import { useState } from "react";
import { useT, type T } from "../../i18n";
import { facts } from "../../SelectionPanel";
import {
  Checkbox,
  CommitInput,
  DeleteButton,
  Field,
  issuesAt,
  MultiSelect,
  NumberInput,
  ScalarInput,
  Select,
  TextInput,
  Vec3Input,
} from "./fields";

export type Selection =
  | { readonly kind: "object"; readonly id: string }
  | { readonly kind: "parameter"; readonly id: string }
  | { readonly kind: "step"; readonly id: string }
  | { readonly kind: "scene" };

interface Props {
  readonly doc: SceneDocument;
  readonly spec: SceneSpec;
  readonly issues: readonly EyeVizIssue[];
  readonly engine: EyeVizEngine | null;
  readonly selection: Selection | null;
  readonly onSelect: (selection: Selection | null) => void;
}

/** Applies a command, coalescing rapid edits of the same field into one undo step. */
function useEdit(doc: SceneDocument) {
  return (command: EditCommand, coalesceKey?: string): EditResult =>
    doc.apply(command, coalesceKey ? { coalesceKey } : {});
}

export function Inspector({ doc, spec, issues, engine, selection, onSelect }: Props) {
  const t = useT();
  if (!selection) return <p className="muted inspector-empty">{t.nothingSelected}</p>;

  switch (selection.kind) {
    case "scene":
      return <SceneForm doc={doc} spec={spec} issues={issues} />;
    case "object": {
      const index = spec.objects.findIndex((o) => o.id === selection.id);
      const object = spec.objects[index];
      if (!object) return null;
      return (
        <ObjectForm
          key={object.id}
          doc={doc}
          spec={spec}
          object={object}
          path={`objects[${index}]`}
          issues={issues}
          engine={engine}
          onSelect={onSelect}
        />
      );
    }
    case "parameter": {
      const index = (spec.parameters ?? []).findIndex((p) => p.id === selection.id);
      const parameter = spec.parameters?.[index];
      if (!parameter) return null;
      return (
        <ParameterForm
          key={parameter.id}
          doc={doc}
          spec={spec}
          parameter={parameter}
          path={`parameters[${index}]`}
          issues={issues}
          onSelect={onSelect}
        />
      );
    }
    case "step": {
      const index = (spec.steps ?? []).findIndex((s) => s.id === selection.id);
      const step = spec.steps?.[index];
      if (!step) return null;
      return (
        <StepForm
          key={step.id}
          doc={doc}
          spec={spec}
          step={step}
          index={index}
          engine={engine}
          onSelect={onSelect}
        />
      );
    }
  }
}

/** Renames via the authoring command; returns an error message on failure. */
function renamer(doc: SceneDocument, from: string, onRenamed: (id: string) => void) {
  return (to: string) => {
    const result = doc.apply({ op: "rename", from, to });
    if (!result.ok) return result.error.message;
    onRenamed(to);
    return undefined;
  };
}

function LiveFacts({ engine, id }: { engine: EyeVizEngine | null; id: string }) {
  const t = useT();
  const state = useEyeVizState(engine, (s) => s.objects[id]);
  const model = engine?.model.objects.get(id);
  if (!state || !model) return null;
  const parameters = [...model.dependencies].filter((d) => engine?.model.parameters.has(d));
  return (
    <div className="live" aria-live="off">
      <span className="live-title">{t.live}</span> {facts(state, t).join(" · ")}
      {!state.visible ? <span className="badge">{t.hidden}</span> : null}
      {!state.valid ? <span className="badge badge-error">{t.undefinedHere}</span> : null}
      {parameters.length || model.dependencies.has("t") ? (
        <div className="muted">
          {t.dependsOn}{" "}
          {[...parameters, ...(model.dependencies.has("t") ? [t.time] : [])].join(", ")}
        </div>
      ) : null}
    </div>
  );
}

const TYPE_NAMES = (t: T): Record<SceneObjectSpec["type"], string> => ({
  point: t.addPoint,
  segment: t.addSegment,
  vector: t.addVector,
  plane: t.addPlane,
  curve: t.addGraph,
  surface: t.addSurface,
  label: t.addLabel,
});

function ObjectForm({
  doc,
  spec,
  object,
  path,
  issues,
  engine,
  onSelect,
}: {
  doc: SceneDocument;
  spec: SceneSpec;
  object: SceneObjectSpec;
  path: string;
  issues: readonly EyeVizIssue[];
  engine: EyeVizEngine | null;
  onSelect: (selection: Selection | null) => void;
}) {
  const t = useT();
  const edit = useEdit(doc);
  const id = object.id;
  const change = (changes: Record<string, unknown>, field: string) =>
    edit({ op: "updateObject", id, changes }, `edit:${id}.${field}`);
  const points = spec.objects
    .filter((o) => o.type === "point")
    .map((o) => ({ value: o.id, label: o.name ? `${o.id} — ${o.name}` : o.id }));
  const toggles = (spec.parameters ?? [])
    .filter((p) => typeof p.value === "boolean")
    .map((p) => p.id);
  const numberParameters = (spec.parameters ?? [])
    .filter((p) => typeof p.value === "number")
    .map((p) => p.id);
  const at = (field: string) => issuesAt(issues, `${path}.${field}`);

  return (
    <form
      className="inspector-form"
      onSubmit={(e) => e.preventDefault()}
      aria-label={TYPE_NAMES(t)[object.type]}
    >
      <h3>
        {TYPE_NAMES(t)[object.type]} <code>{id}</code>
      </h3>
      <LiveFacts engine={engine} id={id} />

      <CommitInput
        label={t.id}
        hint={t.idHint}
        value={id}
        onCommit={renamer(doc, id, (next) => onSelect({ kind: "object", id: next }))}
        {...(issuesAt(issues, `${path}.id`)[0]
          ? { error: issuesAt(issues, `${path}.id`)[0]?.message }
          : {})}
      />
      <TextInput
        label={t.displayName}
        value={object.name ?? ""}
        onChange={(v) => change({ name: v || null }, "name")}
      />

      {object.type === "point" ? (
        <>
          <Vec3Input
            label={t.position}
            path={`${path}.position`}
            issues={issues}
            value={object.position}
            onChange={(v) => change({ position: v }, "position")}
          />
          {numberParameters.length > 0 ? (
            <MultiSelect
              label={t.draggableBy}
              options={numberParameters.map((p) => ({ value: p, label: p }))}
              selected={object.drag ?? []}
              onChange={(drag) => change({ drag: drag.length ? drag.slice(0, 3) : null }, "drag")}
            />
          ) : null}
          {at("drag").length ? (
            <Field label="" issues={at("drag")}>
              {null}
            </Field>
          ) : null}
        </>
      ) : null}

      {object.type === "segment" ? (
        <>
          <Select
            label={t.from}
            value={object.from}
            options={points}
            issues={at("from")}
            onChange={(v) => change({ from: v }, "from")}
          />
          <Select
            label={t.to}
            value={object.to}
            options={points}
            issues={at("to")}
            onChange={(v) => change({ to: v }, "to")}
          />
        </>
      ) : null}

      {object.type === "vector" ? (
        <>
          <AnchorInput
            label={t.origin}
            value={object.origin}
            points={points}
            allowNone
            issues={issues}
            path={`${path}.origin`}
            onChange={(v) => change({ origin: v ?? null }, "origin")}
          />
          <Vec3Input
            label={t.components}
            path={`${path}.components`}
            issues={issues}
            value={object.components}
            onChange={(v) => change({ components: v }, "components")}
          />
        </>
      ) : null}

      {object.type === "plane" ? (
        <PlaneFields object={object} path={path} issues={issues} points={points} change={change} />
      ) : null}

      {object.type === "curve" ? (
        <>
          <p className="field-hint">{t.curveHint}</p>
          <CommitInput
            label={t.variable}
            value={object.variable}
            onCommit={(v) => {
              const r = change(
                { variable: v, position: renameIn(object.position, object.variable, v) },
                "variable",
              );
              return r.ok ? undefined : r.error.message;
            }}
            {...(at("variable")[0] ? { error: at("variable")[0]?.message } : {})}
          />
          <RangeInput
            label={`${t.domain} (${object.variable})`}
            value={object.domain}
            issues={issues}
            path={`${path}.domain`}
            onChange={(v) => change({ domain: v }, "domain")}
          />
          <Vec3Input
            label={t.position}
            path={`${path}.position`}
            issues={issues}
            value={object.position}
            onChange={(v) => change({ position: v }, "position")}
          />
        </>
      ) : null}

      {object.type === "surface" ? (
        <>
          <p className="field-hint">{t.surfaceHint}</p>
          {object.variables.map((variable) => (
            <RangeInput
              key={variable}
              label={`${t.domain} (${variable})`}
              value={object.domain[variable] ?? [0, 1]}
              issues={issues}
              path={`${path}.domain.${variable}`}
              onChange={(v) =>
                change({ domain: { ...object.domain, [variable]: v } }, `domain.${variable}`)
              }
            />
          ))}
          <Vec3Input
            label={t.position}
            path={`${path}.position`}
            issues={issues}
            value={object.position}
            onChange={(v) => change({ position: v }, "position")}
          />
        </>
      ) : null}

      {object.type === "label" ? (
        <>
          <TextInput
            label={t.text}
            value={object.text}
            onChange={(v) => change({ text: v || " " }, "text")}
          />
          <AnchorInput
            label={t.at}
            value={object.at}
            points={points}
            issues={issues}
            path={`${path}.at`}
            onChange={(v) => change({ at: v ?? [0, 0, 0] }, "at")}
          />
        </>
      ) : null}

      <ColorInput value={object.color} onChange={(v) => change({ color: v ?? null }, "color")} />
      <Select
        label={t.visibility}
        value={
          object.visible === undefined || object.visible === true
            ? "always"
            : object.visible === false
              ? "never"
              : `param:${object.visible}`
        }
        options={[
          { value: "always", label: t.visibleAlways },
          { value: "never", label: t.visibleNever },
          ...toggles.map((p) => ({ value: `param:${p}`, label: t.visibleWhen(p) })),
        ]}
        issues={at("visible")}
        onChange={(v) =>
          change({ visible: v === "always" ? null : v === "never" ? false : v.slice(6) }, "visible")
        }
      />
      <DeleteButton
        onDelete={() => {
          const result = edit({ op: "removeObject", id });
          if (result.ok) onSelect(null);
        }}
      />
    </form>
  );
}

/** Renames a curve variable inside its position formulas when the variable changes. */
function renameIn(vec: Vec3, from: string, to: string): Vec3 {
  const pattern = new RegExp(`(?<![A-Za-z0-9_.])${from}(?![A-Za-z0-9_])`, "g");
  return vec.map((v) =>
    typeof v === "string" && /^[A-Za-z_]\w*$/.test(to) ? v.replace(pattern, to) : v,
  ) as unknown as Vec3;
}

function RangeInput({
  label,
  value,
  onChange,
  issues,
  path,
}: {
  label: string;
  value: readonly [Scalar, Scalar];
  onChange: (value: [Scalar, Scalar]) => void;
  issues: readonly EyeVizIssue[];
  path: string;
}) {
  const t = useT();
  return (
    <fieldset className="field range">
      <legend>{label}</legend>
      <ScalarInput
        label={t.from}
        value={value[0]}
        issues={issuesAt(issues, `${path}[0]`)}
        onChange={(v) => onChange([v, value[1]])}
      />
      <ScalarInput
        label={t.to}
        value={value[1]}
        issues={issuesAt(issues, `${path}[1]`)}
        onChange={(v) => onChange([value[0], v])}
      />
      {issuesAt(issues, path)
        .filter((i) => i.path === path)
        .map((i) => (
          <span key={i.message} className="field-error" role="alert">
            {i.message}
          </span>
        ))}
    </fieldset>
  );
}

/** A point reference, or an inline position (or nothing, when allowed). */
function AnchorInput({
  label,
  value,
  points,
  onChange,
  issues,
  path,
  allowNone = false,
}: {
  label: string;
  value: Anchor | undefined;
  points: readonly { value: string; label: string }[];
  onChange: (value: Anchor | undefined) => void;
  issues: readonly EyeVizIssue[];
  path: string;
  allowNone?: boolean;
}) {
  const t = useT();
  const mode =
    value === undefined ? "none" : typeof value === "string" ? `point:${value}` : "custom";
  return (
    <>
      <Select
        label={label}
        value={mode}
        options={[
          ...(allowNone ? [{ value: "none", label: t.originZero }] : []),
          ...points.map((p) => ({ value: `point:${p.value}`, label: p.label })),
          { value: "custom", label: t.originCustom },
        ]}
        issues={typeof value === "string" ? issuesAt(issues, path) : []}
        onChange={(v) =>
          onChange(v === "none" ? undefined : v === "custom" ? [0, 0, 0] : v.slice(6))
        }
      />
      {Array.isArray(value) ? (
        <Vec3Input
          label={label}
          path={path}
          issues={issues}
          value={value as Vec3}
          onChange={(v) => onChange(v)}
        />
      ) : null}
    </>
  );
}

function PlaneFields({
  object,
  path,
  issues,
  points,
  change,
}: {
  object: Extract<SceneObjectSpec, { type: "plane" }>;
  path: string;
  issues: readonly EyeVizIssue[];
  points: readonly { value: string; label: string }[];
  change: (changes: Record<string, unknown>, field: string) => EditResult;
}) {
  const t = useT();
  const through = object.through !== undefined;
  return (
    <>
      <Select
        label={t.planeForm}
        value={through ? "through" : "pointNormal"}
        options={[
          { value: "through", label: t.planeThrough },
          { value: "pointNormal", label: t.planePointNormal },
        ]}
        onChange={(v) => {
          if (v === "through") {
            const ids = points.map((p) => p.value);
            if (ids.length >= 3)
              change({ through: ids.slice(0, 3), point: null, normal: null }, "form");
          } else {
            change({ through: null, point: [0, 0, 0], normal: [0, 0, 1] }, "form");
          }
        }}
      />
      {through && object.through ? (
        <fieldset className="field">
          <legend>{t.throughPoints}</legend>
          {object.through.map((id, i) => (
            <Select
              key={i}
              label={`${t.point} ${i + 1}`}
              value={id}
              options={points}
              issues={issuesAt(issues, `${path}.through[${i}]`)}
              onChange={(v) => {
                const next = [...(object.through ?? [])];
                next[i] = v;
                change({ through: next }, "through");
              }}
            />
          ))}
        </fieldset>
      ) : (
        <>
          <AnchorInput
            label={t.point}
            value={object.point}
            points={points}
            issues={issues}
            path={`${path}.point`}
            onChange={(v) => change({ point: v ?? [0, 0, 0] }, "point")}
          />
          <Vec3Input
            label={t.normal}
            path={`${path}.normal`}
            issues={issues}
            value={object.normal ?? [0, 0, 1]}
            onChange={(v) => change({ normal: v }, "normal")}
          />
        </>
      )}
      <ScalarInput
        label={t.extent}
        value={object.extent ?? ""}
        issues={issuesAt(issues, `${path}.extent`)}
        onChange={(v) => change({ extent: v === "" ? null : v }, "extent")}
      />
    </>
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const t = useT();
  return (
    <div className="field color-field">
      <span className="field-label">{t.color}</span>
      <div className="color-row">
        <input
          type="color"
          aria-label={t.color}
          value={value ?? "#888888"}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
        >
          {t.defaultColor}
        </button>
      </div>
    </div>
  );
}

function ParameterForm({
  doc,
  spec,
  parameter,
  path,
  issues,
  onSelect,
}: {
  doc: SceneDocument;
  spec: SceneSpec;
  parameter: ParameterSpec;
  path: string;
  issues: readonly EyeVizIssue[];
  onSelect: (selection: Selection | null) => void;
}) {
  const t = useT();
  const edit = useEdit(doc);
  const [deleteError, setDeleteError] = useState<string>();
  const id = parameter.id;
  const change = (changes: Record<string, unknown>, field: string) =>
    edit({ op: "updateParameter", id, changes }, `param:${id}.${field}`);
  const isNumber = typeof parameter.value === "number";
  const n = parameter as Extract<ParameterSpec, { value: number }>;

  return (
    <form className="inspector-form" onSubmit={(e) => e.preventDefault()}>
      <h3>
        {isNumber ? t.addNumber : t.addToggle} <code>{id}</code>
      </h3>
      <CommitInput
        label={t.id}
        hint={t.idHint}
        value={id}
        onCommit={renamer(doc, id, (next) => onSelect({ kind: "parameter", id: next }))}
      />
      <TextInput
        label={t.label}
        value={parameter.label ?? ""}
        onChange={(v) => change({ label: v || null }, "label")}
      />
      {isNumber ? (
        <>
          <NumberInput
            label={t.value}
            value={n.value}
            onChange={(v) => v !== undefined && change({ value: v }, "value")}
          />
          <div className="field-row">
            <NumberInput
              label={t.min}
              value={n.min}
              onChange={(v) => change({ min: v ?? null }, "min")}
            />
            <NumberInput
              label={t.max}
              value={n.max}
              onChange={(v) => change({ max: v ?? null }, "max")}
            />
            <NumberInput
              label={t.step}
              value={n.step}
              onChange={(v) => change({ step: v ?? null }, "step")}
            />
          </div>
          <Select
            label={t.unit}
            value={n.unit ?? "none"}
            options={[
              { value: "none", label: t.unitNone },
              { value: "deg", label: t.unitDeg },
              { value: "rad", label: t.unitRad },
            ]}
            onChange={(v) => change({ unit: v === "none" ? null : v }, "unit")}
          />
        </>
      ) : (
        <Checkbox
          label={t.on}
          checked={parameter.value === true}
          onChange={(v) => change({ value: v }, "value")}
        />
      )}
      <Checkbox
        label={t.interactive}
        checked={parameter.interactive !== false}
        onChange={(v) => change({ interactive: v ? null : false }, "interactive")}
      />
      {issuesAt(issues, path).map((i) => (
        <span key={i.path + i.message} className="field-error" role="alert">
          {i.message}
        </span>
      ))}
      <DeleteButton
        {...(deleteError ? { error: deleteError } : {})}
        onDelete={() => {
          const users = parameterUsers(spec, id);
          if (users.length) return setDeleteError(t.inUse(users.join(", ")));
          if (edit({ op: "removeParameter", id }).ok) onSelect(null);
        }}
      />
    </form>
  );
}

function StepForm({
  doc,
  spec,
  step,
  index,
  engine,
  onSelect,
}: {
  doc: SceneDocument;
  spec: SceneSpec;
  step: StepSpec;
  index: number;
  engine: EyeVizEngine | null;
  onSelect: (selection: Selection | null) => void;
}) {
  const t = useT();
  const edit = useEdit(doc);
  const change = (changes: Record<string, unknown>, field: string) =>
    edit({ op: "updateStep", id: step.id, changes }, `step:${step.id}.${field}`);
  const objects = spec.objects.map((o) => ({ value: o.id, label: o.id }));
  const count = spec.steps?.length ?? 0;
  const list = (field: "show" | "hide" | "highlight" | "focus", label: string) => (
    <MultiSelect
      label={label}
      options={objects}
      selected={step[field] ?? []}
      onChange={(ids) => change({ [field]: ids.length ? ids : null }, field)}
    />
  );
  return (
    <form className="inspector-form" onSubmit={(e) => e.preventDefault()}>
      <h3>
        {t.stepOf(index + 1, count)} <code>{step.id}</code>
      </h3>
      <div className="button-row">
        <button
          type="button"
          onClick={() => engine?.setStep(index)}
          disabled={!engine || engine.getSteps().length !== count}
        >
          {t.goToStep}
        </button>
        <button
          type="button"
          disabled={index === 0}
          onClick={() => edit({ op: "moveStep", id: step.id, index: index - 1 })}
        >
          ↑ {t.moveUp}
        </button>
        <button
          type="button"
          disabled={index === count - 1}
          onClick={() => edit({ op: "moveStep", id: step.id, index: index + 1 })}
        >
          ↓ {t.moveDown}
        </button>
      </div>
      <TextInput
        label={t.title}
        value={step.title ?? ""}
        onChange={(v) => change({ title: v || null }, "title")}
      />
      <TextInput
        label={t.description}
        multiline
        value={step.description ?? ""}
        onChange={(v) => change({ description: v || null }, "description")}
      />
      {list("show", t.stepShow)}
      {list("hide", t.stepHide)}
      {list("highlight", t.stepHighlight)}
      {list("focus", t.stepFocus)}
      <DeleteButton
        onDelete={() => {
          if (edit({ op: "removeStep", id: step.id }).ok) onSelect(null);
        }}
      />
    </form>
  );
}

function SceneForm({
  doc,
  spec,
  issues,
}: {
  doc: SceneDocument;
  spec: SceneSpec;
  issues: readonly EyeVizIssue[];
}) {
  const t = useT();
  const edit = useEdit(doc);
  const metadata = spec.metadata ?? {};
  const scene = spec.scene ?? {};
  const timeline = spec.timeline;
  const setMetadata = (changes: Record<string, string | undefined>, field: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...metadata, ...changes })) if (v) next[k] = v;
    edit({ op: "setMetadata", value: Object.keys(next).length ? next : null }, `meta:${field}`);
  };
  return (
    <form className="inspector-form" onSubmit={(e) => e.preventDefault()}>
      <h3>{t.sceneSettings}</h3>
      <TextInput
        label={t.title}
        value={metadata.title ?? ""}
        onChange={(v) => setMetadata({ title: v }, "title")}
      />
      <TextInput
        label={t.description}
        multiline
        value={metadata.description ?? ""}
        onChange={(v) => setMetadata({ description: v }, "description")}
      />
      <Select
        label={t.dimension}
        value={scene.dimension ?? "3d"}
        options={[
          { value: "2d", label: t.dimension2d },
          { value: "3d", label: t.dimension3d },
        ]}
        onChange={(v) => edit({ op: "setScene", value: { ...scene, dimension: v } })}
      />
      <Checkbox
        label={t.axes}
        checked={scene.axes !== false}
        onChange={(v) => edit({ op: "setScene", value: { ...scene, axes: v } })}
      />
      <Checkbox
        label={t.grid}
        checked={scene.grid !== false}
        onChange={(v) => edit({ op: "setScene", value: { ...scene, grid: v } })}
      />
      <Checkbox
        label={t.timeline}
        checked={timeline !== undefined}
        onChange={(v) => edit({ op: "setTimeline", value: v ? { duration: 5, loop: true } : null })}
      />
      {timeline ? (
        <>
          <ScalarInput
            label={t.duration}
            value={timeline.duration ?? ""}
            issues={issuesAt(issues, "timeline.duration")}
            onChange={(v) => {
              const { duration: _previous, ...rest } = timeline;
              edit(
                { op: "setTimeline", value: v === "" ? rest : { ...rest, duration: v } },
                "timeline.duration",
              );
            }}
          />
          <Checkbox
            label={t.loop}
            checked={timeline.loop === true}
            onChange={(v) => edit({ op: "setTimeline", value: { ...timeline, loop: v } })}
          />
          <Checkbox
            label={t.autoplay}
            checked={timeline.autoplay === true}
            onChange={(v) => edit({ op: "setTimeline", value: { ...timeline, autoplay: v } })}
          />
        </>
      ) : null}
    </form>
  );
}
