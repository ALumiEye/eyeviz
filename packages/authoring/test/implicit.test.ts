import { compileScene } from "@alumieye/eyeviz-core";
import type { SceneSpec } from "@alumieye/eyeviz-spec";
import { describe, expect, it } from "vitest";
import { applyCommand, createObject, parameterUsers, parseQuickFormula } from "../src/index";

describe("quick graph: equations become implicit curves", () => {
  it.each([
    ["x² + y² = 4", "x^2 + y^2 = 4"],
    ["x^2/9 + y^2/4 = 1", "x^2/9 + y^2/4 = 1"],
    ["y² = 4x", "y^2 = 4*x"],
    ["x = 2", "x = 2"],
    ["xy = 1", "x*y = 1"],
    ["x² − y² = 1", "x^2 - y^2 = 1"],
    ["|x| + |y| = 1", "abs(x) + abs(y) = 1"],
    ["y = x + y²", "y = x + y^2"],
    ["(x−1)² + (y+2)² = 1,5", "(x - 1)^2 + (y + 2)^2 = 1.5"],
  ])("%s → %s", (input, expected) => {
    const result = parseQuickFormula(input, []);
    expect(result).toMatchObject({ ok: true, kind: "equation", expression: expected });
  });

  it("keeps y = f(x) a function graph", () => {
    expect(parseQuickFormula("y = x^2", [])).toMatchObject({
      kind: "function",
      expression: "x^2",
    });
    expect(parseQuickFormula("f(x) = 2x", [])).toMatchObject({ kind: "function" });
    expect(parseQuickFormula("3x + 1", [])).toMatchObject({ kind: "function" });
  });

  it("does not treat x and y as sliders in an equation, but other letters", () => {
    const result = parseQuickFormula("x² + y² = r²", []);
    expect(result).toMatchObject({ ok: true, unknown: ["r"] });
  });

  it("uses a parameter named y as a parameter in y = …", () => {
    expect(parseQuickFormula("y = x + y", ["y"])).toMatchObject({ kind: "function" });
  });

  it("explains a malformed equation", () => {
    expect(parseQuickFormula("x = y = 1", [])).toMatchObject({ ok: false });
    expect(parseQuickFormula("x² + y² =", [])).toMatchObject({ ok: false });
  });

  it("produces equations that compile as implicit curves", () => {
    for (const input of ["x² + y² = 4", "y² = x³ - x", "sin x = cos y", "xy = 1"]) {
      const result = parseQuickFormula(input, []);
      if (!result.ok) throw new Error(result.message);
      const spec = {
        version: "0.1",
        objects: [
          {
            id: "c",
            type: "implicit",
            equation: result.expression,
            domain: { x: [-3, 3], y: [-3, 3] },
          },
        ],
      };
      expect(compileScene(spec).ok, input).toBe(true);
    }
  });
});

describe("authoring implicit curves", () => {
  const spec: SceneSpec = {
    version: "0.1",
    parameters: [{ id: "r", value: 2 }],
    objects: [
      {
        id: "c",
        type: "implicit",
        equation: "x^2 + y^2 = r^2",
        domain: { x: ["-r - 1", "r + 1"], y: [-5, 5] },
      },
    ],
  };

  it("finds and renames parameters inside the equation and domain", () => {
    expect(parameterUsers(spec, "r")).toEqual(["c"]);
    const result = applyCommand(spec, { op: "rename", from: "r", to: "radius" });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.spec.objects[0]).toMatchObject({
      equation: "x^2 + y^2 = radius^2",
      domain: { x: ["-radius - 1", "radius + 1"] },
    });
    expect(compileScene(result.spec).ok).toBe(true);
  });

  it("creates a ready-to-render implicit curve from the Add menu", () => {
    const object = createObject({ version: "0.1", objects: [] }, "implicit");
    expect(object).toMatchObject({ type: "implicit", equation: "x^2/9 + y^2/4 = 1" });
    expect(compileScene({ version: "0.1", objects: [object] }).ok).toBe(true);
  });

  it("picks other variable names when x is taken", () => {
    const taken: SceneSpec = { version: "0.1", parameters: [{ id: "x", value: 1 }], objects: [] };
    const object = createObject(taken, "implicit");
    expect(object).toMatchObject({ variables: ["u", "y"], equation: "u^2/9 + y^2/4 = 1" });
    expect(compileScene({ ...taken, objects: [object] }).ok).toBe(true);
  });
});
