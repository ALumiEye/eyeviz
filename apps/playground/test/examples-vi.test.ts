import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SceneSpec } from "@alumieye/eyeviz";
import { describe, expect, it } from "vitest";
import { EXAMPLE_TEXT_VI, SAME_IN_VI } from "../src/examples-vi";

const folder = join(import.meta.dirname, "../../../examples");
const examples = readdirSync(folder)
  .filter((file) => file.endsWith(".json"))
  .map(
    (file) => [file, JSON.parse(readFileSync(join(folder, file), "utf8")) as SceneSpec] as const,
  );

/** Every human-readable string of a scene that the playground translates. */
function texts(spec: SceneSpec): string[] {
  return [
    spec.metadata?.title,
    spec.metadata?.description,
    ...(spec.parameters ?? []).map((p) => p.label),
    ...spec.objects.map((o) => o.name),
    ...(spec.steps ?? []).flatMap((s) => [s.title, s.description]),
  ].filter((text): text is string => text !== undefined);
}

describe("Vietnamese text of the examples", () => {
  it.each(examples)("covers every string of %s", (_, spec) => {
    const missing = texts(spec).filter((text) => !EXAMPLE_TEXT_VI[text] && !SAME_IN_VI.has(text));
    expect(missing).toEqual([]);
  });

  it("has no translation for a string that no example uses", () => {
    const used = new Set(examples.flatMap(([, spec]) => texts(spec)));
    expect(Object.keys(EXAMPLE_TEXT_VI).filter((text) => !used.has(text))).toEqual([]);
  });
});
