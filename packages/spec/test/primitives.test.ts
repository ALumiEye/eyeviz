import { describe, expect, it } from "vitest";
import { validateSpec, type EyeVizIssue } from "../src/index";

const spec = (objects: unknown[], extra: Record<string, unknown> = {}) => ({
  version: "0.1",
  objects: [
    { id: "A", type: "point", position: [0, 0, 0] },
    { id: "B", type: "point", position: [1, 0, 0] },
    { id: "C", type: "point", position: [0, 1, 0] },
    ...objects,
  ],
  ...extra,
});

function issues(input: unknown): readonly EyeVizIssue[] {
  const result = validateSpec(input);
  return result.ok ? [] : result.issues;
}

describe("scene settings", () => {
  it("accepts dimension, axes and grid", () => {
    expect(issues(spec([], { scene: { dimension: "2d", axes: false, grid: true } }))).toEqual([]);
  });

  it("rejects unknown dimensions and fields", () => {
    expect(issues(spec([], { scene: { dimension: "4d" } }))[0]?.path).toBe("scene.dimension");
    expect(issues(spec([], { scene: { ticks: 5 } }))[0]?.path).toBe("scene");
  });
});

describe("vector", () => {
  it("accepts a point or inline origin, or none", () => {
    expect(
      issues(
        spec([
          { id: "v1", type: "vector", origin: "A", components: [1, 2, 3] },
          { id: "v2", type: "vector", origin: [1, 1, 0], components: ["a", 0, 0] },
          { id: "v3", type: "vector", components: [0, 0, 1] },
        ]),
      ),
    ).toEqual([]);
  });

  it("requires origin references to be points", () => {
    expect(
      issues(spec([{ id: "v", type: "vector", origin: "Z", components: [1, 0, 0] }]))[0],
    ).toMatchObject({
      code: "MISSING_REFERENCE",
      path: "objects[3].origin",
    });
  });
});

describe("plane", () => {
  it("accepts both forms", () => {
    expect(
      issues(
        spec([
          { id: "P", type: "plane", through: ["A", "B", "C"] },
          { id: "Q", type: "plane", point: [0, 0, 1], normal: [0, 0, 1], extent: 3 },
          { id: "R", type: "plane", point: "A", normal: ["nx", 0, 1] },
        ]),
      ),
    ).toEqual([]);
  });

  it.each([
    [{ through: ["A", "B", "C"], normal: [0, 0, 1] }, "not both"],
    [{ point: [0, 0, 0] }, "needs"],
    [{}, "needs"],
    [{ through: ["A", "A", "B"] }, "three different points"],
  ])("rejects malformed plane %j", (fields, message) => {
    const [issue] = issues(spec([{ id: "P", type: "plane", ...fields }]));
    expect(issue?.message).toContain(message);
  });

  it("checks references in through", () => {
    expect(issues(spec([{ id: "P", type: "plane", through: ["A", "B", "X"] }]))[0]).toMatchObject({
      code: "MISSING_REFERENCE",
      path: "objects[3].through[2]",
    });
  });
});

describe("surface", () => {
  const surface = (fields: Record<string, unknown> = {}) => ({
    id: "S",
    type: "surface",
    variables: ["x", "y"],
    domain: { x: [-1, 1], y: [-1, 1] },
    position: ["x", "y", "x^2 + y^2"],
    ...fields,
  });

  it("accepts a parametric surface", () => {
    expect(issues(spec([surface()]))).toEqual([]);
  });

  it("requires a domain for every variable, and nothing else", () => {
    expect(issues(spec([surface({ domain: { x: [-1, 1] } })]))[0]?.message).toContain(
      "no domain for variable 'y'",
    );
    expect(issues(spec([surface({ domain: { x: [0, 1], y: [0, 1], z: [0, 1] } })]))[0]?.path).toBe(
      "objects[3].domain.z",
    );
  });

  it("requires two different variables that do not shadow IDs", () => {
    expect(
      issues(spec([surface({ variables: ["x", "x"], domain: { x: [0, 1] } })]))[0]?.message,
    ).toContain("two different variables");
    expect(
      issues(spec([surface({ variables: ["A", "y"], domain: { A: [0, 1], y: [0, 1] } })]))[0]?.code,
    ).toBe("DUPLICATE_ID");
  });
});

describe("label", () => {
  it("accepts a point anchor or a position", () => {
    expect(
      issues(
        spec([
          { id: "la", type: "label", text: "A", at: "A" },
          { id: "lb", type: "label", text: "Đỉnh", at: [0, 0, "h"] },
        ]),
      ),
    ).toEqual([]);
  });

  it("rejects empty text and non-point anchors", () => {
    expect(issues(spec([{ id: "l", type: "label", text: "", at: "A" }]))[0]?.path).toBe(
      "objects[3].text",
    );
    expect(
      issues(
        spec([
          { id: "v", type: "vector", components: [1, 0, 0] },
          { id: "l", type: "label", text: "v", at: "v" },
        ]),
      )[0],
    ).toMatchObject({ code: "INVALID_REFERENCE_TYPE", path: "objects[4].at" });
  });
});
