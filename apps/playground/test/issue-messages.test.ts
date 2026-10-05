import { compileScene, EyeVizEngine, validateSpec } from "@alumieye/eyeviz";
import { applyCommand, parseQuickFormula, type EditCommand } from "@alumieye/eyeviz/authoring";
import { describe, expect, it } from "vitest";
import { hasVietnamese, toVietnamese } from "../src/issue-messages";

const scene = (extra: Record<string, unknown>) => ({ version: "0.1", objects: [], ...extra });
const slider = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  value: 1,
  min: 0,
  max: 2,
  control: "slider",
  ...extra,
});
const point = (id: string, position: unknown[] = [0, 0, 0]) => ({ id, type: "point", position });
const curve = (y: unknown, extra: Record<string, unknown> = {}) => ({
  id: "f",
  type: "curve",
  variable: "x",
  domain: [-1, 1],
  position: ["x", y, 0],
  ...extra,
});

/** Messages of every issue for a spec: validation first, then compilation and evaluation. */
function messages(spec: unknown): string[] {
  const validation = validateSpec(spec);
  if (!validation.ok) return validation.issues.map((i) => i.message);
  const compiled = compileScene(spec);
  if (!compiled.ok) return compiled.issues.map((i) => i.message);
  return new EyeVizEngine(spec).getState().issues.map((i) => i.message);
}

/** Broken scenes, one per kind of problem a teacher may run into. */
const SCENES: Record<string, unknown> = {
  "not an object": 5,
  "no version": { objects: [] },
  "wrong version": { version: "9", objects: [] },
  "unknown field": scene({ colour: "red" }),
  "wrong type": scene({ objects: [point("A", ["a", 0])] }),
  "bad id": scene({ objects: [point("1A")] }),
  "bad color": scene({ objects: [{ ...point("A"), color: "red" }] }),
  "bad option": scene({ objects: [{ ...point("A"), size: "huge" }] }),
  "duplicate id": scene({ objects: [point("A"), point("A")] }),
  "min ≥ max": scene({ parameters: [slider("a", { min: 3, max: 1, value: 2 })] }),
  "value below min": scene({ parameters: [slider("a", { value: -1 })] }),
  "value above max": scene({ parameters: [slider("a", { value: 5 })] }),
  "slider without range": scene({ parameters: [{ id: "a", value: 1, control: "slider" }] }),
  "missing point": scene({ objects: [{ id: "s", type: "segment", from: "A", to: "B" }] }),
  "wrong reference type": scene({
    parameters: [slider("a")],
    objects: [{ id: "s", type: "segment", from: "a", to: "a" }],
  }),
  "reserved name": scene({ objects: [point("pi")] }),
  "unknown symbol": scene({ objects: [curve("k*x")] }),
  "unknown symbol with suggestion": scene({
    parameters: [slider("amp")],
    objects: [curve("amq*x")],
  }),
  "function without argument": scene({ objects: [curve("sin*x")] }),
  "object in expression": scene({ objects: [point("A"), curve("A*x")] }),
  "boolean in expression": scene({
    parameters: [{ id: "b", value: true }],
    objects: [curve("b*x")],
  }),
  "implicit multiplication": scene({ objects: [curve("2x")] }),
  "syntax error": scene({ objects: [curve("x +")] }),
  "unknown function": scene({ objects: [curve("foo(x)")] }),
  "argument count": scene({ objects: [curve("sin(x, 2)")] }),
  "empty expression": scene({ objects: [curve("")] }),
  "two formulas": scene({ objects: [curve("x; 2")] }),
  "undefined curve": scene({ objects: [curve("sqrt(-1 - x^2)")] }),
  "non-finite point": scene({ objects: [point("A", [0, "log(0)", 0])] }),
  "collinear plane": scene({
    objects: [
      point("A"),
      point("B", [1, 0, 0]),
      point("C", [2, 0, 0]),
      { id: "p", type: "plane", through: ["A", "B", "C"] },
    ],
  }),
};

describe("Vietnamese issue messages", () => {
  it.each(Object.entries(SCENES))("translates every issue of: %s", (_, spec) => {
    const found = messages(spec);
    expect(found.length).toBeGreaterThan(0);
    for (const message of found) {
      expect(hasVietnamese(message), message).toBe(true);
      expect(toVietnamese(message)).not.toBe(message);
    }
  });

  it.each<[string, EditCommand]>([
    ["missing object", { op: "removeObject", id: "Z" }],
    ["missing parameter", { op: "removeParameter", id: "z" }],
    ["rename to a used name", { op: "rename", from: "A", to: "a" }],
    ["rename to an invalid name", { op: "rename", from: "A", to: "1A" }],
    ["remove a used parameter", { op: "removeParameter", id: "a" }],
    ["change an ID by update", { op: "updateParameter", id: "a", changes: { id: "b" } }],
  ])("translates the edit error: %s", (_, command) => {
    const spec = {
      version: "0.1",
      parameters: [slider("a")],
      objects: [point("A", ["a", 0, 0])],
    } as never;
    const result = applyCommand(spec, command);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(hasVietnamese(result.error.message), result.error.message).toBe(true);
  });

  it.each(["sec x", "sin", "x +"])("translates the quick graph message for %s", (input) => {
    const result = parseQuickFormula(input, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(hasVietnamese(result.message), result.message).toBe(true);
  });

  it("keeps the details of a message", () => {
    expect(toVietnamese("Unknown symbol 'k' in expression \"k*x\". Did you mean 'a'?")).toBe(
      "Chưa có tham số 'k' (trong công thức \"k*x\"). Có phải ý bạn là 'a'?",
    );
    expect(toVietnamese("Reference to unknown point 'B'")).toBe("Không tìm thấy điểm 'B'");
  });

  it("translates JSON syntax errors from the JSON mode", () => {
    expect(toVietnamese("JSON syntax error: comma expected")).toBe(
      "Lỗi cú pháp JSON: thiếu dấu phẩy",
    );
  });

  it("leaves an unknown message unchanged", () => {
    expect(toVietnamese("Something new")).toBe("Something new");
  });
});
