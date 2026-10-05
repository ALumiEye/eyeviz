import { describe, expect, it } from "vitest";
import { EyeVizEngine, sampleImplicit, type ImplicitState } from "../src/index";
import { compileIssues, scene } from "./helpers";

const square = [-5, 5] as const;

/** Points of all polylines as [x, y, z] triples. */
function points(polylines: readonly Float64Array[]): [number, number, number][] {
  return polylines.flatMap((line) =>
    Array.from({ length: line.length / 3 }, (_, k): [number, number, number] => [
      line[k * 3] as number,
      line[k * 3 + 1] as number,
      line[k * 3 + 2] as number,
    ]),
  );
}

const closed = (line: Float64Array) =>
  line[0] === line[line.length - 3] && line[1] === line[line.length - 2];

describe("sampleImplicit (marching squares)", () => {
  it("traces a circle as one closed loop on the circle", () => {
    const { polylines } = sampleImplicit((x, y) => x * x + y * y - 4, square, square, 100);
    expect(polylines).toHaveLength(1);
    expect(closed(polylines[0] as Float64Array)).toBe(true);
    for (const [x, y, z] of points(polylines)) {
      expect(Math.hypot(x, y)).toBeCloseTo(2, 1);
      expect(z).toBe(0);
    }
  });

  it("finds both branches of a hyperbola as open chains", () => {
    const { polylines } = sampleImplicit((x, y) => x * x - y * y - 1, square, square, 80);
    expect(polylines).toHaveLength(2);
    for (const line of polylines) expect(closed(line)).toBe(false);
    const sides = polylines.map((line) => Math.sign(line[0] as number)).sort();
    expect(sides).toEqual([-1, 1]);
  });

  it("does not join across a pole", () => {
    // y = 1/x: F changes sign across x = 0 without a root there.
    const { polylines } = sampleImplicit((x, y) => y - 1 / x, square, square, 81);
    expect(points(polylines).every(([x, y]) => Math.abs(x * y - 1) < 0.2)).toBe(true);
    expect(polylines.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves saddle cells (two crossing lines) without dropping segments", () => {
    // x*y = 0: both axes. With an even sample count the origin is inside a saddle cell.
    const { polylines } = sampleImplicit((x, y) => x * y, square, square, 40);
    const all = points(polylines);
    expect(all.some(([x, y]) => x > 4 && Math.abs(y) < 0.2)).toBe(true);
    expect(all.some(([x, y]) => y > 4 && Math.abs(x) < 0.2)).toBe(true);
    expect(all.every(([x, y]) => Math.abs(x) < 0.2 || Math.abs(y) < 0.2)).toBe(true);
  });

  it("returns nothing when the equation has no solution in the domain", () => {
    const result = sampleImplicit((x, y) => x * x + y * y + 1, square, square, 50);
    expect(result.polylines).toEqual([]);
    expect(result.finiteCount).toBe(2500);
  });

  it("skips cells where the function is undefined", () => {
    // sqrt(x) is undefined for x < 0; the line y = 1 exists only on the right.
    const { polylines } = sampleImplicit((x, y) => Math.sqrt(x) * 0 + y - 1, square, square, 50);
    expect(points(polylines).every(([x]) => x >= -0.3)).toBe(true);
    expect(points(polylines).length).toBeGreaterThan(5);
  });

  it("is deterministic", () => {
    const run = () => sampleImplicit((x, y) => x ** 3 - 3 * x - y * y, square, square, 60);
    expect(run().polylines).toEqual(run().polylines);
  });
});

const circle = (extra: Record<string, unknown> = {}) => ({
  id: "c",
  type: "implicit",
  equation: "x^2 + y^2 = r^2",
  domain: { x: [-5, 5], y: [-5, 5] },
  ...extra,
});

describe("implicit objects", () => {
  it("evaluates and follows parameters", () => {
    const engine = new EyeVizEngine(scene([circle()], [{ id: "r", value: 2 }]));
    const radius = () =>
      Math.max(
        ...points((engine.getState().objects.c as ImplicitState).polylines).map(([x, y]) =>
          Math.hypot(x, y),
        ),
      );
    expect(radius()).toBeCloseTo(2, 1);
    engine.setParameter("r", 3);
    expect(radius()).toBeCloseTo(3, 1);
  });

  it("accepts custom variable names", () => {
    const engine = new EyeVizEngine(
      scene([
        circle({
          variables: ["u", "v"],
          equation: "u^2 + v^2 = 4",
          domain: { u: square, v: square },
        }),
      ]),
    );
    const state = engine.getState().objects.c as ImplicitState;
    expect(state.valid).toBe(true);
    expect(state.polylines.length).toBe(1);
  });

  it("is valid but empty when there is no solution", () => {
    const engine = new EyeVizEngine(scene([circle()], [{ id: "r", value: 0 }]));
    // x^2 + y^2 = 0 only touches zero: nothing to draw, and no issue.
    expect(engine.getState().issues).toEqual([]);
  });

  it("requires exactly one '='", () => {
    for (const equation of ["x^2 + y^2", "x = y = 1"]) {
      const issues = compileIssues(scene([circle({ equation })]));
      expect(issues[0]?.message).toMatch(/exactly one '='/);
      expect(issues[0]?.path).toBe("objects[0].equation");
    }
  });

  it("reports unknown symbols and empty sides at the equation", () => {
    const issues = compileIssues(scene([circle({ equation: "x^2 + y^2 = k" })]));
    expect(issues[0]).toMatchObject({ code: "UNKNOWN_SYMBOL", path: "objects[0].equation" });
    const empty = compileIssues(scene([circle({ equation: "x^2 + y^2 =" })]));
    expect(empty[0]?.path).toBe("objects[0].equation");
  });

  it("needs a domain for both variables", () => {
    const issues = compileIssues(
      scene([circle({ domain: { x: square } })], [{ id: "r", value: 1 }]),
    );
    expect(issues[0]?.message).toMatch(/no domain for variable 'y'/);
  });

  it("reports a variable that collides with an ID", () => {
    const issues = compileIssues(
      scene(
        [circle()],
        [
          { id: "r", value: 1 },
          { id: "x", value: 1 },
        ],
      ),
    );
    expect(issues.some((i) => i.code === "DUPLICATE_ID" && /Variable 'x'/.test(i.message))).toBe(
      true,
    );
  });

  it("reports an equation that is undefined everywhere", () => {
    const engine = new EyeVizEngine(scene([circle({ equation: "sqrt(-1 - x^2) = y" })]));
    expect(engine.getState().issues[0]?.message).toMatch(/undefined on its whole domain/);
  });
});
