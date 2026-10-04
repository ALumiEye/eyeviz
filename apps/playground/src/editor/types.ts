import type { TextRange } from "./locate";

/** An issue resolved to a location in the editor text. */
export interface EditorIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly range: TextRange;
}

/**
 * The contract between the playground and its editor. Monaco implements it; a plain textarea
 * implements it while Monaco loads (or if it fails to load).
 */
export interface SpecEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly issues: readonly EditorIssue[];
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  /** Changes whenever the editor should move the cursor to `range` (e.g. issue clicked). */
  readonly reveal?: { readonly range: TextRange; readonly token: number } | undefined;
}
