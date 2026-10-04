import { describe, expect, it } from "vitest";
import {
  compileScene,
  EyeVizEngine,
  ENGINE_LIMITS,
  sampleSurface,
  type LabelState,
  type PlaneState,
  type SurfaceState,
  type VectorState,
} from "../src/index";
import { compileIssues, scene } from "./helpers";

const points = [
  { id: "A", type: "point", position: [0, 0, 0] },
  { id: "B", type: "point", position: ["b", 0, 0] },
  { id: "C", type: "point", position: [0, 2, 0] },
];
const params = [{ id: "b", value: 2 }];

describe("scene settings", () => {
  it("applies defaults", () => {
    const result = compileScene(scene([]));
    if (!result.ok) throw new Error("expected success");
    expect(result.model.scene).toEqual({ dimension: "3d", axes: true, grid: true });
  });

  it("keeps explicit settings", () => {
    const result = compileScene({
      version: "0.1",
      scene: { dimension: "2d", grid: false },
      objects: [],
    });
    if (!result.ok) throw new Error("expected success");
    expect(result.model.scene).toEqual({ dimension: "2d", axes: true, grid: false });
  });
});

describe("vector", () => {
  it("follows its origin point and parameters", () => {
    const engine = new EyeVizEngine(
      scene(
        [...points, { id: "v", type: "vector", origin: "B", components: ["k", 1, 0] }],
        [...params, { id: "k", value: 3 }],
      ),
    );
    const v = () => engine.getState().objects.v as VectorState;
    expect(v().origin).toEqual([2, 0, 0]);
    expect(v().components).toEqual([3, 1, 0]);
    engine.setParameter("b", 5);
    expect(v().origin).toEqual([5, 0, 0]);
  });

  it("defaults the origin to [0, 0, 0]", () => {
    const engine = new EyeVizEngine(scene([{ id: "v", type: "vector", components: [1, 0, 0] }]));
    expect((engine.getState().objects.v as VectorState).origin).toEqual([0, 0, 0]);
  });

  it("is invalid with a non-finite component", () => {
    const engine = new EyeVizEngine(
      scene([{ id: "v", type: "vector", components: ["1/k", 0, 0] }], [{ id: "k", value: 0 }]),
    );
    expect(engine.getState().objects.v?.valid).toBe(false);
    expect(engine.getState().issues[0]?.path).toBe("objects[0].components[0]");
  });
});

describe("plane", () => {
  it("through three points: centroid, unit normal and a default extent", () => {
    const engine = new EyeVizEngine(
      scene([...points, { id: "P", type: "plane", through: ["A", "B", "C"] }], params),
    );
    const plane = engine.getState().objects.P as PlaneState;
    expect(plane.valid).toBe(true);
    expect(plane.normal).toEqual([0, 0, 1]);
    expect(plane.center[0]).toBeCloseTo(2 / 3);
    expect(plane.extent).toBeGreaterThan(0);
  });

  it("reports collinear points at runtime", () => {
    const engine = new EyeVizEngine(
      scene(
        [
          { id: "A", type: "point", position: [0, 0, 0] },
          { id: "B", type: "point", position: [1, 0, 0] },
          { id: "C", type: "point", position: ["c", 0, 0] },
          { id: "P", type: "plane", through: ["A", "B", "C"] },
        ],
        [{ id: "c", value: 2 }],
      ),
    );
    expect(engine.getState().objects.P?.valid).toBe(false);
    expect(engine.getState().issues[0]?.message).toContain("collinear");
  });

  it("point + normal: normalizes the normal and keeps extent optional", () => {
    const engine = new EyeVizEngine(
      scene([{ id: "Q", type: "plane", point: [0, 0, 1], normal: [0, 0, 5] }]),
    );
    const plane = engine.getState().objects.Q as PlaneState;
    expect(plane.normal).toEqual([0, 0, 1]);
    expect(plane.center).toEqual([0, 0, 1]);
    expect(plane.extent).toBeUndefined();
  });

  it.each([
    [{ normal: [0, 0, 0] }, "objects[0].normal"],
    [{ normal: [0, 0, 1], extent: -1 }, "objects[0].extent"],
  ])("rejects degenerate values %j", (fields, path) => {
    const engine = new EyeVizEngine(
      scene([{ id: "Q", type: "plane", point: [0, 0, 0], ...fields }]),
    );
    expect(engine.getState().issues[0]?.path).toBe(path);
  });
});

