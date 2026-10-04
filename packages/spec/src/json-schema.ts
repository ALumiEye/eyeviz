import * as z from "zod";
import { sceneSpecSchema } from "./schema";

let cached: Readonly<Record<string, unknown>> | undefined;

/**
 * JSON Schema (draft 2020-12) of the Scene Specification, for editors, LLM tooling and
 * validation in other languages. Computed on first use.
 *
 * Note: the JSON Schema covers structure only. Cross-field rules (unique IDs, references,
 * `min < max`, expressions) are checked by `validateSpec()` and the core compiler.
 */
export function getSceneSpecJsonSchema(): Readonly<Record<string, unknown>> {
  cached ??= Object.freeze({
    ...z.toJSONSchema(sceneSpecSchema),
    title: "EyeViz Scene Specification v0.1",
  });
  return cached;
}
