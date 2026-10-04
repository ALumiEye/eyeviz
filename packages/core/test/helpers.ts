import type { EyeVizIssue } from "@alumieye/eyeviz-spec";
import { compileScene } from "../src/index";

export function compileIssues(spec: unknown): readonly EyeVizIssue[] {
  const result = compileScene(spec);
  if (result.ok) throw new Error("expected compilation to fail");
  return result.issues;
}

export const scene = (objects: unknown[], parameters: unknown[] = []) => ({
  version: "0.1",
  parameters,
  objects,
});
