/** Small, accessible form fields used by the visual editor. */
import type { EyeVizIssue, Scalar } from "@alumieye/eyeviz";
import { useId, useState, type ReactNode } from "react";
import { useT } from "../../i18n";

/** Issues whose path is `path` or inside it. */
export function issuesAt(issues: readonly EyeVizIssue[], path: string): EyeVizIssue[] {
  return issues.filter(
    (i) => i.path === path || i.path.startsWith(`${path}.`) || i.path.startsWith(`${path}[`),
  );
}

function IssueText({ issues }: { issues: readonly EyeVizIssue[] }) {
  const t = useT();
  if (issues.length === 0) return null;
  return (
    <span className="field-error" role="alert">
      {t.issue(issues[0]?.message ?? "")}
    </span>
  );
}

export function Field({
  label,
  hint,
  issues = [],
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  issues?: readonly EyeVizIssue[];
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={issues.length ? "field field-invalid" : "field"}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && issues.length === 0 ? <span className="field-hint">{hint}</span> : null}
      <IssueText issues={issues} />
    </div>
  );
}

/** Parses an input as a number when it is one, otherwise keeps it as a formula. */
export function toScalar(text: string): Scalar {
  const trimmed = text.trim();
  if (trimmed !== "" && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed))
    return Number(trimmed);
  return trimmed;
}

/** A number or a formula. Applies on every keystroke (edits coalesce into one undo step). */
export function ScalarInput({
  value,
  onChange,
  label,
  issues = [],
  placeholder,
}: {
  value: Scalar;
  onChange: (value: Scalar) => void;
  label: string;
  issues?: readonly EyeVizIssue[];
  placeholder?: string;
}) {
  const id = useId();
  const isFormula = typeof value === "string";
  return (
    <div className={issues.length ? "scalar scalar-invalid" : "scalar"}>
      <label htmlFor={id} className="scalar-label">
        {label}
      </label>
      <input
        id={id}
        className={isFormula ? "scalar-input formula" : "scalar-input"}
        value={String(value)}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={issues.length > 0}
        onChange={(event) => onChange(toScalar(event.target.value))}
      />
      <span className="scalar-kind" aria-hidden="true">
        {isFormula ? "ƒx" : "123"}
      </span>
    </div>
  );
}

/** A formula kept as text (e.g. an equation). Applies on every keystroke. */
export function FormulaInput({
  value,
  onChange,
  label,
  issues = [],
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  issues?: readonly EyeVizIssue[];
}) {
  const id = useId();
  return (
    <Field label={label} issues={issues} htmlFor={id}>
      <input
        id={id}
        className="scalar-input formula"
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={issues.length > 0}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/** Three scalar inputs for x, y, z. */
export function Vec3Input({
  value,
  onChange,
  label,
  issues,
  path,
  names = ["x", "y", "z"],
}: {
  value: readonly [Scalar, Scalar, Scalar];
  onChange: (value: [Scalar, Scalar, Scalar]) => void;
  label: string;
  issues: readonly EyeVizIssue[];
  path: string;
  names?: readonly [string, string, string];
}) {
  const t = useT();
  return (
    <fieldset className="field vec3">
      <legend>{label}</legend>
      {[0, 1, 2].map((axis) => (
        <ScalarInput
          key={axis}
          label={names[axis] as string}
          value={value[axis] as Scalar}
          issues={issuesAt(issues, `${path}[${axis}]`)}
          onChange={(next) => {
            const copy = [...value] as [Scalar, Scalar, Scalar];
            copy[axis] = next;
            onChange(copy);
          }}
        />
      ))}
      <span className="field-hint">{t.numberOrFormula}</span>
    </fieldset>
  );
}

/** Text input committed on blur or Enter (used for IDs, where every keystroke would rename). */
export function CommitInput({
  value,
  onCommit,
  label,
  hint,
  error,
}: {
  value: string;
  onCommit: (value: string) => string | undefined;
  label: string;
  hint?: string;
  error?: string | undefined;
}) {
  const t = useT();
  const id = useId();
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const commit = () => {
    if (draft === undefined || draft === value) {
      setDraft(undefined);
      setProblem(undefined);
      return;
    }
    const failure = onCommit(draft.trim());
    setProblem(failure);
    if (!failure) setDraft(undefined);
  };
  const message = problem ?? error;
  return (
    <div className={message ? "field field-invalid" : "field"}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={draft ?? value}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={Boolean(message)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(undefined);
            setProblem(undefined);
          }
        }}
      />
      {hint && !message ? <span className="field-hint">{hint}</span> : null}
      {message ? (
        <span className="field-error" role="alert">
          {t.issue(message)}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  label,
  multiline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      {multiline ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function NumberInput({
  value,
  onChange,
  label,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
      />
    </Field>
  );
}

export function Select<V extends string>({
  value,
  onChange,
  label,
  options,
  issues,
}: {
  value: V;
  onChange: (value: V) => void;
  label: string;
  options: readonly { value: V; label: string }[];
  issues?: readonly EyeVizIssue[];
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} {...(issues ? { issues } : {})}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Choose any number of items (e.g. objects shown by a step). */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
}) {
  const set = new Set(selected);
  return (
    <fieldset className="field multiselect">
      <legend>{label}</legend>
      <div className="chips">
        {options.map((o) => (
          <label key={o.value} className={set.has(o.value) ? "chip chip-on" : "chip"}>
            <input
              type="checkbox"
              checked={set.has(o.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? options
                        .filter((x) => set.has(x.value) || x.value === o.value)
                        .map((x) => x.value)
                    : selected.filter((v) => v !== o.value),
                )
              }
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Delete with an inline confirmation (no blocking browser dialogs). */
export function DeleteButton({ onDelete, error }: { onDelete: () => void; error?: string }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="delete">
      {confirming ? (
        <>
          <span>{t.confirmDelete}</span>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            {t.yes}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {t.no}
          </button>
        </>
      ) : (
        <button type="button" className="danger-outline" onClick={() => setConfirming(true)}>
          🗑 {t.delete}
        </button>
      )}
      {error ? (
        <span className="field-error" role="alert">
          {t.issue(error)}
        </span>
      ) : null}
    </div>
  );
}
