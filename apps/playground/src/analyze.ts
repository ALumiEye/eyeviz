import { compileScene, type SceneModel } from "@alumieye/eyeviz";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { locate } from "./editor/locate";
import type { EditorIssue } from "./editor/types";

export interface Analysis {
  readonly issues: readonly EditorIssue[];
  /** Present when the text is a valid scene. */
  readonly model?: SceneModel;
}

/** Text → JSON → validated, compiled scene, with every issue mapped to a text range. */
export function analyze(text: string): Analysis {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length > 0) {
    return {
      issues: errors.map((error) => ({
        code: "JSON_SYNTAX",
        message: `JSON syntax error: ${describe(printParseErrorCode(error.error))}`,
        path: "",
        range: { offset: error.offset, length: error.length },
      })),
    };
  }

  const result = compileScene(value);
  if (result.ok) return { issues: [], model: result.model };
  return {
    issues: result.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path,
      range: locate(text, issue.path, firstKey(issue.details)),
    })),
  };
}

/** Unknown-field issues carry the offending keys; point at the first one. */
function firstKey(details: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const keys = details?.keys;
  return Array.isArray(keys) && typeof keys[0] === "string" ? keys[0] : undefined;
}

/** `"CommaExpected"` → `"comma expected"`. */
function describe(code: string): string {
  return code.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
