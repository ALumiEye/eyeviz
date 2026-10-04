/**
 * Structured, serializable issues — the only error format in the public EyeViz API.
 * Library errors (Zod, math.js) are always translated into these.
 */

export type EyeVizIssueCode =
  | "SCHEMA_VALIDATION"
  | "UNSUPPORTED_VERSION"
  | "DUPLICATE_ID"
  | "RESERVED_NAME"
  | "MISSING_REFERENCE"
  | "INVALID_REFERENCE_TYPE"
  | "INVALID_PARAMETER"
  | "EXPRESSION_SYNTAX"
  | "UNKNOWN_SYMBOL"
  | "UNKNOWN_FUNCTION"
  | "CIRCULAR_DEPENDENCY"
  | "EXPRESSION_EVALUATION"
  | "LIMIT_EXCEEDED";

export interface EyeVizIssue {
  readonly code: EyeVizIssueCode;
  /** Human-readable and specific enough for a person or an LLM to fix the spec. */
  readonly message: string;
  /** JSON path into the spec, e.g. `"objects[2].position[0]"`. Empty for the root. */
  readonly path: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Thrown by APIs that cannot return a result object (e.g. `new EyeVizEngine(spec)`). */
export class EyeVizError extends Error {
  readonly issues: readonly EyeVizIssue[];

  constructor(issues: readonly EyeVizIssue[], message?: string) {
    const first = issues[0];
    super(
      message ??
        (first
          ? `${first.message}${first.path ? ` (at ${first.path})` : ""}${
              issues.length > 1 ? ` and ${issues.length - 1} more issue(s)` : ""
            }`
          : "Invalid EyeViz scene"),
    );
    this.name = "EyeVizError";
    this.issues = issues;
  }
}

/** Formats a property path as used in issues: `["objects", 2, "from"]` → `"objects[2].from"`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") out += `[${key}]`;
    else out += out ? `.${String(key)}` : String(key);
  }
  return out;
}