describe("surface", () => {
  const paraboloid = scene(
    [
      {
        id: "S",
        type: "surface",
        variables: ["x", "y"],
        domain: { x: ["-L", "L"], y: [-1, 1] },
        position: ["x", "y", "a*(x^2 + y^2)"],
        visible: "show",
      },
    ],
    [
      { id: "a", value: 1 },
      { id: "L", value: 1 },
      { id: "show", value: true },
    ],
  );
  const surface = (engine: EyeVizEngine) => engine.getState().objects.S as SurfaceState;

  it("samples a grid", () => {
    const s = surface(new EyeVizEngine(paraboloid, { surfaceSamples: 5 }));
    expect([s.rows, s.columns]).toEqual([5, 5]);
    // vertex (row 0, column 0) = (x=-1, y=-1, z=2)
    expect([...s.positions.slice(0, 3)]).toEqual([-1, -1, 2]);
  });

  it("re-samples on parameter change and skips hidden surfaces", () => {
    const engine = new EyeVizEngine(paraboloid, { surfaceSamples: 3 });
    engine.setParameter("a", 2);
    expect(surface(engine).positions[2]).toBe(4);
    engine.setParameter("show", false);
    expect(surface(engine).positions.length).toBe(0);
  });

  it("caps samples", () => {
    expect(surface(new EyeVizEngine(paraboloid, { surfaceSamples: 1e6 })).rows).toBe(
      ENGINE_LIMITS.maxSurfaceSamples,
    );
  });

  it("marks undefined vertices as NaN", () => {
    const grid = sampleSurface(
      (u, v, out) => {
        out[0] = u;
        out[1] = v;
        out[2] = Math.sqrt(u);
      },
      [-1, 1],
      [0, 1],
      3,
    );
    expect(Number.isNaN(grid.positions[2])).toBe(true); // u = -1
    expect(grid.finiteCount).toBe(6);
  });

  it("does not allow surface variables in the domain", () => {
    const issues = compileIssues(
      scene([
        {
          id: "S",
          type: "surface",
          variables: ["u", "v"],
          domain: { u: [0, "v"], v: [0, 1] },
          position: ["u", "v", 0],
        },
      ]),
    );
    expect(issues[0]).toMatchObject({ code: "UNKNOWN_SYMBOL", path: "objects[0].domain.u[1]" });
  });

  it("reports invalid domains per variable", () => {
    const engine = new EyeVizEngine(paraboloid);
    engine.setParameter("L", -1);
    expect(engine.getState().issues[0]?.path).toBe("objects[0].domain.x");
  });
});

describe("label", () => {
  it("follows the anchored point", () => {
    const engine = new EyeVizEngine(
      scene([...points, { id: "lB", type: "label", text: "B", at: "B" }], params),
    );
    expect((engine.getState().objects.lB as LabelState).position).toEqual([2, 0, 0]);
    engine.setParameter("b", 7);
    expect(engine.getState().objects.lB as LabelState).toMatchObject({
      text: "B",
      position: [7, 0, 0],
    });
  });

  it("evaluates inline positions", () => {
    const engine = new EyeVizEngine(
      scene([{ id: "l", type: "label", text: "t", at: [0, 0, "t"] }]),
    );
    engine.setTime(2);
    expect((engine.getState().objects.l as LabelState).position).toEqual([0, 0, 2]);
  });
});
