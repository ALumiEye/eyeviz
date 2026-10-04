import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileScene, isSceneModel } from "../src/index";
import { compileIssues, scene } from "./helpers";

const examplesDir = join(import.meta.dirname, "../../../examples");

describe("examples", () => {
  const files: string[] = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));

  it("exist", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files)("%s compiles", (file) => {
    const result = compileScene(JSON.parse(readFileSync(join(examplesDir, file), "utf8")));
    if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
    expect(isSceneModel(result.model)).toBe(true);
  });
});

describe("compileScene", () => {
  it("passes through spec validation issues", () => {
    expect(compileIssues({ version: "0.1" })[0]?.code).toBe("SCHEMA_VALIDATION");
  });

  it("builds the dependency graph", () => {
    const result = compileScene(
      scene(
        [
          { id: "A", type: "point", position: ["a", 0, 0] },
          { id: "B", type: "point", position: [0, "t", 0] },
          { id: "AB", type: "segment", from: "A", to: "B", visible: "show" },
        ],
        [
          { id: "a", value: 1 },
          { id: "show", value: true },
        ],
      ),
    );
    if (!result.ok) throw new Error("expected success");
    const { dependents, order } = result.model;
    expect([...(dependents.get("a") ?? [])]).toEqual(["A"]);
    expect([...(dependents.get("t") ?? [])]).toEqual(["B"]);
    expect([...(dependents.get("A") ?? [])]).toEqual(["AB"]);
    expect([...(dependents.get("show") ?? [])]).toEqual(["AB"]);
    expect(order.indexOf("AB")).toBeGreaterThan(order.indexOf("A"));
  });

  it("orders dependencies before dependents regardless of spec order", () => {
    const result = compileScene(
      scene([
        { id: "AB", type: "segment", from: "A", to: "B" },
        { id: "A", type: "point", position: [0, 0, 0] },
        { id: "B", type: "point", position: [1, 0, 0] },
      ]),
    );
    if (!result.ok) throw new Error("expected success");
    expect(result.model.order).toEqual(["A", "B", "AB"]);
  });

  it("does not accept arbitrary objects as models", () => {
    expect(isSceneModel({ version: "0.1", objects: new Map() })).toBe(false);
  });
});

describe("expression and symbol checks", () => {
  it("reports unknown symbols with a suggestion and the exact path", () => {
    const issues = compileIssues(
      scene(
        [{ id: "ball", type: "point", position: ["velocity*t", 0, 0] }],
        [{ id: "velocity0", value: 1 }],
      ),
    );
    expect(issues[0]).toMatchObject({
      code: "UNKNOWN_SYMBOL",
      path: "objects[0].position[0]",
      details: { symbol: "velocity", suggestion: "velocity0" },
    });
    expect(issues[0]?.message).toContain("Did you mean 'velocity0'?");
  });

  it("maps expression syntax errors to paths", () => {
    const issues = compileIssues(scene([{ id: "P", type: "point", position: [0, "2x", 0] }]));
    expect(issues[0]).toMatchObject({ code: "EXPRESSION_SYNTAX", path: "objects[0].position[1]" });
  });

  it("rejects unknown functions", () => {
    const issues = compileIssues(scene([{ id: "P", type: "point", position: ["foo(1)", 0, 0] }]));
    expect(issues[0]).toMatchObject({ code: "UNKNOWN_FUNCTION", details: { function: "foo" } });
  });

  it("rejects boolean parameters inside expressions", () => {
    const issues = compileIssues(
      scene([{ id: "P", type: "point", position: ["flag", 0, 0] }], [{ id: "flag", value: true }]),
    );
    expect(issues[0]?.code).toBe("INVALID_REFERENCE_TYPE");
  });

  it("rejects objects inside expressions (not supported in v0.1)", () => {
    const issues = compileIssues(
      scene([
        { id: "A", type: "point", position: [0, 0, 0] },
        { id: "B", type: "point", position: ["A", 0, 0] },
      ]),
    );
    expect(issues[0]).toMatchObject({
      code: "INVALID_REFERENCE_TYPE",
      path: "objects[1].position[0]",
    });
  });

  it("explains a function used as a variable", () => {
    const issues = compileIssues(scene([{ id: "P", type: "point", position: ["sin", 0, 0] }]));
    expect(issues[0]?.message).toContain("must be called with arguments");
  });

  it("scopes a curve variable to its own curve", () => {
    const issues = compileIssues(
      scene([
        { id: "c1", type: "curve", variable: "u", domain: [0, 1], position: ["u", "u", 0] },
        { id: "P", type: "point", position: ["u", 0, 0] },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "UNKNOWN_SYMBOL", path: "objects[1].position[0]" });
  });

  it("does not allow the curve variable in its domain", () => {
    const issues = compileIssues(
      scene([{ id: "c", type: "curve", variable: "u", domain: [0, "u"], position: ["u", 0, 0] }]),
    );
    expect(issues[0]).toMatchObject({ code: "UNKNOWN_SYMBOL", path: "objects[0].domain[1]" });
  });

  it.each([
    [[{ id: "t", value: 1 }], [], "parameters[0].id"],
    [[{ id: "pi", value: 1 }], [], "parameters[0].id"],
    [[], [{ id: "sin", type: "point", position: [0, 0, 0] }], "objects[0].id"],
    [
      [],
      [{ id: "c", type: "curve", variable: "t", domain: [0, 1], position: ["t", 0, 0] }],
      "objects[0].variable",
    ],
  ])("rejects reserved names (%#)", (parameters, objects, path) => {
    const issues = compileIssues(scene(objects, parameters));
    expect(issues.some((i) => i.code === "RESERVED_NAME" && i.path === path)).toBe(true);
  });

  it("collects every issue", () => {
    const issues = compileIssues(scene([{ id: "P", type: "point", position: ["a", "b", "2x"] }]));
    expect(issues.map((i) => i.path)).toEqual([
      "objects[0].position[0]",
      "objects[0].position[1]",
      "objects[0].position[2]",
    ]);
  });
});
